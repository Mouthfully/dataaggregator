/**
 * THE RUN, END TO END, WITH NO NETWORK AND NO DATABASE.
 *
 * This is the first test in the repository that exercises all four open joints in sequence --
 * connection read, credential open, platform fetch, row write -- and it does it in real workerd
 * against fakes, because `runIngest` is a boundary over ports rather than over bindings.
 *
 * THE CREDENTIAL IS REAL. It is sealed with `@repo/vault` under a real KEK and opened by the run,
 * so the seal/open path is exercised rather than stubbed: a run that could not decrypt would fail
 * here rather than on stage.
 *
 * NOTHING HERE IS A SECRET. The KEK is generated per test, the consumer key is a fixture, and the
 * store is a function in this file.
 */

import { SELF } from "cloudflare:test";
import { seal, type CryptoLike as VaultCrypto } from "@repo/vault";
import type { ConnectionRecord, IngestContext } from "@repo/store";
import type { EnvelopeRow } from "@repo/contract";
import { describe, expect, it } from "vitest";
import {
  IngestError,
  IngestRunFailure,
  parseIngestRequest,
  runIngest,
  type IngestDeps,
} from "../src/ingest.js";
// Vite resolves `?raw` to the file's text, the same mechanism `webhooks.test.ts` uses to see
// wrangler.jsonc and `performance.test.ts` uses to see config.toml. Here it is the only way to
// assert a property of the IMPLEMENTATION rather than of the result -- see below.
import indexSource from "../src/index.ts?raw";
import { reasonOf, tokenMatches } from "../src/index.js";
import { StoreError } from "@repo/store";
import { WooBackfillError, parseRfc3339 } from "@repo/connectors";
import { WooNormalizeError } from "@repo/connectors";
import { ExtractError } from "@repo/extract";

const WORKSPACE = "7c000000-0000-0000-0000-000000000001";
const CONNECTION = "8d000000-0000-0000-0000-000000000002";
const STORE_URL = "https://shop.example.com";
const NOW = new Date("2026-09-12T02:00:00.000Z");
const webcrypto = crypto as unknown as VaultCrypto;

/**
 * A WooCommerce order, written out here rather than imported from the connector's fixtures.
 *
 * `@repo/connectors` does not export `fixtures.ts` from its barrel, and it should not: a fixture is
 * a connector's own test material, and a barrel that exported it would make it part of the package
 * contract. What this test needs is the four fields `normalizeWooOrders` actually reads, and
 * spelling them out here is also what makes the date assertions below readable.
 */
function order(id: number, createdGmt = "2026-09-11T04:00:00"): Record<string, unknown> {
  return {
    id,
    number: String(id),
    status: "completed",
    currency: "THB",
    date_created_gmt: createdGmt,
    date_modified_gmt: createdGmt,
    total: "1250.00",
  };
}

/**
 * One page, with pagination headers that AGREE WITH EACH OTHER.
 *
 * `x-wp-total` is the WINDOW's order count, not this page's length, and the client checks the two
 * against each other: a window that yields more distinct orders than the store said it held means a
 * row moved under OFFSET paging, and it refuses rather than returning a total that is quietly
 * short. The first draft of this helper set `x-wp-total` to `body.length`, which made a
 * three-page fixture claim it held one order -- and the connector caught it, which is the guard
 * working on a test rather than in production.
 */
function page(body: unknown[], totalPages = 1, totalOrders = body.length): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "x-wp-totalpages": String(totalPages),
      "x-wp-total": String(totalOrders),
    },
  });
}

/** A connection row, sealed for real. */
async function connection(
  kek: Uint8Array,
  overrides: Partial<ConnectionRecord> = {},
): Promise<ConnectionRecord> {
  const sealed = await seal(webcrypto, {
    plaintext: JSON.stringify({ kind: "key_secret", key: "ck_a1b2c3", secret: "cs_9z8y7x" }),
    kek,
    keyVersion: 1,
    scope: { workspaceId: WORKSPACE, connectionId: CONNECTION },
  });
  return {
    id: CONNECTION,
    workspaceId: WORKSPACE,
    provider: "woocommerce",
    credentialLane: "key_secret",
    externalAccountId: STORE_URL,
    displayName: "Example Shop",
    credentialCiphertext: sealed.ciphertext,
    credentialIv: sealed.iv,
    wrappedDek: sealed.wrappedDek,
    keyVersion: sealed.keyVersion,
    grantedScopes: [],
    expiresAt: null,
    status: "active",
    lastError: null,
    revokedAt: null,
    timezone: "Asia/Bangkok",
    ...overrides,
  };
}

