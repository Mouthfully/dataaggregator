/**
 * WooCommerce -> backfill.
 *
 * The third file of the connector unit (specification 13.3), and the one that joins the other two:
 * `client.ts` fetches pages, `normalize.ts` turns a page into envelope rows, and this decides WHICH
 * windows to ask for and, uniquely among the connectors so far, WHERE THE NEXT RUN RESUMES FROM.
 *
 * IT IS NOT `ga4/backfill.ts` WITH THE NAMES CHANGED. Four of that file's decisions invert here,
 * and all four invert for one underlying reason: GA4 restates on a published 12-day clock, so its
 * pull is a LADDER over independent calendar days, while `RESTATEMENT_CLOCKS.woocommerce` is null
 * because NO WINDOW EVER CLOSES -- the store is the merchant's own database and an order can be
 * refunded a year later. So this pull is a WATERMARK WALK over `modified_after`, and a watermark is
 * a different object from a plan.
 *
 * ONE: NOT THROUGH `planBackfill`. The tiered planner emits a D-0/D-1/D-3/D-7/D-28 ladder derived
 * from a restatement window. WooCommerce has none, so the planner emits nothing useful, and a
 * ladder would be the wrong shape anyway: it re-reads whole calendar days on a schedule, where
 * `modified_after` re-reads exactly the orders that moved. `wc_create_refund` bumps the parent
 * order's `date_modified` unconditionally, which is what makes the cheaper mechanism also the
 * complete one.
 *
 * TWO: OLDEST FIRST, WHERE GA4 IS NEWEST FIRST -- and the reversal is forced, not stylistic. GA4's
 * windows are independent, so a run cut short by the quota floor has still banked the days most
 * likely to have changed, and reporting them newest-first is strictly better. What THIS run
 * produces is a watermark, and a watermark is a LOW-water mark: it can only advance through a
 * contiguous prefix. Reading newest-first would finish the newest chunk and still leave the
 * watermark exactly where it started, because the gap behind it is what the watermark means.
 *
 * THREE: ONE BATCH PER PAGE, WHERE GA4 YIELDS ONE PER WINDOW. GA4 accumulates a window's rows and
 * hands them over together; doing that here would accumulate what `fetchOrdersWindow` may legally
 * produce for ONE window -- `WOO_MAX_WINDOWS` sub-windows of up to `WOO_FLOOR_MAX_PAGES` pages,
 * which is 128,000 orders. `client.ts` capped `per_page` at 100 precisely so one page is a size a
 * 128 MB isolate can hold and a redactor can walk; buffering a window here would spend that cap on
 * nothing.
 *
 * FOUR: THE CHECKPOINT IS NOT A YIELDED FIELD. Advancing a watermark past a span that was not read
 * in full opens a permanent hole in the customer's numbers -- the orders in the gap are never
 * looked at again, because nothing will ever ask for that window a second time. So the two
 * questions a caller can ask are answered by two different mechanisms, and neither can answer the
 * other by accident:
 *
 *   * `onChunk` fires after a chunk has been read IN FULL. It is the only place a watermark may
 *     advance, and it fires as the run proceeds so a run that dies half way has still banked what
 *     it finished.
 *   * the generator's RETURN value says the whole span is done. A run that throws never produces
 *     one, and `for await ... of` discards it -- so it cannot be mistaken for a per-batch field.
 */

import type { EnvelopeRow } from "@repo/contract";

import {
  type WooFetchOptions,
  type WooWalkOptions,
  type WooWindow,
  fetchOrdersWindow,
} from "./client.js";
import { type WooOrder, assertWooTimezone, normalizeWooOrders } from "./normalize.js";

