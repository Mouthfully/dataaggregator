/**
 * Search Console -> backfill.
 *
 * The third file of the connector unit (specification section 13.3), and the one that joins the
 * other two: `client.ts` fetches pages, `normalize.ts` turns a page into envelope rows, and this
 * decides WHICH windows to ask for, WHICH REPORTS to ask for, and in WHAT ORDER.
 *
 * IT IS NOT `meta_ads/backfill.ts` WITH THE NAMES CHANGED. Four of that file's decisions invert
 * here, and the first one forces the rest.
 *
 * ONE: NOT THROUGH `planBackfill`, AND THE REASON IS A VALUE THAT WAS READ RATHER THAN ASSUMED.
 * `RESTATEMENT_CLOCKS.search_console.windowDays` is NULL -- "the specification publishes no
 * restatement window for Search Console... Measure it before setting a value." Fed a null the
 * planner falls back to `windowDays ?? 0`, so on every run after the first it skips the weekly tier
 * entirely and emits the D-0 to D-3 daily ladder and nothing else. Those four days are precisely
 * the ones this connector cannot read: `client.ts` sends `dataState: "final"` and records the cost
 * -- "recent days return FEWER ROWS OR NONE AT ALL under `final`, because Google has not finalised
 * them yet". So the ladder would spend every request of every run on the days the platform has
 * nothing final for, and never return to a day once it was finalised. That is not a ladder worth
 * climbing, so this unit reads THE SPAN IT IS GIVEN.
 *
 * TWO: AND IT WILL NOT INVENT THE LOOKBACK EITHER. The obvious next move is to default the span to
 * "the last N days". There is no N. How long a Search Console figure keeps moving is unmeasured --
 * that is what the null clock says -- and the finalisation lag at the newest end is unmeasured too.
 * A number here would be indistinguishable from a sourced one, and it would silently decide how
 * much of the customer's history is re-read. The caller supplies the span; this file supplies the
 * sequencing, the refusals and the checkpoint.
 *
 * THREE: THE PAIR OF REPORTS IS NOT OPTIONAL, AND THE TOTAL GOES FIRST. Google's anonymity
 * threshold withholds low-volume queries, so a query-grain response is A SUBSET whose sum is
 * quietly lower than the truth -- well-formed data with nothing on it marking the gap.
 * `totalsByDate` already refuses to add such rows up; that refusal only helps if the property's own
 * total was actually pulled, so a run that asks for a thresholded grain and no date-only report is
 * refused here before it costs a request. Within a chunk the unthresholded report is issued FIRST:
 * a run that dies half way then leaves a total with incomplete query rows beneath it, which reads
 * as a wider anonymity gap, rather than query rows with no total at all -- which reads as a total.
 * One of those errs visibly and the other is the failure this product sells against.
 *
 * FOUR: NOTHING HERE TAKES A TIMEZONE, AND THAT IS DELIBERATE. Every other driver in this package
 * has to source one: GA4 reads `metadata.timeZone` off its own report, WooCommerce requires the
 * store's zone as an option and refuses without it, Meta Ads reads `timezone_name` from the ad
 * account node before its first insights request. Search Console publishes none, ever, and
 * `SEARCH_CONSOLE_TIMEZONE` is a documented constant in `normalize.ts` for that reason. Accepting
 * an override here would create a second source for one fact, and two sources for one fact is how
 * they come to disagree.
 *
 * AND `first_seen_at` IS NOT THIS UNIT'S TO GUARANTEE, the same as every other driver here: a
 * connector has no store, so every row is emitted with `first_seen_at = fetched_at` and THE UPSERT
 * MUST PRESERVE THE EXISTING VALUE on conflict. It matters more for this source than for the
 * others, because `restates_until` is null and `is_provisional` never clears -- `first_seen_at` is
 * the only thing on the row that says when it was first seen at all.
 */

import type { EnvelopeRow } from "@repo/contract";

