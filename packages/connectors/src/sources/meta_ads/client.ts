/**
 * Meta Ads -> transport.
 *
 * The other half of the connector unit (specification section 13.3). `normalize.ts` turns a
 * response into envelope rows; this turns a backfill window into responses.
 *
 * NO RATE-LIMIT CONSTANT IN THIS FILE IS META'S. That is the decision the whole module is built
 * around, and it is not caution -- `00-repo-map.md` section 9, item 10 is explicit: *"Do not
 * hard-code Meta's rate-limit constants. The specification flags its own 5,000+40x and 190,000+40x
 * figures as not appearing in the cited source. Only `ads_api_access_tier` of the three
 * `x-fb-ads-insights-throttle` fields is named; do not invent the other two."* A number typed in
 * here would look measured and would not be, and the first thing anybody would do with it is
 * compute a budget against it.
 *
 * So pacing is MEASURED, not planned. Every response is read for whatever utilisation Meta chose to
 * report, and the client stops when that reading says to. The rule for reading it is deliberately
 * NAME-BLIND: a key is a utilisation percentage when it ENDS IN `_pct`, whatever Meta calls it,
 * which reads the fields the specification refused to name without pretending to know their names.
 * `ads_api_access_tier` is the one field the specification does name, and `@repo/extract` already
 * parses it -- it is the instrumentation that confirms whether a Full Access upgrade took effect
 * (section 7), so it is surfaced through `onUsage` rather than only inspected here.
 *
 * WHOSE CEILING IS THIS? Two of them, and they fail differently. The per-ad-account insights quota
 * is the CUSTOMER'S, and spending it breaks their own Ads Manager exports. The per-application
 * throttle score is OURS AND SHARED ACROSS EVERY TENANT -- "Meta's rate limits are scored per
 * application as well as per ad account, so the vendor's own Meta app is a shared bottleneck across
 * all tenants" (section 3.2). One customer's large backfill can therefore stall every other
 * customer's nightly pull, which is why this client stops early rather than pressing on, and why
 * the cross-tenant half of the problem is explicitly NOT solved here: it needs the queue-level
 * governor (`00-repo-map.md` section 5), which cannot be seen from inside one pull.
 *
 * THE CREDENTIAL NEVER ENTERS A URL. Meta accepts `access_token` as a query parameter and returns
 * `paging.next` with the token embedded in it -- so the obvious way to page, following that link,
 * writes the customer's token into every log line, error message and R2 object key that carries a
 * URL. This client sends `Authorization: Bearer` and pages by rebuilding the request from
 * `paging.cursors.after`, which is what keeps platform-terms gate 4 true by construction rather
 * than by remembering.
 *
 * THE TOKEN IS THE CUSTOMER'S, opened from the per-workspace vault by the caller (gate 1). There is
 * no company-held token, no `process.env` platform credential and no shared secret on this path:
 * `appsecret_proof` is deliberately not sent, because computing it would put the application secret
 * on a tenant request path. If Meta's app settings ever require that proof, that is a decision with
 * a compliance consequence and belongs in a design note, not in a quiet patch here.
 */

import { type FetchOptions, fetchWithRetry, parseMetaThrottle } from "@repo/extract";
import {
  META_ACTION_WINDOWS,
  type MetaActionWindow,
  type MetaInsightsRow,
  type MetaLevel,
  metaAccountId,
} from "./normalize.ts";

/** Overridable so tests never resolve a real host. The version matches @repo/oauth's endpoints. */
export const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * Rows per page.
 *
 * OUR BOUND, NOT META'S, and the distinction is the point of this whole module. Meta's own maximum
 * for `limit` is not established by anything in the specification, so no maximum is claimed here.
 * What IS known is the constraint on our side: a Worker isolate has 128 MB, the body is parsed as
 * JSON in one piece, and a Workflow step output is capped at 1 MiB (`00-repo-map.md` section 5). At
 * ad level with seven windows, a page of 500 insights rows fans out to 4,000 envelope rows, which
 * is already the size at which the caller must be streaming rather than accumulating.
 */
export const META_PAGE_ROWS = 500;
export const META_MAX_PAGE_ROWS = 1_000;

