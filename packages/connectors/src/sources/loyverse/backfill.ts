/**
 * Loyverse POS -> backfill.
 *
 * The third file of the connector unit (specification 13.3), and the one that joins the other two:
 * `client.ts` walks a cursor, `normalize.ts` turns a page into envelope rows, and this decides WHICH
 * windows to ask for and WHERE THE NEXT RUN RESUMES FROM.
 *
 * ================================================================================================
 * IT IS `woocommerce/backfill.ts`'s SHAPE, AND THAT IS A CONCLUSION RATHER THAN A COPY.
 * ================================================================================================
 *
 * Both are WATERMARK WALKS rather than restatement LADDERS, and both are that way for the same
 * underlying reason, stated in `RESTATEMENT_CLOCKS`: `windowDays` is null because NO WINDOW EVER
 * CLOSES. The account is the merchant's own till, a receipt carries `updated_at` and `cancelled_at`,
 * and a refund arrives as a second receipt -- so there is no D+1/D+3/D+7/D+28 ladder to climb,
 * because there is no clock for a ladder to follow. `ga4/backfill.ts` plans independent calendar
 * days against a published 12-day window; that machinery would emit nothing useful here.
 *
 * FOUR THINGS DIFFER FROM WOOCOMMERCE, AND EACH IS FORCED BY THE PLATFORM:
 *
 * ONE: THE MERCHANT PROFILE IS FETCHED FIRST, AND NO WOO ANALOGUE EXISTS. A WooCommerce order
 * carries its own `currency`; a Loyverse receipt CARRIES NONE. `GET /merchant/` is the only place
 * the ISO 4217 code appears in the entire API, so one request is spent before any receipt is read
 * -- and if it fails, nothing is read at all. That ordering is deliberate: discovering the currency
 * is unreadable AFTER walking forty pages means forty pages of the merchant's rate budget spent to
 * produce nothing.
 *
 * TWO: THERE IS NO BISECTION, BECAUSE THERE IS NOTHING TO BISECT ON. WooCommerce answers with
 * `X-WP-TotalPages`, so its client can split a window it knows is too big. A cursor carries no
 * total: Loyverse says only "there is more". So an oversized window is caught by
 * `LOYVERSE_MAX_PAGES` at the far end rather than split at the near end, and the chunk size below
 * is the only lever that keeps a window from getting there.
 *
 * THREE: ONE BATCH PER PAGE, for WooCommerce's reason exactly. Accumulating a chunk would buffer up
 * to `LOYVERSE_MAX_PAGES` * `LOYVERSE_PAGE_LIMIT` receipts -- 100,000 -- in a 128 MB isolate, to
 * hand back one array.
 *
 * FOUR: OLDEST FIRST, and the reversal from GA4 is forced rather than stylistic. What this run
 * produces is a WATERMARK, and a watermark is a LOW-water mark: it advances only through a
 * contiguous prefix. Reading newest-first would finish the newest chunk and leave the watermark
 * exactly where it started, because the gap behind it is what the watermark means.
 *
 * AND THE CHECKPOINT IS NOT A YIELDED FIELD, which is the rule the whole file is arranged around.
 * Advancing a watermark past a span that was not read IN FULL opens a permanent hole: nothing ever
 * asks for that window again, so the receipts in the gap are never looked at. So the two questions
 * a caller can ask are answered by two mechanisms that cannot answer each other by accident:
 *
 *   * `onChunk` fires after a chunk has been read in full. It is THE ONLY PLACE a watermark may
 *     advance, and it fires as the run proceeds, so a run that dies half way has banked what it
 *     finished.
 *   * the generator's RETURN value says the whole span is done. A run that throws never produces
 *     one, and `for await ... of` discards it -- so it cannot be mistaken for a per-batch field.
 */

import type { EnvelopeRow } from "@repo/contract";

import {
  type LoyverseFetchOptions,
  type LoyverseMerchant,
  type LoyverseRateBudget,
  type LoyverseWalkOptions,
  type LoyverseWindow,
  fetchMerchant,
  fetchReceiptsPages,
} from "./client.ts";
import {
  type LoyverseReceipt,
  assertLoyverseTimezone,
  normalizeLoyverseReceipts,
} from "./normalize.ts";

