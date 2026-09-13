import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT, renderUserPrompt } from "./brief.ts";
import { COMPARISON, PERIOD, row, settledWeek } from "./fixtures.ts";
import {
  type BusinessType,
  type FigureSet,
  allowedNumbers,
  buildFigureSet,
  canonicalNumber,
} from "./figures.ts";
import { numericTokens, verifyInsight } from "./verify.ts";

function build(rows = settledWeek(), business: BusinessType = "cafe"): FigureSet {
  const result = buildFigureSet({ business, period: PERIOD, comparison: COMPARISON, rows });
  if (!result.ok) throw new Error(`expected a figure set, got ${result.code}`);
  return result.set;
}

describe("the prompt is reproducible", () => {
  it("renders the same bytes from two independently built sets over the same rows", () => {
    // Not `renderUserPrompt(set) === renderUserPrompt(set)`, which proves only that a function is
    // a function. Two separate builds, and the rows arrive in the opposite order in one of them.
    const forwards = renderUserPrompt(build(settledWeek()));
    const backwards = renderUserPrompt(build([...settledWeek()].reverse()));
    expect(backwards).toBe(forwards);
  });

  it("reads no clock, so it does not drift between two renders", () => {
    const first = renderUserPrompt(build());
    const second = renderUserPrompt(build());
    expect(second).toBe(first);
    // A timestamp of "now" would show up here; `fetched_at` from the rows is data, not a clock.
    expect(first).not.toContain(new Date().getFullYear() === 0 ? "" : "T00:00:00.000Z");
  });
});

describe("no tenant free text reaches the prompt", () => {
  const set = build();
  const rendered = renderUserPrompt(set);

  it("keeps the system prompt free of customer data by construction", () => {
    // It takes no arguments, so there is no signature through which tenant data could arrive.
    expect(SYSTEM_PROMPT).not.toContain("secret");
    expect(SYSTEM_PROMPT).not.toContain("THB");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("never prints an entity id or an account id", () => {
    // The fixtures carry deliberately identifiable ids so this assertion cannot pass by accident.
    expect(rendered).not.toContain("acct-9f3c-secret-entity");
    expect(rendered).not.toContain("acct-9f3c-secret-account");
    expect(rendered).not.toContain("secret");
  });

  it("names sources only by their dictionary id", () => {
    expect(rendered).toContain("woocommerce");
    expect(rendered).toContain("meta_ads");
  });
});

describe("the prompt and the gate agree about what a number is", () => {
  it("licenses every number it prints", () => {
    // THE TEST THAT MATTERS MOST IN THIS FILE. If the prompt could print a figure the verifier
    // would not accept, a model that copied the prompt perfectly would be refused -- and that
    // refusal would look exactly like fabrication from the outside. Reading every numeric token
    // back out of the rendered prompt and checking it against the gate's own allowed set is what
    // proves the two modules cannot drift apart.
    const set = build();
    const prompt = renderUserPrompt(set);
    const tokens = numericTokens(prompt);
    expect(tokens.length).toBeGreaterThan(20);

    const allowed = allowedNumbers(set);
    const unlicensed = [
      ...new Set(
        tokens.filter((token) => {
          const canonical = canonicalNumber(token);
          return canonical === null || !allowed.has(canonical);
        }),
      ),
    ];
    expect(unlicensed).toEqual([]);
  });

  it("passes the gate when the model echoes the prompt's figures back", () => {
    // The same property end to end, through the real verifier rather than through its parts.
    const set = build();
    const numbers = [...new Set(numericTokens(renderUserPrompt(set)))];
    const verdict = verifyInsight(
      JSON.stringify({
        summary: [
          numbers.slice(0, 20).join(" "),
          numbers.slice(20, 40).join(" "),
          numbers.slice(40).join(" "),
        ],
        unusual: null,
        action: null,
      }),
      set,
    );
    if (!verdict.ok) {
      throw new Error(
        `the gate refused the prompt's own figures: ${verdict.code} ${verdict.detail}`,
      );
    }
  });
});

describe("what the prompt says about absent and provisional figures", () => {
  it("names an absent metric rather than leaving it out", () => {
    const rendered = renderUserPrompt(build());
    expect(rendered).toContain("not reported for this period");
  });

  it("says in words when every figure may still be restated", () => {
    const provisional = build([
      row({
        source: "woocommerce",
        date: "2026-09-07",
        metrics: { revenue: 100 },
        provisional: true,
      }),
      row({
        source: "woocommerce",
        date: "2026-08-31",
        metrics: { revenue: 90 },
        provisional: true,
      }),
    ]);
    expect(renderUserPrompt(provisional)).toContain("may still be restated by the platform");
  });

  it("tells the model the list is already ordered and may not be reordered", () => {
    expect(renderUserPrompt(build())).toContain("already ordered by what each is worth");
    expect(SYSTEM_PROMPT).toContain("Do not reorder");
  });
});

describe("which metrics lead depends on the business type", () => {
  it("puts a cafe's takings before an online seller's advertising", () => {
    const cafe = renderUserPrompt(build(settledWeek(), "cafe"));
    const seller = renderUserPrompt(build(settledWeek(), "online_seller"));
    const cafeSpend = cafe.indexOf("advertising spend");
    const sellerSpend = seller.indexOf("advertising spend");
    expect(sellerSpend).toBeLessThan(cafeSpend);
    // Same figures either way -- only the order changes, because the ordering is emphasis and the
    // figures are arithmetic.
    expect([...numericTokens(cafe)].sort()).toEqual([...numericTokens(seller)].sort());
  });
});
