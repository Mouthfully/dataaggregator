/**
 * The API edge.
 *
 * `/health` proves the workerd target builds and runs. `/v1/performance` is the first real
 * endpoint; the remaining public surface (see `docs/marketplane/00-repo-map.md` section 4) lands
 * behind it.
 *
 * THE STORE AND THE AUTHENTICATOR ARE NOT BOUND HERE YET, and that is deliberate rather than
 * unfinished. `handlePerformance` takes both as ports (`src/performance.ts`), and whether rows
 * arrive over PostgREST with a minted workspace JWT or over a direct connection through Hyperdrive
 * is a decision that cannot be made honestly against a Supabase project that does not exist. Until
 * one does, the route answers 503 with the reason rather than pretending -- and the endpoint's
 * behaviour is fully tested against injected ports.
 */

import { handlePerformance } from "./performance.js";
import { type ScheduledOutcome, handleScheduled } from "./webhooks.js";

/**
 * The bindings are declared once, in `env.d.ts`, as `Cloudflare.Env` -- the extension point both
 * `wrangler types` and `cloudflare:test` use. This alias exists so the handler signature reads
 * normally; adding a binding here instead would reintroduce the split that made the test `env`
 * silently empty. See the note in `env.d.ts`.
 */
export type Env = Cloudflare.Env;

export default {
  /**
   * The scheduled half. Two crons, declared in `wrangler.jsonc` and dispatched by name in
   * `src/webhooks.ts` -- which reports a cron it does not recognise rather than doing nothing,
   * because a schedule added there and forgotten here would run every minute forever, invisibly.
   *
   * The store is null for the same reason `/v1/performance` answers 503: there is no database
   * connection to bind. The outcome is logged either way, and logging it is what makes an
   * unconfigured deployment visible instead of quiet.
   */
  async scheduled(controller, env, ctx) {
    const run = handleScheduled(controller.cron, {
      store: null,
      signingKey: env.WEBHOOK_SIGNING_KEY ?? null,
    }).then((outcome: ScheduledOutcome) => {
      // Counts and reasons only. A payload or a secret must never reach a log line, and the shape
      // of `ScheduledOutcome` is what guarantees neither can.
      console.log(JSON.stringify({ cron: controller.cron, ...outcome }));
    });
    ctx.waitUntil(run);
    await run;
  },

  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      if (request.method !== "GET") {
        return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
      }
      return Response.json({ ok: true });
    }

    if (pathname === "/v1/performance") {
      // See the module note. A 503 naming the missing binding beats a 500 from a null store, and
      // beats an empty `data: []` that a caller would read as "no data" rather than "not wired".
      return Response.json(
        {
          ok: false,
          error: "not_configured",
          message:
            "`/v1/performance` has no store binding yet. The handler and its contract are " +
            "implemented and tested; the database connection is not configured on this deployment.",
        },
        { status: 503 },
      );
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { handlePerformance };
export { handleScheduled };
