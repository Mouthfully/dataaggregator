/**
 * Search Console fixtures.
 *
 * AN HONEST LIMITATION, STATED RATHER THAN HIDDEN, and the same one `sources/ga4/fixtures.ts`
 * carries. Specification section 13.3 rule 6 requires that "every fixture is a recorded real
 * response with PII scrubbed". THESE ARE NOT. They are synthetic, written from Google's documented
 * `searchAnalytics.query` response shape, because no Search Console credential exists in this
 * repository and none can be obtained from here.
 *
 * That difference is sharper for this connector than it was for GA4, and it is worth being blunt
 * about why. A synthetic fixture encodes what I believe the API returns. Every trap the normaliser
 * beside it handles -- positional `keys` with no header to check them against, `rows` omitted
 * entirely on a quiet day, metrics typed as doubles -- is a case where somebody's belief and the
 * platform's behaviour diverged. I wrote both sides here, so the traps I did not anticipate are
 * precisely the ones these fixtures cannot contain. The design note lists what one live call would
 * settle; this file is the reason that list exists.
 *
 * BEFORE THIS CONNECTOR SHIPS: replace every fixture below with a recorded response from a real
 * property and re-run the contract test. If the recorded shape differs, the normaliser is wrong and
 * the fixture is right.
 *
 * NO REAL SITE, NO REAL QUERY, NO CREDENTIAL. The property is `sc-domain:example.test` -- `.test` is
 * reserved by RFC 2606 and can never resolve -- and the query strings are invented. Search Console
 * query strings are free text a person typed, which is exactly why `REDACTION_POLICIES` reasons
 * about them at all; a recorded fixture will need that read before it is committed.
 */

import type { SearchAnalyticsResponse } from "./normalize.ts";

/** The property every fixture below belongs to. Reserved TLD: it cannot be a real customer. */
export const FIXTURE_SITE_URL = "sc-domain:example.test";

/**
 * A date-only report: Google's own totals, anonymised queries included.
 *
 * `responseAggregationType` is "byProperty" because no page dimension was requested. Compare the
 * clicks here against BY_QUERY below -- 1284 against a query-grain sum of 688 -- and the anonymity
 * gap is the whole reason these two fixtures exist as a pair.
 */
export const DAILY_TOTALS: SearchAnalyticsResponse = {
  rows: [
    { keys: ["2026-08-14"], clicks: 1284, impressions: 40210, ctr: 0.0319, position: 18.4 },
    { keys: ["2026-08-15"], clicks: 1102, impressions: 38940, ctr: 0.0283, position: 19.1 },
  ],
  responseAggregationType: "byProperty",
};

/**
 * The same two days at query grain, and DELIBERATELY NOT SUMMING to DAILY_TOTALS.
 *
 * 2026-08-14 is 688 clicks and 15,800 impressions here against 1,284 and 40,210 there. That is not
 * an error in the fixture; it is the fixture's job. Google withholds low-volume queries, so a
 * query-grain response is a subset, and a test that used a query-grain fixture whose rows happened
 * to add up to the property total would let a normaliser that sums them pass.
 */
export const BY_QUERY: SearchAnalyticsResponse = {
  rows: [
    {
      keys: ["2026-08-14", "running shoes"],
      clicks: 412,
      impressions: 9100,
      ctr: 0.0453,
      position: 6.2,
    },
    {
      keys: ["2026-08-14", "trail running shoes"],
      clicks: 180,
      impressions: 4200,
      ctr: 0.0429,
      position: 8.9,
    },
    {
      keys: ["2026-08-14", "best running shoes 2026"],
      clicks: 96,
      impressions: 2500,
      ctr: 0.0384,
      position: 11.7,
    },
    {
      keys: ["2026-08-15", "running shoes"],
      clicks: 355,
      impressions: 8600,
      ctr: 0.0413,
      position: 6.5,
    },
    {
      keys: ["2026-08-15", "trail running shoes"],
      clicks: 150,
      impressions: 3900,
      ctr: 0.0385,
      position: 9.4,
    },
  ],
  responseAggregationType: "byProperty",
};

