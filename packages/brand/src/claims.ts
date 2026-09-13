/**
 * The marketing claims the site is allowed to make, and the ones it may never make.
 *
 * The kickoff brief requires the brand file to carry "the marketing claims that are allowed on
 * the site". This is that list, made machine-checkable rather than aspirational.
 *
 * Three rules give it teeth:
 *
 *  1. Every claim cites the specification section that supports it. A claim with no citation is
 *     not a claim, it is copywriting.
 *  2. A claim may declare `requires`: brand fields that must be non-null before it can render.
 *     `allowedClaims()` filters those out. This is what stops the site promising EU data
 *     protection that the company has not yet arranged — see docs/marketplane/01-brand-identity.md.
 *  3. A claim about a product capability declares `requiresCapabilities`. Capabilities are absent
 *     until their implementation launches, so forgetting to mark one available withholds copy.
 *
 * The forbidden list exists because phase 0 found the design artboard selling four things the
 * specification's section 11 had already dropped or deferred. A ban is cheaper to enforce than a
 * memory.
 */

import { type Brand, brand } from "./brand.ts";

type BrandField = keyof Brand;

/**
 * The source modules that exist under packages/connectors/src/sources/. Brand is a leaf and cannot
 * import the connectors package, so scripts/check-capabilities.mjs keeps this mirror exact. Claim
 * copy is composed from this list; no hand-written connector sentence can outrun the source tree.
 */
export const IMPLEMENTED_SOURCE_IDS = [
  "ga4",
  "google_ads",
  "loyverse",
  "meta_ads",
  "search_console",
  "woocommerce",
] as const;

export type ImplementedSourceId = (typeof IMPLEMENTED_SOURCE_IDS)[number];

const SOURCE_LABELS: Readonly<Record<ImplementedSourceId, string>> = {
  ga4: "GA4",
  google_ads: "Google Ads",
  loyverse: "Loyverse",
  meta_ads: "Meta Ads",
  search_console: "Search Console",
  woocommerce: "WooCommerce",
};

const CAPABILITY_IDS = [
  "source:any",
  "surface:business-intelligence-team",
  "surface:answer",
  "surface:audit-log",
  "surface:diagnose",
  "surface:verified-alerts",
  "surface:reconcile",
  "surface:ai-answer-monitoring",
  "surface:cost-preview",
  "surface:agency-switching",
  "surface:region-choice",
  "source:dataforseo",
  "billing:connected-account",
  "billing:credits",
] as const;

export type Capability = (typeof CAPABILITY_IDS)[number];

/**
 * Capability availability fails closed: only shipped capabilities appear here. Source availability
 * is derived from the guarded source list; all other surfaces remain absent until deliberately
 * launched.
 */
export const AVAILABLE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(
  IMPLEMENTED_SOURCE_IDS.length > 0 ? ["source:any"] : [],
);

function naturalList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const connectorClaim = `Reads ${naturalList(
  IMPLEMENTED_SOURCE_IDS.map((id) => SOURCE_LABELS[id]),
)} on your own credentials.`;

export interface Claim {
  readonly id: string;
  readonly text: string;
  /** Specification sections that support it. */
  readonly source: readonly string[];
  /** Brand fields that must be non-null, non-false before this may render. */
  readonly requires?: readonly BrandField[];
  /** Product capabilities that must have launched before this may render. */
  readonly requiresCapabilities?: readonly Capability[];
}

