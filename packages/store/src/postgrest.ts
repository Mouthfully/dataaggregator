/**
 * THE TRANSPORT, AND WHY IT IS NOT A DECISION THIS FILE TAKES.
 *
 * `16-performance-endpoint.md` named `PerformanceStore` a port and left the transport open, because
 * PostgREST-with-a-minted-JWT and a direct connection through Hyperdrive could not be weighed
 * honestly against a Supabase project that did not exist. A project exists now
 * (`37-first-real-project.md`), and the schema had already answered the question by partitioning
 * itself: everything a WEB identity touches is in `public` and granted to `authenticated`,
 * everything a SYSTEM role touches is in `app`, and `supabase/config.toml` deliberately does not
 * expose `app` to PostgREST. So the read path needs ZERO new database objects and goes over
 * PostgREST as `authenticated`. Hyperdrive stays the answer for the webhook drain, whose role is
 * `NOLOGIN` and whose vocabulary lives entirely in `app`; that is a separate decision with its own
 * cost line and is not taken here.
 *
 * NO CLIENT LIBRARY. `fetch` and `crypto.subtle` are all workerd needs to sign an HS256 token and
 * make a request, and supabase-js would add a dependency, a bundle, and a second place for the
 * tenancy rules to be expressed. The whole surface is one GET and one RPC POST.
 *
 * THE SIGNING SECRET IS A WORKER SECRET AND NOTHING ELSE. It is never committed, never logged and
 * never in a fixture. `20260908000800_api_key_verification.sql` states the residual risk plainly --
 * anything that can mint tokens can mint one for any workspace -- and the mitigations are the
 * one-minute TTL, the secret existing only as a Worker binding, and the fact that a minted token
 * still reaches no table a policy does not open to it. That is strictly better than a service-role
 * key, which bypasses the policies rather than being subject to them, and it is not nothing.
 *
 * ERRORS ARE TYPED, NOT THROWN AS STRINGS. `handlePerformance` does not wrap the store call, and it
 * is not this unit's file to change, so the Worker's route catches `StoreError` and maps it. The
 * discriminant is what the route needs to answer with: a bad cursor is the caller's 400, an
 * unhonourable parameter is a 501, a database that will not answer is a 502, and a missing binding
 * is the 503 this route already returned.
 */

import { METRICS } from "@repo/contract";

/** What went wrong, as the route needs to classify it. */
export type StoreFailure =
  /** A binding is absent. The deployment is incomplete; the request was fine. */
  | "not_configured"
  /** The caller sent a cursor this store did not issue or can no longer read. */
  | "bad_cursor"
  /** A well-formed parameter this store cannot honour. Answering it anyway would be a lie. */
  | "unsupported_query"
  /**
   * A row handed to the WRITE path does not satisfy the envelope, so the batch was refused.
   *
   * The read path has no equivalent because it validates on the way OUT, in `handlePerformance`.
   * Here the check is on the way in, and it is a caller bug rather than an upstream one: a
   * connector produced a row the contract forbids, and no amount of retrying fixes it.
   */
  | "invalid_row"
  /** PostgREST refused, was unreachable, or answered with something unrecognisable. */
  | "upstream";

