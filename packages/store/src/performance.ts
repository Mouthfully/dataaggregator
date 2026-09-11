/**
 * THE READ. One GET against `public.envelope_rows`, as `authenticated`, under the caller's own
 * workspace claim.
 *
 * `envelope_rows_select` is `to authenticated using (app.can_read_workspace(workspace_id))`, and for
 * a key session `can_read_workspace` opens exactly the workspace in the token. So row-level security
 * is doing the isolation, not this file -- which is the property gate 6 asks for and the reason the
 * Worker holds no service-role key.
 */

import type { Source } from "@repo/contract";
import { ORDER, afterCursor, decodeCursor, encodeCursor } from "./cursor.js";
import { mintToken } from "./jwt.js";
import { type PostgrestConfig, SELECT_COLUMNS, StoreError, callPostgrest, quote } from "./postgrest.js";
import { toEnvelopeRow } from "./row.js";

/**
 * The query, restated.
 *
 * A STRUCTURAL COPY OF `PerformanceQuery` IN `apps/api-edge/src/performance.ts`, not an import: a
 * package cannot import from an app, and inverting that -- moving the port into a package so the
 * adapter can implement it nominally -- would move the endpoint's contract away from the endpoint.
 * The two are checked against each other where it matters: `apps/api-edge/src/index.ts` passes this
 * store to `handlePerformance`, so any drift in a field name or type is a typecheck failure in the
 * Worker rather than a runtime surprise.
 */
export interface PerformanceQuery {
  readonly workspaceId: string;
  readonly source: Source;
  readonly from: string;
  readonly to: string;
  readonly limit: number;
  readonly cursor: string | null;
  readonly asOf: string | null;
}

export interface PerformancePage {
  readonly rows: readonly unknown[];
  readonly nextCursor: string | null;
}

export interface PerformanceStorePort {
  read(query: PerformanceQuery): Promise<PerformancePage>;
}

export function createPerformanceStore(config: PostgrestConfig): PerformanceStorePort {
  return {
    async read(query: PerformanceQuery): Promise<PerformancePage> {
      if (query.asOf !== null) {
        // REFUSED RATHER THAN IGNORED, and this is the sharpest decision in the adapter.
        //
        // `16-performance-endpoint.md` §5.3 already recorded the problem: `as_of` is validated at
        // the boundary and honoured by nothing, so "a request with as_of returns the same rows as
        // one without, and that must not be sold". `envelope_rows` holds ONE CURRENT ROW per upsert
        // key -- there is no valid-time history to read -- so a bitemporal read is not something
        // this store is failing to do well, it is something the schema cannot answer at all.
        //
        // Answering it with today's numbers under `ok: true` and an echoed `meta.as_of` would tell
        // a customer that this is what the platform reported three weeks ago. It is not. Refusing
        // turns a documented silent lie into an error naming the parameter.
        throw new StoreError(
          "`as_of` asks what the platform reported on a past date. This store keeps one current " +
            "row per key and holds no history to answer that with, so it refuses rather than " +
            "returning today's numbers under a past date.",
          "unsupported_query",
        );
      }

      const params = new URLSearchParams();
      params.set("select", SELECT_COLUMNS.join(","));
      // REDUNDANT WITH ROW-LEVEL SECURITY, AND SENT ANYWAY, for a planner reason rather than a
      // security one: the policy's predicate is a function call, and without an explicit equality
      // the range scan cannot use `envelope_rows_read_idx`'s `(workspace_id, source, date desc)`
      // leading columns. It can only ever narrow what RLS already allows.
      params.set("workspace_id", `eq.${quote(query.workspaceId)}`);
      params.set("source", `eq.${quote(query.source)}`);
      params.append("date", `gte.${quote(query.from)}`);
      params.append("date", `lte.${quote(query.to)}`);
      params.set("order", ORDER);

      if (query.cursor !== null) {
        params.set("or", afterCursor(decodeCursor(query.cursor)));
      }

      // THE `limit + 1` PROBE. One extra row is how "is there another page?" is answered without a
      // count, and the headroom for it is guaranteed upstream: `MAX_LIMIT` in
      // `apps/api-edge/src/performance.ts` is 999 against PostgREST's `max_rows` of 1000 for exactly
      // this arithmetic, and its comment explains what happens when the two meet. The cap is not
      // re-derived here -- a second copy of 999 or 1000 in this file is the collision that comment
      // exists to prevent.
      const probe = query.limit + 1;
      params.set("limit", String(probe));

      const token = await mintToken({
        secret: config.jwtSecret,
        role: "authenticated",
        workspaceId: query.workspaceId,
        now: (config.now ?? (() => new Date()))(),
      });

      const body = await callPostgrest(config, {
        path: `/rest/v1/envelope_rows?${params.toString()}`,
        token,
      });

      if (!Array.isArray(body)) {
        throw new StoreError("the database answered a row read with something other than a list", "upstream", 200);
      }
      if (body.length > probe) {
        // Impossible if the `limit` parameter arrived. That is the value: a read that lost its limit
        // returns up to `max_rows` and no cursor, which is a truncated answer reported as complete.
        // Checking the count is how a dropped parameter fails instead of under-reporting.
        throw new StoreError(
          `the database returned ${body.length} rows for a limit of ${probe}; refusing a page whose bound was not applied`,
          "upstream",
          200,
        );
      }

      const hasMore = body.length > query.limit;
      const page = body.slice(0, query.limit);
      return {
        rows: page.map(toEnvelopeRow),
        // The cursor is built from the LAST ROW RETURNED, not from the probe row: the probe is the
        // first row of the next page and must be handed out again, not skipped past.
        nextCursor: hasMore ? encodeCursor(boundary(page[page.length - 1])) : null,
      };
    },
  };
}

/**
 * The four keyset columns of a row, or a refusal.
 *
 * A row that cannot produce a cursor cannot be paged past. The alternative -- returning
 * `nextCursor: null` and stopping -- drops every remaining page silently and reports the short
 * answer as the whole answer, which is the exact failure `performance.ts` refuses an unparseable row
 * to avoid. So it is an error, and it is the same class of error as that one.
 */
function boundary(row: unknown): { d: string; a: string; e: string; w: string | null } {
  const r = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
  const { date, account_id, entity_id, attribution_window } = r;
  if (typeof date !== "string" || typeof account_id !== "string" || typeof entity_id !== "string") {
    throw new StoreError(
      "cannot page past the last row: it carries no usable date, account or entity. Returning " +
        "the page without a cursor would report a partial result as a complete one.",
      "upstream",
      200,
    );
  }
  return {
    d: date,
    a: account_id,
    e: entity_id,
    w: typeof attribution_window === "string" ? attribution_window : null,
  };
}
