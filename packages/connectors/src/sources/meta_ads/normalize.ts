/**
 * Meta Ads -> envelope.
 *
 * The `normalize` half of the connector unit (specification section 13.3), and the half where this
 * source is unlike every other one in the repository: GA4 hands back one number per metric per day,
 * and Meta hands back THE SAME CONVERSION SEVERAL TIMES OVER, once per attribution window, on one
 * row. Section 7 calls that the strongest strategic finding in the whole research -- no public
 * schema, `dbt_ad_reporting` included, models the window as a dimension -- and it is the reason
 * `attribution_window` is in the upsert key rather than in a footnote.
 *
 * FIVE META-SPECIFIC TRAPS, each of which produces plausible wrong numbers rather than an error.
 *
 * 1. ONE INSIGHTS ROW IS NOT ONE ENVELOPE ROW. `actions` carries `{action_type, value, 1d_click,
 *    7d_click, 28d_click, 1d_view, ...}`: the same purchase counted under every window that claims
 *    it. Flattening that into one envelope row either sums the windows -- six copies of one sale --
 *    or silently keeps whichever key was read last. So one insights row fans out into one row PER
 *    REQUESTED WINDOW, keyed apart by `envelope_rows_pkey`
 *    `(workspace, source, account_id, entity_id, date, attribution_window)`.
 *
 * 2. SPEND IS NOT ATTRIBUTED AND MUST NOT BE COPIED ONTO THE WINDOW ROWS. `spend`, `impressions`
 *    and `clicks` are the same number whatever window you ask for; writing them onto all six window
 *    rows makes `sum(spend)` six times the truth for anyone who does not know to filter first. They
 *    go on ONE row per entity-day, with `attribution_window` null -- which the envelope allows
 *    precisely because a window on a delivery-only row would be, in its own words, "a label with
 *    nothing to label". `spend` is deliberately absent from `COMMERCE_METRICS`, so that row is
 *    legal on a campaign entity; a commerce metric there would not be.
 *
 * 3. `value` IS NEVER READ. Meta documents it only as "Metric value of default attribution window"
 *    and NEVER NAMES THE DEFAULT (section 7). Reading it would emit a conversion count whose window
 *    we cannot label -- exactly the row section 2 says the API refuses. The connector asks for its
 *    windows explicitly and reads only those keys; `value` is carried in `raw` and nowhere else.
 *
 * 4. NOT EVERY `action_type` IS A CONVERSION. A default Meta response includes `link_click`,
 *    `landing_page_view`, `post_engagement`, `video_view`. Summing the array is how a connector
 *    reports four thousand conversions on a day with nine sales. Only the configured action types
 *    are counted, and `purchase`, `omni_purchase` and `offsite_conversion.fb_pixel_purchase` are
 *    three names for one sale, so configuring two of them is refused rather than added up.
 *
 * 5. CURRENCY COMES FROM THE ACCOUNT AND THE TIMEZONE IS NOT IN THE RESPONSE AT ALL. Currency
 *    arrives as `account_currency` on the row; the insights edge publishes no timezone, while every
 *    `date_start` it returns is a day boundary in the AD ACCOUNT'S timezone. Defaulting it to UTC
 *    would slide every Thai advertiser's day by seven hours and still parse. It is a required
 *    option here, read from the ad account node by `getAdAccount` in `client.ts`.
 *
 * BUILT ON AN OPEN QUESTION, and this is the one that matters most here. Whether Meta's 28-day
 * clock starts at DELIVERY or at FIRST REPORT is unresolved in Meta's own documentation, per both
 * the specification's researcher and its fact-checker. This module does not decide it: it asks
 * `@repo/contract`, which anchors on `first_seen_at` and says why. See section 5 of
 * `45-meta-ads-connector.md`.
 */

import type { AttributionWindow, EnvelopeRow, MetricName } from "@repo/contract";
import { isProvisional, restatesUntil } from "@repo/contract";

/** The reporting levels this connector pulls. Meta's own words, not the canonical grain's. */
export type MetaLevel = "account" | "campaign" | "adset" | "ad";

/**
 * The windows this connector will ask `action_attribution_windows` for.
 *
 * A SUBSET OF THE CONTRACT'S VOCABULARY, and deliberately so. `ATTRIBUTION_WINDOWS` also carries
 * `dda`, `incrementality`, `inline` and `custom` because Meta reports them somewhere; whether the
 * `action_attribution_windows` query parameter accepts those values is unverified against a live
 * call, and asking for a value the parameter rejects fails the whole request. The seven below are
 * the ones the specification lists as Meta's selectable click/view windows.
 */
