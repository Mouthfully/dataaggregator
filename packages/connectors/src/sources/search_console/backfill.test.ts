import type { FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  SEARCH_CONSOLE_DEFAULT_REPORTS,
  type SearchConsoleBackfillBatch,
  type SearchConsoleBackfillError,
  type SearchConsoleCheckpoint,
  orderSearchConsoleReports,
  runSearchConsoleBackfill,
  searchConsoleBackfillChunks,
} from "./backfill.ts";
import type { SearchConsoleClientError, SearchConsoleClientOptions } from "./client.ts";
import { BY_PAGE, BY_QUERY, DAILY_TOTALS, EMPTY, FIXTURE_SITE_URL } from "./fixtures.ts";
import { SEARCH_CONSOLE_TIMEZONE } from "./normalize.ts";

const TOKEN = "ya29.a0-THE-CUSTOMERS-ACCESS-TOKEN";
const FETCHED_AT = "2026-09-11T02:00:00Z";

const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0.5,
  now: () => new Date(FETCHED_AT),
  sleep: async () => undefined,
};

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/**
 * A fetch that records what it was asked and replays a queue of responses.
 *
 * It THROWS when the queue is exhausted rather than replaying the last response, for the reason
 * `client.test.ts` records: replaying turns a paging bug into a suite that HANGS rather than one
 * that fails, which in CI is a twenty-minute timeout instead of a red test. The `log` is shared
 * with `onChunk` below so the ORDER of requests and checkpoints can be asserted, not just their
 * contents.
 */
function recorder(responses: Array<{ status?: number; body: unknown }>, log: string[] = []) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const next = responses[calls.length];
    if (next === undefined) {
      throw new Error(
        `the driver made request ${calls.length + 1} with only ${responses.length} queued`,
      );
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    log.push(`request ${JSON.stringify(body.dimensions)} ${String(body.startDate)}`);
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl, log };
}

function client(fetchImpl: typeof fetch): SearchConsoleClientOptions {
  return {
    fetchImpl,
    accessToken: TOKEN,
    siteUrl: FIXTURE_SITE_URL,
    baseUrl: "https://gsc.test/webmasters/v3",
    retry: RETRY,
  };
}

/** The two committed fixtures, in the order the default pair requests them. */
const PAIR = [{ body: DAILY_TOTALS }, { body: BY_QUERY }];

async function collect(
  gen: AsyncGenerator<SearchConsoleBackfillBatch, SearchConsoleCheckpoint, undefined>,
) {
  const batches: SearchConsoleBackfillBatch[] = [];
  let next = await gen.next();
  while (next.done !== true) {
    batches.push(next.value);
    next = await gen.next();
  }
  return { batches, checkpoint: next.value };
}

