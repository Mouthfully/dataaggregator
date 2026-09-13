/**
 * THE SITE'S ONLY SOURCE OF COPY.
 *
 * Kickoff non-negotiable 1 and `00-repo-map.md` section 7: a 33-item allowed-claims list and a
 * forbidden-claims list go into the brand package "so the ban is machine-checkable and no marketing
 * string can outrun the specification". `@repo/brand` holds both. This module is what makes the
 * site physically unable to say anything else.
 *
 * `claim(id)` resolves text from `allowedClaims()` and THROWS when the id is unknown or withheld.
 * That remains the build-time boundary. `optionalClaim(id)` is the page boundary: it returns null
 * for a known claim withheld by a brand fact or capability, while still throwing on an unknown id.
 *
 * Brand facts withhold two claims today, and a capability withholds a third:
 *
 *   gdpr          requires brand.euRepresentative -- the entity is Thai and no Article 27
 *                 representative is appointed
 *   dpa           requires brand.dpaAvailable -- no click-through Article 28 DPA exists
 *   data-region   brand.dataRegion IS set (ap-southeast-1), so the fact gate passes. It is held
 *                 back on the capability axis instead: the sentence promises "the region you
 *                 choose" and there is one region, chosen for the customer. See claims.ts.
 *
 * Each is a promise a European buyer would rely on. `00-repo-map.md` section 7 lists exactly these
 * under "Delete or substantiate", and the artboard made all three.
 *
 * THE PRODUCT NAME IS NOW SETTLED, and the machinery around it did not change. `productName()`
 * still reads `brand.productNameSettled` and still returns null when it is false, so the gate that
 * kept the name off the page is intact rather than removed -- a name can be un-settled again by
 * flipping one boolean. The site leads with the tagline regardless, which was never contingent on
 * what the thing is called.
 */

import { allowedClaims, brand, CLAIMS, type Claim } from "@repo/brand";

import { entitlementsFor, formatAllowance } from "./_billing/entitlements";
import type { Plan } from "./_billing/plans";

const ALLOWED = new Map(allowedClaims().map((c: Claim) => [c.id, c]));
const DECLARED = new Map(CLAIMS.map((c: Claim) => [c.id, c]));

function declaredClaim(id: string): Claim {
  const found = DECLARED.get(id);
  if (found === undefined) {
    throw new Error(
      `copy: "${id}" does not exist in @repo/brand. Add the claim with its specification ` +
        "citation -- do not write a fallback sentence here.",
    );
  }
  return found;
}

/**
 * The text of an allowed claim.
 *
 * Throws rather than returning a fallback. A fallback is how a site ends up shipping a sentence
 * nobody approved, and a build failure is how it does not.
 */
export function claim(id: string): string {
  declaredClaim(id);
  const found = ALLOWED.get(id);
  if (found === undefined) {
    throw new Error(
      `copy: "${id}" is withheld because a brand fact or product capability it requires is ` +
        "missing. Satisfy the declared requirement -- do not write a fallback sentence here.",
    );
  }
  return found.text;
}

/** A known claim's text when publishable, or null when a declared requirement withholds it. */
export function optionalClaim(id: string): string | null {
  declaredClaim(id);
  return ALLOWED.get(id)?.text ?? null;
}

/** Every claim the page may use, including known claims that are currently withheld. */
export const PAGE_CLAIMS = [
  "tagline",
  "positioning",
  "connectors",
  "read-only-oauth",
  "byoc",
  "attribution-required",
  "freshness-fields",
  "fx-on-row",
  "restatement-webhook",
  "time-travel",
  "diagnose",
  "second-pass",
  "verified-alerts",
  "reconcile",
  "tenant-isolation",
  "no-pooling",
  "no-training",
  "audit-log",
  "one-shape",
  "agency-mode",
  "serp-bought",
  "pricing-two-units",
  "billing-fairness",
] as const;

/** Claims that survive both gates and therefore must occur in the rendered page. */
export const USED_CLAIMS = PAGE_CLAIMS.filter((id) => ALLOWED.has(id));

/**
 * The product's name, or null while it is unsettled.
 *
 * Founder decision 2 is open (`00-repo-map.md` section 11). A name on a marketing site is the most
 * expensive place to put an unsettled one.
 */