/**
 * Stop when Meta reports utilisation at or above this percentage.
 *
 * A GUESS, AND SAID SO IN THE DESIGN NOTE. Meta publishes no guidance on what fraction of a
 * utilisation figure is safe to spend, and the specification's own numbers for the underlying
 * ceilings are flagged as unsourced. 80 is chosen to leave room for the customer's other tools and
 * for the other tenants sharing our application score, and it is a client option so that a caller
 * who has OBSERVED the real behaviour can pass what it measured rather than what we assumed.
 */
export const META_UTILISATION_CEILING = 80;

/**
 * How many pages to fetch while Meta has reported no utilisation at all.
 *
 * ALSO A GUESS, and the more uncomfortable of the two, because it bounds a pull on no evidence. If
 * the headers are absent or unparseable there is nothing to pace against, and the alternatives are
 * to page forever against an unknown ceiling -- which on a shared application score is everyone
 * else's outage -- or to stop at some number. 25 pages is 12,500 insights rows, far more than a
 * day of any SME account, and a stop leaves the remainder to the next sweep rather than losing it.
 */
export const META_MAX_UNMEASURED_PAGES = 25;

export type MetaClientErrorCode =
  | "bad_limit"
  | "bad_account_id"
  | "bad_date_range"
  | "no_attribution_window"
  | "bad_attribution_window"
  | "unparseable_body"
  | "missing_account_profile"
  | "no_progress"
  | "throttle_floor";

export class MetaClientError extends Error {
  constructor(
    message: string,
    readonly code: MetaClientErrorCode,
    /** What Meta said to wait, when it said anything. Null is "it did not say", never "zero". */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "MetaClientError";
  }
}

/**
 * What the rate-limit headers said.
 *
 * `utilisationPct` is null when Meta reported none, and null is NOT zero: zero would mean "Meta
 * says we have spent nothing", which is a licence to keep going that we have not been given.
 */
export interface MetaUsage {
  /** The one field the specification names. Confirms a Full Access upgrade actually took effect. */
  readonly accessTier: string | null;
  /** The highest `*_pct` value Meta reported across every usage header. */
  readonly utilisationPct: number | null;
  /** Seconds until Meta says it will serve us again. Null when it did not say. */
  readonly regainAccessSeconds: number | null;
  /** Every usage header parsed, verbatim, so a real ceiling can be learned rather than guessed. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * The headers read for pacing.
 *
 * All four are read and none is required. Which of them a given call returns depends on the access
 * tier and the endpoint, and treating any one as mandatory would turn a missing header into a
 * failed pull.
 */
const USAGE_HEADERS = [
  "x-fb-ads-insights-throttle",
  "x-business-use-case-usage",
  "x-app-usage",
  "x-ad-account-usage",
] as const;

/** The name-blind rule. See the module note: the specification refuses to name these fields. */
const PERCENT_KEY = /_pct$/i;

/**
 * The one usage field named here rather than matched by shape, because a duration cannot be
 * recognised by its suffix. Meta documents it in MINUTES on the business-use-case header. That unit
 * is unverified against a live call, and the design note says so; erring by a factor of sixty in
 * the direction of waiting longer is the safe direction for it to be wrong in.
 */
const REGAIN_KEY = "estimated_time_to_regain_access";

/** A pathological or hostile body, not an attacker. Recursion this deep is not a usage header. */
const MAX_WALK_DEPTH = 8;

interface UsageReading {
  pct: number | null;
  regainMinutes: number | null;
}

function walkUsage(value: unknown, depth: number, into: UsageReading): void {
  if (depth > MAX_WALK_DEPTH || typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) walkUsage(item, depth + 1, into);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      if (PERCENT_KEY.test(key)) into.pct = Math.max(into.pct ?? 0, entry);
      if (key === REGAIN_KEY) into.regainMinutes = Math.max(into.regainMinutes ?? 0, entry);
      continue;
    }
    walkUsage(entry, depth + 1, into);
  }
}

/**
 * Read whatever Meta reported about how much of its ceilings we have spent.
 *
 * Defensive throughout: a header that is absent, empty or not JSON contributes nothing rather than
 * failing the call. A pull that dies because a rate-limit header was malformed has turned an
 * instrument into a dependency.
 */
