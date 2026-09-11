import { ExtractError, type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  WooClientError,
  type WooSplit,
  type WooWindow,
  type WooWindowPage,
  fetchOrdersPages,
  fetchOrdersWindow,
} from "./client.js";

const STORE = "https://shop.example.com";
const CRED = { key: "ck_a1b2c3", secret: "cs_9z8y7x" };

/**
 * A whole UTC day.
 *
 * THE SUITE RUNS IN ASIA/BANGKOK -- see vitest.config.ts, and `32` §7 for the mutation that put it
 * there. Every boundary asserted below is a UTC instant written out in full, so an implementation
 * that halved a window through any local-time reading would land seven hours away and fail here
 * rather than in production.
 */
const DAY: WooWindow = {
  modifiedAfter: "2026-09-09T00:00:00.000Z",
  modifiedBefore: "2026-09-10T00:00:00.000Z",
};

const RETRY: FetchOptions = {
  random: () => 0,
  now: () => new Date("2026-09-10T00:00:00.000Z"),
  sleep: async () => {},
};

/** A fake store that records what was asked of it. The call COUNT is half the assertions here. */
function store(handler: (url: URL) => Response, retry: Partial<typeof RETRY> = {}) {
  const calls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url);
  };
  return {
    calls,
    options: { fetchImpl, storeUrl: STORE, credential: CRED, ...RETRY, ...retry },
  };
}

function orders(ids: readonly number[]): unknown[] {
  return ids.map((id) => ({ id, total: "100.00" }));
}

function paged(body: unknown[], totalPages: number, totalOrders: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "x-wp-totalpages": String(totalPages),
      "x-wp-total": String(totalOrders),
    },
  });
}

/** The same page with the pagination headers stripped, as a proxy or a CDN would leave it. */
function unpaged(body: unknown[]): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function pageOf(url: URL): number {
  return Number(url.searchParams.get("page") ?? "1");
}

function spanSeconds(url: URL): number {
  const after = Date.parse(`${url.searchParams.get("modified_after")}Z`);
  const before = Date.parse(`${url.searchParams.get("modified_before")}Z`);
  return (before - after) / 1000;
}

async function drain(
  pages: AsyncGenerator<WooWindowPage, void, undefined>,
  sink: WooWindowPage[] = [],
): Promise<WooWindowPage[]> {
  for await (const page of pages) sink.push(page);
  return sink;
}

function ids(pages: readonly WooWindowPage[]): number[] {
  return pages.flatMap((page) => page.orders.map((order) => (order as { id: number }).id));
}

/** Asserts that the generator refused, and hands back the refusal to be interrogated. */
async function refusal(run: () => Promise<unknown>): Promise<WooClientError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof WooClientError) return error;
    throw error;
  }
  throw new Error("expected a WooClientError, got none");
}

