import { CLAIMS, FORBIDDEN_CLAIMS, allowedClaims, brand, withheldClaims } from "@repo/brand";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { USED_CLAIMS, claim, productName } from "./_content";
import Page from "./page";

/**
 * The marketing site's guarantee, asserted rather than reviewed.
 *
 * `00-repo-map.md` section 7 found the artboard selling four things section 11 had already dropped
 * or deferred, and concluded: put the claims list in the brand package "so the ban is
 * machine-checkable and no marketing string can outrun the specification". These tests are the
 * machine doing the checking.
 *
 * Rendered with `renderToStaticMarkup` rather than in a DOM. The site is static, the assertions are
 * about text, and adding jsdom to check strings would be a dependency bought for nothing.
 */

const html = renderToStaticMarkup(<Page />);
/** The rendered text, with tags removed and entities decoded, as a reader would see it. */
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

describe("nothing the specification dropped can reach the page", () => {
  it.each(FORBIDDEN_CLAIMS.map((f) => [f.pattern.source, f] as const))(
    "does not match the forbidden pattern %s",
    (_source, forbidden) => {
      const match = text.match(forbidden.pattern);
      expect(match?.[0] ?? null, `forbidden: ${forbidden.reason}`).toBeNull();
    },
  );

  it("states no source count, which is the artboard's most repeated dead claim", () => {
    // "Reads from 22 sources", "All 22 integrations" and the 22-mark grid, all killed by 11.9.
    expect(text).not.toMatch(/\b\d+\s+(sources|integrations|connectors|platforms)\b/i);
  });

  it("sells nothing from the dropped market module", () => {
    expect(text.toLowerCase()).not.toContain("competitor");
    expect(text.toLowerCase()).not.toContain("app ranking");
  });

  it("promises no write, because writes are deferred past the MVP", () => {
    // Section 11.4. The artboard promised customer lists, audience sync and consent-checked export.
    for (const word of ["audience sync", "suppression list", "push a segment", "export to meta"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });
});

describe("the three claims a European buyer would rely on, and why none of them appears", () => {
  // Each is withheld because a brand field behind it is still null. `00-repo-map.md` section 7
  // lists exactly these under "Delete or substantiate", and the artboard made all three.
  const withheldIds = withheldClaims().map((w) => w.claim.id);

  it("withholds data-region, gdpr and dpa given the brand file as it stands", () => {
    expect(withheldIds).toContain("data-region");
    expect(withheldIds).toContain("gdpr");
    expect(withheldIds).toContain("dpa");
  });

  it.each(["data-region", "gdpr", "dpa"])("does not render the withheld %s claim", (id) => {
    const withheld = CLAIMS.find((c) => c.id === id);
    expect(withheld).toBeDefined();
    expect(text).not.toContain(withheld?.text);
  });

  it("makes a withheld claim unreachable from the page rather than merely unused", () => {
    // The difference matters: "we did not use it" is a habit, "it throws" is a property.
    expect(() => claim("gdpr")).toThrow(/withheld/);
    expect(() => claim("dpa")).toThrow(/withheld/);
    expect(() => claim("data-region")).toThrow(/withheld/);
  });

  it("throws on a claim that does not exist at all, rather than rendering nothing", () => {
    expect(() => claim("we-are-soc2-certified")).toThrow(/not an allowed claim/);
  });

  it("says nothing about hosting region, GDPR or a DPA in the footer either", () => {
    const lower = text.toLowerCase();
    for (const word of ["gdpr", "data protection agreement", "frankfurt", "eu region"]) {
      expect(lower).not.toContain(word);
    }
  });
});

describe("every promise on the page comes from the claims list", () => {
  it("uses the SME positioning decided by section 11A.1", () => {
    const positioning = CLAIMS.find((candidate) => candidate.id === "positioning");

    expect(positioning?.source).toEqual(["11A.1"]);
    expect(text).toContain(
      "A replacement for a business-intelligence team, built for owner-run businesses with no analyst or IT function — Thailand first, but not Thailand only.",
    );
    expect(text).not.toContain(
      "Verified root cause and an operated correctness guarantee over your own ad, analytics and search data.",
    );
  });

  it("renders each claim it declares it uses", () => {
    const allowed = new Map(allowedClaims().map((c) => [c.id, c]));
    for (const id of USED_CLAIMS) {
      const c = allowed.get(id);
      expect(c, `${id} is not an allowed claim`).toBeDefined();
      expect(text, `${id} is declared used but does not appear`).toContain(c?.text);
    }
  });

  it("declares no claim it does not render", () => {
    // Keeps USED_CLAIMS honest: a stale entry would otherwise sit there asserting nothing.
    const allowed = new Map(allowedClaims().map((c) => [c.id, c]));
    const unrendered = USED_CLAIMS.filter((id) => {
      const c = allowed.get(id);
      return c === undefined || !text.includes(c.text);
    });
    expect(unrendered).toEqual([]);
  });

  it("cites a specification section for every claim it renders", () => {
    // Rule 1 of the claims module: "a claim with no citation is not a claim, it is copywriting."
    const allowed = new Map(allowedClaims().map((c) => [c.id, c]));
    for (const id of USED_CLAIMS) {
      expect(allowed.get(id)?.source.length, `${id} cites no section`).toBeGreaterThan(0);
    }
  });
});

describe("the unsettled product name", () => {
  it("is not printed anywhere, because it is not settled", () => {
    // A name on a marketing site is the most expensive place to put an unsettled one. The brand
    // guard already bans it in source; this asserts the RENDERED page too, which is what a
    // customer and a search engine actually see.
    expect(brand.productNameSettled).toBe(false);
    expect(productName()).toBeNull();
    expect(text).not.toContain(brand.productName);
  });

  it("leads with the tagline instead, which is true whatever it ends up being called", () => {
    expect(text).toContain("Know what changed. And why.");
  });
});

describe("the legal identity is the brand file's, not a copy", () => {
  it("renders the entity, address and registration from @repo/brand", () => {
    expect(text).toContain(brand.legalEntity);
    expect(text).toContain(brand.companyRegistration);
    expect(html).toContain(`mailto:${brand.supportEmail}`);
  });

  it("names no domain, because none is registered", () => {
    // brand.domain is null. A site that printed one would be advertising an address that does not
    // resolve, and Google's OAuth verification restarts if the domain changes later.
    // Asserted against the MARKUP, not the stripped text: a URL lives in an href attribute, which
    // tag-stripping removes. A mutation adding <a href="https://..."> survived the text-only
    // version of this assertion, which is exactly the case it exists to catch.
    expect(brand.domain).toBeNull();
    expect(html).not.toMatch(/\bhttps?:\/\/(?!localhost)/);
  });
});

describe("no colour is written outside the token file", () => {
  it("emits no hex literal in the rendered markup", () => {
    // Kickoff non-negotiable 2. The tokens guard checks source; this checks OUTPUT, which is where
    // an inline style attribute would show up and where the guard's file-level allowlist ends.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\b(rgb|hsl|oklch)a?\(/);
  });
});
