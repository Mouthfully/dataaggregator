/**
 * THE STORE ADAPTER, EXERCISED IN REAL WORKERD AND AGAINST NO NETWORK.
 *
 * These tests live in `apps/api-edge` rather than beside the package for the same reason
 * `shared-package.test.ts` does: the adapter's entire substance is `crypto.subtle` and `fetch` AS
 * WORKERD IMPLEMENTS THEM, and a node-environment vitest would exercise a different WebCrypto and a
 * different fetch and prove nothing about the runtime this code is deployed to. `@repo/store` ships
 * no test script for the same reason `@repo/tokens` does not.
 *
 * EVERY `fetch` HERE IS A FAKE. No test touches a network, needs a Supabase project, or holds a
 * credential. The signing secret below is a fixture string and is obviously one; the real secret is
 * a Worker secret and appears in no file in this repository.
 */

import { SELF } from "cloudflare:test";
import { envelopeRowSchema, envelopeSchema, METRICS } from "@repo/contract";
import {
  CONNECTION_COLUMNS,
  SELECT_COLUMNS,
  StoreError,
  TOKEN_TTL_SECONDS,
  createApiKeyAuthenticator,
  createConnectionStore,
  createIngestStore,
  createPerformanceStore,
  decodeBytea,
  decodeCursor,
  mintToken,
  toConnectionRecord,
  toEnvelopeRow,
  toIngestRow,
  type PerformanceQuery,
  type PostgrestConfig,
} from "@repo/store";
import { CONNECTION_STATUSES, CREDENTIAL_LANES, openCredential } from "@repo/connections";
import { type CryptoLike, seal } from "@repo/vault";
import { describe, expect, it } from "vitest";
import { handlePerformance } from "../src/performance.js";

const URL_BASE = "https://project.supabase.test";
const API_KEY = "fixture-publishable-key";
/** A fixture, not a secret. The real one is `wrangler secret put SUPABASE_JWT_SECRET`. */
const SECRET = "fixture-signing-secret-for-tests-only";
const WORKSPACE = "7c000000-0000-0000-0000-000000000001";
const FIXED = new Date("2026-09-11T12:00:00Z");

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** A queue of canned responses, and a record of what was asked for. */
function fake(queue: Array<{ status?: number; body?: unknown; raw?: string }>) {
  const calls: Call[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error("fake fetch: the adapter made an unexpected request");
    // `"body" in next` rather than `?? []`: a queued `null` is a real PostgREST answer -- it is
    // what `verify_api_key` returns for a rejected key -- and defaulting it away would make that
    // case untestable.
    const text = next.raw ?? JSON.stringify("body" in next ? next.body : []);
    return new Response(text, {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function config(impl: typeof fetch): PostgrestConfig {
  return { url: URL_BASE, apiKey: API_KEY, jwtSecret: SECRET, fetch: impl, now: () => FIXED };
}

function query(overrides: Partial<PerformanceQuery> = {}): PerformanceQuery {
  return {
    workspaceId: WORKSPACE,
    source: "ga4",
    from: "2026-08-01",
    to: "2026-08-31",
    limit: 2,
    cursor: null,
    asOf: null,
    ...overrides,
  };
}

/** One row exactly as `public.envelope_rows` holds it: flat, with nulls where a metric is absent. */
function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    source: "ga4",
    account_id: "properties/123456",
    entity_id: "properties/123456",
    entity_type: "property",
    native_entity_type: "property",
    native_id: "properties/123456",
    entity_name: null,
    parent_id: null,
    date: "2026-08-14",
    currency: "EUR",
    timezone: "Europe/Berlin",
    attribution_window: "model",
    spend: null,
    impressions: null,
    clicks: null,
    sessions: 1284,
    conversions: 37,
    conversions_value: null,
    revenue: null,
    orders: null,
    net_revenue: null,
    fees: null,
    commission: null,
    fetched_at: "2026-09-08T02:00:00+00:00",
    source_updated_at: null,
    restates_until: "2026-08-26T06:00:00+00:00",
    is_provisional: false,
    first_seen_at: "2026-08-14T06:00:00+00:00",
    fx_source: null,
    fx_rate_date: null,
    fx_rate: null,
    fx_base: null,
    ...overrides,
  };
}

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
}

/** The minted token off one recorded call. Throws rather than defaults: a call with no identity
 * header is a defect, and `?? ""` would quietly assert claims about an empty string. */
function tokenOf(call: Call): string {
  const header = call.headers.authorization;
  if (header === undefined) throw new Error("the adapter sent no authorization header");
  return header.replace(/^Bearer /, "");
}

function claimsOf(call: Call): Record<string, unknown> {
  const [, payload] = tokenOf(call).split(".");
  if (payload === undefined) throw new Error("not a JWT");
  return decodeSegment(payload);
}

async function signatureVerifies(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts as [string, string, string];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  let binary = "";
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  const expected = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return expected === signature;
}

describe("the minted token is the whole authority, and its absences are load-bearing", () => {
  it("carries role, workspace_id and a one-minute expiry -- and no `sub`", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query());

    const claims = claimsOf(f.calls[0] as Call);
    // Asserted as an exact key set, not field by field. A `sub` claim would make
    // `app.current_user_id()` non-null, and `app.can_write_workspace()` refuses ONLY on that being
    // null -- so an extra claim here quietly turns a read credential into a write one.
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "role", "workspace_id"]);
    expect(claims.role).toBe("authenticated");
    expect(claims.workspace_id).toBe(WORKSPACE);
    expect(claims.iat).toBe(Math.floor(FIXED.getTime() / 1000));
    expect(claims.exp).toBe(Math.floor(FIXED.getTime() / 1000) + TOKEN_TTL_SECONDS);
    expect(TOKEN_TTL_SECONDS).toBe(60);
  });

  it("is really signed with the secret, not merely shaped like a token", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query());

    const token = tokenOf(f.calls[0] as Call);
    expect(await signatureVerifies(token, SECRET)).toBe(true);
    expect(await signatureVerifies(token, `${SECRET}-tampered`)).toBe(false);
  });

  it("never puts the signing secret in the request", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query());

    // The URL, every header and the body, in one assertion: the secret signs claims and travels
    // nowhere else.
    expect(JSON.stringify(f.calls)).not.toContain(SECRET);
  });

  it("mints an app_ingest token with NO workspace_id, because the function takes one", async () => {
    // The third role, and the one categorically unlike the other two: `anon` and `authenticated`
    // read, and RLS narrows what they see. `app_ingest` WRITES, and reaches the table through a
    // `security definer` that does not consult RLS at all -- so a workspace_id claim here would be
    // decoration that reads like a constraint. The workspace is an argument.
    const token = await mintToken({ secret: SECRET, role: "app_ingest", now: FIXED });
    const claims = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob((token.split(".")[1] as string).replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "role"]);
    expect(claims.role).toBe("app_ingest");
    expect(claims.workspace_id).toBeUndefined();
    // Same secret, same signing path -- which is exactly why the design note says this makes
    // SUPABASE_JWT_SECRET a write credential and not only a read one.
    expect(await signatureVerifies(token, SECRET)).toBe(true);
    expect(await signatureVerifies(token, `${SECRET}-tampered`)).toBe(false);
  });

  it("refuses to sign with an empty secret rather than producing a valid-looking token", async () => {
    await expect(mintToken({ secret: "", role: "authenticated", now: FIXED })).rejects.toThrow(
      /empty signing secret/,
    );
  });

  it("sends the publishable key as `apikey` and the minted token as the identity", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query());

    const call = f.calls[0] as Call;
    expect(call.headers.apikey).toBe(API_KEY);
    expect(tokenOf(call).startsWith("eyJ")).toBe(true);
    expect(tokenOf(call)).not.toContain(API_KEY);
  });
});

