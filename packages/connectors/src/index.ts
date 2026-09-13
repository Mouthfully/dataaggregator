/**
 * The package barrel.
 *
 * EVERY IMPLEMENTED SOURCE BELONGS HERE, and three of them were missing. `google_ads`, `meta_ads`
 * and `search_console` each shipped a tested client and normaliser and then exported nothing at
 * all: fully working code that no other package could import. `woocommerce` exported its
 * normaliser and not the client that feeds it.
 *
 * It was a deliberate deferral that nobody picked up -- note 44 records it, "the barrel export is
 * owned by concurrent work, so the export lines are listed in the PR report rather than written
 * into a file another change holds". The PR report is not a file anyone reads twice.
 *
 * AND THEN IT HAPPENED AGAIN, ONE LAYER DOWN. The first pass at this file enumerated each module's
 * exports with a pattern that matched `export async function` and missed `export async function*`
 * -- so every single-page fetcher was exported and every PAGE WALKER was not. Those generators are
 * the ones a scheduled pull actually calls; `fetchOrdersWindow` carries a comment in its own module
 * saying "THIS IS THE ONE A SCHEDULED PULL SHOULD CALL". Five of them, invisible to a guard that
 * only asked whether the barrel MENTIONED each module. It now asks whether the barrel re-exports
 * every name each module exports, which is the question that was meant all along.
 *
 * WHAT MADE IT WORSE THAN AN OVERSIGHT: `check-capabilities.mjs` derives the marketing connector
 * claim from directories holding a client AND a normaliser, so the site said "Reads GA4, Google
 * Ads, Meta Ads, Search Console and WooCommerce" while the package exposed two of the five. The
 * claim was true about the tree and false about the product. That guard now also requires the
 * barrel to export each source, so claimable and reachable cannot drift apart again.
 */

// -------------------------------------------------------------------------------------------
// Air4Thai -- AMBIENT CONTEXT, AND THE FIRST SOURCE HERE THAT IS NOT A TENANT'S DATA.
//
// It is exported exactly like the other five and it is not like them in any other respect. There
// is no credential, no `connections` row, no `PROVIDER_LANES` entry and no per-tenant attribution:
// the readings land in the SHARED `public.ambient_readings`, and what a workspace owns is its
// subscription. See `sources/air4thai/client.ts` and
// `supabase/migrations/20260912000900_ambient_readings.sql`.
//
// `normalizeAir4Thai` returns `AmbientReading[]`, NOT `EnvelopeRow[]`. That is deliberate and
// documented in `normalize.ts`; a caller reaching for the envelope here is at the wrong door.
//
// There is no `backfill.ts`: the endpoint returns the whole network in one document with no
// cursor, so there is no window to walk. `check-capabilities.mjs` treats a backfill as optional
// precisely so an absent one is a fact rather than an unmet roadmap.
// -------------------------------------------------------------------------------------------
export {
  AIR4THAI_API_BASE,
  AIR4THAI_MIN_STATIONS,
  AIR4THAI_STATIONS_PATH,
  Air4ThaiClientError,
  type Air4ThaiClientErrorCode,
  type Air4ThaiClientOptions,
  type Air4ThaiSnapshot,
  fetchStations,
  stationsUrl,
} from "./sources/air4thai/client.ts";
export {
  AIR4THAI_MISSING,
  AIR4THAI_NON_MEASUREMENT_KEYS,
  AIR4THAI_PARAMETERS,
  AIR4THAI_TIMEZONE,
  AIR4THAI_UTC_OFFSET,
  type Air4ThaiAQILast,
  type Air4ThaiMeasurement,
  Air4ThaiNormalizeError,
  type Air4ThaiNormalizeErrorCode,
  type Air4ThaiNormalizeOptions,
  type Air4ThaiResponse,
  type Air4ThaiStation,
  AMBIENT_PARAMETERS,
  AMBIENT_UNITS,
  type AmbientParameter,
  type AmbientReading,
  type AmbientUnit,
  air4ThaiObservedAt,
  normalizeAir4Thai,
  parseAir4ThaiValue,
} from "./sources/air4thai/normalize.ts";

