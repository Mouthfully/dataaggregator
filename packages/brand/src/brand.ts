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
   * Product name. SETTLED: `uniplain`, which supersedes `numbadee`. See
   * docs/marketplane/53-the-rename.md.
   *
   * This field used to claim that changing it was "a one-line change here and no npm rename".
   * The rename tested that claim and it held: outside this file and its test, the only
   * occurrence anywhere in code was `supabase/config.toml`'s `project_id`, which the brand guard
   * match-tests against this value rather than letting it drift. Every rendered occurrence goes
   * through `productName()` in `apps/web/app/_content.ts`, which reads this constant.
   */
  readonly productName: string;
  readonly productNameSettled: boolean;
  readonly tagline: string;
  /**
   * Primary domain. RESOLVED: `uniplain.com`, registered by the founder and serving the web app.
   *
   * This was the field the rest of the file called "blocking", and what made it expensive was
   * never the code — it is that OAuth redirect URIs are registered with Google and Meta, and
   * specification section 3.5 records Google's sensitive-scope verification as unbounded
   * (documented 3-5 days, observed at over ten weeks). Changing the domain after that clock
   * starts restarts it. The clock has not started, which is why settling it now is cheap and
   * settling it later would not have been.
   */
  readonly domain: string | null;
  /**
   * Public base URL of the API, which is a SEPARATE ORIGIN from the site: the site is a Next app
   * on Vercel and the API is a Cloudflare Worker. Null until a hostname on `domain` routes to
   * that Worker — see `apiUrl()` for why null here refuses rather than deriving one from the site.
   */
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

  /* --- Certifications. NONE OF THESE CAN BE CONFERRED BY THIS REPOSITORY. ------------------- */

  /**
   * Whether a SOC 2 **Type II** report exists, from a named CPA firm, covering a stated
   * observation window.
   *
   * A BOOLEAN THAT ONLY AN AUDITOR CAN FLIP. Type I is design at a point in time; Type II is
   * operating effectiveness over a window, commonly three to twelve months. Nothing written in
   * this repository shortens that window -- evidence has to accumulate while the controls actually
   * run -- so this field is false until a report is in hand, and `claims.ts` withholds the claim
   * while it is.
   */
  readonly soc2TypeIIReport: boolean;

  /**
   * Whether an ISO/IEC 27001 certificate exists, issued by an accredited certification body.
   *
   * The certifiable object is the **ISMS** in clauses 4-10 -- context, leadership, risk
   * assessment, internal audit, management review -- most of which is management-system work no
   * codebase provides. Annex A is a reference control set justified in a Statement of
   * Applicability. Implementing every technical control in Annex A and flipping this would be a
   * lie about a certificate, not a shortcut to one.
   */
  readonly iso27001Certificate: boolean;

  /**
   * Thailand's Personal Data Protection Act, B.E. 2562 (2019).
   *
   * NOT A CERTIFICATION AND NOT OPTIONAL. There is nothing to hold and nothing to flip: the PDPA is
   * the law this entity operates under, and it applies whether or not anyone writes it down. It is
   * here as a FACT ABOUT THE ENTITY so that code and copy can reference the governing law rather
   * than each inventing one -- the same reason `legalEntity` is here.
   *
   * `null` would be wrong. A Thai juristic person processing personal data is in scope, and the
   * only honest value is the statute.
   */
  readonly governingPrivacyLaw: string;

  /**
   * The supervisory authority a data subject complains to, and the one a breach is notified to.
   *
   * A privacy notice that names no authority leaves a data subject with no route, which is the
   * practical half of the rights the statute grants. Named here so one string serves the notice,
   * the breach runbook and any future in-product disclosure.
   */
  readonly supervisoryAuthority: string;

  /**
   * The Data Protection Officer, where one is appointed.
   *
   * NULL, AND THE NULL IS LOAD-BEARING. The PDPA requires a DPO in defined circumstances, and
   * whether this entity meets the trigger is a question for counsel rather than for this file. A
   * plausible-looking name here would be the exact failure this repository is organised against:
   * a data subject would write to it and nobody would answer.
   */
  readonly dataProtectionOfficer: string | null;
}