export function productName(): string | null {
  return brand.productNameSettled ? brand.productName : null;
}

/**
 * The four-step spine, ported verbatim from the artboard.
 *
 * `00-repo-map.md` section 7 lists "the 'Connect. Reconcile. Ask. Act.' spine" under "worth porting
 * verbatim" -- one of the few parts of the artboard that survived section 11 unchanged. The body of
 * each step is a claim, so the spine is structure and the claims are the promises.
 */
export const SPINE = [
  { step: "Connect", claim: "connectors" },
  { step: "Reconcile", claim: "reconcile" },
  { step: "Ask", claim: "diagnose" },
  { step: "Act", claim: "verified-alerts" },
] as const;

/** The envelope fields the specification requires on every row (section 7, line 762). */
export const ENVELOPE_FIELDS = [
  { field: "fetched_at", note: "when we pulled it" },
  { field: "source_updated_at", note: "when the platform last changed it" },
  { field: "restates_until", note: "when it stops being open to revision" },
  { field: "is_provisional", note: "whether it may still change" },
  { field: "attribution_window", note: "required on every conversion count" },
  { field: "fx_rate", note: "the rate that produced a converted amount" },
] as const;

/* ==============================================================================================
 * THE SITE COPY.
 *
 * Every sentence the marketing site, the dashboard and the sign-in screen render, held here rather
 * than typed into the JSX. Two reasons, and the second is the one that matters.
 *
 * 1. `scripts/check-copy.mjs` refuses a JSX text node of five or more words ending in terminal
 *    punctuation. Almost every line below is exactly that.
 * 2. The guard's own module comment explains why it exists: a sentence typed straight into the JSX
 *    "renders exactly like an approved one ... and ships an unreviewed promise". Holding the copy in
 *    one module does not make it reviewed, but it makes it REVIEWABLE -- the whole surface of what
 *    the product says is this file, and a reader can check it against the brand guide in one pass
 *    instead of walking every component.
 *
 * These are NOT claims in the `claims.ts` sense and deliberately do not pretend to be. A claim
 * carries a specification citation and is withheld when the capability behind it does not exist;
 * this is brand copy, supplied by the founder with the design, and it renders unconditionally.
 * `claims.ts` is untouched and still gates everything that goes through `claim()`.
 * ============================================================================================== */

/**
 * WHAT A PLAN'S CONNECTION ALLOWANCE IS CALLED, WHEREVER IT IS PRINTED.
 *
 * THE NOUN IS "CONNECTED ACCOUNTS" AND NOT "CONNECTORS", AND THAT IS THE WHOLE POINT OF THIS
 * FUNCTION. A connector is a platform this product can read, and `packages/connectors/src/sources`
 * holds five of them. A figure in the hundreds printed beside the word "connectors" therefore reads
 * as a catalogue of integrations that does not exist. What a plan actually buys is how many
 * accounts you may connect -- a term of sale, like the price beside it -- so that is what the cards
 * and the comparison tables say. Reverting the noun re-publishes a catalogue claim.
 *
 * THE NUMBER IS NOT WRITTEN HERE. It comes from `PLAN_ENTITLEMENTS`, which is the one place the
 * four figures live, and `formatAllowance` is what keeps Agency's published floor a floor rather
 * than quietly shrinking "200+" to "200".
 */
export function connectionAllowance(plan: Plan): string {
  const { connections } = entitlementsFor(plan);
  // No plan is on one today, but a record edited to 1 would otherwise print "1 connected accounts".
  const noun =
    connections.count === 1 && !connections.atLeast ? "connected account" : "connected accounts";
  return `${formatAllowance(connections)} ${noun}`;
}

