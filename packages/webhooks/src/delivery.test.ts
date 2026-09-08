import { describe, expect, it, vi } from "vitest";
import { type DeliveryPorts, type DueEvent, deliverBatch, fetchSend } from "./delivery.js";
import { EVENT_ID_HEADER, SIGNATURE_HEADER, deriveSecret, verifySignature } from "./signature.js";

const KEY = "service-key-for-tests-only";
const NOW = new Date("2026-09-08T12:00:00Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    type: "restated",
    id: "3f2a1c44-0000-4000-8000-000000000001",
    workspace_id: "7c000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-08T02:14:33Z",
    source: "meta_ads",
    entity: { type: "ad_group", id: "ag_1", account_id: "act_123" },
    dimensions: { date: "2026-08-14", currency: "EUR", attribution_window: "7d_click" },
    metrics: { conversions: 47 },
    revised_from: { conversions: 41 },
    fetched_at: "2026-09-08T02:14:33Z",
    first_seen_at: "2026-08-14T06:00:00Z",
    restates_until: "2026-09-11T00:00:00Z",
    is_provisional: true,
    ...overrides,
  };
}

function due(overrides: Partial<DueEvent> = {}): DueEvent {
  return {
    eventId: "3f2a1c44-0000-4000-8000-000000000001",
    endpointId: "9f1c2d3e-0000-4000-8000-000000000001",
    endpointUrl: "https://hooks.example.test/restated",
    secretVersion: 1,
    workspaceId: "7c000000-0000-4000-8000-000000000001",
    attempts: 0,
    payload: payload(),
    ...overrides,
  };
}

function ports(overrides: Partial<DeliveryPorts> = {}): DeliveryPorts {
  return {
    claim: async () => [due()],
    send: async () => ({ ok: true, status: 200 }),
    record: async () => {},
    now: () => NOW,
    ...overrides,
  };
}

