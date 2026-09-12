import { planBackfill } from "@repo/extract";
import type { BackfillWindow, FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  META_DEFAULT_REPORT,
  type MetaBackfillBatch,
  type MetaBackfillError,
  assertMetaReport,
  runMetaBackfill,
} from "./backfill.ts";
import type { MetaClientError, MetaClientOptions } from "./client.ts";
import { DAILY_CAMPAIGN, DELIVERY_ONLY, EMPTY, FIXTURE_ACCOUNT } from "./fixtures.ts";
import { META_ACTION_WINDOWS, META_METRIC_MAP, META_STRUCTURAL_FIELDS } from "./normalize.ts";

const TOKEN = "EAA-THE-CUSTOMERS-LONG-LIVED-TOKEN";
const FETCHED_AT = "2026-09-08T02:00:00Z";

/**
 * NEITHER UTC NOR THE SUITE'S OWN ZONE, and that is the assertion rather than a detail.
 *
 * `vitest.config.ts` pins the suite to Asia/Bangkok precisely so a timezone bug cannot hide behind
 * a runner that agrees with it. A connector that defaulted the zone to UTC and one that read the
 * runtime's would both produce a string that is not this one, so either mutation fails the tests
 * below -- which is the whole reason the ad account node is fetched at all.
 */
const ACCOUNT_TIMEZONE = "America/Los_Angeles";

const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0.5,
  now: () => new Date(FETCHED_AT),
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
 * `client.test.ts` records: a paging bug that replays hangs the suite for twenty minutes in CI
 * instead of failing it. Each test declares how many requests it expects, and the FIRST of them is
 * always the ad account node -- if a driver ever stopped fetching it, every queue here shifts by
 * one and the run fails loudly rather than quietly running on a guessed timezone.
 */
