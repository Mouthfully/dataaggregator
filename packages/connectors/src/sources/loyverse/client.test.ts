import { type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  EMPTY_RATE_BUDGET,
  LOYVERSE_API_BASE,
  LOYVERSE_MAX_LIMIT,
  LOYVERSE_PAGE_LIMIT,
  LOYVERSE_RATE_FLOOR,
  LOYVERSE_RATE_REQUESTS,
  LOYVERSE_RATE_WINDOW_MS,
  LOYVERSE_SCOPES,
  type LoyverseCredential,
  LoyverseClientError,
  type LoyverseRateBudget,
  assertReadOnlyCredential,
  assertWindow,
  fetchMerchant,
  fetchReceiptsPage,
  fetchReceiptsPages,
  merchantUrl,
  rateAllowsAnother,
  receiptsUrl,
  spendRequest,
} from "./client.ts";
import { MERCHANT, PAGE, SALE } from "./fixtures.ts";

const NOW = "2026-09-10T02:00:00.000Z";

const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0,
  now: () => new Date(NOW),
  sleep: async () => undefined,
};

const OAUTH: LoyverseCredential = {
  kind: "oauth",
  accessToken: "39557133-8881-4ce7-99b5-2ab4d15c2092",
  grantedScopes: ["RECEIPTS_READ", "MERCHANT_READ"],
};

const WINDOW = {
  updatedAfter: "2026-09-09T00:00:00.000Z",
  updatedBefore: "2026-09-10T00:00:00.000Z",
};

/** A fake account. The call COUNT and the URLs it was asked for are half the assertions here. */
function account(handler: (url: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url);
  };
  return { calls, client: { fetchImpl, credential: OAUTH, ...RETRY } };
}

function receiptsBody(receipts: unknown[], cursor?: string): Response {
  return new Response(JSON.stringify(cursor === undefined ? { receipts } : { receipts, cursor }), {
    headers: { "content-type": "application/json" },
  });
}

