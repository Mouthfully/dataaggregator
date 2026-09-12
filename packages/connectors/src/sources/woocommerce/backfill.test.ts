import { ExtractError, type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  WOO_BACKFILL_CHUNK_DAYS,
  type WooBackfillBatch,
  WooBackfillError,
  type WooCheckpoint,
  parseRfc3339,
  runWooBackfill,
  wooBackfillChunks,
} from "./backfill.js";
import type { WooWindow } from "./client.js";
import { ORDER, PAGE } from "./fixtures.js";
import { WooNormalizeError } from "./normalize.js";

const STORE = "https://shop.example.com";
const CRED = { key: "ck_a1b2c3", secret: "cs_9z8y7x" };
const FETCHED_AT = "2026-09-10T02:00:00.000Z";
const BANGKOK = "Asia/Bangkok";

const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0,
  now: () => new Date(FETCHED_AT),
  sleep: async () => undefined,
};

/**
 * THE SUITE RUNS IN ASIA/BANGKOK -- see vitest.config.ts. Every instant below is written out as a
 * full UTC string for the reason that file gives: in UTC the right answer and a local-time reading
 * produce the same string, so a test that does not spell the boundary out cannot fail.
 */
function span(after: string, before: string): WooWindow {
  return { modifiedAfter: after, modifiedBefore: before };
}

/** A fake store. The call COUNT and the URLs it was asked for are half the assertions here. */
function store(handler: (url: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url);
  };
  return { calls, client: { fetchImpl, storeUrl: STORE, credential: CRED, ...RETRY } };
}

function paged(body: unknown[], totalPages = 1, totalOrders = body.length): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "x-wp-totalpages": String(totalPages),
      "x-wp-total": String(totalOrders),
    },
  });
}

/** Drive the generator by hand, because the RETURN value is the point of the fourth decision. */
async function drive(gen: AsyncGenerator<WooBackfillBatch, WooCheckpoint, undefined>) {
  const batches: WooBackfillBatch[] = [];
  let next = await gen.next();
  while (!next.done) {
    batches.push(next.value);
    next = await gen.next();
  }
  return { batches, checkpoint: next.value };
}