function recorder(responses: Array<{ status?: number; body: unknown; headers?: HeadersInit }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const next = responses[calls.length];
    if (next === undefined) {
      throw new Error(
        `the driver made request ${calls.length + 1} with only ${responses.length} queued`,
      );
    }
    calls.push({ url: String(url), init });
    const headers = new Headers(next.headers ?? {});
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** What `getAdAccount` reads. The timezone here is the only one anything in this file knows. */
const ACCOUNT_NODE = {
  body: {
    id: FIXTURE_ACCOUNT,
    currency: "THB",
    timezone_name: ACCOUNT_TIMEZONE,
    name: "Synthetic ad account",
  },
};

/** `paging.next` carries the token, so it is visibly present and must never be fetched. */
function page(rows: unknown[], after: string | null) {
  if (after === null) return { data: rows };
  return {
    data: rows,
    paging: {
      cursors: { after },
      next: `https://meta.test/v21.0/${FIXTURE_ACCOUNT}/insights?after=${after}&access_token=${TOKEN}`,
    },
  };
}

/** Deliberately invented percentage field names: the parser matches the `_pct` suffix, not a name. */
function throttle(pct: number): HeadersInit {
  return {
    "x-fb-ads-insights-throttle": JSON.stringify({
      whatever_meta_calls_it_util_pct: pct,
      ads_api_access_tier: "development_access",
    }),
  };
}

function client(fetchImpl: typeof fetch): MetaClientOptions {
  return {
    fetchImpl,
    accessToken: TOKEN,
    adAccountId: FIXTURE_ACCOUNT,
    baseUrl: "https://meta.test/v21.0",
    retry: RETRY,
  };
}

function win(from: string, to: string, tier: BackfillWindow["tier"] = "daily"): BackfillWindow {
  return { from, to, tier, reason: "test" };
}

async function collect(gen: AsyncGenerator<MetaBackfillBatch, void, undefined>) {
  const batches: MetaBackfillBatch[] = [];
  for await (const b of gen) batches.push(b);
  return batches;
}

/** The insights calls only, in order, as URLs. The account node is request zero. */
function insights(calls: Call[]) {
  return calls.filter((call) => call.url.includes("/insights")).map((call) => new URL(call.url));
}

describe("what the default report asks for", () => {
  it("asks only for fields the normaliser accepts, so a pull cannot fail after it is paid for", () => {
    // An unmapped field is refused AFTER the response, with the customer's insights quota already
    // spent on a page that can never be stored.
    for (const field of META_DEFAULT_REPORT.fields) {
      const known = META_STRUCTURAL_FIELDS.has(field) || Object.hasOwn(META_METRIC_MAP, field);
      expect(known, `${field} is neither structural nor a dictionary metric`).toBe(true);
    }
  });

  it("asks for the currency and the level's id, both of which the normaliser refuses without", () => {
    expect(META_DEFAULT_REPORT.fields).toContain("account_currency");
    expect(META_DEFAULT_REPORT.fields).toContain(`${META_DEFAULT_REPORT.level}_id`);
    expect(() => assertMetaReport(META_DEFAULT_REPORT)).not.toThrow();
  });

  it("asks for every selectable window, because a window not asked for cannot be reconstructed", () => {
    // Unlike a GA4 metric, an extra attribution window costs no extra request -- the keys arrive
    // inside action entries of a response being fetched anyway. What a narrower list costs is a
    // re-pull of history against the 10-per-day cap.
    // THE SEVEN ARE WRITTEN OUT, NOT COMPARED TO THEIR OWN SOURCE. `META_DEFAULT_REPORT.
    // attributionWindows` IS `META_ACTION_WINDOWS` -- the same object -- so asserting one equals
    // the other is a self-comparison that narrowing the list would not break, because both sides
    // would narrow together. Naming the values is what makes a dropped window fail here.
    expect(META_DEFAULT_REPORT.attributionWindows).toEqual([
      "1d_click",
      "7d_click",
      "28d_click",
      "1d_view",
      "7d_view",
      "28d_view",
      "1d_ev",
    ]);
  });
});

describe("refusing before the request, where a refusal is free", () => {
  it("refuses a field with no dictionary entry without spending a call", async () => {
    const { calls, fetchImpl } = recorder([]);
    const error = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
        report: { ...META_DEFAULT_REPORT, fields: [...META_DEFAULT_REPORT.fields, "cpc"] },
      }),
    ).catch((e: unknown) => e);

    expect((error as MetaBackfillError).code).toBe("bad_report");
    expect((error as Error).message).toContain("cpc");
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty plan before it spends the account call", async () => {
    // THE ASSERTION THAT MATTERS IS `calls` BEING EMPTY. Before the guard, an empty window list
    // fell through the loop and returned normally -- a clean completion that had read nothing,
    // having spent getAdAccount to get there. A run covering no dates is a caller bug, and it
    // looked in every log exactly like a successful pull.
    const { calls, fetchImpl } = recorder([]);
    const error = await collect(
      runMetaBackfill({ client: client(fetchImpl), windows: [], fetchedAt: FETCHED_AT }),
    ).catch((e: unknown) => e);

    expect((error as MetaBackfillError).code).toBe("bad_report");
    expect(calls).toHaveLength(0);
  });

  it("refuses a report asking for no attribution window", () => {
    // MetaReportDefinition's own field doc says "Never empty." and nothing enforced it. Meta picks
    // for us when the list is empty, and which window it picks is not stated anywhere citable --
    // so the rows would carry an attribution we could not name and could not reconstruct without
    // running the whole pull again.
    expect(() => assertMetaReport({ ...META_DEFAULT_REPORT, attributionWindows: [] })).toThrow(
      /attribution window/i,
    );
  });

  it("refuses a report that omits account_currency or the level's id field", () => {
    expect(() =>
      assertMetaReport({
        ...META_DEFAULT_REPORT,
        fields: META_DEFAULT_REPORT.fields.filter((f) => f !== "account_currency"),
      }),
    ).toThrow(/account_currency/);
    expect(() =>
      assertMetaReport({
        ...META_DEFAULT_REPORT,
        fields: META_DEFAULT_REPORT.fields.filter((f) => f !== "campaign_id"),
      }),
    ).toThrow(/campaign_id/);
  });

  it("refuses an account node belonging to a different ad account", async () => {
    // The node's timezone_name is the only thing that dates every row in the run, so a cached node
    // for another account files this account's days in another account's zone -- and every row of
    // it parses, validates and looks right.
    const { calls, fetchImpl } = recorder([]);
    const error = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
        account: {
          id: "act_000000000000002",
          currency: "THB",
          timezoneName: "Asia/Bangkok",
          name: null,
        },
      }),
    ).catch((e: unknown) => e);

    expect((error as MetaBackfillError).code).toBe("account_mismatch");
    expect(calls).toHaveLength(0);
  });
});

