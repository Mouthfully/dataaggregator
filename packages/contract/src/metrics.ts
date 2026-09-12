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
 * EVERY METRIC DECLARES HOW IT COMBINES, and until `position` arrived every one of them was
 * additive -- universally enough that nothing said so. That silence was the bug waiting to happen:
 * the first thing to roll a week up would have reached for SUM, which is right for eleven of these
 * and produces "average position 4,382" for the twelfth, with `ok: true`. So `aggregation` is a
 * required field rather than a default, and adding a metric now means answering the question.
 *
 * `sessions` is an ADDITION to `dbt_ad_reporting`, made deliberately under 13.3 rule 2 rather than
 * smuggled in by a connector. The upstream package is ad-centric and has no analytics grain at all,
 * while section 4.1's diagnostic tree asks "Which GA4 channel and landing page lost sessions?" and
 * section 4.2's reconciliation lines GA4 up against the order source. A connector cannot answer
 * either question with a dictionary that has no word for it.
 */
/**
 * How rows of one metric combine into a period total.
 *
 * `weight` is a metric name, deliberately not a free number: an impression-weighted mean is only
 * reproducible if the weights come from a column stored on the same row. A test asserts that every
 * weight names a real metric and that the weight itself is additive -- weighting by something that
 * is not summable is the same error one level down.
 */
export type Aggregation =
  | { readonly kind: "sum" }
  | { readonly kind: "weighted_mean"; readonly weight: string };

const SUM: Aggregation = { kind: "sum" };

export const METRICS = {
  spend: { unit: "currency", conversion: false, aggregation: SUM },
  impressions: { unit: "count", conversion: false, aggregation: SUM },
  clicks: { unit: "count", conversion: false, aggregation: SUM },
  sessions: { unit: "count", conversion: false, aggregation: SUM },
  conversions: { unit: "count", conversion: true, aggregation: SUM },
  conversions_value: { unit: "currency", conversion: true, aggregation: SUM },
  revenue: { unit: "currency", conversion: false, aggregation: SUM },

  // THE COMMERCE GRAIN, added under 11A.14. Slots 2, 3 and 4 of the launch set -- WooCommerce,
  // Shopify and a payment gateway -- are each blocked on these four and on the `order` entity type.
  //
  // `orders` is NOT a conversion metric, and the distinction is the one place this vocabulary can
  // be abused. It is the shop's own count of orders placed, the way `sessions` is the property's
  // own count of sessions: nothing is attributed, so an attribution window would be a label with
  // nothing to label. An order a MARKETPLACE attributes to an ad is a different number and belongs
  // in `conversions`, with its window -- or in `orders` on an advertising entity, which
  // `envelopeRowSchema` refuses without a window for exactly this reason.
  orders: { unit: "count", conversion: false, aggregation: SUM },

  // Gross minus what the platform kept. 11A.2: "a dashboard that reports platform-gross revenue to
  // an owner who pays 30% delivery commission is not a smaller truth, it is the wrong number."
  // `revenue` above stays gross as the order source reports it; the pair is the reconciliation.
  //
  // THIS IS THE ONE METRIC THAT MAY BE NEGATIVE. A day whose refunds exceed its sales has a
  // negative net, and the schema deliberately carries no non-negative check on this column: such a
  // check would reject a true row and force a connector to write a lie or drop the day.
  net_revenue: { unit: "currency", conversion: false, aggregation: SUM },

  // Two deductions, kept apart because an owner acts on them differently. `commission` is the
  // marketplace's or delivery platform's cut, negotiated and structural; `fees` is transaction and
  // payment-processing cost. Summing them into one column would answer "where did the money go?"
  // with a number nobody can do anything about.
  fees: { unit: "currency", conversion: false, aggregation: SUM },
  commission: { unit: "currency", conversion: false, aggregation: SUM },

  // THE FIRST METRIC THAT IS NOT A SUM, and the reason `aggregation` exists at all.
  //
  // Average SERP rank, from Search Console. It reached precedence rule 3 in the field registry
  // honestly: nothing in this dictionary is a rank, and it cannot be derived from anything that is
  // -- unlike `ctr`, which is clicks over impressions and stays out for that reason.
  //
  // `rank` is a third unit because it is neither money nor a count of things. It is a mean of
  // 1-based ordinals, and the two properties that follow are why the unit had to be added rather
  // than borrowed:
  //
  //   * IT DOES NOT SUM. Positions across two days do not add to a position.
  //   * IT DOES NOT PLAINLY AVERAGE EITHER. Search Console's own figure is weighted by
  //     impressions, so a query seen 40,000 times and one seen 12 must not count equally. A simple
  //     mean of stored rows is a different, wrong number that looks entirely plausible.
  //
  // NAMED `position`, NOT `avg_position`, and that is a decision. The stored value is the
  // PLATFORM's figure for that row, not an average this system computed; `avg_position` would
  // claim otherwise. How rows combine is what `aggregation` says, in a place a test can check --
  // putting it in the name would duplicate the fact somewhere nothing can.
  position: {
    unit: "rank",
    conversion: false,
    aggregation: { kind: "weighted_mean", weight: "impressions" },
  },
} as const satisfies Record<
  string,
  { unit: "currency" | "count" | "rank"; conversion: boolean; aggregation: Aggregation }
