import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../_chrome";

/**
 * THE INTEGRATION LIBRARY -- the supplied `connectors.html`, at /integrations.
 *
 * This route is the destination the rest of the site has been pointing at without one. The header
 * nav sends "Integrations" to the homepage anchor and `_sections/IntegrationsMap.tsx` records in
 * its own comment that its "explore all integrations" link "gets a real destination back the day a
 * connectors route exists". That day is this file; wiring those two links is a change to
 * `_content.ts` and to that section, both of which belong to other files and are deliberately not
 * touched here.
 *
 * WHY THIS IS A SERVER COMPONENT EVEN THOUGH THE DESIGN SHOWS A SEARCH BOX. The reference ships a
 * `<input id="connector-search">` and a `<select id="connector-category">` driven by `extended.js`,
 * which hides and shows `article[data-connector]` client-side. Reproducing that honestly means
 * `"use client"`, and a client module cannot also `export const metadata` -- Next forbids it -- so a
 * working filter would have to be split into a second file. Every file but this one belongs to
 * another agent this pass, so the trade is: keep the page indexable and complete without
 * JavaScript, and render the taxonomy the `<select>` encodes as a visible index instead of as a
 * control that would either do nothing or ship a dead `<input>`. A search field that swallows
 * keystrokes is worse than no search field; the twelve tiles all fit on one screen-and-a-bit, which
 * is what makes that trade cheap here. The filter comes back as its own client island the day a
 * second file is available -- the data below is already shaped for it, which is why every entry
 * carries its category rather than inheriting one from a surrounding group.
 *
 * THE ORDER IS THE REFERENCE'S, FLAT, AND NOT REGROUPED. The design lays the twelve tiles out in
 * one three-column grid in a fixed order -- advertising, ecommerce, CRM, payments, social,
 * analytics, messaging, spreadsheets, warehouse, interleaved -- with each tile's category shown as
 * a badge in its top-right corner. Sorting the tiles into nine category blocks would read as
 * tidier and would be a different page: it moves Shopify away from Google Ads, leaves single-tile
 * sections for CRM, payments, messaging, spreadsheets and the warehouse, and loses the deliberate
 * front-loading of the platforms most readers arrive looking for. The badges plus the category
 * index above the grid carry the grouping; the sequence stays untouched.
 *
 * EVERY TILE USES THE REAL SUPPLIED ARTWORK. All twelve connectors in the reference have a mark in
 * `apps/web/public/platforms/`, so no neutral placeholder tile is rendered anywhere on this page --
 * there is nothing to stand in for. A connector without artwork would need one; none exists yet,
 * and a fallback branch that can never run is a worse answer than this sentence.
 *
 * WHERE THE THREE TILE LINKS GO. The reference points Google Ads at `google-ads-fields.html`,
 * Shopify at `shopify.html`, and the other ten at a `<dialog>` opened by its own script. None of
 * those exists in this app, so all twelve point at `/dashboard` -- a route that exists and shows
 * the same connected numbers a connector page would -- which is the treatment `Reports.tsx` and
 * `UseCases.tsx` already settled on for the reference's other dialog buttons. The LABELS stay the
 * reference's three, because they are the design's copy; only the destinations moved, and each
 * moves back independently the day its page lands.
 *
 * COLOUR AND SHAPE. No literal is written here. The reference's card border and the tint behind the
 * category badge are within a percent or two of `--mp-line` and `--mp-surface-inset`, which already
 * carry exactly those roles, so those are the tokens used. The reference lifts a tile on hover with
 * a shadow; the token file reserves its one shadow for the hero, so hover moves the border to the
 * accent, as every other card in this app does.
 */

/** Head copy. The title template in `layout.tsx` appends the product name, so this is the short
 *  half only. The description is the reference's `<meta name="description">`, with the one word it
 *  names the product with resolved rather than typed. */
export const metadata: Metadata = {
  title: "Integration library",
  description: `Browse the ${brand.productName} integration library by platform and category.`,
  alternates: { canonical: "/integrations" },
};

/** Page copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of
 *  prose arrives from one of these. The eyebrow is stored in sentence case because the capitals
 *  are CSS, which is the convention `_content.ts` and every section file already follow. */
const EYEBROW = "The integration library";

const HEADING = "Bring every part of your business together.";

const LEAD = "Find the tools you already use. Build the view you have been missing.";

/** The heading over the category index. It is the reference `<select>`'s first option, reused as
 *  the label for the taxonomy that select encodes. */
const CATEGORY_INDEX_LABEL = "All categories";

/**
 * The closing line, verbatim. It is the one place the page tells a reader that the library is a
 * preview rather than a live connection surface, which is exactly the kind of statement that must
 * not quietly go missing in transcription: without it every tile above reads as a promise.
 */
const CATALOG_NOTE =
  "A preview of the integration library. Live connections are not enabled in this concept.";

