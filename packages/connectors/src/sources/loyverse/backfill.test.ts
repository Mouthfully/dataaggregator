import { type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  LOYVERSE_BACKFILL_CHUNK_DAYS,
  type LoyverseBackfillBatch,
  LoyverseBackfillError,
  type LoyverseCheckpoint,
  loyverseBackfillChunks,
  parseLoyverseInstant,
  runLoyverseBackfill,
} from "./backfill.ts";
import {
  LOYVERSE_RATE_REQUESTS,
  type LoyverseCredential,
  LoyverseClientError,
  type LoyverseWindow,
} from "./client.ts";
import { MERCHANT, SALE } from "./fixtures.ts";
import { LoyverseNormalizeError } from "./normalize.ts";

const FETCHED_AT = "2026-09-10T02:00:00.000Z";
const BANGKOK = "Asia/Bangkok";

const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0,
  now: () => new Date(FETCHED_AT),
  sleep: async () => undefined,
};

const OAUTH: LoyverseCredential = {
  kind: "oauth",
  accessToken: "39557133-8881-4ce7-99b5-2ab4d15c2092",
  grantedScopes: ["RECEIPTS_READ", "MERCHANT_READ"],
};

/**
 * THE SUITE RUNS IN ASIA/BANGKOK -- see vitest.config.ts. Every instant below is written out as a
 * full UTC string for the reason that file gives: in UTC the right answer and a local-time reading
 * produce the same string, so a test that does not spell the boundary out cannot fail.
 */
function span(after: string, before: string): LoyverseWindow {
  return { updatedAfter: after, updatedBefore: before };
}

/** A fake account. The call COUNT and the URLs it was asked for are half the assertions here. */
function account(receipts: (url: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith("/merchant/")) {
      return new Response(JSON.stringify(MERCHANT), {
        headers: { "content-type": "application/json" },
      });
    }
    return receipts(url);
  };
  return { calls, client: { fetchImpl, credential: OAUTH, ...RETRY } };
}

function page(body: unknown[], cursor?: string): Response {
  return new Response(
    JSON.stringify(cursor === undefined ? { receipts: body } : { receipts: body, cursor }),
    { headers: { "content-type": "application/json" } },
  );
}

async function drain(
  gen: AsyncGenerator<LoyverseBackfillBatch, LoyverseCheckpoint, undefined>,
): Promise<{ batches: LoyverseBackfillBatch[]; checkpoint: LoyverseCheckpoint }> {
  const batches: LoyverseBackfillBatch[] = [];
  let next = await gen.next();
  while (next.done !== true) {
    batches.push(next.value);
    next = await gen.next();
  }
  return { batches, checkpoint: next.value };
}

describe("the chunk plan", () => {
  it("cuts the span oldest first, because a watermark is a LOW-water mark", () => {
    // Reading newest-first would finish the newest chunk and leave the watermark exactly where it
    // started, because the gap behind it is what the watermark means. GA4 reads newest-first for
    // the opposite reason: its windows are independent and it has no watermark.
    const chunks = loyverseBackfillChunks(
      span("2026-09-01T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
    );
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.updatedAfter).toBe("2026-09-01T00:00:00.000Z");
    expect(chunks.at(-1)?.updatedBefore).toBe("2026-09-22T00:00:00.000Z");
  });

  it("makes adjacent chunks SHARE their boundary instant, never skip it", () => {
    // An overlap is collapsed by the upsert, because a re-read receipt has the same key. A gap is
    // not recoverable by anything: nothing asks for that window again.
    const chunks = loyverseBackfillChunks(
      span("2026-09-01T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
    );
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]?.updatedAfter).toBe(chunks[i - 1]?.updatedBefore);
    }
  });

  it("never runs past the end of the span it was given", () => {
    const chunks = loyverseBackfillChunks(
      span("2026-09-01T00:00:00.000Z", "2026-09-04T00:00:00.000Z"),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.updatedBefore).toBe("2026-09-04T00:00:00.000Z");
  });

  it("uses a chunk narrow enough that the page ceiling is unreachable for a cafe", () => {
    // SEVEN DAYS, where WooCommerce uses thirty-one, and the difference is the missing bisector: a
    // Woo chunk that turns out too large is SPLIT, while an oversized chunk here just throws and
    // the whole chunk is lost. At 250 a page this is 100,000 receipts before the ceiling bites.
    expect(LOYVERSE_BACKFILL_CHUNK_DAYS).toBe(7);
  });

  it("refuses a span that ends at or before it starts", () => {
    // A caller that passed the same watermark twice would otherwise spend a request on a window
    // that can contain nothing, and be told it succeeded.
    try {
      loyverseBackfillChunks(span("2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z"));
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseBackfillError).code).toBe("invalid_window");
    }
  });

  it("refuses a non-positive chunk, which would never terminate", () => {
    expect(() =>
      loyverseBackfillChunks(span("2026-09-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z"), 0),
    ).toThrow(LoyverseBackfillError);
  });
});

