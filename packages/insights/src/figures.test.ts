import { describe, expect, it } from "vitest";

import { COMPARISON, PERIOD, row, settledWeek } from "./fixtures.ts";
import {
  type BusinessType,
  type FigureSet,
  allowedNumbers,
  buildFigureSet,
  canonicalNumber,
  estimateFloor,
  leadingMetrics,
  readMetric,
} from "./figures.ts";

function build(
  rows: Parameters<typeof buildFigureSet>[0]["rows"],
  business: BusinessType = "cafe",
): FigureSet {
  const result = buildFigureSet({ business, period: PERIOD, comparison: COMPARISON, rows });
  if (!result.ok) throw new Error(`expected a figure set, got ${result.code}: ${result.detail}`);
  return result.set;
}

function figure(set: FigureSet, id: string) {
  const found = set.figures.find((f) => f.id === id);
  if (found === undefined)
    throw new Error(`no figure ${id}; have ${set.figures.map((f) => f.id).join(", ")}`);
  return found;
}

describe("readMetric: three branches, and none of them is a default", () => {
  it("reads a number, including zero", () => {
    expect(readMetric(0)).toEqual({ kind: "value", value: 0 });
    expect(readMetric(1234.5)).toEqual({ kind: "value", value: 1234.5 });
  });

  it("reads a quoted decimal, because numeric(20,6) may arrive as a string", () => {
    expect(readMetric("16940.000000")).toEqual({ kind: "value", value: 16940 });
  });

  it("calls null absent, and absent is not zero", () => {
    expect(readMetric(null)).toEqual({ kind: "absent" });
    expect(readMetric(undefined)).toEqual({ kind: "absent" });
  });

  it("calls anything else unreadable rather than hiding it behind absent", () => {
    for (const raw of ["", "  ", "n/a", Number.NaN, Number.POSITIVE_INFINITY, true, {}, []]) {
      expect(readMetric(raw)).toEqual({ kind: "unreadable" });
    }
  });
});

describe("canonicalNumber: the one form figures and the verifier both speak", () => {
  it("collapses grouping, trailing zeros and sign", () => {
    for (const text of ["16,940", "16940.00", "16_940", " 16940 ", "-16940", "+16,940.000000"]) {
      expect(canonicalNumber(text)).toBe("16940");
    }
  });

  it("refuses anything that is not a number", () => {
    for (const text of ["", "THB", "2026-09-12", "1.2.3", "--4"]) {
      expect(canonicalNumber(text)).toBeNull();
    }
  });
});

describe("buildFigureSet refuses rather than producing a number with no meaning", () => {
  it("refuses when no row falls in either period", () => {
    const result = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [row({ source: "woocommerce", date: "2020-01-01", metrics: { revenue: 1 } })],
    });
    expect(result).toMatchObject({ ok: false, code: "no_rows" });
  });

  it("refuses to total across two currencies rather than inventing a rate", () => {
    const result = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [
        row({
          source: "woocommerce",
          date: "2026-09-07",
          metrics: { revenue: 100 },
          currency: "THB",
        }),
        row({
          source: "woocommerce",
          date: "2026-09-08",
          metrics: { revenue: 100 },
          currency: "USD",
        }),
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "mixed_currency" });
  });

  it("refuses an impossible period", () => {
    const result = buildFigureSet({
      business: "cafe",
      period: { from: "2026-09-13", to: "2026-09-07" },
      comparison: COMPARISON,
      rows: settledWeek(),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_period" });
  });

  it("refuses when every metric in the period is absent or unreadable", () => {
    const result = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [
        row({ source: "woocommerce", date: "2026-09-07", metrics: { revenue: null } }),
        row({ source: "woocommerce", date: "2026-09-08", metrics: { revenue: "n/a" } }),
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "no_readable_metric" });
  });
});

describe("an absent metric is NAMED absent, never omitted and never zero", () => {
  const set = build(settledWeek());

  it("prints a sentence for a metric no source reported", () => {
    const absent = figure(set, "metric.fees");
    expect(absent.kind).toBe("absent");
    expect(absent.text).toContain("not reported");
    // The whole point: it licenses no number at all, so a model that writes one is refused.
    expect(absent.allows).toEqual([]);
  });

  it("distinguishes unreadable from absent", () => {
    const withJunk = build([
      ...settledWeek(),
      row({ source: "woocommerce", date: "2026-09-09", metrics: { sessions: "not-a-number" } }),
    ]);
    expect(figure(withJunk, "metric.sessions").kind).toBe("unreadable");
    expect(figure(withJunk, "metric.sessions").text).toContain("could not be read");
  });
});

