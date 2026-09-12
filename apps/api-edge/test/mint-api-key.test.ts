/**
 * The script mints a credential; this Worker authenticates one. These tests are where they meet.
 *
 * `authenticator.ts` hashes the presented bearer token with `hashApiKey` and asks `verify_api_key`
 * whether any row holds that hash. So a minted key is correct if and only if the hash the script
 * puts in the row is the hash the Worker computes from the key it printed. That is asserted here
 * against the real function, not against a second SHA-256 written to agree with it.
 */

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hashApiKey } from "@repo/store";
import {
  KEY_PREFIX_PATTERN,
  MintError,
  PREFIX_LENGTH,
  SECRET_LENGTH,
  mintApiKey,
  mintKey,
  parseArgs,
  parseBudget,
  parseEnvironment,
  parseExpiry,
  parseName,
  randomChars,
} from "../../../scripts/mint-api-key.ts";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const input = (over: Partial<Parameters<typeof mintApiKey>[0]> = {}) => ({
  workspaceId: WORKSPACE,
  name: "Demo key",
  environment: "test" as const,
  monthlyCreditBudget: null,
  expiresAt: null,
  ...over,
});

describe("the key the Worker will be shown", () => {
  it("has the shape the api_keys check constraint demands", () => {
    const { key, keyPrefix } = mintKey("live");
    expect(keyPrefix).toMatch(KEY_PREFIX_PATTERN);
    // The whole key, including the secret half, stays inside [a-z0-9] so nothing needs escaping in
    // a header, a URL or a shell.
    expect(key).toMatch(/^mp_live_[a-z0-9]{8}_[a-z0-9]{32}$/);
  });

  it("makes key_prefix a genuine prefix of the key, not a separate identifier", () => {
    // This is what lets an operator match a row against the key in their password manager without
    // holding the secret. A generated-independently prefix would look identical and match nothing.
    const { key, keyPrefix } = mintKey("test");
    expect(key.startsWith(`${keyPrefix}_`)).toBe(true);
  });

  it("never repeats", () => {
    const keys = new Set(Array.from({ length: 200 }, () => mintKey("test").key));
    expect(keys.size).toBe(200);
  });

  it("draws uniformly, with no modulo bias", async () => {
    // The reason the alphabet is 32 symbols and not 36. Feeding every byte value exactly once must
    // yield every symbol exactly eight times; with a 36-symbol alphabet and `% 36` the first four
    // letters would come out eight times and the rest seven, which no output inspection would show.
    let cursor = 0;
    const everyByte = {
      getRandomValues<T extends Uint8Array>(array: T): T {
        for (let i = 0; i < array.length; i += 1) array[i] = cursor++ & 0xff;
        return array;
      },
    } as unknown as typeof webcrypto;

    const drawn = randomChars(256, everyByte);
    const counts = new Map<string, number>();
    for (const ch of drawn) counts.set(ch, (counts.get(ch) ?? 0) + 1);

    expect(counts.size).toBe(32);
    expect([...counts.values()].every((n) => n === 8)).toBe(true);
  });

  it("spends 40 bits on the public half and 160 on the secret", () => {
    const { key, keyPrefix } = mintKey("test");
    expect(keyPrefix.split("_")[2]).toHaveLength(PREFIX_LENGTH);
    expect(key.split("_")[3]).toHaveLength(SECRET_LENGTH);
  });
});

describe("what the script stores is what the Worker computes", () => {
  it("writes the hash `hashApiKey` produces from the printed key", async () => {
    const { sql, key } = await mintApiKey(input());
    const expected = await hashApiKey(key, webcrypto as never);
    expect(sql).toContain(`'${expected}'::bytea`);
  });

  it("writes exactly 32 bytes, which is the column's own check", async () => {
    const { sql } = await mintApiKey(input());
    const hex = /'\\x([0-9a-f]+)'::bytea/.exec(sql)?.[1];
    expect(hex).toBeDefined();
    expect(hex).toHaveLength(64);
  });

  it("does not put the key in the SQL, because the SQL is the part that gets shared", async () => {
    // The INSERT is pasted into a SQL editor, lands in a browser history and often a chat. The key
    // is printed once on stderr and is unrecoverable from this artefact by construction.
    const { sql, key } = await mintApiKey(input());
    expect(sql).not.toContain(key);
    expect(sql).toContain(key.slice(0, key.lastIndexOf("_"))); // the prefix is not a secret
  });

  it("carries the budget and expiry when given, and null when not", async () => {
    const bare = await mintApiKey(input());
    expect(bare.sql).toMatch(/monthly_credit_budget[\s\S]*\n\s*null,/);

    const full = await mintApiKey(
      input({ monthlyCreditBudget: 1000, expiresAt: "2027-01-01T00:00:00.000Z" }),
    );
    expect(full.sql).toContain("1000");
    expect(full.sql).toContain("'2027-01-01T00:00:00.000Z'");
  });

  it("leaves allowed_tools empty, which means every tool", async () => {
    const { sql } = await mintApiKey(input());
    expect(sql).toContain("'{}'");
  });
});

describe("the refusals", () => {
  it("has no default environment", () => {
    // A key that reaches production because `test` was assumed, or a demo that burns real credits
    // because `live` was, are both decisions nobody made.
    expect(() => parseEnvironment(undefined)).toThrow(/no default/);
    expect(() => parseEnvironment("prod")).toThrow(/must be "live" or "test"/);
    expect(parseEnvironment("live")).toBe("live");
  });

  it("holds the name to the column's own bounds", () => {
    expect(() => parseName(undefined)).toThrow(MintError);
    expect(() => parseName("   ")).toThrow(MintError);
    expect(() => parseName("x".repeat(121))).toThrow(/1 to 120/);
    expect(parseName("  Demo  ")).toBe("Demo");
  });

  it("refuses a budget that is not a whole non-negative number", () => {
    expect(() => parseBudget("-1")).toThrow(MintError);
    expect(() => parseBudget("1.5")).toThrow(MintError);
    expect(() => parseBudget("lots")).toThrow(MintError);
    expect(parseBudget(undefined)).toBeNull();
    expect(parseBudget("0")).toBe(0);
  });

  it("refuses an expiry in the past rather than minting a key that is already dead", () => {
    // Such a key mints, inserts and authenticates as nothing, and the failure is indistinguishable
    // from a wrong key.
    expect(() => parseExpiry("2020-01-01T00:00:00Z")).toThrow(/in the past/);
    expect(() => parseExpiry("not a date")).toThrow(/not a timestamp/);
    expect(parseExpiry(undefined)).toBeNull();
  });

  it("refuses a bare positional and a flag with no value", () => {
    expect(() => parseArgs(["oops"])).toThrow(/unexpected argument/);
    expect(() => parseArgs(["--name", "--env", "test"])).toThrow(MintError);
  });

  it("refuses a name carrying a line break rather than escaping it", async () => {
    await expect(mintApiKey(input({ name: "Demo\n-- DROP" }))).rejects.toThrow(MintError);
  });
});