/* ---------------------------------------------------------------------------------------------
 * THE POSITIONING, AND WHY EVERY UNIFICATION SENTENCE LEFT THIS OBJECT.
 *
 * `docs/marketplane/58-plan-reconciliation.md` section 5.1 names three strings here as copy that
 * must stop -- "All your data. One clear view.", "Connect your tools, unify your data" and "Ready
 * to unify your data?" -- for one reason: unification is plumbing, and every BI tool sells it. The
 * plan sells a DECISION. So the hero no longer offers a view of the data; it offers yesterday in
 * three lines and one thing worth doing about it, which is the product the founder's plan
 * describes and the thing a person with no analyst actually wants at 07:00.
 *
 * `heroVisualLabel` IS LOAD-BEARING AND MUST STAY VISIBLE. Section 5.3 forbids a named Chiang Mai
 * cafe presented as proof, because there are no customers and the artboard's own figures are
 * invented. The resolution is the artboard's own: it labels "Sample figures" in three separate
 * places. The hero panel therefore carries a sample mark inside the card, this label under it, and
 * a third in the pill below -- no owner name, no quote, no claim that a customer exists.
 * --------------------------------------------------------------------------------------------- */
export const SITE = {
  eyebrow: "Business intelligence for small business",
  heroLine1: "Your whole business on one page.",
  heroLine2: "Every morning.",
  heroLead:
    "Connect the tools your business already runs on. Wake up to yesterday in three lines, anything unusual, and one thing worth doing today.",
  ctaPrimary: "Start free",
  ctaSecondary: "Explore dashboard",
  ctaNav: "Explore dashboard",
  // "200+ integrations" was the middle check and is gone: five connectors exist
  // (`packages/connectors/src/sources`), so the figure counted integrations we do not have. The
  // same string is still the eyebrow of `_sections/IntegrationsMap.tsx`, which was outside this
  // change's paths and is reported rather than edited.
  //
  // "Set up in minutes" became the read-access line because the second check is the one a
  // suspicious owner reads, and section 5.1 requires read-only to be worded as what WE ask for and
  // enforce rather than as a guarantee the platforms make.
  heroChecks: ["No credit card required", "Read access, on your own logins"],
  syncPill: "One thing worth doing today",
  heroVisualLabel: "Sample figures. An illustration, not a customer.",
  platformsEyebrow: "The tools your business already runs on",
  footerTagline: "Yesterday in three lines. One thing to do today.",
  footerNote: "Built for businesses everywhere.",
  footerNote2: "Global platforms. Local possibilities.",
} as const;

/**
 * The primary navigation. Labels are structural, so they are not sentences.
 *
 * `/connections` IS HERE BECAUSE A SCREEN NOBODY CAN REACH CONNECTS NOTHING. It is a signed-in
 * route and this header is rendered on the marketing pages too -- which is already true of
 * `/dashboard` beside it, and the middleware sends a signed-out visitor to sign in rather than
 * showing either. The alternative was a link from the dashboard, whose file this change does not
 * own; a customer who has just been told to connect a source should not have to guess a URL.
 */
