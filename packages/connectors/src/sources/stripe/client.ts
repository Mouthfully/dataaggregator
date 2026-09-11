import { type FetchOptions, fetchWithRetry } from "@repo/extract";

export const STRIPE_API_BASE = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-07-29.dahlia";
export const STRIPE_PAGE_LIMIT = 100;

export type StripeClientErrorCode = "unrestricted_key" | "invalid_response" | "pagination_stalled";

export class StripeClientError extends Error {
  constructor(
    message: string,
    readonly code: StripeClientErrorCode,
  ) {
    super(message);
    this.name = "StripeClientError";
  }
}

/**
 * Accept only restricted server keys. A secret key can write even though this client never does;
 * refusing it makes least privilege a property of onboarding rather than a sentence in a guide.
 */
export function stripeAuthorization(apiKey: string): string {
  if (!/^rk_(?:test|live)_[A-Za-z0-9]+$/.test(apiKey)) {
    throw new StripeClientError(
      "stripe: use a restricted rk_test_ or rk_live_ key with read access to Balance " +
        "Transactions and Account. Secret and publishable keys are refused.",
      "unrestricted_key",
    );
  }
  return `Basic ${btoa(`${apiKey}:`)}`;
}

function headers(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: stripeAuthorization(apiKey),
    "Stripe-Version": STRIPE_API_VERSION,
  };
}

export interface StripeBalanceQuery {
  readonly createdGte: number;
  readonly createdLt: number;
  readonly startingAfter?: string;
  readonly limit?: number;
}

export function balanceTransactionsUrl(query: StripeBalanceQuery): string {
  const params = new URLSearchParams({
    "created[gte]": String(query.createdGte),
    "created[lt]": String(query.createdLt),
    limit: String(Math.min(Math.max(query.limit ?? STRIPE_PAGE_LIMIT, 1), STRIPE_PAGE_LIMIT)),
  });
  if (query.startingAfter) params.set("starting_after", query.startingAfter);
  return `${STRIPE_API_BASE}/balance_transactions?${params.toString()}`;
}

export interface StripeListPage {
  readonly data: readonly unknown[];
  readonly hasMore: boolean;
}

export interface StripeFetchOptions extends FetchOptions {
  readonly fetchImpl: typeof fetch;
  readonly apiKey: string;
}

export async function fetchBalanceTransactionsPage(
  options: StripeFetchOptions,
  query: StripeBalanceQuery,
): Promise<StripeListPage> {
  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url: balanceTransactionsUrl(query),
      init: { method: "GET", headers: headers(options.apiKey) },
    },
    options,
  );
  const body = (await response.json()) as { data?: unknown; has_more?: unknown };
  if (!Array.isArray(body.data) || typeof body.has_more !== "boolean") {
    throw new StripeClientError(
      "stripe: the balance-transactions response is missing data[] or has_more",
      "invalid_response",
    );
  }
  return { data: body.data, hasMore: body.has_more };
}

/** Walk Stripe's cursor until `has_more` is false, with the time window pinned for the whole run. */
export async function fetchBalanceTransactions(
  options: StripeFetchOptions,
  query: Omit<StripeBalanceQuery, "startingAfter">,
): Promise<readonly unknown[]> {
  const transactions: unknown[] = [];
  let startingAfter: string | undefined;

  for (;;) {
    const page = await fetchBalanceTransactionsPage(options, { ...query, startingAfter });
    transactions.push(...page.data);
    if (!page.hasMore) return transactions;

    const last = page.data.at(-1) as { id?: unknown } | undefined;
    if (typeof last?.id !== "string" || last.id === startingAfter) {
      throw new StripeClientError(
        "stripe: has_more was true but the page supplied no new cursor; refusing an infinite loop",
        "pagination_stalled",
      );
    }
    startingAfter = last.id;
  }
}

export interface StripeAccountProbe {
  readonly accountId: string;
  readonly displayName: string | null;
}

/** Validate the key and both permissions while the merchant is still on the connect screen. */
export async function probeStripeConnection(
  options: StripeFetchOptions,
): Promise<StripeAccountProbe> {
  const accountResponse = await fetchWithRetry(
    options.fetchImpl,
    {
      url: `${STRIPE_API_BASE}/account`,
      init: { method: "GET", headers: headers(options.apiKey) },
    },
    options,
  );
  const account = (await accountResponse.json()) as {
    id?: unknown;
    business_profile?: { name?: unknown };
  };
  if (typeof account.id !== "string" || account.id === "") {
    throw new StripeClientError("stripe: the account response carries no id", "invalid_response");
  }

  await fetchBalanceTransactionsPage(options, {
    createdGte: 0,
    createdLt: Math.floor(options.now().getTime() / 1000) + 1,
    limit: 1,
  });

  return {
    accountId: account.id,
    displayName:
      typeof account.business_profile?.name === "string" ? account.business_profile.name : null,
  };
}
