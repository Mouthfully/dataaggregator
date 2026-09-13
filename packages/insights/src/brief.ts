/**
 * THE PROMPT. A deterministic render of a figure set, and the shape the answer must come back in.
 *
 * SAME INPUT, SAME BYTES. Nothing in this module reads a clock, a locale, a random source or an
 * environment variable, and every list it prints is ordered by something total. That matters for
 * three separate reasons and only the first is obvious:
 *
 *   1. With `temperature: 0` upstream, a reproducible prompt is what makes an insight
 *      reproducible -- and therefore auditable after the fact.
 *   2. A test can assert the property. `renderUserPrompt(set) === renderUserPrompt(set)` is a weak
 *      claim; `renderUserPrompt` of two independently built sets over the same rows being
 *      byte-identical is a strong one, and it is the one the test makes.
 *   3. A prompt that varies is a prompt nobody can diff when an answer goes wrong.
 *
 * NO TENANT FREE TEXT IN THE SYSTEM PROMPT, and none in the user prompt either. The system prompt
 * is a module constant -- it cannot carry customer data, because no customer data is in scope where
 * it is defined. The user prompt is assembled only from figures this codebase computed, fixed
 * labels written here, and source ids that are dictionary enum members. A workspace name, an entity
 * name, a campaign title or an order id has no path into either string: `InsightRow` does not carry
 * the first two at all, and the other two are never printed. That is a property of the types, not a
 * convention, and there is a test that reads the rendered prompt back looking for it.
 *
 * THE MODEL IS TOLD, IN THE PROMPT, WHAT THE GATE WILL DO. Not because saying so makes it true --
 * `verify.ts` is what makes it true -- but because a model that knows a fabricated figure will be
 * refused writes around the figures it was given instead of reaching for a plausible one. The
 * instruction reduces refusals; it is not what prevents fabrication.
 */

import { type Figure, type FigureSet, type RankedAction, leadingMetrics } from "./figures.ts";

/* ==============================================================================================
 * THE SYSTEM PROMPT
 * ============================================================================================== */

/**
 * Fixed instructions. A module constant with no parameters, so there is no signature through which
 * tenant data could reach it.
 */
export const SYSTEM_PROMPT = [
  "You write the morning brief for the owner of a small business.",
  "",
  "You are given a closed set of figures that have already been computed from the owner's own",
  "data. Your job is to phrase them. It is not to calculate.",
  "",
  "RULES, in order of how badly breaking them ends:",
  "",
  "1. Every quantity you write must be copied exactly from the figures given to you. Do not add,",
  "   subtract, average, convert, round, rescale or otherwise derive a number. If a number you",
  "   want is not in the list, write the sentence without it.",
  "2. Write quantities as digits, exactly as they appear in the figures. Never spell a quantity",
  "   out as a word.",
  "3. A figure marked as not reported is not zero. Say it was not reported, or leave it out.",
  "   Never state or imply a value for it.",
  "4. Do not reorder, add to or remove from the action list. It is already ordered by value.",
  "5. Do not name a competitor, a rival, an app ranking or a price cut, and do not describe",
  "   anything as automatic or done on the owner's behalf. The product reads; it never writes.",
  "6. Plain language. Short sentences. No preamble, no sign-off, no encouragement.",
  "",
  "Every number you write is checked against the figures you were given. A number that cannot be",
  "traced to them causes the entire brief to be discarded, not corrected.",
].join("\n");

/* ==============================================================================================
 * THE USER PROMPT
 * ============================================================================================== */

const RULE = "-".repeat(78);

export function renderUserPrompt(set: FigureSet): string {
  const lines: string[] = [];

  lines.push(`Business type: ${set.business}`);
  lines.push(`Currency of every figure below: ${set.currency}`);
  lines.push(`Timezone the dates are in: ${set.timezone}`);
  lines.push(`Period measured: ${set.period.from} to ${set.period.to}`);
  lines.push(`Compared against: ${set.comparison.from} to ${set.comparison.to}`);
  if (set.allProvisional) {
    // The permanently-provisional case, in words rather than as a flag nobody explains. For a POS
    // reading a merchant's own database nothing ever finalises, so this is not a transient state
    // and a brief that implied otherwise would be wrong every single morning.
    lines.push(
      "Every figure below may still be restated by the platform that reported it. Say so once,",
    );
    lines.push("in the summary, in plain words.");
  }
  lines.push("");

  lines.push("FIGURES. These are the only numbers you may write.");
  lines.push(RULE);
  for (const figure of orderFigures(set)) lines.push(renderFigure(figure));
  lines.push("");

  lines.push("ACTIONS, already ordered by what each is worth, biggest first.");
  lines.push(RULE);
  if (set.actions.length === 0) {
    lines.push("None. The figures raise nothing worth acting on, so write no action.");
  } else {
    for (const action of set.actions) lines.push(renderAction(action));
  }
  lines.push("");

  lines.push("WRITE:");
  lines.push(RULE);
  lines.push("summary  three short lines covering the period just measured.");
  lines.push("unusual  one line naming anything that stands out, or null if nothing does.");
  lines.push(
    "action   the first action above, phrased as something to do today, or null if there are none.",
  );

  return lines.join("\n");
}

