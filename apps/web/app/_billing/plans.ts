/**
 * THE PLAN CATALOGUE -- one place, because the price a page prints and the price Stripe charges
 * must not be able to disagree.
 *
 * The amounts here are for DISPLAY. Stripe holds the authoritative price behind each price id, and
 * checkout charges what Stripe says, never what this file says. Keeping the display amount here
 * anyway is a deliberate, bounded duplication: a marketing page cannot make a network call to
 * Stripe to render a pricing table. What closes the gap is `assertPricesMatchStripe` below, run as
 * a test rather than trusted -- so a price changed in the Stripe dashboard and not here is a
 * failing build, not a customer discovering it at checkout.
 *
 * THE PRICE IDS COME FROM THE ENVIRONMENT. They differ between test mode and live mode, and
 * hard-coding either means the wrong one ships to the other. A missing id is a refusal, not a
 * fallback to the other plan.
 */

export const PLANS = ["free", "starter", "growth", "agency"] as const;
export type Plan = (typeof PLANS)[number];

export const INTERVALS = ["month", "year"] as const;
export type Interval = (typeof INTERVALS)[number];

export interface PlanDisplay {
  readonly plan: Plan;
  readonly name: string;
  /** Monthly price in whole currency units, as the pricing table prints it. */
  readonly monthly: number;
  /** What a year costs when paid annually. Twenty per cent off twelve months, per the design. */
  readonly yearly: number;
}

/**
 * `yearly` is WRITTEN OUT rather than computed from `monthly`.
 *
 * A `monthly * 12 * 0.8` in this file would be a rule, and a rule is exactly the thing that stops
 * being true the first time one plan gets a different discount. The arithmetic is checked by a test
 * instead, which fails loudly if someone edits one number and not the other -- and can be deleted
 * for a single plan the day its discount differs, without touching the other three.
 */
export const PLAN_DISPLAY: readonly PlanDisplay[] = [
  { plan: "free", name: "Free", monthly: 0, yearly: 0 },
  { plan: "starter", name: "Starter", monthly: 19, yearly: 182 },
  { plan: "growth", name: "Growth", monthly: 49, yearly: 470 },
  { plan: "agency", name: "Agency", monthly: 99, yearly: 950 },
];

export const ANNUAL_DISCOUNT = 0.2;

/** The environment variable holding a plan's Stripe price id, by plan and interval. */
export function priceEnvName(plan: Plan, interval: Interval): string {
  return `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}LY`;
}

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

/**
 * The Stripe price id for a plan and interval, or a refusal naming what is missing.
 *
 * `free` has NO price id and asking for one is a programming error rather than a configuration
 * one: nothing is charged, so there is nothing to check out. The refusal says which, because the
 * two are fixed in different places.
 */
export function priceIdFor(
  plan: Plan,
  interval: Interval,
  env: Record<string, string | undefined> = process.env,
): string {
  if (plan === "free") {
    throw new BillingConfigError(
      "the free plan has no Stripe price. Nothing is charged for it, so there is nothing to buy.",
    );
  }
  const name = priceEnvName(plan, interval);
  const value = env[name];
  if (!value) {
    throw new BillingConfigError(
      `${name} is not set. Price ids differ between Stripe's test and live modes, so there is no ` +
        "default that is safe in both.",
    );
  }
  return value;
}

/** Reverse lookup, for the webhook: which plan and interval is this price id? */
export function planForPriceId(
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): { plan: Plan; interval: Interval } | null {
  for (const plan of PLANS) {
    if (plan === "free") continue;
    for (const interval of INTERVALS) {
      if (env[priceEnvName(plan, interval)] === priceId) return { plan, interval };
    }
  }
  return null;
}
