import { brand } from "@repo/brand";
import { connectionAllowance } from "../_content";

/**
 * THE FAQ AND THE CLOSING PANEL -- the reference's `<section id="faq" class="section container
 * split faq">` and the `<section class="container final-cta">` directly beneath it. They ship in
 * one file because they are one closing movement in the design: the FAQ's bottom padding and the
 * panel's top margin are a single 20px seam in the stylesheet, and splitting them across two files
 * would put the two halves of that seam out of each other's sight.
 *
 * THE ACCORDION IS NATIVE, AND THAT IS THE POINT. `<details>`/`<summary>` already own everything a
 * hand-rolled accordion has to re-implement badly: keyboard operation, the expanded/collapsed state
 * announced to assistive tech, in-page find that opens the panel holding the match, and correct
 * behaviour before hydration. So this file ships no client boundary -- it stays a server component,
 * and the whole section costs zero JavaScript.
 *
 * THE +/- AFFORDANCE IS TWO ELEMENTS, NOT A SWAPPED `content`. The reference draws it with
 * `summary:after{content:'+'}` and `details[open] summary:after{content:'−'}`. Reproducing that
 * literally would mean a Tailwind arbitrary `content-['...']` carrying a non-ASCII glyph inside a
 * class name, which is a fragile thing to make a visual state depend on. Instead both glyphs are
 * real spans and `group-open:` shows one and hides the other -- still pure CSS, still no script,
 * but the glyphs live in the markup where they can be read. The pair is `aria-hidden` because the
 * disclosure state is already in the accessibility tree: a screen reader saying "plus" after the
 * question it just announced as collapsed is noise, not information.
 *
 * THE MARKER IS KILLED TWICE. `list-none` handles the standards-track triangle; the
 * `::-webkit-details-marker` rule handles older WebKit, which ignores it. Both are needed, and the
 * reference sets `list-style:none` for the same reason.
 *
 * THE CLOSING PANEL'S GRADIENT HAS NO TOKEN. The reference fills it with a two-stop pale blue to
 * pale mint wash. The token file defines the two brand gradients it needs (display text and the
 * hero glow) and no third one, so the panel takes the flat pale-blue inset surface instead -- the
 * token whose documented role is exactly this, a soft feature background. Writing the gradient's
 * two stops here would create a second source of truth for colour, which the tokens guard refuses
 * outright. See the report note.
 *
 * THE PANEL IS TWO ELEMENTS, NOT ONE. In the reference a single element is both the 1200px
 * container and the padded panel, so its 32px gutter and its 48px padding are set on the same box.
 * Split here: the outer <section> carries the width and the gutter, the inner <div> the fill,
 * radius and padding. Collapsed into one box the panel would run to the screen edges on any
 * viewport under 1200px, because the gutter would be inside the fill rather than outside it.
 */

/**
 * Section copy, rewritten for the new positioning.
 *
 * THE OLD FAQ ANSWERED A DASHBOARD BUYER. "What platforms does it support?", "Do I need technical
 * skills?" -- the questions of someone deciding between reporting tools. The page no longer sells a
 * reporting tool, so the questions an owner-operator actually has are the ones asked here: what
 * lands, where the numbers came from, whether anything gets changed on their behalf, and what it
 * costs.
 *
 * AND THE TRAP THIS FILE ALREADY WALKED INTO ONCE, which is why it is written down twice. The old
 * "Can I try it for free?" answer restated three claims -- "three connectors, daily refresh and
 * standard reports" -- that the pricing block one section above had just dropped. The FAQ is where
 * a reader goes precisely when the card did not answer them, so a claim withheld above and
 * restated here is a claim republished. Three consequences bind every answer below:
 *
 *   * No answer names a source. `docs/marketplane/58-plan-reconciliation.md` section 5.1 stops the
 *     Thai POS vendors, the delivery platforms and the banks appearing as sources anywhere on this
 *     site, and the old first answer listed an integration library by category. Gone, not moved.
 *   * No answer counts anything. `check-claim-sources.mjs` bans a source or integration count, and
 *     the reconciliation notes "200+" once evaded the pattern by putting the `+` where the regex
 *     expected whitespace. The guard is not the reason not to write a count.
 *   * Read-only is worded as WHAT WE ASK FOR AND ENFORCE, never as a guarantee the platforms make.
 *     Section 5.1 is explicit: it is true of Loyverse and Xero, and on QuickBooks, FlowAccount,
 *     Grab, foodpanda and StoreHub one token covers read and write, so the promise there is our
 *     code and not their scope.
 *
 * The eyebrow is stored in sentence case because the capitals are CSS, not content.
 */
