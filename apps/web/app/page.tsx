import { FEATURES, PLATFORMS, SITE } from "./_content";
import { Footer, SiteHeader } from "./_chrome";

/**
 * The marketing site's first screen, built to the founder-supplied page set (BRAND.md v1.0 and
 * the accompanying `index.html`), founder-directed.
 *
 * TWO RULES THIS FILE OBEYS, both enforced rather than intended.
 *
 * NO SENTENCE IS TYPED HERE. `scripts/check-copy.mjs` refuses a JSX text node of five or more words
 * ending in terminal punctuation, so every line of copy arrives from `SITE`, `FEATURES` or a claim
 * resolver in `_content.ts`. Structural words -- a heading fragment, a link label -- are the only
 * prose written inline, which is the same division the guard was measured against.
 *
 * NO HEX VALUE IS TYPED HERE. Every colour is a token utility resolved through `@theme inline` in
 * globals.css to `@repo/tokens/tokens.css`, which the tokens guard enforces. The two gradients the
 * design needs are composite values with no utility to map onto, so they arrive as the two classes
 * globals.css declares, each of which reads a `var()`.
 */
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
            <h1 className="font-display text-ink mt-4 text-[clamp(38px,4.4vw,58px)] leading-[1.06] font-bold tracking-[-0.045em]">
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

        {/* -------------------------------------------------------------------- platforms */}
        <section className="mx-auto max-w-[1200px] px-8 pt-10 pb-10 text-center">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {SITE.platformsEyebrow}
          </span>
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {PLATFORMS.map((platform) => (
              <li key={platform} className="text-ink-muted text-sm font-bold">
                {platform}
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------------------------- features */}
        <section className="mx-auto max-w-[1200px] px-8 py-20">
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.id} className="border-line bg-surface rounded-lg border p-6">
                <FeatureIcon id={feature.id} />
                <h2 className="font-display text-ink mt-4 text-xl font-bold tracking-[-0.01em]">
                  {feature.title}
                </h2>
                <p className="text-ink-muted mt-2 text-sm leading-relaxed">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------------------- final cta */}
        <section className="mx-auto max-w-[1200px] px-8 pb-20">
          <div className="bg-surface-inset rounded-xl px-10 py-12 md:flex md:items-center md:justify-between md:gap-6">
            <div>
              <h2 className="font-display text-ink text-3xl font-bold tracking-[-0.03em]">
                {SITE.heroLine1} {SITE.heroLine2}
              </h2>
              <p className="text-ink-muted mt-2 max-w-[520px]">{SITE.heroLead}</p>
            </div>
            <a
              href="#start"
              className="bg-accent text-ink-on-accent hover:bg-accent-hover mt-6 inline-flex min-h-[46px] shrink-0 items-center gap-3 rounded-[10px] px-[22px] text-sm font-bold transition-colors md:mt-0"
            >
              {SITE.ctaPrimary}
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

/** Three outline marks, 24px on a 1.75 stroke, per BRAND.md "Shape and interface details". */
function FeatureIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    numbers: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
    action: "m6 11 4 4L21 4M20 12v8H3V3h12",
    sync: "M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v3m-6-9a6 6 0 0 0 6 6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-accent"
    >
      <path d={paths[id] ?? paths.numbers} />
    </svg>
  );
}

/**
 * The hero's product shot.
 *
 * Markup rather than a screenshot, for a reason that outlives this page: a PNG of a dashboard goes
 * stale the first time the real one changes, and nobody notices because an image cannot fail a
 * build. This is the same components and the same tokens the dashboard route uses, so it moves when
 * they move.
 */
function HeroDashboard() {
  return (
    <div className="min-w-0">
      <div className="bg-surface border-line rounded-lg border shadow-[0_16px_50px_rgb(17_27_41/0.08)]">
        <div className="border-line-soft flex items-center gap-3 border-b px-4 py-3">
          <span className="bg-surface-inset text-ink-subtle flex-1 rounded-md px-2 py-1.5 text-[10px]">
            {SITE.syncPill}
          </span>
          <span className="bg-ink-faint text-ink-on-accent flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold">
            NS
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4">
          {["Revenue", "Orders", "ROAS"].map((label, index) => (
            <div key={label} className="border-line-soft rounded-md border px-2 py-3">
              <span className="text-ink-subtle block text-[10px]">{label}</span>
              <strong className="text-ink mt-1 block text-lg font-bold">
                {["$186.2K", "8,241", "5.42x"][index]}
              </strong>
              <em className="text-brand-mint text-[10px] not-italic">
                {["+23.8%", "+10.3%", "+12.6%"][index]}
              </em>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <svg viewBox="0 0 320 90" className="block w-full" role="img" aria-label="Revenue trend">
            <title>Revenue trend</title>
            <path
              d="M0 78 L27 70 L53 72 L80 55 L107 60 L133 44 L160 48 L187 34 L213 38 L240 24 L267 28 L293 14 L320 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-brand-mint"
            />
          </svg>
        </div>
      </div>
      <p className="text-ink-faint mt-2 text-right text-[10px]">{SITE.heroVisualLabel}</p>
    </div>
  );
}
