/**
 * THE TEMPLATES SECTION -- the reference's `<section id="templates" class="section container split">`
 * headed "Go from data to insights in minutes." Copy on the left, a panelled grid of template
 * cards on the right, each card a title over a mini bar chart over a preview link.
 *
 * THE ID IS LOAD-BEARING IN THE REFERENCE, NOT HERE (YET). The supplied page set links its header
 * and footer at `#templates`; this app's nav in `_content.ts` does not, so the id is kept for the
 * day it does and costs nothing until then.
 *
 * THE CARDS ARE LINKS, NOT BUTTONS. The reference ships each card as `<button data-template="...">`,
 * wired by its own script to open the page's `<dialog id="demo">` with a preview. Neither that
 * script nor a per-template route exists in this app, so a literal transcription would ship four
 * buttons that swallow a click. Each card is an `<a>` to `/dashboard` instead -- a route that
 * exists and shows the same numbers a template would -- which is the treatment `UseCases.tsx`
 * already settled on for the same `data-template` markup. This stays a server component as a
 * result: nothing here holds state. When a template surface lands, only the hrefs move.
 *
 * THE BARS. Heights and per-bar opacities are the reference's own inline styles, transcribed value
 * for value (35/51/42/67/57/85/75/96 on the first card, and so on), because the stagger is the
 * design -- a flat or evenly-ascending set reads as a placeholder. They are inline `style` because
 * they are data that varies per bar, not a design decision: eight Tailwind height classes per card
 * would put the same numbers in the markup with more ceremony. No colour is written there.
 *
 * COLOUR AND RADII, WITH TWO SUBSTITUTIONS, BOTH REPORTED:
 *   * The bar fill is a two-stop vertical gradient in the reference. Its first stop IS the value
 *     of `--mp-brand-blue`; the second has no token, and is that same blue at roughly 40% over
 *     white,
 *     so the gradient is `from-brand-blue to-brand-blue/40` -- no literal, and it follows a palette
 *     change instead of freezing today's one.
 *   * The reference's panel ground and card border are each a percent or two from
 *     `--mp-surface-subtle` and `--mp-line`, which already carry exactly those roles.
 * The panel's 22px radius takes `rounded-xl` (24px, the guide's feature-panel step) and the cards'
 * 12px takes `rounded-lg` (16px, the guide's card step): the guide assigns radii by ROLE, so
 * matching the role beats shaving 2px off the nearest number. The 2px bar caps are the one
 * arbitrary length left inline -- the smallest radius token is 6px, which on a 7px-wide bar reads
 * as a lozenge rather than a bar.
 *
 * The reference gives the cards a hover shadow; the only shadow token is reserved for the hero, so
 * hover moves the border instead, as the other sections do.
 */

/** Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line
 *  arrives from here. The eyebrow is stored in sentence case because the capitals are CSS. */
const EYEBROW = "Ready-to-use templates";

/** The line break inside the heading is the design's, so the two lines are two values. */
const HEADING_TOP = "Go from data to insights";
const HEADING_BOTTOM = "in minutes.";

const LEAD =
  "Start with a template or build your own. Track performance, find opportunities, and share beautiful reports with your team.";

const CTA_LABEL = "Explore templates";

/** One label for all four cards, as in the reference. */
const CARD_CTA_LABEL = "Preview template";

/** Names the bar chart for assistive tech, which would otherwise hear eight empty elements. The
 *  chart is illustrative in the reference too, so it says so rather than implying real figures. */
const CHART_LABEL = "Illustrative trend";

/**
 * The four templates, in the reference's order. `bars` is that card's eight `[height %, opacity]`
 * pairs, transcribed from the reference's inline styles.
 */
const TEMPLATES = [
  {
    name: "Marketing Performance",
    bars: [
      [35, 0.45],
      [51, 0.52],
      [42, 0.59],
      [67, 0.66],
      [57, 0.73],
      [85, 0.8],
      [75, 0.87],
      [96, 0.94],
    ],
  },
  {
    name: "Ecommerce Overview",
    bars: [
      [29, 0.45],
      [45, 0.52],
      [36, 0.59],
      [61, 0.66],
      [51, 0.73],
      [79, 0.8],
      [69, 0.87],
      [90, 0.94],
    ],
  },
  {
    name: "Paid Ads",
    bars: [
      [23, 0.45],
      [39, 0.52],
      [30, 0.59],
      [55, 0.66],
      [45, 0.73],
      [73, 0.8],
      [63, 0.87],
      [84, 0.94],
    ],
  },
  {
    name: "Sales Pipeline",
    bars: [
      [20, 0.45],
      [33, 0.52],
      [24, 0.59],
      [49, 0.66],
      [39, 0.73],
      [67, 0.8],
      [57, 0.87],
      [78, 0.94],
    ],
  },
] as const;

export function Templates() {
  return (
    <section
      id="templates"
      aria-labelledby="templates-heading"
      className="mx-auto grid max-w-[1200px] items-center gap-8 px-8 py-12 md:grid-cols-2 md:gap-10 md:py-20 lg:gap-20"
    >
      <div className="min-w-0">
        <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
          {EYEBROW}
        </span>
        <h2
          id="templates-heading"
          className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-bold tracking-[-0.03em] md:text-[36px]"
        >
          {HEADING_TOP}
          <br />
          {HEADING_BOTTOM}
        </h2>
        {/* The design caps the measure at 475px, which is the guide's 60-70 characters a line. */}
        <p className="text-ink-muted mt-5 max-w-[475px] leading-[1.65]">{LEAD}</p>

        <a
          href="/dashboard"
          className="bg-surface text-accent border-line hover:bg-surface-subtle mt-6 inline-flex min-h-[46px] items-center gap-3 rounded-md border px-[22px] text-sm font-bold transition-colors"
        >
          {CTA_LABEL}
          <span aria-hidden="true">&#9655;</span>
        </a>
      </div>

      {/* The panel is the design's: the four cards sit on a tinted ground with a 2px-larger radius,
          which is what reads as a set rather than four loose cards. It stays two-up at every width
          -- these cards carry two short lines and a chart, so they survive a phone in pairs. */}
      <ul className="bg-surface-subtle grid min-w-0 grid-cols-2 gap-2.5 rounded-xl p-2.5 md:gap-4 md:p-[18px]">
        {TEMPLATES.map((template) => (
          <li key={template.name} className="flex">
            <a
              href="/dashboard"
              className="border-line bg-surface hover:border-accent flex flex-1 flex-col rounded-lg border p-3 text-left transition-colors md:p-[18px]"
            >
              <strong className="text-ink text-xs leading-[1.3] font-bold">{template.name}</strong>

              <div
                role="img"
                aria-label={CHART_LABEL}
                className="mt-5 flex h-[78px] items-end gap-[7px]"
              >
                {template.bars.map(([height, opacity], index) => (
                  <span
                    key={index}
                    /* Height and opacity are per-bar data, so they stay inline; the fill is a
                       token-backed gradient class, so no colour literal is written here. */
                    style={{ height: `${height}%`, opacity }}
                    className="from-brand-blue to-brand-blue/40 block flex-1 rounded-t-[2px] bg-linear-to-b"
                  />
                ))}
              </div>

              <span className="text-accent mt-3 inline-flex items-center gap-1.5 text-xs font-bold">
                {CARD_CTA_LABEL}
                <span aria-hidden="true">&rarr;</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