interface Harness {
  readonly deps: IngestDeps;
  readonly written: Array<{ rows: readonly EnvelopeRow[]; context: IngestContext }>;
  readonly storeCalls: URL[];
}

async function harness(
  options: {
    record?: ConnectionRecord | null;
    handler?: (url: URL, call: number) => Response;
    onWrite?: (rows: readonly EnvelopeRow[]) => void;
    kekOverride?: string;
  } = {},
): Promise<Harness> {
  const kek = crypto.getRandomValues(new Uint8Array(32));
  const record = options.record === undefined ? await connection(kek) : options.record;

  const written: Array<{ rows: readonly EnvelopeRow[]; context: IngestContext }> = [];
  const storeCalls: URL[] = [];
  let call = 0;

  return {
    written,
    storeCalls,
    deps: {
      connections: { read: async () => record },
      ingest: {
        write: async (rows, context) => {
          options.onWrite?.(rows);
          written.push({ rows, context });
          return rows.length;
        },
      },
      kek: options.kekOverride ?? btoa(String.fromCharCode(...kek)),
      fetchImpl: (async (input: unknown) => {
        const url = new URL(String(input));
        storeCalls.push(url);
        call += 1;
        return options.handler?.(url, call) ?? page([order(1001)]);
      }) as unknown as typeof fetch,
      crypto: webcrypto,
      now: () => NOW,
      sleep: async () => undefined,
      random: () => 0,
    },
  };
}

const REQUEST = {
  workspaceId: WORKSPACE,
  connectionId: CONNECTION,
  since: "2026-09-11T00:00:00.000Z",
  until: "2026-09-12T00:00:00.000Z",
};

