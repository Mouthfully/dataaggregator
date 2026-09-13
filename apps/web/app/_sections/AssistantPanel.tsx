import { SAMPLE_FIGURES, TOP_ACTION_IS_RANGE } from "./_sample-brief";

/**
 * THE ASSISTANT PANEL -- the reference's `<section class="section container">` holding a single
 * `.assistant-panel`: a soft gradient panel with the assistant card on the wide side and the
 * eyebrow / heading / lead / tick list on the narrow one.
 *
 * THE PANEL GRADIENT HAS NO TOKEN. The stylesheet washes the panel with a 120deg mint-to-pale-blue
 * gradient, and the token file defines exactly two gradients -- the display text one and the hero
 * glow -- neither of which is this. Writing it would mean writing two colour literals and creating
 * a second source of truth for a surface that already has a role in the palette, so the panel takes
 * `bg-surface-inset`, the token whose documented job is "soft feature backgrounds". That is the
 * same substitution `FinalCta` makes for the reference's other gradient panel, so the page's two
 * washed panels stay the same colour as each other. Reported.
 *
 * DOM ORDER IS THE MOBILE ORDER, NOT THE DESKTOP ONE. The reference puts the card first in the
 * markup and then reorders it below its 760px breakpoint so the copy is read first on a phone.
 * Here the copy is first in the DOM -- which is the order a screen reader and a crawler get at
 * every width -- and `order` moves the card to the left column from 768px up. Same picture at both
 * widths, better linearised reading at one of them.
 *
 * THE ROW ACTIONS ARE LINKS, NOT BUTTONS. In the reference each `.task-row` ends in a
 * `<button data-task>` wired by the page's script to flip itself into the stylesheet's `:disabled`
 * "done" state. Neither that script nor any client state exists here, and a `<button>` with no
 * handler is a control that swallows a click -- the same trap `UseCases` avoids. So the two live
 * actions are links to `/dashboard`, a route that exists and is where a task would actually be
 * created, and the third row is rendered in the stylesheet's own done state as plain text, which
 * is what that `:disabled` rule was drawn for. Nothing here is interactive that cannot act.
 *
 * COLOUR SUBSTITUTIONS, all reported. The card's sparkle is a violet in the reference and there is
 * no violet anywhere in the token file, so it takes the action accent, as the feature grid's first
 * mark already does. The row chips, the quoted prompt and the foot strip are three near-identical
 * pale blue-greys one step off white; `bg-surface-subtle` is that step and covers all three. The
 * badge pill keeps its mint fill from the brand gradient colour.
 */

/**
 * Section copy, and the one part of this file that changed.
 *
 * WHAT WAS HERE AND WHY IT COULD NOT STAY. The eyebrow read "Your AI-powered analyst", the tick
 * list opened on "AI-powered analysis", and the card's quoted line was "Here are 3 ways to grow
 * your business this month:" above three invented task rows. There was no generation code anywhere
 * in `apps/` or `packages/` behind any of it, and `docs/marketplane/58-plan-reconciliation.md`
 * section 5.1 separately flags that this block and `FeatureGrid.tsx` rendered byte-identical
 * eyebrow, heading and lead. The grid took the four capabilities; this panel takes the engine.
 *
 * WHAT IT SAYS NOW. The one rule the insight engine is built on: the model writes language and
 * never arithmetic. Deltas, shares, rankings and impact estimates are computed in TypeScript from
 * the tenant's own `envelope_rows`, handed to the model as given facts, and the model is asked only
 * to phrase them. A figure in the output that cannot be matched back to one of those computed
 * values refuses the whole insight rather than being stripped, rounded to something true or
 * regenerated with a sterner prompt -- because a repaired insight is one whose text no longer
 * matches the reasoning that produced it.
 *
 * THE PANEL IS NOT REDRAWN. Same gradient panel, same card, same tick list, same three numbered
 * rows, same `TASKS` shape, same JSX. Only the strings moved, and the rows are shaped so the real
 * computed figures can be wired straight into them.
 *
 * THE BADGE SAYS "SAMPLE" AND NOT "BETA". "Beta" claims a thing exists and is early; the figures in
 * this card are illustrations and nothing generates them yet, which is what section 5.3 requires
 * to be labelled rather than implied.
 *
 * Every line lives in a constant because `scripts/check-copy.mjs` refuses a sentence typed into the
 * JSX. The eyebrow is stored in sentence case because the capitals are CSS.
 */