describe("the timezone, which has exactly one source", () => {
  it("reads the ad account node before the first insights request", async () => {
    const { calls, fetchImpl } = recorder([
      ACCOUNT_NODE,
      { body: page([...DAILY_CAMPAIGN], null) },
    ]);
    await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );

    const first = new URL(calls[0]?.url ?? "");
    expect(first.pathname).toBe(`/v21.0/${FIXTURE_ACCOUNT}`);
    expect(first.searchParams.get("fields")).toBe("currency,timezone_name,name");
    expect(calls[1]?.url).toContain("/insights");
  });

  it("reads it once for the whole run, not once per window", async () => {
    // The insights edge publishes no timezone, so this is the cheapest call in the connector -- and
    // multiplying it by the plan length spends ceilings shared with the customer's own tools for a
    // value that cannot change mid-run.
    const { calls, fetchImpl } = recorder([
      ACCOUNT_NODE,
      { body: page([...DAILY_CAMPAIGN], null) },
      { body: page([...DELIVERY_ONLY], null) },
      { body: page([...EMPTY], null) },
    ]);
    await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [
          win("2026-08-14", "2026-08-14"),
          win("2026-08-13", "2026-08-13"),
          win("2026-08-12", "2026-08-12"),
        ],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(calls.filter((call) => !call.url.includes("/insights"))).toHaveLength(1);
    expect(insights(calls)).toHaveLength(3);
  });

  it("stamps the account's zone on every row rather than UTC or the runtime's", async () => {
    const { fetchImpl } = recorder([ACCOUNT_NODE, { body: page([...DAILY_CAMPAIGN], null) }]);
    const [batch] = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batch?.rows.length).toBeGreaterThan(0);
    for (const row of batch?.rows ?? []) {
      expect(row.dimensions.timezone).toBe(ACCOUNT_TIMEZONE);
    }
    expect(batch?.account.timezoneName).toBe(ACCOUNT_TIMEZONE);
  });

  it("uses a cached node for this account without fetching it again", async () => {
    const { calls, fetchImpl } = recorder([{ body: page([...DAILY_CAMPAIGN], null) }]);
    const [batch] = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
        account: {
          id: FIXTURE_ACCOUNT,
          currency: "THB",
          timezoneName: ACCOUNT_TIMEZONE,
          name: null,
        },
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/insights");
    expect(batch?.rows[0]?.dimensions.timezone).toBe(ACCOUNT_TIMEZONE);
  });
});

describe("running a plan", () => {
  it("sends one inclusive time_range per window, in the order the planner gave them", async () => {
    const { calls, fetchImpl } = recorder([
      ACCOUNT_NODE,
      { body: page([...DAILY_CAMPAIGN], null) },
      { body: page([...DELIVERY_ONLY], null) },
    ]);
    await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-08", "2026-08-14", "weekly"), win("2026-08-01", "2026-08-07")],
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(
      insights(calls).map((url) => JSON.parse(url.searchParams.get("time_range") ?? "{}")),
    ).toEqual([
      { since: "2026-08-08", until: "2026-08-14" },
      { since: "2026-08-01", until: "2026-08-07" },
    ]);
  });

  it("fans one insights row out to a delivery row and one row per window", async () => {
    // normalize.ts traps 1 and 2: the same conversion arrives under several windows, and spend is
    // not attributed so it must not be copied onto them.
    const { fetchImpl } = recorder([ACCOUNT_NODE, { body: page([...DAILY_CAMPAIGN], null) }]);
    const [batch] = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(batch?.rows).toHaveLength(1 + META_ACTION_WINDOWS.length);

    const delivery = batch?.rows.filter((r) => r.dimensions.attribution_window === null) ?? [];
    expect(delivery).toHaveLength(1);
    expect(delivery[0]?.metrics.spend).toBe(1234.56);
    expect(delivery[0]?.metrics.conversions).toBeUndefined();

    const byWindow = new Map(
      (batch?.rows ?? [])
        .filter((r) => r.dimensions.attribution_window !== null)
        .map((r) => [r.dimensions.attribution_window, r.metrics.conversions]),
    );
    // The fixture's own figures, one per window, and `value` (36) is none of them.
    expect(Object.fromEntries(byWindow)).toEqual({
      "1d_click": 21,
      "7d_click": 30,
      "28d_click": 33,
      "1d_view": 4,
      "7d_view": 6,
      "28d_view": 7,
      // Meta reported no `1d_ev` key. Absent is zero and the row is still written, because a
      // restatement down to zero has to be able to correct yesterday's number.
      "1d_ev": 0,
    });
  });

  it("dates rows by what Meta reported, not by the window that asked for them", async () => {
    // The fixture is 14 August; the window asks for a week. A driver that stamped the window's
    // start on the rows would put a week of spend on one day and report zero for the rest.
    const { fetchImpl } = recorder([ACCOUNT_NODE, { body: page([...DAILY_CAMPAIGN], null) }]);
    const [batch] = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-08", "2026-08-14", "weekly")],
        fetchedAt: FETCHED_AT,
      }),
    );
    for (const row of batch?.rows ?? []) expect(row.dimensions.date).toBe("2026-08-14");
  });

  it("carries the run's single fetched_at, and sets first_seen_at to it", async () => {
    // A connector has no store and cannot know whether a row already exists. The upsert preserves
    // the existing value on conflict; claiming otherwise here would put the product's one durable
    // guarantee in the layer least able to keep it.
    const { fetchImpl } = recorder([ACCOUNT_NODE, { body: page([...DAILY_CAMPAIGN], null) }]);
    const [batch] = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );
    for (const row of batch?.rows ?? []) {
      expect(row.fetched_at).toBe(FETCHED_AT);
      expect(row.first_seen_at).toBe(FETCHED_AT);
    }
  });

  it("yields one batch per page, numbered within the window", async () => {
    // At ad level with seven windows a page of 500 insights rows is 4,000 envelope rows, so a
    // driver that accumulated a window would spend the client's page bound on nothing.
    const { fetchImpl } = recorder([
      ACCOUNT_NODE,
      { body: page([...DAILY_CAMPAIGN], "cursor-1") },
      { body: page([...DELIVERY_ONLY], null) },
    ]);
    const batches = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );

    expect(batches.map((b) => b.page)).toEqual([1, 2]);
    expect(batches.map((b) => b.window.from)).toEqual(["2026-08-14", "2026-08-14"]);
    // Page two is DELIVERY_ONLY: spend with no actions, so one row and no attributed rows.
    expect(batches[1]?.rows).toHaveLength(1);
    expect(batches[1]?.rows[0]?.metrics.spend).toBe(88);
  });

  it("reports an empty window as an empty batch rather than as an error", async () => {
    const { fetchImpl } = recorder([ACCOUNT_NODE, { body: page([...EMPTY], null) }]);
    const batches = await collect(
      runMetaBackfill({
        client: client(fetchImpl),
        windows: [win("2026-08-14", "2026-08-14")],
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]?.rows).toEqual([]);
  });

  it("runs the real plan planBackfill produces for meta_ads", async () => {
    // The tiering is @repo/extract's; this asserts the two units fit together rather than testing
    // the planner again. One request per window, plus the one account node read for the run.
    const plan = planBackfill({
      source: "meta_ads",
      today: "2026-09-08",
      earliestDate: "2026-01-01",
      lastBackfillAt: "2026-09-07T02:00:00Z",
    });
    const { calls, fetchImpl } = recorder([
      ACCOUNT_NODE,
      ...plan.windows.map(() => ({ body: page([...DAILY_CAMPAIGN], null) })),
    ]);
    const batches = await collect(
      runMetaBackfill({ client: client(fetchImpl), windows: plan.windows, fetchedAt: FETCHED_AT }),
    );

    expect(batches).toHaveLength(plan.windows.length);
    expect(insights(calls)).toHaveLength(plan.requestCount);
    expect(calls).toHaveLength(plan.requestCount + 1);
    // Newest first, so a run cut short has already done the days most likely to have changed.
    expect(batches[0]?.window.from).toBe("2026-09-08");
  });
});

