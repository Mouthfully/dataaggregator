/**
 * THE SCHEDULED HALF, GIVEN AN IDENTITY IT CAN USE.
 *
 * `app_scheduler` has existed since `20260908001000_scheduler.sql` and nothing has ever called one
 * of its three functions, because nothing could: they live in schema `app`, which
 * `supabase/config.toml` deliberately does not expose to PostgREST, and this file could not even
 * mint a token naming the role. `20260912000800_scheduler_entry_point.sql` put three forwarders in
 * `public` and granted them to `app_scheduler` alone; this is the adapter that speaks to them.
 *
 * THE SAME TRANSPORT AS EVERY OTHER ADAPTER HERE, and for the same reason: PostgREST with a minted
 * HS256 token, no client library, no service-role key. The alternative -- a direct connection
 * through Hyperdrive -- stays the deferred answer that `postgrest.ts` names for the webhook drain,
 * and it is what would eventually stop `SUPABASE_JWT_SECRET` being the whole boundary.
 *
 * WHAT THIS ADAPTER CANNOT DO, WHICH IS MOST OF WHAT MAKES IT SAFE. It cannot read a credential:
 * the work list returns scheduling metadata and the role holds no grant on `public.connections`, so
 * the ciphertext is not merely unreturned, it is unreachable. Enumeration and access are
 * deliberately different privileges, and the pull that follows a claim fetches the credential
 * through `connections.ts` -- as `authenticated`, under row-level security, for the one workspace
 * it has just been told it is acting for.
 *
 * AND IT CANNOT SUPPLY A CLOCK. The `app.` functions take `p_now` so the SQL suite can drive a
 * fixed timeline; the wrappers take none. A future clock passed over the network makes every live
 * lease look abandoned, which turns the lease -- the only thing standing between two overlapping
 * cron ticks and a double-spent platform quota -- into a formality. So there is no `now` parameter
 * on any method here, and `config.now` is used for the token's `iat`/`exp` and nothing else.
 */

import { PROVIDER_LANES } from "@repo/connections";

import { mintToken } from "./jwt.js";
import { type PostgrestConfig, StoreError, callPostgrest } from "./postgrest.js";

/**
 * The largest work list the wrapper will hand out, mirrored from the migration.
 *
 * A limit above this is REFUSED at both ends rather than clamped at either, and the reason is worth
 * repeating here because this is the end an operator reads: a clamped limit returns fewer rows than
 * were asked for and says nothing, and a scheduler cannot tell a short answer from a finished one.
 * It would conclude the sweep was complete and leave real work unpulled, every tick. Checking it
 * here as well costs one comparison and turns a PostgREST 400 into a message naming the ceiling.
 */
export const MAX_DUE_LIMIT = 500;

/**
 * One row of the work list.
 *
 * EXACTLY THE SIX COLUMNS THE WRAPPER RETURNS. This is not a convenience shape: it is asserted
 * against the database in `supabase/tests/13_scheduler_entry_point.sql`, and a seventh column
 * appearing there fails that test AND is refused by `toDueConnection` below. Both directions,
 * because the thing being prevented is a well-meaning widening -- `external_account_id` is the
 * column somebody adds first, since it reads like metadata and is the thing you authenticate as.
 */
