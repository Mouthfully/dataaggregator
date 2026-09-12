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

/** Section copy. Inline sentences are refused by `scripts/check-copy.mjs`; uppercasing is CSS. */
const EYEBROW = "Your favorite platforms. One connected workspace.";

/** The eight marks the design shows, in the design's order. `slug` is the file in /platforms. */
const PLATFORM_MARKS = [
  { slug: "googleads", name: "Google Ads" },
  { slug: "meta", name: "Meta Ads" },
  { slug: "shopify", name: "Shopify" },
  { slug: "tiktok", name: "TikTok Ads" },
  { slug: "hubspot", name: "HubSpot" },
  { slug: "stripe", name: "Stripe" },
  { slug: "youtube", name: "YouTube" },
  { slug: "googleanalytics", name: "Google Analytics" },
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

      {/* Centred and evenly gapped while the row wraps; only once the viewport can hold all eight
          on one line does the design spread them edge to edge, which is why the switch is pinned to
          the reference's 1000px rather than to a rounded-off breakpoint. */}
      <ul className="mt-7 flex flex-wrap items-center justify-center gap-[22px] min-[1000px]:justify-between min-[1000px]:gap-5">
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
    </section>
  );
}