const EYEBROW = "Frequently asked questions";

/** The line break inside the heading is the design's, so the two lines are two values. */
const HEADING_TOP = "Still have questions?";
const HEADING_BOTTOM = "We're here to help.";

const LEAD = "Find setup guides, field definitions, and answers in our documentation.";
const HELP_LINK_LABEL = "Visit the help center";

/**
 * The first question names the product, which may not be typed as a literal anywhere outside the
 * brand package -- `scripts/check-brand.mjs` enforces that. The brand file holds the name as a
 * lowercase identifier, so only the leading capital the sentence needs is derived here. This is the
 * same derivation the first split section makes, for the same reason.
 */
const PRODUCT = brand.productName;

const QUESTIONS = [
  {
    question: `What does ${PRODUCT} send me each morning?`,
    answer:
      "Yesterday in three lines, anything that looks unusual, and one thing worth doing today. " +
      "You can reply to ask a follow-up, in Thai or English.",
  },
  {
    question: "Where do the numbers come from?",
    answer:
      "From the tools you log in to yourself. Every figure carries the time it was read and a " +
      "marker for as long as the platform may still revise it. On a shop's own till that marker " +
      "never comes off, and the brief says so in words.",
  },
  {
    question: "Will it change anything in my accounts?",
    answer:
      "No. Nothing is done for you: you stay in control of prices, ads and staff. We ask each " +
      "platform for read access only, and where a platform will not issue a token limited to " +
      "reading, our own code is what refuses to write.",
  },
  {
    question: "Do I need to understand any of the charts?",
    answer:
      "The brief is sentences. A chart is there if you want to look, and nothing asks you to " +
      "read one to find out what to do.",
  },
  {
    question: "Can I try it for free?",
    // THE OLD ANSWER RESTATED ALL THREE CLAIMS /pricing HAD JUST DROPPED -- "three connectors,
    // daily refresh, and standard reports" -- one section below the pricing block that no longer
    // makes any of them. Deleting a claim from the page that sells it and leaving it in the FAQ
    // republishes it; the FAQ is where a reader goes precisely when the card did not answer them.
    //
    // The allowance is the one part that survives, because `PLAN_ENTITLEMENTS` backs it, and it is
    // read from there rather than spelled out so the answer cannot drift from the card above it.
    answer: `The Free plan includes ${connectionAllowance("free")}.`,
  },
  {
    question: "Can I change plans later?",
    answer: "The pricing model is designed to let you upgrade as your data and team grow.",
  },
] as const;

/**
 * The closing panel.
 *
 * "READY TO UNIFY YOUR DATA?" IS NAMED IN SECTION 5.1 AS COPY THAT MUST STOP, alongside its lead,
 * "One connected workspace. A clearer way forward." Both sold the plumbing. The panel now closes on
 * the thing the page spent its length arguing: connect it tonight, and tomorrow you are told what
 * to do rather than shown a chart.
 *
 * WHAT THE ARTBOARD'S OWN CLOSING LINE SAYS, AND WHY IT IS NOT HERE. It reads "Free to start; pay
 * as you go after that, nothing monthly." `FORBIDDEN_CLAIMS` in `packages/brand/src/claims.ts` bans
 * `/\bnothing monthly\b|\bpay as you go\b/i` and `page.test.tsx` asserts the rendered page matches
 * no forbidden pattern, so writing the plan's sign-off would be a red build. Billing is
 * subscriptions -- four plans and six live Stripe prices -- and the lead says only what the Free
 * tier really is.
 */