export interface DueConnection {
  readonly connectionId: string;
  readonly workspaceId: string;
  readonly organisationId: string;
  /**
   * VERBATIM, AND NOT NARROWED TO `ConnectionProvider`. `connections.ts` refuses a provider this
   * build cannot drive, and is right to: it is reading ONE row it was asked for, and carrying an
   * unknown value into a pull would surface hours later as an undefined lookup.
   *
   * The work list is the opposite situation. It spans every tenant, so one row naming `impact` --
   * a member of `app.connection_provider` with no connector in this repository -- would abort the
   * ENTIRE sweep and stop every other tenant's backfill. A cross-tenant read must not be
   * refusable by one tenant's data. So the value travels as written and `drivable` says whether
   * this build has a connector for it.
   */
  readonly provider: string;
  /**
   * Whether this build can actually pull it, from `PROVIDER_LANES` rather than a hand-written list
   * -- the same source `connections.ts` narrows against, so a sixth provider added there is
   * accepted here the same day.
   *
   * Reported rather than filtered out. A silently dropped row is a connection that is never pulled
   * and never mentioned, which is indistinguishable from one that does not exist; the caller can
   * skip it, but it has to be told there is something to skip.
   */
  readonly drivable: boolean;
  /** Null means never pulled. */
  readonly lastBackfillAt: string | null;
  /**
   * NULL IS A REAL ANSWER HERE, and making it one was a bug fix rather than a widening.
   *
   * `connections.restatement_window_days` is `integer` with no default and a check constraint that
   * explicitly permits null -- and NOTHING IN THIS REPOSITORY WRITES IT. `scripts/seal-connection.ts`
   * is the only path that creates a connection and it omits the column, so every real row carries
   * null today.
   *
   * This field used to be `number`, and `toDueConnection` threw on anything that was not an
   * integer. `due()` maps every row through it, so THE FIRST REAL CONNECTION WOULD HAVE ABORTED
   * EVERY SWEEP, for every tenant, before a single lease was taken -- breaking the rule stated a
   * few lines above on `provider`, in this same file: "a cross-tenant read must not be refusable by
   * one tenant's data."
   *
   * So a null travels, the way an undrivable provider travels, and the caller decides. A non-null
   * value that is not an integer is still refused, because that is a database returning something
   * the column cannot hold.
   *
   * NOT DEFAULTED TO A NUMBER, and that is the important half. `google_ads` is `perAccount: true`
   * with a per-conversion-action window; a hardcoded fallback would silently re-read the wrong span
   * and every row it produced would look correct. For the one source this build can drive the
   * question does not even arise -- `RESTATEMENT_CLOCKS.woocommerce.windowDays` is null, because
   * restatements there are caught by a `modified_after` pull rather than by a ladder.
   */
  readonly restatementWindowDays: number | null;
}

export interface SchedulerStorePort {
  /** The work list, oldest first. Scheduling metadata only. */
  due(limit?: number): Promise<readonly DueConnection[]>;
  /** Take the lease. False means another instance holds it; that is an outcome, not an error. */
  claim(connectionId: string, claimedBy: string): Promise<boolean>;
  /**
   * Close the lease this instance took.
   *
   * `claimedBy` MUST be the same name `claim` was given. The database compares it against
   * `connections.claimed_by` and refuses to close a lease a different instance now holds -- a gap
   * `20260912000800_scheduler_entry_point.sql` recorded as known and unreachable while nothing
   * claimed. Passing a different name here is not an error the type system can catch, so the
   * caller keeps one value and passes it to both calls.
   *
   * `checkpoint` is how far the walk reached, as the instant the completed window CLOSED, or null
   * when the run made no progress. It is advanced ONLY on a successful run.
   */
  recordBackfill(
    connectionId: string,
    succeeded: boolean,
    claimedBy: string,
    checkpoint: string | null,
  ): Promise<RecordedBackfill>;
}

/** What closing a lease reports. `leaseClosed: false` is an outcome, not a failure. */
export interface RecordedBackfill {
  /** The instant the database recorded, which the caller cannot otherwise know. */
  readonly recordedAt: string;
  /**
   * False means another instance holds this lease now. The pull that just ran is not invalidated by
   * it -- the rows are written -- but the caller must not report a closed lease, and an operator
   * needs to know two instances were on one connection.
   */
  readonly leaseClosed: boolean;
}

const DRIVABLE: ReadonlySet<string> = new Set(Object.keys(PROVIDER_LANES));

/**
 * The keys a work-list row may carry, and the refusal that makes the column set load-bearing.
 *
 * A migration that widened `public.due_connections` would not fail anything in this package without
 * this -- the extra field would simply be ignored, and a credential column would sit in a response
 * body, in a log, in an error payload, having passed through a scheduler that is designed on the
 * premise that it never sees one. So an unknown key is refused outright rather than dropped.
 */
