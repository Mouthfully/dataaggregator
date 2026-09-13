/**
 * THE FETCH. One request, a timeout, typed refusals, and a record of who actually answered.
 *
 * In the posture of `packages/connectors/src/sources/*\/client.ts`: the error union is deliberately
 * flat and deliberately long, because a caller that maps these to an operator alert needs the
 * distinctions, and collapsing two causes into one code is how somebody gets sent to fix the wrong
 * thing. A missing API key and a provider that refused the request look identical in a log that
 * says "insight generation failed".
 *
 * NO RETRY ON 4xx. A 400, 401, 403 or 422 is this code being wrong about the request, and sending
 * the same wrong request again changes nothing except the bill. A 5xx or a dropped connection is
 * the other side being briefly unavailable, which is worth exactly one more attempt -- more than
 * that belongs to whatever scheduled the run, which knows whether it is still worth having an
 * answer at all. 429 is deliberately in the no-retry set: a rate limit asks for a later run, not a
 * faster one.
 *
 * WHICH MODEL AND WHICH PROVIDER ACTUALLY SERVED THE CALL IS READ OFF THE RESPONSE AND KEPT.
 * OpenRouter's default routing can serve the same request from a different provider run to run, so
 * "which model wrote this brief" is NOT answerable from the request -- the request names a slug and
 * the response names what happened. An insight nobody can attribute is one nobody can audit, so
 * both come back on the result and a caller that stores briefs should store them.
 *
 * THE PRIVACY FIELDS ARE CHECKED HERE TOO. `request.ts` builds them and this refuses to send a body
 * without them, so a hand-rolled body fails at the fetch rather than at a provider. That check is
 * not a formality: the field it is looking for is the one that defaults to "allow" upstream.
 */

import { OPENROUTER_COMPLETIONS_URL, type OpenRouterBody, assertPrivacyFields } from "./request.ts";

export type InsightClientErrorCode =
  // Before any request exists.
  | "missing_api_key"
  | "privacy_fields_missing"
  // The call itself.
  | "timeout"
  | "network"
  // What came back.
  | "unauthorised"
  | "rate_limited"
  | "provider_refused"
  | "bad_status"
  | "malformed_response"
  | "no_content";

export class InsightClientError extends Error {
  readonly code: InsightClientErrorCode;
  readonly status: number | null;

  constructor(code: InsightClientErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "InsightClientError";
    this.code = code;
    this.status = status;
  }
}

/** What came back, including who answered. */
export interface InsightCompletion {
  /** The completion's content, unparsed. `verify.ts` owns the parse. */
  readonly content: string;
  /** The model that actually served it, as the response reports it -- not the slug requested. */
  readonly servedByModel: string | null;
  /** The upstream provider that actually served it. Null when the response did not say. */
  readonly servedByProvider: string | null;
  /** OpenRouter's own id for the generation, for support conversations about one brief. */
  readonly generationId: string | null;
}

export interface ClientOptions {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  /** Injected in tests. Defaults to the runtime's own fetch. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Long enough for a slow provider, short enough that a scheduled morning run does not hang past
 * the morning. A brief that arrives at 11:00 is not a morning brief.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

export async function postInsight(
  body: OpenRouterBody,
  options: ClientOptions,
): Promise<InsightCompletion> {
  if (options.apiKey.trim() === "") {
    throw new InsightClientError(
      "missing_api_key",
      "OPENROUTER_API_KEY is not set. It is a platform key and is deliberately not a tenant " +
        "credential: it must not live in the vault path, which exists for per-tenant secrets.",
    );
  }

  const problem = assertPrivacyFields(body);
  if (problem !== null) {
    throw new InsightClientError(
      "privacy_fields_missing",
      `refusing to send: ${problem}. Every call carries provider.data_collection "deny" and ` +
        'provider.zdr true, and data_collection defaults to "allow" upstream, so a body without ' +
        "them permits providers to store and train on the tenant's business data.",
    );
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await attempt(doFetch, body, options.apiKey, timeoutMs);
  } catch (error) {
    if (error instanceof InsightClientError && error.code === "network") {
      // The one retry. See the module note on why it is one and why it excludes 4xx.
      response = await attempt(doFetch, body, options.apiKey, timeoutMs);
    } else {
      throw error;
    }
  }

  if (response.status >= 500) {
    const retried = await attempt(doFetch, body, options.apiKey, timeoutMs);
    return await readCompletion(retried);
  }

  return await readCompletion(response);
}

async function attempt(
  doFetch: typeof fetch,
  body: OpenRouterBody,
  apiKey: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(OPENROUTER_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new InsightClientError("timeout", `no answer within ${timeoutMs}ms`);
    }
    throw new InsightClientError(
      "network",
      error instanceof Error ? error.message : "the request did not complete",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readCompletion(response: Response): Promise<InsightCompletion> {
  if (response.status === 401 || response.status === 403) {
    throw new InsightClientError("unauthorised", "the platform key was rejected", response.status);
  }
  if (response.status === 429) {
    throw new InsightClientError(
      "rate_limited",
      "rate limited; this asks for a later run, not a faster one",
      response.status,
    );
  }
  if (response.status === 404 || response.status === 422) {
    throw new InsightClientError(
      "provider_refused",
      "no provider would serve this request under the privacy fields it carries",
      response.status,
    );
  }
  if (!response.ok) {
    throw new InsightClientError(
      "bad_status",
      `unexpected status ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new InsightClientError("malformed_response", "the response body was not JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new InsightClientError("malformed_response", "the response body was not an object");
  }
  const record = payload as Record<string, unknown>;

  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new InsightClientError("no_content", "the response carried no choices");
  }
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new InsightClientError("no_content", "the first choice carried no text");
  }

  return {
    content,
    servedByModel: typeof record.model === "string" ? record.model : null,
    servedByProvider: typeof record.provider === "string" ? record.provider : null,
    generationId: typeof record.id === "string" ? record.id : null,
  };
}
