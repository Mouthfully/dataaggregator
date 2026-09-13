/**
 * CRON DISPATCH, in its own module.
 *
 * This lived in `src/webhooks.ts`, whose `ScheduledDeps` carried a `WebhookStore` and whose module
 * comment is entirely about the delivery drain. Growing an ingest branch there would have put a
 * scheduler store, a credential-encryption key and a WooCommerce client inside the webhook file --
 * three things it has no business knowing about. The two cron strings stay where they are defined,
 * in `webhooks.ts`, and are imported here.
 *
 * TWO REFUSALS ARE CARRIED OVER VERBATIM, because both are load-bearing:
 *
 *   AN UNKNOWN CRON IS REPORTED, never ignored. A schedule added to `wrangler.jsonc` and forgotten
 *   here would run on its interval forever, invisibly, doing nothing.
 *
 *   A MISSING STORE SAYS `not_configured` AND NAMES WHAT IS ABSENT. A deployment that cannot reach
 *   its database must not be indistinguishable from a platform with no work to do.
 *
 * AND ONE IS ADDED, in the other direction. The existing test asserted that every cron in
 * `wrangler.jsonc` is one the handler dispatches. The reverse was never checked, so a cron HANDLED
 * but never DECLARED passed silently -- a scheduled job that exists in code and never fires.
 * `scheduled.test.ts` asserts both directions.
 */

import {
  DELIVER_CRON,
  PRUNE_CRON,
  type ScheduledDeps as WebhookScheduledDeps,
  type ScheduledOutcome as WebhookScheduledOutcome,
  handleScheduled as handleWebhookCron,
} from "./webhooks.js";
import { type SweepDeps, type SweepOutcome, sweepDueConnections } from "./scheduled-ingest.js";

/**
 * The ingest sweep's schedule, and the interval is a VERIFIED CONSTRAINT rather than a preference.
 *
 * Cloudflare's Workers limits, read 2026-09-13 at developers.cloudflare.com/workers/platform/limits:
 * CPU time per Cron Trigger is **30 seconds for an interval under one hour** and **15 minutes for
 * an interval of one hour or more**, on Workers Paid. Wall clock is 15 minutes either way, which is
 * where `app.claim_lease_interval()`'s fifteen minutes came from and it is still correct.
 *
 * A sweep opens an AES-GCM credential, pages a merchant's store, normalises orders and writes
 * envelope rows. That does not fit in 30 seconds of CPU, so an interval under an hour would be
 * killed mid-run WITH A LEASE HELD, stranding the connection for the rest of the lease window with
 * a log line that says nothing about why. Daily is the product's own cadence anyway.
 *
 * THIS REQUIRES WORKERS PAID. On Workers Free the ceiling is 10 ms of CPU per Cron Trigger, which
 * no real pull fits inside, and Free also caps Cron Triggers at 5 per ACCOUNT with two already
 * declared. That is a bill, not an engineering decision, and it is recorded in the design note.
 */
export const INGEST_CRON = "23 2 * * *";

export type ScheduledOutcome =
  | WebhookScheduledOutcome
  | { readonly status: "swept"; readonly sweep: SweepOutcome };

export interface ScheduledDeps extends WebhookScheduledDeps {
  /**
   * Null when this deployment cannot reach the database as `app_scheduler`. Reported rather than
   * assumed, the same way the webhook store is.
   */
  readonly sweep: SweepDeps | null;
}

export async function handleScheduled(
  cron: string,
  deps: ScheduledDeps,
): Promise<ScheduledOutcome> {
  if (cron === INGEST_CRON) {
    if (deps.sweep === null) {
      return {
        status: "not_configured",
        reason:
          "no scheduler binding: the sweep, the work list and their contracts are implemented and " +
          "tested, but SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET or CREDENTIAL_KEK is " +
          "not set on this deployment",
      };
    }
    return { status: "swept", sweep: await sweepDueConnections(deps.sweep) };
  }

  // The webhook half decides its own two, including the unknown-cron refusal. A cron that is
  // neither the ingest one nor one of its two lands there and is reported by name.
  return await handleWebhookCron(cron, deps);
}

/** Every cron this handler dispatches. `scheduled.test.ts` asserts this equals `wrangler.jsonc`. */
export const HANDLED_CRONS: readonly string[] = [DELIVER_CRON, PRUNE_CRON, INGEST_CRON];
