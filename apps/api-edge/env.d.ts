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
  }
}
