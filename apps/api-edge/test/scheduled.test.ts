// `?raw` so the assertion can see wrangler.jsonc: the test runs inside workerd, where there is no
// filesystem. Same import and same reason as `webhooks.test.ts`.
import wranglerConfig from "../wrangler.jsonc?raw";
import type { DueConnection, RecordedBackfill, SchedulerStorePort } from "@repo/store";
import { describe, expect, it } from "vitest";

import { HANDLED_CRONS, INGEST_CRON, handleScheduled } from "../src/scheduled";
import { DELIVER_CRON, PRUNE_CRON } from "../src/webhooks";
import { SWEEP_LIMIT, sweepDueConnections } from "../src/scheduled-ingest";
import type { IngestDeps } from "../src/ingest";

/**
 * THE SWEEP, AND THE FOUR WAYS IT DECLINES WITHOUT THAT BEING A FAILURE.
 *
 * `packages/store/src/scheduler.ts` is tested against the wire in `scheduler-store.test.ts`. This
 * file tests the LOOP: which connections are claimed, which are skipped and reported, and what is
 * passed to the database when a lease is closed.
 *
 * Every dependency is a fake. Nothing here reaches a network, a database or a merchant's store.
 */

const CONNECTION = "7c000000-0000-0000-0000-0000000000c1";
const WORKSPACE = "7c000000-0000-0000-0000-000000000001";
const ORGANISATION = "7c000000-0000-0000-0000-0000000000a1";

function dueConnection(overrides: Partial<DueConnection> = {}): DueConnection {
  return {
    connectionId: CONNECTION,
    workspaceId: WORKSPACE,
    organisationId: ORGANISATION,
    provider: "woocommerce",
    drivable: true,
    lastBackfillAt: "2026-09-11T02:00:00+00:00",
    restatementWindowDays: null,
    ...overrides,
  };
}

interface FakeScheduler extends SchedulerStorePort {
  readonly claims: Array<{ connectionId: string; claimedBy: string }>;
  readonly closes: Array<{
    connectionId: string;
    succeeded: boolean;
    claimedBy: string;
    checkpoint: string | null;
  }>;
}

function scheduler(
  rows: readonly DueConnection[],
  options: { claimAnswers?: boolean[]; leaseClosed?: boolean } = {},
): FakeScheduler {
  const claims: FakeScheduler["claims"] = [];
  const closes: FakeScheduler["closes"] = [];
  const answers = [...(options.claimAnswers ?? [])];
  return {
    claims,
    closes,
    async due() {
      return rows;
    },
    async claim(connectionId, claimedBy) {
      claims.push({ connectionId, claimedBy });
      return answers.length > 0 ? (answers.shift() as boolean) : true;
    },
    async recordBackfill(
      connectionId,
      succeeded,
      claimedBy,
      checkpoint,
    ): Promise<RecordedBackfill> {
      closes.push({ connectionId, succeeded, claimedBy, checkpoint });
      return {
        recordedAt: "2026-09-13T02:23:00+00:00",
        leaseClosed: options.leaseClosed ?? true,
      };
    },
  };
}

/**
 * An `IngestDeps` whose only live part is the connection read. `runIngest` is not called in these
 * tests unless the connection has a checkpoint AND the claim succeeds, which is exactly the
 * property under test -- so a fake that throws when reached is the assertion.
 */
function ingestDeps(checkpoint: string | null, onRun?: () => never): IngestDeps {
  return {
    connections: {
      async read() {
        return { ingestCheckpoint: checkpoint } as never;
      },
    },
    ingest: {
      async write() {
        throw new Error("the sweep must not reach the ingest store in these tests");
      },
    } as never,
    kek: "not-used-because-runIngest-is-not-reached",
    fetchImpl: (() => {
      if (onRun !== undefined) onRun();
      throw new Error("the sweep must not fetch in these tests");
    }) as never,
    crypto: {} as never,
  };
}

