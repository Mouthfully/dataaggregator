import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE GOOGLE ADS FIELD CATALOGUE -- the supplied `google-ads-fields.html`, at /fields/google-ads.
 *
 * THE PAGE IS THE SAME THREE-COLUMN DOC SHELL AS /docs: topline rule, sticky section index, the
 * article, sticky "on this page" rail. Both rails drop where the reference drops them (right rail
 * below 1280px, left rail below 768px). The rail data is re-declared here rather than imported
 * because `apps/web/app/docs/page.tsx` belongs to another agent this pass and exports only its
 * page; the day a shared `_docs-shell` module exists, both files read from it and nothing else
 * moves. The active row here is Google Ads, as in the reference.
 *
 * THE CATALOGUE IS A TABLE, NOT A DISCLOSURE LIST. The reference renders 24 `<details>` rows whose
 * summary carries the name and identifier and whose body carries category, format and description,
 * and it hides all of that behind a search box, a three-way type filter and a category `<select>`
 * -- every one of them driven by `extended.js`. This file is a server component and every other
 * file in the tree belongs to another agent, so a working filter cannot be split into a client
 * island this pass. Shipping the controls anyway would mean a search field that swallows
 * keystrokes and two filters that do nothing, which is worse than no control at all. So the same
 * data arrives as one table: every field, its identifier, type, category, format and description
 * visible at once, which is also what makes the browser's own find-in-page work across all 24
 * rows. The `<select>`'s taxonomy is not lost either -- it is rendered above the table as the
 * visible category index. This is a real data table, so it is marked up as one: `<th scope="col">`
 * on the header row, `<th scope="row">` on the field name, and a `<caption>` carrying the count.
 *
 * ON A PHONE the table keeps a 760px minimum and scrolls inside its own `overflow-x-auto` box, so
 * the page body never scrolls sideways. Five columns squeezed into 360px would wrap every
 * description to one word per line.
 *
 * COLOUR. The reference's doc chrome is a family of near-white blues over two hairline steps; none
 * of those literals is in the token file and each sits within a couple of percent of a token that
 * already carries the role, so the subtle surface takes the quiet boxes and the inset surface the
 * two that read as "blue" (the preview notice, the active source row). Two roles have no token at
 * all and take the nearest one: the dark code panel (`bg-surface-inverse`, the deep navy, against
 * the reference's slightly cooler #152236) and the metric badge, whose mint tint has no light
 * surface token and whose mint ink would fail AA as 10px text -- so the badge pair is
 * dimension = inset blue + accent ink, metric = subtle surface + muted ink, which keeps the two
 * types distinguishable without inventing a colour. Both are in the delivery note.
 *
 * INK. `--mp-ink-subtle` is documented as short of AA on the page ground, so it appears only
 * inside boxes that paint their own surface; prose on the page ground uses `text-ink-muted`.
 */

/** Every sentence lives here: `scripts/check-copy.mjs` refuses prose typed into the JSX. Labels
 *  and headings are stored in sentence case because the capitals are CSS. */
const TOPLINE_LABEL = "Documentation";
const TOPLINE_SEARCH = "Search data fields";

const BREADCRUMB_SECTION = "Documentation";
const BREADCRUMB_PAGE = "Google Ads";

const SOURCE_CATEGORY = "Advertising";
const HEADING_LINE_1 = "Google Ads";
const HEADING_LINE_2 = "metrics & dimensions.";
const LEAD =
  "Find the fields you need to understand campaign performance and structure your reports.";

const API_REFERENCE = "Reference: Google Ads API v22";

/* The product name may not appear as a literal outside the brand package, so the preview notice
   and the page description are assembled from `brand.productName`, which is already correctly
   capitalised and is never transformed. */
const NOTICE = `A curated field-reference preview, not a complete ${brand.productName} connector contract. Check Google's reference for field compatibility and current availability.`;
const META_DESCRIPTION =
  "Browse a curated Google Ads field reference with metric names, dimensions, formats, and a query example.";

const CATALOG_HEADING = "Find your field.";
/* The reference reads "Search by name, field identifier, or description. Select a row for more
   detail." Both halves describe controls this pass cannot ship (see the module note), and the
   second is answered by the table itself -- every row's detail is already on screen -- so the
   promise is narrowed to what the page keeps rather than left standing as a dead one. */
const CATALOG_LEAD = "Find fields by name, field identifier, or description.";
const CATEGORY_INDEX_LABEL = "Categories";
const TABLE_LABEL = "Google Ads metrics and dimensions";

const UNDERSTANDING_HEADING = "Read the values correctly.";
const UNDERSTANDING = [
  {
    id: "micros",
    term: "Micros",
    body: "Divide cost values expressed in micros by 1,000,000 to get the account-currency amount. A value of 1,500,000 represents 1.50.",
  },
  {
    id: "ratios",
    term: "Ratios",
    body: "A click-through rate of 0.05 represents 5%. Avoid applying percentage formatting twice.",
  },
  {
    id: "aggregation",
    term: "Aggregation",
    body: "Calculate totals from the underlying values. For example, total clicks divided by total impressions produces the combined click-through rate.",
  },
] as const;

const QUERY_HEADING = "A campaign report to start with.";
const QUERY_LEAD =
  "This Google Ads Query Language example requests daily campaign performance for the last 30 days.";
const QUERY_CAPTION = "GAQL · campaign performance";
const QUERY = `SELECT
  segments.date,
  campaign.id,
  campaign.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
ORDER BY segments.date DESC`;
const QUERY_NOTE =
  "The query is an example for the Google Ads API. This documentation preview does not execute requests.";

const SOURCES_HEADING = "Source references.";
const SOURCES_LEAD =
  "Field identifiers and basic definitions are based on Google's API reference. Confirm supported combinations before using a query.";
const SOURCE_LINKS = [
  {
    href: "https://developers.google.com/google-ads/api/fields/v22/metrics",
    label: "Google Ads metrics reference",
  },
  {
    href: "https://developers.google.com/google-ads/api/fields/v22/segments",
    label: "Google Ads segments reference",
  },
  {
    href: "https://developers.google.com/google-ads/api/fields/v22/campaign",
    label: "Google Ads campaign reference",
  },
] as const;

/** The left rail, in the reference's order. Cross-page hrefs are the routes `apps/web/app/
 *  sitemap.ts` already records, not the reference's sibling filenames. */
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
      // `active` is the reference's `.ads-doc-link` tint -- this page. `icon` is a mark that ships
      // in apps/web/public/platforms/, so no logo is hotlinked or redrawn.
      {
        href: "/fields/google-ads",
        label: "Google Ads",
        icon: "googleads",
        active: true,
      },
      { href: "#catalog", label: "Metrics & dimensions", sub: true },
      { href: "#query-example", label: "Example query", sub: true },
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

/** The right rail. Its labels are the reference's short forms, not the section headings. */
const TOC_LABEL = "On this page";
const TOC = [
  { href: "#catalog", label: "Field catalog" },
  { href: "#understanding", label: "Understanding values" },
  { href: "#query-example", label: "Example query" },
  { href: "#sources", label: "Source references" },
] as const;

/**
 * THE FIELD DATA. Names, identifiers, types, categories, formats and descriptions are transcribed
 * from the reference's 24 `<details>` rows and are not paraphrased or abbreviated: a field
 * reference that improves on its source is a field reference that lies about an API.
 */
type FieldKind = "dimension" | "metric";

type CatalogField = {
  /** The identifier, which is unique and is what the row is keyed on. */
  id: string;
  name: string;
  kind: FieldKind;
  category: string;
  format: string;
  description: string;
};

const FIELDS: readonly CatalogField[] = [
  {
    id: "campaign.id",
    name: "Campaign ID",
    kind: "dimension",
    category: "Campaign",
    format: "Identifier",
    description: "Identifies a campaign.",
  },
  {
    id: "campaign.name",
    name: "Campaign name",
    kind: "dimension",
    category: "Campaign",
    format: "Text",
    description: "Human-readable campaign label.",
  },
  {
    id: "campaign.status",
    name: "Campaign status",
    kind: "dimension",
    category: "Campaign",
    format: "Enum",
    description: "Campaign lifecycle status.",
  },
  {
    id: "segments.date",
    name: "Date",
    kind: "dimension",
    category: "Time",
    format: "Date",
    description: "Calendar day in YYYY-MM-DD format.",
  },
  {
    id: "segments.week",
    name: "Week",
    kind: "dimension",
    category: "Time",
    format: "Date",
    description: "Week grouped by its Monday date.",
  },
  {
    id: "segments.month",
    name: "Month",
    kind: "dimension",
    category: "Time",
    format: "Date",
    description: "Month represented by its first day.",
  },
  {
    id: "segments.year",
    name: "Year",
    kind: "dimension",
    category: "Time",
    format: "Integer",
    description: "Calendar year.",
  },
  {
    id: "segments.device",
    name: "Device",
    kind: "dimension",
    category: "Audience",
    format: "Enum",
    description: "Device category for the reported activity.",
  },
  {
    id: "segments.ad_network_type",
    name: "Ad network",
    kind: "dimension",
    category: "Audience",
    format: "Enum",
    description: "Network where the activity occurred.",
  },
  {
    id: "segments.conversion_action_name",
    name: "Conversion action",
    kind: "dimension",
    category: "Conversions",
    format: "Text",
    description: "Name of the conversion action.",
  },
  {
    id: "metrics.impressions",
    name: "Impressions",
    kind: "metric",
    category: "Performance",
    format: "Integer",
    description: "Number of ad appearances.",
  },
  {
    id: "metrics.clicks",
    name: "Clicks",
    kind: "metric",
    category: "Performance",
    format: "Integer",
    description: "Recorded clicks.",
  },
  {
    id: "metrics.ctr",
    name: "Click-through rate",
    kind: "metric",
    category: "Performance",
    format: "Ratio",
    description: "Clicks divided by impressions.",
  },
  {
    id: "metrics.cost_micros",
    name: "Cost",
    kind: "metric",
    category: "Cost",
    format: "Micros",
    description: "Spend in millionths of account currency.",
  },
  {
    id: "metrics.average_cpc",
    name: "Average CPC",
    kind: "metric",
    category: "Cost",
    format: "Micros",
    description: "Average click cost in micros.",
  },
  {
    id: "metrics.average_cpm",
    name: "Average CPM",
    kind: "metric",
    category: "Cost",
    format: "Micros",
    description: "Average cost per thousand impressions in micros.",
  },
  {
    id: "metrics.conversions",
    name: "Conversions",
    kind: "metric",
    category: "Conversions",
    format: "Decimal",
    description: "Conversions included in the conversions metric.",
  },
  {
    id: "metrics.conversions_value",
    name: "Conversion value",
    kind: "metric",
    category: "Conversions",
    format: "Decimal",
    description: "Combined value of those conversions.",
  },
  {
    id: "metrics.all_conversions",
    name: "All conversions",
    kind: "metric",
    category: "Conversions",
    format: "Decimal",
    description: "Conversions across all tracked actions.",
  },
  {
    id: "metrics.all_conversions_value",
    name: "All conversion value",
    kind: "metric",
    category: "Conversions",
    format: "Decimal",
    description: "Value across all tracked conversion actions.",
  },
  {
    id: "metrics.cost_per_conversion",
    name: "Cost per conversion",
    kind: "metric",
    category: "Cost",
    format: "Micros",
    description: "Average cost per conversion in micros.",
  },
  {
    id: "metrics.interactions",
    name: "Interactions",
    kind: "metric",
    category: "Performance",
    format: "Integer",
    description: "Primary ad interactions.",
  },
  {
    id: "metrics.interaction_rate",
    name: "Interaction rate",
    kind: "metric",
    category: "Performance",
    format: "Ratio",
    description: "Interactions divided by impressions.",
  },
  {
    id: "metrics.engagements",
    name: "Engagements",
    kind: "metric",
    category: "Performance",
    format: "Integer",
    description: "Recorded ad engagements.",
  },
];

/** The reference's `<select>` taxonomy, in its order. Every value here must be a category some
 *  row carries, which is what the category index below promises a reader. */
const CATEGORIES = ["Campaign", "Time", "Audience", "Performance", "Cost", "Conversions"] as const;

/* The reference hard-codes "24 example fields", "10 Dimensions", "14 Metrics" and "6 Categories".
   Counting them off the data instead keeps the headline numbers true the moment a field is added
   or removed -- a stale count on a field reference is a bug, not a typo. */
const DIMENSION_COUNT = FIELDS.filter((field) => field.kind === "dimension").length;
const METRIC_COUNT = FIELDS.filter((field) => field.kind === "metric").length;
const FIELD_SUMMARY = `${FIELDS.length} example fields`;
const FIELD_COUNT = `${FIELDS.length} fields`;

const STATS = [
  { id: "dimensions", value: DIMENSION_COUNT, label: "Dimensions" },
  { id: "metrics", value: METRIC_COUNT, label: "Metrics" },
  { id: "categories", value: CATEGORIES.length, label: "Categories" },
] as const;

export const metadata: Metadata = {
  title: "Google Ads fields",
  description: META_DESCRIPTION,
  alternates: { canonical: "/fields/google-ads" },
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

export default function GoogleAdsFieldsPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        <div className="border-line border-y">
          <div className="text-ink-muted mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-8 py-4 text-[13px] md:text-sm">
            <span>{TOPLINE_LABEL}</span>
            <a
              href="#catalog"
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
                      aria-current={isActive ? "page" : undefined}
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
            {/* The first crumb is a page, so it is a link; the second is this page, so it is not. */}
            <div className="text-ink-subtle mb-[30px] flex flex-wrap items-center gap-3 text-[11px] md:text-xs">
              <a href="/docs" className="hover:text-accent">
                {BREADCRUMB_SECTION}
              </a>
              <span className="text-ink-faint" aria-hidden="true">
                /
              </span>
              {BREADCRUMB_PAGE}
            </div>

            <div className="text-ink-muted mb-6 flex items-center gap-[13px] text-xs">
              {/* Decorative: the heading immediately below names the source. */}
              <img
                src="/platforms/googleads.svg"
                alt=""
                width={36}
                height={36}
                className="block h-9 w-9 object-contain"
              />
              <span>{SOURCE_CATEGORY}</span>
            </div>

            <h1 className="font-display text-ink mb-5 text-[34px] leading-[1.12] font-normal tracking-[-0.035em] md:text-[42px]">
              {HEADING_LINE_1}
              <br />
              {HEADING_LINE_2}
            </h1>
            <p className="text-ink-muted max-w-[640px] text-base leading-[1.65] md:text-[17px]">
              {LEAD}
            </p>

            <div className="text-ink-faint mt-2 mb-[22px] flex flex-wrap gap-2 text-[11px] md:gap-[18px]">
              <span>{API_REFERENCE}</span>
              <span>{FIELD_SUMMARY}</span>
            </div>

            {/* What this page is and is not. It stays visible prose rather than a comment, which is
                the same honesty rule the rest of the preview follows. */}
            <p className="border-line bg-surface-inset text-ink-subtle my-[22px] rounded-md border px-[18px] py-4 text-xs leading-[1.6] md:text-[13px]">
              {NOTICE}
            </p>

            <dl className="mt-7 flex gap-[9px] md:gap-4">
              {STATS.map((stat) => (
                <div key={stat.id} className="border-line flex-1 rounded-md border p-3 md:p-[15px]">
                  <dd className="font-display text-ink text-[22px] font-normal md:text-[25px]">
                    {stat.value}
                  </dd>
                  <dt className="text-ink-muted text-[11px] md:text-xs">{stat.label}</dt>
                </div>
              ))}
            </dl>

            <section
              id="catalog"
              aria-labelledby="catalog-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="catalog-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-normal tracking-[-0.02em] md:text-[26px]"
              >
                {CATALOG_HEADING}
              </h2>
              <p className="text-ink-muted text-[15px] leading-[1.65]">{CATALOG_LEAD}</p>

              {/* The reference's category `<select>`, rendered as the index it encodes rather than
                  as a control with nothing behind it. */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-ink-faint text-[10px] font-bold tracking-[0.1em] uppercase">
                  {CATEGORY_INDEX_LABEL}
                </span>
                {CATEGORIES.map((category) => (
                  <span
                    key={category}
                    className="border-line bg-surface-subtle text-ink-muted rounded-sm border px-2 py-1 text-[11px]"
                  >
                    {category}
                  </span>
                ))}
              </div>

              {/* A 760px floor plus this scroller is what keeps five columns readable on a phone
                  without the page body ever scrolling sideways. `tabIndex` makes the scroller
                  reachable from the keyboard, which a scrollable region needs. */}
              {/* The scroller holds no focusable child, so without a tab stop a keyboard-only
                  reader cannot scroll it at all -- WCAG 2.1.1. That is the one case the lint
                  rule's "non-interactive element" test gets wrong, so it is suppressed here and
                  the region is given a name instead. */}
              <section
                className="border-line mt-4 overflow-x-auto rounded-lg border"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard access to the scroller
                tabIndex={0}
                aria-label={TABLE_LABEL}
              >
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <caption className="border-line-soft bg-surface-subtle text-ink-muted border-b px-5 py-3.5 text-left text-xs">
                    {FIELD_COUNT}
                  </caption>
                  <thead>
                    <tr className="bg-surface-subtle text-ink-subtle border-line-soft border-b text-xs">
                      <th scope="col" className="px-5 py-4 font-bold">
                        Field
                      </th>
                      <th scope="col" className="px-5 py-4 font-bold">
                        Type
                      </th>
                      <th scope="col" className="px-5 py-4 font-bold">
                        Category
                      </th>
                      <th scope="col" className="px-5 py-4 font-bold">
                        Format
                      </th>
                      <th scope="col" className="px-5 py-4 font-bold">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELDS.map((field) => (
                      <tr key={field.id} className="border-line-soft border-b last:border-b-0">
                        <th scope="row" className="px-5 py-4 align-top font-bold">
                          <span className="text-ink block">{field.name}</span>
                          <code className="font-mono text-ink-faint mt-[5px] block text-[11px] font-normal [overflow-wrap:anywhere]">
                            {field.id}
                          </code>
                        </th>
                        <td className="px-5 py-4 align-top">
                          {/* The reference tints dimensions blue and metrics mint. There is no mint
                              surface token and mint ink misses AA at this size, so the metric badge
                              takes the neutral pair -- the two are still told apart at a glance. */}
                          <span
                            className={`inline-block rounded-sm px-[7px] py-1 text-[10px] ${
                              field.kind === "dimension"
                                ? "bg-surface-inset text-accent"
                                : "bg-surface-subtle text-ink-muted border-line border"
                            }`}
                          >
                            {field.kind}
                          </span>
                        </td>
                        <td className="text-ink-muted px-5 py-4 align-top">{field.category}</td>
                        <td className="text-ink-muted px-5 py-4 align-top">{field.format}</td>
                        <td className="text-ink-muted px-5 py-4 align-top leading-[1.6]">
                          {field.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </section>

            <section
              id="understanding"
              aria-labelledby="understanding-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="understanding-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-normal tracking-[-0.02em] md:text-[26px]"
              >
                {UNDERSTANDING_HEADING}
              </h2>
              <dl>
                {UNDERSTANDING.map((entry) => (
                  <div key={entry.id} className="border-line-soft border-b py-[18px]">
                    <dt className="font-display text-ink text-base font-normal">{entry.term}</dt>
                    <dd className="text-ink-muted mt-2 ml-0 text-[15px] leading-[1.65]">
                      {entry.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section
              id="query-example"
              aria-labelledby="query-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="query-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-normal tracking-[-0.02em] md:text-[26px]"
              >
                {QUERY_HEADING}
              </h2>
              <p className="text-ink-muted text-[15px] leading-[1.65]">{QUERY_LEAD}</p>

              {/* The reference's panel carries a "Copy query" button, which needs a client handler
                  and a clipboard permission; a button that copies nothing is worse than a
                  selectable block, so the query is left plainly selectable instead. */}
              <div className="bg-surface-inverse mt-6 mb-4 overflow-hidden rounded-lg">
                <div className="border-ink-on-inverse/15 text-ink-on-inverse border-b px-[18px] py-[13px] text-[11px]">
                  {QUERY_CAPTION}
                </div>
                <pre className="text-ink-on-inverse overflow-x-auto p-[18px] text-[11px] leading-[1.85] md:p-[22px] md:text-xs">
                  <code className="font-mono">{QUERY}</code>
                </pre>
              </div>
              <p className="text-ink-muted text-xs leading-[1.6]">{QUERY_NOTE}</p>
            </section>

            <section
              id="sources"
              aria-labelledby="sources-heading"
              className="scroll-mt-9 pt-8 md:pt-[42px]"
            >
              <h2
                id="sources-heading"
                className="font-display text-ink mb-4 text-[25px] leading-[1.2] font-normal tracking-[-0.02em] md:text-[26px]"
              >
                {SOURCES_HEADING}
              </h2>
              <p className="text-ink-muted mb-6 text-[15px] leading-[1.65]">{SOURCES_LEAD}</p>
              <ul className="flex flex-col gap-2.5 text-[13px]">
                {SOURCE_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener"
                      className="text-accent hover:underline"
                    >
                      {link.label} <span aria-hidden="true">&#8599;</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </article>

          {/* The right rail repeats four of this page's own section links, so it carries its own
              label: two landmarks with the same name is what makes a duplicate rail confusing.
              `aria-hidden` is NOT used -- it would leave four focusable links in a hidden subtree. */}
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
