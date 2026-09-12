import { brand, formatAddress } from "@repo/brand";
import type { Metadata } from "next";

import { Footer, SiteHeader } from "../_chrome";

/**
 * THE PRIVACY POLICY, at /privacy.
 *
 * IT HOLDS TO THE SAME RULE AS `terms/page.tsx`, AND FOR THE SAME REASON. A privacy policy is not
 * marketing that can be softened in the next sprint: it is a written representation a customer's
 * counsel reads, relies on and quotes back, and in several jurisdictions a false statement in one
 * is actionable on its own. So EVERY STATEMENT HERE IS EITHER READ OUT OF THE REPOSITORY OR
 * DECLARED ABSENT.
 *
 * What is read, and from where:
 *
 *   the controller       `brand.legalEntity`, `formatAddress()`, `brand.companyRegistration`,
 *                        `brand.postalAddress.country` and `brand.supportEmail` -- the same five
 *                        values the imprint in `_chrome.tsx` and the parties panel in `terms`
 *                        render, because three documents disagreeing about who the company is
 *                        would be the worst possible drift.
 *   account data         `apps/web/app/_auth/actions.ts` and `auth/callback/route.ts` (a sign-in
 *                        link or Google, never a password held here), `_work-email.ts` (the
 *                        company-address rule), `supabase/migrations/20260908000400_invitations.sql`
 *                        (an invitation is an address and a role) and `20260912000700_waitlist.sql`
 *                        (an address and where the form was submitted from).
 *   the session          `apps/web/middleware.ts`: `getUser()` verifies the token with the auth
 *                        server on every request rather than trusting the cookie.
 *   credentials          `packages/vault/src/vault.ts`: a fresh 256-bit key per connection per
 *                        rotation, the credential sealed under it with AES-256-GCM, that key
 *                        sealed under a key encryption key held outside the database, both seals
 *                        bound to the workspace and connection as additional authenticated data.
 *                        Read-only access and revocation at the platform are the `read-only-oauth`
 *                        claim in `packages/brand/src/claims.ts`, which `allowedClaims()` permits.
 *   platform data        the `tenant-isolation`, `no-pooling` and `no-training` claims, all three
 *                        ALLOWED; `packages/connectors/src/sources/woocommerce/normalize.ts`, whose
 *                        `rows.push` carries identifiers, money, dates and a timezone and no buyer
 *                        name, email, phone or address at all; and
 *                        `packages/payloads/src/redaction.ts`, whose WooCommerce policy is an
 *                        allow-list -- an unrecognised field is dropped rather than stored.
 *   hosting region       `brand.dataRegion`, which is set. The sentence is COMPUTED from it.
 *   cookies              `apps/web/app/_gate/token.ts` (the pre-launch cookie is an HMAC of a fixed
 *                        label, carrying no identity) and `_auth/server.ts` (the session cookies).
 *                        `layout.tsx` loads no third-party script and `globals.css` fetches no
 *                        remote font, so the no-tracking sentence is a property of the tree.
 *   payments             `apps/web/app/_billing/actions.ts`: checkout and the billing portal are
 *                        hosted by the payment processor and the customer is redirected to them, so
 *                        no card detail ever reaches this application.
 *
 * WHAT IS DECLARED ABSENT, AND WHY THAT IS THE ONLY HONEST ANSWER. Six things a reader of a policy
 * like this one expects to find require a decision or an arrangement that does not exist:
 * a data processing agreement (`brand.dpaAvailable` is false), a representative in the Union
 * (`brand.euRepresentative` is null), a published sub-processor list, a transfer mechanism, a
 * retention schedule, and a notice period for changes to this document. `claims.ts` withholds the
 * `gdpr`, `dpa` and `data-region` claims on exactly those grounds. Each is therefore rendered as a
 * clause carrying the `Not yet published` marker and restated in OPEN_ITEMS at the foot.
 *
 * A plausible default would have been easy and is exactly the failure mode. "We rely on standard
 * contractual clauses" and "logs are kept for 12 months" read as decisions, would be relied upon as
 * decisions, and are not ones. An admitted gap can be closed; a fabricated assurance has to be
 * retracted, and by then somebody has already relied on it.
 *
 * NO CERTIFICATION, AUDIT, ATTESTATION OR COMPLIANCE CLAIM APPEARS ANYWHERE ON THIS PAGE. The
 * company is pre-launch and holds none of them.
 *
 * THE LAST-UPDATED DATE IS A CONSTANT, not `new Date()`. A legal document that reports today's date
 * on every render tells a reader it changed this morning and destroys the only signal a version
 * date carries. It is set by hand, here, when the text changes.
 */

