/**
 * Search Console -> envelope.
 *
 * The `normalize` half of the connector unit (specification section 13.3) and the close sibling of
 * `sources/ga4/normalize.ts`: same provider, same OAuth grant, same envelope, same refusal posture.
 * It deviates from GA4 in four places, and every deviation is a property of the platform rather
 * than a preference.
 *
 * 1. THE RESPONSE CARRIES NO HEADERS. GA4 returns `dimensionHeaders`, so one of its rows can be
 *    read on its own. Search Console returns `keys: ["2026-08-14", "running shoes"]` and NOTHING
 *    that says what those positions mean -- the REQUEST is the schema. So the dimension list is an
 *    argument here, and a caller that passes a list differing from the one it sent stores every
 *    page URL under a query string with no error raised anywhere. That is why `client.ts` returns
 *    the dimensions it sent on the page object: the pairing is structural rather than remembered.
 *
 * 2. THERE IS NO MONEY AND NO PROPERTY TIMEZONE IN THE RESPONSE. GA4 reads currency and timezone
 *    from `metadata` and refuses when either is absent, because defaulting would relabel a JPY
 *    property as EUR. Search Console reports neither, ever, and the envelope requires both. The two
 *    constants below are therefore not defaults standing in for a value we failed to read; they are
 *    statements about the platform, and each says which one it is.
 *
 * 3. GOOGLE WITHHOLDS ROWS, AND THE ROWS THAT ARRIVE DO NOT SUM TO THE TOTAL. An anonymity
 *    threshold drops low-volume queries, so a query-grain response is a SUBSET whose sum is quietly
 *    too low -- well-formed data with nothing on it marking the gap, which is the exact failure
 *    this product exists to sell against. A normaliser cannot restore the withheld rows. What it
 *    can do is refuse to let anybody add up what did arrive and call it a total: see
 *    `anonymityThresholded`, which every caller is handed whether it asked or not, and
 *    `totalsByDate`, which throws rather than summing a thresholded grain.
 *
 * 4. NOTHING IS ATTRIBUTED. `attribution_window` is null, and here that is a label rather than a
 *    gap: clicks and impressions are counts of what happened, and `envelopeRowSchema` permits null
 *    for precisely this row shape -- a window on an impressions-only row would be a label with
 *    nothing to label. GA4 needed `model` because it carries conversions; this connector does not.
 */

import type { EnvelopeRow, MetricName } from "@repo/contract";
import { isProvisional, restatesUntil } from "@repo/contract";

/**
 * The row shape of a `searchAnalytics.query` response.
 *
 * Every field optional because this is what came back over a network, not what we asked for. Note
 * `clicks` and `impressions` are JSON NUMBERS here, unlike GA4's strings -- Google types them as
 * doubles -- so the trap is the opposite one: nothing forces a caller to parse, which means nothing
 * forces a caller to notice a missing or impossible value either.
 */
export interface SearchAnalyticsRow {
  readonly keys?: readonly string[];
  readonly clicks?: number;
  readonly impressions?: number;
  /** Read and deliberately not emitted. See SEARCH_CONSOLE_METRIC_MAP. */
  readonly ctr?: number;
  /** Average SERP rank for this row, as Search Console computed it. Not additive. */
  readonly position?: number;
}

export interface SearchAnalyticsResponse {
  /**
   * ABSENT, not empty, when there is no data for the window. Search Console omits the key entirely
   * rather than returning `[]`, so `response.rows.length` on a quiet day is a TypeError.
   */
  readonly rows?: readonly SearchAnalyticsRow[];
  /** "byProperty" or "byPage": how Google chose to aggregate. Reported, never assumed. */
  readonly responseAggregationType?: string;
}

export type SearchConsoleNormalizeErrorCode =
  | "missing_date"
  | "unsupported_dimension"
  | "composite_grain"
  | "shape_mismatch"
  | "empty_dimension_value"
  | "unparseable_value"
  | "thresholded_sum";

export class SearchConsoleNormalizeError extends Error {
  constructor(
    message: string,
    readonly code: SearchConsoleNormalizeErrorCode,
  ) {
    super(message);
    this.name = "SearchConsoleNormalizeError";
  }
}

