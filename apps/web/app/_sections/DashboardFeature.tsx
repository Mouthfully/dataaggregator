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

const EYEBROW = "Your business, at a glance";
const HEADING_LEAD = "One workspace.";
const HEADING_REST = "Your whole business.";
const LEAD =
  "Revenue, campaign performance, and your next best action — together in a dashboard your team will actually use.";
const IMAGE_ALT =
  "Client dashboard concept showing revenue, orders, ad spend, channel performance, and AI insights";
const OPEN_LABEL = "Explore the client dashboard";

const BENEFITS = [
  {
    id: "growth",
    label: "See what is driving growth",
    d: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    id: "aligned",
    label: "Keep your team aligned",
    d: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.9M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8",
  },
  { id: "action", label: "Turn insights into action", d: "m6 11 4 4L21 4M20 12v8H3V3h12" },
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
        <span className="text-accent flex items-center justify-end gap-2 px-6 py-4 text-sm font-bold">
          {OPEN_LABEL}
          <span aria-hidden="true">&#8599;</span>
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
