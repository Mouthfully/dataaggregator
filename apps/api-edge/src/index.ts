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
  createConnectionStore,
  createIngestStore,
  createPerformanceStore,
} from "@repo/store";
import type { CryptoLike as VaultCrypto } from "@repo/vault";
import {
  type IngestReport,
  IngestError,
  IngestRunFailure,
  parseIngestRequest,
  runIngest,
} from "./ingest.js";
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

/**
 * Which HTTP status each refusal is, and why none of them is 400 by default.
 *
 * The operator hitting this route reads one number before they read anything else, and the four
 * distinct situations here need four distinct next actions: fix the request, fix the connection
 * row, fix the deployment, or accept that this build cannot do it. Collapsing them into 400 would
 * send somebody to re-read a request that was correct.
 */
const REFUSAL_STATUS: Record<IngestError["refusal"], number> = {
  bad_request: 400,
  no_such_connection: 404,
  // 501, not 400: the request is well formed and this deployment cannot answer it. Same distinction
  // `storeFailure` draws for `as_of`.
  unsupported_provider: 501,
  // 409, not 400 and not 422: the request is fine and the CONNECTION is not ready. The fix is a
  // column, not a retry with different parameters.
  no_timezone: 409,
  connection_unusable: 409,
  wrong_credential_lane: 409,
  // A deployment fault, like a missing binding, and answered the same way.
  bad_kek: 503,
};

/**
 * Compare the presented ingest token without leaking where it first differs.
 *
 * A `===` on secrets returns as soon as two bytes differ, so the time it takes is a function of how
 * much of the prefix was right -- which over enough requests is a way to learn the secret one
 * character at a time. The cost of not caring is a remotely guessable write credential; the cost of
 * caring is a loop over 43 bytes.
 *
 * The length is folded into the accumulator rather than short-circuited on, for the same reason.
 */
export function tokenMatches(presented: string, expected: string): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

const BEARER = /^bearer[ \t]+(.+)$/i;

/**
 * `POST /v1/ingest/run`.
 *
 * THE ONLY PLACE `env` BECOMES PORTS. `runIngest` is a boundary over injected ports and knows
 * nothing about bindings, which is what lets the whole run -- connection, credential, fetch, write
 * -- be exercised in a test with no network.
 */
async function handleIngestRun(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  const config = supabaseConfig(env);
  const missing = "missing" in config ? [...config.missing] : [];
  // GATHERED, NOT SHORT-CIRCUITED. An operator configuring a deployment should learn about all
  // five absent bindings in one response rather than one per attempt.
  if (!env.INGEST_TOKEN) missing.push("INGEST_TOKEN");
  if (!env.CREDENTIAL_KEK) missing.push("CREDENTIAL_KEK");
  if (missing.length > 0) {
    return Response.json(
      {
        ok: false,
        error: "not_configured",
        message:
          `\`/v1/ingest/run\` is missing ${missing.join(", ")} on this deployment. The run, its ` +
          "ports and their contracts are implemented and tested; this deployment is not configured.",
      },
      { status: 503 },
    );
  }
  // Narrowed by the check above; `supabaseConfig` returns the union and TypeScript cannot see that
  // `missing.length === 0` rules out the error arm.
  const postgrest = config as PostgrestConfig;

  // A DEDICATED SECRET, NEVER THE API KEY. See the note at the top of `ingest.ts`: the customer's
  // key is read-only by construction, and this route causes writes and spends the merchant's store.
  const presented = BEARER.exec((request.headers.get("authorization") ?? "").trim());
  if (presented?.[1] === undefined) {
    return Response.json(
      {
        ok: false,
        error: "unauthorized",
        message:
          "Send the ingest secret as `Authorization: Bearer <token>`. This is not the API key.",
      },
      { status: 401 },
    );
  }
  if (!tokenMatches(presented[1].trim(), env.INGEST_TOKEN ?? "")) {
    // No detail, and no distinction from a malformed one beyond the message above. A caller
    // learning that its token was well formed but wrong is a caller being told it is close.
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_request", message: "The body is not JSON." },
      { status: 400 },
    );
  }

  const requestId = crypto.randomUUID();
  try {
    const parsed = parseIngestRequest(body);
    const report = await runIngest(parsed, {
      connections: createConnectionStore(postgrest),
      ingest: createIngestStore(postgrest),
      kek: env.CREDENTIAL_KEK ?? "",
      fetchImpl: fetch,
      crypto: crypto as unknown as VaultCrypto,
    });
    log(report, requestId, null);
    return Response.json({ ok: true, ...body_of(report) });
  } catch (error) {
    if (error instanceof IngestError) {
      return Response.json(
        { ok: false, error: error.refusal, message: error.message, request_id: requestId },
        { status: REFUSAL_STATUS[error.refusal] },
      );
    }
    if (error instanceof IngestRunFailure) {
      // 502 AND THE COUNTS ANYWAY. A partial run is a failure, and the checkpoint it reached is the
      // most valuable thing in the response: without it the operator's only safe move is to redo
      // the whole span.
      log(error.report, requestId, reasonOf(error.cause));
      return Response.json(
        {
          ok: false,
          error: "run_incomplete",
          message: reasonOf(error.cause),
          request_id: requestId,
          ...body_of(error.report),
        },
        { status: 502 },
      );
    }
    throw error;
  }
}

/** The wire shape. snake_case, like every other body this API emits. */
function body_of(report: IngestReport): Record<string, unknown> {
  return {
    source: report.source,
    connection_id: report.connectionId,
    pages: report.pages,
    rows_read: report.rowsRead,
    rows_written: report.rowsWritten,
    chunks: report.chunks,
    checkpoint: report.checkpoint,
    complete: report.complete,
  };
}

/**
 * What a failure is allowed to say.
 *
 * REPOSITORY-AUTHORED TEXT ONLY. `WooClientError`, `WooNormalizeError`, `WooBackfillError` and
 * `StoreError` carry sentences written in this repository for a merchant to read, and none of them
 * interpolates a credential. Anything else -- an `ExtractError`, whose message carries the request
 * URL, or a runtime `TypeError` -- is reduced to its NAME, because a store URL is customer data and
 * a stack is nobody's business. Same rule as `storeFailure`'s: the kind travels, the values do not.
 */
export function reasonOf(cause: unknown): string {
  const named = ["WooClientError", "WooNormalizeError", "WooBackfillError", "StoreError"];
  if (cause instanceof Error && named.includes(cause.name)) return cause.message;
  if (cause instanceof Error) return `the run failed with ${cause.name}`;
  return "the run failed";
}

/** Counts and reasons only. No payload, no credential, no store URL. */
function log(report: IngestReport, requestId: string, failure: string | null): void {
  console.log(
    JSON.stringify({
      route: "/v1/ingest/run",
      request_id: requestId,
      connection_id: report.connectionId,
      pages: report.pages,
      rows_read: report.rowsRead,
      rows_written: report.rowsWritten,
      chunks: report.chunks,
      complete: report.complete,
      ...(failure === null ? {} : { failure }),
    }),
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

    if (pathname === "/v1/ingest/run") {
      return await handleIngestRun(request, env);
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { handleIngestRun };
export { handlePerformance };
export { handleScheduled };
