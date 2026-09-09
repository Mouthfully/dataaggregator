/**
 * THE SITE'S ONLY SOURCE OF COPY.
 *
 * Kickoff non-negotiable 1 and `00-repo-map.md` section 7: a 33-item allowed-claims list and a
 * forbidden-claims list go into the brand package "so the ban is machine-checkable and no marketing
 * string can outrun the specification". `@repo/brand` holds both. This module is what makes the
 * site physically unable to say anything else.
 *
 * `claim(id)` resolves text from `allowedClaims()` and THROWS when the id is unknown or withheld.
 * That is deliberate: a withheld claim -- one whose `requires` fields are still null on the brand
 * file -- is not rendered as an empty string or quietly skipped. It fails the build.
 *
 * Three claims are withheld today, and it matters that the site cannot reach them:
 *
 *   data-region   requires brand.dataRegion   -- not chosen
 *   gdpr          requires brand.euRepresentative -- the entity is Thai and no Article 27
 *                 representative is appointed
 *   dpa           requires brand.dpaAvailable -- no click-through Article 28 DPA exists
 *
 * Each is a promise a European buyer would rely on. `00-repo-map.md` section 7 lists exactly these
 * under "Delete or substantiate", and the artboard made all three.
 *
 * THE PRODUCT NAME IS NOT SETTLED, so it appears nowhere. `brand.productNameSettled` is false, and
 * a name printed across a marketing site is expensive to take back -- so the site leads with the
 * tagline and the SME positioning claim, both of which are true regardless of what the thing ends
 * up being called. `productName()` returns null until that changes.
 */

import { type Claim, allowedClaims, brand } from "@repo/brand";

const ALLOWED = new Map(allowedClaims().map((c: Claim) => [c.id, c]));

/**
 * The text of an allowed claim.
 *
 * Throws rather than returning a fallback. A fallback is how a site ends up shipping a sentence
 * nobody approved, and a build failure is how it does not.
 */
export function claim(id: string): string {
  const found = ALLOWED.get(id);
  if (found === undefined) {
    throw new Error(
      `copy: "${id}" is not an allowed claim. Either it does not exist in @repo/brand, or it is ` +
        "withheld because a brand field it requires is still null. Add the claim with its " +
        "specification citation, or fill in the field -- do not write the sentence here.",
    );
  }
  return found.text;
}

/** The claims this page is built from, in the order it uses them. Exported so a test can check. */
export const USED_CLAIMS = [
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