describe("cutting the span, which is the caller's and not this file's to invent", () => {
  it("cuts one chunk per day by default, inclusive at both ends", () => {
    expect(searchConsoleBackfillChunks({ from: "2026-08-14", to: "2026-08-17" })).toEqual([
      { from: "2026-08-14", to: "2026-08-14" },
      { from: "2026-08-15", to: "2026-08-15" },
      { from: "2026-08-16", to: "2026-08-16" },
      { from: "2026-08-17", to: "2026-08-17" },
    ]);
  });

  it("computes every boundary in UTC, not in the runtime's zone", () => {
    // THE SUITE RUNS IN ASIA/BANGKOK SO THAT THIS TEST CAN FAIL. Building the day with a local-time
    // Date and formatting it with toISOString() hands back the PREVIOUS day at any positive offset,
    // which shifts an entire backfill by one and leaves every window a plausible date.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Bangkok");
    const [first] = searchConsoleBackfillChunks({ from: "2026-08-14", to: "2026-08-14" });
    expect(first).toEqual({ from: "2026-08-14", to: "2026-08-14" });
  });

  it("does not overlap chunks, unlike WooCommerce's shared boundary instant", () => {
    // Woo shares the instant because a duplicate is collapsed by the upsert and a gap is not
    // recoverable. Here the bounds are inclusive calendar days, so a shared day is one extra
    // request per chunk and, at query grain, a whole day of rows handed over twice.
    expect(searchConsoleBackfillChunks({ from: "2026-08-14", to: "2026-08-20" }, 3)).toEqual([
      { from: "2026-08-14", to: "2026-08-16" },
      { from: "2026-08-17", to: "2026-08-19" },
      // The last chunk is short rather than reaching past the span the caller gave.
      { from: "2026-08-20", to: "2026-08-20" },
    ]);
  });

  it("crosses a month boundary by arithmetic rather than by string", () => {
    expect(searchConsoleBackfillChunks({ from: "2026-08-30", to: "2026-09-02" }, 2)).toEqual([
      { from: "2026-08-30", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-02" },
    ]);
  });

  it("refuses a span that ends before it starts", () => {
    expect(() => searchConsoleBackfillChunks({ from: "2026-08-20", to: "2026-08-14" })).toThrow(
      /ends before it starts/,
    );
  });

  it("refuses a date that does not exist, through the normaliser's own check", () => {
    // Date.parse rolls 30 February over into March and returns a perfectly good timestamp, so the
    // run would read two days nobody asked for and file the rows under them.
    expect(() => searchConsoleBackfillChunks({ from: "2026-02-30", to: "2026-03-02" })).toThrow(
      /real calendar date/,
    );
  });

  it("refuses a chunk shorter than a day, which would never reach the end of the span", () => {
    expect(() => searchConsoleBackfillChunks({ from: "2026-08-14", to: "2026-08-20" }, 0)).toThrow(
      /chunkDays/,
    );
  });
});

describe("the pair of reports, and which of them goes first", () => {
  it("defaults to the totals and the query grain", () => {
    expect(SEARCH_CONSOLE_DEFAULT_REPORTS).toEqual(["totals", "byQuery"]);
  });

  it("puts the unthresholded report first whichever order it was asked in", () => {
    // A run that dies half way then leaves a total with incomplete query rows beneath it -- which
    // reads as a wider anonymity gap -- rather than query rows with no total, which read as a
    // total. One errs visibly; the other is the failure this product sells against.
    expect(orderSearchConsoleReports(["byQuery", "totals"])).toEqual(["totals", "byQuery"]);
    expect(orderSearchConsoleReports(["byPage", "byQuery", "totals"])).toEqual([
      "totals",
      "byPage",
      "byQuery",
    ]);
  });

  it("refuses a run that asks only for grains Google withholds rows from", () => {
    const error = (() => {
      try {
        orderSearchConsoleReports(["byQuery"]);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect((error as SearchConsoleBackfillError).code).toBe("unpaired_grain");
  });

  it("refuses an unknown report name and a run with no reports at all", () => {
    expect(() => orderSearchConsoleReports(["byDevice" as never])).toThrow(
      /not one of the report shapes/,
    );
    expect(() => orderSearchConsoleReports([])).toThrow(/reads nothing/);
  });

  it("refuses before it spends a request against the customer's per-site ceiling", async () => {
    const { calls, fetchImpl } = recorder([]);
    const gen = runSearchConsoleBackfill({
      client: client(fetchImpl),
      span: { from: "2026-08-14", to: "2026-08-14" },
      fetchedAt: FETCHED_AT,
      reports: ["byQuery"],
    });
    await expect(collect(gen)).rejects.toThrow(/anonymity gap/);
    expect(calls).toHaveLength(0);
  });
});

describe("running a span", () => {
  it("asks for the totals before the queries, one request each, for the chunk's own dates", async () => {
    const { calls, fetchImpl } = recorder(PAIR);
    await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(calls.map((c) => c.body.dimensions)).toEqual([["date"], ["date", "query"]]);
    for (const call of calls) {
      expect(call.body.startDate).toBe("2026-08-14");
      expect(call.body.endDate).toBe("2026-08-14");
    }
  });

  it("runs both reports for a chunk before moving to the next chunk", async () => {
    const { calls, fetchImpl } = recorder([...PAIR, ...PAIR]);
    await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-15" },
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(
      calls.map((c) => `${String(c.body.startDate)} ${JSON.stringify(c.body.dimensions)}`),
    ).toEqual([
      '2026-08-14 ["date"]',
      '2026-08-14 ["date","query"]',
      '2026-08-15 ["date"]',
      '2026-08-15 ["date","query"]',
    ]);
  });

  it("emits the fixtures' rows at the grain each report describes", async () => {
    const { fetchImpl } = recorder(PAIR);
    const { batches } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(batches.map((b) => [b.report, b.grain, b.rows.length])).toEqual([
      ["totals", "property", DAILY_TOTALS.rows?.length],
      ["byQuery", "query", BY_QUERY.rows?.length],
    ]);
    expect(batches[0]?.responseAggregationType).toBe("byProperty");
  });

  it("marks the query batch as thresholded and the totals batch as not", async () => {
    // The flag is the one fact a caller most needs and the envelope row has no field for it: these
    // rows DO NOT sum to the property's total, and in the fixtures they visibly do not -- 688
    // clicks against 1,284 on the same day.
    const { fetchImpl } = recorder(PAIR);
    const { batches } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(batches.map((b) => b.anonymityThresholded)).toEqual([false, true]);

    const totalClicks = batches[0]?.rows
      .filter((r) => r.dimensions.date === "2026-08-14")
      .reduce((sum, r) => sum + (r.metrics.clicks ?? 0), 0);
    const queryClicks = batches[1]?.rows
      .filter((r) => r.dimensions.date === "2026-08-14")
      .reduce((sum, r) => sum + (r.metrics.clicks ?? 0), 0);
    expect(totalClicks).toBe(1284);
    expect(queryClicks).toBe(688);
  });

  it("stamps the documented constant as the timezone, and takes no override", async () => {
    // Search Console publishes no timezone, ever. The constant lives in normalize.ts and there is
    // no option here to disagree with it.
    const { fetchImpl } = recorder(PAIR);
    const { batches } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
      }),
    );
    for (const batch of batches) {
      for (const row of batch.rows) {
        expect(row.dimensions.timezone).toBe(SEARCH_CONSOLE_TIMEZONE);
        expect(row.fetched_at).toBe(FETCHED_AT);
        // A connector has no store; the upsert preserves the existing value on conflict.
        expect(row.first_seen_at).toBe(FETCHED_AT);
      }
    }
  });

  it("dates rows by the key Google returned, not by the chunk that asked for them", async () => {
    // DAILY_TOTALS covers two days. A driver that stamped the chunk's date on the rows would file a
    // whole span on one day and report nothing for the rest.
    const { fetchImpl } = recorder([{ body: DAILY_TOTALS }]);
    const { batches } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-15" },
        fetchedAt: FETCHED_AT,
        chunkDays: 2,
        reports: ["totals"],
      }),
    );
    expect(batches[0]?.rows.map((r) => r.dimensions.date)).toEqual(["2026-08-14", "2026-08-15"]);
  });

  it("yields one batch per page and advances by the rows received", async () => {
    const { calls, fetchImpl } = recorder([
      // Two full pages of the totals report, then a short one that ends it.
      { body: DAILY_TOTALS },
      { body: DAILY_TOTALS },
      { body: EMPTY },
    ]);
    const { batches } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
        reports: ["totals"],
        rowLimit: 2,
      }),
    );

    expect(batches.map((b) => b.page)).toEqual([1, 2, 3]);
    expect(calls.map((c) => c.body.startRow)).toEqual([0, 2, 4]);
  });

  it("treats a day with no rows as an empty batch rather than an error", async () => {
    // `rows` is ABSENT, not `[]`, on a quiet day -- and under dataState: final that is the ordinary
    // case at the newest end of any span.
    const { fetchImpl } = recorder([{ body: EMPTY }, { body: EMPTY }]);
    const { batches, checkpoint } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batches.map((b) => b.rows.length)).toEqual([0, 0]);
    expect(checkpoint).toEqual({ readThrough: "2026-08-14", chunks: 1, rows: 0 });
  });

  it("hands the page's own dimension list to the normaliser", async () => {
    // The response echoes no dimension names, so the request IS the schema. BY_PAGE's keys are page
    // URLs; read against ["date","query"] they would be stored as things people typed into Google.
    const { fetchImpl } = recorder([{ body: DAILY_TOTALS }, { body: BY_PAGE }]);
    const { batches } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-14" },
        fetchedAt: FETCHED_AT,
        reports: ["totals", "byPage"],
      }),
    );
    expect(batches[1]?.rows[0]?.entity.id).toBe("page:https://example.test/shoes/running");
    expect(batches[1]?.rows[0]?.entity.native_entity_type).toBe("page");
  });
});

