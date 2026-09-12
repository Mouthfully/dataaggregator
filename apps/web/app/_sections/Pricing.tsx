/**
 * THE PRICING SECTION -- the reference's `<section id="pricing" class="section container pricing">`,
 * headed "Simple, transparent pricing." The header and footer nav both link to `/#pricing`, so the
 * id is load-bearing rather than decorative: without it three links in the chrome scroll nowhere.
 *
 * THE BILLING TOGGLE IS A DISPLAY, NOT A CONTROL -- read this before "fixing" it.
 * The reference ships two <button>s and a script that rewrites each price when you switch. That
 * script is not in the supplied page set (only index.html, styles.css, extended.css and the brand
 * guide were delivered), so the yearly figures do not exist anywhere in the design. The brief's
 * rule is that pricing is taken verbatim and never invented, and a yearly figure for $19 is a
 * number I would be making up, not reading. So this section renders MONTHLY ONLY and the pill is a
 * static segmented indicator: two spans, no <button>, no href, no hover state, no pointer cursor,
 * nothing focusable. It states which period the prices below are quoted in and that a yearly term
 * costs ten months rather than twelve -- both true -- and the `.billing-note` underneath repeats
 * the period in words. A dead
 * <button> that swallows a click would be the misleading version; this is the honest one. When the
 * yearly figures arrive, this becomes a "use client" component with useState over a second price
 * field, and nothing else about the file changes.
 *
 * THE "MOST POPULAR" CARD is marked with the accent border plus a 3px halo in the pale-blue inset
 * token, which is the reference's own treatment (a tinted border and a barely-there ring) expressed
 * in the two tokens that already carry those roles. Tailwind splits a shadow into geometry and
 * colour, so `shadow-[0_0_0_3px]` sets the ring and `shadow-surface-inset` fills it -- which means
 * the halo follows the palette into dark mode instead of being frozen at a light-mode value.
 *
 * COMPARISON TABLE. The reference puts one inside this same section, so it is here. It is the one
 * element allowed to be wider than the body, inside its own horizontal scroller, per the brief's
 * responsive rule.
 *
 * WHAT THE CARDS AND THE TABLE MAY SAY, AND WHY THERE IS SO LITTLE OF IT.
 *
 * The reference's per-tier bullet lists sold a refresh cadence (Daily / Hourly / 15 min / 5 min),
 * custom reports, AI insights, task management, team collaboration, white-label reports, API access
 * and a support tier. None of those is gated on a plan anywhere in this repository -- no migration
 * has a cadence column and none gates a feature on a subscription -- so every one of them was a
 * promise the product could not keep, and they are deleted rather than reworded. A vaguer version
 * of an unbacked claim is still unbacked and is harder to find later.
 *
 * WHAT SURVIVES IS THE CONNECTION ALLOWANCE, AND IT IS NO LONGER TYPED HERE. `PLAN_ENTITLEMENTS`
 * in `app/_billing/entitlements.ts` holds the four figures once; `connectionAllowance` in
 * `app/_content.ts` turns one into the phrase a card prints. So this section and `/pricing` cannot
 * disagree with each other or with the catalogue, and the word is "connected accounts" rather than
 * "connectors" -- five connectors exist, and "200+ connectors" claimed a library, not a limit.
 */

import { PLAN_ENTITLEMENTS, formatAllowance } from "../_billing/entitlements";
import type { Plan } from "../_billing/plans";
import { connectionAllowance } from "../_content";

/** Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line
 *  arrives from here. The eyebrow is stored in sentence case because the capitals are CSS. */
const EYEBROW = "Pricing";
const HEADING = "Simple, transparent pricing.";
/** "All plans include unlimited dashboards" was here. There is no dashboard entity in any migration
 *  to count, let alone to promise an unlimited number of, so the clause is gone rather than hedged. */
const LEAD = "Start free and scale as you grow.";

/** The `.billing-note` under the cards. It names the period the pill indicates, in words. */
const BILLING_NOTE = "Monthly billing. Upgrade anytime.";

/** The pill's two halves and its saving chip, verbatim from the reference. */
const BILLING = {
  active: "Monthly",
  alternate: "Yearly",
  saving: "2 months free",
  /** Read by assistive tech in place of the visual pill, which is two bare spans. */
  label: "Prices shown are per month. A yearly term costs ten months rather than twelve.",
} as const;

