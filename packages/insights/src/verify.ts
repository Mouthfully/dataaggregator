/**
 * THE GATE.
 *
 * Every numeric token the model wrote is extracted and matched against the closed set of figures
 * `figures.ts` computed. One that does not match REFUSES THE WHOLE INSIGHT.
 *
 * IT IS NOT STRIPPED, NOT ROUNDED TO SOMETHING TRUE, AND NOT REGENERATED WITH A STERNER PROMPT.
 * That is the decision this module exists to hold, and each of the three alternatives is worse than
 * it looks:
 *
 *   STRIPPING leaves a sentence whose remaining words still assert the figure that was removed --
 *   "revenue is up sharply on last week" is the same claim with the evidence deleted.
 *   ROUNDING TO A NEARBY TRUE FIGURE produces text that no longer matches the reasoning that
 *   produced it. The words were written about the invented number; swapping the digits underneath
 *   them makes the sentence a forgery rather than a mistake.
 *   RETRYING is the most tempting and the worst. A model that fabricated once will fabricate
 *   differently, and a loop that retries until the gate passes is a loop selecting for outputs that
 *   happen to slip past the gate.
 *
 * A refusal is cheap. The owner gets no brief this morning and an operator gets an alert. A
 * plausible invented number is the failure this product is sold against, and it is not cheap at
 * all: it is indistinguishable from a correct brief right up until someone acts on it.
 *
 * WHAT THIS GATE DOES NOT CATCH, stated here rather than discovered later:
 *
 *   * DIRECTION. Matching is on magnitude, so "up 9%" where the data fell 9% passes the number
 *     check. The prompt states the direction and the figure labels carry it; a wrong direction is a
 *     language error this gate is not built to find.
 *   * A TRUE NUMBER IN A FALSE SENTENCE. "Commission was THB 4,000" passes if THB 4,000 is some
 *     figure in the set, even if it is a different figure's. Binding each number to its own claim
 *     needs the model to cite figure ids, which is the next thing to build here.
 *   * QUANTITIES WRITTEN AS WORDS. Handled separately below, by refusing them outright rather than
 *     by trying to parse them.
 */

import { FORBIDDEN_CLAIMS } from "@repo/brand";

import { type ModelInsight, SUMMARY_LINES, textOf } from "./brief.ts";
import { type FigureSet, allowedNumbers, canonicalNumber } from "./figures.ts";

export type RefusalCode =
  | "malformed_output"
  | "wrong_shape"
  | "empty_output"
  | "unverifiable_number"
  | "spelled_quantity"
  | "forbidden_claim";

export type Verdict =
  | { readonly ok: true; readonly insight: ModelInsight }
  | {
      readonly ok: false;
      readonly code: RefusalCode;
      readonly detail: string;
      /** The offending fragment, for the operator alert. Never shown to a customer. */
      readonly offending?: string;
    };

/**
 * QUANTITIES SPELLED OUT AS WORDS, which the numeric scan cannot see.
 *
 * The prompt requires digits, so a word here is already an instruction ignored. Refusing is
 * cheaper and more honest than parsing English numerals and then having to decide whether "a
 * couple" rounds to two.
 *
 * "ONE" IS DELIBERATELY ABSENT, and this is the one judgement call in the list. The product's own
 * central sentence is "one thing worth doing today", and an owner reading "1 thing worth doing
 * today" is reading a machine. A magnitude of one also asserts almost nothing worth acting on
 * wrongly. The cost is that "orders fell by one" would pass this check; that is accepted, written
 * down, and the reason this list is a named constant a reader can argue with.
 *
 * "third" and "quarter" are absent too, for the opposite reason: both are far more often an
 * ordinal or a calendar quarter than a fraction, and a guard that refuses true briefs gets turned
 * off.
 */
export const SPELLED_QUANTITIES = [
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "dozen",
  "half",
  "halved",
  "double",
  "doubled",
  "triple",
  "tripled",
  "twice",
  "thrice",
  "tenfold",
] as const;

const SPELLED_RE = new RegExp(`\\b(${SPELLED_QUANTITIES.join("|")})\\b`, "i");

/**
 * Every numeric token in a string.
 *
 * A digit run, with grouping separators and an optional decimal part. Deliberately sign-blind: the
 * canonical form is a magnitude (see `canonicalNumber`), and a regex that tried to own the minus
 * sign would have to decide whether the hyphen in "2026-09-12" is one.
 *
 * That date is the reason the pattern is this shape rather than smarter. "2026-09-12" yields 2026,
 * 09 and 12 -- three numbers, each of which the date figure licenses -- so a written date is
 * checked rather than waved through, and no special case is needed to do it.
 */
const NUMBER_RE = /\d[\d,_]*(?:\.\d+)?/g;

export function numericTokens(text: string): readonly string[] {
  return text.match(NUMBER_RE) ?? [];
}

/**
 * Check one model answer against one figure set.
 *
 * `raw` is the completion's content, unparsed, because the parse is itself a thing that can fail
 * and a caller that parsed first would have to invent its own refusal for that.
 */
export function verifyInsight(raw: string, set: FigureSet): Verdict {
  if (raw.trim() === "") {
    return { ok: false, code: "empty_output", detail: "the model returned nothing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      code: "malformed_output",
      detail: "the completion was not JSON, though a JSON schema was requested",
    };
  }

  const insight = asInsight(parsed);
  if (insight === null) {
    return {
      ok: false,
      code: "wrong_shape",
      detail: `expected ${SUMMARY_LINES} summary lines, a nullable unusual line and a nullable action`,
    };
  }

  const allowed = allowedNumbers(set);

  for (const text of textOf(insight)) {
    const claim = FORBIDDEN_CLAIMS.find((entry) => entry.pattern.test(text));
    if (claim !== undefined) {
      return {
        ok: false,
        code: "forbidden_claim",
        detail: claim.reason,
        offending: text,
      };
    }

    const spelled = SPELLED_RE.exec(text);
    if (spelled !== null) {
      return {
        ok: false,
        code: "spelled_quantity",
        detail:
          `"${spelled[0]}" is a quantity written as a word, so it cannot be checked against the ` +
          "figures. The prompt requires digits.",
        offending: text,
      };
    }

    for (const token of numericTokens(text)) {
      const canonical = canonicalNumber(token);
      if (canonical === null || !allowed.has(canonical)) {
        return {
          ok: false,
          code: "unverifiable_number",
          detail:
            `"${token}" is not any figure in the input set. The insight is refused whole rather ` +
            "than repaired: a corrected number would no longer match the sentence written around it.",
          offending: text,
        };
      }
    }
  }

  return { ok: true, insight };
}

/** Structural validation of the parsed completion. Returns null rather than throwing or coercing. */
function asInsight(value: unknown): ModelInsight | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const summary = record.summary;
  if (!Array.isArray(summary) || summary.length !== SUMMARY_LINES) return null;
  if (!summary.every((line): line is string => typeof line === "string")) return null;

  const unusual = record.unusual;
  if (unusual !== null && typeof unusual !== "string") return null;

  const action = record.action;
  if (action === null || action === undefined) {
    return { summary, unusual: unusual ?? null, action: null };
  }
  if (typeof action !== "object" || Array.isArray(action)) return null;
  const actionRecord = action as Record<string, unknown>;
  if (typeof actionRecord.title !== "string" || typeof actionRecord.why !== "string") return null;

  return {
    summary,
    unusual: unusual ?? null,
    action: { title: actionRecord.title, why: actionRecord.why },
  };
}
