/**
 * GA4 -> envelope.
 *
 * The connector unit shape is specification section 13.3: `sources/<name>/{client, normalize,
 * backfill, fixtures, contract.test}`. This is the `normalize` half, and it is where a connector is
 * usually wrong, because the platform's shape and the canonical shape disagree in small ways that
 * each look harmless.
 *
 * FOUR GA4-SPECIFIC TRAPS, each of which produces plausible wrong numbers rather than an error:
 *
 * 1. EVERY METRIC VALUE IS A STRING. GA4 returns `"1234"`, not `1234`. `"1234" + 1` is `"12341"`,
 *    and a sum of string metrics silently concatenates. Parsed explicitly, and a value that does not
 *    parse is rejected rather than coerced to zero -- a zero is indistinguishable from a real zero.
 *
 * 2. DATES ARE `YYYYMMDD`, with no separators. Handed to `Date.parse` unchanged, "20260814" is
 *    either invalid or, worse, interpreted as something else entirely.
 *
 * 3. CURRENCY AND TIMEZONE COME FROM THE PROPERTY, not from the request. They arrive in
 *    `metadata.currencyCode` and `metadata.timeZone`, and the envelope requires both. Defaulting
 *    them would silently label a property's revenue as EUR when it is reported in JPY.
 *
 * 4. GA4 HAS NO SELECTABLE ATTRIBUTION WINDOW. It adjusts at model level, which is why the contract
 *    carries a `model` member: a label for what the platform actually did, not an absence. Without
 *    it the envelope would refuse the row, which is the correct outcome for an unlabelled conversion
 *    count and the wrong one here.
 */

import type { AttributionWindow, EnvelopeRow, MetricName } from "@repo/contract";
import { isProvisional, restatesUntil } from "@repo/contract";

/** The subset of a `runReport` response this reads. */
export interface Ga4Report {
  readonly dimensionHeaders?: ReadonlyArray<{ name?: string }>;
  readonly metricHeaders?: ReadonlyArray<{ name?: string; type?: string }>;
  readonly rows?: ReadonlyArray<{
    dimensionValues?: ReadonlyArray<{ value?: string }>;
    metricValues?: ReadonlyArray<{ value?: string }>;
  }>;
  readonly metadata?: { currencyCode?: string; timeZone?: string };
}

export type Ga4NormalizeErrorCode =
  | "missing_metadata"
  | "unmapped_metric"
  | "unparseable_value"
  | "missing_date"
  | "shape_mismatch"
  | "metric_collision";

export class Ga4NormalizeError extends Error {
  constructor(
    message: string,
    readonly code: Ga4NormalizeErrorCode,
  ) {
    super(message);
    this.name = "Ga4NormalizeError";
  }
}

/**
 * GA4's metric names to the shared dictionary.
 *
 * Section 13.3 rule 2: a new metric requires a dictionary change first, and `sessions` was added to
 * `@repo/contract` for exactly this. The dictionary comes from Fivetran's `dbt_ad_reporting`, which
 * is ad-centric and has no analytics grain at all -- while section 4.1's diagnostic tree asks "Which
 * GA4 channel and landing page lost sessions?". A connector cannot answer that with a dictionary
 * that has no word for it.
 *
 * Anything not listed here is REFUSED rather than passed through. A silent rename is what the schema
 * reviewer exists to catch (13.3), so the normaliser catches it instead.
 */
export const GA4_METRIC_MAP: Readonly<Record<string, MetricName>> = {
  sessions: "sessions",
  conversions: "conversions",
  // GA4 reports monetary conversion value under several names depending on the report; all three
  // mean the same canonical thing.
  totalRevenue: "conversions_value",
  purchaseRevenue: "conversions_value",
  eventValue: "conversions_value",
};