/** Head copy. `layout.tsx` appends the product name to the title, so this is the short half. */
export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "Who the controller is, what personal data the account holds, what the connectors read on a customer's behalf, how platform credentials are sealed, and the arrangements that are not yet published.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/* ---------------------------------------------------------------------------------------------
 * COPY. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line of prose on
 * this page arrives from a constant below and is rendered as an expression.
 * ------------------------------------------------------------------------------------------- */

const EYEBROW = "Legal";
const HEADING = "Privacy policy.";

const LEAD =
  "This page describes what personal data is held, why it is held, and who is responsible for it. It separates the data belonging to the person who signs in from the data the connectors read on a customer's behalf, because the two are held for different reasons and under different responsibilities.";

/** Set by hand. `iso` feeds the machine-readable attribute; `display` is what a reader sees. */
const LAST_UPDATED = {
  iso: "2026-09-12",
  display: "12 September 2026",
} as const;

const LAST_UPDATED_LABEL = "Last updated";
const STATUS_LABEL = "Status";
const STATUS_VALUE = "Pre-launch draft";
const OPEN_BADGE = "Not yet published";
const OPEN_COUNT_LABEL = "Open items";

/** The standing notice under the hero, and the first thing a reviewer should read. */
const HEADLINE_NOTE =
  "The service is not yet generally available and has no customers. Several arrangements a buyer would look for here have not been made yet, and the clauses that would describe them say so and state nothing in their place. No certification, audit, attestation or compliance claim is made anywhere on this page.";

/* The controller panel. Every value is read from the brand package; none is typed here. */
const CONTROLLER_LABEL = "Responsible for this data";

const CONTROLLER_ROWS = [
  { key: "Controller", value: brand.legalEntity },
  { key: "Registered address", value: formatAddress() },
  { key: "Company registration", value: brand.companyRegistration },
  { key: "Country of registration", value: brand.postalAddress.country },
] as const;

const CONTACT_ROW_LABEL = "Contact";

/**
 * THE DISTINCTION THE REST OF THE PAGE RESTS ON, stated once at the top in two columns.
 *
 * The left column is data about the person using the product, held because the product needs it.
 * The right column is the customer's own business data, read from platforms the customer already
 * uses, on the customer's instruction. Confusing the two is how a policy ends up promising the
 * wrong things about the wrong records.
 */
const ROLES_HEADING = "Two kinds of data, two different roles";

const ROLES = [
  {
    id: "account",
    title: "Account data",
    role: "We decide why it is held",
    body: "The small amount of personal data the product needs in order to have an account at all: a name and a work email address for the person signing in, the addresses of colleagues they invite, and a reference to the billing record held by the payment processor. We decide the purpose and the means, so this is ours to answer for.",
  },
  {
    id: "platform",
    title: "Customer platform data",
    role: "The customer decides why it is read",
    body: "The business data a connector reads out of a platform the customer already uses, using the customer's own credentials, because the customer connected it. We act on the customer's instructions here rather than our own, which makes the customer responsible for that data and us a processor of it. No agreement recording those instructions in writing is available yet, and the clause on that below says so.",
  },
] as const;

/* The inventory table. */
const INVENTORY_HEADING = "What is held, and why";
const INVENTORY_LEAD =
  "Every row below is a record something in the product actually creates. Nothing is listed for completeness that the service does not collect.";

const INVENTORY_CAPTION = "Personal data held, by category";
const INVENTORY_COLUMNS = [
  "Category",
  "What it is",
  "Why it is held",
  "Where it comes from",
] as const;