/**
 * How much UPDATED time one chunk covers, and therefore how often the watermark can advance.
 *
 * SEVEN DAYS, WHERE WOOCOMMERCE USES THIRTY-ONE, AND THE DIFFERENCE IS THE MISSING BISECTOR. A Woo
 * chunk that turns out too large is SPLIT -- its client knows the page count and can subdivide --
 * so a generous chunk costs nothing but a wasted guess. Here an oversized chunk has no recovery: it
 * walks until `LOYVERSE_MAX_PAGES` and then throws, and the whole chunk is lost because the
 * watermark only advances on a chunk read in full. So the chunk is sized to make that unreachable
 * rather than to minimise requests.
 *
 * SEVEN DAYS AT `LOYVERSE_PAGE_LIMIT` (250) IS 100,000 RECEIPTS BEFORE THE CEILING BITES -- about
 * 14,000 receipts a day, which is an order of magnitude past any cafe running a free POS. And the
 * cost of the narrower chunk is small and bounded: a chunk is at least one request even when empty,
 * so two years of history is 105 requests at 7 days against 24 at 31. Both are inside a single
 * 300-request window. The nightly case is identical either way -- one chunk, one request, because
 * a day is shorter than a chunk.
 */
export const LOYVERSE_BACKFILL_CHUNK_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * How far the start of each chunk after the first is stepped back from the previous chunk's end,
 * and the same amount the between-run watermark is stepped back.
 *
 * ONE SECOND, NOT ONE MILLISECOND, because the platform's own examples are second-resolution
 * (`updated_at_min=2026-09-10T00:00:00`) and a sub-second backstep may simply be truncated away --
 * which would leave the hole exactly where it was while the code claimed to have closed it.
 *
 * The cost is bounded and known: one extra second of receipts re-read per chunk join, collapsed by
 * the upsert because a re-read receipt carries the same key. The benefit is that no receipt can
 * fall between two chunks under any of the four readings of `updated_at_min` / `updated_at_max`
 * that Loyverse leaves undocumented. An overlap is recoverable; a gap is not.
 */
export const LOYVERSE_BOUNDARY_OVERLAP_MS = 1_000;

/**
 * How this unit refuses.
 *
 * Separate from `LoyverseClientError` and `LoyverseNormalizeError` for the reason those two are
 * separate from each other: the three refuse about different things, and a caller turning them into
 * something a merchant should DO needs to tell a bad span from a bad credential from a bad receipt.
 * ONE member, because a bad timezone is the normaliser's -- it is what USES the zone, so it is what
 * defines a real one, and a second definition here would be a second opinion.
 */
export type LoyverseBackfillErrorCode = "invalid_window";

export class LoyverseBackfillError extends Error {
  constructor(
    message: string,
    readonly code: LoyverseBackfillErrorCode,
  ) {
    super(message);
    this.name = "LoyverseBackfillError";
  }
}

export interface LoyverseBackfillOptions {
  /** The credential and the retry policy. */
  readonly client: LoyverseFetchOptions;
  /**
   * The span to read, in UPDATED time.
   *
   * `updatedAfter` is the watermark the last run banked (or the start of history on a first
   * backfill); `updatedBefore` is pinned to this run's start by the CALLER, per `client.ts`
   * decision 3 -- a boundary of "now" re-evaluated per request would make the window slide under
   * the read.
   */
  readonly window: LoyverseWindow;
  /**
   * The IANA zone the merchant trades in. REQUIRED, and not merely a label: `dimensions.date` is
   * COMPUTED in it, so a guess moves receipts onto the wrong calendar day rather than mislabelling
   * the right one. It comes from `public.connections.timezone`, whose null means nobody has told
   * us -- which this refuses to run against rather than assuming UTC.
   */
  readonly timezone: string;
  /** RFC3339. One value for the whole run, so every row from it agrees on when it was pulled. */
  readonly fetchedAt: string;
  /** Defaults to `LOYVERSE_BACKFILL_CHUNK_DAYS`. */
  readonly chunkDays?: number;
  /** Passed through to the cursor walk, so a caller can meter how hard an account is to read. */
  readonly walk?: LoyverseWalkOptions;
  /**
   * Fires after a chunk has been read in full. THE ONLY PLACE A WATERMARK MAY ADVANCE.
   *
   * IT MAY BE ASYNC, AND IT IS AWAITED. A caller banking the watermark durably will want to write
   * it, and a `=> void` signature accepts an `async` function happily -- so the promise would be
   * dropped, the next chunk would start while the write was in flight, two writes could land out of
   * order, and a REJECTED write would surface as an unhandled rejection while the run reported
   * success. Every one of those ends the same way: a watermark ahead of what was stored, which is
   * the one failure this callback exists to prevent.
   */
  readonly onChunk?: (checkpoint: LoyverseCheckpoint) => void | Promise<void>;
}

