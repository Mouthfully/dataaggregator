import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthConfigured } from "../_auth/env";
import { currentUser, supabaseServer } from "../_auth/server";
import { openBillingPortal, startCheckout } from "../_billing/actions";
import { PLAN_DISPLAY, type Plan } from "../_billing/plans";
import { isBillingConfigured, stripeClient } from "../_billing/stripe";
import { Footer, SiteHeader } from "../_chrome";

export const dynamic = "force-dynamic";

const COPY = {
  eyebrow: "Billing",
  heading: "Your plan and invoices.",
  currentPlan: "Current plan",
  renews: "Renews",
  ends: "Access ends",
  cancelling: "Cancels at the end of this period",
  managed: "Payment method, VAT details and cancellation are handled by our payment provider.",
  portal: "Manage billing",
  invoices: "Invoices",
  noInvoices: "No invoices yet. They appear here once a subscription starts.",
  notConfigured: "Billing is not configured on this deployment.",
  noOrganisation: "Create your organisation before choosing a plan.",
  perMonth: "per month",
  perYear: "per year, billed annually",
  choose: "Choose",
  currentLabel: "Your plan",
  invoicesFromStripe:
    "Invoice history is read from our payment provider, so it is never out of date.",
} as const;

export const metadata: Metadata = {
  title: "Billing",
  description: COPY.heading,
  robots: { index: false, follow: false },
};

/**
 * THE BILLING PAGE.
 *
 * INVOICES ARE READ FROM STRIPE ON EACH LOAD RATHER THAN STORED. A local invoices table would be a
 * second copy of a fact Stripe keeps changing -- a refund, a credit note, a tax correction, a
 * retried charge -- and the stale copy would be the one a customer quotes back. The cost is one API
 * call on a page nobody opens hourly; the benefit is that "paid" here always means what Stripe
 * means by it.
 *
 * THE PLAN, BY CONTRAST, IS READ LOCALLY, through `current_plan`. That question is asked on every
 * page load to decide what a tenant may do, and a gate that depends on a third party being
 * reachable either fails open or fails slow.
 */
export default async function BillingPage() {
  if (!isAuthConfigured()) redirect("/signin");
  const user = await currentUser();
  if (!user) redirect("/signin?next=%2Fbilling");

  const supabase = await supabaseServer();

  // Through RLS: exactly the organisations this session belongs to.
  const { data: orgs } = await supabase
    .from("organisations")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1);
  const organisation = orgs?.[0];
  if (!organisation) redirect("/welcome");

  const { data: plan } = await supabase.rpc("current_plan", {
    p_organisation_id: organisation.id,
  });
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end, billing_interval")
    .eq("organisation_id", organisation.id)
    .maybeSingle();

  const activePlan = (plan as Plan | null) ?? "free";
  const invoices = await recentInvoices(organisation.id as string);

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-ground">
        <div className="mx-auto max-w-[900px] px-8 py-14">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {COPY.eyebrow}
          </span>
          <h1 className="font-display text-ink mt-3 text-[clamp(28px,3vw,38px)] leading-[1.1] font-bold tracking-[-0.04em]">
            {COPY.heading}
          </h1>

          <section className="border-line bg-surface mt-8 rounded-xl border p-7">
            <p className="text-ink-subtle text-xs">{COPY.currentPlan}</p>
            <p className="font-display text-ink mt-1 text-2xl font-bold">
              {PLAN_DISPLAY.find((p) => p.plan === activePlan)?.name ?? activePlan}
            </p>

            {subscription ? (
              <p className="text-ink-muted mt-2 text-sm">
                {subscription.cancel_at_period_end ? COPY.cancelling : COPY.renews}{" "}
                <time dateTime={String(subscription.current_period_end)}>
                  {formatDate(String(subscription.current_period_end))}
                </time>
              </p>
            ) : null}

            <p className="text-ink-subtle mt-4 text-xs leading-relaxed">{COPY.managed}</p>

            <form action={openBillingPortal} className="mt-4">
              <button
                type="submit"
                className="border-line text-ink hover:bg-surface-inset min-h-[44px] rounded-md border px-5 text-sm font-bold transition-colors"
              >
                {COPY.portal}
              </button>
            </form>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-ink text-lg font-bold">Plans</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_DISPLAY.map((entry) => (
                <li key={entry.plan} className="border-line bg-surface rounded-lg border p-5">
                  <p className="text-ink text-sm font-bold">{entry.name}</p>
                  <p className="font-display text-ink mt-1 text-2xl font-bold tracking-[-0.03em]">
                    ${entry.monthly}
                  </p>
                  <p className="text-ink-subtle text-xs">{COPY.perMonth}</p>

                  {entry.plan === activePlan ? (
                    <p className="text-accent mt-4 text-xs font-bold">{COPY.currentLabel}</p>
                  ) : entry.plan === "free" ? null : (
                    <form
                      action={async () => {
                        "use server";
                        await startCheckout(entry.plan, "month");
                      }}
                      className="mt-4"
                    >
                      <button
                        type="submit"
                        className="bg-accent text-ink-on-accent hover:bg-accent-hover min-h-[40px] w-full rounded-md px-4 text-xs font-bold transition-colors"
                      >
                        {COPY.choose} {entry.name}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-ink text-lg font-bold">{COPY.invoices}</h2>
            <p className="text-ink-subtle mt-1 text-xs">{COPY.invoicesFromStripe}</p>

            {invoices.length === 0 ? (
              <p className="border-line text-ink-muted mt-4 rounded-lg border border-dashed px-5 py-6 text-sm">
                {COPY.noInvoices}
              </p>
            ) : (
              <ul className="border-line bg-surface mt-4 divide-y rounded-lg border">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <time className="text-ink-muted text-sm" dateTime={invoice.date}>
                      {formatDate(invoice.date)}
                    </time>
                    <span className="text-ink flex-1 text-sm font-bold">{invoice.total}</span>
                    <span className="text-ink-subtle text-xs">{invoice.status}</span>
                    {invoice.url ? (
                      <a
                        href={invoice.url}
                        className="text-accent text-sm font-bold hover:underline"
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        View
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

interface InvoiceRow {
  readonly id: string;
  readonly date: string;
  readonly total: string;
  readonly status: string;
  readonly url: string | null;
}

/**
 * The organisation's invoices, from Stripe.
 *
 * Returns an empty list rather than throwing when billing is unconfigured or Stripe is unreachable.
 * This section is history; the page's job is to show the plan, and losing the invoice list is not a
 * reason to fail the whole screen.
 */
async function recentInvoices(organisationId: string): Promise<InvoiceRow[]> {
  if (!isBillingConfigured()) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return [];

  try {
    const list = await stripeClient().invoices.list({ customer, limit: 12 });
    return list.data.map((invoice) => ({
      id: invoice.id ?? invoice.number ?? String(invoice.created),
      date: new Date(invoice.created * 1000).toISOString(),
      // Stripe's amounts are in the currency's minor unit. Dividing by 100 is wrong for
      // zero-decimal currencies, so the formatter is given the currency and does it.
      total: formatMoney(invoice.total, invoice.currency),
      status: invoice.status ?? "unknown",
      url: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
    }));
  } catch {
    return [];
  }
}

function formatMoney(minorUnits: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  // `Intl` knows which currencies have no minor unit, so the scale comes from it rather than a
  // hard-coded 100 that is wrong for JPY, KRW and a dozen others.
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minorUnits / 10 ** digits);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(iso));
}