const INVENTORY_ROWS = [
  {
    category: "Sign-in identity",
    what: "A name and a work email address for the person signing in.",
    why: "To create the account, to send the sign-in link, and to know who is in a workspace.",
    from: "Entered on the sign-in form, or returned by the sign-in provider.",
  },
  {
    category: "Invitations",
    what: "The email address of a colleague who has been invited, and the role offered.",
    why: "To send the invitation and to let that person join the workspace that invited them.",
    from: "Entered by an administrator of the workspace.",
  },
  {
    category: "Waiting list",
    what: "An email address, and which page the form was submitted from.",
    why: "To tell a person when the product opens, while it is still pre-launch.",
    from: "Entered on the waiting-list form.",
  },
  {
    category: "Platform credentials",
    what: "The token or key a connected platform issues, held only in sealed form.",
    why: "To fetch the connected account's own data on the schedule the customer set.",
    from: "Issued by the platform, or created by the customer in its own admin.",
  },
  {
    category: "Connected platform data",
    what: "Normalised rows of the customer's own business data, and the archived platform responses they were read from.",
    why: "To report what the customer's numbers are and what changed about them.",
    from: "Read from the platforms the customer connected.",
  },
  {
    category: "Billing",
    what: "A reference to the customer record held by the payment processor, and the state of the subscription.",
    why: "To know which plan an account is entitled to.",
    from: "Returned by the payment processor. No card detail reaches this application.",
  },
] as const;

/* ---------------------------------------------------------------------------------------------
 * Sentences COMPUTED from nullable or false brand fields rather than written out. Each of these
 * fields is expected to change; computing the sentence means this page cannot be left asserting
 * the old answer after one does.
 * ------------------------------------------------------------------------------------------- */

const HOSTING_LINE =
  brand.dataRegion === null
    ? "The hosting region is not recorded in the repository, so no statement is made about it here."
    : `Data is held in the ${brand.dataRegion} region. There is one region and it was chosen by us, so nothing on this page should be read as offering a customer a choice of where its data sits.`;

const EU_REPRESENTATIVE_LINE =
  brand.euRepresentative === null
    ? "No representative has been appointed in the European Union, and none is claimed. A customer whose own obligations depend on one should treat it as unavailable today."
    : `The appointed representative in the European Union is ${brand.euRepresentative}.`;

const DPA_LINE = brand.dpaAvailable
  ? "A data processing agreement is available covering the platform data read on a customer's behalf."
  : "There is no data processing agreement available to sign today. The instructions under which platform data is read are described on this page and are not yet recorded in a signed agreement, and no claim to the contrary appears anywhere on this site.";

const LEGAL_INBOX_LINE =
  brand.legalEmail === null
    ? "There is no separate privacy or legal inbox yet, so requests and questions about this document go to the contact address in the panel at the top of this page."
    : `Requests and questions about this document go to ${brand.legalEmail}.`;

interface Clause {
  readonly id: string;
  readonly title: string;
  readonly body: readonly string[];
  /** Rendered as a marked list under the body. */
  readonly points?: readonly string[];
  /** Marks a clause whose arrangement does not exist yet. Renders the badge and joins OPEN_ITEMS. */
  readonly open?: true;
}

/**
 * THE DOCUMENT. Numbering is positional -- the list renders `index + 1` -- so inserting a clause
 * renumbers the page and its contents list together and neither can fall out of step.
 */
