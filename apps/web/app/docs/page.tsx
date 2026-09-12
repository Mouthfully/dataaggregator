import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../_chrome";

/**
 * THE HELP CENTRE -- the supplied `docs.html`, at /docs.
 *
 * THE SUPPLIED PAGE IS A THREE-COLUMN DOC SHELL: a topline rule, a sticky section index on the
 * left, the article, and a sticky "on this page" rail on the right. Both rails are reproduced
 * because they are how the page tells a reader where they are, and both drop out exactly where the
 * reference drops them -- the right rail below 1280px, the left rail below 768px -- so a phone gets
 * the article alone rather than three columns of nothing.
 *
 * WHERE ITS LINKS GO. The reference links to sibling files (`connectors.html`, `shopify.html`,
 * `google-ads-fields.html`). This app's route map is `apps/web/app/sitemap.ts`, which is the one
 * place the planned URLs are already written down: `/integrations`, `/connectors/shopify`,
 * `/fields/google-ads`. Every cross-page link here uses those, so the sidebar points at the routes
 * the site says it will have rather than at a filename that was never a route. In-page anchors and
 * `/dashboard` and `/#pricing` resolve today.
 *
 * COLOUR. The reference's doc chrome is a family of near-white blues -- one for the search field,
 * one for the preview notice, one for the active sidebar row, one for the recipe panel -- over two
 * hairline steps. Not one of those literals is in the token file, and each sits within a couple of
 * percent of a token that already carries the role, so the subtle surface takes the quiet boxes,
 * the inset surface takes the two that read as "blue" (the preview notice and the active source
 * row), and the hairlines take `border-line` / `border-line-soft`. Nothing new is invented.
 *
 * INK ON THE NOTICE. `--mp-ink-subtle` is documented as safe on a card but short of AA on the page
 * ground, so it appears here only inside boxes that paint their own surface; body prose on the
 * white page uses `text-ink-muted`.
 *
 * RADII. `rounded-md` and `rounded-lg` name the roles (control, card) the brand guide gives them;
 * see the note in the delivery report about what those two utilities currently resolve to.
 */

/** Every sentence lives here: `scripts/check-copy.mjs` refuses prose typed into the JSX.
 *  Eyebrows and rail labels are stored in sentence case because the capitals are CSS. */
const TOPLINE_LABEL = "Documentation";
const TOPLINE_SEARCH = "Search data fields";

const BREADCRUMB_SECTION = "Documentation";
const BREADCRUMB_PAGE = "Overview";

/* The product name may not appear as a literal outside the brand package, so the eyebrow, the
   preview notice and the page description are assembled from `brand.productName` -- which is
   already correctly capitalised and is never transformed. */
const EYEBROW = `The ${brand.productName} help center`;
const HEADING = "Clarity starts here.";
const LEAD =
  "Understand your data, connect your tools, and build reports that answer better questions.";
const NOTICE = `This guide describes the proposed ${brand.productName} workflow. Live account connections are not enabled in this preview.`;
const META_DESCRIPTION = `Get started with ${brand.productName} reporting concepts, connectors, and data fields.`;

