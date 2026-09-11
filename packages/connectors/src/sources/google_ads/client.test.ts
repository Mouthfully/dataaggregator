import { ExtractError, type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_ADS_API_BASE,
  GOOGLE_ADS_API_VERSION,
  type GoogleAdsBudget,
  GoogleAdsClientError,
  type GoogleAdsClientOptions,
  type GoogleAdsPage,
  budgetAllowsAnother,
  readBudget,
  search,
  searchPages,
} from "./client.js";

const ACCESS_TOKEN = "ya29.a0-THE-CUSTOMERS-ACCESS-TOKEN";
const DEVELOPER_TOKEN = "THE-WORKSPACES-OWN-DEVELOPER-TOKEN";
const CUSTOMER_ID = "1234567890";
const QUERY =
  "SELECT customer.id, customer.currency_code, customer.time_zone, campaign.id, segments.date, " +
  "metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '2026-08-01' AND '2026-08-02'";

/** No real waiting, no real randomness, no real host. */
const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0.5,
  now: () => new Date("2026-09-08T02:00:00Z"),
  sleep: async () => undefined,
};

interface Call {
  url: string;
  init: RequestInit | undefined;
  body: Record<string, unknown>;
}

/**
 * A fetch that records what it was asked and replays a queue of responses.
 *
 * THROWS when the queue is exhausted rather than replaying the last response, for the reason
 * recorded in `sources/ga4/client.test.ts`: replaying meant a paging bug looped forever and HUNG
 * the suite instead of failing it, which in CI is a twenty-minute timeout rather than a red test.
 * Each test declares exactly how many requests it expects.
 */
function recorder(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const next = responses[calls.length];
    if (next === undefined) {
      throw new Error(
        `the client made request ${calls.length + 1} with only ${responses.length} queued: it is ` +
          "paging past the end of the report",
      );
    }
    calls.push({
      url: String(url),
      init,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const BASIC: GoogleAdsBudget = { tier: "basic", consumedToday: 0 };

function client(
  fetchImpl: typeof fetch,
  overrides: Partial<GoogleAdsClientOptions> = {},
): GoogleAdsClientOptions {
  return {
    fetchImpl,
    accessToken: ACCESS_TOKEN,
    developerToken: DEVELOPER_TOKEN,
    customerId: CUSTOMER_ID,
    baseUrl: "https://ads.test/v21",
    retry: RETRY,
    budget: BASIC,
    ...overrides,
  };
}

function page(rows: number, nextPageToken?: string) {
  return {
    body: {
      fieldMask: "customer.id,campaign.id,segments.date,metrics.costMicros",
      results: Array.from({ length: rows }, (_, index) => ({
        customer: { id: CUSTOMER_ID },
        campaign: { id: `2200${index}` },
        segments: { date: "2026-08-14" },
        metrics: { costMicros: "1000000" },
      })),
      ...(nextPageToken === undefined ? {} : { nextPageToken }),
    },
  };
}

async function collect(pages: AsyncGenerator<GoogleAdsPage, void, undefined>) {
  const seen: GoogleAdsPage[] = [];
  for await (const one of pages) seen.push(one);
  return seen;
}

describe("the request this client actually sends", () => {
  it("posts a GAQL query to the account's search endpoint", async () => {
    const { calls, fetchImpl } = recorder([page(2)]);
    await search(client(fetchImpl), QUERY);
    expect(calls[0]?.url).toBe(`https://ads.test/v21/customers/${CUSTOMER_ID}/googleAds:search`);
    expect(calls[0]?.body.query).toBe(QUERY);
    // Absent, not null: a first page has no token, and sending an empty one is a 400 that spends
    // an operation.
    expect("pageToken" in (calls[0]?.body ?? {})).toBe(false);
  });

  it("carries BOTH credentials, and both belong to the workspace", async () => {
    // Gate 1. OAuth alone does not authenticate an Ads request: every call carries a developer
    // token as well, and Google's policy forbids letting a customer avoid obtaining their own. Both
    // are arguments opened from the per-workspace vault -- there is no environment read here to
    // fall back to.
    const { calls, fetchImpl } = recorder([page(1)]);
    await search(client(fetchImpl, { loginCustomerId: "9876543210" }), QUERY);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers["developer-token"]).toBe(DEVELOPER_TOKEN);
    expect(headers["login-customer-id"]).toBe("9876543210");
  });

  it("omits login-customer-id when there is no manager account in front of the account", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    await search(client(fetchImpl), QUERY);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["login-customer-id"]).toBeUndefined();
  });

  it("pins the API version in one place, because that is the part with an expiry date", () => {
    expect(GOOGLE_ADS_API_BASE.endsWith(`/${GOOGLE_ADS_API_VERSION}`)).toBe(true);
  });
});