/**
 * How much MODIFIED time one chunk covers, and therefore how often the watermark can advance.
 *
 * DERIVED FROM THE BISECTOR'S OWN BUDGET, not picked. A chunk that no amount of splitting can read
 * ends the run at `window_budget_exhausted`, so the useful ceiling is the widest span the busiest
 * launch-target store can fill while still resolving inside `WOO_MAX_WINDOWS`. `32` §3 puts that
 * store at ~500 changed orders a night: 31 days is ~15,500 orders, which at `per_page=100` is ~155
 * pages, which `WOO_MAX_PAGES_PER_WINDOW` splits to eight leaves of ~1,940 -- a balanced tree of 15
 * windows against a budget of 64.
 *
 * AND THE FLOOR IS THE OTHER HALF OF THE SAME CHOICE. A chunk costs at least one request even when
 * the store has nothing in it, so a narrow chunk taxes a long first backfill: two years is 24
 * requests at 31 days and 105 at 7. The nightly case is unaffected either way -- one chunk, one
 * request, because a day is shorter than a chunk.
 */
export const WOO_BACKFILL_CHUNK_DAYS = 31;

const DAY_MS = 86_400_000;

/**
 * How this unit refuses.
 *
 * Separate from `WooClientError` for the reason `WooNormalizeError` is separate from both: the
 * three refuse about different things, and a caller mapping them to what a merchant should DO needs
 * to tell a bad window from a bad credential from a bad order. ONE member, because a bad timezone
 * is `WooNormalizeError`'s -- the normaliser is what uses the zone, so it is what defines a real
 * one, and a second definition here would be a second opinion.
 */
export type WooBackfillErrorCode = "invalid_window";

export class WooBackfillError extends Error {
  constructor(
    message: string,
    readonly code: WooBackfillErrorCode,
  ) {
    super(message);
    this.name = "WooBackfillError";
  }
}

export interface WooBackfillOptions {
  /** The store, the credential and the retry policy. `storeUrl` is also the row's `account_id`. */
  readonly client: WooFetchOptions;
  /**
   * The span to read, in MODIFIED time.
   *
   * `modifiedAfter` is the watermark the last run banked (or the start of history on a first
   * backfill); `modifiedBefore` is pinned to this run's start by the caller, per `client.ts`
   * decision 3 -- a boundary of "now", re-evaluated per request, would make the window slide under
   * the read.
   */
  readonly window: WooWindow;
  /**
   * The IANA zone the store reports in. REQUIRED, and not merely a label: `dimensions.date` is
   * COMPUTED in it, so a guess moves orders onto the wrong calendar day rather than mislabelling
   * the right one. It comes from `public.connections.timezone`, whose null means nobody has told
   * us -- which this refuses to run against rather than assuming UTC.
   */
  readonly timezone: string;
  /** RFC3339. One value for the whole run, so every row from it agrees on when it was pulled. */
  readonly fetchedAt: string;
  /** Defaults to `WOO_BACKFILL_CHUNK_DAYS`. */
  readonly chunkDays?: number;
  /** Passed through to the bisector, so a caller can meter how hard a store is to read. */
  readonly walk?: WooWalkOptions;
  /**
   * Fires after a chunk has been read in full. THE ONLY PLACE A WATERMARK MAY ADVANCE.
   *
   * IT MAY BE ASYNC, AND IT IS AWAITED. A caller that banks the watermark durably will want to
   * write it, and a `=> void` signature accepts an `async` function happily -- so the promise would
   * be dropped, the next chunk would start while the write was still in flight, two writes could
   * land out of order, and a REJECTED write would surface as an unhandled rejection while the run
   * reported success. Every one of those ends the same way: a watermark ahead of what was stored,
   * which is the one failure this callback exists to prevent.
   */
  readonly onChunk?: (checkpoint: WooCheckpoint) => void | Promise<void>;
}

/** One page of one chunk, normalised. */
export interface WooBackfillBatch {
  /** The chunk this page belongs to, as this module cut it. */
  readonly chunk: WooWindow;
  /** The window the request actually carried -- the chunk, or a sub-window the bisector split. */
  readonly window: WooWindow;
  readonly page: number;
  readonly totalPages: number;
  readonly rows: readonly EnvelopeRow[];
}

