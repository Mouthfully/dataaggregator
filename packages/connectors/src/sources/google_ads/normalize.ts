/**
 * Google Ads -> envelope.
 *
 * The connector unit shape is specification section 13.3: `sources/<name>/{client, normalize,
 * backfill, fixtures, contract.test}`. This is the `normalize` half, and it is modelled on
 * `sources/ga4/normalize.ts` deliberately -- same provider, same OAuth, same envelope -- so the
 * places it DIVERGES are the places Google Ads is genuinely a different platform.
 *
 * SIX GOOGLE ADS TRAPS, each of which produces a plausible wrong number rather than an error.
 *
 * 1. MONEY ARRIVES IN MICROS. `metrics.cost_micros` is millionths of a currency unit: 1,234,560,000
 *    is 1,234.56, not 1.23 billion. Dividing wrong -- or not at all -- is a silent six-orders-of-
 *    magnitude error in the headline number this product exists to be trusted on. And the mistake
 *    is not symmetrical across the response: `metrics.conversions_value` is NOT in micros. Two
 *    money metrics on one row, scaled differently, is why the conversion is per-metric table data
 *    (`micros: true`) rather than a rule about currency units.
 *
 * 2. int64 IS A STRING, double IS A NUMBER, AND EITHER MAY ARRIVE AS EITHER. proto3's JSON mapping
 *    encodes int64 as a decimal string (`"18422"`) precisely because a double cannot hold every
 *    int64 exactly, and it accepts a number encoded as a string on the way in. So `impressions` is
 *    `"18422"` and `conversions` is `37.5`, and `"37.5"` is equally valid. Parsed explicitly, both
 *    forms accepted, anything else refused -- never coerced to zero.
 *
 * 3. A ZERO IS OMITTED ENTIRELY. proto3 JSON leaves a field at its default value out of the
 *    response, so a campaign that spent nothing has no `costMicros` key at all. This is the exact
 *    OPPOSITE of GA4's rule, where a missing value is a malformed response and must be refused.
 *    Getting the direction wrong is silent either way: refuse-on-absent drops every zero-spend day,
 *    absent-means-zero on a field nobody asked for invents a number the platform never reported.
 *    `fieldMask` is what separates the two -- see THE FIELD MASK IS THE AUTHORITY below.
 *
 * 4. THE QUERY IS snake_case AND THE RESPONSE IS camelCase. GAQL selects `metrics.cost_micros`;
 *    the JSON carries `metrics.costMicros`, and the `fieldMask` echoes the camelCase spelling. One
 *    table holds both sides so a query and its parser cannot drift, and every read tolerates either
 *    spelling. That tolerance is not politeness: combined with trap 3, a whole-response spelling
 *    mismatch would make every metric look absent and therefore zero, which is the worst outcome
 *    available here -- a complete report of zeroes with nothing saying so.
 *
 * 5. THE DATE IS A CALENDAR DAY IN THE ACCOUNT'S OWN TIME ZONE, not in UTC and not in ours.
 *    `segments.date` is already `YYYY-MM-DD`, so unlike GA4 there is nothing to convert -- and the
 *    one correct operation on it is to carry it through untouched. Any round trip through `Date`
 *    re-anchors a bare calendar day to the runtime's offset and can move it a day. The suite runs
 *    in Asia/Bangkok (see `vitest.config.ts`) because in UTC that bug and the correct code produce
 *    the same string.
 *
 * 6. CURRENCY AND TIME ZONE ARE PROPERTIES OF THE ACCOUNT, and must be SELECTed to arrive at all.
 *    `customer.currency_code` and `customer.time_zone` come back per row, and the envelope requires
 *    both. Defaulting either would label a THB account's spend as EUR, or silently reinterpret the
 *    account's day boundary as UTC -- which for a Bangkok account is seven hours of the wrong day.
 *
 * THE FIELD MASK IS THE AUTHORITY ON WHAT WAS ASKED FOR. `SearchGoogleAdsResponse.field_mask`
 * names exactly the fields the query selected. So:
 *
 *   named in the mask + present in the row  ->  the platform's value
 *   named in the mask + absent from the row ->  ZERO, because proto3 omits defaults (trap 3)
 *   not named in the mask                   ->  NOT EMITTED, because it was never requested
 *
 * That rule is correct under both readings of trap 3: if Google in fact returns explicit zeroes,
 * the first line handles them and the second never fires. And the mandatory customer fields are
 * what make it safe -- a global spelling mismatch (trap 4) trips `missing_customer` before a single
 * fabricated zero can be emitted.
 *
 * THE ATTRIBUTION WINDOW IS `account_default`, CHOSEN RATHER THAN DEFAULTED. See ATTRIBUTION_WINDOW
 * below; the envelope refuses an unlabelled conversion count and this is the label that is true.
 */

