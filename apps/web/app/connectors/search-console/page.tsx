import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE SEARCH CONSOLE CONNECTOR PAGE, at /connectors/search-console. `app/integrations/page.tsx`
 * already links here from its Analytics tile, which is the category that page files this source
 * under.
 *
 * THE LAYOUT IS `app/connectors/shopify/page.tsx`, DELIBERATELY AND ALMOST LINE FOR LINE: a hero
 * with the connector's mark and a panel beside it, the anchor strip, a destinations block, a "what
 * you can see" band, a data section, a numbered setup sequence, the `<details>` accordion and a
 * closing note. That page transcribes the supplied `shopify.html`, so matching it is how this page
 * inherits the design rather than inventing a second one. Section padding, heading sizes and the
 * shared class strings are copied from it and from the sibling `connectors/ga4/page.tsx` on
 * purpose; where the pages differ, the difference is content.
 *
 * THERE IS NO MARK FOR THIS PLATFORM, AND THE PAGE SAYS SO RATHER THAN BORROWING ONE. No Search
 * Console file ships in `apps/web/public/platforms`, so the hero and the panel show a neutral tile
 * built from the theme's own surface and accent tokens, carrying the platform's initial -- the
 * same fallback `app/integrations/page.tsx` renders for an unmarked connector, and for the reason
 * its comment gives: a neutral tile is better than a broken image and better than another
 * company's artwork. The accordion states it in the page's own voice too, because a reader who
 * notices the missing logo deserves the reason rather than a guess.
 *
 * ONE SECTION EXISTS HERE THAT THE ECOMMERCE SIBLING HAS NO NEED OF: `#gap`. Two facts about this
 * source are more important than anything else on the page -- Google withholds rows from the query
 * grain, and nobody has measured how long a figure keeps moving -- and both are the kind of fact
 * that turns into a lie the moment it is summarised into a badge.
 *
 * WHERE EVERY CLAIM CAME FROM, because the failure this page is written against is a sibling
 * connector page that invented a catalogue of field names reading exactly like a real one. Nothing
 * below is written from memory of the Search Console API. Each constant carries the file it was
 * read out of:
 *
 *   packages/connectors/src/sources/search_console/normalize.ts
 *       SEARCH_CONSOLE_METRIC_MAP, SEARCH_CONSOLE_GRAINS, SEARCH_CONSOLE_DIMENSIONS,
 *       SEARCH_CONSOLE_NATIVE_ENTITY_TYPE, SEARCH_CONSOLE_ANONYMITY_THRESHOLDED,
 *       SEARCH_CONSOLE_CURRENCY, SEARCH_CONSOLE_TIMEZONE, grainFor's three refusals,
 *       parseSearchConsolePosition, totalsByDate, and every field the row object writes
 *   packages/connectors/src/sources/search_console/client.ts
 *       SEARCH_CONSOLE_API_BASE, searchAnalyticsUrl and its encoding note, the page sizes, the
 *       page cap, SEARCH_CONSOLE_DATA_STATE, the search type and its unsettled field name,
 *       SEARCH_CONSOLE_REPORTS, and the quota paragraph in the module comment
 *   packages/connectors/src/sources/search_console/fixtures.ts   every number in the hero panel
 *   packages/connections/src/connections.ts      PROVIDER_LANES.search_console -> ["oauth"]
 *   packages/contract/src/restatement.ts         RESTATEMENT_CLOCKS.search_console, its note, the
 *                                                WooCommerce comment it contrasts with, and what
 *                                                restatesUntil and isProvisional do with a null
 *   packages/contract/src/metrics.ts             METRICS.position: unit, aggregation, the naming
 *                                                decision, and combineMetric
 *   packages/contract/src/registry.ts            the Search Console field dispositions
 *   packages/oauth/src/providers.ts              the scope, its unconfirmed sensitivity, the auth
 *                                                params and why both are sent
 *
 * ANYTHING NOT IN THOSE FILES IS NOT ON THIS PAGE. Search Console offers dimensions this connector
 * does not map -- country, device and search appearance are named in `grainFor`'s refusal -- and
 * the page names them only as refusals, because that is all the code does with them. No field
 * catalogue is invented here; the two tables below are the metric map and the grain table, and
 * both are transcriptions.
 *
 * THE ABSENT MODULE IS STATED, NOT GLOSSED. `sources/search_console/` holds a client, a
 * normaliser, fixtures and tests, and no `backfill.ts`. Two source directories in this tree carry
 * one and this is not among them, so nothing here plans or walks a date range yet. The setup
 * section says so in the place a reader would otherwise assume a schedule.
 *
 * THE PANEL SHOWS A FIXTURE, NOT AN INVENTED EXAMPLE. It renders the first row of `BY_QUERY`
 * beside the envelope fields `normalizeSearchAnalytics` writes for it, including the fixture's own
 * reserved-TLD property. The chip says where the numbers came from, and `fixtures.ts` records that
 * these payloads are synthetic -- which is why the accordion says so too, rather than letting the
 * panel imply a live property.
 *
 * COLOUR. No literal is written here. The gradient rule inside the panel is composed from the two
 * brand stops with Tailwind's gradient utilities, as on both siblings, and the closing panel takes
 * the pale-blue inset surface, which is the token that already carries "soft feature background".
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only. */
export const metadata: Metadata = {
  title: "Search Console connector",
  description:
    "Clicks, impressions and average position for one property, with the rows Google withholds named rather than quietly missing.",
  alternates: { canonical: "/connectors/search-console" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below and reaches the page as {EXPRESSION}. Eyebrows
 * are stored in sentence case because the capitals are CSS, as every sibling page already does.
 * ------------------------------------------------------------------------------------------- */

/** `app/integrations/page.tsx` files this connector under `category: "Analytics"`. */
const HERO_EYEBROW = "Analytics connector";

/** The platform's name, used for the breadcrumb, the neutral tile and the panel caption. */
const PLATFORM_NAME = "Search Console";
const PLATFORM_INITIAL = "S";

const HERO_HEADING_TOP = "Clicks, impressions, position.";
const HERO_HEADING_BOTTOM = "And the rows Google withholds.";

/**
 * Every noun here is from the connector. The three metrics are `SEARCH_CONSOLE_METRIC_MAP`; the
 * grain is `entity.type`, which this normaliser also prefixes onto the entity id; the withheld
 * rows are `SEARCH_CONSOLE_ANONYMITY_THRESHOLDED`, which every caller is handed whether it asked
 * for it or not.
 */
const HERO_LEAD =
  "Clicks, impressions and average position for one property, normalised into rows that each say which grain they belong to and whether the platform withheld any of the rows beside them.";

const HERO_PRIMARY_CTA = "Explore dashboard";
const HERO_SECONDARY_CTA = "See what it reads";

/**
 * Three facts, not three promises. OAuth is the only entry in `PROVIDER_LANES.search_console`; the
 * blank window is `RESTATEMENT_CLOCKS.search_console.windowDays`, which is null; and the third is
 * the absence of a `backfill.ts` in this source directory.
 */
const HERO_CHECKS = ["OAuth only", "Restatement window not published", "No scheduler yet"] as const;

/* The panel beside the hero. Everything in it is `fixtures.ts` plus what `normalize.ts` writes. */
const PANEL_LABEL = "One normalised row";
const PANEL_CHIP = "From the connector's fixtures";

/** The three metrics `SEARCH_CONSOLE_METRIC_MAP` carries, in the order that object lists them. */
const PANEL_FLOW_METRICS = "clicks · impressions · position";

/**
 * The first row of `BY_QUERY`. Search Console returns `keys` POSITIONALLY against the dimensions of
 * the request and echoes no names at all, which is why the normaliser is given the dimension list
 * that was sent and refuses a row whose key count disagrees with it.
 */
const PANEL_RAW_LABEL = "keys";
const PANEL_RAW_VALUE = "[“2026-08-14”, “running shoes”]";
const PANEL_RAW_NOTE = "no names echoed";

/** The two counts on that fixture row, under their canonical names, plus the rank it carries. */
const PANEL_STATS = [
  { label: "clicks", value: "412" },
  { label: "impressions", value: "9,100" },
  { label: "position", value: "6.2" },
] as const;

/**
 * The envelope fields `normalizeSearchAnalytics` writes for that row, in the order the object
 * builds them. `entity.id` carries the grain as a prefix because a search query can itself be a
 * URL and would otherwise collide with a page-grain row; `currency` is the ISO 4217 code for a
 * transaction with no currency involved; `timezone` is the documented Pacific reporting day, a
 * constant rather than a value read from the response; `attribution_window` is null as a label
 * rather than as a gap; `restates_until` is null because the clock for this source publishes no
 * window, and `is_provisional` is derived from that null rather than asserted.
 */
const PANEL_ROW = [
  { key: "source", value: "search_console" },
  { key: "entity.type", value: "query" },
  { key: "entity.id", value: "query:running shoes" },
  { key: "account_id", value: "sc-domain:example.test" },
  { key: "currency", value: "XXX" },
  { key: "timezone", value: "America/Los_Angeles" },
  { key: "attribution_window", value: "null" },
  { key: "restates_until", value: "null" },
  { key: "is_provisional", value: "true" },
] as const;

/** The anchors under the hero, in page order. */
const SECTION_LINKS = [
  { href: "#destinations", label: "Where rows go" },
  { href: "#what-you-see", label: "What you can see" },
  { href: "#reads", label: "What it reads" },
  { href: "#gap", label: "The withheld rows" },
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
 * transformed here. The second card's body is the reason `client.ts` gives for pulling the query
 * report at all: query is the one dimension the paid and organic sides of this product share.
 * `path` is an outline mark drawn in the same 24-unit box as the card grids below.
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
    id: "google-ads",
    title: "The paid side of a query",
    body: "A search term is the one dimension the paid and organic halves of this product share, which is why the query report is worth its request.",
    cta: "See the Google Ads connector",
    href: "/connectors/google-ads",
    path: "M3 17l6-6 4 4 7-7M14 8h7v7",
  },
  {
    id: "ga4",
    title: "Sessions on the same shape",
    body: "The other Google source here reads sessions and conversions onto the same row shape, and unlike this one its restatement clock does carry a number.",
    cta: "See the GA4 connector",
    href: "/connectors/ga4",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
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
 * Six cards, each one a documented behaviour of `normalize.ts`, `metrics.ts` or `client.ts`. The
 * bodies describe code in this repository, not the Search Console API in general.
 */
const WHAT_YOU_SEE = [
  {
    title: "A rank that is never summed",
    body: "Average position is the first metric in the shared dictionary that does not add up. It declares an impression-weighted mean instead, and the helper that rolls rows into a period honours that, so a week of ranks cannot arrive as a number in the hundreds.",
    path: "M3 17l6-6 4 4 7-7M14 8h7v7",
  },
  {
    title: "Rank zero is refused",
    body: "A search position is a one-based ordinal, so zero does not exist, and it reads as better than first rather than worse. A row carrying one is refused, and the database column agrees with a check constraint.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  },
  {
    title: "No rate is stored",
    body: "Click-through rate arrives on every row and is deliberately not read. It is one number over another, both of which are stored, and keeping the quotient beside its inputs is how one figure becomes two that drift.",
    path: "M9 7h6M9 12h6M9 17h3M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  },
  {
    title: "Keys read against the request",
    body: "The response echoes no dimension names at all, so the list that was sent travels with the page it answered. A row whose key count disagrees with that list is refused, because every key would otherwise be read as something it is not.",
    path: "M4 7h16v13H4zM4 7l8 6 8-6M4 4h16",
  },
  {
    title: "The grain is part of the identifier",
    body: "Somebody can type a web address into a search box, which makes a query identical to a page. Each row is keyed with its grain in front of the platform's own value, so two different things cannot land on one key and quietly overwrite each other.",
    path: "M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v3m-6-9a6 6 0 0 0 6 6",
  },
  {
    title: "No money, and one clock",
    body: "The platform reports no currency and no property time zone, ever. Rows carry the standard code for a transaction with no currency involved, and the documented Pacific reporting day, rather than a workspace default that would quietly relabel both.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  },
] as const;

/* What it reads. */
const READS_EYEBROW = "The mapping, in full";
const READS_HEADING = "What the connector actually reads.";
const READS_LEAD =
  "Three metric names, three grains, three request dimensions. This is the whole list; anything outside it is refused before a request is spent rather than passed through.";

/** `client.ts` pins `SEARCH_CONSOLE_API_BASE` and posts to this path. Not a sentence. */
const READS_API = "webmasters/v3 · searchAnalytics.query";

const METRIC_TABLE_CAPTION = "What the platform sends, and what is kept";

/**
 * `SEARCH_CONSOLE_METRIC_MAP` joined to `METRICS`, plus the two fields `registry.ts` records a
 * disposition for rather than a mapping. The left column is the name the platform uses, the middle
 * the canonical column it maps to, the right the unit that column declares.
 */
const METRIC_ROWS = [
  {
    field: "clicks",
    metric: "clicks",
    unit: "count",
    note: "Already in the shared dictionary, so this connector needed no change to it",
  },
  {
    field: "impressions",
    metric: "impressions",
    unit: "count",
    note: "Also the weight that every average position is combined by",
  },
  {
    field: "position",
    metric: "position",
    unit: "rank",
    note: "The one metric no other source in this build emits. See the note below the table",
  },
  {
    field: "ctr",
    metric: "not stored",
    unit: "—",
    note: "A decision rather than a gap: both of its inputs are stored, and it is computed at read time from columns that cannot disagree",
  },
  {
    field: "keys",
    metric: "dimension values",
    unit: "—",
    note: "Positional against the dimensions of the request, which is why the request list travels with the response",
  },
] as const;

/**
 * The metric no other source emits, and what it means. Every clause is from `metrics.ts`: the unit,
 * the aggregation, the naming decision and the two properties that forced a third unit.
 */
const POSITION_LABEL = "The metric only this source emits";
const POSITION_NOTES = [
  "Average position is the platform's own figure for that row, which is why the column is named for the position rather than for an average this system computed.",
  "It needed a third unit in the dictionary, because a mean of one-based ordinals is neither money nor a count of things.",
  "It does not sum, and it does not plainly average either: the platform weights its own figure by impressions, so a query seen forty thousand times must not count the same as one seen twelve.",
] as const;

const GRAIN_TABLE_CAPTION = "The three grains, and what each report costs in honesty";

/**
 * `SEARCH_CONSOLE_GRAINS` joined to `SEARCH_CONSOLE_NATIVE_ENTITY_TYPE`,
 * `SEARCH_CONSOLE_REPORTS` and `SEARCH_CONSOLE_ANONYMITY_THRESHOLDED`. The last column is the one
 * that matters and the last row's entry is marked as the deliberate guess the code records.
 */
const GRAIN_ROWS = [
  {
    grain: "property",
    dimensions: "date",
    native: "site",
    withheld: "No. This is the platform's own total, anonymised queries included",
  },
  {
    grain: "query",
    dimensions: "date, query",
    native: "query",
    withheld:
      "Yes, and it is documented. Low-volume queries are withheld, so these rows are a subset",
  },
  {
    grain: "page",
    dimensions: "date, page",
    native: "page",
    withheld:
      "Marked withheld as a deliberate guess, because a wrong no publishes a total that is quietly too low",
  },
] as const;

/** Three refusals from `grainFor`, each one a report this connector will not run. */
const READS_EXCLUSIONS = [
  "A report without the date dimension is refused. It returns one row for the whole range, which is a different kind of number wearing the same shape, and every row here is keyed on a day.",
  "A report asking for two grains at once is refused. There is no combined entity type to land it on, so one half of each key would be dropped and distinct rows would collapse onto one identifier.",
  "A dimension this connector does not map is refused before the request is spent. Country, device and search appearance are real and each needs a decision recorded before a row can carry one.",
] as const;

/* The withheld rows, and the window nobody has measured. */
const GAP_EYEBROW = "Two things this source will not tell you";
const GAP_HEADING = "The gap, stated rather than hidden.";
const GAP_LEAD =
  "Google removes rows from a query report and says nothing about it, and nobody has measured how long a figure keeps moving after a day closes. Both are named here rather than smoothed over.";

/** Four points, from the anonymity block in `normalize.ts` and the refusal in `totalsByDate`. */
const GAP_POINTS = [
  {
    title: "The rows that never arrive",
    body: "An anonymity threshold drops queries made by too few people. Nothing in the response marks the gap: no field, no header, no count. What arrives is well-formed data whose sum is quietly lower than the truth.",
  },
  {
    title: "Two reports, and the difference between them",
    body: "The date-only report returns the platform's own number, anonymised queries included. Pulled beside the query report, the difference between the two is the size of the gap, stated rather than guessed at.",
  },
  {
    title: "Summing is refused, not discouraged",
    body: "The helper that totals rows by date throws at query and page grain instead of adding them up. A comment saying not to would be a comment; a function everybody reaches for and that refuses by grain is a control.",
  },
  {
    title: "The page grain errs towards refusing",
    body: "Whether page rows carry the impressions of anonymised queries cannot be established from here without a live call, so they are marked withheld. A wrong yes costs a second request; a wrong no publishes a total nobody can reconcile.",
  },
] as const;

/* The blank restatement window, which is the other half of the same section. */
const WINDOW_LABEL = "Why the restatement window is blank";

/**
 * From `RESTATEMENT_CLOCKS.search_console` and the comment two entries below it. The second point
 * is the whole reason this block exists: two sources in this build carry a null window and they
 * mean opposite things, and the contrast is drawn without naming the other source's page, which
 * this pass does not own.
 */
const WINDOW_POINTS = [
  "The clock for this source carries no number. The specification publishes none, and an invented one would be indistinguishable from a sourced one, so the field is left empty until somebody measures it.",
  "Empty here means unmeasured, not absent. A window exists and nobody knows it. The store connector in this build is also empty for the opposite reason: its rows belong to a merchant's own database, which can be edited at any remove, so no window ever closes at all.",
  "The consequence is carried on every row. With no window, the date a figure stops being open to change is null, and an unknown window is treated as still open, so no row from this source is ever marked final.",
] as const;

/* Getting started. */
const SETUP_EYEBROW = "What a connection needs";
const SETUP_HEADING = "Four things before a report runs.";
const SETUP_LEAD = "One consent screen, one property, one pair of reports, and a paged pull.";

const SETUP_STEPS = [
  {
    title: "Authorise with Google",
    body: "OAuth is the only lane this provider offers, and the scope is the read-only webmasters one, which exists to read query, page and position data. There is no long-lived token to paste.",
  },
  {
    title: "Keep the refresh token",
    body: "The consent request asks for offline access and forces the consent screen, because without both Google issues a refresh token only on the first authorisation and the connection dies quietly overnight.",
  },
  {
    title: "Name the property",
    body: "A property is a site as this platform accounts for it: either a domain property, written with a prefix and a bare hostname, or a URL-prefix property, written as a full address. Both are percent-encoded into the request path, because the colon and slashes they carry are path separators in the template they go into.",
  },
  {
    title: "Choose the pair of reports",
    body: "The date-only totals and the date-and-query report are pulled together, because apart the query rows are a total that is wrong by an amount nobody can compute. The page report is available and doubles the request count again.",
  },
] as const;

/**
 * The quota paragraph from the module comment at the top of `client.ts`, which cites specification
 * section 3.2 for the published ceilings. Stated once, here, rather than implied across sections.
 */
const SETUP_LIMIT =
  "No response from this platform carries a quota reading of any kind: nothing remaining, nothing consumed, no header. The published ceilings are twelve hundred queries a minute for a site and for a user, and forty thousand a minute and thirty million a day for a project, alongside undocumented load quotas over ten-minute and one-day windows that can fail a request before any published limit is reached. A limit that is both undocumented and lower than the documented one cannot be planned against, so requests are strictly sequential and every page is as large as the platform allows.";

/**
 * The absent module, in the place a reader would otherwise assume a schedule. The source directory
 * holds a client, a normaliser, fixtures and tests, and no backfill module.
 */
const SETUP_PENDING =
  "There is no backfill module in this source directory, so a date range cannot be scheduled yet. Two sources in this build ship one and this is not among them: the client and the normaliser exist, and today something else has to decide which windows to ask for.";

/**
 * How a report ends, which is the other thing a reader needs before running one. Every clause is
 * from `client.ts`: the platform default, the explicit limit, the advance-by-rows-received rule,
 * the short-page signal and the page cap.
 */
const PAGING_LABEL = "How a report ends";
const PAGING_STEPS = [
  "A limit is always sent. The platform's own default is a thousand rows, and a report that hits it comes back truncated with no error, no total and no cursor to notice it by.",
  "Ten thousand rows are asked for per page, below the platform's maximum, because the response is parsed in one piece inside a worker with a fixed memory budget.",
  "Each page advances by the rows received rather than by the limit requested, so a short page in the middle of a report cannot be stepped over.",
  "A short page is the only end-of-report signal this platform sends, which means the last request of a full report always returns nothing. That spare request is cheaper than a report that silently stops early.",
  "At twenty pages the pull refuses rather than stopping. There is no row total to check a long report against, so ending one on a guess would report success for a number that is too low.",
] as const;

/* Good to know. */
const FAQ_EYEBROW = "Good to know";
const FAQ_HEADING_TOP = "The parts worth";
const FAQ_HEADING_BOTTOM = "reading twice.";
const FAQ_LINK_LABEL = "Read the documentation";

/** Nine answers, each traceable to one of the files named in the module comment. */
const FAQS = [
  {
    question: "Can this connector be scheduled?",
    answer:
      "Not yet. There is no backfill module in this source directory, so nothing here plans or walks a date range: two other sources in this build carry one, and this connector is a client and a normaliser waiting for it.",
  },
  {
    question: "What is a property here?",
    answer:
      "It is the site as this platform accounts for it, and the connector accepts it in either of the two spellings the platform uses: a domain property, written as a prefix followed by a bare hostname, or a URL-prefix property, written as a full address. Both are percent-encoded into the request path, because unencoded the colon and slashes they carry would turn one path segment into several and address something that is not the customer's site.",
  },
  {
    question: "Is this scope reviewed like the other Google ones?",
    answer:
      "That is unestablished, and it is recorded as an open question rather than answered. This scope is not listed on Google's own scopes page, so whether it sits behind the same unbounded verification as the other two Google sources in this build is not something this repository can establish from here.",
  },
  {
    question: "How long can a figure still change?",
    answer:
      "It is not published. The restatement clock for this source carries no window, which means unmeasured rather than absent, and an unknown window is treated as still open. No row from this source is marked final today.",
  },
  {
    question: "Why do the query rows not add up to the totals?",
    answer:
      "Because Google withholds queries made by too few people, and says nothing in the response about having done so. The date-only report returns its own total with those queries included, and the difference between the two reports is the size of what was withheld.",
  },
  {
    question: "Why is average position not simply averaged?",
    answer:
      "Because the platform's own figure is already weighted by impressions, so a plain mean of stored rows is a different number that looks entirely plausible. The dictionary declares the weighted mean and one helper implements it, rather than leaving every caller to remember.",
  },
  {
    question: "Can I paste a token instead of signing in?",
    answer:
      "No. This provider offers the OAuth lane and nothing else, because Google issues no pasteable long-lived token and offering a lane a customer could never walk down would be a lie at the seam.",
  },
  {
    question: "Why is there no platform logo on this page?",
    answer:
      "Because no mark for this platform ships in this build. The tile in the hero is drawn from the theme's own colours and carries the initial, which is what the integrations grid does for an unmarked connector: better than a broken image, and better than borrowing another company's artwork.",
  },
  {
    question: "Are the example payloads real?",
    answer:
      "No. The fixtures are synthetic, written from the documented response shape, and the module says in its own comment that they must be replaced with a recording from a real property before this connector ships.",
  },
] as const;

/* The closing panel. */
const FINAL_HEADING = "Search data, with the gap attached.";
const FINAL_LEAD = "Every row says which grain it belongs to, and what the platform did not send.";
const FINAL_CTA = "Explore dashboard";

/** Shared class strings, kept identical to the sibling connector pages so they cannot drift. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const TEXT_LINK = "text-accent inline-flex items-center gap-3 text-sm font-bold hover:underline";
const EYEBROW = "text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs";
const SECTION_HEADING =
  "font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]";
const TABLE_HEAD = "text-ink-subtle border-line border-b px-4 py-3 text-left font-bold";
const TABLE_CELL = "border-line-soft text-ink-muted border-b px-4 py-3 align-top";

export default function SearchConsoleConnectorPage() {
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
              <li aria-current="page">{PLATFORM_NAME}</li>
            </ol>
          </nav>

          <div className="mt-9 grid items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-3">
                {/* NO MARK SHIPS FOR THIS PLATFORM. A neutral tile in the theme's own tokens,
                    carrying the initial -- the same fallback the integrations grid renders, and
                    decorative because the breadcrumb above and the eyebrow beside it both name the
                    platform already. */}
                <span
                  aria-hidden="true"
                  className="bg-surface-inset text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg font-bold"
                >
                  {PLATFORM_INITIAL}
                </span>
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
                  {/* The same neutral tile as the hero, at the size the siblings give the mark. */}
                  <span
                    aria-hidden="true"
                    className="bg-surface-inset text-accent flex h-[45px] w-[45px] items-center justify-center rounded-lg text-2xl font-bold md:h-[58px] md:w-[58px]"
                  >
                    {PLATFORM_INITIAL}
                  </span>
                  <strong className="text-ink text-center text-sm">{PLATFORM_NAME}</strong>
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

              {/* The positional-keys trap, which is the first thing this normaliser handles, shown
                  on the fixture's own row. */}
              <p className="border-line bg-surface-subtle text-ink-muted font-mono flex items-center gap-2 rounded-lg border p-3 text-[10px] md:text-[11px]">
                <span
                  aria-hidden="true"
                  className="bg-brand-mint h-1.5 w-1.5 shrink-0 rounded-full"
                />
                <span className="text-ink-faint">{PANEL_RAW_LABEL}</span>
                <span className="min-w-0 truncate">{PANEL_RAW_VALUE}</span>
                <span className="text-ink-faint ml-auto shrink-0">{PANEL_RAW_NOTE}</span>
              </p>

              <dl className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
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

        {/* The in-page anchors. A scroller on a phone, as in the design, so the six never wrap into
            a stack. */}
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

        {/* WHAT IT READS. Two real data tables, each in its own horizontal scroller so the page body
            never scrolls sideways on a phone. */}
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
                    Response field
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

          {/* The one metric no other source in this build emits, given its own block rather than a
              table cell, because the reason it needed a new unit is the interesting part. */}
          <div className="border-line bg-surface mt-5 rounded-lg border p-6 md:p-7">
            <span className="text-ink-subtle text-[10px] font-bold tracking-[0.12em] uppercase">
              {POSITION_LABEL}
            </span>
            <ul className="mt-4 grid gap-3 md:grid-cols-3 md:gap-6">
              {POSITION_NOTES.map((note) => (
                <li key={note} className="text-ink-muted text-sm leading-[1.7]">
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-line bg-surface mt-5 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <caption className="text-ink-subtle px-4 pt-4 pb-3 text-left text-xs">
                {GRAIN_TABLE_CAPTION}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={TABLE_HEAD}>
                    Grain
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Dimensions requested
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Platform name
                  </th>
                  <th scope="col" className={TABLE_HEAD}>
                    Rows withheld
                  </th>
                </tr>
              </thead>
              <tbody>
                {GRAIN_ROWS.map((row) => (
                  <tr key={row.grain}>
                    <th scope="row" className={`${TABLE_CELL} text-ink font-mono font-normal`}>
                      {row.grain}
                    </th>
                    <td className={`${TABLE_CELL} font-mono`}>{row.dimensions}</td>
                    <td className={`${TABLE_CELL} font-mono`}>{row.native}</td>
                    <td className={TABLE_CELL}>{row.withheld}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
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

        {/* THE WITHHELD ROWS. The section this connector needs and the ecommerce sibling does not:
            the anonymity gap and the unmeasured restatement window, each stated with the reason it
            is not a number. */}
        <section
          id="gap"
          aria-labelledby="gap-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mb-8 max-w-[720px] md:mb-10">
              <span className={EYEBROW}>{GAP_EYEBROW}</span>
              <h2 id="gap-heading" className={SECTION_HEADING}>
                {GAP_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {GAP_LEAD}
              </p>
            </div>

            <div className="grid items-start gap-6 md:gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
              <ul className="grid gap-4 sm:grid-cols-2 md:gap-6">
                {GAP_POINTS.map((point) => (
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

              {/* The blank window. Not a sequence, so an unordered list with a rule between the
                  points rather than the numbered ladder the setup section uses. */}
              <div className="border-line bg-surface min-w-0 rounded-xl border p-6 md:p-7">
                <span className="text-ink-subtle text-[10px] font-bold tracking-[0.12em] uppercase">
                  {WINDOW_LABEL}
                </span>
                <ul className="mt-5 grid gap-4">
                  {WINDOW_POINTS.map((point) => (
                    <li
                      key={point}
                      className="border-line-soft text-ink-muted border-b pb-4 text-sm leading-[1.7] last:border-b-0 last:pb-0"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
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

          <div className="mt-10 grid items-start gap-6 md:gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="min-w-0">
              <p className="bg-surface-subtle border-line text-ink-muted rounded-lg border p-6 text-sm leading-[1.7] md:p-7">
                {SETUP_LIMIT}
              </p>
              {/* The absent module, said plainly in the place a reader would assume a schedule. */}
              <p className="border-line text-ink-subtle mt-5 rounded-lg border border-dashed p-6 text-sm leading-[1.7] md:p-7">
                {SETUP_PENDING}
              </p>
            </div>

            {/* How a report ends. An ordered list, because these five ARE a sequence. */}
            <div className="border-line bg-surface min-w-0 rounded-xl border p-6 md:p-7">
              <span className="text-ink-subtle text-[10px] font-bold tracking-[0.12em] uppercase">
                {PAGING_LABEL}
              </span>
              <ol className="mt-5 grid gap-4">
                {PAGING_STEPS.map((step, index) => (
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
            "soft feature background", as on both sibling connector pages. */}
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
