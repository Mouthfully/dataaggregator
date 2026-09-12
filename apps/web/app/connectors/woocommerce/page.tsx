import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../../_chrome";

/**
 * THE WOOCOMMERCE CONNECTOR PAGE, at /connectors/woocommerce.
 *
 * IT IS MODELLED ON `connectors/shopify/page.tsx` AND SOURCED FROM SOMEWHERE ELSE ENTIRELY. The
 * layout is that page's -- hero with a mark, destinations, what you can see, a numbered setup
 * sequence, a closing note -- and the design reference behind it is `shopify.html`. But the
 * reference has no WooCommerce page, so there was nothing to transcribe, and the shape of the
 * failure that page records in its own FIELD_CATEGORIES comment is the one this file exists to
 * avoid: a catalogue of field names and descriptions that appear in no source, indistinguishable
 * at a glance from a real one.
 *
 * SO EVERY FACTUAL CLAIM BELOW IS READ OUT OF THE CONNECTOR, and each constant carries the file it
 * came from. The metrics are `sources/woocommerce/normalize.ts`; the entity and dimension shape is
 * the same file's `rows.push`; the credential lane is `PROVIDER_LANES` in
 * `packages/connections/src/connections.ts`; the restatement window and its note are
 * `RESTATEMENT_CLOCKS.woocommerce` in `packages/contract/src/restatement.ts`; the metric units are
 * `METRICS` in `packages/contract/src/metrics.ts`; the setup sequence is `scripts/seal-connection.ts`
 * and `sources/woocommerce/client.ts`; the timezone rule is the two migrations named on
 * SETUP_STEPS; what survives into the archive is `packages/payloads/src/redaction.ts`. Where a fact
 * is not published -- the product and customer entities -- the page says so instead
 * of filling the gap.
 *
 * THERE IS NO WOOCOMMERCE MARK IN `public/platforms`, AND THAT IS STATED RATHER THAN WORKED AROUND.
 * The directory ships artwork for thirteen platforms and this is not one of them. Borrowing a
 * neighbouring platform's file, or drawing something that resembles the real logo, would both be a
 * worse answer than a neutral tile: the first is wrong, the second is a trademark drawn from
 * memory. The hero and the flow panel use a token-coloured tile with a generic storefront glyph,
 * and MARK_NOTE at the foot of the page says why it is not the platform's own mark.
 *
 * THE FLOW PANEL CARRIES NO EXAMPLE FIGURES. `shopify.html`'s panel has an order count, a revenue
 * total and a refresh interval, and that page renders them because they are the design's own,
 * labelled as an example connection. Nothing equivalent exists for this connector, so the panel is
 * filled with the connection's actual contract instead -- lane, expiry, scopes, entity, window --
 * every line of which is a value a reader can go and find. Invented numbers in a panel labelled
 * "example" are still numbers a merchant plans around.
 *
 * THE DESTINATIONS BLOCK IS THE REFERENCE'S, TRANSCRIBED. Its four cards and their copy are
 * `shopify.html`'s `#destinations` section verbatim; they describe where reporting output goes and
 * make no claim about this connector, so they carry across unchanged.
 *
 * BUTTONS THAT OPENED A DIALOG GO SOMEWHERE INSTEAD. As on the Shopify page, the reference's
 * `data-connect-*` buttons become links to /dashboard: the label stays, only the destination moved.
 *
 * COLOUR. No literal is written here. The mint-to-blue rule in the flow panel is composed from the
 * two brand gradient stops with Tailwind's gradient utilities, and the closing panel takes the pale
 * blue inset surface, which is the token the brand guide gives to soft feature backgrounds -- both
 * the same substitutions the Shopify page recorded.
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half only. */
export const metadata: Metadata = {
  title: "WooCommerce connector",
  description:
    "Read orders from your own WooCommerce store with a key you issue yourself. No OAuth, no expiry, and every row says what it still might change.",
  alternates: { canonical: "/connectors/woocommerce" },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from one of the constants below. Eyebrows are stored in sentence case because
 * the capitals are CSS, which is what every section file already does.
 * ------------------------------------------------------------------------------------------- */

const HERO_EYEBROW = "Ecommerce connector";

/** The second line is the gradient one, as in the reference's h1. */
const HERO_HEADING_TOP = "Your WooCommerce store.";
const HERO_HEADING_BOTTOM = "Read with your own key.";

/**
 * Every clause here is a fact from the connector. The key and secret are the `key_secret` lane in
 * `PROVIDER_LANES`; the absence of an authorisation server is that lane's own definition in
 * `connections.ts`; reading orders is what `ordersUrl` in `client.ts` fetches and all it fetches.
 */
const HERO_LEAD =
  "The store is your own database, not a platform reporting pipeline. The connector reads its orders with a key and secret you issue in your own admin, and reports what changed rather than assuming nothing did.";

const HERO_PRIMARY_CTA = "Explore dashboard";
const HERO_SECONDARY_CTA = "See what it reads";

/**
 * The three reassurances under the hero actions. None is a sentence; all three are read from
 * `connectWithKey` in `packages/connections/src/connections.ts`, which seals this lane with
 * `grantedScopes: []` and `expiresAt: null`, over the comment "NULL MEANS NO EXPIRY".
 */
const HERO_CHECKS = ["No OAuth redirect", "No consent screen", "No expiry"] as const;

/* The connection panel beside the hero. */
const PANEL_LABEL = "The connection, as the code defines it";
const PANEL_CHIP = "Read from source";
const PANEL_FLOW_CAPTION = "Orders, over https";
const PANEL_STORE_LABEL = "Your store";

/**
 * The panel's contract lines. `key` is the dimmed column, `value` the lit one.
 *
 * source            `Source` in `packages/contract/src/source.ts`, and the key of the
 *                   `RESTATEMENT_CLOCKS` entry.
 * credential        `PROVIDER_LANES.woocommerce` is `["key_secret"]`, and only that.
 * expires_at        `connectWithKey` seals `expiresAt: null`; the comment above it reads "NULL
 *                   MEANS NO EXPIRY, not unknown".
 * granted_scopes    the same function seals `grantedScopes: []`, over "Empty, not invented".
 * entity            `normalize.ts` writes `type: "order"`, `native_entity_type: "shop_order"`.
 * restates_until    `RESTATEMENT_CLOCKS.woocommerce.windowDays` is null, so `restatesUntil`
 *                   returns null for every row.
 */
const PANEL_CONTRACT = [
  { key: "source", value: "woocommerce" },
  { key: "credential", value: "key_secret" },
  { key: "expires_at", value: "null — no expiry" },
  { key: "granted_scopes", value: "[] — none reported" },
  { key: "entity", value: "order / shop_order" },
  { key: "restates_until", value: "null — no window closes" },
] as const;

/**
 * Three numbers, each an exported constant in `sources/woocommerce/client.ts` or `backfill.ts`,
 * with the derivation recorded beside it there.
 */
const PANEL_LIMITS = [
  { label: "Orders per page", value: "100" },
  { label: "Pages per window", value: "20" },
  { label: "Days per chunk", value: "31" },
] as const;

/** The five in-page anchors, in this page's own order. */
const SECTION_LINKS = [
  { href: "#destinations", label: "Destinations" },
  { href: "#data", label: "What you can see" },
  { href: "#contract", label: "Credential and clock" },
  { href: "#setup", label: "Getting started" },
  { href: "#connector-faq", label: "FAQs" },
] as const;

/* Destinations. Transcribed from `shopify.html`'s `#destinations` section. */
const DESTINATIONS_EYEBROW = "Your data, where you need it";
const DESTINATIONS_HEADING = "Choose your destination.";
const DESTINATIONS_LEAD = "Start with a dashboard. Keep exploring in the tools your team knows.";

/**
 * The four destinations. The first card's title names the product, which may not be typed as a
 * literal outside the brand package -- `scripts/check-brand.mjs` enforces that -- so it is composed
 * from `brand.productName`, which is already capitalised correctly and is not transformed here.
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

/* What you can see. */
const DATA_EYEBROW = "Read out of the connector";
const DATA_HEADING = "Four metrics, and two of them are conditional.";
const DATA_LEAD =
  "Every row is one order. These are the metrics the normaliser emits, and the rule that decides whether each one appears at all.";

const METRICS_TABLE_CAPTION = "Metrics emitted per order";
const METRICS_COLUMNS = ["Metric", "Unit", "When it appears", "What it is"] as const;

/**
 * THE METRIC TABLE. Every cell is read, not composed.
 *
 * Names and units are `METRICS` in `packages/contract/src/metrics.ts` (`orders` is a count; the
 * other three are currency). The emission rules and the descriptions are `normalizeWooOrders` in
 * `sources/woocommerce/normalize.ts`: `orders` and `revenue` are set unconditionally, and `fees`
 * and `net_revenue` are both inside `if (fee !== null)`.
 */
const METRIC_ROWS = [
  {
    name: "orders",
    unit: "count",
    when: "Every order",
    what: "The store's own count of orders placed. A refund does not un-place an order, so this stays at one and the money moves instead.",
  },
  {
    name: "revenue",
    unit: "currency",
    when: "Every order",
    what: "Gross, as the store reports it: the order total plus its refund totals, which WooCommerce already sends as negative numbers.",
  },
  {
    name: "fees",
    unit: "currency",
    when: "Only when the gateway wrote one",
    what: "Payment-processing cost. Core WooCommerce publishes none, so it is read from the gateway metadata keys the connector recognises, and is absent rather than zero when no gateway wrote one.",
  },
  {
    name: "net_revenue",
    unit: "currency",
    when: "Only alongside a known fee",
    what: "Gross minus what the platform kept. It is withheld whenever the fee is unknowable, because a net figure quietly missing a deduction is wrong in the flattering direction.",
  },
] as const;

/** `WOO_FEE_META_KEYS` in `normalize.ts`, in full. It is an allow-list, not a pattern. */
const FEE_KEYS_LABEL = "Gateway keys a fee may be read from";
const FEE_KEYS = ["_stripe_fee", "_wcpay_transaction_fee"] as const;
const FEE_KEYS_NOTE =
  "A key earns a place on that list by being read against a real response from that gateway. Most stores write nothing at all, which is the finding rather than a gap.";

const DIMENSIONS_HEADING = "What each row carries";

/**
 * The dimension and provenance fields, from the `rows.push` call in `normalize.ts`. `fx_*` are all
 * null there, over the comment "The store reports in its own currency and converts nothing".
 */
const DIMENSION_ROWS = [
  {
    field: "date",
    what: "The calendar day the order falls on in the store's own timezone, not in UTC.",
  },
  {
    field: "currency",
    what: "The order's own currency. An order without one is refused rather than defaulted.",
  },
  { field: "timezone", what: "The zone the date above was computed in, copied onto every row." },
  {
    field: "attribution_window",
    what: "Null. A shop's own order is attributed to nothing, so a window here would be a label with nothing to label.",
  },
  {
    field: "source_updated_at",
    what: "The order's last-modified time, which is the field the incremental pull filters on.",
  },
  {
    field: "is_provisional",
    what: "Always true for this source, because no restatement window ever closes.",
  },
  {
    field: "fx_rate",
    what: "Null, along with every other conversion field. The store reports in its own currency and converts nothing.",
  },
] as const;

/** Stated because it is absent, and the Shopify page's three tab labels invite the question. */
const DATA_NOT_PUBLISHED =
  "Products and customers are not read. The connector fetches orders, and there is no published catalogue of product or customer fields to show.";

/* Credential and clock. */
const CONTRACT_EYEBROW = "Three things that are unusual";
const CONTRACT_HEADING = "What makes this connector different.";
const CONTRACT_LEAD =
  "Each of these is a property of WooCommerce itself rather than a choice about how to present it.";

/**
 * The three differentiators. Sources, in order: `PROVIDER_LANES` and `connectWithKey` in
 * `connections.ts`; `RESTATEMENT_CLOCKS.woocommerce` in `restatement.ts` and the watermark walk in
 * `sources/woocommerce/backfill.ts`; the two timezone migrations and `assertWooTimezone`.
 */
const CONTRACT_CARDS = [
  {
    title: "A key you issue yourself",
    body: "The credential is a key and secret you create in your own store admin. There is no authorisation server behind it, so there is no consent screen, no redirect address to register and no verification wait. Nothing reports a scope back, and nothing can refresh it, because there is no issuer to ask.",
    detail: "Credential lane: key_secret. Expiry: none.",
    path: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  },
  {
    title: "No window ever closes",
    body: "Advertising platforms stop revising a day after a published number of days. A store does not: you can refund, edit or cancel an order a year after it was placed, so every row stays open to change and is marked as such. Nothing here is ever labelled final, because nothing here ever is.",
    detail: "Restatement window: none. Every row stays provisional.",
    path: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    title: "The store's timezone is required",
    body: "WooCommerce reports order times in UTC, and which day an order belongs to is a question only the store's own zone can answer. Give it once and it cannot be changed afterwards, because the day is part of how a row is identified and moving it would split one order into two.",
    detail: "Set at connection time. Refused, not guessed, when missing.",
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3ZM3.5 9h17m-17 6h17",
  },
] as const;

/** The watermark sentence, from `backfill.ts`'s module note and the clock's own note. */
const WATERMARK_NOTE =
  "Because there is no window to re-read on a schedule, the backfill walks a watermark instead of climbing a ladder: it asks for the orders that were modified since the last run finished, which is what makes a refund resurface the order it belongs to.";

/* Getting started. */
const SETUP_EYEBROW = "From store to first row";
const SETUP_HEADING = "A real, documented sequence.";
const SETUP_LEAD = "Four steps, each one a check something in the repository actually performs.";

/**
 * The four steps.
 *
 * 1 and 4  `probe` in `scripts/seal-connection.ts`: it requests one order from
 *          `/wp-json/wc/v3/orders?per_page=1` before anything is sealed, and its 401/403 message is
 *          where "Read permission on orders" and "shows the secret once" are written. Its 404
 *          message names the admin path.
 * 2        `normaliseStoreUrl` in `client.ts`: https only, origin only, refused at connect time.
 * 3        `assertStorableTimezone` in the seal script, the trigger in
 *          `20260912000400_connection_timezone.sql`, and the refusal to change it in
 *          `20260912000500_connection_timezone_immutable.sql`.
 */
const SETUP_STEPS = [
  {
    title: "Create a REST API key",
    body: "In your own store admin, under WooCommerce, Settings, Advanced, REST API. It needs Read permission on orders and nothing more. WooCommerce shows the secret once, at creation.",
  },
  {
    title: "Give the store address",
    body: "The address of the store itself, over https, with no path after it. Plain http is refused at this point rather than at three in the morning, and the address is trimmed back to its origin.",
  },
  {
    title: "Name the store's timezone",
    body: "A canonical zone name such as Asia/Bangkok, or UTC. It is checked for spelling and for being a zone the database knows, and it is fixed from then on.",
  },
  {
    title: "The key is tried before it is stored",
    body: "One request for a single order runs first. It separates a wrong key from a key without permission on orders, and both of those from a store whose REST route is switched off entirely.",
  },
] as const;

/* FAQs. */
const FAQ_EYEBROW = "Good to know";
const FAQ_HEADING_TOP = "A few details";
const FAQ_HEADING_BOTTOM = "before you connect.";
const FAQ_LINK_LABEL = "Explore documentation";

/**
 * Five questions. Sources in order: `PROVIDER_LANES` and `connectWithKey` (`connections.ts`);
 * `RESTATEMENT_CLOCKS.woocommerce` (`restatement.ts`); the `redact` policy and its keep-list
 * (`packages/payloads/src/redaction.ts`); `normaliseStoreUrl` decision 1 (`client.ts`); the
 * `rest_no_route` branch of `probeFailure` (`client.ts`).
 */
const FAQS = [
  {
    question: "Do I need an OAuth app, or a review?",
    answer:
      "No. This is the one connector whose credential you mint yourself, so no authorisation server is involved: no consent screen, no redirect address to register, and no waiting on anybody's verification queue. The trade is that nothing can renew it for you either.",
  },
  {
    question: "When does an order stop changing?",
    answer:
      "It does not, and the connector says so rather than pretending otherwise. The store is your own database, so an order can be refunded or edited at any remove. Every row is marked as still open, and changes are caught by asking for what was modified since the last run.",
  },
  {
    question: "What of an order is kept?",
    answer:
      "Identifiers, money, quantities, dates and product labels. The billing and shipping blocks, the customer note, the network address and browser the order came from, the customer id and the free-text refund reason are all dropped before anything is archived.",
  },
  {
    question: "Why must the store be on https?",
    answer:
      "Over plain http the WooCommerce API requires a second signing scheme, and your own orders would travel in clear either way. The address is refused at connect time instead, while you are looking at the screen.",
  },
  {
    question: "The store answered that the route does not exist.",
    answer:
      "That is permalinks set to Plain, or WooCommerce switched off, and it is not a bad key. Regenerating the key changes nothing. Set permalinks to anything but Plain and save, then try again.",
  },
] as const;

/* Notes, and the closing panel. */
const NOTES_HEADING = "Notes";

/** Why the tile in the hero is a tile. `public/platforms` ships no artwork for this platform. */
const MARK_NOTE =
  "No WooCommerce artwork ships with this site, so the tile beside the heading is a neutral placeholder rather than the platform's own mark.";

const SOURCE_NOTE =
  "Every figure and field name on this page is read from the connector's own source. Where something is not published, this page says so instead of estimating it.";

const FINAL_HEADING = "Your store. Its own numbers.";
const FINAL_LEAD = "Bring your orders into the bigger picture, with their provenance attached.";
const FINAL_CTA = "Explore connection setup";

/** Shared class strings, so the two hero buttons and the closing one cannot drift apart. */
const PRIMARY_BUTTON =
  "bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-bold transition-colors";
const TEXT_LINK = "text-accent inline-flex items-center gap-3 text-sm font-bold hover:underline";

/**
 * The neutral tile that stands in for a platform mark.
 *
 * A generic storefront outline in the brand blue on the pale inset surface. It is deliberately not
 * a likeness: see the module note, and MARK_NOTE, which says as much on the page itself. Always
 * decorative -- the heading beside it names the platform -- so it is hidden from assistive tech.
 */
function ConnectorTile({ className }: { className: string }) {
  return (
    <span
      className={`border-line bg-surface-inset text-brand-blue flex shrink-0 items-center justify-center rounded-md border ${className}`}
    >
      {/* The hiding sits on the <svg>, not the wrapper: an svg with neither a title nor this
          attribute is announced, and the wrapper holds nothing else to hide. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="60%"
        height="60%"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9h16v11H4zM4 9l1.4-4h13.2L20 9M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M10 20v-6h4v6" />
      </svg>
    </span>
  );
}

export default function WooCommerceConnectorPage() {
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
              <li aria-current="page">WooCommerce</li>
            </ol>
          </nav>

          <div className="mt-9 grid items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-3">
                <ConnectorTile className="h-9 w-9" />
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
                  href="#data"
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

            {/* THE CONNECTION PANEL. A large feature panel, so it takes the 24px radius. Its
                contents are the connector's contract rather than example figures; see the module
                note. */}
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
                  <ConnectorTile className="h-[45px] w-[45px] md:h-[58px] md:w-[58px]" />
                  <strong className="text-ink text-center text-sm">{PANEL_STORE_LABEL}</strong>
                </div>

                {/* The track. The caption sits over a mint-to-blue rule; the arrow is decorative,
                    the caption carries the meaning. */}
                <div className="min-w-0 flex-1 px-2 text-center">
                  <span className="text-ink-faint text-[8px] md:text-[9px]">
                    {PANEL_FLOW_CAPTION}
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

              <dl className="bg-surface-subtle text-ink-muted font-mono rounded-lg p-4 text-[10px] leading-[1.9] md:text-[11px]">
                {PANEL_CONTRACT.map((line) => (
                  <div key={line.key} className="flex gap-2">
                    <dt className="text-ink-faint w-[92px] shrink-0 md:w-[112px]">{line.key}</dt>
                    <dd className="min-w-0 break-words">{line.value}</dd>
                  </div>
                ))}
              </dl>

              <dl className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
                {PANEL_LIMITS.map((limit) => (
                  <div key={limit.label} className="min-w-0">
                    <dt className="text-ink-faint text-[10px]">{limit.label}</dt>
                    <dd className="font-display text-ink mt-1 text-lg font-bold md:text-[22px]">
                      {limit.value}
                    </dd>
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

        {/* DESTINATIONS. The reference's block, transcribed. */}
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

        {/* WHAT YOU CAN SEE -- the design's `.soft-section`, a full-bleed tinted band. Two tables
            rather than a tabbed panel: every row is present, indexable and reachable without
            JavaScript, and both are horizontally scrollable on a phone rather than squeezed. */}
        <section
          id="data"
          aria-labelledby="data-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
            <div className="mb-8 max-w-[760px] md:mb-10">
              <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
                {DATA_EYEBROW}
              </span>
              <h2
                id="data-heading"
                className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
              >
                {DATA_HEADING}
              </h2>
              <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
                {DATA_LEAD}
              </p>
            </div>

            <div className="border-line bg-surface overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">{METRICS_TABLE_CAPTION}</caption>
                <thead>
                  <tr className="border-line border-b">
                    {METRICS_COLUMNS.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="text-ink-subtle px-5 py-3.5 text-[11px] font-bold tracking-[0.08em] uppercase"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map((metric) => (
                    <tr key={metric.name} className="border-line-soft border-b last:border-b-0">
                      <th scope="row" className="px-5 py-4 align-top">
                        <code className="font-mono text-ink text-[13px] font-bold">
                          {metric.name}
                        </code>
                      </th>
                      <td className="text-ink-subtle px-5 py-4 align-top text-[13px] whitespace-nowrap">
                        {metric.unit}
                      </td>
                      <td className="text-ink-muted px-5 py-4 align-top text-[13px]">
                        {metric.when}
                      </td>
                      <td className="text-ink-muted max-w-[420px] px-5 py-4 align-top text-[13px] leading-[1.6]">
                        {metric.what}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-line bg-surface mt-4 rounded-lg border p-5 md:p-6">
              <span className="text-ink-faint block text-[11px] font-bold tracking-[0.12em] uppercase">
                {FEE_KEYS_LABEL}
              </span>
              <ul className="mt-3 flex flex-wrap gap-2">
                {FEE_KEYS.map((key) => (
                  <li
                    key={key}
                    className="border-line bg-surface-subtle text-ink font-mono rounded-md border px-3 py-1.5 text-xs"
                  >
                    {key}
                  </li>
                ))}
              </ul>
              <p className="text-ink-muted mt-4 max-w-[640px] text-[13px] leading-[1.6]">
                {FEE_KEYS_NOTE}
              </p>
            </div>

            <h3 className="font-display text-ink mt-10 mb-4 text-xl leading-[1.3] font-bold tracking-[-0.01em] md:mt-12">
              {DIMENSIONS_HEADING}
            </h3>

            <div className="border-line bg-surface overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <caption className="sr-only">{DIMENSIONS_HEADING}</caption>
                <tbody>
                  {DIMENSION_ROWS.map((row) => (
                    <tr key={row.field} className="border-line-soft border-b last:border-b-0">
                      <th scope="row" className="w-[200px] px-5 py-4 align-top">
                        <code className="font-mono text-ink text-[13px] font-bold">
                          {row.field}
                        </code>
                      </th>
                      <td className="text-ink-muted px-5 py-4 align-top text-[13px] leading-[1.6]">
                        {row.what}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Says what is not read, rather than leaving the absence to be inferred. */}
            <p className="border-line text-ink-subtle mt-5 max-w-[760px] rounded-lg border border-dashed px-5 py-6 text-sm leading-[1.6]">
              {DATA_NOT_PUBLISHED}
            </p>
          </div>
        </section>

        {/* CREDENTIAL AND CLOCK. */}
        <section
          id="contract"
          aria-labelledby="contract-heading"
          className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
        >
          <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {CONTRACT_EYEBROW}
            </span>
            <h2
              id="contract-heading"
              className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-bold tracking-[-0.02em] md:text-[38px]"
            >
              {CONTRACT_HEADING}
            </h2>
            <p className="text-ink-muted mt-4 text-base leading-[1.65] md:text-[17px]">
              {CONTRACT_LEAD}
            </p>
          </div>

          <ul className="grid gap-4 md:grid-cols-3 md:gap-6 lg:gap-[30px]">
            {CONTRACT_CARDS.map((card) => (
              <li
                key={card.title}
                className="border-line bg-surface flex flex-col rounded-lg border p-6 md:p-7"
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
                  <path d={card.path} />
                </svg>
                <h3 className="font-display text-ink mb-3 text-xl leading-[1.3] font-bold tracking-[-0.01em]">
                  {card.title}
                </h3>
                <p className="text-ink-muted flex-1 text-[15px] leading-[1.7]">{card.body}</p>
                <p className="border-line-soft text-ink-subtle font-mono mt-5 border-t pt-4 text-[11px] leading-[1.6]">
                  {card.detail}
                </p>
              </li>
            ))}
          </ul>

          <p className="bg-surface-inset text-ink-muted mt-6 rounded-lg p-6 text-[15px] leading-[1.7] md:mt-8 md:p-7">
            {WATERMARK_NOTE}
          </p>
        </section>

        {/* GETTING STARTED. An ordered list, because the four steps ARE a sequence: the numerals in
            the design are content, not decoration, so they come from <ol> rather than from a typed
            "1" that a screen reader would read as part of the heading. */}
        <section
          id="setup"
          aria-labelledby="setup-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-20">
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

            <ol className="grid gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-4 lg:gap-8">
              {SETUP_STEPS.map((step, index) => (
                <li key={step.title} className="relative min-w-0 pl-[60px] md:pl-0">
                  {/* The numeral duplicates the list's own numbering, so it is hidden from
                      assistive technology rather than announced twice. */}
                  <span
                    aria-hidden="true"
                    className="bg-surface text-accent border-line absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-full border text-[17px] font-bold md:static md:mb-5"
                  >
                    {index + 1}
                  </span>
                  <h3 className="font-display text-ink mb-3 text-lg leading-[1.3] font-bold tracking-[-0.01em] md:text-xl">
                    {step.title}
                  </h3>
                  <p className="text-ink-muted text-[15px] leading-[1.7]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQS. Native <details>, which already owns the disclosure semantics and keyboard
            behaviour the design's accordion needs, so no script is involved. */}
        <section
          id="connector-faq"
          aria-labelledby="faq-heading"
          className="mx-auto grid max-w-[1200px] items-start gap-8 px-8 pt-12 pb-12 md:grid-cols-2 md:gap-10 md:pt-20 md:pb-20 lg:gap-20"
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

        {/* THE CLOSING NOTE, then the closing panel. The design washes that panel blue-to-mint; the
            gradient has no token, so it takes the pale-blue inset surface, which is the role the
            brand guide gives it. */}
        <section
          aria-labelledby="notes-heading"
          className="mx-auto max-w-[1200px] px-8 pb-10 md:pb-14"
        >
          <h2
            id="notes-heading"
            className="text-ink-faint text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs"
          >
            {NOTES_HEADING}
          </h2>
          <ul className="border-line-soft mt-4 max-w-[760px] border-t">
            {[MARK_NOTE, SOURCE_NOTE].map((note) => (
              <li
                key={note}
                className="border-line-soft text-ink-subtle border-b py-3.5 text-xs leading-[1.7]"
              >
                {note}
              </li>
            ))}
          </ul>
        </section>

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
