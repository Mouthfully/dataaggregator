/**
 * Meta Ads fixtures.
 *
 * AN HONEST LIMITATION, STATED RATHER THAN HIDDEN, in the same words as the GA4 fixtures because it
 * is the same limitation. Specification section 13.3 rule 6 requires that "every fixture is a
 * recorded real response with PII scrubbed". THESE ARE NOT. They are synthetic, written from the
 * documented `/insights` response shape, because no Meta credential exists in this repository and
 * Meta access is gated on Business Verification plus App Review.
 *
 * Every identifier below is deliberately, visibly fake: an account of fifteen zeros and a one,
 * campaign, ad set and ad ids that are runs of zeros. No real Meta id looks like this, so a fixture
 * can never be mistaken for a recording, and no customer's account number is sitting in a test.
 *
 * THE DIFFERENCE IS NOT COSMETIC. A synthetic fixture encodes what I believe the API returns; a
 * recorded one encodes what it actually returns. Every trap the normaliser handles -- string
 * numbers, window keys inside action entries, `value` meaning an unnamed default, the timezone
 * being absent from the response entirely -- is a case where those two diverged for somebody. There
 * will be others in here that I have not anticipated, precisely because I wrote both sides.
 *
 * THE FIXTURE MOST LIKELY TO BE WRONG is `SPARSE_WINDOWS`. It encodes the belief that Meta OMITS a
 * window key it has nothing to report under, rather than returning `"0"`. The normaliser reads
 * absent as zero and emits the row either way, so the stored number is the same under both
 * behaviours -- but if Meta instead omits the whole ACTION ENTRY on a zero day, a restatement down
 * to zero would arrive as an absent entry and the previous non-zero row would stand uncorrected.
 * One recorded response of a campaign whose conversions fell to zero settles it.
 *
 * BEFORE THE META CONNECTOR SHIPS: replace every fixture below with a recorded response from a real
 * ad account, scrub it, and re-run the contract test. If the recorded shape differs, the normaliser
 * is wrong and the fixture is right.
 */

import type { MetaInsightsRow } from "./normalize.js";

/** Obviously not a real ad account. */
export const FIXTURE_ACCOUNT = "act_000000000000001";
const CAMPAIGN = "000000000000000101";
const ADSET = "000000000000000201";
const AD = "000000000000000301";

const CURRENCY = { account_id: "000000000000001", account_currency: "THB" };

/**
 * A campaign day with conversions under every requested window.
 *
 * `value` DISAGREES WITH EVERY WINDOW KEY ON PURPOSE. It is set to 36, which is none of 21, 30, 33,
 * 4, 6 or 7, so any normaliser that reads it -- Meta documents it only as "Metric value of default
 * attribution window" and never names the default -- produces a number that appears nowhere else
 * and the contract test catches it.
 */
export const DAILY_CAMPAIGN: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    campaign_name: "Synthetic prospecting",
    spend: "1234.56",
    impressions: "98765",
    clicks: "4321",
    actions: [
      {
        action_type: "purchase",
        value: "36",
        "1d_click": "21",
        "7d_click": "30",
        "28d_click": "33",
        "1d_view": "4",
        "7d_view": "6",
        "28d_view": "7",
      },
    ],
    action_values: [
      {
        action_type: "purchase",
        value: "9999.99",
        "1d_click": "2100.00",
        "7d_click": "3000.00",
        "28d_click": "3300.00",
        "1d_view": "400.00",
        "7d_view": "600.00",
        "28d_view": "700.00",
      },
    ],
  },
];

/** The account grain. `account_id` is the only id on the row. */
export const ACCOUNT_LEVEL: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    spend: "4210.55",
    impressions: "412000",
    clicks: "9100",
    actions: [{ action_type: "purchase", value: "80", "7d_click": "74", "1d_view": "9" }],
  },
];

/**
 * An ad set day. This is the fixture that proves `adset` becomes `ad_group` without losing the word
 * Meta used -- the case `entitySchema`'s own comment in @repo/contract was written for.
 */
export const ADSET_LEVEL: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    adset_id: ADSET,
    adset_name: "Synthetic broad 25-45",
    spend: "410.00",
    impressions: "31000",
    clicks: "980",
    actions: [{ action_type: "purchase", "7d_click": "11" }],
  },
];

