import { combineMetric, envelopeRowSchema, upsertKey } from "@repo/contract";
import { describe, expect, it } from "vitest";
import {
  BY_PAGE,
  BY_QUERY,
  DAILY_TOTALS,
  EMPTY,
  EMPTY_QUERY,
  FIXTURE_SITE_URL,
  IMPOSSIBLE_DATE,
  KEYS_TOO_FEW,
  MISSING_IMPRESSIONS,
  NEGATIVE_CLICKS,
  QUERY_THAT_IS_A_PAGE_URL,
  STRING_METRIC,
} from "./fixtures.ts";
import {
  SEARCH_CONSOLE_CURRENCY,
  SEARCH_CONSOLE_TIMEZONE,
  type SearchAnalyticsResponse,
  SearchConsoleNormalizeError,
  grainFor,
  normalizeSearchAnalytics,
  parseSearchConsoleDate,
  parseSearchConsoleMetric,
  parseSearchConsolePosition,
  totalsByDate,
} from "./normalize.ts";

const FETCHED_AT = "2026-09-11T02:00:00Z";
const FIRST_SEEN_AT = "2026-08-14T06:00:00Z";

function normalize(response: SearchAnalyticsResponse, dimensions: readonly string[]) {
  return normalizeSearchAnalytics({
    response,
    dimensions,
    siteUrl: FIXTURE_SITE_URL,
    fetchedAt: FETCHED_AT,
    firstSeenAt: FIRST_SEEN_AT,
  });
}

