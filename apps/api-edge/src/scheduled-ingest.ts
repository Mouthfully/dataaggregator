/**
 * THE SWEEP: the caller the scheduler has never had.
 *
 * `app_scheduler` has existed since `20260908001000_scheduler.sql`, `20260912000800` gave it three
 * forwarders in `public`, `packages/store/src/scheduler.ts` speaks to them and two SQL suites guard
 * them. Nothing has ever called one outside a test. This is what calls them, and it is the
 * difference between a product that says "every morning" and one that has a morning.
 *
 * THE LOOP: `due` -> filter -> `claim` -> `runIngest` -> `recordBackfill`. Five steps, and four of
 * them can decline without that being a failure.
 *
 * ============================================================================================
 * IT GATES ON WHAT `runIngest` CAN DRIVE, NOT ON `drivable`
 * ============================================================================================
 *
 * `DueConnection.drivable` is computed from `PROVIDER_LANES`, which has five members, and it means
 * "this build has a connector for it". `INGEST_SOURCE` is `woocommerce` and `runIngest` raises
 * `unsupported_provider` for the other four. A sweep that trusted `drivable` would claim a GA4
 * connection, fail, release the lease without advancing anything, and be handed the same row on the
 * next tick -- forever. With four undrivable providers ahead of it in the work list's
 * `order by last_backfill_at asc nulls first`, the one connection this build CAN pull might never
 * be reached inside a limit. So the filter is `provider === INGEST_SOURCE`, and it happens BEFORE
 * the claim: a connection that cannot be pulled is never leased.
 *
 * ============================================================================================
 * NOTHING IS SILENTLY DROPPED
 * ============================================================================================
 *
 * Every connection the sweep declines is REPORTED with a reason. `scheduler.ts` states the rule for
 * the row it cannot drive -- "a silently dropped row is a connection that is never pulled and never
 * mentioned, which is indistinguishable from one that does not exist" -- and it applies with more
 * force here, because this is the layer an operator actually reads. A sweep that returns
 * `{ claimed: 0 }` with no reasons is indistinguishable from a platform with no work to do.
 *
 * ============================================================================================
 * THE FIRST WALK IS NOT INVENTED
 * ============================================================================================
 *
 * `runIngest` requires `since`, and `52-ingest-runtime.md` section 4 says why: "A default window on
 * a watermark walk is the worst kind: too short opens a silent hole, too long spends the merchant's
 * store on history it already has, and the operator learns neither." A cron has nobody to suggest a
 * number to, so it does not guess one. A connection whose `ingest_checkpoint` is null is reported
 * as `awaiting_first_run` and skipped; an operator does that pull through `POST /v1/ingest/run`
 * with a window they chose. Automating onboarding is a product decision with a cost, and it is
 * recorded in the migration rather than taken here by picking a constant.
 *
 * ============================================================================================
 * THE INSTANCE NAME IS THE LEASE'S WHOLE ATTRIBUTABILITY
 * ============================================================================================
 *
 * `p_claimed_by` is what an operator reads when a connection is found stuck, and since
 * `20260913000100_ingest_watermark.sql` it is also what the database checks before letting this
 * instance close a lease. A constant like "api-edge" would make every instance look like the same
 * one and turn that ownership check into a clause that always matches -- a guard that passes its
 * test and protects nothing. So it is a fresh uuid per sweep, and the SAME value is passed to
 * `claim` and to `recordBackfill`.
 */

import type { SchedulerStorePort } from "@repo/store";

import { INGEST_SOURCE, IngestRunFailure, type IngestDeps, runIngest } from "./ingest.js";

/**
 * How many connections one sweep will look at.
 *
 * NOT the store's ceiling of 500, and the gap is the point. A fifteen-minute invocation pulling
 * real stores serially will not finish a hundred of them, and a limit the sweep cannot honour is
 * worse than a small one: the connections past the cut are leased, not pulled, and released at the
 * end of the invocation having achieved nothing. This is a number to raise when the sweep is
 * observed finishing early, not before.
 */
export const SWEEP_LIMIT = 25;

/** Why one connection was not pulled. Every one of these reaches the log. */
export type SkipReason =
  /** A provider with a connector in this build, but no backfill driver. */
  | "no_driver"
  /** Never walked, and the sweep does not invent a first window. */
  | "awaiting_first_run"
  /** Another instance holds the lease. Not a failure. */
  | "lease_held_elsewhere";

export interface SkippedConnection {
  readonly connectionId: string;
  readonly provider: string;
  readonly reason: SkipReason;
}

export interface SweptConnection {
  readonly connectionId: string;
  /** The instant the walk reached, which becomes the next run's `since`. */
  readonly checkpoint: string | null;
  readonly rowsWritten: number;
  readonly complete: boolean;
  /**
   * False when another instance held the lease by the time this run finished. The rows are
   * written; what is not true is that this instance still owned the connection.
   */
  readonly leaseClosed: boolean;
  /** Present when the run did not complete. A code, never a payload. */
  readonly failure?: string;
}

export interface SweepOutcome {
  readonly considered: number;
  readonly swept: readonly SweptConnection[];
  readonly skipped: readonly SkippedConnection[];
}

export interface SweepDeps {
  readonly scheduler: SchedulerStorePort;
  /** Everything `runIngest` needs. Reused rather than rebuilt; see the module note. */
  readonly ingest: IngestDeps;
  /**
   * The name this instance takes leases under. Injected so a test can assert that the SAME value
   * reaches `claim` and `recordBackfill` -- the property the database's ownership check rests on.
   */
  readonly instanceName: string;
  readonly limit?: number;
}

