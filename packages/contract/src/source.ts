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
] as const;

export type Source = (typeof SOURCES)[number];