const CTA_HEADING = "Connect tonight. Decide at breakfast.";
const CTA_LEAD = "Free to start. We ask each platform for read access and nothing more.";
const CTA_LABEL = "Start free";

export function Faq() {
  return (
    // The design's `.split`: 1fr 1fr with an 80px gutter, narrowing to 40px once the columns get
    // cramped and collapsing to one column below 768px -- the same three steps the other split
    // sections take. The top padding is 40px rather than the section scale's 80px because the
    // reference halves it here, closing the gap to the pricing table above.
    <section
      id="faq"
      className="mx-auto grid max-w-[1200px] items-center gap-8 px-8 pt-5 pb-12 md:grid-cols-2 md:gap-10 md:pt-10 md:pb-20 lg:gap-20"
    >
      <div className="min-w-0">
        <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
          {EYEBROW}
        </span>
        <h2 className="font-display text-ink mt-[18px] text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-[36px]">
          {HEADING_TOP}
          <br />
          {HEADING_BOTTOM}
        </h2>
        <p className="text-ink-muted mt-5 max-w-[475px] leading-[1.65]">{LEAD}</p>

        {/* The reference points this at a documentation page that is not part of the built app, so
            it lands on an in-page anchor that does not exist yet -- the same placeholder the
            pricing section's plan buttons use. It scrolls nowhere rather than 404ing, and it
            becomes a real href the moment the help centre has a route. */}
        <a
          href="#docs"
          className="text-accent mt-6 inline-flex items-center gap-3 text-sm font-bold hover:underline"
        >
          {HELP_LINK_LABEL}
          <span aria-hidden="true">&rarr;</span>
        </a>
      </div>

      <div className="min-w-0">
        {QUESTIONS.map((item) => (
          <details key={item.question} className="group border-line border-b py-[18px]">
            <summary className="text-ink flex cursor-pointer list-none justify-between gap-5 text-sm font-bold [&::-webkit-details-marker]:hidden">
              {item.question}
              {/* Hidden from assistive tech: <details> already announces expanded/collapsed. */}
              <span aria-hidden="true" className="text-ink-subtle shrink-0 leading-[1.5]">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">&#8722;</span>
              </span>
            </summary>
            <p className="text-ink-muted mt-3.5 text-sm leading-[1.65]">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    // No `.section` class in the reference, so this one carries margins rather than the 80px
    // section padding: the panel sits tight under the FAQ and holds the page's bottom margin.
    <section className="mx-auto mt-5 mb-[45px] max-w-[1200px] px-8 md:mb-[70px]">
      <div className="bg-surface-inset flex flex-col gap-6 rounded-xl p-[30px] md:flex-row md:items-center md:justify-between md:p-12">
        <div className="min-w-0">
          <h2 className="font-display text-ink text-[28px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-[30px]">
            {CTA_HEADING}
          </h2>
          <p className="text-ink-muted mt-2.5 leading-[1.65]">{CTA_LEAD}</p>
        </div>

        {/* Points at the pricing section, as the reference does -- "start free" means "choose the
            Free tier", and the tiers are the thing directly above. */}
        <a
          href="#pricing"
          className="bg-accent text-ink-on-accent hover:bg-accent-hover inline-flex min-h-[46px] shrink-0 items-center justify-center gap-[18px] rounded-md px-[22px] py-3 text-sm font-bold transition-colors"
        >
          {CTA_LABEL}
          <span aria-hidden="true">&rarr;</span>
        </a>
      </div>
    </section>
  );
}
