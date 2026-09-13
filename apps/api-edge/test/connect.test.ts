/**
 * `POST /v1/connections`, IN REAL WORKERD, AGAINST NO NETWORK AND NO SUPABASE PROJECT.
 *
 * THE CREDENTIAL IS REAL AND THE SEAL IS REAL. Every happy-path test here posts a key and a secret
 * through the endpoint, reads the bytes the endpoint tried to write, and opens them with
 * `openCredential` -- the function `/v1/ingest/run` actually calls. A stubbed vault would prove the
 * route returns 201; this proves the row it wrote holds a credential that can be opened, bound to
 * the workspace and connection it was sealed against.
 *
 * THE FAKE POSTGREST DECIDES TENANCY, AND THAT IS THE WHOLE DESIGN UNDER TEST. It reads the
 * forwarded token's `sub`, looks the person up in a membership table declared in this file, and
 * answers `42501` when the insert names a workspace they are not in -- which is what
 * `app.can_write_workspace()` does inside the `connections_insert` policy. It is a stand-in for the
 * policy, NOT a second implementation of tenancy: the property being demonstrated is that the
 * refusal arrives FROM OUTSIDE the Worker, so a test that filtered in TypeScript would be asserting
 * the opposite of the thing that matters.
 *
 * NOTHING HERE IS A SECRET. The signing secret is a fixture string, the KEK is generated per test,
 * and the consumer key and secret are obviously invented.
 */

import { SELF } from "cloudflare:test";
import { type ConnectionRow, openCredential } from "@repo/connections";
import { base64url, decodeBytea } from "@repo/store";
import type { CryptoLike as VaultCrypto } from "@repo/vault";
import { describe, expect, it } from "vitest";

import { type AccessTokenCrypto, verifyAccessToken } from "../src/access-token.js";
import { type ConnectDeps, handleConnect, toByteaHex } from "../src/connect.js";

/** A fixture, not a secret. The real one is `wrangler secret put SUPABASE_JWT_SECRET`. */
const SECRET = "fixture-signing-secret-for-tests-only";
const URL_BASE = "https://project.supabase.test";
const API_KEY = "fixture-publishable-key";

const ALICE = "a0000000-0000-0000-0000-000000000001";
const WORKSPACE_A = "c0000000-0000-0000-0000-00000000000a";
const WORKSPACE_B = "c0000000-0000-0000-0000-00000000000b";
const CONNECTION = "e0000000-0000-0000-0000-000000000001";
const STORE_URL = "https://shop.example.com";

/** Invented, and the two strings every "no credential in the body" assertion greps for. */
const CONSUMER_KEY = "ck_testonlyconsumerkey";
const CONSUMER_SECRET = "cs_testonlyconsumersecret";
const SYSTEM_USER_TOKEN = "EAAtestonlysystemusertoken";

const NOW = new Date("2026-09-13T12:00:00Z");
const webcrypto = crypto as unknown as VaultCrypto;
const encoder = new TextEncoder();

/**
 * Who may write where, as the membership tables would answer it.
 *
 * `app.can_write_workspace()` joins `members` and `workspace_members`; this is that join's result
 * for two people and two workspaces, which is all the suite needs to show the boundary holding.
 */
const MEMBERSHIP: Record<string, readonly string[]> = { [ALICE]: [WORKSPACE_A] };

/** A KEK per test. 32 random bytes, base64, which is the only shape `kekFromBase64` accepts. */
function freshKek(): { base64: string; bytes: Uint8Array } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { base64: btoa(binary), bytes };
}

/**
 * Sign a token the way GoTrue signs a customer's session.
 *
 * BY HAND, AND NOT WITH `mintToken`, because `mintToken` cannot produce this shape: it refuses a
 * `sub` claim by design, and `sub` is precisely what makes this a person's session rather than an
 * API key's. Hand-rolling it here is also what lets the suite forge the four broken tokens below.
 */
