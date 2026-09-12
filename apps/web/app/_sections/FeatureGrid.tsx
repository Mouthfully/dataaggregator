/**
 * THE FEATURE GRID -- the reference's `<section class="section container">` headed "From insights
 * to impact.", the one whose eyebrow reads as the analyst pitch.
 *
 * WHAT THE REFERENCE PUTS HERE, AND WHY THIS IS A CARD GRID INSTEAD. In the supplied page this
 * section is a split: a mocked assistant panel on the left, and on the right the eyebrow, heading,
 * lead and a four-item tick list. This file keeps every word of that copy and promotes the tick
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
 * Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line
 * arrives from here. The eyebrow is stored in sentence case because the capitals are CSS.
 */
const EYEBROW = "Your AI-powered analyst";

/** The heading's line break is the design's, so its two lines are two values. */
const HEADING_TOP = "From insights";
const HEADING_BOTTOM = "to impact.";

const LEAD =
  "Get personalized recommendations, turn them into tasks, and keep your business moving forward.";

/**
 * The four cards, in the reference's order.
 *
 * `title` is verbatim from the reference's tick list. `body` is NOT in the reference -- a tick list
 * has no body copy -- so each one restates something this section's own heading, lead or tick item
 * already says, and claims nothing further. No card promises a capability the supplied page does
 * not already promise on this screen.
 *
 * `path` is a 24-box outline mark on the same 1.7 stroke as the reference's icon set, and
 * deliberately not one of the four marks the section above already spends: repeating those here
 * would make two adjacent grids look like the same grid twice.
 */
const CARDS = [
  {
    id: "analysis",
    title: "AI-powered analysis",
    body: "Your connected numbers, read for you.",
    tone: "text-accent",
    path: "M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9 12 3.5ZM19 3v3m1.5-1.5h-3",
  },
  {
    id: "tailored",
    title: "Tailored to your business",
    body: "Shaped by your own data, not an average.",
    tone: "text-brand-mint",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-3.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
  },
  {
    id: "actionable",
    title: "Insights you can act on",
    body: "Turn a recommendation into a task.",
    tone: "text-brand-blue",
    path: "M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3m-6 0a3 3 0 0 1 6 0m-6 0h6m-6.5 9.5 2 2 4-4.5",
  },
  {
    id: "time",
    title: "More time for what matters",
    body: "Fewer hours in spreadsheets, more on growth.",
    tone: "text-accent",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.5 2",
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