/**
 * The grains this connector emits, proved at compile time to be members of the canonical hierarchy.
 *
 * NO VALUE IS INVENTED HERE, and that is the whole argument. `property`, `query` and `page` are
 * already in `ENTITY_TYPES`, and Search Console's own dimension names for two of them are spelled
 * identically -- the map is the identity function. `url` was the alternative for the page grain and
 * was rejected: in the `dbt_ad_reporting` lineage the canonical list comes from, `url` sits beside
 * `keyword` and `geo` as an attribute of an ad (its final URL), whereas Search Console's `page` is
 * a unit of the SITE'S OWN content and the platform calls it `page`. Choosing `url` would have been
 * inventing a synonym for a value that already exists.
 *
 * `property` is Search Console's word too: its UI calls a site a property. The API path says
 * `sites/`, which is what `native_entity_type` carries below.
 */
export const SEARCH_CONSOLE_GRAINS = [
  "property",
  "query",
  "page",
] as const satisfies readonly EnvelopeRow["entity"]["type"][];

export type SearchConsoleGrain = (typeof SEARCH_CONSOLE_GRAINS)[number];

/** The request dimensions this connector understands. Search Console offers more; see below. */
export const SEARCH_CONSOLE_DIMENSIONS = ["date", "query", "page"] as const;

export type SearchConsoleDimension = (typeof SEARCH_CONSOLE_DIMENSIONS)[number];

/**
 * The platform's own vocabulary, carried honestly beside the canonical one (specification section
 * 7). Google's API path is `sites/{siteUrl}`; the canonical grain for it is `property`.
 */
export const SEARCH_CONSOLE_NATIVE_ENTITY_TYPE: Readonly<Record<SearchConsoleGrain, string>> = {
  property: "site",
  query: "query",
  page: "page",
};

/**
 * Search Console's metrics to the shared dictionary, and the two it deliberately does not read.
 *
 * `clicks` and `impressions` ALREADY EXIST in `@repo/contract`, so this connector needs no
 * dictionary change -- section 13.3 rule 2 is satisfied by doing nothing, which is the best
 * possible outcome for a rule about not renaming things silently.
 *
 * `ctr` IS NEVER EMITTED. It is `clicks / impressions`, and storing a derived value beside its two
 * inputs is how one number becomes two sources of truth that drift: a reader who sums clicks and
 * impressions across a week and divides gets a different figure from one who averages the stored
 * ctr, and nothing in the store says which is meant. Anyone who needs it computes it at read time
 * from columns that cannot disagree.
 *
 * `position` IS NOW EMITTED. It was held back until the dictionary could describe it honestly:
 * `METRICS`'s unit union was "currency" | "count" and an average SERP rank is neither, so it
 * needed a third member, a new `envelope_rows` column, and a change to `app.upsert_envelope_row`.
 *
 * The part that mattered was not the column. `position` IS NOT ADDITIVE -- positions across two
 * days do not add to a position, and they do not plainly average either, because Search Console's
 * own figure is weighted by impressions. Every other metric in the dictionary is additive and
 * nothing said so, so a column alone would have been read by the first aggregator as one more
 * thing to SUM. `METRICS` now carries an `aggregation` per metric and `combineMetric` implements
 * it; the value emitted here is the platform's figure for this row, and combining rows is that
 * function's job rather than any caller's.
 *
 * `ctr` still arrives on every row and is simply not read. That is different from an unmapped GA4
 * metric, which is REFUSED: there, an unrecognised name means the dictionary has a gap; here `ctr`
 * is recognised and excluded on purpose, and refusing it would refuse every response Search
 * Console has ever sent.
 */
export const SEARCH_CONSOLE_METRIC_MAP: Readonly<Record<string, MetricName>> = {
  clicks: "clicks",
  impressions: "impressions",
  position: "position",
};

/**
 * ISO 4217 `XXX`: "the codes assigned for transactions where no currency is involved".
 *
 * `dimensions.currency` is required on every envelope row and Search Console reports no money at
 * all -- not a price, not a bid, not a value. The rejected alternative was to stamp the workspace's
 * own currency on the row, which passes the schema and asserts something false: it would denominate
 * a click count in baht and invite the FX layer to convert it. `XXX` is a real code from the same
 * standard the field already validates against, and it means exactly what is true here.
 */
export const SEARCH_CONSOLE_CURRENCY = "XXX";

