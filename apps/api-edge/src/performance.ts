/**
 * `GET /v1/performance` -- the first real endpoint, and the surface over the store.
 *
 * WHAT THIS UNIT OWNS: the boundary. A request arrives with a bearer credential and query
 * parameters; a response leaves as the section 2 envelope. Everything between is validation, and
 * validation is the product: `15-envelope-store.md` put the refusal in the database and
 * `packages/contract` put it in zod, and this is the third place it has to hold because it is the
 * only one a customer ever sees.
 *
 * THE STORE IS A PORT, NOT AN IMPLEMENTATION. `PerformanceStore` is an interface this module
 * receives. Whether rows arrive over PostgREST with a minted workspace JWT or over a direct
 * connection through Hyperdrive is a real decision with a real trade-off, and it cannot be made
 * honestly against a Supabase project that does not exist yet. Naming the port now means the
 * decision changes one file later instead of this one.
 *
 * THREE REFUSALS THAT ARE NOT DEFENSIVENESS.
 *
 * 1. EVERY ROW IS RE-VALIDATED ON THE WAY OUT. The store writes through a checked function and the
 *    table has its own constraints, so a row that reaches here should already be sound. "Should"
 *    is the problem: a migration applied out of order, a hand-fixed row, a future bulk import.
 *    Section 2 says the API refuses to emit an unlabelled conversion count -- not that the database
 *    refuses to hold one -- so the API checks.
 *
 * 2. AN UNPARSEABLE ROW FAILS THE REQUEST RATHER THAN BEING SKIPPED. Dropping it would return a
 *    total quietly too low, which is the failure this whole product sells against, and it would
 *    return it with `ok: true`.
 *
 * 3. A DATE RANGE IS BOUNDED AND MUST BE ASKED FOR. No default window: a caller who omits it gets
 *    an error naming the parameter, not an arbitrary 30 days they will later mistake for their own
 *    choice.
 */

import { type EnvelopeRow, type Source, envelopeRowSchema, SOURCES } from "@repo/contract";

/** The longest range one request may ask for. */
export const MAX_RANGE_DAYS = 400;
/**
 * Rows per response. A caller wanting more pages; a caller wanting all of it uses an export.
 *
 * 999, NOT 1000, AND THE MISSING ONE IS LOAD-BEARING. PostgREST caps every response at
 * `max_rows` in supabase/config.toml, which is 1000. The ordinary way to answer "is there another
 * page?" is to ask for `limit + 1` rows and look for the extra one. At a limit of 1000 that asks
 * PostgREST for 1001, PostgREST silently returns 1000, the probe never sees its extra row, and
 * `nextCursor` is always null -- so a caller paging at the maximum limit stops after one page and
 * is told, with `ok: true`, that it has everything.
 *
 * Leaving room for the probe costs one row and removes the collision. `test/performance.test.ts`
 * reads `max_rows` out of config.toml and fails if the two ever meet again: they live in different
 * files in different languages, nothing else relates them, and the symptom -- "pagination doesn't
 * work at high limits" -- does not look like a configuration collision to whoever hits it.
 */
export const MAX_LIMIT = 999;
export const DEFAULT_LIMIT = 100;

export interface PerformanceQuery {
  readonly workspaceId: string;
  readonly source: Source;
  readonly from: string;
  readonly to: string;
  readonly limit: number;
  readonly cursor: string | null;
  /** Bitemporal read: the data as the platform reported it on this date (section 2). */
  readonly asOf: string | null;
}

/**
 * The port. One method, deliberately.
 *
 * It returns rows for ONE workspace because the workspace is resolved from the credential before
 * this is called and passed explicitly -- never read from a query parameter, which would make
 * cross-tenant access a matter of typing a different id.
 */
export interface PerformanceStore {
  read(query: PerformanceQuery): Promise<{ rows: readonly unknown[]; nextCursor: string | null }>;
}

/** Resolves a bearer credential to exactly one workspace, or refuses. */
export interface Authenticator {
  authenticate(
    authorization: string | null,
  ): Promise<{ workspaceId: string } | { error: "missing" | "invalid" }>;
}

export interface RequestContext {
  readonly store: PerformanceStore;
  readonly auth: Authenticator;
  /** Injected so a response is reproducible in a test rather than dependent on a clock. */
  readonly requestId: string;
}

