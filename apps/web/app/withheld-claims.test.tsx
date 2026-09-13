import { CLAIMS, withheldClaims } from "@repo/brand";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Page from "./page";

/**
 * THE HOLE IN THE CLAIMS GATE, MADE MACHINE-CHECKABLE.
 *
 * `claims.ts` withholds a claim whose supporting capability has not launched, and `claim()` throws
 * rather than returning a fallback. That gate is real and it is tested in `packages/brand`. It has
 * one hole, and issue #49 names it precisely:
 *
 *   > `surface:answer` is declared in `CAPABILITY_IDS` ... and is deliberately absent from
 *   > `AVAILABLE_CAPABILITIES`, so the guard correctly withholds *claims* -- but hand-written
 *   > section copy is not a claim and renders anyway.
 *
 * A withheld claim rewritten as section copy renders exactly like an approved one, satisfies every
 * existing test, and republishes a promise the repository deliberately switched off. It is the same
 * failure `scripts/check-copy.mjs` exists for one level up, and the same one `FaqCta.tsx` already
 * carries a comment about: an answer that restated three claims `/pricing` had just dropped, one
 * section below the block that dropped them.
 *
 * THIS TEST IS THE OTHER HALF. For every claim `withheldClaims()` reports, it takes the claim's own
 * distinctive word sequences and asserts that none of them appears in the rendered page.
 *
 * WHY FIVE-WORD SEQUENCES, AND WHY "DISTINCTIVE". Fewer words and ordinary English trips it --
 * "your own numbers and the" is a phrase any honest sentence might reach for. More words and a
 * paraphrase walks straight through. Five is the same floor `check-copy.mjs` measured for the same
 * corpus and for the same reason: it is the length of the shortest approved claim.
 *
 * "Distinctive" means the sequence does not also occur in a claim that IS allowed to render. A
 * withheld claim and an allowed one can legitimately share a phrase, and a guard that fired on the
 * overlap would be telling the page not to say something it is explicitly permitted to say.
 *
 * WHAT THIS DOES NOT CATCH, stated rather than implied: a paraphrase that shares no five-word run
 * with the claim it is paraphrasing. This is a tripwire on the cheapest and commonest way the gate
 * gets routed around -- somebody reading the withheld claim and typing it into a section -- not a
 * semantic check. It fails in the direction of under-firing, which is the only direction a
 * heuristic guard may fail in if it is to stay switched on.
 */

const html = renderToStaticMarkup(<Page />);
const pageText = normalise(
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&"),
);

/** Lowercase, punctuation-free, single-spaced -- so "ruled out, and" and "ruled out and" match. */
function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const RUN_LENGTH = 5;

function runs(text: string): string[] {
  const words = normalise(text).trim().split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + RUN_LENGTH <= words.length; i += 1) {
    out.push(words.slice(i, i + RUN_LENGTH).join(" "));
  }
  return out;
}

const withheld = withheldClaims();

/**
 * Every five-word run that occurs in a claim the page IS allowed to make.
 *
 * `withheldClaims()` reports what is held back; everything else in `CLAIMS` is publishable, so a
 * run shared with one of those is not evidence of anything and must not fire.
 */
const heldIds = new Set(withheld.map((entry) => entry.claim.id));
const allowedRuns = new Set(
  CLAIMS.filter((entry) => !heldIds.has(entry.id)).flatMap((entry) => runs(entry.text)),
);

describe("a withheld claim cannot reach the page as section copy", () => {
  it("has claims to check, so a green run means something", () => {
    // If `AVAILABLE_CAPABILITIES` ever turned everything on, this file would pass by having
    // nothing to do. Better to fail loudly and delete it deliberately.
    expect(withheld.length).toBeGreaterThan(0);
  });

  it.each(withheld.map((entry) => [entry.claim.id, entry] as const))(
    "does not republish the withheld claim %s",
    (_id, entry) => {
      const distinctive = runs(entry.claim.text).filter((run) => !allowedRuns.has(run));
      const found = distinctive.filter((run) => pageText.includes(` ${run} `));
      expect(
        found,
        `The page carries wording from the withheld claim "${entry.claim.id}" ` +
          `(${entry.missingCapabilities.join(", ") || entry.missing.join(", ")} has not launched). ` +
          "Rewriting a withheld claim as section copy routes around the capability gate. " +
          "Either reword the section, or launch the capability and add it to AVAILABLE_CAPABILITIES.",
      ).toEqual([]);
    },
  );
});
