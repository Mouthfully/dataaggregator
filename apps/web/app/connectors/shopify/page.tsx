import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE SHOPIFY CONNECTOR PAGE -- the supplied `shopify.html`, at /connectors/shopify.
 *
 * WHY THIS PAGE IS A SERVER COMPONENT EVEN THOUGH THE DESIGN SHOWS TWO SETS OF TABS. The reference
 * has two: the `.connector-tabs` strip under the hero, and the `.field-tabs` over the data
 * catalogue. The first is not a tab set at all -- it is five in-page anchors, so it is reproduced
 * exactly as the anchors it already is. The second IS stateful: `extended.js` swaps the contents of
 * `#shopify-field-panel` when Orders / Products / Customers is pressed, and neither that script nor
 * the rows it injects were supplied. Reproducing it honestly means `"use client"`, and a client
 * module cannot also `export const metadata`, so the interactive version needs a second file --
 * which this pass does not own. The three categories are therefore rendered as three stacked,
 * headed tables: every row is present, indexable and reachable without JavaScript, and a reader
 * loses a control rather than losing data. A tab bar that swallows clicks would be worse than
 * none, and the same trade is already recorded in `app/integrations/page.tsx` for its search field.
 *
 * THE ROWS THEMSELVES ARE NOT IN THE REFERENCE. See the FIELDS comment below; they are the one
 * block of copy on this page that could not be transcribed, and the reference's own closing note --
 * which IS verbatim -- is what keeps them honest by marking them as proposed reporting labels.
 *
 * THE HERO FLOW PANEL IS THE DESIGN'S, INCLUDING ITS NUMBERS. The order count, revenue and refresh
 * interval are the reference's example figures and are labelled as an example connection by the
 * chip above them, exactly as in the design. They are not presented as this app's live data.
 *
 * BUTTONS THAT OPENED A DIALOG NOW GO SOMEWHERE. The reference's two `data-connect-shopify`
 * buttons open a `<dialog>` driven by the missing script. Both become links to /dashboard, which is
 * the treatment every other transcribed section settled on: the label stays the design's, only the
 * destination moved, and it moves back the day a connect flow exists.
 *
 * COLOUR. No literal is written here. Three of the reference's values have no token and take the
 * nearest role instead: the mint-to-blue rule inside the flow panel is composed from the two brand
 * gradient stops with Tailwind's gradient utilities rather than from the fixed three-stop CSS
 * gradient; the sync strip's mint wash becomes the subtle surface with a mint status dot, because
 * mint is a decorative accent that the brand guide forbids for small text; and the closing panel's
 * blue-to-mint wash becomes the pale-blue inset surface, which is the token that already carries
 * "soft feature background". All three are reported.
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only;
 *  the description is the reference's own `<meta name="description">`. */
