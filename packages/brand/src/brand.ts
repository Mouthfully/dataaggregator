/**
 * THE brand file. The kickoff brief's `src/brand/brand.ts`; see docs/marketplane/00-repo-map.md
 * section 1 for why it lives under packages/ instead.
 *
 * This is the single source for company and product identity. Every page, email, invoice,
 * generated document, MCP server description and SDK README reads from here. No string that
 * identifies the company appears anywhere else, enforced by `node scripts/check-brand.mjs`.
 *
 * Values are from docs/marketplane/01-brand-identity.md, supplied by the founder 2026-09-07.
 *
 * A field that is genuinely unknown is `null`, never a plausible-looking placeholder. Nulls are
 * load-bearing: `claims.ts` suppresses any marketing claim whose supporting field is unset, so a
 * claim the company cannot yet substantiate cannot render. Filling a null in is how a claim turns
 * on. Inventing one is how the site starts lying.
 */

export interface PostalAddress {
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
  readonly countryCode: string;
}

export interface Brand {
  /** Registered legal entity. Appears on invoices, the imprint and every contract. */
  readonly legalEntity: string;
  /**
   * Product name. NOT SETTLED — specification section 12 only recommends "Marketplane"
   * ("if forced to one"). Every occurrence routes through this constant and the package scope is
   * `@repo/*`, so settling on a different name is a one-line change here and no npm rename.
   */
  readonly productName: string;
  readonly productNameSettled: boolean;
  readonly tagline: string;
  /**
   * Primary domain. UNRESOLVED and blocking: the support address is on zwitchy.io while the
   * design artboard hard-codes api.marketplane.dev. Cheap in code, expensive in practice — OAuth
   * redirect URIs are registered with Google and Meta, and specification section 3.5 records
   * Google's sensitive-scope verification as unbounded (documented 3-5 days, observed at over ten
   * weeks). Changing the domain after that clock starts restarts it.
   */
  readonly domain: string | null;
  readonly apiBaseUrl: string | null;
  readonly supportEmail: string;
  /** Not yet distinct from support. Set when a legal inbox exists. */
  readonly legalEmail: string | null;
  readonly postalAddress: PostalAddress;
  /** Thai juristic-person registration number. */
  readonly companyRegistration: string;
  /**
   * VAT number. NOT SUPPLIED. Thailand's 13-digit juristic-person number doubles as the tax ID
   * and, where the company is VAT-registered, the VAT number — but an invoice printing a wrong
   * VAT number is worse than one printing none, so this stays null until confirmed separately.
   */
  readonly vatNumber: string | null;
  readonly responsibleForContent: string;
  readonly socialHandles: Readonly<Record<string, string>>;
  readonly logoPath: string;
  readonly logoMarkPath: string;
  readonly faviconPath: string;
  readonly defaultLocale: string;
  readonly defaultCurrency: string;
  /**
   * Where customer data is actually hosted. UNRESOLVED and gating: the entity is Thai, so "EU
   * data region" is a true claim only once the Supabase, Cloudflare and Vercel projects are
   * provisioned in EU regions. See docs/marketplane/01-brand-identity.md for the three things
   * "EU hosting" conflates and which of them residency alone does not solve.
   */
  readonly dataRegion: string | null;
  /** GDPR Article 27 representative. A non-EU controller serving EU data subjects generally
   *  needs one designated in writing. Until this is set, no GDPR-compliance claim may render. */
  readonly euRepresentative: string | null;
  /** Whether a DPA with Article 28 terms and a transfer mechanism actually exists to send. */
  readonly dpaAvailable: boolean;
}

export const brand: Brand = {
  legalEntity: "Now On Company Limited",

  productName: "Marketplane",
  productNameSettled: false,
  tagline: "Know what changed. And why.",

  domain: null,
  apiBaseUrl: null,

  supportEmail: "support@help.zwitchy.io",
  legalEmail: null,

  postalAddress: {
    street: "112/246 Srinakarin",
    postalCode: "10540",
    city: "Samut Prakan",
    country: "Thailand",
    countryCode: "TH",
  },

  companyRegistration: "0115564023284",
  vatNumber: null,
  responsibleForContent: "Now On Company Limited",

  socialHandles: {},

  logoPath: "/brand/logo.svg",
  logoMarkPath: "/brand/logo-mark.svg",
  faviconPath: "/brand/favicon.svg",

  defaultLocale: "en",
  defaultCurrency: "EUR",

  dataRegion: null,
  euRepresentative: null,
  dpaAvailable: false,
};

/** Formatted for an imprint, an invoice footer or an email signature. */
export function formatAddress(separator = ", "): string {
  const a = brand.postalAddress;
  return [a.street, `${a.postalCode} ${a.city}`, a.country].join(separator);
}
