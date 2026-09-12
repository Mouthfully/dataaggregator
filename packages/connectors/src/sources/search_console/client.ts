/**
 * Search Console -> transport.
 *
 * The other half of the connector unit (specification section 13.3), and the sibling of
 * `sources/ga4/client.ts`: same provider, same OAuth grant on the same Google client, same
 * quota-aware HTTP layer from `@repo/extract`.
 *
 * IT IS SHAPED BY THE ABSENCE OF THE ONE THING THAT SHAPES THE GA4 CLIENT. GA4 returns
 * `propertyQuota` in the body, so that client can measure what it spent and stop at a floor before
 * it eats into the customer's own allowance. A `searchAnalytics.query` response carries NO quota
 * information of any kind -- no remaining, no consumed, no header. There is nothing to measure, so
 * there is no floor to implement, and pretending otherwise would mean inventing a budget and
 * calling it a measurement.
 *
 * WHAT REPLACES IT, given the published ceilings (specification section 3.2, Search Console
 * limits): 1,200 queries per minute PER SITE and per user, 40,000 QPM and 30,000,000 QPD per
 * project -- plus, and this is the part that matters, "undocumented load quotas over 10-minute and
 * 1-day windows that can trigger errors before published limits". A limit that is both undocumented
 * and lower than the documented one cannot be planned against at all. So this client spends as
 * little as the work allows and treats a quota rejection as expected control flow rather than as an
 * exception: requests are strictly sequential, every page is as large as the platform permits, the
 * report shapes below are the two smallest that answer the question, and nothing is retried that
 * retrying cannot fix.
 *
 * ONE AMBIGUITY THIS CLIENT CANNOT RESOLVE FROM WHERE IT SITS, recorded rather than papered over.
 * `@repo/extract`'s `classify` reads 403 as `auth` and refuses to retry it, which is right for a
 * dead grant and is the token-death path that flips a connection to `needs_reauth`. Google APIs
 * have historically also returned 403 with a `rateLimitExceeded` reason for quota, and
 * `fetchWithRetry` deliberately never reads a body, so from here a quota 403 and a revoked grant
 * are the same event. The wrong fix is to soften the auth path on a suspicion: that would delay the
 * reconnect prompt for every genuinely dead grant in order to hedge one unmeasured case. It is
 * named in the design note as a thing one live over-quota call settles.
 */

import { type FetchOptions, fetchWithRetry } from "@repo/extract";
import {
  type SearchAnalyticsResponse,
  type SearchConsoleDimension,
  grainFor,
  parseSearchConsoleDate,
} from "./normalize.ts";

/**
 * `POST {base}/sites/{siteUrl}/searchAnalytics/query`. Overridable so tests never resolve a real
 * host.
 *
 * The service host rather than `www.googleapis.com`, which also serves this path. Both are
 * published by Google in different places; they address the same API and this one names it.
 */
export const SEARCH_CONSOLE_API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

/**
 * Rows per page.
 *
 * `rowLimit` accepts up to 25,000 and DEFAULTS TO 1,000 -- and a report that hits the default comes
 * back truncated with no error, no total and no cursor to notice it by. That is the same trap as
 * GA4's 10,000 default and it is worse here, because GA4 at least returns `rowCount` to check
 * against. This client always sends an explicit limit.
 *
 * The value sits below the platform maximum for the reason the GA4 client gives: a Worker isolate
 * has 128 MB and the response is parsed as JSON in one piece, so page size is a memory bound before
 * it is a quota one. A Search Console row is larger than a GA4 row -- it carries a `keys` array of
 * unbounded free text -- so the same ceiling buys fewer rows here, not more.
 */
export const SEARCH_CONSOLE_PAGE_ROWS = 10_000;
export const SEARCH_CONSOLE_MAX_PAGE_ROWS = 25_000;