import type { AttributionWindow, EnvelopeRow, MetricName } from "@repo/contract";
import { isProvisional, restatesUntil } from "@repo/contract";

/** One `results[]` entry. Fields are addressed by path, so the shape is deliberately open. */
export type GoogleAdsRow = Readonly<Record<string, unknown>>;

/** The subset of a `GoogleAdsService.Search` response this reads. */
export interface GoogleAdsSearchResponse {
  readonly results?: readonly GoogleAdsRow[];
  /** Comma-separated paths, camelCase. The authority on what was requested. */
  readonly fieldMask?: string;
  readonly nextPageToken?: string;
}

export type GoogleAdsNormalizeErrorCode =
  | "missing_field_mask"
  | "missing_customer"
  | "missing_date"
  | "missing_entity"
  | "bad_currency"
  | "unmapped_metric"
  | "metric_collision"
  | "unparseable_value"
  | "micros_precision";

export class GoogleAdsNormalizeError extends Error {
  constructor(
    message: string,
    readonly code: GoogleAdsNormalizeErrorCode,
  ) {
    super(message);
    this.name = "GoogleAdsNormalizeError";
  }
}

/** Millionths of a currency unit. Named because an inline `1e6` is where trap 1 hides. */
export const MICROS_PER_UNIT = 1_000_000;

/**
 * Google Ads metric to the shared dictionary, with its scale.
 *
 * Section 13.3 rule 2: a new metric requires a dictionary change first. Every name on the right
 * already exists in `@repo/contract` -- `spend`, `impressions`, `clicks`, `conversions` and
 * `conversions_value` -- so this connector adds no vocabulary, which is the whole reason it is
 * cheap.
 *
 * Keyed by the GAQL (snake_case) path, because that is the spelling a query author writes. Lookup
 * canonicalises to camelCase, so the response's spelling and the query's both resolve here.
 *
 * `metrics.all_conversions` is deliberately ABSENT. It counts a different thing -- every conversion
 * action, including those excluded from the "Conversions" column -- and mapping it onto
 * `conversions` would put two different numbers in one column depending on which report ran last.
 * Anything not listed here is REFUSED rather than passed through.
 */
export const GOOGLE_ADS_METRIC_MAP: Readonly<
  Record<string, { readonly metric: MetricName; readonly micros: boolean }>
> = {
  "metrics.cost_micros": { metric: "spend", micros: true },
  "metrics.impressions": { metric: "impressions", micros: false },
  "metrics.clicks": { metric: "clicks", micros: false },
  "metrics.conversions": { metric: "conversions", micros: false },
  // NOT micros. Google reports conversion value in whole currency units while cost is in micros,
  // on the same row. See trap 1.
  "metrics.conversions_value": { metric: "conversions_value", micros: false },
};

/** The grain a report is run at. */
export type GoogleAdsLevel = "account" | "campaign" | "ad_group";

