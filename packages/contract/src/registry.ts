/**
 * THE FIELD REGISTRY: every metric every connector reads, and where it lands.
 *
 * WHAT THIS IS FOR. The product is one place a business owner connects many platforms, and the
 * value of that is not the number of connectors -- it is that the numbers arrive in ONE
 * vocabulary. A connector that invents `cf_requests`, `ph_events` and `shopify_orders` because
 * those are the words its platform used has not integrated a platform; it has forwarded one, and
 * the "unified" store becomes the union of every vendor's schema with a shared primary key.
 *
 * The discipline that prevents it is an order of precedence, and the order is the whole point:
 *
 *   1. DOES IT ALREADY FIT? Map it. GA4 reports conversion value under `totalRevenue`,
 *      `purchaseRevenue` and `eventValue` depending on the report; all three are
 *      `conversions_value`, and collapsing them is the integration.
 *   2. CAN IT BE DERIVED FROM WHAT FITS? Compute it, or drop it and let the reader compute it.
 *      `ctr` is `clicks / impressions`; storing the quotient beside its inputs creates two numbers
 *      that drift.
 *   3. ONLY THEN, does the dictionary genuinely lack the concept? Add it -- deliberately, under
 *      section 13.3 rule 2, with the rejection of 1 and 2 written down.
 *
 * Nothing enforced that order before this file. Each connector held its own map, no two of them in
 * the same shape, and a field a connector chose not to emit left no trace at all -- so "we looked
 * and it did not fit" and "nobody looked" were indistinguishable in the tree.
 *
 * SO A DROP IS A DECLARATION HERE, not an omission there. Every field is listed with its
 * disposition, `scripts/check-registry.mjs` fails when a connector maps a field this file does not
 * know about, and a `dropped` entry without a reason is a build failure.
 *
 * THIS IS ALSO THE DOCUMENT. "Which of my platform's numbers do you actually keep, and what do you
 * call them?" is the first question an integrator asks, and the honest answer is a table nobody
 * has to assemble by reading five normalisers.
 */

import type { MetricName } from "./metrics.js";
import type { Source } from "./source.js";

/**
 * What happens to one field a connector reads.
 *
 * `dimension` and `structural` are listed rather than ignored because "this field is not a metric"
 * is itself an answer, and an unlisted field is the thing the guard is looking for.
 */
export type Disposition =
  | {
      /** Lands in a canonical metric column, one for one. */
      readonly kind: "metric";
      readonly metric: MetricName;
      /** A unit transform, where the platform's unit is not ours. */
      readonly transform?: "micros_to_units" | "ratio_to_percent";
      readonly note?: string;
    }
  | {
      /** Computed from several platform fields. The formula, so it is reviewable here. */
      readonly kind: "derived";
      readonly metric: MetricName;
      readonly formula: string;
      readonly note?: string;
    }
  | {
      /** Identifies or labels the row rather than measuring it. */
      readonly kind: "dimension";
      readonly note?: string;
    }
  | {
      /** Paging, ids, sampling flags -- read by the client, never emitted. */
      readonly kind: "structural";
      readonly note?: string;
    }
  | {
      /**
       * Read and deliberately not emitted. `reason` is REQUIRED, and the guard enforces it:
       * an undocumented drop is indistinguishable from an oversight, which is the condition this
       * file exists to end.
       */
      readonly kind: "dropped";
      readonly reason: string;
      /** Set when the drop is waiting on a dictionary change rather than being a decision. */
      readonly blockedOn?: string;
    };

export interface SourceFields {
  readonly source: Source;
  readonly fields: Readonly<Record<string, Disposition>>;
}

/**
 * GA4.
 *
 * The clearest case of precedence rule 1 in the tree: three platform names, one canonical column.
 */
const GA4: SourceFields = {
  source: "ga4",
  fields: {
    sessions: { kind: "metric", metric: "sessions" },
    conversions: { kind: "metric", metric: "conversions" },
    totalRevenue: {
      kind: "metric",
      metric: "conversions_value",
      note: "one of three GA4 names for the same canonical quantity",
    },
    purchaseRevenue: { kind: "metric", metric: "conversions_value" },
    eventValue: { kind: "metric", metric: "conversions_value" },
  },
};

/**
 * Google Ads.
 *
 * Carries the unit trap worth having in one place: cost is in micros and conversion value is not,
 * on the same row.
 */
const GOOGLE_ADS: SourceFields = {
  source: "google_ads",
  fields: {
    "metrics.cost_micros": {
      kind: "metric",
      metric: "spend",
      transform: "micros_to_units",
    },
    "metrics.impressions": { kind: "metric", metric: "impressions" },
    "metrics.clicks": { kind: "metric", metric: "clicks" },
    "metrics.conversions": { kind: "metric", metric: "conversions" },
    "metrics.conversions_value": {
      kind: "metric",
      metric: "conversions_value",
      note: "NOT micros, unlike cost_micros on the same row",
    },
  },
};

