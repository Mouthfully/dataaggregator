/**
 * GA4 fixtures.
 *
 * A HONEST LIMITATION, STATED RATHER THAN HIDDEN. Specification section 13.3 rule 6 requires that
 * "every fixture is a recorded real response with PII scrubbed". These are NOT. They are synthetic,
 * written from the documented `runReport` response shape, because no GA4 credential exists yet.
 *
 * That difference matters and is not cosmetic. A synthetic fixture encodes what I believe the API
 * returns; a recorded one encodes what it actually returns. Every trap this normaliser handles --
 * string metric values, `YYYYMMDD` dates, currency arriving in metadata rather than the request --
 * is a case where those two diverged for somebody. There will be others in here that I have not
 * anticipated precisely because I wrote both sides.
 *
 * BEFORE THE GA4 CONNECTOR SHIPS: replace every fixture below with a recorded response from a real
 * property, scrub it, and re-run the contract test. If the recorded shape differs, the normaliser is
 * wrong and the fixture is right.
 */

import type { Ga4Report } from "./normalize.js";

/** A typical daily report: date dimension, sessions and conversions. */
export const DAILY_SESSIONS: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [
    { name: "sessions", type: "TYPE_INTEGER" },
    { name: "conversions", type: "TYPE_INTEGER" },
  ],
  rows: [
    {
      dimensionValues: [{ value: "20260814" }],
      metricValues: [{ value: "1284" }, { value: "37" }],
    },
    {
      dimensionValues: [{ value: "20260815" }],
      metricValues: [{ value: "1102" }, { value: "29" }],
    },
  ],
  metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
};

/** Revenue, which is where the currency in `metadata` starts to matter. */
export const DAILY_REVENUE: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "totalRevenue", type: "TYPE_CURRENCY" }],
  rows: [{ dimensionValues: [{ value: "20260814" }], metricValues: [{ value: "5210.55" }] }],
  metadata: { currencyCode: "JPY", timeZone: "Asia/Tokyo" },
};

/** A property with no data for the window. Not an error. */
export const EMPTY: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
  rows: [],
  metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
};

/** A metric with no dictionary entry. Must be refused, not passed through. */
export const UNMAPPED_METRIC: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "bounceRate", type: "TYPE_FLOAT" }],
  rows: [{ dimensionValues: [{ value: "20260814" }], metricValues: [{ value: "0.42" }] }],
  metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
};

/** Metadata missing. Guessing the currency would mislabel every monetary value. */
export const NO_METADATA: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
  rows: [{ dimensionValues: [{ value: "20260814" }], metricValues: [{ value: "1" }] }],
};

/**
 * Metadata present, currency absent -- and this pair exists because of a mutation that survived.
 *
 * NO_METADATA omits the whole object, so a defaulting bug in ONE field is still caught by the
 * other and the test passes for the wrong reason. Deleting the currency check alone survived the
 * suite until these two fixtures existed. Each isolates one field.
 */
export const NO_CURRENCY: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
  rows: [{ dimensionValues: [{ value: "20260814" }], metricValues: [{ value: "1" }] }],
  metadata: { timeZone: "Europe/Berlin" },
};

/** Metadata present, timezone absent. See NO_CURRENCY. */
export const NO_TIMEZONE: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
  rows: [{ dimensionValues: [{ value: "20260814" }], metricValues: [{ value: "1" }] }],
  metadata: { currencyCode: "EUR" },
};

/** Positional mismatch: three headers, two values. Every value would land on the wrong name. */
export const SHAPE_MISMATCH: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "sessions" }, { name: "conversions" }],
  rows: [{ dimensionValues: [{ value: "20260814" }], metricValues: [{ value: "1" }] }],
  metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
};

/**
 * Two GA4 metric names that mean the same canonical thing. Emitting both would keep one silently.
 */
export const METRIC_COLLISION: Ga4Report = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [
    { name: "totalRevenue", type: "TYPE_CURRENCY" },
    { name: "purchaseRevenue", type: "TYPE_CURRENCY" },
  ],
  rows: [
    {
      dimensionValues: [{ value: "20260814" }],
      metricValues: [{ value: "5210.55" }, { value: "4980.10" }],
    },
  ],
  metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
};
