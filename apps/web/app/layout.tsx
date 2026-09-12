import { brand, formatAddress, siteUrl } from "@repo/brand";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SITE } from "./_content";
import "./globals.css";

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
    <html lang={brand.defaultLocale}>
      <head>
        <StructuredData />
      </head>
      <body className="bg-surface text-ink font-body min-h-dvh antialiased">{children}</body>
    </html>
  );
}

/** Kept exported so a future imprint page renders the same address string this footer does. */
export const imprintAddress = formatAddress();