import {
  SEARCH_CONSOLE_MAX_PAGES,
  SEARCH_CONSOLE_REPORTS,
  type SearchConsoleClientOptions,
  querySearchAnalyticsPages,
} from "./client.ts";
import {
  SEARCH_CONSOLE_ANONYMITY_THRESHOLDED,
  type SearchConsoleGrain,
  grainFor,
  normalizeSearchAnalytics,
  parseSearchConsoleDate,
} from "./normalize.ts";

/** The reports `client.ts` publishes, by name. */
export type SearchConsoleReportName = keyof typeof SEARCH_CONSOLE_REPORTS;

/**
 * The pair, and it is a pair rather than a default that happens to have two entries.
 *
 * `byQuery` is the diagnostic value and `totals` is the only thing that says how much of the
 * property it accounts for. `byPage` is deliberately absent: it answers a different question,
 * doubles the request count again, and `SEARCH_CONSOLE_ANONYMITY_THRESHOLDED` marks it thresholded
 * on a guess made in the safe direction -- so switching it on is a caller's decision to take, with
 * the total still required alongside it.
 */
export const SEARCH_CONSOLE_DEFAULT_REPORTS: readonly SearchConsoleReportName[] = [
  "totals",
  "byQuery",
];

/**
 * How many calendar days one request covers.
 *
 * ONE, AND THE NUMBER IS AN ADMISSION RATHER THAN A TUNING. Sizing a wider chunk means predicting
 * how many distinct queries a property returns per day, and nothing in this repository has measured
 * that for any customer. The consequence of guessing high is not a slow run: Search Console
 * publishes NO ROW TOTAL and no cursor, so `SEARCH_CONSOLE_MAX_PAGES` is the only stop condition
 * there is, and a chunk that overflows it REFUSES -- correctly, because a report that stopped short
 * would otherwise be reported as whole. A one-day chunk assumes nothing about cardinality and makes
 * that ceiling a per-day one.
 *
 * WHAT MAKES IT AFFORDABLE IS A DOCUMENTED FIGURE, not an estimate: the published ceiling is 1,200
 * queries per minute per site (specification section 3.2). A ninety-day initial backfill of the
 * default pair is 180 requests, issued strictly sequentially. The undocumented load quotas the same
 * section warns about cannot be planned against by anyone, which is the other half of the reason to
 * spend as few requests as the work allows rather than as many as a limit permits.
 *
 * `chunkDays` is an option so a caller who has MEASURED a property's cardinality can widen it.
 */
export const SEARCH_CONSOLE_BACKFILL_CHUNK_DAYS = 1;

const DAY_MS = 86_400_000;

/** Inclusive at both ends, YYYY-MM-DD, in the platform's Pacific reporting day. */
export interface SearchConsoleSpan {
  readonly from: string;
  readonly to: string;
}

/**
 * How this unit refuses.
 *
 * Separate from `SearchConsoleClientError` and `SearchConsoleNormalizeError` for the reason
 * WooCommerce's is: the three refuse about different things, and a caller deciding what to tell an
 * owner needs to tell a bad span from a bad credential from a bad row. Date VALIDITY is not in this
 * list -- `parseSearchConsoleDate` owns what a real date is, and a second definition here would be
 * a second opinion.
 */
export type SearchConsoleBackfillErrorCode = "invalid_span" | "unpaired_grain" | "unknown_report";

export class SearchConsoleBackfillError extends Error {
  constructor(
    message: string,
    readonly code: SearchConsoleBackfillErrorCode,
  ) {
    super(message);
    this.name = "SearchConsoleBackfillError";
  }
}