/**
 * How many pages one report may take before this refuses.
 *
 * GA4 knows when it is finished: `rowCount` states the total and the generator pages until it is
 * satisfied. SEARCH CONSOLE PUBLISHES NO TOTAL AND NO CURSOR. The only signal that a report has
 * ended is a page shorter than `rowLimit`, which means a page exactly equal to `rowLimit` is
 * indistinguishable from the last page of a report that happens to divide evenly -- so the last
 * request of any full report is always one that returns nothing. That is the correct trade: one
 * spare request against a report that silently stops short.
 *
 * It also means a response that always returns exactly `rowLimit` rows has no termination condition
 * at all, and a generator with no termination condition inside a Workflow step is a timeout rather
 * than an error. The cap turns that into a refusal that names itself. At the default page size it
 * allows 200,000 rows per report, which is far past any grain this connector emits.
 */
export const SEARCH_CONSOLE_MAX_PAGES = 20;

/**
 * `web`, sent explicitly.
 *
 * Search Console partitions its data by search type -- web, image, video, news, discover -- and a
 * request that names none gets the platform's default. That default is a number this connector
 * would then be unable to describe: the envelope has no dimension for search type, so a web row and
 * an image row would be stored as the same thing and a change in Google's default would silently
 * change what every historical row means. One type, named, until there is a dimension to label the
 * others with.
 *
 * THE FIELD NAME IS THE ONE THING HERE A LIVE CALL WOULD SETTLE. Google documents this field as
 * `type` on the current Search Console API surface and as `searchType` on the older `webmasters/v3`
 * path, which is the path this client uses. Sending an unknown field is a 400 naming it, which
 * `classify` reports as a non-retryable client error -- an unambiguous answer for the cost of one
 * request. It is one constant so the correction is one line.
 */
export const SEARCH_CONSOLE_SEARCH_TYPE_FIELD = "type";
export const SEARCH_CONSOLE_SEARCH_TYPE = "web";

/**
 * `final`, sent explicitly, and this is a decision rather than a transcription of the default.
 *
 * `dataState: "all"` includes fresh data that Google itself labels incomplete and that will change.
 * `RESTATEMENT_CLOCKS.search_console.windowDays` is null -- nobody has measured how long a Search
 * Console figure keeps moving -- so this connector has no model of how much "all" would move or for
 * how long, and storing data whose revision behaviour is unmodelled is how a store starts
 * disagreeing with the platform's own UI.
 *
 * THE COST IS REAL AND IS ACCEPTED: recent days return FEWER ROWS OR NONE AT ALL under `final`,
 * because Google has not finalised them yet. The backfill planner's D-0 to D-3 daily tier will
 * therefore see empty responses at its newest end, and an empty response is not an error here --
 * it is the platform saying "not yet", which is a true statement and a better one than a number
 * that will be different tomorrow.
 */
export const SEARCH_CONSOLE_DATA_STATE = "final";

/**
 * The two report shapes worth pulling, and why they are a PAIR rather than a choice.
 *
 * `byQuery` is the diagnostic value -- it is the only dimension the paid and organic sides of this
 * product share, and it is what answers "which searches stopped sending people". But Google's
 * anonymity threshold withholds low-volume queries from it, so its rows are a subset and their sum
 * is quietly lower than the truth.
 *
 * `totals` is one extra request per window and it returns Google's own number, anonymised queries
 * included. Pulled together, the difference between them IS the anonymity gap, stated rather than
 * hidden, and each is stored at its own entity grain so nothing downstream can confuse one for the
 * other. Pulled apart, the query rows are a total that is wrong by an amount nobody can compute.
 *
 * `byPage` is available and is not in the default pair: it answers a different question and doubles
 * the request count again. Which reports a backfill actually runs is the backfill unit's decision;
 * these are the shapes it has to choose from.
 */
export const SEARCH_CONSOLE_REPORTS = {
  totals: ["date"],
  byQuery: ["date", "query"],
  byPage: ["date", "page"],
} as const satisfies Readonly<Record<string, readonly SearchConsoleDimension[]>>;

