// Vite resolves `?raw` to the file's text at build time, which is the only way this
// assertion can see wrangler.jsonc: the test runs inside workerd, where there is no filesystem.
import wranglerConfig from "../wrangler.jsonc?raw";
import type { DueEvent, SendResult } from "@repo/webhooks";
import { createExecutionContext, createScheduledController, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { handleScheduled } from "../src/index.js";
import { DELIVER_CRON, PRUNE_CRON, type WebhookStore } from "../src/webhooks.js";

/**
 * The scheduled half, against the real workerd scheduled interface.
 *
 * The delivery loop itself is tested in @repo/webhooks against injected ports. What can only be
 * tested here is the wiring: that a cron string reaches the right branch, that an unconfigured
 * deployment says so instead of failing quietly, and that the Worker's own `scheduled` export runs.
 */

function payload() {
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
  };
}

const DUE: DueEvent = {
  eventId: "3f2a1c44-0000-4000-8000-000000000001",
  endpointId: "9f1c2d3e-0000-4000-8000-000000000001",
  endpointUrl: "https://hooks.example.test/restated",
  secretVersion: 1,
  workspaceId: "7c000000-0000-4000-8000-000000000001",
  attempts: 0,
  payload: payload(),
};

function store(overrides: Partial<WebhookStore> = {}): WebhookStore {
  return {
    claim: async () => [DUE],
    record: async () => {},
    prune: async () => 0,
    ...overrides,
  };
}

const sent: SendResult = { ok: true, status: 200 };

describe("dispatching a cron", () => {
  it("delivers on the delivery cron", async () => {
    const recorded: string[] = [];
    const outcome = await handleScheduled(DELIVER_CRON, {
      sweep: null,
      store: store({
        record: async (id) => {
          recorded.push(id);
        },
      }),
      signingKey: "service-key",
      send: async () => sent,
    });
    expect(outcome).toEqual({
      status: "delivered",
      report: { claimed: 1, delivered: 1, failed: 0, invalid: 0, unrecorded: 0 },
    });
    expect(recorded).toEqual([DUE.eventId]);
  });

  it("prunes on the prune cron, and delivers nothing", async () => {
    let claimed = false;
    const outcome = await handleScheduled(PRUNE_CRON, {
      sweep: null,
      store: store({
        claim: async () => {
          claimed = true;
          return [];
        },
        prune: async () => 41,
      }),
      signingKey: "service-key",
    });
    expect(outcome).toEqual({ status: "pruned", removed: 41 });
    expect(claimed).toBe(false);
  });

  it("reports a cron it does not recognise rather than doing nothing", async () => {
    // A schedule added to wrangler.jsonc and forgotten in the handler would otherwise be an
    // invisible no-op running on someone's schedule forever.
    const outcome = await handleScheduled("0 0 1 1 *", {
      sweep: null,
      store: store(),
      signingKey: "service-key",
    });
    expect(outcome).toEqual({ status: "unknown_cron", cron: "0 0 1 1 *" });
  });

  it("every cron in wrangler.jsonc is one the WEBHOOK handler dispatches, or the sweep's", async () => {
    // Wrangler cannot import a TypeScript constant, so the lists are duplicated. `scheduled.test.ts`
    // is where both directions are checked; this one keeps the webhook half honest about its two.
    const crons = [...wranglerConfig.matchAll(/"((?:[\d*/,-]+ ){4}[\d*/,-]+)"/g)].map((m) => m[1]);
    expect(crons.length).toBeGreaterThan(0);
    expect(crons).toContain(DELIVER_CRON);
    expect(crons).toContain(PRUNE_CRON);
  });
});

describe("an unconfigured deployment says so", () => {
  it("refuses to deliver with no store, and names what is missing", async () => {
    const outcome = await handleScheduled(DELIVER_CRON, {
      sweep: null,
      store: null,
      signingKey: "k",
    });
    expect(outcome.status).toBe("not_configured");
    expect(outcome).toMatchObject({ reason: expect.stringContaining("no store binding") });
  });

  it("refuses to prune with no store", async () => {
    const outcome = await handleScheduled(PRUNE_CRON, {
      sweep: null,
      store: null,
      signingKey: "k",
    });
    expect(outcome.status).toBe("not_configured");
  });

  it("refuses to CLAIM when it has no signing key", async () => {
    // Claiming first would lease a batch that could not then be signed: every event would fail and
    // burn six attempts each on a missing environment variable.
    let claimed = false;
    const outcome = await handleScheduled(DELIVER_CRON, {
      sweep: null,
      store: store({
        claim: async () => {
          claimed = true;
          return [DUE];
        },
      }),
      signingKey: null,
    });
    expect(claimed).toBe(false);
    expect(outcome).toMatchObject({ reason: expect.stringContaining("signing key") });
  });

  it("treats an empty signing key as a missing one", async () => {
    const outcome = await handleScheduled(DELIVER_CRON, {
      sweep: null,
      store: store(),
      signingKey: "",
    });
    expect(outcome.status).toBe("not_configured");
  });
});

describe("the Worker's own scheduled export", () => {
  it("runs on a real scheduled event without throwing", async () => {
    // The deployment has no store, so this asserts the honest-no-op path end to end -- which is the
    // path every invocation will take until a database connection exists.
    const controller = createScheduledController({ cron: DELIVER_CRON });
    const ctx = createExecutionContext();
    await expect(worker.scheduled?.(controller, env, ctx)).resolves.toBeUndefined();
  });
});
