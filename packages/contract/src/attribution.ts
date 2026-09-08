/**
 * Attribution windows.
 *
 * Specification section 2: "Attribution window is a dimension, not a setting. The API refuses to
 * emit an unlabelled conversion count."
 *
 * This is the strongest strategic finding in the research (section 7): no public schema models the
 * attribution window as a dimension, `dbt_ad_reporting` included, where conversions collapse to a
 * single column -- while Meta returns 1d/7d/28d click and view plus dda and incrementality on the
 * same row. A conversion count without its window is not a smaller truth, it is a different number
 * every time the default changes underneath you.
 *
 * There is deliberately NO "unknown" or "default" member. Where a platform does not expose
 * selectable windows on a row, the label says what the platform actually did:
 *
 *   account_default  Google Ads applies a per-account, per-conversion-action setting (section 7).
 *   model            GA4 adjusts at model level rather than by a selectable window (section 7).
 *
 * Both are labels, not absences. Meta's own list is reproduced verbatim; `value` in Meta's API is
 * documented only as "Metric value of default attribution window", and the default is never named,
 * which is exactly the ambiguity this type exists to remove.
 */
export const ATTRIBUTION_WINDOWS = [
  "1d_click",
  "7d_click",
  "28d_click",
  "1d_view",
  "7d_view",
  "28d_view",
  "1d_ev",
  "dda",
  "incrementality",
  "inline",
  "custom",
  "account_default",
  "model",
] as const;

export type AttributionWindow = (typeof ATTRIBUTION_WINDOWS)[number];