const CTA_LABEL = "Get started";

/**
 * The four tiers, in the reference's order. Names, prices, periods and one-line summaries are
 * transcribed from the reference HTML and not adjusted -- including the Free tier's $0, which is a
 * price like any other.
 *
 * The plan id is here so the card can ask the entitlement record what the plan allows instead of
 * carrying a transcribed bullet list of its own; see the module comment for what those bullets said
 * and why they are gone.
 */
const PLANS = [
  {
    plan: "free",
    name: "Free",
    price: "$0",
    period: "/ month",
    summary: "Get started and explore.",
    popular: false,
  },
  {
    plan: "starter",
    name: "Starter",
    price: "$19",
    period: "/ month",
    summary: "For individuals and small teams.",
    popular: false,
  },
  {
    plan: "growth",
    name: "Growth",
    price: "$49",
    period: "/ month",
    summary: "For growing businesses.",
    popular: true,
  },
  {
    plan: "agency",
    name: "Agency",
    price: "$99",
    period: "/ month",
    summary: "For larger teams and clients.",
    popular: false,
  },
] as const satisfies ReadonlyArray<{
  /** A plan id the entitlement record knows, so a typo is a build failure and not a blank card. */
  plan: Plan;
  name: string;
  price: string;
  period: string;
  summary: string;
  popular: boolean;
}>;

/**
 * One bullet, because the entitlement record publishes exactly one thing a plan changes.
 *
 * A list rather than a bare string so a second entitlement -- a workspace or member cap, if either
 * is ever decided -- is added here and appears on all four cards at once.
 */
function planFeatures(plan: Plan): readonly string[] {
  return [connectionAllowance(plan)];
}

const POPULAR_BADGE = "Most popular";

/**
 * The comparison rows. `true` renders the tick, `false` the em dash, and a string renders itself --
 * which keeps a count row and a yes/no row in one table rather than in two shapes that have to be
 * kept in step by hand.
 *
 * ONE ROW, BECAUSE ONE ROW IS WHAT THIS REPOSITORY CAN SAY. The reference's other seven rows --
 * data refresh, custom reports, advanced AI insights, team collaboration, white-label reports, API
 * access and priority support -- each claimed that paying more switches something on. Nothing in
 * any migration reads a plan before doing work, so none of the seven could be kept and none is
 * reworded into a softer version of itself. The table is left standing with the row that is true so
 * a row that becomes true later has somewhere to go.
 *
 * The cells are read from the entitlement record rather than typed, so this table cannot disagree
 * with the cards above it.
 */
const COMPARISON_CAPTION = "Compare plans";
const COMPARISON_HEAD = ["What's included", "Free", "Starter", "Growth", "Agency"] as const;

/**
 * Widened rather than `as const`: with one string row left, an inferred literal type would narrow
 * `cell` to `string` and the tick and dash branches below would stop compiling -- which would mean
 * restoring a boolean row later required rewriting the renderer as well as the data.
 */
const COMPARISON_ROWS: ReadonlyArray<{
  label: string;
  cells: readonly (string | boolean)[];
}> = [
  {
    label: "Connected accounts",
    cells: [
      formatAllowance(PLAN_ENTITLEMENTS.free.connections),
      formatAllowance(PLAN_ENTITLEMENTS.starter.connections),
      formatAllowance(PLAN_ENTITLEMENTS.growth.connections),
      formatAllowance(PLAN_ENTITLEMENTS.agency.connections),
    ],
  },
];

/** The two glyph labels the table cells announce. A bare tick or dash says nothing out loud, and
 *  a `aria-label` on a role-less <span> is not guaranteed to be read, so the glyph is hidden and
 *  the word sits beside it off-screen. */