export function parseMetaUsage(headers: Headers): MetaUsage {
  const reading: UsageReading = { pct: null, regainMinutes: null };
  const raw: Record<string, unknown> = {};

  for (const name of USAGE_HEADERS) {
    const header = headers.get(name);
    if (header === null || header.trim() === "") continue;
    try {
      const parsed = JSON.parse(header) as unknown;
      raw[name] = parsed;
      walkUsage(parsed, 0, reading);
    } catch {
      // Unparseable is not fatal and not silent either: it is absent from `raw`, so a caller
      // metering usage can see that this call contributed no reading.
    }
  }

  return {
    accessTier: parseMetaThrottle(headers.get("x-fb-ads-insights-throttle"))?.accessTier ?? null,
    utilisationPct: reading.pct,
    regainAccessSeconds: reading.regainMinutes === null ? null : reading.regainMinutes * 60,
    raw,
  };
}

/**
 * Whether another request may be issued against this reading.
 *
 * A null `utilisationPct` returns `true` with a reason saying so, for the reason GA4's quota check
 * does the same: refusing on absent information would mean an account whose responses carry no
 * usage header can never be read at all. The unmeasured-page bound in `getInsightsPages` is what
 * keeps that from being unlimited.
 */
export function usageAllowsAnother(
  usage: MetaUsage,
  ceiling: number = META_UTILISATION_CEILING,
): { allowed: boolean; reason: string; retryAfterSeconds: number | null } {
  if (usage.regainAccessSeconds !== null && usage.regainAccessSeconds > 0) {
    return {
      allowed: false,
      reason:
        `Meta reports ${usage.regainAccessSeconds}s until access is regained. That is the ` +
        "platform telling us when to come back, which beats any formula of ours.",
      retryAfterSeconds: usage.regainAccessSeconds,
    };
  }
  if (usage.utilisationPct !== null && usage.utilisationPct >= ceiling) {
    return {
      allowed: false,
      reason:
        `Meta reports ${usage.utilisationPct}% utilisation, at or above the ${ceiling}% ceiling. ` +
        "Stopping rather than spending the last of a limit shared with the customer's own tools " +
        "and, on the application score, with every other tenant.",
      retryAfterSeconds: null,
    };
  }
  return {
    allowed: true,
    reason:
      usage.utilisationPct === null
        ? "Meta reported no utilisation; there is nothing to check against"
        : `${usage.utilisationPct}% utilisation, below the ${ceiling}% ceiling`,
    retryAfterSeconds: null,
  };
}

export interface MetaClientOptions {
  readonly fetchImpl: typeof fetch;
  /** The CUSTOMER's long-lived token, opened from the per-workspace vault. Never ours. */
  readonly accessToken: string;
  /** The ad account, in either spelling: "act_123" or "123". */
  readonly adAccountId: string;
  readonly baseUrl?: string;
  readonly retry: FetchOptions;
  /** Stop at this utilisation percentage. Pass what you measured; the default is a guess. */
  readonly utilisationCeiling?: number;
  /** Pages to fetch while no utilisation has been reported at all. Also a guess. */
  readonly maxUnmeasuredPages?: number;
  /** Called with every reading, so a caller can meter the tier and the spend. */
  readonly onUsage?: (usage: MetaUsage) => void;
}

export interface MetaInsightsRequest {
  readonly level: MetaLevel;
  /** Insights fields to request. The normaliser refuses any it has no dictionary entry for. */
  readonly fields: readonly string[];
  /** Inclusive, YYYY-MM-DD, in the ad account's timezone. */
  readonly since: string;
  readonly until: string;
  /** Required and non-empty. Meta's own default window is never named; see normalize.ts trap 3. */
  readonly attributionWindows: readonly MetaActionWindow[];
  readonly limit?: number;
  readonly after?: string;
}

export interface MetaInsightsPage {
  readonly rows: readonly MetaInsightsRow[];
  readonly usage: MetaUsage;
  /** The cursor for the next page, or null when Meta returned none. */
  readonly after: string | null;
  /** Whether Meta says there is another page. An empty page with a next link is legal. */
  readonly hasNext: boolean;
}

