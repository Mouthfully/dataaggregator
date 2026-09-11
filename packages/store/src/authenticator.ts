/**
 * RESOLVING A BEARER CREDENTIAL TO EXACTLY ONE WORKSPACE.
 *
 * Without this the store is unreachable, because the workspace is not a parameter -- it comes from
 * the credential, and `performance.ts` says why: accepting it from the caller would make
 * cross-tenant access a matter of typing a different id, with row-level security as the only thing
 * in the way. So the read path is credential -> workspace -> rows, and the first arrow is here.
 *
 * THE CHICKEN AND EGG, AND THE ONE PRIVILEGED SURFACE THAT SOLVES IT. To find the key row you must
 * read a table, and to read a table you must already be authorised.
 * `20260908000800_api_key_verification.sql` refuses the usual shortcut -- hand the edge a
 * service-role key -- and puts a single SECURITY DEFINER function in its place: it takes a HASH
 * rather than a key, returns only what the edge needs, never the hash, and is the sole
 * anon-executable function in the schema.
 *
 * SO THE VERIFICATION CALL RUNS AS `anon`, ON PURPOSE. It happens before any identity exists, so it
 * runs as the role that can do precisely one thing and reach no row at all:
 * `20260911000100_anon_has_nothing.sql` left `anon` with no grant on any table in `public` and
 * changed the default so a future table cannot arrive with one. Minting `authenticated` for this
 * call would work identically and would hand the pre-identity request a role that holds table
 * grants, for no gain.
 *
 * MISSING AND INVALID ARE DIFFERENT ANSWERS, and the handler prints different messages for them. A
 * caller with no header, a blank header or a scheme that is not Bearer has a FORMAT problem and is
 * told the format. A caller whose Bearer token the database declines has a CREDENTIAL problem and is
 * told nothing else -- not whether the key is unknown, revoked, expired, or bound to a deleted
 * workspace, all of which `verify_api_key` collapses into one null on purpose.
 */

import { hashApiKey, mintToken } from "./jwt.js";
import { type PostgrestConfig, StoreError, callPostgrest } from "./postgrest.js";

export interface AuthenticatorPort {
  authenticate(
    authorization: string | null,
  ): Promise<{ workspaceId: string } | { error: "missing" | "invalid" }>;
}

const BEARER = /^bearer[ \t]+(.+)$/i;

export function createApiKeyAuthenticator(config: PostgrestConfig): AuthenticatorPort {
  return {
    async authenticate(authorization: string | null) {
      const presented = authorization === null ? null : BEARER.exec(authorization.trim());
      const key = presented?.[1]?.trim();
      if (key === undefined || key === "") return { error: "missing" as const };

      const token = await mintToken({
        secret: config.jwtSecret,
        role: "anon",
        now: (config.now ?? (() => new Date()))(),
      });

      const result = await callPostgrest(config, {
        path: "/rest/v1/rpc/verify_api_key",
        method: "POST",
        token,
        // The HASH travels, never the key. The plaintext credential exists in this isolate and
        // nowhere else: not in a URL, not in a header beyond the one it arrived in, not in the
        // database's query log, not in a backup.
        body: { p_key_hash: await hashApiKey(key, crypto) },
      });

      // A composite that resolved to nothing. `verify_api_key` returns null for an unknown key, a
      // revoked one, an expired one, and one whose workspace or organisation is soft-deleted -- one
      // answer for four situations, so the endpoint cannot be used to tell them apart.
      if (result === null) return { error: "invalid" as const };

      if (typeof result !== "object" || Array.isArray(result)) {
        // NOT treated as "invalid", and the distinction matters. `app.api_key_context` is declared
        // in `app`, which `config.toml` does not expose to PostgREST, so it is possible for a
        // deployment to return the composite as an unexpanded record literal instead of an object.
        // Reading that as a rejected credential would answer 401 to every caller holding a perfectly
        // good key, and the deployment fault would look like a customer fault for as long as it took
        // somebody to doubt the error message.
        throw new StoreError(
          "verify_api_key answered with a shape this adapter does not recognise; refusing to read " +
            "it as a rejected credential",
          "upstream",
          200,
        );
      }

      const workspaceId = (result as Record<string, unknown>).workspace_id;
      if (typeof workspaceId !== "string" || workspaceId === "") {
        // The composite came back with every field null, which PL/pgSQL's `return null` can also
        // present as. Same meaning as a null result.
        return { error: "invalid" as const };
      }

      // ONLY THE WORKSPACE LEAVES THIS FUNCTION. `allowed_tools` and `credits_remaining` are in the
      // result and are deliberately dropped: enforcing them is §15's spend-budget and tool
      // allow-list work, which `16-performance-endpoint.md` §4 already carries as owed, and
      // returning them here would put the beginnings of a budget decision in a type whose whole
      // value is that it can express nothing but one workspace.
      return { workspaceId };
    },
  };
}
