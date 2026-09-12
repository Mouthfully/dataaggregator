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
 * THE CONNECTOR ROW is the one addition to the reference's per-card content, and it is content the
 * section already implies rather than a new claim: three of the real connector marks from
 * `apps/web/public/platforms/`, naming the sources that feed that team's view. Every slug shown is
 * one the integrations sections already list, so nothing here promises a connector the page does
 * not promise elsewhere. Plain <img> for the same reason the integration sections use one -- these
 * are fixed-size brand marks, so `next/image` would add a layout wrapper and buy nothing.
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

/** Section copy. `scripts/check-copy.mjs` refuses a sentence typed into the JSX, so every line
 *  arrives from here. Eyebrows are stored in sentence case because the capitals are CSS. */
const EYEBROW = "Made for the way you work";
const HEADING = "A clearer view, for every team.";
const LEAD = "One shared source of insight. A different perspective for every role.";

/** The card CTA. One label for all three, as in the reference. */
const CTA_LABEL = "See a report example";

/** Names the connector row for assistive tech, which otherwise hears three logos and no context. */
const SOURCES_LABEL = "Connected sources";

/**
 * The three audience cards, in the reference's order. Eyebrow, heading and body are transcribed
 * from the reference HTML and not adjusted.
 *
 * `path` is the reference's own 24-box outline mark for that card, copied verbatim so the icon set
 * stays the designer's. `sources` are slugs of files that ship in `apps/web/public/platforms/`.
 */
const CASES = [
  {
    id: "marketing",
    audience: "Marketing teams",
    title: "Know which campaigns deserve your next dollar.",
    body: "Compare spend, conversions, and revenue across channels.",
    path: "M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z",
    sources: [
      { slug: "googleads", name: "Google Ads" },
      { slug: "meta", name: "Meta Ads" },
      { slug: "tiktok", name: "TikTok Ads" },
    ],
  },
  {
    id: "ecommerce",
    audience: "Ecommerce businesses",
    title: "See the full story behind every sale.",
    body: "Bring orders, products, and acquisition data into one view.",
    path: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10",
    sources: [
      { slug: "shopify", name: "Shopify" },
      { slug: "stripe", name: "Stripe" },
      { slug: "shopee", name: "Shopee" },
    ],
  },
  {
    id: "agencies",
    audience: "Agencies & consultants",
    title: "Less reporting. More time for your clients.",
    body: "Create consistent reports and share the numbers that matter.",
    path: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.9M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8",
    sources: [
      { slug: "googleanalytics", name: "Google Analytics" },
      { slug: "looker", name: "Looker" },
      { slug: "googlesheets", name: "Google Sheets" },
    ],
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

              <ul aria-label={SOURCES_LABEL} className="mt-6 flex items-center gap-3">
                {useCase.sources.map((source) => (
                  <li key={source.slug} className="flex">
                    <img
                      src={`/platforms/${source.slug}.svg`}
                      alt={source.name}
                      width={22}
                      height={22}
                      loading="lazy"
                      className="block h-[22px] w-[22px]"
                    />
                  </li>
                ))}
              </ul>

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