export const NAV = [
  { href: "/integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Documentation" },
  { href: "/connections", label: "Connections" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/signin", label: "Sign in" },
] as const;

/* ---------------------------------------------------------------------------------------------
 * THE DASHBOARD, AND WHY ITS NUMBERS ARE HERE.
 *
 * Every figure below is ILLUSTRATIVE and comes from the supplied design, not from a database. The
 * dashboard route renders no live data because there is none: `envelope_rows` holds zero rows.
 *
 * They live in this module rather than in the component for one specific reason -- when the real
 * read path lands, the component changes from mapping over these constants to mapping over a fetch,
 * and they are deleted in one piece. A figure typed into the JSX would have to be hunted. The screen
 * itself is labelled as a concept, in the UI, by `SITE_DASHBOARD.notice`.
 * --------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * THE LIVE TABLE'S VOCABULARY -- the half of the dashboard that is NOT illustrative.
 *
 * Nothing here is a figure. Every number on the live table is read out of `envelope_rows` at
 * request time; these are the words around them, and they are constants because
 * `scripts/check-copy.mjs` requires prose to come from a named constant and because the three
 * marks below are a glossary that the legend and the cells must not be able to disagree about.
 *
 * THE MARKS ARE THE POINT OF THE TABLE.
 *
 *   provisionalMark  the platform may still restate this figure. A provisional number printed
 *                    like a settled one is precisely the failure `is_provisional` exists to
 *                    prevent, so it is marked ON THE FIGURE and not only in a status column --
 *                    a figure read off a screen, or copied into a message, takes its mark with it.
 *   absentMark       the platform reported nothing. NOT ZERO, and never rendered as zero.
 *   unreadableMark   something was stored that the page could not read as a number. Shown rather
 *                    than swallowed, because a defect hidden behind the absent mark is a defect
 *                    nobody goes looking for.
 * --------------------------------------------------------------------------------------------- */

export const DASHBOARD_LIVE = {
  heading: "Your envelope rows",
  note: "Read from your workspace for the period above. Row-level security decided which rows these are, so this table shows what your session may see and nothing else.",
  columns: {
    source: "Source",
    entity: "Entity",
    date: "Date",
    window: "Attribution window",
    status: "Status",
    fetched: "Read at",
  },
  provisional: "Provisional",
  final: "Final",
  unattributed: "Unattributed",
  provisionalMark: "†",
  absentMark: "—",
  unreadableMark: "?",
  provisionalTitle: "Still provisional",
  absentTitle: "Not reported",
  unreadableTitle: "Could not be read",
  noMetrics:
    "These rows carry no metric values at all, so there is nothing to total. Only the row metadata is shown.",
  legend: [
    {
      id: "provisional",
      mark: "†",
      body: "The platform may still restate this figure, so it is not final yet.",
    },
    {
      id: "absent",
      mark: "—",
      body: "The platform reported nothing for this metric on this row. That is not the same as zero.",
    },
    {
      id: "unreadable",
      mark: "?",
      body: "A value was stored that this page could not read as a number, so no figure is shown.",
    },
  ],
} as const;

export const SITE_DASHBOARD = {
  eyebrow: "Client workspace",
  heroLine1: "A little less noise.",
  heroLine2: "A lot more clarity.",
  lead: "One calm place to understand performance, find opportunities, and keep your next steps moving.",
  notice: "Product concept · Illustrative data",
  workspace: "Northstar Studio",
  workspaceInitials: "NS",
  title: "Business overview",
  period: "Jun 1 – Jun 30, 2026",
} as const;

export const DASHBOARD_NAV = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Reports" },
  { id: "sources", label: "Sources" },
  { id: "tasks", label: "Tasks" },
  { id: "settings", label: "Settings" },
] as const;

export const DASHBOARD_METRICS = [
  { id: "revenue", label: "Revenue", value: "$186,240", delta: "+18.6%" },
  { id: "orders", label: "Orders", value: "8,241", delta: "+12.4%" },
  { id: "spend", label: "Ad spend", value: "$34,360", delta: "+6.8%" },
  { id: "roas", label: "ROAS", value: "5.42x", delta: "+11.2%" },
] as const;

export const DASHBOARD_CHANNELS = [
  {
    id: "google",
    channel: "Google Ads",
    revenue: "$78,460",
    rd: "+24.1%",
    spend: "$12,650",
    sd: "+7.3%",
    roas: "6.20x",
    od: "+15.6%",
  },
  {
    id: "meta",
    channel: "Meta Ads",
    revenue: "$56,220",
    rd: "+14.2%",
    spend: "$13,180",
    sd: "+6.1%",
    roas: "4.27x",
    od: "+7.6%",
  },
  {
    id: "shopify",
    channel: "Shopify",
    revenue: "$51,560",
    rd: "+17.9%",
    spend: "$8,530",
    sd: "+6.8%",
    roas: "6.04x",
    od: "+12.3%",
  },
] as const;

export const DASHBOARD_INSIGHTS = [
  {
    id: "up",
    title: "Revenue is up 18.6%",
    body: "You generated $186,240 this month, up 18.6% from last month.",
  },
  {
    id: "leads",
    title: "Google Ads leads efficiency",
    body: "Google Ads achieved 6.20x ROAS, highest among your channels.",
  },
  {
    id: "week",
    title: "Your best week was Jun 22–28",
    body: "You generated $52,480, 28% higher than the monthly average.",
  },
] as const;

export const DASHBOARD_PRODUCTS = [
  { id: "mug", name: "Everyday Mug", units: "1,842 units sold", value: "$36,840", delta: "+22.6%" },
  {
    id: "bottle",
    name: "Insulated Bottle",
    units: "1,276 units sold",
    value: "$28,930",
    delta: "+16.4%",
  },
  { id: "tote", name: "Canvas Tote", units: "983 units sold", value: "$19,560", delta: "+11.9%" },
] as const;