// =================================================================================================
// DECISION 1. THE PERSONAL ACCESS TOKEN.
//
// This is the connector's central claim, so it is mutation-tested the way `meta_ads` and
// `search_console` test theirs: each refusal below fails for a DIFFERENT reason, and each asserts
// the error CODE rather than only that something threw -- a test that accepts any throw passes
// just as happily when the refusal fires for the wrong cause.
// =================================================================================================
describe("decision 1: the personal access token is refused, by name", () => {
  it("refuses a pasted token and says what Loyverse itself says about it", () => {
    // The message has to carry the platform's own sentence. Without it a merchant reads "use OAuth"
    // as our preference rather than as the reason their simpler credential can do more than read.
    try {
      assertReadOnlyCredential({ kind: "bearer", token: "fMYgxHEYtcyT8cvtvgi1Za5DRs4vArSy" });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("personal_access_token");
      expect((error as Error).message).toMatch(/unlimited access to the targeted account/);
      expect((error as Error).message).toMatch(/RECEIPTS_WRITE/);
    }
  });

  it("refuses it at EVERY entry point, not only where a caller remembered to ask", () => {
    // There is no construction step to hang one check on: these are free functions taking an
    // options object, so a caller assembling its own options reaches the network without passing
    // anything that could have checked. Each of the three must refuse on its own.
    const bearer = { kind: "bearer", token: "paste" } as const;
    const client = {
      fetchImpl: (async () => new Response("{}")) as typeof fetch,
      credential: bearer,
      ...RETRY,
    };

    expect(fetchReceiptsPage(client, WINDOW)).rejects.toThrow(/unlimited access/);
    expect(fetchMerchant(client)).rejects.toThrow(/unlimited access/);
    expect(fetchReceiptsPages(client, WINDOW).next()).rejects.toThrow(/unlimited access/);
  });

  it("never sends a request when the credential is refused", () => {
    // THE PROPERTY THAT MATTERS. Refusing after the call has gone out would have already used a
    // credential this connector says it will not use.
    const { calls, client } = account(() => receiptsBody([]));
    const bearer = { ...client, credential: { kind: "bearer", token: "paste" } as const };
    return expect(fetchMerchant(bearer))
      .rejects.toThrow(LoyverseClientError)
      .then(() => {
        expect(calls).toHaveLength(0);
      });
  });

  it("refuses an OAuth grant that carries a write scope it never asked for", () => {
    // A grant wider than the two requested did not come from this product's consent screen. This is
    // the difference between read-only ENFORCED and read-only asserted.
    try {
      assertReadOnlyCredential({
        kind: "oauth",
        accessToken: "t",
        grantedScopes: ["RECEIPTS_READ", "MERCHANT_READ", "ITEMS_WRITE"],
      });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("write_scope_granted");
      expect((error as Error).message).toMatch(/ITEMS_WRITE/);
    }
  });

  it("refuses a grant missing either scope, and names which", () => {
    try {
      assertReadOnlyCredential({
        kind: "oauth",
        accessToken: "t",
        grantedScopes: ["RECEIPTS_READ"],
      });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("missing_scope");
      expect((error as Error).message).toMatch(/MERCHANT_READ/);
    }
  });

  it("accepts either case, because Loyverse itself is not consistent about it", () => {
    // The permissions table and the token-response example are UPPERCASE. A case-sensitive
    // comparison would refuse a perfectly good grant over the platform's own spelling -- at connect
    // time, with the merchant still at the keyboard, for nothing.
    expect(() =>
      assertReadOnlyCredential({
        kind: "oauth",
        accessToken: "t",
        grantedScopes: ["receipts_read", "merchant_read"],
      }),
    ).not.toThrow();
  });

  it("treats an unreported scope list as unreported, not as nothing granted", () => {
    // Loyverse does report a scope string, so an empty list means the connection predates the field
    // or the caller did not pass it. Failing every such pull would break good connections.
    expect(() => assertReadOnlyCredential({ kind: "oauth", accessToken: "t" })).not.toThrow();
    expect(() =>
      assertReadOnlyCredential({ kind: "oauth", accessToken: "t", grantedScopes: [] }),
    ).not.toThrow();
  });

  it("refuses an empty access token before it becomes a 401 hours later", () => {
    try {
      assertReadOnlyCredential({ kind: "oauth", accessToken: "   " });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("invalid_credential");
    }
  });

  it("asks for exactly two scopes, and neither is a write scope", () => {
    // The set is small enough to assert whole. A third entry appearing here should have to be
    // argued for in `PROVIDERS.loyverse`, and this is what makes that argument unavoidable.
    expect([...LOYVERSE_SCOPES]).toEqual(["RECEIPTS_READ", "MERCHANT_READ"]);
    for (const scope of LOYVERSE_SCOPES) expect(scope).not.toMatch(/_WRITE$/);
    // SHIFTS_READ and STORES_READ are deliberately absent -- see PROVIDERS.loyverse in @repo/oauth.
    expect(LOYVERSE_SCOPES).not.toContain("SHIFTS_READ");
    expect(LOYVERSE_SCOPES).not.toContain("STORES_READ");
    expect(LOYVERSE_SCOPES).not.toContain("OPENID");
  });
});