async function signToken(
  payload: Record<string, unknown>,
  options: { secret?: string; header?: Record<string, unknown> } = {},
): Promise<string> {
  const segment = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
  const input = `${segment(options.header ?? { alg: "HS256", typ: "JWT" })}.${segment(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(options.secret ?? SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** A live session for a person. One hour out, like the project's own. */
function session(sub = ALICE, overrides: Record<string, unknown> = {}): Promise<string> {
  return signToken({
    sub,
    role: "authenticated",
    iat: Math.floor(NOW.getTime() / 1000),
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
    ...overrides,
  });
}

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

/**
 * A PostgREST that enforces the two things the database enforces on this insert: the
 * `connections_insert` with-check, and the `(workspace_id, provider, external_account_id)` unique
 * constraint.
 *
 * It never verifies the token's signature -- the Worker has already done that, and a second
 * verifier here would be testing the fake. It reads `sub` because that is what
 * `app.current_user_id()` reads.
 */
function postgrest(options: { existing?: readonly string[] } = {}) {
  const calls: Call[] = [];
  const stored = new Set<string>(options.existing ?? []);

  const impl = (async (input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
      string,
      unknown
    >;
    calls.push({ url: String(input), method: init?.method ?? "GET", headers, body });

    const claims = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            (headers.authorization ?? "").split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ??
              "",
          ),
          (c) => c.charCodeAt(0),
        ),
      ),
    ) as { sub?: string };

    const workspace = String(body.workspace_id);
    if (!(MEMBERSHIP[claims.sub ?? ""] ?? []).includes(workspace)) {
      // What Postgres answers when a with-check fails. `42501` is "RLS or a grant refused you".
      return new Response(
        JSON.stringify({
          code: "42501",
          message: 'new row violates row-level security policy for table "connections"',
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }

    const key = `${workspace}:${String(body.provider)}:${String(body.external_account_id)}`;
    if (stored.has(key)) {
      return new Response(JSON.stringify({ code: "23505", message: "duplicate key value" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }
    stored.add(key);
    return new Response(JSON.stringify([{ id: body.id, status: body.status }]), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { calls, impl };
}

/**
 * A WebCrypto that counts data keys.
 *
 * `seal` generates one fresh DEK per credential and nothing else on this path generates a key, so
 * the count IS the number of seals. It is how the suite asserts that a refused request never
 * reached the vault -- an assertion about the response body alone could not tell a refusal before
 * the seal from a refusal after one.
 */
function countingCrypto() {
  let seals = 0;
  const base = crypto.subtle as unknown as Record<string, unknown>;
  const subtle = new Proxy(base, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      const method = (value as (...args: unknown[]) => unknown).bind(crypto.subtle);
      if (property !== "generateKey") return method;
      return (...args: unknown[]) => {
        seals += 1;
        return method(...args);
      };
    },
  });
  return {
    // `getRandomValues` is passed straight through: `seal` draws its nonce from it, and a spy that
    // only wrapped `subtle` would leave the vault reaching for a global that is not there.
    crypto: {
      getRandomValues: (array: Uint8Array) => crypto.getRandomValues(array),
      subtle,
    } as unknown as VaultCrypto & AccessTokenCrypto,
    seals: () => seals,
  };
}

interface Harness {
  readonly deps: ConnectDeps;
  readonly calls: Call[];
  readonly seals: () => number;
  readonly kek: Uint8Array;
}

function harness(
  options: { existing?: readonly string[]; kek?: string; fetchImpl?: typeof fetch } = {},
): Harness {
  const kek = freshKek();
  const rest = postgrest({
    ...(options.existing === undefined ? {} : { existing: options.existing }),
  });
  const spy = countingCrypto();
  return {
    deps: {
      postgrest: {
        url: URL_BASE,
        apiKey: API_KEY,
        jwtSecret: SECRET,
        fetch: options.fetchImpl ?? rest.impl,
      },
      kek: options.kek ?? kek.base64,
      crypto: spy.crypto,
      requestId: "00000000-0000-0000-0000-0000000000ff",
      now: () => NOW,
      newConnectionId: () => CONNECTION,
    },
    calls: rest.calls,
    seals: spy.seals,
    kek: kek.bytes,
  };
}

/** A key-paste body. Every field the endpoint reads, so a test can vary exactly one. */
function wooBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspace_id: WORKSPACE_A,
    provider: "woocommerce",
    credential_lane: "key_secret",
    external_account_id: STORE_URL,
    display_name: "Example Shop",
    key: CONSUMER_KEY,
    secret: CONSUMER_SECRET,
    ...overrides,
  };
}

async function post(
  deps: ConnectDeps,
  body: unknown,
  authorization?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== null && authorization !== undefined) headers.authorization = authorization;
  return handleConnect(
    new Request("https://api-edge.test/v1/connections", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    deps,
  );
}

/** The row as it was POSTed, rebuilt into the shape `openCredential` takes. */
function writtenRow(call: Call): ConnectionRow {
  const b = call.body;
  return {
    id: String(b.id),
    workspaceId: String(b.workspace_id),
    provider: "woocommerce",
    credentialLane: "key_secret",
    externalAccountId: String(b.external_account_id),
    displayName: null,
    credentialCiphertext: decodeBytea(b.credential_ciphertext, "credential_ciphertext"),
    credentialIv: decodeBytea(b.credential_iv, "credential_iv"),
    wrappedDek: decodeBytea(b.wrapped_dek, "wrapped_dek"),
    keyVersion: Number(b.key_version),
    grantedScopes: [],
    expiresAt: null,
    status: "active",
    lastError: null,
    revokedAt: null,
  };
}

// ------------------------------------------------------------------------------------------------

describe("a request with no token", () => {
  it("is refused, and nothing is sealed", async () => {
    const h = harness();
    const response = await post(h.deps, wooBody(), null);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: "unauthorized" });
    expect(h.seals()).toBe(0);
    // And the database was never asked. An unauthenticated request must not cost a round trip, and
    // must certainly not reach an insert whose refusal would then be the only thing standing there.
    expect(h.calls).toHaveLength(0);
  });

  it("is refused when the header carries a scheme other than Bearer", async () => {
    const h = harness();
    const response = await post(h.deps, wooBody(), `Basic ${btoa("a:b")}`);
    expect(response.status).toBe(401);
    expect(h.seals()).toBe(0);
  });
});

describe("a token this project did not sign", () => {
  it("is refused when the signature is another secret's", async () => {
    const h = harness();
    const forged = await signToken(
      { sub: ALICE, role: "authenticated", exp: Math.floor(NOW.getTime() / 1000) + 3600 },
      { secret: "not-this-project's-secret" },
    );
    const response = await post(h.deps, wooBody(), `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect(h.seals()).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("is refused when the header claims `none`, rather than being taken at its word", async () => {
    // The textbook JWT failure: a verifier that reads `alg` out of the token and obeys it.
    const unsigned = `${base64url(encoder.encode(JSON.stringify({ alg: "none", typ: "JWT" })))}.${base64url(
      encoder.encode(JSON.stringify({ sub: ALICE, role: "authenticated", exp: 4102444800 })),
    )}.`;
    const h = harness();
    expect((await post(h.deps, wooBody(), `Bearer ${unsigned}`)).status).toBe(401);
    expect(h.seals()).toBe(0);
  });

  it("is refused once it has expired", async () => {
    const h = harness();
    const stale = await session(ALICE, { exp: Math.floor(NOW.getTime() / 1000) - 1 });
    expect((await post(h.deps, wooBody(), `Bearer ${stale}`)).status).toBe(401);
    expect(h.seals()).toBe(0);
  });

  it("is refused when it names no user, which is what an API key's token looks like", async () => {
    // `mintToken` writes `role: authenticated` and a `workspace_id` and deliberately no `sub`,
    // because `app.can_write_workspace()` refuses a session with no user. Refusing it here means
    // the refusal lands before a credential is sealed rather than after.
    const h = harness();
    const keySession = await signToken({
      role: "authenticated",
      workspace_id: WORKSPACE_A,
      exp: Math.floor(NOW.getTime() / 1000) + 60,
    });
    const response = await post(h.deps, wooBody(), `Bearer ${keySession}`);

    expect(response.status).toBe(401);
    expect(h.seals()).toBe(0);
    expect(h.calls).toHaveLength(0);
  });
});

