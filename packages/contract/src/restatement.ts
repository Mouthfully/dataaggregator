/**
 * Restatement clocks.
 *
 * The three MVP sources restate on three different clocks, which is why a single `freshness`
 * timestamp cannot express the contract and the field set splits into four (specification section
 * 7, line 762). This module owns the arithmetic behind `restates_until` and `is_provisional`.
 *
 * THE SPECIFICATION'S OWN FORMULA IS DEFECTIVE AND IS NOT IMPLEMENTED HERE.
 *
 * Section 7's clocks table gives `restates_until = fetched_at + Nd`. That anchors to a MUTABLE
 * value. The same section mandates a materialised store with nightly restatement-aware re-pulls, so
 * `fetched_at` is rewritten every night -- and with it `restates_until` slides another N days into
 * the future. No row ever becomes final, `is_provisional` never clears, and the one guarantee the
 * product sells never comes true. The specification's two worked examples disagree with the table
 * and with each other, and one applies Meta's 28-day rule to a `google_ads` row (`00-repo-map.md`
 * section 4).
 *
 * The anchor here is `first_seen_at`: written once when a row is first inserted, never updated.
 * `restates_until = max(date, first_seen_at) + window`.
 *
 * `max(date, first_seen_at)` because a backfill can first see a row long after the day it describes,
 * and the platform's clock does not start until the row exists to be restated.
 *
 * BUILT ON AN OPEN QUESTION, flagged as section 9 of `00-repo-map.md` requires. Whether Meta's
 * 28-day clock starts at delivery or at first report is unresolved in Meta's own documentation, per
 * both the specification's researcher and its fact-checker. `first_seen_at` implements the
 * first-report reading, which both favoured. Settle it empirically: diff a historical pull against a
 * re-pull thirty days later.
 */

import type { Source } from "./source.ts";

export interface RestatementClock {
  /** Days a row stays open after its anchor, or null where the platform publishes no window. */
  readonly windowDays: number | null;
  /** Whether the window is fixed, or read per account from the platform. */
  readonly perAccount: boolean;
  readonly note: string;
}

