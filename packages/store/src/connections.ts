/**
 * READING ONE CONNECTION. The other half of the ingest path, and the half that needs no new
 * database object at all.
 *
 * `public.ingest_envelope_rows` took a migration, a role grant and a third `MintedRole` because the
 * WRITE reaches a function in a schema PostgREST cannot see. This read reaches a table in `public`
 * that `authenticated` already holds a `select` grant on, under a policy that already exists:
 * `connections_select` is `to authenticated using (app.can_read_workspace(workspace_id))`, and for
 * a key session `can_read_workspace` opens exactly the workspace the token names. So the isolation
 * here is row-level security doing its job, not this file -- the same property `performance.ts`
 * rests on, and the reason the Worker still holds no service-role key.
 *
 * THE ROW IS WORTH NOTHING WITHOUT THE KEK, WHICH IS THE POINT.
 * `20260908000500_connections.sql` chose envelope encryption over Supabase Vault precisely so that
 * one database compromise is not also a credential compromise: the ciphertext lives here, the key
 * encryption key lives in Cloudflare, and Postgres is never a party to either the plaintext or the
 * DEK. This adapter returns the sealed bytes and cannot open them. `openCredential` in
 * `@repo/connections` can, in the isolate, with a binding this package never sees.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * ONE: IT DOES NOT DECIDE WHETHER THE CONNECTION IS USABLE. `status`, `revoked_at` and
 * `expires_at` are returned verbatim and judged by `connectionHealth` and `openCredential`, which
 * own that question and phrase the refusal in terms a merchant can act on. A second opinion here
 * would be a second place for "is this connection fine?" to be answered, and the two would
 * eventually disagree -- which is the failure `credential_lane` was added to stop one layer down.
 *
 * TWO: IT DOES NOT TELL A CALLER WHY IT FOUND NOTHING. A connection id that does not exist and one
 * that belongs to another workspace are the SAME null. Distinguishing them would turn this into an
 * oracle for which connection ids exist elsewhere, which is a tenancy leak with no upside: the
 * operator holding the ingest secret already knows the pair it typed.
 *
 * THREE: IT LOGS NOTHING. Not the row, not the ciphertext, not a length. Same rule as
 * `callPostgrest`'s: the failure kind travels, the values do not.
 */

import {
  CONNECTION_STATUSES,
  CREDENTIAL_LANES,
  PROVIDER_LANES,
  type ConnectionProvider,
  type ConnectionRow,
} from "@repo/connections";

import { type PostgrestConfig, StoreError, callPostgrest, quote } from "./postgrest.js";
import { mintToken } from "./jwt.js";

/**
 * A connection as the READ path sees it: `ConnectionRow` plus the column the connect path cannot
 * fill in.
 *
 * IT EXTENDS RATHER THAN RESTATES, AND THE FIRST DRAFT DID THE OTHER THING. That draft declared its
 * own fifteen fields with `provider`, `credentialLane` and `status` widened to `string`, on the
 * argument that `@repo/store` should not depend on `@repo/connections` for four string unions -- the
 * same argument `PerformanceQuery` makes for being a structural copy. It was wrong here, and the
 * typecheck said so: `openCredential` takes a `ConnectionRow`, a widened `string` is not one of its
 * unions, and the "structural check in the Worker" that copy was supposed to buy DID NOT EXIST.
 *
 * The copy would have had to be maintained by hand against a file nothing relates it to, which is
 * the arrangement `scripts/check-providers.mjs` exists because of. So the dependency is taken: it is
 * one `import type`, it erases at build time, and `apps/api-edge` -- the only consumer -- already
 * depends on both packages.
 *
 * `timezone` IS HERE AND NOT ON `ConnectionRow` because `ConnectionRow` is the shape the CONNECT
 * path builds and upserts, and connect has nothing to put in it: `probeStore` returns
 * `{storeUrl, totalOrders}` and the WooCommerce API may not expose the site's zone to a consumer
 * key at all. Adding it there would make every `connect` call site name a field it cannot know.
 * Moving it belongs with `scripts/seal-connection.mjs`, which is the thing that will write one.
 */
export interface ConnectionRecord extends ConnectionRow {
  /** Null means NOBODY HAS TOLD US, never UTC. See `20260912000400_connection_timezone.sql`. */
  readonly timezone: string | null;
}

