/**
 * CONSOLIDATED REPORTS -- the fourth capability, in the section that used to sell templates.
 *
 * WHY IT IS NOT A TEMPLATES SECTION ANY MORE. `docs/marketplane/58-plan-reconciliation.md` section
 * 5.1 lists `Templates` under copy that must stop, with the reason in one line: "the plan's owner
 * does not build reports from templates; the product decides for them". An owner-operator with no
 * analyst does not want a gallery to choose from -- choosing is the work they do not have time
 * for. The section was re-aimed rather than deleted, because the founder's plan has a fourth
 * capability (consolidated reports) with nowhere else to live, and it is exactly a four-up of
 * named, finished documents.
 *
 * THE FOUR ARE THE PLAN'S OWN LIST: monthly investor update, P&L by unit and channel, bank loan
 * pack, accountant export. Not a category each -- a document each, with a name the person who
 * asked for it would use.
 *
 * THE CARDS ARE LINKS, NOT BUTTONS. The reference ships each card as `<button data-template="...">`,
 * wired by its own script to open the page's `<dialog id="demo">` with a preview. Neither that
 * script nor a per-report route exists in this app, so a literal transcription would ship four
 * buttons that swallow a click. Each card is an `<a>` to `/dashboard` instead -- a route that
 * exists -- which is the treatment `UseCases.tsx` already settled on for the same `data-template`
 * markup. This stays a server component as a result: nothing here holds state.
 *
 * THE BARS. Heights and per-bar opacities are the reference's own inline styles, transcribed value
 * for value (35/51/42/67/57/85/75/96 on the first card, and so on), because the stagger is the
 * design -- a flat or evenly-ascending set reads as a placeholder. They are inline `style` because
 * they are data that varies per bar, not a design decision: eight Tailwind height classes per card
 * would put the same numbers in the markup with more ceremony. No colour is written there, and the
 * chart's accessible name says "sample" for the reason section 5.3 gives.
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
const EYEBROW = "Consolidated reports";

/** The line break inside the heading is the design's, so the two lines are two values. */
const HEADING_TOP = "The report a finance team";
const HEADING_BOTTOM = "would write. On the 1st.";

const LEAD =
  "Every unit, channel, bank account and ad account consolidated into one set of numbers, then written up as the document your co-founder, your bank or your accountant actually asked for. Every figure links back to where it came from.";

const CTA_LABEL = "See what is in one";

/** One label for all four cards, as in the reference. */
const CARD_CTA_LABEL = "Preview";

/** Names the bar chart for assistive tech, which would otherwise hear eight empty elements. The
 *  figures are invented, and section 5.3 requires an invented figure to say so. */
const CHART_LABEL = "Sample figures";

/**
 * The four reports, in the plan's own order. `bars` is that card's eight `[height %, opacity]`
 * pairs, transcribed from the reference's inline styles and left exactly as drawn.
 *
 * NONE OF THESE IS GENERATED TODAY. There is no report writer anywhere in `apps/` or `packages/`,
 * and the accompanying design note records all four as claims written ahead of the capability.
 */
const REPORTS = [
  {
    name: "Monthly investor update",
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
    name: "P&L by unit and channel",
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
    name: "Bank loan pack",
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
    name: "Accountant export",
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

export function Reports() {
  return (
    <section
      id="reports"
      aria-labelledby="reports-heading"
      className="mx-auto grid max-w-[1200px] items-center gap-8 px-8 py-12 md:grid-cols-2 md:gap-10 md:py-20 lg:gap-20"
    >
      <div className="min-w-0">
        <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
          {EYEBROW}
        </span>
        <h2
          id="reports-heading"
          className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-[36px]"
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
        {REPORTS.map((report) => (
          <li key={report.name} className="flex">
            <a
              href="/dashboard"
              className="border-line bg-surface hover:border-accent flex flex-1 flex-col rounded-lg border p-3 text-left transition-colors md:p-[18px]"
            >
              <strong className="text-ink text-xs leading-[1.3] font-bold">{report.name}</strong>

              <div
                role="img"
                aria-label={CHART_LABEL}
                className="mt-5 flex h-[78px] items-end gap-[7px]"
              >
                {report.bars.map(([height, opacity], index) => (
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