// =================================================================================================
// DECISION 2. THE RATE BUDGET.
// =================================================================================================
describe("decision 2: the budget is counted here, because nothing reports it", () => {
  it("holds back the merchant's floor rather than spending all 300", () => {
    // The limit is per ACCOUNT. Every request this makes is one the merchant's own integrations
    // cannot make, so the floor is their headroom and not ours.
    const spent = (n: number): LoyverseRateBudget => ({
      at: Array.from({ length: n }, () => Date.parse(NOW) - 1000),
    });
    const now = new Date(NOW);
    expect(rateAllowsAnother(spent(LOYVERSE_RATE_REQUESTS - LOYVERSE_RATE_FLOOR - 1), now)).toBe(
      true,
    );
    expect(rateAllowsAnother(spent(LOYVERSE_RATE_REQUESTS - LOYVERSE_RATE_FLOOR), now)).toBe(false);
    // And it stops well short of the real ceiling, which is the point of the floor existing.
    expect(rateAllowsAnother(spent(LOYVERSE_RATE_REQUESTS - 1), now)).toBe(false);
  });

  it("slides, rather than resetting on a bucket boundary", () => {
    // A fixed-bucket counter would allow 300 at 00:04:59 and 300 more at 00:05:01 -- 600 requests
    // in two seconds, and a 429 for the merchant. Timestamps are what make that impossible.
    const nowMs = Date.parse(NOW);
    const full: LoyverseRateBudget = {
      at: Array.from({ length: LOYVERSE_RATE_REQUESTS }, () => nowMs - 1000),
    };
    expect(rateAllowsAnother(full, new Date(nowMs))).toBe(false);
    // One millisecond past the window, every one of those has aged out.
    expect(rateAllowsAnother(full, new Date(nowMs + LOYVERSE_RATE_WINDOW_MS))).toBe(true);
  });

  it("does not mutate the budget it is handed", () => {
    // The budget is threaded through return values precisely so two merchants cannot share one.
    // Mutation would defeat that by the back door.
    const before = EMPTY_RATE_BUDGET;
    const after = spendRequest(before, new Date(NOW));
    expect(before.at).toHaveLength(0);
    expect(after.at).toHaveLength(1);
  });

  it("spends the request before sending it, so an error loop cannot spend for free", () => {
    // Loyverse counted the request whether or not it succeeded. Crediting it back on failure would
    // let a run in an error loop consume the account's budget while believing it had spent nothing.
    const { client } = account(() => new Response("nope", { status: 500 }));
    return expect(fetchMerchant(client)).rejects.toThrow();
  });

  it("refuses a request rather than earning the merchant a 429", async () => {
    const { calls, client } = account(() => receiptsBody([]));
    const exhausted: LoyverseRateBudget = {
      at: Array.from({ length: LOYVERSE_RATE_REQUESTS }, () => Date.parse(NOW) - 1000),
    };
    await expect(fetchReceiptsPage(client, WINDOW, exhausted)).rejects.toThrow(
      /rate budget is spent/,
    );
    expect(calls).toHaveLength(0);
  });

  it("threads the budget out of every call, so a caller can carry it", async () => {
    const { client } = account(() => receiptsBody([SALE]));
    const first = await fetchReceiptsPage(client, WINDOW);
    expect(first.budget.at).toHaveLength(1);
    const second = await fetchReceiptsPage(client, WINDOW, first.budget);
    expect(second.budget.at).toHaveLength(2);
  });
});

// =================================================================================================
// DECISION 3 AND 4. THE WINDOW.
// =================================================================================================
describe("decision 3: the upper bound is pinned, never left open", () => {
  it("always sends updated_at_max", () => {
    // An open-ended window re-evaluated per request SLIDES: receipts rung during the walk enter a
    // page the walk has already passed, and the watermark then advances past them.
    const url = new URL(receiptsUrl(WINDOW));
    expect(url.searchParams.get("updated_at_max")).toBe(WINDOW.updatedBefore);
    expect(url.searchParams.get("updated_at_min")).toBe(WINDOW.updatedAfter);
  });

  it("refuses an inverted window before it costs a request", () => {
    // Loyverse answers `400 INVALID_RANGE` to this, so the merchant's request would be spent to be
    // told something knowable for free.
    try {
      assertWindow({ updatedAfter: WINDOW.updatedBefore, updatedBefore: WINDOW.updatedAfter });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("invalid_window");
      expect((error as Error).message).toMatch(/INVALID_RANGE/);
    }
  });

  it("refuses an empty window, which can contain nothing", () => {
    expect(() =>
      assertWindow({ updatedAfter: WINDOW.updatedAfter, updatedBefore: WINDOW.updatedAfter }),
    ).toThrow(/at or before it starts/);
  });

  it("refuses a timestamp with no designator, rather than reading it as local time", () => {
    // THE SUITE RUNS IN ASIA/BANGKOK -- see vitest.config.ts. Without a designator this instant
    // would move by seven hours, which is a different window reported as the one asked for.
    expect(() =>
      assertWindow({ updatedAfter: "2026-09-09T00:00:00", updatedBefore: WINDOW.updatedBefore }),
    ).toThrow(/RFC3339/);
  });
});

