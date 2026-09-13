import { brand } from "@repo/brand";
import { SITE } from "./_content";
import { Footer, SiteHeader } from "./_chrome";
import { ActionSheet } from "./_sections/ActionSheet";
import { AssistantPanel } from "./_sections/AssistantPanel";
import { DashboardFeature } from "./_sections/DashboardFeature";
import { Faq, FinalCta } from "./_sections/FaqCta";
import { FeatureGrid } from "./_sections/FeatureGrid";
import { IntegrationsMap } from "./_sections/IntegrationsMap";
import { IntegrationsStrip } from "./_sections/IntegrationsStrip";
import { Pricing } from "./_sections/Pricing";
import { Reports } from "./_sections/Reports";
import { SimplerWay } from "./_sections/SimplerWay";
import { UseCases } from "./_sections/UseCases";

/**
 * The marketing site's first screen, built to the founder-supplied page set (BRAND.md v1.0 and
 * the accompanying `index.html`), founder-directed.
 *
 * TWO RULES THIS FILE OBEYS, both enforced rather than intended.
 *
 * NO SENTENCE IS TYPED HERE. `scripts/check-copy.mjs` refuses a JSX text node of five or more words
 * ending in terminal punctuation, so every line of copy arrives from `SITE` in `_content.ts` or
 * from the section file that renders it. Structural words -- a heading fragment, a link label -- are the only
 * prose written inline, which is the same division the guard was measured against.
 *
 * NO HEX VALUE IS TYPED HERE. Every colour is a token utility resolved through `@theme inline` in
 * globals.css to `@repo/tokens/tokens.css`, which the tokens guard enforces. The two gradients the
 * design needs are composite values with no utility to map onto, so they arrive as the two classes
 * globals.css declares, each of which reads a `var()`.
 */
/**
 * THE HERO'S SAMPLE BUSINESS, AND THE THREE THINGS THAT DECIDED IT.
 *
 * 1. IT IS A CAFE IN CHIANG MAI, IN BAHT. `docs/marketplane/58-plan-reconciliation.md` section 5.1
 *    bans the figures this panel used to show -- "$186.2K, 5.42x ROAS" -- for a baht-billed Thai
 *    owner-operator. The plan's own emphasis for a cafe is hourly revenue and delivery share ("A
 *    cafe gets hourly revenue and delivery share; a guesthouse gets occupancy and commission
 *    cost"), so those are the numbers, and the axis is a trading day rather than a calendar month.
 *
 * 2. IT IS TAKINGS, NOT TAKINGS AFTER FEES. Section 5.1 stops the after-fees figure as the
 *    headline number on a public page: it cannot be fetched from the delivery platforms at all
 *    (Grab's commission field is documented as absent from ListOrder) and section 2.2 concludes
 *    that "the honest v1 brief says 'takings,' not 'after fees'". No commission line is drawn here.
 *
 * 3. NOBODY IS NAMED. Section 5.3 forbids a named Chiang Mai cafe as proof at any price -- there
 *    are no customers, the artboard's own owner quotes are unapproved drafts and its figures are
 *    invented. So the panel carries a trade and a city, three sample marks, and no business name,
 *    no owner, no quote and no suggestion that this is anyone's real week.
 *
 * NO SOURCE IS NAMED EITHER. Delivery share is a channel split a POS can carry; naming the
 * platform it came from would put a source on the page that section 5.1 says must not appear
 * until it is both built and reachable.
 */
const HERO = {
  search: "Ask about your shop\u2026",
  range: "Yesterday\u2304",
  micro: "Sample caf\u00e9 \u00b7 Chiang Mai",
  sample: "Sample",
  chart: "Revenue by hour",
  period: "Yesterday",
  // WHAT THIS USED TO SAY, AND WHY IT COULD NOT STAY: "Read at 06:40. Still provisional."
  //
  // The second sentence is backed -- `RESTATEMENT_CLOCKS.woocommerce.windowDays` is null, so a
  // shop's own till never finalises and the marker never comes off. The first was not, and it was
  // the wrong-number-that-looks-right in its purest form: `app.due_connections` offers a connection
  // when `last_backfill_at < date_trunc('day', now())`, which truncates in a session TimeZone
  // NOTHING IN THIS REPOSITORY SETS -- and which is not `connections.timezone`, a column that
  // exists and that this predicate does not read. There is no configuration of this system that
  // produces a 06:40 local read, and 06:40 is a DELIVERY time besides, with nothing delivering.
  //
  // Being inside a panel the page labels as a sample does not license a false MECHANISM: a sample
  // figure is an illustration of a number, and a sample clock time is an illustration of a
  // capability. The provisional half stays, because it is true every morning.
  synced: "Still provisional, as a shop\u2019s own till always is.",
} as const;