export interface SearchConsoleBackfillOptions {
  readonly client: SearchConsoleClientOptions;
  /** The span of REPORT dates to read, inclusive at both ends. Supplied by the caller; see above. */
  readonly span: SearchConsoleSpan;
  /** RFC3339. One value for the whole run, so every row from it agrees on when it was pulled. */
  readonly fetchedAt: string;
  /** Defaults to the pair. A thresholded grain without a date-only report is refused. */
  readonly reports?: readonly SearchConsoleReportName[];
  /** Defaults to `SEARCH_CONSOLE_BACKFILL_CHUNK_DAYS`. */
  readonly chunkDays?: number;
  /** Rows per page. Defaults to the client's page size. */
  readonly rowLimit?: number;
  /** Pages one report may take before the client refuses. Defaults to `SEARCH_CONSOLE_MAX_PAGES`. */
  readonly maxPages?: number;
  /**
   * Fires after every report of a chunk has been read IN FULL.
   *
   * IT MAY BE ASYNC, AND IT IS AWAITED, for the reason `woocommerce/backfill.ts` gives: a `=> void`
   * signature accepts an `async` function happily, drops the promise, and lets the next chunk start
   * while the write is still in flight -- so a rejected write surfaces as an unhandled rejection
   * while the run reports success.
   */
  readonly onChunk?: (checkpoint: SearchConsoleCheckpoint) => void | Promise<void>;
}

/** One page of one report of one chunk, normalised. */
export interface SearchConsoleBackfillBatch {
  readonly chunk: SearchConsoleSpan;
  readonly report: SearchConsoleReportName;
  readonly grain: SearchConsoleGrain;
  /** 1-based, within this report of this chunk. */
  readonly page: number;
  readonly rows: readonly EnvelopeRow[];
  /**
   * Whether Google's anonymity threshold has removed rows from this response. When true, these
   * rows DO NOT SUM TO THE PROPERTY'S TOTAL and must never be presented as if they did. Carried on
   * every batch rather than inferred from the report name, because it is the normaliser's answer
   * about the grain and not this file's opinion about the request.
   */
  readonly anonymityThresholded: boolean;
  /** `responseAggregationType` verbatim, or null when the platform did not say. */
  readonly responseAggregationType: string | null;
}

/** How far a run got. */
export interface SearchConsoleCheckpoint {
  /**
   * The newest date every requested report has been READ for, or null before the first chunk
   * completes.
   *
   * IT SAYS READ, AND IT DOES NOT SAY FINAL. `restates_until` is null for this source because
   * nobody has measured how long a Search Console figure keeps moving, so a date behind this
   * watermark may still change and a caller that treats it as done has decided an open question by
   * accident. What the checkpoint is for is RESUMING: a long initial backfill that dies half way
   * should not start again at the beginning.
   */
  readonly readThrough: string | null;
  /** Chunks read in full so far, this run. */
  readonly chunks: number;
  /** Envelope rows emitted so far, this run, across every report. */
  readonly rows: number;
}

/**
 * Cut the span into chunks, oldest first.
 *
 * OLDEST FIRST, WHERE META IS NEWEST FIRST, and the reversal follows from the checkpoint rather
 * than from taste. Meta's windows are independent and its newest days move most, so a plan cut
 * short by the throttle has banked the most valuable ones. What THIS run produces is a
 * `readThrough`, and that is a LOW-water mark: it can only advance through a contiguous prefix, so
 * reading newest-first would finish the newest chunk and leave the mark exactly where it started.
 * The newest days are also the ones `dataState: "final"` has least for.
 *
 * CHUNKS DO NOT OVERLAP, which is the other way round from `wooBackfillChunks`. WooCommerce shares
 * the boundary INSTANT between chunks because its bounds are timestamps whose inclusivity is
 * unverified, and an overlap costs a duplicate the upsert collapses while a gap is unrecoverable.
 * Here the bounds are calendar days that `client.ts` types as inclusive at both ends, so a shared
 * day is not insurance -- it is one extra request per chunk, and at query grain a whole day of rows
 * handed to the caller twice.
 *
 * Exported for the tests, which assert the cut rather than inferring it from request bodies.
 */