describe("the contract: every row must satisfy the envelope", () => {
  // Section 13.3's pre-merge requirement. Not "looks about right" -- parsed by the real schema.

  it.each([
    ["totals", DAILY_TOTALS, ["date"]],
    ["by query", BY_QUERY, ["date", "query"]],
    ["by page", BY_PAGE, ["date", "page"]],
  ])("emits %s rows the envelope schema accepts", (_name, response, dimensions) => {
    const { rows } = normalize(response as SearchAnalyticsResponse, dimensions as string[]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const result = envelopeRowSchema.safeParse(row);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("produces the upsert key section 7 specifies", () => {
    const [row] = normalize(BY_QUERY, ["date", "query"]).rows;
    expect(upsertKey(row as never)).toBe(
      "search_console sc-domain:example.test query:running shoes 2026-08-14 none",
    );
  });

  it("leaves attribution_window null, which here is the label and not a gap", () => {
    // Clicks and impressions are counts of what happened; nothing is attributed to anything. The
    // envelope permits null for exactly this row shape and refuses it the moment a conversion
    // metric appears, so this is the schema agreeing rather than the schema being dodged.
    const [row] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(row?.dimensions.attribution_window).toBeNull();
  });

  it("carries no restatement window, because nobody has measured one", () => {
    // RESTATEMENT_CLOCKS.search_console.windowDays is null, and null means UNKNOWN rather than
    // zero. Anything else here would be an invented number indistinguishable from a sourced one.
    const [row] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(row?.restates_until).toBeNull();
  });

  it("stays provisional at every fetch time, and derives it rather than asserting it", () => {
    // A null window means the row may always still change, so `is_provisional` is true today at any
    // fetched_at. It is still DERIVED: the day somebody measures the window and sets a number, a
    // hard-coded `true` would keep claiming the old answer for every row ever emitted.
    //
    // THIS TEST CANNOT CATCH THAT, AND SAYING SO IS THE POINT. Replacing the derivation with a
    // literal `true` passes the whole suite, because with windowDays null the two agree at every
    // fetch time there is. The mutation is unkillable from here and becomes killable the moment
    // RESTATEMENT_CLOCKS.search_console carries a measured number -- which is exactly when a
    // hard-coded `true` would start lying. The derivation stays because of that day, not this one.
    for (const at of ["2026-08-14T06:00:00Z", "2036-01-01T00:00:00Z"]) {
      const [row] = normalizeSearchAnalytics({
        response: DAILY_TOTALS,
        dimensions: ["date"],
        siteUrl: FIXTURE_SITE_URL,
        fetchedAt: at,
        firstSeenAt: FIRST_SEEN_AT,
      }).rows;
      expect(row?.is_provisional).toBe(true);
    }
  });
});

describe("the grain, chosen from the entity-type enum rather than invented", () => {
  it.each([
    [DAILY_TOTALS, ["date"], "property", "site", "sc-domain:example.test"],
    [BY_QUERY, ["date", "query"], "query", "query", "running shoes"],
    [BY_PAGE, ["date", "page"], "page", "page", "https://example.test/shoes/running"],
  ])("maps a report onto the %# entity type", (response, dimensions, grain, native, nativeId) => {
    const result = normalize(response as SearchAnalyticsResponse, dimensions as string[]);
    expect(result.grain).toBe(grain);
    const [row] = result.rows;
    expect(row?.entity.type).toBe(grain);
    expect(row?.entity.native_entity_type).toBe(native);
    expect(row?.entity.native_id).toBe(nativeId);
    expect(row?.entity.account_id).toBe(FIXTURE_SITE_URL);
  });

  it("namespaces the entity id by grain, because the upsert key carries no entity type", () => {
    // People paste URLs into Google. The section 7 key is (source, account_id, entity_id, date,
    // attribution_window) with no entity type in it, so an unprefixed query that happens to be a
    // page URL upserts onto that page's row and one of the two numbers disappears. Search Console
    // is the first source here that emits two grains for one account, so nothing has needed this
    // before.
    const [queryRow] = normalize(QUERY_THAT_IS_A_PAGE_URL, ["date", "query"]).rows;
    const [pageRow] = normalize(BY_PAGE, ["date", "page"]).rows;

    expect(queryRow?.entity.native_id).toBe(pageRow?.entity.native_id);
    expect(queryRow?.entity.id).not.toBe(pageRow?.entity.id);
    expect(upsertKey(queryRow as never)).not.toBe(upsertKey(pageRow as never));
  });

  it("keeps the platform's own value in native_id, unprefixed", () => {
    const [row] = normalize(BY_QUERY, ["date", "query"]).rows;
    expect(row?.entity.id).toBe("query:running shoes");
    expect(row?.entity.native_id).toBe("running shoes");
  });

  it("refuses a report with no date dimension", () => {
    expect(() => grainFor(["query"])).toThrow(/date/);
  });

  it("refuses two grains in one report, rather than dropping one of them", () => {
    // ["date","query","page"] is a legal Search Console report and there is no composite member of
    // ENTITY_TYPES to land it on. Picking either half silently collapses distinct rows onto one id.
    try {
      grainFor(["date", "query", "page"]);
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
      expect((error as SearchConsoleNormalizeError).code).toBe("composite_grain");
    }
  });

  it("refuses a dimension this connector has not decided a grain for", () => {
    try {
      grainFor(["date", "device"]);
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
      expect((error as SearchConsoleNormalizeError).code).toBe("unsupported_dimension");
      expect((error as Error).message).toContain("device");
    }
  });
});

describe("the anonymity threshold, which is the whole reason this connector is careful", () => {
  it("tells every caller that query-grain rows are a subset", () => {
    // The flag is on the RESULT rather than nowhere, because the envelope row has no field that can
    // carry it. A caller cannot take the rows without also being handed the fact.
    expect(normalize(BY_QUERY, ["date", "query"]).anonymityThresholded).toBe(true);
    expect(normalize(BY_PAGE, ["date", "page"]).anonymityThresholded).toBe(true);
    expect(normalize(DAILY_TOTALS, ["date"]).anonymityThresholded).toBe(false);
  });

  it("refuses to total a thresholded grain, and names the report that does total", () => {
    try {
      totalsByDate(normalize(BY_QUERY, ["date", "query"]));
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
      expect((error as SearchConsoleNormalizeError).code).toBe("thresholded_sum");
      expect((error as Error).message).toContain("date-only report");
    }
  });

  it("totals the date-only report, which is Google's own number", () => {
    const totals = totalsByDate(normalize(DAILY_TOTALS, ["date"]));
    expect(totals.get("2026-08-14")).toEqual({ clicks: 1284, impressions: 40210 });
  });

  it("the gap is real in the fixtures, not an abstraction", () => {
    // 688 against 1284 on the same day and the same property. If these two ever agreed, a
    // normaliser that summed the query rows and called it a total would pass its own suite.
    const queryRows = normalize(BY_QUERY, ["date", "query"]).rows.filter(
      (row) => row.dimensions.date === "2026-08-14",
    );
    const summed = queryRows.reduce((total, row) => total + (row.metrics.clicks ?? 0), 0);
    const [total] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(summed).toBe(688);
    expect(total?.metrics.clicks).toBe(1284);
    expect(summed).toBeLessThan(total?.metrics.clicks ?? 0);
  });
});

describe("what is emitted, and what is deliberately not", () => {
  it("emits clicks, impressions and position -- and still not ctr", () => {
    // `ctr` is clicks/impressions and storing a derived value beside its inputs is how one number
    // becomes two that drift. That stays a decision. `position` was held back only until the
    // dictionary could describe a non-additive metric; it now can, so it ships.
    const [row] = normalize(BY_QUERY, ["date", "query"]).rows;
    expect(Object.keys(row?.metrics ?? {}).sort()).toEqual(["clicks", "impressions", "position"]);
    expect(row?.metrics.clicks).toBe(412);
    expect(row?.metrics.impressions).toBe(9100);
    expect(row?.metrics.position).toBe(6.2);
    expect(Object.keys(row?.metrics ?? {})).not.toContain("ctr");
  });

  it("refuses a zero position, which reads as better than rank one", () => {
    // A SERP position is a 1-based ordinal. Zero is not a worse rank -- it is a better one, and a
    // row carrying it would show a site ranking above the top result.
    expect(() => parseSearchConsolePosition(0)).toThrow(/1-based ordinal/);
    expect(() => parseSearchConsolePosition(-3)).toThrow();
    // A count parser must NOT make that refusal: a zero click count is an ordinary Tuesday.
    expect(parseSearchConsoleMetric(0, "clicks")).toBe(0);
  });

  it("carries a fractional position rather than rounding it to a rank", () => {
    // 18.4 is a mean of ordinals, not an ordinal. Rounding here would discard the difference
    // between "just off page two" and "mid page two" for every row.
    const [row] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(row?.metrics.position).toBe(18.4);
  });

  it("never sums position when totalling a day, however tempting the shape", () => {
    // `totalsByDate` SUMS, which is right for clicks and impressions and catastrophic for a rank.
    // The type has no position field, and this asserts the absence rather than trusting it.
    const totals = totalsByDate(normalize(DAILY_TOTALS, ["date"]));
    for (const total of totals.values()) {
      expect(Object.keys(total).sort()).toEqual(["clicks", "impressions"]);
    }
  });

  it("rolls position up by weighting it, not averaging it", () => {
    // The number the whole aggregation semantic exists for. These rows are real fixture rows at
    // query grain; a simple mean of their positions is a different, plausible, wrong figure.
    const rows = normalize(BY_QUERY, ["date", "query"]).rows.filter(
      (r) => r.dimensions.date === "2026-08-14",
    );
    const weighted = combineMetric(
      "position",
      rows.map((r) => r.metrics),
    );
    const simpleMean = rows.reduce((t, r) => t + (r.metrics.position ?? 0), 0) / rows.length;
    expect(weighted).not.toBeNull();
    expect(weighted).not.toBeCloseTo(simpleMean, 4);
    // And it lands inside the range of the rows it came from, which a sum never would.
    const positions = rows.map((r) => r.metrics.position ?? 0);
    expect(weighted).toBeGreaterThanOrEqual(Math.min(...positions));
    expect(weighted).toBeLessThanOrEqual(Math.max(...positions));
  });

  it("labels the currency XXX, which is the ISO code for no currency involved", () => {
    // Search Console reports no money at all. Stamping the workspace's currency on the row would
    // denominate a click count and invite the FX layer to convert it.
    const [row] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(row?.dimensions.currency).toBe(SEARCH_CONSOLE_CURRENCY);
    expect(row?.dimensions.currency).toBe("XXX");
    expect(row?.fx_source).toBeNull();
    expect(row?.fx_rate).toBeNull();
  });

  it("labels the timezone as the platform's Pacific reporting day, not the workspace's", () => {
    // Unlike GA4 this is a documented constant rather than a value read from the response, and a
    // Bangkok default would make a join against a GA4 property compare two different days.
    const [row] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(row?.dimensions.timezone).toBe(SEARCH_CONSOLE_TIMEZONE);
    expect(row?.dimensions.timezone).toBe("America/Los_Angeles");
  });

  it("leaves source_updated_at null rather than copying fetched_at", () => {
    const [row] = normalize(DAILY_TOTALS, ["date"]).rows;
    expect(row?.source_updated_at).toBeNull();
  });

  it("keeps the platform's own row in raw, and reports how Google aggregated", () => {
    const result = normalize(BY_PAGE, ["date", "page"]);
    expect(result.responseAggregationType).toBe("byPage");
    expect(result.rows[0]?.raw).toBe(BY_PAGE.rows?.[0]);
  });
});

describe("refusing rather than coercing", () => {
  it("returns nothing when the window has no data, and rows is absent rather than empty", () => {
    // Search Console omits `rows` entirely on a quiet day, which is also the ordinary case at the
    // newest end of a backfill under dataState: final.
    expect(normalize(EMPTY, ["date"]).rows).toEqual([]);
    expect(EMPTY.rows).toBeUndefined();
  });

  it("refuses a key count that does not match the dimensions requested", () => {
    // The response echoes no dimension names. A mismatch does not lose one value; it reads every
    // value as something it is not.
    try {
      normalize(KEYS_TOO_FEW, ["date", "query"]);
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
      expect((error as SearchConsoleNormalizeError).code).toBe("shape_mismatch");
    }
  });

  it("refuses an empty dimension value, which cannot identify an entity", () => {
    try {
      normalize(EMPTY_QUERY, ["date", "query"]);
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
      expect((error as SearchConsoleNormalizeError).code).toBe("empty_dimension_value");
    }
  });

  it("refuses a negative count", () => {
    expect(() => normalize(NEGATIVE_CLICKS, ["date", "query"])).toThrow(/negative count/);
  });

  it("refuses an absent metric rather than reading it as zero", () => {
    // A wrong zero is indistinguishable from a real one, which is the whole argument.
    try {
      normalize(MISSING_IMPRESSIONS, ["date", "query"]);
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
      expect((error as SearchConsoleNormalizeError).code).toBe("unparseable_value");
      expect((error as Error).message).toContain("impressions");
      // The MESSAGE is asserted, not only the code. Deleting the absent-value branch left the
      // later finite-number check to refuse `undefined` anyway, so the row was still refused and
      // the test still passed -- for the wrong reason, and with an error that no longer says what
      // the caller did wrong. Mutation testing found that; this line is the fix.
      expect((error as Error).message).toContain("reading it as zero");
    }
  });

  it("refuses a metric that arrived as a string, the way GA4's do", () => {
    // Defensive rather than observed: the two Google APIs this repo reads disagree about the type,
    // and "12" + "7" is "127".
    expect(() => normalize(STRING_METRIC, ["date", "query"])).toThrow(/not a finite number/);
    expect(() => parseSearchConsoleMetric("12", "clicks")).toThrow(/not a finite number/);
  });

  it("refuses a date that Date.parse would roll over into the next month", () => {
    // 2026-02-30 parses, and lands on 2 March. A regex plus a NaN check files the row two days
    // late; only the round trip back to a string catches it.
    expect(Number.isNaN(Date.parse("2026-02-30T00:00:00Z"))).toBe(false);
    expect(() => normalize(IMPOSSIBLE_DATE, ["date", "query"])).toThrow(/real calendar date/);
    expect(parseSearchConsoleDate("2026-08-14")).toBe("2026-08-14");
    expect(() => parseSearchConsoleDate("20260814")).toThrow(/YYYY-MM-DD/);
  });
});
