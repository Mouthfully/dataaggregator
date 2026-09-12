/**
 * MINT ONE API KEY AND PRINT THE ROW THAT VERIFIES IT.
 *
 * Step 7 of docs/marketplane/MVP-PLAN.md section 5: "nothing mints a key today". `/v1/performance`
 * authenticates a bearer credential and there has never been a way to create one, so the read half
 * of the product has been unreachable for the same reason the write half was.
 *
 * A script, and printing SQL rather than executing it, for the reason `54-seal-connection.md`
 * records: the `api_keys` insert policy needs a non-null `app.current_user_id()` and no credential
 * in this system carries one.
 *
 * IT DOES NOT HASH THE KEY ITSELF. `hashApiKey` comes from `@repo/store` -- the same function the
 * Worker calls on every request in `authenticator.ts`. A second SHA-256 here would agree with it
 * until one of them changed encoding or framing, and the symptom would be a key that mints
 * successfully and authenticates as nothing, with `verify_api_key` returning the same null it
 * returns for a revoked key.
 *
 * THE KEY IS PRINTED, ONCE. This inverts `seal-connection.ts`, which never prints its secret, and
 * the inversion is the point: there the secret already existed in the merchant's admin and the
 * script was merely handling it. Here the secret is BROUGHT INTO EXISTENCE by this run and the
 * database stores only its hash, so a run whose output is lost is a key nobody will ever hold
 * again -- there is no recovery path, by construction.
 */

import { randomUUID, webcrypto } from "node:crypto";

import { hashApiKey } from "@repo/store";

export type KeyEnvironment = "live" | "test";

export type MintRefusal = "bad_argument" | "missing_argument";

export class MintError extends Error {
  readonly refusal: MintRefusal;
  constructor(message: string, refusal: MintRefusal) {
    super(message);
    this.name = "MintError";
    this.refusal = refusal;
  }
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** What `api_keys.key_prefix` must match. Copied from the column so a drift is a test failure. */
export const KEY_PREFIX_PATTERN = /^mp_(live|test)_[a-z0-9]{8}$/;

/**
 * The alphabet, and why it is 32 characters rather than 36.
 *
 * The column's check is `[a-z0-9]`, which is 36 symbols -- and 36 does not divide 256, so drawing a
 * byte and taking it modulo 36 makes the first four letters measurably likelier than the rest. The
 * bias is small and it is also completely unnecessary: 32 symbols is exactly five bits, so every
 * draw is uniform with no rejection loop and no modulo at all. Lowercase base32 is a subset of
 * `[a-z0-9]`, so the column is satisfied either way.
 *
 * `i`, `l`, `o`, `0` and `1` survive here where a human-typed code would drop them. These keys are
 * copied and pasted, never transcribed, and removing symbols costs entropy for a confusion that
 * does not arise.
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Characters after the prefix. 32 x 5 bits = 160, on top of the prefix's own 40. */
export const SECRET_LENGTH = 32;

/** Characters in the public half. 8 x 5 bits = 40. See `mintKey` for why that is enough. */
export const PREFIX_LENGTH = 8;

export function randomChars(count: number, crypto: typeof webcrypto = webcrypto): string {
  const bytes = crypto.getRandomValues(new Uint8Array(count));
  let out = "";
  // `& 31` keeps the low five bits of each byte. Uniform because the alphabet is a power of two;
  // this is the whole reason for that choice.
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

export interface MintedKey {
  /** The full credential. Exists in this process and in the operator's terminal. Nowhere else. */
  readonly key: string;
  /** The non-secret display half, stored in `api_keys.key_prefix`. */
  readonly keyPrefix: string;
}

/**
 * `mp_<env>_<8 public>_<32 secret>`.
 *
 * The public half is a genuine prefix of the key rather than a separate identifier, because that is
 * what makes it useful: an operator reading `key_prefix` in a row can match it against the key in
 * their password manager without holding the secret.
 *
 * Forty bits of prefix is not a security boundary -- the whole key is hashed, and the prefix is
 * declared non-secret by the column's own comment. It only needs to avoid colliding in a UNIQUE
 * index, and at forty bits that is a coin-flip at roughly a million keys. A collision fails the
 * INSERT, which is a retry, not an incident.
 */
export function mintKey(
  environment: KeyEnvironment,
  crypto: typeof webcrypto = webcrypto,
): MintedKey {
  const keyPrefix = `mp_${environment}_${randomChars(PREFIX_LENGTH, crypto)}`;
  return { key: `${keyPrefix}_${randomChars(SECRET_LENGTH, crypto)}`, keyPrefix };
}

/** Single-quoted SQL string. Refuses rather than escapes what has no business here. */
export function sqlString(value: string, field: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new MintError(`${field} contains a line break; paste the value alone`, "bad_argument");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

export interface MintInput {
  readonly workspaceId: string;
  readonly name: string;
  readonly environment: KeyEnvironment;
  readonly monthlyCreditBudget: number | null;
  readonly expiresAt: string | null;
}

export async function mintApiKey(
  input: MintInput,
  crypto: typeof webcrypto = webcrypto,
): Promise<{ sql: string; key: string; keyPrefix: string; id: string }> {
  const { key, keyPrefix } = mintKey(input.environment, crypto);
  // The Worker's own function, not a second SHA-256. It returns the `\x...` bytea literal directly.
  const keyHash = await hashApiKey(key, crypto as never);
  const id = randomUUID();

  const sql = `-- One API key, minted ${new Date().toISOString()}.
--
-- Run as the project owner in the Supabase SQL editor. It will NOT work through PostgREST: the
-- api_keys insert policy requires a non-null app.current_user_id().
--
-- THE KEY ITSELF IS NOT IN THIS FILE and cannot be recovered from it. The column holds SHA-256 of
-- the key, which is what verify_api_key is given; the key was printed once, on stderr, by the run
-- that produced this.
insert into public.api_keys (
  id, workspace_id, name, key_prefix, key_hash,
  monthly_credit_budget, allowed_tools, expires_at
) values (
  ${sqlString(id, "id")},
  ${sqlString(input.workspaceId, "workspace id")},
  ${sqlString(input.name, "name")},
  ${sqlString(keyPrefix, "key prefix")},
  ${sqlString(keyHash, "key hash")}::bytea,
  ${input.monthlyCreditBudget === null ? "null" : input.monthlyCreditBudget},
  -- Empty means EVERY tool. A key with no restriction is the common case, and an empty array is
  -- easier to reason about than a null that means "all".
  '{}',
  ${input.expiresAt === null ? "null" : sqlString(input.expiresAt, "expiry")}
);
`;

  return { sql, key, keyPrefix, id };
}

// -------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------

const USAGE = `Usage:
  pnpm exec tsx scripts/mint-api-key.ts \\
    --workspace <uuid> --name "Demo key" --env test [--budget 1000] [--expires 2027-01-01T00:00:00Z]

Writes the INSERT to stdout and the key itself to stderr, once. The key cannot be recovered
afterwards: the database stores only its SHA-256.`;

export function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) throw new MintError(`argument ${i + 1} is empty`, "bad_argument");
    if (!token.startsWith("--")) {
      throw new MintError(`unexpected argument "${token}"`, "bad_argument");
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new MintError(`--${token.slice(2)} needs a value`, "missing_argument");
    }
    out[token.slice(2)] = value;
    i += 1;
  }
  return out;
}

