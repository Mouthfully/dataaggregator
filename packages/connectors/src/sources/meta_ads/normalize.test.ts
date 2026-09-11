import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LEVEL,
  AD_LEVEL,
  ADSET_LEVEL,
  AGGREGATED_RANGE,
  DAILY_CAMPAIGN,
  DELIVERY_ONLY,
  DUPLICATE_PURCHASE,
  EMPTY,
  FIXTURE_ACCOUNT,
  MISSING_CAMPAIGN_ID,
  MIXED_ACTION_TYPES,
  NO_CURRENCY,
  SPARSE_WINDOWS,
  UNMAPPED_FIELD,
  UNPARSEABLE_SPEND,
  VALUE_ONLY,
  WRONG_ACCOUNT,
} from "./fixtures.js";
import {
  META_ACTION_WINDOWS,
  type MetaActionWindow,
  type MetaInsightsRow,
  type MetaLevel,
  MetaNormalizeError,
  metaAccountId,
  normalizeMetaInsights,
  parseMetaNumber,
} from "./normalize.js";

const TIMEZONE = "Asia/Bangkok";
const FETCHED_AT = "2026-09-08T02:00:00Z";
const FIRST_SEEN_AT = "2026-08-14T06:00:00Z";

/** The six click and view windows. `1d_ev` is available and not requested by default. */
const SIX: readonly MetaActionWindow[] = [
  "1d_click",
  "7d_click",
  "28d_click",
  "1d_view",
  "7d_view",
  "28d_view",
];

function normalize(
  rows: readonly MetaInsightsRow[],
  overrides: {
    level?: MetaLevel;
    attributionWindows?: readonly MetaActionWindow[];
    conversionActions?: readonly string[];
    adAccountId?: string;
    timezone?: string;
    fetchedAt?: string;
  } = {},
) {
  return normalizeMetaInsights({
    rows,
    level: overrides.level ?? "campaign",
    adAccountId: overrides.adAccountId ?? FIXTURE_ACCOUNT,
    timezone: overrides.timezone ?? TIMEZONE,
    attributionWindows: overrides.attributionWindows ?? SIX,
    ...(overrides.conversionActions === undefined
      ? {}
      : { conversionActions: overrides.conversionActions }),
    fetchedAt: overrides.fetchedAt ?? FETCHED_AT,
    firstSeenAt: FIRST_SEEN_AT,
  });
}

function windowOf(rows: ReturnType<typeof normalize>, window: MetaActionWindow | null) {
  return rows.find((row) => row.dimensions.attribution_window === window);
}

describe("the fan-out: one insights row is not one envelope row", () => {
  it("emits one delivery row and one row per requested window", () => {
    const rows = normalize(DAILY_CAMPAIGN);
    expect(rows).toHaveLength(1 + SIX.length);
    expect(rows.filter((row) => row.dimensions.attribution_window === null)).toHaveLength(1);
    expect(new Set(rows.map((row) => row.dimensions.attribution_window)).size).toBe(SIX.length + 1);
  });

  it("puts each window's own count on its own row", () => {
    const rows = normalize(DAILY_CAMPAIGN);
    expect(windowOf(rows, "1d_click")?.metrics.conversions).toBe(21);
    expect(windowOf(rows, "7d_click")?.metrics.conversions).toBe(30);
    expect(windowOf(rows, "28d_click")?.metrics.conversions).toBe(33);
    expect(windowOf(rows, "1d_view")?.metrics.conversions).toBe(4);
    expect(windowOf(rows, "7d_view")?.metrics.conversions).toBe(6);
    expect(windowOf(rows, "28d_view")?.metrics.conversions).toBe(7);
    expect(windowOf(rows, "28d_click")?.metrics.conversions_value).toBe(3300);
  });

  it("never merges two windows into one row", () => {
    // The failure this whole shape exists to prevent: 21 + 30 + 33 + 4 + 6 + 7 = 101 conversions
    // from a day with, at most, 33 of them.
    const rows = normalize(DAILY_CAMPAIGN);
    for (const row of rows) {
      if (row.dimensions.attribution_window === null) continue;
      expect(row.metrics.conversions).toBeLessThanOrEqual(33);
    }
    expect(rows.reduce((sum, row) => sum + (row.metrics.conversions ?? 0), 0)).toBe(101);
  });

  it("carries spend, impressions and clicks on exactly one row", () => {
    // THE DOUBLE-COUNT TEST. Copying delivery onto the six window rows makes sum(spend) 7,407.36
    // for a day that cost 1,234.56, and nothing in the envelope would say so.
    const rows = normalize(DAILY_CAMPAIGN);
    expect(rows.filter((row) => row.metrics.spend !== undefined)).toHaveLength(1);
    expect(rows.reduce((sum, row) => sum + (row.metrics.spend ?? 0), 0)).toBe(1234.56);
    expect(rows.reduce((sum, row) => sum + (row.metrics.impressions ?? 0), 0)).toBe(98765);
    expect(rows.reduce((sum, row) => sum + (row.metrics.clicks ?? 0), 0)).toBe(4321);
  });

  it("leaves the delivery row's window null rather than labelling it", () => {
    const delivery = windowOf(normalize(DAILY_CAMPAIGN), null);
    expect(delivery?.dimensions.attribution_window).toBeNull();
    expect(delivery?.metrics.conversions).toBeUndefined();
    expect(delivery?.metrics.conversions_value).toBeUndefined();
  });

  it("emits no attributed rows when Meta reported no actions at all", () => {
    const rows = normalize(DELIVERY_ONLY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dimensions.attribution_window).toBeNull();
  });

  it("emits an explicit zero for a window Meta credited nothing to", () => {
    // Skipping the row instead would leave yesterday's higher number standing in the store with
    // nothing to correct it, because a restatement DOWN arrives as an absent key.
    const rows = normalize(SPARSE_WINDOWS);
    expect(windowOf(rows, "7d_click")?.metrics.conversions).toBe(12);
    expect(windowOf(rows, "28d_click")?.metrics.conversions).toBe(15);
    expect(windowOf(rows, "1d_view")?.metrics.conversions).toBe(0);
    expect(windowOf(rows, "28d_view")?.metrics.conversions).toBe(0);
  });

  it("returns nothing for an account with no delivery", () => {
    expect(normalize(EMPTY)).toEqual([]);
  });
});