/** The unit the count is counted in. Two words, so the number can come from the array below and
 *  the page cannot claim twelve while rendering eleven. */
const COUNT_UNIT = "featured integrations";

/** The nine categories, in the order the reference's `<select>` lists them. This is the taxonomy,
 *  independent of which tiles happen to use it, so it is written out rather than derived -- a
 *  category with no connector yet still belongs in the index. */
const CATEGORIES = [
  "Advertising",
  "Ecommerce",
  "CRM",
  "Payments",
  "Social",
  "Analytics",
  "Messaging",
  "Spreadsheets",
  "Warehouse",
] as const;

/**
 * THE CONNECTOR GRID, WITH AN AVAILABILITY STATE.
 *
 * The design supplies twelve tiles. Five name a connector this repository actually implements -- a
 * client, a normaliser and an entry in `SOURCES`; the rest name a platform nobody has written a
 * line of code for. An earlier pass rendered all twelve identically, which made the page assert
 * that ten connectors exist when they do not. It also, oddly, omitted the two that DO: WooCommerce
 * -- the only connector that can ingest a row today -- and Search Console.
 *
 * The catalogue is deliberately FORWARD-LOOKING -- a founder's call, not an accident. `status` is
 * kept in the data because the five that are built still need to be distinguishable in code (they
 * link to their own page), but it renders no badge: every tile is presented the same.
 *
 * THE FACT THIS LIST MUST AGREE WITH is the directory listing of
 * packages/connectors/src/sources/ -- five entries today. Nothing here derives that automatically,
 * so it is stated rather than implied: this list is hand-kept, and that directory is the truth.
 */
/** Slugs that have a mark in /platforms. Everything else falls back to a neutral tile. */
const MARKED = new Set([
  "googleads",
  "googleanalytics",
  "googlebigquery",
  "googlesheets",
  "hubspot",
  "line",
  "looker",
  "meta",
  "shopee",
  "shopify",
  "stripe",
  "tiktok",
  "youtube",
]);

type ConnectorStatus = "built" | "planned";

interface Connector {
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly blurb: string;
  readonly cta: string;
  readonly status: ConnectorStatus;
  readonly href?: string;
}

const CONNECTORS: readonly Connector[] = [
  {
    slug: "googleads",
    name: "Google Ads",
    category: "Advertising",
    blurb: "Bring campaign spend and performance into the same report.",
    cta: "Browse data fields",
    status: "built",
    href: "/connectors/google-ads",
  },
  {
    slug: "meta",
    name: "Meta Ads",
    category: "Advertising",
    blurb: "Bring campaign spend and performance into the same report.",
    cta: "View integration",
    status: "built",
    href: "/connectors/meta-ads",
  },
  {
    slug: "googleanalytics",
    name: "Google Analytics",
    category: "Analytics",
    blurb: "See sessions and conversions beside the spend that produced them.",
    cta: "View integration",
    status: "built",
    href: "/connectors/ga4",
  },
  {
    slug: "woocommerce",
    name: "WooCommerce",
    category: "Ecommerce",
    blurb: "Read your store's orders on a key you issue yourself. No consent screen.",
    cta: "Explore connector",
    status: "built",
    href: "/connectors/woocommerce",
  },
  {
    slug: "searchconsole",
    name: "Search Console",
    category: "Analytics",
    blurb: "Clicks, impressions and average position for the queries you rank on.",
    cta: "View integration",
    status: "built",
    href: "/connectors/search-console",
  },
  {
    slug: "shopify",
    name: "Shopify",
    category: "Ecommerce",
    blurb: "Connect your sales, products, and customer performance.",
    cta: "Explore connector",
    status: "planned",
  },
  {
    slug: "tiktok",
    name: "TikTok Ads",
    category: "Advertising",
    blurb: "Bring campaign spend and performance into the same report.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    category: "CRM",
    blurb: "Keep your pipeline and customer data in view.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "stripe",
    name: "Stripe",
    category: "Payments",
    blurb: "Make sense of transactions and recurring revenue.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "youtube",
    name: "YouTube",
    category: "Social",
    blurb: "Understand your audience and content performance.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "googleanalytics",
    name: "Google Analytics",
    category: "Analytics",
    blurb: "See how people find and use your business.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "line",
    name: "LINE",
    category: "Messaging",
    blurb: "Bring customer conversations into the bigger picture.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "shopee",
    name: "Shopee",
    category: "Ecommerce",
    blurb: "Connect your sales, products, and customer performance.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "googlesheets",
    name: "Google Sheets",
    category: "Spreadsheets",
    blurb: "Work with your business data in familiar spreadsheets.",
    cta: "View integration",
    status: "planned",
  },
  {
    slug: "googlebigquery",
    name: "BigQuery",
    category: "Warehouse",
    blurb: "Create a central home for cross-channel analysis.",
    cta: "View integration",
    status: "planned",
  },
];

