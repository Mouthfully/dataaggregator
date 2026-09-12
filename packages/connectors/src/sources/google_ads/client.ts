/**
 * Google Ads -> transport.
 *
 * The other half of the connector unit (specification section 13.3). `normalize.ts` turns a
 * response into envelope rows; this turns a GAQL query into responses. They are separate because
 * normalisation is testable without a credential and transport is not.
 *
 * THIS IS THE MIRROR IMAGE OF `sources/ga4/client.ts`, AND THE INVERSION IS THE DESIGN.
 *
 * GA4 prices a request by query complexity, so "per-call cost is unknowable at request time"
 * (specification section 7, line 710) -- that client CANNOT budget ahead and can only MEASURE,
 * which is why it asks for `propertyQuota` on every request.
 *
 * Google Ads is the opposite on both counts. The cost of a request is knowable -- it is one
 * operation -- and the platform reports NOTHING back about what remains: no quota header, no quota
 * field in the body, no ceiling in the error. So this client CANNOT measure and can only COUNT.
 * The budget is therefore an input rather than an output, and every page returns a reading of it,
 * which is the same obligation `Ga4Page.quota` discharges ("publish per-source budget consumption",
 * specification section 4.4 and platform-terms gate 16).
 *
 * A REJECTED REQUEST STILL COUNTS. That single fact from the Google Ads access findings is why the
 * counter increments when a request is ISSUED rather than when it succeeds, why a 401 costs exactly
 * one operation and is never retried (`@repo/extract` classifies it as `auth` and stops), and why
 * the two malformed-input cases below are refused LOCALLY, before any request exists to be rejected.
 * A dashed customer id sent to Google is a 400 that spends an operation to learn nothing.
 *
 * WHOSE CEILING IS THIS? The tenant's own. Google's developer policy forbids letting third parties
 * "avoid applying for their own Google Ads developer access and Google Cloud Platform project", so
 * the developer token is per-workspace, opened from the vault alongside the access token -- see
 * `developerToken` below. It is still a SHARED ceiling from the tenant's point of view, because the
 * same token backs their own scripts and any other tool they have built on it, and an overrun does
 * not degrade this product politely: it fails every request under that token for the rest of the
 * day. That asymmetry is why there is a floor rather than a hard stop at zero, and why over-counting
 * is the safe direction to be wrong in.
 */

import { GOOGLE_ADS_TIERS, type FetchOptions, fetchWithRetry } from "@repo/extract";
import type { GoogleAdsSearchResponse } from "./normalize.ts";

/**
 * The API version, as its own constant.
 *
 * It is the one part of this URL with an expiry date: Google sunsets a version roughly a year after
 * release, and a call to a retired version is a 404 that still spends an operation. A literal
 * buried in a template string is a literal nobody finds on the day it stops working.
 */
export const GOOGLE_ADS_API_VERSION = "v21";

/** `POST {base}/customers/{customerId}/googleAds:search`. Overridable so tests resolve no host. */
export const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

/**
 * Stop issuing requests when less than this fraction of the day's operations remains.
 *
 * The same 10% as GA4's quota floor and for a related reason, but not the same argument. GA4's
 * floor protects a ceiling the CUSTOMER's other tools draw on. This one protects the tenant's
 * developer token from being spent to exhaustion by a backfill, because what an overrun breaks is
 * every remaining call under that token that day -- including a re-authorisation check or a manual
 * pull somebody is waiting on. The remainder of a report is work for the next scheduled sweep.
 */
export const GOOGLE_ADS_BUDGET_FLOOR = 0.1;

export class GoogleAdsClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | "budget_floor"
      | "test_tier"
      | "no_progress"
      | "bad_customer_id"
      | "missing_developer_token"
      | "unparseable_body",
  ) {
    super(message);
    this.name = "GoogleAdsClientError";
  }
}