/** The ad account node. Where the timezone the envelope requires actually comes from. */
export interface MetaAdAccount {
  readonly id: string;
  readonly currency: string;
  /** IANA name, e.g. "Asia/Bangkok". */
  readonly timezoneName: string;
  readonly name: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireAccount(adAccountId: string): string {
  const account = metaAccountId(adAccountId);
  if (account === null) {
    throw new MetaClientError("meta_ads: no ad account id", "bad_account_id");
  }
  return account;
}

/**
 * Read the ad account's currency and timezone.
 *
 * A SEPARATE CALL, AND AN UNAVOIDABLE ONE. The insights edge returns `account_currency` but no
 * timezone, while every date it reports is a day boundary in the account's own timezone -- so
 * without this call the envelope's `timezone` field can only be guessed, and a guess of UTC moves
 * a Bangkok advertiser's day by seven hours. One call per connected account per run, cached by the
 * caller for the run's duration; it is the cheapest call in the connector and the one that makes
 * sections 3.1 and 4.4's timezone guarantee true rather than marketing.
 */
export async function getAdAccount(options: MetaClientOptions): Promise<MetaAdAccount> {
  const account = requireAccount(options.adAccountId);
  const params = new URLSearchParams({ fields: "currency,timezone_name,name" });
  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url: `${options.baseUrl ?? META_GRAPH_BASE}/${account}?${params.toString()}`,
      init: { method: "GET", headers: { authorization: `Bearer ${options.accessToken}` } },
    },
    options.retry,
  );

  options.onUsage?.(parseMetaUsage(response.headers));

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    // The message names the account and never the token. See the module note on credential hygiene.
    throw new MetaClientError(
      `meta_ads: ${account} returned a body that is not JSON: ${(cause as Error).message}`,
      "unparseable_body",
    );
  }

  const node = body as { currency?: unknown; timezone_name?: unknown; name?: unknown };
  if (typeof node.currency !== "string" || typeof node.timezone_name !== "string") {
    throw new MetaClientError(
      `meta_ads: ${account} returned no currency or timezone_name. Both are required by the ` +
        "envelope, and defaulting either would mislabel every row from this account.",
      "missing_account_profile",
    );
  }

  return {
    id: account,
    currency: node.currency,
    timezoneName: node.timezone_name,
    name: typeof node.name === "string" ? node.name : null,
  };
}

/**
 * One page of `/insights`.
 *
 * `time_increment=1` is set HERE rather than accepted from the caller, for the same reason GA4's
 * client sets `returnPropertyQuota` itself: a caller who forgot it gets ONE aggregate row for the
 * whole window with `date_start` at its first day, which normalises into a month of spend landing
 * on the 1st. It is one forgotten parameter between a correct report and a wrong one, so it is not
 * a parameter.
 *
 * `action_attribution_windows` is required and validated for the same class of reason: omitted,
 * Meta answers under a default its own documentation never names.
 */
export async function getInsightsPage(
  options: MetaClientOptions,
  request: MetaInsightsRequest,
): Promise<MetaInsightsPage> {
  const account = requireAccount(options.adAccountId);

  const limit = request.limit ?? META_PAGE_ROWS;
  if (!Number.isInteger(limit) || limit < 1 || limit > META_MAX_PAGE_ROWS) {
    throw new MetaClientError(
      `meta_ads: limit must be an integer in 1..${META_MAX_PAGE_ROWS}, got ${limit}`,
      "bad_limit",
    );
  }

  if (!ISO_DATE.test(request.since) || !ISO_DATE.test(request.until)) {
    // A malformed range costs a rejected call, and on Meta a rejected call is an error that counts
    // against the Full Access error-rate threshold as well as against the insights quota.
    throw new MetaClientError(
      `meta_ads: time_range must be YYYY-MM-DD, got ${request.since}..${request.until}`,
      "bad_date_range",
    );
  }

  if (request.attributionWindows.length === 0) {
    throw new MetaClientError(
      "meta_ads: at least one attribution window must be requested. Omitting them makes Meta " +
        "answer under a default it never names, and an unlabelled conversion count cannot be " +
        "stored (specification section 2).",
      "no_attribution_window",
    );
  }
  for (const window of request.attributionWindows) {
    if (!(META_ACTION_WINDOWS as readonly string[]).includes(window)) {
      throw new MetaClientError(
        `meta_ads: ${JSON.stringify(window)} is not one of Meta's selectable action-attribution ` +
          `windows (${META_ACTION_WINDOWS.join(", ")}).`,
        "bad_attribution_window",
      );
    }
  }

  const params = new URLSearchParams({
    level: request.level,
    fields: request.fields.join(","),
    time_range: JSON.stringify({ since: request.since, until: request.until }),
    // One row per day. Not configurable. See the note above.
    time_increment: "1",
    action_attribution_windows: JSON.stringify(request.attributionWindows),
    limit: String(limit),
  });
  if (request.after !== undefined) params.set("after", request.after);

  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url: `${options.baseUrl ?? META_GRAPH_BASE}/${account}/insights?${params.toString()}`,
      init: {
        method: "GET",
        // The token travels in the header, never the query string. See the module note.
        headers: { authorization: `Bearer ${options.accessToken}` },
      },
    },
    options.retry,
  );

  const usage = parseMetaUsage(response.headers);
  options.onUsage?.(usage);

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new MetaClientError(
      `meta_ads: ${account} returned a body that is not JSON: ${(cause as Error).message}`,
      "unparseable_body",
    );
  }

  const payload = body as {
    data?: unknown;
    paging?: { next?: unknown; cursors?: { after?: unknown } };
  };
  if (!Array.isArray(payload.data)) {
    // An object where an array belongs is a different response than this connector models -- an
    // error envelope, a batch wrapper -- and reading zero rows out of it would report "no data"
    // for a day that has some.
    throw new MetaClientError(
      `meta_ads: ${account} returned no data array. Refusing rather than reading it as an empty ` +
        "report, which is indistinguishable from a day with no delivery.",
      "unparseable_body",
    );
  }

  const after = payload.paging?.cursors?.after;
  return {
    rows: payload.data as readonly MetaInsightsRow[],
    usage,
    after: typeof after === "string" && after !== "" ? after : null,
    // `paging.next` is the presence test ONLY. It is never fetched: it carries the access token as
    // a query parameter. See the module note.
    hasNext: typeof payload.paging?.next === "string" && payload.paging.next !== "",
  };
}

