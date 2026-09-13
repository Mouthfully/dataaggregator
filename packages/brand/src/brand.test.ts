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
    expect(brand.apiBaseUrl).toBeNull(); // the Worker is on workers.dev; no hostname routes to it
    expect(brand.vatNumber).toBeNull(); // not supplied; a wrong VAT number is worse than none
    // ap-southeast-1: a project IS now provisioned, in the nearest Supabase region to Thailand.
    // The `data-region` claim stays withheld anyway -- see the capability test below.
    expect(brand.dataRegion).toBe("ap-southeast-1");
    expect(brand.euRepresentative).toBeNull(); // GDPR Art. 27, not yet appointed
  });

  it("treats the product name as settled, and it is the one the brand file holds", () => {
    // §12 only RECOMMENDED a name; this one is the founder's. What matters for the repository is
    // unchanged: the string lives in exactly one file, and `scripts/check-brand.mjs` both bans it
    // everywhere else and match-tests the infrastructure files that must carry it.
    expect(brand.productNameSettled).toBe(true);
    expect(brand.productName).toBe("Uniplain");
    expect(brand.productName.trim()).toBe(brand.productName);
  });

  it("puts the support address on the product's own domain", () => {
    // The legal notice the founder supplied names this address, so the imprint and the brand file
    // cannot be allowed to disagree. Asserting the RELATIONSHIP rather than the literal is what
    // catches the half-move: changing the domain and leaving the address on the old one is the
    // failure mode, and an equality assertion on the address alone would pass right through it.
    expect(brand.supportEmail.split("@")[1]).toBe(brand.domain);
  });

  it("holds the settled domain, and the product name is its registrable label", () => {
    // These two are not independent facts that happen to agree -- the domain is the product name.
    // Asserting the relationship rather than the two strings is what would catch half a rename:
    // changing `productName` and leaving `domain` on the old one still passes two equality tests.
    expect(brand.domain).toBe("uniplain.com");
    expect(brand.domain?.split(".")[0]).toBe(brand.productName.toLowerCase());
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

  it("records a data region without promising the customer chose it", () => {
    // The brand-fact gate is now satisfied -- dataRegion is set -- so this claim would render on
    // that axis alone. It must not: "the region you choose" describes a choice nobody is offered.
    // `organisations.data_region` is a column with no picker behind it and nothing that populates
    // it. Withheld on the capability axis until region choice actually ships.
    expect(brand.dataRegion).not.toBeNull();

    const withheld = withheldClaims().find((entry) => entry.claim.id === "data-region");
    expect(
      withheld,
      "data-region must stay withheld while region choice does not exist",
    ).toBeDefined();
    expect(withheld?.missing).toEqual([]);
    expect(withheld?.missingCapabilities).toContain("surface:region-choice");

    expect(allowedClaims().map((c) => c.id)).not.toContain("data-region");
  });

  it("derives the connector claim from the guarded implemented-source list", () => {
    // Five sources now, and the negative assertion had to change with them -- which is the point
    // of this test rather than an inconvenience. It used to prove the sentence could NOT say
    // "Google Ads" or "Search Console", because neither existed and saying so would have been the
    // abandoned-roadmap claim of issue #16. They exist, so the sentence names them. What must stay
    // unsayable is a source with no module behind it.
    expect(IMPLEMENTED_SOURCE_IDS).toEqual([
      "ga4",
      "google_ads",
      "loyverse",
      "meta_ads",
      "search_console",
      "woocommerce",
    ]);
    const connectors = allowedClaims().find((claim) => claim.id === "connectors");
    expect(connectors?.text).toBe(
      "Reads GA4, Google Ads, Loyverse, Meta Ads, Search Console and WooCommerce on your own " +
        "credentials.",
    );
    expect(connectors?.text).not.toMatch(/affiliate|Shopify|TikTok|DataForSEO|Impact|Awin/i);
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

  /**
   * THE EVASION SHAPES, not the obvious spellings.
   *
   * This list's two recorded near-misses are the design input: "200+ integrations" slipped a
   * source-count pattern because the "+" sat where the regex expected whitespace, and the
   * competitor pattern catches "competitor" but not "competitors" because the word boundary fails
   * before the plural. So each entry below is a form somebody would plausibly write that a naive
   * `\bsoc 2\b` would miss.
   */
  const certificationEvasions = [
    "SOC 2 Type II certified",
    "SOC2 audited",
    "SOC-2 compliant infrastructure",
    "Service Organization Control 2",
    "ISO 27001 certified",
    "ISO27001",
    "ISO/IEC 27001 certified",
    "ISO-27001 aligned",
    "certified to 27001",
    "GDPR compliant",
    "GDPR-compliant by design",
    "fully GDPR",
    "compliant with the GDPR",
    "PDPA compliant",
    "PDPA-certified",
    "independently audited",
    "third-party audited",
    "externally verified",
    "penetration tested",
    "pen-tested quarterly",
  ];

  for (const copy of certificationEvasions) {
    it(`catches the certification claim ${JSON.stringify(copy)}`, () => {
      const hit = FORBIDDEN_CLAIMS.find((f) => f.pattern.test(copy));
      expect(hit, `nothing in FORBIDDEN_CLAIMS matched: ${copy}`).toBeDefined();
      expect(hit?.reason).not.toHaveLength(0);
    });
  }

  /**
   * THE BAN MUST BE NARROW, and this is the half that keeps it switchable-on.
   *
   * A guard with false positives gets turned off, which is strictly worse than not having one. A
   * privacy notice has to be able to NAME the law it operates under -- that is the whole of the
   * `governing-law` claim -- so the acronyms stay legal and only the assertion is banned.
   */
  const mustStayLegal = [
    "Operated by a Thai company under Thailand's Personal Data Protection Act.",
    "Complaints go to the Personal Data Protection Committee.",
    "We are not established in the Union and have appointed no representative.",
    "The GDPR may apply where a customer offers services to data subjects in the Union.",
    "Your data is held in Singapore.",
    "Every query, export and API key is logged.",
    "Social media accounts are not a source.",
    // Probes the SOC pattern's own boundaries: `\bsoc\W{0,3}2` must not fire on "Social", and a
    // bare "2" beside an unrelated noun must not fire at all.
    "Social sharing is not a feature of this product.",
    "Clause 2 of the agreement covers termination.",
    "Associate accounts are billed separately.",
  ];

  for (const copy of mustStayLegal) {
    it(`does NOT fire on ${JSON.stringify(copy.slice(0, 44))}`, () => {
      const hit = FORBIDDEN_CLAIMS.find((f) => f.pattern.test(copy));
      expect(hit, `FORBIDDEN_CLAIMS fired on legal copy: ${hit?.reason}`).toBeUndefined();
    });
  }

  it("withholds both certification claims, because neither document exists", () => {
    // The claims are DECLARED so the machinery gates them, and the machinery is a brand fact only a
    // third party can set. `allowedClaims()` must not contain either one.
    const allowed = allowedClaims().map((c) => c.id);
    expect(allowed).not.toContain("soc2");
    expect(allowed).not.toContain("iso27001");
    expect(brand.soc2TypeIIReport).toBe(false);
    expect(brand.iso27001Certificate).toBe(false);
  });

  it("names a governing law and an authority, because a Thai entity has both", () => {
    // Not a certification and not optional: the PDPA applies whether or not anything is claimed.
    // A privacy notice naming no authority leaves a data subject with no route.
    expect(brand.governingPrivacyLaw).toContain("Personal Data Protection Act");
    expect(brand.supervisoryAuthority).toContain("Personal Data Protection Committee");
    // The DPO is null, and the null is real. A plausible-looking name would be written to by a
    // data subject and answered by nobody.
    expect(brand.dataProtectionOfficer).toBeNull();
    expect(allowedClaims().map((c) => c.id)).not.toContain("governing-law");
  });

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

describe("siteUrl, now that the domain is settled", () => {
  it("uses an explicit override before anything else", () => {
    expect(siteUrl({ PUBLIC_SITE_URL: "https://staging.example/", VERCEL_URL: "ignored" })).toBe(
      "https://staging.example",
    );
  });

  it("resolves to the canonical domain in production", () => {
    expect(siteUrl({ NODE_ENV: "production" })).toBe(`https://${brand.domain}`);
  });

  it("prefers a preview's own URL over the canonical domain", () => {
    // A preview build carries VERCEL_URL and NODE_ENV=production both. If the domain won, every
    // link in the build under review would point at the live site instead of at itself.
    expect(siteUrl({ NODE_ENV: "production", VERCEL_URL: "web-abc123.vercel.app" })).toBe(
      "https://web-abc123.vercel.app",
    );
  });

  it("still falls back to localhost in development rather than to the live domain", () => {
    // This one only became possible to get wrong when the domain was set. Ordering the canonical
    // domain ahead of this branch would send a developer to production to check their own work,
    // and every assertion here would still have passed except this one.
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});

describe("apiUrl, which is a different origin from the site", () => {
  it("uses an explicit override", () => {
    expect(apiUrl({ PUBLIC_API_URL: "https://api.staging.example/" })).toBe(
      "https://api.staging.example",
    );
  });

  it("refuses rather than deriving an API URL from the site's domain", () => {
    // It used to return `${siteUrl(env)}/api`. That was harmless only because `siteUrl` threw in
    // production while the domain was null; with the domain set, the same line would have
    // returned https://uniplain.com/api -- a URL that resolves, serves the marketing site, and
    // looks right in a log. The site serves no /api route.
    expect(() => apiUrl({ NODE_ENV: "production" })).toThrow(/no API base URL available/);
    expect(() => apiUrl({ PUBLIC_SITE_URL: "https://staging.example" })).toThrow(
      /different origin/,
    );
  });
});
