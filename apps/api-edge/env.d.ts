/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * The Worker's bindings, declared ONCE, here.
 *
 * A NOTE ON WHY THIS FILE CHANGED SHAPE. It previously said:
 *
 *   declare module "cloudflare:test" { interface ProvidedEnv extends Env {} }
 *
 * That augmentation was a NO-OP, and nothing noticed because no test had touched a binding: the
 * only assertion was `expect(env).toBeDefined()`, which passes against `{}`. The pool declares
 * `export const env: Cloudflare.Env` -- so `env` in a test resolves to the GLOBAL `Cloudflare.Env`
 * interface, not to the `Env` this app exported from `src/index.ts`. Two interfaces named the same
 * thing, one of them empty, and the empty one is the one the tests saw.
 *
 * `Cloudflare.Env` is the documented extension point (`@cloudflare/workers-types`: "the specific
 * project can extend `Env` by redeclaring it in project-specific files"), and it is what
 * `wrangler types` generates. Declaring the bindings there makes ONE declaration serve the Worker
 * and the test environment, so a binding added to `wrangler.jsonc` and forgotten here is a
 * typecheck failure rather than a silent `undefined` at runtime.
 */
declare namespace Cloudflare {
  interface Env {
    readonly ENVIRONMENT?: string;
    /**
     * Verbatim raw platform payloads, one deterministically keyed object per
     * `(workspace, source, account, date, window, fetched_at)`.
     *
     * See `@repo/payloads` and `docs/marketplane/17-payload-store.md`. The binding exists in this
     * app because the 128 MB-isolate guarantee can only be demonstrated against a real R2.
     */
    readonly PAYLOADS: R2Bucket;

    /**
     * The key every webhook signing secret is derived from (`@repo/webhooks`, spec 11A.16).
     *
     * OPTIONAL IN THE TYPE, AND REQUIRED IN PRACTICE. It is a Worker secret rather than a var, so
     * it is absent in local development and in every test, and a required type would force each of
     * those to invent one. `handleScheduled` refuses to claim events when it is missing, which is
     * where the real requirement is enforced.
     */
    readonly WEBHOOK_SIGNING_KEY?: string;

    /**
     * THE THREE BINDINGS `/v1/performance` READS FROM (`39-store-adapter.md`).
     *
     * All three are OPTIONAL IN THE TYPE for the same reason `WEBHOOK_SIGNING_KEY` is: they are
     * supplied per deployment rather than committed, so they are absent in local development and in
     * every test, and a required type would force each of those to invent a value. The requirement
     * is enforced where it belongs -- the route answers 503 NAMING THE MISSING BINDING rather than
     * failing somewhere further in with a null.
     *
     * `SUPABASE_URL` and `SUPABASE_ANON_KEY` are vars, not secrets: the publishable key ships in
     * browsers by design, and after `20260911000100_anon_has_nothing.sql` it reaches no row in
     * `public` at all. They are not committed anyway, because a project ref in `wrangler.jsonc`
     * would be a guess about which project a deployment talks to -- the same mistake
     * `supabase/config.toml` refuses to make about `site_url`.
     */
    readonly SUPABASE_URL?: string;
    readonly SUPABASE_ANON_KEY?: string;
    /**
     * HS256 signing material for the short-lived workspace token the Worker mints after verifying
     * an API key (`20260908000800_api_key_verification.sql`).
     *
     * A WORKER SECRET. `wrangler secret put SUPABASE_JWT_SECRET`, never a `var`, never in
     * `wrangler.jsonc`, never in a fixture. It is the one binding here that is worth stealing:
     * anything that can mint tokens can mint one for any workspace, which is the residual risk the
     * migration states plainly and bounds with a one-minute TTL.
     */
    readonly SUPABASE_JWT_SECRET?: string;

    /**
     * The key encryption key every stored credential is sealed under (`@repo/vault`,
     * `20260908000500_connections.sql`). Base64 of 32 random bytes; `kekFromBase64` refuses
     * anything else.
     *
     * DECLARED AHEAD OF ITS ONLY READER, DELIBERATELY, and that is not a placeholder. The KEK has
     * to exist BEFORE the first credential is sealed, because a credential sealed under one KEK
     * cannot be opened under another -- changing it later means re-wrapping every DEK. The thing
     * that seals the first one is `scripts/seal-connection.mjs` (step 5), which runs before the
     * route that opens it (step 6). So a deployment configured from this file today is a
     * deployment that does not have to re-seal tomorrow.
     *
     * A WORKER SECRET, and the second one worth stealing after `SUPABASE_JWT_SECRET`. The whole
     * point of envelope encryption is that the database is worth nothing on its own: the
     * ciphertext is in Supabase and this is not, so a compromise of either alone yields no
     * credential. Putting it in `wrangler.jsonc` would undo the entire scheme in one line.
     */
    readonly CREDENTIAL_KEK?: string;

    /**
     * The secret that gates `POST /v1/ingest/run`. A WORKER SECRET, and NEVER an API key.
     *
     * `MVP-PLAN.md` Decision 2 takes a manual trigger over a cron, and this is what stands in front
     * of it. It is deliberately a different credential from the customer's `mp_live_…` key, which
     * is read-only by construction -- a token minted from that key carries no `sub`, so
     * `app.can_write_workspace()` refuses. This route causes WRITES into `envelope_rows` and spends
     * a merchant's own store's capacity, which is a strictly larger power than reading numbers
     * back, so it does not share a credential with the smaller one.
     *
     * `openssl rand -base64 32`, same as the KEK. Compared in constant time; see `tokenMatches`.
     */
    readonly INGEST_TOKEN?: string;
  }
}

/** `?raw` imports, which Vite resolves to the file's text. Used to assert wrangler.jsonc's crons. */
declare module "*?raw" {
  const content: string;
  export default content;
}