/**
 * Search Console reports in Pacific Time, and this is a documented CONSTANT rather than a value
 * read from the response.
 *
 * That difference is the whole comment. GA4 sends `metadata.timeZone` per property, so a GA4 row's
 * timezone is an observation. Search Console sends nothing, and its dates are documented as being
 * in the America/Los_Angeles day boundary for every property and every customer. So this is a fact
 * about Google transcribed into code, which means it can go stale silently in a way an observation
 * cannot: if Google ever changes its reporting day boundary, no response will say so and every row
 * this connector has ever emitted becomes mislabelled by up to a day.
 *
 * It is still far better than the alternatives. Omitting it is not allowed -- sections 3.1 and 4.4
 * sell timezone normalisation as a guarantee and the envelope requires the field. Guessing the
 * workspace's timezone would be worse than stale: it would assert that a Bangkok customer's
 * Search Console day ends at midnight ICT, which it does not, and a join against a GA4 property
 * configured for Asia/Bangkok would then silently compare two different days.
 */
export const SEARCH_CONSOLE_TIMEZONE = "America/Los_Angeles";

/**
 * Which grains Google's anonymity threshold removes rows from.
 *
 * `query` is the documented case: Google withholds queries made by too few people, so the rows that
 * arrive are a subset and their sum is lower than the property's own total -- with no field, header
 * or count anywhere in the response saying so.
 *
 * `page` is marked thresholded too, and that one IS A GUESS made deliberately in the safe
 * direction. Whether page-grain rows carry the impressions belonging to anonymised queries is not
 * something this repository can establish without a live call (design note section 5). A wrong
 * `true` costs a refused convenience and a second request; a wrong `false` publishes a total that
 * is quietly too low. Those are not comparable, so the guess goes the way that can only cost
 * effort.
 *
 * `property` is false because a date-only response IS Google's own total -- it is the number the
 * Search Console UI shows, anonymised queries included, which is precisely why the pair of reports
 * is worth two requests instead of one.
 */
export const SEARCH_CONSOLE_ANONYMITY_THRESHOLDED: Readonly<Record<SearchConsoleGrain, boolean>> = {
  property: false,
  query: true,
  page: true,
};

/**
 * `YYYY-MM-DD`, validated rather than trusted.
 *
 * The round trip is not belt-and-braces. `Date.parse("2026-02-30T00:00:00Z")` does not fail -- it
 * ROLLS OVER to 2 March and returns a perfectly good timestamp, so a regex plus a NaN check accepts
 * an impossible date and silently files the row two days late. Comparing the parsed date back to
 * the string is the only check that catches it.
 */
export function parseSearchConsoleDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new SearchConsoleNormalizeError(
      `search_console: expected a YYYY-MM-DD date and got ${JSON.stringify(value)}`,
      "missing_date",
    );
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new SearchConsoleNormalizeError(
      `search_console: ${JSON.stringify(value)} is not a real calendar date. Date.parse rolls an ` +
        "impossible day over into the next month rather than failing, which would file the row on " +
        "a day the platform never reported.",
      "missing_date",
    );
  }
  return value;
}

/**
 * Read one metric off a Search Console row.
 *
 * GA4's trap is that every value is a string. This platform's is the mirror image: the values are
 * already numbers, so nothing makes a caller look at them, and an absent field reads as `undefined`
 * which becomes `0` the moment it meets arithmetic. A zero is indistinguishable from a real zero,
 * so an absent or impossible value is refused rather than coerced -- the same rule as GA4, applied
 * to the opposite failure.
 *
 * NEGATIVE IS REFUSED, and it is the check that earns its place: Google types these as doubles, so
 * a negative click count is syntactically fine and physically impossible, and the way it arrives is
 * a positional mix-up somewhere upstream rather than a platform bug.
 */
/**
 * Parse `position`, which needs one refusal the count parser must not make.
 *
 * ZERO IS IMPOSSIBLE AND IS THE WORST AVAILABLE VALUE. A SERP position is a 1-based ordinal, so
 * rank 0 does not exist -- and it reads as BETTER than rank 1, so a response carrying it would
 * present as a site suddenly ranking above the top result. `parseSearchConsoleMetric` allows zero
 * because a zero click count is an ordinary Tuesday; here it is a signal the response is not the
 * shape this connector models.
 *
 * The database agrees: `envelope_rows.position` carries `check (position > 0)`, not `>= 0`.
 */