/** One page of one chunk, normalised. */
export interface LoyverseBackfillBatch {
  /** The chunk this page belongs to, as this module cut it. */
  readonly chunk: LoyverseWindow;
  /** 1-based within the chunk. A cursor has no ordinal; the client counts these. */
  readonly page: number;
  readonly rows: readonly EnvelopeRow[];
  /**
   * The account's rate budget AFTER this page.
   *
   * SURFACED PER BATCH RATHER THAN ONLY AT THE END, because it is the thing a caller should meter:
   * Loyverse reports no quota header, the limit is shared with the merchant's own integrations, and
   * a run that is quietly consuming an account's headroom should be visible while it is happening
   * rather than in the post-mortem.
   */
  readonly budget: LoyverseRateBudget;
}

/** How far a run got, and therefore where the next one starts. */
export interface LoyverseCheckpoint {
  /**
   * The `updatedAfter` the NEXT run must use: the completed chunk's `updatedBefore` LESS
   * `LOYVERSE_BOUNDARY_OVERLAP_MS`.
   *
   * THE EARLIER VERSION OF THIS COMMENT WAS WRONG, and an adversarial verifier proved it by
   * enumerating a case the reasoning had collapsed. It said sharing the boundary instant was "exact
   * under the exclusive reading" -- treating inclusivity as ONE property of both bounds. It is two,
   * and Loyverse documents neither:
   *
   *     min >= / max <=   chunks overlap at the instant      re-read, collapsed by the upsert
   *     min >  / max <=   exact
   *     min >= / max <    exact
   *     min >  / max <    A RECEIPT AT EXACTLY THE BOUNDARY IS RETURNED BY NEITHER CHUNK
   *
   * Three of four readings were safe, which is not the same as either reading, and the fourth loses
   * the receipt permanently: the watermark advances past an instant nothing ever read. The loss is
   * silent, it is one receipt rather than a run, and the day's revenue is then wrong by one sale
   * with nothing anywhere reporting a failure -- which is the exact shape of wrongness this
   * repository exists to refuse.
   *
   * So the boundary is no longer shared, it is OVERLAPPED. Stepping the next start back makes the
   * fourth row safe -- a receipt at the boundary is strictly inside the next chunk's open interval
   * -- and turns rows two and three into small re-reads, which the upsert collapses exactly as row
   * one's already did. Overlap is recoverable by the upsert; a gap is recoverable by nothing.
   */
  readonly updatedAfter: string;
  /** Chunks read in full so far, this run. */
  readonly chunks: number;
  /** Envelope rows emitted so far, this run. Receipts, not pages -- one row per receipt. */
  readonly rows: number;
  /** The account's spent requests, so the next run can carry the ceiling across. */
  readonly budget: LoyverseRateBudget;
}

/**
 * Cut the span into chunks, oldest first.
 *
 * Exported for the tests, which assert the cut directly rather than inferring it from request URLs:
 * a run against a fake account proves the requests agree with the chunks, not that the chunks are
 * right.
 */
export function loyverseBackfillChunks(
  window: LoyverseWindow,
  chunkDays: number = LOYVERSE_BACKFILL_CHUNK_DAYS,
): LoyverseWindow[] {
  const after = parseLoyverseInstant(window.updatedAfter, "updatedAfter");
  const before = parseLoyverseInstant(window.updatedBefore, "updatedBefore");

  if (before <= after) {
    throw new LoyverseBackfillError(
      `loyverse: the span ${window.updatedAfter}..${window.updatedBefore} ends at or before it ` +
        "starts. A caller that passed the same watermark twice would otherwise spend the " +
        "merchant's request on a window that can contain nothing, and be told it succeeded.",
      "invalid_window",
    );
  }
  if (!Number.isFinite(chunkDays) || chunkDays <= 0) {
    throw new LoyverseBackfillError(
      `loyverse: chunkDays is ${JSON.stringify(chunkDays)}. A non-positive chunk never reaches ` +
        "the end of the span, so the run would not terminate.",
      "invalid_window",
    );
  }

  const step = Math.max(1000, Math.round(chunkDays * DAY_MS));
  const out: LoyverseWindow[] = [];
  for (let start = after; start < before; start += step) {
    const end = Math.min(start + step, before);
    out.push({
      // THE FIRST CHUNK STARTS EXACTLY WHERE THE CALLER SAID. Only the joins between chunks are
      // overlapped -- stepping the span's own start back would read receipts from before the
      // window the caller asked for, which is a different defect from the one being fixed.
      updatedAfter: new Date(
        start === after ? start : start - LOYVERSE_BOUNDARY_OVERLAP_MS,
      ).toISOString(),
      updatedBefore: new Date(end).toISOString(),
    });
  }
  return out;
}