export function searchConsoleBackfillChunks(
  span: SearchConsoleSpan,
  chunkDays: number = SEARCH_CONSOLE_BACKFILL_CHUNK_DAYS,
): SearchConsoleSpan[] {
  // The normaliser's own date check, which is the one that catches 30 February -- `Date.parse`
  // rolls that over into March and returns a perfectly good timestamp.
  parseSearchConsoleDate(span.from);
  parseSearchConsoleDate(span.to);

  if (span.from > span.to) {
    throw new SearchConsoleBackfillError(
      `search_console: the span ${span.from}..${span.to} ends before it starts. A caller that ` +
        "swapped the two would otherwise be told a run covering nothing had succeeded.",
      "invalid_span",
    );
  }
  if (!Number.isInteger(chunkDays) || chunkDays < 1) {
    throw new SearchConsoleBackfillError(
      `search_console: chunkDays is ${JSON.stringify(chunkDays)}. A chunk shorter than a day ` +
        "never reaches the end of the span, so the run would not terminate.",
      "invalid_span",
    );
  }

  // EVERY STEP IS UTC ARITHMETIC, and that is the whole reason this is a helper rather than three
  // lines inline. A `new Date(y, m, d)` here would build the day in the RUNTIME's zone, and in any
  // positive-offset zone `toISOString().slice(0, 10)` then hands back the PREVIOUS day -- a whole
  // backfill shifted by one, with every window still a perfectly plausible date. The suite runs in
  // Asia/Bangkok precisely so that mutation fails a test instead of shipping.
  const start = Date.parse(`${span.from}T00:00:00Z`);
  const end = Date.parse(`${span.to}T00:00:00Z`);
  const step = chunkDays * DAY_MS;

  const chunks: SearchConsoleSpan[] = [];
  for (let cursor = start; cursor <= end; cursor += step) {
    const last = Math.min(cursor + (chunkDays - 1) * DAY_MS, end);
    chunks.push({ from: isoDate(cursor), to: isoDate(last) });
  }
  return chunks;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Validate the requested reports and order them so the unthresholded ones run first.
 *
 * Exported for the tests, which assert the ordering directly: inferring it from a recorded run
 * proves the requests agree with the order, not that the order is right.
 */
export function orderSearchConsoleReports(
  names: readonly SearchConsoleReportName[],
): readonly SearchConsoleReportName[] {
  if (names.length === 0) {
    throw new SearchConsoleBackfillError(
      "search_console: a run with no reports reads nothing and reports success.",
      "unknown_report",
    );
  }

  const thresholded: SearchConsoleReportName[] = [];
  const totals: SearchConsoleReportName[] = [];

  for (const name of names) {
    // `Object.hasOwn` rather than a truthiness check, and checked at all because the barrel puts
    // this function in front of callers the type system does not reach.
    if (!Object.hasOwn(SEARCH_CONSOLE_REPORTS, name)) {
      throw new SearchConsoleBackfillError(
        `search_console: ${JSON.stringify(name)} is not one of the report shapes client.ts ` +
          `publishes (${Object.keys(SEARCH_CONSOLE_REPORTS).join(", ")}).`,
        "unknown_report",
      );
    }
    const dimensions = SEARCH_CONSOLE_REPORTS[name];
    // The normaliser decides which grain a dimension list is and whether Google withholds rows from
    // it. Reading both from there is what keeps this ordering true if a fourth report is added.
    if (SEARCH_CONSOLE_ANONYMITY_THRESHOLDED[grainFor(dimensions)]) thresholded.push(name);
    else totals.push(name);
  }

  if (totals.length === 0) {
    throw new SearchConsoleBackfillError(
      `search_console: ${JSON.stringify(names)} asks only for grains Google withholds rows from. ` +
        "Their sum is lower than the property's own number by an amount nobody can compute, and " +
        "stored alone they look exactly like a total. Pull the date-only report alongside them: " +
        "the difference between the two IS the anonymity gap, and it is the reason the second " +
        "request is worth making.",
      "unpaired_grain",
    );
  }

  return [...totals, ...thresholded];
}

/**
 * Read a span of report dates, yielding one batch per page.
 *
 * ONE BATCH PER PAGE, for the reason `client.ts` returns a generator: a Worker isolate has 128 MB
 * and a Workflow step output is capped at 1 MiB, and query cardinality is the one term in this
 * connector's cost that the customer controls rather than we do.
 *
 * AN EMPTY BATCH IS NOT AN ERROR. Search Console omits `rows` entirely on a quiet day, and under
 * `dataState: "final"` it does the same for days it has not finalised -- which is the platform
 * saying "not yet", a true statement and a better one than a number that will be different
 * tomorrow.
 */
export async function* runSearchConsoleBackfill(
  options: SearchConsoleBackfillOptions,
): AsyncGenerator<SearchConsoleBackfillBatch, SearchConsoleCheckpoint, undefined> {
  // BOTH REFUSALS BEFORE THE FIRST REQUEST. A per-site ceiling is shared with the customer's own
  // tools, so a run that was always going to be refused should not spend any of it.
  const reports = orderSearchConsoleReports(options.reports ?? SEARCH_CONSOLE_DEFAULT_REPORTS);
  const chunks = searchConsoleBackfillChunks(options.span, options.chunkDays);

  let checkpoint: SearchConsoleCheckpoint = { readThrough: null, chunks: 0, rows: 0 };

  for (const chunk of chunks) {
    let rowsThisChunk = 0;

    for (const report of reports) {
      let page = 0;

      for await (const result of querySearchAnalyticsPages(
        options.client,
        {
          dimensions: SEARCH_CONSOLE_REPORTS[report],
          // Both ends inclusive, which is what the chunk means and what the client's fields say.
          startDate: chunk.from,
          endDate: chunk.to,
          ...(options.rowLimit === undefined ? {} : { rowLimit: options.rowLimit }),
        },
        options.maxPages ?? SEARCH_CONSOLE_MAX_PAGES,
      )) {
        page += 1;
        const normalised = normalizeSearchAnalytics({
          response: result.response,
          // THE PAGE'S OWN LIST, NOT THE ONE ABOVE. The response echoes no dimension names, so
          // this is the only thing that says what `keys[0]` means, and `client.ts` returns what it
          // SENT for exactly this handover. Passing the local list instead would work until the
          // day the two differ, and on that day a page URL is stored as a search query.
          dimensions: result.dimensions,
          // The property the request was addressed to, so `account_id` cannot disagree with what
          // was read.
          siteUrl: options.client.siteUrl,
          fetchedAt: options.fetchedAt,
          // Correct for a row seen for the first time and wrong for a re-pull -- and a connector
          // cannot know which, because it has no store. See the module note.
          firstSeenAt: options.fetchedAt,
        });

        rowsThisChunk += normalised.rows.length;
        yield {
          chunk,
          report,
          grain: normalised.grain,
          page,
          rows: normalised.rows,
          anonymityThresholded: normalised.anonymityThresholded,
          responseAggregationType: normalised.responseAggregationType,
        };
      }
    }

    // REACHED ONLY BY A CHUNK WHOSE EVERY REPORT FINISHED. A refusal anywhere inside -- the page
    // cap, a dead grant -- propagates past this line, so the mark stays where the last COMPLETE
    // chunk left it. Advancing it over a chunk that was only half read would resume the next run
    // past days whose query rows were never pulled, and nothing would ever ask for them again.
    checkpoint = {
      readThrough: chunk.to,
      chunks: checkpoint.chunks + 1,
      rows: checkpoint.rows + rowsThisChunk,
    };
    // AWAITED, so the next chunk does not begin until the caller has finished banking this one.
    await options.onChunk?.(checkpoint);
  }

  return checkpoint;
}