export const META_ACTION_WINDOWS = [
  "1d_click",
  "7d_click",
  "28d_click",
  "1d_view",
  "7d_view",
  "28d_view",
  "1d_ev",
] as const satisfies readonly AttributionWindow[];

export type MetaActionWindow = (typeof META_ACTION_WINDOWS)[number];

/**
 * Meta's field names to the shared dictionary.
 *
 * Three entries, and the shortness is the decision. Meta will also return `cpc`, `cpm`, `ctr`,
 * `cost_per_action_type` and a dozen other RATIOS, every one of which this product can compute from
 * the three below -- and every one of which is a different number when it is computed over a
 * different denominator than the one Meta used. Storing a ratio we cannot reproduce is storing a
 * number nobody can audit, which section 7 requires of every figure on the row.
 *
 * Section 13.3 rule 2 stands: a new metric requires a dictionary change first. Anything outside
 * this map and `META_STRUCTURAL_FIELDS` is REFUSED rather than dropped -- see `unmapped_field`.
 */
export const META_METRIC_MAP: Readonly<Record<string, MetricName>> = {
  spend: "spend",
  impressions: "impressions",
  clicks: "clicks",
};

/**
 * Fields that carry structure rather than a metric.
 *
 * AN ALLOW-LIST, for the reason `@repo/payloads` gives for using one: a deny-list has to predict
 * what Meta will add next, and the first field it adds ships unrecognised. Here an unrecognised
 * field is a loud failure instead, which is what makes "widen the `fields` list without adding a
 * dictionary entry" impossible to do quietly. The cost is that a field Meta starts returning
 * uninvited fails a pull; that is the right way round, and it is flagged in section 5 of the note
 * as the thing one live call would settle.
 */
export const META_STRUCTURAL_FIELDS: ReadonlySet<string> = new Set([
  "date_start",
  "date_stop",
  "account_id",
  "account_name",
  "account_currency",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "actions",
  "action_values",
]);

/**
 * The action types that count as a conversion, by default.
 *
 * ONE ENTRY, because Meta has several names for one sale -- `purchase`, `omni_purchase`,
 * `offsite_conversion.fb_pixel_purchase`, `onsite_web_purchase` -- and any two of them summed is
 * one sale counted twice. `conversionActions` overrides this per account, because which name an
 * account reports under depends on how its pixel and conversions API are set up, and that is a
 * fact about the customer rather than about the platform.
 */
export const META_CONVERSION_ACTIONS: readonly string[] = ["purchase"];

export type MetaNormalizeErrorCode =
  | "missing_currency"
  | "missing_timezone"
  | "missing_date"
  | "aggregated_range"
  | "missing_entity_id"
  | "account_mismatch"
  | "unmapped_field"
  | "unparseable_value"
  | "no_attribution_window"
  | "duplicate_action_type"
  | "conversion_action_overlap";

export class MetaNormalizeError extends Error {
  constructor(
    message: string,
    readonly code: MetaNormalizeErrorCode,
  ) {
    super(message);
    this.name = "MetaNormalizeError";
  }
}

/**
 * One entry of `actions` or `action_values`.
 *
 * The window keys are an index signature rather than named properties because WHICH of them appear
 * is decided by the request, not by the type: ask for `7d_click` alone and that is the only key
 * that comes back. `value` is declared so its presence is visible to a reader of this file, and it
 * is never read -- see trap 3.
 */
export interface MetaActionEntry {
  readonly action_type?: string;
  /** "Metric value of default attribution window", with the default never named. Never read. */
  readonly value?: string;
  readonly [window: string]: unknown;
}

/** The subset of an `/insights` row this reads. */
export interface MetaInsightsRow {
  readonly date_start?: string;
  readonly date_stop?: string;
  readonly account_id?: string;
  readonly account_currency?: string;
  readonly campaign_id?: string;
  readonly adset_id?: string;
  readonly ad_id?: string;
  readonly actions?: readonly MetaActionEntry[];
  readonly action_values?: readonly MetaActionEntry[];
  readonly [field: string]: unknown;
}

interface LevelShape {
  readonly type: EnvelopeRow["entity"]["type"];
  /** What Meta calls it. The envelope carries this verbatim rather than hiding it. */
  readonly native: string;
  readonly idField: string;
  readonly nameField: string;
  readonly parentField: string | null;
}

/**
 * Level -> canonical grain.
 *
 * `adset` -> `ad_group` IS THE CASE THE ENVELOPE WAS WRITTEN FOR: `entitySchema`'s own comment says
 * "Meta says 'adset' where the canonical grain says 'ad_group'". Both words survive -- `type` is
 * the canonical one so a cross-source query works, `native_entity_type` is Meta's so a customer
 * comparing against Ads Manager recognises the row.
 */