export const RESTATEMENT_CLOCKS: Record<Source, RestatementClock> = {
  meta_ads: {
    windowDays: 28,
    perAccount: false,
    note: 'Insights "do not change after 28 days of being reported" (specification section 7).',
  },
  google_ads: {
    windowDays: 30,
    perAccount: true,
    note:
      "Per-account and per-conversion-action window; click-through defaults to 30 days and caps at " +
      "90. No authoritative freshness or finalisation statement was found across three attempts, so " +
      "this is an upper bound rather than a documented SLA (specification section 7, open question).",
  },
  ga4: {
    windowDays: 12,
    perAccount: false,
    note:
      'Attribution credit "can change for up to 12 days". Google adds: "This is not a guarantee, ' +
      'nor an SLA or an SLO" -- so it must never be sold as one.',
  },
  search_console: {
    windowDays: null,
    perAccount: false,
    note:
      "The specification publishes no restatement window for Search Console. Null rather than a " +
      "guess: an invented number would be indistinguishable from a sourced one. Measure it before " +
      "setting a value.",
  },
  dataforseo_serp: {
    windowDays: 0,
    perAccount: false,
    note: "A SERP observation is a point-in-time measurement. It is never restated; it is re-measured.",
  },
  ai_answers: {
    windowDays: 0,
    perAccount: false,
    note:
      "An AI-answer run is a point-in-time sample. Non-determinism is reported as n_runs and a " +
      "confidence interval (specification section 11.8), never as a restatement.",
  },
  impact: {
    windowDays: null,
    perAccount: false,
    note: "Affiliate network window not established.",
  },
  awin: { windowDays: null, perAccount: false, note: "Affiliate network window not established." },
  cj: { windowDays: null, perAccount: false, note: "Affiliate network window not established." },
  partnerstack: {
    windowDays: null,
    perAccount: false,
    note: "Affiliate network window not established.",
  },

  // NULL FOR A DIFFERENT REASON THAN EVERY OTHER NULL HERE, and the difference is worth the words.
  // `search_console` and the affiliate networks are null because nobody has measured them: a number
  // exists and we do not know it. WooCommerce is null because THERE IS NO NUMBER TO KNOW. The store
  // is the merchant's own database, not a platform reporting pipeline, and a merchant can refund,
  // edit or cancel an order a year after it was placed. No window closes.
  //
  // Two consequences, accepted deliberately rather than discovered later. `restatesUntil` returns
  // null, so `isProvisional` is ALWAYS true and no WooCommerce row is ever marked final -- which is
  // the honest answer for a row that can genuinely change forever, and exactly what 11A.4's visible
  // provenance rule should show an owner. And the backfill planner sees no restatement ladder to
  // climb, which is correct here for the same reason: re-pulling on D+1/D+3/D+7/D+28 would chase a
  // window that does not exist. The incremental pull filters on `modified_after` instead, which is
  // load-bearing and verified in WooCommerce core -- `wc_create_refund` bumps the parent order's
  // `date_modified` unconditionally, so a refund resurfaces the order it belongs to.
  woocommerce: {
    windowDays: null,
    perAccount: false,
    note:
      "No window closes. The store is the merchant's own database rather than a platform reporting " +
      "pipeline, so an order can be refunded or edited at any remove and every row stays provisional. " +
      "Restatements are caught by a `modified_after` pull, not by a ladder.",
  },

  // THE SAME NULL AS WOOCOMMERCE, AND IT WAS ESTABLISHED RATHER THAN ASSUMED. The prior belief was
  // that a receipt is FINAL WHEN IT IS RUNG, which would have made this a zero like
  // `dataforseo_serp`. That belief is wrong, so it is written down here against the evidence that
  // overturned it rather than left as an intuition somebody re-derives.
  //
  // FOUR FACTS, each read directly in Loyverse's own OpenAPI document
  // (`https://developer.loyverse.com/docs/API-Reference__v1.0.yaml`):
  //
  //   * A `Receipt` carries `updated_at`, "The date and time when the receipt was updated" -- a
  //     field with nothing to describe if a receipt were immutable.
  //   * It carries `cancelled_at`, "The time when this receipt was cancelled". A sale already
  //     counted can be voided afterwards.
  //   * `/receipts` exposes `updated_at_min`/`updated_at_max` filters, and the `receipts.update`
  //     webhook is documented as firing "when a receipt is created or updated". A platform does
  //     not ship an updated-since filter and an update webhook for records that never update.
  //   * Refunds do not even touch the original row: `POST /receipts/{receipt_number}/refund`
  //     returns a SECOND receipt with `receipt_type: REFUND` and `refund_for` naming the sale. So
  //     a day's takings move through a new receipt rather than through a mutation -- which the
  //     `updated_at` walk catches for the same reason WooCommerce's `modified_after` walk does.
  //
  // AND NOTHING IN THE SPECIFICATION BOUNDS HOW LATE ANY OF IT MAY HAPPEN. There is no cut-off, no
  // closing period and no finalisation statement anywhere in the document; a search for one
  // returns only the pagination sentence about "the final set of results".
  //
  // SO THIS IS WOOCOMMERCE'S NULL AND NOT `search_console`'s, and the distinction above is exactly
  // the one being drawn. Not "a number exists and nobody has measured it" -- the account is the
  // merchant's own till, and no window closes. Every Loyverse row is therefore permanently
  // provisional, which the brief must say in words rather than leave as a flag nobody explains
  // (`58-plan-reconciliation.md` section 2.2).
  loyverse: {
    windowDays: null,
    perAccount: false,
    note:
      "No window closes. The account is the merchant's own till rather than a platform reporting " +
      "pipeline: a receipt carries `updated_at` and `cancelled_at`, the `receipts.update` webhook " +
      "fires on update as well as creation, and a refund arrives as a second receipt whose " +
      "`refund_for` names the sale -- all read in Loyverse's own OpenAPI specification, which " +
      "bounds none of it. Restatements are caught by an `updated_at_min` pull, not by a ladder.",
  },
};

const DAY_MS = 86_400_000;

export interface RestatementInput {
  readonly source: Source;
  /** The day the row describes, as YYYY-MM-DD. */
  readonly date: string;
  /** When this row was FIRST inserted. Immutable. Never pass fetched_at here. */
  readonly firstSeenAt: string;
  /** Overrides the default for sources whose window is read per account (Google Ads). */
  readonly accountWindowDays?: number;
}

/**
 * When this row stops being open to restatement, as an RFC3339 UTC timestamp.
 *
 * Returns null where the platform publishes no window: a null says "we do not know", which a caller
 * can surface honestly, whereas a default would quietly assert finality the source never promised.
 */
export function restatesUntil(input: RestatementInput): string | null {
  const clock = RESTATEMENT_CLOCKS[input.source];
  const windowDays = clock.perAccount
    ? (input.accountWindowDays ?? clock.windowDays)
    : clock.windowDays;
  if (windowDays === null || windowDays === undefined) return null;

  const dateMs = Date.parse(`${input.date}T00:00:00Z`);
  const firstSeenMs = Date.parse(input.firstSeenAt);
  if (Number.isNaN(dateMs) || Number.isNaN(firstSeenMs)) {
    throw new TypeError(
      `restatesUntil: unparseable date (${input.date}) or firstSeenAt (${input.firstSeenAt})`,
    );
  }

  // The clock starts at whichever came later: the day being described, or the moment we first saw
  // a row for it. A backfill reaching back ninety days does not get ninety-day-old finality.
  return new Date(Math.max(dateMs, firstSeenMs) + windowDays * DAY_MS).toISOString();
}

/**
 * Whether the row may still change.
 *
 * Null `restatesUntil` means the window is unknown, and unknown is treated as still open. Assuming
 * finality we cannot demonstrate is the failure this whole envelope exists to prevent.
 */
export function isProvisional(restatesUntilValue: string | null, now: Date): boolean {
  if (restatesUntilValue === null) return true;
  return now.getTime() < Date.parse(restatesUntilValue);
}