export interface GoogleAdsLevelSpec {
  /** The canonical grain, from `ENTITY_TYPES`. */
  readonly entityType: "account" | "campaign" | "ad_group";
  /** Google's own word for it, carried honestly rather than hidden (specification section 7). */
  readonly nativeEntityType: string;
  /** The GAQL `FROM` resource. */
  readonly resource: string;
  readonly idPath: string;
  readonly namePath: string;
  readonly parentIdPath: string | null;
  /**
   * What a query MUST select for this normaliser to accept the response.
   *
   * Exported as data rather than described in prose so the query author and the parser read the
   * same list. A field missing here is a row refused there, which is the drift this prevents.
   */
  readonly selectFields: readonly string[];
}

/**
 * The account fields every report must carry, whatever its grain.
 *
 * `customer.id` is the envelope's `account_id`, half of the section 7 upsert key. The other two are
 * trap 6: without them the row cannot say what currency its money is in or what day its date means.
 */
export const GOOGLE_ADS_ACCOUNT_FIELDS = [
  "customer.id",
  "customer.currency_code",
  "customer.time_zone",
] as const;

/**
 * The three grains this connector reads, and the three it does not.
 *
 * `ad`, `keyword` and `search_term` exist in `ENTITY_TYPES` and are deliberately NOT here.
 * `search_term_view.search_term` is free text a person typed into Google, and
 * `REDACTION_POLICIES.google_ads` in @repo/payloads currently declares this source `verbatim` on
 * the stated grounds that it is "aggregate campaign reporting; no contact data". Emitting a search
 * term would make that declaration untrue for every payload archived afterwards, and the archive
 * has no way to know it changed. That is a redaction decision, not a connector one.
 */
export const GOOGLE_ADS_LEVELS: Readonly<Record<GoogleAdsLevel, GoogleAdsLevelSpec>> = {
  account: {
    entityType: "account",
    nativeEntityType: "customer",
    resource: "customer",
    idPath: "customer.id",
    namePath: "customer.descriptive_name",
    parentIdPath: null,
    selectFields: [...GOOGLE_ADS_ACCOUNT_FIELDS, "customer.descriptive_name", "segments.date"],
  },
  campaign: {
    entityType: "campaign",
    nativeEntityType: "campaign",
    resource: "campaign",
    idPath: "campaign.id",
    namePath: "campaign.name",
    parentIdPath: null,
    selectFields: [...GOOGLE_ADS_ACCOUNT_FIELDS, "campaign.id", "campaign.name", "segments.date"],
  },
  ad_group: {
    entityType: "ad_group",
    // Google says "ad group" where Meta says "adset"; the canonical grain says `ad_group` and here
    // the platform's word and the canonical one happen to agree. Recorded rather than assumed.
    nativeEntityType: "ad_group",
    resource: "ad_group",
    idPath: "ad_group.id",
    namePath: "ad_group.name",
    // The campaign id, selected alongside the ad group. `ad_group.campaign` is a resource NAME
    // ("customers/1/campaigns/2"), so parsing an id out of it would be string surgery on a format
    // Google is free to change; selecting `campaign.id` asks the platform for the number instead.
    parentIdPath: "campaign.id",
    selectFields: [
      ...GOOGLE_ADS_ACCOUNT_FIELDS,
      "ad_group.id",
      "ad_group.name",
      "campaign.id",
      "segments.date",
    ],
  },
};

/**
 * THE ATTRIBUTION WINDOW, chosen deliberately. The envelope refuses an unlabelled conversion count
 * (specification section 2), so this is never null -- but which label is a real decision.
 *
 * Google Ads attributes a conversion by TWO per-account settings that a report does not state on
 * the row: a click-through lookback window, held per conversion action (30 days by default, up to
 * 90), and an attribution model, also chosen per conversion action. `@repo/contract`'s
 * `ATTRIBUTION_WINDOWS` carries `account_default` for exactly this platform, in as many words:
 * "Google Ads applies a per-account, per-conversion-action setting".
 *
 * The two rejected alternatives were both worse for being MORE specific than the evidence:
 *
 *   `dda` asserts data-driven attribution. It is one of several models an account may use, and
 *         nothing in this response says which. A confidently wrong label is worse than a general
 *         true one, because a reader acts on it.
 *   `model` is GA4's label, and it means "this platform exposes no selectable window at all".
 *         Google Ads' window IS selectable -- by the advertiser, per conversion action -- so
 *         `model` would misdescribe the platform rather than merely under-describe the row.
 *
 * It is also emitted on rows with NO conversion metric, where the envelope would permit null. That
 * is on purpose: `attribution_window` is part of the section 7 upsert key, so a spend-only pull
 * writing null and a conversions pull writing `account_default` would produce TWO rows for one
 * campaign-day instead of upserting one.
 */