describe("the arithmetic", () => {
  const set = build(settledWeek());

  it("totals the period", () => {
    // 10,000 + 12,000 + 4,000 + 3,000
    expect(figure(set, "metric.revenue").text).toBe("THB 29,000.00");
  });

  it("totals the comparison period separately", () => {
    // 9,000 + 9,000 + 5,000 + 5,000
    expect(figure(set, "metric.revenue.previous").text).toBe("THB 28,000.00");
  });

  it("computes the delta and its share", () => {
    expect(figure(set, "metric.revenue.delta").text).toBe("THB 1,000.00");
    // 1,000 / 28,000 = 3.571...%
    expect(figure(set, "metric.revenue.delta_share").text).toBe("3.6%");
  });

  it("computes the average ticket at read, rather than storing it", () => {
    // 29,000 / 290
    expect(figure(set, "derived.average_ticket").text).toBe("THB 100.00");
  });

  it("ranks channels by takings, biggest first", () => {
    expect(figure(set, "channel.woocommerce.rank").text).toBe("1");
    expect(figure(set, "channel.meta_ads.rank").text).toBe("2");
    // 22,000 and 7,000 of 29,000
    expect(figure(set, "channel.woocommerce.share").text).toBe("75.9%");
    expect(figure(set, "channel.meta_ads.share").text).toBe("24.1%");
  });

  it("has no percentage change when the previous period measured zero", () => {
    // Not "up 100%", not "up infinity", and above all not a quiet zero.
    const zeroed = build([
      row({ source: "woocommerce", date: "2026-09-07", metrics: { revenue: 500, orders: 5 } }),
      row({ source: "woocommerce", date: "2026-08-31", metrics: { revenue: 0, orders: 0 } }),
    ]);
    const share = figure(zeroed, "metric.revenue.delta_share");
    expect(share.kind).toBe("absent");
    expect(share.allows).toEqual([]);
  });

  it("weights average position by impressions rather than summing it", () => {
    const ranked = build([
      row({
        source: "search_console",
        date: "2026-09-07",
        metrics: { position: 2, impressions: 40_000 },
      }),
      row({
        source: "search_console",
        date: "2026-09-08",
        metrics: { position: 30, impressions: 10 },
      }),
      row({
        source: "search_console",
        date: "2026-08-31",
        metrics: { position: 4, impressions: 100 },
      }),
    ]);
    // A plain mean would be 16. The impression-weighted figure is 2.01.
    expect(figure(ranked, "metric.position").text).toBe("2.01");
  });
});

describe("uncertainty is measured, never decorated", () => {
  const base = [
    row({ source: "woocommerce", date: "2026-09-07", metrics: { revenue: 4_000, orders: 40 } }),
    row({ source: "woocommerce", date: "2026-08-31", metrics: { revenue: 10_000, orders: 100 } }),
  ] as const;

  it("gives a point estimate when nothing may be restated", () => {
    const set = build([...base]);
    const action = set.actions.find((a) => a.kind === "channel_decline");
    expect(action?.impact).toEqual({ kind: "point", value: 6_000, allProvisional: false });
    expect(action?.impactFigure.text).toBe("THB 6,000.00");
  });

  it("gives a RANGE when some contributing rows may still be restated", () => {
    const set = build([
      ...base,
      row({
        source: "woocommerce",
        date: "2026-09-08",
        metrics: { revenue: 1_000 },
        provisional: true,
      }),
    ]);
    const action = set.actions.find((a) => a.kind === "channel_decline");
    // Settled rows alone: 10,000 - 4,000 = 6,000. Every row: 10,000 - 5,000 = 5,000.
    expect(action?.impact).toEqual({ kind: "range", low: 5_000, high: 6_000 });
    expect(action?.impactFigure.text).toBe("THB 5,000.00 to THB 6,000.00");
    // Both ends are licensed, and nothing between them is.
    expect(action?.impactFigure.allows).toEqual(["5000", "6000"]);
  });

  it("gives a MARKED POINT, not a manufactured band, when every row is provisional", () => {
    const set = build([
      row({
        source: "woocommerce",
        date: "2026-09-07",
        metrics: { revenue: 4_000 },
        provisional: true,
      }),
      row({
        source: "woocommerce",
        date: "2026-08-31",
        metrics: { revenue: 10_000 },
        provisional: true,
      }),
    ]);
    const action = set.actions.find((a) => a.kind === "channel_decline");
    expect(action?.impact).toEqual({ kind: "point", value: 6_000, allProvisional: true });
    expect(set.allProvisional).toBe(true);
  });
});