/** How far a run got, and therefore where the next one starts. */
export interface WooCheckpoint {
  /**
   * The `modifiedAfter` the NEXT run must use.
   *
   * It is the completed chunk's `modifiedBefore` EXACTLY, with no second added, so consecutive runs
   * share their boundary instant. `client.ts` records that WooCommerce's `modified_after` and
   * `modified_before` bounds are probably inclusive at both ends and that this has not been
   * verified against a live store. Sharing the instant reads one order twice under the inclusive
   * reading -- which the upsert collapses, since a re-read order has the same key -- and reads
   * every order exactly once under the exclusive one. Adding a second would be the other way round:
   * exact if inclusive, and a PERMANENT HOLE if not.
   */
  readonly modifiedAfter: string;
  /** Chunks read in full so far, this run. */
  readonly chunks: number;
  /** Envelope rows emitted so far, this run. Orders, not pages -- one row per order. */
  readonly rows: number;
}

/**
 * Cut the span into chunks, oldest first.
 *
 * Exported for the tests, which assert the cut rather than inferring it from request URLs: a run
 * against a fake store proves the requests agree with the chunks, not that the chunks are right.
 */
export function wooBackfillChunks(
  window: WooWindow,
  chunkDays: number = WOO_BACKFILL_CHUNK_DAYS,
): WooWindow[] {
  const after = instant(window.modifiedAfter, "modifiedAfter");
  const before = instant(window.modifiedBefore, "modifiedBefore");

  if (before <= after) {
    throw new WooBackfillError(
      `woocommerce: the span ${window.modifiedAfter}..${window.modifiedBefore} ends at or before ` +
        "it starts. A caller that passed the same watermark twice would otherwise spend the " +
        "merchant's request on a window that can contain nothing, and be told it succeeded.",
      "invalid_window",
    );
  }
  if (!Number.isFinite(chunkDays) || chunkDays <= 0) {
    throw new WooBackfillError(
      `woocommerce: chunkDays is ${JSON.stringify(chunkDays)}. A non-positive chunk never reaches ` +
        "the end of the span, so the run would not terminate.",
      "invalid_window",
    );
  }

  const step = Math.max(1000, Math.round(chunkDays * DAY_MS));
  const out: WooWindow[] = [];
  for (let start = after; start < before; start += step) {
    out.push({
      modifiedAfter: new Date(start).toISOString(),
      // Adjacent chunks SHARE this instant. See `WooCheckpoint.modifiedAfter`: an overlap is
      // collapsed by the upsert, a gap is not recoverable by anything.
      modifiedBefore: new Date(Math.min(start + step, before)).toISOString(),
    });
  }
  return out;
}

/**
 * RFC3339, checked. `Date.parse` alone is not that check and three of its answers are dangerous.
 *
 * IT IS FAR MORE PERMISSIVE THAN THE NAME OF THIS FIELD PROMISES, and each extra thing it accepts
 * turns a typo into a silently different window rather than into a refusal:
 *
 *   `"2026-02-30T00:00:00Z"`  -> **2026-03-02**. Normalised, not rejected. A watermark set to a day
 *                               that does not exist silently skips two days of orders, and the
 *                               checkpoint then advances past them -- so nothing ever reads them.
 *   `"2026-09-11T00:00:00"`   -> parsed as LOCAL time. This repository has a documented history with
 *                               exactly that reading: `wooGmtToDate` appends a `Z` for the same
 *                               reason, and `vitest.config.ts` pins the suite to Asia/Bangkok
 *                               because in UTC the wrong answer and the right one are one string.
 *   `"September 11, 2026"`    -> accepted. Not a format any caller should be able to reach here.
 *
 * So the SHAPE is matched first, and then the CALENDAR is checked by rebuilding the instant from
 * its own components: `Date.UTC(2026, 1, 30)` rolls forward, so a date that does not survive the
 * round trip did not exist. The offset is applied by `Date.parse` afterwards, which is sound once
 * the components are known to be real.
 *
 * Exported because `apps/api-edge` validates the same two fields at its HTTP boundary, and two
 * implementations of "is this an instant" is how they come to disagree.
 */
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

