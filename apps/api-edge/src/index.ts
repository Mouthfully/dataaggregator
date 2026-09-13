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
  createApiKeyAuthenticator,
  createConnectionStore,
  createIngestStore,
  createSchedulerStore,
  createPerformanceStore,
  type PostgrestConfig,
  StoreError,
} from "@repo/store";
import type { CryptoLike as VaultCrypto } from "@repo/vault";
import { type ConnectDeps, handleConnect } from "./connect.js";
import {
  IngestError,
  type IngestReport,
  IngestRunFailure,
  parseIngestRequest,
  runIngest,
} from "./ingest.js";
import { handlePerformance } from "./performance.js";
import { type ScheduledOutcome, handleScheduled } from "./scheduled.js";
import type { SweepDeps } from "./scheduled-ingest.js";

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
  // 502, and RETRYABLE -- unlike every other member. The request was fine and the run never began,
  // so there is no partial progress and no checkpoint to report; trying again is the correct next
  // move, which is exactly what the other 5xx here does NOT mean.
  store_unavailable: 502,
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

/**
 * `POST /v1/connections`.
 *
 * THE SECOND PLACE `env` BECOMES PORTS, and the only one that forwards a credential rather than
 * minting one. `handleConnect` is a boundary over injected ports for `handlePerformance`'s reason,
 * so the whole endpoint -- token verification, refusals, seal, insert -- is exercised in a test
 * against a fake PostgREST with no network and no Supabase project.
 *
 * FOUR BINDINGS, GATHERED RATHER THAN SHORT-CIRCUITED, exactly as `/v1/ingest/run` gathers five.
 * `SUPABASE_JWT_SECRET` is needed twice over here: to VERIFY the customer's access token, and as
 * the material PostgREST verifies the same token with. `SUPABASE_ANON_KEY` only gets the request
 * past the edge; the identity the insert runs under is the customer's own token and nothing else.
 */
async function handleConnections(request: Request, env: Env): Promise<Response> {
  const config = supabaseConfig(env);
  const missing = "missing" in config ? [...config.missing] : [];
  if (!env.CREDENTIAL_KEK) missing.push("CREDENTIAL_KEK");
  if (missing.length > 0) {
    // The same 503 the other two routes answer with, and for the same reason: a deployment that
    // cannot seal must not be indistinguishable from one that refused the credential.
    return Response.json(
      {
        ok: false,
        error: "not_configured",
        message:
          `\`/v1/connections\` is missing ${missing.join(", ")} on this deployment. The endpoint, ` +
          "the vault and the insert are implemented and tested; this deployment is not configured.",
      },
      { status: 503 },
    );
  }

  const deps: ConnectDeps = {
    // Narrowed by the check above; TypeScript cannot see that `missing.length === 0` rules out the
    // error arm of the union.
    postgrest: config as PostgrestConfig,
    kek: env.CREDENTIAL_KEK ?? "",
    crypto: crypto as unknown as ConnectDeps["crypto"],
    requestId: crypto.randomUUID(),
  };
  return await handleConnect(request, deps);
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
    splits: report.splits,
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
  if (!(cause instanceof Error)) return "the run failed";

  // `WooNormalizeError` IS NOT ON THE ALLOW-LIST, AND IT LOOKS LIKE IT SHOULD BE. Its sentences are
  // written in this repository for a human to read -- and they interpolate the MERCHANT'S PAYLOAD
  // into them: `order ${order.id} total` names an order, and `JSON.stringify(value)` prints the raw
  // field that failed to parse. Both are platform data, and this function is the last gate before a
  // response body and a log line.
  //
  // Its `code` carries the whole diagnosis an operator needs -- `missing_currency` says which field
  // and what to do -- with none of the values. Found in review; the allow-list had been reasoned
  // about at the level of "who wrote the sentence" rather than "what the sentence contains".
  if (cause.name === "WooNormalizeError") {
    const code = (cause as { code?: unknown }).code;
    return `an order could not be normalised (${typeof code === "string" ? code : "unknown"})`;
  }

  // The rest are repository-authored AND value-free. `WooClientError` and `WooBackfillError`
  // interpolate windows and counts, which are the caller's own inputs and arithmetic over them;
  // `StoreError` deliberately drops PostgREST's `details` and `hint` because both echo the failing
  // query. Each was re-read against this rule rather than inherited from the previous list.
  const named = ["WooClientError", "WooBackfillError", "StoreError"];
  if (named.includes(cause.name)) return cause.message;

  // Everything else by NAME only. `ExtractError` is why: its message interpolates the request URL,
  // and the request URL is the merchant's store origin.
  return `the run failed with ${cause.name}`;
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
      splits: report.splits,
      complete: report.complete,
      ...(failure === null ? {} : { failure }),
    }),
  );
}

