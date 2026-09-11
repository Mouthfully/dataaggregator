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
