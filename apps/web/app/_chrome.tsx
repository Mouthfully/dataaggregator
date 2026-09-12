import { brand, formatAddress } from "@repo/brand";

import { NAV, SITE } from "./_content";

/**
 * The header and footer, shared by the marketing page and the dashboard.
 *
 * THE WORDMARK IS THE SUPPLIED SVG AND IS NEVER RE-TYPED. BRAND.md is explicit: "use the supplied
 * SVG paths as the master artwork ... do not rebuild it with live text or manually realign
 * individual letters". So the logo is an <img>, its width is the guide's navigation preference
 * (146px, inside the 144-180px band), and its alt text comes from `brand.productName` -- which is
 * also what keeps the brand guard satisfied, since the product name may not appear as a literal
 * anywhere outside the brand file.
 *
 * CLEAR SPACE. The guide requires at least 0.25H around the visible artwork, H being the symbol
 * height. At a 146px lockup H is about 37px, so 0.25H is roughly 10px; the 10px vertical padding
 * on the link is that allowance, and the header's own gap supplies far more horizontally.
 */
export function SiteHeader() {
  return (
    <header className="mx-auto flex h-[94px] max-w-[1200px] items-center gap-12 px-8">
      <a href="/" className="flex shrink-0 py-2.5">
        <img src={brand.logoPath} alt={brand.productName} width={146} height={42} />
      </a>
      <nav className="hidden flex-1 gap-7 md:flex">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className="text-ink-muted hover:text-accent text-sm">
            {item.label}
          </a>
        ))}
      </nav>
      <a
        href="/dashboard"
        className="bg-accent text-ink-on-accent hover:bg-accent-hover ml-auto inline-flex min-h-[40px] items-center gap-3 rounded-[10px] px-5 text-sm font-bold transition-colors md:ml-0"
      >
        {SITE.ctaNav}
        <span aria-hidden="true">&rarr;</span>
      </a>
    </header>
  );
}

/**
 * The footer carries the imprint, which is a legal requirement rather than a design choice: the
 * entity, its registered address, its registration number and a contact address. Every one of them
 * comes from `@repo/brand` and none is restated here.
 */
export function Footer() {
  return (
    <footer className="border-line bg-surface border-t">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-8 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <img src={brand.logoPath} alt={brand.productName} width={136} height={39} />
          <p className="text-ink-muted mt-3 text-xs">{SITE.footerTagline}</p>
        </div>

        <div className="text-xs">
          <strong className="text-ink mb-2 block">{brand.legalEntity}</strong>
          <p className="text-ink-muted">{formatAddress()}</p>
          <p className="text-ink-muted mt-2">
            <a
              className="text-accent underline-offset-4 hover:underline"
              href={`mailto:${brand.supportEmail}`}
            >
              {brand.supportEmail}
            </a>
          </p>
        </div>

        <div className="text-ink-muted text-xs">
          <p>{SITE.footerNote}</p>
          <p className="mt-1">{SITE.footerNote2}</p>
          {/* A registration number is an identifier, not a sentence, so it is written inline. */}
          <p className="mt-4">Company registration {brand.companyRegistration}</p>

          {/* Linked from every page, because a policy reachable only by typing its URL is not
              published in any sense a regulator or a customer would accept. */}
          <p className="mt-3 flex gap-4">
            <a className="text-accent hover:underline" href="/terms">
              Terms
            </a>
            <a className="text-accent hover:underline" href="/privacy">
              Privacy
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