describe("stopping on the throttle", () => {
  it("ends the whole plan, because the next window spends the same two shared ceilings", async () => {
    const { calls, fetchImpl } = recorder([
      ACCOUNT_NODE,
      // Window one completes.
      { body: page([...DAILY_CAMPAIGN], null) },
      // Window two's first page comes back at 95% with another page to fetch.
      { body: page([...DAILY_CAMPAIGN], "cursor-1"), headers: throttle(95) },
    ]);
    const gen = runMetaBackfill({
      client: client(fetchImpl),
      windows: [
        win("2026-08-14", "2026-08-14"),
        win("2026-08-13", "2026-08-13"),
        win("2026-08-12", "2026-08-12"),
      ],
      fetchedAt: FETCHED_AT,
    });

    const seen: string[] = [];
    const error = await (async () => {
      try {
        for await (const b of gen) seen.push(b.window.from);
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect((error as MetaClientError).code).toBe("throttle_floor");
    // The third window was never requested: two insights calls, not three.
    expect(insights(calls)).toHaveLength(2);
    // And the completed pages were handed over before the refusal reached the caller.
    expect(seen).toEqual(["2026-08-14", "2026-08-13"]);
  });

  it("reports the utilisation reading that stopped it on the batch it came with", async () => {
    const { fetchImpl } = recorder([
      ACCOUNT_NODE,
      { body: page([...DAILY_CAMPAIGN], "cursor-1"), headers: throttle(95) },
    ]);
    const gen = runMetaBackfill({
      client: client(fetchImpl),
      windows: [win("2026-08-14", "2026-08-14")],
      fetchedAt: FETCHED_AT,
    });
    const batches: MetaBackfillBatch[] = [];
    await expect(
      (async () => {
        for await (const b of gen) batches.push(b);
      })(),
    ).rejects.toThrow(/utilisation/);

    expect(batches[0]?.usage.utilisationPct).toBe(95);
    expect(batches[0]?.usage.accessTier).toBe("development_access");
  });
});