export class StoreError extends Error {
  constructor(
    message: string,
    readonly failure: StoreFailure,
    /** The upstream HTTP status, where there was one. Null for everything local. */
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export interface PostgrestConfig {
  /** The project's REST origin, e.g. `https://<ref>.supabase.co`. A trailing slash is tolerated. */
  readonly url: string;
  /**
   * The project's publishable key, sent as `apikey` for the API gateway.
   *
   * PUBLIC BY DESIGN, NOT A SECRET -- it ships in browsers, and `37-first-real-project.md` §3 gate 4
   * says so explicitly. It buys nothing on its own: `20260911000100_anon_has_nothing.sql` left
   * `anon` with no grant on any table in `public`, so a request bearing only this key can reach
   * exactly one function and no row. The role the query actually runs as comes from the minted
   * token below, never from this.
   */
  readonly apiKey: string;
  /**
   * HS256 signing material for the minted token. A WORKER SECRET.
   *
   * Declared here as a plain string because that is what `crypto.subtle.importKey` wants, and
   * guarded by the rule rather than the type: it is never interpolated into a URL, never put in a
   * header other than as a signature over claims, never logged, and never written into a test
   * fixture. `store.test.ts` asserts the first three against the request the adapter actually makes.
   */
  readonly jwtSecret: string;
  /** Injected so a test has no network and a deployment has no seam. */
  readonly fetch?: typeof fetch;
  /** Injected so a minted token's `iat`/`exp` are assertable rather than dependent on a clock. */
  readonly now?: () => Date;
}

/**
 * The columns this adapter reads, and the reason `select=*` is not one of them.
 *
 * `*` would pull `raw_key`, `connection_id`, `created_at` and `updated_at` -- bytes no caller is
 * owed -- and, worse, it would make the mapping below depend on whatever columns happen to exist. A
 * column renamed in a migration then arrives as `undefined` and the row fails the envelope with a
 * message about a missing field. An explicit list turns the same mistake into a PostgREST 400 that
 * names the column.
 *
 * THE METRIC COLUMNS ARE NOT WRITTEN OUT. They come from `METRICS`, the dictionary itself, because
 * `check-dictionary.mjs` already asserts that dictionary against the migration's columns name for
 * name and order for order. Hand-listing them here would add a third copy the guard does not read,
 * and a metric added under §13.3 rule 2 would be stored, constrained, typed -- and silently absent
 * from every read.
 */
export const METRIC_COLUMNS: readonly string[] = Object.keys(METRICS);

export const SELECT_COLUMNS: readonly string[] = [
  "source",
  "account_id",
  "entity_id",
  "entity_type",
  "native_entity_type",
  "native_id",
  "entity_name",
  "parent_id",
  "date",
  "currency",
  "timezone",
  "attribution_window",
  ...METRIC_COLUMNS,
  "fetched_at",
  "source_updated_at",
  "restates_until",
  "is_provisional",
  "first_seen_at",
  "fx_source",
  "fx_rate_date",
  "fx_rate",
  "fx_base",
];

/**
 * Quote a value for a PostgREST filter.
 *
 * THIS IS NOT COSMETIC. A filter is `column=operator.value` and the grammar gives `,` `.` `(` `)`
 * and `"` meaning inside it, while `entity_id` and `account_id` are arbitrary platform text: a
 * search term is a customer's sentence, and a GA4 page path carries `?`, `&` and commas as a matter
 * of course. An unquoted comma inside `or=(...)` does not error -- it ENDS THE CONDITION and starts
 * another, which is a filter that means something else and still returns rows. Quoting everything,
 * always, removes the whole class; PostgREST strips the quotes before casting, so quoting a date or
 * an enum costs nothing.
 *
 * Backslash first, then the quote character: reversing the order would escape the backslash that
 * the quote escape just introduced.
 */
export function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** `https://x.supabase.co/` and `https://x.supabase.co` must not produce two different URLs. */
function origin(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * One PostgREST call, with the minted token as the only authority.
 *
 * `Accept-Profile` is not sent and must not be: PostgREST would use it to switch schemas, and the
 * only schema exposed is `public` precisely because `app` is a privilege boundary rather than an
 * API. Naming a schema here would be the first step in reopening that.
 */
export async function callPostgrest(
  config: PostgrestConfig,
  options: {
    path: string;
    token: string;
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    /**
     * What the caller was doing, for the refusal message only.
     *
     * The message read "refused the read" unconditionally, which was true while this module only
     * read. An operator staring at "the database refused the read with 403" after an ingest run
     * would look at the wrong half of the system.
     */
    action?: "read" | "write";
  },
): Promise<unknown> {
  const doFetch = config.fetch ?? fetch;
  const url = `${origin(config.url)}${options.path}`;

  const headers: Record<string, string> = {
    // The gateway's key and the request's identity are DIFFERENT things and are sent as different
    // headers. PostgREST takes the role from `Authorization`; `apikey` only gets the request past
    // the edge.
    apikey: config.apiKey,
    authorization: `Bearer ${options.token}`,
    accept: "application/json",
    ...options.headers,
  };
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (cause) {
    // A network failure never reached the database, so it is an upstream fault and not a query
    // error. The cause's message is deliberately not interpolated: a fetch failure can quote the
    // URL, and the URL is on its way into a log line.
    throw new StoreError(`the database could not be reached: ${(cause as Error).name}`, "upstream");
  }

  if (!response.ok) {
    // PostgREST's `code` is worth keeping -- `42501` is "RLS or a grant refused you" and `42703` is
    // "that column does not exist", which are different operator problems. `details` and `hint` are
    // NOT kept: both echo the failing query, and a failing query here contains the caller's own
    // filter values.
    const code = await postgrestCode(response);
    throw new StoreError(
      `the database refused the ${options.action ?? "read"} with ${response.status}` +
        `${code === null ? "" : ` (${code})`}`,
      "upstream",
      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new StoreError("the database answered with a body that is not JSON", "upstream", 200);
  }
}

async function postgrestCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}
