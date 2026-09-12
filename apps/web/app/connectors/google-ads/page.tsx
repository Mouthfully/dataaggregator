import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE GOOGLE ADS CONNECTOR PAGE, at /connectors/google-ads.
 *
 * THE LAYOUT IS `app/connectors/shopify/page.tsx`, DELIBERATELY AND ALMOST LINE FOR LINE: hero with
 * the connector's mark and a panel beside it, a destinations block, a "what you can see" grid, the
 * numbered setup sequence, and a closing note. That page transcribes the supplied `shopify.html`,
 * so matching it is how this page inherits the design rather than inventing a second one. Section
 * padding, heading sizes, the anchor strip, the `<details>` accordion and the two shared button
 * class strings are all copied from it on purpose; where the two differ, the difference is content.
 *
 * WHERE EVERY CLAIM CAME FROM, because the earlier failure on a sibling connector page was a
 * catalogue of invented field names that read exactly like a real one. Nothing below is written
 * from memory of the Google Ads API. Each constant carries the file it was read out of:
 *
 *   packages/connectors/src/sources/google_ads/normalize.ts   metrics, grains, dimensions, the
 *                                                             attribution label, the zero rule
 *   packages/connectors/src/sources/google_ads/client.ts      the API version, the credentials a
 *                                                             request carries, paging, the budget
 *   packages/connectors/src/sources/google_ads/fixtures.ts    every number in the hero panel
 *   packages/connections/src/connections.ts                   PROVIDER_LANES.google_ads -> ["oauth"]
 *   packages/contract/src/restatement.ts                      RESTATEMENT_CLOCKS.google_ads
 *   packages/contract/src/metrics.ts                          the canonical metric names and units
 *   packages/extract/src/capacity.ts                          GOOGLE_ADS_TIERS
 *   docs/marketplane/MVP-PLAN.md                              the verification timing, quoted
 *
 * THE PANEL SHOWS A FIXTURE, NOT AN INVENTED EXAMPLE. The Shopify page's hero figures are the
 * supplied design's own example numbers. There is no supplied design for this connector, so rather
 * than make some up, the panel renders the first result of `DAILY_CAMPAIGNS` from `fixtures.ts`
 * beside the envelope fields `normalizeGoogleAdsSearch` writes for it -- including the THB currency
 * and the Asia/Bangkok zone the fixture deliberately uses. The chip says where it came from, and
 * `fixtures.ts` says in its own module comment that these payloads are synthetic, which is why the
 * closing accordion says so too rather than letting the panel imply a live account.
 *
 * NO DESTINATION IS PROMISED THAT THE REPOSITORY DOES NOT HOLD. The Shopify page's destinations
 * block offers Sheets, Looker Studio and BigQuery because its reference HTML does; nothing in this
 * tree implements or claims them, so this page's equivalent block points only at routes that exist
 * -- /dashboard, /docs, /fields/google-ads, /integrations -- and its cards use the same outline
 * marks as the use-case grid rather than borrowing platform artwork for a destination that is not
 * one.
 *
 * THE ONE THING THIS CONNECTOR CANNOT DO IS SAID PLAINLY AND ONCE. `sources/google_ads/` holds
 * `client.ts` and `normalize.ts` and no `backfill.ts`, while `ga4/` and `woocommerce/` both have
 * one. So there is nothing for a scheduler to call, the hero's third reassurance says so, and the
 * first question in the accordion answers it. No section implies a refresh interval.
 *
 * COLOUR. No literal is written here. The gradient rule inside the panel is composed from the two
 * brand stops with Tailwind's gradient utilities, as on the Shopify page, and the closing panel
 * takes the pale-blue inset surface for the same reason recorded there.
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only. */
export const metadata: Metadata = {
  title: "Google Ads connector",
  description:
    "Account, campaign and ad group performance from Google Ads, normalised with its currency, its account time zone and its attribution label.",
  alternates: { canonical: "/connectors/google-ads" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below and reaches the page as {EXPRESSION}.
 * ------------------------------------------------------------------------------------------- */

/** `connectors.html` files this source under `data-category="Advertising"`. */
const HERO_EYEBROW = "Advertising connector";

const HERO_HEADING_TOP = "Your Google Ads data.";
const HERO_HEADING_BOTTOM = "Read the way Google reports it.";

/**
 * Every noun here is from `normalize.ts`: the three grains are `GOOGLE_ADS_LEVELS`, and currency,
 * timezone and attribution_window are the `dimensions` block every row carries.
 */
const HERO_LEAD =
  "Account, campaign and ad group performance, normalised into one row that carries its own currency, its account's time zone, and the attribution label behind every conversion.";

const HERO_PRIMARY_CTA = "Explore dashboard";
const HERO_SECONDARY_CTA = "See the field catalogue";

/**
 * Three facts, not three promises. OAuth is the only lane in `PROVIDER_LANES.google_ads`; 30 days
 * is `RESTATEMENT_CLOCKS.google_ads.windowDays`; and the third is the absence of a `backfill.ts`.
 */
const HERO_CHECKS = ["OAuth only", "30-day restatement window", "No scheduled pull yet"] as const;

/* The panel beside the hero. Everything in it is `fixtures.ts` plus what `normalize.ts` writes. */
const PANEL_LABEL = "One normalised row";
const PANEL_CHIP = "From the connector's fixtures";
const PANEL_FLOW_GRAINS = "account · campaign · ad group";

/** `DAILY_CAMPAIGNS.results[0].metrics.costMicros`, and the divisor named by `MICROS_PER_UNIT`. */
const PANEL_RAW_LABEL = "metrics.costMicros";
const PANEL_RAW_VALUE = "“1234560000”";
const PANEL_RAW_SCALE = "÷ 1,000,000";

/**
 * The first result of `DAILY_CAMPAIGNS`, after `normalizeGoogleAdsSearch`. Cost is the micros value
 * above divided by a million; impressions and conversions are the fixture's own values, and
 * conversions is fractional there because attribution credits fractions of one.
 */
const PANEL_STATS = [
  { label: "spend", value: "1,234.56" },
  { label: "impressions", value: "18,422" },
  { label: "conversions", value: "37.5" },
] as const;

/** The envelope fields `normalize.ts` writes for that row, in the order the object builds them. */
const PANEL_ROW = [
  { key: "source", value: "google_ads" },
  { key: "entity", value: "campaign 22001" },
  { key: "date", value: "2026-08-14" },
  { key: "currency", value: "THB" },
  { key: "timezone", value: "Asia/Bangkok" },
  { key: "attribution", value: "account_default" },
] as const;

/** The anchors under the hero, in page order. */
const SECTION_LINKS = [
  { href: "#destinations", label: "Where rows go" },
  { href: "#what-you-see", label: "What you can see" },
  { href: "#reads", label: "What it reads" },
  { href: "#setup", label: "Getting started" },
  { href: "#connector-faq", label: "Good to know" },
] as const;

/* Destinations. */
const DESTINATIONS_EYEBROW = "Where a row goes next";
const DESTINATIONS_HEADING = "Four places to look.";
const DESTINATIONS_LEAD =
  "Each of these is a page in this build, not a planned one. Nothing else is offered.";

/**
 * Only routes that exist in `apps/web/app`. The first card names the product, which may not be
 * typed as a literal outside the brand package, so it is composed from `brand.productName`.
 * `path` is the outline mark, drawn in the same 24-unit box as the use-case grid.
 */
const DESTINATIONS = [
  {
    id: "dashboard",
    title: `${brand.productName} dashboard`,
    body: "The reporting surface the workspace opens on.",
    cta: "Open the preview",
    href: "/dashboard",
    path: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    id: "envelope",
    title: "One row shape",
    body: "Every source in this build emits the same envelope row, so Google Ads sits beside the others without a second schema.",
    cta: "Read the documentation",
    href: "/docs",
    path: "M4 7h16v13H4zM4 7l8 6 8-6M4 4h16",
  },
  {
    id: "fields",
    title: "Field catalogue",
    body: "The Google Ads metrics and dimensions, field by field, with an example query.",
    cta: "Browse the fields",
    href: "/fields/google-ads",
    path: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  },
  {
    id: "integrations",
    title: "Every source",
    body: "The rest of the connected platforms, and what each one is for.",
    cta: "See all integrations",
    href: "/integrations",
    path: "M3 5h18M3 12h18M3 19h18M8 2v6m8 10v4",
  },
] as const;

/* What you can see. */
const WHAT_EYEBROW = "Six things the normaliser guarantees";
const WHAT_HEADING = "Numbers that survive the trip.";
const WHAT_LEAD =
  "Each card below is a rule the connector enforces on every row, and each one exists because getting it wrong produces a plausible number rather than an error.";

/**
 * Six cards, each one a documented behaviour of `normalize.ts` or `client.ts`. The bodies are
 * descriptions of code in this repository, not of the Google Ads API in general.
 */
const WHAT_YOU_SEE = [
  {
    title: "Spend in the account's currency",
    body: "Google reports cost in millionths of a currency unit. The value is divided by 1,000,000, and a figure that has already lost digits on the way through a number is refused rather than divided.",
    path: "M12 2v20M17 6a5 5 0 0 0-5-2c-3 0-5 1.5-5 4s2 3.5 5 4 5 1.5 5 4-2 4-5 4a5 5 0 0 1-5-2",
  },
  {
    title: "Counts parsed, never coerced",
    body: "Impressions and clicks arrive as decimal strings. They are parsed explicitly, and a value that is not a number is refused, because a wrong zero is indistinguishable from a real one.",
    path: "M9 7h6M9 12h6M9 17h3M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  },
  {
    title: "Conversions carry their window",
    body: "Conversions and conversion value are labelled account_default, because the Google Ads lookback is a per-account, per-conversion-action setting that the response never states on the row.",
    path: "M12 2a10 10 0 1 0 10 10h-10V2Z",
  },
  {
    title: "Three grains, one parent",
    body: "Account, campaign and ad group. An ad group row selects the campaign id alongside it rather than parsing one out of a resource name, so the two levels line up.",
    path: "M12 3v4m0 0-6 4m6-4 6 4M3 11h6v4H3zm12 0h6v4h-6zM9 17h6v4H9z",
  },
  {
    title: "A real zero, kept",
    body: "A campaign that spent nothing has no cost field at all in the response. The field mask says the query asked for it, so it is recorded as zero instead of quietly disappearing from the report.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  },
  {
    title: "Provisional until it is not",
    body: "Every row carries the date it stops being open to restatement, and whether it is still open is derived from that date rather than asserted when the row is written.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  },
] as const;

/* What it reads. */
const READS_EYEBROW = "The mapping, in full";
const READS_HEADING = "What the connector actually reads.";
const READS_LEAD =
  "Five metrics and four dimensions, beside the account id the upsert key needs. This is the whole list; the connector refuses anything it has no dictionary entry for.";

/** `client.ts` pins `GOOGLE_ADS_API_VERSION`. Not a sentence, so it is a caption rather than copy. */
const READS_API_VERSION = "Google Ads API v21";

const METRIC_TABLE_CAPTION = "Metrics, with their canonical name and scale";

/**
 * `GOOGLE_ADS_METRIC_MAP` joined to `METRICS`: the left column is the GAQL path the map is keyed
 * on, the middle the canonical name it maps to, the right the unit that name declares. `scale` is
 * the map's own `micros` flag, which is true for cost and false for everything else -- including
 * conversion value, which is reported in whole currency units on the same row.
 */
const METRIC_ROWS = [
  {
    field: "metrics.cost_micros",
    metric: "spend",
    unit: "currency",
    scale: "micros",
  },
  {
    field: "metrics.impressions",
    metric: "impressions",
    unit: "count",
    scale: "as reported",
  },
  {
    field: "metrics.clicks",
    metric: "clicks",
    unit: "count",
    scale: "as reported",
  },
  {
    field: "metrics.conversions",
    metric: "conversions",
    unit: "count",
    scale: "as reported",
  },
  {
    field: "metrics.conversions_value",
    metric: "conversions_value",
    unit: "currency",
    scale: "as reported",
  },
] as const;

const DIMENSION_TABLE_CAPTION = "Dimensions, and the field each one is read from";

/** The `dimensions` and `entity` fields `normalizeGoogleAdsSearch` writes, and their sources. */
const DIMENSION_ROWS = [
  {
    row: "date",
    field: "segments.date",
    note: "A calendar day in the account's own time zone",
  },
  {
    row: "currency",
    field: "customer.currency_code",
    note: "Must be selected, never defaulted",
  },
  {
    row: "timezone",
    field: "customer.time_zone",
    note: "Without it the date has no meaning",
  },
  {
    row: "account_id",
    field: "customer.id",
    note: "Entity field, not a dimension. Half of the upsert key.",
  },
  {
    row: "attribution_window",
    field: "set by the connector",
    note: "Always account_default, including on rows with no conversion metric",
  },
] as const;

/** Both are decisions recorded in `normalize.ts`, not omissions. */
const READS_EXCLUSIONS = [
  "metrics.all_conversions is deliberately unmapped. It counts every conversion action, including those excluded from the Conversions column, so mapping it onto conversions would put two different numbers in one column.",
  "Ad, keyword and search term grains are not read. A search term is free text a person typed into Google, and the redaction policy for this source declares it free of contact data.",
] as const;

const READS_LINK_LABEL = "Open the Google Ads field catalogue";

/* Getting started. */
const SETUP_EYEBROW = "What a connection needs";
const SETUP_HEADING = "Four things before a query runs.";
const SETUP_LEAD = "Two credentials, one account number, and a query that pages itself.";

const SETUP_STEPS = [
  {
    title: "Authorise with Google",
    body: "OAuth is the only lane this provider offers. There is no long-lived token to paste, so a connection is made by sending an account owner through Google's consent screen.",
  },
  {
    title: "Add the workspace's developer token",
    body: "Every Google Ads call carries a developer token as well as the access token. It belongs to the workspace, because Google's policy forbids a third party standing in for one.",
  },
  {
    title: "Name the account",
    body: "The customer id is digits only. The dashed form shown in Google's interface is refused before a request is issued, because a rejected request still spends an operation.",
  },
  {
    title: "Run the query",
    body: "A page is fetched, the next page token is followed, and the pull stops while a tenth of the day's operations remains rather than spending the last of a shared ceiling.",
  },
] as const;

/** The honest line, once, directly under the steps. */
const SETUP_LIMIT =
  "The source ships a client and a normaliser and no backfill module, so a pull is run on request. It cannot be scheduled yet.";

/* Good to know. */
const FAQ_EYEBROW = "Good to know";
const FAQ_HEADING_TOP = "The parts that are";
const FAQ_HEADING_BOTTOM = "not finished yet.";
const FAQ_LINK_LABEL = "Read the documentation";

/**
 * Seven answers, each traceable. The verification timing is QUOTED from `MVP-PLAN.md` rather than
 * paraphrased into a duration, because the plan's whole point is that the documented figure and the
 * observed one disagree.
 */
const FAQS = [
  {
    question: "Can this connector run on a schedule?",
    answer:
      "Not yet. The source directory holds a client and a normaliser and no backfill module, so there is nothing for the scheduler to call. Two other sources in this build have one; this is not one of them.",
  },
  {
    question: "How long can a Google Ads number still change?",
    answer:
      "Thirty days, read per account. The click-through window is set per conversion action, defaults to 30 days and caps at 90, so an account running the maximum stays open three times as long as the default assumes.",
  },
  {
    question: "Is that window a service level?",
    answer:
      "No. The clock note records that no authoritative freshness or finalisation statement was found across three attempts, so thirty days is an upper bound rather than a documented guarantee.",
  },
  {
    question: "What does a row say about its own freshness?",
    answer:
      "It carries when it was fetched, when it stops being open to restatement, and whether it still is. The field for when the platform last updated it is null, because copying the fetch time there would manufacture the statement the research could not find.",
  },
  {
    question: "Is there a daily limit?",
    answer:
      "Google counts operations per developer token rather than per account. Explorer access allows 2,880 a day and Basic 15,000, Standard is unlimited, and a request Google rejected still counts against the total.",
  },
  {
    question: "How long does Google's verification take?",
    answer:
      "The build plan records Google's verification as documented at 3–5 days and observed at over ten weeks, which is why the Google sources are kept off the critical path.",
  },
  {
    question: "Are the example payloads real?",
    answer:
      "No. The fixtures are synthetic, written from the documented response shape, and the module says they must be replaced with a recorded response from a real account before the connector ships.",
  },
] as const;

/* The closing panel. */
const FINAL_HEADING = "Google Ads, without the micros.";
const FINAL_LEAD = "Every number says where it came from and how long it can still move.";
const FINAL_CTA = "Read the field catalogue";

/** Shared class strings, so the hero buttons and the closing one cannot drift apart. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const TEXT_LINK = "text-accent inline-flex items-center gap-3 text-sm font-bold hover:underline";
const EYEBROW = "text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs";
const SECTION_HEADING =
  "font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-normal tracking-[-0.02em] md:text-[38px]";
const TABLE_HEAD = "text-ink-subtle border-line border-b px-4 py-3 text-left font-bold";
const TABLE_CELL = "border-line-soft text-ink-muted border-b px-4 py-3 align-top";

export default function GoogleAdsConnectorPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO. The Shopify page's `.connector-intro`: breadcrumb, then a 1fr/1fr split that
            collapses below 768px. */}
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
              <li aria-current="page">Google Ads</li>
            </ol>
          </nav>

          <div className="mt-9 grid items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-3">
                {/* Decorative: the eyebrow and the h1 beside it both name the platform. */}
                <img
                  src="/platforms/googleads.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <span className="text-ink-subtle text-[11px] font-bold tracking-[0.12em] uppercase">
                  {HERO_EYEBROW}
                </span>
              </div>

              <h1 className="font-display text-ink text-[36px] leading-[1.06] font-normal tracking-[-0.04em] md:text-[42px] lg:text-[48px]">
                {HERO_HEADING_TOP}
                <br />
                <span className="brand-gradient-text">{HERO_HEADING_BOTTOM}</span>
              </h1>

              <p className="text-ink-muted mt-6 max-w-[475px] text-base leading-[1.65] md:text-[17px]">
                {HERO_LEAD}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a href="/dashboard" className={PRIMARY_BUTTON}>
                  {HERO_PRIMARY_CTA}
                  <span aria-hidden="true">&rarr;</span>
                </a>
                <a
                  href="/fields/google-ads"
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

            {/* THE FIXTURE PANEL. A large feature panel, so it takes the 24px radius. */}
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
                    src="/platforms/googleads.svg"
                    alt="Google Ads"
                    width={58}
                    height={58}
                    className="h-[45px] w-[45px] object-contain md:h-[58px] md:w-[58px]"
                  />
                  <strong className="text-ink text-center text-sm">Google Ads</strong>
                </div>

                {/* The track. The grain caption sits over a mint-to-blue rule; the arrow is
                    decorative, the caption carries the meaning. */}
                <div className="min-w-0 flex-1 px-2 text-center">
                  <span className="text-ink-faint text-[8px] md:text-[9px]">
                    {PANEL_FLOW_GRAINS}
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
                  <strong className="text-ink text-center text-sm">{brand.productName}</strong>
                </div>
              </div>

              {/* The micros conversion, which is the single most consequential thing this
                  normaliser does, shown on the fixture's own value. */}
              <p className="border-line bg-surface-subtle text-ink-muted font-mono flex items-center gap-2 rounded-lg border p-3 text-[10px] md:text-[11px]">
                <span
                  aria-hidden="true"
                  className="bg-brand-mint h-1.5 w-1.5 shrink-0 rounded-full"
                />
                <span className="text-ink-faint">{PANEL_RAW_LABEL}</span>
                <span className="min-w-0 truncate">{PANEL_RAW_VALUE}</span>
                <span className="text-ink-faint ml-auto shrink-0">{PANEL_RAW_SCALE}</span>
              </p>

              <dl className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
                {PANEL_STATS.map((stat) => (
                  <div key={stat.label} className="min-w-0">
                    <dt className="text-ink-faint font-mono text-[10px]">{stat.label}</dt>
                    <dd className="font-display text-ink mt-1 text-lg font-normal md:text-[22px]">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="bg-surface-subtle text-ink-muted font-mono mt-6 rounded-lg p-4 text-[10px] leading-[1.9] md:text-[11px]">
                {PANEL_ROW.map((line) => (
                  <div key={line.key} className="flex gap-2">
                    <dt className="text-ink-faint w-[75px] shrink-0 md:w-[92px]">{line.key}</dt>
                    <dd className="min-w-0 break-words">{line.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* The in-page anchors. A scroller on a phone, so the five never wrap into a stack. */}
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
            <span className={EYEBROW}>{DESTINATIONS_EYEBROW}</span>
            <h2 id="destinations-heading" className={SECTION_HEADING}>
              {DESTINATIONS_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {DESTINATIONS_LEAD}
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-[18px] lg:grid-cols-4">
            {DESTINATIONS.map((destination) => (
              <li
                key={destination.id}
                className="border-line bg-surface flex flex-col items-start rounded-lg border p-5 md:p-[22px]"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="30"
                  height="30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="text-brand-blue block"
                >
                  <path d={destination.path} />
                </svg>
                <h3 className="font-display text-ink mt-5 mb-3 text-base leading-[1.3] font-normal tracking-[-0.01em] md:mt-6 md:text-[18px]">
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

        {/* WHAT YOU CAN SEE -- a full-bleed tinted band, as the Shopify page's `.soft-section`. */}
        <section
          id="what-you-see"
          aria-labelledby="what-you-see-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
              <span className={EYEBROW}>{WHAT_EYEBROW}</span>
              <h2 id="what-you-see-heading" className={SECTION_HEADING}>
                {WHAT_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {WHAT_LEAD}
              </p>
            </div>

            <ul className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-[30px]">
              {WHAT_YOU_SEE.map((item) => (
                <li
                  key={item.title}
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
                    <path d={item.path} />
                  </svg>
                  <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-normal tracking-[-0.01em]">
                    {item.title}
                  </h3>
                  <p className="text-ink-muted text-[15px] leading-[1.7]">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* WHAT IT READS. Two real data tables, each in its own horizontal scroller so the page
            body never scrolls sideways on a phone. */}
        <section
          id="reads"
          aria-labelledby="reads-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mb-8 max-w-[720px] md:mb-10">
            <span className={EYEBROW}>{READS_EYEBROW}</span>
            <h2 id="reads-heading" className={SECTION_HEADING}>
              {READS_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {READS_LEAD}
            </p>
            <p className="border-line text-ink-subtle mt-5 inline-block rounded-md border px-3 py-1.5 text-xs">
              {READS_API_VERSION}
            </p>
          </div>

          <div className="border-line bg-surface overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <caption className="text-ink-subtle px-4 pt-4 pb-3 text-left text-xs">
                {METRIC_TABLE_CAPTION}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={TABLE_HEAD}>
                    Google Ads field
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Canonical metric
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Unit
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Scale
                  </th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => (
                  <tr key={row.field}>
                    <th scope="row" className={`${TABLE_CELL} text-ink font-mono font-normal`}>
                      {row.field}
                    </th>
                    <td className={`${TABLE_CELL} font-mono`}>{row.metric}</td>
                    <td className={TABLE_CELL}>{row.unit}</td>
                    <td className={TABLE_CELL}>{row.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-line bg-surface mt-5 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <caption className="text-ink-subtle px-4 pt-4 pb-3 text-left text-xs">
                {DIMENSION_TABLE_CAPTION}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={TABLE_HEAD}>
                    Row field
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Read from
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Why it is required
                  </th>
                </tr>
              </thead>
              <tbody>
                {DIMENSION_ROWS.map((row) => (
                  <tr key={row.row}>
                    <th scope="row" className={`${TABLE_CELL} text-ink font-mono font-normal`}>
                      {row.row}
                    </th>
                    <td className={`${TABLE_CELL} font-mono`}>{row.field}</td>
                    <td className={TABLE_CELL}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-6 grid gap-3 md:grid-cols-2 md:gap-4">
            {READS_EXCLUSIONS.map((note) => (
              <li
                key={note}
                className="border-line text-ink-subtle rounded-lg border border-dashed px-5 py-4 text-[13px] leading-[1.65]"
              >
                {note}
              </li>
            ))}
          </ul>

          <a href="/fields/google-ads" className={`${TEXT_LINK} mt-6`}>
            {READS_LINK_LABEL}
            <span aria-hidden="true">&rarr;</span>
          </a>
        </section>

        {/* GETTING STARTED. An ordered list, because the four steps ARE a sequence: the numerals
            are content, so they come from <ol> rather than from a typed digit a screen reader
            would announce as part of the heading. */}
        <section
          id="setup"
          aria-labelledby="setup-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
            <span className={EYEBROW}>{SETUP_EYEBROW}</span>
            <h2 id="setup-heading" className={SECTION_HEADING}>
              {SETUP_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {SETUP_LEAD}
            </p>
          </div>

          <ol className="grid gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-4 lg:gap-[38px]">
            {SETUP_STEPS.map((step, index) => (
              <li key={step.title} className="relative min-w-0 pl-[60px] md:pl-0">
                {/* A duplicate of the list's own numbering, so it is hidden from assistive
                    technology rather than announced twice. */}
                <span
                  aria-hidden="true"
                  className="bg-surface-inset text-accent absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-full text-[17px] font-bold md:static md:mb-5"
                >
                  {index + 1}
                </span>
                <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-normal tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className="text-ink-muted text-[15px] leading-[1.7]">{step.body}</p>
              </li>
            ))}
          </ol>

          {/* The one limitation, said once and not implied away anywhere else on the page. */}
          <p className="border-line bg-surface-subtle text-ink-muted mt-8 rounded-lg border px-5 py-4 text-sm leading-[1.65] md:mt-10">
            {SETUP_LIMIT}
          </p>
        </section>

        {/* GOOD TO KNOW. Native <details>, which already owns the disclosure semantics and keyboard
            behaviour an accordion needs, so no script is involved. */}
        <section
          id="connector-faq"
          aria-labelledby="faq-heading"
          className="mx-auto grid max-w-[1200px] items-start gap-8 px-8 pt-10 pb-12 md:grid-cols-2 md:gap-10 md:pb-20 lg:gap-20"
        >
          <div className="min-w-0">
            <span className={EYEBROW}>{FAQ_EYEBROW}</span>
            <h2
              id="faq-heading"
              className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-normal tracking-[-0.03em] md:text-[36px]"
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

        {/* THE CLOSING PANEL. The pale-blue inset surface, which is the token that already carries
            "soft feature background". */}
        <section
          aria-labelledby="final-cta-heading"
          className="mx-auto max-w-[1200px] px-8 pb-12 md:pb-[70px]"
        >
          <div className="bg-surface-inset flex flex-col gap-6 rounded-xl p-8 md:flex-row md:items-center md:justify-between md:p-12">
            <div className="min-w-0">
              <h2
                id="final-cta-heading"
                className="font-display text-ink mb-2.5 text-[28px] leading-[1.16] font-normal tracking-[-0.02em] md:text-[30px]"
              >
                {FINAL_HEADING}
              </h2>
              <p className="text-ink-muted leading-[1.65]">{FINAL_LEAD}</p>
            </div>
            <a
              href="/fields/google-ads"
              className={`${PRIMARY_BUTTON} shrink-0 self-start md:self-auto`}
            >
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
