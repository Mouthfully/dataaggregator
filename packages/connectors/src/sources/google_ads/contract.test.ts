import { envelopeRowSchema, upsertKey } from "@repo/contract";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TOTALS,
  AD_GROUP_ROWS,
  DAILY_CAMPAIGNS,
  EMPTY,
  LOWERCASE_CURRENCY,
  METRIC_COLLISION,
  NO_CURRENCY,
  NO_DATE,
  NO_ENTITY_ID,
  NO_FIELD_MASK,
  NO_TIMEZONE,
  NULL_METRIC,
  ROW_MISSING_CURRENCY,
  SNAKE_CASE_RESPONSE,
  SPEND_ONLY,
  UNMAPPED_METRIC,
  UNPARSEABLE_METRIC,
  UNSAFE_MICROS,
  ZERO_SPEND_DAY,
} from "./fixtures.ts";
import {
  GOOGLE_ADS_LEVELS,
  type GoogleAdsLevel,
  GoogleAdsNormalizeError,
  type GoogleAdsSearchResponse,
  googleAdsDate,
  microsToCurrency,
  normalizeGoogleAdsSearch,
  parseGoogleAdsNumber,
} from "./normalize.ts";

const FETCHED_AT = "2026-09-08T02:00:00Z";
const FIRST_SEEN_AT = "2026-08-14T06:00:00Z";

function normalize(
  response: GoogleAdsSearchResponse,
  level: GoogleAdsLevel = "campaign",
  accountWindowDays?: number,
) {
  return normalizeGoogleAdsSearch({
    response,
    level,
    fetchedAt: FETCHED_AT,
    firstSeenAt: FIRST_SEEN_AT,
    ...(accountWindowDays === undefined ? {} : { accountWindowDays }),
  });
}