describe("the read PostgREST is actually asked for", () => {
  it("filters by workspace, source and the date range, and orders for a total keyset", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query());

    const url = new URL((f.calls[0] as Call).url);
    expect(url.pathname).toBe("/rest/v1/envelope_rows");
    expect(url.searchParams.get("workspace_id")).toBe(`eq."${WORKSPACE}"`);
    expect(url.searchParams.get("source")).toBe('eq."ga4"');
    expect(url.searchParams.getAll("date")).toEqual(['gte."2026-08-01"', 'lte."2026-08-31"']);
    // `nullsfirst` is what makes "after a null attribution_window" expressible at all.
    expect(url.searchParams.get("order")).toBe(
      "date.desc,account_id.asc,entity_id.asc,attribution_window.asc.nullsfirst",
    );
  });

  it("selects every metric in the dictionary, so a new one is not silently unreadable", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query());

    const selected = (new URL((f.calls[0] as Call).url).searchParams.get("select") ?? "").split(
      ",",
    );
    // Against METRICS itself rather than a copied list: the point is that adding a metric to the
    // dictionary needs no edit to the adapter.
    for (const metric of Object.keys(METRICS)) expect(selected).toContain(metric);
    expect(selected).not.toContain("raw_key");
    expect(selected).not.toContain("*");
  });

  it("asks for one row more than the limit, so the next page can be detected", async () => {
    const f = fake([{ body: [] }]);
    await createPerformanceStore(config(f.impl)).read(query({ limit: 999 }));

    // 999 + 1 = 1000 = PostgREST's max_rows exactly. `performance.ts`'s MAX_LIMIT comment is why
    // that fits; this asserts the probe is actually made.
    expect(new URL((f.calls[0] as Call).url).searchParams.get("limit")).toBe("1000");
  });
});