/**
 * The columns this adapter reads, and the reason `select=*` is not one of them.
 *
 * `*` would pull `developer_token_ciphertext`, `developer_token_iv` and
 * `developer_token_wrapped_dek` -- a second sealed credential this path has no use for and
 * therefore no business moving -- along with the quota counters and `created_at`. The narrower
 * reason is the same one `SELECT_COLUMNS` gives: an explicit list turns a renamed column into a
 * PostgREST 400 that names it, where `*` turns it into an `undefined` field three layers later.
 */
/**
 * The providers this build can drive, from `PROVIDER_LANES` rather than written out.
 *
 * A sixth provider added there is accepted here the same day; a list copied into this file would be
 * the drift `check-providers.mjs` already exists to catch one layer down.
 */
const PROVIDERS: readonly ConnectionProvider[] = Object.keys(
  PROVIDER_LANES,
) as ConnectionProvider[];

export const CONNECTION_COLUMNS: readonly string[] = [
  "id",
  "workspace_id",
  "provider",
  "credential_lane",
  "external_account_id",
  "display_name",
  "credential_ciphertext",
  "credential_iv",
  "wrapped_dek",
  "key_version",
  "granted_scopes",
  "expires_at",
  "status",
  "last_error",
  "revoked_at",
  "timezone",
];

export interface ConnectionQuery {
  /** Resolved before this is called, and the ONLY workspace the minted token can read. */
  readonly workspaceId: string;
  readonly connectionId: string;
}

/** The port. One method, for the same reason `PerformanceStore` has one. */
export interface ConnectionStorePort {
  read(query: ConnectionQuery): Promise<ConnectionRecord | null>;
}

/**
 * PostgREST hands back a `bytea` as Postgres's own hex output, NOT as bytes and NOT as base64.
 *
 * The wire value is the string `"\\x4f37a1..."`. `TextEncoder().encode()` on that produces 2N+2
 * bytes of ASCII that are not the ciphertext, and AES-GCM then fails authentication with a message
 * about an operation-specific error -- which sends whoever reads it looking at the KEK, the DEK
 * wrapping, the scope binding, and eventually at everything except the thing that is wrong. It is
 * the single most expensive misreading available on this path, so it is decoded here, once, with
 * the prefix asserted rather than assumed.
 */
