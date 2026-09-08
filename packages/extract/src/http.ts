/**
 * The quota-aware retrying HTTP client.
 *
 * This is a large part of what dropping dlt costs us (`00-repo-map.md` section 5). It is also the
 * part dlt would not have got right anyway: dlt's generic retry client understands none of the three
 * quota regimes the specification says drive the design — GA4's complexity-priced tokens, Google
 * Ads' per-developer-token caps, and Meta's per-application throttle score.
 *
 * ONE FACT SHAPES EVERY DECISION HERE. On Google Ads, REJECTED REQUESTS STILL COUNT against the
 * daily operation limit, and that limit is per DEVELOPER TOKEN — shared across every tenant. So a
 * retry storm on one customer's connection does not merely delay that customer: it spends a ceiling
 * every other customer is drawing on. Retries are therefore few, spaced, and never attempted at all
 * for a failure that retrying cannot fix.
 */

export type FailureKind =
  /** Worth trying again: the platform is busy or briefly broken. */
  | "transient"
  /** Rate limited. Worth trying again, but only after the platform says so. */
  | "rate_limited"
  /** The grant is bad. Retrying spends quota and delays the signal the customer needs. */
  | "auth"
  /** Our request is wrong. Retrying it produces the same error forever. */
  | "client";

export interface Classification {
  readonly kind: FailureKind;
  readonly retryable: boolean;
  readonly reason: string;
}

/**
 * Decide what a failed response means.
 *
 * The distinction that matters most is auth. A 401 or 403 is the customer's to fix — it flows to
 * `recordFailure` in @repo/connections and marks the connection `needs_reauth`. Retrying it burns
 * shared Google Ads quota AND delays the only signal that gets the customer to reconnect.
 */
export function classify(status: number): Classification {
  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      retryable: false,
      reason:
        "The platform rejected the grant. Retrying spends quota that rejected requests still " +
        "consume, and delays the reconnect prompt the customer needs.",
    };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      retryable: true,
      reason: "Rate limited. Retry only after the interval the platform specifies.",
    };
  }
  if (status >= 500) {
    return { kind: "transient", reason: `The platform returned ${status}.`, retryable: true };
  }
  return {
    kind: "client",
    retryable: false,
    reason: `The request was rejected with ${status}. Retrying produces the same error.`,
  };
}

/**
 * How long to wait before attempt N.
 *
 * Exponential with full jitter. The jitter is not decoration: without it, every connection that
 * failed in the same minute retries in the same later minute, and a platform incident turns into a
 * self-inflicted thundering herd against a shared per-developer-token ceiling.
 *
 * `random` is injected so the delay is testable. `retryAfterSeconds` wins outright when the platform
 * sends it — a server that has told us when to come back has given better information than any
 * formula of ours.
 */
export function backoffMs(options: {
  attempt: number;
  retryAfterSeconds?: number | null;
  random: () => number;
  baseMs?: number;
  maxMs?: number;
}): number {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 60_000;

  if (options.retryAfterSeconds !== null && options.retryAfterSeconds !== undefined) {
    return Math.min(Math.max(options.retryAfterSeconds, 0) * 1000, max);
  }

  const ceiling = Math.min(base * 2 ** Math.max(options.attempt - 1, 0), max);
  return Math.floor(options.random() * ceiling);
}

/** `Retry-After` is either seconds or an HTTP date. Both appear in the wild. */
export function parseRetryAfter(header: string | null, now: Date): number | null {
  if (header === null || header.trim() === "") return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(seconds, 0);

  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.max((at - now.getTime()) / 1000, 0);
}

export class ExtractError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: FailureKind | "network",
    readonly attempts: number,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

export interface FetchOptions {
  /**
   * Total attempts, not retries. Deliberately small: on Google Ads every attempt spends from a
   * ceiling shared with every other tenant, so the cost of a hopeful extra try is paid by people
   * who have nothing to do with this request.
   */
  readonly maxAttempts?: number;
  readonly random: () => number;
  readonly now: () => Date;
  /** Injected so tests do not actually wait. */
  readonly sleep: (ms: number) => Promise<void>;
  /** Called before each wait, so the caller can log or meter. */
  readonly onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

/**
 * Fetch with retries, spending as little quota as possible.
 *
 * Returns the successful `Response`. The body is deliberately NOT read here: an extractor must
 * stream it to R2 and return a key rather than materialise rows, because a Worker isolate has 128 MB
 * and a Workflow step output is capped at 1 MiB (`00-repo-map.md` section 5). Reading the body here
 * would make that impossible for every caller.
 */
export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  request: { url: string; init?: RequestInit },
  options: FetchOptions,
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError: ExtractError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(request.url, request.init);
    } catch (cause) {
      // A network failure is transient by nature, and — importantly — it never reached the
      // platform, so it did not spend quota.
      lastError = new ExtractError(
        `network failure calling ${request.url}: ${(cause as Error).message}`,
        null,
        "network",
        attempt,
      );
      if (attempt === maxAttempts) throw lastError;
      const delayMs = backoffMs({ attempt, random: options.random });
      options.onRetry?.({ attempt, delayMs, reason: "network failure" });
      await options.sleep(delayMs);
      continue;
    }

    if (response.ok) return response;

    const classification = classify(response.status);
    lastError = new ExtractError(
      `${request.url} failed with ${response.status}: ${classification.reason}`,
      response.status,
      classification.kind,
      attempt,
    );

    // Stop immediately on anything retrying cannot fix. This is the quota-preserving branch.
    if (!classification.retryable) throw lastError;
    if (attempt === maxAttempts) throw lastError;

    const retryAfter = parseRetryAfter(response.headers.get("retry-after"), options.now());
    const delayMs = backoffMs({ attempt, retryAfterSeconds: retryAfter, random: options.random });
    options.onRetry?.({ attempt, delayMs, reason: classification.reason });
    await options.sleep(delayMs);
  }

  throw lastError ?? new ExtractError(`${request.url} failed`, null, "transient", maxAttempts);
}

/**
 * Meta's `x-fb-ads-insights-throttle` header.
 *
 * The specification names exactly one of its fields, `ads_api_access_tier`, and explicitly warns
 * that the researcher's other rate-limit figures "do not appear in the cited source" (section 3.2,
 * correction 5). So this parses defensively and reports only what is actually present: inventing the
 * other field names would produce a number that looks measured and is not.
 *
 * `ads_api_access_tier` is worth having on its own — it is the instrumentation that confirms whether
 * a Full Access upgrade actually took effect (section 7).
 */
export interface MetaThrottle {
  readonly accessTier: string | null;
  /** Every field present, verbatim, so a real ceiling can be learned rather than guessed. */
  readonly raw: Record<string, unknown>;
}

export function parseMetaThrottle(header: string | null): MetaThrottle | null {
  if (header === null || header.trim() === "") return null;
  try {
    const parsed = JSON.parse(header) as Record<string, unknown>;
    const tier = parsed.ads_api_access_tier;
    return { accessTier: typeof tier === "string" ? tier : null, raw: parsed };
  } catch {
    return null;
  }
}