describe("cron dispatch", () => {
  it("declares exactly the crons wrangler.jsonc does, IN BOTH DIRECTIONS", async () => {
    // The reverse direction did not exist. A cron HANDLED but never DECLARED passes a
    // one-directional check silently, and it is a scheduled job that lives in code and never fires.
    const declared = [...wranglerConfig.matchAll(/"((?:[\d*/,-]+ ){4}[\d*/,-]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(declared.length).toBeGreaterThan(0);
    expect([...declared].sort()).toEqual([...HANDLED_CRONS].sort());
    expect(HANDLED_CRONS).toContain(INGEST_CRON);
  });

  it("fires the sweep at an interval of one hour or more", () => {
    // Cloudflare drops CPU per Cron Trigger from 15 minutes to 30 seconds below one hour, and a
    // sweep killed mid-run holds its lease for the rest of the window. The minute field must
    // therefore be a specific minute rather than `*`.
    const [minute, hour] = INGEST_CRON.split(" ");
    expect(minute).not.toBe("*");
    expect(hour).not.toBe("*");
  });

  it("reports a cron it does not recognise rather than doing nothing", async () => {
    const outcome = await handleScheduled("0 0 1 1 *", {
      store: null,
      signingKey: null,
      sweep: null,
    });
    expect(outcome).toEqual({ status: "unknown_cron", cron: "0 0 1 1 *" });
  });

  it("says not_configured, naming what is absent, rather than looking like no work", async () => {
    const outcome = await handleScheduled(INGEST_CRON, {
      store: null,
      signingKey: null,
      sweep: null,
    });
    expect(outcome.status).toBe("not_configured");
    expect(outcome).toMatchObject({ reason: expect.stringContaining("no scheduler binding") });
  });

  it("still routes the webhook crons to the webhook handler", async () => {
    for (const cron of [DELIVER_CRON, PRUNE_CRON]) {
      const outcome = await handleScheduled(cron, { store: null, signingKey: null, sweep: null });
      expect(outcome).toMatchObject({ reason: expect.stringContaining("no store binding") });
    }
  });
});

describe("the sweep declines rather than dropping", () => {
  it("does not CLAIM a provider this build cannot drive, and reports it", async () => {
    // The starvation loop this prevents: claim a GA4 connection, fail, release, be handed the same
    // row next tick, forever -- while the one connection that can be pulled sits behind it in a
    // work list ordered by `last_backfill_at asc nulls first`.
    const s = scheduler([
      dueConnection({ connectionId: "ga4-row", provider: "ga4", drivable: true }),
    ]);
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });

    expect(s.claims).toEqual([]);
    expect(outcome.skipped).toEqual([
      { connectionId: "ga4-row", provider: "ga4", reason: "no_driver" },
    ]);
    expect(outcome.swept).toEqual([]);
    expect(outcome.considered).toBe(1);
  });

  it("REFUSES a connection that has never been walked rather than inventing a window", async () => {
    // A default window on a watermark walk is the worst kind of default: too short opens a silent
    // hole, too long spends the merchant's store on history it already has, and nobody learns.
    const s = scheduler([dueConnection()]);
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps(null),
      instanceName: "instance-1",
    });

    expect(s.claims).toEqual([]);
    expect(outcome.skipped[0]?.reason).toBe("awaiting_first_run");
  });

  it("treats a lease another instance holds as an outcome, not a failure", async () => {
    const s = scheduler([dueConnection()], { claimAnswers: [false] });
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });

    expect(s.claims).toHaveLength(1);
    expect(s.closes).toEqual([]);
    expect(outcome.skipped[0]?.reason).toBe("lease_held_elsewhere");
  });

  it("reports every skipped connection, so a quiet sweep is not silent", async () => {
    const s = scheduler([
      dueConnection({ connectionId: "a", provider: "ga4" }),
      dueConnection({ connectionId: "b", provider: "meta_ads" }),
    ]);
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });
    expect(outcome.skipped).toHaveLength(2);
    expect(outcome.considered).toBe(2);
  });
});

describe("closing the lease", () => {
  it("passes the SAME instance name to claim and to recordBackfill", async () => {
    // The database compares it against `connections.claimed_by`. If the two calls could disagree,
    // the ownership check would refuse every close and every connection would look stuck.
    const s = scheduler([dueConnection()]);
    await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-7",
    });

    expect(s.claims[0]?.claimedBy).toBe("instance-7");
    expect(s.closes[0]?.claimedBy).toBe("instance-7");
  });

  it("records the run as FAILED so it is retried tomorrow", async () => {
    // `runIngest` is reached and throws, because `fetchImpl` throws. The lease must still close,
    // and `succeeded: false` is what stops `last_backfill_at` advancing -- which is what has the
    // connection offered again on the next sweep rather than skipped for the day.
    const s = scheduler([dueConnection()]);
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });

    expect(s.closes).toHaveLength(1);
    expect(s.closes[0]?.succeeded).toBe(false);
    expect(outcome.swept[0]?.failure).toBeDefined();
  });

  it("closes the lease even when the run throws, so nothing is stranded", async () => {
    const s = scheduler([dueConnection()]);
    await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });
    // A lease left held strands the connection for the full fifteen minutes, and the next sweep
    // reports nothing because a leased row is not offered -- a connection that silently stops being
    // pulled, with plausible numbers behind it.
    expect(s.closes).toHaveLength(1);
  });

  it("reports a lost lease without calling the pull a failure", async () => {
    const s = scheduler([dueConnection()], { leaseClosed: false });
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });
    expect(outcome.swept[0]?.leaseClosed).toBe(false);
  });

  it("carries no message from a failure into the outcome, only a code", async () => {
    // This object is JSON.stringify'd into a log line. An error message can carry a store URL, a
    // filter value or a merchant's domain.
    const s = scheduler([dueConnection()]);
    const outcome = await sweepDueConnections({
      scheduler: s,
      ingest: ingestDeps("2026-09-12T00:00:00Z"),
      instanceName: "instance-1",
    });
    expect(JSON.stringify(outcome)).not.toContain("must not fetch");
  });
});

describe("the sweep's own ceiling", () => {
  it("asks for fewer connections than the store would allow", async () => {
    // A limit the invocation cannot honour is worse than a small one: the connections past the cut
    // are leased, not pulled, and released at the end having achieved nothing.
    expect(SWEEP_LIMIT).toBeLessThan(500);
    expect(SWEEP_LIMIT).toBeGreaterThan(0);
  });
});