describe("refusing locally, because a rejected request still spends an operation", () => {
  it("refuses the dashed customer id the Google UI shows, without calling anything", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    const error = await search(client(fetchImpl, { customerId: "123-456-7890" }), QUERY).catch(
      (e: unknown) => e,
    );
    expect((error as GoogleAdsClientError).code).toBe("bad_customer_id");
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty developer token without calling anything", async () => {
    // A blank token is a 401 that spends an operation and tells the customer nothing about why.
    const { calls, fetchImpl } = recorder([page(1)]);
    const error = await search(client(fetchImpl, { developerToken: "  " }), QUERY).catch(
      (e: unknown) => e,
    );
    expect((error as GoogleAdsClientError).code).toBe("missing_developer_token");
    expect(calls).toHaveLength(0);
  });

  it("refuses a Test-tier token outright rather than reporting an empty account", async () => {
    // A Test developer token reaches test accounts only. A pull under one does not fail partway --
    // it returns a confident, empty, entirely wrong report about an account it never looked at.
    const { calls, fetchImpl } = recorder([page(1)]);
    const error = await search(
      client(fetchImpl, { budget: { tier: "test", consumedToday: 0 } }),
      QUERY,
    ).catch((e: unknown) => e);
    expect((error as GoogleAdsClientError).code).toBe("test_tier");
    expect(calls).toHaveLength(0);
  });

  it("refuses to issue when the day's budget is already under the floor", async () => {
    // GA4's client cannot do this -- it has no quota reading until a response arrives. Here the
    // ceiling is knowable in advance, so spending an operation to discover it is exhausted would
    // be spending the thing being protected.
    const { calls, fetchImpl } = recorder([page(1)]);
    const error = await search(
      client(fetchImpl, { budget: { tier: "explorer", consumedToday: 2_593 } }),
      QUERY,
    ).catch((e: unknown) => e);
    expect((error as GoogleAdsClientError).code).toBe("budget_floor");
    expect(calls).toHaveLength(0);
  });
});

