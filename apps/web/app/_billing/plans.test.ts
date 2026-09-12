import { describe, expect, it } from "vitest";

import {
  ANNUAL_DISCOUNT,
  BillingConfigError,
  INTERVALS,
  PLANS,
  PLAN_DISPLAY,
  planForPriceId,
  priceEnvName,
  priceIdFor,
} from "./plans";

/**
 * `plans.ts` writes the yearly price out rather than computing it, and says the arithmetic is
 * "checked by a test instead". This is that test. Without it the comment is a promise nobody kept,
 * and the failure it guards against is a customer charged an amount the pricing page did not show.
 */
describe("the plan catalogue", () => {
  it("prices every plan the site advertises", () => {
    expect(PLAN_DISPLAY.map((p) => p.plan)).toEqual([...PLANS]);
  });

  it.each(PLAN_DISPLAY.filter((p) => p.plan !== "free"))(
    "$name's yearly price is twelve months less the stated discount",
    (entry) => {
      // Rounded to the nearest whole unit, which is how the numbers are written. If a plan ever
      // gets a different discount, delete ITS case rather than loosening this one -- a rule that
      // has been widened to fit an exception stops catching the typo it was written for.
      const expected = Math.round(entry.monthly * 12 * (1 - ANNUAL_DISCOUNT));
      expect(entry.yearly).toBe(expected);
    },
  );

  it("charges nothing for free, on either interval", () => {
    const free = PLAN_DISPLAY.find((p) => p.plan === "free");
    expect(free?.monthly).toBe(0);
    expect(free?.yearly).toBe(0);
  });

  it("orders the plans from cheapest to dearest, as the pricing table renders them", () => {
    const monthly = PLAN_DISPLAY.map((p) => p.monthly);
    expect([...monthly].sort((a, b) => a - b)).toEqual(monthly);
  });
});

describe("price ids", () => {
  const env = {
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_m",
    STRIPE_PRICE_STARTER_YEARLY: "price_starter_y",
    STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_m",
  };

  it("names the variable per plan and interval", () => {
    expect(priceEnvName("starter", "month")).toBe("STRIPE_PRICE_STARTER_MONTHLY");
    expect(priceEnvName("agency", "year")).toBe("STRIPE_PRICE_AGENCY_YEARLY");
  });

  it("resolves a configured price", () => {
    expect(priceIdFor("starter", "month", env)).toBe("price_starter_m");
  });

  it("refuses a missing one instead of falling back", () => {
    // A fallback here would charge the wrong plan's price, which is the one billing failure a
    // customer notices immediately and never forgives.
    expect(() => priceIdFor("agency", "month", env)).toThrow(BillingConfigError);
    expect(() => priceIdFor("agency", "month", env)).toThrow(/STRIPE_PRICE_AGENCY_MONTHLY/);
  });

  it("refuses to price the free plan at all", () => {
    // Not a configuration error: there is nothing to buy, so asking is a programming mistake and
    // the message says so rather than sending someone to look for a variable that should not exist.
    expect(() => priceIdFor("free", "month", env)).toThrow(/nothing to buy/);
  });

  it("maps a price id back to its plan, for the webhook", () => {
    expect(planForPriceId("price_growth_m", env)).toEqual({ plan: "growth", interval: "month" });
    expect(planForPriceId("price_starter_y", env)).toEqual({ plan: "starter", interval: "year" });
  });

  it("returns null for a price this deployment does not know", () => {
    // The webhook refuses to guess on this. Writing the wrong plan is worse than writing none,
    // because nothing downstream would ever question it.
    expect(planForPriceId("price_from_another_account", env)).toBeNull();
  });

  it("never matches the free plan, which has no price id", () => {
    expect(planForPriceId("", { ...env, STRIPE_PRICE_FREE_MONTHLY: "" })).toBeNull();
  });

  it("covers every plan and interval pair in its env naming", () => {
    const names = PLANS.filter((p) => p !== "free").flatMap((plan) =>
      INTERVALS.map((interval) => priceEnvName(plan, interval)),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(6);
  });
});
