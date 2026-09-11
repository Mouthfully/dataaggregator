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

  productName: "numbadee",
  productNameSettled: true,
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

  // ap-southeast-1 (Singapore). The nearest Supabase region to Thailand and the one the schema's
  // own `organisations.data_region` CHECK already allows. Recording it does NOT publish the
  // `data-region` claim: that claim says "the region you choose", and there is one region, chosen
  // here. It stays withheld behind `surface:region-choice` until a customer can actually choose.
  dataRegion: "ap-southeast-1",
  euRepresentative: null,
  dpaAvailable: false,
};

/** Formatted for an imprint, an invoice footer or an email signature. */
export function formatAddress(separator = ", "): string {
  const a = brand.postalAddress;
  return [a.street, `${a.postalCode} ${a.city}`, a.country].join(separator);
}

/**
 * The site's base URL for the current environment.
 *
 * `brand.domain` is the CANONICAL PUBLIC domain and is deliberately null until it is settled. That
 * does not block development, because nothing before launch needs the canonical name:
 *
 *   1. An explicit override, for a deployment that knows its own URL.
 *   2. Vercel's own per-deployment URL, injected on every preview build.
 *   3. The canonical domain, once it exists.
 *   4. localhost, for local development.
 *
 * Only step 3 needs an answer, and only for two things: production, and the OAuth redirect URIs
 * registered with Google and Meta. Everything else runs on steps 1, 2 and 4.
 *
 * In production with none of them set this throws rather than silently emitting a wrong absolute
 * URL into an email or an invoice, which is the failure mode a placeholder string would have
 * hidden.
 *
 * `env` is REQUIRED and has no default. This package is compiled into both the Next app and the
 * Workers runtime, and `process.env` does not exist in workerd -- a Worker's environment arrives as
 * the `env` binding on the request handler. Defaulting to `process.env` would typecheck under the
 * DOM config and fail at runtime on the edge. Pass `process.env` from Node, `env` from a Worker.
 */
export function siteUrl(env: Record<string, string | undefined>): string {
  const explicit = env.PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  if (brand.domain) return `https://${brand.domain}`;

  if (env.NODE_ENV === "production") {
    throw new Error(
      "siteUrl(): no public URL available. Set PUBLIC_SITE_URL, or settle brand.domain. " +
        "Refusing to guess -- a wrong absolute URL in an email or invoice is worse than a failed build.",
    );
  }
  return "http://localhost:3000";
}

/** The public API base URL, resolved the same way. Takes its environment for the same reason. */
export function apiUrl(env: Record<string, string | undefined>): string {
  const explicit = env.PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (brand.apiBaseUrl) return brand.apiBaseUrl.replace(/\/$/, "");
  return `${siteUrl(env)}/api`;
}