describe("the contract: every row must satisfy the envelope", () => {
  // Section 13.3's pre-merge requirement. Not "looks about right" -- parsed by the real schema.

  it("emits rows the envelope schema accepts", () => {
    for (const row of normalize(DAILY_CAMPAIGNS)) {
      const result = envelopeRowSchema.safeParse(row);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it.each(["account", "campaign", "ad_group"] as const)(
    "emits schema-valid rows at %s grain",
    (level) => {
      const response =
        level === "account"
          ? ACCOUNT_TOTALS
          : level === "ad_group"
            ? AD_GROUP_ROWS
            : DAILY_CAMPAIGNS;
      for (const row of normalize(response, level)) {
        const result = envelopeRowSchema.safeParse(row);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      }
    },
  );

  it("labels the attribution window account_default rather than leaving it null", () => {
    // The envelope refuses an unlabelled conversion count. Google Ads attributes by a per-account,
    // per-conversion-action window and model that this response does not state, so the honest label
    // is the general true one -- not `dda`, which would assert a model we have not read.
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.dimensions.attribution_window).toBe("account_default");
  });

  it("keeps the window on a row with no conversion metric, so the upsert key does not fork", () => {
    // The envelope would allow null here. A spend-only pull writing null and a conversions pull
    // writing account_default would be two DIFFERENT upsert keys for one campaign-day, and the
    // store would hold both.
    const [spendOnly] = normalize(SPEND_ONLY);
    const [full] = normalize(DAILY_CAMPAIGNS);
    expect(spendOnly?.dimensions.attribution_window).toBe("account_default");
    expect(upsertKey(spendOnly as never)).toBe(upsertKey(full as never));
  });

  it("produces the upsert key section 7 specifies", () => {
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(upsertKey(row as never)).toBe("google_ads 1234567890 22001 2026-08-14 account_default");
  });

  it("carries a 30-day restatement window by default, anchored on first sight", () => {
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.restates_until).toBe("2026-09-13T06:00:00.000Z");
  });

  it("honours the account's own conversion window, because Google's is per account", () => {
    // RESTATEMENT_CLOCKS.google_ads is perAccount: true -- the click-through window defaults to 30
    // days and caps at 90. A row from a 90-day account stays open three times as long, and
    // `connections.restatement_window_days` is where that number lives.
    const [row] = normalize(DAILY_CAMPAIGNS, "campaign", 90);
    expect(row?.restates_until).toBe("2026-11-12T06:00:00.000Z");
  });

  it("derives is_provisional from the window rather than asserting it", () => {
    // Both rows share a restates_until, because first_seen_at is immutable. Only the fetch time
    // differs, and that alone decides whether the row may still change. A hard-coded `true` passes
    // the schema and lies to the customer.
    const at = (fetchedAt: string) =>
      normalizeGoogleAdsSearch({
        response: DAILY_CAMPAIGNS,
        level: "campaign",
        fetchedAt,
        firstSeenAt: FIRST_SEEN_AT,
      })[0];

    expect(at("2026-09-08T02:00:00Z")?.is_provisional).toBe(true);
    expect(at("2026-10-01T00:00:00Z")?.is_provisional).toBe(false);
    expect(at("2026-10-01T00:00:00Z")?.restates_until).toBe("2026-09-13T06:00:00.000Z");
  });
});

describe("micros, where the headline number is off by a million", () => {
  it("divides cost_micros into currency units", () => {
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.metrics.spend).toBe(1234.56);
  });

  it("does NOT divide conversions_value, which Google reports in whole units", () => {
    // Two money metrics on one row, scaled differently. Applying the micros rule to both reports
    // 0.05 THB of conversion value against 1,234.56 of spend, and every margin is nonsense.
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.metrics.conversions_value).toBe(51240.25);
  });

  it("converts micros directly, including the case a reader checks by hand", () => {
    expect(microsToCurrency("1234560000", "metrics.cost_micros")).toBe(1234.56);
    expect(microsToCurrency(0, "metrics.cost_micros")).toBe(0);
    expect(microsToCurrency("-45000000", "metrics.cost_micros")).toBe(-45);
  });

  it("refuses a cost that has already lost digits on the way to a number", () => {
    // 9007199254740993 exceeds MAX_SAFE_INTEGER: Number() returns ...92 and says nothing. Divided,
    // the error lands six orders of magnitude into the money column.
    try {
      normalize(UNSAFE_MICROS);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("micros_precision");
      expect((error as Error).message).toContain("9007199254740993");
    }
  });

  it("refuses a micros value that is not an integer count of millionths", () => {
    expect(() => microsToCurrency(1234.5, "metrics.cost_micros")).toThrow(/safe integer/);
  });
});

describe("proto3 shapes, where absent and zero are not the same thing", () => {
  it("reads an omitted metric named in the field mask as a real zero", () => {
    // proto3 JSON leaves a default value out of the message, so a campaign that spent nothing has
    // no costMicros key. Refusing here would delete every paused campaign from the report.
    const [row] = normalize(ZERO_SPEND_DAY);
    expect(row?.metrics.spend).toBe(0);
    expect(row?.metrics.clicks).toBe(0);
    expect(row?.metrics.impressions).toBe(0);
  });

  it("emits nothing for a metric the query never selected", () => {
    // The mirror of the rule above, and the reason it is safe: absent-means-zero applies ONLY to
    // what the field mask says was requested. A zero on a metric nobody asked for is invented.
    const [row] = normalize(SPEND_ONLY);
    expect(row?.metrics.spend).toBe(1234.56);
    expect(row?.metrics.clicks).toBeUndefined();
    expect(row?.metrics.conversions).toBeUndefined();
  });

  it("accepts int64 as a string and double as a number, which is one response", () => {
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.metrics.impressions).toBe(18422);
    expect(typeof row?.metrics.impressions).toBe("number");
    expect(row?.metrics.conversions).toBe(37.5);
  });

  it("keeps a fractional conversion count fractional", () => {
    // Attribution modelling credits fractions of a conversion. Rounding it to 38 invents data the
    // platform did not report, in the column the envelope refuses to emit unlabelled.
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.metrics.conversions).toBe(37.5);
    expect(parseGoogleAdsNumber("37.5", "metrics.conversions")).toBe(37.5);
  });

  it("normalises the whole response when it arrives in snake_case", () => {
    // If the mask and the payload were ever snake_case, a camelCase-only reader would not fail --
    // every metric would miss, and the absent-means-zero rule would report a complete report of
    // zeroes with nothing saying so.
    const [row] = normalize(SNAKE_CASE_RESPONSE);
    expect(row?.metrics.spend).toBe(1234.56);
    expect(row?.metrics.clicks).toBe(913);
    expect(row?.dimensions.currency).toBe("THB");
    expect(row?.dimensions.timezone).toBe("Asia/Bangkok");
  });

  it("refuses an explicit null rather than reading it as an omitted zero", () => {
    expect(() => normalize(NULL_METRIC)).toThrow(/has no value/);
  });
});

