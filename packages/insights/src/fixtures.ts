/**
 * Row builders for the tests in this package.
 *
 * NOT EXPORTED FROM `index.ts`. These are fixtures, and a fixture that ships in the barrel is one
 * an application eventually imports by accident.
 *
 * THE SOURCES HERE ARE THE ONES THAT EXIST. `packages/contract/src/source.ts` is the dictionary and
 * `packages/connectors/src/sources/` is the implementation, and no Thai POS or delivery platform is
 * in either -- `docs/marketplane/58-plan-reconciliation.md` section 1.1 establishes that every
 * source the product plan's canonical cafe runs on is unreachable today, three of them in principle
 * rather than on paperwork. Writing a fixture against `foodstory` would be inventing a connector in
 * a test, and a test is exactly where an invented capability survives longest.
 */

import type { MetricName } from "@repo/contract";
import type { InsightRow } from "./figures.ts";

export interface RowSpec {
  readonly source: InsightRow["source"];
  readonly date: string;
  readonly metrics: Partial<Record<MetricName, unknown>>;
  readonly provisional?: boolean;
  readonly currency?: string;
  readonly fetchedAt?: string;
  readonly entityId?: string;
}

/** One stored row. Defaults are fixed rather than derived, so a fixture never depends on a clock. */
export function row(spec: RowSpec): InsightRow {
  return {
    source: spec.source,
    entity: {
      type: "account",
      // A tenant-shaped identifier on purpose: `brief.test.ts` asserts that neither of these
      // reaches the prompt. A fixture carrying a bland id would pass that test for free.
      id: spec.entityId ?? "acct-9f3c-secret-entity",
      account_id: "acct-9f3c-secret-account",
    },
    dimensions: {
      date: spec.date,
      currency: spec.currency ?? "THB",
      timezone: "Asia/Bangkok",
    },
    metrics: spec.metrics,
    fetched_at: spec.fetchedAt ?? `${spec.date}T23:30:00Z`,
    is_provisional: spec.provisional ?? false,
  };
}

/**
 * A small shop's week against the week before it, with nothing provisional.
 *
 * Figures are round and small so an assertion can name them. Takings fall on `meta_ads` and
 * commission is taken on `woocommerce`, which is enough to raise two of the three detectors.
 */
export function settledWeek(): readonly InsightRow[] {
  return [
    // The period: 2026-09-07 .. 2026-09-13
    row({
      source: "woocommerce",
      date: "2026-09-07",
      metrics: { revenue: 10_000, orders: 100, commission: 1_000 },
    }),
    row({
      source: "woocommerce",
      date: "2026-09-08",
      metrics: { revenue: 12_000, orders: 120, commission: 1_200 },
    }),
    row({
      source: "meta_ads",
      date: "2026-09-07",
      metrics: { revenue: 4_000, orders: 40, spend: 2_000 },
    }),
    row({
      source: "meta_ads",
      date: "2026-09-08",
      metrics: { revenue: 3_000, orders: 30, spend: 2_500 },
    }),
    // The comparison: 2026-08-31 .. 2026-09-06
    row({
      source: "woocommerce",
      date: "2026-08-31",
      metrics: { revenue: 9_000, orders: 90, commission: 900 },
    }),
    row({
      source: "woocommerce",
      date: "2026-09-01",
      metrics: { revenue: 9_000, orders: 90, commission: 900 },
    }),
    row({
      source: "meta_ads",
      date: "2026-08-31",
      metrics: { revenue: 5_000, orders: 50, spend: 1_500 },
    }),
    row({
      source: "meta_ads",
      date: "2026-09-01",
      metrics: { revenue: 5_000, orders: 50, spend: 1_500 },
    }),
  ];
}

export const PERIOD = { from: "2026-09-07", to: "2026-09-13" } as const;
export const COMPARISON = { from: "2026-08-31", to: "2026-09-06" } as const;
