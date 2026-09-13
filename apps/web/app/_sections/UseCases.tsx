/**
 * THE USE CASES SECTION -- the reference's `<section class="section container use-cases">`, headed
 * "A clearer view, for every team." A centred `.section-heading` over a three-up card grid, one
 * card per audience.
 *
 * THE REFERENCE'S CARD CTA IS A <button data-template="...">, wired by its script to open the
 * page's `<dialog id="demo">` with a template preview. Neither that script nor a templates section
 * exists in this app -- there is no `#templates` anchor anywhere in the tree -- so reproducing the
 * markup literally would ship three buttons that swallow a click, or three links to an anchor that
 * scrolls nowhere. Each CTA is therefore an <a> to `/dashboard`, which is a route that exists and
 * is the same destination the header's own CTA uses: the promise the label makes ("see a report
 * example") is one the link can actually keep. When a templates surface lands, these become links
 * to it and nothing else in this file moves.
 *
 * THE PER-TRADE LINE occupies the slot the reference filled with a row of connector marks. See the
 * second block below for why the marks went; the slot, its 24px top margin and the CTA baseline it
 * holds are unchanged.
 *
 * COLOUR. The reference tints the card icons a bright blue and gives the cards a near-white ground
 * one step off the page. Neither literal is in the token file; both sit a couple of percent from a
 * token that already carries exactly that role -- the brand blue and the subtle surface -- so
 * the icons take `text-brand-blue` and the ground `bg-surface-subtle` rather than introducing a
 * literal. The cards are border-only, no shadow, which is the reference's own treatment here and
 * matches the token file's note that elevation is spent sparingly.
 *
 * The grid is three columns at 768px and one below it, per the reference's own 760px collapse.
 */

/**
 * WHERE THE AUDIENCE GETS NAMED, AND WHO IS NOT ON THE LIST.
 *
 * The site named nobody. The founder's plan names five trades -- cafes, bars and restaurants;
 * hotels and guesthouses; online sellers; clinics and salons; accountants -- all of them
 * owner-operated, in Thailand, with no analyst and no IT department. Those five are these five.
 *
 * "AGENCIES & CONSULTANTS" WAS THE THIRD CARD AND IS DELIBERATELY GONE.
 * `docs/marketplane/58-plan-reconciliation.md` section 5.1 lists it as copy that must stop,
 * because specification 11A.1 demotes agencies from the primary customer to a secondary channel.
 * Accountants stay: they are on the plan's own list, and they arrive as a customer rather than as
 * a reseller.
 *
 * THE CONNECTOR ROW WAS REMOVED, WHICH IS A REDUCTION IN CLAIMS RATHER THAN A LOSS OF DESIGN.
 * Each card used to carry three platform marks naming "that team's sources". Five cards would have
 * meant fifteen such marks, and for four of the five trades the source that matters is a Thai POS
 * or a delivery platform that section 5.1 says may not appear on this site at all until one is
 * both built and reachable. A logo is a promise with no sentence to qualify it. In its place each
 * card carries the line the plan itself uses for per-trade emphasis -- "A cafe gets hourly revenue
 * and delivery share; a guesthouse gets occupancy and commission cost" -- which is content, sits in
 * the same slot, and promises a layout rather than a connector.
 *
 * Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line
 * arrives from here. Eyebrows are stored in sentence case because the capitals are CSS.
 */
const EYEBROW = "Who it is for";
const HEADING = "Built for owner-run businesses.";
const LEAD =
  "The same brief every morning, laid out for the trade you are in. A café is not a guesthouse, and neither of them is a clinic.";

/** The card CTA. One label for all five, as the reference uses one for all three. */
const CTA_LABEL = "See a sample dashboard";

/**
 * The five trades, in the plan's own order.
 *
 * `title` ends in a decision rather than in a view, which is the rule the whole page was rewritten
 * against. `leadsWith` is the per-trade emphasis the plan promises; it describes a layout, not a
 * source, and names no platform.
 *
 * `path` is the reference's own 24-box outline mark where the trade matches one of its three, and
 * the same icon family for the two it did not have.
 */