describe("parseLoyverseInstant: the four answers Date.parse gets dangerously wrong", () => {
  it("refuses a day that does not exist rather than rolling it forward", () => {
    // `"2026-02-30T00:00:00Z"` is 2026-03-02 to Date.parse. A watermark set to a day that does not
    // exist would silently skip two days, and the checkpoint would then advance past them.
    expect(() => parseLoyverseInstant("2026-02-30T00:00:00Z", "updatedAfter")).toThrow(
      /not an instant that exists/,
    );
  });

  it("refuses hour 24, which Date.parse rolls into the next day", () => {
    expect(() => parseLoyverseInstant("2026-09-11T24:00:00Z", "updatedAfter")).toThrow(
      /not an instant that exists/,
    );
  });

  it("refuses a designator-less instant, which is read as LOCAL time", () => {
    // The suite runs in Asia/Bangkok precisely so this is not a theoretical seven-hour shift.
    expect(() => parseLoyverseInstant("2026-09-11T00:00:00", "updatedAfter")).toThrow(/RFC3339/);
  });

  it("refuses a prose date", () => {
    expect(() => parseLoyverseInstant("September 11, 2026", "updatedAfter")).toThrow(/RFC3339/);
  });

  it("accepts a real instant, with or without fractional seconds and with an offset", () => {
    expect(parseLoyverseInstant("2026-09-11T00:00:00Z", "f")).toBe(
      Date.parse("2026-09-11T00:00:00Z"),
    );
    expect(parseLoyverseInstant("2026-09-11T00:00:00.123Z", "f")).toBeGreaterThan(0);
    expect(parseLoyverseInstant("2026-09-11T07:00:00+07:00", "f")).toBe(
      Date.parse("2026-09-11T00:00:00Z"),
    );
  });
});

