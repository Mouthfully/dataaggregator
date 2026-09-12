/**
 * THE PLAN CATALOGUE -- one place, because the price a page prints and the price Stripe charges
 * must not be able to disagree.
 *
 * The amounts here are for DISPLAY. Stripe holds the authoritative price behind each price id, and
 * checkout charges what Stripe says, never what this file says. Keeping the display amount here
 * anyway is a deliberate, bounded duplication: a marketing page cannot make a network call to
 * Stripe to render a pricing table.
 *
 * WHAT BOUNDS IT, AND WHAT DOES NOT. `plans.test.ts` checks the annual arithmetic against the
 * stated discount, so a number edited in one place and not the other is a failing build.
 *
 * NOTHING HERE CHECKS THESE AGAINST STRIPE, and that limit is stated rather than implied. An
 * earlier version of this comment promised a function named `assertPricesMatchStripe` that was
 * never written; an agent read the comment and turned it into a sentence on the pricing page
 * telling customers a test guarded the amounts. A comment describing code that does not exist is
 * not a harmless aspiration -- it is a claim, and it propagates.
 *
 * A price changed in the Stripe dashboard and not here would render stale. Nobody is ever CHARGED
 * what this file says -- checkout charges what Stripe holds -- so the damage is a wrong number on
 * a page, not a wrong charge.
 *
 * THE PRICE IDS COME FROM THE ENVIRONMENT. They differ between test mode and live mode, and
 * hard-coding either means the wrong one ships to the other. A missing id is a refusal, not a
 * fallback to the other plan.
 */

export const PLANS = ["free", "starter", "growth", "agency"] as const;
export type Plan = (typeof PLANS)[number];

export const INTERVALS = ["month", "year"] as const;
export type Interval = (typeof INTERVALS)[number];

/**
 * THE CURRENCIES, AND WHY USD IS FIRST.
 *
 * Stripe requires every Price in an account to share ONE default currency, and multi-currency is
 * expressed as `currency_options` on that same Price rather than as separate Price objects. So this
 * order is not cosmetic: the head of the list is the default, the rest are options, and the six
 * price ids stay six.
 *
 * Checkout picks a customer's local currency from their IP when the Price supports it, and falls
 * back to the default when it does not.
 */
export const CURRENCIES = ["usd", "eur", "thb"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "usd";

/** What each currency is called and how its amounts are written, for a page that must say which. */
export const CURRENCY_LABEL: Record<Currency, string> = {
  usd: "USD",
  eur: "EUR",
  thb: "THB",
};

export interface PlanDisplay {
  readonly plan: Plan;
  readonly name: string;
  /**
   * Monthly price per currency, in whole units, as the pricing table prints it.
   *
   * CHOSEN, NOT CONVERTED. These are not the USD figure through an exchange rate -- a price that
   * moves with the euro is a price nobody can put on a slide, and ฿683.42 is not a price, it is a
   * conversion. Each is a round local number somebody decided. The consequence is that the three
   * columns are not equal in value on any given day, which is true of every product priced this
   * way and is the intended trade.
   */
  readonly monthly: Record<Currency, number>;
  /**
   * What a year costs when paid annually, per currency.
   *
   * DERIVED BY THE STATED RULE -- ten months' money for twelve months' service -- and asserted in
   * `plans.test.ts` for every currency. The monthly figures are a judgement; the annual term is a
   * promise, so it is arithmetic rather than another set of numbers to keep in step.
   */
  readonly yearly: Record<Currency, number>;
}

/**
 * A year costs ten months. Two of the twelve are free.
 *
 * WHY A COUNT OF MONTHS RATHER THAN A PERCENTAGE, which is what this was. The rule used to be
 * twelve months less 20%, rounded, and it produced $182, EUR 173 and THB 6,624 -- numbers no one
 * would choose, in a currency triplet where rounding them to anything tidier silently changed the
 * discount. THB Agency was the case that decided it: the nearest round figure to a 20% cut is
 * THB 34,500, which is 19.9% off, so a page saying "20% off" would have been overstating by a
 * tenth of a point in one currency and not the others.
 *
 * Multiplying by ten cannot have that problem. It lands on a round number in EVERY currency
 * because the monthly figure was already chosen to be round, and "two months free" is EXACTLY
 * true rather than true-after-rounding -- there is no percentage left to overstate. The customer
 * gets 16.7% rather than 20%, which is the trade the founder took knowingly.
 */
function annual(monthly: number): number {
  return monthly * MONTHS_CHARGED_ANNUALLY;
}

/** Months paid for on an annual term. The other two are the discount. */
export const MONTHS_CHARGED_ANNUALLY = 10;

/** Months of service an annual term buys. Twelve, or the word "annual" is doing something odd. */
export const MONTHS_PER_YEAR = 12;

/**
 * The monthly figure in each currency. Everything else on this page is derived from it.
 *
 * The day one plan needs a discount that is not the annual one, give that plan explicit `yearly`
 * numbers instead of calling `annual()` -- a rule widened to fit an exception stops catching the
 * typo it was written for.
 */
const MONTHLY: Record<Exclude<Plan, "free">, Record<Currency, number>> = {
  starter: { usd: 19, eur: 18, thb: 690 },
  growth: { usd: 49, eur: 45, thb: 1790 },
  agency: { usd: 99, eur: 90, thb: 3590 },
};

function entry(plan: Exclude<Plan, "free">, name: string): PlanDisplay {
  const monthly = MONTHLY[plan];
  return {
    plan,
    name,
    monthly,
    yearly: {
      usd: annual(monthly.usd),
      eur: annual(monthly.eur),
      thb: annual(monthly.thb),
    },
  };
}

const FREE_AMOUNTS: Record<Currency, number> = { usd: 0, eur: 0, thb: 0 };

export const PLAN_DISPLAY: readonly PlanDisplay[] = [
  { plan: "free", name: "Free", monthly: FREE_AMOUNTS, yearly: FREE_AMOUNTS },
  entry("starter", "Starter"),
  entry("growth", "Growth"),
  entry("agency", "Agency"),
];

/** The amount a plan costs, for one currency and interval, in whole units. */
export function amountOf(entry: PlanDisplay, interval: Interval, currency: Currency): number {
  return interval === "month" ? entry.monthly[currency] : entry.yearly[currency];
}

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

/**
 * An amount, written the way its currency is written.
 *
 * `Intl` rather than a `$` glued to a number: baht is written ฿1,790 and a euro amount is written
 * differently again, and a hard-coded symbol in front of every currency is how a price becomes
 * wrong in two of the three. It also groups thousands, which matters the moment THB appears --
 * "34464" is not a price anybody can read.
 *
 * No minor units are shown. Every amount in this catalogue is a whole unit by construction, and
 * "$19.00" reads like a form field rather than a price.
 */
export function formatAmount(whole: number, currency: Currency): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
    // `narrowSymbol`, or THB renders as "THB 1,790" in an English locale while USD and EUR get
    // their symbols -- one of the three priced differently from the others for no reason a reader
    // could guess. With it, all three read ฿1,790 / $1,790 / €1,790.
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole);
}

/** Narrow an arbitrary string -- a query parameter, a cookie -- to a currency we actually price in. */
export function asCurrency(value: string | undefined | null): Currency {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : DEFAULT_CURRENCY;
}
