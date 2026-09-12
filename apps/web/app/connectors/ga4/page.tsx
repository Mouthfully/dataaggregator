import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE GA4 CONNECTOR PAGE, at /connectors/ga4. `app/integrations/page.tsx` already links here under
 * the Analytics category, which is the category `connectors.html` files Google Analytics under.
 *
 * THE LAYOUT IS `app/connectors/shopify/page.tsx`, DELIBERATELY AND ALMOST LINE FOR LINE: a hero
 * with the connector's mark and a panel beside it, the anchor strip, a destinations block, a "what
 * you can see" band, a data section, the numbered setup sequence, the `<details>` accordion and a
 * closing note. That page transcribes the supplied `shopify.html`, so matching it is how this page
 * inherits the design rather than inventing a second one. Section padding, heading sizes and the
 * two shared button class strings are copied from it on purpose; where the pages differ, the
 * difference is content. The sibling `connectors/google-ads/page.tsx` made the same choice, and the
 * shared class strings below are kept identical to it so the two cannot drift apart.
 *
 * ONE SECTION EXISTS HERE THAT NEITHER SIBLING HAS: `#window`. GA4 is the source whose restatement
 * clock and backfill module are the interesting facts about it, and burying either in an accordion
 * answer would have meant stating the number without the caveat Google attaches to it.
 *
 * WHERE EVERY CLAIM CAME FROM, because the failure this page is written against is a sibling
 * connector page that invented a catalogue of field names reading exactly like a real one. Nothing
 * below is written from memory of the GA4 API. Each constant carries the file it was read out of:
 *
 *   packages/connectors/src/sources/ga4/normalize.ts   GA4_METRIC_MAP, the entity type, the
 *                                                      dimensions block, the four traps, the nulls
 *   packages/connectors/src/sources/ga4/client.ts      the endpoint, paging, the page size, the
 *                                                      quota floor, whose quota it is
 *   packages/connectors/src/sources/ga4/backfill.ts    GA4_DEFAULT_REPORT, the inclusive date
 *                                                      range, the quota-stop rule
 *   packages/connectors/src/sources/ga4/fixtures.ts    every number in the hero panel
 *   packages/extract/src/backfill.ts                   planBackfill: how a date range is chunked
 *   packages/connections/src/connections.ts            PROVIDER_LANES.ga4 -> ["oauth"]
 *   packages/contract/src/restatement.ts               RESTATEMENT_CLOCKS.ga4 and its note
 *   packages/contract/src/metrics.ts                   the canonical metric names and their units
 *   packages/contract/src/registry.ts                  the GA4 field dispositions
 *   packages/oauth/src/providers.ts                    the scope, its sensitivity, the auth params
 *
 * ANYTHING NOT IN THOSE FILES IS NOT ON THIS PAGE. GA4 exposes hundreds of dimensions; this
 * connector reads one, and the page says one. A "channels and landing pages" line would have been
 * easy to justify from the scope description in `providers.ts` and would have been false about the
 * code, which is the exact shape of the mistake being avoided.
 *
 * THE PANEL SHOWS A FIXTURE, NOT AN INVENTED EXAMPLE. There is no supplied design for this
 * connector, so the panel renders the first row of `DAILY_SESSIONS` from `fixtures.ts` beside the
 * envelope fields `normalizeGa4Report` writes for it, including the fixture's own EUR and
 * Europe/Berlin. The chip says where the numbers came from, and `fixtures.ts` records that these
 * payloads are synthetic -- which is why the accordion says so too, rather than letting the panel
 * imply a live property.
 *
 * NO DESTINATION IS PROMISED THAT THIS BUILD DOES NOT HOLD. The Shopify page offers Sheets, Looker
 * Studio and BigQuery because its reference HTML does; nothing in this tree implements them, so the
 * block here points only at routes that exist in `apps/web/app`.
 *
 * COLOUR. No literal is written here. The gradient rule inside the panel is composed from the two
 * brand stops with Tailwind's gradient utilities, as on the Shopify page, and the closing panel
 * takes the pale-blue inset surface, which is the token that already carries "soft feature
 * background".
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only. */
export const metadata: Metadata = {
  title: "GA4 connector",
  description:
    "Sessions, conversions and conversion value from one GA4 property, carrying the property's own currency, its time zone, and the twelve days each number can still move.",
  alternates: { canonical: "/connectors/ga4" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below and reaches the page as {EXPRESSION}. Eyebrows
 * are stored in sentence case because the capitals are CSS, as every sibling page already does.
 * ------------------------------------------------------------------------------------------- */

/** `connectors.html` files Google Analytics under `data-category="Analytics"`. */
const HERO_EYEBROW = "Analytics connector";

const HERO_HEADING_TOP = "Your GA4 sessions.";
const HERO_HEADING_BOTTOM = "With the clock still attached.";

/**
 * Every noun here is from the connector. The three metrics are `GA4_DEFAULT_REPORT.metrics` mapped
 * through `GA4_METRIC_MAP`; currency, timezone and the restatement date are the `dimensions` block
 * and the `restates_until` field that `normalizeGa4Report` writes on every row.
 */
const HERO_LEAD =
  "Sessions, conversions and conversion value from one property, normalised into rows that carry the property's own currency, its own time zone, and the date each number stops being open to change.";

const HERO_PRIMARY_CTA = "Explore dashboard";
const HERO_SECONDARY_CTA = "See what it reads";

/**
 * Three facts, not three promises. OAuth is the only entry in `PROVIDER_LANES.ga4`; twelve days is
 * `RESTATEMENT_CLOCKS.ga4.windowDays`; and the third is the presence of `sources/ga4/backfill.ts`.
 */
const HERO_CHECKS = ["OAuth only", "12-day restatement window", "Walks a date range"] as const;

/* The panel beside the hero. Everything in it is `fixtures.ts` plus what `normalize.ts` writes. */
const PANEL_LABEL = "One normalised row";
const PANEL_CHIP = "From the connector's fixtures";

/** `GA4_DEFAULT_REPORT.metrics`, in the order `backfill.ts` lists them. */
const PANEL_FLOW_METRICS = "sessions · conversions · totalRevenue";

/**
 * The first row of `DAILY_SESSIONS`. GA4 returns every metric value as a STRING -- the quotes are
 * the fixture's own -- and `parseGa4Number` refuses a value that does not parse rather than
 * coercing it to zero.
 */
const PANEL_RAW_LABEL = "metricValues[0]";
const PANEL_RAW_VALUE = "“1284”";
const PANEL_RAW_NOTE = "parsed, never coerced";

/** The two metrics on that fixture row, under their canonical names from `GA4_METRIC_MAP`. */
const PANEL_STATS = [
  { label: "sessions", value: "1,284" },
  { label: "conversions", value: "37" },
] as const;

/**
 * The envelope fields `normalizeGa4Report` writes for that row, in the order the object builds
 * them. `entity` is the documented example property id from the `propertyId` JSDoc; `date` is the
 * fixture's `20260814` after `parseGa4Date`; currency and timezone are its `metadata`; `attribution`
 * is the fixed `model` label; `source_updated_at` is null because GA4 publishes no per-row
 * last-updated timestamp and copying the fetch time there would assert a freshness it never gave.
 */
const PANEL_ROW = [
  { key: "source", value: "ga4" },
  { key: "entity.type", value: "property" },
  { key: "entity.id", value: "properties/123456" },
  { key: "date", value: "2026-08-14" },
  { key: "currency", value: "EUR" },
  { key: "timezone", value: "Europe/Berlin" },
  { key: "attribution", value: "model" },
  { key: "source_updated_at", value: "null" },
] as const;

/** The anchors under the hero, in page order. */
const SECTION_LINKS = [
  { href: "#destinations", label: "Where rows go" },
  { href: "#what-you-see", label: "What you can see" },
  { href: "#reads", label: "What it reads" },
  { href: "#window", label: "The 12-day window" },
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
 * typed as a literal outside the brand package -- `scripts/check-brand.mjs` enforces that -- so it
 * is composed from `brand.productName`, which is already capitalised correctly and is not
 * transformed here. `path` is an outline mark drawn in the same 24-unit box as the card grid below.
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
    body: "Every source in this build emits the same envelope row, so a session sits beside a click without a second schema.",
    cta: "Read the documentation",
    href: "/docs",
    path: "M4 7h16v13H4zM4 7l8 6 8-6M4 4h16",
  },
  {
    id: "google-ads",
    title: "Spend beside sessions",
    body: "The other Google source here reads campaign performance onto the same row shape, with its own clock and its own attribution label.",
    cta: "See the Google Ads connector",
    href: "/connectors/google-ads",
    path: "M3 17l6-6 4 4 7-7M14 8h7v7",
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
const WHAT_EYEBROW = "Six rules the normaliser enforces";
const WHAT_HEADING = "Numbers that survive the trip.";
const WHAT_LEAD =
  "Each card below is a rule this connector applies to every row, and each one exists because getting it wrong produces a plausible number rather than an error.";

/**
 * Six cards, each one a documented behaviour of `normalize.ts` or `client.ts`. The bodies describe
 * code in this repository, not the GA4 API in general.
 */
const WHAT_YOU_SEE = [
  {
    title: "String values, parsed",
    body: "GA4 returns every metric value as a string. Each one is parsed explicitly, and a value that is not a number is refused rather than coerced, because a wrong zero is indistinguishable from a real one.",
    path: "M9 7h6M9 12h6M9 17h3M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  },
  {
    title: "Dates that mean a day",
    body: "GA4 writes a date as eight digits with no separators. It is split into a calendar date rather than handed to a parser that would read it as something else entirely.",
    path: "M7 3v4m10-4v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  },
  {
    title: "The property's currency and clock",
    body: "Both arrive in the response metadata rather than in the request. A report carrying neither is refused, because defaulting them would label a property's revenue as one currency when it is reported in another.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  },
  {
    title: "A conversion that says what it is",
    body: "GA4 has no selectable attribution window; it adjusts at model level. Every row is labelled for that rather than left blank, because an unlabelled conversion count is the row the envelope is right to refuse.",
    path: "M12 2a10 10 0 1 0 10 10h-10V2Z",
  },
  {
    title: "Provisional until it is not",
    body: "Every row carries the date it stops being open to restatement, and whether it is still open is derived from that date rather than asserted when the row is written.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12l3 3 5-6",
  },
  {
    title: "A whole report, or none",
    body: "Values arrive positionally, so a row with more values than headers is refused. So is a page that returns nothing while more rows remain, because half a report handed over as a whole one is the failure this connector exists to prevent.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  },
] as const;

/* What it reads. */
const READS_EYEBROW = "The mapping, in full";
const READS_HEADING = "What the connector actually reads.";
const READS_LEAD =
  "Five GA4 metric names, three canonical columns, and one dimension. This is the whole list; anything without a dictionary entry is refused rather than passed through.";

/** `client.ts` pins `GA4_DATA_API_BASE`. Not a sentence, so it is a caption rather than copy. */
const READS_API = "Data API v1beta · runReport";

const METRIC_TABLE_CAPTION = "GA4 metric names, and the canonical column each one maps to";

/**
 * `GA4_METRIC_MAP` joined to `METRICS`. The left column is the name GA4 uses, the middle the
 * canonical column it maps to, the right the unit that column declares. The three revenue names are
 * the map's own many-to-one case, which `registry.ts` annotates as "one of three GA4 names for the
 * same canonical quantity". `sessions` is marked as an addition because `metrics.ts` records it as
 * one: the upstream dictionary is ad-centric and has no analytics grain.
 */
const METRIC_ROWS = [
  {
    field: "sessions",
    metric: "sessions",
    unit: "count",
    note: "Added to the shared dictionary for this source",
  },
  {
    field: "conversions",
    metric: "conversions",
    unit: "count",
    note: "Meaningless without an attribution label, so it carries one",
  },
  {
    field: "totalRevenue",
    metric: "conversions_value",
    unit: "currency",
    note: "The one revenue metric the default report asks for",
  },
  {
    field: "purchaseRevenue",
    metric: "conversions_value",
    unit: "currency",
    note: "Same canonical column; request one of the three, never two",
  },
  {
    field: "eventValue",
    metric: "conversions_value",
    unit: "currency",
    note: "Same canonical column; request one of the three, never two",
  },
] as const;

const DIMENSION_TABLE_CAPTION = "The rest of the row, and where each part is read from";

/** The `entity`, `dimensions` and freshness fields `normalizeGa4Report` writes, and their sources. */
const DIMENSION_ROWS = [
  {
    row: "date",
    field: "dimension: date",
    note: "The only dimension the default report requests, and the one field the normaliser refuses a report without",
  },
  {
    row: "currency",
    field: "metadata.currencyCode",
    note: "Read from the property, never defaulted",
  },
  {
    row: "timezone",
    field: "metadata.timeZone",
    note: "Read from the property, never defaulted",
  },
  {
    row: "entity.type",
    field: "set by the connector",
    note: "Always property: a GA4 row belongs to a property, not to a campaign",
  },
  {
    row: "attribution_window",
    field: "set by the connector",
    note: "Always model, which is a label for what GA4 did rather than an absence",
  },
  {
    row: "source_updated_at",
    field: "not published by GA4",
    note: "Null, because copying the fetch time here would assert a freshness the platform never reported",
  },
] as const;

/** Both are decisions recorded in `normalize.ts`, not omissions. */
const READS_EXCLUSIONS = [
  "A metric with no dictionary entry is refused before any row is emitted, so a gap in the vocabulary is a visible failure rather than a partly populated row. The connector's own fixture for this is a bounce rate.",
  "Two GA4 names for one canonical column are refused together. Asking for total revenue and purchase revenue in the same report would write both into one key and silently keep the second, so the caller is made to choose.",
] as const;

/* The restatement window. */
const WINDOW_EYEBROW = "Why a number moves after the day ends";
const WINDOW_HEADING = "Twelve days, and what they are not.";
const WINDOW_LEAD =
  "GA4 keeps adjusting attribution credit after a day closes, so yesterday's figure is not finished. Every row says so in a field rather than leaving a reader to find out a week later.";

/**
 * The window and its caveat, from `RESTATEMENT_CLOCKS.ga4`. The caveat is Google's own wording as
 * the clock note quotes it, and the note's last clause -- "so it must never be sold as one" -- is
 * why this block exists on the page at all instead of a bare "12-day freshness" badge.
 */
const WINDOW_POINTS = [
  {
    title: "The window",
    body: "Attribution credit can change for up to twelve days. That is the figure the restatement clock carries for this source, and it is fixed rather than read per account.",
  },
  {
    title: "The caveat, in Google's words",
    body: "Google adds that this is not a guarantee, nor a service level agreement, nor a service level objective. It is recorded that way in the clock note so that nothing built on it can be sold as one.",
  },
  {
    title: "What the clock is anchored to",
    body: "A row stays open until twelve days after the later of the day it describes and the moment it was first seen. The anchor is written once and never updated, because anchoring to the last fetch would push the date forward every night and no row would ever become final.",
  },
  {
    title: "What the row says about itself",
    body: "Whether a row is still open is derived from that date and the time of the pull, not asserted when the row is written. A hard-coded answer would be right today and quietly wrong the day the window changes.",
  },
] as const;

/* The backfill, which is the other half of the same section. */
const BACKFILL_LABEL = "How a date range is walked";

/**
 * `sources/ga4/backfill.ts` is one of only two backfill modules in the source tree. It consumes the
 * windows `planBackfill` produces, which is where the chunking lives: `packages/extract/src/
 * backfill.ts` emits one window covering everything on a first run, then one window per day for the
 * four most recent days, then chunks of seven days back to the edge of the source's restatement
 * window -- newest first, so a run cut short has already done the days most likely to have moved.
 * Each window becomes one `runReport` with an inclusive date range at both ends.
 */
const BACKFILL_STEPS = [
  "A first pull is one window covering the whole available history, because the initial load is a bulk read.",
  "After that, one window per day for the four most recent days: these change most and are cheapest to re-pull.",
  "Then chunks of seven days back to the edge of the twelve-day window, where rows still change but rarely.",
  "Windows are walked newest first, and each one becomes a single request whose date range includes both ends.",
  "Pages of ten thousand rows follow by offset until the reported row count is met, so a truncated report is never mistaken for a whole one.",
] as const;

/* Getting started. */
const SETUP_EYEBROW = "What a connection needs";
const SETUP_HEADING = "Four things before a report runs.";
const SETUP_LEAD = "One consent screen, one property, one report definition, and a paged pull.";

const SETUP_STEPS = [
  {
    title: "Authorise with Google",
    body: "OAuth is the only lane this provider offers, and the scope is the read-only analytics one, which Google classes as sensitive. There is no long-lived token to paste.",
  },
  {
    title: "Keep the refresh token",
    body: "The consent request asks for offline access and forces the consent screen, because without both Google issues a refresh token only on the first authorisation and the connection dies quietly overnight.",
  },
  {
    title: "Name the property",
    body: "A request is addressed to one property, and the report runs against that property alone. Its quota is the property's, not this workspace's.",
  },
  {
    title: "Choose the report",
    body: "The default asks for the date dimension and three metrics, and no more. GA4 prices a request by query complexity, so every extra dimension is quota spent from a ceiling the customer's own tools draw on.",
  },
] as const;

/**
 * The quota facts, from the module comment at the top of `client.ts`, which cites specification
 * sections 3.2 and 7 for them. Stated once, here, rather than implied across three sections.
 */
const SETUP_LIMIT =
  "A property allows forty thousand core tokens an hour, shared with every other tool the customer points at it, and a request's cost is not knowable until after it is spent. So the pull measures instead of budgeting: it asks for the quota reading on every request and stops while a tenth of any group remains, leaving the rest for the next sweep.";

/* Good to know. */
const FAQ_EYEBROW = "Good to know";
const FAQ_HEADING_TOP = "The parts worth";
const FAQ_HEADING_BOTTOM = "reading twice.";
const FAQ_LINK_LABEL = "Read the documentation";

/** Seven answers, each traceable to one of the files named in the module comment. */
const FAQS = [
  {
    question: "Can this connector walk a date range?",
    answer:
      "Yes. Two source directories in this build ship a backfill module and this is one of them, so a planned range is walked window by window, newest first, with each window sent as one request.",
  },
  {
    question: "How long can a GA4 number still change?",
    answer:
      "Twelve days. Attribution credit is adjusted after a day closes, and the restatement clock for this source carries that figure as a fixed window rather than one read per account.",
  },
  {
    question: "Is that window a service level?",
    answer:
      "No, and Google says so itself: not a guarantee, not a service level agreement, not a service level objective. The clock note keeps those words attached to the number so nothing downstream can quietly promise more.",
  },
  {
    question: "Why is there no attribution window setting?",
    answer:
      "Because GA4 does not offer one. It adjusts at model level instead, so every row is labelled for that. The label is a statement about what the platform did, not a placeholder for something missing.",
  },
  {
    question: "Can I paste a token instead of signing in?",
    answer:
      "No. This provider offers the OAuth lane and nothing else, because Google issues no pasteable long-lived token and offering a lane a customer could never walk down would be a lie at the seam.",
  },
  {
    question: "What happens when the quota runs low?",
    answer:
      "The run stops and reports the windows it finished. The remainder is a job for the next scheduled sweep rather than a retry now, because the allowance being spent belongs to the customer's property and their own dashboards fail first.",
  },
  {
    question: "Are the example payloads real?",
    answer:
      "No. The fixtures are synthetic, written from the documented response shape, and the module says in its own comment that they must be replaced with a recorded response from a real property before this connector ships.",
  },
] as const;

/* The closing panel. */
const FINAL_HEADING = "Sessions, with the clock attached.";
const FINAL_LEAD = "Every row says where it came from and how long it can still move.";
const FINAL_CTA = "Explore dashboard";

/** Shared class strings, kept identical to the sibling connector pages so the two cannot drift. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const TEXT_LINK = "text-accent inline-flex items-center gap-3 text-sm font-bold hover:underline";
const EYEBROW = "text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs";
const SECTION_HEADING =
  "font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]";
const TABLE_HEAD = "text-ink-subtle border-line border-b px-4 py-3 text-left font-bold";
const TABLE_CELL = "border-line-soft text-ink-muted border-b px-4 py-3 align-top";

export default function Ga4ConnectorPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO. The Shopify page's `.connector-intro`: breadcrumb, then a 1fr/1fr split that
            collapses below the guide's 768px. */}
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
              <li aria-current="page">Google Analytics</li>
            </ol>
          </nav>

          <div className="mt-9 grid items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-3">
                {/* Decorative: the eyebrow beside it and the breadcrumb above both name the
                    platform, so alt text here would announce it a third time. */}
                <img
                  src="/platforms/googleanalytics.svg"
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
                  href="#reads"
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
                    src="/platforms/googleanalytics.svg"
                    alt="Google Analytics"
                    width={58}
                    height={58}
                    className="h-[45px] w-[45px] object-contain md:h-[58px] md:w-[58px]"
                  />
                  <strong className="text-ink text-center text-sm">GA4</strong>
                </div>

                {/* The track. The metric caption sits over a mint-to-blue rule; the arrow is
                    decorative, the caption carries the meaning. */}
                <div className="min-w-0 flex-1 px-2 text-center">
                  <span className="text-ink-faint text-[8px] md:text-[9px]">
                    {PANEL_FLOW_METRICS}
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

              {/* The string-value trap, which is the first thing this normaliser handles, shown on
                  the fixture's own value. */}
              <p className="border-line bg-surface-subtle text-ink-muted font-mono flex items-center gap-2 rounded-lg border p-3 text-[10px] md:text-[11px]">
                <span
                  aria-hidden="true"
                  className="bg-brand-mint h-1.5 w-1.5 shrink-0 rounded-full"
                />
                <span className="text-ink-faint">{PANEL_RAW_LABEL}</span>
                <span className="min-w-0 truncate">{PANEL_RAW_VALUE}</span>
                <span className="text-ink-faint ml-auto shrink-0">{PANEL_RAW_NOTE}</span>
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-2 md:gap-3">
                {PANEL_STATS.map((stat) => (
                  <div key={stat.label} className="min-w-0">
                    <dt className="text-ink-faint font-mono text-[10px]">{stat.label}</dt>
                    <dd className="font-display text-ink mt-1 text-lg font-bold md:text-[22px]">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="bg-surface-subtle text-ink-muted font-mono mt-6 rounded-lg p-4 text-[10px] leading-[1.9] md:text-[11px]">
                {PANEL_ROW.map((line) => (
                  <div key={line.key} className="flex gap-2">
                    <dt className="text-ink-faint w-[95px] shrink-0 md:w-[118px]">{line.key}</dt>
                    <dd className="min-w-0 break-words">{line.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* The in-page anchors. A scroller on a phone, as in the design, so the six never wrap
            into a stack. */}
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

          {/* One up on a phone, two in the middle band, four wide. */}
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

        {/* WHAT YOU CAN SEE -- the design's `.soft-section`, a full-bleed tinted band. */}
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
                  <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-bold tracking-[-0.01em]">
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
            <p className="border-line text-ink-subtle font-mono mt-5 inline-block rounded-md border px-3 py-1.5 text-xs">
              {READS_API}
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
                    GA4 metric
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Canonical column
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Unit
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Note
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
                    <td className={TABLE_CELL}>{row.note}</td>
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
                    Why
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
        </section>

        {/* THE 12-DAY WINDOW. The one section neither sibling connector page has, because the clock
            and the backfill are the two facts a reader of this connector most needs, and the clock
            note's own caveat has to travel with its number. */}
        <section
          id="window"
          aria-labelledby="window-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mb-8 max-w-[720px] md:mb-10">
              <span className={EYEBROW}>{WINDOW_EYEBROW}</span>
              <h2 id="window-heading" className={SECTION_HEADING}>
                {WINDOW_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {WINDOW_LEAD}
              </p>
            </div>

            <div className="grid items-start gap-6 md:gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
              <ul className="grid gap-4 sm:grid-cols-2 md:gap-6">
                {WINDOW_POINTS.map((point) => (
                  <li
                    key={point.title}
                    className="border-line bg-surface rounded-lg border p-5 md:p-6"
                  >
                    <h3 className="font-display text-ink mb-3 text-base leading-[1.3] font-bold tracking-[-0.01em] md:text-[18px]">
                      {point.title}
                    </h3>
                    <p className="text-ink-muted text-sm leading-[1.7]">{point.body}</p>
                  </li>
                ))}
              </ul>

              {/* The backfill ladder. An ordered list because the five steps ARE a sequence, and
                  the numerals come from <ol> rather than from typed digits. */}
              <div className="border-line bg-surface min-w-0 rounded-xl border p-6 md:p-7">
                <span className="text-ink-subtle text-[10px] font-bold tracking-[0.12em] uppercase">
                  {BACKFILL_LABEL}
                </span>
                <ol className="mt-5 grid gap-4">
                  {BACKFILL_STEPS.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-surface-inset text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                      >
                        {index + 1}
                      </span>
                      <p className="text-ink-muted min-w-0 text-sm leading-[1.65]">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* GETTING STARTED. An ordered list, because the four steps ARE a sequence: the numerals in
            the design are content, so they come from <ol> rather than from a typed digit a screen
            reader would announce as part of the heading. */}
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
                <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-bold tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className="text-ink-muted text-[15px] leading-[1.7]">{step.body}</p>
              </li>
            ))}
          </ol>

          {/* Whose quota this is, said once and not implied away anywhere else on the page. */}
          <p className="border-line bg-surface-subtle text-ink-muted mt-8 rounded-lg border px-5 py-4 text-sm leading-[1.65] md:mt-10">
            {SETUP_LIMIT}
          </p>
        </section>

        {/* GOOD TO KNOW. Native <details>, which already owns the disclosure semantics and keyboard
            behaviour the design's accordion needs, so no script is involved. */}
        <section
          id="connector-faq"
          aria-labelledby="faq-heading"
          className="mx-auto grid max-w-[1200px] items-start gap-8 px-8 pt-10 pb-12 md:grid-cols-2 md:gap-10 md:pb-20 lg:gap-20"
        >
          <div className="min-w-0">
            <span className={EYEBROW}>{FAQ_EYEBROW}</span>
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
