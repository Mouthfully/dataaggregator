/**
 * Google Ads fixtures.
 *
 * AN HONEST LIMITATION, STATED RATHER THAN HIDDEN. Specification section 13.3 rule 6 requires that
 * "every fixture is a recorded real response with PII scrubbed". These are NOT. They are synthetic,
 * written from the documented `GoogleAdsService.Search` response shape, because no Google Ads
 * credential exists here -- and unlike GA4, a credential is not the only thing missing: reading one
 * production row needs a developer token, which needs a Google Ads manager account and an access
 * application.
 *
 * That difference matters and is not cosmetic. A synthetic fixture encodes what I believe the API
 * returns; a recorded one encodes what it actually returns. Every trap `normalize.ts` handles --
 * micros, int64-as-string, omitted zeroes, the camelCase field mask -- is a case where those two
 * diverged for somebody, and I wrote both sides of this test, so it cannot find a trap I did not
 * already know about.
 *
 * THE THREE VALUES THAT MOST NEED A REAL RESPONSE, named so the first live call is worth something:
 *   1. Whether `fieldMask` really comes back camelCase (`metrics.costMicros`) as proto3's JSON
 *      mapping says, rather than in the snake_case a query was written in.
 *   2. Whether a zero-valued metric really is omitted from the row rather than sent as 0 or "0".
 *   3. Whether an empty page can carry a `nextPageToken` at all, which `client.ts` refuses.
 *
 * BEFORE THE GOOGLE ADS CONNECTOR SHIPS: replace every fixture below with a recorded response from
 * a real account, scrub it, and re-run the contract test. If the recorded shape differs, the
 * normaliser is wrong and the fixture is right.
 *
 * Every account, campaign and ad group below is invented. The account is deliberately in
 * Asia/Bangkok and reports THB, because a fixture in UTC and USD cannot exercise trap 5 or trap 6.
 */

import type { GoogleAdsSearchResponse } from "./normalize.ts";

/** The account fields every fixture selects, in the camelCase the response uses. */
const CUSTOMER_MASK = "customer.id,customer.currencyCode,customer.timeZone";

/** The synthetic account. Digits only, as the API requires; the UI would show 123-456-7890. */
const CUSTOMER = {
  id: "1234567890",
  currencyCode: "THB",
  timeZone: "Asia/Bangkok",
} as const;

/**
 * A typical daily campaign report.
 *
 * Note the deliberate mixture of JSON types, which is proto3's mapping rather than an inconsistency
 * on Google's part: `costMicros`, `impressions` and `clicks` are int64 and arrive as STRINGS;
 * `conversions` and `conversionsValue` are doubles and arrive as NUMBERS. And `conversions` is
 * FRACTIONAL -- 37.5 -- because attribution modelling and cross-device estimation credit fractions
 * of a conversion to a campaign. A normaliser that rounded it would lose real data.
 *
 * 1,234,560,000 micros is 1,234.56 THB. Read as units it is 1.2 billion baht of daily spend on one
 * campaign, which is the six-orders-of-magnitude error trap 1 describes.
 */
export const DAILY_CAMPAIGNS: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,campaign.name,segments.date,metrics.costMicros,metrics.impressions,metrics.clicks,metrics.conversions,metrics.conversionsValue`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001", name: "Search - Brand" },
      segments: { date: "2026-08-14" },
      metrics: {
        costMicros: "1234560000",
        impressions: "18422",
        clicks: "913",
        conversions: 37.5,
        conversionsValue: 51240.25,
      },
    },
    {
      customer: CUSTOMER,
      campaign: { id: "22002", name: "Shopping - All Products" },
      segments: { date: "2026-08-14" },
      metrics: {
        costMicros: "845000000",
        impressions: "40118",
        clicks: "1502",
        conversions: 61,
        conversionsValue: 88900,
      },
    },
  ],
};

/**
 * A campaign that ran and spent nothing, with `costMicros` OMITTED.
 *
 * This is proto3 JSON leaving a field at its default value out of the message, and it is the single
 * most dangerous shape in this file: refuse it and every paused campaign disappears from the
 * report; accept it blindly on a field nobody selected and the row reports a zero Google never
 * stated. `fieldMask` names the field, so the answer here is a real zero.
 */
export const ZERO_SPEND_DAY: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.costMicros,metrics.impressions,metrics.clicks`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22003" },
      segments: { date: "2026-08-14" },
      metrics: { impressions: "0" },
    },
  ],
};

/**
 * A spend-only report: no conversion metric requested at all.
 *
 * The envelope would permit a null attribution window here. The row still carries
 * `account_default`, so that a spend pull and a conversions pull of the same campaign-day share one
 * upsert key instead of writing two rows. See GOOGLE_ADS_ATTRIBUTION_WINDOW.
 */
export const SPEND_ONLY: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.costMicros`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { costMicros: "1234560000" },
    },
  ],
};

/** Account grain, where the entity and the account are the same thing. */
export const ACCOUNT_TOTALS: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},customer.descriptiveName,segments.date,metrics.costMicros,metrics.clicks`,
  results: [
    {
      customer: { ...CUSTOMER, descriptiveName: "Example Retail Co" },
      segments: { date: "2026-08-14" },
      metrics: { costMicros: "2079560000", clicks: "2415" },
    },
  ],
};

