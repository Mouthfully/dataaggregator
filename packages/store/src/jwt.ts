/**
 * THE MINTED TOKEN. HS256, by hand, because workerd already ships everything it takes.
 *
 * `20260908000800_api_key_verification.sql` decided the shape: the Worker holds NO service-role key.
 * It verifies a presented API key through one narrow SECURITY DEFINER function, then mints a
 * short-lived token carrying the verified workspace, and every subsequent query goes through
 * row-level security as an ordinary `authenticated` session. A service-role key would bypass the
 * policies entirely -- and with them every tenant-isolation guarantee the product sells.
 *
 * THREE CLAIMS, AND THE ABSENCES MATTER MORE THAN THE PRESENCES.
 *
 *   `role`          PostgREST issues `SET LOCAL ROLE <role>` from it. This is the whole privilege.
 *   `workspace_id`  read by `app.api_key_workspace_id()`, and the ENTIRE authority of a key session:
 *                   `app.can_read_workspace()` opens exactly the workspace this names.
 *   `exp`           one minute. See TOKEN_TTL_SECONDS.
 *
 * NO `sub`, EVER. `app.current_user_id()` must resolve to NULL for a key session, because
 * `app.can_write_workspace()` refuses outright when it does not -- that is what stops a stolen API
 * key inviting a member or re-pointing a connection at an attacker's ad account. A `sub` claim here
 * would be a fabricated human identity, and it would quietly turn a read credential into a write
 * one. A test asserts the claim set exactly, not merely that `workspace_id` is present.
 *
 * NO `aud`. The project's own publishable key carries none, so audience validation cannot be
 * enabled without breaking the key Supabase itself hands out. A claim nobody checks is a claim that
 * can be wrong; the minimal set is the one with the fewest ways to be wrong.
 */

const encoder = new TextEncoder();

/**
 * How long a minted token lives. "About a minute", per the migration that decided the flow.
 *
 * The number is the mitigation, not a tuning knob. It bounds the window in which a leaked token is
 * worth anything, and it is affordable precisely because the token is minted per request rather
 * than cached: nothing here is waiting on an expiry.
 */
export const TOKEN_TTL_SECONDS = 60;

/**
 * The roles this Worker asks PostgREST for.
 *
 * This was two, with a comment reading "anything wider is a different design". `app_ingest` IS that
 * different design, taken deliberately rather than by widening a union in passing:
 *
 *   anon           reads nothing. Used for `verify_api_key`, which is gated on the key hash.
 *   authenticated  reads ONE workspace's rows, narrowed by row-level security on every query.
 *   app_ingest     WRITES derived platform data, and is narrowed by nothing at all.
 *
 * The third is categorically unlike the first two, and the cost is worth stating where it is felt:
 * it makes SUPABASE_JWT_SECRET a WRITE credential rather than only a read one. Anything that can
 * mint a token can now reach `public.ingest_envelope_rows`. That function is executable by no other
 * role -- `supabase/tests/07_anon_grants.sql` fails if anon or authenticated ever gain it, and
 * `10_ingest_entry_point.sql` calls it as a tenant and asserts the refusal -- so the secret is the
 * whole boundary. A direct connection through Hyperdrive is what would replace it, and remains the
 * deferred decision `apps/api-edge/src/index.ts` already names for the webhook drain.
 *
 * A token minted for `app_ingest` carries NO `workspace_id` claim. The workspace is an argument to
 * the function, which reaches the table through a `security definer` that does not consult RLS, so
 * a claim here would be decoration that reads like a constraint.
 *
 * `app_scheduler` IS THE FOURTH, and it is the second time this union has been widened
 * deliberately rather than in passing. What it may do is exactly three functions, and the list is
 * the whole privilege:
 *
 *   MAY   call `public.due_connections` -- the work list, across every tenant. SCHEDULING METADATA
 *         ONLY: connection id, workspace id, organisation id, provider, last backfill, restatement
 *         window. Nothing that could be used to authenticate as anyone.
 *   MAY   call `public.claim_connection` and `public.record_backfill` -- take and close the
 *         fifteen-minute lease that stops two instances spending a shared platform quota twice.
 *   MAY NOT read `connections`, `api_keys`, `members` or `organisations`, or any other table in
 *         `public`. It holds no table grant at all, which `supabase/tests/02_scheduler.sql` proves
 *         by executing the reads and asserting the refusals.
 *   MAY NOT reach a credential. Not the ciphertext, not the IV, not the wrapped DEK, not even the
 *         external account id. Enumeration and access are deliberately different privileges
 *         (`20260908001000_scheduler.sql`), so a compromised scheduler learns which tenants exist
 *         and when each was last pulled -- and not one credential. The credential is fetched
 *         separately by `connections.ts`, as `authenticated`, under row-level security, for one
 *         workspace it already knows it is acting for.
 *   MAY NOT supply a clock. The three `app.` functions take `p_now` so the SQL suite can drive a
 *         fixed timeline; the `public.` wrappers take none, because a caller-supplied future clock
 *         makes every live lease look abandoned and the lease is the only thing standing between
 *         two cron ticks and a double-spent quota.
 *
 * THE COST, WHICH IS LARGER THAN `app_ingest`'S AND IS STATED WHERE IT IS FELT. That role made
 * `SUPABASE_JWT_SECRET` a write credential. This one makes it a CROSS-TENANT ENUMERATION
 * credential: anything that can mint a token can now ask which connections exist across every
 * workspace on the platform. That is the question row-level security exists to make unaskable, and
 * the only reason it is acceptable is the shape of the answer -- workspace ids and timestamps, no
 * credential material, which `supabase/tests/13_scheduler_entry_point.sql` asserts as an exact
 * column set rather than as an absence of three known-bad names. Hyperdrive is what would replace
 * the secret with a connection, and it remains the deferred decision.
 *
 * A SCHEDULER TOKEN CARRIES NO `workspace_id`, AND FOR A STRONGER REASON THAN THE INGEST ONE. For
 * `app_ingest` the claim would be inert decoration. Here it would be actively false: the
 * scheduler's entire purpose is the one question that spans tenants, so a token that appeared to
 * name a single workspace would describe a per-tenant scheduler that does not exist and cannot be
 * built out of these three functions. `mintToken` refuses it below rather than dropping it,
 * because a silently ignored claim is how a reader comes to believe in a narrowing that was never
 * there.
 */