/**
 * Figures in a stable, meaningful order: the ones this business type leads with first, then
 * everything else, and within a metric its own total before its comparison and its change.
 *
 * The ordering is by `id` within each group, which is total, so two sets built from the same rows
 * print in the same order however the rows arrived.
 */
function orderFigures(set: FigureSet): readonly Figure[] {
  const order = leadingMetrics(set.business);
  const weight = (figure: Figure): number => {
    for (const [index, name] of order.entries()) {
      if (figure.id === `metric.${name}` || figure.id.startsWith(`metric.${name}.`)) return index;
    }
    if (figure.kind === "date" || figure.id === "period.days") return -1;
    return order.length;
  };
  return [...set.figures].sort((a, b) => weight(a) - weight(b) || a.id.localeCompare(b.id));
}

/**
 * THE FETCH TIME IS NOT IN THE PROMPT, AND THAT IS DELIBERATE.
 *
 * Every figure carries `fetchedAt`, and "every figure links to its source and the time it was
 * fetched" is a promise the product keeps -- but the SURFACE renders it, from the figure set,
 * rather than the model writing it into a sentence. The reason is arithmetic: "2026-09-07T23:30:00Z"
 * is six numeric tokens, and licensing them would put 23, 30 and 0 into the allowed set for every
 * brief. A model that then wrote "takings are up 23%" would sail through a gate that had allowed
 * that number for an unrelated reason.
 *
 * So the timestamp reaches the reader through code that cannot invent it, and the gate stays tight
 * around the figures the brief is actually about. The source id is printed, because a model naming
 * where a figure came from is exactly what should be encouraged.
 */
function renderFigure(figure: Figure): string {
  const marks: string[] = [];
  if (figure.provisional) marks.push("may still be restated");
  if (figure.sources.length > 0) marks.push(`from ${figure.sources.join(", ")}`);
  const suffix = marks.length === 0 ? "" : `  [${marks.join("; ")}]`;
  return `  ${figure.label}: ${figure.text}${suffix}`;
}

function renderAction(action: RankedAction): string {
  const where = action.source === null ? "" : ` on ${action.source}`;
  const worth =
    action.impact.kind === "range"
      ? `worth ${action.impactFigure.text} (a range, because some rows may still be restated)`
      : `worth ${action.impactFigure.text}`;
  const evidence =
    action.evidence.length === 0 ? "" : `; evidence: ${[...action.evidence].sort().join(", ")}`;
  return `  ${action.rank}. ${ACTION_SUBJECTS[action.kind]}${where}, ${worth}${evidence}`;
}

/**
 * What each detector found, in words. The model turns this into a sentence an owner can act on; it
 * does not decide what was found.
 */
const ACTION_SUBJECTS: Readonly<Record<RankedAction["kind"], string>> = {
  channel_decline: "takings fell against the previous period",
  commission_load: "commission taken by the platform",
  spend_without_return: "advertising spend rose while what it returned did not",
  weekday_gap: "one weekday takes less than the best one",
};

/* ==============================================================================================
 * THE ANSWER'S SHAPE
 * ============================================================================================== */

export interface ModelInsight {
  /** Three short lines. The count is fixed by the schema and re-checked by the verifier. */
  readonly summary: readonly string[];
  readonly unusual: string | null;
  readonly action: { readonly title: string; readonly why: string } | null;
}

export const SUMMARY_LINES = 3;

/**
 * The JSON schema sent as `response_format`.
 *
 * A schema rather than free prose for two reasons. It makes the answer parseable without guessing,
 * and it bounds what the model can write at all -- a field that does not exist cannot carry a
 * sentence nobody asked for. `additionalProperties: false` is doing real work: without it a model
 * may return an extra field carrying a figure, and a field the verifier does not know to read is a
 * number that never reaches the gate.
 */
export const INSIGHT_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "morning_brief",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "unusual", "action"],
      properties: {
        summary: {
          type: "array",
          minItems: SUMMARY_LINES,
          maxItems: SUMMARY_LINES,
          items: { type: "string" },
        },
        unusual: { type: ["string", "null"] },
        action: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["title", "why"],
          properties: {
            title: { type: "string" },
            why: { type: "string" },
          },
        },
      },
    },
  },
} as const;

/** Every string the model wrote, in a stable order, for the verifier to walk. */
export function textOf(insight: ModelInsight): readonly string[] {
  const out = [...insight.summary];
  if (insight.unusual !== null) out.push(insight.unusual);
  if (insight.action !== null) out.push(insight.action.title, insight.action.why);
  return out;
}
