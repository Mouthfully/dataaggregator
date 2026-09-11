/**
 * Every source the envelope can carry a row from.
 *
 * Scope is section 11.9's narrowing, not the artboard's twenty-two: Google Ads, GA4, Search Console,
 * Meta and one affiliate network, with SERP bought wholesale from DataForSEO. There is deliberately
 * no `market` source -- section 11.5 drops that module -- and no TikTok, Microsoft or Amazon, which
 * section 9's exclusion list defers.
 */
export const SOURCES = [
  "google_ads",
  "meta_ads",
  "ga4",
  "search_console",
  "impact",
  "awin",
  "cj",
  "partnerstack",
  "dataforseo_serp",
  "ai_answers",

  // 11A.14 substituted the LAUNCH SET, not the vocabulary. `woocommerce` is APPENDED, never
  // inserted, and nothing above it is removed: Postgres orders an enum by definition order, so a
  // mid-list insert would silently rewrite every ORDER BY on the column, and dropping a value is
  // a migration hazard with no upside. Google Ads, Meta and Search Console stay in the dictionary
  // and move behind the fifth-connector gate -- a build order is not a vocabulary. Stripe is
  // appended for the same enum-migration reason when settlement truth precedes another shop feed.
  "woocommerce",
  "stripe",
] as const;

export type Source = (typeof SOURCES)[number];
