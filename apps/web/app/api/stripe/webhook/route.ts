import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { supabaseEnv } from "../../../_auth/env";
import { planForPriceId } from "../../../_billing/plans";
import { serviceRoleKey, stripeClient, webhookSecret } from "../../../_billing/stripe";

/**
 * THE ONLY THING THAT MAY WRITE BILLING STATE.
 *
 * `subscriptions` and `billing_customers` have no insert, update or delete policy for any tenant
 * role, which `supabase/tests/12_billing.sql` asserts from the catalogue. So this route is the
 * single write path, and it holds the single service-role key in the app.
 *
 * THREE THINGS THIS ROUTE GETS RIGHT, EACH OF WHICH IS A KNOWN WAY TO GET IT WRONG.
 *
 * 1. THE SIGNATURE IS VERIFIED AGAINST THE RAW BODY. `request.text()`, never `request.json()`:
 *    Stripe signs the exact bytes it sent, and parsing then re-serialising changes them -- key
 *    order, number formatting, unicode escapes -- so the signature stops matching for reasons that
 *    look like a Stripe outage. An unverified webhook is an open endpoint that grants plans.
 *
 * 2. EVENTS ARE APPLIED OUT OF ORDER, AND THAT IS NORMAL. Stripe retries and does not guarantee
 *    delivery order, so an older `customer.subscription.updated` can arrive after a newer one. The
 *    write compares `stripe_event_at` and refuses to move state backwards. Without that, a retried
 *    "past_due" delivered late silently downgrades a customer who has already paid.
 *
 * 3. THE ORGANISATION COMES FROM METADATA WE SET, NOT FROM ANYTHING A CUSTOMER CONTROLS. Checkout
 *    is created with `metadata.organisation_id`; this route trusts that and nothing else in the
 *    payload to decide which tenant an event is about.
 *
 * It returns 200 to Stripe for anything it has deliberately ignored. A non-2xx makes Stripe retry,
 * and retrying an event this app will never handle is a queue that never drains.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function admin() {
  const { url } = supabaseEnv();
  return createClient(url, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "unsigned" }, { status: 400 });

  // The RAW body. See note 1 above.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, signature, webhookSecret());
  } catch {
    // The reason is not echoed. It distinguishes a bad signature from a stale timestamp, which
    // tells someone probing the endpoint how close they are.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    // 200, deliberately. See the header: a retry of something never handled never drains.
    return NextResponse.json({ ignored: event.type });
  }

  try {
    await apply(event);
  } catch (error) {
    // A 500 asks Stripe to retry, which is right for a transient database failure. The message is
    // logged, never returned.
    console.error("stripe webhook:", event.type, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "apply failed" }, { status: 500 });
  }

  return NextResponse.json({ received: event.type });
}

async function apply(event: Stripe.Event): Promise<void> {
  const db = admin();
  const at = new Date(event.created * 1000).toISOString();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const organisationId = session.metadata?.organisation_id;
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!organisationId || !customer) return;

    // The customer link is written here and nowhere else, so a later subscription event can find
    // the organisation even when its own metadata is absent.
    await db
      .from("billing_customers")
      .upsert(
        { organisation_id: organisationId, stripe_customer_id: customer },
        { onConflict: "organisation_id" },
      );
    return;
  }

  const subscription = event.data.object as Stripe.Subscription;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  // Which tenant. From metadata if Stripe still carries it, otherwise from the customer link this
  // route wrote at checkout. Never from anything else in the payload.
  let organisationId = subscription.metadata?.organisation_id ?? null;
  if (!organisationId) {
    const { data } = await db
      .from("billing_customers")
      .select("organisation_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    organisationId = (data?.organisation_id as string | undefined) ?? null;
  }
  if (!organisationId) return;

  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  if (!priceId) return;

  const match = planForPriceId(priceId);
  if (!match) {
    // A price this deployment does not know. Refusing to guess: writing the wrong plan is worse
    // than writing none, because nothing downstream would ever question it.
    console.error("stripe webhook: unknown price", priceId);
    return;
  }

  // `canceled` is terminal, so it is applied whatever the period says. Every other status keeps the
  // period Stripe reports, and `current_plan` decides entitlement from the pair.
  const periodEnd = item?.current_period_end ?? null;
  if (periodEnd === null) return;

  const row = {
    organisation_id: organisationId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan: match.plan,
    billing_interval: match.interval,
    status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
    current_period_end: new Date(periodEnd * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_event_at: at,
    updated_at: new Date().toISOString(),
  };

  // OUT-OF-ORDER GUARD. Read the event clock we last wrote and refuse to go backwards. See note 2.
  const { data: existing } = await db
    .from("subscriptions")
    .select("stripe_event_at")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (existing?.stripe_event_at && new Date(existing.stripe_event_at as string) > new Date(at)) {
    return;
  }

  await db.from("subscriptions").upsert(row, { onConflict: "organisation_id" });
}