/**
 * The daily operation allowance this pull is drawing on.
 *
 * `consumedToday` is supplied by the caller because this client cannot know it. Operations are
 * counted per DEVELOPER TOKEN across every connection it backs, and a single connection's pull can
 * see only its own spend -- `connections.quota_used_today` and `quota_window_start` are where the
 * running total lives. A client that assumed zero would start every pull believing the day was
 * untouched.
 */
export interface GoogleAdsBudget {
  readonly tier: keyof typeof GOOGLE_ADS_TIERS;
  /** Operations already spent against this developer token today. */
  readonly consumedToday: number;
}

/** What a caller gets back, and what belongs in the response envelope's meta once it has a field. */
export interface GoogleAdsBudgetReading {
  readonly tier: string;
  /** Null on Standard, which is unlimited -- and which may be unreachable for a headless product. */
  readonly operationsPerDay: number | null;
  readonly consumed: number;
  readonly remaining: number | null;
  /** Operations this call spent, INCLUDING attempts the platform rejected. */
  readonly spent: number;
}

/** Fold this call's spend into the caller's running total. */
export function readBudget(budget: GoogleAdsBudget, spent: number): GoogleAdsBudgetReading {
  const tier = GOOGLE_ADS_TIERS[budget.tier];
  const consumed = budget.consumedToday + spent;
  return {
    tier: tier.name,
    operationsPerDay: tier.operationsPerDay,
    consumed,
    remaining:
      tier.operationsPerDay === null ? null : Math.max(tier.operationsPerDay - consumed, 0),
    spent,
  };
}

/**
 * Whether another request may be issued against this reading.
 *
 * A Test token is refused outright rather than by arithmetic. Its allowance is zero because it
 * reaches test accounts only -- no production data at all -- so a pull under one does not fail
 * partway, it produces a confident empty report about an account it never looked at.
 */
export function budgetAllowsAnother(
  reading: GoogleAdsBudgetReading,
  floor: number = GOOGLE_ADS_BUDGET_FLOOR,
): { allowed: boolean; reason: string } {
  if (reading.operationsPerDay === null) {
    return { allowed: true, reason: `${reading.tier} access has no daily operation limit` };
  }
  if (reading.operationsPerDay === 0) {
    return {
      allowed: false,
      reason:
        `${reading.tier} access reaches test accounts only and returns no production data. A pull ` +
        "under it would report an empty account rather than fail.",
    };
  }
  if ((reading.remaining ?? 0) / reading.operationsPerDay < floor) {
    return {
      allowed: false,
      reason:
        `${reading.consumed} of ${reading.operationsPerDay} operations are spent against this ` +
        `developer token today, leaving less than the ${floor} floor. Stopping rather than ` +
        "exhausting a ceiling that every other call under this token shares.",
    };
  }
  return { allowed: true, reason: "within floor" };
}

export interface GoogleAdsClientOptions {
  readonly fetchImpl: typeof fetch;
  /**
   * The CUSTOMER's OAuth access token, opened from the per-workspace vault per request. Never ours,
   * and never read from the environment: see `@repo/connections`, `openCredential`.
   */
  readonly accessToken: string;
  /**
   * The TENANT's OWN Google Ads developer token, opened from the same per-workspace vault --
   * `connections.developer_token_ciphertext` exists for exactly this. Google's developer policy
   * forbids a third party letting customers "avoid applying for their own Google Ads developer
   * access and Google Cloud Platform project", so this is a per-workspace credential like any
   * other, not a Worker secret shared across tenants.
   */
  readonly developerToken: string;
  /** The account being read. Digits only -- Google's UI shows `123-456-7890`, the API refuses it. */
  readonly customerId: string;
  /**
   * The manager account the developer token belongs to, when it is not the account being read.
   * Normal for an agency: the token is issued against the manager, the data lives under a client.
   */
  readonly loginCustomerId?: string;
  readonly baseUrl?: string;
  readonly retry: FetchOptions;
  readonly budget: GoogleAdsBudget;
  /**
   * Called as each request is ISSUED, so a caller meters spend even when the call then fails.
   *
   * Without it a 401 would spend an operation the governor never hears about, and the difference
   * compounds: the failure modes that spend the most quota are exactly the ones that throw.
   */
  readonly onOperation?: (info: { customerId: string; consumed: number }) => void;
}

