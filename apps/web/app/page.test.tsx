import { FORBIDDEN_CLAIMS, brand } from "@repo/brand";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURES, PLATFORMS, SITE } from "./_content";
import Page from "./page";

/**
 * The marketing site's guarantees, asserted rather than reviewed.
 *
 * WHAT CHANGED, AND WHAT IT COST. This page was previously built entirely out of `claims.ts` --
 * every sentence carried a specification citation and a withheld capability could not render. The
 * founder-supplied page set replaced it, so the page's copy now comes from `SITE` and
 * `FEATURES` in `_content.ts`, which are brand copy rather than cited claims.
 *
 * That is a real reduction in what these tests can promise and it is recorded here rather than
 * quietly absorbed: **the claims gate no longer guards the homepage.** `claims.ts`, its citations
 * and its withholding logic are untouched and still tested in `packages/brand`, but nothing on this
 * page passes through them.
 *
 * What survives, because it never depended on the claims resolver:
 *   - the FORBIDDEN_CLAIMS patterns, which are a ban list and apply to any text whatever its source;
 *   - the rule that no identity string is typed here -- name, address and registration come from
 *     `@repo/brand`, which is also what `scripts/check-brand.mjs` enforces;
 *   - the rule that no colour is written outside the token file, checked against OUTPUT, where an
 *     inline style would surface and the guard's file scan ends.
 *
 * Rendered with `renderToStaticMarkup` rather than in a DOM. The page is static, the assertions are
 * about text, and adding jsdom to check strings would be a dependency bought for nothing.
 */

const html = renderToStaticMarkup(<Page />);
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
      // These are a BAN LIST, not a gate: they apply to whatever the page says, however it got
      // there. That is exactly why they still bind after the copy stopped coming from claims.ts.
      expect(text, forbidden.reason).not.toMatch(forbidden.pattern);
    },
  );
});

describe("the page renders the supplied copy, and only from the copy module", () => {
  it("leads with the brand guide's tagline", () => {
    expect(text).toContain(SITE.heroLine1);
    expect(text).toContain(SITE.heroLine2);
    expect(text).toContain(SITE.heroLead);
  });

  it("renders every feature card and every platform mark", () => {
    for (const feature of FEATURES) {
      expect(text, feature.id).toContain(feature.title);
      expect(text, feature.id).toContain(feature.body);
    }
    for (const platform of PLATFORMS) expect(text, platform).toContain(platform);
  });

  it("renders the eyebrow and both calls to action", () => {
    expect(text).toContain(SITE.eyebrow);
    expect(text).toContain(SITE.ctaPrimary);
    expect(text).toContain(SITE.ctaSecondary);
  });
});

describe("the legal identity is the brand file's, not a copy", () => {
  it("renders the entity, address and registration from @repo/brand", () => {
    expect(text).toContain(brand.legalEntity);
    expect(text).toContain(brand.companyRegistration);
    expect(html).toContain(`mailto:${brand.supportEmail}`);
  });

  it("names the product only through the brand file", () => {
    // The wordmark is artwork, so the product name reaches the page exactly once as alt text, from
    // `brand.productName`. check-brand.mjs bans the literal everywhere outside the brand file; this
    // asserts the other half -- that the page does in fact identify itself.
    expect(html).toContain(`alt="${brand.productName}"`);
    expect(html).toContain(brand.logoPath);
  });

  it("names no domain, even now that one is registered", () => {
    // A page that prints its own absolute address pins that address into the markup, and Google's
    // OAuth verification restarts if the domain changes later. The support address is the one
    // legitimate occurrence, so the assertion is a COUNT rather than an absence.
    expect(html).not.toMatch(/\bhttps?:\/\/(?!localhost)/);
    expect(brand.domain).not.toBeNull();
    const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;
    const addresses = occurrences(html, brand.supportEmail);
    expect(addresses).toBeGreaterThan(0);
    expect(occurrences(html, brand.domain as string)).toBe(addresses);
  });
});

describe("no colour is written outside the token file", () => {
  it("emits no hex literal in the rendered markup", () => {
    // Kickoff non-negotiable 2. The tokens guard checks SOURCE; this checks OUTPUT, which is where
    // an inline style attribute would show up and where the guard's file-level allowlist ends.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
