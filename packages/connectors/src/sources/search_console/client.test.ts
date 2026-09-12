import { ExtractError, type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  SEARCH_CONSOLE_MAX_PAGE_ROWS,
  SEARCH_CONSOLE_REPORTS,
  SearchConsoleClientError,
  type SearchConsoleClientOptions,
  querySearchAnalytics,
  querySearchAnalyticsPages,
  searchAnalyticsUrl,
} from "./client.ts";
import { SearchConsoleNormalizeError } from "./normalize.ts";

const TOKEN = "ya29.a0-THE-CUSTOMERS-ACCESS-TOKEN";
const SITE = "sc-domain:example.test";

/** No real waiting, no real randomness, no real host. */
const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0.5,
  now: () => new Date("2026-09-11T02:00:00Z"),
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
 * It THROWS when the queue is exhausted rather than replaying the last response, for the reason
 * `sources/ga4/client.test.ts` records: replaying turned a paging bug into a suite that HUNG rather
 * than one that failed, which in CI is a twenty-minute timeout instead of a red test. It matters
 * more here than it did there -- Search Console publishes no row total, so paging has no
 * authoritative stop condition to check against in the first place.
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

function client(fetchImpl: typeof fetch, siteUrl = SITE): SearchConsoleClientOptions {
  return {
    fetchImpl,
    accessToken: TOKEN,
    siteUrl,
    baseUrl: "https://gsc.test/webmasters/v3",
    retry: RETRY,
  };
}

const REQUEST = {
  dimensions: SEARCH_CONSOLE_REPORTS.byQuery,
  startDate: "2026-08-14",
  endDate: "2026-08-14",
};

function page(rows: number, aggregation = "byProperty") {
  return {
    body: {
      rows: Array.from({ length: rows }, (_, i) => ({
        keys: ["2026-08-14", `query ${i}`],
        clicks: 1,
        impressions: 2,
        ctr: 0.5,
        position: 3,
      })),
      responseAggregationType: aggregation,
    },
  };
}