export const CLAIMS: readonly Claim[] = [
  // --- What the product is -------------------------------------------------------------------
  // Reconciles §11A.1, which moved the primary customer from agencies and brands to an owner-run
  // business with no analyst and no IT function. The correctness guarantee did not change; it
  // stopped being the pitch and became the substance behind it — the reason an owner can trust a
  // number they did not compute themselves. 11.9's narrowing still binds the second sentence.
  {
    id: "positioning",
    text: "The business-intelligence team a small business does not have. Your own numbers, and the verified reason they moved.",
    source: ["11A.1", "11.9"],
    requiresCapabilities: ["surface:business-intelligence-team"],
  },
  { id: "tagline", text: "Know what changed. And why.", source: ["11.9", "14"] },

  // --- Credentials and tenancy ---------------------------------------------------------------
  {
    id: "read-only-oauth",
    text: "Read-only OAuth. We never hold your passwords. Revoke from the platform at any time.",
    source: ["3.5", "11.2"],
  },
  {
    id: "byoc",
    text: "Your logins stay yours. We sell normalisation, restatement handling, scheduling and the answer, not access to your data.",
    source: ["0", "11.2"],
    requiresCapabilities: ["surface:answer"],
  },
  {
    id: "tenant-isolation",
    text: "One tenant per client. Data, keys and connections are isolated. Agencies switch, never mix.",
    source: ["3.5", "15"],
  },
  {
    id: "no-pooling",
    text: "Your platform data is never pooled, benchmarked, sold or licensed.",
    source: ["3.5", "4.2"],
  },
  {
    id: "no-training",
    text: "Never used to train models. Your data answers your questions. That is all it does.",
    source: ["3.2"],
  },
  {
    id: "audit-log",
    text: "Every query, export and API key is logged.",
    source: ["15"],
    requiresCapabilities: ["surface:audit-log"],
  },

  // --- Data protection. Gated: the entity is Thai (see 01-brand-identity.md). -----------------
  // TWO GATES, AND THE SECOND IS THE ONE THAT BINDS. `brand.dataRegion` is now set --
  // ap-southeast-1 -- so the brand-fact gate would let this render. It must not: the sentence
  // promises the customer a CHOICE, and there is one region, chosen by us.
  // `organisations.data_region` exists as a column and nothing populates it or offers a picker.
  // Region choice is a product capability that has not launched, so this stays withheld on the
  // capability axis until it has. Recording where the data actually lives and promising the
  // customer a say in it are different claims; only the first is true today.
  {
    id: "data-region",
    text: "Your data is held in the region you choose.",
    source: ["3.2", "15"],
    requires: ["dataRegion"],
    requiresCapabilities: ["surface:region-choice"],
  },
  {
    id: "gdpr",
    text: "GDPR compliant, with a representative in the Union.",
    source: ["3.2"],
    requires: ["euRepresentative"],
  },
  {
    id: "dpa",
    text: "Click-through DPA with Article 28 terms and a public sub-processor list.",
    source: ["3.2"],
    requires: ["dpaAvailable", "euRepresentative"],
  },

  // --- Correctness. The actual product. ------------------------------------------------------
  {
    id: "fx-on-row",
    text: "Currencies converted at fetch time, with the rate, its source and its date on the row.",
    source: ["2", "7"],
  },
  {
    id: "attribution-required",
    text: "The attribution window is a required dimension. The API refuses to emit an unlabelled conversion count.",
    source: ["2", "4.4"],
  },
  {
    id: "freshness-fields",
    text: "Every row carries fetched_at, source_updated_at, restates_until and is_provisional.",
    source: ["2", "7"],
  },
  {
    id: "restatement-webhook",
    text: "When a platform restates a number you already reported, you get a webhook with the before and after.",
    source: ["4.2"],
  },
  {
    id: "time-travel",
    text: "Ask for the data as the platform reported it on any earlier date, with as_of.",
    source: ["2", "4.2"],
  },

  // --- Answers -------------------------------------------------------------------------------
  {
    id: "diagnose",
    text: "Ranked causes with the evidence rows attached, what was ruled out, and a recovery plan.",
    source: ["4.1"],
    requiresCapabilities: ["surface:diagnose"],
  },
  {
    id: "second-pass",
    text: "Every cause is checked by a second pass before you see it.",
    source: ["4.1"],
    requiresCapabilities: ["surface:diagnose"],
  },
  {
    id: "verified-alerts",
    text: "Alerts fire only after a second check confirms the change is real.",
    source: ["4.2", "4.4"],
    requiresCapabilities: ["surface:verified-alerts"],
  },
  {
    id: "reconcile",
    text: "Reconcile Meta, Google, GA4 and your order source for the same window and name the likely cause of the gap.",
    source: ["4.2"],
    requiresCapabilities: ["surface:reconcile"],
  },
  {
    id: "ai-confidence",
    text: "AI-answer citation measured over repeated runs and reported as a mention rate with a confidence interval, never a single rank.",
    source: ["11.8"],
    requiresCapabilities: ["surface:ai-answer-monitoring"],
  },
  {
    id: "cost-preview",
    text: "You choose n_runs, and plan.explain shows the cost before the question runs.",
    source: ["11.8", "4.2"],
    requiresCapabilities: ["surface:cost-preview"],
  },

  // --- Sources and pricing -------------------------------------------------------------------
  {
    id: "connectors",
    text: connectorClaim,
    source: ["11A.14"],
    requiresCapabilities: ["source:any"],
  },
  {
    id: "serp-bought",
    text: "SERP is bought wholesale from DataForSEO, never crawled. Google-only today, and we say so.",
    source: ["3.3", "9", "11.9"],
    requiresCapabilities: ["source:dataforseo"],
  },
  {
    id: "pricing-two-units",
    text: "Performance is priced per connected account per month, restatement re-pulls included. Credits cover SERP, AI answers and composite questions.",
    source: ["11.3", "11.8"],
    requiresCapabilities: [
      "billing:connected-account",
      "billing:credits",
      "source:dataforseo",
      "surface:ai-answer-monitoring",
    ],
  },
  {
    id: "billing-fairness",
    text: "Credits never expire. Failed calls are never billed. Hard spend caps and per-key budgets.",
    source: ["8"],
    requiresCapabilities: ["billing:credits"],
  },

  // --- Certifications and the governing law ---------------------------------------------------
  //
  // THREE CLAIMS THAT NO AMOUNT OF CODE TURNS ON. The first two are withheld by a brand fact only a
  // third party can set; the third is not a certification at all and is withheld for a different
  // reason, stated on it.
  {
    id: "soc2",
    text: "Independently audited against the SOC 2 Trust Services Criteria, with a Type II report covering a stated observation window.",
    source: ["3.2", "15"],
    requires: ["soc2TypeIIReport"],
  },
  {
    id: "iso27001",
    text: "Certified to ISO/IEC 27001 by an accredited certification body.",
    source: ["3.2", "15"],
    requires: ["iso27001Certificate"],
  },
  {
    // THE LAW, NOT A BADGE, and the distinction is why the text says "operates under" rather than
    // "complies with". A statute applies to this entity whether or not anything is claimed, so the
    // honest sentence names the law and the authority a data subject can actually write to. It is
    // withheld until a DPO exists, because a notice that names an authority and no contact leaves
    // the reader with half a route -- see brand.dataProtectionOfficer on why that null is real.
    id: "governing-law",
    text: "Operated by a Thai company under Thailand's Personal Data Protection Act, with complaints to the Personal Data Protection Committee.",
    source: ["3.2"],
    requires: ["dataProtectionOfficer"],
  },

  // --- Developer surface ---------------------------------------------------------------------
  {
    id: "one-shape",
    text: "One key over your own platform credentials. One response shape for every source.",
    source: ["2", "11.2"],
  },
  {
    id: "agency-mode",
    text: "Agencies: one login across every client, with per-client isolation.",
    source: ["4.2", "15"],
    requiresCapabilities: ["surface:agency-switching"],
  },
];

