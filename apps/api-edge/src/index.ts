/**
 * The API edge.
 *
 * `/health` proves the workerd target builds and runs. `/v1/performance` is the first real
 * endpoint; the remaining public surface (see `docs/marketplane/00-repo-map.md` section 4) lands
 * behind it.
 *
 * THE STORE AND THE AUTHENTICATOR ARE BOUND HERE NOW, over PostgREST (`@repo/store`,
 * `39-store-adapter.md`). The transport question the 503 was holding open is answered by the
 * schema's own partition: `public` is granted to `authenticated`, `app` is not exposed to PostgREST
 * at all, so the read path needs zero new database objects. Hyperdrive remains the answer for the
 * SCHEDULED half, whose role is `NOLOGIN` -- a separate decision with its own cost line, and the
 * reason `scheduled` below still passes a null store.
 *
 * THE 503 DID NOT GO AWAY; IT MOVED FROM "not decided" TO "not configured", and it now names the
 * binding that is absent. A deployment missing a secret and a deployment with an empty database
 * must not look alike, and `data: []` would make them look identical.
 */

import {
  type PostgrestConfig,
  StoreError,
  createApiKeyAuthenticator,
  createPerformanceStore,
} from "@repo/store";
import { handlePerformance } from "./performance.js";
import { type ScheduledOutcome, handleScheduled } from "./webhooks.js";

/**
 * The bindings are declared once, in `env.d.ts`, as `Cloudflare.Env` -- the extension point both
 * `wrangler types` and `cloudflare:test` use. This alias exists so the handler signature reads
 * normally; adding a binding here instead would reintroduce the split that made the test `env`
 * silently empty. See the note in `env.d.ts`.
 */
export type Env = Cloudflare.Env;

/**
 * Resolve the three bindings the read path needs, or say which are missing.
 *
 * Returned as a LIST OF NAMES rather than a boolean because the 503 body is the only diagnosis
 * anyone gets: "not configured" sends an operator to read three dashboards, "SUPABASE_JWT_SECRET is
 * missing" sends them to one command. Empty strings count as missing -- a secret set to the empty
 * string is the shape a failed `wrangler secret put` leaves behind, and `mintToken` would otherwise
 * refuse it one layer further in, where the message reaches a log instead of the caller.
 */
function supabaseConfig(env: Env): PostgrestConfig | { missing: readonly string[] } {
  const missing: string[] = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  if (!env.SUPABASE_JWT_SECRET) missing.push("SUPABASE_JWT_SECRET");
  if (missing.length > 0) return { missing };
  return {
    url: env.SUPABASE_URL ?? "",
    apiKey: env.SUPABASE_ANON_KEY ?? "",
    jwtSecret: env.SUPABASE_JWT_SECRET ?? "",
  };
}

/**
 * Turn a store failure into a response.
 *
 * The four kinds map to four different things a caller should do, which is the entire reason
 * `StoreError` carries a discriminant instead of a message to grep: fix the cursor, stop sending
 * that parameter, retry later, or tell whoever deployed this.
 *
 * NOTHING FROM THE UPSTREAM BODY REACHES THE CALLER OR THE LOG. PostgREST's `details` and `hint`
 * echo the failing query, and a failing query here contains the caller's own filter values -- which
 * are platform data. The log line carries the failure kind and the HTTP status, which is what
 * separates "misconfigured" from "the database is down", and nothing else. Same rule as
 * `ScheduledOutcome`: counts and reasons only.
 */
function storeFailure(error: StoreError, requestId: string): Response {
  console.log(
    JSON.stringify({
      route: "/v1/performance",
      failure: error.failure,
      upstream_status: error.status,
      request_id: requestId,
    }),
  );

  if (error.failure === "bad_cursor") {
    return Response.json(
      { ok: false, error: "invalid_query", message: error.message, parameter: "cursor" },
      { status: 400 },
    );
  }
  if (error.failure === "unsupported_query") {
    // 501, not 400: the parameter is well-formed and the API accepts it. This deployment cannot
    // answer it, which is a statement about the server.
    return Response.json(
      { ok: false, error: "not_implemented", message: error.message, parameter: "as_of" },
      { status: 501 },
    );
  }
  return Response.json(
    {
      ok: false,
      error: "upstream_unavailable",
      message:
        "The store could not answer this read. Nothing was returned rather than a partial " +
        "result; retry, and quote the request id if it persists.",
      request_id: requestId,
    },
    { status: 502 },
  );
}

export default {
  /**
   * The scheduled half. Two crons, declared in `wrangler.jsonc` and dispatched by name in
   * `src/webhooks.ts` -- which reports a cron it does not recognise rather than doing nothing,
   * because a schedule added there and forgotten here would run every minute forever, invisibly.
   *
   * THE STORE IS STILL NULL, AND NO LONGER FOR THE SAME REASON AS `/v1/performance`. The read path
   * is bound (see the module note); this one cannot use it. The drain's whole vocabulary is
   * `app.due_restatement_events`, `app.record_delivery` and `app.prune_restatement_events`, which
   * live in the schema `supabase/config.toml` deliberately does not expose to PostgREST, and
   * `app_webhook` is `NOLOGIN` -- so it needs a direct connection through Hyperdrive, a different
   * identity with its own cost line. The outcome is logged either way, and logging it is what makes
   * an unconfigured deployment visible instead of quiet.
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

  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      if (request.method !== "GET") {
        return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
      }
      return Response.json({ ok: true });
    }

    if (pathname === "/v1/performance") {
      const config = supabaseConfig(env);
      if ("missing" in config) {
        // Still a 503, and still for the reason the original one gave: a deployment that cannot
        // reach its database must not be indistinguishable from a workspace with no rows.
        return Response.json(
          {
            ok: false,
            error: "not_configured",
            message:
              `\`/v1/performance\` is missing ${config.missing.join(", ")} on this deployment. ` +
              "The handler, the store and their contracts are implemented and tested; the " +
              "database connection is not configured here.",
          },
          { status: 503 },
        );
      }

      // Built per request rather than at module scope: `env` does not exist at module scope, and
      // both of these are closures over three strings, so there is nothing to amortise.
      const requestId = crypto.randomUUID();
      try {
        return await handlePerformance(request, {
          store: createPerformanceStore(config),
          auth: createApiKeyAuthenticator(config),
          requestId,
        });
      } catch (error) {
        // `handlePerformance` does not wrap the port calls, deliberately -- it is a pure boundary
        // over injected ports and knows nothing about transports. So the route owns turning an
        // infrastructure failure into a response, and an unrecognised throw is re-raised rather
        // than flattened into a 502 that would hide a real bug in the handler.
        if (error instanceof StoreError) return storeFailure(error, requestId);
        throw error;
      }
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { handlePerformance };
export { handleScheduled };