export class SearchConsoleClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | "bad_row_limit"
      | "bad_start_row"
      | "bad_date_range"
      | "unparseable_body"
      | "page_cap",
  ) {
    super(message);
    this.name = "SearchConsoleClientError";
  }
}

export interface SearchConsoleClientOptions {
  readonly fetchImpl: typeof fetch;
  /** The CUSTOMER's OAuth access token, opened from the vault per request. Never ours. */
  readonly accessToken: string;
  /** The property, e.g. "sc-domain:example.com" or "https://example.com/". */
  readonly siteUrl: string;
  readonly baseUrl?: string;
  readonly retry: FetchOptions;
}

export interface SearchAnalyticsRequest {
  readonly dimensions: readonly SearchConsoleDimension[];
  /** Inclusive, YYYY-MM-DD, in the platform's Pacific reporting day. */
  readonly startDate: string;
  /** Inclusive. */
  readonly endDate: string;
  readonly rowLimit?: number;
  readonly startRow?: number;
}

export interface SearchConsolePage {
  readonly response: SearchAnalyticsResponse;
  /**
   * The dimensions THIS page was requested with, carried forward so the normaliser cannot be given
   * a different list from the one the platform answered. The response echoes no names, so this is
   * the only thing that says what `keys[0]` means, and a remembered pairing is a pairing that
   * eventually goes wrong.
   */
  readonly dimensions: readonly SearchConsoleDimension[];
  readonly rows: number;
  readonly startRow: number;
  readonly rowLimit: number;
  readonly dataState: string;
  readonly searchType: string;
  /** How Google says it aggregated, or null when it did not say. Reported, never assumed. */
  readonly responseAggregationType: string | null;
  /** A full page is indistinguishable from the last one. See SEARCH_CONSOLE_MAX_PAGES. */
  readonly mayHaveMore: boolean;
}

/**
 * The request URL.
 *
 * `encodeURIComponent` is load-bearing and not decoration. A Search Console property is either
 * `sc-domain:example.com` or a URL-prefix property like `https://example.com/`, and both carry
 * characters -- `:` and `/` -- that are path separators in the template they are substituted into.
 * Unencoded, `https://example.com/` turns one path segment into four and the request addresses
 * something that is not this customer's property.
 */