const LEVEL_SHAPE: Readonly<Record<MetaLevel, LevelShape>> = {
  account: {
    type: "account",
    native: "account",
    idField: "account_id",
    nameField: "account_name",
    parentField: null,
  },
  campaign: {
    type: "campaign",
    native: "campaign",
    idField: "campaign_id",
    nameField: "campaign_name",
    parentField: null,
  },
  adset: {
    type: "ad_group",
    native: "adset",
    idField: "adset_id",
    nameField: "adset_name",
    parentField: "campaign_id",
  },
  ad: {
    type: "ad",
    native: "ad",
    idField: "ad_id",
    nameField: "ad_name",
    parentField: "adset_id",
  },
};

/**
 * The ad account id in one canonical spelling.
 *
 * Meta takes `act_1234` in a URL path and returns `1234` in `account_id` on the row. Left as-is,
 * the same account writes rows under two different `account_id` values and the upsert key stops
 * matching -- every re-pull inserting a second copy rather than updating the first. Returns null
 * rather than throwing so each caller can raise the error its own layer names.
 */
export function metaAccountId(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

/**
 * Parse a Meta numeric value.
 *
 * Every number Meta returns is a STRING: `"spend": "1234.56"`. Added to another string metric it
 * concatenates, and `Number("")` is 0 rather than NaN, so an empty value coerces to a number that
 * is indistinguishable from a real zero. Refused instead, for the reason GA4 refuses: a wrong zero
 * is the one wrong answer nothing downstream can detect.
 */
export function parseMetaNumber(value: unknown, field: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MetaNormalizeError(`meta_ads: ${field} is ${String(value)}`, "unparseable_value");
    }
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new MetaNormalizeError(
      `meta_ads: ${field} is ${JSON.stringify(value)}, which is not a number Meta could have ` +
        "returned. Refusing rather than coercing to zero, because a wrong zero is " +
        "indistinguishable from a real one.",
      "unparseable_value",
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new MetaNormalizeError(
      `meta_ads: ${field} is ${JSON.stringify(value)}, which is not a number. Refusing rather ` +
        "than coercing to zero.",
      "unparseable_value",
    );
  }
  return parsed;
}

/**
 * The family a conversion action belongs to: the segment after the last `.` or `_`.
 *
 * `purchase`, `omni_purchase` and `offsite_conversion.fb_pixel_purchase` all reduce to `purchase`,
 * which is the point -- they are three reports of one sale. Two configured action types that reduce
 * to the same family are refused, because adding them is a double count that looks like growth.
 */
function actionFamily(actionType: string): string {
  const afterDot = actionType.slice(actionType.lastIndexOf(".") + 1);
  return afterDot.slice(afterDot.lastIndexOf("_") + 1);
}

function assertNoOverlap(conversionActions: readonly string[]): void {
  const byFamily = new Map<string, string>();
  for (const action of conversionActions) {
    const family = actionFamily(action);
    const previous = byFamily.get(family);
    if (previous !== undefined) {
      throw new MetaNormalizeError(
        `meta_ads: ${JSON.stringify(previous)} and ${JSON.stringify(action)} are both ` +
          `${JSON.stringify(family)} actions. Meta reports one sale under several names, so ` +
          "counting both adds the same conversion twice. Configure the one this account reports.",
        "conversion_action_overlap",
      );
    }
    byFamily.set(family, action);
  }
}

/**
 * Sum one attribution window across the action entries that count as conversions.
 *
 * AN ABSENT WINDOW KEY CONTRIBUTES NOTHING, AND THE ROW IS STILL EMITTED WITH A ZERO. Meta omits a
 * window key it has nothing to report under, so absent means "no conversions credited in this
 * window" -- and a day that really is zero has to be WRITTEN, not skipped. A restatement can move a
 * count DOWN to zero, and a connector that stops emitting the row leaves yesterday's higher number
 * standing in the store forever with nothing to correct it.
 */
function sumWindow(
  entries: readonly MetaActionEntry[],
  window: MetaActionWindow,
  conversionActions: readonly string[],
  field: string,
): number {
  const seen = new Set<string>();
  let total = 0;

  for (const entry of entries) {
    const actionType = entry.action_type;
    if (typeof actionType !== "string" || !conversionActions.includes(actionType)) continue;

    // Two entries for one action type would each be summed, which is the same double count as an
    // overlapping family arriving by a different route. Refuse: this is a response shape this
    // connector does not model, not a number to guess at.
    if (seen.has(actionType)) {
      throw new MetaNormalizeError(
        `meta_ads: ${field} carries ${JSON.stringify(actionType)} twice. Summing both would ` +
          "count the same conversions twice; this response shape is not modelled.",
        "duplicate_action_type",
      );
    }
    seen.add(actionType);

    const raw = entry[window];
    if (raw === undefined || raw === null) continue;
    total += parseMetaNumber(raw, `${field}.${actionType}.${window}`);
  }

  return total;
}

