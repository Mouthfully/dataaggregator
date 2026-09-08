/**
 * The metric dictionary.
 *
 * Names follow Fivetran's Apache-2.0 `dbt_ad_reporting` package (specification section 2 and 7), so
 * the canonical schema is a public one rather than an invention. Section 13.3's rule stands: a new
 * metric requires a change to this file first, and a connector that emits a name absent from here
 * fails its contract test.
 *
 * Note `conversions_value`, plural. Section 13.3's prose says `conversion_value`; two printed
 * envelopes and the description of the upstream package say `conversions_value`, so that spelling
 * wins and the singular is a typo (`00-repo-map.md` section 4).
 *
 * `revenue` is a separate entry, not an alias: it means revenue as the ORDER SOURCE reports it --
 * Shopify, Stripe, an affiliate network -- which is the other side of the reconciliation in section
 * 4.2. Collapsing the two would destroy the discrepancy the product exists to explain.
 *
 * `sessions` is an ADDITION to `dbt_ad_reporting`, made deliberately under 13.3 rule 2 rather than
 * smuggled in by a connector. The upstream package is ad-centric and has no analytics grain at all,
 * while section 4.1's diagnostic tree asks "Which GA4 channel and landing page lost sessions?" and
 * section 4.2's reconciliation lines GA4 up against the order source. A connector cannot answer
 * either question with a dictionary that has no word for it.
 */
export const METRICS = {
  spend: { unit: "currency", conversion: false },
  impressions: { unit: "count", conversion: false },
  clicks: { unit: "count", conversion: false },
  sessions: { unit: "count", conversion: false },
  conversions: { unit: "count", conversion: true },
  conversions_value: { unit: "currency", conversion: true },
  revenue: { unit: "currency", conversion: false },
} as const satisfies Record<string, { unit: "currency" | "count"; conversion: boolean }>;

export type MetricName = keyof typeof METRICS;

/**
 * Metrics whose value is meaningless without an attribution window. This set, not a hand-written
 * list at each call site, is what the envelope validator checks against.
 */
export const CONVERSION_METRICS: readonly MetricName[] = (
  Object.keys(METRICS) as MetricName[]
).filter((name) => METRICS[name].conversion);

export function isConversionMetric(name: string): name is MetricName {
  return name in METRICS && METRICS[name as MetricName].conversion;
}