describe("credential hygiene", () => {
  it("keeps both tokens out of every error message it raises", async () => {
    // Gate 4. An error message is a log line. This request carries two secrets where GA4 carries
    // one, and the developer token is the credential a whole workspace's pulls run on.
    const html = (async () =>
      new Response("<html>502 from a proxy</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    const error = await search(client(html), QUERY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleAdsClientError);
    expect((error as GoogleAdsClientError).code).toBe("unparseable_body");
    expect((error as Error).message).not.toContain(ACCESS_TOKEN);
    expect((error as Error).message).not.toContain(DEVELOPER_TOKEN);
    expect((error as Error).message).toContain(CUSTOMER_ID);
  });

  it("does not retry a rejected grant, and counts the one operation it spent", async () => {
    // 401 is the customer's to fix. Retrying spends from a ceiling every other call under this
    // developer token draws on, to earn the same 401 again.
    const spend: number[] = [];
    const { calls, fetchImpl } = recorder([{ status: 401, body: { error: { code: 401 } } }]);
    const error = await search(
      client(fetchImpl, { onOperation: (info) => spend.push(info.consumed) }),
      QUERY,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect((error as ExtractError).kind).toBe("auth");
    expect(calls).toHaveLength(1);
    // The call threw, so its budget reading never reached the caller. `onOperation` is how the
    // governor hears about quota spent by a failure -- which is the case that spends the most.
    expect(spend).toEqual([1]);
  });
});

describe("counting operations, because nothing in the response reports them", () => {
  it("reports what this call spent and what remains of the day", async () => {
    const { fetchImpl } = recorder([page(2)]);
    const result = await search(
      client(fetchImpl, { budget: { tier: "basic", consumedToday: 100 } }),
      QUERY,
    );
    expect(result.budget.spent).toBe(1);
    expect(result.budget.consumed).toBe(101);
    expect(result.budget.operationsPerDay).toBe(15_000);
    expect(result.budget.remaining).toBe(14_899);
  });

  it("counts a retried attempt, because Google counts the request it rejected", async () => {
    // The whole point of the counter. A 500 that succeeds on the second attempt costs TWO
    // operations, and a client that counted only successes would under-report exactly the days a
    // platform incident made expensive.
    const { calls, fetchImpl } = recorder([
      { status: 500, body: { error: { code: 500 } } },
      page(1),
    ]);
    const result = await search(client(fetchImpl), QUERY);
    expect(calls).toHaveLength(2);
    expect(result.budget.spent).toBe(2);
  });

  it("reports an unlimited tier as unlimited rather than as a large number", () => {
    const reading = readBudget({ tier: "standard", consumedToday: 1_000_000 }, 1);
    expect(reading.operationsPerDay).toBeNull();
    expect(reading.remaining).toBeNull();
    expect(budgetAllowsAnother(reading).allowed).toBe(true);
  });

  it("allows a request exactly at the floor and refuses the one past it", () => {
    // Explorer is 2,880/day and the floor is 10%: 288 remaining is allowed, 287 is not.
    expect(
      budgetAllowsAnother(readBudget({ tier: "explorer", consumedToday: 2_592 }, 0)).allowed,
    ).toBe(true);
    expect(
      budgetAllowsAnother(readBudget({ tier: "explorer", consumedToday: 2_593 }, 0)).allowed,
    ).toBe(false);
  });

  it("never reports a negative remainder once the day is overspent", () => {
    expect(readBudget({ tier: "explorer", consumedToday: 3_000 }, 0).remaining).toBe(0);
  });
});

describe("paging, where a report goes quietly short", () => {
  it("follows nextPageToken until the platform stops offering one", async () => {
    const { calls, fetchImpl } = recorder([page(2, "TOKEN-A"), page(2, "TOKEN-B"), page(1)]);
    const seen = await collect(searchPages(client(fetchImpl), QUERY));
    expect(seen.map((one) => one.rows)).toEqual([2, 2, 1]);
    expect(calls.map((call) => call.body.pageToken)).toEqual([undefined, "TOKEN-A", "TOKEN-B"]);
  });

  it("makes exactly one request when the first page is the whole report", async () => {
    const { calls, fetchImpl } = recorder([page(2)]);
    expect(await collect(searchPages(client(fetchImpl), QUERY))).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("accumulates spend across pages so the floor tightens as the report is paged", async () => {
    const { fetchImpl } = recorder([page(1, "TOKEN-A"), page(1)]);
    const seen = await collect(
      searchPages(client(fetchImpl, { budget: { tier: "basic", consumedToday: 10 } }), QUERY),
    );
    expect(seen.map((one) => one.budget.consumed)).toEqual([11, 12]);
  });

  it("refuses rather than looping when a page returns nothing but offers more", async () => {
    const { fetchImpl } = recorder([page(2, "TOKEN-A"), page(0, "TOKEN-B")]);
    const error = await collect(searchPages(client(fetchImpl), QUERY)).catch((e: unknown) => e);
    expect((error as GoogleAdsClientError).code).toBe("no_progress");
  });

  it("refuses a page token it has already followed", async () => {
    // The same infinite loop with a disguise: Google hands back a token that walks in a circle and
    // the generator re-emits rows it has already yielded, forever.
    const { fetchImpl } = recorder([page(2, "TOKEN-A"), page(2, "TOKEN-A")]);
    const error = await collect(searchPages(client(fetchImpl), QUERY)).catch((e: unknown) => e);
    expect((error as GoogleAdsClientError).code).toBe("no_progress");
  });

  it("stops mid-report at the budget floor, after yielding what completed", async () => {
    // Half a report emitted as if whole is a total quietly too low. The completed page is yielded
    // and the remainder is a job for the next sweep. Only ONE response is queued: a client that
    // paged on would hit the recorder's end-of-queue throw instead.
    const { fetchImpl } = recorder([page(2, "TOKEN-A")]);
    const seen: GoogleAdsPage[] = [];
    let caught: unknown;
    try {
      for await (const one of searchPages(
        client(fetchImpl, { budget: { tier: "explorer", consumedToday: 2_592 } }),
        QUERY,
      )) {
        seen.push(one);
      }
    } catch (error) {
      caught = error;
    }
    expect(seen).toHaveLength(1);
    expect((caught as GoogleAdsClientError).code).toBe("budget_floor");
    expect((caught as Error).message).toContain("next scheduled sweep");
  });

  it("checks the floor only when there is another page to fetch", async () => {
    // A last page that takes the budget under the floor is not an error: the work is finished, and
    // refusing there would throw away a complete report over a request that will never be made.
    // Same budget as the test above -- the only difference is that Google offered no next page.
    const { fetchImpl } = recorder([page(2)]);
    const seen = await collect(
      searchPages(client(fetchImpl, { budget: { tier: "explorer", consumedToday: 2_592 } }), QUERY),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.budget.remaining).toBe(287);
  });
});
