import { ExtractError, type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  GA4_MAX_PAGE_ROWS,
  Ga4ClientError,
  type Ga4ClientOptions,
  parsePropertyQuota,
  quotaAllowsAnother,
  runReport,
  runReportPages,
} from "./client.js";

const TOKEN = "ya29.a0-THE-CUSTOMERS-ACCESS-TOKEN";
const PROPERTY = "properties/123456";

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
 * It THROWS when the queue is exhausted rather than replaying the last response, and that is not
 * fussiness. Replaying meant a paging bug looped forever and HUNG the suite instead of failing it --
 * which in CI is a twenty-minute timeout rather than a red test. Each test now declares exactly how
 * many requests it expects, and one request too many is a fast, legible failure.
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

function client(fetchImpl: typeof fetch): Ga4ClientOptions {
  return {
    fetchImpl,
    accessToken: TOKEN,
    propertyId: PROPERTY,
    baseUrl: "https://ga4.test/v1beta",
    retry: RETRY,
  };
}

const REQUEST = {
  dimensions: [{ name: "date" }],
  metrics: [{ name: "sessions" }],
  dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-02" }],
};

function quota(overrides: Record<string, { consumed: number; remaining: number }>) {
  return {
    tokensPerDay: { consumed: 100, remaining: 199_900 },
    tokensPerHour: { consumed: 100, remaining: 39_900 },
    tokensPerProjectPerHour: { consumed: 100, remaining: 13_900 },
    concurrentRequests: { consumed: 1, remaining: 9 },
    ...overrides,
  };
}

function page(rows: number, rowCount: number, propertyQuota = quota({})) {
  return {
    body: {
      dimensionHeaders: [{ name: "date" }],
      metricHeaders: [{ name: "sessions" }],
      rows: Array.from({ length: rows }, (_, i) => ({
        dimensionValues: [{ value: `2026080${(i % 9) + 1}` }],
        metricValues: [{ value: "1" }],
      })),
      rowCount,
      metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
      propertyQuota,
    },
  };
}

describe("the request this client actually sends", () => {
  it("always asks for the quota, because per-call token cost is unknowable at request time", async () => {
    // Specification section 7: "token cost varying by query complexity so per-call cost is
    // unknowable at request time". Measurement is the only option, so the flag is not configurable.
    const { calls, fetchImpl } = recorder([page(2, 2)]);
    await runReport(client(fetchImpl), REQUEST);
    expect(calls[0]?.body.returnPropertyQuota).toBe(true);
  });

  it("sends an explicit limit, because GA4's default silently truncates at 10,000", async () => {
    const { calls, fetchImpl } = recorder([page(2, 2)]);
    await runReport(client(fetchImpl), REQUEST);
    expect(calls[0]?.body.limit).toBe(10_000);
    expect(calls[0]?.body.offset).toBe(0);
  });

  it("carries the customer's token as a bearer credential and nothing of ours", async () => {
    const { calls, fetchImpl } = recorder([page(2, 2)]);
    await runReport(client(fetchImpl), REQUEST);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.url).toBe(`https://ga4.test/v1beta/${PROPERTY}:runReport`);
  });

  it("refuses a limit outside GA4's accepted range rather than letting the platform clamp it", async () => {
    const { fetchImpl } = recorder([page(1, 1)]);
    await expect(runReport(client(fetchImpl), { ...REQUEST, limit: 0 })).rejects.toThrow(/limit/);
    await expect(
      runReport(client(fetchImpl), { ...REQUEST, limit: GA4_MAX_PAGE_ROWS + 1 }),
    ).rejects.toThrow(/limit/);
  });
});

