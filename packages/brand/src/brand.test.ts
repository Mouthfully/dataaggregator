import { describe, expect, it } from "vitest";
import { apiUrl, brand, formatAddress, siteUrl } from "./brand.ts";
import {
  AVAILABLE_CAPABILITIES,
  CLAIMS,
  FORBIDDEN_CLAIMS,
  IMPLEMENTED_SOURCE_IDS,
  allowedClaims,
  withheldClaims,
  type Capability,
} from "./claims.ts";

describe("the brand file", () => {
  it("has every field a page, email or invoice needs to render", () => {
    expect(brand.legalEntity).not.toHaveLength(0);
    expect(brand.productName).not.toHaveLength(0);
    expect(brand.tagline).not.toHaveLength(0);
    expect(brand.companyRegistration).toMatch(/^\d{13}$/);
    expect(brand.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(brand.defaultCurrency).toMatch(/^[A-Z]{3}$/);
    expect(formatAddress()).toContain("Thailand");
  });

  it("leaves genuinely unknown fields null rather than guessing them", () => {
    // Each of these is unresolved for a recorded reason, and a plausible-looking placeholder
    // would be worse than a null: null withholds a claim, a placeholder ships a false one.
    expect(brand.domain).toBeNull(); // support is on one domain, the artboard hard-codes another
    expect(brand.vatNumber).toBeNull(); // not supplied; a wrong VAT number is worse than none
    expect(brand.dataRegion).toBeNull(); // no project provisioned yet
    expect(brand.euRepresentative).toBeNull(); // GDPR Art. 27, not yet appointed
  });

  it("does not treat the product name as settled", () => {
    expect(brand.productNameSettled).toBe(false);
  });
});

describe("the claims gate", () => {
  it("cites a specification section for every claim", () => {
    for (const claim of CLAIMS) {
      expect(claim.source.length, `claim "${claim.id}" has no citation`).toBeGreaterThan(0);
    }
  });

  it("withholds the data-protection claims the company cannot yet substantiate", () => {
    const allowed = allowedClaims().map((c) => c.id);
    // The entity is Thai. Residency is configuration; an Art. 27 representative and a transfer
    // mechanism are not. See docs/marketplane/01-brand-identity.md.
    expect(allowed).not.toContain("gdpr");
    expect(allowed).not.toContain("dpa");
    expect(allowed).not.toContain("data-region");
  });

  it("still allows the claims that are architectural properties, not arrangements", () => {
    const allowed = allowedClaims().map((c) => c.id);
    expect(allowed).toContain("no-pooling");
    expect(allowed).toContain("no-training");
    expect(allowed).toContain("read-only-oauth");
    expect(allowed).toContain("attribution-required");
  });

  it("withholds every claim whose product capability has not launched", () => {
    const allowed = allowedClaims().map((c) => c.id);
    for (const id of [
      "positioning",
      "byoc",
      "audit-log",
      "diagnose",
      "second-pass",
      "verified-alerts",
      "reconcile",
      "ai-confidence",
      "cost-preview",
      "serp-bought",
      "pricing-two-units",
      "billing-fairness",
      "agency-mode",
    ]) {
      expect(allowed, `${id} describes an unlaunched capability`).not.toContain(id);
    }
  });

  it("turns on a capability-gated claim only when every requirement is present", () => {
    const withDiagnose = new Set<Capability>([...AVAILABLE_CAPABILITIES, "surface:diagnose"]);
    const allowed = allowedClaims(brand, withDiagnose).map((c) => c.id);
    expect(allowed).toContain("diagnose");
    expect(allowed).toContain("second-pass");
    expect(allowed).not.toContain("reconcile");
    expect(allowed).not.toContain("pricing-two-units");

    const withPartialBilling = new Set<Capability>([
      ...AVAILABLE_CAPABILITIES,
      "billing:connected-account",
    ]);
    expect(allowedClaims(brand, withPartialBilling).map((c) => c.id)).not.toContain(
      "pricing-two-units",
    );
  });

  it("derives the connector claim from the guarded implemented-source list", () => {
    expect(IMPLEMENTED_SOURCE_IDS).toEqual(["ga4", "woocommerce"]);
    const connectors = allowedClaims().find((claim) => claim.id === "connectors");
    expect(connectors?.text).toBe("Reads GA4 and WooCommerce on your own credentials.");
    expect(connectors?.text).not.toMatch(/Google Ads|Search Console|Meta|affiliate/i);
  });

  // §11A.1 moved the primary customer from agencies and brands to an owner-run business with no
  // analyst and no IT function, and recorded in the specification that the claim contradicting it
  // could not be changed in the same pass. It sat contradicted for four rounds. This is the pin
  // that stops it drifting back the next time someone writes copy from the old pitch.
  it("positions on the primary customer 11A.1 names, not the one it replaced", () => {
    const positioning = CLAIMS.find((c) => c.id === "positioning");
    expect(positioning, "the positioning claim was removed rather than reconciled").toBeDefined();
    expect(positioning?.source, "positioning must cite the decision that set it").toContain(
      "11A.1",
    );
    // The exact string 11A.1 superseded. It names neither "agency" nor "brands" -- the audience
    // lived in the specification's prose around it, never in the sentence -- so a keyword filter
    // does NOT catch a straight restore from git history, which is the likeliest way the old
    // pitch comes back. Assert the string itself.
    expect(positioning?.text).not.toContain(
      "Verified root cause and an operated correctness guarantee",
    );
    // And assert what replaced it, so a third sentence that is neither one nor the other cannot
    // pass by being merely different from the old text.
    expect(positioning?.text).toMatch(/small business/i);
    // Kept as a forward guard: 11A.1 makes agencies a secondary channel, so the audience must not
    // reappear inside the sentence either. See the `agency-mode` claim for where they do survive.
    expect(positioning?.text).not.toMatch(/\bagenc(y|ies)\b|\bbrands\b/i);
  });

  it("names the field or capability that would turn each withheld claim on", () => {
    const withheld = withheldClaims();
    expect(withheld.length).toBeGreaterThan(0);
    for (const { claim, missing, missingCapabilities } of withheld) {
      expect(
        missing.length + missingCapabilities.length,
        `"${claim.id}" is withheld but names no missing requirement`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("the forbidden-claims list", () => {
  // Every string below is copy that phase 0 found on the design artboard. Each was killed by a
  // decision in section 11, and each would otherwise have shipped.
  const fromTheArtboard = [
    "Reads from 22 sources",
    "All 22 integrations",
    "Prices, app rankings, reviews and the ads they run",
    "Push the exclusion list to all three platforms now",
    "Pay as you go. Nothing monthly.",
    "EU hosting, GDPR and UK GDPR. Frankfurt by default.",
  ];

  for (const copy of fromTheArtboard) {
    it(`catches ${JSON.stringify(copy.slice(0, 40))}`, () => {
      const hit = FORBIDDEN_CLAIMS.find((f) => f.pattern.test(copy));
      expect(hit, `nothing in FORBIDDEN_CLAIMS matched: ${copy}`).toBeDefined();
      expect(hit?.reason).not.toHaveLength(0);
    });
  }

  it("does not fire on the claims that are allowed", () => {
    for (const claim of allowedClaims()) {
      const hit = FORBIDDEN_CLAIMS.find((f) => f.pattern.test(claim.text));
      expect(
        hit,
        `allowed claim "${claim.id}" is also forbidden by: ${hit?.reason}`,
      ).toBeUndefined();
    }
  });
});

describe("siteUrl, with the domain unsettled", () => {
  it("uses an explicit override before anything else", () => {
    expect(siteUrl({ PUBLIC_SITE_URL: "https://staging.example/", VERCEL_URL: "ignored" })).toBe(
      "https://staging.example",
    );
  });

  it("falls back to Vercel's per-deployment URL, so previews work with no domain at all", () => {
    expect(siteUrl({ VERCEL_URL: "web-abc123.vercel.app" })).toBe("https://web-abc123.vercel.app");
  });

  it("falls back to localhost in development", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
  });

  it("refuses to guess in production rather than emit a wrong absolute URL", () => {
    // A placeholder string would have made this case silently succeed and put a fake hostname in
    // an email. Null plus a throw is the safer pair.
    expect(() => siteUrl({ NODE_ENV: "production" })).toThrow(/no public URL available/);
  });

  it("derives the API URL from the site URL until apiBaseUrl is settled", () => {
    expect(apiUrl({ PUBLIC_SITE_URL: "https://staging.example" })).toBe(
      "https://staging.example/api",
    );
  });
});