export function decodeBytea(value: unknown, column: string): Uint8Array {
  if (typeof value !== "string" || !value.startsWith("\\x")) {
    throw new StoreError(
      `the database returned ${column} in a shape this adapter does not recognise; a bytea must ` +
        "arrive as Postgres hex output. Refusing rather than handing arbitrary bytes to a cipher.",
      "upstream",
      200,
    );
  }
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new StoreError(`the database returned ${column} as malformed hex`, "upstream", 200);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function text(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new StoreError(
      `the database returned no ${column} on a connection row; refusing an incomplete row rather ` +
        "than carrying an empty string into a credential scope.",
      "upstream",
      200,
    );
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Narrow a column to one of a union's members, or refuse.
 *
 * THE COLUMN IS WIDER THAN THE TYPE, IN BOTH DIRECTIONS THAT MATTER. `app.connection_provider`
 * carries nine members and `PROVIDER_LANES` names five: `impact`, `awin`, `cj` and `partnerstack`
 * are rows the database will happily hold and that no connector in this repository can drive.
 * `@repo/connections` already cannot represent one -- `ConnectionRow.provider` is the five-member
 * union -- so the choice here is between refusing at the READ and casting a lie that surfaces as
 * an undefined lookup during a pull, hours later.
 *
 * Refusing at the read wins for the reason it always does in this codebase: the message can name
 * the value and the connection, and nothing downstream has to carry a case it cannot handle.
 * `scripts/check-providers.mjs` is what keeps the five-member list honest against the enum.
 */
function member<T extends string>(value: unknown, allowed: readonly T[], column: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new StoreError(
      `the database returned ${column} = ${JSON.stringify(value)}, which this build does not ` +
        `know. It accepts ${allowed.join(", ")}. Refusing rather than carrying a value nothing ` +
        "downstream can act on into a pull.",
      "upstream",
      200,
    );
  }
  return value as T;
}

/**
 * One row to a record, refusing anything the shape does not account for.
 *
 * Exported for the tests, which assert the mapping rather than a round trip -- a round trip over a
 * real PostgREST would pass on a mapper that dropped a column the fixture never set. Same posture,
 * and the same reason, as `toIngestRow`.
 */
export function toConnectionRecord(row: unknown): ConnectionRecord {
  const r = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;

  // THE SCOPE IS AES-GCM ADDITIONAL DATA, which is why these two are `text()` and not
  // `nullableText()`. `open()` binds the ciphertext to `{workspaceId, connectionId}`; a null or an
  // empty string there does not fail loudly, it produces a DIFFERENT scope that simply does not
  // authenticate -- the same unreadable error as a wrong KEK, from a row that was merely incomplete.
  const id = text(r.id, "id");
  const workspaceId = text(r.workspace_id, "workspace_id");

  const keyVersion = r.key_version;
  if (typeof keyVersion !== "number" || !Number.isInteger(keyVersion)) {
    throw new StoreError(
      "the database returned a connection with no integer key_version; the KEK generation a " +
        "credential was wrapped under is not a value to guess.",
      "upstream",
      200,
    );
  }

  return {
    id,
    workspaceId,
    provider: member(r.provider, PROVIDERS, "provider"),
    credentialLane: member(r.credential_lane, CREDENTIAL_LANES, "credential_lane"),
    externalAccountId: text(r.external_account_id, "external_account_id"),
    displayName: nullableText(r.display_name),
    credentialCiphertext: decodeBytea(r.credential_ciphertext, "credential_ciphertext"),
    credentialIv: decodeBytea(r.credential_iv, "credential_iv"),
    wrappedDek: decodeBytea(r.wrapped_dek, "wrapped_dek"),
    keyVersion,
    grantedScopes: Array.isArray(r.granted_scopes)
      ? r.granted_scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    expiresAt: nullableText(r.expires_at),
    // Returned verbatim, not judged: `connectionHealth` and `openCredential` own "is this usable?".
    status: member(r.status, CONNECTION_STATUSES, "status"),
    lastError: nullableText(r.last_error),
    revokedAt: nullableText(r.revoked_at),
    timezone: nullableText(r.timezone),
  };
}

export function createConnectionStore(config: PostgrestConfig): ConnectionStorePort {
  return {
    async read(query: ConnectionQuery): Promise<ConnectionRecord | null> {
      const params = new URLSearchParams();
      params.set("select", CONNECTION_COLUMNS.join(","));
      params.set("id", `eq.${quote(query.connectionId)}`);
      // REDUNDANT WITH ROW-LEVEL SECURITY AND SENT ANYWAY. The token's claim already narrows this
      // to one workspace, so the filter can only ever narrow further -- but a mismatched
      // (workspace, connection) pair then answers "nothing" through the QUERY as well as through
      // the policy, and an operator who typed the wrong pair gets the same null either way.
      params.set("workspace_id", `eq.${quote(query.workspaceId)}`);
      // Two, not one. `id` is the primary key so a second row is impossible -- which is exactly
      // what makes the check worth making: the only way to get one is for a filter to have been
      // dropped, and a dropped filter must not return an arbitrary tenant's connection as "the"
      // connection. Same argument as the `limit + 1` count check on the read path.
      params.set("limit", "2");

      const token = await mintToken({
        secret: config.jwtSecret,
        role: "authenticated",
        workspaceId: query.workspaceId,
        now: (config.now ?? (() => new Date()))(),
      });

      const body = await callPostgrest(config, {
        path: `/rest/v1/connections?${params.toString()}`,
        token,
      });

      if (!Array.isArray(body)) {
        throw new StoreError(
          "the database answered a connection read with something other than a list",
          "upstream",
          200,
        );
      }
      if (body.length > 1) {
        throw new StoreError(
          "the database returned more than one connection for a primary-key lookup; refusing to " +
            "pick one, because the only way this happens is a filter that did not arrive.",
          "upstream",
          200,
        );
      }
      // NOT AN ERROR. A connection that does not exist and one belonging to another workspace are
      // the same answer on purpose; see the module note.
      if (body.length === 0) return null;

      return toConnectionRecord(body[0]);
    },
  };
}
