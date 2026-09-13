import { METRICS, type MetricName } from "@repo/contract";

import { supabaseServer } from "./server";

/**
 * THE SIGNED-IN MEMBER'S WORKSPACE, AND WHAT HAPPENS WHEN THERE ISN'T ONE.
 *
 * NOTE WHAT THIS QUERY DOES NOT DO: it does not filter by user, organisation or membership. It
 * selects from `workspaces` with no predicate at all, and row-level security returns exactly the
 * rows this session may see -- `app.can_read_workspace()` resolves through `members` against
 * `app.current_user_id()`, which is the `sub` of the verified session token.
 *
 * That is deliberate and it is the house rule: RLS does tenancy, not application code. A
 * `.eq("user_id", user.id)` here would be a SECOND place tenancy is decided, and the one that
 * eventually disagrees with the first -- while also being invisible in a policy audit, because it
 * lives in a React file.
 *
 * A NEW ACCOUNT HAS NO WORKSPACE. `create_organisation` is what makes the first one, and nothing
 * calls it yet, so `needsOrganisation` is a real state rather than an error: a person who has just
 * signed in correctly has nowhere to look at data. The dashboard says so instead of rendering an
 * empty shell that looks broken.
 */

export interface WorkspaceRef {
  readonly id: string;
  readonly name: string;
}

export type WorkspaceState =
  | { readonly kind: "ready"; readonly workspace: WorkspaceRef }
  | { readonly kind: "needsOrganisation" }
  | { readonly kind: "unavailable"; readonly reason: string };

export async function currentWorkspace(): Promise<WorkspaceState> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    // The database's own message is not surfaced. It names tables and policies, and a signed-in
    // customer is not the right reader for either.
    return { kind: "unavailable", reason: error.code ?? "unknown" };
  }

  const first = data?.[0];
  if (!first) return { kind: "needsOrganisation" };
  return { kind: "ready", workspace: { id: first.id as string, name: first.name as string } };
}

/**
 * THE METRIC COLUMNS, READ OFF THE DICTIONARY RATHER THAN TYPED OUT HERE.
 *
 * `packages/contract`'s `METRICS` is the canonical list -- section 13.3 rule 1: a new metric is a
 * change to that file first. Spelling the twelve names again in this select would create a second
 * list, and the failure mode of the second list is silent in BOTH directions: a metric added there
 * and missing here is a column the dashboard can never show, and a name typed wrong here is a
 * PostgREST error that empties the table rather than one that names the typo.
 *
 * Each name is also a column of `public.envelope_rows` -- verified against
 * `20260908001100_envelope_rows.sql` and `20260912000200_position.sql`, which is where the other
 * half of this agreement lives. `check-dictionary.mjs` is what keeps the two from drifting.
 */
const METRIC_COLUMNS: readonly MetricName[] = Object.keys(METRICS) as MetricName[];

/**
 * The row's identity, its unit, and the three fields that say how sure the figure is.
 *
 * `currency` IS NOT OPTIONAL HERE. Every currency metric in the dictionary is an amount in the
 * currency stored on its own row, and a converted row carries the rate that produced it. Rendering
 * `revenue` without it would be a number whose unit the reader supplies from habit -- which for
 * most readers is dollars, and for most rows will not be.
 *
 * `is_provisional` and `fetched_at` were already selected and already unused. They are the whole
 * reason the envelope exists: a figure that does not say whether it is still moving, and when it
 * was read, is the kind of confident wrong number this product is sold against.
 */
const DIMENSION_COLUMNS = [
  "source",
  "entity_id",
  "date",
  "currency",
  "attribution_window",
  "is_provisional",
  "fetched_at",
] as const;

/** Exported so a test can assert that no dictionary metric has fallen out of the select. */
export const PERFORMANCE_COLUMNS: readonly string[] = [...DIMENSION_COLUMNS, ...METRIC_COLUMNS];

/**
 * One envelope row as the dashboard reads it.
 *
 * EVERY METRIC IS `unknown`, DELIBERATELY. PostgREST serialises `numeric` as a JSON number today,
 * but the column is `numeric(20, 6)` and a driver or a PostgREST version that returns it as a
 * string would make `row.revenue ?? 0` compile and lie. Typing the metrics as `unknown` forces
 * every read through `readFigure` in `../dashboard/_figures`, which is the one place that decides
 * what is a number, what is absent, and what is neither.
 */
export type PerformanceRow = {
  readonly source: string;
  readonly entity_id: string;
  readonly date: string;
  readonly currency: string;
  readonly attribution_window: string | null;
  readonly is_provisional: boolean;
  readonly fetched_at: string;
} & { readonly [K in MetricName]: unknown };

export interface PerformanceResult {
  readonly rows: readonly PerformanceRow[];
  readonly error: string | null;
}

/**
 * The workspace's envelope rows for a span.
 *
 * Same shape of argument as `/v1/performance`, and the same reason for the shape: the workspace is
 * NOT a parameter. It arrives from the credential -- here, the session -- because accepting it from
 * the caller would make cross-tenant access a matter of typing a different id.
 *
 * STILL NO WORKSPACE PREDICATE, and the metric columns do not change that. `can_read_workspace()`
 * on `envelope_rows` returns this session's rows and nothing else; a `.eq("workspace_id", ...)`
 * added alongside these columns would be the second place tenancy is decided and the one a policy
 * audit cannot see.
 */
export async function performanceRows(from: string, to: string): Promise<PerformanceResult> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("envelope_rows")
    .select(PERFORMANCE_COLUMNS.join(", "))
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .limit(100);

  if (error) return { rows: [], error: error.code ?? "unknown" };

  // The cast claims only what the table's own NOT NULL constraints already guarantee for the
  // dimension columns. It claims nothing about the metrics, which stay `unknown` above.
  return { rows: (data ?? []) as unknown as readonly PerformanceRow[], error: null };
}
