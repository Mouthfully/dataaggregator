import { brand, formatAddress } from "@repo/brand";
import type { Metadata } from "next";

import { PLAN_DISPLAY } from "../_billing/plans";
import { Footer, SiteHeader } from "../_chrome";
import { claim } from "../_content";

/**
 * THE PRICING PAGE, at /pricing.
 *
 * IT IS THE LONG FORM OF `app/_sections/Pricing.tsx`, NOT A SECOND OPINION ON PRICE. The four
 * self-serve tiers, their summaries and their feature lists are that section's, and the numbers are
 * not re-typed here at all: `PLAN_DISPLAY` in `app/_billing/plans.ts` is the catalogue the checkout
 * reads. A price typed into a marketing page is a price that can disagree with the one charged.
 *
 * NOTHING VALIDATES THESE AGAINST STRIPE. `plans.test.ts` checks the annual arithmetic and
 * `stripe-prices.test.ts` checks what the creation script would send, but neither calls Stripe.
 *
 * THE YEARLY FIGURES ARE RENDERED HERE, AND THE HOMEPAGE SECTION'S REASON FOR NOT RENDERING THEM
 * NO LONGER APPLIES. That section's module comment says the yearly amounts "do not exist anywhere
 * in the design", which was true of the design and is no longer true of the repository: `yearly` is
 * a written-out field on every entry in `PLAN_DISPLAY`, checked against twenty per cent off twelve
 * months by its own test. So this page prints both figures as static text and needs no toggle, no
 * client component and no state -- the thing the toggle existed to reveal is simply on the page.
 *
 * THE FIFTH TIER HAS NO PRICE AND MAKES NO NEW PROMISE. What separates Enterprise is said in this
 * product's own nouns -- connectors, workspaces under one organisation, switching between them from
 * one login, an invoice rather than a card, a named person -- and the panel then says out loud what
 * it does NOT carry. There is no certification, no audit report, no availability guarantee and no
 * dedicated instance behind it, because none of those exists; `packages/brand/src/claims.ts`
 * withholds the gdpr, dpa and data-region claims for the same reason and this page does not route
 * around that list.
 *
 * WHERE A LIMIT HAS NOT BEEN DECIDED, THE TABLE SAYS SO. Nothing in the schema or in the plan
 * catalogue caps workspaces or members per plan, so those cells read "Not set" rather than carrying
 * a number somebody would plan around. Same rule as the connector pages: an absence is stated, not
 * filled. The open terms at the foot of the page are the same decision applied to the contract.
 *
 * THE BILLING ANSWERS ARE READ OUT OF THE CODE, not out of habit. `public.current_plan` in
 * `supabase/migrations/20260912000600_billing.sql` entitles a cancelled subscription until
 * `current_period_end` passes, counts `past_due` as still entitled and `unpaid` as not, and those
 * three facts are what the FAQ says in words.
 *
 * EVERY SENTENCE ABOUT CREDENTIALS, TENANCY AND ROWS COMES THROUGH `claim()`, so it cannot say
 * anything `CLAIMS` has not already approved with a specification citation behind it.
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only. */
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Four plans you can buy yourself, priced in US dollars, and a fifth you talk to us about. Full comparison table, billing answers, and the terms that are not yet set.",
  alternates: { canonical: "/pricing" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below. Eyebrows are stored in sentence case because
 * the capitals are CSS.
 * ------------------------------------------------------------------------------------------- */

const HERO_EYEBROW = "Pricing";
const HERO_HEADING_TOP = "Every plan, side by side.";
const HERO_HEADING_BOTTOM = "Priced in US dollars.";

const HERO_LEAD =
  "Four plans you can buy yourself and one that starts with a conversation. The four prices below come from the same catalogue the checkout reads, so the page and the charge cannot be typed apart.";

/** Said once, in full, because a price with no currency becomes a support ticket. */
const CURRENCY_NOTE =
  "All amounts on this page are in US dollars. Tax is added by the payment provider at checkout according to where you are, so an invoice total can be higher than the figure on the card.";

const TERM_NOTE =
  "Monthly and yearly are both listed rather than hidden behind a switch. A yearly term is twenty per cent off twelve months, which is why the annual figure is not twelve times the monthly one.";

const SECTION_LINKS = [
  { href: "#plans", label: "Plans" },
  { href: "#compare", label: "Compare" },
  { href: "#every-plan", label: "On every plan" },
  { href: "#billing-faq", label: "Billing questions" },
  { href: "#open-terms", label: "Not yet decided" },
] as const;

/**
 * Per-tier summaries and feature lists, transcribed from `app/_sections/Pricing.tsx` and not
 * adjusted. Keyed by the plan id so they are zipped onto `PLAN_DISPLAY` rather than restating its
 * names or its prices.
 */
interface TierNote {
  readonly summary: string;
  readonly features: readonly string[];
}

const TIER_NOTES: Record<string, TierNote> = {
  free: {
    summary: "Get started and explore.",
    features: ["3 connectors", "Daily refresh", "Standard reports", "Email support"],
  },
  starter: {
    summary: "For individuals and small teams.",
    features: [
      "10 connectors",
      "Hourly refresh",
      "Custom reports",
      "Basic AI insights",
      "Email support",
    ],
  },
  growth: {
    summary: "For growing businesses.",
    features: [
      "50 connectors",
      "15 min refresh",
      "Advanced AI insights",
      "Task management",
      "Team collaboration",
      "Priority support",
    ],
  },
  agency: {
    summary: "For larger teams and clients.",
    features: [
      "200+ connectors",
      "5 min refresh",
      "White-label reports",
      "API access",
      "Dedicated support",
      "Custom onboarding",
    ],
  },
};

const POPULAR_PLAN = "growth";
const POPULAR_BADGE = "Most popular";
const CTA_LABEL = "Get started";

const PER_MONTH = "/ month";
const YEARLY_SAVING = "20% off";

/** The four self-serve tiers, composed from the catalogue so no price is written twice. */
const TIERS = PLAN_DISPLAY.map((plan) => ({
  id: plan.plan,
  name: plan.name,
  monthly: `$${plan.monthly}`,
  yearly: plan.yearly === 0 ? null : `$${plan.yearly} a year`,
  summary: TIER_NOTES[plan.plan]?.summary ?? "",
  features: TIER_NOTES[plan.plan]?.features ?? [],
  popular: plan.plan === POPULAR_PLAN,
}));

/* The fifth tier. */
const ENTERPRISE_NAME = "Enterprise";
const ENTERPRISE_PRICE = "Talk to us";
const ENTERPRISE_EYEBROW = "The fifth plan";
const ENTERPRISE_LEAD =
  "There is no self-serve price, because the price depends on the deal. What follows is what the plan actually changes, in the same nouns the rest of the product uses.";

/**
 * Every line is something this product can already mean. A workspace is one client or brand inside
 * an organisation (`supabase/migrations/20260908000200_tenancy.sql`); switching between them from
 * one login with data, keys and connections kept apart is the `tenant-isolation` claim; invoicing
 * and a named contact are commercial terms rather than product capabilities.
 */
const ENTERPRISE_POINTS = [
  {
    title: "Limits agreed, not metered",
    body: "Whatever this plan covers is written down before you sign rather than metered into a surprise afterwards.",
  },
  {
    title: "More workspaces in one organisation",
    body: "A workspace is one client or one brand. An organisation holds as many as the agreement says, and members are granted the ones they should see rather than all of them.",
  },
  {
    title: "Switching, not mixing",
    body: claim("tenant-isolation"),
  },
  {
    title: "Billing arranged with you",
    body: "The four plans above are bought with a card through the checkout. How this one is paid for is part of the conversation, and nothing is decided here in advance of it.",
  },
  {
    title: "A named person to contact",
    body: "Somebody with a name rather than a shared inbox, for the questions that do not fit a support queue.",
  },
] as const;

/** Said out loud, because a plan called Enterprise is assumed to carry these until it says it does not. */
const ENTERPRISE_NOT_INCLUDED =
  "What this plan does not carry: there is no certification, no audit report, no availability guarantee, no separate instance and no single sign-on behind it, because none of those exists yet. If a procurement process needs one, ask and we will tell you plainly where we are rather than where we intend to be.";

const ENTERPRISE_CTA = "Talk to us";

/* The comparison matrix. */
const COMPARE_EYEBROW = "Side by side";
const COMPARE_HEADING = "What each plan includes.";
const COMPARE_LEAD =
  "One row for each thing a plan can actually change. Where a limit has not been decided, the cell says so rather than carrying a number somebody would plan around.";

const COMPARE_CAPTION = "Plan comparison";
const FEATURE_COLUMN = "What's included";

/** The five column headings, taken from the catalogue so the table cannot fall out of step. */
const MATRIX_HEAD = [
  FEATURE_COLUMN,
  ...PLAN_DISPLAY.map((plan) => plan.name),
  ENTERPRISE_NAME,
] as const;

type Cell = string | boolean;

interface MatrixRow {
  readonly label: string;
  /** Free, Starter, Growth, Agency, Enterprise -- a tuple, so a missing cell is a type error. */
  readonly cells: readonly [Cell, Cell, Cell, Cell, Cell];
}

interface MatrixGroup {
  readonly group: string;
  readonly rows: readonly MatrixRow[];
}

/** A limit nobody has decided. Rendered rather than guessed; see MATRIX_NOTE_LIMITS. */
const NOT_SET = "Not set";
const BY_AGREEMENT = "By agreement";
const REGION = brand.dataRegion ?? NOT_SET;

/**
 * The matrix. Free through Agency are the comparison rows in `app/_sections/Pricing.tsx`, extended
 * with the per-tier feature lists that section already prints on the cards. Enterprise is the
 * consistent extension of each row and never a new capability.
 *
 * The four "Data" rows are claims, not features: they hold on every plan because they are
 * properties of the contract every row is emitted under, so each is a tick in all five columns.
 */
const MATRIX: readonly MatrixGroup[] = [
  {
    group: "Connections",
    rows: [
      { label: "Connectors", cells: ["3", "10", "50", "200+", BY_AGREEMENT] },
      { label: "Data refresh", cells: ["Daily", "Hourly", "15 min", "5 min", "5 min"] },
      {
        label: "Workspaces in one organisation",
        cells: [NOT_SET, NOT_SET, NOT_SET, NOT_SET, BY_AGREEMENT],
      },
      { label: "Members", cells: [NOT_SET, NOT_SET, NOT_SET, NOT_SET, BY_AGREEMENT] },
      { label: "Team collaboration", cells: [false, false, true, true, true] },
      { label: "Read-only platform credentials", cells: [true, true, true, true, true] },
    ],
  },
  {
    group: "Data",
    rows: [
      { label: "Freshness fields on every row", cells: [true, true, true, true, true] },
      { label: "Attribution window required", cells: [true, true, true, true, true] },
      { label: "Currency conversion recorded on the row", cells: [true, true, true, true, true] },
      { label: "Data held per tenant, never pooled", cells: [true, true, true, true, true] },
      { label: "Hosting region", cells: [REGION, REGION, REGION, REGION, REGION] },
    ],
  },
  {
    group: "Reporting",
    rows: [
      { label: "Standard reports", cells: [true, true, true, true, true] },
      { label: "Custom reports", cells: [false, true, true, true, true] },
      { label: "AI insights", cells: [false, "Basic", "Advanced", "Advanced", "Advanced"] },
      { label: "Task management", cells: [false, false, true, true, true] },
      { label: "White-label reports", cells: [false, false, false, true, true] },
      { label: "API access", cells: [false, false, false, true, true] },
    ],
  },
  {
    group: "Support",
    rows: [
      {
        label: "Support channel",
        cells: ["Email", "Email", "Priority", "Dedicated", "Named contact"],
      },
      { label: "Custom onboarding", cells: [false, false, false, true, true] },
    ],
  },
];

/** The two glyph labels the cells announce. A bare tick or dash says nothing out loud. */
const INCLUDED = "Included";
const NOT_INCLUDED = "Not included";

const MATRIX_NOTE_LIMITS =
  "Workspace and member limits are not set on any plan. Nothing in the schema or in the plan catalogue caps either of them, so publishing a figure here would be inventing an entitlement rather than reporting one.";
const MATRIX_NOTE_REGION =
  "The hosting region is where the data is held. It is one region, chosen by us and named above, and not a choice offered at sign-up.";

/* What holds on every plan. */
const EVERY_PLAN_EYEBROW = "On every plan";
const EVERY_PLAN_HEADING = "True on the free plan and the paid ones alike.";
const EVERY_PLAN_LEAD =
  "None of the following is a tier. They are properties of how the product reads and holds data, so a plan cannot switch them off or sell them back.";

/**
 * Five approved claims, resolved by id. `claim()` throws on an unknown or withheld id, so nothing
 * reaches this list that `packages/brand/src/claims.ts` has not published with a citation.
 */
const EVERY_PLAN_CARDS = [
  { title: "Your credentials stay yours", body: claim("read-only-oauth") },
  { title: "One tenant per client", body: claim("tenant-isolation") },
  { title: "Never pooled", body: claim("no-pooling") },
  { title: "Never used for training", body: claim("no-training") },
  { title: "Every row dated", body: claim("freshness-fields") },
  { title: "Ask for an earlier reading", body: claim("time-travel") },
] as const;

/* Billing questions. */
const FAQ_EYEBROW = "Billing";
const FAQ_HEADING_TOP = "What happens";
const FAQ_HEADING_BOTTOM = "when money moves.";
const FAQ_LINK_LABEL = "Open billing";

/**
 * Every answer here is read from the code rather than from habit.
 *
 *   1 and 2  `public.current_plan` in `supabase/migrations/20260912000600_billing.sql`: the plan is
 *            in force while status is trialing, active or past_due AND current_period_end is still
 *            in the future, and `cancel_at_period_end` does not shorten that.
 *   3        `openBillingPortal` in `app/_billing/actions.ts`; proration is the provider's default
 *            and is not configured anywhere here, so no rule is stated.
 *   4        `automatic_tax: { enabled: true }` in `startCheckout`.
 *   5        `recentInvoices` in `app/billing/page.tsx`, and the migration's own note on why no
 *            invoices table exists.
 *   6        `brand.vatNumber` is null, deliberately.
 *   7        `startCheckout` builds a card checkout session; there is no invoicing path in code.
 */
const FAQS = [
  {
    question: "What happens at the end of a term?",
    answer:
      "It renews for another term of the same length unless it has been cancelled first. If you cancel, the plan stays in force until the period you have already paid for runs out, and the organisation returns to Free the moment that date passes. Cutting access at the click would be taking money for nothing.",
  },
  {
    question: "What happens if a payment fails?",
    answer:
      "While the payment provider is still retrying the card, nothing changes: that state is recorded as past due and it still entitles the organisation to everything the plan carries, because a good many of those cards succeed on a later attempt. When the provider gives up and marks the subscription unpaid, entitlement stops and the organisation is back on Free.",
  },
  {
    question: "Can we change plan in the middle of a term?",
    answer:
      "Yes. The change is made through the payment provider, and it takes effect here as soon as the provider confirms it. How a part-used term is credited against the new one follows the provider's own proration, which is not a term this company has published, so this page does not state one.",
  },
  {
    question: "Which currency are the prices in?",
    answer:
      "United States dollars, for both the monthly and the yearly figures. Tax is added by the payment provider at checkout according to where you are, so the invoice total can be higher than the amount printed on the card above.",
  },
  {
    question: "Where do invoices come from?",
    answer:
      "From the payment provider, read back from it every time the billing page loads rather than copied into this product. A refund, a credit note or a tax correction therefore shows up as the provider has it, and not as we last remembered it.",
  },
  {
    question: "Is there a VAT number on the invoice?",
    answer:
      "No VAT number is recorded for the company yet, and an invoice printing a wrong one is worse than an invoice printing none, so the field stays empty until it is confirmed. The registration number at the foot of this page is real.",
  },
  {
    question: "Can we pay by invoice instead of by card?",
    answer:
      "The four plans above are card only, through the checkout. Invoicing is one of the things the Enterprise conversation is for.",
  },
] as const;

/* Terms that are open. */
const OPEN_EYEBROW = "Not yet decided";
const OPEN_HEADING = "Terms this page will not guess at.";
const OPEN_LEAD =
  "Each of the following is a decision nobody has made yet. A plausible default written here would put a term in front of a customer that no one inside the company has agreed to, so the heading stands and the answer says it is open.";

const OPEN_TERMS = [
  {
    title: "Refunds",
    body: "No refund window is set. Cancelling stops the next charge and leaves the current period running, and there is no published rule for getting a paid period back.",
  },
  {
    title: "Proration on a mid-term change",
    body: "Not set here. A change made through the payment provider is prorated by the provider's own default, and this company has published no rule of its own on top of it.",
  },
  {
    title: "Notice before a price change",
    body: "No notice period is set. When one is decided it will be written here and in the agreement, and not implied by silence.",
  },
  {
    title: "Governing law and where a dispute is heard",
    body: "Not set. The company is registered at the address at the foot of this page, which is a fact about the entity and not a choice of forum.",
  },
  {
    title: "Limitation of liability",
    body: "No cap is set. Nothing on this page should be read as agreeing one in either direction.",
  },
  {
    title: "Data processing agreement and sub-processors",
    body: "There is no agreement to send and no published list of the parties that process data on our behalf. Until both exist, no compliance claim is made anywhere on this site.",
  },
  {
    title: "Availability",
    body: "No availability commitment is offered, and there is no operating history to quote one from.",
  },
  {
    title: "Workspace and member limits per plan",
    body: "Open, as the comparison table says in the rows themselves. Nothing caps either today.",
  },
] as const;

/* The imprint block and the closing panel. */
const IMPRINT_HEADING = "Who you would be contracting with";
const IMPRINT_NOTE =
  "The entity below is the one that issues the invoice and the one named on the imprint. Its address and registration number are on public record.";
const IMPRINT_CONTACT_LABEL = "Contact";

const FINAL_HEADING = "Start on Free.";
const FINAL_LEAD =
  "Connect one platform, see what it reads, and move up a plan only when the free tier runs out of room.";
const FINAL_CTA = "Explore dashboard";

/** Shared class strings, so the buttons on this page cannot drift apart. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const SECONDARY_BUTTON =
  "bg-surface text-accent border-line hover:bg-surface-subtle inline-flex min-h-[46px] items-center justify-center rounded-md border px-[22px] text-sm font-bold transition-colors";

/** One matrix cell: a count or a word renders itself, a boolean renders a glyph plus a word. */
function MatrixCell({ value }: { value: Cell }) {
  if (typeof value === "string") return <>{value}</>;
  return value ? (
    <>
      <span aria-hidden="true">&#10003;</span>
      <span className="sr-only">{INCLUDED}</span>
    </>
  ) : (
    <>
      <span aria-hidden="true">&#8212;</span>
      <span className="sr-only">{NOT_INCLUDED}</span>
    </>
  );
}

export default function PricingPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO. */}
        <section className="mx-auto max-w-[1200px] px-8 pt-4 pb-9 md:pt-7 md:pb-12">
          <nav aria-label="Breadcrumb">
            <ol className="text-ink-subtle flex flex-wrap items-center gap-3 text-[13px]">
              <li>
                <a href="/" className="hover:text-accent">
                  Home
                </a>
              </li>
              <li aria-hidden="true" className="text-ink-faint">
                /
              </li>
              <li aria-current="page">Pricing</li>
            </ol>
          </nav>

          <div className="mt-9 max-w-[760px]">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {HERO_EYEBROW}
            </span>
            <h1 className="font-display text-ink mt-2.5 text-[36px] leading-[1.06] font-bold tracking-[-0.04em] md:text-[42px] lg:text-[48px]">
              {HERO_HEADING_TOP}
              <br />
              <span className="brand-gradient-text">{HERO_HEADING_BOTTOM}</span>
            </h1>
            <p className="text-ink-muted mt-6 max-w-[520px] text-base leading-[1.65] md:text-[17px]">
              {HERO_LEAD}
            </p>
          </div>

          {/* The currency and the term, stated before any number appears. */}
          <dl className="border-line bg-surface-subtle mt-8 grid gap-5 rounded-lg border p-5 md:grid-cols-2 md:p-6">
            <div className="min-w-0">
              <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                Currency
              </dt>
              <dd className="text-ink-muted mt-2 text-[13px] leading-[1.65]">{CURRENCY_NOTE}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                Billing term
              </dt>
              <dd className="text-ink-muted mt-2 text-[13px] leading-[1.65]">{TERM_NOTE}</dd>
            </div>
          </dl>
        </section>

        {/* The in-page anchors. A scroller on a phone, so the five never wrap into a stack. */}
        <nav aria-label="On this page" className="border-line-soft border-y">
          <ul className="mx-auto flex max-w-[1200px] gap-6 overflow-x-auto px-8 py-4 whitespace-nowrap md:justify-center md:gap-10">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-ink-muted hover:text-accent text-[13px]">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* THE FOUR SELF-SERVE TIERS. Prices come from PLAN_DISPLAY; see the module note. */}
        <section
          id="plans"
          aria-labelledby="plans-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-16"
        >
          <h2 id="plans-heading" className="sr-only">
            Plans
          </h2>

          <ul className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 md:grid-cols-4 md:gap-6">
            {TIERS.map((tier) => (
              <li
                key={tier.id}
                className={`bg-surface relative flex flex-col rounded-lg border px-5 py-6 ${
                  tier.popular
                    ? "border-accent shadow-[0_0_0_3px] shadow-surface-inset"
                    : "border-line"
                }`}
              >
                {tier.popular ? (
                  <span className="bg-accent text-ink-on-accent absolute top-3 right-2.5 rounded-full px-[7px] py-[3px] text-[10px] font-bold">
                    {POPULAR_BADGE}
                  </span>
                ) : null}

                <h3 className="text-ink text-sm font-bold">{tier.name}</h3>

                <p className="my-1 whitespace-nowrap">
                  <strong className="font-display text-ink text-[36px] leading-[1.1] font-bold tracking-[-0.04em]">
                    {tier.monthly}
                  </strong>{" "}
                  <span className="text-ink-subtle text-xs">{PER_MONTH}</span>
                </p>

                {/* The annual figure, printed rather than switched to. */}
                <p className="text-ink-subtle mb-3 flex min-h-[22px] flex-wrap items-center gap-1.5 text-xs">
                  {tier.yearly ? (
                    <>
                      {tier.yearly}
                      <span className="bg-surface-inset text-accent rounded-full px-[7px] py-[3px] text-[10px] font-bold">
                        {YEARLY_SAVING}
                      </span>
                    </>
                  ) : null}
                </p>

                <p className="text-ink-muted mb-5 text-[13px] leading-[1.55]">{tier.summary}</p>

                <ul className="mb-7 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="text-ink-muted my-2 flex gap-2 text-[13px]">
                      <span className="text-brand-mint font-bold" aria-hidden="true">
                        &#10003;
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Four identical labels in a row are ambiguous read on their own, so each one
                    names its plan to assistive tech while the visible label stays the design's. */}
                <a
                  href="/billing"
                  aria-label={`${CTA_LABEL} — ${tier.name}`}
                  className={`flex w-full ${
                    tier.popular
                      ? "bg-accent text-ink-on-accent hover:bg-accent-hover min-h-[46px] items-center justify-center rounded-md border border-transparent px-[22px] text-xs font-bold transition-colors"
                      : "bg-surface text-accent border-line hover:bg-surface-subtle min-h-[46px] items-center justify-center rounded-md border px-[22px] text-xs font-bold transition-colors"
                  }`}
                >
                  {CTA_LABEL}
                </a>
              </li>
            ))}
          </ul>

          {/* THE FIFTH TIER. A panel rather than a fifth card: it has no price to line up with the
              other four, and squeezing five cards across would shrink all of them to fit one. */}
          <div
            id="enterprise"
            className="bg-surface-inset mt-6 rounded-xl p-6 md:mt-8 md:p-10"
            aria-labelledby="enterprise-heading"
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-12">
              <div className="min-w-0">
                <span className="text-ink-faint block text-[11px] font-bold tracking-[0.12em] uppercase">
                  {ENTERPRISE_EYEBROW}
                </span>
                <h3
                  id="enterprise-heading"
                  className="font-display text-ink mt-2.5 text-[28px] leading-[1.16] font-bold tracking-[-0.03em] md:text-[32px]"
                >
                  {ENTERPRISE_NAME}
                </h3>
                <p className="font-display text-ink mt-2 text-[28px] leading-[1.1] font-bold tracking-[-0.03em]">
                  {ENTERPRISE_PRICE}
                </p>
                <p className="text-ink-muted mt-4 text-[15px] leading-[1.7]">{ENTERPRISE_LEAD}</p>
                <a
                  href={`mailto:${brand.supportEmail}`}
                  className={`${PRIMARY_BUTTON} mt-6`}
                  aria-label={`${ENTERPRISE_CTA} — ${ENTERPRISE_NAME}`}
                >
                  {ENTERPRISE_CTA}
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </div>

              <div className="min-w-0">
                <dl className="border-line-soft border-t">
                  {ENTERPRISE_POINTS.map((point) => (
                    <div
                      key={point.title}
                      className="border-line-soft grid gap-1.5 border-b py-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-6"
                    >
                      <dt className="text-ink text-sm font-bold">{point.title}</dt>
                      <dd className="text-ink-muted text-[13px] leading-[1.65]">{point.body}</dd>
                    </div>
                  ))}
                </dl>

                {/* Said out loud rather than left to be assumed. */}
                <p className="border-line text-ink-subtle mt-5 rounded-lg border border-dashed px-5 py-5 text-[13px] leading-[1.7]">
                  {ENTERPRISE_NOT_INCLUDED}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* THE MATRIX. The one element allowed past the body's width, inside its own scroller. The
            row headers stay pinned to the left edge while the five columns scroll, so a cell on a
            phone never loses the name of the row it belongs to. */}
        <section
          id="compare"
          aria-labelledby="compare-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mb-8 max-w-[760px] md:mb-10">
              <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
                {COMPARE_EYEBROW}
              </span>
              <h2
                id="compare-heading"
                className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
              >
                {COMPARE_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {COMPARE_LEAD}
              </p>
            </div>

            <div className="border-line bg-surface overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[780px] border-collapse text-center text-[13px]">
                <caption className="bg-surface-subtle text-ink px-5 py-[18px] text-left font-bold">
                  {COMPARE_CAPTION}
                </caption>
                <thead>
                  <tr>
                    {MATRIX_HEAD.map((heading, index) => (
                      <th
                        key={heading}
                        scope="col"
                        className={`border-line text-ink border-b px-4 py-[13px] font-bold ${
                          index === 0
                            ? "bg-surface sticky left-0 z-10 min-w-[220px] text-left"
                            : "text-center"
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                {MATRIX.map((section) => (
                  <tbody key={section.group}>
                    <tr>
                      {/* One group heading spanning the table, announced as the heading of the
                          rows beneath it rather than as a stray cell. */}
                      <th
                        scope="colgroup"
                        colSpan={MATRIX_HEAD.length}
                        className="bg-surface-subtle border-line-soft text-ink-subtle border-y px-4 py-2.5 text-left text-[11px] font-bold tracking-[0.08em] uppercase"
                      >
                        {section.group}
                      </th>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label}>
                        <th
                          scope="row"
                          className="border-line-soft text-ink-muted bg-surface sticky left-0 z-10 border-b px-4 py-[13px] text-left font-normal"
                        >
                          {row.label}
                        </th>
                        {row.cells.map((cell, index) => (
                          <td
                            key={`${row.label}-${MATRIX_HEAD[index + 1] ?? index}`}
                            className={`border-line-soft border-b px-4 py-[13px] ${
                              cell === true ? "text-accent font-bold" : "text-ink-subtle"
                            }`}
                          >
                            <MatrixCell value={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>

            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {[MATRIX_NOTE_LIMITS, MATRIX_NOTE_REGION].map((note) => (
                <li
                  key={note}
                  className="border-line bg-surface text-ink-subtle rounded-lg border px-5 py-4 text-xs leading-[1.7]"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* WHAT HOLDS ON EVERY PLAN. Every body here is an approved claim, resolved by id. */}
        <section
          id="every-plan"
          aria-labelledby="every-plan-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {EVERY_PLAN_EYEBROW}
            </span>
            <h2
              id="every-plan-heading"
              className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
            >
              {EVERY_PLAN_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {EVERY_PLAN_LEAD}
            </p>
          </div>

          <ul className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {EVERY_PLAN_CARDS.map((card) => (
              <li
                key={card.title}
                className="border-line bg-surface flex flex-col rounded-lg border p-6"
              >
                <h3 className="font-display text-ink mb-3 text-lg leading-[1.3] font-bold tracking-[-0.01em]">
                  {card.title}
                </h3>
                <p className="text-ink-muted flex-1 text-[14px] leading-[1.7]">{card.body}</p>
              </li>
            ))}
          </ul>

          <p className="bg-surface-inset text-ink-muted mt-6 rounded-lg p-6 text-[15px] leading-[1.7]">
            {MATRIX_NOTE_REGION}
          </p>
        </section>

        {/* BILLING QUESTIONS. Native <details>, which already owns the disclosure semantics and
            keyboard behaviour, so no script is involved. */}
        <section
          id="billing-faq"
          aria-labelledby="billing-faq-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto grid max-w-[1200px] items-start gap-8 px-8 py-12 md:grid-cols-2 md:gap-10 md:py-20 lg:gap-20">
            <div className="min-w-0">
              <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
                {FAQ_EYEBROW}
              </span>
              <h2
                id="billing-faq-heading"
                className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-bold tracking-[-0.03em] md:text-[36px]"
              >
                {FAQ_HEADING_TOP}
                <br />
                {FAQ_HEADING_BOTTOM}
              </h2>
              <a
                href="/billing"
                className="text-accent mt-6 inline-flex items-center gap-3 text-sm font-bold hover:underline"
              >
                {FAQ_LINK_LABEL}
                <span aria-hidden="true">&rarr;</span>
              </a>
            </div>

            <div className="min-w-0">
              {FAQS.map((item) => (
                <details key={item.question} className="group border-line border-b py-[18px]">
                  <summary className="text-ink flex cursor-pointer list-none justify-between gap-5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                    {item.question}
                    {/* Hidden from assistive tech: <details> already announces its state. */}
                    <span aria-hidden="true" className="text-ink-subtle shrink-0 leading-[1.5]">
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:inline">&#8722;</span>
                    </span>
                  </summary>
                  <p className="text-ink-muted mt-3.5 text-sm leading-[1.65]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* THE OPEN TERMS. A heading with "not set" under it is more use to a reader than a
            plausible default, and far more use to their lawyer. */}
        <section
          id="open-terms"
          aria-labelledby="open-terms-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mb-8 max-w-[760px] md:mb-10">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {OPEN_EYEBROW}
            </span>
            <h2
              id="open-terms-heading"
              className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
            >
              {OPEN_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {OPEN_LEAD}
            </p>
          </div>

          <dl className="border-line-soft grid border-t md:grid-cols-2">
            {OPEN_TERMS.map((term) => (
              <div
                key={term.title}
                className="border-line-soft border-b py-5 md:px-6 md:first:pl-0"
              >
                <dt className="text-ink text-sm font-bold">{term.title}</dt>
                <dd className="text-ink-muted mt-2 text-[13px] leading-[1.7]">{term.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* THE IMPRINT BLOCK. Every value comes from the brand package, which is the one place any
            of them is written. */}
        <section
          aria-labelledby="imprint-heading"
          className="mx-auto max-w-[1200px] px-8 pb-12 md:pb-16"
        >
          <div className="border-line bg-surface rounded-lg border p-6 md:p-8">
            <h2
              id="imprint-heading"
              className="font-display text-ink text-xl leading-[1.3] font-bold tracking-[-0.01em]"
            >
              {IMPRINT_HEADING}
            </h2>
            <p className="text-ink-muted mt-3 max-w-[620px] text-[13px] leading-[1.7]">
              {IMPRINT_NOTE}
            </p>

            <dl className="text-ink-muted mt-6 grid gap-5 text-[13px] md:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                  Legal entity
                </dt>
                <dd className="text-ink mt-2 font-bold">{brand.legalEntity}</dd>
                {/* A registration number is an identifier, not a sentence. */}
                <dd className="mt-1">Company registration {brand.companyRegistration}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                  Registered address
                </dt>
                <dd className="mt-2">{formatAddress()}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                  {IMPRINT_CONTACT_LABEL}
                </dt>
                <dd className="mt-2">
                  <a
                    className="text-accent underline-offset-4 hover:underline"
                    href={`mailto:${brand.supportEmail}`}
                  >
                    {brand.supportEmail}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* THE CLOSING PANEL, on the inverse surface. */}
        <section
          aria-labelledby="final-cta-heading"
          className="mx-auto max-w-[1200px] px-8 pb-12 md:pb-[70px]"
        >
          <div className="bg-surface-inverse flex flex-col gap-6 rounded-xl p-8 md:flex-row md:items-center md:justify-between md:p-12">
            <div className="min-w-0">
              <h2
                id="final-cta-heading"
                className="font-display text-ink-on-inverse mb-2.5 text-[28px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[30px]"
              >
                {FINAL_HEADING}
              </h2>
              <p className="text-ink-on-inverse leading-[1.65]">{FINAL_LEAD}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a href="/dashboard" className={SECONDARY_BUTTON}>
                {FINAL_CTA}
                <span aria-hidden="true" className="ml-3">
                  &rarr;
                </span>
              </a>
              <a
                href="#compare"
                className="text-accent-on-dark self-center text-sm font-bold hover:underline"
              >
                {COMPARE_CAPTION}
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
