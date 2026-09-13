/**
 * THE CAPABILITY GRID -- the reference's `<section class="section container">` that used to be
 * headed "From insights to impact.", keeping its geometry and taking a new job. See the second
 * block below for why the copy moved.
 *
 * WHAT THE REFERENCE PUTS HERE, AND WHY THIS IS A CARD GRID INSTEAD. In the supplied page this
 * section is a split: a mocked assistant panel on the left, and on the right the eyebrow, heading,
 * lead and a four-item tick list. This file keeps that ARRANGEMENT and promotes the tick
 * list into the 2x2 `.feature-card` grid the section was briefed as -- same card geometry as the
 * grid one section up (24px padding, 16px radius, hairline border, one soft shadow), so the two
 * sections read as one family rather than as two unrelated treatments.
 *
 * THE GRID SITS ON THE LEFT AT DESKTOP, which is the reference's alternation: the section above
 * leads with copy, this one leads with the visual. The copy block is nevertheless FIRST IN THE
 * DOM and moved with `order`, so the h2 is announced before the four h3s beneath it and the mobile
 * stack reads heading-then-cards. Reproducing the reference's DOM order instead would put four
 * subheadings ahead of the heading they belong to.
 *
 * COLOUR. The reference tints each icon with a one-off hue (its c0/c1/c2/c3 classes) -- values
 * that are not in the token set, though three of them sit within a few percent of tokens that are.
 * Each card therefore names a token role: brand mint and brand blue for the two that map almost
 * exactly, the action accent for the rest. c0's violet has no counterpart anywhere in the brand
 * guide and is NOT reproduced -- inventing a fifth brand hue to match one icon would put a colour
 * outside the token file, which is the thing the guard exists to prevent.
 *
 * THE CARD SHADOW keeps the reference's geometry (0 7px 24px) but takes its colour from
 * `shadow-line-soft` rather than from the reference's fixed slate wash. Tailwind splits those two
 * halves -- the arbitrary value carries offset and blur, the colour utility fills
 * `--tw-shadow-color` -- so the soft-hairline token tints it and the shadow follows the palette
 * into dark mode instead of staying a light-mode value forever.
 */

/**
 * WHAT THIS SECTION IS NOW, AND WHY IT HAD TO CHANGE.
 *
 * It used to render the eyebrow, heading and lead of `AssistantPanel.tsx` BYTE FOR BYTE -- same
 * "Your AI-powered analyst", same "From insights / to impact.", same lead.
 * `docs/marketplane/58-plan-reconciliation.md` section 5.1 lists that duplication as copy that
 * must stop: "one of them is redundant on any positioning". Rather than delete a section the
 * design needs, this one takes the job the page was missing -- naming the four capabilities the
 * founder's plan is made of -- and the assistant panel keeps the engine.
 *
 * EVERY CARD ENDS IN A DECISION, NOT A VISUALISATION. That is the whole repositioning: the site
 * sold a dashboard, the plan sells being told what to do. So no card body describes a chart, a
 * view or a report you read; each says what arrives and what you do about it.
 */

/**
 * Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line
 * arrives from here. The eyebrow is stored in sentence case because the capitals are CSS.
 */
const EYEBROW = "What arrives, and when";

/** The heading's line break is the design's, so its two lines are two values. */
const HEADING_TOP = "Four things that end";
const HEADING_BOTTOM = "in a decision.";

const LEAD =
  "None of them hands you a chart to interpret. Yesterday in three lines at breakfast, a ranked list on Monday, a plain answer whenever you ask, and the report your bank or your accountant wants on the first.";

