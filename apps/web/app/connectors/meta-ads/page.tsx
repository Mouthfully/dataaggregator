import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE META ADS CONNECTOR PAGE, at /connectors/meta-ads.
 *
 * THE LAYOUT IS `app/connectors/shopify/page.tsx`, DELIBERATELY: hero with the connector's mark and
 * a panel beside it, a destinations block, a "what you can see" grid, the numbered setup sequence,
 * and a closing note. That page transcribes the supplied `shopify.html`, so matching it is how this
 * page inherits the design rather than inventing a second one. Section padding, heading sizes, the
 * anchor strip, the `<details>` accordion and the shared class strings are copied from it and from
 * the Google Ads page on purpose; where the pages differ, the difference is content.
 *
 * WHERE EVERY CLAIM CAME FROM, because the earlier failure on a sibling connector page was a
 * catalogue of invented field names that read exactly like a real one. Nothing below is written
 * from memory of the Marketing API. Each constant carries the file it was read out of:
 *
 *   packages/connectors/src/sources/meta_ads/normalize.ts   the four levels, the seven windows, the
 *                                                           three mapped metrics, the fan-out rule,
 *                                                           the refusals, the null source timestamp
 *   packages/connectors/src/sources/meta_ads/client.ts      the Graph version, the header the token
 *                                                           travels in, cursor paging, the measured
 *                                                           pacing and the two guessed bounds
 *   packages/connectors/src/sources/meta_ads/fixtures.ts    every number in the hero panel
 *   packages/connections/src/connections.ts                 PROVIDER_LANES.meta_ads -> both lanes,
 *                                                           and what a bearer credential lacks
 *   packages/contract/src/restatement.ts                    RESTATEMENT_CLOCKS.meta_ads, quoted
 *   packages/contract/src/metrics.ts                        the canonical metric names and units
 *
 * THE PAGE IS BUILT AROUND THE TWO THINGS THAT MAKE THIS SOURCE UNLIKE THE OTHERS. First, it is the
 * only provider in `PROVIDER_LANES` with two credential lanes, so the lanes get a section of their
 * own rather than a line in the setup steps -- what differs between them (a consent screen, a
 * refresh, what a null expiry means) is exactly what a reader has to decide before connecting.
 * Second, one insights row is not one stored row: the same purchase arrives once per attribution
 * window, so the hero panel shows the fan-out rather than a headline total.
 *
 * THE PANEL SHOWS A FIXTURE, NOT AN INVENTED EXAMPLE. There is no supplied design for this
 * connector, so the panel renders `DAILY_CAMPAIGN` from `fixtures.ts` -- including the THB currency
 * and the deliberately fake account number -- and the chip says so. `fixtures.ts` states in its own
 * module comment that these payloads are synthetic rather than recorded, which is why the accordion
 * says so too rather than letting the panel imply a live account. The panel's `timezone` line does
 * NOT name a zone: the insights response carries none, and the fixture therefore has none to show.
 *
 * NO DESTINATION IS PROMISED THAT THIS BUILD DOES NOT HOLD. There is no field catalogue route for
 * this source -- `app/fields/` holds `google-ads` only -- so nothing links to one, and the
 * destinations cards point at routes that exist.
 *
 * THE ONE THING THIS CONNECTOR CANNOT DO IS SAID PLAINLY AND ONCE. `sources/meta_ads/` holds a
 * client and a normaliser and no `backfill.ts`, while `ga4/` and `woocommerce/` both have one. So
 * there is nothing for a scheduler to call: the hero's third reassurance says so, the note under
 * the setup steps says so, and no section implies a refresh interval.
 *
 * COLOUR. No literal is written here. The gradient rule inside the panel is composed from the two
 * brand stops with Tailwind's gradient utilities, as on the sibling pages, and the closing panel
 * takes the pale-blue inset surface for the reason recorded on the Shopify page.
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only. */
export const metadata: Metadata = {
  title: "Meta Ads connector",
  description:
    "Account, campaign, ad set and ad performance from Meta Ads, with every conversion written once per attribution window it was reported under.",
  alternates: { canonical: "/connectors/meta-ads" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below and reaches the page as {EXPRESSION}.
 * ------------------------------------------------------------------------------------------- */

/** `connectors.html` files this source under `data-category="Advertising"`. */
const HERO_EYEBROW = "Advertising connector";

const HERO_HEADING_TOP = "Your Meta Ads data.";
const HERO_HEADING_BOTTOM = "One row per attribution window.";

/**
 * Every noun here is from `normalize.ts`: the four levels are `MetaLevel`, and the fan-out rule is
 * the module's first trap -- one insights row becomes one delivery row plus one row per requested
 * window, because Meta reports the same conversion under each window that claims it.
 */
const HERO_LEAD =
  "Account, campaign, ad set and ad performance, with each conversion stored once for every attribution window Meta credited it under, and spend kept off those rows so a total is never multiplied by six.";

const HERO_PRIMARY_CTA = "Explore dashboard";
const HERO_SECONDARY_CTA = "See what it reads";

/**
 * Three facts, not three promises. Both lanes are `PROVIDER_LANES.meta_ads`; 28 days is
 * `RESTATEMENT_CLOCKS.meta_ads.windowDays`; the third is the absence of a `backfill.ts`.
 */
const HERO_CHECKS = [
  "OAuth or a System User token",
  "28-day restatement window",
  "No scheduled pull yet",
] as const;

/* The panel beside the hero. Everything in it is `fixtures.ts` plus what `normalize.ts` writes. */
const PANEL_LABEL = "One insights row, out";
const PANEL_CHIP = "From the connector's fixtures";
const PANEL_FLOW_LEVELS = "account · campaign · ad set · ad";

/** `DAILY_CAMPAIGN`'s single `actions` entry, and the key the normaliser will not read. */
const PANEL_RAW_LABEL = "actions[purchase]";
const PANEL_RAW_VALUE = "7d_click: 30";
const PANEL_RAW_NOTE = "value: 36, never read";

/**
 * The first row of `DAILY_CAMPAIGN` after `normalizeMetaInsights`. Spend is the fixture's own
 * string parsed to a number and lands on the delivery row; the two conversion figures are the
 * `7d_click` keys of `actions` and `action_values`, and land on the `7d_click` row.
 */
const PANEL_STATS = [
  { label: "spend", value: "1,234.56", row: "delivery" },
  { label: "conversions", value: "30", row: "7d_click" },
  { label: "conversions_value", value: "3,000.00", row: "7d_click" },
] as const;

/**
 * The envelope fields written for the attributed row. `timezone` is deliberately not a zone name:
 * the insights edge publishes none, so the connector reads it from the ad account node and the
 * fixture has nothing to show. `account_id` is the fixture's obviously fake number.
 */
const PANEL_ROW = [
  { key: "source", value: "meta_ads" },
  { key: "account_id", value: "act_000000000000001" },
  { key: "date", value: "2026-08-14" },
  { key: "currency", value: "THB" },
  { key: "timezone", value: "read from the ad account" },
  { key: "attribution_window", value: "7d_click" },
] as const;

/** The anchors under the hero, in page order. */
const SECTION_LINKS = [
  { href: "#destinations", label: "Where rows go" },
  { href: "#lanes", label: "Two ways to connect" },
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
 * `path` is the outline mark, drawn in the same 24-unit box as the cards below.
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
    body: "Every source in this build emits the same envelope row, so Meta Ads sits beside the others without a second schema.",
    cta: "Read the documentation",
    href: "/docs",
    path: "M4 7h16v13H4zM4 7l8 6 8-6M4 4h16",
  },
  {
    id: "google-ads",
    title: "The other ad source",
    body: "Google Ads, read the way Google reports it, with its own window rule and its own refusals.",
    cta: "See the Google Ads connector",
    href: "/connectors/google-ads",
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

/* Two ways to connect. The section this connector exists to have. */
const LANES_EYEBROW = "The only source here with a choice";
const LANES_HEADING = "Two credential lanes.";
const LANES_LEAD =
  "Every other provider in this build offers exactly one way in. The same Meta ad account can be connected two ways, and what differs between them is what a reader has to decide before connecting.";

/**
 * Both cards are read out of `packages/connections/src/connections.ts`: `PROVIDER_LANES.meta_ads`
 * is `["oauth", "bearer"]`, and the bullets are the properties the `CredentialLane` comment and
 * `connectWithToken` record for each lane. Nothing here describes a screen in Meta's interface.
 */
const LANES = [
  {
    id: "oauth",
    name: "oauth",
    title: "Send an owner through the consent screen",
    body: "An authorisation server issues the credential, so it has a clock and possibly a refresh token. This is the only lane that can ever repair itself without the customer.",
    points: [
      "A refresh token may be issued",
      "An expiry comes from the issuer",
      "This company is the party under review",
    ],
  },
  {
    id: "bearer",
    name: "bearer",
    title: "Paste a System User token",
    body: "The customer mints one opaque token in its own Business Manager, so there is no consent screen and no authorisation server standing between the two of you.",
    points: [
      "Never refreshable, because there is no issuer to ask",
      "A clock only if the platform gave a date",
      "Nobody is put in front of a reviewer",
    ],
  },
] as const;

/**
 * The three consequences of the bearer lane that a connection page must not leave implied. All
 * three are from `connectWithToken` and the `CredentialLane` comment above it.
 */
const LANES_NOTES = [
  "A System User token may be permanent or dated sixty days out, from the same screen. A stored expiry of none means permanent, and nothing downstream may read it as unknown, because a health check would then report a connection that died last week as healthy.",
  "No scopes come back at paste time and none are invented. An insufficient permission surfaces as a refusal on the first pull, and the connection is marked for reconnection, because only the customer can widen it.",
  "Either lane seals the credential per workspace, and the token travels in a request header. It is never written into a URL, because Meta returns its own next-page link with the token embedded in it.",
] as const;

/* What you can see. */
const WHAT_EYEBROW = "Six rules the normaliser enforces";
const WHAT_HEADING = "Numbers that survive the trip.";
const WHAT_LEAD =
  "Each card below is a rule applied to every row, and each one exists because getting it wrong produces a plausible number rather than an error.";

/** Six cards, each a documented behaviour of `normalize.ts` or `client.ts` in this repository. */
const WHAT_YOU_SEE = [
  {
    title: "One row per window",
    body: "Meta returns the same purchase under every window that claims it. Flattening that into one row either counts one sale six times or keeps whichever key was read last, so the window is part of the key instead.",
    path: "M12 2a10 10 0 1 0 10 10h-10V2Z",
  },
  {
    title: "Spend is not attributed",
    body: "Spend, impressions and clicks are the same figure whatever window you ask for, so they go on one row per entity and day with no window at all rather than onto each window row.",
    path: "M12 2v20M17 6a5 5 0 0 0-5-2c-3 0-5 1.5-5 4s2 3.5 5 4 5 1.5 5 4-2 4-5 4a5 5 0 0 1-5-2",
  },
  {
    title: "Not every action is a sale",
    body: "A default response carries link clicks, landing page views, post engagements and video views alongside purchases. Only the configured action types are counted, and two names for one sale are refused rather than added up.",
    path: "m6 11 4 4L21 4M20 12v8H3V3h12",
  },
  {
    title: "Counts parsed, never coerced",
    body: "Every number Meta returns is a string. Each one is parsed explicitly and an empty or unparseable value is refused, because a wrong zero is indistinguishable from a real one.",
    path: "M9 7h6M9 12h6M9 17h3M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  },
  {
    title: "A day that fell to zero is written",
    body: "An absent window key means nothing was credited in it, and that row is still emitted with a zero. A connector that skips it leaves yesterday's higher number standing with nothing to correct it.",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  },
  {
    title: "A day, not a range",
    body: "One row per day is set by the client rather than accepted from the caller, and a row spanning more than one day is refused, because read as a day it would put a whole window's spend on its first one.",
    path: "M8 2v4m8-4v4M3 10h18M5 6h14v14H5z",
  },
] as const;

/* What it reads. */
const READS_EYEBROW = "The mapping, in full";
const READS_HEADING = "What the connector actually reads.";
const READS_LEAD =
  "Four levels, three mapped metrics, two action arrays and seven windows. This is the whole list, and a field with no dictionary entry fails the pull rather than being dropped.";

/** `META_GRAPH_BASE` pins the version. Not a sentence, so it is a caption rather than copy. */
const READS_API_VERSION = "Graph API v21.0";

const LEVEL_TABLE_CAPTION = "The reporting levels, and the canonical entity each becomes";

/**
 * `LEVEL_SHAPE` in `normalize.ts`, verbatim: Meta's own word, the canonical grain it maps to, the
 * id field the row is keyed on and the parent field selected alongside it. `adset` to `ad_group` is
 * the case the envelope was written for, and both words survive on the row.
 */
const LEVEL_ROWS = [
  { level: "account", type: "account", id: "account_id", parent: "none" },
  { level: "campaign", type: "campaign", id: "campaign_id", parent: "none" },
  { level: "adset", type: "ad_group", id: "adset_id", parent: "campaign_id" },
  { level: "ad", type: "ad", id: "ad_id", parent: "adset_id" },
] as const;

const METRIC_TABLE_CAPTION = "Metrics, and which of the two rows each one lands on";

/**
 * `META_METRIC_MAP` joined to `METRICS`, plus the two action arrays the attributed rows are summed
 * from. Units are the dictionary's own. The right-hand column is the fan-out rule.
 */
const METRIC_ROWS = [
  {
    field: "spend",
    metric: "spend",
    unit: "currency",
    lands: "delivery row, no window",
  },
  {
    field: "impressions",
    metric: "impressions",
    unit: "count",
    lands: "delivery row, no window",
  },
  {
    field: "clicks",
    metric: "clicks",
    unit: "count",
    lands: "delivery row, no window",
  },
  {
    field: "actions",
    metric: "conversions",
    unit: "count",
    lands: "one row per window",
  },
  {
    field: "action_values",
    metric: "conversions_value",
    unit: "currency",
    lands: "one row per window",
  },
] as const;

const WINDOWS_CAPTION = "The windows the connector will ask for";

/** `META_ACTION_WINDOWS`, in its own order. */
const WINDOWS = [
  "1d_click",
  "7d_click",
  "28d_click",
  "1d_view",
  "7d_view",
  "28d_view",
  "1d_ev",
] as const;

/** The decision recorded on that constant, which is why the list is seven and not eleven. */
const WINDOWS_NOTE =
  "The shared vocabulary carries four more names that Meta reports somewhere. They are not requested here, because whether the query parameter accepts them is unverified against a live call and asking for one it rejects fails the whole request.";

/** Four decisions recorded in `normalize.ts`, each an exclusion rather than an omission. */
const READS_EXCLUSIONS = [
  "Ratios are not read. Meta will also return cost per click, cost per mille, click-through rate and cost per action type, and every one of them is a different number when it is computed over a different denominator than the one Meta used.",
  "The default-window figure on each action entry is declared and never read. Meta documents it only as the metric value of the default attribution window and never names that default, so a count taken from it could not be labelled.",
  "Purchase is the one action type counted unless an account configures otherwise, because which name an account reports under depends on how its own pixel is set up.",
  "A field that is neither structural nor a dictionary metric fails the pull. A new metric requires a dictionary change first, and dropping an unrecognised field quietly is what that rule exists to prevent.",
] as const;

const READS_LINK_LABEL = "Read the documentation";

/* Getting started. */
const SETUP_EYEBROW = "What a connection needs";
const SETUP_HEADING = "Four things before a pull runs.";
const SETUP_LEAD =
  "One credential, one account number, one extra call, and the windows named aloud.";

const SETUP_STEPS = [
  {
    title: "Pick a lane",
    body: "Send an account owner through the consent screen, or paste a System User token the customer minted itself. Both are offered for this provider and only this one.",
  },
  {
    title: "Name the ad account",
    body: "Meta takes one spelling of the account number in a path and returns another on the row, so it is normalised to a single form before anything is stored.",
  },
  {
    title: "Read the ad account node",
    body: "One extra call per account per run returns the currency and the time zone. The insights response carries no zone at all, and every date it reports is a day boundary in that one.",
  },
  {
    title: "Ask for the windows explicitly",
    body: "At least one window is required. Pages are followed by cursor, and the pull stops when Meta's own utilisation reading says to rather than pressing on against a shared ceiling.",
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
 * Eight answers, each traceable. The restatement answer QUOTES the clock note rather than
 * paraphrasing it, because the quotation is the source of the 28 and a paraphrase would read as a
 * guarantee this repository has not been given.
 */
const FAQS = [
  {
    question: "Can this connector run on a schedule?",
    answer:
      "Not yet. The source directory holds a client and a normaliser and no backfill module, so there is nothing for the scheduler to call. Two other sources in this build have one; this is not one of them.",
  },
  {
    question: "Which credentials can I connect with?",
    answer:
      "Either an authorised grant or a pasted System User token. This is the only provider in this build that offers two lanes, and the lane is recorded on the connection rather than assumed from the provider.",
  },
  {
    question: "Does the System User lane need a consent screen?",
    answer:
      "No. The customer mints the token in its own Business Manager, so nobody is put in front of a reviewer. The trade is that no scopes are reported back and the credential can never be refreshed.",
  },
  {
    question: "When does a pasted token expire?",
    answer:
      "Only the customer knows. Meta will mint a token that never expires or one dated sixty days out from the same screen, so an expiry is accepted and optional, and a stored absence of one means permanent rather than unknown.",
  },
  {
    question: "How long can a Meta number still change?",
    answer:
      "Twenty-eight days, and the clock note quotes its source rather than paraphrasing it: insights \u201cdo not change after 28 days of being reported\u201d. A row carries the date it stops being open, counted from the later of the day it describes and the day it was first seen.",
  },
  {
    question: "Does that clock start at delivery or at first report?",
    answer:
      "Unresolved in Meta's own documentation, per both the specification's researcher and its fact-checker. This build anchors on when a row was first seen, which is the first-report reading, and the way to settle it is to diff a historical pull against a re-pull thirty days later.",
  },
  {
    question: "Why is no rate limit quoted on this page?",
    answer:
      "Because none of the figures in the research appear in the source it cites. Pacing is measured from whatever utilisation Meta reports on each response, and the one stopping percentage in the client is a guess that a caller who has observed the real behaviour can replace.",
  },
  {
    question: "Are the example payloads real?",
    answer:
      "No. The fixtures are synthetic, written from the documented response shape, and the module says they must be replaced with a recorded response from a real ad account before the connector ships.",
  },
] as const;

/* The closing panel. */
const FINAL_HEADING = "Every conversion, with its window.";
const FINAL_LEAD = "One row that says which window credited it, and how long it can still move.";
const FINAL_CTA = "Read the documentation";

/** Shared class strings, so the hero buttons and the closing one cannot drift apart. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const TEXT_LINK = "text-accent inline-flex items-center gap-3 text-sm font-bold hover:underline";
const EYEBROW = "text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs";
const SECTION_HEADING =
  "font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-semibold tracking-[-0.02em] md:text-[38px]";
const TABLE_HEAD = "text-ink-subtle border-line border-b px-4 py-3 text-left font-bold";
const TABLE_CELL = "border-line-soft text-ink-muted border-b px-4 py-3 align-top";

export default function MetaAdsConnectorPage() {
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
              <li aria-current="page">Meta Ads</li>
            </ol>
          </nav>

          <div className="mt-9 grid items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-3">
                {/* Decorative: the eyebrow and the h1 beside it both name the platform. */}
                <img
                  src="/platforms/meta.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <span className="text-ink-subtle text-[11px] font-bold tracking-[0.12em] uppercase">
                  {HERO_EYEBROW}
                </span>
              </div>

              <h1 className="font-display text-ink text-[36px] leading-[1.06] font-semibold tracking-[-0.04em] md:text-[42px] lg:text-[48px]">
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
                    src="/platforms/meta.svg"
                    alt="Meta Ads"
                    width={58}
                    height={58}
                    className="h-[45px] w-[45px] object-contain md:h-[58px] md:w-[58px]"
                  />
                  <strong className="text-ink text-center text-sm">Meta Ads</strong>
                </div>

                {/* The track. The level caption sits over a mint-to-blue rule; the arrow is
                    decorative, the caption carries the meaning. */}
                <div className="min-w-0 flex-1 px-2 text-center">
                  <span className="text-ink-faint text-[8px] md:text-[9px]">
                    {PANEL_FLOW_LEVELS}
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

              {/* The action entry the two conversion figures are summed from, and the key beside
                  them that is deliberately never read. */}
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
                    <dt className="text-ink-faint font-mono truncate text-[10px]">{stat.label}</dt>
                    <dd className="font-display text-ink mt-1 text-lg font-semibold md:text-[22px]">
                      {stat.value}
                      <span className="text-ink-faint font-body block text-[10px] font-normal">
                        {stat.row}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="bg-surface-subtle text-ink-muted font-mono mt-6 rounded-lg p-4 text-[10px] leading-[1.9] md:text-[11px]">
                {PANEL_ROW.map((line) => (
                  <div key={line.key} className="flex gap-2">
                    <dt className="text-ink-faint w-[92px] shrink-0 md:w-[112px]">{line.key}</dt>
                    <dd className="min-w-0 break-words">{line.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* The in-page anchors. A scroller on a phone, so the six never wrap into a stack. */}
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
                <h3 className="font-display text-ink mt-5 mb-3 text-base leading-[1.3] font-semibold tracking-[-0.01em] md:mt-6 md:text-[18px]">
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

        {/* TWO WAYS TO CONNECT -- a full-bleed tinted band, as the Shopify page's `.soft-section`.
            This is the section that exists because of this connector rather than in spite of it. */}
        <section
          id="lanes"
          aria-labelledby="lanes-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
              <span className={EYEBROW}>{LANES_EYEBROW}</span>
              <h2 id="lanes-heading" className={SECTION_HEADING}>
                {LANES_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {LANES_LEAD}
              </p>
            </div>

            <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
              {LANES.map((lane) => (
                <li
                  key={lane.id}
                  className="border-line bg-surface flex flex-col rounded-lg border p-6 md:p-7"
                >
                  <span className="border-line text-ink-subtle font-mono self-start rounded-md border px-3 py-1 text-xs">
                    {lane.name}
                  </span>
                  <h3 className="font-display text-ink mt-5 mb-3 text-xl leading-[1.3] font-semibold tracking-[-0.01em]">
                    {lane.title}
                  </h3>
                  <p className="text-ink-muted text-[15px] leading-[1.7]">{lane.body}</p>
                  <ul className="border-line-soft mt-5 border-t">
                    {lane.points.map((point) => (
                      <li
                        key={point}
                        className="border-line-soft text-ink-muted border-b py-3 text-[13px] leading-[1.6] last:border-b-0"
                      >
                        <span aria-hidden="true" className="text-brand-mint mr-2 font-bold">
                          &#8226;
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <ul className="mt-6 grid gap-3 md:mt-8 md:grid-cols-3 md:gap-4">
              {LANES_NOTES.map((note) => (
                <li
                  key={note}
                  className="border-line bg-surface text-ink-muted rounded-lg border px-5 py-4 text-[13px] leading-[1.65]"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* WHAT YOU CAN SEE. */}
        <section
          id="what-you-see"
          aria-labelledby="what-you-see-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
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
              <li key={item.title} className="border-line bg-surface rounded-lg border p-6 md:p-7">
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
                <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-semibold tracking-[-0.01em]">
                  {item.title}
                </h3>
                <p className="text-ink-muted text-[15px] leading-[1.7]">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* WHAT IT READS. Two real data tables, each in its own horizontal scroller so the page
            body never scrolls sideways on a phone. */}
        <section
          id="reads"
          aria-labelledby="reads-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mb-8 max-w-[720px] md:mb-10">
              <span className={EYEBROW}>{READS_EYEBROW}</span>
              <h2 id="reads-heading" className={SECTION_HEADING}>
                {READS_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {READS_LEAD}
              </p>
              <p className="border-line text-ink-subtle bg-surface mt-5 inline-block rounded-md border px-3 py-1.5 text-xs">
                {READS_API_VERSION}
              </p>
            </div>

            <div className="border-line bg-surface overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <caption className="text-ink-subtle px-4 pt-4 pb-3 text-left text-xs">
                  {LEVEL_TABLE_CAPTION}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD}>
                      Meta level
                    </th>
                    <th scope="col" className={TABLE_HEAD}>
                      Canonical entity
                    </th>
                    <th scope="col" className={TABLE_HEAD}>
                      Keyed on
                    </th>
                    <th scope="col" className={TABLE_HEAD}>
                      Parent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LEVEL_ROWS.map((row) => (
                    <tr key={row.level}>
                      <th scope="row" className={`${TABLE_CELL} text-ink font-mono font-normal`}>
                        {row.level}
                      </th>
                      <td className={`${TABLE_CELL} font-mono`}>{row.type}</td>
                      <td className={`${TABLE_CELL} font-mono`}>{row.id}</td>
                      <td className={`${TABLE_CELL} font-mono`}>{row.parent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-line bg-surface mt-5 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <caption className="text-ink-subtle px-4 pt-4 pb-3 text-left text-xs">
                  {METRIC_TABLE_CAPTION}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD}>
                      Meta field
                    </th>
                    <th scope="col" className={TABLE_HEAD}>
                      Canonical metric
                    </th>
                    <th scope="col" className={TABLE_HEAD}>
                      Unit
                    </th>
                    <th scope="col" className={TABLE_HEAD}>
                      Lands on
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
                      <td className={TABLE_CELL}>{row.lands}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* The seven windows. A chip list rather than a third table: each is one token, and a
                table of one-cell rows would be a table in name only. */}
            <div className="border-line bg-surface mt-5 rounded-lg border p-5 md:p-6">
              <p className="text-ink-subtle text-xs">{WINDOWS_CAPTION}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {WINDOWS.map((window) => (
                  <li
                    key={window}
                    className="border-line text-ink bg-surface-subtle font-mono rounded-md border px-3 py-1.5 text-xs"
                  >
                    {window}
                  </li>
                ))}
              </ul>
              <p className="text-ink-subtle mt-4 text-[13px] leading-[1.65]">{WINDOWS_NOTE}</p>
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

            <a href="/docs" className={`${TEXT_LINK} mt-6`}>
              {READS_LINK_LABEL}
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
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
                <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-semibold tracking-[-0.01em]">
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
              className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-[36px]"
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

        {/* THE CLOSING PANEL. The pale-blue inset surface, for the reason recorded on the Shopify
            page: the design's blue-to-mint wash has no token and this is the role the guide gives
            a soft feature background. */}
        <section
          aria-labelledby="final-cta-heading"
          className="mx-auto max-w-[1200px] px-8 pb-12 md:pb-[70px]"
        >
          <div className="bg-surface-inset flex flex-col gap-6 rounded-xl p-8 md:flex-row md:items-center md:justify-between md:p-12">
            <div className="min-w-0">
              <h2
                id="final-cta-heading"
                className="font-display text-ink mb-2.5 text-[28px] leading-[1.16] font-semibold tracking-[-0.02em] md:text-[30px]"
              >
                {FINAL_HEADING}
              </h2>
              <p className="text-ink-muted leading-[1.65]">{FINAL_LEAD}</p>
            </div>
            <a href="/docs" className={`${PRIMARY_BUTTON} shrink-0 self-start md:self-auto`}>
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