export const GOOGLE_ADS_ATTRIBUTION_WINDOW: AttributionWindow = "account_default";

/** `metrics.cost_micros` -> `metrics.costMicros`. Trap 4, in one place. */
function toCamelPath(path: string): string {
  return path.replace(/_([a-z0-9])/g, (_match, next: string) => next.toUpperCase());
}

/**
 * Read a dotted path off a result row, tolerating either spelling at every segment.
 *
 * The tolerance is load-bearing rather than defensive. With trap 3's absent-means-zero rule, a
 * response whose spelling this module did not expect would not fail -- it would report every metric
 * as zero. Trying both spellings costs a property lookup and removes that outcome entirely.
 *
 * BOTH DIRECTIONS ARE TRIED, and the first draft of this function only tried one. Mask paths are
 * canonicalised to camelCase before they get here, so a camel-only lookup can never find a
 * snake_case row -- which is precisely the case the tolerance exists for. The test for it failed,
 * which is the only reason this comment is not describing working code that never worked.
 */
function readPath(row: GoogleAdsRow, path: string): unknown {
  let node: unknown = row;
  for (const segment of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    const record = node as Record<string, unknown>;
    const camel = toCamelPath(segment);
    const snake = toSnakePath(segment);
    if (segment in record) node = record[segment];
    else if (camel in record) node = record[camel];
    else if (snake in record) node = record[snake];
    else return undefined;
  }
  return node;
}

/**
 * Parse a Google Ads metric value.
 *
 * Accepts a number or a decimal string, because proto3's JSON mapping produces the first for a
 * double and the second for an int64, and permits either for both (trap 2). Refuses anything else
 * rather than coercing: a malformed value becoming 0 is the worst outcome available, since a wrong
 * zero is indistinguishable from a real one -- and under trap 3 this platform has a great many real
 * ones.
 */
export function parseGoogleAdsNumber(value: unknown, field: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new GoogleAdsNormalizeError(
        `google_ads: ${field} is ${String(value)}, which is not a finite number`,
        "unparseable_value",
      );
    }
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new GoogleAdsNormalizeError(`google_ads: ${field} has no value`, "unparseable_value");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new GoogleAdsNormalizeError(
      `google_ads: ${field} is ${JSON.stringify(value)}, which is not a number. Refusing rather ` +
        "than coercing to zero, because a wrong zero is indistinguishable from a real one.",
      "unparseable_value",
    );
  }
  return parsed;
}

/**
 * Micros to whole currency units. Trap 1, isolated so it can be tested on its own.
 *
 * THE PRECISION CHECK IS NOT DECORATION. An int64 arrives as a decimal string exactly because it
 * can exceed what a double represents exactly, and `Number("9007199254740993")` silently returns
 * ...92. Six digits of that error land in the currency unit. So a string that does not survive the
 * round trip is refused rather than divided, and a value that is not a safe integer is refused for
 * the same reason: `cost_micros` is documented as an integer count of micros, and something that
 * is not one means this module has misread the field.
 */
