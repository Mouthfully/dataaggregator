import { brand } from "@repo/brand";

/**
 * THE INTEGRATIONS SPLIT -- the section the header's "Integrations" link points at.
 *
 * `_content.ts` links the nav to `/#integrations`, so the id here is load-bearing rather than
 * decorative: without it that nav item scrolls nowhere.
 *
 * THE MAP IS MARKUP, NOT A PICTURE. The design draws eight connector tiles wired into a central
 * mark, and the obvious shortcut is to export that arrangement as one image. It is the wrong
 * shortcut: the tiles carry the platform NAMES, which a screen reader has to be able to read and
 * which change whenever the connector list changes, and an image of a connector list goes stale
 * silently because nothing can fail a build over it. Every mark is the real supplied artwork from
 * `apps/web/public/platforms/`, placed with the same `<img>` decision `IntegrationsStrip.tsx`
 * records, and the centre is the brand mark from `@repo/brand` rather than a typed path.
 *
 * THE `<img alt="">` IS EMPTY ON PURPOSE, in the tiles and in the centre. The platform name sits
 * next to its mark as live text, so alt text would make a screen reader announce every platform
 * twice. The artwork is decorative in the accessibility sense even though it is the point visually.
 *
 * THE DISCLOSURE IS NATIVE `<details>`, SO THIS STAYS A SERVER COMPONENT. A chevron that rotates
 * and a list that expands is exactly what the element does on its own; reaching for `useState`
 * here would ship a client bundle to animate a triangle, and would break the list for anyone who
 * loads the page before hydration -- including a crawler reading the connector names.
 *
 * WHERE THE REFERENCE'S SEPARATE "EXPLORE ALL INTEGRATIONS" LINK WENT. The design puts a text link
 * and this disclosure in the same column, the link pointing at a connectors page that does not
 * exist in this app. A link to nowhere is worse than one control, and the stylesheet gives the
 * `<summary>` the same blue-bold treatment as that link, so the two are merged: the summary IS the
 * control. It gets a real destination back the day a connectors route exists.
 *
 * TWO GRADIENTS, BOTH BUILT FROM TOKENS. The map's radial wash and the connecting rules are
 * gradients, which have no flat colour utility -- but Tailwind's gradient utilities take the same
 * token-mapped colours as everything else, so `bg-radial from-surface-inset to-surface` and
 * `bg-linear-to-r from-brand-blue to-brand-mint` need no literal and follow a palette change. See
 * the report for the two hues this approximates.
 *
 * NO SHADOWS. The reference lifts every tile a few pixels off the page. The only shadow the token
 * file defines is `--mp-shadow-lift`, reserved there for the hero demo ("do not blanket-shadow
 * cards; that flattens the hierarchy"), so the tiles are hairline-bordered like the feature cards
 * the rest of the page already renders.
 */

/** Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX; caps are CSS. */
const EYEBROW = "200+ integrations";

/** The line break inside the heading is the design's, so the two lines are two values. */
const HEADING_TOP = "All your favorite tools.";
const HEADING_BOTTOM = "In one place.";

const LEAD =
  "Connect global platforms like Google Ads, Meta, Shopify, and Stripe, alongside the local tools your business relies on. See the whole picture without switching between tabs.";

const DISCLOSURE_LABEL = "Explore all integrations";

/** The category line under the disclosure. Four fragments, not a sentence. */
const CATEGORY_NOTE = "Advertising · Ecommerce · Analytics · CRM";

/**
 * The eight marks wired into the map, in the design's order, split into the two flanking groups.
 * `slug` is the file in /platforms -- the pair is the unit of information, so the pair is what
 * this file holds, for the reason `IntegrationsStrip.tsx` records: a name alone cannot find a file.
 */
const MAP_LEFT = [
  { slug: "googleads", name: "Google Ads" },
  { slug: "meta", name: "Meta Ads" },
  { slug: "shopify", name: "Shopify" },
  { slug: "tiktok", name: "TikTok Ads" },
] as const;

const MAP_RIGHT = [
  { slug: "hubspot", name: "HubSpot" },
  { slug: "stripe", name: "Stripe" },
  { slug: "youtube", name: "YouTube" },
  { slug: "googleanalytics", name: "Google Analytics" },
] as const;

/**
 * What the disclosure adds. Every one of these has real artwork shipped in /platforms, which is the
 * test for appearing here: a chip for a connector we cannot show a mark for is a promise, and the
 * claims file exists precisely to keep promises off this page.
 */
