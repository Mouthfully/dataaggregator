import Image from "next/image";

/**
 * THE DASHBOARD FEATURE -- the reference's `.dashboard-feature`, between the feature grid and the
 * integrations section.
 *
 * This is the one section of the page that is genuinely an IMAGE rather than markup, and the
 * distinction is worth stating because the hero deliberately goes the other way. The hero's mockup
 * is built from components so it moves when the tokens move; this is the full client dashboard, a
 * designed artefact supplied as a PNG, shown at a size where nobody reads individual numbers. The
 * live version of it is a real route -- /dashboard -- and the image links there, so a reader who
 * wants the detail gets the built page rather than a bigger picture of one.
 *
 * `next/image` rather than a bare <img>: this is a 1586x992 screenshot and the only large raster on
 * the site, so it is the one place the format negotiation and the intrinsic-size attributes pay for
 * themselves. Everything else on the page is SVG, where next/image would add a wrapper for nothing.
 */

/**
 * THE COPY, RE-AIMED, AND THE ONE THING IT CANNOT FIX.
 *
 * The heading used to promise a workspace and the lead a dashboard "your team will actually use".
 * That sells the picture; `docs/marketplane/58-plan-reconciliation.md` section 5.1 says the product
 * sells the decision. So the page now says what the page is FOR -- the one screen you open once a
 * day, already laid out for your trade -- and the three benefit lines end in a to-do.
 *
 * WHAT COULD NOT BE FIXED HERE. The artefact below is a supplied PNG showing a dollar-denominated
 * dashboard, and section 5.1 bans USD hero figures for a baht-billed Thai owner-operator. A raster
 * cannot be re-rendered from this file, so the honest move is the one available: the caption says
 * in words that the figures are a sample and not a customer's, and this stays on the design note's
 * list until the image is redrawn in baht. Labelling an unfixable illustration is the artboard's
 * own remedy; leaving it unlabelled would let an illustration read as a customer.
 */
const EYEBROW = "One page, every morning";
const HEADING_LEAD = "The page you open";
const HEADING_REST = "once a day.";
const LEAD =
  "Yesterday's takings, anything unusual, and the one thing worth doing — laid out for the trade you are in, not for an analyst who is not coming.";
const IMAGE_ALT =
  "Dashboard concept showing revenue, orders, spend, channel performance and a list of suggested actions";
const SAMPLE_LABEL = "Product concept. Sample figures, not a customer.";
const OPEN_LABEL = "Explore the client dashboard";

const BENEFITS = [
  {
    id: "changed",
    label: "Know what changed overnight",
    d: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    id: "trade",
    label: "Laid out for your trade",
    d: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.9M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8",
  },
  { id: "todo", label: "Ends in one thing to do", d: "m6 11 4 4L21 4M20 12v8H3V3h12" },
] as const;

export function DashboardFeature() {
  return (
    <section className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
      <div className="mx-auto max-w-[680px] text-center">
        <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
          {EYEBROW}
        </span>
        <h2 className="font-display text-ink mt-3 text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-4xl">
          {HEADING_LEAD} <span className="brand-gradient-text">{HEADING_REST}</span>
        </h2>
        <p className="text-ink-muted mt-4 text-base leading-[1.65]">{LEAD}</p>
      </div>

      <a
        href="/dashboard"
        className="group border-line bg-surface focus-visible:outline-accent mt-10 block overflow-hidden rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-[3px]"
      >
        <Image
          src="/client-dashboard.png"
          alt={IMAGE_ALT}
          width={1586}
          height={992}
          sizes="(max-width: 1200px) 100vw, 1200px"
          className="block h-auto w-full"
        />
        {/* The caption strip now carries the sample label on the left and the open affordance on
            the right. Same strip, same height, one more thing said out loud. */}
        <span className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
          <span className="text-ink-faint text-xs">{SAMPLE_LABEL}</span>
          <span className="text-accent flex items-center gap-2 text-sm font-bold">
            {OPEN_LABEL}
            <span aria-hidden="true">&#8599;</span>
          </span>
        </span>
      </a>

      <ul className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
        {BENEFITS.map((benefit) => (
          <li key={benefit.id} className="text-ink flex items-center gap-3 text-sm font-bold">
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-accent shrink-0"
            >
              <path d={benefit.d} />
            </svg>
            {benefit.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