export interface GoogleAdsPage {
  readonly response: GoogleAdsSearchResponse;
  readonly budget: GoogleAdsBudgetReading;
  readonly rows: number;
  /** Null when this was the last page. Google omits the field rather than sending an empty one. */
  readonly nextPageToken: string | null;
}

/** Google accepts digits only; the dashed form a customer copies out of the UI is a 400. */
const CUSTOMER_ID = /^\d{1,20}$/;

function assertCallable(options: GoogleAdsClientOptions): void {
  // BOTH OF THESE COST AN OPERATION IF LEFT TO GOOGLE, and rejected requests count. Refusing here
  // spends nothing and says which field is wrong, rather than returning a 400 whose body says
  // neither.
  if (!CUSTOMER_ID.test(options.customerId)) {
    throw new GoogleAdsClientError(
      `google_ads: customerId must be digits only, got ${JSON.stringify(options.customerId)}. ` +
        "Google's UI shows 123-456-7890; the API accepts 1234567890. Refusing locally because a " +
        "rejected request still spends an operation from the daily limit.",
      "bad_customer_id",
    );
  }
  if (options.loginCustomerId !== undefined && !CUSTOMER_ID.test(options.loginCustomerId)) {
    throw new GoogleAdsClientError(
      `google_ads: loginCustomerId must be digits only, got ` +
        `${JSON.stringify(options.loginCustomerId)}.`,
      "bad_customer_id",
    );
  }
  if (options.developerToken.trim() === "") {
    throw new GoogleAdsClientError(
      "google_ads: no developer token. Every Ads call carries one and OAuth alone does not " +
        "authenticate the request, so an empty value is a 401 that spends an operation and tells " +
        "the customer nothing. It is opened from the workspace vault; a blank one means the " +
        "connection was never completed.",
      "missing_developer_token",
    );
  }
}

/**
 * One page of a GAQL query.
 *
 * The budget is checked BEFORE the request is issued, which GA4's client cannot do -- it has no
 * reading until a response arrives. Here the ceiling is knowable in advance, so spending an
 * operation to discover it is exhausted would be spending the thing being protected.
 */
