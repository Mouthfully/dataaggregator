/**
 * GA4 -> transport.
 *
 * The other half of the connector unit (specification section 13.3). `normalize.ts` turns a response
 * into envelope rows; this turns a backfill window into responses. They are separate because
 * normalisation is testable without a credential and transport is not.
 *
 * ONE SOURCED FACT DECIDES THE WHOLE DESIGN. Specification section 7, line 710:
 *
 *   "token cost varying by query complexity so per-call cost is unknowable at request time"
 *
 * A GA4 request does not cost one request. It costs some number of tokens that Google will not tell
 * you until after you have spent them. So this client CANNOT budget ahead the way the Google Ads
 * planner does in @repo/extract -- there is no number to plan against. It can only measure, which is
 * why `returnPropertyQuota` is sent on every request and is not configurable.
 *
 * WHOSE QUOTA IS THIS? Not ours. Section 3.2's table: 40,000 core tokens per property per hour,
 * "shared with the customer's other tools". Spending a property's hourly quota does not degrade this
 * product -- it breaks the customer's own Looker Studio dashboards, with no error message that
 * points anywhere near us. That is the reason for the floor below, and the reason a quota-exhaustion
 * 429 is deliberately NOT retried here.
 *
 * There is a second ceiling that is genuinely ours, and it is the GA4 analogue of the Google Ads
 * developer token in `10-credential-model.md`: 14,000 core tokens PER PROJECT per property per hour.
 * Our OAuth client is one GCP project across every tenant. Usefully, it also caps us at 35% of any
 * one property's hourly quota, so Google enforces "do not hog the customer's allowance" on our
 * behalf -- but only per property, never across them.
 */

import { type FetchOptions, fetchWithRetry } from "@repo/extract";
import type { Ga4Report } from "./normalize.ts";

/** `POST {base}/{property}:runReport`. Overridable so tests never resolve a real host. */
export const GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

/**
 * Rows per page.
 *
 * GA4's `limit` accepts up to 250,000 and DEFAULTS TO 10,000 -- and a report that hits the default
 * comes back truncated, with the true total in `rowCount` and no error. This client always sends an
 * explicit limit, and `runReportPages` refuses to stop while `rowCount` says there is more.
 *
 * The value is well below GA4's maximum on purpose: a Worker isolate has 128 MB and the response is
 * parsed as JSON in one piece, so the page size is a memory bound before it is a quota one.
 */
export const GA4_PAGE_ROWS = 10_000;
export const GA4_MAX_PAGE_ROWS = 250_000;

/**
 * Stop issuing requests when a quota group falls below this fraction of nothing left.
 *
 * The last request's token cost is the only estimate available for the next one's, and it is a
 * LOWER bound -- a page deeper into a report is not cheaper. Zero remaining is therefore not the
 * place to find out; it is the customer's other tools that fail first.
 */
export const GA4_QUOTA_FLOOR = 0.1;

export class Ga4ClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | "quota_floor"
      | "truncated_report"
      | "no_progress"
      | "bad_limit"
      | "unparseable_body",
  ) {
    super(message);
    this.name = "Ga4ClientError";
  }
}

/** One of GA4's quota groups, as `propertyQuota` reports it. */
export interface QuotaGroup {
  readonly consumed: number;
  readonly remaining: number;
}

/**
 * `propertyQuota`, returned only when `returnPropertyQuota` was requested.
 *
 * Every field optional because Google returns the groups it chooses to; a missing group is reported
 * as absent rather than as zero. Zero remaining and "not reported" mean opposite things.
 */
export interface Ga4PropertyQuota {
  readonly tokensPerDay: QuotaGroup | null;
  readonly tokensPerHour: QuotaGroup | null;
  /** The ceiling shared across every tenant on our OAuth client. See the module note. */
  readonly tokensPerProjectPerHour: QuotaGroup | null;
  readonly concurrentRequests: QuotaGroup | null;
  readonly serverErrorsPerProjectPerHour: QuotaGroup | null;
  readonly potentiallyThresholdedRequestsPerHour: QuotaGroup | null;
}

const QUOTA_GROUPS = [
  "tokensPerDay",
  "tokensPerHour",
  "tokensPerProjectPerHour",
  "concurrentRequests",
  "serverErrorsPerProjectPerHour",
  "potentiallyThresholdedRequestsPerHour",
] as const satisfies ReadonlyArray<keyof Ga4PropertyQuota>;

function group(value: unknown): QuotaGroup | null {
  if (typeof value !== "object" || value === null) return null;
  const { consumed, remaining } = value as { consumed?: unknown; remaining?: unknown };
  if (typeof consumed !== "number" || typeof remaining !== "number") return null;
  return { consumed, remaining };
}

/** Read `propertyQuota` off a response body. Null when the response carries none. */
export function parsePropertyQuota(body: unknown): Ga4PropertyQuota | null {
  const quota = (body as { propertyQuota?: unknown } | null)?.propertyQuota;
  if (typeof quota !== "object" || quota === null) return null;
  const record = quota as Record<string, unknown>;
  const parsed = Object.fromEntries(
    QUOTA_GROUPS.map((name) => [name, group(record[name])]),
  ) as unknown as Ga4PropertyQuota;
  return parsed;
}

/**
 * Whether a further request may be issued against this quota reading.
 *
 * `concurrentRequests` is deliberately EXCLUDED. It is a momentary count of in-flight requests, not
 * a depleting allowance, so applying a depletion floor to it would stop a healthy client the moment
 * it reached its own concurrency limit -- a self-inflicted stall rather than a quota protection.
 *
 * A null quota reading returns `true` with `reason` saying so, because refusing on absent
 * information would mean a property that reports no quota can never be read at all.
 */