/** Ad group grain, which is the only one carrying a parent id. */
export const AD_GROUP_ROWS: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},adGroup.id,adGroup.name,campaign.id,segments.date,metrics.clicks`,
  results: [
    {
      customer: CUSTOMER,
      adGroup: { id: "33001", name: "Brand Exact" },
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "402" },
    },
  ],
};

/**
 * The same campaign report written entirely in snake_case, mask included.
 *
 * Documented proto3 says this should not happen. It is here because if it ever does, the failure
 * without it is not an error -- it is a full report of zeroes, because every metric path would miss
 * and trap 3 would read each miss as a zero the platform never sent.
 */
export const SNAKE_CASE_RESPONSE: GoogleAdsSearchResponse = {
  fieldMask:
    "customer.id,customer.currency_code,customer.time_zone,campaign.id,segments.date,metrics.cost_micros,metrics.clicks",
  results: [
    {
      customer: { id: "1234567890", currency_code: "THB", time_zone: "Asia/Bangkok" },
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { cost_micros: "1234560000", clicks: "913" },
    },
  ],
};

/** An account with no activity in the window. Not an error. */
export const EMPTY: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.costMicros`,
  results: [],
};

/** No field mask: absent and zero become indistinguishable, so nothing may be emitted. */
export const NO_FIELD_MASK: GoogleAdsSearchResponse = {
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { costMicros: "1234560000" },
    },
  ],
};

/**
 * Currency not selected -- and this fixture exists as a PAIR with NO_TIMEZONE because of a mutation
 * that survived in the GA4 connector. A fixture missing BOTH fields lets a default on one of them
 * pass the suite, since the other still throws. Each of these isolates one field.
 */
export const NO_CURRENCY: GoogleAdsSearchResponse = {
  fieldMask: "customer.id,customer.timeZone,campaign.id,segments.date,metrics.clicks",
  results: [
    {
      customer: { id: CUSTOMER.id, timeZone: CUSTOMER.timeZone },
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "1" },
    },
  ],
};

/** Time zone not selected. See NO_CURRENCY. */
export const NO_TIMEZONE: GoogleAdsSearchResponse = {
  fieldMask: "customer.id,customer.currencyCode,campaign.id,segments.date,metrics.clicks",
  results: [
    {
      customer: { id: CUSTOMER.id, currencyCode: CUSTOMER.currencyCode },
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "1" },
    },
  ],
};

/** Selected but absent from the row: the platform did not answer what it said it would. */
export const ROW_MISSING_CURRENCY: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.clicks`,
  results: [
    {
      customer: { id: CUSTOMER.id, timeZone: CUSTOMER.timeZone },
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "1" },
    },
  ],
};

/** A currency that is not ISO 4217. Upper-casing it here would hide a response we do not model. */
export const LOWERCASE_CURRENCY: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.clicks`,
  results: [
    {
      customer: { ...CUSTOMER, currencyCode: "thb" },
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "1" },
    },
  ],
};

/** No date: every envelope row is keyed on one, and so is the section 7 upsert key. */
export const NO_DATE: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,metrics.clicks`,
  results: [{ customer: CUSTOMER, campaign: { id: "22001" }, metrics: { clicks: "1" } }],
};

/** Entity id selected but absent from the row: the row has no identity to upsert on. */
export const NO_ENTITY_ID: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.clicks`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { name: "Search - Brand" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "1" },
    },
  ],
};

/** A metric with no dictionary entry. Section 13.3 rule 2: refused, not passed through. */
export const UNMAPPED_METRIC: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.ctr`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { ctr: 0.0496 },
    },
  ],
};

/**
 * Two mask paths meaning one canonical metric.
 *
 * The two spellings of one field are the reachable version of this: the map is one-to-one today, so
 * a collision cannot come from two different Google metrics until one is added. Whichever way it
 * arrives, the second value would silently overwrite the first and the row would report a number
 * nothing in the response supports.
 */
export const METRIC_COLLISION: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.costMicros,metrics.cost_micros`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { costMicros: "1234560000" },
    },
  ],
};

/**
 * A cost that has already lost digits by the time it is a JavaScript number.
 *
 * 9,007,199,254,740,993 micros exceeds `Number.MAX_SAFE_INTEGER`, so `Number()` returns ...92 and
 * says nothing. Dividing that produces a number that looks entirely plausible and is wrong in the
 * one column an owner checks first.
 */
export const UNSAFE_MICROS: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.costMicros`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { costMicros: "9007199254740993" },
    },
  ],
};

/** A metric value that is not a number at all. Coercing it to zero would be the worst answer. */
export const UNPARSEABLE_METRIC: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.clicks`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: "n/a" },
    },
  ],
};

/**
 * A metric sent as an explicit JSON null.
 *
 * Distinct from the omitted field in ZERO_SPEND_DAY on purpose: "explicitly nothing" is not
 * "omitted because it was zero", and reading the two the same way is how a null becomes a
 * fabricated zero.
 */
export const NULL_METRIC: GoogleAdsSearchResponse = {
  fieldMask: `${CUSTOMER_MASK},campaign.id,segments.date,metrics.clicks`,
  results: [
    {
      customer: CUSTOMER,
      campaign: { id: "22001" },
      segments: { date: "2026-08-14" },
      metrics: { clicks: null },
    },
  ],
};