export class QueryError extends Error {
  constructor(
    message: string,
    readonly parameter: string,
  ) {
    super(message);
    this.name = "QueryError";
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function requireDate(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (value === null || value === "") {
    throw new QueryError(`\`${name}\` is required, as YYYY-MM-DD`, name);
  }
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new QueryError(`\`${name}\` must be a calendar date, YYYY-MM-DD`, name);
  }
  return value;
}

/**
 * Turn query parameters into a validated query, or refuse.
 *
 * `workspace_id` is NOT a parameter. It comes from the credential, and accepting it from the caller
 * would make cross-tenant access a matter of typing a different id -- with row-level security as
 * the only thing standing in the way, which is one misconfiguration from nothing.
 */
export function parseQuery(url: URL, workspaceId: string): PerformanceQuery {
  const params = url.searchParams;

  const source = params.get("source");
  if (source === null || source === "") {
    throw new QueryError("`source` is required", "source");
  }
  if (!(SOURCES as readonly string[]).includes(source)) {
    throw new QueryError(
      `\`source\` must be one of: ${SOURCES.join(", ")}. Got ${JSON.stringify(source)}.`,
      "source",
    );
  }

  // No default window. A caller who omits the range gets an error naming the parameter rather than
  // an arbitrary period they will later mistake for a choice they made.
  const from = requireDate(params, "from");
  const to = requireDate(params, "to");
  if (Date.parse(`${from}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) {
    throw new QueryError("`from` must not be after `to`", "from");
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new QueryError(
      `the range is ${days} days; the maximum is ${MAX_RANGE_DAYS}. Ask for less, or page.`,
      "to",
    );
  }

  const rawLimit = params.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit !== "") {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new QueryError(`\`limit\` must be an integer in 1..${MAX_LIMIT}`, "limit");
    }
  }

  const asOf = params.get("as_of");
  if (asOf !== null && asOf !== "" && !DATE.test(asOf)) {
    throw new QueryError("`as_of` must be a calendar date, YYYY-MM-DD", "as_of");
  }

  return {
    workspaceId,
    source: source as Source,
    from,
    to,
    limit,
    cursor: params.get("cursor") || null,
    asOf: asOf || null,
  };
}

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error, message, ...extra }, { status });
}

/**
 * Handle one request.
 *
 * The order is deliberate: authenticate BEFORE parsing. A caller with no credential learns that
 * they need one and nothing else -- not which sources exist, not which parameters are accepted, not
 * whether their guessed date range was well-formed. Parsing first would turn an unauthenticated
 * endpoint into a free description of the API.
 */
export async function handlePerformance(
  request: Request,
  context: RequestContext,
): Promise<Response> {
  if (request.method !== "GET") {
    return fail(405, "method_not_allowed", "`/v1/performance` is a GET.");
  }

  const identity = await context.auth.authenticate(request.headers.get("authorization"));
  if ("error" in identity) {
    return fail(
      401,
      identity.error === "missing" ? "unauthorized" : "invalid_credential",
      identity.error === "missing"
        ? "Send an API key as `Authorization: Bearer <key>`."
        : "That credential is not valid for this workspace.",
    );
  }

  let query: PerformanceQuery;
  try {
    query = parseQuery(new URL(request.url), identity.workspaceId);
  } catch (error) {
    if (error instanceof QueryError) {
      return fail(400, "invalid_query", error.message, { parameter: error.parameter });
    }
    throw error;
  }

  const page = await context.store.read(query);

  // EVERY ROW, ON THE WAY OUT. See refusal 1 in the module note.
  const data: EnvelopeRow[] = [];
  for (const [index, row] of page.rows.entries()) {
    const parsed = envelopeRowSchema.safeParse(row);
    if (!parsed.success) {
      // Refusing the request rather than dropping the row: a skipped row is a total quietly too
      // low, returned with `ok: true`, which is worse than an error.
      return fail(
        500,
        "unemittable_row",
        `refusing to emit row ${index}: it does not satisfy the envelope. ` +
          "Returning the rest would report a total that is quietly too low.",
        {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      );
    }
    data.push(parsed.data);
  }

  return Response.json({
    ok: true,
    module: "performance",
    source: query.source,
    data,
    meta: {
      schema: "v1",
      request_id: context.requestId,
      // Zero for performance reads: section 11.3 replaced per-row credits with per-connected-account
      // monthly metering, so section 8's `/v1/performance` credit row is dead. The field stays
      // because credits still meter SERP, AI answers and composite calls.
      credits_used: 0,
      ...(query.asOf === null ? {} : { as_of: query.asOf }),
      ...(page.nextCursor === null ? {} : { next_cursor: page.nextCursor }),
    },
  });
}