/** An ad day, to pin the deepest grain and its parent link. */
export const AD_LEVEL: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    adset_id: ADSET,
    ad_id: AD,
    ad_name: "Synthetic video 15s",
    spend: "96.00",
    impressions: "7400",
    clicks: "210",
    actions: [{ action_type: "purchase", "7d_click": "3" }],
  },
];

/**
 * What a real response looks like: the conversion buried among engagement actions.
 *
 * Summing this array reports 7,656 conversions on a day with nine sales. This is the fixture that
 * makes trap 4 a test rather than a paragraph.
 */
export const MIXED_ACTION_TYPES: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "500.00",
    actions: [
      { action_type: "link_click", "7d_click": "4200" },
      { action_type: "landing_page_view", "7d_click": "3100" },
      { action_type: "post_engagement", "7d_click": "347" },
      { action_type: "purchase", "7d_click": "9" },
    ],
    action_values: [{ action_type: "purchase", "7d_click": "1980.00" }],
  },
];

/**
 * Action entries carrying `value` and nothing else.
 *
 * This is what Meta returns when `action_attribution_windows` was not sent: one number under a
 * default the documentation never names. The connector always sends the parameter, so this response
 * should be unreachable -- and the normaliser still reports zero for every requested window rather
 * than adopting an unlabelled figure, because "should be unreachable" is not a guarantee.
 */
export const VALUE_ONLY: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "500.00",
    actions: [{ action_type: "purchase", value: "42" }],
  },
];

/** Conversions in the click windows and none in the view windows. See the header note. */
export const SPARSE_WINDOWS: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "500.00",
    // `value` is present and is none of the window figures, so any fallback to it shows up as a
    // view-window row that should be zero.
    actions: [{ action_type: "purchase", value: "27", "7d_click": "12", "28d_click": "15" }],
  },
];

/** A day with delivery and no conversions at all. Not an error, and not a zero-conversion row. */
export const DELIVERY_ONLY: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "88.00",
    impressions: "9000",
    clicks: "120",
  },
];

/** An account with no delivery in the window. Also not an error. */
export const EMPTY: readonly MetaInsightsRow[] = [];

/**
 * The whole window as one row, which is what Meta returns without `time_increment=1`.
 *
 * Read as a single day it puts a fortnight of spend on 14 August and reports zero for every other
 * day. The client cannot send the request that produces this; the normaliser refuses it anyway.
 */
export const AGGREGATED_RANGE: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-28",
    campaign_id: CAMPAIGN,
    spend: "18450.00",
    impressions: "1200000",
    clicks: "44000",
  },
];

/** `account_currency` absent. Defaulting would report THB spend as USD, at about 32x. */
export const NO_CURRENCY: readonly MetaInsightsRow[] = [
  {
    account_id: "000000000000001",
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "1234.56",
  },
];

/**
 * A field with no dictionary entry.
 *
 * `cpc` is spend over clicks -- both of which are already on the row -- computed by Meta over a
 * denominator we cannot see. Refused rather than dropped, so widening the `fields` list without a
 * dictionary change fails loudly (section 13.3 rule 2).
 */
export const UNMAPPED_FIELD: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "1234.56",
    clicks: "4321",
    cpc: "0.29",
  },
];

/** One action type twice. Summed, every sale in it counts twice. */
export const DUPLICATE_PURCHASE: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "500.00",
    actions: [
      { action_type: "purchase", "7d_click": "9" },
      { action_type: "purchase", "7d_click": "9" },
    ],
  },
];

/** A page belonging to another ad account. Its spend would land in this account's total. */
export const WRONG_ACCOUNT: readonly MetaInsightsRow[] = [
  {
    account_id: "000000000000002",
    account_currency: "THB",
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "1234.56",
  },
];

/** An empty string where a number belongs. `Number("")` is 0, which is why this is refused. */
export const UNPARSEABLE_SPEND: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    campaign_id: CAMPAIGN,
    spend: "",
  },
];

/** A campaign row with no campaign_id. Half the upsert key is missing. */
export const MISSING_CAMPAIGN_ID: readonly MetaInsightsRow[] = [
  {
    ...CURRENCY,
    date_start: "2026-08-14",
    date_stop: "2026-08-14",
    spend: "1234.56",
  },
];
