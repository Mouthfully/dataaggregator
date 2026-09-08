import { planBackfill } from "@repo/extract";
import type { BackfillWindow, FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  GA4_DEFAULT_REPORT,
  type Ga4BackfillBatch,
  runGa4Backfill,
  windowToRequest,
} from "./backfill.js";
import { Ga4ClientError, type Ga4ClientOptions } from "./client.js";
import { GA4_METRIC_MAP } from "./normalize.js";

const FETCHED_AT = "2026-09-08T02:00:00Z";
const PROPERTY = "properties/123456";

const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0.5,
  now: () => new Date(FETCHED_AT),
  sleep: async () => undefined,
};

function win(from: string, to: string, tier: BackfillWindow["tier"] = "daily"): BackfillWindow {
  return { from, to, tier, reason: "test" };
}

function quota(remaining = 39_900) {
  return {
    tokensPerDay: { consumed: 100, remaining: 199_900 },
    tokensPerHour: { consumed: 100, remaining },
    tokensPerProjectPerHour: { consumed: 100, remaining: 13_900 },
    concurrentRequests: { consumed: 1, remaining: 9 },
  };
}

/** A response body for `n` days starting at `startDay` of August 2026. */
function body(startDay: number, n: number, rowCount = n, propertyQuota = quota()) {
  return {
    dimensionHeaders: [{ name: "date" }],
    metricHeaders: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
    rows: Array.from({ length: n }, (_, i) => ({
      dimensionValues: [{ value: `202608${String(startDay + i).padStart(2, "0")}` }],
      metricValues: [{ value: "100" }, { value: "5" }, { value: "12.50" }],
    })),
    rowCount,
    metadata: { currencyCode: "EUR", timeZone: "Europe/Berlin" },
    propertyQuota,
  };
}