const INCLUDED = "Included";
const NOT_INCLUDED = "Not included";

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
      <div className="text-center">
        <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
          {EYEBROW}
        </span>
        <h2 className="font-display text-ink mt-2.5 text-[28px] leading-[1.16] font-normal tracking-[-0.03em] md:text-[36px]">
          {HEADING}
        </h2>
        <p className="text-ink-muted mx-auto mt-3 max-w-[520px] text-sm leading-[1.65]">{LEAD}</p>

        {/* Not a control. See the module comment: two spans, nothing focusable, nothing to click.
            The visual pill is hidden from assistive tech and replaced by one spoken sentence,
            because "Monthly Yearly 2 months free" read out of a group conveys the opposite of the truth. */}
        <div className="mt-6 mb-7 flex justify-center">
          <span className="sr-only">{BILLING.label}</span>
          <div
            aria-hidden="true"
            className="bg-surface-subtle inline-flex items-center gap-1.5 rounded-full p-1 text-[13px]"
          >
            <span className="bg-surface text-accent rounded-full px-[18px] py-2 font-bold">
              {BILLING.active}
            </span>
            <span className="text-ink-subtle flex items-center gap-1.5 rounded-full px-[18px] py-2">
              {BILLING.alternate}
              <span className="bg-surface-inset text-accent rounded-full px-[7px] py-[3px] text-[10px] font-bold">
                {BILLING.saving}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Four across from 768px, the reference's own step; two below that; one below 390px, where
          four 13px feature lists in two columns would wrap every line. */}
      <ul className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 md:grid-cols-4 md:gap-6">
        {PLANS.map((plan) => (
          <li
            key={plan.name}
            className={`bg-surface relative flex flex-col rounded-lg border px-5 py-6 ${
              plan.popular ? "border-accent shadow-[0_0_0_3px] shadow-surface-inset" : "border-line"
            }`}
          >
            {plan.popular ? (
              <span className="bg-accent text-ink-on-accent absolute top-3 right-2.5 rounded-full px-[7px] py-[3px] text-[10px] font-bold">
                {POPULAR_BADGE}
              </span>
            ) : null}

            <h3 className="text-ink text-sm font-bold">{plan.name}</h3>

            <p className="my-1 whitespace-nowrap">
              <strong className="font-display text-ink text-[36px] leading-[1.1] font-normal tracking-[-0.04em]">
                {plan.price}
              </strong>{" "}
              <span className="text-ink-subtle text-xs">{plan.period}</span>
            </p>

            <p className="text-ink-muted mb-5 text-[13px] leading-[1.55]">{plan.summary}</p>

            <ul className="mb-7 flex-1">
              {planFeatures(plan.plan).map((feature) => (
                <li key={feature} className="text-ink-muted my-2 flex gap-2 text-[13px]">
                  <span className="text-brand-mint font-bold" aria-hidden="true">
                    &#10003;
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Four identical "Get started" labels in a row are ambiguous read on their own, so
                each one names its plan to assistive tech while the visible label stays the
                design's. */}
            <a
              href="#start"
              aria-label={`${CTA_LABEL} — ${plan.name}`}
              className={`flex min-h-[46px] w-full items-center justify-center rounded-md border px-[22px] text-xs font-bold transition-colors ${
                plan.popular
                  ? "bg-accent text-ink-on-accent hover:bg-accent-hover border-transparent"
                  : "bg-surface text-accent border-line hover:bg-surface-subtle"
              }`}
            >
              {CTA_LABEL}
            </a>
          </li>
        ))}
      </ul>

      <p className="text-ink-subtle mt-4 text-center text-xs">{BILLING_NOTE}</p>

      {/* The one element allowed past the body's width, and only inside its own scroller. */}
      <div className="border-line mt-8 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[650px] border-collapse text-center text-[13px]">
          <caption className="bg-surface-subtle text-ink px-5 py-[18px] text-left font-bold">
            {COMPARISON_CAPTION}
          </caption>
          <thead>
            <tr>
              {COMPARISON_HEAD.map((heading, index) => (
                <th
                  key={heading}
                  scope="col"
                  className={`border-line-soft text-ink border-b px-[18px] py-[13px] font-bold ${
                    index === 0 ? "text-left" : "text-center"
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, rowIndex) => {
              const edge =
                rowIndex === COMPARISON_ROWS.length - 1 ? "" : "border-line-soft border-b";
              return (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className={`text-ink-muted px-[18px] py-[13px] text-left font-normal ${edge}`}
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={COMPARISON_HEAD[cellIndex + 1]}
                      className={`px-[18px] py-[13px] ${edge} ${
                        cell === true ? "text-accent font-bold" : "text-ink-subtle"
                      }`}
                    >
                      {typeof cell === "string" ? (
                        cell
                      ) : cell ? (
                        <>
                          <span aria-hidden="true">&#10003;</span>
                          <span className="sr-only">{INCLUDED}</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true">&#8212;</span>
                          <span className="sr-only">{NOT_INCLUDED}</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