/** The left rail. Group labels, then the rows under each, in the reference's order. */
const SIDEBAR_HOME = "Help center";
const SIDEBAR_GROUPS = [
  {
    id: "get-started",
    label: "Get started",
    links: [
      { href: "/docs#quick-start", label: "Quick start" },
      { href: "/docs#concepts", label: "Core concepts" },
      { href: "/docs#reporting", label: "Build your first report" },
    ],
  },
  {
    id: "data-sources",
    label: "Data sources",
    links: [
      // `active` is the reference's `.ads-doc-link` tint. `icon` is a mark that ships in
      // apps/web/public/platforms/, so no logo is hotlinked or redrawn.
      {
        href: "/fields/google-ads",
        label: "Google Ads",
        icon: "googleads",
        active: true,
      },
      {
        href: "/fields/google-ads#catalog",
        label: "Metrics & dimensions",
        sub: true,
      },
      {
        href: "/fields/google-ads#query-example",
        label: "Example query",
        sub: true,
      },
      { href: "/connectors/shopify", label: "Shopify", icon: "shopify" },
      {
        href: "/connectors/shopify#fields",
        label: "Available data",
        sub: true,
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    links: [
      { href: "/dashboard", label: "Dashboard preview" },
      { href: "/#pricing", label: "Plans & refresh schedules" },
    ],
  },
] as const;

const SIDEBAR_HELP = {
  title: "Start with your source.",
  body: "Understand the fields before building your first report.",
  cta: "Find an integration",
  href: "/integrations",
};

/** The two cards under the lead. `path` is the reference's own 24-box outline mark, copied. */
const DOCS_CARDS = [
  {
    id: "fields",
    href: "/fields/google-ads",
    title: "Explore data fields",
    body: "Search Google Ads metrics and dimensions.",
    cta: "Open the catalog",
    path: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    id: "connector",
    href: "/connectors/shopify",
    title: "Meet your connector",
    body: "See the Shopify reporting experience.",
    cta: "Explore Shopify",
    path: "M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v3m-6-9a6 6 0 0 0 6 6",
  },
] as const;

const QUICK_START_HEADING = "Your first clear view.";
const QUICK_START_STEPS = [
  {
    id: "source",
    title: "Choose your source.",
    body: "Start with the business tool that holds the data you need. Review its field catalog and access requirements.",
  },
  {
    id: "question",
    title: "Define your question.",
    body: "For example: which campaigns generated the most conversion value last month?",
  },
  {
    id: "fields",
    title: "Select dimensions and metrics.",
    body: "Group results by campaign and date. Add spend, clicks, conversions, and conversion value.",
  },
  {
    id: "destination",
    title: "Choose a destination.",
    body: "Plan where the report should live and who needs access to it.",
  },
] as const;

const CONCEPTS_HEADING = "A few useful concepts.";
const CONCEPTS = [
  {
    id: "connectors",
    term: "Connectors",
    definition: "The link between a source platform and your reporting workspace.",
  },
  {
    id: "dimensions",
    term: "Dimensions",
    definition: "Attributes that organize data, such as campaign name, date, or device.",
  },
  {
    id: "metrics",
    term: "Metrics",
    definition: "Measured values, such as impressions, clicks, cost, or conversions.",
  },
  {
    id: "refresh",
    term: "Refresh schedules",
    definition:
      "How often a report requests updated data. Source limits and plan settings can affect freshness.",
  },
] as const;

const REPORTING_HEADING = "Build a report around one question.";
const REPORTING_BODY =
  "Keep your first report small. Choose the time period, the level of detail, and the outcomes you want to compare before adding more fields.";

const RECIPE_EYEBROW = "Example report";
const RECIPE_TITLE = "Campaign performance";
/* The reference writes this as one paragraph of bolded labels separated by <br>. Splitting it into
   label/value pairs keeps the same rendering and keeps every sentence out of the JSX. */
const RECIPE_ROWS = [
  { id: "group", label: "Group by:", value: "date and campaign." },
  {
    id: "measure",
    label: "Measure:",
    value: "impressions, clicks, cost, conversions.",
  },
  {
    id: "compare",
    label: "Compare:",
    value: "the same date range in the previous period.",
  },
] as const;
const RECIPE_CTA = "See the Google Ads example";

const TROUBLESHOOTING_HEADING = "When the numbers don't match.";
const TROUBLESHOOTING_BODY =
  "Check date boundaries, account time zones, attribution settings, currency, and whether a report includes the same filters. Late-arriving conversions can change recent results.";
const TROUBLESHOOTING_BODY_2 =
  "Keep original source identifiers in your data so you can trace a report back to the source platform.";

/** The right rail. Its labels are the reference's short forms, not the section headings. */
const TOC_LABEL = "On this page";
const TOC = [
  { href: "#quick-start", label: "Quick start" },
  { href: "#concepts", label: "Core concepts" },
  { href: "#reporting", label: "First report" },
  { href: "#troubleshooting", label: "Troubleshooting" },
] as const;

export const metadata: Metadata = {
  title: "Documentation",
  description: META_DESCRIPTION,
};

/** The reference's book mark for the rail's home row, copied at its own 1.7 stroke. */
function HelpCenterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z" />
    </svg>
  );
}