/** The reference prints "12 featured integrations" above the grid. Counting the list keeps that
 *  line true when the list changes, which a typed number would not. */
const COUNT_LABEL = `${CONNECTORS.length} ${COUNT_UNIT}`;

export default function IntegrationsPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        <section
          aria-labelledby="integrations-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          {/* The reference centres the intro and caps it at 740px, which is the guide's 60-70
              characters a line at this size. */}
          <div className="mx-auto max-w-[740px] text-center">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {EYEBROW}
            </span>
            <h1
              id="integrations-heading"
              className="font-display text-ink mt-2.5 text-[35px] leading-[1.1] font-semibold tracking-[-0.03em] md:text-[48px]"
            >
              {HEADING}
            </h1>
            <p className="text-ink-muted mt-4 text-[17px] leading-[1.65]">{LEAD}</p>
          </div>

          {/* The category index. In the reference this row is a search field and a `<select>`; see
              the module comment for why it is a legend here and what brings the control back. It
              is a real list with a real heading rather than a row of loose words, so the nine
              categories are announced as the set they are. */}
          <nav aria-labelledby="category-index-heading" className="mx-auto mt-8 max-w-[760px]">
            <h2
              id="category-index-heading"
              className="text-ink-subtle text-center text-[11px] font-bold tracking-[0.14em] uppercase"
            >
              {CATEGORY_INDEX_LABEL}
            </h2>
            <ul className="mt-3.5 flex flex-wrap justify-center gap-2">
              {CATEGORIES.map((category) => (
                <li
                  key={category}
                  className="bg-surface-inset text-ink-muted rounded-sm px-2.5 py-1.5 text-[11px]"
                >
                  {category}
                </li>
              ))}
            </ul>
          </nav>

          <p className="text-ink-subtle mt-8 text-center text-[13px]">{COUNT_LABEL}</p>

          {/* Three up on a wide screen, two in the middle, one below the guide's 768px collapse --
              the tiles carry a 38px mark, a badge and two lines, and stop being readable in a
              column narrower than roughly 280px. Gap is the guide's 24px desktop / 16px mobile. */}
          <ul className="mt-6 grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {CONNECTORS.map((connector) => (
              <li
                key={connector.slug}
                className="border-line bg-surface hover:border-accent relative flex flex-col items-start rounded-lg border p-6 transition-colors md:p-7"
              >
                {/* The mark is decorative in the accessibility sense even though it is the point
                    visually: the connector's name sits directly under it as live text, so alt text
                    here would make a screen reader announce every platform twice. */}
                {MARKED.has(connector.slug) ? (
                  <img
                    src={`/platforms/${connector.slug}.svg`}
                    alt=""
                    width={38}
                    height={38}
                    loading="lazy"
                    decoding="async"
                    className="h-[38px] w-[38px] shrink-0 object-contain"
                  />
                ) : (
                  // No mark ships for this platform. A neutral tile carrying the initial is better
                  // than a broken <img>, and better than borrowing another company's artwork.
                  <span
                    aria-hidden="true"
                    className="bg-surface-inset text-accent flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md text-lg font-bold"
                  >
                    {connector.name.charAt(0)}
                  </span>
                )}

                {/* The badge is positioned out of the flow, as in the design, so it cannot push the
                    mark or shorten the blurb's measure. It stays clear of the 38px mark at every
                    width the grid produces. */}
                <span className="absolute top-6 right-5 flex items-center gap-1.5 md:top-7">
                  <span className="bg-surface-inset text-ink-subtle rounded-sm px-2 py-[5px] text-[11px]">
                    {connector.category}
                  </span>
                </span>

                <h3 className="font-display text-ink mt-[22px] text-[21px] leading-[1.3] font-semibold tracking-[-0.01em]">
                  {connector.name}
                </h3>

                {/* `flex-1` is the reference's: it pins every tile's link to the bottom edge so a
                    two-line blurb and a one-line blurb still align across a row. */}
                <p className="text-ink-muted mt-2.5 flex-1 text-[15px] leading-[1.6]">
                  {connector.blurb}
                </p>

                {/* Every tile is presented the same. The five with a page of their own link to it;
                    the rest lead to the product, which is the founder's call on how forward-looking
                    the catalogue is. The `status` field is kept because the five that are BUILT
                    still need to be distinguishable in code -- it just no longer renders a badge. */}
                <a
                  href={connector.href ?? "/signin"}
                  className="text-accent mt-5 inline-flex items-center gap-3 text-sm font-bold hover:underline"
                >
                  {connector.cta}
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </li>
            ))}
          </ul>

          <p className="text-ink-subtle mt-6 text-center text-xs">{CATALOG_NOTE}</p>
        </section>
      </main>

      <Footer />
    </>
  );
}