// -------------------------------------------------------------------------------------------
// GA4
// -------------------------------------------------------------------------------------------
export {
  GA4_DEFAULT_REPORT,
  type Ga4BackfillBatch,
  type Ga4BackfillOptions,
  type Ga4ReportDefinition,
  runGa4Backfill,
  windowToRequest,
} from "./sources/ga4/backfill.ts";
export {
  GA4_DATA_API_BASE,
  GA4_MAX_PAGE_ROWS,
  GA4_PAGE_ROWS,
  GA4_QUOTA_FLOOR,
  Ga4ClientError,
  type Ga4ClientOptions,
  type Ga4Page,
  type Ga4PropertyQuota,
  type Ga4ReportRequest,
  parsePropertyQuota,
  type QuotaGroup,
  quotaAllowsAnother,
  runReport,
  runReportPages,
} from "./sources/ga4/client.ts";
export {
  GA4_METRIC_MAP,
  Ga4NormalizeError,
  type Ga4NormalizeErrorCode,
  type Ga4Report,
  type NormalizeOptions,
  normalizeGa4Report,
  parseGa4Date,
  parseGa4Number,
} from "./sources/ga4/normalize.ts";

// -------------------------------------------------------------------------------------------
// Google Ads
//
// `search` is exported as `googleAdsSearch`. A bare `search` on a package barrel is a name every
// future source would want, and the first collision would be resolved by whoever lost the race.
// -------------------------------------------------------------------------------------------
export {
  budgetAllowsAnother,
  GOOGLE_ADS_API_BASE,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_BUDGET_FLOOR,
  type GoogleAdsBudget,
  type GoogleAdsBudgetReading,
  GoogleAdsClientError,
  type GoogleAdsClientOptions,
  type GoogleAdsPage,
  readBudget,
  search as googleAdsSearch,
  searchPages as googleAdsSearchPages,
} from "./sources/google_ads/client.ts";
export {
  GOOGLE_ADS_ACCOUNT_FIELDS,
  GOOGLE_ADS_ATTRIBUTION_WINDOW,
  GOOGLE_ADS_LEVELS,
  GOOGLE_ADS_METRIC_MAP,
  type GoogleAdsLevel,
  type GoogleAdsLevelSpec,
  GoogleAdsNormalizeError,
  type GoogleAdsNormalizeErrorCode,
  type GoogleAdsNormalizeOptions,
  type GoogleAdsRow,
  type GoogleAdsSearchResponse,
  googleAdsDate,
  MICROS_PER_UNIT,
  microsToCurrency,
  normalizeGoogleAdsSearch,
  parseGoogleAdsNumber,
} from "./sources/google_ads/normalize.ts";

