/**
 * THE INTEGRATIONS STRIP -- the eyebrow plus connector row that sits directly under the hero.
 *
 * THE LOGOS ARE THE SUPPLIED ARTWORK, NEVER A TYPED WORDMARK. The previous pass rendered each
 * platform as its name in bold text, which reads as a placeholder: a connector strip earns trust by
 * showing marks a visitor recognises before they have read a word, and a set of third-party
 * wordmarks reset in our own typeface is both less legible and not the trademark holder's artwork.
 * The real files already ship at `apps/web/public/platforms/*.svg`, so each row item is an <img>
 * against that path -- the same decision `_chrome.tsx` records for our own lockup.
 *
 * The <img> alt is deliberately EMPTY. The platform name sits next to the mark as live text, so
 * alt text would make a screen reader announce every platform twice; the artwork is decorative in
 * the accessibility sense even though it is the point visually.
 *
 * THE SLUG LIVES WITH THE NAME. `_content.ts` already lists the eight platform names, but a name
 * alone cannot find a file, and mapping one to the other from a distance is how a renamed asset
 * turns into a silently broken image. The pair is the unit of information here, so the pair is what
 * this file holds -- and it stays in this file rather than in shared content because the artwork
 * path is a fact about this section, not copy the rest of the site draws on.
 */

/** Section copy. Inline sentences are refused by `scripts/check-copy.mjs`; uppercasing is CSS.
 *
 *  "Your favorite platforms. One connected workspace." sold the plumbing, which
 *  `docs/marketplane/58-plan-reconciliation.md` section 5.1 names as the thing to stop selling:
 *  a connected workspace is what every BI tool offers. The strip now says only what it shows --
 *  the tools a business already has -- and the argument for what happens next is made by the
 *  sections under it. */
const EYEBROW = "The tools your business already runs on";

/**
 * The marks, in the design's order, every one an artwork file that exists in /platforms.
 *
 * A NAME HERE IS A PROMISE THE STRIP MAKES, so this list is not the place to advertise ambition:
 * the row sits under a hero about connecting a business's tools, and a visitor reads it as the set
 * we read. Additions belong here when the connector exists, not before.
 */
const PLATFORM_MARKS = [
  { slug: "googleads", name: "Google Ads" },
  { slug: "meta", name: "Meta Ads" },
  { slug: "shopify", name: "Shopify" },
  { slug: "tiktok", name: "TikTok Ads" },
  { slug: "hubspot", name: "HubSpot" },
  { slug: "stripe", name: "Stripe" },
  { slug: "youtube", name: "YouTube" },
  { slug: "googleanalytics", name: "Google Analytics" },
  { slug: "googlesheets", name: "Google Sheets" },
  { slug: "line", name: "LINE" },
  { slug: "shopee", name: "Shopee" },
  { slug: "looker", name: "Looker" },
  { slug: "googlebigquery", name: "BigQuery" },
] as const;

export function IntegrationsStrip() {
  return (
    <section
      aria-label="Connected platforms"
      className="mx-auto max-w-[1200px] px-8 pt-11 pb-[42px] text-center md:pt-[38px]"
    >
      <span className="text-ink-faint block text-[10px] leading-[1.8] font-bold tracking-[0.14em] uppercase md:text-xs md:leading-normal">
        {EYEBROW}
      </span>

      {/*
        A CONTINUOUS MARQUEE, BUILT FROM TWO IDENTICAL TRACKS.
        The animation translates the pair by exactly -50%, so as the first track leaves the frame the
        second sits precisely where it began and the loop has no seam. One track cannot do this: it
        would scroll off and leave a gap the width of the viewport before it wrapped.

        THE SECOND TRACK IS `aria-hidden`. It is the same thirteen platforms again, and a screen
        reader reading every name twice is worse than not hearing the strip at all. The list itself
        carries the accessible name from the <section>.

        MOTION IS OPT-OUT AT THE CSS LEVEL, not a preference we read in JavaScript. Continuous
        horizontal motion is a documented trigger for vestibular disorders -- nausea, not annoyance
        -- and `prefers-reduced-motion` turns the animation off and lets the row wrap statically, so
        the content is never lost, only the movement.

        `mask-image` fades both edges rather than hard-cutting the marks, which is what makes the
        row read as continuing past the frame instead of being clipped by it.
      */}
      <div className="marquee mt-7">
        <div className="marquee-track">
          {[false, true].map((clone) => (
            <ul
              key={clone ? "clone" : "track"}
              aria-hidden={clone || undefined}
              className="flex shrink-0 items-center gap-[22px] pr-[22px] min-[1000px]:gap-10 min-[1000px]:pr-10"
            >
              {PLATFORM_MARKS.map((platform) => (
                <li
                  key={platform.slug}
                  className="text-ink flex items-center gap-[7px] text-xs font-bold whitespace-nowrap md:text-[13px]"
                >
                  <img
                    src={`/platforms/${platform.slug}.svg`}
                    alt=""
                    width={26}
                    height={26}
                    loading="lazy"
                    decoding="async"
                    className="h-[26px] w-[26px] shrink-0 object-contain"
                  />
                  {platform.name}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
