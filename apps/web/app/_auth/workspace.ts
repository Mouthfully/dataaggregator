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
 * The workspace's envelope rows for a span.
 *
 * Same shape of argument as `/v1/performance`, and the same reason for the shape: the workspace is
 * NOT a parameter. It arrives from the credential -- here, the session -- because accepting it from
 * the caller would make cross-tenant access a matter of typing a different id.
 */
export async function performanceRows(from: string, to: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("envelope_rows")
    .select("source, entity_id, date, attribution_window, is_provisional, fetched_at")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .limit(100);

  return error ? { rows: [], error: error.code ?? "unknown" } : { rows: data ?? [], error: null };
}