const EYEBROW = "How an insight is made";

/** The break inside the heading is the design's, so the two lines are two values. */
const HEADING_TOP = "It writes the sentence.";
const HEADING_BOTTOM = "Never the number.";

const LEAD =
  "Every figure is computed from your own rows before a model sees it, then handed over as a fact to phrase. An insight that cites a number your data does not contain is refused, not rewritten into one that is true.";

/** The four ticks, in the reference's order. Fragments, so they carry no terminal punctuation. */
const BENEFITS = [
  "Every figure computed from your own rows",
  "Ranked by what each one is worth",
  "A range wherever a platform may still restate it",
  "An untraceable number refuses the whole insight",
] as const;

/** The card's own copy. */
const CARD_TITLE = "Insight engine";
const CARD_BADGE = "Sample";
const CARD_PROMPT = "Three figures behind this week's list, each traced back to a row:";
const CARD_FOOT =
  "Each figure carries the time it was fetched and a marker while the platform may still change it.";

/** The row action, in its two states. The reference's script writes the second one at runtime. */
const ACTION_LABEL = "See the source";
// The reference ships THREE identical, enabled "Create task" affordances; `.task-row
// button:disabled` is a runtime state produced by a click handler, never a delivered one. An
// earlier draft rendered the third row pre-completed with the label "Task created" -- a string that
// appears nowhere in any supplied file. It was authored, not transcribed, so it is gone.
//
// The label is now "See the source" rather than "Create task": every row is a FIGURE with a
// provenance, the link goes to /dashboard, and /dashboard's envelope table is the one surface in
// this repository that really does show a row's source and the time it was read.

/** Names the list for assistive tech, which otherwise hears three bare numbers. */
const TASKS_LABEL = "Figures behind this week's list";

/**
 * The third row's caption, in the two shapes the engine can return. Which one renders is the
 * engine's answer and not an editorial choice: `buildFigureSet` gives a range only where some
 * contributing rows may still be restated, so a caption that promised a range unconditionally
 * would be wrong on exactly the days the distinction matters.
 */
const RANGE_DETAIL = "A range, because some of the rows behind it may still be restated.";
const POINT_DETAIL = "A single figure, because every row behind it is settled.";

/**
 * THE THREE ROWS, AND THE ONE THING THAT MAKES THIS SECTION HONEST.
 *
 * The panel's heading says the product computes every figure before a model sees it. Typing three
 * illustrative numbers into the card directly underneath that sentence would be the same class of
 * thing the section argues against -- a claim about arithmetic with no arithmetic behind it. So
 * `title` is assembled from figures `@repo/insights` computed at build time, by `buildFigureSet`,
 * the function that will compute a real customer's. See `_sample-brief.ts`, which also explains
 * what that does and does not prove.
 *
 * WHAT CHANGED AND WHY IT HAD TO. An earlier draft of this row read "Worth about THB 3,100 a
 * month, give or take THB 500" -- a plus-or-minus band. The engine does not produce one and will
 * not: an error bar is a constant somebody chose, and `figures.ts` has none. Its range is the
 * settled rows at one end and every row at the other, which is the amount the platform can still
 * restate, measured rather than assumed. The card now prints whatever shape the engine actually
 * returned, so the copy cannot describe a behaviour the code does not have.
 *
 * THE SHAPE IS UNCHANGED -- `{ title, detail }`, three rows, same JSX. `detail` stays authored
 * copy, because it says what KIND of arithmetic produced the figure rather than restating it.
 */