function recorder(responses: unknown[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const next = responses[bodies.length];
    if (next === undefined) throw new Error(`unexpected request ${bodies.length + 1}`);
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { bodies, fetchImpl };
}

function client(fetchImpl: typeof fetch): Ga4ClientOptions {
  return {
    fetchImpl,
    accessToken: "ya29.customer-token",
    propertyId: PROPERTY,
    baseUrl: "https://ga4.test/v1beta",
    retry: RETRY,
  };
}

async function collect(gen: AsyncGenerator<Ga4BackfillBatch, void, undefined>) {
  const batches: Ga4BackfillBatch[] = [];
  for await (const b of gen) batches.push(b);
  return batches;
}

describe("what the default report asks for", () => {
  it("requests exactly one revenue metric, because two would be refused", () => {
    // totalRevenue, purchaseRevenue and eventValue all map to conversions_value. The normaliser
    // refuses a report carrying two of them precisely so this choice is made in the open.
    const revenue = GA4_DEFAULT_REPORT.metrics.filter(
      (m) => GA4_METRIC_MAP[m] === "conversions_value",
    );
    expect(revenue).toEqual(["totalRevenue"]);
  });

  it("always asks for the date dimension, which the normaliser and the upsert key both require", () => {
    expect(GA4_DEFAULT_REPORT.dimensions).toContain("date");
  });

  it("asks only for metrics the dictionary knows, so a pull cannot fail at normalise time", () => {
    // A metric absent from the map would be fetched -- spending the customer's quota -- and then
    // refused. Catching it here costs nothing.
    for (const metric of GA4_DEFAULT_REPORT.metrics) {
      expect(GA4_METRIC_MAP[metric], `${metric} has no dictionary entry`).toBeDefined();
    }
  });

  it("maps a window onto GA4's inclusive date range with no off-by-one", () => {
    const request = windowToRequest(win("2026-08-01", "2026-08-07"));
    expect(request.dateRanges).toEqual([{ startDate: "2026-08-01", endDate: "2026-08-07" }]);
  });
});

describe("running a plan", () => {
  it("issues one request per window and emits rows for each", async () => {
    const { bodies, fetchImpl } = recorder([body(14, 1), body(13, 1), body(12, 1)]);
    const batches = await collect(
      runGa4Backfill({
        client: client(fetchImpl),
        windows: [
          win("2026-08-14", "2026-08-14"),
          win("2026-08-13", "2026-08-13"),
          win("2026-08-12", "2026-08-12"),
        ],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batches.map((b) => b.rows.length)).toEqual([1, 1, 1]);
    expect(bodies).toHaveLength(3);
    expect(bodies.map((b) => (b.dateRanges as Array<{ startDate: string }>)[0]?.startDate)).toEqual(
      ["2026-08-14", "2026-08-13", "2026-08-12"],
    );
  });

  it("emits rows the envelope accepts, carrying the run's single fetched_at", async () => {
    const { fetchImpl } = recorder([body(14, 2)]);
    const [batch] = await collect(
      runGa4Backfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-15")],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batch?.rows).toHaveLength(2);
    for (const row of batch?.rows ?? []) {
      expect(row.fetched_at).toBe(FETCHED_AT);
      expect(row.dimensions.attribution_window).toBe("model");
      expect(row.metrics.sessions).toBe(100);
    }
  });

  it("sets first_seen_at to fetched_at, leaving immutability to the upsert", async () => {
    // A connector has no store and cannot know whether a row already exists. Claiming otherwise here
    // would put the product's one durable guarantee in the layer least able to keep it.
    const { fetchImpl } = recorder([body(14, 1)]);
    const [batch] = await collect(
      runGa4Backfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batch?.rows[0]?.first_seen_at).toBe(FETCHED_AT);
  });

  it("carries the quota reading through to the caller", async () => {
    const { fetchImpl } = recorder([body(14, 1)]);
    const [batch] = await collect(
      runGa4Backfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batch?.quota?.tokensPerProjectPerHour).toEqual({ consumed: 100, remaining: 13_900 });
  });

  it("runs the real plan planBackfill produces for GA4", async () => {
    // The tiering is @repo/extract's; this asserts the two units actually fit together rather than
    // testing the planner again.
    const plan = planBackfill({
      source: "ga4",
      today: "2026-09-08",
      earliestDate: "2026-01-01",
      lastBackfillAt: "2026-09-07T02:00:00Z",
    });
    const { bodies, fetchImpl } = recorder(plan.windows.map(() => body(14, 1)));
    const batches = await collect(
      runGa4Backfill({ client: client(fetchImpl), windows: plan.windows, fetchedAt: FETCHED_AT }),
    );
    expect(batches).toHaveLength(plan.windows.length);
    expect(bodies).toHaveLength(plan.requestCount);
  });
});

describe("stopping on quota", () => {
  it("ends the whole plan, not just the window, because windows share one property's quota", async () => {
    const { bodies, fetchImpl } = recorder([
      // Window 1 completes.
      body(14, 1),
      // Window 2 pages, and the first page comes back under the floor with more rows to fetch.
      body(13, 1, 5, quota(10)),
    ]);
    const gen = runGa4Backfill({
      client: client(fetchImpl),
      windows: [
        win("2026-08-14", "2026-08-14"),
        win("2026-08-13", "2026-08-13"),
        win("2026-08-12", "2026-08-12"),
      ],
      fetchedAt: FETCHED_AT,
      limit: 1,
    });

    const seen: number[] = [];
    const error = await (async () => {
      try {
        for await (const b of gen) seen.push(b.rows.length);
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect((error as Ga4ClientError).code).toBe("quota_floor");
    // The third window was never requested: two requests, not three.
    expect(bodies).toHaveLength(2);
    // And the completed work was handed over before the error, newest first.
    expect(seen).toEqual([1, 1]);
  });

  it("propagates a non-quota failure instead of ending the plan quietly", async () => {
    // A no-progress page means GA4 is behaving in a way this connector does not model. Returning
    // there would report a partial backfill as a finished one -- the exact failure the unit exists
    // to refuse -- and it is the one mutation that survived the first pass.
    const { bodies, fetchImpl } = recorder([body(14, 1), body(13, 0, 5)]);
    const gen = runGa4Backfill({
      client: client(fetchImpl),
      windows: [win("2026-08-14", "2026-08-14"), win("2026-08-13", "2026-08-13")],
      fetchedAt: FETCHED_AT,
      limit: 1,
    });
    const batches: Ga4BackfillBatch[] = [];
    const error = await (async () => {
      try {
        for await (const b of gen) batches.push(b);
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect((error as Ga4ClientError).code).toBe("no_progress");
    // The first window is handed over; the second yields nothing, because a response this connector
    // does not understand is not a source of rows.
    expect(batches.map((b) => b.window.from)).toEqual(["2026-08-14"]);
    expect(bodies).toHaveLength(2);
  });

  it("drops rows already collected when the failure is not a quota stop", async () => {
    // The distinction only shows when a window has ALREADY produced rows before failing: one good
    // page, then a page that makes no progress. A quota stop would hand those rows over; an
    // unmodelled response does not, because rows salvaged from a response we no longer trust are
    // worse than no rows.
    const { fetchImpl } = recorder([body(14, 1, 5), body(13, 0, 5)]);
    const gen = runGa4Backfill({
      client: client(fetchImpl),
      windows: [win("2026-08-14", "2026-08-18")],
      fetchedAt: FETCHED_AT,
      limit: 1,
    });
    const batches: Ga4BackfillBatch[] = [];
    const error = await (async () => {
      try {
        for await (const b of gen) batches.push(b);
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect((error as Ga4ClientError).code).toBe("no_progress");
    expect(batches).toEqual([]);
  });

  it("reports the finished windows rather than discarding them", async () => {
    const { fetchImpl } = recorder([body(14, 1), body(13, 1, 5, quota(10))]);
    const gen = runGa4Backfill({
      client: client(fetchImpl),
      windows: [win("2026-08-14", "2026-08-14"), win("2026-08-13", "2026-08-13")],
      fetchedAt: FETCHED_AT,
      limit: 1,
    });
    const batches: Ga4BackfillBatch[] = [];
    await expect(
      (async () => {
        for await (const b of gen) batches.push(b);
      })(),
    ).rejects.toThrow(/quota/);
    expect(batches.map((b) => b.window.from)).toEqual(["2026-08-14", "2026-08-13"]);
  });
});
