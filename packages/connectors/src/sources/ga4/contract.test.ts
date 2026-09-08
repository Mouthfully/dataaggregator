import { envelopeRowSchema, upsertKey } from "@repo/contract";
import { describe, expect, it } from "vitest";
import {
  DAILY_REVENUE,
  DAILY_SESSIONS,
  EMPTY,
  METRIC_COLLISION,
  NO_CURRENCY,
  NO_METADATA,
  NO_TIMEZONE,
  SHAPE_MISMATCH,
  UNMAPPED_METRIC,
} from "./fixtures.js";
import {
  Ga4NormalizeError,
  normalizeGa4Report,
  parseGa4Date,
  parseGa4Number,
} from "./normalize.js";

const PROPERTY = "properties/123456";
const FETCHED_AT = "2026-09-08T02:00:00Z";
const FIRST_SEEN_AT = "2026-08-14T06:00:00Z";

function normalize(report: Parameters<typeof normalizeGa4Report>[0]["report"]) {
  return normalizeGa4Report({
    report,
    propertyId: PROPERTY,
    fetchedAt: FETCHED_AT,
    firstSeenAt: FIRST_SEEN_AT,
  });
}

describe("the contract: every row must satisfy the envelope", () => {
  // Section 13.3's pre-merge requirement. Not "looks about right" -- parsed by the real schema.

  it("emits rows the envelope schema accepts", () => {
    for (const row of normalize(DAILY_SESSIONS)) {
      const result = envelopeRowSchema.safeParse(row);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("labels the attribution window rather than leaving it null", () => {
    // GA4 adjusts at model level, so `model` is what the platform actually did. A null here would
    // make the envelope refuse the row, correctly, as an unlabelled conversion count.
    const [row] = normalize(DAILY_SESSIONS);
    expect(row?.dimensions.attribution_window).toBe("model");
  });

  it("produces the upsert key section 7 specifies", () => {
    const [row] = normalize(DAILY_SESSIONS);
    expect(upsertKey(row as never)).toBe(
      "ga4 properties/123456 properties/123456 2026-08-14 model",
    );
  });

  it("carries a 12-day restatement window, anchored on first sight", () => {
    const [row] = normalize(DAILY_SESSIONS);
    expect(row?.restates_until).toBe("2026-08-26T06:00:00.000Z");
  });

  it("derives is_provisional from the window rather than asserting it", () => {
    // Both rows have the SAME restates_until, because first_seen_at is immutable. Only the fetch
    // time differs, and that alone decides whether the row may still change.
    //
    // Hard-coding `true` here would pass the schema and lie to the customer, which is the one thing
    // the envelope exists to prevent -- and it was doing exactly that: FETCHED_AT is 2026-09-08 and
    // the window closed 2026-08-26, so every row this module emitted for the module's own fixture
    // claimed it might still change, thirteen days after it could not.
    const at = (fetchedAt: string) =>
      normalizeGa4Report({
        report: DAILY_SESSIONS,
        propertyId: PROPERTY,
        fetchedAt,
        firstSeenAt: FIRST_SEEN_AT,
      })[0];

    const open = at("2026-08-20T02:00:00Z");
    expect(open?.restates_until).toBe("2026-08-26T06:00:00.000Z");
    expect(open?.is_provisional).toBe(true);

    const closed = at("2026-09-08T02:00:00Z");
    expect(closed?.restates_until).toBe("2026-08-26T06:00:00.000Z");
    expect(closed?.is_provisional).toBe(false);
  });
});

describe("the four GA4 traps", () => {
  it("parses string metric values into numbers", () => {
    // GA4 returns "1284", not 1284. Summed as strings, two rows concatenate.
    const [row] = normalize(DAILY_SESSIONS);
    expect(row?.metrics.sessions).toBe(1284);
    expect(typeof row?.metrics.sessions).toBe("number");
  });

  it("converts YYYYMMDD dates", () => {
    expect(parseGa4Date("20260814")).toBe("2026-08-14");
    const [row] = normalize(DAILY_SESSIONS);
    expect(row?.dimensions.date).toBe("2026-08-14");
  });

  it("takes currency and timezone from the property metadata, not from a default", () => {
    // Defaulting would label a JPY property's revenue as EUR.
    const [row] = normalize(DAILY_REVENUE);
    expect(row?.dimensions.currency).toBe("JPY");
    expect(row?.dimensions.timezone).toBe("Asia/Tokyo");
  });

  it("refuses a response with no metadata rather than guessing", () => {
    try {
      normalize(NO_METADATA);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as Ga4NormalizeError).code).toBe("missing_metadata");
      expect((error as Error).message).toContain("mislabel");
    }
  });

  it.each([
    ["currency", NO_CURRENCY],
    ["timezone", NO_TIMEZONE],
  ])("refuses when %s alone is missing", (_field, report) => {
    // One assertion per field, because a fixture missing BOTH lets a default on either one survive:
    // the other field still throws and the test passes without testing anything.
    expect(() => normalize(report)).toThrow(/metadata/);
  });
});

describe("refusing rather than coercing", () => {
  it("refuses a metric value that is not a number", () => {
    // Coercing to zero is the worst outcome: a wrong zero is indistinguishable from a real one.
    expect(() => parseGa4Number("(not set)", "sessions")).toThrow(/not a number/);
    expect(() => parseGa4Number("", "sessions")).toThrow(/has no value/);
    expect(() => parseGa4Number(undefined, "sessions")).toThrow(/has no value/);
  });

  it("refuses a metric with no dictionary entry, before emitting anything", () => {
    // Section 13.3 rule 2: a new metric requires a dictionary change first, not a silent rename.
    try {
      normalize(UNMAPPED_METRIC);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as Ga4NormalizeError).code).toBe("unmapped_metric");
      expect((error as Error).message).toContain("bounceRate");
    }
  });

  it("refuses a positional mismatch between headers and values", () => {
    // GA4 returns values positionally. A mismatch does not lose one value, it attributes every
    // value to the wrong name.
    try {
      normalize(SHAPE_MISMATCH);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as Ga4NormalizeError).code).toBe("shape_mismatch");
    }
  });

  it("refuses two GA4 metrics that collapse onto one canonical metric", () => {
    // The map is many-to-one. Without this, the second value overwrites the first and the row
    // reports a number nothing in the response supports.
    try {
      normalize(METRIC_COLLISION);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as Ga4NormalizeError).code).toBe("metric_collision");
      expect((error as Error).message).toContain("conversions_value");
    }
  });

  it("refuses a report with no date dimension", () => {
    expect(() =>
      normalize({
        dimensionHeaders: [{ name: "country" }],
        metricHeaders: [{ name: "sessions" }],
        rows: [{ dimensionValues: [{ value: "DE" }], metricValues: [{ value: "1" }] }],
        metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
      }),
    ).toThrow(/no `date` dimension/);
  });
});

describe("things that are not errors", () => {
  it("returns nothing for a property with no data in the window", () => {
    expect(normalize(EMPTY)).toEqual([]);
  });

  it("leaves the fx fields null, because GA4 has not converted anything", () => {
    // GA4 reports in the property's own currency. The FX layer fills these when it converts to the
    // workspace's currency; asserting a conversion here would be asserting one that never happened.
    const [row] = normalize(DAILY_REVENUE);
    expect(row?.fx_source).toBeNull();
    expect(row?.fx_rate).toBeNull();
  });

  it("leaves source_updated_at null rather than copying fetched_at", () => {
    // GA4 publishes no per-row freshness timestamp. Copying fetched_at would assert a freshness the
    // platform never reported.
    const [row] = normalize(DAILY_SESSIONS);
    expect(row?.source_updated_at).toBeNull();
  });

  it("keeps the platform's own response in raw", () => {
    const [row] = normalize(DAILY_SESSIONS);
    expect(row?.raw).toBeDefined();
  });
});