/**
 * Every page of one window, as an async generator.
 *
 * A GENERATOR RATHER THAN AN ARRAY, for the reason `fetchWithRetry` refuses to read a body: an
 * isolate has 128 MB and a Workflow step output is capped at 1 MiB. At ad level one page fans out
 * to thousands of envelope rows, so accumulating the run is the shape that cannot be made to work.
 *
 * FOUR WAYS THIS STOPS EARLY OR REFUSES, three of which otherwise produce a total that is quietly
 * too low -- the failure the product exists to sell against:
 *
 *   * Meta says there is a next page and gives no cursor. Continuing would refetch page one
 *     forever; stopping quietly would drop the remainder.
 *   * The same cursor comes back twice. Same thing, detected the other way round.
 *   * Measured utilisation reaches the ceiling, or Meta names a time to come back. The pages that
 *     arrived are complete and correct; the remainder is a job for the next sweep.
 *   * Nothing has reported utilisation for `maxUnmeasuredPages` pages. Paging on against an
 *     unknown ceiling spends an application score shared with every other tenant.
 *
 * Every completed page is yielded BEFORE the refusal is raised, so a caller iterating with
 * `for await` keeps what finished.
 */
export async function* getInsightsPages(
  options: MetaClientOptions,
  request: MetaInsightsRequest,
): AsyncGenerator<MetaInsightsPage, void, undefined> {
  const maxUnmeasured = options.maxUnmeasuredPages ?? META_MAX_UNMEASURED_PAGES;
  const cursors = new Set<string>();
  let after = request.after;
  let unmeasured = 0;

  for (;;) {
    const page = await getInsightsPage(options, { ...request, after });
    yield page;

    if (!page.hasNext) return;

    if (page.after === null || cursors.has(page.after)) {
      throw new MetaClientError(
        `meta_ads: Meta says another page follows but gave ` +
          `${page.after === null ? "no cursor" : "a cursor already used"}. Stopping rather than ` +
          "looping, and refusing rather than returning a partial report as if it were whole.",
        "no_progress",
      );
    }
    cursors.add(page.after);

    const verdict = usageAllowsAnother(page.usage, options.utilisationCeiling);
    if (!verdict.allowed) {
      throw new MetaClientError(
        `meta_ads: stopped after ${cursors.size} page(s) for ${options.adAccountId}. ` +
          `${verdict.reason} The remainder is a job for the next scheduled sweep, not a retry now.`,
        "throttle_floor",
        verdict.retryAfterSeconds,
      );
    }

    unmeasured = page.usage.utilisationPct === null ? unmeasured + 1 : 0;
    if (unmeasured >= maxUnmeasured) {
      throw new MetaClientError(
        `meta_ads: ${unmeasured} consecutive pages carried no utilisation reading. Stopping at ` +
          "this bound rather than paging on against a ceiling nothing has reported. The bound is " +
          "a guess, not a Meta figure; pass maxUnmeasuredPages once the real behaviour is known.",
        "throttle_floor",
      );
    }

    after = page.after;
  }
}
