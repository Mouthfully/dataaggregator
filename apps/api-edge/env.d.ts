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
  }
}

/** `?raw` imports, which Vite resolves to the file's text. Used to assert wrangler.jsonc's crons. */
declare module "*?raw" {
  const content: string;
  export default content;
}