describe("a metric reported on only some rows says so", () => {
  it("names the coverage when a metric is missing from rows of the same source", () => {
    const set = build([
      row({
        source: "woocommerce",
        date: "2026-09-07",
        metrics: { revenue: 1_000, net_revenue: 900 },
      }),
      row({ source: "woocommerce", date: "2026-09-08", metrics: { revenue: 1_000 } }),
      row({ source: "woocommerce", date: "2026-08-31", metrics: { revenue: 1_000 } }),
    ]);
    // Printing THB 900 as takings beside a gross of THB 2,000 invites the reader to conclude the
    // platform kept THB 1,100. It did not; the other order's fee was simply never reported.
    expect(figure(set, "metric.net_revenue").text).toBe(
      "THB 900.00 (reported on 1 of 2 rows from this source)",
    );
    // Both coverage numbers are licensed, so a model repeating the caveat is not refused for it.
    expect(figure(set, "metric.net_revenue").allows).toContain("1");
    expect(figure(set, "metric.net_revenue").allows).toContain("2");
  });

  it("stays silent when every row of the source reported it", () => {
    const set = build(settledWeek());
    // `spend` is on both meta_ads rows and on neither woocommerce row. Measured against its own
    // source it is complete, so there is no caveat -- a caveat on every figure is one nobody reads.
    expect(figure(set, "metric.spend").text).toBe("THB 4,500.00");
    expect(figure(set, "metric.revenue").text).toBe("THB 29,000.00");
  });

  it("does not let a partly-reported metric become the one shares are built on", () => {
    const set = build([
      row({
        source: "woocommerce",
        date: "2026-09-07",
        metrics: { revenue: 1_000, net_revenue: 900, orders: 10 },
      }),
      row({ source: "woocommerce", date: "2026-09-08", metrics: { revenue: 1_000, orders: 10 } }),
      row({ source: "woocommerce", date: "2026-08-31", metrics: { revenue: 1_000, orders: 10 } }),
    ]);
    // Gross covers every row, so gross is what the channel total and the ticket use.
    expect(figure(set, "channel.woocommerce.takings").text).toBe("THB 2,000.00");
    expect(figure(set, "derived.average_ticket").text).toBe("THB 100.00");
  });
});

describe("the action sheet", () => {
  it("is ordered by value, biggest first", () => {
    const set = build(settledWeek());
    const floors = set.actions.map((a) => estimateFloor(a.impact));
    expect(floors.length).toBeGreaterThan(1);
    expect([...floors].sort((a, b) => b - a)).toEqual(floors);
    expect(set.actions.map((a) => a.rank)).toEqual(set.actions.map((_, i) => i + 1));
  });

  it("raises no action worth nothing", () => {
    const set = build(settledWeek());
    for (const action of set.actions) expect(estimateFloor(action.impact)).toBeGreaterThan(0);
  });

  it("raises no spend action when the return side was never measured", () => {
    // Spend rose, and what it returned is ABSENT rather than zero. An action here would be one
    // raised on a number nobody measured.
    const set = build([
      row({ source: "google_ads", date: "2026-09-07", metrics: { spend: 5_000 } }),
      row({ source: "google_ads", date: "2026-08-31", metrics: { spend: 1_000 } }),
      row({ source: "woocommerce", date: "2026-09-07", metrics: { revenue: 100, orders: 1 } }),
      row({ source: "woocommerce", date: "2026-08-31", metrics: { revenue: 100, orders: 1 } }),
    ]);
    expect(set.actions.some((a) => a.kind === "spend_without_return")).toBe(false);
  });

  it("is deterministic whatever order the rows arrived in", () => {
    const forwards = build(settledWeek());
    const backwards = build([...settledWeek()].reverse());
    expect(backwards.actions.map((a) => a.id)).toEqual(forwards.actions.map((a) => a.id));
    expect(backwards.figures.map((f) => `${f.id}=${f.text}`)).toEqual(
      forwards.figures.map((f) => `${f.id}=${f.text}`),
    );
  });
});

describe("leading metrics come from the dictionary, per business type", () => {
  it("leads a cafe with its takings and a seller with its advertising", () => {
    expect(leadingMetrics("cafe")[0]).toBe("revenue");
    expect(leadingMetrics("online_seller").slice(0, 3)).toEqual(["revenue", "orders", "spend"]);
  });

  it("covers every dictionary metric exactly once, for every business type", () => {
    for (const business of ["cafe", "hotel", "online_seller", "salon"] as const) {
      const names = leadingMetrics(business);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("allowedNumbers is exactly what the figures licensed", () => {
  it("licenses every figure's own rendering and nothing else", () => {
    const set = build(settledWeek());
    const allowed = allowedNumbers(set);
    expect(allowed.has("29000")).toBe(true);
    expect(allowed.has("3.6")).toBe(true);
    // A plausible neighbour of a true figure is not licensed.
    expect(allowed.has("29500")).toBe(false);
    expect(allowed.has("30000")).toBe(false);
  });
});