const CASES = [
  {
    id: "food",
    audience: "Cafés, bars and restaurants",
    title: "Know which hours pay, before you open.",
    body: "Yesterday's takings by hour, what delivery really came to, and the one change worth making this week.",
    leadsWith: "Leads with hourly revenue and delivery share",
    path: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
  },
  {
    id: "stay",
    audience: "Hotels and guesthouses",
    title: "See which nights to hold and which to fill.",
    body: "Occupancy against the same week last year, and what each booking channel costs you to fill a room.",
    leadsWith: "Leads with occupancy and channel cost",
    path: "M3 21V8l9-5 9 5v13M9 21v-6h6v6",
  },
  {
    id: "sellers",
    audience: "Online sellers",
    title: "Find the listing that costs you on every order.",
    body: "Orders, fees and ad spend on one line per listing, so a product that sells well and earns nothing shows up.",
    leadsWith: "Leads with margin by listing and by channel",
    path: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10",
  },
  {
    id: "clinics",
    audience: "Clinics and salons",
    title: "Fill the hours that sit empty.",
    body: "Which hours book out, which treatments bring people back, and where an hour of staff time earns least.",
    leadsWith: "Leads with utilisation by hour and by treatment",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.5 2",
  },
  {
    id: "accountants",
    audience: "Accountants",
    title: "Close every client's month from one export.",
    body: "The same set of numbers for each client, on the first, with every figure linking back to where it came from.",
    leadsWith: "Leads with one export per client, on the first",
    path: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6m-6 4h4",
  },
] as const;

export function UseCases() {
  return (
    <section
      aria-labelledby="use-cases-heading"
      className="mx-auto max-w-[1200px] px-8 py-12 md:py-20"
    >
      <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-[38px]">
        <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase md:text-xs">
          {EYEBROW}
        </span>
        <h2
          id="use-cases-heading"
          className="font-display text-ink mt-2.5 text-[30px] leading-[1.16] font-semibold tracking-[-0.03em] md:text-[38px]"
        >
          {HEADING}
        </h2>
        <p className="text-ink-muted mt-3 leading-[1.65] md:text-[17px]">{LEAD}</p>
      </div>

      {/* One column below 768px: three 30px-padded cards side by side on a phone leave the body
          copy two words to a line. The reference collapses at the same point. */}
      <ul className="grid gap-4 md:grid-cols-3 md:gap-[22px]">
        {CASES.map((useCase) => (
          <li key={useCase.id} className="flex">
            {/* `flex flex-col` plus `flex-1` on the body is what keeps the three CTAs on one
                baseline when the headings wrap to different line counts. */}
            <article className="border-line bg-surface-subtle flex flex-1 flex-col rounded-lg border p-[26px] md:p-[30px]">
              {/* Decorative: the eyebrow and heading beside it carry the meaning, so the mark is
                  hidden rather than labelled, which would announce each card twice. */}
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
                className="text-brand-blue mb-[18px] block md:mb-[26px]"
              >
                <path d={useCase.path} />
              </svg>

              <span className="text-ink-faint block text-[11px] font-bold tracking-[0.14em] uppercase">
                {useCase.audience}
              </span>
              <h3 className="font-display text-ink mt-[18px] mb-3.5 text-[22px] leading-[1.3] font-semibold tracking-[-0.025em]">
                {useCase.title}
              </h3>
              <p className="text-ink-muted flex-1 text-[15px] leading-[1.65]">{useCase.body}</p>

              {/* No aria-label: the line reads as its own label ("Leads with ...") and a generic
                  <p> does not reliably expose one anyway. */}
              <p className="bg-surface text-ink-subtle mt-6 rounded-sm px-3 py-2 text-xs leading-[1.5]">
                {useCase.leadsWith}
              </p>

              <a
                href="/dashboard"
                className="text-accent mt-6 inline-flex items-center gap-3 self-start text-sm font-bold hover:underline"
              >
                {CTA_LABEL}
                <span aria-hidden="true">&rarr;</span>
              </a>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
