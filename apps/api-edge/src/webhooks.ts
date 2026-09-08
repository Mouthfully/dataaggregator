/**
 * THE SCHEDULED HALF OF THE WORKER.
 *
 * `27-webhook-delivery.md` built the drain and said what was missing: nothing invoked it. This is
 * the invocation -- two crons, one that delivers and one that prunes -- and it follows the same
 * posture as `/v1/performance` rather than inventing a second one.
 *
 * THE STORE IS A PORT AND IS NOT BOUND. Whether the events arrive over PostgREST with a minted
 * role JWT or over a direct connection through Hyperdrive is a decision that cannot be made
 * honestly against a Supabase project that does not exist. So the handler resolves what it has,
 * says exactly what is missing when something is, and never pretends: a scheduled run that silently
 * does nothing is indistinguishable from one that had nothing to do, and only one of those is fine.
 *
 * TWO REFUSALS, both of which are the point of this file existing at all.
 *
 *   An UNKNOWN CRON is reported, never ignored. A schedule added to `wrangler.jsonc` and forgotten
 *   here would otherwise be an invisible no-op running every minute forever.
 *
 *   A MISSING SIGNING KEY stops delivery rather than falling back. `deriveSecret` already refuses
 *   an empty key; catching it here means the run reports "not configured" instead of failing every
 *   event in the batch and burning six attempts each on a deployment mistake.
 */

import {
  type DeliveryPorts,
  type DeliveryReport,
  type DueEvent,
  deliverBatch,
  fetchSend,
} from "@repo/webhooks";

/** Every minute. Restatements are detected during a nightly backfill; the alert should not wait. */
export const DELIVER_CRON = "* * * * *";

/**
 * Daily, at an arbitrary minute rather than on the hour. A prune is garbage collection with no
 * deadline, and every scheduled job in the world runs at :00.
 */
export const PRUNE_CRON = "17 3 * * *";

/**
 * What the Worker needs from the database. Deliberately three methods: anything wider would invite
 * the scheduled handler to grow queries of its own, and the whole privilege model rests on the
 * delivery role's vocabulary being `app.due_restatement_events`, `app.record_delivery` and
 * `app.prune_restatement_events` and nothing else.
 */
export interface WebhookStore {
  claim(limit: number): Promise<readonly DueEvent[]>;
  record(eventId: string, ok: boolean, status?: number, error?: string): Promise<void>;
  prune(limit: number): Promise<number>;
}

export interface ScheduledDeps {
  readonly store: WebhookStore | null;
  readonly signingKey: string | null;
  readonly send?: DeliveryPorts["send"];
  readonly now?: () => Date;
}

export type ScheduledOutcome =
  | { readonly status: "delivered"; readonly report: DeliveryReport }
  | { readonly status: "pruned"; readonly removed: number }
  | { readonly status: "not_configured"; readonly reason: string }
  | { readonly status: "unknown_cron"; readonly cron: string };

export async function handleScheduled(
  cron: string,
  deps: ScheduledDeps,
): Promise<ScheduledOutcome> {
  if (cron !== DELIVER_CRON && cron !== PRUNE_CRON) {
    return { status: "unknown_cron", cron };
  }

  if (deps.store === null) {
    return {
      status: "not_configured",
      reason:
        "no store binding: the delivery loop and its contract are implemented and tested, but the " +
        "database connection is not configured on this deployment",
    };
  }

  if (cron === PRUNE_CRON) {
    return { status: "pruned", removed: await deps.store.prune(5000) };
  }

  if (deps.signingKey === null || deps.signingKey.length === 0) {
    // Refused before claiming, so nothing is leased and then dropped. A batch signed with nothing
    // would fail every event and cost six attempts each for a missing environment variable.
    return {
      status: "not_configured",
      reason: "no webhook signing key: refusing to claim events that could not then be signed",
    };
  }

  const store = deps.store;
  const ports: DeliveryPorts = {
    claim: (limit) => store.claim(limit),
    send: deps.send ?? fetchSend(),
    record: (id, ok, status, error) => store.record(id, ok, status, error),
    now: deps.now ?? (() => new Date()),
  };
  const report = await deliverBatch(ports, { serviceKey: deps.signingKey });
  return { status: "delivered", report };
}