export const brand: Brand = {
  legalEntity: "Now On Company Limited",

  // Capital U, per the brand guide: "Always one word, with an uppercase U." It was lowercase for
  // one commit, and the cost showed up immediately -- two independently written page sections each
  // grew their own `productName.charAt(0).toUpperCase() + ...` to render it correctly, which is a
  // second copy of one fact appearing twice in a day. The display form belongs here.
  //
  // Nothing downstream needs the lowercase form spelled out: the brand guard slugifies this value
  // before match-testing supabase/config.toml's project_id, and the domain's registrable label is
  // asserted against it case-insensitively.
  productName: "Uniplain",
  productNameSettled: true,
  tagline: "Know what changed. And why.",

  domain: "uniplain.com",

  // Null deliberately, and not the same kind of unknown the domain was. `api-edge` is deployed at
  // a workers.dev hostname, which is a deployment detail and not a public product URL; no
  // hostname on `domain` routes to the Worker yet. Filling this in is adding a DNS record and a
  // wrangler route, not a decision.
  apiBaseUrl: null,

  // Moved onto the product domain with the rename, on the founder's instruction.
  //
  // VERIFIED NOT YET DELIVERABLE at the time of writing: the zone has one CNAME and no MX record,
  // and Cloudflare Email Routing on it exists but reads `enabled: false, status: unconfigured`.
  // Mail to this address bounces until that is finished. It is recorded here rather than deferred
  // because the address is the founder's decision and the MX records are a five-minute task; what
  // must not happen is the two drifting apart silently, so `brand.test.ts` asserts the address is
  // on `domain` and 53-the-rename.md carries the delivery check as an open item.
  supportEmail: "contact@uniplain.com",
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
  // USD, and it is not a free choice. The product is priced in USD, EUR and THB, and Stripe
  // requires every Price in an account to share ONE default currency -- multi-currency is
  // `currency_options` on the same Price, not separate Prices. So this names the base the
  // catalogue is built on rather than a preference, and `DEFAULT_CURRENCY` in
  // apps/web/app/_billing/plans.ts is the same fact where the checkout can read it.
  //
  // It said EUR until the three currencies were priced, which made it the one value in the
  // repository that disagreed with the pricing page.
  defaultCurrency: "USD",

  // ap-southeast-1 (Singapore). The nearest Supabase region to Thailand and the one the schema's
  // own `organisations.data_region` CHECK already allows. Recording it does NOT publish the
  // `data-region` claim: that claim says "the region you choose", and there is one region, chosen
  // here. It stays withheld behind `surface:region-choice` until a customer can actually choose.
  dataRegion: "ap-southeast-1",
  euRepresentative: null,
  dpaAvailable: false,

  // Neither is held. Both are flipped by a third party handing over a document, never by an edit
  // here -- and `packages/brand/src/brand.test.ts` fails the moment one is flipped while the
  // matching FORBIDDEN_CLAIMS pattern still bans the wording, so turning one on is a deliberate,
  // reviewed change rather than a one-character one.
  soc2TypeIIReport: false,
  iso27001Certificate: false,

  // The law that applies without anyone deciding anything. The entity is a Thai juristic person.
  governingPrivacyLaw: "Personal Data Protection Act B.E. 2562 (2019)",
  supervisoryAuthority: "Personal Data Protection Committee (PDPC), Thailand",
  dataProtectionOfficer: null,
};

/** Formatted for an imprint, an invoice footer or an email signature. */
export function formatAddress(separator = ", "): string {
  const a = brand.postalAddress;
  return [a.street, `${a.postalCode} ${a.city}`, a.country].join(separator);
}

/**
 * The site's base URL for the current environment.
 *
 * `brand.domain` is the CANONICAL PUBLIC domain, and it is now set. The order is unchanged:
 *
 *   1. An explicit override, for a deployment that knows its own URL.
 *   2. Vercel's own per-deployment URL, injected on every preview build.
 *   3. localhost, for local development.
 *   4. The canonical domain.
 *
 * Steps 2 and 3 both precede the canonical domain, and while the domain was null the order among
 * them was untestable. It is load-bearing now. Step 2 keeps a preview build from advertising
 * itself as production -- a preview that emitted `https://uniplain.com` would send the reader to
 * the live site instead of the build under review -- and step 3 keeps a dev server from doing the
 * same thing to the developer.
 *
 * The production throw below is now unreachable while `brand.domain` is set. It stays because what
 * it guards is the invariant and not the current value: if the domain is ever unset again, this
 * must refuse rather than silently emit a wrong absolute URL into an email or an invoice, which is
 * the failure mode a placeholder string would have hidden.
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

  // Development is checked BEFORE the canonical domain, not after. While `brand.domain` was null
  // the two could be written in either order and nobody would notice; now they cannot. A dev
  // server that fell through to the domain would print `https://uniplain.com/...` into every
  // local link and email preview, sending the developer to production to check their own work.
  if (env.NODE_ENV !== "production") return "http://localhost:3000";

  if (brand.domain) return `https://${brand.domain}`;

  throw new Error(
    "siteUrl(): no public URL available. Set PUBLIC_SITE_URL, or settle brand.domain. " +
      "Refusing to guess -- a wrong absolute URL in an email or invoice is worse than a failed build.",
  );
}

/**
 * The public API base URL. Takes its environment for the same reason as `siteUrl`.
 *
 * NOT resolved the same way, and this is the part that changed when the domain was settled. The
 * API is a Cloudflare Worker; the site is a Next app on Vercel. They are different origins, and
 * `apps/web` serves no `/api` route at all.
 *
 * This used to fall back to `${siteUrl(env)}/api`. While `brand.domain` was null that fallback was
 * harmless in production, because `siteUrl` threw before it could produce anything. Setting the
 * domain removed the throw, and the same line would then have returned `https://uniplain.com/api`
 * -- a URL that resolves, serves the marketing site's 404, and looks entirely plausible in a log.
 *
 * So it refuses instead. A missing API URL is a deployment that has not been finished; an API URL
 * pointing at the wrong origin is a deployment that appears finished and is not.
 */
export function apiUrl(env: Record<string, string | undefined>): string {
  const explicit = env.PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (brand.apiBaseUrl) return brand.apiBaseUrl.replace(/\/$/, "");
  throw new Error(
    "apiUrl(): no API base URL available. Set PUBLIC_API_URL, or settle brand.apiBaseUrl. " +
      "Refusing to derive one from the site URL -- the API is a different origin, and a URL on " +
      "the site's domain would resolve to the marketing site rather than fail.",
  );
}