describe("credential hygiene", () => {
  it("keeps the access token out of every error message it raises", async () => {
    // Gate 4. An error message is a log line, and a leaked bearer token in a log is a credential in
    // a place with a different retention policy and a different audience.
    const html = (async () =>
      new Response("<html>502 from a proxy</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    const error = await runReport(client(html), REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Ga4ClientError);
    expect((error as Ga4ClientError).code).toBe("unparseable_body");
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).toContain(PROPERTY);
  });

  it("does not retry a rejected grant, so the reconnect prompt is not delayed", async () => {
    // 401 is the customer's to fix. Retrying spends the property's hourly quota -- which is the
    // CUSTOMER's, shared with their other tools -- to earn the same 401 again.
    const { calls, fetchImpl } = recorder([{ status: 401, body: { error: { code: 401 } } }]);
    const error = await runReport(client(fetchImpl), REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect((error as ExtractError).kind).toBe("auth");
    expect(calls).toHaveLength(1);
  });
});

describe("reading the quota", () => {
  it("reports a missing group as absent rather than as zero", () => {
    // Zero remaining and "not reported" mean opposite things, and conflating them either stops a
    // healthy client or fails to stop an exhausted one.
    const parsed = parsePropertyQuota({
      propertyQuota: { tokensPerHour: { consumed: 1, remaining: 2 } },
    });
    expect(parsed?.tokensPerHour).toEqual({ consumed: 1, remaining: 2 });
    expect(parsed?.tokensPerDay).toBeNull();
  });

  it("returns null when the response carries no quota at all", () => {
    expect(parsePropertyQuota({})).toBeNull();
    expect(parsePropertyQuota(null)).toBeNull();
  });

  it("allows another request when the quota is unknown, rather than refusing on absence", () => {
    // Refusing on absent information would make a property that reports no quota unreadable.
    expect(quotaAllowsAnother(null).allowed).toBe(true);
  });

  it("stops when any depleting group falls under the floor", () => {
    const low = parsePropertyQuota({
      propertyQuota: quota({ tokensPerProjectPerHour: { consumed: 13_950, remaining: 50 } }),
    });
    const verdict = quotaAllowsAnother(low);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("tokensPerProjectPerHour");
  });

  it("ignores concurrentRequests, which is an in-flight count and not an allowance", () => {
    // A depletion floor on concurrency stops a healthy client the moment it reaches its own
    // concurrency limit: a self-inflicted stall dressed up as quota protection.
    const busy = parsePropertyQuota({
      propertyQuota: quota({ concurrentRequests: { consumed: 10, remaining: 0 } }),
    });
    expect(quotaAllowsAnother(busy).allowed).toBe(true);
  });
});

describe("pagination, where a report goes quietly short", () => {
  async function collect(gen: AsyncGenerator<{ rows: number }, void, undefined>) {
    const seen: number[] = [];
    for await (const p of gen) seen.push(p.rows);
    return seen;
  }

  it("pages until rowCount is satisfied", async () => {
    const { calls, fetchImpl } = recorder([page(3, 7), page(3, 7), page(1, 7)]);
    expect(await collect(runReportPages(client(fetchImpl), { ...REQUEST, limit: 3 }))).toEqual([
      3, 3, 1,
    ]);
    expect(calls.map((c) => c.body.offset)).toEqual([0, 3, 6]);
  });

  it("makes exactly one request when the first page is the whole report", async () => {
    const { calls, fetchImpl } = recorder([page(2, 2)]);
    expect(await collect(runReportPages(client(fetchImpl), REQUEST))).toEqual([2]);
    expect(calls).toHaveLength(1);
  });

  it("advances the offset by the rows RECEIVED, not by the limit requested", async () => {
    // A page that comes back short of the limit while rows remain is the case that separates the
    // two. `offset += limit` would step over the rows GA4 did not send, and the report would come
    // back short with nothing saying so. `offset += page.rows` is self-healing.
    const { calls, fetchImpl } = recorder([page(3, 7), page(2, 7), page(2, 7)]);
    expect(await collect(runReportPages(client(fetchImpl), { ...REQUEST, limit: 3 }))).toEqual([
      3, 2, 2,
    ]);
    expect(calls.map((c) => c.body.offset)).toEqual([0, 3, 5]);
  });

  it("refuses rather than looping when a page returns nothing but rowCount says more", async () => {
    const { fetchImpl } = recorder([page(3, 9), page(0, 9)]);
    const error = await collect(runReportPages(client(fetchImpl), { ...REQUEST, limit: 3 })).catch(
      (e: Error) => e,
    );
    expect((error as Ga4ClientError).code).toBe("no_progress");
  });

  it("refuses mid-report when the quota floor is reached, rather than returning half a report", async () => {
    // Half a report emitted as if it were whole is a total that is quietly too low. The remainder
    // is a job for the next sweep.
    const { fetchImpl } = recorder([
      page(3, 9, quota({ tokensPerHour: { consumed: 39_990, remaining: 10 } })),
    ]);
    const error = await collect(runReportPages(client(fetchImpl), { ...REQUEST, limit: 3 })).catch(
      (e: Error) => e,
    );
    expect((error as Ga4ClientError).code).toBe("quota_floor");
    expect((error as Error).message).toContain("3 of 9");
  });

  it("checks the floor only when there is another page to fetch", async () => {
    // A last page that exhausts the quota is not an error: the work is finished. Refusing there
    // would throw away a complete report over a request that will never be made.
    const { fetchImpl } = recorder([
      page(2, 2, quota({ tokensPerHour: { consumed: 39_999, remaining: 1 } })),
    ]);
    expect(await collect(runReportPages(client(fetchImpl), REQUEST))).toEqual([2]);
  });
});