/**
 * Claims that may render right now. A claim whose supporting brand field is still null is
 * withheld rather than softened — there is no honest way to half-say "GDPR compliant".
 */
export function allowedClaims(
  b: Brand = brand,
  capabilities: ReadonlySet<Capability> = AVAILABLE_CAPABILITIES,
): Claim[] {
  return CLAIMS.filter(
    (claim) =>
      (claim.requires ?? []).every((field) => {
        const value = b[field];
        return value !== null && value !== false && value !== undefined;
      }) && (claim.requiresCapabilities ?? []).every((capability) => capabilities.has(capability)),
  );
}

export interface WithheldClaim {
  readonly claim: Claim;
  readonly missing: BrandField[];
  readonly missingCapabilities: Capability[];
}

/** Claims currently withheld, with every brand field and capability that would turn each on. */
export function withheldClaims(
  b: Brand = brand,
  capabilities: ReadonlySet<Capability> = AVAILABLE_CAPABILITIES,
): WithheldClaim[] {
  return CLAIMS.map((claim) => ({
    claim,
    missing: (claim.requires ?? []).filter((field) => {
      const value = b[field];
      return value === null || value === false || value === undefined;
    }),
    missingCapabilities: (claim.requiresCapabilities ?? []).filter(
      (capability) => !capabilities.has(capability),
    ),
  })).filter((entry) => entry.missing.length > 0 || entry.missingCapabilities.length > 0);
}

/**
 * Claims that must never appear, with the decision that killed each. Phase 0 found all six on the
 * design artboard, which was drawn against the pitch rather than against section 11.
 */