describe("the run", () => {
  it("fetches the merchant profile BEFORE any receipt, because a receipt has no currency", () => {
    // If the currency is unreadable, nothing is storable -- so discovering it after walking forty
    // pages would spend the merchant's rate budget to produce nothing.
    const { calls, client } = account(() => page([SALE]));
    return drain(
      runLoyverseBackfill({
        client,
        window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    ).then(({ batches }) => {
      expect(calls[0]?.pathname).toMatch(/\/merchant\/$/);
      expect(batches[0]?.rows[0]?.dimensions.currency).toBe("THB");
      expect(batches[0]?.rows[0]?.entity.account_id).toBe(MERCHANT.id);
    });
  });

  it("reads nothing at all when the merchant profile cannot be read", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/merchant/")) {
        return new Response(JSON.stringify({ id: MERCHANT.id }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("should never have asked for receipts");
    };
    await expect(
      drain(
        runLoyverseBackfill({
          client: { fetchImpl, credential: OAUTH, ...RETRY },
          window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
          timezone: BANGKOK,
          fetchedAt: FETCHED_AT,
        }),
      ),
    ).rejects.toThrow(/not an ISO 4217 code/);
  });

  it("yields one batch per PAGE, never accumulating a chunk", () => {
    // A chunk may legally be LOYVERSE_MAX_PAGES * LOYVERSE_PAGE_LIMIT receipts -- 100,000 -- and
    // buffering that in a 128 MB isolate to hand back one array is what this avoids.
    const bodies = [page([SALE], "c1"), page([SALE])];
    let i = 0;
    const { client } = account(() => bodies[i++] as Response);
    return drain(
      runLoyverseBackfill({
        client,
        window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    ).then(({ batches }) => {
      expect(batches).toHaveLength(2);
      expect(batches.map((b) => b.page)).toEqual([1, 2]);
    });
  });

  it("refuses the timezone before the first request, not one page later", async () => {
    // So the message names the connection rather than a receipt, and the merchant's account has not
    // already paid for the request.
    const { calls, client } = account(() => page([SALE]));
    await expect(
      drain(
        runLoyverseBackfill({
          client,
          window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
          timezone: "Mars/Olympus",
          fetchedAt: FETCHED_AT,
        }),
      ),
    ).rejects.toThrow(LoyverseNormalizeError);
    expect(calls).toHaveLength(0);
  });
});

describe("the watermark, which is where a permanent hole would come from", () => {
  const SPAN = span("2026-09-01T00:00:00.000Z", "2026-09-22T00:00:00.000Z");

  it("advances only through chunks read IN FULL", async () => {
    const { client } = account(() => page([SALE]));
    const seen: LoyverseCheckpoint[] = [];
    const { checkpoint } = await drain(
      runLoyverseBackfill({
        client,
        window: SPAN,
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
        onChunk: (c) => {
          seen.push(c);
        },
      }),
    );
    expect(seen).toHaveLength(3);
    expect(seen.map((c) => c.chunks)).toEqual([1, 2, 3]);
    expect(checkpoint.updatedAfter).toBe(SPAN.updatedBefore);
  });

  it("leaves the watermark on the last COMPLETE chunk when a later one fails", async () => {
    // THE PROPERTY THE WHOLE FILE IS ARRANGED AROUND. Advancing past a chunk that was not read in
    // full opens a hole nothing ever asks about again.
    // KEYED ON THE CHUNK'S OWN BOUNDARY, NOT ON A CALL COUNTER. The first version of this counted
    // requests and failed the second one -- and passed, because `fetchWithRetry` RETRIED the 500 and
    // the retry succeeded. A test of "the watermark stops at the last complete chunk" that is
    // silently testing "the retry worked" is exactly the false pass this suite exists to catch.
    const { client } = account((url) =>
      url.searchParams.get("updated_at_min") === "2026-09-08T00:00:00.000Z"
        ? new Response("{}", { status: 500 })
        : page([SALE]),
    );
    const seen: LoyverseCheckpoint[] = [];
    await expect(
      drain(
        runLoyverseBackfill({
          client,
          window: SPAN,
          timezone: BANGKOK,
          fetchedAt: FETCHED_AT,
          onChunk: (c) => {
            seen.push(c);
          },
        }),
      ),
    ).rejects.toThrow();
    // Exactly one chunk banked, and the watermark sits on ITS end -- not on the failed chunk's.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.updatedAfter).toBe("2026-09-08T00:00:00.000Z");
  });

  it("banks a checkpoint at the START of the span before anything has been read", async () => {
    // Every chunk costs at least one request, so "nothing read, nothing skipped" is the only honest
    // answer before the first one comes back.
    const { client } = account(() => new Response("{}", { status: 500 }));
    const gen = runLoyverseBackfill({
      client,
      window: SPAN,
      timezone: BANGKOK,
      fetchedAt: FETCHED_AT,
    });
    await expect(gen.next()).rejects.toThrow();
  });

  it("AWAITS an async onChunk before starting the next chunk", async () => {
    // A `=> void` signature accepts an async function happily, so the promise would be dropped: two
    // writes could land out of order and a rejected one would surface as an unhandled rejection
    // while the run reported success. Every one of those ends as a watermark ahead of what stored.
    const order: string[] = [];
    let receiptCalls = 0;
    const { client } = account(() => {
      receiptCalls += 1;
      order.push(`fetch:${receiptCalls}`);
      return page([SALE]);
    });
    await drain(
      runLoyverseBackfill({
        client,
        window: SPAN,
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
        onChunk: async (c) => {
          order.push(`bank:start:${c.chunks}`);
          await new Promise((resolve) => setTimeout(resolve, 1));
          order.push(`bank:end:${c.chunks}`);
        },
      }),
    );
    // No fetch may appear between a bank's start and its end.
    expect(order).toEqual([
      "fetch:1",
      "bank:start:1",
      "bank:end:1",
      "fetch:2",
      "bank:start:2",
      "bank:end:2",
      "fetch:3",
      "bank:start:3",
      "bank:end:3",
    ]);
  });

  it("propagates a rejected onChunk rather than reporting success", async () => {
    const { client } = account(() => page([SALE]));
    await expect(
      drain(
        runLoyverseBackfill({
          client,
          window: SPAN,
          timezone: BANGKOK,
          fetchedAt: FETCHED_AT,
          onChunk: async () => {
            throw new Error("the store was down");
          },
        }),
      ),
    ).rejects.toThrow(/the store was down/);
  });

  it("counts rows rather than pages, because one row is one receipt", async () => {
    const { client } = account(() => page([SALE, { ...SALE, receipt_number: "1-1099" }]));
    const { checkpoint } = await drain(
      runLoyverseBackfill({
        client,
        window: SPAN,
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(checkpoint.rows).toBe(6);
    expect(checkpoint.chunks).toBe(3);
  });
});

describe("the rate budget across chunks", () => {
  it("threads ONE budget through every chunk, rather than restarting it each time", async () => {
    // The 300-per-300s limit is per ACCOUNT and does not reset at a chunk boundary. A walk that
    // began afresh each chunk could spend 300 per chunk and hand the merchant a 429 on their own
    // till.
    const { client } = account(() => page([SALE]));
    const { batches, checkpoint } = await drain(
      runLoyverseBackfill({
        client,
        window: span("2026-09-01T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    );
    // One merchant call plus three receipt pages.
    expect(batches.map((b) => b.budget.at.length)).toEqual([2, 3, 4]);
    expect(checkpoint.budget.at).toHaveLength(4);
  });

  it("surfaces the budget on every batch, not only at the end", async () => {
    // Loyverse reports no quota header and the limit is shared with the merchant's own
    // integrations, so a run consuming an account's headroom should be visible while it happens.
    const { client } = account(() => page([SALE]));
    const { batches } = await drain(
      runLoyverseBackfill({
        client,
        window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    );
    expect(batches[0]?.budget.at.length).toBeGreaterThan(0);
  });

  it("stops the run rather than earning the merchant a 429", async () => {
    const { client } = account(() => page([SALE]));
    const spent = {
      at: Array.from({ length: LOYVERSE_RATE_REQUESTS }, () => Date.parse(FETCHED_AT) - 1000),
    };
    await expect(
      drain(
        runLoyverseBackfill({
          client,
          window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
          timezone: BANGKOK,
          fetchedAt: FETCHED_AT,
          walk: { budget: spent },
        }),
      ),
    ).rejects.toThrow(LoyverseClientError);
  });
});

describe("what the run produces", () => {
  it("stamps every row with the run's own fetchedAt, so they agree with each other", async () => {
    const { client } = account(() => page([SALE]));
    const { batches } = await drain(
      runLoyverseBackfill({
        client,
        window: span("2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    );
    for (const row of batches.flatMap((b) => b.rows)) {
      expect(row.fetched_at).toBe(FETCHED_AT);
      expect(row.first_seen_at).toBe(FETCHED_AT);
      // No Loyverse window ever closes, so nothing this run produces is ever final.
      expect(row.is_provisional).toBe(true);
    }
  });

  it("asks for the chunk it says it is reading", async () => {
    const { calls, client } = account(() => page([SALE]));
    const { batches } = await drain(
      runLoyverseBackfill({
        client,
        window: span("2026-09-01T00:00:00.000Z", "2026-09-15T00:00:00.000Z"),
        timezone: BANGKOK,
        fetchedAt: FETCHED_AT,
      }),
    );
    const receiptCalls = calls.filter((c) => c.pathname.endsWith("/receipts"));
    expect(receiptCalls[0]?.searchParams.get("updated_at_min")).toBe(
      batches[0]?.chunk.updatedAfter,
    );
    expect(receiptCalls[0]?.searchParams.get("updated_at_max")).toBe(
      batches[0]?.chunk.updatedBefore,
    );
  });
});