describe("refusals that happen before anything is sealed", () => {
  it("refuses a provider this build cannot connect", async () => {
    const h = harness();
    const response = await post(
      h.deps,
      wooBody({ provider: "tiktok_ads" }),
      `Bearer ${await session()}`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "unknown_provider" });
    // THE ASSERTION THE BRIEF ASKS FOR, and it is about the control flow rather than the body: no
    // data key was generated, so the credential never reached the vault.
    expect(h.seals()).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("refuses a lane the provider does not offer, reading PROVIDER_LANES rather than a copy", async () => {
    // Google issues no pasteable long-lived token, so `bearer` for `ga4` is a lane a customer can
    // never walk down; sealing one would store a row nothing can ever use.
    const h = harness();
    const response = await post(
      h.deps,
      { ...wooBody(), provider: "ga4", credential_lane: "bearer", token: SYSTEM_USER_TOKEN },
      `Bearer ${await session()}`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "unsupported_lane" });
    expect(h.seals()).toBe(0);
  });

  it("refuses the oauth lane, which does not arrive by being typed", async () => {
    const h = harness();
    const response = await post(
      h.deps,
      wooBody({ credential_lane: "oauth" }),
      `Bearer ${await session()}`,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_lane" });
    expect(h.seals()).toBe(0);
  });

  it("refuses a missing or malformed workspace", async () => {
    const h = harness();
    const token = `Bearer ${await session()}`;

    const absent = await post(h.deps, { ...wooBody(), workspace_id: undefined }, token);
    expect(absent.status).toBe(400);
    expect(await absent.json()).toMatchObject({ error: "bad_request" });

    const malformed = await post(h.deps, wooBody({ workspace_id: "workspace-a" }), token);
    expect(malformed.status).toBe(400);

    expect(h.seals()).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("refuses a store address that is not one", async () => {
    // `normaliseStoreUrl` is the authority: a bare hostname is not a URL, and plain HTTP is refused
    // because over it the WooCommerce API requires request signing this repository does not do.
    const h = harness();
    const token = `Bearer ${await session()}`;

    expect(
      (await post(h.deps, wooBody({ external_account_id: "shop.example.com" }), token)).status,
    ).toBe(400);
    expect(
      (await post(h.deps, wooBody({ external_account_id: "http://shop.example.com" }), token))
        .status,
    ).toBe(400);
    expect(
      (await post(h.deps, wooBody({ external_account_id: `${STORE_URL}\nrm -rf` }), token)).status,
    ).toBe(400);
    expect(h.seals()).toBe(0);
  });

  it("refuses an empty half of a key-paste credential", async () => {
    const h = harness();
    const response = await post(h.deps, wooBody({ secret: "   " }), `Bearer ${await session()}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_credential" });
    // `connectWithKey` owns that refusal and takes it BEFORE sealing, so nothing was wrapped and
    // nothing was written.
    expect(h.seals()).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("refuses a bearer token that was already dead when it was pasted", async () => {
    const h = harness();
    const response = await post(
      h.deps,
      {
        workspace_id: WORKSPACE_A,
        provider: "meta_ads",
        credential_lane: "bearer",
        external_account_id: "act_1234567890",
        token: SYSTEM_USER_TOKEN,
        expires_at: "2026-09-01T00:00:00Z",
      },
      `Bearer ${await session()}`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "credential_expired" });
    expect(h.calls).toHaveLength(0);
  });

  it("answers 503 when this deployment's KEK is not a KEK, and stores nothing", async () => {
    const h = harness({ kek: "not-base64-of-32-bytes" });
    const response = await post(h.deps, wooBody(), `Bearer ${await session()}`);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "bad_kek" });
    expect(h.calls).toHaveLength(0);
  });

  it("is a POST", async () => {
    const h = harness();
    const response = await handleConnect(
      new Request("https://api-edge.test/v1/connections"),
      h.deps,
    );
    expect(response.status).toBe(405);
  });
});

describe("tenancy is the database's decision, not this file's", () => {
  it("refuses a workspace the caller is not a member of", async () => {
    // THE TEST THIS ENDPOINT EXISTS FOR. Alice holds a live session and names workspace B in the
    // body. Nothing in the Worker compares the two; the insert is forwarded under her own token and
    // `connections_insert`'s with-check refuses the row.
    const h = harness();
    const response = await post(
      h.deps,
      wooBody({ workspace_id: WORKSPACE_B }),
      `Bearer ${await session()}`,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "forbidden" });

    // The refusal came FROM THE DATABASE: the request was made, and it was made as Alice.
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.body.workspace_id).toBe(WORKSPACE_B);
  });

  it("forwards the caller's own token rather than minting one", async () => {
    const h = harness();
    const token = await session();
    await post(h.deps, wooBody(), `Bearer ${token}`);

    const call = h.calls[0];
    expect(call?.headers.authorization).toBe(`Bearer ${token}`);
    // The publishable key only gets the request past the edge; the identity is the token above.
    expect(call?.headers.apikey).toBe(API_KEY);
    // And the forwarded token is a person's: it carries the `sub` that `app.current_user_id()`
    // reads and that a minted API-key token deliberately lacks.
    const forwarded = await verifyAccessToken(token, {
      secret: SECRET,
      now: NOW,
      crypto: h.deps.crypto,
    });
    expect(forwarded.userId).toBe(ALICE);
  });

  it("reports a second connection to the same account as a conflict, not a silent replacement", async () => {
    const h = harness({ existing: [`${WORKSPACE_A}:woocommerce:${STORE_URL}`] });
    const response = await post(h.deps, wooBody(), `Bearer ${await session()}`);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "already_connected" });
  });
});

describe("the row that gets written", () => {
  it("stores a credential that opens, bound to the workspace and connection it names", async () => {
    const h = harness();
    const response = await post(h.deps, wooBody(), `Bearer ${await session()}`);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok: true,
      connection_id: CONNECTION,
      status: "active",
    });
    expect(h.seals()).toBe(1);

    const call = h.calls[0];
    if (call === undefined) throw new Error("expected an insert");
    expect(call.method).toBe("POST");
    expect(call.headers.prefer).toBe("return=representation");
    expect(call.body).toMatchObject({
      id: CONNECTION,
      workspace_id: WORKSPACE_A,
      provider: "woocommerce",
      credential_lane: "key_secret",
      external_account_id: STORE_URL,
      key_version: 1,
      status: "active",
      expires_at: null,
    });

    // THE WHOLE CHAIN: hex encoding, the AAD scope, and the `kind` written into the blob agreeing
    // with the `credential_lane` column. `openCredential` refuses on any of the three.
    const credential = await openCredential(webcrypto, writtenRow(call), h.kek);
    expect(credential.kind).toBe("key_secret");
    if (credential.kind !== "key_secret") throw new Error("expected a key_secret credential");
    expect(credential.key).toBe(CONSUMER_KEY);
    expect(credential.secret).toBe(CONSUMER_SECRET);
  });

  it("cannot be opened as another workspace's connection", async () => {
    // The attack RLS does not cover: relocating a ciphertext into a row the attacker can read.
    const h = harness();
    await post(h.deps, wooBody(), `Bearer ${await session()}`);
    const call = h.calls[0];
    if (call === undefined) throw new Error("expected an insert");

    await expect(
      openCredential(webcrypto, { ...writtenRow(call), workspaceId: WORKSPACE_B }, h.kek),
    ).rejects.toThrow();
  });

  it("normalises the store address rather than storing what was pasted", async () => {
    const h = harness();
    await post(
      h.deps,
      wooBody({ external_account_id: `${STORE_URL}/wp-admin/admin.php?page=wc-settings` }),
      `Bearer ${await session()}`,
    );
    expect(h.calls[0]?.body.external_account_id).toBe(STORE_URL);
  });

  it("writes no timezone, because nobody has told us one", async () => {
    // Null there means NOBODY HAS TOLD US, never UTC. `/v1/ingest/run` refuses such a connection by
    // name (`no_timezone`) rather than dating seven hours of every day wrongly and reporting ok.
    const h = harness();
    await post(h.deps, wooBody(), `Bearer ${await session()}`);
    expect(h.calls[0]?.body).not.toHaveProperty("timezone");
  });

  it("stores a bearer token under its own lane, with null meaning permanent", async () => {
    const h = harness();
    const response = await post(
      h.deps,
      {
        workspace_id: WORKSPACE_A,
        provider: "meta_ads",
        credential_lane: "bearer",
        external_account_id: "act_1234567890",
        token: SYSTEM_USER_TOKEN,
      },
      `Bearer ${await session()}`,
    );

    expect(response.status).toBe(201);
    expect(h.calls[0]?.body).toMatchObject({
      provider: "meta_ads",
      credential_lane: "bearer",
      expires_at: null,
      granted_scopes: [],
    });
  });

  it("encodes bytea in the form the read adapter refuses to guess at", () => {
    // The two halves of one agreement, checked against each other rather than against a prefix.
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    expect(decodeBytea(toByteaHex(bytes), "credential_ciphertext")).toEqual(bytes);
  });
});

describe("the credential never appears in a response, an error or a log", () => {
  it("is absent from every body this endpoint can produce", async () => {
    const bodies: Array<[string, Record<string, unknown>]> = [
      ["accepted", wooBody()],
      ["unknown provider", wooBody({ provider: "tiktok_ads" })],
      ["unsupported lane", wooBody({ provider: "ga4", credential_lane: "key_secret" })],
      ["bad workspace", wooBody({ workspace_id: "not-a-uuid" })],
      ["bad store url", wooBody({ external_account_id: "shop.example.com" })],
      ["empty half", wooBody({ secret: "" })],
      ["refused by the database", wooBody({ workspace_id: WORKSPACE_B })],
    ];

    for (const [name, body] of bodies) {
      const h = harness();
      const response = await post(h.deps, body, `Bearer ${await session()}`);
      const text = await response.text();
      // Not echoed, not masked, not fingerprinted: no substring of either half appears at all.
      expect(text, name).not.toContain(CONSUMER_KEY);
      expect(text, name).not.toContain(CONSUMER_SECRET);
      expect(text, name).not.toContain("ck_");
      expect(text, name).not.toContain("cs_");
    }
  });

  it("is absent from an unauthenticated refusal, where the body was never even read", async () => {
    const h = harness();
    const text = await (await post(h.deps, wooBody(), null)).text();
    expect(text).not.toContain(CONSUMER_KEY);
    expect(text).not.toContain(CONSUMER_SECRET);
  });

  it("is absent from the insert's own failure, which quotes no upstream body", async () => {
    // PostgREST's `details` and `hint` echo the failing statement, and the failing statement here
    // is the INSERT -- whose values include the sealed credential. `StoreError` drops both.
    const shouting = (async () =>
      new Response(
        JSON.stringify({
          code: "P0001",
          message: "boom",
          details: `insert into connections ... '${CONSUMER_SECRET}'`,
          hint: CONSUMER_KEY,
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const h = harness({ fetchImpl: shouting });
    const response = await post(h.deps, wooBody(), `Bearer ${await session()}`);

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(CONSUMER_SECRET);
    expect(text).not.toContain(CONSUMER_KEY);
  });

  it("is absent from THE LOG, which this block's own title claimed and nothing checked", async () => {
    // THE TITLE SAID "a response, an error OR A LOG" AND NO TEST TOUCHED A LOG. `connect.ts` calls
    // `console.log` on both the accepted and the refused path, so the claim was not merely
    // unproven -- it was made about code that does the thing being claimed safe.
    //
    // A log line is the likeliest place a credential escapes and the least likely place anyone
    // looks: it survives the request, it leaves the process, and it lands somewhere with different
    // access rules from the database the credential is sealed in.
    //
    // Every argument of every call is stringified, including objects, because a credential nested
    // in a structured log entry is still in the log -- and `%o`-style inspection is exactly how it
    // would get there without appearing in any format string.
    const logged: string[] = [];
    const real = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    try {
      const h = harness();
      await post(h.deps, wooBody(), `Bearer ${await session()}`);
      // A refusal too: the path that logs an error is the one carrying the offending input.
      const refused = harness();
      await post(refused.deps, wooBody({ workspace_id: WORKSPACE_B }), `Bearer ${await session()}`);
    } finally {
      console.log = real;
    }

    // The endpoint must actually have logged, or this test proves nothing by silence -- the same
    // trap as asserting an array is empty that was never assigned.
    expect(logged.length).toBeGreaterThan(0);
    const all = logged.join("\n");
    expect(all).not.toContain(CONSUMER_KEY);
    expect(all).not.toContain(CONSUMER_SECRET);
    expect(all).not.toContain("ck_");
    expect(all).not.toContain("cs_");
    // And the merchant's store origin is not ours to log either: `external_account_id` identifies
    // the customer's business, and the log line is deliberately documented as omitting it.
    expect(all).not.toContain("shop.example.com");
  });
});

describe("the route", () => {
  it("says which bindings are missing rather than pretending the credential was refused", async () => {
    // No binding is set in the test environment, which is the same shape as a half-configured
    // deployment. A 401 or a 400 here would send somebody to look at the customer's credential.
    const response = await SELF.fetch("https://api-edge.test/v1/connections", {
      method: "POST",
      body: JSON.stringify(wooBody()),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("not_configured");
    expect(body.message).toContain("CREDENTIAL_KEK");
    expect(body.message).toContain("SUPABASE_JWT_SECRET");
  });
});