export function parseRfc3339(value: string, field: string): number {
  const m = RFC3339.exec(value);
  if (m === null) {
    throw new WooBackfillError(
      `woocommerce: ${field} is ${JSON.stringify(value)}, which is not an RFC3339 instant. It ` +
        "needs a date, a time and a designator -- 2026-09-11T00:00:00Z. A value without one is " +
        "read as local time, which moves the window by the runtime's offset.",
      "invalid_window",
    );
  }

  const [, y, mo, d] = m as unknown as [string, string, string, string];
  // THE CALENDAR CHECK. `Date.UTC(2026, 1, 30)` is March 2 and reports no error, so the only way to
  // learn that a date did not exist is to build it and see whether it came back the same.
  const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    probe.getUTCFullYear() !== Number(y) ||
    probe.getUTCMonth() !== Number(mo) - 1 ||
    probe.getUTCDate() !== Number(d)
  ) {
    throw new WooBackfillError(
      `woocommerce: ${field} is ${JSON.stringify(value)}, which is not a date that exists. ` +
        "Rolling it forward would query a window nobody asked for and then advance the watermark " +
        "past the days it skipped.",
      "invalid_window",
    );
  }

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    // The shape is right and the calendar is right, so this is an out-of-range time component --
    // `25:00:00`, which the regex cannot exclude without becoming unreadable.
    throw new WooBackfillError(
      `woocommerce: ${field} is ${JSON.stringify(value)}, which carries a time that does not exist.`,
      "invalid_window",
    );
  }
  return ms;
}

function instant(rfc3339: string, field: string): number {
  return parseRfc3339(rfc3339, field);
}

/**
 * Read a span of modified time, yielding one batch per page.
 *
 * THE ORDERS ARE CAST AND NOT VALIDATED HERE, deliberately. `WooPage.orders` is `unknown[]` because
 * the client does not model the payload, and `normalizeWooOrders` is the thing that does: it
 * REFUSES an order with no id and one with no currency rather than skipping it. Validating a second
 * time here would put the same refusal in two places and let them disagree.
 */
export async function* runWooBackfill(
  options: WooBackfillOptions,
): AsyncGenerator<WooBackfillBatch, WooCheckpoint, undefined> {
  // BEFORE THE FIRST REQUEST, AND THAT IS THE WHOLE REASON IT IS CALLED HERE. The normaliser would
  // refuse the same value one page later, by which point the merchant's store has already done the
  // work and the message names an order instead of the connection.
  assertWooTimezone(options.timezone);

  const plan = wooBackfillChunks(options.window, options.chunkDays);
  // Every chunk is at least one request, so a checkpoint at the START of the span is the honest
  // answer before any of them has come back: nothing has been read, so nothing may be skipped.
  let checkpoint: WooCheckpoint = {
    modifiedAfter: options.window.modifiedAfter,
    chunks: 0,
    rows: 0,
  };

  for (const chunk of plan) {
    let rowsThisChunk = 0;

    for await (const page of fetchOrdersWindow(options.client, chunk, options.walk ?? {})) {
      const rows = normalizeWooOrders({
        orders: page.orders as readonly WooOrder[],
        // The origin the request was actually sent to, so `account_id` cannot disagree with what
        // was read. `WooFetchOptions.storeUrl` is already through `normaliseStoreUrl`.
        storeUrl: options.client.storeUrl,
        timezone: options.timezone,
        fetchedAt: options.fetchedAt,
        // Correct for a row seen for the first time and wrong for a re-pull -- and a connector
        // cannot know which, because it has no store. THE UPSERT PRESERVES THE EXISTING VALUE on
        // conflict, along with `restates_until` derived from it. Same decision, and the same
        // reason, as `ga4/backfill.ts`.
        firstSeenAt: options.fetchedAt,
      });
      rowsThisChunk += rows.length;
      yield { chunk, window: page.window, page: page.page, totalPages: page.totalPages, rows };
    }

    // REACHED ONLY BY A CHUNK THE WALKER FINISHED. A refusal anywhere inside it -- a budget
    // exhausted, a store that stopped answering -- propagates out of the `for await` and past this
    // line, so the watermark stays where the last COMPLETE chunk left it.
    checkpoint = {
      modifiedAfter: chunk.modifiedBefore,
      chunks: checkpoint.chunks + 1,
      rows: checkpoint.rows + rowsThisChunk,
    };
    // AWAITED, so the next chunk does not begin until the caller has finished banking this one.
    await options.onChunk?.(checkpoint);
  }

  return checkpoint;
}