>;

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

/** Metrics that may be added across rows. Everything else needs `combineMetric`. */
export const ADDITIVE_METRICS: readonly MetricName[] = (
  Object.keys(METRICS) as MetricName[]
).filter((name) => METRICS[name].aggregation.kind === "sum");

export function isAdditive(name: MetricName): boolean {
  return METRICS[name].aggregation.kind === "sum";
}

/** The metric a non-additive metric is weighted by, or null when it simply sums. */
export function weightFor(name: MetricName): MetricName | null {
  const aggregation = METRICS[name].aggregation;
  return aggregation.kind === "weighted_mean" ? (aggregation.weight as MetricName) : null;
}

/**
 * Combine one metric across rows, the way that metric is meant to be combined.
 *
 * THIS EXISTS SO THE FIRST PERSON TO ROLL A WEEK UP DOES NOT WRITE `SUM`. Declaring that
 * `position` is impression-weighted and leaving every caller to honour it is the same arrangement
 * as a comment: correct until somebody is in a hurry. `sum` is the overwhelming majority case and
 * goes through here too, so the right call is also the easy one.
 *
 * Returns NULL, not zero, when there is nothing to report. Zero is a measurement -- "spend was
 * nothing" -- and a period with no rows has not measured zero, it has measured nothing. Collapsing
 * the two is how an outage becomes a quiet flat line on a chart.
 */
export function combineMetric(
  name: MetricName,
  rows: readonly Partial<Record<MetricName, number | null | undefined>>[],
): number | null {
  const aggregation = METRICS[name].aggregation;

  if (aggregation.kind === "sum") {
    let total = 0;
    let seen = false;
    for (const row of rows) {
      const value = row[name];
      if (value === null || value === undefined) continue;
      total += value;
      seen = true;
    }
    return seen ? total : null;
  }

  // Weighted mean. A row missing either half contributes NEITHER -- counting a value with no
  // weight would silently fall back to an unweighted mean for that row, which is the wrong number
  // this function exists to prevent.
  const weight = aggregation.weight as MetricName;
  let weighted = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const value = row[name];
    const w = row[weight];
    if (value === null || value === undefined) continue;
    if (w === null || w === undefined) continue;
    weighted += value * w;
    totalWeight += w;
  }

  // Zero total weight is not zero average position -- it is a rank nobody saw. Dividing would
  // produce NaN, and returning 0 would report the best possible rank for a query with no
  // impressions, which is the most misleading number available.
  if (totalWeight === 0) return null;
  return weighted / totalWeight;
}
