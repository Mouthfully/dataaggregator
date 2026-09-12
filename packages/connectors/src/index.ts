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
// GA4
// -------------------------------------------------------------------------------------------
export {
  GA4_DEFAULT_REPORT,
  runGa4Backfill,
  windowToRequest,
  type Ga4BackfillBatch,
  type Ga4BackfillOptions,
  type Ga4ReportDefinition,
} from "./sources/ga4/backfill.ts";
export {
  GA4_DATA_API_BASE,
  GA4_MAX_PAGE_ROWS,
  GA4_PAGE_ROWS,
  GA4_QUOTA_FLOOR,
  Ga4ClientError,
  parsePropertyQuota,
  quotaAllowsAnother,
  runReport,
  runReportPages,
  type Ga4ClientOptions,
  type Ga4Page,
  type Ga4PropertyQuota,
  type Ga4ReportRequest,
  type QuotaGroup,
} from "./sources/ga4/client.ts";
export {
  GA4_METRIC_MAP,
  Ga4NormalizeError,
  normalizeGa4Report,
  parseGa4Date,
  parseGa4Number,
  type Ga4NormalizeErrorCode,
  type Ga4Report,
  type NormalizeOptions,
} from "./sources/ga4/normalize.ts";

// -------------------------------------------------------------------------------------------
// Google Ads
//
// `search` is exported as `googleAdsSearch`. A bare `search` on a package barrel is a name every
// future source would want, and the first collision would be resolved by whoever lost the race.
// -------------------------------------------------------------------------------------------
export {
  GOOGLE_ADS_API_BASE,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_BUDGET_FLOOR,
  GoogleAdsClientError,
  budgetAllowsAnother,
  readBudget,
  search as googleAdsSearch,
  searchPages as googleAdsSearchPages,
  type GoogleAdsBudget,
  type GoogleAdsBudgetReading,
  type GoogleAdsClientOptions,
  type GoogleAdsPage,
} from "./sources/google_ads/client.ts";
export {
  GOOGLE_ADS_ACCOUNT_FIELDS,
  GOOGLE_ADS_ATTRIBUTION_WINDOW,
  GOOGLE_ADS_LEVELS,
  GOOGLE_ADS_METRIC_MAP,
  GoogleAdsNormalizeError,
  MICROS_PER_UNIT,
  googleAdsDate,
  microsToCurrency,
  normalizeGoogleAdsSearch,
  parseGoogleAdsNumber,
  type GoogleAdsLevel,
  type GoogleAdsLevelSpec,
  type GoogleAdsNormalizeErrorCode,
  type GoogleAdsNormalizeOptions,
  type GoogleAdsRow,
  type GoogleAdsSearchResponse,
} from "./sources/google_ads/normalize.ts";

// -------------------------------------------------------------------------------------------
// Meta Ads
// -------------------------------------------------------------------------------------------
export {
  META_DEFAULT_REPORT,
  MetaBackfillError,
  assertMetaReport,
  runMetaBackfill,
  type MetaBackfillBatch,
  type MetaBackfillErrorCode,
  type MetaBackfillOptions,
  type MetaReportDefinition,
} from "./sources/meta_ads/backfill.ts";
export {
  META_GRAPH_BASE,
  META_MAX_PAGE_ROWS,
  META_MAX_UNMEASURED_PAGES,
  META_PAGE_ROWS,
  META_UTILISATION_CEILING,
  MetaClientError,
  getAdAccount,
  getInsightsPage,
  getInsightsPages,
  parseMetaUsage,
  usageAllowsAnother,
  type MetaAdAccount,
  type MetaClientErrorCode,
  type MetaClientOptions,
  type MetaInsightsPage,
  type MetaInsightsRequest,
  type MetaUsage,
} from "./sources/meta_ads/client.ts";
export {
  META_ACTION_WINDOWS,
  META_CONVERSION_ACTIONS,
  META_METRIC_MAP,
  META_STRUCTURAL_FIELDS,
  MetaNormalizeError,
  metaAccountId,
  normalizeMetaInsights,
  parseMetaNumber,
  type MetaActionEntry,
  type MetaActionWindow,
  type MetaInsightsRow,
  type MetaLevel,
  type MetaNormalizeErrorCode,
  type MetaNormalizeOptions,
} from "./sources/meta_ads/normalize.ts";

