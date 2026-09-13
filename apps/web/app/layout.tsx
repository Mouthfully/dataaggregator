import { brand, formatAddress, siteUrl } from "@repo/brand";
import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono, Inter_Tight, Noto_Sans_Thai } from "next/font/google";
import type { ReactNode } from "react";

import { SITE } from "./_content";
import "./globals.css";

/**
 * THE TYPEFACES, DOWNLOADED AT BUILD TIME AND SERVED FROM THIS ORIGIN.
 *
 * `next/font/google` is not a convenience wrapper around a <link> to fonts.googleapis.com. At
 * build time it fetches the CSS and the .woff2 files, writes them into the app's own static
 * output, and emits a @font-face block pointing at our origin. What that buys, and what breaks
 * if someone "simplifies" this back to a stylesheet link:
 *
 *   - No third-party request on first paint. The browser never talks to Google. The token file
 *     used to justify Arial with exactly this ("no font link, no FOUT and no third-party request
 *     on first paint"); that was a real tradeoff against a <link>, and it is not a tradeoff
 *     against this. The faces cost nothing that Arial was saving.
 *   - No render-blocking round trip to a foreign origin before the face is even discovered. A
 *     <link> to Google costs a DNS lookup, a TLS handshake and a CSS fetch before the first byte
 *     of a font file is requested.
 *   - `adjustFontFallback` (on by default, deliberately not disabled below) measures each face
 *     and emits a size-adjusted local fallback -- a synthetic "Figtree Fallback" built from Arial
 *     with `size-adjust`, `ascent-override` and `descent-override` set so the fallback occupies
 *     the same box as the real face. That is what removes the layout shift a webfont normally
 *     causes between first paint and swap.
 *
 * Each face is exposed as a CSS custom property (`variable`) rather than as a className, and the
 * four properties are put on <html> below. packages/tokens/src/tokens.css composes them into the
 * three SEMANTIC family tokens (--mp-font-display / -body / -mono) that every consumer already
 * reads. No component changes; the stack order and the fallbacks stay in the token file, which is
 * the single source of truth for them.
 *
 * WEIGHTS ARE LOADED, NEVER SYNTHESISED. A weight an element asks for but the face does not carry
 * is faked by the browser -- a mechanically smeared outline, which is a large part of what reads
 * as cheap. Each `weight` array below is exactly the set of weights apps/web actually uses, so
 * adding a `font-medium` or a `font-semibold` to a page without adding the cut here reintroduces
 * synthesis silently. The counts, measured over apps/web source: font-bold 382, font-normal 21,
 * every other weight utility 0.
 *
 * The families are named here and nowhere else, because `next/font/google` takes the face name as
 * the import identifier and hashes it into a private family name -- there is no way to write
 * "Figtree" in the token file and have it resolve to the self-hosted file.
 */

/* Display.
 *
 * INTER TIGHT, NOT THE ARTBOARD'S YOUNG SERIF, and the reason is a founder decision rather than a
 * reading of the design: the reference the founder gave for headings is supermetrics.com, which
 * sets them in Neue Haas Grotesk Display 65 Medium. That is a paid Monotype face and cannot be
 * self-hosted from a free source, so this is the closest free equivalent -- a tight neo-grotesque
 * in the same register, where Young Serif is a serif display face and the opposite register.
 *
 * THE WEIGHT RANGE IS WHY THIS REVERSES SOMETHING. Young Serif ships exactly one cut, 400, so every
 * display element in this app was set to font-normal to stop the browser synthesising a fake bold.
 * Inter Tight carries the full range, so headings carry a real 600 again -- close to the Haas 65
 * the reference uses, which is heavier than book and lighter than a true bold.
 *
 * 400 is loaded alongside 600 because a handful of display elements are deliberately light.
 */
const displayFace = Inter_Tight({
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-face-display",
});

/* Body. 400 and 700 are the only two weights apps/web uses. The artboards' link also requests 500
 * and 600; no element in this app asks for either, and a loaded cut nobody references is bytes
 * spent on nothing -- add them here the day a page uses them. */
const bodyFace = Figtree({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-face-body",
});

/* Thai. Figtree ships `latin` and `latin-ext` only -- it has no Thai glyphs at all, and that
 * includes ฿ (U+0E3F), which is in the Thai block and which this product prints on every THB
 * price. Without a Thai face in the stack the browser picks whatever it can find and the baht
 * sign arrives in a different typeface from the digits beside it. The artboards solve it the same
 * way: `"Figtree", "Noto Sans Thai", ...` -- the Latin face first, so designed Latin text is never
 * touched, and Noto Sans Thai reached only for codepoints Figtree does not have.
 *
 * `subsets: ["thai"]` keeps the emitted unicode-range to the Thai block, which is what guarantees
 * it can never win a Latin glyph. `preload: false` because most pages here are English: without a
 * preload link the browser fetches this file only when a page actually paints a Thai codepoint.
 *
 * The weights match apps/web's, not the artboards'. The artboards set Thai at 400 and 600, but
 * this face is a fallback inside the body stack, so it inherits whatever weight the element
 * carries -- and in this app that is 400 or 700. A ฿ inside one of the 382 bold elements with no
 * 700 cut loaded is a synthesised Thai bold. */