const TASKS = [
  {
    title: `${SAMPLE_FIGURES[0].label} ${SAMPLE_FIGURES[0].value}, ${SAMPLE_FIGURES[0].change} on the week before`,
    detail: "Both totals summed from the rows; the difference computed in code, not written.",
  },
  {
    title: `${SAMPLE_FIGURES[1].label} ${SAMPLE_FIGURES[1].value}`,
    detail: "A share of a total taken from the same rows, so the parts add up.",
  },
  {
    title: `${SAMPLE_FIGURES[2].label} ${SAMPLE_FIGURES[2].value}`,
    detail: TOP_ACTION_IS_RANGE ? RANGE_DETAIL : POINT_DETAIL,
  },
] as const;

export function AssistantPanel() {
  return (
    <section
      aria-labelledby="assistant-heading"
      className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
    >
      {/* 1.2fr / 1fr from 768px, the reference's own split, with `minmax(0,...)` on both tracks so
          a long task title cannot push the card wider than its column. */}
      <div className="bg-surface-inset grid items-center gap-[30px] rounded-xl p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:p-8 lg:gap-[50px] lg:p-[42px]">
        <div className="min-w-0 md:order-2">
          <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
            {EYEBROW}
          </span>
          <h2
            id="assistant-heading"
            className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-[36px]"
          >
            {HEADING_TOP}
            <br />
            {HEADING_BOTTOM}
          </h2>
          <p className="text-ink-muted mt-5 max-w-[475px] leading-[1.65]">{LEAD}</p>

          <ul className="mt-6 list-none p-0">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="text-ink-muted my-[9px] flex items-baseline gap-2">
                {/* Decorative: the list already reads as a list, so the mark is not announced. */}
                <span aria-hidden="true" className="text-brand-mint font-bold">
                  &#10003;
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* The reference's soft card lift, geometry only -- the tint comes from the hairline token,
            which is how the feature grid keeps its shadow out of the literal ban. */}
        <div className="border-line-soft bg-surface min-w-0 rounded-lg border p-[18px] shadow-[0_10px_30px] shadow-line-soft md:order-1 md:p-6">
          <h3 className="font-display text-ink flex items-center gap-2 text-[15px] font-semibold md:text-base">
            <span aria-hidden="true" className="text-accent text-2xl leading-none md:text-[28px]">
              &#10022;
            </span>
            {CARD_TITLE}
            <span className="bg-brand-mint text-ink-on-accent rounded-sm px-[5px] py-[3px] text-[10px] font-bold">
              {CARD_BADGE}
            </span>
          </h3>

          {/* The assistant's own line, set as an inset chip rather than body copy: it is a quoted
              machine utterance, and the ground is what says so. */}
          <p className="bg-surface-subtle text-ink-muted my-3.5 rounded-sm p-2.5 text-xs leading-[1.55]">
            {CARD_PROMPT}
          </p>

          <ol aria-label={TASKS_LABEL} className="list-none p-0">
            {TASKS.map((task, index) => (
              <li key={task.title} className="my-[18px] flex items-center gap-2.5">
                {/* The numeral is the list marker made visible, so it is not read out twice. */}
                <span
                  aria-hidden="true"
                  className="bg-accent text-ink-on-accent flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <strong className="text-ink block text-xs [overflow-wrap:anywhere]">
                    {task.title}
                  </strong>
                  <span className="text-ink-subtle mt-1 block text-[10px] leading-[1.4]">
                    {task.detail}
                  </span>
                </div>

                <a
                  href="/dashboard"
                  className="border-line bg-surface-subtle text-accent hover:bg-surface shrink-0 rounded-sm border p-1.5 text-[10px] font-bold whitespace-nowrap transition-colors"
                >
                  {ACTION_LABEL}
                  {/* The row title is the only thing distinguishing three identical labels, so it
                      is attached to the link rather than left to visual proximity. */}
                  <span className="sr-only"> &mdash; {task.title}</span>
                </a>
              </li>
            ))}
          </ol>

          <p className="bg-surface-subtle text-ink-subtle mt-0 rounded-sm p-3 text-[11px] leading-[1.5]">
            {CARD_FOOT}
          </p>
        </div>
      </div>
    </section>
  );
}
