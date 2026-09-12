/**
 * GA4 -> backfill.
 *
 * The third file of the connector unit (specification section 13.3), and the one that joins the
 * other two: `planBackfill` in @repo/extract decides WHICH days to pull, `client.ts` fetches them,
 * `normalize.ts` turns them into envelope rows. This is the orchestration, and it owns three
 * decisions that neither neighbour can make.
 *
 * ONE: WHAT TO ASK FOR. GA4 prices a request by query complexity (section 7), so every extra
 * dimension is quota spent from a ceiling the customer's own tools draw on. The default report is
 * therefore deliberately minimal, and it requests exactly ONE revenue metric -- `totalRevenue` and
 * `purchaseRevenue` both mean `conversions_value`, and asking for both is refused by the normaliser
 * rather than silently keeping one. That refusal exists precisely so this decision has to be made
 * here, in the open.
 *
 * TWO: A QUOTA STOP ENDS THE WHOLE PLAN, NOT THE WINDOW. Windows share one property's quota, so
 * moving to the next window after a floor stop spends the same exhausted allowance. The plan stops,
 * and what it completed is reported rather than discarded -- newest first, so the days most likely
 * to have changed are the ones already done.
 *
 * THREE: `first_seen_at` IS NOT THIS UNIT'S TO GUARANTEE, and saying so is the point. The envelope
 * requires it to be immutable per row, and A CONNECTOR CANNOT KNOW WHETHER A ROW ALREADY EXISTS --
 * it has no store. So every row is emitted with `first_seen_at = fetched_at`, which is correct for a
 * row seen for the first time and wrong for a re-pull, and THE UPSERT MUST PRESERVE THE EXISTING
 * VALUE on conflict, along with `restates_until` which is derived from it. Pretending otherwise here
 * would put the product's one durable guarantee in the layer least able to keep it.
 */

import type { BackfillWindow } from "@repo/extract";
import type { EnvelopeRow } from "@repo/contract";
import {
  type Ga4ClientOptions,
  type Ga4PropertyQuota,
  type Ga4ReportRequest,
  Ga4ClientError,
  runReportPages,
} from "./client.ts";
import { normalizeGa4Report } from "./normalize.ts";

/** The dimensions and metrics a daily pull asks for. */
export interface Ga4ReportDefinition {
  readonly dimensions: readonly string[];
  readonly metrics: readonly string[];
}

/**
 * The default report.
 *
 * `date` is not optional: the normaliser refuses a report without it, and the section 7 upsert key
 * is keyed on it. The metric list is the smallest set that answers section 4.1's questions, because
 * GA4 charges for complexity and the ceiling is shared with the customer's other tools.
 *
 * ONE revenue metric. `purchaseRevenue` and `eventValue` also map to `conversions_value`, so adding
 * either is refused rather than silently collapsed -- see the module note.
 */
export const GA4_DEFAULT_REPORT: Ga4ReportDefinition = {
  dimensions: ["date"],
  metrics: ["sessions", "conversions", "totalRevenue"],
};

export interface Ga4BackfillOptions {
  readonly client: Ga4ClientOptions;
  readonly windows: readonly BackfillWindow[];
  /** RFC3339. One value for the whole run, so every row from it agrees on when it was pulled. */
  readonly fetchedAt: string;
  readonly report?: Ga4ReportDefinition;
  /** Rows per page. Defaults to the client's page size. */
  readonly limit?: number;
}

/** One window's worth of rows, with the quota reading that came back with the last page. */
export interface Ga4BackfillBatch {
  readonly window: BackfillWindow;
  readonly rows: readonly EnvelopeRow[];
  readonly quota: Ga4PropertyQuota | null;
}

/** Turn one planned window into a `runReport` body. */
export function windowToRequest(
  window: BackfillWindow,
  report: Ga4ReportDefinition = GA4_DEFAULT_REPORT,
  limit?: number,
): Ga4ReportRequest {
  return {
    dimensions: report.dimensions.map((name) => ({ name })),
    metrics: report.metrics.map((name) => ({ name })),
    // GA4's dateRanges are INCLUSIVE at both ends, which is also what BackfillWindow means, so the
    // two line up with no off-by-one to get wrong.
    dateRanges: [{ startDate: window.from, endDate: window.to }],
    ...(limit === undefined ? {} : { limit }),
  };
}

/**
 * Run a plan, yielding one batch per window.
 *
 * Windows arrive newest first from `planBackfill`, and that ordering is load-bearing here: a run cut
 * short by the quota floor has already done the days most likely to have changed.
 *
 * A quota stop is RE-RAISED after the completed batches have been yielded, so a caller that iterates
 * with `for await` sees every finished window before the error arrives. Swallowing it would report a
 * partial backfill as a whole one, which is the failure this connector is built to refuse.
 */
export async function* runGa4Backfill(
  options: Ga4BackfillOptions,
): AsyncGenerator<Ga4BackfillBatch, void, undefined> {
  const report = options.report ?? GA4_DEFAULT_REPORT;

  for (const window of options.windows) {
    const request = windowToRequest(window, report, options.limit);
    const rows: EnvelopeRow[] = [];
    let quota: Ga4PropertyQuota | null = null;

    try {
      for await (const page of runReportPages(options.client, request)) {
        quota = page.quota;
        rows.push(
          ...normalizeGa4Report({
            report: page.report,
            propertyId: options.client.propertyId,
            fetchedAt: options.fetchedAt,
            // See the module note: correct for a first sighting, and the upsert -- not this unit --
            // is what keeps it immutable across re-pulls.
            firstSeenAt: options.fetchedAt,
          }),
        );
      }
    } catch (error) {
      // A QUOTA STOP AND A FAILURE ARE NOT THE SAME EVENT, and they are handed over differently.
      //
      // A quota stop is planned degradation: the pages that arrived are complete and correct, the
      // remainder is a job for the next sweep, so what finished is yielded before the plan ends.
      //
      // Anything else -- a page that made no progress, a body that is not JSON -- means GA4 is
      // behaving in a way this connector does not model. Rows salvaged from a response we no longer
      // trust are worse than no rows, so they are dropped and the error propagates untouched.
      // Either way the plan ends: the next window would spend the same property's quota.
      if (error instanceof Ga4ClientError && error.code === "quota_floor" && rows.length > 0) {
        yield { window, rows, quota };
      }
      throw error;
    }

    yield { window, rows, quota };
  }
}
