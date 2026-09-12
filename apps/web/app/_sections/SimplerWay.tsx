import { brand } from "@repo/brand";

/**
 * THE FIRST SPLIT -- the product section the header's "Product" link points at.
 *
 * The nav in `_content.ts` links to `/#product`, and the supplied page set puts that id on exactly
 * this section, so the id is load-bearing rather than decorative: without it the first nav item
 * scrolls nowhere.
 *
 * THE GRID IS THE DESIGN'S `.split`, NOT A GENERIC TWO-UP. The reference sets `1fr 1fr` with an
 * 80px gap and `align-items:center`, narrows the gap to 40px once the columns get cramped, and
 * collapses to a single column below 760px -- which is the brand guide's own "collapse multi-column
 * content ... typically below 768px". Those three steps are reproduced here as base / md / lg
 * rather than flattened into one breakpoint, because at the middle width two 1fr columns still fit
 * and only the gutter has to give.
 *
 * THE CARDS ARE BORDER-ONLY ON PURPOSE. The reference gives each card a soft drop shadow, but the
 * only shadow the token file defines is `--mp-shadow-lift`, which it reserves for the hero demo
 * ("do not blanket-shadow cards; that flattens the hierarchy"). Inventing a second shadow would
 * mean writing a colour literal, which the tokens guard refuses and which would create a second
 * source of truth for elevation. A hairline reads the same at this size and matches the feature
 * cards the rest of the page already renders.
 *
 * THE ICON HUES ARE THE TOKENS, NOT THE REFERENCE'S FOUR. The stylesheet tints the four marks
 * purple, mint, bright blue and blue. Three of those map onto existing tokens; the purple has no
 * token anywhere in the system, so the first mark takes the action accent instead of introducing a
 * hue the palette has never had. See the report note.
 */

/**
 * Section copy. Every sentence lives here because `scripts/check-copy.mjs` refuses one typed into
 * the JSX, and the uppercase eyebrow is set as sentence case because the capitals are CSS.
 */
const EYEBROW = "Turn complexity into clarity";

/** The line break inside the heading is the design's, so the two lines are two values. */
const HEADING_TOP = "A simpler way to work";
const HEADING_BOTTOM = "with your data.";

/**
 * The lead opens on the product name, which may not be typed as a literal anywhere outside the
 * brand package -- `scripts/check-brand.mjs` enforces that. So it is read from `@repo/brand` and
 * only its first letter is derived here: the brand file holds the name as a lowercase identifier,
 * while the brand guide requires the capital at the front of a sentence.
 */
const PRODUCT = brand.productName;
const LEAD = `${PRODUCT} brings your marketing, sales, and product tools together. Keep everything in sync, make sense of your numbers, and focus on what matters: growth.`;

const CTA_LABEL = "See how it works";

/**
 * The four capabilities, in the design's order. `path` is the outline mark's single `d`; the marks
 * are 24px-grid outlines on a 1.75 stroke, per the brand guide's "Shape and interface details".
 */
const CAPABILITIES = [
  {
    title: "Connect",
    body: "Link your business tools in minutes.",
    tone: "text-accent",
    path: "M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v3m-6-9a6 6 0 0 0 6 6",
  },
  {
    title: "Unify",
    body: "Clean and merge your data automatically.",
    tone: "text-brand-mint",
    path: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5",
  },
  {
    title: "Analyze",
    body: "Get the insights you need, without the busywork.",
    tone: "text-brand-blue",
    path: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    title: "Share",
    body: "Turn data into clear reports for your team or clients.",
    tone: "text-accent",
    path: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.9M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8",
  },
] as const;

export function SimplerWay() {
  return (
    <section
      id="product"
      className="mx-auto grid max-w-[1200px] items-center gap-8 px-8 py-12 md:grid-cols-2 md:gap-10 md:py-20 lg:gap-20"
    >
      <div className="min-w-0">
        <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
          {EYEBROW}
        </span>
        <h2 className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-normal tracking-[-0.03em] md:text-[36px]">
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

      {/* Two-up inside the column at every width the design keeps it there; the reference only
          drops the pair to a single card once the viewport is narrower than a phone in portrait,
          which is why the breakpoint is pinned to its 390px rather than to a Tailwind default. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 min-[390px]:grid-cols-2">
        {CAPABILITIES.map((capability) => (
          <article
            key={capability.title}
            className="border-line bg-surface rounded-lg border p-5 md:p-6"
          >
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`mb-[18px] block ${capability.tone}`}
            >
              <path d={capability.path} />
            </svg>
            <h3 className="font-display text-ink mb-2 text-lg leading-[1.3] font-normal tracking-[-0.01em]">
              {capability.title}
            </h3>
            <p className="text-ink-muted text-sm leading-[1.55]">{capability.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
