import type { FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  META_MAX_PAGE_ROWS,
  META_PAGE_ROWS,
  type MetaClientError,
  type MetaClientOptions,
  type MetaInsightsPage,
  type MetaInsightsRequest,
  type MetaUsage,
  getAdAccount,
  getInsightsPage,
  getInsightsPages,
  parseMetaUsage,
  usageAllowsAnother,
} from "./client.ts";

const TOKEN = "EAA-THE-CUSTOMERS-LONG-LIVED-TOKEN";
const ACCOUNT = "act_000000000000001";

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
}

/**
 * A fetch that records what it was asked and replays a queue of responses.
 *
 * It THROWS when the queue is exhausted rather than replaying the last response, for the reason
 * the GA4 client's recorder does: a paging bug that replays hangs the suite for twenty minutes in
 * CI instead of failing it. Each test declares how many requests it expects.
 */
function recorder(responses: Array<{ status?: number; body: unknown; headers?: HeadersInit }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const next = responses[calls.length];
    if (next === undefined) {
      throw new Error(
        `the client made request ${calls.length + 1} with only ${responses.length} queued: it is ` +
          "paging past the end of the report",
      );
    }
    calls.push({ url: String(url), init });
    const headers = new Headers(next.headers ?? {});
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function client(fetchImpl: typeof fetch, overrides: Partial<MetaClientOptions> = {}) {
  return {
    fetchImpl,
    accessToken: TOKEN,
    adAccountId: ACCOUNT,
    baseUrl: "https://meta.test/v21.0",
    retry: RETRY,
    ...overrides,
  } satisfies MetaClientOptions;
}

const REQUEST = {
  level: "campaign",
  fields: ["account_currency", "campaign_id", "spend", "actions"],
  since: "2026-08-01",
  until: "2026-08-02",
  attributionWindows: ["7d_click"],
} as const;

/**
 * `paging.next` carries the access token as a query parameter, which is why this fixture puts a
 * visible one in it: no test may ever see the client fetch that URL.
 */
function page(rows: unknown[], after: string | null) {
  if (after === null) return { data: rows };
  return {
    data: rows,
    paging: {
      cursors: { after },
      next: `https://graph.facebook.com/v21.0/${ACCOUNT}/insights?after=${after}&access_token=${TOKEN}`,
    },
  };
}

/**
 * A throttle header with DELIBERATELY INVENTED percentage field names.
 *
 * That is the assertion, not a shortcut. The specification names only `ads_api_access_tier` among
 * this header's fields and warns that its other figures do not appear in the cited source, so the
 * parser matches on the `_pct` SUFFIX rather than on any field name. A test using the real names --
 * if anyone ever learns them -- would prove nothing about that.
 */
function throttle(pct: number, tier = "development_access"): HeadersInit {
  return {
    "x-fb-ads-insights-throttle": JSON.stringify({
      whatever_meta_calls_it_util_pct: pct,
      some_other_util_pct: Math.max(pct - 10, 0),
      ads_api_access_tier: tier,
    }),
  };
}

describe("the request this client actually sends", () => {
  it("asks for one row per day, because the alternative is a month of spend on one date", async () => {
    const { calls, fetchImpl } = recorder([{ body: page([], null) }]);
    await getInsightsPage(client(fetchImpl), REQUEST);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("time_increment")).toBe("1");
  });

  it("names every attribution window it wants, never Meta's unnamed default", async () => {
    const { calls, fetchImpl } = recorder([{ body: page([], null) }]);
    await getInsightsPage(client(fetchImpl), {
      ...REQUEST,
      attributionWindows: ["1d_click", "7d_click", "28d_view"],
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(JSON.parse(url.searchParams.get("action_attribution_windows") ?? "[]")).toEqual([
      "1d_click",
      "7d_click",
      "28d_view",
    ]);
  });

  it("sends the level, fields, window and page size", async () => {
    const { calls, fetchImpl } = recorder([{ body: page([], null) }]);
    await getInsightsPage(client(fetchImpl), REQUEST);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe(`/v21.0/${ACCOUNT}/insights`);
    expect(url.searchParams.get("level")).toBe("campaign");
    expect(url.searchParams.get("fields")).toBe("account_currency,campaign_id,spend,actions");
    expect(JSON.parse(url.searchParams.get("time_range") ?? "{}")).toEqual({
      since: "2026-08-01",
      until: "2026-08-02",
    });
    expect(url.searchParams.get("limit")).toBe(String(META_PAGE_ROWS));
  });

  it("puts the credential in a header and never in a URL", async () => {
    // Platform-terms gate 4. Meta accepts `?access_token=`, and every URL this client builds ends
    // up in a log line, an error message or an R2 object key.
    const { calls, fetchImpl } = recorder([{ body: page([], null) }]);
    await getInsightsPage(client(fetchImpl), REQUEST);
    expect(calls[0]?.url).not.toContain(TOKEN);
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("accepts an ad account id in either spelling", async () => {
    const { calls, fetchImpl } = recorder([{ body: page([], null) }]);
    await getInsightsPage(client(fetchImpl, { adAccountId: "000000000000001" }), REQUEST);
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(`/v21.0/${ACCOUNT}/insights`);
  });
});

describe("the requests this client refuses to send", () => {
  const nothing = () => recorder([]).fetchImpl;

  // The cast is the point of these cases: each one is a request the type system already refuses,
  // and the check is that the CLIENT refuses it too -- a caller reaching this code from parsed
  // JSON has no compiler in front of it.
  const refusals: Array<[string, Record<string, unknown>, string]> = [
    ["no attribution window", { attributionWindows: [] }, "no_attribution_window"],
    ["a window Meta cannot select", { attributionWindows: ["model"] }, "bad_attribution_window"],
    ["a malformed date range", { since: "01/08/2026" }, "bad_date_range"],
    ["a page size above the bound", { limit: META_MAX_PAGE_ROWS + 1 }, "bad_limit"],
    ["a fractional page size", { limit: 1.5 }, "bad_limit"],
  ];

  it.each(refusals)("refuses %s", async (_name, overrides, code) => {
    // Every one of these would be a rejected call, and on Meta a rejected call counts against the
    // insights quota AND against the error rate that gates Full Access.
    const request = { ...REQUEST, ...overrides } as unknown as MetaInsightsRequest;
    await expect(getInsightsPage(client(nothing()), request)).rejects.toMatchObject({ code });
  });

  it("refuses an empty ad account id", async () => {
    await expect(
      getInsightsPage(client(nothing(), { adAccountId: "  " }), REQUEST),
    ).rejects.toMatchObject({ code: "bad_account_id" });
  });

  it("refuses a body that is not JSON", async () => {
    const fetchImpl = (async () =>
      new Response("<html>502</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    await expect(getInsightsPage(client(fetchImpl), REQUEST)).rejects.toMatchObject({
      code: "unparseable_body",
    });
  });

  it("refuses a response with no data array rather than reading it as an empty day", async () => {
    const { fetchImpl } = recorder([{ body: { error: { code: 17, message: "limit reached" } } }]);
    await expect(getInsightsPage(client(fetchImpl), REQUEST)).rejects.toMatchObject({
      code: "unparseable_body",
    });
  });

  it("names the account and never the token in its errors", async () => {
    const fetchImpl = (async () =>
      new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const error = (await getInsightsPage(client(fetchImpl), REQUEST).catch(
      (e: Error) => e,
    )) as Error;
    expect(error.message).toContain(ACCOUNT);
    expect(error.message).not.toContain(TOKEN);
  });
});

describe("paging", () => {
  it("follows the cursor and stops when Meta says there is no next page", async () => {
    const { calls, fetchImpl } = recorder([
      { body: page([{ a: 1 }], "CURSOR-1"), headers: throttle(10) },
      { body: page([{ a: 2 }], null), headers: throttle(12) },
    ]);
    const seen: MetaInsightsPage[] = [];
    for await (const p of getInsightsPages(client(fetchImpl), REQUEST)) seen.push(p);
    expect(seen).toHaveLength(2);
    expect(new URL(calls[1]?.url ?? "").searchParams.get("after")).toBe("CURSOR-1");
  });

  it("never fetches paging.next, because Meta embeds the token in it", async () => {
    const { calls, fetchImpl } = recorder([
      { body: page([{ a: 1 }], "CURSOR-1"), headers: throttle(10) },
      { body: page([{ a: 2 }], null), headers: throttle(12) },
    ]);
    for await (const _ of getInsightsPages(client(fetchImpl), REQUEST)) {
      // drain
    }
    for (const call of calls) {
      expect(call.url).not.toContain("access_token");
      expect(call.url.startsWith("https://meta.test/")).toBe(true);
    }
  });

  it("yields an empty page that carries a next cursor", async () => {
    // A page with no rows and a next link is legal on a cursor-paged edge. Treating an empty page
    // as the end would drop everything after it.
    const { fetchImpl } = recorder([
      { body: page([], "CURSOR-1"), headers: throttle(10) },
      { body: page([{ a: 1 }], null), headers: throttle(10) },
    ]);
    const seen: MetaInsightsPage[] = [];
    for await (const p of getInsightsPages(client(fetchImpl), REQUEST)) seen.push(p);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.rows).toHaveLength(1);
  });

  it("refuses when Meta promises another page and gives no cursor", async () => {
    const { fetchImpl } = recorder([
      { body: { data: [{ a: 1 }], paging: { next: "https://x/y" } }, headers: throttle(10) },
    ]);
    const iterate = async () => {
      for await (const _ of getInsightsPages(client(fetchImpl), REQUEST)) {
        // drain
      }
    };
    await expect(iterate()).rejects.toMatchObject({ code: "no_progress" });
  });

  it("refuses when the same cursor comes back twice", async () => {
    const { fetchImpl } = recorder([
      { body: page([{ a: 1 }], "CURSOR-1"), headers: throttle(10) },
      { body: page([{ a: 2 }], "CURSOR-1"), headers: throttle(10) },
    ]);
    const seen: MetaInsightsPage[] = [];
    const iterate = async () => {
      for await (const p of getInsightsPages(client(fetchImpl), REQUEST)) seen.push(p);
    };
    await expect(iterate()).rejects.toMatchObject({ code: "no_progress" });
    // Both completed pages were handed over before the refusal. Losing them would turn a paging
    // fault into a lost day.
    expect(seen).toHaveLength(2);
  });
});

describe("pacing, measured rather than assumed", () => {
  it("reads a utilisation percentage without knowing the field's name", () => {
    const usage = parseMetaUsage(new Headers(throttle(73, "standard_access")));
    expect(usage.utilisationPct).toBe(73);
    expect(usage.accessTier).toBe("standard_access");
  });

  it("reads a nested per-account usage header", () => {
    const usage = parseMetaUsage(
      new Headers({
        "x-business-use-case-usage": JSON.stringify({
          "000000000000001": [{ type: "ads_insights", call_count: 12, total_time_pct: 64 }],
        }),
      }),
    );
    expect(usage.utilisationPct).toBe(64);
  });

  it("takes the highest reading across every header", () => {
    const usage = parseMetaUsage(
      new Headers({
        ...(throttle(20) as Record<string, string>),
        "x-app-usage": JSON.stringify({ call_volume_pct: 88 }),
      }),
    );
    expect(usage.utilisationPct).toBe(88);
  });

  it("reads Meta's own estimate of when to come back, in seconds", () => {
    // Documented in minutes on the business-use-case header, and unverified against a live call.
    const usage = parseMetaUsage(
      new Headers({
        "x-business-use-case-usage": JSON.stringify({
          "000000000000001": [{ estimated_time_to_regain_access: 5 }],
        }),
      }),
    );
    expect(usage.regainAccessSeconds).toBe(300);
  });

  it("reports null, not zero, when Meta reported nothing", () => {
    // Zero would read as "we have spent none of it", which is a licence nobody gave us.
    const usage = parseMetaUsage(new Headers({}));
    expect(usage.utilisationPct).toBeNull();
    expect(usage.regainAccessSeconds).toBeNull();
    expect(usage.accessTier).toBeNull();
    expect(usageAllowsAnother(usage).allowed).toBe(true);
  });

  it("survives a header that is not JSON", () => {
    const usage = parseMetaUsage(new Headers({ "x-app-usage": "{not json" }));
    expect(usage.utilisationPct).toBeNull();
    expect(usage.raw["x-app-usage"]).toBeUndefined();
  });

  it("stops at the ceiling and lets the ceiling be told to it", () => {
    const usage: MetaUsage = {
      accessTier: null,
      utilisationPct: 82,
      regainAccessSeconds: null,
      raw: {},
    };
    expect(usageAllowsAnother(usage).allowed).toBe(false);
    expect(usageAllowsAnother(usage, 90).allowed).toBe(true);
  });

  it("hands every reading to the caller, so a tier upgrade is observable", async () => {
    // `ads_api_access_tier` is the instrumentation that confirms a Full Access upgrade took effect
    // (section 7). It is no use if only this module ever sees it.
    const seen: MetaUsage[] = [];
    const { fetchImpl } = recorder([{ body: page([], null), headers: throttle(5, "full_access") }]);
    await getInsightsPage(client(fetchImpl, { onUsage: (u) => seen.push(u) }), REQUEST);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.accessTier).toBe("full_access");
  });
});

describe("stopping early, with what finished handed over", () => {
  it("yields the completed pages before refusing at the ceiling", async () => {
    const { fetchImpl } = recorder([{ body: page([{ a: 1 }], "CURSOR-1"), headers: throttle(95) }]);
    const seen: MetaInsightsPage[] = [];
    const iterate = async () => {
      for await (const p of getInsightsPages(client(fetchImpl), REQUEST)) seen.push(p);
    };
    await expect(iterate()).rejects.toMatchObject({ code: "throttle_floor" });
    expect(seen).toHaveLength(1);
  });

  it("carries Meta's own wait back to the scheduler", async () => {
    const { fetchImpl } = recorder([
      {
        body: page([{ a: 1 }], "CURSOR-1"),
        headers: {
          "x-business-use-case-usage": JSON.stringify({
            "000000000000001": [{ estimated_time_to_regain_access: 20 }],
          }),
        },
      },
    ]);
    const iterate = async () => {
      for await (const _ of getInsightsPages(client(fetchImpl), REQUEST)) {
        // drain
      }
    };
    const error = (await iterate().catch((e: MetaClientError) => e)) as MetaClientError;
    expect(error.code).toBe("throttle_floor");
    expect(error.retryAfterSeconds).toBe(1200);
  });

  it("bounds a pull that Meta never reports any utilisation for", async () => {
    // The fallback is a guess and the message says so. Paging on against an unknown ceiling spends
    // an application score shared with every other tenant.
    const { fetchImpl } = recorder([
      { body: page([{ a: 1 }], "CURSOR-1") },
      { body: page([{ a: 2 }], "CURSOR-2") },
    ]);
    const seen: MetaInsightsPage[] = [];
    const iterate = async () => {
      const options = client(fetchImpl, { maxUnmeasuredPages: 2 });
      for await (const p of getInsightsPages(options, REQUEST)) seen.push(p);
    };
    const error = (await iterate().catch((e: MetaClientError) => e)) as MetaClientError;
    expect(error.code).toBe("throttle_floor");
    expect(error.message).toContain("a guess");
    expect(seen).toHaveLength(2);
  });

  it("resets the unmeasured count as soon as Meta reports something", async () => {
    const { fetchImpl } = recorder([
      { body: page([{ a: 1 }], "CURSOR-1") },
      { body: page([{ a: 2 }], "CURSOR-2"), headers: throttle(4) },
      { body: page([{ a: 3 }], null) },
    ]);
    const seen: MetaInsightsPage[] = [];
    const options = client(fetchImpl, { maxUnmeasuredPages: 2 });
    for await (const p of getInsightsPages(options, REQUEST)) seen.push(p);
    expect(seen).toHaveLength(3);
  });
});

describe("the ad account node, which is where the timezone comes from", () => {
  it("reads the currency and timezone the insights edge does not return", async () => {
    const { calls, fetchImpl } = recorder([
      { body: { id: ACCOUNT, currency: "THB", timezone_name: "Asia/Bangkok", name: "Synthetic" } },
    ]);
    const account = await getAdAccount(client(fetchImpl));
    expect(account).toEqual({
      id: ACCOUNT,
      currency: "THB",
      timezoneName: "Asia/Bangkok",
      name: "Synthetic",
    });
    expect(new URL(calls[0]?.url ?? "").searchParams.get("fields")).toBe(
      "currency,timezone_name,name",
    );
    expect(calls[0]?.url).not.toContain(TOKEN);
  });

  it("refuses an account node with no timezone rather than defaulting to UTC", async () => {
    // A Bangkok advertiser's day would move seven hours and still parse.
    const { fetchImpl } = recorder([{ body: { id: ACCOUNT, currency: "THB" } }]);
    await expect(getAdAccount(client(fetchImpl))).rejects.toMatchObject({
      code: "missing_account_profile",
    });
  });
});