export interface MetaNormalizeOptions {
  readonly rows: readonly MetaInsightsRow[];
  readonly level: MetaLevel;
  /** The ad account the pull was for, in either spelling. */
  readonly adAccountId: string;
  /**
   * IANA name for the ad account, from `getAdAccount`. Required, because the insights edge does not
   * return it and every `date_start` is a day boundary in it.
   */
  readonly timezone: string;
  /** Exactly the windows the request asked Meta for. One envelope row each. */
  readonly attributionWindows: readonly MetaActionWindow[];
  /** Defaults to `META_CONVERSION_ACTIONS`. */
  readonly conversionActions?: readonly string[];
  /** RFC3339. When this pull happened. */
  readonly fetchedAt: string;
  /** RFC3339. Immutable per row; see @repo/contract's restatement note. */
  readonly firstSeenAt: string;
}

/**
 * Turn one page of `/insights` rows into envelope rows.
 *
 * Fan-out per insights row is `1 + attributionWindows.length` at most: one delivery row carrying
 * spend, impressions and clicks with no window, and one attributed row per window carrying
 * conversions and conversions_value. Either half is omitted when Meta reported nothing for it --
 * a delivery row with no metrics and an attributed row with no `actions` are both noise.
 *
 * Throws rather than skipping a bad row, like every other normaliser here. A connector that drops
 * rows quietly produces a total that is too low, which is the failure this product sells against.
 */