// -------------------------------------------------------------------------------------------
// Loyverse -- THE FIRST POINT OF SALE, and the first source whose read-only guarantee is enforced
// by the TOKEN rather than by our own restraint.
//
// `58-plan-reconciliation.md` section 1.5 splits the sources two ways: those where read-only is a
// property of the credential, and those where it is a promise about our code. Loyverse is in the
// first group -- granular `*_READ` OAuth scopes -- and that is the entire reason it is the pilot
// POS rather than the market leader.
//
// It also carries a REFUSAL that no other source here has: Loyverse issues a personal access
// token that its own specification says "gives unlimited access to the targeted account", and
// `assertReadOnlyCredential` rejects one by name. That name is exported because it is the refusal
// itself, not a helper -- a caller wanting to check a credential before a run should be able to.
//
// Exported here for the same reason as every other source: `scripts/check-capabilities.mjs` treats
// a connector the barrel does not export as one no other package can import, and the connector
// claim in `packages/brand` counts it as implemented either way. A source claimed and unreachable
// makes the marketing sentence true about the tree and false about the product.
// -------------------------------------------------------------------------------------------
export {
  LOYVERSE_BACKFILL_CHUNK_DAYS,
  type LoyverseBackfillBatch,
  LoyverseBackfillError,
  type LoyverseBackfillErrorCode,
  type LoyverseBackfillOptions,
  type LoyverseCheckpoint,
  loyverseBackfillChunks,
  parseLoyverseInstant,
  runLoyverseBackfill,
} from "./sources/loyverse/backfill.ts";
export {
  assertReadOnlyCredential,
  assertWindow as assertLoyverseWindow,
  EMPTY_RATE_BUDGET,
  fetchMerchant,
  fetchReceiptsPage,
  fetchReceiptsPages,
  LOYVERSE_API_BASE,
  LOYVERSE_MAX_LIMIT,
  LOYVERSE_MAX_PAGES,
  LOYVERSE_MERCHANT_PATH,
  LOYVERSE_PAGE_LIMIT,
  LOYVERSE_RATE_FLOOR,
  LOYVERSE_RATE_REQUESTS,
  LOYVERSE_RATE_WINDOW_MS,
  LOYVERSE_RECEIPTS_PATH,
  LOYVERSE_SCOPES,
  LoyverseClientError,
  type LoyverseClientErrorCode,
  type LoyverseCredential,
  type LoyverseFetchOptions,
  type LoyverseMerchant,
  type LoyverseRateBudget,
  type LoyverseReceiptsPage,
  type LoyverseReceiptsQuery,
  type LoyverseWalkOptions,
  type LoyverseWindow,
  merchantUrl,
  rateAllowsAnother,
  receiptsUrl,
  spendRequest,
} from "./sources/loyverse/client.ts";
export {
  assertLoyverseTimezone,
  LOYVERSE_NATIVE_ENTITY_TYPE,
  LOYVERSE_RECEIPT_TYPES,
  loyverseInstantToDate,
  LoyverseNormalizeError,
  type LoyverseNormalizeErrorCode,
  type LoyverseNormalizeOptions,
  type LoyverseReceipt,
  type LoyverseReceiptType,
  normalizeLoyverseReceipts,
  parseLoyverseMoney,
  receiptRevenue,
  receiptTypeOf,
} from "./sources/loyverse/normalize.ts";

// -------------------------------------------------------------------------------------------
// Meta Ads
// -------------------------------------------------------------------------------------------
export {
  assertMetaReport,
  META_DEFAULT_REPORT,
  type MetaBackfillBatch,
  MetaBackfillError,
  type MetaBackfillErrorCode,
  type MetaBackfillOptions,
  type MetaReportDefinition,
  runMetaBackfill,
} from "./sources/meta_ads/backfill.ts";
export {
  getAdAccount,
  getInsightsPage,
  getInsightsPages,
  META_GRAPH_BASE,
  META_MAX_PAGE_ROWS,
  META_MAX_UNMEASURED_PAGES,
  META_PAGE_ROWS,
  META_UTILISATION_CEILING,
  type MetaAdAccount,
  MetaClientError,
  type MetaClientErrorCode,
  type MetaClientOptions,
  type MetaInsightsPage,
  type MetaInsightsRequest,
  type MetaUsage,
  parseMetaUsage,
  usageAllowsAnother,
} from "./sources/meta_ads/client.ts";
export {
  META_ACTION_WINDOWS,
  META_CONVERSION_ACTIONS,
  META_METRIC_MAP,
  META_STRUCTURAL_FIELDS,
  type MetaActionEntry,
  type MetaActionWindow,
  type MetaInsightsRow,
  type MetaLevel,
  MetaNormalizeError,
  type MetaNormalizeErrorCode,
  type MetaNormalizeOptions,
  metaAccountId,
  normalizeMetaInsights,
  parseMetaNumber,
} from "./sources/meta_ads/normalize.ts";

