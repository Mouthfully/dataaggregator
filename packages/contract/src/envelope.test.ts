import { describe, expect, it } from "vitest";
import { envelopeRowSchema, envelopeSchema, upsertKey } from "./envelope.ts";
import { COMMERCE_METRICS, METRICS } from "./metrics.ts";
import { isProvisional, RESTATEMENT_CLOCKS, restatesUntil } from "./restatement.ts";

/** A minimal valid row. Each test bends one thing about it. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    source: "meta_ads",
    entity: {
      type: "ad_group",
      id: "ag_1",
      account_id: "act_123",
      native_entity_type: "adset",
      native_id: "23851234567890123",
    },
    dimensions: {
      date: "2026-08-14",
      currency: "EUR",
      timezone: "Europe/Berlin",
      attribution_window: "7d_click",
    },
    metrics: { spend: 1240.55, impressions: 88214, clicks: 3106, conversions: 41 },
    fetched_at: "2026-09-07T02:14:33Z",
    source_updated_at: "2026-09-07T01:45:00Z",
    restates_until: "2026-09-11T00:00:00Z",
    is_provisional: true,
    first_seen_at: "2026-08-14T06:00:00Z",
    fx_source: "ecb_reference_rates",
    fx_rate_date: "2026-09-05",
    fx_rate: 1.0,
    fx_base: "EUR",
    ...overrides,
  };
}

describe("the refusal: an unlabelled conversion count", () => {
  // Specification sections 2 and 4.4: "The API refuses to emit an unlabelled conversion count."
  // This is the single strongest finding in the research and the reason the package exists.

  it("rejects a conversion count with no attribution window", () => {
    const result = envelopeRowSchema.safeParse(
      row({ dimensions: { ...row().dimensions, attribution_window: null } }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("unlabelled conversion count");
  });

  it("rejects conversions_value with no attribution window, not just conversions", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        metrics: { conversions_value: 5210 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("names which metrics triggered the refusal, so the fix is obvious", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        metrics: { conversions: 41, conversions_value: 5210 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    const message = JSON.stringify(result.error?.issues);
    expect(message).toContain("conversions");
    expect(message).toContain("conversions_value");
  });

  it("allows a null window on a row with no conversion metric", () => {
    // A window on an impressions-only row would be a label with nothing to label.
    const result = envelopeRowSchema.safeParse(
      row({
        metrics: { impressions: 88214, clicks: 3106 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts account_default and model, the labels for platforms with no selectable window", () => {
    // Google Ads applies a per-account setting; GA4 adjusts at model level. Both are labels, not
    // absences, which is why there is no "unknown" member to fall back on.
    for (const window of ["account_default", "model"] as const) {
      const result = envelopeRowSchema.safeParse(
        row({ dimensions: { ...row().dimensions, attribution_window: window } }),
      );
      expect(result.success, `${window} should be a valid label`).toBe(true);
    }
  });
});

describe("the envelope shape", () => {
  it("keeps the four freshness fields flat, not nested under freshness", () => {
    // Section 7 line 762 refutes the nested form in terms. Section 13.3 still prints it, and a
    // phase 0 reviewer proposed re-grouping them. This test is the thing that says no.
    const parsed = envelopeRowSchema.parse(row());
    expect(parsed).toHaveProperty("fetched_at");
    expect(parsed).toHaveProperty("source_updated_at");
    expect(parsed).toHaveProperty("restates_until");
    expect(parsed).toHaveProperty("is_provisional");
    expect(parsed).not.toHaveProperty("freshness");
  });

  it("has no is_final, only is_provisional", () => {
    // Emitting a flag and its complement is how the two drift apart.
    const parsed = envelopeRowSchema.parse(row()) as Record<string, unknown>;
    expect(parsed.is_final).toBeUndefined();
  });

  it("requires account_id, which the specification names in the upsert key but never prints", () => {
    const { account_id: _dropped, ...entityWithoutAccount } = row().entity;
    const result = envelopeRowSchema.safeParse(row({ entity: entityWithoutAccount }));
    expect(result.success).toBe(false);
  });

  it("requires timezone, which section 4.4 sells as a guarantee and no envelope carries", () => {
    const { timezone: _dropped, ...dimensionsWithoutTimezone } = row().dimensions;
    const result = envelopeRowSchema.safeParse(row({ dimensions: dimensionsWithoutTimezone }));
    expect(result.success).toBe(false);
  });

  it("requires the fx rate itself once an amount has been converted", () => {
    // A source and a date cannot reproduce a conversion: ECB publishes on business days only and
    // the carry-forward rule is unspecified.
    const result = envelopeRowSchema.safeParse(row({ fx_rate: null }));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("auditable");
  });

  it("rejects a metric name absent from the dictionary", () => {
    // Section 13.3 rule 2: a new metric requires a dictionary change first. A silent rename is
    // exactly what the schema reviewer exists to catch, so the schema catches it instead.
    const result = envelopeRowSchema.safeParse(
      row({ metrics: { spend: 10, cost_per_click: 0.4 } }),
    );
    expect(result.success).toBe(false);
  });

  it("carries the platform's own vocabulary rather than hiding it", () => {
    const parsed = envelopeRowSchema.parse(row());
    expect(parsed.entity.type).toBe("ad_group");
    expect(parsed.entity.native_entity_type).toBe("adset");
  });

  it("builds the upsert key exactly as section 7 states it", () => {
    expect(upsertKey(envelopeRowSchema.parse(row()))).toBe(
      "meta_ads act_123 ag_1 2026-08-14 7d_click",
    );
  });
});

describe("the response wrapper", () => {
  it("accepts many rows, which every real read returns", () => {
    // Sections 2 and 7 both print a single row and neither defines a multi-row form.
    const result = envelopeSchema.safeParse({
      ok: true,
      module: "performance",
      source: "meta_ads",
      data: [row(), row()],
      meta: { schema: "v1", request_id: "req_1", credits_used: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("reports zero credits for a performance read", () => {
    // Section 11.3 replaced per-row credits with per-connected-account monthly metering, so
    // section 8's /v1/performance credit row is dead.
    const parsed = envelopeSchema.parse({
      ok: true,
      module: "performance",
      source: "meta_ads",
      data: [row()],
      meta: { schema: "v1", request_id: "req_1", credits_used: 0 },
    });
    expect(parsed.meta.credits_used).toBe(0);
  });
});

describe("restates_until does not slide", () => {
  // THE SPECIFICATION'S OWN FORMULA IS THE BUG. Section 7's clocks table gives
  // `restates_until = fetched_at + Nd`, and section 7 also mandates nightly restatement-aware
  // re-pulls, which rewrite fetched_at. So the deadline moves every night, no row ever becomes
  // final, and is_provisional never clears -- which is the one guarantee the product sells.

  it("is unchanged by a re-pull, because fetched_at is not an input at all", () => {
    const first = restatesUntil({
      source: "meta_ads",
      date: "2026-08-14",
      firstSeenAt: "2026-08-14T06:00:00Z",
    });
    // Thirty nightly re-pulls later. Under the specification's formula this would now be in
    // October; here it is the same instant it always was.
    const afterManyRepulls = restatesUntil({
      source: "meta_ads",
      date: "2026-08-14",
      firstSeenAt: "2026-08-14T06:00:00Z",
    });
    expect(afterManyRepulls).toBe(first);
    expect(first).toBe("2026-09-11T06:00:00.000Z");
  });

  it("eventually clears is_provisional, which the sliding formula never would", () => {
    const until = restatesUntil({
      source: "meta_ads",
      date: "2026-08-14",
      firstSeenAt: "2026-08-14T06:00:00Z",
    });
    expect(isProvisional(until, new Date("2026-09-10T00:00:00Z"))).toBe(true);
    expect(isProvisional(until, new Date("2026-09-12T00:00:00Z"))).toBe(false);
  });

  it("starts the clock at first sight for a backfilled row, not at the day it describes", () => {
    // A backfill reaching ninety days back does not get ninety-day-old finality: the platform
    // cannot have restated a row we had not yet pulled.
    const backfilled = restatesUntil({
      source: "meta_ads",
      date: "2026-06-01",
      firstSeenAt: "2026-09-07T00:00:00Z",
    });
    expect(backfilled).toBe("2026-10-05T00:00:00.000Z");
  });

  it("treats an unknown window as still open rather than assuming finality", () => {
    // Search Console has no published restatement window in the specification.
    const until = restatesUntil({
      source: "search_console",
      date: "2026-08-14",
      firstSeenAt: "2026-08-14T06:00:00Z",
    });
    expect(until).toBeNull();
    expect(isProvisional(until, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("the restatement clocks", () => {
  it("gives Meta 28 days", () => {
    expect(RESTATEMENT_CLOCKS.meta_ads.windowDays).toBe(28);
  });

  it("gives GA4 12 days, not the 72 hours section 13.3 states", () => {
    // 72h conflates processing latency with the attribution-restatement window. Google's own
    // wording is that attribution credit "can change for up to 12 days".
    expect(RESTATEMENT_CLOCKS.ga4.windowDays).toBe(12);
  });

  it("reads the Google Ads window per account, because it is a per-account setting", () => {
    expect(RESTATEMENT_CLOCKS.google_ads.perAccount).toBe(true);
    const ninetyDayAccount = restatesUntil({
      source: "google_ads",
      date: "2026-08-14",
      firstSeenAt: "2026-08-14T00:00:00Z",
      accountWindowDays: 90,
    });
    expect(ninetyDayAccount).toBe("2026-11-12T00:00:00.000Z");
  });

  it("records that GA4's window is not a guarantee, because Google says so", () => {
    expect(RESTATEMENT_CLOCKS.ga4.note).toContain("not a guarantee");
  });

  it("treats a point-in-time measurement as never restated", () => {
    expect(RESTATEMENT_CLOCKS.dataforseo_serp.windowDays).toBe(0);
    const until = restatesUntil({
      source: "dataforseo_serp",
      date: "2026-08-14",
      firstSeenAt: "2026-08-14T09:00:00Z",
    });
    expect(isProvisional(until, new Date("2026-08-14T09:00:01Z"))).toBe(false);
  });

  it("refuses an unparseable anchor rather than silently producing a wrong deadline", () => {
    expect(() =>
      restatesUntil({
        source: "meta_ads",
        date: "not-a-date",
        firstSeenAt: "2026-08-14T06:00:00Z",
      }),
    ).toThrow(/unparseable/);
  });
});

describe("the commerce grain (11A.14)", () => {
  // The dictionary gained `order` plus four metrics so the launch connector set -- WooCommerce,
  // Shopify and a payment gateway -- has somewhere to land. These tests are the contract half of a
  // change whose other half is a migration; `03_envelope_store.sql` asserts the same rules in SQL.

  it("accepts an order-grain row", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        source: "ga4",
        entity: {
          type: "order",
          id: "wc_10482",
          account_id: "shop_1",
          native_entity_type: "shop_order",
          native_id: "10482",
        },
        metrics: { orders: 1, revenue: 1290, net_revenue: 1102.4, fees: 41.6, commission: 146 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a negative net_revenue, because a refunded day really is negative", () => {
    // The schema column deliberately carries no non-negative check. A floor of zero would be a lie
    // the connector was forced to write.
    const result = envelopeRowSchema.safeParse(
      row({
        entity: { ...row().entity, type: "account" },
        metrics: { net_revenue: -812.4 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("keeps orders out of the conversion refusal: a shop's own count needs no window", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        entity: { ...row().entity, type: "account" },
        metrics: { orders: 37 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("the second refusal: a commerce figure on an advertising entity", () => {
  // A marketplace ad platform reporting "orders from this campaign" is reporting a conversion. The
  // first refusal only covers `conversions` and `conversions_value`, so without this one the whole
  // guarantee is lost to a synonym.

  for (const type of ["campaign", "ad_group", "ad", "keyword", "search_term"] as const) {
    it(`rejects orders on a ${type} with no attribution window`, () => {
      const result = envelopeRowSchema.safeParse(
        row({
          entity: { ...row().entity, type },
          metrics: { orders: 12 },
          dimensions: { ...row().dimensions, attribution_window: null },
        }),
      );
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("unlabelled attributed figure");
    });
  }

  it("rejects revenue on an ad entity too, not only the metrics added this round", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        metrics: { revenue: 4400 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts the same row once the window is named", () => {
    const result = envelopeRowSchema.safeParse(row({ metrics: { orders: 12, net_revenue: 3300 } }));
    expect(result.success).toBe(true);
  });

  it("names the metrics and the grain, so the fix is obvious", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        metrics: { orders: 12, commission: 400 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    const issues = JSON.stringify(result.error?.issues);
    expect(issues).toContain("orders");
    expect(issues).toContain("commission");
    expect(issues).toContain("ad_group");
  });

  it("does not fire on account grain: an account is a shop as well as an ad account", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        entity: { ...row().entity, type: "account" },
        metrics: { orders: 12, net_revenue: 3300 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("does not fire on spend, which is a cost and is never attributed", () => {
    expect(COMMERCE_METRICS).not.toContain("spend");
    const result = envelopeRowSchema.safeParse(
      row({
        metrics: { spend: 900 },
        dimensions: { ...row().dimensions, attribution_window: null },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("the fx rule reaches every currency metric", () => {
  // The contract finds currency metrics by asking METRICS; SQL cannot, and writes the list out by
  // hand. That asymmetry is why this is asserted on both sides.

  it("rejects a converted net_revenue with a source but no rate", () => {
    const result = envelopeRowSchema.safeParse(
      row({
        entity: { ...row().entity, type: "account" },
        metrics: { net_revenue: 3300 },
        dimensions: { ...row().dimensions, attribution_window: null },
        fx_rate: null,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("agrees with METRICS about which names are currency", () => {
    const currency = (Object.keys(METRICS) as (keyof typeof METRICS)[]).filter(
      (name) => METRICS[name].unit === "currency",
    );
    expect(currency).toEqual([
      "spend",
      "conversions_value",
      "revenue",
      "net_revenue",
      "fees",
      "commission",
    ]);
  });
});