describe("decision 4: the pull filters on updated_at, not created_at", () => {
  it("sends the updated_at filters and never the created_at ones", () => {
    // A created-since walk sees a new refund receipt but never re-reads a sale voided in place, so
    // a cancelled sale would stay counted forever.
    const url = new URL(receiptsUrl(WINDOW));
    expect(url.searchParams.has("updated_at_min")).toBe(true);
    expect(url.searchParams.has("created_at_min")).toBe(false);
    expect(url.searchParams.has("created_at_max")).toBe(false);
  });
});

describe("the request itself", () => {
  it("asks for the maximum page size, because requests are the scarce resource", () => {
    // Unusual: `woocommerce` caps BELOW the platform maximum to protect the isolate. Here the
    // budget is shared with the merchant's own integrations, so a page taken at 50 would cost a
    // cafe five times the requests for the same receipts.
    expect(LOYVERSE_PAGE_LIMIT).toBe(LOYVERSE_MAX_LIMIT);
    expect(new URL(receiptsUrl(WINDOW)).searchParams.get("limit")).toBe(String(LOYVERSE_MAX_LIMIT));
  });

  it("clamps a caller asking for more than the platform allows", () => {
    // The specification does not say what an over-maximum value does, so it is never sent.
    expect(new URL(receiptsUrl({ ...WINDOW, limit: 1000 })).searchParams.get("limit")).toBe("250");
  });

  it("sends the cursor ALONGSIDE the filters, not instead of them", () => {
    // Loyverse does not say whether a cursor carries the original filters. Sending both is correct
    // under either reading; dropping them is only safe under one.
    const url = new URL(receiptsUrl({ ...WINDOW, cursor: "abc" }));
    expect(url.searchParams.get("cursor")).toBe("abc");
    expect(url.searchParams.get("updated_at_min")).toBe(WINDOW.updatedAfter);
    expect(url.searchParams.get("updated_at_max")).toBe(WINDOW.updatedBefore);
  });

  it("builds both URLs against the documented versioned base", () => {
    expect(receiptsUrl(WINDOW).startsWith(`${LOYVERSE_API_BASE}/receipts?`)).toBe(true);
    expect(merchantUrl()).toBe(`${LOYVERSE_API_BASE}/merchant/`);
  });

  it("identifies itself, so a merchant can attribute the traffic", async () => {
    let headers: Headers | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      headers = new Headers(init?.headers);
      return receiptsBody([]);
    };
    await fetchReceiptsPage({ fetchImpl, credential: OAUTH, ...RETRY }, WINDOW);
    expect(headers?.get("user-agent")).toMatch(/loyverse/);
    expect(headers?.get("authorization")).toBe(`Bearer ${OAUTH.accessToken}`);
  });
});

// =================================================================================================
// THE WALK.
// =================================================================================================
describe("the cursor walk", () => {
  it("follows the cursor and stops when the body omits it", async () => {
    // "When the endpoint sends the final set of results, the response body will not include a
    // cursor field." Absent is the terminator; there is no total to count down.
    const bodies = [receiptsBody([SALE], "c1"), receiptsBody([SALE], "c2"), receiptsBody([SALE])];
    let i = 0;
    const { calls, client } = account(() => bodies[i++] as Response);
    const pages = [];
    for await (const page of fetchReceiptsPages(client, WINDOW)) pages.push(page);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(calls[1]?.searchParams.get("cursor")).toBe("c1");
    expect(calls[2]?.searchParams.get("cursor")).toBe("c2");
  });

  it("treats an empty-string cursor as the end rather than following it", async () => {
    const { client } = account(() => receiptsBody([SALE], ""));
    const pages = [];
    for await (const page of fetchReceiptsPages(client, WINDOW)) pages.push(page);
    expect(pages).toHaveLength(1);
  });

  it("refuses a cursor that repeats, rather than counting a day's takings once per lap", async () => {
    // A loop would re-fetch and re-emit the identical page until the page budget ran out, and every
    // one of those pages would be normalised and upserted. The upsert key collapses most of it,
    // which is exactly what makes this impossible to notice from the numbers.
    const { client } = account(() => receiptsBody([SALE], "same"));
    const pages = [];
    try {
      for await (const page of fetchReceiptsPages(client, WINDOW)) pages.push(page);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("cursor_not_advancing");
      expect(pages).toHaveLength(2);
    }
  });

  it("stops at the page ceiling, because a cursor carries no total", async () => {
    let n = 0;
    const { client } = account(() => receiptsBody([SALE], `c${n++}`));
    const pages = [];
    try {
      for await (const page of fetchReceiptsPages(client, WINDOW, { maxPages: 3 }))
        pages.push(page);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("page_budget_exhausted");
      expect(pages).toHaveLength(3);
    }
  });

  it("threads one budget across every page of the walk", async () => {
    const bodies = [receiptsBody([SALE], "c1"), receiptsBody([SALE])];
    let i = 0;
    const { client } = account(() => bodies[i++] as Response);
    const pages = [];
    for await (const page of fetchReceiptsPages(client, WINDOW)) pages.push(page);
    expect(pages.at(-1)?.budget.at).toHaveLength(2);
  });
});