describe("`value` is never read", () => {
  it("ignores it even when it is the only key on the entry", () => {
    // Meta documents `value` only as "Metric value of default attribution window" and never names
    // the default. A count under an unnamed window cannot be labelled, so it must not be stored.
    const rows = normalize(VALUE_ONLY, { attributionWindows: ["7d_click"] });
    expect(windowOf(rows, "7d_click")?.metrics.conversions).toBe(0);
    expect(JSON.stringify(rows.map((row) => row.metrics))).not.toContain("42");
  });

  it("ignores it when it disagrees with every window key", () => {
    const metrics = normalize(DAILY_CAMPAIGN).map((row) => row.metrics);
    // 36 and 9999.99 are the fixture's `value` fields and appear in no window.
    expect(metrics.some((m) => m.conversions === 36)).toBe(false);
    expect(metrics.some((m) => m.conversions_value === 9999.99)).toBe(false);
  });
});

describe("not every action_type is a conversion", () => {
  it("counts only the configured action types", () => {
    // Summing the array reports 7,656 conversions from a day with nine sales.
    const rows = normalize(MIXED_ACTION_TYPES, { attributionWindows: ["7d_click"] });
    expect(windowOf(rows, "7d_click")?.metrics.conversions).toBe(9);
    expect(windowOf(rows, "7d_click")?.metrics.conversions_value).toBe(1980);
  });

  it("counts a different action type when the account is configured for one", () => {
    const rows = normalize(MIXED_ACTION_TYPES, {
      attributionWindows: ["7d_click"],
      conversionActions: ["lead", "link_click"],
    });
    expect(windowOf(rows, "7d_click")?.metrics.conversions).toBe(4200);
  });

  it("refuses two action types that are two names for one sale", () => {
    try {
      normalize(DAILY_CAMPAIGN, {
        conversionActions: ["purchase", "offsite_conversion.fb_pixel_purchase"],
      });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("conversion_action_overlap");
      expect((error as Error).message).toContain("twice");
    }
  });

  it("refuses one action type reported twice on the same row", () => {
    try {
      normalize(DUPLICATE_PURCHASE, { attributionWindows: ["7d_click"] });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("duplicate_action_type");
    }
  });
});

describe("the grain, in both vocabularies", () => {
  it("reports an ad set as an ad_group without losing the word Meta used", () => {
    const [row] = normalize(ADSET_LEVEL, { level: "adset" });
    expect(row?.entity.type).toBe("ad_group");
    expect(row?.entity.native_entity_type).toBe("adset");
    expect(row?.entity.id).toBe("000000000000000201");
    expect(row?.entity.parent_id).toBe("000000000000000101");
  });

  it("keys an account row on the ad account itself", () => {
    const [row] = normalize(ACCOUNT_LEVEL, { level: "account" });
    expect(row?.entity.type).toBe("account");
    expect(row?.entity.id).toBe(FIXTURE_ACCOUNT);
    expect(row?.entity.account_id).toBe(FIXTURE_ACCOUNT);
  });

  it("keys an ad row on the ad and names its ad set as the parent", () => {
    const [row] = normalize(AD_LEVEL, { level: "ad" });
    expect(row?.entity.type).toBe("ad");
    expect(row?.entity.id).toBe("000000000000000301");
    expect(row?.entity.parent_id).toBe("000000000000000201");
    expect(row?.entity.name).toBe("Synthetic video 15s");
  });

  it("accepts an ad account id in either spelling and stores one", () => {
    expect(metaAccountId("000000000000001")).toBe(FIXTURE_ACCOUNT);
    expect(metaAccountId(FIXTURE_ACCOUNT)).toBe(FIXTURE_ACCOUNT);
    expect(metaAccountId("  ")).toBeNull();
    // Both spellings must produce the SAME account_id or the upsert key stops matching and every
    // re-pull inserts a second copy instead of updating the first.
    const bare = normalize(DAILY_CAMPAIGN, { adAccountId: "000000000000001" });
    expect(bare[0]?.entity.account_id).toBe(FIXTURE_ACCOUNT);
  });
});

