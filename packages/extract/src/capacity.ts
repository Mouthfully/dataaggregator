/**
 * How many connected accounts one Google Ads developer token can carry.
 *
 * This exists because the answer decides a product question, not an engineering one, and because a
 * number in a design note that nothing checks is a number that drifts.
 *
 * Google Ads daily operation limits are per DEVELOPER TOKEN, not per account and not per customer
 * (specification section 11.7). A developer token identifies the application, so a single shared
 * token means every tenant draws on the same ceiling. That makes "how many customers fit" a function of the
 * access tier and of how many requests the backfill planner issues per account — which is exactly
 * what `planBackfill` already decides.
 *
 * The arithmetic matters because it is compared against a business number. Specification section 0
 * puts the survival range at 240 to 400 paying accounts.
 */

export interface AccessTier {
  readonly name: string;
  /** Operations per day, across every tenant sharing the token. */
  readonly operationsPerDay: number | null;
  readonly howObtained: string;
}

/** Section 11.7, settled by the specification's fact-check against three conflicting lenses. */
export const GOOGLE_ADS_TIERS: Record<"test" | "explorer" | "basic" | "standard", AccessTier> = {
  test: {
    name: "Test",
    operationsPerDay: 0,
    howObtained: "Immediate, but reaches test accounts only. No production data at all.",
  },
  explorer: {
    name: "Explorer",
    operationsPerDay: 2_880,
    howObtained:
      "Immediate, against production accounts. Blocks account creation, user management, keyword " +
      "planning and billing. Google may auto-upgrade a Test token to this.",
  },
  basic: {
    name: "Basic",
    operationsPerDay: 15_000,
    howObtained: "Granted after a five-business-day review. Apply in parallel with Explorer.",
  },
  standard: {
    name: "Standard",
    operationsPerDay: null,
    howObtained:
      "Unlimited. RMF categories are defined by what a tool DISPLAYS, so whether a headless API " +
      "can qualify at all is unresolved (section 11.11, High severity). Needs a written answer " +
      "from Google before anything is designed that depends on it.",
  },
};

export interface Capacity {
  readonly tier: string;
  readonly operationsPerDay: number | null;
  readonly requestsPerAccountPerDay: number;
  /** Null when the tier is unlimited. */
  readonly accountsSupported: number | null;
  readonly coversSurvivalNumber: boolean;
  readonly note: string;
}

/** Section 0: "Survival number: 240 to 400 paying accounts." */
export const SURVIVAL_ACCOUNTS = { low: 240, high: 400 } as const;

/**
 * Accounts one shared developer token supports at a given tier.
 *
 * `requestsPerAccountPerDay` should come from `planBackfill(...).requestCount` rather than a guess,
 * so this tracks whatever the scheduler actually does.
 *
 * DELIBERATELY OPTIMISTIC, and it should be read that way. Google counts operations, not requests: a
 * paginated report can cost more than one, and a rejected request still counts. The real figure is
 * lower than this, so treat the output as a ceiling rather than a plan.
 */
export function accountCapacity(options: {
  tier: keyof typeof GOOGLE_ADS_TIERS;
  requestsPerAccountPerDay: number;
}): Capacity {
  const tier = GOOGLE_ADS_TIERS[options.tier];

  if (options.requestsPerAccountPerDay <= 0) {
    throw new RangeError("accountCapacity: requests per account per day must be positive");
  }

  if (tier.operationsPerDay === null) {
    return {
      tier: tier.name,
      operationsPerDay: null,
      requestsPerAccountPerDay: options.requestsPerAccountPerDay,
      accountsSupported: null,
      coversSurvivalNumber: true,
      note: "Unlimited, if a headless product can qualify at all.",
    };
  }

  const accounts = Math.floor(tier.operationsPerDay / options.requestsPerAccountPerDay);
  const covers = accounts >= SURVIVAL_ACCOUNTS.high;

  return {
    tier: tier.name,
    operationsPerDay: tier.operationsPerDay,
    requestsPerAccountPerDay: options.requestsPerAccountPerDay,
    accountsSupported: accounts,
    coversSurvivalNumber: covers,
    note: covers
      ? `Covers the ${SURVIVAL_ACCOUNTS.high}-account survival target, before counting that Google bills operations rather than requests.`
      : `Falls short of the ${SURVIVAL_ACCOUNTS.high}-account survival target. Either a higher tier, or per-tenant developer tokens.`,
  };
}