const CLAUSES: readonly Clause[] = [
  {
    id: "controller",
    title: "Who is responsible",
    body: [
      `${brand.legalEntity}, registered in ${brand.postalAddress.country} under company registration ${brand.companyRegistration} at ${formatAddress()}, is responsible for the account data described below and is referred to here as we or us.`,
      "For the business data a connector reads out of a customer's own platform accounts, the customer decides what is connected and why, and we act on that instruction. The customer is responsible for that data and we handle it on the customer's behalf.",
    ],
  },
  {
    id: "account-data",
    title: "Account data, and why each piece exists",
    body: [
      "The account holds a name and a work email address for the person signing in. That is what an account is made of here, and nothing about a person's use of a connected platform is added to it.",
      "Sign-up requires a company email address rather than a personal one, and the check runs on the server as well as in the browser, so the address held for an account is a business contact rather than a private one. The check is a list of known consumer and disposable domains rather than an exhaustive wall.",
      "An invitation stores the address it was sent to and the role it offers, until it is accepted or withdrawn. A waiting-list entry stores an address and which page it was submitted from, and exists only because the product is pre-launch.",
    ],
  },
  {
    id: "signing-in",
    title: "Signing in, and the absence of a password",
    body: [
      "Signing in uses a link sent to the account address, or a sign-in provider. No password for a customer is set, held, hashed or stored by this application, because none is ever created.",
      "The session is verified rather than assumed. On every request the token in the session cookie is checked with the authentication server instead of being believed on sight, which is the difference between a forged cookie being rejected and being accepted.",
    ],
  },
  {
    id: "platform-data",
    title: "What the connectors read, and what they do not",
    body: [
      "A connector reads only the fields the normalisers consume. What comes back from a platform is turned into rows carrying identifiers, amounts, quantities, dates, a currency and a timezone, and the provenance fields that say when each figure was fetched and whether it may still change.",
      "The buyer's name, email address, telephone number and postal address on an order are not read into those rows. An order contributes its identifiers, its money and its dates, and the person behind it contributes nothing.",
      "Where a platform response is archived, it passes through an allow-list first: only recognised fields survive and everything else is removed, so a field a platform adds tomorrow goes missing rather than being stored. The billing and shipping blocks, the customer note, the network address the order came from and the free-text refund reason are all removed before anything is archived.",
      "One limit is worth stating plainly rather than leaving to be discovered. That allow-list removes fields by name and does not inspect values, so personal data a customer has typed into a field that is legitimately kept, such as a product label, is not caught by it.",
    ],
  },
  {
    id: "not-doing",
    title: "What is never done with platform data",
    body: [
      "Three commitments, each of which describes how the product is built rather than a policy that could be changed quietly.",
    ],
    points: [
      "Data, keys and connections are held per tenant and are never pooled with another customer's.",
      "Platform data is never sold, licensed, benchmarked or shared with another customer.",
      "Platform data is never used to train models. It answers the questions of the customer it belongs to, and that is all it does.",
    ],
  },
  {
    id: "credentials",
    title: "How platform credentials are held",
    body: [
      "A credential is never stored as it arrived. Each connection gets a fresh 256-bit key of its own, generated again on every rotation; the credential is sealed under that key, and the key itself is sealed under a second key held outside the database. Only the wrapped form is stored, so the database holds nothing that can be opened with the database alone.",
      "Both seals are bound to the workspace and the connection they belong to. Moving a stored credential into another row makes it undecryptable rather than making it decrypt for somebody else.",
      "Access is requested read-only where the platform offers a choice, is used only to fetch the connected account's own data, and can be revoked at the platform at any time without asking us first. A revoked connection is reported as broken rather than worked around.",
    ],
  },
  {
    id: "hosting",
    title: "Where data is held",
    body: [HOSTING_LINE],
  },
  {
    id: "sub-processors",
    title: "Sub-processors",
    open: true,
    body: [
      "Running this service involves infrastructure and payment providers, as any hosted service does. No list of them is published yet, and no list is implied by anything else on this site.",
      "Naming a provider here that has not been checked against what it actually processes would be worse than naming none, so the list is published when it has been assembled and verified rather than assembled from what a reader would expect to see.",
    ],
  },
  {
    id: "transfers",
    title: "International transfers",
    open: true,
    body: [
      "The company is registered outside the European Economic Area and the data is hosted outside it, so data reaching this service leaves any region a customer's own rules may be written around.",
      "No transfer mechanism is published, and none is claimed. A customer whose own obligations depend on a specific mechanism should treat it as unavailable today and raise it before sending data that those obligations cover.",
      EU_REPRESENTATIVE_LINE,
    ],
  },
  {
    id: "dpa",
    title: "Data processing agreement",
    open: true,
    body: [DPA_LINE],
  },
  {
    id: "retention",
    title: "Retention",
    open: true,
    body: [
      "No retention schedule has been decided and none is stated here, for any category in the table above. That includes account records after an account closes, archived platform responses, and operational logs.",
      "A period written for the look of the page would read as a commitment and would not be one. Until a schedule is decided and published here, a customer who needs data removed should ask at the contact address and it will be dealt with individually.",
    ],
  },
  {
    id: "rights",
    title: "Your rights over your own data",
    body: [
      "Anyone whose personal data is held in an account can ask what is held about them, ask for it to be corrected, ask for a copy, or ask for it to be deleted. Requests go to the contact address in the panel at the top of this page and are answered individually.",
      "No statutory framework is claimed here, because which one applies depends on where a person is and on arrangements this company has not yet made. The practical position is simpler than a list of articles: ask, and it will be answered.",
      "For data read out of a connected platform, the customer that connected it is the one to ask. We hold it on that customer's behalf and pass a request of that kind to them rather than acting on it ourselves.",
      "A connection can be disconnected from the product at any time, and the underlying access can be revoked at the platform independently of anything done here.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    body: [
      "This site sets only the cookies it needs to work. There are no analytics, advertising or profiling cookies, no third-party scripts, and no remote fonts or embeds that would let another party observe a visit.",
      "The session cookies exist once a person signs in, and are what keeps them signed in from one page to the next. While the product is pre-launch there is also a cookie recording that the shared preview password was entered correctly; it carries a one-way value derived from that password and identifies nobody.",
      "Because nothing here tracks anyone, there is no consent banner and nothing to opt out of. If that ever changes, this clause changes with it and the date at the top of the page moves.",
    ],
  },
  {
    id: "payments",
    title: "Payments",
    body: [
      "Card details are entered on pages hosted by the payment processor, which the customer is sent to. No card number, expiry or security code ever reaches this application, and none is stored here.",
      "What is held on our side is a reference to the customer record at the processor and the state of the subscription, which is what tells an account which plan it is entitled to.",
    ],
  },
  {
    id: "security",
    title: "Security, stated without adjectives",
    body: [
      "The specific measures worth naming are the ones described above: credentials sealed under a per-connection key with the key material held outside the database, tenants isolated from one another at the row level, sessions verified with the authentication server on every request, and an allow-list that drops unrecognised fields before a platform response is archived.",
      "Nothing here is offered as a certification, an audit result or a guarantee, and no certification or audit exists. No security measure, including these, makes a system proof against every attack.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    open: true,
    body: [
      "This document will change, and most of the open items above are what will change it. When it does, the revised text is published on this page with a new date at the top, and the version on this page is the one in force.",
      "How far in advance a material change is announced has not been decided and is not asserted here.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      "Questions about this policy, and any request about personal data held here, can be sent to the contact address in the panel at the top of this page.",
      LEGAL_INBOX_LINE,
    ],
  },
];

/** The foot of the page. Every entry corresponds to a clause marked open above. */
const OPEN_ITEMS_HEADING = "Arrangements that are not yet in place";
const OPEN_ITEMS_LEAD =
  "These are the things this document cannot yet state. Each is marked in the clause it belongs to, and each will be filled in with a dated revision rather than quietly appearing.";

const OPEN_ITEMS = [
  {
    term: "Sub-processor list",
    note: "No list assembled, verified or published.",
  },
  {
    term: "Transfer mechanism",
    note: "None published for data leaving its region of origin.",
  },
  { term: "Representative in the Union", note: "None appointed." },
  { term: "Data processing agreement", note: "None available to sign." },
  {
    term: "Retention schedule",
    note: "No period set for any category, including logs.",
  },
  {
    term: "Notice of changes",
    note: "No period set before a material change takes effect.",
  },
  {
    term: "Certification or audit",
    note: "None held, and none claimed anywhere on this site.",
  },
] as const;

export default function PrivacyPage() {
  const openCount = CLAUSES.filter((clause) => clause.open === true).length;

  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO. The breadcrumb, eyebrow and display heading the other document pages use, at the
            narrower measure continuous prose needs. */}
        <section className="mx-auto max-w-[1200px] px-8 pt-4 pb-8 md:pt-7 md:pb-12">
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
              <li aria-current="page">Privacy</li>
            </ol>
          </nav>

          <div className="mt-8 max-w-[760px]">
            <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
              {EYEBROW}
            </span>
            <h1 className="font-display text-ink mt-2.5 text-[32px] leading-[1.1] font-bold tracking-[-0.03em] md:text-[42px]">
              {HEADING}
            </h1>
            <p className="text-ink-muted mt-5 text-base leading-[1.7] md:text-[17px]">{LEAD}</p>

            <dl className="border-line-soft mt-7 flex flex-wrap gap-x-10 gap-y-3 border-t pt-5 text-[13px]">
              <div>
                <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                  {LAST_UPDATED_LABEL}
                </dt>
                <dd className="text-ink mt-1 font-bold">
                  <time dateTime={LAST_UPDATED.iso}>{LAST_UPDATED.display}</time>
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                  {STATUS_LABEL}
                </dt>
                <dd className="text-ink mt-1 font-bold">{STATUS_VALUE}</dd>
              </div>
              <div>
                <dt className="text-ink-faint text-[11px] font-bold tracking-[0.12em] uppercase">
                  {OPEN_COUNT_LABEL}
                </dt>
                {/* A count, not a sentence: how many clauses below carry the open marker. */}
                <dd className="text-ink mt-1 font-bold">{openCount}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* THE STANDING NOTICE and the controller panel. The pale inset surface is the role the
            brand guide gives a soft feature background; the panel is a large one, so it takes the
            24px radius. */}
        <section
          aria-labelledby="controller-heading"
          className="mx-auto max-w-[1200px] px-8 pb-10 md:pb-14"
        >
          <div className="bg-surface-inset rounded-xl p-6 md:p-9">
            <p className="text-ink-muted max-w-[760px] text-sm leading-[1.7]">{HEADLINE_NOTE}</p>

            <h2
              id="controller-heading"
              className="text-ink-faint mt-8 text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs"
            >
              {CONTROLLER_LABEL}
            </h2>

            <dl className="mt-4 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {CONTROLLER_ROWS.map((row) => (
                <div key={row.key} className="min-w-0">
                  <dt className="text-ink-subtle text-xs">{row.key}</dt>
                  <dd className="text-ink mt-1 text-sm leading-[1.55] font-bold">{row.value}</dd>
                </div>
              ))}
              <div className="min-w-0">
                <dt className="text-ink-subtle text-xs">{CONTACT_ROW_LABEL}</dt>
                <dd className="mt-1 text-sm leading-[1.55] font-bold">
                  <a
                    className="text-accent underline-offset-4 hover:underline"
                    href={`mailto:${brand.supportEmail}`}
                  >
                    {brand.supportEmail}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* THE TWO ROLES, side by side. Everything below depends on the reader holding this
            distinction, so it is given its own block above the document rather than being the
            first clause inside it. */}
        <section
          aria-labelledby="roles-heading"
          className="mx-auto max-w-[1200px] px-8 pb-10 md:pb-14"
        >
          <h2
            id="roles-heading"
            className="font-display text-ink text-[24px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[28px]"
          >
            {ROLES_HEADING}
          </h2>

          <ul className="mt-6 grid gap-4 md:grid-cols-2 md:gap-6">
            {ROLES.map((role) => (
              <li
                key={role.id}
                className="border-line bg-surface flex flex-col rounded-lg border p-6 md:p-7"
              >
                <h3 className="font-display text-ink text-xl leading-[1.3] font-bold tracking-[-0.01em]">
                  {role.title}
                </h3>
                <span className="text-ink-subtle mt-2 text-[11px] font-bold tracking-[0.1em] uppercase">
                  {role.role}
                </span>
                <p className="text-ink-muted mt-4 text-[15px] leading-[1.7]">{role.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* THE INVENTORY. A table, inside its own horizontal scroller: it is the one element on
            this page allowed to be wider than the measure. */}
        <section
          aria-labelledby="inventory-heading"
          className="bg-surface-subtle border-line-soft border-y"
        >
          <div className="mx-auto max-w-[1200px] px-8 py-12 md:py-16">
            <div className="max-w-[760px]">
              <h2
                id="inventory-heading"
                className="font-display text-ink text-[24px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[28px]"
              >
                {INVENTORY_HEADING}
              </h2>
              <p className="text-ink-muted mt-3 text-sm leading-[1.7]">{INVENTORY_LEAD}</p>
            </div>

            <div className="border-line bg-surface mt-6 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <caption className="sr-only">{INVENTORY_CAPTION}</caption>
                <thead>
                  <tr className="border-line border-b">
                    {INVENTORY_COLUMNS.map((column) => (
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
                  {INVENTORY_ROWS.map((row) => (
                    <tr key={row.category} className="border-line-soft border-b last:border-b-0">
                      <th
                        scope="row"
                        className="text-ink px-5 py-4 align-top text-[13px] font-bold"
                      >
                        {row.category}
                      </th>
                      <td className="text-ink-muted max-w-[300px] px-5 py-4 align-top text-[13px] leading-[1.6]">
                        {row.what}
                      </td>
                      <td className="text-ink-muted max-w-[300px] px-5 py-4 align-top text-[13px] leading-[1.6]">
                        {row.why}
                      </td>
                      <td className="text-ink-subtle max-w-[280px] px-5 py-4 align-top text-[13px] leading-[1.6]">
                        {row.from}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CONTENTS, then the document itself. Two columns from the large breakpoint, with the
            contents sticky beside the prose; one column below it, contents first. */}
        <section
          aria-labelledby="document-heading"
          className="mx-auto max-w-[1200px] px-8 pt-12 pb-12 md:pt-16 md:pb-16"
        >
          <h2 id="document-heading" className="sr-only">
            {HEADING}
          </h2>

          <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
            <nav aria-label="Contents" className="lg:sticky lg:top-8 lg:self-start">
              <h3 className="text-ink-faint text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
                Contents
              </h3>
              <ol className="mt-4 space-y-2">
                {CLAUSES.map((clause, index) => (
                  <li key={clause.id} className="text-[13px] leading-[1.5]">
                    <a href={`#${clause.id}`} className="text-ink-muted hover:text-accent">
                      <span className="text-ink-faint mr-2 tabular-nums">{index + 1}</span>
                      {clause.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <ol className="max-w-[760px] min-w-0">
              {CLAUSES.map((clause, index) => (
                <li
                  key={clause.id}
                  id={clause.id}
                  className="border-line-soft border-t py-8 first:border-t-0 first:pt-0 md:py-10 md:first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-ink-faint text-[13px] font-bold tabular-nums">
                      {index + 1}
                    </span>
                    <h3 className="font-display text-ink text-xl leading-[1.3] font-bold tracking-[-0.01em] md:text-[22px]">
                      {clause.title}
                    </h3>
                    {clause.open === true ? (
                      <span className="border-line bg-surface text-ink-subtle rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase">
                        {OPEN_BADGE}
                      </span>
                    ) : null}
                  </div>

                  {clause.body.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-ink-muted mt-4 text-[15px] leading-[1.75] md:text-base"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {clause.points === undefined ? null : (
                    <ul className="mt-4">
                      {clause.points.map((point) => (
                        <li
                          key={point}
                          className="text-ink-muted my-2.5 flex gap-3 text-[15px] leading-[1.7]"
                        >
                          <span aria-hidden="true" className="text-ink-faint shrink-0 font-bold">
                            &#8212;
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* THE OPEN ITEMS, gathered. Every row corresponds to a clause marked above; the list is
            here so a reviewer can see the whole gap in one place rather than assembling it. */}
        <section
          aria-labelledby="open-items-heading"
          className="mx-auto max-w-[1200px] px-8 pb-12 md:pb-[70px]"
        >
          <div className="border-line rounded-xl border p-6 md:p-9">
            <h2
              id="open-items-heading"
              className="font-display text-ink text-[24px] leading-[1.2] font-bold tracking-[-0.02em] md:text-[28px]"
            >
              {OPEN_ITEMS_HEADING}
            </h2>
            <p className="text-ink-muted mt-3 max-w-[760px] text-sm leading-[1.7]">
              {OPEN_ITEMS_LEAD}
            </p>

            <dl className="border-line-soft mt-6 max-w-[760px] border-t">
              {OPEN_ITEMS.map((item) => (
                <div
                  key={item.term}
                  className="border-line-soft flex flex-col gap-1 border-b py-3.5 sm:flex-row sm:gap-6"
                >
                  <dt className="text-ink text-[13px] font-bold sm:w-[240px] sm:shrink-0">
                    {item.term}
                  </dt>
                  <dd className="text-ink-subtle text-[13px] leading-[1.6]">{item.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