const DUE_KEYS: ReadonlySet<string> = new Set([
  "connection_id",
  "workspace_id",
  "organisation_id",
  "provider",
  "last_backfill_at",
  "restatement_window_days",
]);

function requiredText(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value === "") {
    throw new StoreError(
      `the work list returned a row with no ${column}; refusing an incomplete row rather than ` +
        "claiming a lease against an identifier that is not one.",
      "upstream",
      200,
    );
  }
  return value;
}

/**
 * One wire row to a `DueConnection`, or a refusal.
 *
 * Exported for the tests, which assert the mapping rather than a round trip -- same posture and
 * same reason as `toIngestRow` and `toConnectionRecord`.
 */
export function toDueConnection(row: unknown): DueConnection {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    throw new StoreError("the work list contained something that is not a row", "upstream", 200);
  }
  const r = row as Record<string, unknown>;

  const unexpected = Object.keys(r).filter((key) => !DUE_KEYS.has(key));
  if (unexpected.length > 0) {
    // THE CREDENTIAL GUARD, and it is deliberately a refusal and not a filter. The scheduler's
    // whole design rests on the work list carrying no credential material; a column that arrived
    // unannounced is a change to that premise, and reading around it would let the premise be
    // false while everything still appeared to work.
    throw new StoreError(
      `the work list returned ${unexpected.length} column(s) this build does not expect ` +
        `(${unexpected.join(", ")}). The scheduler is granted enumeration and not access, so a ` +
        "widened work list is refused rather than read past.",
      "upstream",
      200,
    );
  }

  const provider = requiredText(r, "provider");
  // Null travels; see the note on `DueConnection.restatementWindowDays`. A non-null value that is
  // not an integer is still refused -- that is the column returning something it cannot hold, which
  // is a defect rather than an unset field.
  const raw = r.restatement_window_days;
  const windowDays = raw === null || raw === undefined ? null : raw;
  if (windowDays !== null && (typeof windowDays !== "number" || !Number.isInteger(windowDays))) {
    throw new StoreError(
      "the work list returned a non-integer restatement_window_days; that number decides how far " +
        "back a pull reaches, and it is not a value to guess.",
      "upstream",
      200,
    );
  }

  return {
    connectionId: requiredText(r, "connection_id"),
    workspaceId: requiredText(r, "workspace_id"),
    organisationId: requiredText(r, "organisation_id"),
    provider,
    drivable: DRIVABLE.has(provider),
    lastBackfillAt: typeof r.last_backfill_at === "string" ? r.last_backfill_at : null,
    restatementWindowDays: windowDays,
  };
}

/** One token per call, minted for the role and carrying no workspace claim. See `jwt.ts`. */
async function schedulerToken(config: PostgrestConfig): Promise<string> {
  return mintToken({
    secret: config.jwtSecret,
    role: "app_scheduler",
    now: (config.now ?? (() => new Date()))(),
  });
}