export function microsToCurrency(value: unknown, field: string): number {
  const micros = parseGoogleAdsNumber(value, field);
  if (typeof value === "string" && String(micros) !== value.trim()) {
    throw new GoogleAdsNormalizeError(
      `google_ads: ${field} is ${JSON.stringify(value)}, which does not survive conversion to a ` +
        `number (it became ${String(micros)}). Refusing rather than dividing a value that has ` +
        "already lost digits: the loss lands six orders of magnitude into the money column.",
      "micros_precision",
    );
  }
  if (!Number.isSafeInteger(micros)) {
    throw new GoogleAdsNormalizeError(
      `google_ads: ${field} is ${String(micros)}, which is not a safe integer. cost_micros is an ` +
        "integer count of millionths; anything else means the field was misread.",
      "micros_precision",
    );
  }
  return micros / MICROS_PER_UNIT;
}

/**
 * `segments.date`, carried through untouched.
 *
 * THE WHOLE FUNCTION IS THE REFUSAL TO CONVERT. The value is already a calendar day in the
 * ACCOUNT's time zone (trap 5). Anything that parses it into an instant -- `new Date(value)`,
 * `new Date(`${value}T00:00:00`)`, a `toISOString()` round trip -- re-anchors a bare day to some
 * offset, and in any zone east of UTC that can hand back the day before. The suite runs in
 * Asia/Bangkok so that mistake is visible; in UTC it produces the same string as the correct code.
 */
export function googleAdsDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GoogleAdsNormalizeError(
      `google_ads: expected ${field} to be a YYYY-MM-DD calendar date in the account's own time ` +
        `zone and got ${JSON.stringify(value)}`,
      "missing_date",
    );
  }
  return value;
}

function readRequiredString(row: GoogleAdsRow, path: string): string | null {
  const value = readPath(row, path);
  if (typeof value === "string" && value !== "") return value;
  // int64 ids arrive as strings, but a JSON number is equally valid proto3 and must not cost a row.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export interface GoogleAdsNormalizeOptions {
  readonly response: GoogleAdsSearchResponse;
  /** The grain the query was run at. Must match its `FROM` resource. */
  readonly level: GoogleAdsLevel;
  /** RFC3339. When this pull happened. */
  readonly fetchedAt: string;
  /** RFC3339. Immutable per row; see @repo/contract's restatement note. */
  readonly firstSeenAt: string;
  /**
   * The account's click-through conversion window, in days.
   *
   * `RESTATEMENT_CLOCKS.google_ads` is `perAccount: true` for this reason: Google's window is a
   * per-account, per-conversion-action setting that defaults to 30 days and caps at 90, and a row
   * from an account running 90 stays open three times as long as the default assumes. It belongs
   * on `connections.restatement_window_days`, which already exists. Omitted here means "use the
   * contract's default", never "there is no window".
   */
  readonly accountWindowDays?: number;
}

/**
 * Turn one `search` response page into envelope rows.
 *
 * Throws rather than skipping a bad row, for the reason `sources/ga4/normalize.ts` records: a
 * connector that silently drops rows produces a number that is quietly too low, which is the
 * failure mode this whole product exists to sell against.
 */