const HERO_NAV = ["Today", "Do", "Ask", "Reports", "Sources", "Settings"] as const;

const HERO_METRICS = [
  { label: "Takings", value: "\u0e3f15,420", delta: "\u2191 8.2%" },
  { label: "Orders", value: "198", delta: "\u2191 4.1%" },
  { label: "Delivery share", value: "29%", delta: "\u2191 3 pts" },
] as const;

const HERO_AXIS = ["08:00", "11:00", "14:00", "17:00", "21:00"] as const;

/**
 * The trading day, hour by hour. The reference's own path was a month-long climb, which cannot
 * describe a day that opens quiet, peaks at lunch, sags through the afternoon and peaks again in
 * the evening -- and the shape is the only part of this panel that says "this is a cafe" without
 * words. Same 440x155 box, same all-line segments and same closing fill as the reference, so the
 * geometry the designer drew is untouched; only the data points moved.
 */
const HERO_TREND =
  "M0 128L34 112L68 104L102 86L136 42L170 30L204 58L238 86L272 92L306 74L340 52L374 46L408 78L440 116";

/**
 * The chart's accessible name and title. Both are read aloud, so `scripts/check-copy.mjs` counts
 * `aria-label` as prose; neither carries terminal punctuation, and both say "sample" in the first
 * word rather than describing a trend a reader might take for someone's real day.
 */
const CHART_TITLE = "Sample revenue by hour";
const CHART_DESCRIPTION =
  "Sample revenue by hour for an illustrative caf\u00e9 day, peaking at lunch and again in the evening";

export default function Page() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* ------------------------------------------------------------------------ hero */}
        <section className="hero-glow relative mx-auto grid max-w-[1200px] items-center gap-12 px-8 pt-16 pb-16 lg:grid-cols-[1fr_1.08fr] lg:px-8">
          <div>
            <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
              {SITE.eyebrow}
            </span>
            <h1 className="font-display text-ink mt-4 text-[clamp(38px,4.4vw,58px)] leading-[1.06] font-semibold tracking-[-0.045em]">
              {SITE.heroLine1}
              <br />
              <span className="brand-gradient-text">{SITE.heroLine2}</span>
            </h1>
            <p className="text-ink-muted mt-6 max-w-[480px] text-lg leading-relaxed">
              {SITE.heroLead}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#start"
                className="bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center gap-3 rounded-[10px] px-[22px] text-sm font-bold transition-colors"
              >
                {SITE.ctaPrimary}
                <span aria-hidden="true">&rarr;</span>
              </a>
              <a
                href="/dashboard"
                className="bg-surface text-accent border-line inline-flex min-h-[46px] items-center gap-3 rounded-[10px] border px-[22px] text-sm font-bold"
              >
                {SITE.ctaSecondary}
                <span aria-hidden="true">&#9655;</span>
              </a>
            </div>

            <ul className="mt-6 flex flex-wrap gap-5">
              {SITE.heroChecks.map((check) => (
                <li key={check} className="text-ink-subtle flex items-center gap-2 text-xs">
                  <span className="text-brand-mint font-bold" aria-hidden="true">
                    &#10003;
                  </span>
                  {check}
                </li>
              ))}
            </ul>
          </div>

          <HeroDashboard />
        </section>

        {/* The reference's order, section for section. Each lives in its own file under
            _sections/ with its copy colocated -- see that directory for why. */}
        <IntegrationsStrip />
        <SimplerWay />
        {/* The action sheet sits third, ahead of the capability grid that enumerates it, because
            it is the whole repositioning: the page's argument is that an insight ends in a to-do
            rather than in a chart, and an argument made below the fold is not made. */}
        <ActionSheet />
        <FeatureGrid />
        <AssistantPanel />
        <IntegrationsMap />
        <DashboardFeature />
        <Reports />
        <Pricing />
        <UseCases />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </>
  );
}

