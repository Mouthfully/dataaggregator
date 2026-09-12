/**
 * CREATE THE PRODUCTS AND PRICES THIS APP EXPECTS, AND PRINT THE ENVIRONMENT TO PASTE.
 *
 * Six prices: three paid plans, monthly and annual. The free plan has none -- nothing is charged,
 * so there is nothing to buy, and `priceIdFor` refuses to be asked.
 *
 * THE AMOUNTS COME FROM `PLAN_DISPLAY`, not from this file. That constant is what the pricing page
 * renders and what `plans.test.ts` checks the annual arithmetic against, so a price created here
 * cannot disagree with the price a customer was shown. Typing them again here is exactly the second
 * copy that eventually drifts.
 *
 * IDEMPOTENT, BY LOOKUP KEY. Stripe has no "create or update" for prices -- an amount is immutable
 * once created, because invoices reference it. So this searches by `lookup_key` first and reuses
 * what it finds. Running it twice produces the same six ids rather than twelve prices, half of them
 * orphaned and indistinguishable in the dashboard.
 *
 * A LIVE KEY REQUIRES `--live`. `sk_live_` creates objects customers can be charged against, in a
 * real tax entity's name. The flag is not a confirmation prompt for its own sake: the commonest way
 * to make live objects by accident is to export the wrong key into a shell and forget.
 */

import Stripe from "stripe";

import {
  INTERVALS,
  PLAN_DISPLAY,
  type Interval,
  type Plan,
  priceEnvName,
} from "../apps/web/app/_billing/plans.ts";

/** USD, as the pricing page states. A price with no currency is a support ticket. */
const CURRENCY = "usd";

/** Stable across runs and across accounts, so a re-run finds what a previous run made. */
function lookupKey(plan: Plan, interval: Interval): string {
  return `plan_${plan}_${interval}`;
}

function amountFor(plan: Plan, interval: Interval): number {
  const entry = PLAN_DISPLAY.find((p) => p.plan === plan);
  if (!entry) throw new Error(`no display entry for plan ${plan}`);
  const whole = interval === "month" ? entry.monthly : entry.yearly;
  // Stripe takes the smallest currency unit. USD has two decimal places; this script is USD-only
  // and says so, rather than pretending to handle zero-decimal currencies it never sees.
  return whole * 100;
}

async function main(argv: readonly string[]): Promise<number> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    process.stderr.write(
      "STRIPE_SECRET_KEY is not set.\n\n" +
        "  Stripe Dashboard -> Developers -> API keys -> Secret key\n" +
        "  Use the TEST key (sk_test_...) unless you are deliberately creating live prices.\n",
    );
    return 2;
  }

  const live = key.startsWith("sk_live_");
  if (live && !argv.includes("--live")) {
    process.stderr.write(
      "Refusing to run: STRIPE_SECRET_KEY is a LIVE key and --live was not passed.\n\n" +
        "  Live prices are objects real customers can be charged against, in a real tax entity's\n" +
        "  name. If that is what you want, re-run with --live.\n",
    );
    return 2;
  }

  const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
  const paid = PLAN_DISPLAY.filter((entry) => entry.plan !== "free");
  const lines: string[] = [];

  process.stderr.write(
    `Creating ${paid.length * INTERVALS.length} prices in ${live ? "LIVE" : "TEST"} mode.\n\n`,
  );

  for (const entry of paid) {
    // One product per plan, carrying both intervals. A customer moving monthly-to-annual then stays
    // on the same product, which is what Stripe's own upgrade flows and reporting assume.
    const product = await findOrCreateProduct(stripe, entry.plan, entry.name);

    for (const interval of INTERVALS) {
      const price = await findOrCreatePrice(stripe, product.id, entry.plan, interval);
      lines.push(`${priceEnvName(entry.plan, interval)}=${price.id}`);
      process.stderr.write(
        `  ${entry.name.padEnd(9)} ${interval.padEnd(5)} ${String(amountFor(entry.plan, interval) / 100).padStart(6)} ${CURRENCY.toUpperCase()}  ${price.id}\n`,
      );
    }
  }

  // The artefact on stdout, progress on stderr, so `> .env.stripe` captures exactly the variables.
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

async function findOrCreateProduct(
  stripe: Stripe,
  plan: Plan,
  name: string,
): Promise<Stripe.Product> {
  const existing = await stripe.products.search({ query: `metadata['plan']:'${plan}'`, limit: 1 });
  const found = existing.data[0];
  if (found) return found;
  return stripe.products.create({ name, metadata: { plan } });
}

async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  plan: Plan,
  interval: Interval,
): Promise<Stripe.Price> {
  const key = lookupKey(plan, interval);
  const existing = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
  const found = existing.data[0];

  if (found) {
    const wanted = amountFor(plan, interval);
    if (found.unit_amount !== wanted) {
      // A price is IMMUTABLE in Stripe, because invoices reference it. Silently reusing one at the
      // old amount would charge a figure the pricing page no longer shows, so this refuses and says
      // what to do: release the key from the old price, then re-run.
      throw new Error(
        `${key} already exists at ${found.unit_amount} but PLAN_DISPLAY now says ${wanted}. ` +
          "A Stripe price cannot be edited. Archive the old price and free its lookup key, then " +
          "re-run -- do not edit PLAN_DISPLAY to match the old price.",
      );
    }
    return found;
  }

  return stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: amountFor(plan, interval),
    recurring: { interval },
    lookup_key: key,
    metadata: { plan, interval },
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      process.stderr.write(
        `create-stripe-prices: ${error instanceof Error ? error.message : error}\n`,
      );
      process.exit(1);
    });
}

export { amountFor, lookupKey, main };
