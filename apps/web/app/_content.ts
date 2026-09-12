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

import { CLAIMS, type Claim, allowedClaims, brand } from "@repo/brand";

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

export const SITE = {
  eyebrow: "Your data, made plain",
  heroLine1: "All your data.",
  heroLine2: "One clear view.",
  heroLead:
    "Connect your tools, unify your data, and turn it into insights — in minutes. No code, no hassle.",
  ctaPrimary: "Start free",
  ctaSecondary: "Explore dashboard",
  ctaNav: "Explore dashboard",
  // "200+ integrations" was the middle check and is gone: five connectors exist
  // (`packages/connectors/src/sources`), so the figure counted integrations we do not have. The
  // same string is still the eyebrow of `_sections/IntegrationsMap.tsx`, which was outside this
  // change's paths and is reported rather than edited.
  heroChecks: ["No credit card required", "Set up in minutes"],
  syncPill: "Everything connected. Finally.",
  heroVisualLabel: "Illustrative dashboard",
  platformsEyebrow: "Your favourite platforms. One connected workspace.",
  footerTagline: "All your data. One clear view.",
  footerNote: "Built for businesses everywhere.",
  footerNote2: "Global platforms. Local possibilities.",
} as const;

/** The primary navigation. Labels are structural, so they are not sentences. */
export const NAV = [
  { href: "/integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Documentation" },
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