/**
 * One sweep.
 *
 * Serial rather than concurrent, deliberately. Each connection is a merchant's own store being
 * paged, and `50-woocommerce-backfill.md` is largely about not amplifying load on a WordPress
 * install serving customers; running five at once multiplies that by five for no gain a scheduled
 * job needs. It also keeps the lease window honest -- with one run in flight, the fifteen minutes
 * belong to one connection.
 */
export async function sweepDueConnections(deps: SweepDeps): Promise<SweepOutcome> {
  const limit = deps.limit ?? SWEEP_LIMIT;
  const due = await deps.scheduler.due(limit);

  const swept: SweptConnection[] = [];
  const skipped: SkippedConnection[] = [];

  for (const connection of due) {
    // BEFORE THE CLAIM. A connection this build cannot pull must never be leased: leasing it and
    // failing is the loop that starves the one connection that can be pulled.
    if (connection.provider !== INGEST_SOURCE) {
      skipped.push({
        connectionId: connection.connectionId,
        provider: connection.provider,
        reason: "no_driver",
      });
      continue;
    }

    // READ AS `authenticated`, FOR ONE WORKSPACE, UNDER ROW-LEVEL SECURITY -- the same path and the
    // same identity that fetches the credential. The checkpoint is per-connection tenant data and
    // deliberately does NOT travel on the work list: `public.due_connections` returns exactly six
    // columns and `13_scheduler_entry_point.sql` asserts that set, because the scheduler is granted
    // enumeration and not access.
    const record = await deps.ingest.connections.read({
      workspaceId: connection.workspaceId,
      connectionId: connection.connectionId,
    });
    const since = record?.ingestCheckpoint ?? null;
    if (since === null) {
      // NEVER WALKED. The sweep does not invent a first window; see the module note.
      skipped.push({
        connectionId: connection.connectionId,
        provider: connection.provider,
        reason: "awaiting_first_run",
      });
      continue;
    }

    const claimed = await deps.scheduler.claim(connection.connectionId, deps.instanceName);
    if (!claimed) {
      // An outcome, not an error: another instance is already pulling this one.
      skipped.push({
        connectionId: connection.connectionId,
        provider: connection.provider,
        reason: "lease_held_elsewhere",
      });
      continue;
    }

    swept.push(await pullOne(connection.connectionId, connection.workspaceId, since, deps));
  }

  return { considered: due.length, swept, skipped };
}

/**
 * One connection, claimed and then released whatever happens.
 *
 * THE LEASE IS CLOSED ON EVERY PATH, and that is what the `try`/`finally` shape is for. A run that
 * throws and leaves a lease held strands the connection for the full fifteen minutes, and the next
 * sweep reports nothing because the row is not offered while it is leased -- a connection that
 * silently stops being pulled, which is this product's worst failure mode because the numbers stay
 * plausible.
 */
async function pullOne(
  connectionId: string,
  workspaceId: string,
  since: string,
  deps: SweepDeps,
): Promise<SweptConnection> {
  let checkpoint: string | null = null;
  let rowsWritten = 0;
  let complete = false;
  let failure: string | undefined;

  try {
    const report = await runIngest({ workspaceId, connectionId, since }, deps.ingest);
    checkpoint = report.checkpoint;
    rowsWritten = report.rowsWritten;
    complete = report.complete;
  } catch (cause) {
    if (cause instanceof IngestRunFailure) {
      // A PARTIAL RUN CARRIES ITS CHECKPOINT FORWARD, and that is safe for a reason specific to this
      // connector rather than a general one. `runIngest` awaits the WRITE of each page before
      // pulling the next and says so: "by the time a checkpoint is offered EVERY PAGE BEHIND IT IS
      // ALREADY IN THE DATABASE". So a failed run's checkpoint is the last chunk read in full,
      // which is where a resume is safe -- not arithmetic nobody checked.
      //
      // Withholding it was the first version of this code, and it had a cost: `last_backfill_at`
      // does not advance on failure, so the connection is re-offered the next night and would have
      // restarted from the same `since` every night forever, never finishing a walk longer than one
      // invocation. `record_backfill` keeps it monotonic with `greatest`.
      checkpoint = cause.report.checkpoint;
      rowsWritten = cause.report.rowsWritten;
      failure = "run_failed";
    } else if (cause instanceof Error) {
      // A CODE, NEVER A MESSAGE. An error message can carry a store URL, a filter value or a
      // merchant's domain, and this string lands in a log line. `IngestError`'s own codes are
      // repository-authored; anything else is reported by its name alone.
      failure = "name" in cause && cause.name === "IngestError" ? "refused" : "unexpected_error";
    } else {
      failure = "unexpected_error";
    }
  }

  const succeeded = failure === undefined && complete;
  // The checkpoint goes either way; `succeeded` decides only whether `last_backfill_at` moves, and
  // therefore whether this connection is offered again tomorrow. A partial run should both resume
  // where it reached AND be retried, which is exactly these two arguments disagreeing.
  const recorded = await deps.scheduler.recordBackfill(
    connectionId,
    succeeded,
    deps.instanceName,
    checkpoint,
  );

  return {
    connectionId,
    checkpoint,
    rowsWritten,
    complete,
    leaseClosed: recorded.leaseClosed,
    ...(failure === undefined ? {} : { failure }),
  };
}
