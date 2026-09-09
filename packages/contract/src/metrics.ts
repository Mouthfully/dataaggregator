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
 * `orders`, `net_revenue`, `fees` and `commission` are likewise ADDITIONS, made under 13.3 rule 2
 * by decision 11A.14. `dbt_ad_reporting` is ad-centric and has no commerce grain, while the launch
 * connector set is three commerce sources and the product's central promise -- 11A.2's "after fees"
 * -- cannot be expressed without them.
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

  // THE COMMERCE GRAIN, added under 11A.14. Slots 2, 3 and 4 of the launch set -- WooCommerce,
  // Shopify and a payment gateway -- are each blocked on these four and on the `order` entity type.
  //
  // `orders` is NOT a conversion metric, and the distinction is the one place this vocabulary can
  // be abused. It is the shop's own count of orders placed, the way `sessions` is the property's
  // own count of sessions: nothing is attributed, so an attribution window would be a label with
  // nothing to label. An order a MARKETPLACE attributes to an ad is a different number and belongs
  // in `conversions`, with its window -- or in `orders` on an advertising entity, which
  // `envelopeRowSchema` refuses without a window for exactly this reason.
  orders: { unit: "count", conversion: false },

  // Gross minus what the platform kept. 11A.2: "a dashboard that reports platform-gross revenue to
  // an owner who pays 30% delivery commission is not a smaller truth, it is the wrong number."
  // `revenue` above stays gross as the order source reports it; the pair is the reconciliation.
  //
  // THIS IS THE ONE METRIC THAT MAY BE NEGATIVE. A day whose refunds exceed its sales has a
  // negative net, and the schema deliberately carries no non-negative check on this column: such a
  // check would reject a true row and force a connector to write a lie or drop the day.
  net_revenue: { unit: "currency", conversion: false },

  // Two deductions, kept apart because an owner acts on them differently. `commission` is the
  // marketplace's or delivery platform's cut, negotiated and structural; `fees` is transaction and
  // payment-processing cost. Summing them into one column would answer "where did the money go?"
  // with a number nobody can do anything about.
  fees: { unit: "currency", conversion: false },
  commission: { unit: "currency", conversion: false },
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

/**
 * Metrics that describe money or orders taken through a channel, rather than the channel's own
 * cost or reach.
 *
 * Named as a set rather than derived, because the property that matters is not a unit: `spend` is
 * currency and is NOT commerce -- it is what the advertiser paid, which is never attributed and
 * never restated by a refund. What these five share is that on an ADVERTISING entity they can only
 * be attributed figures, which is the rule `envelopeRowSchema` enforces.
 */
export const COMMERCE_METRICS: readonly MetricName[] = [
  "orders",
  "revenue",
  "net_revenue",
  "fees",
  "commission",
];