describe("the run, end to end", () => {
  it("reads the store, opens the credential, and writes envelope rows", async () => {
    const h = await harness({ handler: () => page([order(1001), order(1002)]) });
    const report = await runIngest(REQUEST, h.deps);

    // ONE REQUEST to the merchant, carrying the window and the GMT flag.
    expect(h.storeCalls).toHaveLength(1);
    const url = h.storeCalls[0] as URL;
    expect(url.origin).toBe(STORE_URL);
    expect(url.pathname).toBe("/wp-json/wc/v3/orders");
    expect(url.searchParams.get("dates_are_gmt")).toBe("true");
    expect(url.searchParams.get("modified_after")).toBe("2026-09-11T00:00:00");

    // TWO INDEPENDENT COUNTS AGREEING. `rowsWritten` accumulates what the store REPORTED, never
    // what was read, so this is not one number printed twice.
    expect(report.rowsRead).toBe(2);
    expect(report.rowsWritten).toBe(2);
    expect(report.pages).toBe(1);
    expect(report.complete).toBe(true);
    expect(report.checkpoint).toBe("2026-09-12T00:00:00.000Z");
  });

  it("stamps the tenancy the envelope deliberately does not carry", async () => {
    const h = await harness();
    await runIngest(REQUEST, h.deps);

    // A connector physically cannot choose a workspace -- it never sees one. Both values come from
    // the CONNECTION ROW, not from the request body, so a caller naming a workspace it does not own
    // is refused by row-level security at the read rather than writing into it here.
    expect(h.written[0]?.context).toEqual({
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
    });
  });

  it("produces rows the envelope accepts, dated in the STORE's zone", async () => {
    // 2026-09-11T20:15:00 UTC is 03:15 on the TWELFTH in Bangkok.
    const h = await harness({ handler: () => page([order(1001, "2026-09-11T20:15:00")]) });
    await runIngest(REQUEST, h.deps);

    const row = h.written[0]?.rows[0] as EnvelopeRow;
    expect(row.source).toBe("woocommerce");
    expect(row.entity.account_id).toBe(STORE_URL);
    expect(row.dimensions).toMatchObject({ date: "2026-09-12", timezone: "Asia/Bangkok" });
    expect(row.metrics.orders).toBe(1);
    // WooCommerce's clock never closes, so no row from it is ever final.
    expect(row.is_provisional).toBe(true);
    expect(row.restates_until).toBeNull();
  });

  it("writes PER PAGE, so nothing is read-but-unwritten behind a checkpoint", async () => {
    // Three pages of one chunk. Buffering them would let a checkpoint cover rows still in memory,
    // and the next run -- starting from that checkpoint -- would never look at them again.
    const h = await harness({
      handler: (url) => {
        const p = Number(url.searchParams.get("page") ?? "1");
        return page([order(1000 + p)], 3, 3);
      },
    });
    const report = await runIngest(REQUEST, h.deps);

    expect(h.written).toHaveLength(3);
    expect(h.written.map((w) => w.rows.length)).toEqual([1, 1, 1]);
    expect(report.pages).toBe(3);
  });

  it("counts what the DATABASE reported, never what was read", async () => {
    // The two numbers in the response are two independent counts, not one printed twice. A store
    // that confirmed fewer rows than were sent is a partial write, and `createIngestStore` already
    // refuses one -- but the run's own arithmetic must not paper over it either.
    const h = await harness({ handler: () => page([order(1001), order(1002)]) });
    const report = await runIngest(REQUEST, {
      ...h.deps,
      ingest: { write: async () => 1 },
    });
    expect(report.rowsRead).toBe(2);
    expect(report.rowsWritten).toBe(1);
  });

  it("reports a quiet store as a real outcome rather than a failure", async () => {
    const h = await harness({ handler: () => page([]) });
    const report = await runIngest(REQUEST, h.deps);

    // No rows, no write at all, and the watermark STILL advances -- a watermark that could not
    // cross a quiet day would re-read it forever.
    expect(h.written).toHaveLength(0);
    expect(report.rowsRead).toBe(0);
    expect(report.complete).toBe(true);
    expect(report.checkpoint).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("what the run refuses, and each one is a different next action", () => {
  it("refuses a connection it cannot find, without saying which of two reasons", async () => {
    const h = await harness({ record: null });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({
      refusal: "no_such_connection",
    });
  });

  it("refuses a provider with no backfill, before touching the credential", async () => {
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const h = await harness({ record: await connection(kek, { provider: "meta_ads" }) });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({
      refusal: "unsupported_provider",
    });
    expect(h.storeCalls).toHaveLength(0);
  });

  it("refuses a connection with no timezone, and it is NOT a bad request", async () => {
    // The request is fine; the connection is incomplete. Guessing UTC would move every order placed
    // in the merchant's evening onto the previous day, which is the whole reason the column exists.
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const h = await harness({ record: await connection(kek, { timezone: null }) });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({ refusal: "no_timezone" });
    expect(h.storeCalls).toHaveLength(0);
  });

  it("refuses a revoked connection", async () => {
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const h = await harness({
      record: await connection(kek, { status: "revoked", revokedAt: "2026-09-01T00:00:00+00:00" }),
    });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({
      refusal: "connection_unusable",
    });
    expect(h.storeCalls).toHaveLength(0);
  });

  it("refuses a connection the platform has already rejected", async () => {
    // `connectionHealth` knows a persisted `needs_reauth` outranks an expiry that has not passed.
    // Asking it rather than re-deriving is why this case is covered at all.
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const h = await harness({ record: await connection(kek, { status: "needs_reauth" }) });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({
      refusal: "connection_unusable",
    });
  });

  it("refuses an unusable KEK before reading anything at all", async () => {
    const h = await harness({ kekOverride: "dG9vLXNob3J0" });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({ refusal: "bad_kek" });
  });

  it("refuses a body missing a field, naming the field", async () => {
    expect(() =>
      parseIngestRequest({ connection_id: CONNECTION, since: "2026-09-11T00:00:00Z" }),
    ).toThrow(/workspace_id/);
    expect(() =>
      parseIngestRequest({ workspace_id: WORKSPACE, connection_id: CONNECTION }),
    ).toThrow(/since/);
  });

  it("refuses a `since` that is not an instant, and suggests nothing silently", async () => {
    // No default window. Too short opens a silent hole; too long spends the merchant's store on
    // history it already has; and in neither case does the operator learn which happened.
    const base = { workspace_id: WORKSPACE, connection_id: CONNECTION };
    expect(() => parseIngestRequest({ ...base, since: "last week" })).toThrow(IngestError);

    // THE SAME THREE `Date.parse` ACCEPTS. Refused at the HTTP boundary as a 400 naming the field
    // rather than reaching the run and surfacing as a 502 from inside it -- and refused by the
    // connector's own `parseRfc3339`, so the two cannot come to disagree about what an instant is.
    expect(() => parseIngestRequest({ ...base, since: "2026-02-30T00:00:00Z" })).toThrow(
      IngestError,
    );
    expect(() => parseIngestRequest({ ...base, since: "2026-09-11T00:00:00" })).toThrow(
      IngestError,
    );
    expect(() => parseIngestRequest({ ...base, since: "September 11, 2026" })).toThrow(IngestError);

    // `until` goes through the same gate.
    expect(() =>
      parseIngestRequest({ ...base, since: "2026-09-11T00:00:00Z", until: "2026-02-30T00:00:00Z" }),
    ).toThrow(IngestError);

    // And a real one still passes.
    expect(parseIngestRequest({ ...base, since: "2026-09-11T00:00:00Z" }).since).toBe(
      "2026-09-11T00:00:00Z",
    );
  });
});

describe("a run that fails half way reports how far it got", () => {
  it("carries the counts and the checkpoint of the last COMPLETE chunk", async () => {
    // A span of three months is three chunks, because `WOO_BACKFILL_CHUNK_DAYS` is 31. The first
    // answers; the second's store is down. `runIngest` deliberately exposes no chunk knob -- an
    // operator should not have to know the number -- so the span is what makes this multi-chunk.
    const since = "2026-06-12T00:00:00.000Z";
    const until = "2026-09-12T00:00:00.000Z";
    const h = await harness({
      handler: (_url, call) =>
        call === 1 ? page([order(1001)]) : new Response("down", { status: 500 }),
    });

    let failure: IngestRunFailure | null = null;
    try {
      await runIngest({ ...REQUEST, since, until }, h.deps);
    } catch (error) {
      failure = error as IngestRunFailure;
    }

    expect(failure).toBeInstanceOf(IngestRunFailure);
    const report = (failure as IngestRunFailure).report;
    expect(report.complete).toBe(false);
    // EVERYTHING WRITTEN STAYS WRITTEN -- the upsert is idempotent, so a resume costs requests and
    // changes nothing. What must not happen is the checkpoint naming the span's END.
    expect(report.rowsWritten).toBe(1);
    expect(report.chunks).toBe(1);
    expect(report.checkpoint).toBe("2026-07-13T00:00:00.000Z");
    expect(report.checkpoint).not.toBe(until);
  });

  it("never reports a checkpoint ahead of what was written", async () => {
    // The sharpest property in the file. A write that fails must not leave a watermark covering the
    // rows it did not write, because nothing ever asks for a window behind the mark again.
    const h = await harness({
      handler: () => page([order(1001)]),
      onWrite: () => {
        throw new Error("the database refused");
      },
    });

    let failure: IngestRunFailure | null = null;
    try {
      await runIngest(REQUEST, h.deps);
    } catch (error) {
      failure = error as IngestRunFailure;
    }

    const report = (failure as IngestRunFailure).report;
    expect(report.rowsWritten).toBe(0);
    // The span's start, unmoved: no chunk completed, because the first page of the first chunk
    // never landed.
    expect(report.checkpoint).toBe(REQUEST.since);
  });
});

describe("the route", () => {
  it("is 503 naming every missing binding, not one per attempt", async () => {
    const response = await SELF.fetch("https://edge.test/v1/ingest/run", {
      method: "POST",
      headers: { authorization: "Bearer whatever", "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("not_configured");
    // Gathered rather than short-circuited: an operator configuring a deployment should learn about
    // all five in one response.
    for (const binding of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_JWT_SECRET",
      "INGEST_TOKEN",
      "CREDENTIAL_KEK",
    ]) {
      expect(body.message).toContain(binding);
    }
  });

  it("refuses a GET", async () => {
    const response = await SELF.fetch("https://edge.test/v1/ingest/run");
    expect(response.status).toBe(405);
  });
});

describe("what review found, and what now fails without the fix", () => {
  it("refuses an `until` in the future, because the checkpoint would cover unread orders", async () => {
    // The window closes at `until` and the checkpoint BECOMES `until`. An order modified between
    // this run finishing and that future instant sits inside the banked window, was never read, and
    // no later run asks for a window behind the mark. Clamping silently would answer a different
    // question than the operator asked.
    const h = await harness();
    await expect(
      runIngest({ ...REQUEST, until: "2026-12-25T00:00:00.000Z" }, h.deps),
    ).rejects.toMatchObject({ refusal: "bad_request" });
    expect(h.storeCalls).toHaveLength(0);

    // `until` exactly at the run's start is the boundary and is fine.
    const ok = await harness();
    await expect(
      runIngest({ ...REQUEST, until: NOW.toISOString() }, ok.deps),
    ).resolves.toMatchObject({ complete: true });
  });

  it("turns a database failure on the connection read into a refusal, never a 500", async () => {
    // This throw is OUTSIDE the run's own try, so before the fix it escaped every handler in the
    // route. `store_unavailable` is 502 and retryable -- unlike every other refusal.
    const h = await harness();
    await expect(
      runIngest(REQUEST, {
        ...h.deps,
        connections: {
          read: async () => {
            throw new StoreError("the database could not be reached: TypeError", "upstream");
          },
        },
      }),
    ).rejects.toMatchObject({ refusal: "store_unavailable" });
  });

  it("classifies a KEK that is the right length and the wrong key", async () => {
    // `kekFromBase64` checks 32 bytes and nothing more, so a KEK from another deployment decodes
    // fine and then fails AES-GCM authentication inside open(). That is a deployment fault and
    // `bad_kek` exists to diagnose it -- but the throw was not an IngestError, so it 500'd.
    const wrong = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const h = await harness({ kekOverride: wrong });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({ refusal: "bad_kek" });
    expect(h.storeCalls).toHaveLength(0);
  });

  it("reports terminal health before a missing timezone", async () => {
    // A revoked connection that ALSO has no timezone was told to populate a column -- work that
    // cannot make it runnable, while the merchant's reauthorisation is what is actually needed.
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const h = await harness({
      record: await connection(kek, {
        status: "revoked",
        revokedAt: "2026-09-01T00:00:00+00:00",
        timezone: null,
      }),
    });
    await expect(runIngest(REQUEST, h.deps)).rejects.toMatchObject({
      refusal: "connection_unusable",
    });
  });

  it("refuses a non-UUID identifier at the boundary rather than inside Postgres", () => {
    const base = { connection_id: CONNECTION, since: "2026-09-11T00:00:00Z" };
    expect(() => parseIngestRequest({ ...base, workspace_id: "bad" })).toThrow(IngestError);
    expect(() =>
      parseIngestRequest({ workspace_id: WORKSPACE, connection_id: "bad", since: base.since }),
    ).toThrow(IngestError);
    expect(parseIngestRequest({ ...base, workspace_id: WORKSPACE }).workspaceId).toBe(WORKSPACE);
  });

  it("refuses a window that ends at or before it starts, as a 400 and not a 502", () => {
    // The connector refuses this too -- but inside the generator, where the route wraps it as a 502
    // `run_incomplete`, telling an operator to retry a request no retry can rescue.
    const base = { workspace_id: WORKSPACE, connection_id: CONNECTION };
    const t = "2026-09-11T00:00:00Z";
    expect(() => parseIngestRequest({ ...base, since: t, until: t })).toThrow(IngestError);
    expect(() => parseIngestRequest({ ...base, since: "2026-09-12T00:00:00Z", until: t })).toThrow(
      IngestError,
    );
  });

  it("refuses hour 24, which RFC3339 forbids and Date.parse rolls over", () => {
    // The original round trip checked only the calendar date, so this passed and began a watermark
    // walk a day later than the caller wrote.
    expect(Date.parse("2026-09-11T24:00:00Z")).toBe(Date.parse("2026-09-12T00:00:00Z"));
    expect(() => parseRfc3339("2026-09-11T24:00:00Z", "t")).toThrow(WooBackfillError);
    expect(() =>
      parseIngestRequest({
        workspace_id: WORKSPACE,
        connection_id: CONNECTION,
        since: "2026-09-11T24:00:00Z",
      }),
    ).toThrow(IngestError);
    // The real boundary values still pass.
    expect(parseRfc3339("2026-09-11T23:59:59Z", "t")).toBe(Date.parse("2026-09-11T23:59:59Z"));
    expect(parseRfc3339("2026-09-11T00:00:00Z", "t")).toBe(Date.parse("2026-09-11T00:00:00Z"));
  });

  it("counts the bisector's discarded probe pages as splits", async () => {
    // `pages` counts what the backfill YIELDS. A window whose first page reports too many pages has
    // already cost the merchant that request before the bisector discards it -- so `pages` alone
    // would tell an operator a busy store was cheap to read.
    let call = 0;
    const h = await harness({
      handler: () => {
        call += 1;
        // The first request reports a window far too large to page; the halves are readable.
        return call === 1 ? page([order(1)], 999, 99_900) : page([order(1000 + call)], 1, 1);
      },
    });
    const report = await runIngest(REQUEST, h.deps);
    expect(report.splits).toBeGreaterThan(0);
    // And the store really was asked for more than `pages` reports.
    expect(h.storeCalls.length).toBeGreaterThan(report.pages);
  });

  it("never lets a normaliser message carry the merchant's payload into a response", () => {
    // WooNormalizeError sentences are repository-authored AND interpolate order ids and raw field
    // values. The allow-list had been reasoned about at the level of who wrote the sentence rather
    // than what the sentence contains.
    const leaky = new WooNormalizeError(
      'woocommerce: order 4711 total is "\u0e3f1,250.00", which is not a number',
      "unparseable_value",
    );
    const reason = reasonOf(leaky);
    expect(reason).toBe("an order could not be normalised (unparseable_value)");
    expect(reason).not.toContain("4711");
    expect(reason).not.toContain("1,250.00");
  });
});

describe("the two helpers that decide what leaves the Worker", () => {
  it("compares the ingest token without returning early on the first wrong byte", () => {
    // A `===` on a secret leaks, in timing, how much of the prefix was right -- which over enough
    // requests is the secret, one character at a time. The property asserted here is the RESULT;
    // the timing property is why the implementation looks the way it does.
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abd")).toBe(false);
    // Length must not short-circuit either: a prefix of the real token is the cheapest probe there
    // is, and answering it faster than a same-length miss is the same leak.
    expect(tokenMatches("ab", "abc")).toBe(false);
    expect(tokenMatches("abcd", "abc")).toBe(false);
    expect(tokenMatches("", "")).toBe(true);
    expect(tokenMatches("", "abc")).toBe(false);
    // A missing binding must never match a caller who also sends nothing; the route checks for the
    // binding first, and this is the second line of that defence.
    expect(tokenMatches("anything", "")).toBe(false);
  });

  it("exits tokenMatches exactly once, which is the property a result assertion cannot see", () => {
    // FOUND BY A MUTATION THAT SURVIVED. Replacing the whole function with `presented === expected`
    // passed every assertion above, because a constant-time comparison and a short-circuiting one
    // AGREE ON EVERY ANSWER -- they differ only in how long they take to be wrong, and a unit test
    // cannot see that without measuring a clock, which would be flaky and would still prove little.
    //
    // So the property is asserted structurally: a comparison that walks the whole input has ONE
    // exit. Every short-circuiting one -- an early `return false`, a length guard, a `===` -- has
    // more than one, or has none because it is a single expression. This is the same posture as
    // `scripts/check-*.mjs`: when the thing that matters is not observable from outside, read the
    // source and say so.
    const body = indexSource.match(
      /export function tokenMatches\([^)]*\): boolean \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(body, "tokenMatches is not where this test expects it").toBeDefined();

    const returns = [...(body ?? "").matchAll(/\breturn\b/g)];
    expect(returns, "a constant-time comparison has exactly one exit").toHaveLength(1);
    // And that one exit is not the parameters compared directly.
    expect(body).not.toMatch(/return\s+presented\s*===/);
    expect(body).not.toMatch(/presented\s*===\s*expected/);
  });

  it("lets repository-authored refusals through and reduces everything else to a name", () => {
    // These four carry sentences written in this repository for a human to read, and none of them
    // interpolates a credential.
    expect(reasonOf(new StoreError("the database refused the write with 403", "upstream"))).toBe(
      "the database refused the write with 403",
    );
    expect(reasonOf(new WooBackfillError("the span ends before it starts", "invalid_window"))).toBe(
      "the span ends before it starts",
    );

    // AND THIS IS THE ONE THAT MATTERS. `ExtractError`'s message interpolates the request URL, and
    // the request URL is the merchant's own store origin -- customer data, on its way into a
    // response body and a log line.
    const leaky = new ExtractError(
      "network failure calling https://shop.example.com/wp-json/wc/v3/orders?modified_after=...",
      null,
      "network",
      3,
    );
    expect(reasonOf(leaky)).toBe("the run failed with ExtractError");
    expect(reasonOf(leaky)).not.toContain("shop.example.com");

    expect(reasonOf(new TypeError("x is not a function"))).toBe("the run failed with TypeError");
    expect(reasonOf("something")).toBe("the run failed");
  });
});