export async function search(
  options: GoogleAdsClientOptions,
  query: string,
  pageToken?: string,
): Promise<GoogleAdsPage> {
  assertCallable(options);

  const preflight = budgetAllowsAnother(readBudget(options.budget, 0));
  if (!preflight.allowed) {
    throw new GoogleAdsClientError(
      `google_ads: not issuing a request for customer ${options.customerId}. ${preflight.reason}`,
      GOOGLE_ADS_TIERS[options.budget.tier].operationsPerDay === 0 ? "test_tier" : "budget_floor",
    );
  }

  let spent = 0;
  // COUNT AT ISSUE, NOT AT RETURN, and count every attempt `fetchWithRetry` makes. Google counts a
  // request it rejected; it may well count one whose response never reached us. Over-counting costs
  // unused headroom, under-counting overruns a ceiling whose penalty is every call failing for the
  // rest of the day -- so the error is taken in the direction that is merely wasteful.
  const metered = ((url: string | URL | Request, init?: RequestInit) => {
    spent += 1;
    options.onOperation?.({
      customerId: options.customerId,
      consumed: options.budget.consumedToday + spent,
    });
    return options.fetchImpl(url as string, init);
  }) as unknown as typeof fetch;

  const response = await fetchWithRetry(
    metered,
    {
      url: `${options.baseUrl ?? GOOGLE_ADS_API_BASE}/customers/${options.customerId}/googleAds:search`,
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.accessToken}`,
          "developer-token": options.developerToken,
          ...(options.loginCustomerId === undefined
            ? {}
            : { "login-customer-id": options.loginCustomerId }),
          "content-type": "application/json",
        },
        body: JSON.stringify(pageToken === undefined ? { query } : { query, pageToken }),
      },
    },
    options.retry,
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    // NAMES THE ACCOUNT, NEVER EITHER CREDENTIAL. An error message is a log line, and this request
    // carries two secrets rather than GA4's one -- the access token and the developer token. A
    // developer token in a log is the credential a whole workspace's pulls run on.
    throw new GoogleAdsClientError(
      `google_ads: customer ${options.customerId} returned a body that is not JSON: ` +
        `${(cause as Error).message}`,
      "unparseable_body",
    );
  }

  const parsed = body as GoogleAdsSearchResponse;
  const token =
    typeof parsed.nextPageToken === "string" && parsed.nextPageToken !== ""
      ? parsed.nextPageToken
      : null;

  return {
    response: parsed,
    budget: readBudget(options.budget, spent),
    rows: parsed.results?.length ?? 0,
    nextPageToken: token,
  };
}

/**
 * Every page of a query, as an async generator.
 *
 * A GENERATOR RATHER THAN AN ARRAY, for the reason `fetchWithRetry` refuses to read a body: a
 * Worker isolate has 128 MB and a Workflow step output is capped at 1 MiB (`00-repo-map.md`
 * section 5). Accumulating a large report into one array is the shape that cannot be fixed later.
 *
 * THE COMPLETION SIGNAL IS `nextPageToken` AND NOTHING ELSE. GA4 can check its progress against
 * `rowCount`; a Google Ads response carries no total unless the query asks for one, so the absence
 * of a token is the only statement that a report is whole. That makes two loop shapes dangerous,
 * and both are refused rather than left to chance:
 *
 *   * a page that returns no rows while still offering a token -- continuing risks looping on an
 *     endpoint that will never advance, and stopping silently drops the remainder;
 *   * a token that repeats one already followed, which is the same loop with a disguise.
 *
 * Both refusals are stricter than anything Google documents. That is the right direction for a
 * guess: the failure is a loud error on a shape we have never seen, not a report that is quietly
 * short or a Workflow step that spins until it times out.
 */
export async function* searchPages(
  options: GoogleAdsClientOptions,
  query: string,
): AsyncGenerator<GoogleAdsPage, void, undefined> {
  let token: string | undefined;
  let spent = 0;
  let pages = 0;
  const followed = new Set<string>();

  for (;;) {
    // Each page sees the running total, so the floor tightens as the report is paged rather than
    // being judged once against the state at the start.
    const page = await search(
      {
        ...options,
        budget: { ...options.budget, consumedToday: options.budget.consumedToday + spent },
      },
      query,
      token,
    );
    spent += page.budget.spent;
    pages += 1;
    yield { ...page, budget: readBudget(options.budget, spent) };

    if (page.nextPageToken === null) return;

    if (page.rows === 0) {
      throw new GoogleAdsClientError(
        `google_ads: customer ${options.customerId} returned 0 rows on page ${pages} while still ` +
          "offering a next page token. Stopping rather than looping, and refusing rather than " +
          "returning a partial report as if it were whole.",
        "no_progress",
      );
    }
    if (followed.has(page.nextPageToken)) {
      throw new GoogleAdsClientError(
        `google_ads: customer ${options.customerId} returned a page token already followed on an ` +
          `earlier page of this query. Paging it again would repeat rows already emitted.`,
        "no_progress",
      );
    }
    followed.add(page.nextPageToken);

    const verdict = budgetAllowsAnother(readBudget(options.budget, spent));
    if (!verdict.allowed) {
      throw new GoogleAdsClientError(
        `google_ads: stopped after ${pages} page(s) for customer ${options.customerId}. ` +
          `${verdict.reason} The remainder is a job for the next scheduled sweep, not for a retry ` +
          "now.",
        "budget_floor",
      );
    }

    token = page.nextPageToken;
  }
}