describe("cutting the span into chunks", () => {
  it("emits one chunk when the span is shorter than a chunk", () => {
    const chunks = wooBackfillChunks(span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"));
    expect(chunks).toEqual([span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z")]);
  });

  it("walks OLDEST FIRST, which is the only order a watermark can advance through", () => {
    const chunks = wooBackfillChunks(
      span("2026-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"),
      31,
    );
    expect(chunks.map((c) => c.modifiedAfter)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
      "2026-03-04T00:00:00.000Z",
    ]);
  });

  it("leaves no second between chunks, and never reaches past the end of the span", () => {
    const chunks = wooBackfillChunks(
      span("2026-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"),
      31,
    );
    for (const [index, chunk] of chunks.entries()) {
      // ADJACENT CHUNKS SHARE THEIR BOUNDARY INSTANT. `client.ts` records that WooCommerce's
      // bounds are probably inclusive at both ends and unverified against a live store; sharing
      // the instant re-reads one order under the inclusive reading, which the upsert collapses,
      // and reads every order exactly once under the exclusive one. A `+1s` would be exact under
      // one reading and a permanent hole under the other.
      const next = chunks[index + 1];
      if (next !== undefined) expect(next.modifiedAfter).toBe(chunk.modifiedBefore);
    }
    expect(chunks.at(-1)?.modifiedBefore).toBe("2026-04-01T00:00:00.000Z");
  });

  it("defaults to WOO_BACKFILL_CHUNK_DAYS", () => {
    const days = WOO_BACKFILL_CHUNK_DAYS;
    const to = new Date(Date.UTC(2026, 0, 1) + days * 86_400_000 * 2).toISOString();
    expect(wooBackfillChunks(span("2026-01-01T00:00:00.000Z", to))).toHaveLength(2);
    expect(wooBackfillChunks(span("2026-01-01T00:00:00.000Z", to), days)).toHaveLength(2);
  });

  it("refuses a span that ends at or before it starts, rather than spending a request on it", () => {
    const same = "2026-09-09T00:00:00.000Z";
    expect(() => wooBackfillChunks(span(same, same))).toThrow(WooBackfillError);
    expect(() => wooBackfillChunks(span("2026-09-10T00:00:00.000Z", same))).toThrow(
      WooBackfillError,
    );
  });

  it("refuses a chunk size that would never reach the end of the span", () => {
    const s = span("2026-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z");
    expect(() => wooBackfillChunks(s, 0)).toThrow(WooBackfillError);
    expect(() => wooBackfillChunks(s, -1)).toThrow(WooBackfillError);
    expect(() => wooBackfillChunks(s, Number.NaN)).toThrow(WooBackfillError);
  });

  it("refuses a boundary that is not an RFC3339 instant", () => {
    expect(() => wooBackfillChunks(span("yesterday", "2026-09-10T00:00:00.000Z"))).toThrow(
      WooBackfillError,
    );
  });
});

describe("RFC3339, and the three things Date.parse accepts that it must not", () => {
  it("accepts the forms that are actually RFC3339", () => {
    expect(parseRfc3339("2026-09-11T00:00:00Z", "t")).toBe(Date.parse("2026-09-11T00:00:00Z"));
    expect(parseRfc3339("2026-09-11T00:00:00.123Z", "t")).toBe(
      Date.parse("2026-09-11T00:00:00.123Z"),
    );
    // An offset is legitimate and must resolve to the instant it names, not to midnight UTC.
    expect(parseRfc3339("2026-09-11T00:00:00+07:00", "t")).toBe(Date.parse("2026-09-10T17:00:00Z"));
    // A leap day in a leap year is a real date.
    expect(parseRfc3339("2024-02-29T00:00:00Z", "t")).toBe(Date.parse("2024-02-29T00:00:00Z"));
  });

  it("refuses a date that does not exist rather than rolling it forward", () => {
    // `Date.parse("2026-02-30T00:00:00Z")` is 2026-03-02 and reports no error. As a watermark that
    // silently skips two days of orders -- and the checkpoint then advances past them, so nothing
    // reads them again. This is the sharpest of the three.
    expect(Date.parse("2026-02-30T00:00:00Z")).toBe(Date.parse("2026-03-02T00:00:00Z"));
    expect(() => parseRfc3339("2026-02-30T00:00:00Z", "t")).toThrow(WooBackfillError);
    expect(() => parseRfc3339("2026-04-31T00:00:00Z", "t")).toThrow(WooBackfillError);
    expect(() => parseRfc3339("2025-02-29T00:00:00Z", "t")).toThrow(WooBackfillError);
  });

  it("refuses a timestamp with no designator, which would be read as LOCAL time", () => {
    // THE SUITE RUNS IN ASIA/BANGKOK. `Date.parse("2026-09-11T00:00:00")` is 17:00 on the 10th in
    // UTC here and midnight in CI, so accepting it would move the window by the runtime's offset --
    // the identical failure `wooGmtToDate` appends a `Z` to avoid.
    expect(() => parseRfc3339("2026-09-11T00:00:00", "t")).toThrow(WooBackfillError);
    expect(() => parseRfc3339("2026-09-11", "t")).toThrow(WooBackfillError);
  });

  it("refuses the loose formats Date.parse happens to understand", () => {
    expect(Number.isFinite(Date.parse("September 11, 2026"))).toBe(true);
    expect(() => parseRfc3339("September 11, 2026", "t")).toThrow(WooBackfillError);
    expect(() => parseRfc3339("", "t")).toThrow(WooBackfillError);
    expect(() => parseRfc3339("2026-09-11T25:00:00Z", "t")).toThrow(WooBackfillError);
  });

  it("is what the window boundaries actually go through", () => {
    expect(() => wooBackfillChunks(span("2026-02-30T00:00:00Z", "2026-09-10T00:00:00Z"))).toThrow(
      WooBackfillError,
    );
    expect(() => wooBackfillChunks(span("2026-09-01T00:00:00", "2026-09-10T00:00:00Z"))).toThrow(
      WooBackfillError,
    );
  });
});

describe("the timezone, which is required and is not decoration", () => {
  const DAY = span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z");

  it("refuses an empty timezone BEFORE the merchant's store is asked for anything", async () => {
    const { calls, client } = store(() => paged([ORDER]));
    await expect(
      drive(runWooBackfill({ client, window: DAY, timezone: "", fetchedAt: FETCHED_AT })),
    ).rejects.toThrow(WooNormalizeError);
    // The refusal is worth nothing if it arrives after a page has already been fetched: the
    // message would name an order rather than the connection, and the merchant's database has
    // already done the work.
    expect(calls).toHaveLength(0);
  });

  it("refuses a zone this runtime does not know, before any request", async () => {
    const { calls, client } = store(() => paged([ORDER]));
    await expect(
      drive(
        runWooBackfill({ client, window: DAY, timezone: "Mars/Olympus", fetchedAt: FETCHED_AT }),
      ),
    ).rejects.toThrow(WooNormalizeError);
    expect(calls).toHaveLength(0);
  });

  it("computes the DATE in the store's zone, not merely labels the row with it", async () => {
    // 2026-09-09T20:15:00 UTC is 03:15 on the TENTH in Bangkok. A normaliser that bucketed in UTC
    // would file this order on the ninth and stamp `Asia/Bangkok` on it -- a row asserting a day
    // in a zone it was not computed in, for seven hours of every day.
    const order = { ...ORDER, id: 9001, date_created_gmt: "2026-09-09T20:15:00" };
    const { client } = store(() => paged([order]));
    const { batches } = await drive(
      runWooBackfill({ client, window: DAY, timezone: BANGKOK, fetchedAt: FETCHED_AT }),
    );
    expect(batches[0]?.rows[0]?.dimensions).toMatchObject({
      date: "2026-09-10",
      timezone: BANGKOK,
    });
  });

  it("files the same instant on a different day for a store in a different zone", async () => {
    const order = { ...ORDER, id: 9001, date_created_gmt: "2026-09-09T20:15:00" };
    const { client } = store(() => paged([order]));
    const { batches } = await drive(
      runWooBackfill({ client, window: DAY, timezone: "America/New_York", fetchedAt: FETCHED_AT }),
    );
    // 16:15 on the ninth in New York. The store's zone is the whole difference.
    expect(batches[0]?.rows[0]?.dimensions.date).toBe("2026-09-09");
  });
});

describe("running a span", () => {
  const DAY = span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z");

  it("asks the store for the chunk it cut, with dates_are_gmt set", async () => {
    const { calls, client } = store(() => paged(PAGE as unknown[]));
    await drive(runWooBackfill({ client, window: DAY, timezone: BANGKOK, fetchedAt: FETCHED_AT }));

    expect(calls).toHaveLength(1);
    const url = calls[0] as URL;
    // The designator AND the milliseconds are stripped by `ordersUrl`: WooCommerce's date filters
    // take `YYYY-MM-DDTHH:MM:SS` and carry no sub-second part, which is also why the bisector's
    // floor is one second.
    expect(url.searchParams.get("modified_after")).toBe("2026-09-09T00:00:00");
    expect(url.searchParams.get("modified_before")).toBe("2026-09-10T00:00:00");
    // Without this WooCommerce reads the window in the merchant's WordPress timezone, which would
    // silently shift which orders a run sees rather than which day they land on.
    expect(url.searchParams.get("dates_are_gmt")).toBe("true");
  });

  it("emits ONE BATCH PER PAGE rather than accumulating a window", async () => {
    // Three pages of one chunk. GA4 would hand these over as a single batch; a Woo window may
    // legally reach 128,000 orders, which is the buffer `client.ts` capped per_page to avoid.
    const { client } = store((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return paged([{ ...ORDER, id: 100 + page }], 3, 3);
    });
    const { batches } = await drive(
      runWooBackfill({ client, window: DAY, timezone: BANGKOK, fetchedAt: FETCHED_AT }),
    );
    expect(batches.map((b) => b.page)).toEqual([1, 2, 3]);
    expect(batches.map((b) => b.rows.length)).toEqual([1, 1, 1]);
    expect(batches.every((b) => b.totalPages === 3)).toBe(true);
  });

  it("stamps account_id from the origin the request was actually sent to", async () => {
    const { client } = store(() => paged([ORDER]));
    const { batches } = await drive(
      runWooBackfill({ client, window: DAY, timezone: BANGKOK, fetchedAt: FETCHED_AT }),
    );
    expect(batches[0]?.rows[0]?.entity.account_id).toBe(STORE);
  });

  it("emits first_seen_at equal to fetched_at, and leaves immutability to the upsert", async () => {
    const { client } = store(() => paged([ORDER]));
    const { batches } = await drive(
      runWooBackfill({ client, window: DAY, timezone: BANGKOK, fetchedAt: FETCHED_AT }),
    );
    const row = batches[0]?.rows[0];
    // Correct for a first sighting and wrong for a re-pull -- and a connector cannot tell which,
    // because it has no store. `app.upsert_envelope_row` preserves the existing value on conflict.
    expect(row?.first_seen_at).toBe(FETCHED_AT);
    expect(row?.fetched_at).toBe(FETCHED_AT);
  });

  it("refuses an order the normaliser cannot read, rather than dropping it", async () => {
    // A dropped order is a total quietly too low, which is the failure this product sells against.
    const { client } = store(() => paged([{ ...ORDER, currency: undefined }]));
    await expect(
      drive(runWooBackfill({ client, window: DAY, timezone: BANGKOK, fetchedAt: FETCHED_AT })),
    ).rejects.toThrow(WooNormalizeError);
  });
});

describe("the checkpoint, which is where the next run starts", () => {
  const THREE_CHUNKS = span("2026-01-01T00:00:00.000Z", "2026-01-04T00:00:00.000Z");

  it("advances only to the end of a chunk that was read IN FULL", async () => {
    const seen: WooCheckpoint[] = [];
    const { client } = store(() => paged([ORDER]));
    const { checkpoint } = await drive(
      runWooBackfill({
        client,
        window: THREE_CHUNKS,
        chunkDays: 1,
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
        onChunk: (c) => {
          // Braced deliberately: `seen.push(c)` returns a number, and the union
          // `void | Promise<void>` does not absorb a stray return value the way a bare `void` does.
          // That is the union doing its job -- it is what makes an async callback observable.
          seen.push(c);
        },
      }),
    );

    expect(seen.map((c) => c.modifiedAfter)).toEqual([
      "2026-01-02T00:00:00.000Z",
      "2026-01-03T00:00:00.000Z",
      "2026-01-04T00:00:00.000Z",
    ]);
    expect(seen.map((c) => c.chunks)).toEqual([1, 2, 3]);
    // Rows accumulate across the whole run, not per chunk.
    expect(seen.map((c) => c.rows)).toEqual([1, 2, 3]);
    // The generator's RETURN value says the whole span is done, and equals the last chunk's.
    expect(checkpoint).toEqual(seen.at(-1));
    expect(checkpoint.modifiedAfter).toBe(THREE_CHUNKS.modifiedBefore);
  });

  it("advances through a quiet chunk that returned no orders at all", async () => {
    // A store with nothing modified is a real outcome, not a failure, and a watermark that could
    // not cross a quiet day would re-read it forever.
    const { client } = store(() => paged([]));
    const { batches, checkpoint } = await drive(
      runWooBackfill({
        client,
        window: THREE_CHUNKS,
        chunkDays: 1,
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batches.flatMap((b) => b.rows)).toHaveLength(0);
    expect(checkpoint).toEqual({
      modifiedAfter: "2026-01-04T00:00:00.000Z",
      chunks: 3,
      rows: 0,
    });
  });

  it("leaves the watermark at the last COMPLETE chunk when a later one fails", async () => {
    const seen: WooCheckpoint[] = [];
    let calls = 0;
    const { client } = store(() => {
      calls += 1;
      // The first chunk answers; the second's store is down. A 500 is retried and then given up
      // on, which is `fetchWithRetry`'s refusal rather than this module's -- and that is the point:
      // the checkpoint rule must hold for a failure arriving from ANY layer beneath it.
      if (calls === 1) return paged([ORDER]);
      return new Response("upstream is having a bad day", { status: 500 });
    });

    await expect(
      drive(
        runWooBackfill({
          client,
          window: THREE_CHUNKS,
          chunkDays: 1,
          timezone: BANGKOK,
          fetchedAt: FETCHED_AT,
          onChunk: (c) => {
            // Braced deliberately: `seen.push(c)` returns a number, and the union
            // `void | Promise<void>` does not absorb a stray return value the way a bare `void` does.
            // That is the union doing its job -- it is what makes an async callback observable.
            seen.push(c);
          },
        }),
      ),
    ).rejects.toThrow(ExtractError);

    // ONE checkpoint, at the end of the first chunk. Advancing past the second would open a hole
    // nothing will ever ask about again: no later run requests a window that is behind the mark.
    expect(seen).toEqual([{ modifiedAfter: "2026-01-02T00:00:00.000Z", chunks: 1, rows: 1 }]);
  });

  it("AWAITS onChunk, so a durable watermark write cannot lag the run", async () => {
    // A `=> void` signature accepts an `async` function and drops its promise. The next chunk would
    // then start while the write was in flight, two writes could land out of order, and a rejected
    // one would surface as an unhandled rejection while the run reported success. Every one of
    // those ends with a watermark ahead of what was stored.
    const order: string[] = [];
    const { client } = store(() => paged([ORDER]));
    await drive(
      runWooBackfill({
        client,
        window: THREE_CHUNKS,
        chunkDays: 1,
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
        onChunk: async (c) => {
          order.push(`start ${c.chunks}`);
          await new Promise((resolve) => setTimeout(resolve, 1));
          order.push(`end ${c.chunks}`);
        },
      }),
    );

    // Strictly interleaved: every write finishes before the next one begins. Unawaited, the three
    // starts would run together and the ends would arrive afterwards.
    expect(order).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  it("propagates a rejection from onChunk instead of reporting success", async () => {
    const { client } = store(() => paged([ORDER]));
    await expect(
      drive(
        runWooBackfill({
          client,
          window: THREE_CHUNKS,
          chunkDays: 1,
          timezone: BANGKOK,
          fetchedAt: FETCHED_AT,
          onChunk: async () => {
            throw new Error("the watermark write failed");
          },
        }),
      ),
    ).rejects.toThrow("the watermark write failed");
  });

  it("produces no return value at all from a run that threw", async () => {
    const { client } = store(() => {
      throw new Error("the store went away");
    });
    const gen = runWooBackfill({
      client,
      window: THREE_CHUNKS,
      chunkDays: 1,
      timezone: BANGKOK,
      fetchedAt: FETCHED_AT,
    });
    // The fourth decision, structurally: a checkpoint cannot be read off a failed run, because
    // `done: true` is the only thing that carries one and a throw never gets there.
    await expect(gen.next()).rejects.toThrow();
  });
});