export const DASHBOARD_ACTIVITY = [
  {
    id: "connected",
    title: "Connected Google Ads",
    body: "Ad account synced successfully",
    when: "2 hours ago",
  },
  {
    id: "report",
    title: "Generated June performance report",
    body: "Your report is ready to view",
    when: "5 hours ago",
  },
  { id: "orders", title: "Synced 8,241 orders", body: "Shopify data updated", when: "1 day ago" },
] as const;

/* ---------------------------------------------------------------------------------------------
 * THE CONNECT SCREEN.
 *
 * The screen a customer uses to attach a source itself, and the first one in this app that collects
 * a SECRET. Every sentence it renders is here for `_content.ts`'s usual reason -- the copy guard
 * refuses prose typed into JSX -- and for a second one that only applies to this screen: a refusal
 * message is the entire difference between a customer who fixes their key and a customer who emails
 * support. They are worth reading together, in one place, as a set.
 *
 * `errors` IS A MESSAGE PER REFUSAL CODE `POST /v1/connections` CAN RETURN, and `actions.test.ts`
 * asserts that the set matches the endpoint's own `ConnectRefusal` union plus the four outcomes it
 * adds outside that union (`unauthorized`, `forbidden`, `already_connected`, `upstream_unavailable`,
 * `not_configured`). A code with no message of its own would collapse into the generic one, which
 * is the failure this brief names: a customer who cannot tell a wrong key from a broken server.
 *
 * WHAT THESE MESSAGES DO NOT SAY IS AS DELIBERATE AS WHAT THEY DO. Nothing here claims the
 * credential was checked against the platform, because nothing checks it: `/v1/connections` refuses
 * an empty half and an expired token and seals everything else. Whether a key actually opens a store
 * is answered by the first read, and saying otherwise here would be a confident wrong answer.
 * --------------------------------------------------------------------------------------------- */