// -------------------------------------------------------------------------------------------
// Search Console
// -------------------------------------------------------------------------------------------
export {
  orderSearchConsoleReports,
  runSearchConsoleBackfill,
  SEARCH_CONSOLE_BACKFILL_CHUNK_DAYS,
  SEARCH_CONSOLE_DEFAULT_REPORTS,
  type SearchConsoleBackfillBatch,
  SearchConsoleBackfillError,
  type SearchConsoleBackfillErrorCode,
  type SearchConsoleBackfillOptions,
  type SearchConsoleCheckpoint,
  type SearchConsoleReportName,
  type SearchConsoleSpan,
  searchConsoleBackfillChunks,
} from "./sources/search_console/backfill.ts";
export {
  querySearchAnalytics,
  querySearchAnalyticsPages,
  SEARCH_CONSOLE_API_BASE,
  SEARCH_CONSOLE_DATA_STATE,
  SEARCH_CONSOLE_MAX_PAGE_ROWS,
  SEARCH_CONSOLE_MAX_PAGES,
  SEARCH_CONSOLE_PAGE_ROWS,
  SEARCH_CONSOLE_REPORTS,
  SEARCH_CONSOLE_SEARCH_TYPE,
  SEARCH_CONSOLE_SEARCH_TYPE_FIELD,
  type SearchAnalyticsRequest,
  SearchConsoleClientError,
  type SearchConsoleClientOptions,
  type SearchConsolePage,
  searchAnalyticsUrl,
} from "./sources/search_console/client.ts";
export {
  grainFor,
  normalizeSearchAnalytics,
  parseSearchConsoleDate,
  parseSearchConsoleMetric,
  parseSearchConsolePosition,
  SEARCH_CONSOLE_ANONYMITY_THRESHOLDED,
  SEARCH_CONSOLE_CURRENCY,
  SEARCH_CONSOLE_DIMENSIONS,
  SEARCH_CONSOLE_GRAINS,
  SEARCH_CONSOLE_METRIC_MAP,
  SEARCH_CONSOLE_NATIVE_ENTITY_TYPE,
  SEARCH_CONSOLE_TIMEZONE,
  type SearchAnalyticsResponse,
  type SearchAnalyticsRow,
  type SearchConsoleDateTotal,
  type SearchConsoleDimension,
  type SearchConsoleGrain,
  SearchConsoleNormalizeError,
  type SearchConsoleNormalizeErrorCode,
  type SearchConsoleNormalizeOptions,
  type SearchConsoleNormalizeResult,
  totalsByDate,
} from "./sources/search_console/normalize.ts";

// -------------------------------------------------------------------------------------------
// WooCommerce
// -------------------------------------------------------------------------------------------
export {
  parseRfc3339,
  runWooBackfill,
  WOO_BACKFILL_CHUNK_DAYS,
  type WooBackfillBatch,
  WooBackfillError,
  type WooBackfillErrorCode,
  type WooBackfillOptions,
  type WooCheckpoint,
  wooBackfillChunks,
} from "./sources/woocommerce/backfill.ts";
export {
  basicAuthHeader,
  fetchOrdersPage,
  fetchOrdersPages,
  fetchOrdersWindow,
  normaliseStoreUrl,
  ordersUrl,
  probeStore,
  probeUrl,
  readPagination,
  WOO_API_PATH,
  WOO_FLOOR_MAX_PAGES,
  WOO_MAX_PAGES_PER_WINDOW,
  WOO_MAX_PER_PAGE,
  WOO_MAX_WINDOWS,
  WooClientError,
  type WooClientErrorCode,
  type WooCredential,
  type WooFetchOptions,
  type WooOrdersQuery,
  type WooPage,
  type WooProbe,
  type WooSplit,
  type WooWalkOptions,
  type WooWindow,
  type WooWindowPage,
} from "./sources/woocommerce/client.ts";
export {
  assertWooTimezone,
  normalizeWooOrders,
  parseWooAmount,
  WOO_FEE_META_KEYS,
  WooNormalizeError,
  type WooNormalizeErrorCode,
  type WooNormalizeOptions,
  type WooOrder,
  wooGmtToDate,
  wooPaymentFee,
} from "./sources/woocommerce/normalize.ts";
