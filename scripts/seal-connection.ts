/**
 * SEAL A WOOCOMMERCE CREDENTIAL AND PRINT THE ROW THAT HOLDS IT.
 *
 * Step 5 of docs/marketplane/MVP-PLAN.md section 5. It is the last thing between the ingest runtime
 * and a real row in `envelope_rows`: `POST /v1/ingest/run` reads a connection, and nothing in this
 * repository has ever written one.
 *
 * A SCRIPT AND NOT A UI, DELIBERATELY. The `connections_insert` policy requires a non-null
 * `app.current_user_id()`, and there is no login anywhere yet. An operator runs the printed SQL in
 * the Supabase SQL editor, which connects as a role RLS does not apply to.
 *
 * WHAT THIS OWNS AND WHAT IT DOES NOT
 *
 * It owns no cryptography. `seal` comes from `@repo/vault`, the store URL is normalised by
 * `normaliseStoreUrl` and the header built by `basicAuthHeader`, both from the connector unit that
 * the scheduled read uses. A second implementation of any of those would agree with the first right
 * up until it did not, and the symptom would be a credential that seals successfully and cannot be
 * opened -- discovered hours later, by a backfill, with nothing pointing at the cause.
 *
 * `apps/api-edge/test/seal-connection.test.ts` closes the loop the other way: it seals through this
 * file and opens through `openCredential`, the function the Worker actually calls. That test is the
 * reason this file may build the credential JSON at all.
 */

import { randomUUID, webcrypto } from "node:crypto";

import {
  assertWooTimezone,
  basicAuthHeader,
  normaliseStoreUrl,
  WOO_API_PATH,
} from "@repo/connectors";
import type { StoredCredential } from "@repo/connections";
import { kekFromBase64, seal } from "@repo/vault";

/** The provider this seals for. One, because one source has a `backfill.ts`. */
export const PROVIDER = "woocommerce" as const;

/** `connections.key_version` for a first seal. `rewrap` is what moves it. */
export const KEY_VERSION = 1;

export type SealRefusal =
  | "bad_argument"
  | "missing_argument"
  | "secret_on_argv"
  | "bad_kek"
  | "probe_unauthorised"
  | "probe_not_woocommerce"
  | "probe_failed";

export class SealError extends Error {
  readonly refusal: SealRefusal;
  constructor(message: string, refusal: SealRefusal) {
    super(message);
    this.name = "SealError";
    this.refusal = refusal;
  }
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The two things about a timezone this script can check WITHOUT the database, and nothing more.
 *
 * `assertWooTimezone` asks only whether a zone is REAL, and says so: the canonical-form rule "lives
 * on the column instead ... because that is where the value is stored and where a hand-written row
 * would otherwise slip past". The row this script emits IS that hand-written row, and
 * `--timezone asia/bangkok` proved it -- ICU resolves zone names case-insensitively, so it sealed
 * happily and the trigger in 20260912000400_connection_timezone.sql would have rejected the INSERT.
 *
 * THE COLUMN'S FULL RULE CANNOT BE REPRODUCED HERE, and pretending otherwise is worse than not
 * trying. The trigger asks whether the string is an entry in `pg_timezone_names`; this process has
 * ICU, and the two disagree in both directions. On the Node build this was written against,
 * `Intl.supportedValuesOf("timeZone")` returns 418 names that INCLUDE `Asia/Calcutta` and EXCLUDE
 * `Asia/Kolkata` and `America/Argentina/Buenos_Aires` -- both of which Postgres accepts and a real
 * merchant would type. A check built on that list would refuse legitimate stores. So this checks
 * the two things ICU can actually answer for, and defers the rest to the trigger, which is the
 * authority because it is what the value must satisfy to be stored.
 */
export function assertStorableTimezone(timezone: string): void {
  // 1. SHAPE. This is not an approximation of the trigger's rule -- it is the same rule, which
  //    refuses any name that is neither `UTC` nor an `Area/Location` pair. It is what rejects
  //    `EST5EDT`, `localtime` and `posixrules`, none of which name a place.
  if (timezone !== "UTC" && timezone.toUpperCase() === "UTC") {
    throw new SealError(`--timezone "${timezone}" must be spelled "UTC".`, "bad_argument");
  }
  if (timezone !== "UTC" && !timezone.includes("/")) {
    throw new SealError(
      `--timezone "${timezone}" is not an Area/Location zone name. The connections table takes ` +
        `a canonical IANA name such as "Asia/Bangkok", or "UTC".`,
      "bad_argument",
    );
  }

  // 2. CASE. `pg_timezone_names` is case-sensitive and ICU is not, which is the one discrepancy
  //    that bites silently. If ICU resolves this to the same letters in a different case, the
  //    operator has a typo and the correct spelling is known, so name it.
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone;
  } catch {
    return; // assertWooTimezone already refused anything ICU cannot resolve, with a better sentence.
  }
  if (resolved !== timezone && resolved.toLowerCase() === timezone.toLowerCase()) {
    throw new SealError(
      `--timezone "${timezone}" is not the canonical spelling. Use "${resolved}".`,
      "bad_argument",
    );
  }
  // A resolution that differs by more than case is an ALIAS, not a typo -- ICU maps `Asia/Kolkata`
  // to `Asia/Calcutta` and `America/Argentina/Buenos_Aires` to `America/Buenos_Aires`. Postgres
  // holds both spellings, so refusing the one the operator typed would be this script inventing a
  // rule the database does not have.
}