describe("the date, and the account's own day boundary", () => {
  it("runs this suite outside UTC, which is what makes the next test able to fail", () => {
    // vitest.config.ts pins TZ=Asia/Bangkok. Without it, re-anchoring a bare calendar day to the
    // runtime's offset produces the same string as leaving it alone, and three of this file's
    // assertions become decorative.
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Bangkok");
  });

  it("carries segments.date through untouched, because it is already the account's own day", () => {
    // A Google Ads date is a calendar day in the ACCOUNT's time zone. Any round trip through Date
    // re-anchors it to the runtime's offset: `new Date("2026-08-14T00:00:00")` in Bangkok is
    // 2026-08-13T17:00Z, and an ISO round trip hands back the day before.
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.dimensions.date).toBe("2026-08-14");
    expect(googleAdsDate("2026-08-14", "segments.date")).toBe("2026-08-14");
  });

  it("carries the account's time zone, which is what makes the date mean anything", () => {
    // Defaulting to UTC would move a Bangkok account's day boundary by seven hours, so every day's
    // totals would be a blend of two of the platform's days.
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.dimensions.timezone).toBe("Asia/Bangkok");
    expect(row?.dimensions.currency).toBe("THB");
  });

  it("refuses anything that is not a bare YYYY-MM-DD", () => {
    expect(() => googleAdsDate("2026-08-14T00:00:00Z", "segments.date")).toThrow(/calendar date/);
    expect(() => googleAdsDate("20260814", "segments.date")).toThrow(/calendar date/);
    expect(() => googleAdsDate(undefined, "segments.date")).toThrow(/calendar date/);
  });

  it("refuses a report that never selected a date", () => {
    try {
      normalize(NO_DATE);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("missing_date");
    }
  });
});

describe("refusing rather than coercing", () => {
  it("refuses a response with no field mask", () => {
    try {
      normalize(NO_FIELD_MASK);
      throw new Error("should have refused");
    } catch (error) {
      // The connector's own error, not an incidental TypeError from reading through an undefined:
      // one is a refusal this module decided on, the other is a crash that happens to stop it.
      expect(error).toBeInstanceOf(GoogleAdsNormalizeError);
      expect((error as GoogleAdsNormalizeError).code).toBe("missing_field_mask");
      expect((error as Error).message).toContain("fieldMask");
    }
  });

  it.each([
    ["currency", NO_CURRENCY],
    ["time zone", NO_TIMEZONE],
  ])("refuses when %s alone is unselected", (_field, response) => {
    // One assertion per field. A fixture missing BOTH lets a default on either one survive: the
    // other still throws and the test passes without testing what it names. This pair exists
    // because exactly that happened in the GA4 connector.
    try {
      normalize(response);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("missing_customer");
    }
  });

  it("refuses a row missing a customer field the query did select", () => {
    expect(() => normalize(ROW_MISSING_CURRENCY)).toThrow(/mislabel/);
  });

  it("refuses a currency that is not an ISO 4217 code rather than upper-casing it", () => {
    try {
      normalize(LOWERCASE_CURRENCY);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("bad_currency");
    }
  });

  it("refuses a row with no entity id", () => {
    try {
      normalize(NO_ENTITY_ID);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("missing_entity");
    }
  });

  it("refuses a metric with no dictionary entry, before emitting anything", () => {
    try {
      normalize(UNMAPPED_METRIC);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("unmapped_metric");
      expect((error as Error).message).toContain("ctr");
    }
  });

  it("refuses two mask paths that collapse onto one canonical metric", () => {
    try {
      normalize(METRIC_COLLISION);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("metric_collision");
      expect((error as Error).message).toContain("spend");
    }
  });

  it("refuses a metric value that is not a number", () => {
    try {
      normalize(UNPARSEABLE_METRIC);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as GoogleAdsNormalizeError).code).toBe("unparseable_value");
      expect((error as Error).message).toContain("n/a");
    }
  });
});