describe("the refusals", () => {
  it("refuses an aggregate over the window rather than reading it as a day", () => {
    try {
      normalize(AGGREGATED_RANGE);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("aggregated_range");
      expect((error as Error).message).toContain("time_increment=1");
    }
  });

  it("refuses a row with no account_currency rather than guessing", () => {
    try {
      normalize(NO_CURRENCY);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("missing_currency");
      expect((error as Error).message).toContain("mislabel");
    }
  });

  it("refuses a field with no dictionary entry rather than dropping it", () => {
    try {
      normalize(UNMAPPED_FIELD);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("unmapped_field");
      expect((error as Error).message).toContain("cpc");
    }
  });

  it("refuses a row from another ad account", () => {
    try {
      normalize(WRONG_ACCOUNT);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("account_mismatch");
    }
  });

  it("refuses an empty numeric value rather than coercing it to zero", () => {
    try {
      normalize(UNPARSEABLE_SPEND);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("unparseable_value");
    }
    expect(() => parseMetaNumber("1234.56", "spend")).not.toThrow();
    expect(parseMetaNumber("1234.56", "spend")).toBe(1234.56);
    expect(() => parseMetaNumber("", "spend")).toThrow(MetaNormalizeError);
    expect(() => parseMetaNumber(undefined, "spend")).toThrow(MetaNormalizeError);
    expect(() => parseMetaNumber("not a number", "spend")).toThrow(MetaNormalizeError);
  });

  it("refuses a row with no id at the level requested", () => {
    try {
      normalize(MISSING_CAMPAIGN_ID);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("missing_entity_id");
    }
  });

  it("refuses to normalise with no attribution window requested", () => {
    try {
      normalize(DAILY_CAMPAIGN, { attributionWindows: [] });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("no_attribution_window");
      expect((error as Error).message).toContain("never named");
    }
  });

  it("refuses to normalise with no timezone", () => {
    try {
      normalize(DAILY_CAMPAIGN, { timezone: "  " });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as MetaNormalizeError).code).toBe("missing_timezone");
      expect((error as Error).message).toContain("seven hours");
    }
  });
});

describe("what the envelope carries from the platform", () => {
  it("takes the currency from the row and the timezone from the option", () => {
    const [row] = normalize(DAILY_CAMPAIGN);
    expect(row?.dimensions.currency).toBe("THB");
    expect(row?.dimensions.timezone).toBe(TIMEZONE);
  });

  it("parses string numbers into numbers", () => {
    const [row] = normalize(DAILY_CAMPAIGN);
    expect(row?.metrics.spend).toBe(1234.56);
    expect(typeof row?.metrics.spend).toBe("number");
  });

  it("leaves an absent metric absent rather than writing a zero", () => {
    // MIXED_ACTION_TYPES carries spend and no impressions. A zero would assert Meta reported one.
    const delivery = windowOf(
      normalize(MIXED_ACTION_TYPES, { attributionWindows: ["7d_click"] }),
      null,
    );
    expect(delivery?.metrics.spend).toBe(500);
    expect(delivery?.metrics.impressions).toBeUndefined();
  });

  it("reports no source_updated_at, because Meta publishes none", () => {
    const [row] = normalize(DAILY_CAMPAIGN);
    expect(row?.source_updated_at).toBeNull();
  });

  it("leaves the fx fields null, because Meta converts nothing", () => {
    const [row] = normalize(DAILY_CAMPAIGN);
    expect(row?.fx_source).toBeNull();
    expect(row?.fx_rate).toBeNull();
    expect(row?.fx_rate_date).toBeNull();
    expect(row?.fx_base).toBeNull();
  });

  it("keeps the platform response on the row", () => {
    const [row] = normalize(DAILY_CAMPAIGN);
    expect(row?.raw).toBe(DAILY_CAMPAIGN[0]);
  });

  it("declares every window it will request as a contract attribution window", () => {
    // A window this connector asks Meta for but the envelope cannot label would fail at the
    // database, hours later. `satisfies` catches it at compile time; this catches a widened list.
    expect(META_ACTION_WINDOWS).toContain("1d_ev");
    expect(META_ACTION_WINDOWS).not.toContain("model");
  });
});
