import { describe, expect, it } from "vitest";

import {
  ADDITIVE_METRICS,
  METRICS,
  type MetricName,
  combineMetric,
  isAdditive,
  weightFor,
} from "./metrics.js";

describe("every metric declares how it combines", () => {
  it("leaves no metric without an aggregation", () => {
    // The point of making this a required field rather than a default: adding a metric means
    // answering the question, and the eleven that existed before `position` were only ever
    // additive by coincidence of what had been added.
    for (const name of Object.keys(METRICS) as MetricName[]) {
      expect(METRICS[name].aggregation, name).toBeDefined();
    }
  });

  it("weights only by a metric that exists and is itself additive", () => {
    // Weighting by something that is not summable is the same error one level down: the
    // denominator of the weighted mean is a SUM of the weights.
    for (const name of Object.keys(METRICS) as MetricName[]) {
      const weight = weightFor(name);
      if (weight === null) continue;
      expect(Object.keys(METRICS), `${name} weights by a metric that does not exist`).toContain(
        weight,
      );
      expect(isAdditive(weight), `${name} weights by non-additive ${weight}`).toBe(true);
    }
  });

  it("treats everything except position as additive, which is what changed", () => {
    expect(ADDITIVE_METRICS).toHaveLength(Object.keys(METRICS).length - 1);
    expect(ADDITIVE_METRICS).not.toContain("position");
    expect(isAdditive("position")).toBe(false);
    expect(weightFor("position")).toBe("impressions");
    expect(weightFor("clicks")).toBeNull();
  });

  it("gives position the rank unit and keeps it out of the conversion set", () => {
    expect(METRICS.position.unit).toBe("rank");
    // A rank has no attribution window to carry -- it is not something anybody attributed.
    expect(METRICS.position.conversion).toBe(false);
  });
});

describe("combineMetric sums what sums", () => {
  it("adds across rows and skips absent values", () => {
    expect(combineMetric("clicks", [{ clicks: 3 }, { clicks: 4 }, {}])).toBe(7);
    expect(combineMetric("clicks", [{ clicks: 3 }, { clicks: null }])).toBe(3);
  });

  it("returns null rather than zero when nothing was measured", () => {
    // Zero is a measurement -- "spend was nothing". A period with no rows has not measured zero,
    // it has measured nothing, and collapsing the two turns an outage into a flat line.
    expect(combineMetric("spend", [])).toBeNull();
    expect(combineMetric("spend", [{}, { spend: undefined }])).toBeNull();
    expect(combineMetric("spend", [{ spend: 0 }])).toBe(0);
  });

  it("keeps a genuinely negative net_revenue negative", () => {
    // A day whose refunds exceed its sales. The schema carries no non-negative check on this
    // column for the same reason.
    expect(combineMetric("net_revenue", [{ net_revenue: 100 }, { net_revenue: -250 }])).toBe(-150);
  });
});

describe("combineMetric weights what must be weighted", () => {
  const week = [
    { position: 3, impressions: 40_000 },
    { position: 30, impressions: 12 },
  ];

  it("weights position by impressions rather than averaging it", () => {
    // THE NUMBER THIS FUNCTION EXISTS FOR. A query seen 40,000 times at rank 3 and one seen 12
    // times at rank 30 do not average to 16.5 -- that figure is plausible, printable, and wrong.
    const simpleMean = (3 + 30) / 2;
    const combined = combineMetric("position", week);
    expect(combined).toBeCloseTo((3 * 40_000 + 30 * 12) / 40_012, 6);
    expect(combined).toBeCloseTo(3.0081, 3);
    expect(combined).not.toBeCloseTo(simpleMean, 1);
  });

  it("never sums a rank, however tempting the shape", () => {
    expect(combineMetric("position", week)).not.toBe(33);
  });

  it("ignores a row carrying a value but no weight", () => {
    // Counting it would silently fall back to an unweighted mean FOR THAT ROW, which is the wrong
    // number in a shape that looks right.
    expect(combineMetric("position", [...week, { position: 99 }])).toBeCloseTo(
      (3 * 40_000 + 30 * 12) / 40_012,
      6,
    );
  });

  it("ignores a row carrying a weight but no value", () => {
    expect(combineMetric("position", [...week, { impressions: 500 }])).toBeCloseTo(
      (3 * 40_000 + 30 * 12) / 40_012,
      6,
    );
  });

  it("returns null when the total weight is zero, rather than NaN or rank one", () => {
    // Zero impressions is not "average position 0" -- which would be the best rank available and
    // the most misleading number on the page. Dividing would give NaN, which at least fails
    // loudly; returning null says what is true.
    expect(combineMetric("position", [{ position: 5, impressions: 0 }])).toBeNull();
    expect(combineMetric("position", [])).toBeNull();
  });

  it("returns the row's own value when there is only one", () => {
    expect(combineMetric("position", [{ position: 7.5, impressions: 200 }])).toBe(7.5);
  });
});
