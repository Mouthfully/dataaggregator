import { describe, expect, it } from "vitest";

import { amountFor, lookupKey } from "../../../../scripts/create-stripe-prices";
import { CURRENCIES, INTERVALS, PLAN_DISPLAY } from "./plans";

/**
 * The price-creation script derives its amounts from PLAN_DISPLAY rather than restating them.
 * These tests pin that, because the failure it prevents is the expensive kind: a customer charged
 * an amount the pricing page never showed.
 */
describe("the amounts the script would create", () => {
  it.each(PLAN_DISPLAY.filter((p) => p.plan !== "free"))(
    "$name matches the pricing page, in minor units, in every currency",
    (entry) => {
      for (const currency of CURRENCIES) {
        expect(amountFor(entry.plan, "month", currency), currency).toBe(
          entry.monthly[currency] * 100,
        );
        expect(amountFor(entry.plan, "year", currency), currency).toBe(
          entry.yearly[currency] * 100,
        );
      }
    },
  );

  it("uses whole cents, never a fraction", () => {
    // Stripe rejects a fractional minor unit, and the failure would arrive at price-creation time
    // rather than here, against a real account.
    for (const entry of PLAN_DISPLAY.filter((p) => p.plan !== "free")) {
      for (const interval of INTERVALS) {
        for (const currency of CURRENCIES) {
          expect(Number.isInteger(amountFor(entry.plan, interval, currency))).toBe(true);
        }
      }
    }
  });

  it("charges more for a year than a month, which a mixed-up interval would invert", () => {
    for (const entry of PLAN_DISPLAY.filter((p) => p.plan !== "free")) {
      for (const currency of CURRENCIES) {
        expect(amountFor(entry.plan, "year", currency)).toBeGreaterThan(
          amountFor(entry.plan, "month", currency),
        );
      }
    }
  });

  it("makes a year cheaper than twelve months, or the annual plan is a penalty", () => {
    for (const entry of PLAN_DISPLAY.filter((p) => p.plan !== "free")) {
      for (const currency of CURRENCIES) {
        expect(amountFor(entry.plan, "year", currency)).toBeLessThan(
          amountFor(entry.plan, "month", currency) * 12,
        );
      }
    }
  });
});

describe("lookup keys", () => {
  it("is stable and unique per plan and interval, so a re-run finds what the last one made", () => {
    const keys = PLAN_DISPLAY.filter((p) => p.plan !== "free").flatMap((entry) =>
      INTERVALS.map((interval) => lookupKey(entry.plan, interval)),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(6);
  });

  it("names the plan and interval, so a dashboard row is readable without a lookup", () => {
    expect(lookupKey("growth", "year")).toBe("plan_growth_year");
  });
});