describe("the grain, and what it says about itself", () => {
  it("carries Google's own vocabulary alongside the canonical grain", () => {
    const [campaign] = normalize(DAILY_CAMPAIGNS);
    expect(campaign?.entity.type).toBe("campaign");
    expect(campaign?.entity.native_entity_type).toBe("campaign");
    expect(campaign?.entity.id).toBe("22001");
    expect(campaign?.entity.account_id).toBe("1234567890");
    expect(campaign?.entity.name).toBe("Search - Brand");
  });

  it("makes an account row's entity and account the same id, as GA4's property does", () => {
    const [row] = normalize(ACCOUNT_TOTALS, "account");
    expect(row?.entity.type).toBe("account");
    expect(row?.entity.native_entity_type).toBe("customer");
    expect(row?.entity.id).toBe(row?.entity.account_id);
    expect(row?.entity.name).toBe("Example Retail Co");
  });

  it("asks the platform for an ad group's parent id rather than parsing a resource name", () => {
    const [row] = normalize(AD_GROUP_ROWS, "ad_group");
    expect(row?.entity.type).toBe("ad_group");
    expect(row?.entity.id).toBe("33001");
    expect(row?.entity.parent_id).toBe("22001");
  });

  it("omits a name the query did not select, rather than inventing an empty one", () => {
    const [row] = normalize(SPEND_ONLY);
    expect(row?.entity.name).toBeUndefined();
  });

  it("declares the fields a query must select, so parser and query cannot drift", () => {
    for (const level of ["account", "campaign", "ad_group"] as const) {
      const spec = GOOGLE_ADS_LEVELS[level];
      expect(spec.selectFields).toContain("customer.currency_code");
      expect(spec.selectFields).toContain("customer.time_zone");
      expect(spec.selectFields).toContain("segments.date");
      expect(spec.selectFields).toContain(spec.idPath);
    }
    expect(GOOGLE_ADS_LEVELS.ad_group.selectFields).toContain("campaign.id");
  });

  it("does not read the grains that would make the payload redaction policy untrue", () => {
    // `search_term` and `keyword` carry free text a person typed. REDACTION_POLICIES.google_ads
    // declares this source `verbatim` on the stated grounds that it is aggregate campaign
    // reporting with no contact data, and an archived payload cannot know that stopped being true.
    expect(Object.keys(GOOGLE_ADS_LEVELS)).toEqual(["account", "campaign", "ad_group"]);
  });
});

describe("things that are not errors", () => {
  it("returns nothing for an account with no rows in the window", () => {
    expect(normalize(EMPTY)).toEqual([]);
  });

  it("leaves source_updated_at null, because Google publishes no freshness statement at all", () => {
    // RESTATEMENT_CLOCKS.google_ads records that no authoritative freshness or finalisation
    // statement was found across three attempts. Copying fetched_at would manufacture one.
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.source_updated_at).toBeNull();
  });

  it("leaves the fx fields null, because Google Ads converts nothing", () => {
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.fx_source).toBeNull();
    expect(row?.fx_rate).toBeNull();
    expect(row?.fx_base).toBeNull();
  });

  it("keeps the platform's own result row in raw", () => {
    const [row] = normalize(DAILY_CAMPAIGNS);
    expect(row?.raw).toBeDefined();
  });
});