export function parseSearchConsolePosition(value: unknown): number {
  const parsed = parseSearchConsoleMetric(value, "position");
  if (parsed <= 0) {
    throw new SearchConsoleNormalizeError(
      `search_console: position is ${parsed}. A SERP position is a 1-based ordinal, so zero is ` +
        "not a worse rank than one -- it is a better one, and reporting it would show a site " +
        "ranking above the top result.",
      "unparseable_value",
    );
  }
  return parsed;
}

export function parseSearchConsoleMetric(value: unknown, metric: string): number {
  if (value === undefined || value === null) {
    throw new SearchConsoleNormalizeError(
      `search_console: ${metric} is absent from the row. Refusing rather than reading it as zero, ` +
        "because a wrong zero is indistinguishable from a real one.",
      "unparseable_value",
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SearchConsoleNormalizeError(
      `search_console: ${metric} is ${JSON.stringify(value)}, which is not a finite number.`,
      "unparseable_value",
    );
  }
  if (value < 0) {
    throw new SearchConsoleNormalizeError(
      `search_console: ${metric} is ${value}. A negative count cannot be a measurement, so the ` +
        "response is not the shape this connector models and no row from it is trustworthy.",
      "unparseable_value",
    );
  }
  return value;
}

/**
 * The grain a dimension list describes, or a refusal.
 *
 * THREE REFUSALS, and the second is the one worth reading.
 *
 * NO DATE. Every envelope row is keyed on a date and the section 7 upsert key requires one. A
 * Search Console query without the `date` dimension returns one row for the whole range, which is a
 * different kind of number wearing the same shape.
 *
 * MORE THAN ONE NON-DATE DIMENSION. `["date", "query", "page"]` is a legal and useful Search
 * Console report -- and there is no `query_page` member of `ENTITY_TYPES` to land it on. Emitting it
 * at `query` grain would silently discard the page half of the key and collapse several genuinely
 * distinct rows onto one id; emitting it at `page` grain does the same the other way. Refusing is
 * the only option that does not invent an enum value or lose half of each row, and inventing an
 * enum value is a migration this change is deliberately not making.
 *
 * A DIMENSION THIS CONNECTOR DOES NOT MAP. `country`, `device` and `searchAppearance` are real
 * Search Console dimensions. `country` would plausibly land on the `geo` entity type; `device` and
 * `searchAppearance` have no home in the canonical grain at all and would need a dictionary change.
 * Until each has been decided, a report asking for one is refused before it costs quota.
 */
export function grainFor(dimensions: readonly string[]): SearchConsoleGrain {
  if (!dimensions.includes("date")) {
    throw new SearchConsoleNormalizeError(
      `search_console: the report dimensions ${JSON.stringify(dimensions)} do not include ` +
        "`date`. Every envelope row is keyed on a date and the upsert key requires one.",
      "missing_date",
    );
  }

  const unsupported = dimensions.filter(
    (name) => !(SEARCH_CONSOLE_DIMENSIONS as readonly string[]).includes(name),
  );
  if (unsupported.length > 0) {
    throw new SearchConsoleNormalizeError(
      `search_console: no grain mapping for dimension ${JSON.stringify(unsupported[0])}. This ` +
        "connector maps `query` and `page` onto entity types that already exist; country, device " +
        "and searchAppearance each need a decision recorded before a row can carry them.",
      "unsupported_dimension",
    );
  }

  const grains = dimensions.filter((name) => name !== "date");
  if (grains.length > 1) {
    throw new SearchConsoleNormalizeError(
      `search_console: ${JSON.stringify(dimensions)} asks for ${grains.length} grains at once and ` +
        "there is no composite member of the entity-type enum to carry them. One of the two " +
        "dimensions would be silently dropped from the entity id and distinct rows would collapse " +
        "onto one key. Ask for one grain per report.",
      "composite_grain",
    );
  }

  return (grains[0] ?? "property") as SearchConsoleGrain;
}

export interface SearchConsoleNormalizeOptions {
  readonly response: SearchAnalyticsResponse;
  /**
   * The dimensions that were SENT, in order. The response echoes nothing, so this is the only thing
   * that says what `keys[0]` means. `client.ts` returns it on the page for that reason.
   */
  readonly dimensions: readonly string[];
  /** The Search Console property, e.g. "sc-domain:example.com" or "https://example.com/". */
  readonly siteUrl: string;
  /** RFC3339. When this pull happened. */
  readonly fetchedAt: string;
  /** RFC3339. Immutable per row; see @repo/contract's restatement note. */
  readonly firstSeenAt: string;
}

/**
 * What a normalised response is, which is more than its rows.
 *
 * THE RETURN TYPE DEVIATES FROM GA4's `EnvelopeRow[]`, AND THE DEVIATION IS THE POINT. A
 * query-grain Search Console response is a subset of the truth, and the envelope row has no field
 * that can say so -- so if the rows came back bare, the one fact a caller most needs would be the
 * one fact the call did not return. Handing back a struct makes the caller hold it.
 */
export interface SearchConsoleNormalizeResult {
  readonly rows: EnvelopeRow[];
  readonly grain: SearchConsoleGrain;
  /**
   * Whether Google's anonymity threshold has removed rows from this response. When true, these rows
   * DO NOT SUM TO THE PROPERTY'S TOTAL and must never be presented as if they did.
   */
  readonly anonymityThresholded: boolean;
  /** `responseAggregationType` verbatim, or null when the platform did not say. */
  readonly responseAggregationType: string | null;
}

/**
 * Turn one `searchAnalytics.query` response into envelope rows.
 *
 * ONE API ROW BECOMES ONE ENVELOPE ROW. Nothing is grouped, summed, deduplicated or filled in. That
 * is not laziness -- it is the only shape in which the anonymity gap stays visible, because the
 * moment this function aggregates anything it has produced a number that Google did not report and
 * that nobody can reconcile against the Search Console UI.
 *
 * Throws rather than skipping a bad row, for the reason the GA4 normaliser gives: a connector that
 * silently drops rows produces a total that is quietly too low.
 */
export function normalizeSearchAnalytics(
  options: SearchConsoleNormalizeOptions,
): SearchConsoleNormalizeResult {
  const { response, dimensions, siteUrl } = options;
  const grain = grainFor(dimensions);
  const dateIndex = dimensions.indexOf("date");
  const grainIndex = dimensions.findIndex((name) => name !== "date");

  const rows: EnvelopeRow[] = [];

  for (const [index, row] of (response.rows ?? []).entries()) {
    const keys = row.keys ?? [];

    // Search Console returns `keys` POSITIONALLY against the dimensions of the request and echoes
    // no names at all. A length mismatch does not lose one value; it shifts every value onto the
    // wrong meaning, and a page URL stored as a search query looks entirely plausible in a table.
    if (keys.length !== dimensions.length) {
      throw new SearchConsoleNormalizeError(
        `search_console: row ${index} has ${keys.length} keys against ${dimensions.length} ` +
          "requested dimensions. The response echoes no dimension names, so a mismatch means " +
          "every key would be read as something it is not.",
        "shape_mismatch",
      );
    }

    const date = parseSearchConsoleDate(keys[dateIndex] ?? "");
    const nativeId = grainIndex === -1 ? siteUrl : (keys[grainIndex] ?? "");
    if (nativeId === "") {
      throw new SearchConsoleNormalizeError(
        `search_console: row ${index} carries an empty ${grain} value. An empty string cannot ` +
          "identify an entity, and a row keyed on one would collide with every other empty row.",
        "empty_dimension_value",
      );
    }

    const metrics: Partial<Record<MetricName, number>> = {
      clicks: parseSearchConsoleMetric(row.clicks, "clicks"),
      impressions: parseSearchConsoleMetric(row.impressions, "impressions"),
      // The platform's own figure for THIS row, already impression-weighted across whatever it
      // aggregated to produce it. Combining rows is `combineMetric`'s job, not this one's.
      position: parseSearchConsolePosition(row.position),
    };

    const restates = restatesUntil({
      source: "search_console",
      date,
      firstSeenAt: options.firstSeenAt,
    });

    rows.push({
      source: "search_console",
      entity: {
        type: grain,
        // THE GRAIN IS PART OF THE ID, and this is the first source in the repository that needs
        // it. The section 7 upsert key is (source, account_id, entity_id, date,
        // attribution_window) -- it does NOT include the entity type. Search Console is the first
        // connector that emits two grains for one account on one date, and a search query can
        // itself be a URL: somebody typing "https://example.com/shoes" into Google produces a
        // query-grain row whose raw id is byte-identical to a page-grain row's. Unprefixed, those
        // two upsert onto each other and one of the numbers disappears.
        id: `${grain}:${nativeId}`,
        account_id: siteUrl,
        native_entity_type: SEARCH_CONSOLE_NATIVE_ENTITY_TYPE[grain],
        // The platform's own value, unprefixed, so nothing downstream has to unpick our namespace.
        native_id: nativeId,
      },
      dimensions: {
        date,
        currency: SEARCH_CONSOLE_CURRENCY,
        timezone: SEARCH_CONSOLE_TIMEZONE,
        // Null is the label, not a gap. Clicks and impressions are counts of what happened and
        // nothing here is attributed to anything; `envelopeRowSchema` permits null for exactly
        // this row shape and refuses it the moment a conversion metric appears.
        attribution_window: null,
      },
      metrics,
      fetched_at: options.fetchedAt,
      // Search Console publishes no per-row freshness timestamp. Null rather than a copy of
      // fetched_at, which would assert a freshness the platform never reported.
      source_updated_at: null,
      // Null, because RESTATEMENT_CLOCKS.search_console.windowDays is null and null means UNKNOWN
      // rather than zero. The contract owns that rule; the connector asks it.
      restates_until: restates,
      // Therefore always true today, and derived anyway. Hard-coding it would be right until the
      // day somebody measures the window, sets a number, and this row keeps claiming the old
      // answer. See the design note: measuring it is one diff of two pulls.
      is_provisional: isProvisional(restates, new Date(options.fetchedAt)),
      first_seen_at: options.firstSeenAt,
      // Search Console reports no monetary value, so there is nothing to have converted. The
      // currency above says the same thing in the field the envelope validates.
      fx_source: null,
      fx_rate_date: null,
      fx_rate: null,
      fx_base: null,
      raw: row,
    });
  }

  return {
    rows,
    grain,
    anonymityThresholded: SEARCH_CONSOLE_ANONYMITY_THRESHOLDED[grain],
    responseAggregationType: response.responseAggregationType ?? null,
  };
}

export interface SearchConsoleDateTotal {
  readonly clicks: number;
  readonly impressions: number;
}

/**
 * Sum a normalised result to a per-date total -- and REFUSE when the grain is thresholded.
 *
 * This function exists to throw. Adding up the rows is the obvious thing to do with them and it is
 * the one thing that must not happen at query or page grain: Google has already removed rows, so
 * the sum is lower than the property's own figure by an amount nobody can compute, and it arrives
 * looking exactly like a total. A comment saying "do not sum these" is a comment. A function that
 * every caller reaches for and that refuses by grain is a control.
 *
 * At `property` grain it does sum, because a date-only response IS Google's total and there is
 * nothing withheld from it. That is also the report the error message points at.
 */
export function totalsByDate(
  result: SearchConsoleNormalizeResult,
): Map<string, SearchConsoleDateTotal> {
  if (result.anonymityThresholded) {
    throw new SearchConsoleNormalizeError(
      `search_console: refusing to total ${result.grain}-grain rows. Google's anonymity threshold ` +
        "withholds low-volume queries, so these rows are a subset and their sum is lower than the " +
        "property's own number by an unknown amount -- presenting it as a total is the failure " +
        "this product sells against. Pull the date-only report, which returns Google's own total " +
        "at `property` grain, and compare the two rather than adding these up.",
      "thresholded_sum",
    );
  }

  // POSITION IS DELIBERATELY ABSENT FROM THIS TOTAL, and must stay absent. This function SUMS
  // rows, which is right for clicks and impressions and catastrophic for a rank: adding the
  // positions of forty queries produces a number in the hundreds that is typed as a position.
  // Rolling a rank up is `combineMetric("position", rows)`, which weights by impressions.
  const totals = new Map<string, SearchConsoleDateTotal>();
  for (const row of result.rows) {
    const seen = totals.get(row.dimensions.date) ?? { clicks: 0, impressions: 0 };
    totals.set(row.dimensions.date, {
      clicks: seen.clicks + (row.metrics.clicks ?? 0),
      impressions: seen.impressions + (row.metrics.impressions ?? 0),
    });
  }
  return totals;
}