/**
 * The four capabilities, in the order the founder's plan lists them and the order an owner meets
 * them: the brief arrives before the sheet, the sheet before the question, the question before the
 * month-end report.
 *
 * `title` and `body` are the plan's own descriptions of each capability, compressed. THREE OF THE
 * FOUR DO NOT EXIST YET -- there is no brief generator, no action sheet and no Ask in `apps/` or
 * `packages/` -- which is why the accompanying design note records each of these four bodies as a
 * claim written ahead of its capability rather than leaving them to be discovered later.
 *
 * `path` is a 24-box outline mark on the same 1.7 stroke as the reference's icon set, and
 * deliberately not one of the four marks the section above already spends: repeating those here
 * would make two adjacent grids look like the same grid twice.
 */
const CARDS = [
  {
    id: "brief",
    title: "Morning brief",
    body: "Yesterday in three lines, anything unusual, and one thing worth doing today. Reply to ask a follow-up, in Thai or English.",
    tone: "text-accent",
    path: "M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9 12 3.5ZM19 3v3m1.5-1.5h-3",
  },
  {
    id: "actions",
    title: "Action sheet",
    body: "A short weekly list, ordered by what each item is worth. The following week it checks whether each one worked.",
    tone: "text-brand-mint",
    path: "M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3m-6 0a3 3 0 0 1 6 0m-6 0h6m-6.5 9.5 2 2 4-4.5",
  },
  {
    id: "ask",
    title: "Ask",
    // THE WORDING HERE IS CONSTRAINED BY A GUARD, not by taste. An earlier draft read "Causes
    // ranked by how much of the change they explain, what was ruled out, and where each figure
    // came from" -- which is the `diagnose` claim in `claims.ts` rewritten as section copy, and
    // that claim is WITHHELD behind `surface:diagnose`. `withheld-claims.test.tsx` caught it on
    // the five-word run "what was ruled out and". Restating a withheld claim as prose routes
    // around the capability gate, which is the exact mechanism issue #49 names. So this card
    // promises the question and the provenance -- `fetched_at` is a real envelope column that
    // `/dashboard` already renders -- and not the ranked causes, which are still switched off.
    body: "Ask a question the way you would ask a business partner. Every figure in the answer says which source it came from and when it was read.",
    tone: "text-brand-blue",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.2-11a2.2 2.2 0 1 1 3 2.05V14m-.8 3h.01",
  },
  {
    id: "reports",
    title: "Consolidated reports",
    body: "The monthly investor update, the P&L by unit and channel, the bank loan pack and the accountant export, from one set of numbers.",
    tone: "text-accent",
    path: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6m-6 4h4",
  },
] as const;

export function FeatureGrid() {
  return (
    <section
      aria-labelledby="feature-grid-heading"
      className="mx-auto grid max-w-[1200px] items-center gap-8 px-8 py-12 md:grid-cols-2 md:gap-16 md:py-20"
    >
      <div className="md:order-2">
        <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
          {EYEBROW}
        </span>
        <h2
          id="feature-grid-heading"
          className="font-display text-ink mt-[10px] text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:mt-[18px] md:text-[36px]"
        >
          {HEADING_TOP}
          <br />
          {HEADING_BOTTOM}
        </h2>
        <p className="text-ink-muted mt-5 max-w-[475px] leading-[1.65]">{LEAD}</p>
      </div>

      {/* Two columns from 640px up. Below that the reference goes single-column: a 2x2 of 20px-
          padded cards on a phone leaves the body copy three words to a line. */}
      <ul className="grid gap-4 sm:grid-cols-2 md:order-1">
        {CARDS.map((card) => (
          <li
            key={card.id}
            className="border-line-soft bg-surface rounded-lg border p-5 shadow-[0_7px_24px] shadow-line-soft md:p-6"
          >
            {/* Decorative: the title beside it carries the meaning, so the mark is hidden rather
                than labelled, which would make a screen reader announce each card twice. */}
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`mb-[18px] block ${card.tone}`}
            >
              <path d={card.path} />
            </svg>
            <h3 className="font-display text-ink mb-2 text-lg leading-[1.3] font-semibold tracking-[-0.01em]">
              {card.title}
            </h3>
            <p className="text-ink-muted text-sm leading-[1.55]">{card.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