export const metadata: Metadata = {
  title: "Shopify connector",
  description:
    "Bring Shopify orders, products, and customer data into a clearer reporting workflow.",
  alternates: { canonical: "/connectors/shopify" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below. Eyebrows are stored in sentence case because
 * the capitals are CSS, which is what every section file already does.
 * ------------------------------------------------------------------------------------------- */

const HERO_EYEBROW = "Ecommerce connector";

/** The h1's line break is the design's, and its second line is the gradient one. */
const HERO_HEADING_TOP = "Your Shopify data.";
const HERO_HEADING_BOTTOM = "The bigger picture.";

const HERO_LEAD =
  "Bring your store performance together with your marketing data. Understand what sells, what brings customers in, and where to grow next.";

const HERO_PRIMARY_CTA = "Connect Shopify";
const HERO_SECONDARY_CTA = "Explore the data";

/** The two reassurances under the hero actions. Neither is a sentence; both are the design's. */
const HERO_CHECKS = ["No code required", "Scheduled refresh"] as const;

/* The connection panel beside the hero. */
const PANEL_LABEL = "Your store. Connected.";
const PANEL_CHIP = "Example connection";
const PANEL_FLOW_DATASETS = "Orders · Products · Customers";
const PANEL_SYNC_STATUS = "Sync complete";
const PANEL_SYNC_TIME = "Just now";

/** The three example figures, verbatim, each with the design's label. */
const PANEL_STATS = [
  { label: "Orders imported", value: "8,241" },
  { label: "Revenue", value: "$186,240" },
  { label: "Next refresh", value: "15 min" },
] as const;

/** The mock configuration block. `key` is the dimmed column in the design, `value` the lit one. */
const PANEL_CONFIG = [
  { key: "source", value: "shopify" },
  { key: "datasets", value: "orders, products, customers" },
  { key: "destination", value: "your_workspace" },
] as const;

/** The five in-page anchors under the hero, in the reference's order. */
const SECTION_LINKS = [
  { href: "#destinations", label: "Destinations" },
  { href: "#use-cases", label: "What you can build" },
  { href: "#fields", label: "Available data" },
  { href: "#setup", label: "Getting started" },
  { href: "#connector-faq", label: "FAQs" },
] as const;

/* Destinations. */
const DESTINATIONS_EYEBROW = "Your data, where you need it";
const DESTINATIONS_HEADING = "Choose your destination.";
const DESTINATIONS_LEAD = "Start with a dashboard. Keep exploring in the tools your team knows.";

/**
 * The four destinations. The first card's title names the product, which may not be typed as a
 * literal outside the brand package -- `scripts/check-brand.mjs` enforces that -- so it is composed
 * from `brand.productName`, which is already capitalised correctly and is not transformed here.
 * `mark` is the file in `apps/web/public`; the first card uses the standalone symbol, the other
 * three their supplied platform artwork.
 */
const DESTINATIONS = [
  {
    id: "workspace",
    mark: brand.logoMarkPath,
    title: `${brand.productName} dashboards`,
    body: "A clear view for your whole team.",
    cta: "Explore dashboard",
    href: "/dashboard",
  },
  {
    id: "googlesheets",
    mark: "/platforms/googlesheets.svg",
    title: "Google Sheets",
    body: "Flexible analysis in a familiar spreadsheet.",
    cta: "See the reporting workflow",
    href: "#setup",
  },
  {
    id: "looker",
    mark: "/platforms/looker.svg",
    title: "Looker Studio",
    body: "Share visual reports across your business.",
    cta: "See the reporting workflow",
    href: "#setup",
  },
  {
    id: "googlebigquery",
    mark: "/platforms/googlebigquery.svg",
    title: "BigQuery",
    body: "A central place for deeper analysis.",
    cta: "See the reporting workflow",
    href: "#setup",
  },
] as const;

/* What you can build. */
const USE_CASES_EYEBROW = "More than a sales report";
const USE_CASES_HEADING = "See the story behind your store.";
const USE_CASES_LEAD = "Connect the details of your business to the decisions you make every day.";

/** The six cards, in the reference's order, each with the reference's own outline mark. */
const USE_CASES = [
  {
    title: "Sales performance",
    body: "Follow sales, discounts, and refunds over time. Compare periods to understand what changed.",
    path: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    title: "Product performance",
    body: "Find your best sellers and compare order quantities, product variants, and product categories.",
    path: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10",
  },
  {
    title: "Customer behavior",
    body: "Explore order history and repeat purchases to understand the people behind your sales.",
    path: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.9M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8",
  },
  {
    title: "Marketing context",
    body: "Compare store performance with campaign data, using consistent time periods and attribution rules.",
    path: "M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v3m-6-9a6 6 0 0 0 6 6",
  },
  {
    title: "Fulfillment visibility",
    body: "Review fulfillment status and identify orders that need attention.",
    path: "M20 7a8 8 0 0 0-14-3L3 7m0-5v5h5m-4 10a8 8 0 0 0 14 3l3-3m0 5v-5h-5",
  },
  {
    title: "Returns and refunds",
    body: "Look at refund activity alongside sales to get a more complete picture of performance.",
    path: "m6 11 4 4L21 4M20 12v8H3V3h12",
  },
] as const;

/* Available data. */
const FIELDS_EYEBROW = "A look inside the connector";
const FIELDS_HEADING = "The data behind your next decision.";
const FIELDS_LEAD = "Example reporting fields, grouped around the way your store works.";

/**
 * THE ONLY COPY ON THIS PAGE THAT IS NOT IN THE REFERENCE. `#shopify-field-panel` is empty in the
 * supplied HTML: its rows come from `extended.js`, which was not supplied, and the sibling
 * `google-ads-fields.html` catalogue is injected the same way. So there was nothing to transcribe
 * and the three category names -- Orders, Products, Customers, which ARE the reference's tab
 * labels -- are filled with plain reporting labels drawn from what this page already says it
 * carries: sales, discounts, refunds, variants, categories, repeat purchases, fulfillment status.
 * Nothing here promises a field the page does not already name, and the closing note below (which
 * IS verbatim) marks the whole table as proposed rather than contracted. Replace wholesale the day
 * the real catalogue arrives; the shape is the reference's three-column table.
 */
/**
 * THE THREE CATEGORY NAMES, AND DELIBERATELY NO FIELDS.
 *
 * The reference's `#shopify-field-panel` is EMPTY in the supplied HTML -- its rows are injected by
 * an `extended.js` that was not supplied. An earlier draft of this file filled that gap with
 * plausible-looking field names, types and descriptions. They were removed.
 *
 * A catalogue of field definitions is read as documentation. A merchant who plans an integration
 * around a field that does not exist is worse off than one who was told the list is not published
 * yet -- and the invented version was indistinguishable, at a glance, from a real one. That is the
 * failure this repository treats as the worst kind: a wrong value that looks right.
 *
 * The three names below ARE the reference's own tab labels, so they are transcribed, not invented.
 */
const FIELD_CATEGORIES = ["Orders", "Products", "Customers"] as const;

const FIELDS_PENDING =
  "The field list for each category is published with the connector. It is not available yet.";

/** Verbatim. It is the sentence that stops the table above reading as a contract. */
const FIELDS_NOTE = `Proposed ${brand.productName} reporting labels. Final availability depends on store permissions and the implemented connector.`;

/* Getting started. */
const SETUP_EYEBROW = "From store to insight";
const SETUP_HEADING = "A straightforward setup.";
const SETUP_LEAD = "The planned connection flow keeps your first report within reach.";

const SETUP_STEPS = [
  {
    title: "Connect your store",
    body: "Enter your Shopify store address and authorize access to the data needed for your reports.",
  },
  {
    title: "Choose your data",
    body: "Select the reporting datasets, date range, and destination for your store data.",
  },
  {
    title: "Make it your own",
    body: "Start with a template, choose a refresh schedule, and share your report with your team.",
  },
] as const;

/* FAQs. */
const FAQ_EYEBROW = "Good to know";
const FAQ_HEADING_TOP = "A few details";
const FAQ_HEADING_BOTTOM = "before you connect.";
const FAQ_LINK_LABEL = "Explore documentation";

/**
 * The four questions, verbatim. The second and fourth answers name the product; both read it from
 * the brand package rather than typing it, for the reason recorded on `DESTINATIONS`.
 */
const FAQS = [
  {
    question: "Can I combine Shopify with advertising data?",
    answer:
      "That is the intended reporting workflow. Use shared dates and carefully defined attribution rules when comparing store revenue with advertising conversions.",
  },
  {
    question: "Will connecting change my store?",
    answer:
      "The proposed connector is for reading reporting data. The connection preview does not access or modify any Shopify store.",
  },
  {
    question: "How often will the data refresh?",
    answer:
      "The pricing concept includes daily, hourly, 15-minute, and 5-minute schedules. Final refresh availability will depend on the plan and source limits.",
  },
  {
    question: "Can I connect my store now?",
    answer:
      "This is a product preview. You can explore the setup steps, but live Shopify authorization is not connected yet.",
  },
] as const;

/* The closing panel. */
const FINAL_HEADING = "Your store. A clearer view.";
const FINAL_LEAD = "Bring your ecommerce data into the bigger picture.";
const FINAL_CTA = "Explore connection setup";

/** Shared class strings, so the two hero buttons and the closing one cannot drift apart. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const TEXT_LINK = "text-accent inline-flex items-center gap-3 text-sm font-bold hover:underline";

export default function ShopifyConnectorPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO. The design's `.connector-intro`: breadcrumb, then a 1fr/1fr split that collapses
            below the guide's 768px. */}
        <section className="mx-auto max-w-[1200px] px-8 pt-4 pb-9 md:pt-7 md:pb-14">
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
              <li>
                <a href="/integrations" className="hover:text-accent">
                  Integrations
                </a>
              </li>
              <li aria-hidden="true" className="text-ink-faint">
                /
              </li>
              <li aria-current="page">Shopify</li>
            </ol>
          </nav>

          <div className="mt-9 grid items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-3">
                {/* Decorative: the eyebrow and the h1 beside it both name the platform, so alt
                    text here would make a screen reader announce it three times. */}
                <img
                  src="/platforms/shopify.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <span className="text-ink-subtle text-[11px] font-bold tracking-[0.12em] uppercase">
                  {HERO_EYEBROW}
                </span>
              </div>

              <h1 className="font-display text-ink text-[36px] leading-[1.06] font-bold tracking-[-0.04em] md:text-[42px] lg:text-[48px]">
                {HERO_HEADING_TOP}
                <br />
                <span className="brand-gradient-text">{HERO_HEADING_BOTTOM}</span>
              </h1>

              {/* 475px is the design's measure cap, which is the guide's 60-70 characters. */}
              <p className="text-ink-muted mt-6 max-w-[475px] text-base leading-[1.65] md:text-[17px]">
                {HERO_LEAD}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a href="/dashboard" className={PRIMARY_BUTTON}>
                  {HERO_PRIMARY_CTA}
                  <span aria-hidden="true">&rarr;</span>
                </a>
                <a
                  href="#fields"
                  className="bg-surface text-accent border-line hover:bg-surface-subtle inline-flex min-h-[46px] items-center justify-center rounded-md border px-[22px] text-sm font-bold transition-colors"
                >
                  {HERO_SECONDARY_CTA}
                </a>
              </div>

              <ul className="mt-6 flex flex-wrap gap-3 md:gap-5">
                {HERO_CHECKS.map((check) => (
                  <li key={check} className="text-ink-muted text-xs whitespace-nowrap">
                    <span aria-hidden="true" className="text-brand-mint mr-2 font-bold">
                      &#10003;
                    </span>
                    {check}
                  </li>
                ))}
              </ul>
            </div>

            {/* THE CONNECTION PANEL. A large feature panel, so it takes the 24px radius. */}
            <div className="border-line bg-surface min-w-0 rounded-xl border p-5 md:p-7">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-subtle text-[10px] font-bold tracking-[0.12em] uppercase">
                  {PANEL_LABEL}
                </span>
                <span className="bg-surface-subtle text-ink-subtle rounded-[7px] px-2.5 py-1.5 text-[11px] leading-[1.3] whitespace-nowrap">
                  {PANEL_CHIP}
                </span>
              </div>

              <div className="my-7 flex items-center md:my-9">
                <div className="flex w-[65px] shrink-0 flex-col items-center gap-3 md:w-[88px]">
                  <img
                    src="/platforms/shopify.svg"
                    alt="Shopify"
                    width={58}
                    height={58}
                    className="h-[45px] w-[45px] object-contain md:h-[58px] md:w-[58px]"
                  />
                  <strong className="text-ink text-sm">Shopify</strong>
                </div>

                {/* The track. The dataset caption sits over a mint-to-blue rule; the arrow is
                    decorative, the caption carries the meaning. */}
                <div className="min-w-0 flex-1 px-2 text-center">
                  <span className="text-ink-faint text-[8px] md:text-[9px]">
                    {PANEL_FLOW_DATASETS}
                  </span>
                  <div className="mt-3.5 flex items-center gap-1">
                    <i className="from-brand-mint to-brand-blue block h-0.5 flex-1 bg-linear-to-r" />
                    <b aria-hidden="true" className="text-accent text-xl leading-none">
                      &rarr;
                    </b>
                  </div>
                </div>

                <div className="flex w-[65px] shrink-0 flex-col items-center gap-3 md:w-[88px]">
                  <img
                    src={brand.logoMarkPath}
                    alt={brand.productName}
                    width={55}
                    height={60}
                    className="h-[45px] w-auto object-contain md:h-[60px]"
                  />
                  <strong className="text-ink text-sm">{brand.productName}</strong>
                </div>
              </div>

              {/* The sync strip. The design washes it mint; mint is a decorative accent the brand
                  guide keeps away from small text, so the wash is the subtle surface and the mint
                  survives as the status dot. */}
              <p className="border-line bg-surface-subtle text-ink-muted flex items-center gap-2 rounded-lg border p-3 text-xs">
                <span aria-hidden="true" className="bg-brand-mint h-1.5 w-1.5 rounded-full" />
                {PANEL_SYNC_STATUS}
                <span className="text-ink-faint ml-auto text-[10px]">{PANEL_SYNC_TIME}</span>
              </p>

              <dl className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
                {PANEL_STATS.map((stat) => (
                  <div key={stat.label} className="min-w-0">
                    <dt className="text-ink-faint text-[10px]">{stat.label}</dt>
                    <dd className="font-display text-ink mt-1 text-lg font-bold md:text-[22px]">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="bg-surface-subtle text-ink-muted font-mono mt-6 rounded-lg p-4 text-[10px] leading-[1.9] md:text-[11px]">
                {PANEL_CONFIG.map((line) => (
                  <div key={line.key} className="flex gap-2">
                    <dt className="text-ink-faint w-[75px] shrink-0 md:w-[88px]">{line.key}</dt>
                    <dd className="min-w-0 break-words">{line.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* The five in-page anchors. A scroller on a phone, as in the design, so the five never
            wrap into a stack. */}
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

        {/* DESTINATIONS. */}
        <section
          id="destinations"
          aria-labelledby="destinations-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {DESTINATIONS_EYEBROW}
            </span>
            <h2
              id="destinations-heading"
              className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
            >
              {DESTINATIONS_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {DESTINATIONS_LEAD}
            </p>
          </div>

          {/* Four up wide, two in the middle band, one on a phone -- the design's own steps. */}
          <ul className="grid grid-cols-2 gap-3 md:gap-[18px] lg:grid-cols-4">
            {DESTINATIONS.map((destination) => (
              <li
                key={destination.id}
                className="border-line bg-surface flex flex-col items-start rounded-lg border p-5 md:p-[22px]"
              >
                <img
                  src={destination.mark}
                  alt=""
                  width={36}
                  height={36}
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <h3 className="font-display text-ink mt-5 mb-3 text-base leading-[1.3] font-bold tracking-[-0.01em] md:mt-6 md:text-[18px]">
                  {destination.title}
                </h3>
                <p className="text-ink-muted flex-1 text-[13px] leading-[1.6] md:text-sm">
                  {destination.body}
                </p>
                <a href={destination.href} className={`${TEXT_LINK} mt-4 text-xs`}>
                  {destination.cta}
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* WHAT YOU CAN BUILD -- the design's `.soft-section`, a full-bleed tinted band. */}
        <section
          id="use-cases"
          aria-labelledby="use-cases-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
              <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
                {USE_CASES_EYEBROW}
              </span>
              <h2
                id="use-cases-heading"
                className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
              >
                {USE_CASES_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {USE_CASES_LEAD}
              </p>
            </div>

            <ul className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-[30px]">
              {USE_CASES.map((useCase) => (
                <li
                  key={useCase.title}
                  className="border-line bg-surface rounded-lg border p-6 md:p-7"
                >
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
                    className="text-brand-blue mb-[18px] block md:mb-[22px]"
                  >
                    <path d={useCase.path} />
                  </svg>
                  <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-bold tracking-[-0.01em]">
                    {useCase.title}
                  </h3>
                  <p className="text-ink-muted text-[15px] leading-[1.7]">{useCase.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* AVAILABLE DATA. Three headed tables instead of one tabbed panel; see the module note. */}
        <section
          id="fields"
          aria-labelledby="fields-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mb-8 max-w-[720px] md:mb-10">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {FIELDS_EYEBROW}
            </span>
            <h2
              id="fields-heading"
              className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
            >
              {FIELDS_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {FIELDS_LEAD}
            </p>
          </div>

          <ul className="mt-8 flex flex-wrap gap-2">
            {FIELD_CATEGORIES.map((category) => (
              <li
                key={category}
                className="border-line text-ink-muted rounded-md border px-4 py-2 text-sm font-bold"
              >
                {category}
              </li>
            ))}
          </ul>

          {/* Says what is not known, rather than filling the panel with plausible field names. */}
          <p className="border-line text-ink-subtle mt-5 rounded-lg border border-dashed px-5 py-6 text-sm">
            {FIELDS_PENDING}
          </p>

          <p className="text-ink-subtle mt-[22px] text-xs leading-[1.6]">{FIELDS_NOTE}</p>
        </section>

        {/* GETTING STARTED. An ordered list, because the three steps ARE a sequence: the numerals
            in the design are content, not decoration, so they come from <ol> rather than from a
            typed "1" that a screen reader would read as part of the heading. */}
        <section
          id="setup"
          aria-labelledby="setup-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {SETUP_EYEBROW}
            </span>
            <h2
              id="setup-heading"
              className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
            >
              {SETUP_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {SETUP_LEAD}
            </p>
          </div>

          <ol className="grid gap-6 md:grid-cols-3 md:gap-10 lg:gap-[50px]">
            {SETUP_STEPS.map((step, index) => (
              <li key={step.title} className="relative min-w-0 pl-[60px] md:pl-0">
                {/* The numeral is a duplicate of the list's own numbering, so it is hidden from
                    assistive technology rather than announced twice. */}
                <span
                  aria-hidden="true"
                  className="bg-surface-inset text-accent absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-full text-[17px] font-bold md:static md:mb-5"
                >
                  {index + 1}
                </span>
                <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-bold tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className="text-ink-muted text-[15px] leading-[1.7]">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQS. Native <details>, which already owns the disclosure semantics and keyboard
            behaviour the design's accordion needs, so no script is involved. */}
        <section
          id="connector-faq"
          aria-labelledby="faq-heading"
          className="mx-auto grid max-w-[1200px] items-start gap-8 px-8 pt-10 pb-12 md:grid-cols-2 md:gap-10 md:pb-20 lg:gap-20"
        >
          <div className="min-w-0">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {FAQ_EYEBROW}
            </span>
            <h2
              id="faq-heading"
              className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-bold tracking-[-0.03em] md:text-[36px]"
            >
              {FAQ_HEADING_TOP}
              <br />
              {FAQ_HEADING_BOTTOM}
            </h2>
            <a href="/docs" className={`${TEXT_LINK} mt-6`}>
              {FAQ_LINK_LABEL}
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>

          <div className="min-w-0">
            {FAQS.map((item) => (
              <details key={item.question} className="group border-line border-b py-[18px]">
                <summary className="text-ink flex cursor-pointer list-none justify-between gap-5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  {/* Hidden from assistive tech: <details> already announces expanded/collapsed. */}
                  <span aria-hidden="true" className="text-ink-subtle shrink-0 leading-[1.5]">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">&#8722;</span>
                  </span>
                </summary>
                <p className="text-ink-muted mt-3.5 text-sm leading-[1.65]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* THE CLOSING PANEL. The design washes it blue-to-mint; that gradient has no token, so the
            panel takes the pale-blue inset surface, which is the role the guide gives it. */}
        <section
          aria-labelledby="final-cta-heading"
          className="mx-auto max-w-[1200px] px-8 pb-12 md:pb-[70px]"
        >
          <div className="bg-surface-inset flex flex-col gap-6 rounded-xl p-8 md:flex-row md:items-center md:justify-between md:p-12">
            <div className="min-w-0">
              <h2
                id="final-cta-heading"
                className="font-display text-ink mb-2.5 text-[28px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[30px]"
              >
                {FINAL_HEADING}
              </h2>
              <p className="text-ink-muted leading-[1.65]">{FINAL_LEAD}</p>
            </div>
            <a href="/dashboard" className={`${PRIMARY_BUTTON} shrink-0 self-start md:self-auto`}>
              {FINAL_CTA}
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