export function quotaAllowsAnother(
  quota: Ga4PropertyQuota | null,
  floor: number = GA4_QUOTA_FLOOR,
): { allowed: boolean; reason: string } {
  if (quota === null) {
    return { allowed: true, reason: "no propertyQuota in the response; nothing to check against" };
  }
  for (const name of QUOTA_GROUPS) {
    if (name === "concurrentRequests") continue;
    const g = quota[name];
    if (g === null) continue;
    const total = g.consumed + g.remaining;
    if (total <= 0) continue;
    if (g.remaining / total < floor) {
      return {
        allowed: false,
        reason:
          `${name} is at ${g.remaining}/${total} remaining, below the ${floor} floor. Stopping ` +
          "rather than spending the last of a quota the customer's own tools draw on.",
      };
    }
  }
  return { allowed: true, reason: "within floor" };
}

/** The `runReport` request body this client builds. */
export interface Ga4ReportRequest {
  readonly dimensions: ReadonlyArray<{ name: string }>;
  readonly metrics: ReadonlyArray<{ name: string }>;
  readonly dateRanges: ReadonlyArray<{ startDate: string; endDate: string }>;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Ga4ClientOptions {
  readonly fetchImpl: typeof fetch;
  /** The CUSTOMER's OAuth access token, opened from the vault per request. Never ours. */
  readonly accessToken: string;
  /** e.g. "properties/123456". */
  readonly propertyId: string;
  readonly baseUrl?: string;
  readonly retry: FetchOptions;
}

export interface Ga4Page {
  readonly report: Ga4Report;
  readonly quota: Ga4PropertyQuota | null;
  /** Total rows matching the query, which is not the number returned. */
  readonly rowCount: number;
  readonly offset: number;
  readonly rows: number;
}

/**
 * One page.
 *
 * `returnPropertyQuota` is set here rather than accepted from the caller: a caller who forgot it
 * would spend a customer's quota blind, and the flag costs nothing.
 */
export async function runReport(
  options: Ga4ClientOptions,
  request: Ga4ReportRequest,
): Promise<Ga4Page> {
  const limit = request.limit ?? GA4_PAGE_ROWS;
  if (!Number.isInteger(limit) || limit < 1 || limit > GA4_MAX_PAGE_ROWS) {
    throw new Ga4ClientError(
      `ga4: limit must be an integer in 1..${GA4_MAX_PAGE_ROWS}, got ${limit}`,
      "bad_limit",
    );
  }
  const offset = request.offset ?? 0;

  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url: `${options.baseUrl ?? GA4_DATA_API_BASE}/${options.propertyId}:runReport`,
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...request, limit, offset, returnPropertyQuota: true }),
      },
    },
    options.retry,
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    // The message names the property and not the token. See the credential-hygiene note below.
    throw new Ga4ClientError(
      `ga4: ${options.propertyId} returned a body that is not JSON: ${(cause as Error).message}`,
      "unparseable_body",
    );
  }

  const report = body as Ga4Report & { rowCount?: number };
  return {
    report,
    quota: parsePropertyQuota(body),
    rowCount: typeof report.rowCount === "number" ? report.rowCount : (report.rows?.length ?? 0),
    offset,
    rows: report.rows?.length ?? 0,
  };
}

/**
 * Every page of a report, as an async generator.
 *
 * A GENERATOR RATHER THAN AN ARRAY, for the reason `fetchWithRetry` refuses to read a body: a Worker
 * isolate has 128 MB and a Workflow step output is capped at 1 MiB (`00-repo-map.md` section 5).
 * Accumulating a large report into one array is the shape that cannot be made to work later.
 *
 * THREE WAYS THIS REFUSES, all of which otherwise produce a total that is quietly too low -- the
 * failure mode the product exists to sell against:
 *
 *   * The quota floor is reached mid-report. Half a report emitted as if whole is worse than none.
 *   * A page returns zero rows while `rowCount` says more remain. Continuing would loop forever;
 *     stopping silently would drop the remainder.
 *   * The generator is exhausted with fewer rows seen than `rowCount`.
 */
export async function* runReportPages(
  options: Ga4ClientOptions,
  request: Ga4ReportRequest,
): AsyncGenerator<Ga4Page, void, undefined> {
  const limit = request.limit ?? GA4_PAGE_ROWS;
  let offset = request.offset ?? 0;
  let seen = 0;
  let total: number | null = null;

  for (;;) {
    const page = await runReport(options, { ...request, limit, offset });
    total = page.rowCount;
    seen += page.rows;
    yield page;

    if (seen >= total) return;

    if (page.rows === 0) {
      throw new Ga4ClientError(
        `ga4: ${options.propertyId} returned 0 rows at offset ${offset} while rowCount is ${total}. ` +
          "Stopping rather than looping, and refusing rather than returning a partial report as if " +
          "it were whole.",
        "no_progress",
      );
    }

    const verdict = quotaAllowsAnother(page.quota);
    if (!verdict.allowed) {
      throw new Ga4ClientError(
        `ga4: stopped after ${seen} of ${total} rows for ${options.propertyId}. ${verdict.reason} ` +
          "The remainder is a job for the next scheduled sweep, not for a retry now.",
        "quota_floor",
      );
    }

    offset += page.rows;
  }
}
