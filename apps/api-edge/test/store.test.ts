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
  SELECT_COLUMNS,
  StoreError,
  TOKEN_TTL_SECONDS,
  createApiKeyAuthenticator,
  createPerformanceStore,
  decodeCursor,
  mintToken,
  type PerformanceQuery,
  type PostgrestConfig,
} from "@repo/store";
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