export const CONNECTIONS = {
  eyebrow: "Sources",
  heading: "Connect a source.",
  lead: "Attach the accounts this workspace reads from. A credential you paste is sealed by the service that stores it, and is never held by this site.",

  listHeading: "This workspace's connections",
  listNote:
    "Read from your workspace. Row-level security decided which rows these are, so this table shows what your session may see and nothing else.",
  columns: {
    provider: "Source",
    account: "Account",
    lane: "Credential",
    status: "Status",
    lastRead: "Last read",
  },
  never: "Never",
  lastReadNote:
    "Last read is the moment a pull last finished successfully. A pull that failed leaves it where it was.",
  listEmpty: "Nothing is connected to this workspace yet. Add the first source below.",
  listUnavailable:
    "Your connections could not be read just now, so none are shown. This is not a statement about your account.",
  needsWorkspace:
    "Your account has no workspace yet, so there is nowhere to attach a source. Create your organisation first.",
  workspaceUnavailable:
    "Your workspace could not be read just now, so this screen cannot say what is connected.",
  timezoneMissing: "No time zone",
  timezoneNote:
    "A connection with no time zone is not read at all, because every date on every row would be computed in a zone nobody chose. Setting one is not yet something this screen can do.",

  formHeading: "Add a connection",
  formNote:
    "What you paste is sent once, to the service that encrypts it. It is never stored by this site, never written to a cookie, and never placed in a web address.",
  providerLabel: "Source",
  submit: "Connect",
  pending: "Connecting…",
  successHeading: "That connection is stored.",
  successBody:
    "Nothing here tested the credential. Whether it opens the account is settled by the first read.",
  connectAnother: "Add another connection",

  oauthHeading: "Connected another way",
  oauthNote:
    "These sources are authorised on the provider's own consent screen rather than by pasting a credential. That flow is not built yet, so there is nothing here to press.",
  oauthBadge: "Not yet available",

  expiryLegend: "Does this token expire?",
  expiryNever: "It does not expire",
  expiryOn: "It expires on",
  expiryDateLabel: "Expiry date",
  expiryNote:
    "Say which, rather than leaving it blank. A dated token recorded as permanent is reported as healthy on the day it stops working.",

  /**
   * PER-PROVIDER FIELD LABELS. The names are the platform's own, taken from the screen the customer
   * copies them from -- a merchant reading "Consumer key" in WooCommerce should not have to decide
   * whether our "API key" means the same thing.
   */
  fields: {
    woocommerce: {
      accountLabel: "Store address",
      accountHint: "The address customers visit, with https. Anything after the domain is dropped.",
      keyLabel: "Consumer key",
      secretLabel: "Consumer secret",
      credentialHint:
        "Create a read-only key under WooCommerce, Settings, Advanced, REST API, then paste both halves here.",
    },
    meta_ads: {
      accountLabel: "Ad account",
      accountHint: "The ad account identifier, as Meta shows it in Ads Manager.",
      tokenLabel: "System User token",
      credentialHint:
        "Mint the token in your own Business Manager. It stays yours, and this connection reads with it.",
    },
  },

  /** Labels, not sentences. The value is rendered as itself when a member is not listed here. */
  providerNames: {
    woocommerce: "WooCommerce",
    meta_ads: "Meta Ads",
    ga4: "Google Analytics 4",
    google_ads: "Google Ads",
    search_console: "Search Console",
    loyverse: "Loyverse",
  } as Record<string, string>,

  statusNames: {
    active: "Active",
    needs_reauth: "Needs reconnecting",
    revoked: "Revoked",
    error: "Error",
  } as Record<string, string>,

  laneNames: {
    key_secret: "Key and secret",
    bearer: "Token",
    oauth: "Authorised",
  } as Record<string, string>,

  errors: {
    /* Refused here, before anything is sent. */
    noWorkspace:
      "Your account has no workspace yet, so there is nowhere to put a connection. Nothing was sent.",
    unknownProvider: "Choose one of the sources offered above. Nothing was sent.",
    missingAccount: "Name the account this connection should read. Nothing was sent.",
    missingKey: "Paste both halves of the key. Nothing was sent.",
    missingToken: "Paste the token. Nothing was sent.",
    missingExpiry:
      "Say whether that token expires, and on what date. A blank answer would be recorded as permanent.",
    contradictoryExpiry:
      "That token is marked as never expiring and carries a date as well. Say which of the two is true.",
    notConfigured:
      "This deployment does not know where to send a credential, so nothing was sent. That is a setting on our side, not something you can fix.",
    workspaceUnavailable:
      "Your workspace could not be read just now, so nothing was sent. Try again in a moment.",

    /* Refused by `POST /v1/connections`, one message per code it can return. */
    unauthorized: "Your session was not accepted. Sign in again, then repeat this.",
    forbidden:
      "Your account may not add a connection to this workspace, so nothing was stored. An owner or admin of the organisation can add it, or grant you access.",
    already_connected:
      "That account is already connected in this workspace, so nothing was changed. Replacing a live credential is an edit rather than a second connection.",
    bad_request:
      "Those account details were refused before anything was stored. Check the account you named, and for a store paste the full address it is served on.",
    unknown_provider: "This build cannot connect that source, so nothing was stored.",
    unsupported_lane:
      "That source cannot be connected by typing a credential, so nothing was stored.",
    invalid_credential:
      "That credential was refused as typed, so nothing was stored. Check that every field was pasted whole, with nothing missing from either end.",
    credential_expired:
      "That token had already expired when it was pasted, so nothing was stored. Mint a fresh one and paste that instead.",
    bad_kek:
      "Credentials cannot be sealed on this deployment right now, so nothing was stored. Nothing you change here will help; quote the reference below.",
    not_configured:
      "The service that stores credentials is not configured on this deployment, so nothing was stored.",
    upstream_unavailable:
      "The database would not accept this connection, and nothing partial was stored. Try again in a moment, and quote the reference below if it keeps happening.",

    /* Our fault rather than the customer's, and said so rather than dressed as their mistake. */
    clientFault:
      "This screen sent something the service would not read, so nothing was stored. That is a fault on our side.",

    /* Neither refusal nor success. */
    unreachable:
      "The service that stores credentials could not be reached, so this did not finish. Reload this page to see whether the connection was created before retrying.",
    unexpected:
      "That answer was not one this screen recognises, so it cannot say what happened. Reload this page to see whether the connection was created.",
  },

  referenceLabel: "Reference",
} as const;
