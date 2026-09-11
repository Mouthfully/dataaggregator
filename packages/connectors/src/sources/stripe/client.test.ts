import { describe, expect, it } from "vitest";
import {
  STRIPE_API_VERSION,
  STRIPE_PAGE_LIMIT,
  StripeClientError,
  balanceTransactionsUrl,
  fetchBalanceTransactions,
  probeStripeConnection,
  stripeAuthorization,
} from "./client.js";

const API_KEY = "rk_test_abc123";
const NOW = new Date("2026-09-11T00:00:00Z");
const BASE_OPTIONS = {
  apiKey: API_KEY,
  random: () => 0.5,
  now: () => NOW,
  sleep: async () => {},
};

describe("least-privilege authentication", () => {
  it("accepts a restricted server key", () => {
    const encoded = stripeAuthorization(API_KEY).slice("Basic ".length);
    expect(atob(encoded)).toBe(`${API_KEY}:`);
  });

  it("refuses secret and publishable keys before a request can leave", () => {
    for (const key of ["sk_test_abc", "pk_test_abc", "", "rk_wrong"]) {
      expect(() => stripeAuthorization(key)).toThrow(StripeClientError);
    }
  });
});

describe("balance transaction pages", () => {
  it("pins a half-open created window and caps pages at Stripe's 100-row maximum", () => {
    const url = new URL(balanceTransactionsUrl({ createdGte: 100, createdLt: 200, limit: 500 }));
    expect(url.searchParams.get("created[gte]")).toBe("100");
    expect(url.searchParams.get("created[lt]")).toBe("200");
    expect(url.searchParams.get("limit")).toBe(String(STRIPE_PAGE_LIMIT));
  });

  it("walks starting_after until has_more is false", async () => {
    const urls: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      urls.push(url);
      expect(new Headers(init?.headers).get("stripe-version")).toBe(STRIPE_API_VERSION);
      const cursor = url.searchParams.get("starting_after");
      return new Response(
        JSON.stringify(
          cursor === null
            ? { data: [{ id: "txn_2" }, { id: "txn_1" }], has_more: true }
            : { data: [{ id: "txn_0" }], has_more: false },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const rows = await fetchBalanceTransactions(
      { ...BASE_OPTIONS, fetchImpl },
      { createdGte: 100, createdLt: 200 },
    );
    expect(rows).toHaveLength(3);
    expect(urls[1]?.searchParams.get("starting_after")).toBe("txn_1");
    expect(urls.every((url) => url.searchParams.get("created[lt]") === "200")).toBe(true);
  });

  it("refuses has_more with no cursor instead of looping forever", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [], has_more: true }), { status: 200 })) as typeof fetch;
    await expect(
      fetchBalanceTransactions({ ...BASE_OPTIONS, fetchImpl }, { createdGte: 100, createdLt: 200 }),
    ).rejects.toMatchObject({ code: "pagination_stalled" });
  });
});

describe("connect-time probe", () => {
  it("checks Account and Balance Transactions before accepting the connection", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      return new Response(
        JSON.stringify(
          url.endsWith("/account")
            ? { id: "acct_123", business_profile: { name: "Khao Studio" } }
            : { data: [], has_more: false },
        ),
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(probeStripeConnection({ ...BASE_OPTIONS, fetchImpl })).resolves.toEqual({
      accountId: "acct_123",
      displayName: "Khao Studio",
    });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/\/account$/);
    expect(urls[1]).toContain("/balance_transactions?");
  });
});
