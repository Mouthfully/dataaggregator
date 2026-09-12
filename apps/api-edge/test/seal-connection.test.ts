/**
 * The script writes a row; this Worker reads one. These tests are the only place the two meet.
 *
 * `scripts/seal-connection.ts` builds the credential JSON and renders the `bytea` literals itself.
 * It is allowed to do that ONLY because everything it produces is opened here by the functions the
 * runtime calls -- `openCredential` from `@repo/connections` and `decodeBytea` from `@repo/store` --
 * rather than by a second reader written to match.
 *
 * A credential that seals and cannot be opened is the failure this file exists to make impossible
 * before an operator discovers it from a backfill, hours later, with nothing pointing at the cause.
 */

import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

import { openCredential } from "@repo/connections";
import { decodeBytea } from "@repo/store";
import { assertWooTimezone } from "@repo/connectors";
import {
  KEY_VERSION,
  PROVIDER,
  SealError,
  assertStorableTimezone,
  buildCredential,
  parseArgs,
  probe,
  sealConnection,
  toByteaLiteral,
} from "../../../scripts/seal-connection.ts";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "22222222-2222-4222-8222-222222222222";
const OTHER_CONNECTION = "33333333-3333-4333-8333-333333333333";

const KEK = new Uint8Array(32).fill(7);
const KEY = "ck_0123456789abcdef0123456789abcdef01234567";
const SECRET = "cs_fedcba9876543210fedcba9876543210fedcba98";

const input = (overrides: Partial<Parameters<typeof sealConnection>[0]> = {}) => ({
  workspaceId: WORKSPACE,
  connectionId: CONNECTION,
  storeUrl: "https://shop.example",
  timezone: "Asia/Bangkok",
  key: KEY,
  secret: SECRET,
  displayName: null,
  kek: KEK,
  ...overrides,
});

/**
 * The columns as `packages/store/src/connections.ts` would hand them to the Worker.
 *
 * EVERY FIELD IS READ OUT OF THE EMITTED SQL, never restated here. The lane in particular:
 * `openCredential` refuses when the row's `credential_lane` disagrees with the sealed `kind`,
 * because everything that reads the lane WITHOUT decrypting -- health, the connect surface --
 * would otherwise be answering from the wrong one. Hardcoding "key_secret" in this helper would
 * have made that check unobservable from here, which is how the first draft of this file passed
 * a row the Worker would have rejected.
 */
function rowFromSql(sql: string, connectionId = CONNECTION) {
  const literals = [...sql.matchAll(/'(\\x[0-9a-f]+)'::bytea/g)].map((m) => m[1]);
  expect(literals).toHaveLength(3);
  const lane = sql.match(/'woocommerce',\s*\n\s*'([a-z_]+)',/)?.[1];
  expect(lane).toBeDefined();
  return {
    id: connectionId,
    workspaceId: WORKSPACE,
    credentialLane: lane as "key_secret",
    status: "active" as const,
    revokedAt: null,
    keyVersion: KEY_VERSION,
    credentialCiphertext: decodeBytea(literals[0], "credential_ciphertext"),
    credentialIv: decodeBytea(literals[1], "credential_iv"),
    wrappedDek: decodeBytea(literals[2], "wrapped_dek"),
  };
}