export const FORBIDDEN_CLAIMS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b\d+\s+(sources|integrations)\b/i,
    reason:
      "A source count. Section 11.9 narrows the scope to four connectors plus bought SERP; the artboard advertised 22.",
  },
  {
    // Section 11.5's vocabulary, not just the word "competitor" — the artboard's Competitors card
    // sells the whole dropped module ("Prices, app rankings, reviews and the ads they run")
    // without once using it.
    pattern:
      /\b(competitor|rival)\b|\bapp (rank|ranks|ranking|rankings)\b|\breview (spike|spikes|tracking)\b|\bad librar(y|ies)\b|\bprice (cut|cuts|tracking|monitoring)\b/i,
    reason:
      "Section 11.5 drops the market module. Competitors survive only as diagnose enrichment.",
  },
  {
    pattern: /\b(suppression list|exclusion list|audience sync|push (a )?segment)\b/i,
    reason: "Section 11.4 defers writes past the MVP.",
  },
  {
    pattern: /\bnothing monthly\b|\bpay as you go\b/i,
    reason:
      "Section 11.3 decides two units, with performance metered per connected account per month.",
  },
  {
    pattern: /\b(rank|ranked|position)\s+\d+\s+in\s+(ai|chatgpt|perplexity|gemini)\b/i,
    reason: "Section 11.8: report confidence intervals, never a single rank.",
  },
  {
    pattern: /\bfrankfurt\b|\buk gdpr\b|\bsaml sso\b|\bsso included\b/i,
    reason:
      "Unsupported anywhere in the specification, and the entity is Thai. See docs/marketplane/01-brand-identity.md.",
  },

  /* --- Certification claims. ------------------------------------------------------------------
   *
   * A CERTIFICATION IS A THIRD PARTY'S ATTESTATION, AND NOTHING IN THIS REPOSITORY CONFERS ONE.
   * SOC 2 Type II is a CPA's report on operating effectiveness over an observation window; ISO/IEC
   * 27001 is an accredited body's certificate against an ISMS. `brand.soc2TypeIIReport` and
   * `brand.iso27001Certificate` are both false, so the `soc2` and `iso27001` claims above are
   * withheld -- but a withheld claim only stops copy that goes THROUGH `claim()`, and issue #49 is
   * entirely about the hand-written sentence that goes round it. These patterns are the other half.
   *
   * THE PATTERNS ARE BUILT AGAINST THIS LIST'S OWN NEAR-MISSES, which are recorded rather than
   * theoretical: `/\b\d+\s+(sources|integrations)\b/` let "200+ integrations" through because the
   * "+" sat exactly where the regex expected whitespace, and the competitor pattern catches
   * "competitor" but not "competitors" because `\b` fails before the plural. So the separator here
   * is `\W{0,3}` rather than `\s`, which takes "SOC 2", "SOC2", "SOC-2", "SOC . 2" and "ISO/IEC
   * 27001" alike, and the bare standard number is banned on its own line because "certified to
   * 27001" names no acronym at all.
   *
   * WHEN A CERTIFICATE IS ACTUALLY OBTAINED, the fix is to delete the matching pattern here in the
   * same change that flips the brand fact. That is not a chore -- `brand.test.ts` asserts no
   * ALLOWED claim matches a forbidden pattern, so flipping the fact turns the suite red until the
   * ban goes. A compliance claim therefore cannot be published by a one-character edit.
   */
  {
    pattern: /\bsoc\W{0,3}2\b|\bservice organi[sz]ation control\b/i,
    reason:
      "SOC 2 is a CPA firm's report, not a property of a codebase, and brand.soc2TypeIIReport is " +
      "false. A Type II report additionally requires an observation window that no engineering " +
      "work shortens. Delete this pattern in the change that flips the fact.",
  },
  {
    pattern: /\biso\W{0,6}(?:iec\W{0,3})?27001\b|\b27001\b/i,
    reason:
      "ISO/IEC 27001 is an accredited certification body's certificate against an ISMS, and " +
      "brand.iso27001Certificate is false. Implementing every technical control in Annex A does " +
      "not produce one. Delete this pattern in the change that flips the fact.",
  },
  {
    // The ACRONYMS STAY LEGAL deliberately: a privacy notice has to be able to name the law it
    // operates under, and `governing-law` above does exactly that. What is banned is the
    // ASSERTION -- "compliant", "certified", "fully" -- because that is the part nobody can
    // substantiate and a reader relies on.
    pattern:
      /\b(?:gdpr|pdpa|ccpa|hipaa|soc\W{0,3}2|iso)\W{0,3}(?:compliant|compliance|certified|accredited)\b|\bcompliant\s+with\s+(?:the\s+)?(?:gdpr|pdpa)\b|\b(?:fully|100%|completely|certified)\s+(?:gdpr|pdpa)\b/i,
    reason:
      "A compliance assertion a reader would rely on. The GDPR claim is separately withheld " +
      "because brand.euRepresentative is null -- the entity is Thai and no Article 27 " +
      "representative is appointed -- and the PDPA is a law this entity is subject to rather than " +
      "a badge it holds. Name the law; do not assert a verdict on it.",
  },
  {
    pattern:
      /\b(?:independently|third[\s-]party|externally)\W{0,3}(?:audited|certified|assessed|verified|pen(?:etration)?[\s-]?tested)\b|\bpen(?:etration)?[\s-]?test(?:ed|ing)\b/i,
    reason:
      "An audit or penetration test is a thing a named third party did on a stated date, and " +
      "none has been commissioned. apps/web/app/privacy/page.tsx already states the rule this " +
      "enforces: no certification, audit, attestation or compliance claim appears on that page, " +
      "because the company is pre-launch and holds none of them.",
  },
];