describe("a flat row becomes an envelope row, and nothing is invented on the way", () => {
  it("produces a row the envelope itself accepts", async () => {
    const f = fake([{ body: [dbRow()] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    const response = await handlePerformance(
      new Request("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31", {
        headers: { authorization: "Bearer k" },
      }),
      {
        auth: { authenticate: async () => ({ workspaceId: WORKSPACE }) },
        store: { read: async () => page },
        requestId: "req_store_1",
      },
    );
    expect(response.status).toBe(200);
    // Parsed with the contract, not a hand-written shape check.
    expect(envelopeSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("selects enough columns to build a whole envelope row", async () => {
    // The fake fetch does not honour `select`, so every other test here would keep passing with a
    // column missing from the list -- and in production that column would arrive `undefined` and
    // fail the envelope with a message about a missing field rather than about a wrong query.
    // Projecting the fixture onto SELECT_COLUMNS is what makes the list's SUFFICIENCY testable.
    const full = dbRow() as Record<string, unknown>;
    const projected = Object.fromEntries(
      Object.entries(full).filter(([column]) => SELECT_COLUMNS.includes(column)),
    );
    const f = fake([{ body: [projected] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    expect(envelopeRowSchema.safeParse(page.rows[0]).success).toBe(true);
  });

  it("nests entity and dimensions and keeps the four clocks flat", async () => {
    const f = fake([{ body: [dbRow({ entity_name: "Marketing site", parent_id: "acct/9" })] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    expect(page.rows[0]).toMatchObject({
      source: "ga4",
      entity: {
        type: "property",
        id: "properties/123456",
        account_id: "properties/123456",
        native_entity_type: "property",
        native_id: "properties/123456",
        name: "Marketing site",
        parent_id: "acct/9",
      },
      dimensions: {
        date: "2026-08-14",
        currency: "EUR",
        timezone: "Europe/Berlin",
        attribution_window: "model",
      },
      fetched_at: "2026-09-08T02:00:00+00:00",
      source_updated_at: null,
      restates_until: "2026-08-26T06:00:00+00:00",
      is_provisional: false,
      first_seen_at: "2026-08-14T06:00:00+00:00",
    });
  });

  it("omits a null metric column rather than reporting it as zero", async () => {
    const f = fake([{ body: [dbRow()] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    const metrics = (page.rows[0] as { metrics: Record<string, unknown> }).metrics;
    // `spend: 0` on a day with no spend data is the single most damaging lie this envelope could
    // tell, and `spend: null` would fail the strict metric schema over a perfectly sound row.
    expect(Object.keys(metrics).sort()).toEqual(["conversions", "sessions"]);
    expect(metrics.sessions).toBe(1284);
    expect("spend" in metrics).toBe(false);
  });

  it("omits an absent entity name rather than emitting null, which the contract refuses", async () => {
    const f = fake([{ body: [dbRow()] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    const entity = (page.rows[0] as { entity: Record<string, unknown> }).entity;
    expect("name" in entity).toBe(false);
    expect("parent_id" in entity).toBe(false);
  });

  it("reads a numeric spelled as a decimal string, and leaves anything else to the validator", async () => {
    const f = fake([{ body: [dbRow({ sessions: "1284.000000", clicks: "not a number" })] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    const metrics = (page.rows[0] as { metrics: Record<string, unknown> }).metrics;
    expect(metrics.sessions).toBe(1284);
    // Not repaired, not dropped: it reaches the envelope as NaN and fails the request there, which
    // is refusal 2 in `performance.ts` doing its job rather than this mapper pre-empting it.
    expect(Number.isNaN(metrics.clicks as number)).toBe(true);
  });

  it("never emits the R2 object key as `raw`", async () => {
    const f = fake([{ body: [dbRow({ raw_key: "ws/ga4/2026-08-14.json" })] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query());

    expect(JSON.stringify(page.rows[0])).not.toContain("ws/ga4");
    expect("raw" in (page.rows[0] as Record<string, unknown>)).toBe(false);
  });
});

describe("paging cannot skip a row", () => {
  it("trims the probe row off and issues a cursor pointing at the last row RETURNED", async () => {
    const rows = [
      dbRow({ entity_id: "a" }),
      dbRow({ entity_id: "b" }),
      dbRow({ entity_id: "probe" }),
    ];
    const f = fake([{ body: rows }]);
    const page = await createPerformanceStore(config(f.impl)).read(query({ limit: 2 }));

    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    // Pointing at "probe" would hand out page two starting AFTER a row nobody has seen.
    expect(decodeCursor(page.nextCursor as string)).toEqual({
      d: "2026-08-14",
      a: "properties/123456",
      e: "b",
      w: "model",
    });
  });

  it("returns no cursor when the probe row does not come back", async () => {
    const f = fake([{ body: [dbRow(), dbRow({ entity_id: "b" })] }]);
    const page = await createPerformanceStore(config(f.impl)).read(query({ limit: 2 }));

    expect(page.rows).toHaveLength(2);
    // Absent, not null-and-then-absent: "no more" and "did not say" are different answers.
    expect(page.nextCursor).toBeNull();
  });

  it("turns the cursor into a keyset predicate that pins every column above it", async () => {
    const first = fake([
      { body: [dbRow({ entity_id: "a" }), dbRow({ entity_id: "b" }), dbRow({ entity_id: "c" })] },
    ]);
    const page = await createPerformanceStore(config(first.impl)).read(query({ limit: 2 }));

    const second = fake([{ body: [] }]);
    await createPerformanceStore(config(second.impl)).read(
      query({ limit: 2, cursor: page.nextCursor }),
    );

    expect(new URL((second.calls[0] as Call).url).searchParams.get("or")).toBe(
      '(date.lt."2026-08-14",' +
        'and(date.eq."2026-08-14",account_id.gt."properties/123456"),' +
        'and(date.eq."2026-08-14",account_id.eq."properties/123456",entity_id.gt."b"),' +
        'and(date.eq."2026-08-14",account_id.eq."properties/123456",entity_id.eq."b",attribution_window.gt."model"))',
    );
  });

  it("expresses `after a null attribution_window` as `not.is.null`, not as a comparison", async () => {
    const rows = [dbRow({ attribution_window: null }), dbRow({ entity_id: "probe" })];
    const first = fake([{ body: rows }]);
    const page = await createPerformanceStore(config(first.impl)).read(query({ limit: 1 }));

    const second = fake([{ body: [] }]);
    await createPerformanceStore(config(second.impl)).read(
      query({ limit: 1, cursor: page.nextCursor }),
    );

    // `attribution_window.gt.null` compares against NULL, yields NULL, and silently drops every
    // unlabelled row -- which is a total quietly too low, returned with ok: true.
    const or = new URL((second.calls[0] as Call).url).searchParams.get("or") ?? "";
    expect(or).toContain("attribution_window.not.is.null");
    expect(or).not.toContain("attribution_window.gt");
  });

  it("quotes and escapes a value carrying the filter grammar's own punctuation", async () => {
    const nasty = 'buy shoes, cheap ("best")';
    const first = fake([{ body: [dbRow({ entity_id: nasty }), dbRow({ entity_id: "probe" })] }]);
    const page = await createPerformanceStore(config(first.impl)).read(query({ limit: 1 }));

    const second = fake([{ body: [] }]);
    await createPerformanceStore(config(second.impl)).read(
      query({ limit: 1, cursor: page.nextCursor }),
    );

    // An unquoted comma would END the condition and start another one -- a filter that means
    // something else and still returns rows.
    const or = new URL((second.calls[0] as Call).url).searchParams.get("or") ?? "";
    expect(or).toContain('entity_id.gt."buy shoes, cheap (\\"best\\")"');
  });

  it("refuses a cursor it did not issue rather than silently returning page one", async () => {
    const f = fake([{ body: [] }]);
    const store = createPerformanceStore(config(f.impl));

    // Ignoring it would hand a paging client the first page forever: fetch, see a cursor, fetch,
    // get the same rows, loop or double-count. Both present as wrong numbers, not as an error.
    for (const bad of ["!!!not base64!!!", btoa('{"d":1}'), btoa("[]")]) {
      await expect(store.read(query({ cursor: bad }))).rejects.toMatchObject({
        failure: "bad_cursor",
      });
    }
    expect(f.calls).toHaveLength(0);
  });

  it("refuses a page whose limit was not applied, instead of reporting it as complete", async () => {
    // What a dropped `limit` parameter looks like from here: PostgREST returns up to max_rows and
    // the probe arithmetic says "no further page".
    const f = fake([{ body: Array.from({ length: 50 }, () => dbRow()) }]);

    await expect(
      createPerformanceStore(config(f.impl)).read(query({ limit: 2 })),
    ).rejects.toMatchObject({ failure: "upstream" });
  });
});

describe("the refusals", () => {
  it("refuses `as_of` rather than answering it with today's numbers", async () => {
    const f = fake([]);

    // `16-performance-endpoint.md` §5.3: the parameter is validated and honoured by nothing, so "a
    // request with as_of returns the same rows as one without, and that must not be sold". There is
    // no valid-time history in `envelope_rows` to answer it from.
    await expect(
      createPerformanceStore(config(f.impl)).read(query({ asOf: "2026-08-20" })),
    ).rejects.toMatchObject({ failure: "unsupported_query" });
    // Refused before the token was minted or the request made.
    expect(f.calls).toHaveLength(0);
  });

  it("surfaces an upstream refusal with its status and without PostgREST's hint", async () => {
    const f = fake([
      {
        status: 403,
        body: {
          code: "42501",
          message: "permission denied for table envelope_rows",
          details: "the caller's own filter values would be echoed here",
          hint: "and so would the query",
        },
      },
    ]);

    const error = await createPerformanceStore(config(f.impl))
      .read(query())
      .catch((e: unknown) => e as StoreError);
    expect(error).toBeInstanceOf(StoreError);
    expect((error as StoreError).failure).toBe("upstream");
    expect((error as StoreError).status).toBe(403);
    expect((error as StoreError).message).toContain("42501");
    // `details` and `hint` echo the failing query, and a failing query here carries platform data.
    expect((error as StoreError).message).not.toContain("echoed here");
    expect((error as StoreError).message).not.toContain("and so would the query");
  });

  it("refuses a non-list body rather than mapping whatever arrived", async () => {
    const f = fake([{ body: { message: "not a list" } }]);

    await expect(createPerformanceStore(config(f.impl)).read(query())).rejects.toMatchObject({
      failure: "upstream",
    });
  });
});

describe("the credential resolves to exactly one workspace, or to nothing", () => {
  it("treats an absent, blank or non-Bearer header as a format problem", async () => {
    const f = fake([]);
    const auth = createApiKeyAuthenticator(config(f.impl));

    for (const header of [null, "", "   ", "Basic abc", "Bearer", "Bearer   "]) {
      expect(await auth.authenticate(header)).toEqual({ error: "missing" });
    }
    // No credential means no reason to ask the database anything.
    expect(f.calls).toHaveLength(0);
  });

  it("sends the SHA-256 hash of the key as a bytea literal, never the key", async () => {
    const f = fake([{ body: { workspace_id: WORKSPACE, allowed_tools: ["performance"] } }]);
    await createApiKeyAuthenticator(config(f.impl)).authenticate("Bearer mp_live_abcdefgh_secret");

    const call = f.calls[0] as Call;
    expect(call.method).toBe("POST");
    expect(new URL(call.url).pathname).toBe("/rest/v1/rpc/verify_api_key");
    // The plaintext credential exists in this isolate and nowhere else -- not in the URL, not in
    // the body, not in the database's query log.
    expect(call.body).not.toContain("mp_live_abcdefgh_secret");
    expect(JSON.stringify(call)).not.toContain("mp_live_abcdefgh_secret");

    const sent = JSON.parse(call.body ?? "{}") as { p_key_hash: string };
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("mp_live_abcdefgh_secret"),
    );
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(sent.p_key_hash).toBe(`\\x${hex}`);
  });

  it("verifies as `anon`, the role that can reach one function and no row", async () => {
    const f = fake([{ body: { workspace_id: WORKSPACE } }]);
    await createApiKeyAuthenticator(config(f.impl)).authenticate("Bearer k");

    const claims = claimsOf(f.calls[0] as Call);
    expect(claims.role).toBe("anon");
    // No identity exists yet, so the pre-identity call must carry none.
    expect("workspace_id" in claims).toBe(false);
    expect("sub" in claims).toBe(false);
  });

  it("returns the workspace and nothing else from the verification result", async () => {
    const f = fake([
      { body: { workspace_id: WORKSPACE, allowed_tools: ["performance"], credits_remaining: 4 } },
    ]);

    // `allowed_tools` and `credits_remaining` are deliberately dropped: enforcing them is §15 work
    // that `16-performance-endpoint.md` §4 still carries as owed.
    expect(await createApiKeyAuthenticator(config(f.impl)).authenticate("Bearer k")).toEqual({
      workspaceId: WORKSPACE,
    });
  });

  it("collapses every rejection into one answer", async () => {
    for (const body of [null, { workspace_id: null }, { api_key_id: null }]) {
      const f = fake([{ body }]);
      expect(await createApiKeyAuthenticator(config(f.impl)).authenticate("Bearer k")).toEqual({
        error: "invalid",
      });
    }
  });

  it("refuses an unrecognised result shape instead of reading it as a bad credential", async () => {
    // `app.api_key_context` is declared in `app`, which config.toml does not expose to PostgREST,
    // so an unexpanded record literal is a real possible answer. Reading it as "invalid" would 401
    // every caller holding a perfectly good key and make a deployment fault look like theirs.
    const f = fake([{ raw: '"(uuid,uuid,uuid,{performance},4)"' }]);

    await expect(
      createApiKeyAuthenticator(config(f.impl)).authenticate("Bearer k"),
    ).rejects.toMatchObject({ failure: "upstream" });
  });
});

describe("the route", () => {
  it("503s naming every missing binding, rather than answering `data: []`", async () => {
    const response = await SELF.fetch("https://api-edge.test/v1/performance?source=ga4");

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("not_configured");
    // A deployment missing a secret and a workspace with no rows must not look alike, and naming
    // the binding is the difference between reading three dashboards and running one command.
    expect(body.message).toContain("SUPABASE_URL");
    expect(body.message).toContain("SUPABASE_ANON_KEY");
    expect(body.message).toContain("SUPABASE_JWT_SECRET");
  });
});

// ===============================================================================================
// THE INGEST WRITE PATH
//
// The inverse direction, and the one with the opposite validation posture: the read path validates
// on the way OUT and its mapper deliberately repairs nothing; this validates on the way IN, because
// a row the database refuses costs a round trip and comes back as a constraint name with no row
// index.
// ===============================================================================================

/** One envelope row in the NESTED shape a normaliser produces. */
function envelopeRow(overrides: Record<string, unknown> = {}) {
  return {
    source: "woocommerce",
    entity: {
      type: "order",
      id: "wc_1001",
      account_id: "https://shop.example.com",
      native_entity_type: "shop_order",
      native_id: "1001",
    },
    dimensions: {
      date: "2026-08-14",
      currency: "THB",
      timezone: "Asia/Bangkok",
      attribution_window: null,
    },
    metrics: { orders: 1, revenue: 450 },
    fetched_at: "2026-08-15T06:00:00.000Z",
    source_updated_at: null,
    restates_until: "2026-08-22T06:00:00.000Z",
    is_provisional: true,
    first_seen_at: "2026-08-15T06:00:00.000Z",
    fx_source: null,
    fx_rate_date: null,
    fx_rate: null,
    fx_base: null,
    ...overrides,
  } as never;
}

const CONTEXT = { workspaceId: WORKSPACE, connectionId: null };

function ingestConfig(impl: typeof fetch) {
  return { url: URL_BASE, apiKey: API_KEY, jwtSecret: SECRET, fetch: impl, now: () => FIXED };
}

describe("the ingest mapper is the exact inverse of the read mapper", () => {
  it("stamps tenancy the envelope deliberately does not carry", () => {
    // A connector never sees a workspace id, so it physically cannot choose one. That is the
    // property this line protects, not a convenience.
    const flat = toIngestRow(envelopeRow(), { workspaceId: WORKSPACE, connectionId: "c-1" });
    expect(flat.workspace_id).toBe(WORKSPACE);
    expect(flat.connection_id).toBe("c-1");
  });

  it("flattens entity and dimensions into columns", () => {
    const flat = toIngestRow(envelopeRow(), CONTEXT);
    expect(flat.entity_id).toBe("wc_1001");
    expect(flat.entity_type).toBe("order");
    expect(flat.account_id).toBe("https://shop.example.com");
    expect(flat.native_entity_type).toBe("shop_order");
    expect(flat.date).toBe("2026-08-14");
    expect(flat.currency).toBe("THB");
    expect(flat.timezone).toBe("Asia/Bangkok");
    expect(flat.attribution_window).toBeNull();
  });

  it("carries EVERY metric column, present or not, from the dictionary rather than a list", () => {
    // The fifth hand-written metric list is the one a guard cannot see, because it would live in
    // TypeScript. Sourcing the keys from METRICS is what stops it existing.
    const flat = toIngestRow(envelopeRow(), CONTEXT);
    for (const name of Object.keys(METRICS)) {
      expect(Object.hasOwn(flat, name), `${name} is missing from the ingest payload`).toBe(true);
    }
    expect(flat.orders).toBe(1);
    expect(flat.revenue).toBe(450);
    // An absent metric is NULL, never 0. "spend: 0" on a day with no spend data is the single most
    // damaging lie this envelope could tell, and it would be told on every row.
    expect(flat.spend).toBeNull();
    expect(flat.position).toBeNull();
  });

  it("does not send is_provisional, because the upsert derives it", () => {
    // That derivation is where "is_provisional eventually clears" stops being a claim. A value sent
    // from here would be ignored at best.
    expect(Object.hasOwn(toIngestRow(envelopeRow(), CONTEXT), "is_provisional")).toBe(false);
  });

  it("never writes a payload into raw_key, which is an object key", () => {
    const flat = toIngestRow(envelopeRow({ raw: { huge: "platform response" } }), CONTEXT);
    expect(flat.raw_key).toBeNull();
    expect(JSON.stringify(flat)).not.toContain("huge");
  });

  it("round-trips through the read mapper without losing a field", async () => {
    // The strongest available check that the two directions agree, and it needs no database: flatten
    // an envelope row, feed the result to the READ mapper, and the envelope must come back.
    const original = envelopeRow();
    const flat = toIngestRow(original, CONTEXT);
    const back = envelopeRowSchema.parse(toEnvelopeRow({ ...flat, is_provisional: true }));
    expect(back).toEqual(envelopeRowSchema.parse(original));
  });
});

describe("the ingest store refuses before it writes", () => {
  it("writes a batch and returns the count the database reports", async () => {
    const f = fake([{ body: 2 }]);
    const written = await createIngestStore(ingestConfig(f.impl)).write(
      [
        envelopeRow(),
        envelopeRow({
          entity: { ...(envelopeRow() as never as { entity: object }).entity, id: "wc_1002" },
        }),
      ],
      CONTEXT,
    );
    expect(written).toBe(2);

    const call = f.calls[0] as Call;
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${URL_BASE}/rest/v1/rpc/ingest_envelope_rows`);
    const body = JSON.parse(call.body as string);
    expect(body.p_rows).toHaveLength(2);
  });

  it("mints app_ingest and sends NO workspace_id claim", async () => {
    const f = fake([{ body: 1 }]);
    await createIngestStore(ingestConfig(f.impl)).write([envelopeRow()], CONTEXT);

    const claims = claimsOf(f.calls[0] as Call);
    expect(claims.role).toBe("app_ingest");
    // The workspace is an argument to a function that does not consult RLS. A claim here would be
    // decoration that reads like a constraint.
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "role"]);
  });

  it("makes no request at all for an empty batch", async () => {
    // A quiet day is a real outcome, not an error, and it costs zero requests.
    const f = fake([]);
    expect(await createIngestStore(ingestConfig(f.impl)).write([], CONTEXT)).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it("refuses the WHOLE batch when one row fails the envelope", async () => {
    // Skipping the row would store a total quietly too low -- the failure this product sells
    // against -- and nothing downstream could ever tell it had happened.
    const f = fake([]);
    const bad = envelopeRow({ metrics: { conversions: 4 } }); // a conversion with no window
    await expect(
      createIngestStore(ingestConfig(f.impl)).write([envelopeRow(), bad], CONTEXT),
    ).rejects.toThrow(/refusing to write row 1/);
    expect(f.calls).toHaveLength(0);
  });

  it("names the failing field, so the connector author knows what to fix", async () => {
    const f = fake([]);
    try {
      await createIngestStore(ingestConfig(f.impl)).write(
        [
          envelopeRow({
            dimensions: {
              date: "not-a-date",
              currency: "THB",
              timezone: "Asia/Bangkok",
              attribution_window: null,
            },
          }),
        ],
        CONTEXT,
      );
      throw new Error("should have refused");
    } catch (error) {
      expect((error as StoreError).failure).toBe("invalid_row");
      expect((error as Error).message).toMatch(/dimensions\.date/);
    }
  });

  it("refuses a partial write rather than reporting success", async () => {
    // The function returns how many rows it forwarded. A count that disagrees with what was sent is
    // the same wrong total as a skipped row, arriving by a different route.
    const f = fake([{ body: 1 }]);
    await expect(
      createIngestStore(ingestConfig(f.impl)).write([envelopeRow(), envelopeRow()], CONTEXT),
    ).rejects.toThrow(/sent 2 row\(s\) and the database reported 1/);
  });

  it("reports a refused WRITE as a write, not as a read", async () => {
    // The message was "refused the read" unconditionally. An operator staring at that after an
    // ingest run would look at the wrong half of the system.
    const f = fake([{ status: 403, raw: JSON.stringify({ code: "42501" }) }]);
    await expect(
      createIngestStore(ingestConfig(f.impl)).write([envelopeRow()], CONTEXT),
    ).rejects.toThrow(/refused the write with 403 \(42501\)/);
  });
});

// -------------------------------------------------------------------------------------------
// THE CONNECTION READ (`39-store-adapter.md`'s sibling, and step 4 of MVP-PLAN.md §5).
//
// One GET against `public.connections`, needing no new database object: the grant and the policy
// both already exist. What is new is the BYTEA DECODE, which is the one thing on this path that
// fails unreadably when it is wrong.
// -------------------------------------------------------------------------------------------

const CONNECTION = "8d000000-0000-0000-0000-000000000002";

/** What PostgREST puts on the wire for a `bytea`: Postgres hex output, as a JSON string. */
function asBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

function connectionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CONNECTION,
    workspace_id: WORKSPACE,
    provider: "woocommerce",
    credential_lane: "key_secret",
    external_account_id: "https://shop.example.com",
    display_name: "Example Shop",
    credential_ciphertext: asBytea(new Uint8Array([0x4f, 0x37, 0xa1])),
    credential_iv: asBytea(new Uint8Array([0x00, 0xff, 0x10])),
    wrapped_dek: asBytea(new Uint8Array([0xde, 0xad])),
    key_version: 1,
    granted_scopes: [],
    expires_at: null,
    status: "active",
    last_error: null,
    revoked_at: null,
    timezone: "Asia/Bangkok",
    ...overrides,
  };
}

describe("the connection read asks for exactly one row, as one workspace", () => {
  it("filters on BOTH the id and the workspace, and caps the answer at two", async () => {
    const f = fake([{ body: [connectionRow()] }]);
    await createConnectionStore(config(f.impl)).read({
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
    });

    const url = new URL((f.calls[0] as Call).url);
    expect(url.pathname).toBe("/rest/v1/connections");
    expect(url.searchParams.get("id")).toBe(`eq."${CONNECTION}"`);
    // Redundant with the policy and sent anyway: a mismatched pair must answer "nothing" through
    // the query as well as through row-level security.
    expect(url.searchParams.get("workspace_id")).toBe(`eq."${WORKSPACE}"`);
    // TWO, on a primary-key lookup. The only way a second row arrives is a filter that did not,
    // and that must not come back as "the" connection.
    expect(url.searchParams.get("limit")).toBe("2");
  });

  it("never asks for the developer-token columns, or for `*`", async () => {
    const f = fake([{ body: [] }]);
    await createConnectionStore(config(f.impl)).read({
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
    });

    const selected = (new URL((f.calls[0] as Call).url).searchParams.get("select") ?? "").split(
      ",",
    );
    expect(selected).toEqual([...CONNECTION_COLUMNS]);
    expect(selected).not.toContain("*");
    // A second sealed credential this path has no use for and therefore no business moving.
    expect(selected).not.toContain("developer_token_ciphertext");
    expect(selected).not.toContain("developer_token_wrapped_dek");
  });

  it("mints `authenticated` for the caller's workspace, with no `sub`", async () => {
    const f = fake([{ body: [] }]);
    await createConnectionStore(config(f.impl)).read({
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
    });

    const claims = claimsOf(f.calls[0] as Call);
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "role", "workspace_id"]);
    expect(claims.role).toBe("authenticated");
    expect(claims.workspace_id).toBe(WORKSPACE);
    expect(await signatureVerifies(tokenOf(f.calls[0] as Call), SECRET)).toBe(true);
  });

  it("answers a missing connection and another tenant's with the SAME null", async () => {
    // Row-level security makes both cases an empty list; the adapter must not turn one of them
    // into a distinguishable error, or it becomes an oracle for which ids exist elsewhere.
    const f = fake([{ body: [] }, { body: [] }]);
    const store = createConnectionStore(config(f.impl));
    expect(await store.read({ workspaceId: WORKSPACE, connectionId: CONNECTION })).toBeNull();
    expect(
      await store.read({
        workspaceId: WORKSPACE,
        connectionId: "00000000-0000-0000-0000-00000000ffff",
      }),
    ).toBeNull();
  });

  it("refuses two rows rather than picking one", async () => {
    const f = fake([{ body: [connectionRow(), connectionRow()] }]);
    await expect(
      createConnectionStore(config(f.impl)).read({
        workspaceId: WORKSPACE,
        connectionId: CONNECTION,
      }),
    ).rejects.toThrow(StoreError);
  });

  it("refuses an answer that is not a list", async () => {
    const f = fake([{ body: connectionRow() }]);
    await expect(
      createConnectionStore(config(f.impl)).read({
        workspaceId: WORKSPACE,
        connectionId: CONNECTION,
      }),
    ).rejects.toThrow(StoreError);
  });
});

/**
 * workerd's own `Crypto`, narrowed to what the vault uses.
 *
 * The cast is `packages/vault/src/vault.test.ts`'s and is there for the reason `CryptoKeyLike`
 * exists: the handle type differs between runtimes, so `CryptoLike` describes the operations rather
 * than nominally matching any one platform's `SubtleCrypto`. What is NOT faked is the
 * implementation -- this is real WebCrypto in real workerd, which is the whole reason these tests
 * live in this app.
 */
const webcrypto = crypto as unknown as CryptoLike;

describe("bytea arrives as Postgres hex, and reading it as anything else is unreadable later", () => {
  it("decodes the hex output PostgREST actually sends", () => {
    expect([...decodeBytea("\\x00ff10", "t")]).toEqual([0, 255, 16]);
    expect([...decodeBytea("\\x", "t")]).toEqual([]);
  });

  it("refuses base64, plain text and a missing prefix", () => {
    // Each of these encodes to *something*. `TextEncoder().encode()` on any of them produces bytes
    // that are not the ciphertext, and AES-GCM then fails authentication with a message that sends
    // whoever reads it looking at the KEK, the DEK wrapping and the scope -- everything except the
    // thing that is wrong.
    expect(() => decodeBytea("AP8Q", "t")).toThrow(StoreError);
    expect(() => decodeBytea("00ff10", "t")).toThrow(StoreError);
    expect(() => decodeBytea(null, "t")).toThrow(StoreError);
    expect(() => decodeBytea("\\x0f0", "t")).toThrow(StoreError);
    expect(() => decodeBytea("\\xzz", "t")).toThrow(StoreError);
  });

  it("carries the sealed bytes through unchanged, proved by opening a real credential", async () => {
    // THE ROUND TRIP, AND IT IS THE ONLY TEST HERE THAT WOULD HAVE CAUGHT A WRONG DECODE. Every
    // assertion above is about a shape; this one seals a credential with the real vault, puts it on
    // the wire exactly as PostgREST would, reads it back through the adapter and opens it. A decode
    // that is off by a prefix, a nibble or an encoding fails here and nowhere else.
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await seal(webcrypto, {
      plaintext: JSON.stringify({ kind: "key_secret", key: "ck_a1b2c3", secret: "cs_9z8y7x" }),
      kek,
      keyVersion: 1,
      scope: { workspaceId: WORKSPACE, connectionId: CONNECTION },
    });

    const f = fake([
      {
        body: [
          connectionRow({
            credential_ciphertext: asBytea(sealed.ciphertext),
            credential_iv: asBytea(sealed.iv),
            wrapped_dek: asBytea(sealed.wrappedDek),
            key_version: sealed.keyVersion,
          }),
        ],
      },
    ]);

    const record = await createConnectionStore(config(f.impl)).read({
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
    });
    if (record === null) throw new Error("the adapter returned no row");

    // `openCredential` takes `@repo/connections`'s own `ConnectionRow`. This call is the structural
    // check the module note promises: a field renamed on either side fails HERE, at typecheck.
    const credential = await openCredential(webcrypto, record, kek);
    expect(credential).toEqual({ kind: "key_secret", key: "ck_a1b2c3", secret: "cs_9z8y7x" });
  });
});

describe("a connection row this adapter cannot account for is refused, not repaired", () => {
  it("keeps the timezone, including the null that means nobody has told us", () => {
    expect(toConnectionRecord(connectionRow()).timezone).toBe("Asia/Bangkok");
    expect(toConnectionRecord(connectionRow({ timezone: null })).timezone).toBeNull();
  });

  it("refuses a row with no workspace or id, because those two ARE the cipher's scope", () => {
    // Not defensiveness. `open()` binds the ciphertext to {workspaceId, connectionId} as AES-GCM
    // additional data, so an empty string there does not fail loudly -- it produces a different
    // scope that simply does not authenticate, which reads exactly like a wrong KEK.
    expect(() => toConnectionRecord(connectionRow({ workspace_id: null }))).toThrow(StoreError);
    expect(() => toConnectionRecord(connectionRow({ id: "" }))).toThrow(StoreError);
  });

  it("refuses a provider the database allows but no connector can drive", () => {
    // `app.connection_provider` carries nine members; PROVIDER_LANES names five. `impact`, `awin`,
    // `cj` and `partnerstack` are rows the database will hold and that nothing here can pull. The
    // alternative to refusing at the read is casting a lie that surfaces as an undefined lookup
    // during a pull, hours later.
    expect(() => toConnectionRecord(connectionRow({ provider: "impact" }))).toThrow(StoreError);
    expect(() => toConnectionRecord(connectionRow({ provider: "shopify" }))).toThrow(StoreError);
    expect(toConnectionRecord(connectionRow({ provider: "meta_ads" })).provider).toBe("meta_ads");
  });

  it("refuses a credential lane or a status this build does not know", () => {
    expect(() => toConnectionRecord(connectionRow({ credential_lane: "mtls" }))).toThrow(
      StoreError,
    );
    expect(() => toConnectionRecord(connectionRow({ status: "paused" }))).toThrow(StoreError);
    // Every member of the real unions passes, read from the packages that define them rather than
    // from a list copied into this test.
    for (const lane of CREDENTIAL_LANES) {
      expect(toConnectionRecord(connectionRow({ credential_lane: lane })).credentialLane).toBe(
        lane,
      );
    }
    for (const status of CONNECTION_STATUSES) {
      expect(toConnectionRecord(connectionRow({ status })).status).toBe(status);
    }
  });

  it("refuses a key_version that is not an integer", () => {
    // The KEK generation a credential was wrapped under is not a value to guess.
    expect(() => toConnectionRecord(connectionRow({ key_version: null }))).toThrow(StoreError);
    expect(() => toConnectionRecord(connectionRow({ key_version: "1" }))).toThrow(StoreError);
  });

  it("returns status, revoked_at and expires_at verbatim rather than judging them", () => {
    // `connectionHealth` and `openCredential` own "is this connection usable?". A second opinion
    // here would be a second place for that answer to live, and the two would drift.
    const revoked = toConnectionRecord(
      connectionRow({ status: "revoked", revoked_at: "2026-09-01T00:00:00+00:00" }),
    );
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBe("2026-09-01T00:00:00+00:00");
  });

  it("reads granted_scopes as a list of strings, and an absent one as empty", () => {
    expect(toConnectionRecord(connectionRow({ granted_scopes: ["a", "b"] })).grantedScopes).toEqual(
      ["a", "b"],
    );
    expect(toConnectionRecord(connectionRow({ granted_scopes: null })).grantedScopes).toEqual([]);
  });
});