export default function DocsPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        <div className="border-line border-y">
          <div className="text-ink-muted mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-8 py-4 text-[13px] md:text-sm">
            <span>{TOPLINE_LABEL}</span>
            <a
              href="/fields/google-ads"
              className="border-line bg-surface-subtle text-ink-subtle flex items-center justify-between gap-6 rounded-md border px-[13px] py-2 text-[11px] md:min-w-[200px] md:text-xs"
            >
              {TOPLINE_SEARCH}
              <span aria-hidden="true">&#8981;</span>
            </a>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1200px] items-start gap-9 px-8 pt-6 pb-12 md:grid-cols-[185px_minmax(0,1fr)] md:pt-10 md:pb-20 xl:grid-cols-[210px_minmax(0,1fr)_150px] xl:gap-[45px]">
          {/* The section index. Hidden below 768px rather than stacked: on a phone it would push
              the article a full screen down, which is what the reference avoids by dropping it. */}
          <nav
            aria-label={SIDEBAR_HOME}
            className="sticky top-6 hidden flex-col gap-[3px] text-[13px] md:flex"
          >
            <a
              href="/docs"
              className="text-ink flex items-center gap-2 px-2 pb-2 text-sm font-bold"
            >
              <HelpCenterIcon />
              {SIDEBAR_HOME}
            </a>

            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.id} className="flex flex-col gap-[3px]">
                <span className="text-ink-faint mx-2 mt-[27px] mb-[9px] text-[10px] font-bold tracking-[0.1em] uppercase">
                  {group.label}
                </span>
                {group.links.map((link) => {
                  const isActive = "active" in link && link.active;
                  const isSub = "sub" in link && link.sub;
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-2 rounded-md p-2 ${isSub ? "pl-[35px] text-xs" : ""} ${
                        isActive
                          ? "bg-surface-inset text-accent"
                          : "text-ink-muted hover:bg-surface-subtle hover:text-accent"
                      }`}
                    >
                      {"icon" in link && link.icon ? (
                        // Decorative: the label beside it names the source, so a second name here
                        // would make a screen reader announce the row twice.
                        <img
                          src={`/platforms/${link.icon}.svg`}
                          alt=""
                          width={18}
                          height={18}
                          className="block h-[18px] w-[18px] shrink-0 object-contain"
                        />
                      ) : null}
                      {link.label}
                    </a>
                  );
                })}
              </div>
            ))}

            <div className="border-line bg-surface-subtle mt-9 rounded-md border p-[18px]">
              <strong className="text-ink block text-xs">{SIDEBAR_HELP.title}</strong>
              <p className="text-ink-muted mt-[7px] mb-2.5 text-xs leading-[1.6]">
                {SIDEBAR_HELP.body}
              </p>
              <a
                href={SIDEBAR_HELP.href}
                className="text-accent inline-flex items-center gap-2 text-xs font-bold hover:underline"
              >
                {SIDEBAR_HELP.cta}
                <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          </nav>

          <article>
            {/* Two static crumbs, so this is a label rather than a trail of links: the second
                crumb is this page and the first has no page of its own above /docs. */}
            <div className="text-ink-subtle mb-[30px] flex flex-wrap items-center gap-3 text-[11px] md:text-xs">
              {BREADCRUMB_SECTION}
              <span className="text-ink-faint" aria-hidden="true">
                /
              </span>
              {BREADCRUMB_PAGE}
            </div>

            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase">
              {EYEBROW}
            </span>
            <h1 className="font-display text-ink mt-3 mb-5 text-[34px] leading-[1.12] font-bold tracking-[-0.035em] md:text-[42px]">
              {HEADING}
            </h1>
            <p className="text-ink-muted max-w-[640px] text-base leading-[1.65] md:text-[17px]">
              {LEAD}
            </p>

            {/* The preview notice is a statement about what this page can and cannot do today, so
                it stays visible prose rather than a comment -- the same honesty rule the dashboard
                screen follows. */}
            <p className="border-line bg-surface-inset text-ink-subtle my-[22px] rounded-md border px-[18px] py-4 text-xs leading-[1.6] md:text-[13px]">
              {NOTICE}
            </p>

            <div className="mt-[30px] grid gap-4 sm:grid-cols-2">
              {DOCS_CARDS.map((card) => (
                <a
                  key={card.id}
                  href={card.href}
                  className="border-line bg-surface hover:bg-surface-subtle block rounded-lg border p-[22px] transition-colors"
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
                    className="text-brand-blue mb-4 block"
                  >
                    <path d={card.path} />
                  </svg>
                  <h2 className="font-display text-ink mb-2.5 text-base leading-[1.3] font-bold">
                    {card.title}
                  </h2>
                  <p className="text-ink-muted mb-4 text-[13px] leading-[1.6]">{card.body}</p>
                  <span className="text-accent text-xs font-bold">
                    {card.cta} <span aria-hidden="true">&rarr;</span>
                  </span>
                </a>
              ))}
            </div>

            <section
              id="quick-start"
              aria-labelledby="quick-start-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="quick-start-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[26px]"
              >
                {QUICK_START_HEADING}
              </h2>
              {/* The reference suppresses the list marker and draws its own numbered disc with a
                  CSS counter. The number is rendered as text instead so it survives with styles
                  off, and `list-none` keeps the marker from being announced twice. */}
              <ol className="list-none p-0">
                {QUICK_START_STEPS.map((step, index) => (
                  <li key={step.id} className="relative pb-[15px] pl-[42px]">
                    <span
                      aria-hidden="true"
                      className="bg-surface-inset text-accent absolute top-0 left-0 h-[27px] w-[27px] rounded-full text-center text-xs leading-[27px] font-bold"
                    >
                      {index + 1}
                    </span>
                    <strong className="text-ink block text-[15px]">{step.title}</strong>
                    <p className="text-ink-muted mt-1.5 text-[15px] leading-[1.65]">{step.body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section
              id="concepts"
              aria-labelledby="concepts-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="concepts-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[26px]"
              >
                {CONCEPTS_HEADING}
              </h2>
              {/* A real <dl>: the reference styles these as h3 + p, but they are term and
                  definition, and the markup that says so costs nothing here. */}
              <dl>
                {CONCEPTS.map((concept) => (
                  <div key={concept.id} className="border-line-soft border-b py-[18px]">
                    <dt className="font-display text-ink text-base leading-[1.3] font-bold">
                      {concept.term}
                    </dt>
                    <dd className="text-ink-muted mt-2 ml-0 text-[15px] leading-[1.65]">
                      {concept.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section
              id="reporting"
              aria-labelledby="reporting-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="reporting-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[26px]"
              >
                {REPORTING_HEADING}
              </h2>
              <p className="text-ink-muted mb-6 text-[15px] leading-[1.65]">{REPORTING_BODY}</p>

              <div className="border-line bg-surface-subtle rounded-lg border p-6">
                <span className="text-ink-faint block text-[10px] font-bold tracking-[0.14em] uppercase">
                  {RECIPE_EYEBROW}
                </span>
                <h3 className="font-display text-ink mt-2 mb-2 text-base leading-[1.3] font-bold">
                  {RECIPE_TITLE}
                </h3>
                <p className="text-ink-muted text-[15px] leading-[1.9]">
                  {RECIPE_ROWS.map((row) => (
                    <span key={row.id} className="block">
                      <strong className="text-ink">{row.label}</strong> {row.value}
                    </span>
                  ))}
                </p>
                <a
                  href="/fields/google-ads#query-example"
                  className="text-accent mt-4 inline-flex items-center gap-3 text-sm font-bold hover:underline"
                >
                  {RECIPE_CTA}
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </section>

            <section
              id="troubleshooting"
              aria-labelledby="troubleshooting-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="troubleshooting-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[26px]"
              >
                {TROUBLESHOOTING_HEADING}
              </h2>
              <p className="text-ink-muted mb-6 text-[15px] leading-[1.65]">
                {TROUBLESHOOTING_BODY}
              </p>
              <p className="text-ink-muted text-[15px] leading-[1.65]">{TROUBLESHOOTING_BODY_2}</p>
            </section>
          </article>

          {/* The right rail repeats four of the left rail's links, so it carries its own label:
              two landmarks both called "Help center" is what makes a duplicate rail confusing,
              not the duplication itself. `aria-hidden` is NOT used -- it would leave four
              focusable links inside a hidden subtree. */}
          <nav
            aria-label={TOC_LABEL}
            className="border-line sticky top-[30px] hidden flex-col gap-[13px] border-l pl-5 text-[11px] xl:flex"
          >
            <span className="text-ink mb-1 text-[10px] font-bold tracking-[0.08em] uppercase">
              {TOC_LABEL}
            </span>
            {TOC.map((item) => (
              <a key={item.href} href={item.href} className="text-ink-subtle leading-[1.5]">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </main>

      <Footer />
    </>
  );
}