export function createSchedulerStore(config: PostgrestConfig): SchedulerStorePort {
  return {
    async due(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DUE_LIMIT) {
        throw new StoreError(
          `a work list of ${limit} was asked for; the ceiling is ${MAX_DUE_LIMIT}. Refusing ` +
            "rather than clamping: a short list a scheduler cannot distinguish from a finished " +
            "one leaves work unpulled every tick.",
          "unsupported_query",
        );
      }

      const body = await callPostgrest(config, {
        path: "/rest/v1/rpc/due_connections",
        method: "POST",
        token: await schedulerToken(config),
        action: "read",
        body: { p_limit: limit },
      });

      if (!Array.isArray(body)) {
        throw new StoreError(
          "the database answered the work list with something other than a list",
          "upstream",
          200,
        );
      }

      return body.map(toDueConnection);
    },

    async claim(connectionId, claimedBy) {
      if (connectionId === "") {
        throw new StoreError("a lease needs a connection to be taken on", "invalid_row");
      }
      const who = claimedBy.trim();
      if (who === "") {
        // The wrapper refuses this too. Refusing here as well means the message names the reason
        // rather than arriving as a PostgREST 400 with a SQLSTATE in it.
        throw new StoreError(
          "a lease must name the instance taking it; an anonymous lease cannot be attributed " +
            "when a connection is found stuck.",
          "invalid_row",
        );
      }
      if (who.length > 200) {
        throw new StoreError("the instance name is longer than 200 characters", "invalid_row");
      }

      const answer = await callPostgrest(config, {
        path: "/rest/v1/rpc/claim_connection",
        method: "POST",
        token: await schedulerToken(config),
        action: "write",
        body: { p_connection_id: connectionId, p_claimed_by: who },
      });

      if (typeof answer !== "boolean") {
        // A CLAIM THAT IS NOT A DEFINITE YES MUST NEVER BE READ AS YES. Anything truthy-but-unknown
        // treated as a taken lease is two instances pulling one connection and spending a platform
        // quota shared across every tenant twice -- which `10-credential-model.md` prices as
        // halving the number of accounts one developer token supports.
        throw new StoreError(
          `the database answered a claim with ${JSON.stringify(answer)} rather than a boolean; ` +
            "refusing to read that as a lease taken.",
          "upstream",
          200,
        );
      }

      return answer;
    },

    async recordBackfill(connectionId, succeeded, claimedBy, checkpoint) {
      if (connectionId === "") {
        throw new StoreError("a lease needs a connection to be closed on", "invalid_row");
      }
      const who = claimedBy.trim();
      if (who === "") {
        // The same refusal `claim` makes, for a sharper reason: an empty name would make the
        // database's ownership check a clause that matches nothing, so every close would silently
        // report a lost lease.
        throw new StoreError(
          "closing a lease must name the instance that took it; without it the ownership check " +
            "cannot be made.",
          "invalid_row",
        );
      }
      if (checkpoint !== null && Number.isNaN(Date.parse(checkpoint))) {
        throw new StoreError(
          `the checkpoint ${JSON.stringify(checkpoint)} is not a timestamp; refusing to advance a ` +
            "watermark to a value the next walk would resume from.",
          "invalid_row",
        );
      }

      const answer = await callPostgrest(config, {
        path: "/rest/v1/rpc/record_backfill",
        method: "POST",
        token: await schedulerToken(config),
        action: "write",
        body: {
          p_connection_id: connectionId,
          p_succeeded: succeeded,
          p_claimed_by: who,
          p_checkpoint: checkpoint,
        },
      });

      // The wrapper returns two facts and both are load-bearing: the instant it recorded, which
      // decides whether this connection is due again tomorrow, and whether the lease was still
      // ours. A shape that is not that object means the call did not reach the function it was
      // aimed at, and reporting a closed lease on that basis strands the connection for the rest of
      // the lease window with nothing said.
      if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
        throw new StoreError(
          `closing a lease answered with ${JSON.stringify(answer)} rather than an object; ` +
            "refusing to report a lease closed on that.",
          "upstream",
          200,
        );
      }
      const record = answer as Record<string, unknown>;
      const recordedAt = record.recorded_at;
      const leaseClosed = record.lease_closed;
      if (typeof recordedAt !== "string" || Number.isNaN(Date.parse(recordedAt))) {
        throw new StoreError(
          `closing a lease answered with ${JSON.stringify(recordedAt)} rather than the instant it ` +
            "recorded; refusing to report a lease closed on that.",
          "upstream",
          200,
        );
      }
      if (typeof leaseClosed !== "boolean") {
        // Anything truthy-but-unknown read as a closed lease hides the one case this field exists
        // for: two instances on one connection.
        throw new StoreError(
          `closing a lease answered with ${JSON.stringify(leaseClosed)} rather than a boolean for ` +
            "whether the lease was still ours.",
          "upstream",
          200,
        );
      }

      return { recordedAt, leaseClosed };
    },
  };
}