export function normalizeGoogleAdsSearch(options: GoogleAdsNormalizeOptions): EnvelopeRow[] {
  const { response, level } = options;
  const spec = GOOGLE_ADS_LEVELS[level];

  if (typeof response.fieldMask !== "string" || response.fieldMask.trim() === "") {
    throw new GoogleAdsNormalizeError(
      "google_ads: the response carries no fieldMask. It is the only statement of what the query " +
        "asked for, and without it an absent metric is indistinguishable from a zero one -- so " +
        "every row would either lose real zeroes or invent fabricated ones.",
      "missing_field_mask",
    );
  }

  // TWO VIEWS OF ONE MASK, and the difference is what makes the collision check below reachable.
  // `selected` keeps the platform's own spellings, deduplicated only by exact string, so two
  // spellings of one field remain two entries. `mask` is the canonical form, for asking whether a
  // field was requested at all without caring how it was written.
  const selected = [
    ...new Set(
      response.fieldMask
        .split(",")
        .map((path) => path.trim())
        .filter((path) => path !== ""),
    ),
  ];
  const mask = new Set(selected.map(toCamelPath));

  // REFUSE ON THE MASK BEFORE TOUCHING A ROW, so a mis-built query is one legible error rather than
  // one error per row -- and so a report that happens to be empty still fails rather than returning
  // a confident `[]`.
  const requireMask = (path: string, code: GoogleAdsNormalizeErrorCode, why: string) => {
    if (!mask.has(toCamelPath(path))) {
      throw new GoogleAdsNormalizeError(
        `google_ads: the query did not select ${path}. ${why}`,
        code,
      );
    }
  };

  requireMask(
    "segments.date",
    "missing_date",
    "Every envelope row is keyed on a date and the section 7 upsert key requires one.",
  );
  requireMask(
    "customer.id",
    "missing_customer",
    "It is the envelope's account_id and half of the upsert key.",
  );
  // TWO CHECKS, NOT ONE, and the split is a lesson this repository has already paid for once: a
  // fixture missing both fields lets a default on either one survive mutation testing, because the
  // other still throws (see ga4/fixtures.ts, NO_CURRENCY / NO_TIMEZONE).
  requireMask(
    "customer.currency_code",
    "missing_customer",
    "Guessing it would mislabel every monetary value on the row -- a THB account reported as EUR.",
  );
  requireMask(
    "customer.time_zone",
    "missing_customer",
    "segments.date is a day in the ACCOUNT's zone, so without it the date has no meaning; " +
      "defaulting to UTC silently shifts a Bangkok account's day by seven hours.",
  );
  requireMask(
    spec.idPath,
    "missing_entity",
    `A ${level} row needs its entity id; the upsert key cannot be formed without one.`,
  );

  // Refuse an unmapped metric before emitting anything, so a dictionary gap is a visible failure
  // rather than a partially-populated row (section 13.3 rule 2).
  const metricPaths: Array<{ path: string; metric: MetricName; micros: boolean }> = [];
  const claimed = new Map<MetricName, string>();
  for (const path of selected) {
    if (!path.startsWith("metrics.")) continue;
    const mapped = GOOGLE_ADS_METRIC_MAP[path] ?? GOOGLE_ADS_METRIC_MAP[toSnakePath(path)];
    if (mapped === undefined) {
      throw new GoogleAdsNormalizeError(
        `google_ads: no dictionary entry for metric ${JSON.stringify(path)}. Section 13.3 ` +
          "requires a dictionary change before a connector emits a new metric, rather than a " +
          "silent rename.",
        "unmapped_metric",
      );
    }
    // Two DIFFERENTLY SPELLED mask paths that mean one canonical metric write one key twice, and
    // the second silently wins. Today's map is one-to-one, so the reachable case is a mask naming
    // one field in both spellings -- harmless in itself, since both reads return the same value,
    // but it is the signal that trap 4's spelling assumption has broken, and that assumption is
    // what makes absent-means-zero safe. Refusing is the loud version of that discovery. The other
    // case is one dictionary entry away: mapping `all_conversions` onto `conversions` as well.
    const previous = claimed.get(mapped.metric);
    if (previous !== undefined) {
      throw new GoogleAdsNormalizeError(
        `google_ads: both ${JSON.stringify(previous)} and ${JSON.stringify(path)} map to the ` +
          `canonical metric ${JSON.stringify(mapped.metric)}. Emitting both would silently keep ` +
          "one and discard the other. Select one of them, not both.",
        "metric_collision",
      );
    }
    claimed.set(mapped.metric, path);
    metricPaths.push({ path, metric: mapped.metric, micros: mapped.micros });
  }

  const rows: EnvelopeRow[] = [];

  for (const [index, row] of (response.results ?? []).entries()) {
    const accountId = readRequiredString(row, "customer.id");
    const currency = readRequiredString(row, "customer.currency_code");
    const timezone = readRequiredString(row, "customer.time_zone");
    if (accountId === null || currency === null || timezone === null) {
      throw new GoogleAdsNormalizeError(
        `google_ads: result ${index} is missing customer.id, customer.currency_code or ` +
          "customer.time_zone even though the query selected them. Defaulting any of the three " +
          "would mislabel the row's money or its day; refusing says so instead.",
        "missing_customer",
      );
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new GoogleAdsNormalizeError(
        `google_ads: customer.currency_code is ${JSON.stringify(currency)}, which is not an ` +
          "ISO 4217 code. Upper-casing or trimming it here would hide a response this module does " +
          "not understand.",
        "bad_currency",
      );
    }

    const entityId = readRequiredString(row, spec.idPath);
    if (entityId === null) {
      throw new GoogleAdsNormalizeError(
        `google_ads: result ${index} carries no ${spec.idPath}. Without it the row has no ` +
          "identity, and the upsert would either collide with another entity's row or create one " +
          "that can never be found again.",
        "missing_entity",
      );
    }

    const date = googleAdsDate(readPath(row, "segments.date"), "segments.date");

    const metrics: Partial<Record<MetricName, number>> = {};
    for (const entry of metricPaths) {
      const raw = readPath(row, entry.path);
      if (raw === undefined) {
        // Trap 3: the mask says it was requested, so the platform's answer is zero -- proto3 JSON
        // simply does not transmit a default value. A JSON `null` deliberately does NOT land here:
        // "explicitly nothing" is not "omitted because it was zero", and it falls through to the
        // parser, which refuses it.
        metrics[entry.metric] = 0;
        continue;
      }
      metrics[entry.metric] = entry.micros
        ? microsToCurrency(raw, entry.path)
        : parseGoogleAdsNumber(raw, entry.path);
    }

    const name = readRequiredString(row, spec.namePath);
    const parentId = spec.parentIdPath === null ? null : readRequiredString(row, spec.parentIdPath);

    const restates = restatesUntil({
      source: "google_ads",
      date,
      firstSeenAt: options.firstSeenAt,
      ...(options.accountWindowDays === undefined
        ? {}
        : { accountWindowDays: options.accountWindowDays }),
    });

    rows.push({
      source: "google_ads",
      entity: {
        type: spec.entityType,
        id: entityId,
        account_id: accountId,
        native_entity_type: spec.nativeEntityType,
        native_id: entityId,
        // Optional in the envelope, so absent rather than an empty string when the query did not
        // select it. An empty name is a name; a missing one is not.
        ...(name === null ? {} : { name }),
        ...(parentId === null ? {} : { parent_id: parentId }),
      },
      dimensions: {
        date,
        currency,
        timezone,
        attribution_window: GOOGLE_ADS_ATTRIBUTION_WINDOW,
      },
      metrics,
      fetched_at: options.fetchedAt,
      // NULL, AND THE SPECIFICATION IS THE REASON. `RESTATEMENT_CLOCKS.google_ads` records that no
      // authoritative freshness or finalisation statement was found for this platform across three
      // attempts. Copying fetched_at here would manufacture the very statement the research could
      // not find.
      source_updated_at: null,
      restates_until: restates,
      // DERIVED from the window rather than asserted. A hard-coded `true` is right on the day it is
      // written and wrong forever after; the contract owns the rule and the connector asks it.
      is_provisional: isProvisional(restates, new Date(options.fetchedAt)),
      first_seen_at: options.firstSeenAt,
      // Google Ads reports in the account's own currency and converts nothing, so no conversion has
      // happened yet. @repo/fx fills these when the row is converted to the workspace's currency;
      // asserting a rate here would assert one that was never applied.
      fx_source: null,
      fx_rate_date: null,
      fx_rate: null,
      fx_base: null,
      raw: row,
    });
  }

  return rows;
}

/** `metrics.costMicros` -> `metrics.cost_micros`, for looking a camelCase mask path up in the map. */
function toSnakePath(path: string): string {
  return path.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
