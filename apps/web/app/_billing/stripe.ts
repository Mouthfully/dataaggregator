import Stripe from "stripe";

/**
 * The Stripe client, and the two secrets this app holds.
 *
 * `STRIPE_SECRET_KEY` can create charges and read every customer, so it is SERVER ONLY and must
 * never gain a NEXT_PUBLIC_ prefix. `STRIPE_WEBHOOK_SECRET` is what makes an inbound request
 * trustworthy; without it anybody who guesses the webhook URL can grant themselves a plan.
 *
 * Both refuse rather than default. A billing path that half-works is worse than one that does not
 * start: the failure would be a customer charged and not upgraded, or upgraded and not charged.
 */
export function stripeClient(env: Record<string, string | undefined> = process.env): Stripe {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Billing cannot run without it.");
  }
  // The version is pinned deliberately. Stripe's API changes shapes between versions, and a client
  // that follows the account's default silently starts receiving a different object one day.
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
}

export function webhookSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set. Without it an inbound request cannot be proved to be " +
        "Stripe's, and anyone who learns the URL could grant themselves a plan.",
    );
  }
  return secret;
}

export function isBillingConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * The service-role Supabase client, for the webhook ONLY.
 *
 * This is the one place in this app that holds a key RLS does not apply to, and it exists because
 * `subscriptions` and `billing_customers` have no write policy for any tenant role -- which is the
 * design, not an oversight. Stripe is not a member of anything, so it cannot write through a
 * session; it writes through this.
 *
 * IT IS NOT EXPORTED BEYOND THE WEBHOOK for that reason. A second caller would be a second place
 * where a bug becomes a cross-tenant write, and the whole point of the missing policies is that
 * there is exactly one such place and it is short.
 */
export function serviceRoleKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. The billing webhook writes tables that deliberately " +
        "have no tenant write policy, so it cannot use a session.",
    );
  }
  return key;
}