const thaiFace = Noto_Sans_Thai({
  weight: ["400", "700"],
  subsets: ["thai"],
  display: "swap",
  preload: false,
  variable: "--font-face-thai",
});

/* Mono. The token file has named "Geist Mono" since the palette was first extracted but nothing
 * ever loaded it, so all 54 font-mono uses -- plus every bare <code>/<pre>/<kbd>, which Tailwind's
 * preflight routes through this same token -- have been falling through to the system monospace.
 * This is the first build that actually serves it. 400 and 700: four mono elements carry
 * font-bold, nine carry font-normal, and the rest inherit one of the two. */
const monoFace = Geist_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-face-mono",
});

/* One string, so <html> carries all four custom properties and every descendant -- including
 * anything a portal renders outside <body> -- can resolve the family tokens. */
const fontVariables = [
  displayFace.variable,
  bodyFace.variable,
  thaiFace.variable,
  monoFace.variable,
].join(" ");

/**
 * SITE-WIDE METADATA.
 *
 * `metadataBase` is what makes every relative URL below absolute, and it is resolved through
 * `siteUrl()` rather than written here. That function is the one place that knows the precedence --
 * an explicit override, then Vercel's per-deployment URL, then the canonical domain, then localhost
 * -- so a preview deployment advertises ITSELF and not production. Writing the domain here would
 * put a second answer in the tree and would make every preview claim to be the live site.
 *
 * THE LANGUAGE ALTERNATES ARE DELIBERATELY THIN. `brand.defaultLocale` is "en" and there is exactly
 * one localisation of this site, so the only honest declaration is English plus an `x-default`
 * pointing at the same page. Emitting hreflang for languages that do not exist is a common and
 * self-defeating habit: it invites a crawler to fetch a URL that 404s, and Google drops the whole
 * cluster when the return links do not reciprocate. Locales get added here when they get added.
 */
const base = siteUrl(process.env);

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: `${brand.productName} — ${SITE.heroLine1} ${SITE.heroLine2}`,
    template: `%s — ${brand.productName}`,
  },
  description: SITE.heroLead,
  applicationName: brand.productName,
  authors: [{ name: brand.legalEntity }],
  creator: brand.legalEntity,
  publisher: brand.legalEntity,
  alternates: {
    canonical: "/",
    languages: { en: "/", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    siteName: brand.productName,
    title: `${brand.productName} — ${SITE.heroLine1} ${SITE.heroLine2}`,
    description: SITE.heroLead,
    url: "/",
    locale: "en",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: `${brand.productName} — ${SITE.heroLine1} ${SITE.heroLine2}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.productName} — ${SITE.heroLine1} ${SITE.heroLine2}`,
    description: SITE.heroLead,
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: brand.faviconPath, type: "image/svg+xml" }],
    shortcut: [{ url: brand.faviconPath, type: "image/svg+xml" }],
    apple: [{ url: brand.logoMarkPath, type: "image/svg+xml" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff", // tokens-guard-ignore: a <meta> colour cannot read a CSS custom property; this is --mp-surface.
};

/**
 * STRUCTURED DATA.
 *
 * Three nodes, cross-referenced by `@id` so a consumer reads one graph rather than three unrelated
 * blobs: the Organization that publishes the site, the WebSite itself, and the product as a
 * SoftwareApplication.
 *
 * Every value comes from `@repo/brand`. NOTHING IS ASSERTED THAT THE BRAND FILE DOES NOT HOLD --
 * there is no `aggregateRating`, no `review`, no `priceRange` and no `offers` block, because the
 * company has no ratings, no reviews and no published price. Structured data is the easiest place
 * in a codebase to state something untrue at scale, and a fabricated rating is both a lie to a
 * reader and a manual action from Google.
 *
 * `legalName`, `address`, `taxID`-equivalent registration and the contact address are all real and
 * verifiable, which is exactly what this markup is for.
 */
function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: brand.legalEntity,
        legalName: brand.legalEntity,
        url: base,
        logo: `${base}${brand.logoPath}`,
        email: brand.supportEmail,
        identifier: brand.companyRegistration,
        address: {
          "@type": "PostalAddress",
          streetAddress: brand.postalAddress.street,
          postalCode: brand.postalAddress.postalCode,
          addressLocality: brand.postalAddress.city,
          addressCountry: brand.postalAddress.countryCode,
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: brand.supportEmail,
            availableLanguage: ["en"],
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: base,
        name: brand.productName,
        description: SITE.heroLead,
        inLanguage: brand.defaultLocale,
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${base}/#application`,
        name: brand.productName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: base,
        description: SITE.heroLead,
        publisher: { "@id": `${base}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // The value is JSON produced by JSON.stringify from values this repository owns; there is no
      // user input anywhere in it. Next has no other way to emit a JSON-LD block.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={brand.defaultLocale} className={fontVariables}>
      <head>
        <StructuredData />
      </head>
      <body className="bg-surface text-ink font-body min-h-dvh antialiased">{children}</body>
    </html>
  );
}

/** Kept exported so a future imprint page renders the same address string this footer does. */
export const imprintAddress = formatAddress();