/**
 * Postgres `bytea` in hex form, which is what PostgREST returns and what the SQL editor accepts.
 *
 * NOT base64. `packages/store/src/connections.ts` refuses any value without the `\\x` prefix rather
 * than guessing, and this is the other end of that agreement.
 */
export function toByteaLiteral(bytes: Uint8Array): string {
  let out = "\\x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Single-quoted SQL string. Refuses rather than escapes anything that has no business here. */
export function sqlString(value: string, field: string): string {
  // A newline or a quote in one of these fields is not an escaping problem to solve, it is a sign
  // the operator pasted the wrong thing -- a whole curl command, or a multi-line key block.
  if (/[\r\n\0]/.test(value)) {
    throw new SealError(`${field} contains a line break; paste the value alone`, "bad_argument");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A credential fingerprint an operator can match against their admin screen, that is not the
 * credential. WooCommerce shows the consumer key in full and the secret only once, so the key's
 * head is recognisable and the secret's must never be printed at all.
 */
export async function fingerprint(secret: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SealInput {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly storeUrl: string;
  readonly timezone: string;
  /**
   * RFC3339. Where the incremental walk starts, written to `connections.ingest_checkpoint`.
   *
   * REQUIRED, AND THE LOOP IT CLOSES IS WHY. The nightly sweep resumes from this column and
   * `apps/api-edge/src/scheduled-ingest.ts` refuses a connection whose checkpoint is null rather
   * than inventing a first window. Nothing else writes the column on a new row -- `record_backfill`
   * only ever ADVANCES one that exists -- so a connection sealed without it is skipped every night,
   * forever, reporting `awaiting_first_run` and never pulling a row. That is a closed loop, it
   * shipped, and this argument is what opens it.
   *
   * NO DEFAULT, for the reason `52-ingest-runtime.md` section 4 gives about a watermark walk: too
   * short opens a silent hole, too long spends the merchant's store on history it already has, and
   * nobody learns which happened. The operator sealing the connection is the one person in the
   * system who can answer it, so they are asked.
   */
  readonly since: string;
  readonly key: string;
  readonly secret: string;
  readonly displayName: string | null;
  readonly kek: Uint8Array;
}

/**
 * The credential as the Worker will read it back.
 *
 * Typed as `StoredCredential` on purpose: the discriminant and the field names are the contract
 * `openCredential` parses, and the compiler is what holds this file to it.
 */
export function buildCredential(key: string, secret: string): StoredCredential {
  return { kind: "key_secret", key, secret };
}

/**
 * Ask the store whether this credential can read orders, BEFORE anything is sealed.
 *
 * One page of one order, which is the cheapest request that exercises the exact permission the
 * backfill needs. A credential with `read` on products and nothing on orders authenticates fine and
 * fails on the first scheduled pull; so does a key pasted with a trailing space. The whole reason
 * this script is not three lines is that a sealed bad credential is indistinguishable from a sealed
 * good one until a backfill runs.
 */
export async function probe(
  storeUrl: string,
  credential: { key: string; secret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ orders: number }> {
  const url = `${storeUrl}${WOO_API_PATH}/orders?per_page=1`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: basicAuthHeader(credential), Accept: "application/json" },
    });
  } catch {
    // The cause is deliberately dropped rather than wrapped: a DNS or TLS error message names the
    // host and sometimes the proxy, and this sentence is about reachability, not about plumbing.
    throw new SealError(
      `${storeUrl} could not be reached. Check the address and that the store is public.`,
      "probe_failed",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new SealError(
      `the store answered ${response.status}. The consumer key and secret are wrong, or the key ` +
        "does not have Read permission on orders. WooCommerce shows the secret once, at creation.",
      "probe_unauthorised",
    );
  }
  if (response.status === 404) {
    throw new SealError(
      `${storeUrl}${WOO_API_PATH} returned 404. The REST API is disabled, or this is not a ` +
        "WooCommerce store. Enable it under WooCommerce > Settings > Advanced > REST API.",
      "probe_not_woocommerce",
    );
  }
  if (!response.ok) {
    throw new SealError(
      `the store answered ${response.status} to a one-order read. Nothing was sealed.`,
      "probe_failed",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    throw new SealError(
      `${url} returned a body that is not a JSON array. A proxy or a security plugin is probably ` +
        "answering in front of WooCommerce.",
      "probe_not_woocommerce",
    );
  }
  return { orders: body.length };
}

/**
 * Seal, and render the INSERT.
 *
 * THE `id` IS WRITTEN EXPLICITLY AND THAT IS LOAD-BEARING. `seal` binds the ciphertext to
 * `{workspaceId, connectionId}` as AES-GCM additional authenticated data, so the row's primary key
 * is part of what the tag covers. Dropping the `id` column and letting `gen_random_uuid()` fill it
 * produces a row that inserts cleanly and whose credential can never be opened by anyone, with the
 * KEK, forever. The emitted SQL says so in a comment, because the column looks redundant.
 */
export async function sealConnection(
  input: SealInput,
  crypto: typeof webcrypto = webcrypto,
): Promise<{ sql: string; connectionId: string }> {
  const sealed = await seal(crypto as never, {
    plaintext: JSON.stringify(buildCredential(input.key, input.secret)),
    kek: input.kek,
    keyVersion: KEY_VERSION,
    scope: { workspaceId: input.workspaceId, connectionId: input.connectionId },
  });

  const sql = `-- One WooCommerce connection, sealed ${new Date().toISOString()}.
--
-- Run this as the project owner in the Supabase SQL editor. It will NOT work through PostgREST:
-- the connections_insert policy requires a non-null app.current_user_id(), and no API credential
-- in this system carries one.
--
-- DO NOT REMOVE THE id COLUMN. The credential is bound to this exact uuid as AES-GCM additional
-- authenticated data. A row that lets gen_random_uuid() choose instead inserts without complaint
-- and can never be decrypted again.
insert into public.connections (
  id, workspace_id, provider, credential_lane, external_account_id, display_name,
  credential_ciphertext, credential_iv, wrapped_dek, key_version,
  granted_scopes, expires_at, timezone, ingest_checkpoint, status
) values (
  ${sqlString(input.connectionId, "connection id")},
  ${sqlString(input.workspaceId, "workspace id")},
  '${PROVIDER}',
  'key_secret',
  ${sqlString(input.storeUrl, "store url")},
  ${input.displayName === null ? "null" : sqlString(input.displayName, "display name")},
  ${sqlString(toByteaLiteral(sealed.ciphertext), "ciphertext")}::bytea,
  ${sqlString(toByteaLiteral(sealed.iv), "iv")}::bytea,
  ${sqlString(toByteaLiteral(sealed.wrappedDek), "wrapped dek")}::bytea,
  ${sealed.keyVersion},
  -- Empty, not invented: WooCommerce reports no grant. expires_at null MEANS no expiry.
  '{}',
  null,
  -- Required by POST /v1/ingest/run, and IMMUTABLE once set (20260912000500). The day an order
  -- belongs to is computed in this zone; UTC would move every evening order to the previous day.
  ${sqlString(input.timezone, "timezone")},
  -- WHERE THE NIGHTLY WALK STARTS. The sweep refuses a connection whose checkpoint is null rather
  -- than guessing a first window, and nothing else writes this column on a new row, so a row
  -- inserted without it is one the scheduler skips every night forever.
  ${sqlString(input.since, "since")}::timestamptz,
  'active'
);
`;

  return { sql, connectionId: input.connectionId };
}

// -------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------

const USAGE = `Usage:
  CREDENTIAL_KEK=<base64>  WOO_CONSUMER_KEY=ck_...  WOO_CONSUMER_SECRET=cs_... \\
  pnpm exec tsx scripts/seal-connection.ts \\
    --workspace <uuid> --store https://shop.example --timezone Asia/Bangkok \\
    --since 2026-09-01T00:00:00Z [--name "Shop"] [--connection-id <uuid>]

--since is where the nightly walk starts, and it has no default on purpose. Too short opens a
silent hole; too long spends the merchant's store on history it already has. Pick a window the
first night's walk can finish.

The key and secret are read from the ENVIRONMENT, never from arguments: everything on argv is
visible to every process on the machine through ps, and lands in shell history.`;

export function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    // `noUncheckedIndexedAccess` is on and this genuinely can be undefined -- process.argv holds
    // strings, but parseArgs is called from tests with arbitrary arrays. Refusing is the honest
    // narrowing; `argv[i] as string` would move the failure to a stack trace.
    if (token === undefined) {
      throw new SealError(`argument ${i + 1} is empty`, "bad_argument");
    }
    if (!token.startsWith("--")) {
      throw new SealError(`unexpected argument "${token}"`, "bad_argument");
    }
    const name = token.slice(2);
    if (name === "key" || name === "secret") {
      throw new SealError(
        `--${name} is refused. Pass WOO_CONSUMER_${name.toUpperCase()} in the environment instead: ` +
          "an argument is visible in ps to every user on the machine and is written to shell history.",
        "secret_on_argv",
      );
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new SealError(`--${name} needs a value`, "missing_argument");
    }
    out[name] = value;
    i += 1;
  }
  return out;
}

function required(args: Record<string, string>, name: string): string {
  const value = args[name];
  if (value === undefined || value.trim() === "") {
    throw new SealError(`--${name} is required`, "missing_argument");
  }
  return value.trim();
}

function fromEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new SealError(`${name} is not set in the environment`, "missing_argument");
  }
  return value.trim();
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  if (argv.includes("--help") || argv.length === 0) {
    process.stdout.write(`${USAGE}\n`);
    return argv.length === 0 ? 2 : 0;
  }

  const args = parseArgs(argv);

  const workspaceId = required(args, "workspace");
  if (!UUID.test(workspaceId)) {
    throw new SealError(`--workspace "${workspaceId}" is not a uuid`, "bad_argument");
  }
  const connectionId = args["connection-id"]?.trim() ?? randomUUID();
  if (!UUID.test(connectionId)) {
    throw new SealError(`--connection-id "${connectionId}" is not a uuid`, "bad_argument");
  }

  // Each of these refuses on its own terms, and each refusal is the connector's, not a copy of it.
  const storeUrl = normaliseStoreUrl(required(args, "store"));
  const timezone = required(args, "timezone");
  // Two checks, and they are not redundant: the first is the connector's (is the zone real, the
  // same question the backfill asks), the second is the column's (is it spelled the way the row
  // must hold it). Either alone lets a row through that the other end refuses.
  assertWooTimezone(timezone);
  assertStorableTimezone(timezone);

  // REFUSED HERE RATHER THAN AT THE DATABASE. A malformed timestamp would insert as an error the
  // operator reads as a SQL problem; this one names the argument and says what it is for.
  const since = required(args, "since");
  if (Number.isNaN(Date.parse(since))) {
    throw new SealError(
      `--since "${since}" is not an RFC3339 timestamp. It is where the nightly walk starts.`,
      "bad_argument",
    );
  }
  if (Date.parse(since) > Date.now()) {
    // A checkpoint in the future claims a window that was never read, and the first walk would
    // start past rows nobody pulled. `app.record_backfill` makes the same refusal one layer down.
    throw new SealError(
      `--since "${since}" is in the future. The walk would start past rows nobody has read.`,
      "bad_argument",
    );
  }

  const kek = kekFromBase64(fromEnv(env, "CREDENTIAL_KEK"));
  const key = fromEnv(env, "WOO_CONSUMER_KEY");
  const secret = fromEnv(env, "WOO_CONSUMER_SECRET");

  process.stderr.write(`probing ${storeUrl}${WOO_API_PATH}/orders ...\n`);
  const { orders } = await probe(storeUrl, { key, secret });
  process.stderr.write(
    `  ok: the credential can read orders (${orders} returned from a one-order page)\n`,
  );

  const { sql } = await sealConnection({
    workspaceId,
    connectionId,
    storeUrl,
    timezone,
    since,
    key,
    secret,
    displayName: args.name?.trim() ?? null,
    kek,
  });

  // Counts and identifiers on stderr, the artefact on stdout, so `> row.sql` captures exactly the
  // SQL. The secret is never written to either.
  process.stderr.write(
    `  connection ${connectionId}\n` +
      `  key ${key.slice(0, 9)}... secret sha256:${await fingerprint(secret)}\n` +
      `  timezone ${timezone}\n\n`,
  );
  process.stdout.write(sql);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main(process.argv.slice(2), process.env)
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      if (error instanceof SealError) {
        process.stderr.write(`seal-connection: ${error.message}\n`);
        process.exit(1);
      }
      // A connector refusal (WooClientError) arrives here with its own sentence already written.
      process.stderr.write(`seal-connection: ${error instanceof Error ? error.message : error}\n`);
      process.exit(1);
    });
}
