import { describe, expect, it } from "vitest";

import {
  ANNUAL_DISCOUNT,
  CURRENCIES,
  DEFAULT_CURRENCY,
  amountOf,
  asCurrency,
  formatAmount,
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
    "$name's yearly price is twelve months less the stated discount, IN EVERY CURRENCY",
    (entry) => {
      // Per currency, because the discount is the promise and the monthly figure is the judgement.
      // A currency added with a hand-written yearly number that quietly differs is exactly what
      // this catches. If a plan ever gets a different discount, delete ITS case rather than
      // loosening this one -- a rule widened to fit an exception stops catching the typo.
      for (const currency of CURRENCIES) {
        const expected = Math.round(entry.monthly[currency] * 12 * (1 - ANNUAL_DISCOUNT));
        expect(entry.yearly[currency], currency).toBe(expected);
      }
    },
  );

  it("prices every plan in every currency, with no gap", () => {
    // A missing currency would render `undefined` as a price, or `NaN` after arithmetic. Both look
    // like a rendering bug rather than a catalogue one, which is why this is asserted here.
    for (const entry of PLAN_DISPLAY) {
      for (const currency of CURRENCIES) {
        expect(Number.isFinite(entry.monthly[currency]), `${entry.plan}/${currency}`).toBe(true);
        expect(Number.isFinite(entry.yearly[currency]), `${entry.plan}/${currency}`).toBe(true);
      }
    }
  });

  it("keeps USD as the default, which Stripe requires to be one value for every price", () => {
    expect(DEFAULT_CURRENCY).toBe("usd");
    expect(CURRENCIES[0]).toBe(DEFAULT_CURRENCY);
  });

  it("charges more per year than per month in every currency", () => {
    for (const entry of PLAN_DISPLAY.filter((p) => p.plan !== "free")) {
      for (const currency of CURRENCIES) {
        expect(amountOf(entry, "year", currency)).toBeGreaterThan(
          amountOf(entry, "month", currency),
        );
      }
    }
  });

  it("charges nothing for free, on either interval", () => {
    const free = PLAN_DISPLAY.find((p) => p.plan === "free");
    for (const currency of CURRENCIES) {
      expect(free?.monthly[currency]).toBe(0);
      expect(free?.yearly[currency]).toBe(0);
    }
  });

  it("orders the plans from cheapest to dearest, as the pricing table renders them", () => {
    for (const currency of CURRENCIES) {
      const monthly = PLAN_DISPLAY.map((p) => p.monthly[currency]);
      expect(
        [...monthly].sort((a, b) => a - b),
        currency,
      ).toEqual(monthly);
    }
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

describe("how an amount is written", () => {
  it("gives every currency its symbol, not a code for one and symbols for the others", () => {
    // Without `narrowSymbol`, an English locale renders THB as "THB 1,790" while USD and EUR get
    // their symbols -- one of the three formatted differently for no reason a reader could guess.
    expect(formatAmount(1790, "usd")).toBe("$1,790");
    expect(formatAmount(1790, "eur")).toBe("€1,790");
    expect(formatAmount(1790, "thb")).toBe("฿1,790");
  });

  it("groups thousands, because 34464 is not a price anyone can read", () => {
    expect(formatAmount(34464, "thb")).toContain(",");
  });

  it("shows no minor units, since every amount in the catalogue is a whole one", () => {
    expect(formatAmount(19, "usd")).toBe("$19");
    expect(formatAmount(0, "usd")).toBe("$0");
  });
});

describe("narrowing an arbitrary currency string", () => {
  it("accepts the three we price in", () => {
    for (const currency of CURRENCIES) expect(asCurrency(currency)).toBe(currency);
  });

  it("falls back to the default for anything else, rather than rendering undefined", () => {
    // This reads a query parameter, so the input is whatever a stranger types into the URL bar.
    for (const bad of ["gbp", "", "USD", "../etc", undefined, null]) {
      expect(asCurrency(bad)).toBe(DEFAULT_CURRENCY);
    }
  });
});
