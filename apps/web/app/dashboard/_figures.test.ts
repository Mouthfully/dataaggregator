import { METRICS, type MetricName } from "@repo/contract";
import { describe, expect, it } from "vitest";

import { PERFORMANCE_COLUMNS } from "../_auth/workspace";
import { formatFigure, presentMetrics, readFigure } from "./_figures";

/**
 * THE ASSERTIONS ARE ABOUT WHAT THE PAGE REFUSES TO SAY.
 *
 * A test that only checked "revenue renders" would pass against `row.revenue ?? 0`, which is the
 * exact defect this unit was written to remove. So most of what follows asserts an ABSENCE: that a
 * null never becomes a zero, that a currency figure never carries a currency the row did not name,
 * and that no metric in the dictionary can fall out of the select without failing here.
 */

const ALL_METRICS = Object.keys(METRICS) as MetricName[];

describe("the select carries the dictionary", () => {
  it("selects every metric in @repo/contract, so none can be silently unshowable", () => {
    for (const metric of ALL_METRICS) {
      expect(PERFORMANCE_COLUMNS).toContain(metric);
    }
  });

  it("still selects the currency and the two honesty fields the figures depend on", () => {
    // Drop any of these and the figures beside them stop being honest rather than stop rendering,
    // which is why they are asserted rather than left to the type.
    expect(PERFORMANCE_COLUMNS).toContain("currency");
    expect(PERFORMANCE_COLUMNS).toContain("is_provisional");
    expect(PERFORMANCE_COLUMNS).toContain("fetched_at");
  });
});

describe("a null is absent and never zero", () => {
  it("reads null and undefined as absent", () => {
    expect(readFigure(null)).toEqual({ kind: "absent" });
    expect(readFigure(undefined)).toEqual({ kind: "absent" });
  });

  it("reads a stored zero as the measurement it is", () => {
    expect(readFigure(0)).toEqual({ kind: "number", value: 0 });
    expect(readFigure("0")).toEqual({ kind: "number", value: 0 });
  });

  it("formats an absent currency metric as absent, and the result contains no digit", () => {
    const figure = formatFigure("revenue", null, "EUR");
    expect(figure.kind).toBe("absent");
    // The rendered mark is the component's business; what matters here is that nothing numeric
    // survives this far. `?? 0` would produce "EUR 0.00" and pass a laxer assertion.
    expect(JSON.stringify(figure)).not.toMatch(/\d/);
  });
});

describe("a value that is not a number is not a number", () => {
  it("parses a numeric string, because numeric's JSON shape is a matter of policy", () => {
    expect(readFigure("1234.5678")).toEqual({ kind: "number", value: 1234.5678 });
  });

  it("refuses the empty string, prose, NaN, Infinity, booleans and objects", () => {
    for (const raw of ["", "   ", "abc", Number.NaN, Number.POSITIVE_INFINITY, true, {}, []]) {
      expect(readFigure(raw)).toEqual({ kind: "unreadable" });
    }
  });

  it("marks an unreadable value as unreadable rather than as absent", () => {
    // The two must not collapse: absent is the platform saying nothing, unreadable is a defect.
    expect(formatFigure("spend", "not a number", "EUR").kind).toBe("unreadable");
  });
});

describe("a currency metric carries the row's own currency", () => {
  it("prints the code the row stored, for every currency it is given", () => {
    for (const code of ["EUR", "JPY", "THB", "GBP"]) {
      const figure = formatFigure("revenue", 1234.5, code);
      expect(figure).toMatchObject({ kind: "value" });
      if (figure.kind !== "value") throw new Error("unreachable");
      expect(figure.text).toContain(code);
    }
  });

  it("never falls back to dollars when the row says otherwise", () => {
    const figure = formatFigure("net_revenue", -42, "THB");
    if (figure.kind !== "value") throw new Error("unreachable");
    expect(figure.text).not.toContain("USD");
    expect(figure.text).not.toContain("$");
    // net_revenue is the one metric the schema lets go negative. The sign must survive.
    expect(figure.text).toMatch(/-|\(/);
  });

  it("refuses to print an amount whose currency is not a currency", () => {
    // `envelope_rows.currency` is constrained to this shape, so reaching here is a defect
    // elsewhere -- and an amount with no unit is the number this module exists to withhold.
    for (const code of ["", "us", "DOLLAR", "12"]) {
      expect(formatFigure("spend", 10, code).kind).toBe("unreadable");
    }
  });

  it("keeps the six decimals the column stores instead of rounding to the minor unit", () => {
    const figure = formatFigure("fees", 1.234567, "EUR");
    if (figure.kind !== "value") throw new Error("unreachable");
    expect(figure.text).toContain("1.234567");
  });
});

describe("a count and a rank borrow no currency", () => {
  it("formats counts and ranks without the row's currency code", () => {
    for (const metric of ALL_METRICS.filter((name) => METRICS[name].unit !== "currency")) {
      const figure = formatFigure(metric, 12.5, "EUR");
      if (figure.kind !== "value") throw new Error("unreachable");
      expect(figure.text).not.toContain("EUR");
    }
  });

  it("formats every metric in the dictionary, so a new one cannot render as nothing", () => {
    for (const metric of ALL_METRICS) {
      expect(formatFigure(metric, 1, "EUR").kind).toBe("value");
    }
  });
});

describe("the columns shown are the columns with something in them", () => {
  const rows = [
    { revenue: 10, spend: null, orders: null, clicks: null },
    { revenue: null, spend: 4, orders: null, clicks: "bad" },
  ];

  it("keeps a metric any row reported, in dictionary order", () => {
    // Dictionary order, not the order the object literals were typed in: `spend` is declared
    // before `revenue` in METRICS.
    expect(presentMetrics(rows)).toEqual(["spend", "clicks", "revenue"]);
  });

  it("drops a metric no row reported", () => {
    expect(presentMetrics(rows)).not.toContain("orders");
  });

  it("keeps a metric whose only values are unreadable, so the defect stays visible", () => {
    expect(presentMetrics([{ clicks: "bad" }])).toEqual(["clicks"]);
  });
});