describe("draining a batch", () => {
  it("delivers and records a good event", async () => {
    const record = vi.fn(async () => {});
    const report = await deliverBatch(ports({ record }), { serviceKey: KEY });
    expect(report).toEqual({ claimed: 1, delivered: 1, failed: 0, invalid: 0, unrecorded: 0 });
    expect(record).toHaveBeenCalledWith(due().eventId, true, 200, undefined);
  });

  it("claims nothing and does nothing", async () => {
    const send = vi.fn();
    const report = await deliverBatch(ports({ claim: async () => [], send }), { serviceKey: KEY });
    expect(send).not.toHaveBeenCalled();
    expect(report.claimed).toBe(0);
  });

  it("signs the exact bytes it sends, verifiable by a receiver", async () => {
    // Asserted through the same verifier a customer would run, not by re-signing and comparing:
    // a signature that only the signer can check proves nothing about the receiver's experience.
    let sent: { body: string; headers: Record<string, string> } | undefined;
    await deliverBatch(
      ports({
        send: async (request) => {
          sent = request;
          return { ok: true, status: 200 };
        },
      }),
      { serviceKey: KEY },
    );
    const secret = await deriveSecret(KEY, due().endpointId, 1);
    expect(
      await verifySignature({
        secret,
        body: (sent as { body: string }).body,
        header: (sent as { headers: Record<string, string> }).headers[SIGNATURE_HEADER] as string,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("sends the event id, so a receiver can dedupe an at-least-once delivery", async () => {
    let sent: { headers: Record<string, string> } | undefined;
    await deliverBatch(
      ports({
        send: async (request) => {
          sent = request;
          return { ok: true, status: 200 };
        },
      }),
      { serviceKey: KEY },
    );
    expect((sent as { headers: Record<string, string> }).headers[EVENT_ID_HEADER]).toBe(
      due().eventId,
    );
  });

  it("uses a different secret per endpoint, so one leaked secret forges only its own", async () => {
    const bodies: string[] = [];
    const headers: string[] = [];
    await deliverBatch(
      ports({
        claim: async () => [
          due(),
          due({ eventId: "b", endpointId: "9f1c2d3e-0000-4000-8000-000000000002" }),
        ],
        send: async (request) => {
          bodies.push(request.body);
          headers.push(request.headers[SIGNATURE_HEADER] as string);
          return { ok: true, status: 200 };
        },
      }),
      { serviceKey: KEY },
    );
    const first = await deriveSecret(KEY, "9f1c2d3e-0000-4000-8000-000000000001", 1);
    expect(
      await verifySignature({
        secret: first,
        body: bodies[1] as string,
        header: headers[1] as string,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("what happens when the customer's endpoint misbehaves", () => {
  it("records a non-2xx as a failure, with the status the retry decision needs", async () => {
    const record = vi.fn(async () => {});
    const report = await deliverBatch(
      ports({
        record,
        send: async () => ({ ok: false, status: 503, error: "endpoint returned 503" }),
      }),
      { serviceKey: KEY },
    );
    expect(report.failed).toBe(1);
    expect(record).toHaveBeenCalledWith(due().eventId, false, 503, "endpoint returned 503");
  });

  it("records a thrown send as a failure rather than losing the claim", async () => {
    // An unclosed claim sits until its lease expires: the event is delayed and then delivered
    // twice. Handling the throw is what keeps that from being the normal case for a dead endpoint.
    const record = vi.fn(async () => {});
    const report = await deliverBatch(
      ports({
        record,
        send: async () => {
          throw new TypeError("network unreachable");
        },
      }),
      { serviceKey: KEY },
    );
    expect(report.failed).toBe(1);
    expect(record).toHaveBeenCalledWith(due().eventId, false, undefined, "network unreachable");
  });

  it("does not let one bad endpoint strand the events behind it", async () => {
    const seen: string[] = [];
    const report = await deliverBatch(
      ports({
        claim: async () => [due({ eventId: "a" }), due({ eventId: "b" }), due({ eventId: "c" })],
        send: async () => ({ ok: true, status: 200 }),
        record: async (id) => {
          seen.push(id);
          if (id === "b") throw new Error("database went away");
        },
      }),
      { serviceKey: KEY },
    );
    expect(seen).toEqual(["a", "b", "c"]);
    expect(report).toEqual({ claimed: 3, delivered: 2, failed: 0, invalid: 0, unrecorded: 1 });
  });
});

describe("the refusal: a malformed event is never delivered", () => {
  it("refuses a payload the contract rejects, and does not send it", async () => {
    // An event whose diff says a number changed from and to the same value is a false statement
    // about the customer's data. Sending it is worse than never sending it.
    const send = vi.fn();
    let recorded: { ok: boolean; error?: string } | undefined;
    const report = await deliverBatch(
      ports({
        send,
        record: async (_id, ok, _status, error) => {
          recorded = { ok, error };
        },
        claim: async () => [
          due({
            payload: payload({ metrics: { conversions: 41 }, revised_from: { conversions: 41 } }),
          }),
        ],
      }),
      { serviceKey: KEY },
    );
    expect(send).not.toHaveBeenCalled();
    expect(report).toEqual({ claimed: 1, delivered: 0, failed: 1, invalid: 1, unrecorded: 0 });
    expect(recorded?.error).toContain("does not satisfy the contract");
  });

  it("refuses an event with an empty diff", async () => {
    const send = vi.fn();
    const report = await deliverBatch(
      ports({ send, claim: async () => [due({ payload: payload({ revised_from: {} }) })] }),
      { serviceKey: KEY },
    );
    expect(send).not.toHaveBeenCalled();
    expect(report.invalid).toBe(1);
  });
});

describe("fetchSend", () => {
  it("turns a non-2xx into a result rather than an exception", async () => {
    const fake = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const result = await fetchSend(fake)({
      url: "https://hooks.example.test/x",
      body: "{}",
      headers: {},
      timeoutMs: 10,
    });
    expect(result).toEqual({ ok: false, status: 500, error: "endpoint returned 500" });
  });

  it("follows no redirects: a hop the customer did not nominate would carry their data there", async () => {
    let init: RequestInit | undefined;
    const fake = (async (_url: string, options: RequestInit) => {
      init = options;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    await fetchSend(fake)({
      url: "https://hooks.example.test/x",
      body: "{}",
      headers: {},
      timeoutMs: 10,
    });
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeDefined();
  });
});