const META_ADS: SourceFields = {
  source: "meta_ads",
  fields: {
    spend: { kind: "metric", metric: "spend" },
    impressions: { kind: "metric", metric: "impressions" },
    clicks: { kind: "metric", metric: "clicks" },
    actions: {
      kind: "dropped",
      reason:
        "Meta returns conversions as an array of action-type/value pairs, and which action types " +
        "count as a conversion is a per-advertiser decision the platform does not make for us. " +
        "Emitting a total would be picking one on the customer's behalf.",
    },
    date_start: { kind: "dimension", note: "the row's date" },
    date_stop: { kind: "structural", note: "window echo; equals date_start at daily grain" },
  },
};

/**
 * Search Console.
 *
 * `ctr` and `position` were the two drops that made the case for writing the precedence order
 * down: in a normaliser both were one line of "read and not emitted", and they were opposite
 * decisions. `position` has since gone all the way through rule 3 and become a column; `ctr`
 * remains a decision rather than a deferral, and this is where the difference is recorded.
 */
const SEARCH_CONSOLE: SourceFields = {
  source: "search_console",
  fields: {
    clicks: { kind: "metric", metric: "clicks" },
    impressions: { kind: "metric", metric: "impressions" },
    ctr: {
      kind: "dropped",
      reason:
        "clicks / impressions, and both inputs are stored. Storing the quotient beside them is " +
        "how one number becomes two that drift: summing the inputs across a week and dividing " +
        "gives a different figure from averaging the stored ratio, and nothing says which is " +
        "meant. Computed at read time from columns that cannot disagree. A DECISION, not a gap.",
    },
    // PRECEDENCE RULE 3, EXERCISED PROPERLY -- the only entry in this file that reached it.
    //
    // It sat here as `dropped` with a `blockedOn` until the dictionary could describe it honestly.
    // Nothing here is a rank and nothing derives one, so mapping and deriving were both genuinely
    // exhausted before a column was added. What unblocked it was not the column: it was `METRICS`
    // gaining an `aggregation` per metric, because this is the first entry in the dictionary that
    // is NOT ADDITIVE and a rank that something SUMs is worse than a rank nobody stores.
    position: { kind: "metric", metric: "position" },
    keys: { kind: "dimension", note: "the requested dimensions, positionally" },
  },
};

/**
 * WooCommerce.
 *
 * The derived shape. Nothing here is a field the platform calls a metric -- an order is an object,
 * and every number is computed from it, which is why this connector holds no map at all.
 */
const WOOCOMMERCE: SourceFields = {
  source: "woocommerce",
  fields: {
    id: { kind: "dimension", note: "the order id, prefixed wc_" },
    total: {
      kind: "derived",
      metric: "revenue",
      formula: "total + sum(refunds[].total)",
      note: "refund totals are already negative, so they are ADDED. Gross as the shop reports it",
    },
    "refunds[].total": {
      kind: "derived",
      metric: "revenue",
      formula: "total + sum(refunds[].total)",
    },
    fee_lines: {
      kind: "dropped",
      reason:
        "a WooCommerce fee line is a SURCHARGE ADDED TO the customer's bill, not a cost deducted " +
        "from the merchant's take. Mapping it to `fees` would invert the sign on the headline " +
        "number. Core exposes no payment-processing fee; the gateway does.",
    },
    payment_method: {
      kind: "derived",
      metric: "fees",
      formula: "gateway-specific fee metadata, when the gateway writes it",
      note:
        "absent for most stores, which is why `fees` and `net_revenue` are emitted together " +
        "or not at all",
    },
    date_paid: { kind: "dimension", note: "the row's date" },
    status: { kind: "structural", note: "decides whether the order counts at all" },
  },
};

/** Every source's fields, in one place. */
export const FIELD_REGISTRY: readonly SourceFields[] = [
  GA4,
  GOOGLE_ADS,
  META_ADS,
  SEARCH_CONSOLE,
  WOOCOMMERCE,
];

export function fieldsFor(source: Source): Readonly<Record<string, Disposition>> {
  return FIELD_REGISTRY.find((entry) => entry.source === source)?.fields ?? {};
}

/** Platform fields that reach a canonical metric, by whichever route. */
export function mappedFields(source: Source): readonly string[] {
  return Object.entries(fieldsFor(source))
    .filter(([, d]) => d.kind === "metric" || d.kind === "derived")
    .map(([field]) => field);
}

/** Fields read and deliberately not emitted, with the reason each was rejected. */
export function droppedFields(source: Source): readonly { field: string; reason: string }[] {
  return Object.entries(fieldsFor(source))
    .filter(
      (entry): entry is [string, Extract<Disposition, { kind: "dropped" }>] =>
        entry[1].kind === "dropped",
    )
    .map(([field, d]) => ({ field, reason: d.reason }));
}

/**
 * Which canonical metrics a source can populate.
 *
 * The answer to "what do I actually get if I connect this?", derived rather than written down
 * twice.
 */
export function metricsFor(source: Source): readonly MetricName[] {
  const found = new Set<MetricName>();
  for (const disposition of Object.values(fieldsFor(source))) {
    if (disposition.kind === "metric" || disposition.kind === "derived") {
      found.add(disposition.metric);
    }
  }
  return [...found].sort();
}