/** `YYYYMMDD` -> `YYYY-MM-DD`. */
export function parseGa4Date(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Ga4NormalizeError(
      `ga4: expected a YYYYMMDD date and got ${JSON.stringify(value)}`,
      "missing_date",
    );
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * Parse a GA4 metric value.
 *
 * Refuses rather than coercing. A malformed value becoming 0 is the worst outcome available: a zero
 * is indistinguishable from a real zero, so the number is wrong and nothing says so.
 */
export function parseGa4Number(value: string | undefined, metric: string): number {
  if (value === undefined || value.trim() === "") {
    throw new Ga4NormalizeError(`ga4: ${metric} has no value`, "unparseable_value");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Ga4NormalizeError(
      `ga4: ${metric} is ${JSON.stringify(value)}, which is not a number. Refusing rather than ` +
        "coercing to zero, because a wrong zero is indistinguishable from a real one.",
      "unparseable_value",
    );
  }
  return parsed;
}

export interface NormalizeOptions {
  readonly report: Ga4Report;
  /** GA4 property id, e.g. "properties/123456". */
  readonly propertyId: string;
  /** RFC3339. When this pull happened. */
  readonly fetchedAt: string;
  /** RFC3339. Immutable per row; see @repo/contract's restatement note. */
  readonly firstSeenAt: string;
}

/**
 * Turn one `runReport` response into envelope rows.
 *
 * Throws rather than skipping a bad row. A connector that silently drops rows produces a number that
 * is quietly too low, which is the failure mode this whole product exists to sell against.
 */
export function normalizeGa4Report(options: NormalizeOptions): EnvelopeRow[] {
  const { report } = options;

  const currency = report.metadata?.currencyCode;
  const timezone = report.metadata?.timeZone;
  if (!currency || !timezone) {
    // Defaulting would silently label a property's revenue as EUR when it is reported in JPY.
    throw new Ga4NormalizeError(
      "ga4: the response carries no metadata.currencyCode or metadata.timeZone. The envelope " +
        "requires both, and guessing either would mislabel every monetary value in the report.",
      "missing_metadata",
    );
  }

  const dimensionNames = (report.dimensionHeaders ?? []).map((h) => h.name ?? "");
  const metricNames = (report.metricHeaders ?? []).map((h) => h.name ?? "");
  const dateIndex = dimensionNames.indexOf("date");
  if (dateIndex === -1) {
    throw new Ga4NormalizeError(
      "ga4: the report has no `date` dimension. Every envelope row is keyed on a date, and the " +
        "upsert key requires one.",
      "missing_date",
    );
  }

  // Refuse an unmapped metric BEFORE emitting anything, so a dictionary gap is a visible failure
  // rather than a partially-populated row.
  for (const name of metricNames) {
    if (!(name in GA4_METRIC_MAP)) {
      throw new Ga4NormalizeError(
        `ga4: no dictionary entry for metric ${JSON.stringify(name)}. Section 13.3 requires a ` +
          "dictionary change before a connector emits a new metric, rather than a silent rename.",
        "unmapped_metric",
      );
    }
  }

  // The map is many-to-one -- totalRevenue, purchaseRevenue and eventValue all mean
  // `conversions_value` -- so a report requesting two of them would write both into one key and the
  // second would silently win. That is a wrong number with nothing to say so, which is exactly the
  // class of failure this normaliser exists to prevent. Refuse instead; the caller must ask for one.
  const seen = new Map<MetricName, string>();
  for (const name of metricNames) {
    const canonical = GA4_METRIC_MAP[name] as MetricName;
    const previous = seen.get(canonical);
    if (previous !== undefined) {
      throw new Ga4NormalizeError(
        `ga4: both ${JSON.stringify(previous)} and ${JSON.stringify(name)} map to the canonical ` +
          `metric ${JSON.stringify(canonical)}. Emitting both would silently keep one and discard ` +
          "the other. Request one of them, not both.",
        "metric_collision",
      );
    }
    seen.set(canonical, name);
  }

  const rows: EnvelopeRow[] = [];

  for (const [index, row] of (report.rows ?? []).entries()) {
    const dimensionValues = row.dimensionValues ?? [];
    const metricValues = row.metricValues ?? [];

    if (
      dimensionValues.length !== dimensionNames.length ||
      metricValues.length !== metricNames.length
    ) {
      throw new Ga4NormalizeError(
        `ga4: row ${index} has ${dimensionValues.length} dimensions and ${metricValues.length} ` +
          `metrics against ${dimensionNames.length} and ${metricNames.length} headers. GA4 returns ` +
          "values positionally, so a mismatch means every value would be attributed to the wrong name.",
        "shape_mismatch",
      );
    }

    const date = parseGa4Date(dimensionValues[dateIndex]?.value ?? "");

    const metrics: Partial<Record<MetricName, number>> = {};
    for (const [metricIndex, ga4Name] of metricNames.entries()) {
      const canonical = GA4_METRIC_MAP[ga4Name] as MetricName;
      metrics[canonical] = parseGa4Number(metricValues[metricIndex]?.value, ga4Name);
    }

    // GA4 adjusts attribution at model level rather than by a selectable window. `model` is the
    // label for that; it is not "unknown".
    const attributionWindow: AttributionWindow = "model";

    const restates = restatesUntil({
      source: "ga4",
      date,
      firstSeenAt: options.firstSeenAt,
    });

    rows.push({
      source: "ga4",
      entity: {
        type: "property",
        id: options.propertyId,
        account_id: options.propertyId,
        native_entity_type: "property",
        native_id: options.propertyId,
      },
      dimensions: { date, currency, timezone, attribution_window: attributionWindow },
      metrics,
      fetched_at: options.fetchedAt,
      // GA4 publishes no per-row "last updated" timestamp, so this is null rather than a copy of
      // fetched_at. Copying would assert a freshness the platform never reported.
      source_updated_at: null,
      restates_until: restates,
      // DERIVED, not asserted. With the first_seen_at anchor a freshly-normalised GA4 row is always
      // still open, so a hard-coded `true` would be right today and silently wrong the day the
      // window changes or a source with a zero-day clock reuses this shape. The contract owns the
      // rule; the connector asks it.
      is_provisional: isProvisional(restates, new Date(options.fetchedAt)),
      first_seen_at: options.firstSeenAt,
      // GA4 reports in the property's own currency and does not convert, so no conversion has
      // happened yet. The FX layer fills these when it converts to the workspace's currency.
      fx_source: null,
      fx_rate_date: null,
      fx_rate: null,
      fx_base: null,
      raw: row,
    });
  }

  return rows;
}