const MORE_CONNECTORS = [
  { slug: "googlesheets", name: "Google Sheets" },
  { slug: "googlebigquery", name: "BigQuery" },
  { slug: "looker", name: "Looker" },
  { slug: "line", name: "LINE" },
  { slug: "shopee", name: "Shopee" },
] as const;

export function IntegrationsMap() {
  return (
    <section
      id="integrations"
      className="mx-auto grid max-w-[1200px] items-center gap-8 px-8 py-12 md:grid-cols-2 md:gap-10 md:py-20 lg:gap-20"
    >
      <div className="min-w-0">
        <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
          {EYEBROW}
        </span>
        <h2 className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-bold tracking-[-0.03em] md:text-[36px]">
          {HEADING_TOP}
          <br />
          {HEADING_BOTTOM}
        </h2>
        {/* The design caps the measure at 475px, which is the brand guide's 60-70 characters. */}
        <p className="text-ink-muted mt-5 max-w-[475px] leading-[1.65]">{LEAD}</p>

        {/* `list-none` kills the marker in Firefox, the pseudo-element rule in WebKit; both are
            needed, and neither removes the element's keyboard behaviour. */}
        <details className="group mt-6">
          <summary className="text-accent inline-flex cursor-pointer list-none items-center text-sm font-bold hover:underline [&::-webkit-details-marker]:hidden">
            {DISCLOSURE_LABEL}
            <span
              aria-hidden="true"
              className="ml-3 transition-transform duration-200 group-open:rotate-180"
            >
              &#9662;
            </span>
          </summary>

          <ul className="mt-[18px] flex flex-wrap gap-2">
            {MORE_CONNECTORS.map((connector) => (
              <li
                key={connector.slug}
                className="bg-surface-inset text-ink-muted flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px]"
              >
                <img
                  src={`/platforms/${connector.slug}.svg`}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 shrink-0 object-contain"
                />
                {connector.name}
              </li>
            ))}
          </ul>
        </details>

        <p className="text-ink-subtle mt-7 text-[13px]">{CATEGORY_NOTE}</p>
      </div>

      {/* THE MAP. Below the brand guide's 768px collapse the reference's single inline row cannot
          fit -- eight tiles, two rules and the centre mark need roughly 530px -- so the rules drop
          out and the centre mark takes its own row above a four-up of tiles. `order` does that
          without duplicating the tiles into a second hidden copy that could drift. */}
      {/* No `role`/`aria-label` on this wrapper: it is a presentational container, the two
          clusters inside are real lists of named platforms, and the section's own heading already
          says what they are. A label here would add a third announcement of the same fact. */}
      <div className="bg-radial from-surface-inset to-surface flex min-h-[260px] flex-wrap items-center justify-center gap-4 p-6 to-72% md:flex-nowrap md:gap-0">
        <PlatformCluster platforms={MAP_LEFT} className="order-2 md:order-1" />
        <ConnectionLine />

        <div className="order-1 flex w-full justify-center md:order-2 md:w-auto">
          <div className="bg-surface border-line-soft rounded-xl border p-[22px]">
            <img
              src={brand.logoMarkPath}
              alt=""
              width={70}
              height={78}
              className="block w-14 md:w-[70px]"
            />
          </div>
        </div>

        <ConnectionLine />
        <PlatformCluster platforms={MAP_RIGHT} className="order-3" />
      </div>
    </section>
  );
}

/** One 2x2 group of connector tiles. The design's `.mini-platforms`. */
function PlatformCluster({
  platforms,
  className,
}: {
  platforms: ReadonlyArray<{ slug: string; name: string }>;
  className: string;
}) {
  return (
    <ul className={`grid grid-cols-2 gap-2 md:gap-[18px] ${className}`}>
      {platforms.map((platform) => (
        <li
          key={platform.slug}
          className="bg-surface border-line-soft text-ink flex h-[70px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-lg border px-1 text-center text-[10px] leading-tight font-bold md:h-20 md:w-[85px] md:gap-2"
        >
          <img
            src={`/platforms/${platform.slug}.svg`}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="h-[22px] w-[22px] shrink-0 object-contain md:h-7 md:w-7"
          />
          {platform.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * The rule joining a cluster to the centre. Decorative and hidden from assistive technology: the
 * relationship it draws is already carried by the section's heading and copy, and a screen reader
 * has nothing to do with a 2px line.
 */
function ConnectionLine() {
  return (
    <span
      aria-hidden="true"
      className="from-brand-blue to-brand-mint hidden h-0.5 w-[68px] shrink-0 bg-linear-to-r opacity-60 md:block"
    />
  );
}