/**
 * RFC3339, checked. `Date.parse` alone is not that check, and three of its answers are dangerous.
 *
 * IT IS FAR MORE PERMISSIVE THAN THE NAME OF THIS FIELD PROMISES, and each extra thing it accepts
 * turns a typo into a silently different window rather than into a refusal:
 *
 *   `"2026-02-30T00:00:00Z"`  -> **2026-03-02**. Normalised, not rejected. A watermark set to a day
 *                               that does not exist silently skips two days of receipts, and the
 *                               checkpoint then advances past them -- so nothing ever reads them.
 *   `"2026-09-11T00:00:00"`   -> parsed as LOCAL time. This repository has a documented history with
 *                               exactly that reading, which is why `vitest.config.ts` pins the suite
 *                               to Asia/Bangkok: in UTC the wrong answer and the right one are one
 *                               string.
 *   `"September 11, 2026"`    -> accepted. Not a format any caller should be able to reach here.
 *   `"2026-09-11T24:00:00Z"`  -> **the next day**. RFC3339 forbids hour 24 and `Date.parse` rolls it
 *                               over silently -- the same failure as the first, one field along.
 *
 * So the SHAPE is matched first, and then EVERY COMPONENT is checked by rebuilding the instant from
 * its own parts: `Date.UTC` normalises rather than refusing in both halves, so anything that does
 * not survive the round trip did not exist. The components are checked as a WALL CLOCK, independent
 * of the offset: the offset only moves the resulting instant, which `Date.parse` applies afterwards.
 *
 * `woocommerce/backfill.ts` carries the identical function as `parseRfc3339`, and this is a
 * deliberate duplication rather than an oversight: importing one connector's module into another
 * would make WooCommerce's window validation load-bearing for Loyverse pulls, and the two error
 * messages have to name their own source and their own field for the message to be worth reading.
 * The behaviour is pinned by tests on both sides.
 */
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

export function parseLoyverseInstant(value: string, field: string): number {
  const m = RFC3339.exec(value);
  if (m === null) {
    throw new LoyverseBackfillError(
      `loyverse: ${field} is ${JSON.stringify(value)}, which is not an RFC3339 instant. It needs ` +
        "a date, a time and a designator -- 2026-09-11T00:00:00Z. A value without one is read as " +
        "local time, which moves the window by the runtime's offset.",
      "invalid_window",
    );
  }

  const [, y, mo, d, hh, mi, ss] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  // THE ROUND TRIP, OVER EVERY COMPONENT. `Date.UTC` normalises rather than refusing, and it does
  // so in both halves: `(2026, 1, 30)` is March 2, and `(2026, 8, 11, 24, 0, 0)` is the twelfth.
  // Checking only the date would let `2026-09-11T24:00:00Z` through -- a day later than written.
  const probe = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss)),
  );
  if (
    probe.getUTCFullYear() !== Number(y) ||
    probe.getUTCMonth() !== Number(mo) - 1 ||
    probe.getUTCDate() !== Number(d) ||
    probe.getUTCHours() !== Number(hh) ||
    probe.getUTCMinutes() !== Number(mi) ||
    probe.getUTCSeconds() !== Number(ss)
  ) {
    throw new LoyverseBackfillError(
      `loyverse: ${field} is ${JSON.stringify(value)}, which is not an instant that exists. ` +
        "Rolling it forward would query a window nobody asked for and then advance the watermark " +
        "past what it skipped.",
      "invalid_window",
    );
  }

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    // The shape is right and the calendar is right, so this is an out-of-range time component --
    // `25:00:00`, which the regex cannot exclude without becoming unreadable.
    throw new LoyverseBackfillError(
      `loyverse: ${field} is ${JSON.stringify(value)}, which carries a time that does not exist.`,
      "invalid_window",
    );
  }
  return ms;
}

