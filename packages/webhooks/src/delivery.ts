/**
 * DRAINING THE RESTATEMENT OUTBOX.
 *
 * `26-restatement-outbox.md` built detection and left the outbox undrained, which it said plainly
 * was half a feature. This is the other half: claim a batch, sign it, POST it, record what
 * happened.
 *
 * PORTS, NOT A DATABASE CLIENT. The same shape as `apps/api-edge/src/performance.ts`: this module
 * takes `claim`, `send` and `record` and owns none of them. It exists to be testable without a
 * Postgres and without a network, because the properties worth asserting are about what happens
 * when a customer's endpoint is slow, wrong or gone -- and none of those are convenient to produce
 * against a real one.
 *
 * DELIVERY IS AT LEAST ONCE, and the event id is the idempotency key. A worker that POSTs
 * successfully and then dies before recording it will deliver that event again when its claim
 * expires. The alternative -- recording before sending -- loses events instead of duplicating them,
 * and a receiver can dedupe on an id far more easily than it can notice an absence.
 *
 * EVERY CLAIMED EVENT IS RECORDED. A claim not closed sits until its lease expires, which delays
 * the event by the lease and costs a redundant delivery. So `send` throwing, the payload failing
 * its own schema, and `record` itself throwing are all handled rather than allowed to abandon the
 * rest of the batch.
 *
 * THE RETRY SCHEDULE IS NOT HERE. `app.record_delivery` owns it. This module says "it worked" or
 * "it did not"; a worker that computed its own next attempt could schedule it for now and spin.
 */

import { restatementEventSchema } from "@repo/contract";
import { EVENT_ID_HEADER, SIGNATURE_HEADER, deriveSecret, signPayload } from "./signature.js";

/** How long one endpoint gets before its delivery is abandoned and retried later. */
export const DELIVERY_TIMEOUT_MS = 10_000;

/** How many events one drain claims. Bounded by the 15-minute Workflow wall clock, not by taste. */
export const DEFAULT_BATCH = 50;

/** One row of `app.due_restatement_events`. */
export interface DueEvent {
  readonly eventId: string;
  readonly endpointId: string;
  readonly endpointUrl: string;
  readonly secretVersion: number;
  readonly workspaceId: string;
  readonly attempts: number;
  readonly payload: unknown;
}

export interface SendResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
}

export interface DeliveryPorts {
  /** `app.due_restatement_events`. Claims a lease as a side effect. */
  claim(limit: number): Promise<readonly DueEvent[]>;
  send(request: {
    url: string;
    body: string;
    headers: Record<string, string>;
    timeoutMs: number;
  }): Promise<SendResult>;
  /** `app.record_delivery`. */
  record(eventId: string, ok: boolean, status?: number, error?: string): Promise<void>;
  now(): Date;
}

export interface DeliveryReport {
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
  /** Refused before sending, because the payload did not satisfy the contract. */
  readonly invalid: number;
  /** Sent or failed, but the outcome could not be written down. These will be delivered again. */
  readonly unrecorded: number;
}

/** The canonical body. One place, so the signature covers exactly the bytes that are sent. */
function serialise(payload: unknown): string {
  return JSON.stringify(payload);
}

/**
 * Drain one batch.
 *
 * Sequential rather than concurrent, deliberately. Concurrency here would fan out to customer
 * endpoints faster than any of them asked to be called, and the batch is already bounded; the
 * throughput knob that matters is how often the worker runs, not how hard one run pushes.
 */
export async function deliverBatch(
  ports: DeliveryPorts,
  options: { serviceKey: string; limit?: number; timeoutMs?: number },
): Promise<DeliveryReport> {
  const events = await ports.claim(options.limit ?? DEFAULT_BATCH);

  let delivered = 0;
  let failed = 0;
  let invalid = 0;
  let unrecorded = 0;

  for (const event of events) {
    let ok = false;
    let status: number | undefined;
    let error: string | undefined;

    // VALIDATED BEFORE IT IS SENT. The payload is built in SQL, and the contract is the only thing
    // that knows what an event must look like. A malformed event delivered to a customer is worse
    // than one that never arrives, so this refuses rather than sends -- and the refusal is recorded
    // as a failure, which means a producer bug exhausts the retry schedule and dead-letters with
    // its reason in `last_error` rather than being dropped silently.
    const parsed = restatementEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      invalid += 1;
      error = `payload does not satisfy the contract: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`;
    } else {
      const body = serialise(parsed.data);
      const secret = await deriveSecret(options.serviceKey, event.endpointId, event.secretVersion);
      const signature = await signPayload({ secret, body, timestamp: ports.now() });

      try {
        const result = await ports.send({
          url: event.endpointUrl,
          body,
          headers: {
            "content-type": "application/json",
            [SIGNATURE_HEADER]: signature,
            [EVENT_ID_HEADER]: event.eventId,
          },
          timeoutMs: options.timeoutMs ?? DELIVERY_TIMEOUT_MS,
        });
        ok = result.ok;
        status = result.status;
        error = result.error;
      } catch (thrown) {
        // A thrown send is a failed delivery, never a failed drain. One unreachable endpoint must
        // not strand the events queued behind it for other workspaces.
        ok = false;
        error = thrown instanceof Error ? thrown.message : String(thrown);
      }
    }

    try {
      await ports.record(event.eventId, ok, status, error);
      if (ok) delivered += 1;
      else failed += 1;
    } catch {
      // The outcome is lost, not the event: the claim expires and it is delivered again. Counted so
      // an operator can see the difference between "the endpoint is broken" and "we are broken".
      unrecorded += 1;
    }
  }

  return { claimed: events.length, delivered, failed, invalid, unrecorded };
}

/**
 * A `send` built on `fetch`, for the worker to use. Separate from `deliverBatch` so the loop can be
 * tested without a network and this can be swapped for a runtime's own client.
 *
 * A non-2xx is a RESULT, not an exception: the status is what the retry decision and the operator's
 * `last_error` both need, and turning it into a throw would discard it.
 */
export function fetchSend(fetchImpl: typeof fetch = fetch) {
  return async (request: {
    url: string;
    body: string;
    headers: Record<string, string>;
    timeoutMs: number;
  }): Promise<SendResult> => {
    const response = await fetchImpl(request.url, {
      method: "POST",
      body: request.body,
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
      // A webhook follows nobody: a redirect to somewhere the customer did not nominate would carry
      // their data there, signed.
      redirect: "manual",
    });
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: `endpoint returned ${response.status}` };
  };
}