export type MintedRole = "anon" | "authenticated" | "app_ingest" | "app_scheduler";

/**
 * The roles whose authority comes from a GRANT rather than from a workspace claim.
 *
 * Both reach their tables through `security definer` functions that never consult row-level
 * security, so nothing anywhere reads a `workspace_id` claim on one of these tokens. Listing them
 * turns the two module comments that already said so into something that fails.
 */
const SYSTEM_ROLES: readonly MintedRole[] = ["app_ingest", "app_scheduler"];

export interface CryptoLike {
  subtle: Pick<SubtleCrypto, "importKey" | "sign" | "digest">;
}

/**
 * base64url, and not base64: the value travels in a URL-safe token where `+`, `/` and `=` all have
 * other meanings. Same implementation and same reason as `@repo/oauth`'s.
 */
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlJson(value: unknown): string {
  return base64url(encoder.encode(JSON.stringify(value)));
}

/** Lowercase hex. Postgres reads `\x…` as a bytea literal; see `hashApiKey`. */
export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 of the presented key, as a Postgres bytea literal.
 *
 * `verify_api_key` takes a HASH and never a plaintext key, so the credential itself never reaches
 * the database, never reaches its query log and never reaches a backup. The `\x` prefix is
 * Postgres's hex input format for `bytea`; the function's own length check rejects anything that is
 * not 32 bytes, which is what makes a malformed value a refusal rather than a table probe.
 */
export async function hashApiKey(key: string, crypto: CryptoLike): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return `\\x${toHex(digest)}`;
}

/**
 * Mint one token.
 *
 * `now` is a parameter rather than a call to the clock so a test can assert `iat` and `exp`
 * exactly. A TTL measured against an untestable clock is a TTL nobody has checked.
 */
export async function mintToken(options: {
  secret: string;
  role: MintedRole;
  workspaceId?: string;
  now: Date;
  ttlSeconds?: number;
  crypto?: CryptoLike;
}): Promise<string> {
  if (options.secret.length === 0) {
    // Refused rather than signed with nothing: an HMAC over an empty key produces a perfectly
    // well-formed token that every deployment sharing the mistake would accept from every other.
    throw new Error("store: refusing to mint a token with an empty signing secret");
  }

  if (options.workspaceId !== undefined && SYSTEM_ROLES.includes(options.role)) {
    // REFUSED, NOT DROPPED. A system role's authority is its grant; nothing reads a workspace claim
    // on one of these tokens, so silently ignoring it would mint a credential that LOOKS narrowed
    // to one tenant and is not. For `app_scheduler` that reading is not merely optimistic, it is
    // backwards: the role exists to ask the one question that spans every tenant.
    throw new Error(
      `store: refusing to mint a ${options.role} token carrying a workspace_id claim. This role's ` +
        "authority is its grant, not a claim -- nothing reads one here, so the claim would read " +
        "as a narrowing that does not exist.",
    );
  }

  const issuedAt = Math.floor(options.now.getTime() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: options.role,
    ...(options.workspaceId === undefined ? {} : { workspace_id: options.workspaceId }),
    iat: issuedAt,
    exp: issuedAt + (options.ttlSeconds ?? TOKEN_TTL_SECONDS),
  };

  const signingInput = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const subtle = (options.crypto ?? crypto).subtle;
  const key = await subtle.importKey(
    "raw",
    encoder.encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key as CryptoKey, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
