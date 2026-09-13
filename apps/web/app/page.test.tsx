import { FORBIDDEN_CLAIMS, brand } from "@repo/brand";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SITE } from "./_content";
import Page from "./page";

/**
 * The marketing site's guarantees, asserted rather than reviewed.
 *
 * WHAT CHANGED, AND WHAT IT COST. This page was previously built entirely out of `claims.ts` --
 * every sentence carried a specification citation and a withheld capability could not render. The
 * founder-supplied page set replaced it, so the page's copy now comes from `SITE` in
 * `_content.ts` and from the section files, which are brand copy rather than cited claims.
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

describe("the page renders every section of the supplied design", () => {
  it("leads with the plan's positioning rather than with unification", () => {
    expect(text).toContain(SITE.heroLine1);
    expect(text).toContain(SITE.heroLine2);
    expect(text).toContain(SITE.heroLead);
    expect(text).toContain(SITE.eyebrow);
  });

  it("carries a sample label on the hero panel, and no owner, quote or customer", () => {
    // Section 5.3 of the reconciliation refuses a named Chiang Mai cafe as proof AT ANY PRICE:
    // there are no customers, the artboard's owner quotes are unapproved drafts and its figures
    // are invented. The resolution the issue settles on is the artboard's own -- label the example
    // as a sample -- so the label is asserted rather than trusted to survive an edit.
    expect(text).toContain(SITE.heroVisualLabel);
    expect(text.toLowerCase()).toContain("sample");

    // The two failure modes a proof section would take. Neither may appear anywhere on the page.
    expect(text).not.toMatch(/\btrusted by\b/i);
    expect(text).not.toMatch(/\btestimonial/i);
  });

  it("shows the hero's sample business in baht, not the dollar figures 5.1 banned", () => {
    // Section 5.1 names the exact strings that had to go -- "$186.2K, 5.42x ROAS, Everyday Mug,
    // Northstar Studio" -- because a dollar-denominated ecommerce brand is not the baht-billed
    // Thai owner-operator the plan is written for. Each is asserted individually rather than by
    // banning "$" across the page: the PRICING tiers are still quoted in dollars, docs/marketplane
    // 58 section 4.8 records that the THB ladder is an unsettled founder decision (two files in
    // this repository disagree by 2.3x at the top tier), and quoting baht prices before it is
    // settled would publish whichever file the writer happened to open.
    expect(text).toContain("\u0e3f15,420");
    for (const banned of ["186.2", "5.42", "ROAS", "Everyday Mug", "Northstar Studio"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("shows every platform mark as ARTWORK, not as its name in text", () => {
    // The first pass rendered these as bold text, which is the single most visible way the page
    // drifted from the design. Asserting the <img> is what stops it drifting back: the name being
    // present proves nothing, since it was present before too.
    for (const slug of ["googleads", "meta", "shopify", "tiktok", "hubspot", "stripe"]) {
      expect(html, slug).toContain(`/platforms/${slug}.svg`);
    }
  });

  it("renders all twelve sections of the reference, in its order", () => {
    // One landmark string per section, checked for ORDER rather than mere presence -- a section
    // rendered in the wrong place is a different page from the one that was designed.
    //
    // THE LIST MOVED WITH THE REPOSITIONING, and the three strings that left are the point of it:
    // "One connected workspace", "From insights to impact" and "Ready to unify your data" are all
    // named in docs/marketplane/58-plan-reconciliation.md section 5.1 as copy that must stop --
    // two of them because they sell unification, the third because it was byte-identical to the
    // section directly above it. The action sheet's landmark is new, and it is the one section the
    // page did not have: the whole argument is that an insight ends in a to-do.
    const landmarks = [
      SITE.heroLine1,
      "The tools your business already runs on",
      "Told what to do",
      "Every insight ends in a to-do",
      "in a decision",
      "Never the number",
      "In one place",
      "The page you open",
      "would write. On the 1st",
      "Simple, transparent pricing",
      "Built for owner-run businesses",
      "We're here to help",
      "Connect tonight. Decide at breakfast",
    ];
    let cursor = -1;
    for (const landmark of landmarks) {
      const at = text.indexOf(landmark, cursor + 1);
      expect(at, `"${landmark}" missing or out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("keeps the pricing tiers the design specifies", () => {
    for (const tier of ["Free", "Starter", "Growth", "Agency"]) {
      expect(text, tier).toContain(tier);
    }
  });

  it("uses native disclosure for the FAQ rather than client JavaScript", () => {
    // The reference uses <details>; reproducing it with state would make the section a client
    // component and ship JS for something the platform does.
    expect(html).toContain("<details");
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