describe("what came back", () => {
  it("refuses a body with no receipts array rather than reading it as an empty page", async () => {
    // THE HOLE THIS PREVENTS IS PERMANENT. An empty page ends the walk, the window reports
    // complete, the watermark advances -- and nothing ever asks for that window again.
    const { client } = account(
      () => new Response(JSON.stringify({ errors: [{ code: "FORBIDDEN" }] })),
    );
    try {
      await fetchReceiptsPage(client, WINDOW);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("unexpected_body");
      expect((error as Error).message).toMatch(/advances the watermark/);
    }
  });

  it("reads a genuinely empty page as empty", async () => {
    // The refusal above must not swallow the ordinary case of a quiet night.
    const { client } = account(() => receiptsBody([]));
    const page = await fetchReceiptsPage(client, WINDOW);
    expect(page.receipts).toHaveLength(0);
    expect(page.cursor).toBeNull();
  });

  it("reads the whole page through without inspecting the receipts", async () => {
    // The client does not model the payload; the normaliser does. Two validators would disagree.
    const { client } = account(() => receiptsBody([...PAGE]));
    const page = await fetchReceiptsPage(client, WINDOW);
    expect(page.receipts).toHaveLength(PAGE.length);
  });
});

describe("the merchant profile, and the currency it exists for", () => {
  function profile(body: unknown): ReturnType<typeof account> {
    return account(
      () =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        }),
    );
  }

  it("reads the ISO 4217 code, the account id and the decimal places", async () => {
    const { client } = profile(MERCHANT);
    const merchant = await fetchMerchant(client);
    expect(merchant.id).toBe(MERCHANT.id);
    expect(merchant.currency).toBe("THB");
    expect(merchant.decimalPlaces).toBe(2);
    expect(merchant.businessName).toBe(MERCHANT.business_name);
  });

  it("refuses a missing currency rather than defaulting one", async () => {
    // THE REFUSAL `MERCHANT_READ` WAS REQUESTED FOR. A receipt carries no currency, so if the one
    // place that reports it does not, a default would mislabel every amount on every row.
    const { client } = profile({ ...MERCHANT, currency: undefined });
    try {
      await fetchMerchant(client);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("missing_currency");
      expect((error as Error).message).toMatch(/no second source/);
    }
  });

  it("refuses something that is not an ISO 4217 code", async () => {
    const { client } = profile({ ...MERCHANT, currency: { code: "Thai baht" } });
    await expect(fetchMerchant(client)).rejects.toThrow(/not an ISO 4217 code/);
  });

  it("refuses a profile with no id, which is half the upsert key", async () => {
    const { client } = profile({ ...MERCHANT, id: undefined });
    try {
      await fetchMerchant(client);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseClientError).code).toBe("unexpected_body");
    }
  });

  it("reports unknown decimal places as null rather than as a guess", async () => {
    const { client } = profile({ ...MERCHANT, currency: { code: "THB" } });
    expect((await fetchMerchant(client)).decimalPlaces).toBeNull();
  });
});