describe("what the script seals, the Worker opens", () => {
  it("round-trips the credential through openCredential, byte literals and all", async () => {
    const { sql } = await sealConnection(input());
    // Deliberately NOT the in-memory Uint8Arrays: the bytes go out as `\x...` text and come back
    // through the same decoder the connection adapter uses, so the hex rendering is under test too.
    const opened = await openCredential(webcrypto as never, rowFromSql(sql) as never, KEK);
    expect(opened).toEqual({ kind: "key_secret", key: KEY, secret: SECRET });
  });

  it("refuses to open under a different connection id", async () => {
    // This is the assertion behind the emitted SQL's loudest comment. The id column looks redundant
    // next to a gen_random_uuid() default; it is part of the AES-GCM additional authenticated data,
    // so a row that lets the database choose its own id is permanently unreadable.
    const { sql } = await sealConnection(input());
    const moved = rowFromSql(sql, OTHER_CONNECTION);
    await expect(openCredential(webcrypto as never, moved as never, KEK)).rejects.toThrow();
  });

  it("refuses to open under a different workspace", async () => {
    const { sql } = await sealConnection(input());
    const row = { ...rowFromSql(sql), workspaceId: "44444444-4444-4444-8444-444444444444" };
    await expect(openCredential(webcrypto as never, row as never, KEK)).rejects.toThrow();
  });

  it("refuses to open under a different KEK", async () => {
    const { sql } = await sealConnection(input());
    const wrong = new Uint8Array(32).fill(9);
    await expect(
      openCredential(webcrypto as never, rowFromSql(sql) as never, wrong),
    ).rejects.toThrow();
  });

  it("seals the discriminated shape the union declares, not a lookalike", () => {
    // If this ever drifts to {key, secret} without `kind`, openCredential reads it as a dated OAuth
    // blob and hands the scheduler two undefined fields rather than failing.
    expect(buildCredential(KEY, SECRET)).toEqual({ kind: "key_secret", key: KEY, secret: SECRET });
  });
});

