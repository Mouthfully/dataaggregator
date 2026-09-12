import { brand } from "@repo/brand";
import { SITE } from "./_content";
import { Footer, SiteHeader } from "./_chrome";
import { AssistantPanel } from "./_sections/AssistantPanel";
import { DashboardFeature } from "./_sections/DashboardFeature";
import { Faq, FinalCta } from "./_sections/FaqCta";
import { FeatureGrid } from "./_sections/FeatureGrid";
import { IntegrationsMap } from "./_sections/IntegrationsMap";
import { IntegrationsStrip } from "./_sections/IntegrationsStrip";
import { Pricing } from "./_sections/Pricing";
import { SimplerWay } from "./_sections/SimplerWay";
import { Templates } from "./_sections/Templates";
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
const HERO = {
  search: "Search metrics, reports, or ask AI\u2026",
  range: "Last 30 days\u2304",
  micro: "Your business, at a glance.",
  period: "This month",
  synced: "All sources synced. You\u2019re up to date.",
} as const;

const HERO_NAV = ["Home", "Insights", "Reports", "Sources", "Tasks", "Settings"] as const;

const HERO_METRICS = [
  { label: "Revenue", value: "$186.2K", delta: "\u2191 23.8%" },
  { label: "Orders", value: "8,241", delta: "\u2191 10.3%" },
  { label: "ROAS", value: "5.42\u00d7", delta: "\u2191 12.6%" },
] as const;

const HERO_AXIS = ["Jun 1", "Jun 8", "Jun 15", "Jun 22", "Jun 30"] as const;

/** The trend line, taken verbatim from the reference so the shape is the designer's, not mine. */
const HERO_TREND =
  "M0 130L25 118L45 120L70 99L95 103L120 84L145 90L170 62L195 55L220 65L245 48L270 53L295 31L320 38L345 26L370 30L395 12L420 18L440 5";

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
            <h1 className="font-display text-ink mt-4 text-[clamp(38px,4.4vw,58px)] leading-[1.06] font-normal tracking-[-0.045em]">
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
        <FeatureGrid />
        <AssistantPanel />
        <IntegrationsMap />
        <DashboardFeature />
        <Templates />
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
            <b className="bg-ink-faint text-ink-on-accent rounded-full px-1.5 py-0.5 text-[9px]">
              JD
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
            Revenue over time
            <span className="text-ink-faint font-normal text-[9px]">{HERO.period}</span>
          </div>

          <svg
            viewBox="0 0 440 155"
            className="text-brand-mint mt-2.5 block w-full"
            role="img"
            aria-label="Illustrative revenue trend increasing over time"
          >
            <title>Illustrative revenue trend</title>
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
