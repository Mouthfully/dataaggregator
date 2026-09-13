import { allowedNumbers, canonicalNumber, numericTokens } from "@repo/insights";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssistantPanel } from "./AssistantPanel";
import { SAMPLE_FIGURES, SAMPLE_SET, TOP_ACTION_FLOOR } from "./_sample-brief";

/**
 * THE PANEL'S NUMBERS ARE THE ENGINE'S, AND THIS IS WHAT KEEPS THEM THAT WAY.
 *
 * `AssistantPanel` says the product computes every figure from the customer's own rows before a
 * model sees it. The card underneath that sentence prints figures from `buildFigureSet`, so the
 * claim is demonstrated on the page rather than asserted beside it.
 *
 * Nothing stops a later edit from typing a nicer-looking number back in. That is what this file is
 * for: every numeric token the panel renders must be one the engine licensed for these rows. It is
 * the same rule `verify.ts` applies to a model's output, applied to our own marketing copy, and it
 * fails for the same reason -- a number on this page that the arithmetic did not produce is exactly
 * the thing the section is arguing the product does not do.
 */

/**
 * DECORATIVE ELEMENTS ARE STRIPPED FIRST, and the numbered list markers are why.
 *
 * The card draws its list positions as visible "1", "2", "3" inside `aria-hidden` spans -- the
 * list marker made visible, which is why it is hidden from assistive tech that already announces
 * the position. Those glyphs are not figures and the engine has no reason to license them.
 *
 * Removing exactly the elements a screen reader skips is the principled line: what is left is what
 * the card actually asserts. Dropping the check instead, or widening the allowed set to admit small
 * integers, would each put the test's thumb on the scale for the number most likely to be typed in
 * by hand.
 */
const html = renderToStaticMarkup(<AssistantPanel />);
const text = html
  .replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&apos;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

describe("every number on the assistant panel came out of the insight engine", () => {
  it("renders numbers at all, so a green run is not vacuous", () => {
    expect(numericTokens(text).length).toBeGreaterThan(3);
  });

  it("licenses every one of them against the engine's own figure set", () => {
    const allowed = allowedNumbers(SAMPLE_SET);
    const unlicensed = [
      ...new Set(
        numericTokens(text).filter((token) => {
          const canonical = canonicalNumber(token);
          return canonical === null || !allowed.has(canonical);
        }),
      ),
    ];
    expect(
      unlicensed,
      "A figure on the assistant panel is not one the engine computed from the sample rows. " +
        "Either the rows changed, the engine changed, or a number was typed into the card -- and " +
        "the third is what this test exists to stop.",
    ).toEqual([]);
  });

  it("prints the engine's renderings verbatim, not a re-formatted copy", () => {
    for (const figure of SAMPLE_FIGURES) {
      expect(text).toContain(figure.value);
    }
  });
});

describe("the card shows what the engine actually returned", () => {
  it("shows a range for the top action, with both ends", () => {
    // The engine gives a range only where some contributing rows may still be restated. The sample
    // rows include one provisional row precisely so this case is the one on the page -- a card
    // that could only ever show a point estimate would not demonstrate the property the section
    // claims.
    const action = SAMPLE_SET.actions[0];
    expect(action?.impact.kind).toBe("range");
    if (action?.impact.kind === "range") {
      expect(action.impact.low).toBeLessThan(action.impact.high);
    }
    expect(text).toContain(" to ");
  });

  it("never shows a plus-or-minus band, which the engine does not produce", () => {
    // An earlier draft of this card read "give or take THB 500". An error bar is a constant
    // somebody chose, and `figures.ts` has none: its range ends are the settled rows and every row.
    expect(text).not.toMatch(/give or take|plus or minus|±/i);
  });

  it("ranks the top action above the others by what it is worth", () => {
    expect(TOP_ACTION_FLOOR).toBeGreaterThan(0);
    for (const action of SAMPLE_SET.actions.slice(1)) {
      const floor = action.impact.kind === "point" ? action.impact.value : action.impact.low;
      expect(floor).toBeLessThanOrEqual(TOP_ACTION_FLOOR);
    }
  });

  it("says which way the change went, rather than leaving a bare percentage", () => {
    // The verifier compares magnitudes, so direction has to come from the figure. A card reading
    // "34,220.00, 5.6% on the week before" tells a reader nothing about whether that is good news.
    expect(SAMPLE_FIGURES[0].change).toMatch(/^(up|down|no change)/);
  });
});