describe("the emitted SQL", () => {
  it("writes the id explicitly rather than leaving it to the default", async () => {
    const { sql, connectionId } = await sealConnection(input());
    expect(connectionId).toBe(CONNECTION);
    expect(sql).toMatch(/insert into public\.connections \(\s*\n?\s*id,/);
    expect(sql).toContain(`'${CONNECTION}'`);
  });

  it("carries the timezone, because the ingest runtime refuses a connection without one", async () => {
    const { sql } = await sealConnection(input({ timezone: "Europe/Berlin" }));
    expect(sql).toContain("'Europe/Berlin'");
  });

  it("names the provider and the lane", async () => {
    const { sql } = await sealConnection(input());
    expect(sql).toContain(`'${PROVIDER}'`);
    expect(sql).toContain("'key_secret'");
  });

  it("contains neither the secret nor the key in plaintext", async () => {
    // The whole artefact is meant to be pasteable into a shared SQL editor and survivable in a
    // screenshot. A `\x` blob is; a consumer secret is not.
    const { sql } = await sealConnection(input());
    expect(sql).not.toContain(SECRET);
    expect(sql).not.toContain(KEY);
  });

  it("refuses a field carrying a line break rather than escaping it", async () => {
    await expect(sealConnection(input({ displayName: "Shop\nDROP TABLE" }))).rejects.toThrow(
      SealError,
    );
  });

  it("renders bytea as \\x hex, which is what PostgREST returns", () => {
    expect(toByteaLiteral(new Uint8Array([0x00, 0x0f, 0xff]))).toBe("\\x000fff");
    expect(decodeBytea(toByteaLiteral(new Uint8Array([1, 2, 3])), "c")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});

describe("the probe, which runs before anything is sealed", () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("accepts a store that returns a JSON array of orders", async () => {
    await expect(
      probe("https://shop.example", { key: KEY, secret: SECRET }, ok([{ id: 1 }])),
    ).resolves.toEqual({ orders: 1 });
  });

  it("accepts an empty array -- a store with no orders is connectable", async () => {
    // An empty page proves the permission, which is the only thing being probed. Refusing here
    // would lock out every store that has not sold anything yet.
    await expect(
      probe("https://shop.example", { key: KEY, secret: SECRET }, ok([])),
    ).resolves.toEqual({ orders: 0 });
  });

  it.each([401, 403])("reports %i as a credential problem, not a store problem", async (status) => {
    await expect(
      probe("https://shop.example", { key: KEY, secret: SECRET }, ok({}, status)),
    ).rejects.toMatchObject({ refusal: "probe_unauthorised" });
  });

  it("reports 404 as the REST API being off rather than a bad password", async () => {
    await expect(
      probe("https://shop.example", { key: KEY, secret: SECRET }, ok({}, 404)),
    ).rejects.toMatchObject({ refusal: "probe_not_woocommerce" });
  });

  it("refuses a 200 whose body is not an array", async () => {
    // A security plugin or a cached login page answering 200 with HTML-shaped JSON would otherwise
    // read as a successful probe.
    await expect(
      probe("https://shop.example", { key: KEY, secret: SECRET }, ok({ message: "hello" })),
    ).rejects.toMatchObject({ refusal: "probe_not_woocommerce" });
  });

  it("reports an unreachable store as reachability, naming nothing about the credential", async () => {
    const dead = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(
      probe("https://shop.example", { key: KEY, secret: SECRET }, dead),
    ).rejects.toMatchObject({ refusal: "probe_failed" });
  });

  it("asks for exactly one order, not a page of a hundred", async () => {
    const spy = ok([]);
    await probe("https://shop.example", { key: KEY, secret: SECRET }, spy);
    const calls = (spy as unknown as { mock: { calls: [string][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://shop.example/wp-json/wc/v3/orders?per_page=1");
  });
});

describe("the timezone rule, checked against the live trigger's answers", () => {
  /**
   * Every expectation below was run against the live project's `pg_timezone_names` on 2026-09-12,
   * so `accepts` means "the trigger in 20260912000400 would store this" rather than "this looked
   * right". Fourteen candidates, fourteen agreements.
   *
   * The two Intl-shaped traps are in here on purpose. `Intl.supportedValuesOf("timeZone")` on the
   * Node build this was written against EXCLUDES Asia/Kolkata and America/Argentina/Buenos_Aires,
   * both of which Postgres holds; a check built on that list refuses real merchants. And ICU
   * resolves both of those to their backward names, so demanding `resolved === input` refuses them
   * too. This rule does neither.
   */
  const accepts = [
    "Asia/Bangkok",
    "UTC",
    "Asia/Kolkata",
    "Asia/Calcutta",
    "America/Argentina/Buenos_Aires",
    "America/Buenos_Aires",
    "US/Eastern",
    "Etc/GMT+5",
  ];
  const refuses: [string, RegExp][] = [
    ["asia/bangkok", /canonical spelling. Use "Asia\/Bangkok"/],
    ["utc", /must be spelled "UTC"/],
    ["EST5EDT", /not an Area\/Location zone name/],
    ["Factory", /not an Area\/Location zone name/],
    ["localtime", /not an Area\/Location zone name/],
    ["posixrules", /not an Area\/Location zone name/],
  ];

  it.each(accepts)("accepts %s, which pg_timezone_names holds", (zone) => {
    expect(() => assertStorableTimezone(zone)).not.toThrow();
  });

  it.each(refuses)("refuses %s", (zone, message) => {
    expect(() => assertStorableTimezone(zone)).toThrow(message);
  });

  it("refuses a case variant BEFORE sealing, not after the INSERT fails", async () => {
    // The ordering is the point. assertWooTimezone passes `asia/bangkok` -- ICU is case-insensitive
    // and its docstring says the canonical rule lives on the column -- so without this check the
    // credential is sealed and the database rejects the row it was sealed for.
    expect(() => assertWooTimezone("asia/bangkok")).not.toThrow();
    expect(() => assertStorableTimezone("asia/bangkok")).toThrow(SealError);
  });
});

describe("argument parsing", () => {
  it("refuses the secret on the command line and says why", () => {
    // argv is world-readable through ps and is written to shell history. The refusal names the
    // environment variable rather than just declining.
    expect(() => parseArgs(["--secret", "cs_live"])).toThrow(/WOO_CONSUMER_SECRET/);
    expect(() => parseArgs(["--key", "ck_live"])).toThrow(/WOO_CONSUMER_KEY/);
  });

  it("refuses a flag with no value rather than reading the next flag as one", () => {
    expect(() => parseArgs(["--workspace", "--store", "https://s.example"])).toThrow(SealError);
  });

  it("refuses a bare positional argument", () => {
    expect(() => parseArgs(["oops"])).toThrow(/unexpected argument/);
  });

  it("parses the ordinary case", () => {
    expect(parseArgs(["--workspace", WORKSPACE, "--store", "https://s.example"])).toEqual({
      workspace: WORKSPACE,
      store: "https://s.example",
    });
  });
});