export function searchAnalyticsUrl(baseUrl: string, siteUrl: string): string {
  return `${baseUrl}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
}

/**
 * One page.
 *
 * `dataState`, the search type and an explicit `rowLimit` are set here rather than accepted from
 * the caller, for the reason the GA4 client sets `returnPropertyQuota`: each is a default whose
 * silent change alters what the returned number MEANS, and a caller who forgot one would not find
 * out from the response.
 *
 * The dimension list is validated before the request is built, by the normaliser's own `grainFor`.
 * The refusal is the normaliser's either way; raising it here costs nothing, where raising it after
 * the response costs a round trip against a shared per-site ceiling.
 */
export async function querySearchAnalytics(
  options: SearchConsoleClientOptions,
  request: SearchAnalyticsRequest,
): Promise<SearchConsolePage> {
  grainFor(request.dimensions);

  const rowLimit = request.rowLimit ?? SEARCH_CONSOLE_PAGE_ROWS;
  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > SEARCH_CONSOLE_MAX_PAGE_ROWS) {
    throw new SearchConsoleClientError(
      `search_console: rowLimit must be an integer in 1..${SEARCH_CONSOLE_MAX_PAGE_ROWS}, got ` +
        `${rowLimit}. Letting the platform clamp it silently truncates the report.`,
      "bad_row_limit",
    );
  }

  const startRow = request.startRow ?? 0;
  if (!Number.isInteger(startRow) || startRow < 0) {
    throw new SearchConsoleClientError(
      `search_console: startRow must be a non-negative integer, got ${startRow}`,
      "bad_start_row",
    );
  }

  // Validated here rather than at the platform, because a malformed range is a wasted request
  // against a per-site ceiling and because `parseSearchConsoleDate` catches the impossible dates
  // that Date.parse rolls over instead of rejecting.
  parseSearchConsoleDate(request.startDate);
  parseSearchConsoleDate(request.endDate);
  if (request.startDate > request.endDate) {
    throw new SearchConsoleClientError(
      `search_console: the window ${request.startDate}..${request.endDate} ends before it starts`,
      "bad_date_range",
    );
  }

  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url: searchAnalyticsUrl(options.baseUrl ?? SEARCH_CONSOLE_API_BASE, options.siteUrl),
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          startDate: request.startDate,
          endDate: request.endDate,
          dimensions: request.dimensions,
          rowLimit,
          startRow,
          dataState: SEARCH_CONSOLE_DATA_STATE,
          [SEARCH_CONSOLE_SEARCH_TYPE_FIELD]: SEARCH_CONSOLE_SEARCH_TYPE,
        }),
      },
    },
    options.retry,
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    // The message names the property and never the token. Gate 4: an error message is a log line,
    // and a bearer token in a log is a credential under a different retention policy.
    throw new SearchConsoleClientError(
      `search_console: ${options.siteUrl} returned a body that is not JSON: ` +
        `${(cause as Error).message}`,
      "unparseable_body",
    );
  }

  const parsed = body as SearchAnalyticsResponse;
  const rows = parsed.rows?.length ?? 0;
  return {
    response: parsed,
    dimensions: request.dimensions,
    rows,
    startRow,
    rowLimit,
    dataState: SEARCH_CONSOLE_DATA_STATE,
    searchType: SEARCH_CONSOLE_SEARCH_TYPE,
    responseAggregationType: parsed.responseAggregationType ?? null,
    // A SHORT PAGE IS THE ONLY END-OF-REPORT SIGNAL THIS PLATFORM SENDS. A full page may be the
    // last one; there is no total to check it against and no cursor to be absent. `>=` rather than
    // `===` because a page that came back LONGER than the limit is a platform this connector does
    // not model, and guessing that such a report has ended would drop whatever follows it.
    mayHaveMore: rows >= rowLimit,
  };
}

/**
 * Every page of a report, as an async generator.
 *
 * A generator rather than an array for the reason `fetchWithRetry` refuses to read a body: a Worker
 * isolate has 128 MB and a Workflow step output is capped at 1 MiB (`00-repo-map.md` section 5).
 * Accumulating a query-grain report into one array is the shape that cannot be fixed later, and
 * query cardinality is the one term in this connector's cost that a customer controls.
 *
 * It advances by the rows RECEIVED rather than by the limit requested. The two coincide on every
 * full page and diverge on exactly the page that matters: one that comes back short while rows
 * remain would be stepped over by `startRow += rowLimit`, and the report would end short with
 * nothing saying so.
 *
 * It refuses at the page cap rather than stopping, because a report that stops early and reports
 * success is a total that is quietly too low -- which is the failure this connector is built to
 * refuse, and the reason there is a cap at all is that this platform gives nothing else to stop on.
 */
export async function* querySearchAnalyticsPages(
  options: SearchConsoleClientOptions,
  request: SearchAnalyticsRequest,
  maxPages: number = SEARCH_CONSOLE_MAX_PAGES,
): AsyncGenerator<SearchConsolePage, void, undefined> {
  let startRow = request.startRow ?? 0;

  for (let page = 1; ; page += 1) {
    const result = await querySearchAnalytics(options, { ...request, startRow });
    yield result;

    if (!result.mayHaveMore) return;

    if (page >= maxPages) {
      throw new SearchConsoleClientError(
        `search_console: ${options.siteUrl} filled ${maxPages} pages of ${result.rowLimit} rows ` +
          "and Search Console publishes no row total to check that against. Refusing rather than " +
          "returning a report that may be short: raise the cap deliberately, or narrow the window.",
        "page_cap",
      );
    }

    startRow += result.rows;
  }
}