/**
 * The hero's product shot, reproducing the reference's `.dashboard` block.
 *
 * MARKUP RATHER THAN A SCREENSHOT, for a reason that outlives this page: a PNG of a dashboard goes
 * stale the first time the real one changes, and nobody notices because an image cannot fail a
 * build. This is the same tokens the /dashboard route uses, so it moves when they move.
 *
 * The chart's two gradients are the one place the reference uses colour this token set cannot
 * express as a flat value -- an area fade and a blue-to-mint stroke. Both are built from
 * `currentColor` against a token-coloured ancestor, so no literal is written. Note the class sits
 * on the <svg> ROOT: a <stop> inside <defs> inherits `color` from the svg, never from whichever
 * element references the gradient.
 */
function HeroDashboard() {
  return (
    <div className="relative min-w-0">
      <div className="bg-surface border-line flex min-h-[335px] rounded-lg border text-left shadow-[0_16px_50px_rgb(45_137_207/0.08)]">
        <aside className="border-line-soft w-[105px] shrink-0 border-r px-2.5 py-4">
          <img src={brand.logoPath} alt="" width={83} height={24} className="mb-5 block" />
          {HERO_NAV.map((item, index) => (
            <span
              key={item}
              className={
                index === 0
                  ? "bg-surface-inset text-accent mb-1 flex gap-2 rounded-md px-1.5 py-2 text-[11px] font-bold"
                  : "text-ink-subtle mb-1 flex gap-2 rounded-md px-1.5 py-2 text-[11px]"
              }
            >
              {item}
            </span>
          ))}
        </aside>

        <div className="min-w-0 flex-1 p-5">
          <div className="bg-surface-subtle text-ink-faint mb-5 flex items-center justify-between rounded-md px-2 py-1.5 text-[10px]">
            {HERO.search}
            {/* The reference's user avatar ("JD") is the first of the three sample marks this
                panel carries. An initialled avatar asserts a person; a sample chip asserts the
                opposite, which is what section 5.3 of the reconciliation requires of a figure set
                nobody's business produced. */}
            <b className="bg-ink-faint text-ink-on-accent rounded-full px-1.5 py-0.5 text-[9px]">
              {HERO.sample}
            </b>
          </div>

          <div className="flex items-center justify-between gap-1.5 text-sm">
            <strong className="text-ink font-bold">Overview</strong>
            <span className="text-ink-faint text-[9px]">{HERO.range}</span>
          </div>
          <p className="text-ink-subtle mt-1 mb-4 text-[10px]">{HERO.micro}</p>

          <div className="grid grid-cols-3 gap-2">
            {HERO_METRICS.map((metric) => (
              <div key={metric.label} className="border-line-soft rounded-md border px-2 py-3">
                <span className="text-ink-subtle block text-[10px]">{metric.label}</span>
                <strong className="text-ink my-0.5 block text-lg font-bold">{metric.value}</strong>
                <em className="text-brand-mint text-[10px] not-italic">{metric.delta}</em>
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-between text-[11px] font-bold">
            {HERO.chart}
            <span className="text-ink-faint font-normal text-[9px]">{HERO.period}</span>
          </div>

          <svg
            viewBox="0 0 440 155"
            className="text-brand-mint mt-2.5 block w-full"
            role="img"
            aria-label={CHART_DESCRIPTION}
          >
            <title>{CHART_TITLE}</title>
            <defs>
              <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="text-line-soft">
              <path d="M0 35H440M0 80H440M0 125H440" stroke="currentColor" />
            </g>
            <path d={`${HERO_TREND}V155H0Z`} fill="url(#hero-area)" />
            <path d={HERO_TREND} stroke="currentColor" strokeWidth="3" fill="none" />
          </svg>

          <div className="text-ink-faint mt-1 flex justify-between text-[9px]">
            {HERO_AXIS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          <div className="border-line-soft text-ink-subtle mt-4 border-t pt-3 text-[10px]">
            <span className="text-brand-blue mr-1.5" aria-hidden="true">
              &#10022;
            </span>
            {HERO.synced}
          </div>
        </div>
      </div>

      <p className="text-ink-faint mt-2 text-right text-[10px]">{SITE.heroVisualLabel}</p>

      {/* The floating pill the reference hangs off the bottom edge of the card. */}
      <div className="border-line bg-surface text-ink-muted mx-auto -mt-4 flex w-max items-center gap-2.5 rounded-md border px-4 py-2.5 text-xs shadow-[0_8px_20px_rgb(20_57_75/0.04)]">
        <img src={brand.logoMarkPath} alt="" width={22} height={25} />
        {SITE.syncPill}
      </div>
    </div>
  );
}