/**
 * The sweep's ports, or null when this deployment cannot reach the database as `app_scheduler`.
 *
 * GATHERED THE SAME WAY `/v1/ingest/run` GATHERS ITS BINDINGS, and null for the same reason the
 * route answers 503: a deployment that cannot reach its database must not be indistinguishable
 * from a platform with no work to do. `handleScheduled` turns the null into a `not_configured`
 * naming what is absent.
 *
 * THE INSTANCE NAME IS A FRESH UUID PER INVOCATION, and that is not cosmetic. Since
 * `20260913000100_ingest_watermark.sql` the database compares it against `connections.claimed_by`
 * before letting this instance close a lease, so a constant like "api-edge" would make every
 * instance look like the same one and turn the ownership check into a clause that always matches --
 * a guard that passes its test and protects nothing. It is also the only thing an operator has to
 * go on when a connection is found stuck.
 */
function sweepDeps(env: Env): SweepDeps | null {
  const config = supabaseConfig(env);
  if ("missing" in config) return null;
  if (!env.CREDENTIAL_KEK) return null;

  return {
    scheduler: createSchedulerStore(config),
    ingest: {
      connections: createConnectionStore(config),
      ingest: createIngestStore(config),
      kek: env.CREDENTIAL_KEK,
      fetchImpl: fetch,
      crypto: crypto as unknown as VaultCrypto,
    },
    instanceName: crypto.randomUUID(),
  };
}

export default {
  /**
   * The scheduled half. THREE crons now, declared in `wrangler.jsonc` and dispatched by name in
   * `src/scheduled.ts` -- which reports a cron it does not recognise rather than doing nothing,
   * because a schedule added there and forgotten here would run on its interval forever, invisibly.
   *
   * TWO OF THE THREE ARE STILL UNCONFIGURED, AND FOR DIFFERENT REASONS. Being precise about which
   * is which matters, because "two of three crons say not_configured" reads as a scheduler that did
   * not land:
   *
   *   THE INGEST SWEEP IS BOUND HERE. `app_scheduler` reaches `public.due_connections`,
   *   `claim_connection` and `record_backfill` over PostgREST, exactly as the ingest route reaches
   *   `ingest_envelope_rows`. It is configured whenever the four bindings below are set.
   *
   *   THE DELIVER AND PRUNE CRONS ARE NOT, and cannot be from here. The drain's whole vocabulary is
   *   `app.due_restatement_events`, `app.record_delivery` and `app.prune_restatement_events`, which
   *   live in the schema `supabase/config.toml` deliberately does not expose to PostgREST, and
   *   `app_webhook` is `NOLOGIN` with no `public.` forwarder migration. That needs a direct
   *   connection through Hyperdrive -- a different identity with its own cost line, and a separate
   *   piece of work. `store: null` below is that, and it is not the scheduler's.
   *
   * The outcome is logged either way, and logging it is what makes an unconfigured deployment
   * visible instead of quiet.
   */
  async scheduled(controller, env, ctx) {
    const run = handleScheduled(controller.cron, {
      store: null,
      signingKey: env.WEBHOOK_SIGNING_KEY ?? null,
      sweep: sweepDeps(env),
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

    if (pathname === "/v1/connections") {
      return await handleConnections(request, env);
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { handleConnections, handleIngestRun, handlePerformance, handleScheduled };