describe("the page loop", () => {
  it("walks every page the first one promised, in order", async () => {
    const s = store((url) => {
      const page = pageOf(url);
      return paged(orders(page === 3 ? [5] : [page * 2 - 1, page * 2]), 3, 5);
    });

    const pages = await drain(fetchOrdersPages(s.options, DAY, { perPage: 2 }));

    expect(pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(ids(pages)).toEqual([1, 2, 3, 4, 5]);
    expect(s.calls).toHaveLength(3);
  });

  it("reads the page count ONCE, from page 1, however the store escalates it afterwards", async () => {
    // THE INFINITE LOOP THIS PREVENTS. X-WP-TotalPages comes from the merchant's server: a caching
    // plugin that recomputes it, or one that ignores modified_before, can raise it on every
    // response. A loop that re-read it would follow the store anywhere it wanted to go.
    const s = store((url) => paged(orders([pageOf(url)]), pageOf(url) === 1 ? 3 : 9_999, 3));

    const pages = await drain(fetchOrdersPages(s.options, DAY, { perPage: 1 }));

    expect(s.calls).toHaveLength(3);
    expect(pages).toHaveLength(3);
    // And the count handed to the caller is page 1's, not the number the store kept inflating.
    expect(pages.map((page) => page.totalPages)).toEqual([3, 3, 3]);
  });

  it("refuses an oversized window after ONE request rather than paging into it", async () => {
    // The refusal costs the merchant a single page. Discovering the same thing by walking 40 pages
    // would cost them 40 OFFSET queries to find out we should not have asked.
    const s = store(() => paged(orders([1]), 40, 4_000));

    const error = await refusal(() => drain(fetchOrdersPages(s.options, DAY, { maxPages: 20 })));

    expect(error.code).toBe("window_too_large");
    expect(error.message).toMatch(/40 pages/);
    expect(s.calls).toHaveLength(1);
  });
});

describe("rows that move while the loop reads them", () => {
  /**
   * The tie-break shuffle.
   *
   * `orderby=modified` is not unique -- a bulk status change stamps a dozen orders with the same
   * second -- and MySQL's tie-break under LIMIT/OFFSET is undefined. Here order 3 comes back on
   * both pages, which means the row that should have been last (6) came back on neither.
   */
  function shuffledStore() {
    return store((url) => paged(orders(pageOf(url) === 1 ? [1, 2, 3] : [3, 4, 5]), 2, 6));
  }

  it("yields a duplicated order exactly once", async () => {
    const s = shuffledStore();
    const seen: WooWindowPage[] = [];

    await refusal(() => drain(fetchOrdersPages(s.options, DAY, { perPage: 3 }), seen));

    // Not [1,2,3,3,4,5]. A duplicate here is a double-counted sale, and nothing downstream can see
    // that it was the same order twice -- the envelope upsert would absorb the row, but anything
    // that sums pages before the upsert would not.
    expect(ids(seen)).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses a window it read short, rather than reporting it whole", async () => {
    const s = shuffledStore();

    const error = await refusal(() => drain(fetchOrdersPages(s.options, DAY, { perPage: 3 })));

    expect(error.code).toBe("incomplete_window");
    expect(error.message).toMatch(/reported 6 orders and yielded 5 distinct ones/);
  });

  it("catches an order deleted mid-run, which shifts every later row toward page 1", async () => {
    // No duplicate this time: order 4 was trashed between the two requests, so 5 and 6 each moved
    // one place and the row on the page boundary was never returned by anything.
    const s = store((url) => paged(orders(pageOf(url) === 1 ? [1, 2, 3] : [5, 6]), 2, 6));

    const error = await refusal(() => drain(fetchOrdersPages(s.options, DAY, { perPage: 3 })));

    expect(error.code).toBe("incomplete_window");
  });

  it("accepts a window whose count matches, which is every ordinary night", async () => {
    const s = store((url) => paged(orders(pageOf(url) === 1 ? [1, 2, 3] : [4, 5]), 2, 5));

    const pages = await drain(fetchOrdersPages(s.options, DAY, { perPage: 3 }));

    expect(ids(pages)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("a store behind something that strips headers", () => {
  it("refuses a FULL page with no pagination headers, because more may be behind it", async () => {
    const s = store(() => unpaged(orders([1, 2])));

    const error = await refusal(() => drain(fetchOrdersPages(s.options, DAY, { perPage: 2 })));

    expect(error.code).toBe("pagination_headers_missing");
    expect(s.calls).toHaveLength(1);
  });

  it("still reads a SHORT page, because a short page really is the last one", async () => {
    // `34` decision 5's rule, preserved: a missing header means one page, not zero, so a small
    // store behind a header-stripping proxy is read rather than silently skipped.
    const s = store(() => unpaged(orders([1])));

    const pages = await drain(fetchOrdersPages(s.options, DAY, { perPage: 2 }));

    expect(ids(pages)).toEqual([1]);
    expect(s.calls).toHaveLength(1);
  });
});

describe("the quota-aware layer underneath", () => {
  it("retries a 503 with the injected backoff rather than hammering the store", async () => {
    const sleeps: number[] = [];
    let failed = false;
    const s = store(
      (url) => {
        if (pageOf(url) === 2 && !failed) {
          failed = true;
          return new Response("upstream is busy", { status: 503 });
        }
        return paged(orders([pageOf(url)]), 2, 2);
      },
      {
        sleep: async (ms: number) => {
          sleeps.push(ms);
        },
      },
    );

    const pages = await drain(fetchOrdersPages(s.options, DAY, { perPage: 1 }));

    expect(ids(pages)).toEqual([1, 2]);
    expect(s.calls).toHaveLength(3);
    expect(sleeps).toHaveLength(1);
  });

  it("does not retry a 401, which spends the merchant's store on a fixed answer", async () => {
    // `@repo/extract`'s classify() stops on anything retrying cannot fix. Inherited, not
    // reimplemented -- this asserts the loop did not quietly wrap the fetch in its own retry.
    const s = store((url) =>
      pageOf(url) === 2
        ? new Response(JSON.stringify({ code: "woocommerce_rest_cannot_view" }), { status: 401 })
        : paged(orders([1]), 2, 2),
    );

    await expect(drain(fetchOrdersPages(s.options, DAY, { perPage: 1 }))).rejects.toBeInstanceOf(
      ExtractError,
    );
    expect(s.calls).toHaveLength(2);
  });
});

describe("window bisection", () => {
  it("halves a window that is too big, in UTC, with no second in both halves", async () => {
    const splits: WooSplit[] = [];
    const s = store((url) =>
      spanSeconds(url) > 43_200 ? paged([], 40, 4_000) : paged(orders([1]), 1, 1),
    );

    const pages = await drain(
      fetchOrdersWindow(s.options, DAY, { maxPages: 20, onSplit: (split) => splits.push(split) }),
    );

    expect(s.calls).toHaveLength(3);
    // Midday UTC, not midday in the runtime's zone. In Asia/Bangkok a local reading of the same
    // arithmetic lands at 05:00Z, which is why this asserts the instant and not just "the middle".
    expect(s.calls[1]?.searchParams.get("modified_after")).toBe("2026-09-09T00:00:00");
    expect(s.calls[1]?.searchParams.get("modified_before")).toBe("2026-09-09T12:00:00");
    expect(s.calls[2]?.searchParams.get("modified_after")).toBe("2026-09-09T12:00:01");
    expect(s.calls[2]?.searchParams.get("modified_before")).toBe("2026-09-10T00:00:00");
    // The one-second gap is the point: WooCommerce's bounds are inclusive, and `34` §5 records
    // that as unverified, so the halves are built not to care which way it turns out.
    expect(s.calls[1]?.searchParams.get("modified_before")).not.toBe(
      s.calls[2]?.searchParams.get("modified_after"),
    );
    expect(pages).toHaveLength(2);
    expect(splits).toHaveLength(1);
    expect(splits[0]?.reason).toMatch(/40 pages/);
  });

  it("keeps halving while the halves are still too big", async () => {
    // A day of 40 pages, split into quarters of six hours. Three internal windows are paid for with
    // one discarded request each; four leaves carry the data.
    const s = store((url) =>
      spanSeconds(url) > 21_600 ? paged([], 40, 4_000) : paged(orders([1]), 1, 1),
    );

    const pages = await drain(fetchOrdersWindow(s.options, DAY, { maxPages: 20 }));

    expect(pages).toHaveLength(4);
    expect(s.calls).toHaveLength(7);
    expect(s.calls.map((url) => url.searchParams.get("modified_after"))).toEqual([
      "2026-09-09T00:00:00",
      "2026-09-09T00:00:00",
      "2026-09-09T00:00:00",
      "2026-09-09T06:00:01",
      "2026-09-09T12:00:01",
      "2026-09-09T12:00:01",
      "2026-09-09T18:00:01",
    ]);
  });

  it("stops splitting at one second and reads it with the raised cap instead", async () => {
    // THE CASE THAT MUST NOT LOOP. A bulk edit or a migration stamps thousands of orders with one
    // date_modified; WooCommerce's filter has no granularity below the second, so both halves of a
    // one-second window would be the same window and the same answer, forever.
    const second: WooWindow = {
      modifiedAfter: "2026-09-09T00:00:00.000Z",
      modifiedBefore: "2026-09-09T00:00:01.000Z",
    };
    const s = store((url) => paged(orders([pageOf(url)]), 3, 3));

    const pages = await drain(
      fetchOrdersWindow(s.options, second, { perPage: 1, maxPages: 1, floorMaxPages: 5 }),
    );

    // One refused request for the two-second window, then three pages from each of the two
    // one-second windows it split into. Bounded, and finished.
    expect(s.calls).toHaveLength(7);
    expect(pages).toHaveLength(6);
    expect([...new Set(pages.map((page) => page.window.modifiedAfter))]).toEqual([
      "2026-09-09T00:00:00.000Z",
      "2026-09-09T00:00:01.000Z",
    ]);
  });

  it("refuses a single second that exceeds even the raised cap, and says it cannot be narrowed", async () => {
    const second: WooWindow = {
      modifiedAfter: "2026-09-09T00:00:00.000Z",
      modifiedBefore: "2026-09-09T00:00:00.000Z",
    };
    const s = store(() => paged(orders([1]), 300, 30_000));

    const error = await refusal(() =>
      drain(fetchOrdersWindow(s.options, second, { maxPages: 20, floorMaxPages: 200 })),
    );

    expect(error.code).toBe("window_too_large");
    expect(error.message).toMatch(/single second/);
    // One request, no recursion: there was nothing to split.
    expect(s.calls).toHaveLength(1);
  });

  it("gives up on a budget when halving never reduces the count", async () => {
    // A store whose count does not respond to the date filter at all -- a cached X-WP-Total, or a
    // plugin overriding the query. Depth alone terminates, but the tree would be exponential; the
    // window budget is what makes the worst case arithmetic rather than trust.
    const window: WooWindow = {
      modifiedAfter: "2026-09-09T00:00:00.000Z",
      modifiedBefore: "2026-09-09T00:00:15.000Z",
    };
    const s = store((url) => paged(orders([pageOf(url)]), 2, 2));

    const error = await refusal(() =>
      drain(fetchOrdersWindow(s.options, window, { perPage: 1, maxPages: 1, maxWindows: 8 })),
    );

    expect(error.code).toBe("window_budget_exhausted");
    expect(error.message).toMatch(/8 sub-windows/);
    // Bounded: 8 windows, each costing one refused request or two pages.
    expect(s.calls.length).toBeLessThanOrEqual(8 * 3);
  });

  it("refuses a window boundary that is not an instant", async () => {
    const s = store(() => paged([], 1, 0));

    const error = await refusal(() =>
      drain(fetchOrdersWindow(s.options, { modifiedAfter: "yesterday", modifiedBefore: "now" })),
    );

    expect(error.code).toBe("invalid_window");
    expect(s.calls).toHaveLength(0);
  });
});