describe("the request this client actually sends", () => {
  it("sends an explicit rowLimit, because the platform default silently truncates at 1,000", async () => {
    const { calls, fetchImpl } = recorder([page(2)]);
    await querySearchAnalytics(client(fetchImpl), REQUEST);
    expect(calls[0]?.body.rowLimit).toBe(10_000);
    expect(calls[0]?.body.startRow).toBe(0);
  });

  it("names the data state and the search type rather than inheriting either default", async () => {
    // dataState decides WHICH data comes back and the search type decides what it MEANS, and the
    // envelope has no dimension to label a search type with. A default that changes underneath
    // this connector changes every historical row's meaning with no response saying so.
    const { calls, fetchImpl } = recorder([page(1)]);
    await querySearchAnalytics(client(fetchImpl), REQUEST);
    expect(calls[0]?.body.dataState).toBe("final");
    expect(calls[0]?.body.type).toBe("web");
  });

  it("forwards the dimensions and the inclusive window verbatim", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    await querySearchAnalytics(client(fetchImpl), REQUEST);
    expect(calls[0]?.body.dimensions).toEqual(["date", "query"]);
    expect(calls[0]?.body.startDate).toBe("2026-08-14");
    expect(calls[0]?.body.endDate).toBe("2026-08-14");
  });

  it("carries the customer's token as a bearer credential and nothing of ours", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    await querySearchAnalytics(client(fetchImpl), REQUEST);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    ["sc-domain:example.test", "sc-domain%3Aexample.test"],
    ["https://example.test/", "https%3A%2F%2Fexample.test%2F"],
  ])("percent-encodes the property %s into one path segment", (siteUrl, encoded) => {
    // A URL-prefix property carries `:` and `/`, which are path separators in the template it is
    // substituted into. Unencoded, one segment becomes four and the request addresses something
    // that is not this customer's property.
    expect(searchAnalyticsUrl("https://gsc.test/webmasters/v3", siteUrl)).toBe(
      `https://gsc.test/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    );
  });

  it("uses that encoding on the wire, not only in the helper", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    await querySearchAnalytics(client(fetchImpl, "https://example.test/"), REQUEST);
    expect(calls[0]?.url).toBe(
      "https://gsc.test/webmasters/v3/sites/https%3A%2F%2Fexample.test%2F/searchAnalytics/query",
    );
  });

  it("reports what the page was asked for, so the normaliser cannot be given a different list", async () => {
    // The response echoes no dimension names. Carrying the request's list forward is the only thing
    // that says what keys[0] means, and a remembered pairing is one that eventually goes wrong.
    const { fetchImpl } = recorder([page(1, "byPage")]);
    const result = await querySearchAnalytics(client(fetchImpl), REQUEST);
    expect(result.dimensions).toEqual(["date", "query"]);
    expect(result.responseAggregationType).toBe("byPage");
    expect(result.dataState).toBe("final");
  });
});

describe("refusing before the request, where a refusal is free", () => {
  it("refuses a rowLimit outside the platform's range rather than letting it clamp", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    await expect(
      querySearchAnalytics(client(fetchImpl), { ...REQUEST, rowLimit: 0 }),
    ).rejects.toThrow(/rowLimit/);
    await expect(
      querySearchAnalytics(client(fetchImpl), {
        ...REQUEST,
        rowLimit: SEARCH_CONSOLE_MAX_PAGE_ROWS + 1,
      }),
    ).rejects.toThrow(/rowLimit/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a negative startRow", async () => {
    const { fetchImpl } = recorder([page(1)]);
    const error = await querySearchAnalytics(client(fetchImpl), {
      ...REQUEST,
      startRow: -1,
    }).catch((e: unknown) => e);
    expect((error as SearchConsoleClientError).code).toBe("bad_start_row");
  });

  it("refuses an impossible date and a window that ends before it starts", async () => {
    const { calls, fetchImpl } = recorder([page(1)]);
    await expect(
      querySearchAnalytics(client(fetchImpl), { ...REQUEST, startDate: "2026-02-30" }),
    ).rejects.toThrow(/real calendar date/);
    await expect(
      querySearchAnalytics(client(fetchImpl), {
        ...REQUEST,
        startDate: "2026-08-15",
        endDate: "2026-08-14",
      }),
    ).rejects.toThrow(/ends before it starts/);
    expect(calls).toHaveLength(0);
  });

  it("validates the dimensions before spending a request on them", async () => {
    // The refusal belongs to the normaliser either way. Raising it here costs nothing; raising it
    // after the response costs a round trip against a per-site ceiling shared with the customer.
    const { calls, fetchImpl } = recorder([page(1)]);
    const error = await querySearchAnalytics(client(fetchImpl), {
      ...REQUEST,
      dimensions: ["date", "query", "page"],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchConsoleNormalizeError);
    expect((error as SearchConsoleNormalizeError).code).toBe("composite_grain");
    expect(calls).toHaveLength(0);
  });
});

describe("credential hygiene", () => {
  it("keeps the access token out of every error message it raises", async () => {
    // Gate 4. An error message is a log line, and a bearer token in a log is a credential under a
    // different retention policy with a different audience.
    const html = (async () =>
      new Response("<html>502 from a proxy</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    const error = await querySearchAnalytics(client(html), REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchConsoleClientError);
    expect((error as SearchConsoleClientError).code).toBe("unparseable_body");
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).toContain(SITE);
  });

  it("does not retry a rejected grant, so the reconnect prompt is not delayed", async () => {
    // 401 is the customer's to fix. Retrying spends a per-site ceiling shared with their own tools
    // to earn the same 401 again, and delays the only signal that gets them to reconnect.
    const { calls, fetchImpl } = recorder([{ status: 401, body: { error: { code: 401 } } }]);
    const error = await querySearchAnalytics(client(fetchImpl), REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect((error as ExtractError).kind).toBe("auth");
    expect(calls).toHaveLength(1);
  });
});

describe("pagination, where this platform gives nothing to stop on", () => {
  async function collect(gen: AsyncGenerator<{ rows: number }, void, undefined>) {
    const seen: number[] = [];
    for await (const p of gen) seen.push(p.rows);
    return seen;
  }

  it("stops on a short page, which is the only end-of-report signal Search Console sends", async () => {
    const { calls, fetchImpl } = recorder([page(3)]);
    expect(
      await collect(querySearchAnalyticsPages(client(fetchImpl), { ...REQUEST, rowLimit: 5 })),
    ).toEqual([3]);
    expect(calls).toHaveLength(1);
  });

  it("pages past a full page, because a full page may not be the last one", async () => {
    // There is no rowCount to check against and no cursor to be absent, so a report that divides
    // evenly always costs one extra request that returns nothing. That is the correct trade
    // against a report that silently stops short.
    const { calls, fetchImpl } = recorder([page(3), page(3), page(1)]);
    expect(
      await collect(querySearchAnalyticsPages(client(fetchImpl), { ...REQUEST, rowLimit: 3 })),
    ).toEqual([3, 3, 1]);
    expect(calls.map((c) => c.body.startRow)).toEqual([0, 3, 6]);
  });

  it("treats an absent rows key as the end, rather than as a TypeError", async () => {
    // Search Console omits `rows` entirely on a quiet day, which is also the ordinary case at the
    // newest end of a backfill under dataState: final.
    const { fetchImpl } = recorder([{ body: { responseAggregationType: "byProperty" } }]);
    expect(await collect(querySearchAnalyticsPages(client(fetchImpl), REQUEST))).toEqual([0]);
  });

  it("refuses at the page cap rather than returning a report that may be short", async () => {
    // A response that always returns exactly rowLimit rows has no termination condition at all, and
    // a generator with no termination condition inside a Workflow step is a timeout, not an error.
    const { fetchImpl } = recorder([page(2), page(2)]);
    const error = await collect(
      querySearchAnalyticsPages(client(fetchImpl), { ...REQUEST, rowLimit: 2 }, 2),
    ).catch((e: Error) => e);
    expect((error as SearchConsoleClientError).code).toBe("page_cap");
    expect((error as Error).message).toContain("no row total");
  });

  it("yields the completed pages before the cap refusal reaches the caller", async () => {
    // A caller iterating with `for await` sees every finished page first. Swallowing the error
    // instead would report a possibly-short report as a whole one.
    const { fetchImpl } = recorder([page(2), page(2)]);
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const p of querySearchAnalyticsPages(
          client(fetchImpl),
          { ...REQUEST, rowLimit: 2 },
          2,
        )) {
          seen.push(p.rows);
        }
      })(),
    ).rejects.toThrow(/Refusing/);
    expect(seen).toEqual([2, 2]);
  });
});