/** The same day at page grain. Note the aggregation type changes, and Google says which it used. */
export const BY_PAGE: SearchAnalyticsResponse = {
  rows: [
    {
      keys: ["2026-08-14", "https://example.test/shoes/running"],
      clicks: 520,
      impressions: 12000,
      ctr: 0.0433,
      position: 7.1,
    },
    {
      keys: ["2026-08-14", "https://example.test/shoes/trail"],
      clicks: 240,
      impressions: 5100,
      ctr: 0.047,
      position: 9.2,
    },
  ],
  responseAggregationType: "byPage",
};

/**
 * A query that is itself a URL, and identical to a page in BY_PAGE.
 *
 * People paste URLs into Google. The section 7 upsert key is (source, account_id, entity_id, date,
 * attribution_window) and carries NO entity type, so without a grain prefix on the entity id this
 * row and the first row of BY_PAGE upsert onto each other and one of the two numbers vanishes.
 * Search Console is the first source in this repository to emit two grains for one account, which
 * is why nothing has needed this fixture before.
 */
export const QUERY_THAT_IS_A_PAGE_URL: SearchAnalyticsResponse = {
  rows: [
    {
      keys: ["2026-08-14", "https://example.test/shoes/running"],
      clicks: 3,
      impressions: 41,
      ctr: 0.0732,
      position: 2.1,
    },
  ],
  responseAggregationType: "byProperty",
};

/**
 * No data for the window -- and `rows` is ABSENT, not `[]`.
 *
 * This is the documented shape and it is a real trap: `response.rows.length` on a quiet day is a
 * TypeError, not a zero. It is also the ordinary case at the newest end of a backfill, because
 * `dataState: "final"` returns nothing for days Google has not finalised yet.
 */
export const EMPTY: SearchAnalyticsResponse = {
  responseAggregationType: "byProperty",
};

/** Two dimensions requested, one key returned. Every key would be read as something it is not. */
export const KEYS_TOO_FEW: SearchAnalyticsResponse = {
  rows: [{ keys: ["2026-08-14"], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }],
  responseAggregationType: "byProperty",
};

/** An empty query string cannot identify an entity, and every empty row would share one key. */
export const EMPTY_QUERY: SearchAnalyticsResponse = {
  rows: [{ keys: ["2026-08-14", ""], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }],
  responseAggregationType: "byProperty",
};

/** A negative click count is physically impossible; it means a positional mix-up upstream. */
export const NEGATIVE_CLICKS: SearchAnalyticsResponse = {
  rows: [
    { keys: ["2026-08-14", "running shoes"], clicks: -3, impressions: 100, ctr: 0, position: 4 },
  ],
  responseAggregationType: "byProperty",
};

/** A metric absent from the row. Reading it as zero would be indistinguishable from a real zero. */
export const MISSING_IMPRESSIONS: SearchAnalyticsResponse = {
  rows: [{ keys: ["2026-08-14", "running shoes"], clicks: 12, ctr: 0.1, position: 4 }],
  responseAggregationType: "byProperty",
};

/**
 * A metric arriving as a string, which is what GA4 does on every response.
 *
 * Search Console types these as doubles, so this fixture is defensive rather than observed: the two
 * Google APIs this repository reads disagree about it, and a connector that assumed the number was
 * already a number would sum `"12" + "7"` into `"127"` if the platform ever changed its mind.
 */
export const STRING_METRIC = {
  rows: [{ keys: ["2026-08-14", "running shoes"], clicks: "12", impressions: 100 }],
  responseAggregationType: "byProperty",
} as unknown as SearchAnalyticsResponse;

/**
 * 30 February, which `Date.parse` accepts and rolls over into March rather than rejecting.
 *
 * A regex plus a NaN check passes this fixture and files the row two days late. Only the round trip
 * back to a string catches it.
 */
export const IMPOSSIBLE_DATE: SearchAnalyticsResponse = {
  rows: [
    { keys: ["2026-02-30", "running shoes"], clicks: 1, impressions: 2, ctr: 0.5, position: 1 },
  ],
  responseAggregationType: "byProperty",
};