describe("the checkpoint, which says READ and does not say FINAL", () => {
  it("fires onChunk after every report of a chunk has been read in full", async () => {
    const seen: SearchConsoleCheckpoint[] = [];
    const { fetchImpl } = recorder([...PAIR, ...PAIR]);
    const { checkpoint } = await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-15" },
        fetchedAt: FETCHED_AT,
        onChunk: (c) => {
          seen.push(c);
        },
      }),
    );

    const rowsPerChunk = (DAILY_TOTALS.rows?.length ?? 0) + (BY_QUERY.rows?.length ?? 0);
    expect(seen).toEqual([
      { readThrough: "2026-08-14", chunks: 1, rows: rowsPerChunk },
      { readThrough: "2026-08-15", chunks: 2, rows: rowsPerChunk * 2 },
    ]);
    // The generator's RETURN value says the whole span is done. `for await` discards it, so it
    // cannot be mistaken for a per-batch field.
    expect(checkpoint).toEqual(seen[1]);
  });

  it("awaits an async onChunk before starting the next chunk", async () => {
    // A `=> void` signature accepts an async function happily and drops the promise: the next chunk
    // then starts while the write is still in flight, and a rejected write surfaces as an unhandled
    // rejection while the run reports success.
    const log: string[] = [];
    const { fetchImpl } = recorder([...PAIR, ...PAIR], log);
    await collect(
      runSearchConsoleBackfill({
        client: client(fetchImpl),
        span: { from: "2026-08-14", to: "2026-08-15" },
        fetchedAt: FETCHED_AT,
        onChunk: async (c) => {
          await Promise.resolve();
          log.push(`banked ${String(c.readThrough)}`);
        },
      }),
    );

    expect(log).toEqual([
      'request ["date"] 2026-08-14',
      'request ["date","query"] 2026-08-14',
      "banked 2026-08-14",
      'request ["date"] 2026-08-15',
      'request ["date","query"] 2026-08-15',
      "banked 2026-08-15",
    ]);
  });

  it("leaves the mark where the last COMPLETE chunk left it when a later chunk fails", async () => {
    // Advancing over a half-read chunk would resume the next run past days whose query rows were
    // never pulled, and nothing would ever ask for them again. The failure here is the client's
    // page cap, which is the one refusal this platform's missing row total makes reachable.
    const seen: SearchConsoleCheckpoint[] = [];
    const { fetchImpl } = recorder([
      // The first chunk is a quiet day: both reports end on their first short page.
      { body: EMPTY },
      { body: EMPTY },
      // The second chunk's totals report never ends: both pages come back exactly full, and a full
      // page is indistinguishable from the last one when the platform publishes no row total.
      { body: DAILY_TOTALS },
      { body: DAILY_TOTALS },
    ]);

    const gen = runSearchConsoleBackfill({
      client: client(fetchImpl),
      span: { from: "2026-08-14", to: "2026-08-15" },
      fetchedAt: FETCHED_AT,
      rowLimit: DAILY_TOTALS.rows?.length,
      maxPages: 2,
      onChunk: (c) => {
        seen.push(c);
      },
    });

    const error = await collect(gen).catch((e: unknown) => e);
    expect((error as SearchConsoleClientError).code).toBe("page_cap");
    expect(seen.map((c) => c.readThrough)).toEqual(["2026-08-14"]);
  });
});