// -------------------------------------------------------------------------------------------
// Search Console
// -------------------------------------------------------------------------------------------
export {
  SEARCH_CONSOLE_BACKFILL_CHUNK_DAYS,
  SEARCH_CONSOLE_DEFAULT_REPORTS,
  SearchConsoleBackfillError,
  orderSearchConsoleReports,
  runSearchConsoleBackfill,
  searchConsoleBackfillChunks,
  type SearchConsoleBackfillBatch,
  type SearchConsoleBackfillErrorCode,
  type SearchConsoleBackfillOptions,
  type SearchConsoleCheckpoint,
  type SearchConsoleReportName,
  type SearchConsoleSpan,
} from "./sources/search_console/backfill.ts";
export {
  SEARCH_CONSOLE_API_BASE,
  SEARCH_CONSOLE_DATA_STATE,
  SEARCH_CONSOLE_MAX_PAGE_ROWS,
  SEARCH_CONSOLE_MAX_PAGES,
  SEARCH_CONSOLE_PAGE_ROWS,
  SEARCH_CONSOLE_REPORTS,
  SEARCH_CONSOLE_SEARCH_TYPE,
  SEARCH_CONSOLE_SEARCH_TYPE_FIELD,
  SearchConsoleClientError,
  querySearchAnalytics,
  querySearchAnalyticsPages,
  searchAnalyticsUrl,
  type SearchAnalyticsRequest,
  type SearchConsoleClientOptions,
  type SearchConsolePage,
} from "./sources/search_console/client.ts";
export {
  SEARCH_CONSOLE_ANONYMITY_THRESHOLDED,
  SEARCH_CONSOLE_CURRENCY,
  SEARCH_CONSOLE_DIMENSIONS,
  SEARCH_CONSOLE_GRAINS,
  SEARCH_CONSOLE_METRIC_MAP,
  SEARCH_CONSOLE_NATIVE_ENTITY_TYPE,
  SEARCH_CONSOLE_TIMEZONE,
  SearchConsoleNormalizeError,
  grainFor,
  normalizeSearchAnalytics,
  parseSearchConsoleDate,
  parseSearchConsoleMetric,
  parseSearchConsolePosition,
  totalsByDate,
  type SearchAnalyticsResponse,
  type SearchAnalyticsRow,
  type SearchConsoleDateTotal,
  type SearchConsoleDimension,
  type SearchConsoleGrain,
  type SearchConsoleNormalizeErrorCode,
  type SearchConsoleNormalizeOptions,
  type SearchConsoleNormalizeResult,
} from "./sources/search_console/normalize.ts";

// -------------------------------------------------------------------------------------------
// WooCommerce
// -------------------------------------------------------------------------------------------
export {
  WOO_BACKFILL_CHUNK_DAYS,
  WooBackfillError,
  parseRfc3339,
  runWooBackfill,
  wooBackfillChunks,
  type WooBackfillBatch,
  type WooBackfillErrorCode,
  type WooBackfillOptions,
  type WooCheckpoint,
} from "./sources/woocommerce/backfill.ts";
export {
  WOO_API_PATH,
  WOO_FLOOR_MAX_PAGES,
  WOO_MAX_PAGES_PER_WINDOW,
  WOO_MAX_PER_PAGE,
  WOO_MAX_WINDOWS,
  WooClientError,
  basicAuthHeader,
  fetchOrdersPage,
  fetchOrdersPages,
  fetchOrdersWindow,
  normaliseStoreUrl,
  ordersUrl,
  probeStore,
  probeUrl,
  readPagination,
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
  WOO_FEE_META_KEYS,
  WooNormalizeError,
  assertWooTimezone,
  normalizeWooOrders,
  parseWooAmount,
  wooGmtToDate,
  wooPaymentFee,
  type WooNormalizeErrorCode,
  type WooNormalizeOptions,
  type WooOrder,
} from "./sources/woocommerce/normalize.ts";