export function parseEnvironment(value: string | undefined): KeyEnvironment {
  if (value === "live" || value === "test") return value;
  throw new MintError(
    // No default, deliberately. A key that reaches production because `test` was assumed, or a
    // demo that burns real credits because `live` was, are both decisions nobody made.
    `--env must be "live" or "test"${value === undefined ? "" : `, not "${value}"`}. There is no default.`,
    value === undefined ? "missing_argument" : "bad_argument",
  );
}

export function parseName(value: string | undefined): string {
  const name = value?.trim() ?? "";
  // The column's own check: length(btrim(name)) between 1 and 120.
  if (name === "" || name.length > 120) {
    throw new MintError(
      `--name must be 1 to 120 characters after trimming, received ${name.length}`,
      name === "" ? "missing_argument" : "bad_argument",
    );
  }
  return name;
}

export function parseBudget(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new MintError(
      `--budget must be a non-negative whole number, not "${value}"`,
      "bad_argument",
    );
  }
  return parsed;
}

export function parseExpiry(value: string | undefined): string | null {
  if (value === undefined) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    throw new MintError(`--expires "${value}" is not a timestamp`, "bad_argument");
  }
  if (at <= Date.now()) {
    // A key that expires in the past mints, inserts and authenticates as nothing, and the failure
    // looks exactly like a wrong key.
    throw new MintError(`--expires "${value}" is in the past`, "bad_argument");
  }
  return new Date(at).toISOString();
}

export async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("--help") || argv.length === 0) {
    process.stdout.write(`${USAGE}\n`);
    return argv.length === 0 ? 2 : 0;
  }

  const args = parseArgs(argv);
  const workspaceId = args.workspace?.trim() ?? "";
  if (!UUID.test(workspaceId)) {
    throw new MintError(`--workspace "${workspaceId}" is not a uuid`, "bad_argument");
  }

  const { sql, key, keyPrefix } = await mintApiKey({
    workspaceId,
    name: parseName(args.name),
    environment: parseEnvironment(args.env),
    monthlyCreditBudget: parseBudget(args.budget),
    expiresAt: parseExpiry(args.expires),
  });

  process.stderr.write(
    `\n  THE KEY, PRINTED ONCE. The database stores only its SHA-256; there is no recovery.\n\n` +
      `    ${key}\n\n` +
      `  prefix ${keyPrefix}   (this is what api_keys.key_prefix holds, and it is not a secret)\n\n`,
  );
  process.stdout.write(sql);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      process.stderr.write(`mint-api-key: ${error instanceof Error ? error.message : error}\n`);
      process.exit(1);
    });
}
