import { supabaseServer } from "../_auth/server";

/**
 * THE WORKSPACE'S CONNECTIONS, READ THE ONLY WAY THIS APP READS ANYTHING.
 *
 * NO WORKSPACE PREDICATE, and that is the repository's first principle rather than a shortcut.
 * `connections_select` is `using (app.can_read_workspace(workspace_id))`, which resolves through
 * `members` against the `sub` of this session's verified token, so the rows that come back are
 * exactly the ones this person may see. A `.eq("workspace_id", ...)` here would be a SECOND place
 * tenancy is decided -- the one that eventually disagrees with the policy, and the one a policy
 * audit cannot see because it lives in a React file. `_auth/workspace.ts` says the same thing about
 * `workspaces` and `envelope_rows`; this is the same rule on the table that holds the credentials.
 *
 * EVERY COLUMN BELOW WAS READ OFF THE MIGRATIONS, not assumed:
 *
 *   provider, credential_lane, external_account_id, display_name, status
 *                          `20260908000500_connections.sql`, `20260912000100_credential_lane.sql`
 *   timezone               `20260912000400_connection_timezone.sql`
 *   last_backfill_at       `20260908000500_connections.sql`, written by `app.record_backfill`
 *
 * `last_backfill_at` IS "WHEN WAS THIS LAST READ" AND `ingest_checkpoint` IS NOT.
 * `20260913000100_ingest_watermark.sql` separates them by name: the checkpoint is how far the walk
 * has reached -- a position in the merchant's data -- while `last_backfill_at` is stamped at the
 * END of a run that succeeded, which is the question the screen asks. `record_backfill` advances it
 * only `when p_succeeded`, so a failed pull leaves it where it was and the screen says the last
 * time data actually arrived rather than the last time something tried.
 *
 * THE CIPHERTEXT COLUMNS ARE NOT SELECTED. Nothing on this page can use them, they are useless
 * without the KEK that lives in the Worker, and a column that is never fetched cannot end up in an
 * RSC payload, a log line or a page cache.
 */

/** Selected explicitly, so a column added to the table never silently joins the page. */
export const CONNECTION_COLUMNS = [
  "id",
  "provider",
  "credential_lane",
  "external_account_id",
  "display_name",
  "status",
  "timezone",
  "last_backfill_at",
  "created_at",
] as const;

/**
 * One connection row as this screen reads it.
 *
 * `status` AND `provider` ARE PLAIN STRINGS ON PURPOSE. Both are Postgres enums that PostgREST
 * serialises as text, and this app cannot import the package that owns their TypeScript twins (see
 * `_providers.ts`). Narrowing them here would mean a second copy of two vocabularies; instead the
 * value is rendered through a label lookup that falls back to the stored value, so a member added
 * to `app.connection_status` shows up as itself rather than as an empty cell or a wrong word.
 */
export interface ConnectionListRow {
  readonly id: string;
  readonly provider: string;
  readonly credential_lane: string;
  readonly external_account_id: string;
  readonly display_name: string | null;
  readonly status: string;
  /** Null means nobody has told us the store's zone -- never UTC. `/v1/ingest/run` refuses it. */
  readonly timezone: string | null;
  /** When a pull last FINISHED successfully. Null means no pull has ever completed. */
  readonly last_backfill_at: string | null;
  readonly created_at: string;
}

export type ConnectionsResult =
  | { readonly kind: "ready"; readonly rows: readonly ConnectionListRow[] }
  /** The read failed. NOT the same as a workspace with no connections, and never shown as one. */
  | { readonly kind: "unavailable"; readonly reason: string };

export async function workspaceConnections(): Promise<ConnectionsResult> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("connections")
    .select(CONNECTION_COLUMNS.join(", "))
    .order("created_at", { ascending: false })
    .limit(100);

  // The database's own message names tables and policies. A signed-in customer is not its reader,
  // and an empty list in its place would be a claim about their account made from a fault.
  if (error) return { kind: "unavailable", reason: error.code ?? "unknown" };

  // The cast claims only what the table's NOT NULL constraints already guarantee. Every nullable
  // column above is typed nullable.
  return { kind: "ready", rows: (data ?? []) as unknown as readonly ConnectionListRow[] };
}