export function normalizeMetaInsights(options: MetaNormalizeOptions): EnvelopeRow[] {
  const conversionActions = options.conversionActions ?? META_CONVERSION_ACTIONS;
  assertNoOverlap(conversionActions);

  if (options.attributionWindows.length === 0) {
    // Meta would then answer under its own default, which its documentation never names. An
    // unnamed window is exactly the unlabelled conversion count section 2 refuses to emit.
    throw new MetaNormalizeError(
      "meta_ads: no attribution window was requested. Meta's default is never named in its own " +
        "documentation, so a count returned under it cannot be labelled and must not be stored.",
      "no_attribution_window",
    );
  }

  if (options.timezone.trim() === "") {
    throw new MetaNormalizeError(
      "meta_ads: no timezone. The insights edge does not return one and every date it reports is " +
        "a day boundary in the ad account's timezone, so defaulting to UTC would move a Bangkok " +
        "advertiser's day by seven hours and still parse. Read it from the ad account node.",
      "missing_timezone",
    );
  }

  const account = metaAccountId(options.adAccountId);
  if (account === null) {
    throw new MetaNormalizeError(
      "meta_ads: no ad account id. It is half of the upsert key.",
      "missing_entity_id",
    );
  }

  const shape = LEVEL_SHAPE[options.level];
  const rows: EnvelopeRow[] = [];

  for (const [index, row] of options.rows.entries()) {
    // Refuse an unrecognised field BEFORE emitting anything from the row, so a widened `fields`
    // list is a visible failure rather than a row that is quietly missing a metric.
    for (const field of Object.keys(row)) {
      // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so a field called `toString`
      // would pass the check and then be read as a metric that does not exist.
      if (META_STRUCTURAL_FIELDS.has(field) || Object.hasOwn(META_METRIC_MAP, field)) continue;
      throw new MetaNormalizeError(
        `meta_ads: row ${index} carries ${JSON.stringify(field)}, which is neither a structural ` +
          "field nor a dictionary metric. Section 13.3 requires a dictionary change before a " +
          "connector emits a new metric; dropping it silently is what that rule exists to prevent.",
        "unmapped_field",
      );
    }

    const date = row.date_start;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new MetaNormalizeError(
        `meta_ads: row ${index} has no usable date_start (${JSON.stringify(date)}). Every ` +
          "envelope row is keyed on a date.",
        "missing_date",
      );
    }

    // A RANGE, NOT A DAY, AND THE MOST EXPENSIVE MISREAD AVAILABLE. Without `time_increment=1`
    // Meta returns ONE row for the whole window, and `date_start` alone reads as a single day --
    // so a month of spend lands on the 1st and every other day reads as zero. Both the client and
    // this refuse it, because the request that produces it is one forgotten parameter away.
    if (row.date_stop !== date) {
      throw new MetaNormalizeError(
        `meta_ads: row ${index} spans ${date} to ${String(row.date_stop)}. That is an aggregate ` +
          "over the window, not a day, and storing it under date_start would put the whole " +
          "window's spend on its first day. Send time_increment=1.",
        "aggregated_range",
      );
    }

    const rowAccount = typeof row.account_id === "string" ? metaAccountId(row.account_id) : null;
    if (rowAccount !== null && rowAccount !== account) {
      // A page belonging to another account would write rows under this account's key. Cheap to
      // check, and the only symptom otherwise is one customer's spend appearing in another's total.
      throw new MetaNormalizeError(
        `meta_ads: row ${index} belongs to ${rowAccount}, not to ${account}.`,
        "account_mismatch",
      );
    }

    const currency = row.account_currency;
    if (typeof currency !== "string" || currency.trim() === "") {
      // Defaulting would label a THB account's spend as USD, at roughly 32x the truth.
      throw new MetaNormalizeError(
        `meta_ads: row ${index} carries no account_currency. The envelope requires it, and ` +
          "guessing would mislabel every monetary value on the row. Add it to the fields list.",
        "missing_currency",
      );
    }

    const entityId =
      options.level === "account" ? account : (row[shape.idField] as string | undefined);
    if (typeof entityId !== "string" || entityId.trim() === "") {
      throw new MetaNormalizeError(
        `meta_ads: row ${index} has no ${shape.idField} at level ${options.level}. It is half of ` +
          "the upsert key, and a row without it cannot be updated by the next pull.",
        "missing_entity_id",
      );
    }

    const name = row[shape.nameField];
    const parent = shape.parentField === null ? undefined : row[shape.parentField];
    const entity: EnvelopeRow["entity"] = {
      type: shape.type,
      id: entityId,
      account_id: account,
      native_entity_type: shape.native,
      native_id: entityId,
      ...(typeof name === "string" && name !== "" ? { name } : {}),
      ...(typeof parent === "string" && parent !== "" ? { parent_id: parent } : {}),
    };

    const restates = restatesUntil({ source: "meta_ads", date, firstSeenAt: options.firstSeenAt });
    const base = {
      source: "meta_ads",
      entity,
      fetched_at: options.fetchedAt,
      // Meta publishes no per-row "last updated" timestamp -- insights "refresh every 15 minutes"
      // is a cadence, not a stamp on the row. Null rather than a copy of fetched_at, which would
      // assert a freshness the platform never reported.
      source_updated_at: null,
      restates_until: restates,
      // DERIVED, not asserted. The contract owns the rule; the connector asks it. See ga4.
      is_provisional: isProvisional(restates, new Date(options.fetchedAt)),
      first_seen_at: options.firstSeenAt,
      // Meta reports in the ad account's own currency and converts nothing. The FX layer fills
      // these when it converts to the workspace's currency.
      fx_source: null,
      fx_rate_date: null,
      fx_rate: null,
      fx_base: null,
      raw: row,
    } satisfies Omit<EnvelopeRow, "dimensions" | "metrics">;

    // --- The delivery row: what was spent and what it reached. No window, because none applies.
    const delivery: Partial<Record<MetricName, number>> = {};
    for (const [field, metric] of Object.entries(META_METRIC_MAP)) {
      const value = row[field];
      // ABSENT AND ZERO ARE DIFFERENT. Meta omits a field it has nothing for, and an omitted
      // metric must stay omitted -- writing 0 asserts Meta reported one.
      if (value === undefined || value === null) continue;
      delivery[metric] = parseMetaNumber(value, field);
    }
    if (Object.keys(delivery).length > 0) {
      rows.push({
        ...base,
        dimensions: { date, currency, timezone: options.timezone, attribution_window: null },
        metrics: delivery,
      });
    }

    // --- The attributed rows: one per window, because that is what Meta actually reported.
    const actions = row.actions;
    const actionValues = row.action_values;
    if (actions === undefined && actionValues === undefined) continue;

    for (const window of options.attributionWindows) {
      const metrics: Partial<Record<MetricName, number>> = {};
      if (actions !== undefined) {
        metrics.conversions = sumWindow(actions, window, conversionActions, "actions");
      }
      if (actionValues !== undefined) {
        metrics.conversions_value = sumWindow(
          actionValues,
          window,
          conversionActions,
          "action_values",
        );
      }
      rows.push({
        ...base,
        dimensions: { date, currency, timezone: options.timezone, attribution_window: window },
        metrics,
      });
    }
  }

  return rows;
}