/**
 * Read a span of updated time, yielding one batch per page.
 *
 * THE RECEIPTS ARE CAST AND NOT VALIDATED HERE, deliberately. `LoyverseReceiptsPage.receipts` is
 * `unknown[]` because the client does not model the payload, and `normalizeLoyverseReceipts` is the
 * thing that does: it REFUSES a receipt with no number, an unknown `receipt_type` and an
 * unparseable total rather than skipping them. Validating a second time here would put the same
 * refusal in two places and let them disagree.
 */
export async function* runLoyverseBackfill(
  options: LoyverseBackfillOptions,
): AsyncGenerator<LoyverseBackfillBatch, LoyverseCheckpoint, undefined> {
  // BEFORE THE FIRST REQUEST, AND THAT IS THE WHOLE REASON IT IS CALLED HERE. The normaliser would
  // refuse the same value one page later, by which point the merchant's account has already spent
  // the requests and the message names a receipt instead of the connection.
  assertLoyverseTimezone(options.timezone);

  const plan = loyverseBackfillChunks(options.window, options.chunkDays);

  // DIFFERENCE ONE: the currency, before any receipt. A Loyverse receipt carries none, so without
  // this every row would have to be labelled with a guess -- and finding that out after walking the
  // whole span would waste the merchant's rate budget to produce nothing storable.
  const merchant: LoyverseMerchant = await fetchMerchant(options.client, options.walk?.budget);

  // Every chunk costs at least one request, so a checkpoint at the START of the span is the honest
  // answer before any of them has come back: nothing has been read, so nothing may be skipped.
  let checkpoint: LoyverseCheckpoint = {
    updatedAfter: options.window.updatedAfter,
    chunks: 0,
    rows: 0,
    budget: merchant.budget,
  };

  for (const chunk of plan) {
    let rowsThisChunk = 0;
    let budget = checkpoint.budget;

    for await (const page of fetchReceiptsPages(options.client, chunk, {
      ...(options.walk ?? {}),
      // THREADED ACROSS CHUNKS, not restarted per chunk. The 300-per-300s limit is per ACCOUNT and
      // does not reset at a chunk boundary, so a walk that began its budget afresh each chunk could
      // spend 300 requests per chunk and hand the merchant a 429 on their own till.
      budget,
    })) {
      const rows = normalizeLoyverseReceipts({
        receipts: page.receipts as readonly LoyverseReceipt[],
        merchantId: merchant.id,
        currency: merchant.currency,
        timezone: options.timezone,
        fetchedAt: options.fetchedAt,
        // Correct for a row seen for the first time and wrong for a re-pull -- and a connector
        // cannot know which, because it has no store. THE UPSERT PRESERVES THE EXISTING VALUE on
        // conflict, along with `restates_until` derived from it. Same decision, and the same
        // reason, as `ga4/backfill.ts` and `woocommerce/backfill.ts`.
        firstSeenAt: options.fetchedAt,
      });
      rowsThisChunk += rows.length;
      budget = page.budget;
      yield { chunk, page: page.page, rows, budget };
    }

    // REACHED ONLY BY A CHUNK THE WALKER FINISHED. A refusal anywhere inside it -- the rate budget
    // spent, the page ceiling hit, a cursor that looped -- propagates out of the `for await` and
    // past this line, so the watermark stays where the last COMPLETE chunk left it.
    checkpoint = {
      // LESS THE OVERLAP, for the reason on `LoyverseCheckpoint.updatedAfter`: a shared instant is
      // a permanent hole under one of the four inclusive/exclusive readings Loyverse does not
      // document, and this is the boundary BETWEEN RUNS, where a hole is least likely to be noticed.
      updatedAfter: new Date(
        Date.parse(chunk.updatedBefore) - LOYVERSE_BOUNDARY_OVERLAP_MS,
      ).toISOString(),
      chunks: checkpoint.chunks + 1,
      rows: checkpoint.rows + rowsThisChunk,
      budget,
    };
    // AWAITED, so the next chunk does not begin until the caller has finished banking this one.
    await options.onChunk?.(checkpoint);
  }

  return checkpoint;
}
