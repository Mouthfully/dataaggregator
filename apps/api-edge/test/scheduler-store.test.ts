/**
 * THE SCHEDULER ADAPTER, AND THE TWO REFUSALS THAT ARE ITS WHOLE SECURITY VALUE.
 *
 * Same runtime argument as `store.test.ts`: the adapter's substance is `crypto.subtle` and `fetch`
 * AS WORKERD IMPLEMENTS THEM, so these run in the Worker pool rather than in node. Every `fetch`
 * here is a fake; nothing touches a network and the signing secret is a fixture.
 *
 * A SEPARATE FILE FROM `store.test.ts` ON PURPOSE. `packages/store/src/scheduler.ts` and the
 * `mintToken` refusal beside it arrived with no test at all -- the agent that was to write them did
 * not finish -- and a refusal with no test is a refusal that the next person to find it
 * inconvenient will delete, correctly believing nothing depends on it. These are the tests that
 * make deleting it fail.
 *
 * The two properties under test are not conveniences:
 *
 *   1. A SYSTEM ROLE MAY NOT CARRY A WORKSPACE CLAIM. Nothing reads one on these tokens, so a
 *      silently-dropped claim mints a credential that LOOKS narrowed to one tenant and is not.
 *   2. THE WORK LIST MAY NOT WIDEN. The scheduler is granted enumeration and not access; a column
 *      that arrives unannounced is a change to that premise, and reading past it would let the
 *      premise be false while everything still appeared to work.
 */

import { PROVIDER_LANES } from "@repo/connections";
import {
  MAX_DUE_LIMIT,
  createSchedulerStore,
  type PostgrestConfig,
  StoreError,
  mintToken,
  toDueConnection,
} from "@repo/store";
import { describe, expect, it } from "vitest";

const URL_BASE = "https://project.supabase.test";
const API_KEY = "fixture-publishable-key";
/** A fixture, not a secret. The real one is `wrangler secret put SUPABASE_JWT_SECRET`. */
const SECRET = "fixture-signing-secret-for-tests-only";
const FIXED = new Date("2026-09-12T09:00:00Z");
const CONNECTION = "7c000000-0000-0000-0000-0000000000c1";
const WORKSPACE = "7c000000-0000-0000-0000-000000000001";
const ORGANISATION = "7c000000-0000-0000-0000-0000000000a1";

/**
 * A provider this build can drive, and one it cannot, both taken from the real lane table rather
 * than typed in. `app.connection_provider` carries members with no connector in this repository,
 * which is the entire reason `drivable` is reported instead of assumed.
 */
const DRIVABLE_PROVIDER = Object.keys(PROVIDER_LANES)[0] as string;
const UNDRIVABLE_PROVIDER = "impact";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function fake(queue: Array<{ status?: number; body?: unknown; raw?: string }>) {
  const calls: Call[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error("fake fetch: the adapter made an unexpected request");
    const text = next.raw ?? JSON.stringify("body" in next ? next.body : []);
    return new Response(text, {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function config(impl: typeof fetch): PostgrestConfig {
  return { url: URL_BASE, apiKey: API_KEY, jwtSecret: SECRET, fetch: impl, now: () => FIXED };
}

/** One row exactly as `public.due_connections` returns it. */
function dueRow(overrides: Record<string, unknown> = {}) {
  return {
    connection_id: CONNECTION,
    workspace_id: WORKSPACE,
    organisation_id: ORGANISATION,
    provider: DRIVABLE_PROVIDER,
    last_backfill_at: "2026-09-11T02:00:00+00:00",
    restatement_window_days: 7,
    ...overrides,
  };
}

function claimsOf(token: string): Record<string, unknown> {
  const segment = (token.split(".")[1] as string).replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(atob(segment), (c) => c.charCodeAt(0))),
  );
}

describe("minting an app_scheduler identity", () => {
  it("carries the role and no workspace claim", async () => {
    // The FOURTH role, and the one whose entire purpose is the question that spans tenants. A
    // `workspace_id` here would not merely be inert as it is on `app_ingest` -- it would be
    // backwards, describing a per-tenant scheduler that cannot be built out of these functions.
    const token = await mintToken({ secret: SECRET, role: "app_scheduler", now: FIXED });
    const claims = claimsOf(token);
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "role"]);
    expect(claims.role).toBe("app_scheduler");
    expect(claims.workspace_id).toBeUndefined();
  });

  it("REFUSES a workspace claim rather than dropping it", async () => {
    // The distinction the refusal exists for: a dropped claim produces a token that reads as
    // narrowed to one tenant, is accepted everywhere, and is not narrowed at all. Whoever wrote the
    // argument would have no way to learn it did nothing.
    await expect(
      mintToken({ secret: SECRET, role: "app_scheduler", workspaceId: WORKSPACE, now: FIXED }),
    ).rejects.toThrow(/refusing to mint a app_scheduler token carrying a workspace_id claim/);
  });

  it("refuses the same claim on app_ingest, for the same reason", async () => {
    await expect(
      mintToken({ secret: SECRET, role: "app_ingest", workspaceId: WORKSPACE, now: FIXED }),
    ).rejects.toThrow(/refusing to mint a app_ingest token carrying a workspace_id claim/);
  });

  it("still accepts a workspace claim on `authenticated`, where something reads it", async () => {
    // The refusal must be narrow. `authenticated` is the role row-level security actually narrows,
    // so its claim is load-bearing and a blanket ban would break every tenant read.
    const token = await mintToken({
      secret: SECRET,
      role: "authenticated",
      workspaceId: WORKSPACE,
      now: FIXED,
    });
    expect(claimsOf(token).workspace_id).toBe(WORKSPACE);
  });
});

describe("reading a work-list row", () => {
  it("maps the six columns and marks a drivable provider", () => {
    expect(toDueConnection(dueRow())).toEqual({
      connectionId: CONNECTION,
      workspaceId: WORKSPACE,
      organisationId: ORGANISATION,
      provider: DRIVABLE_PROVIDER,
      drivable: true,
      lastBackfillAt: "2026-09-11T02:00:00+00:00",
      restatementWindowDays: 7,
    });
  });

  it("reports an undrivable provider rather than dropping the row", () => {
    // A silently dropped row is a connection that is never pulled and never mentioned, which is
    // indistinguishable from one that does not exist. And a REFUSAL here would be worse still: one
    // tenant's provider would abort the sweep for every other tenant.
    const row = toDueConnection(dueRow({ provider: UNDRIVABLE_PROVIDER }));
    expect(row.provider).toBe(UNDRIVABLE_PROVIDER);
    expect(row.drivable).toBe(false);
  });

  it("reads a never-pulled connection as null rather than as a date", () => {
    expect(toDueConnection(dueRow({ last_backfill_at: null })).lastBackfillAt).toBeNull();
  });

  it("REFUSES an unexpected column, naming it", () => {
    // THE CREDENTIAL GUARD. `external_account_id` is the column somebody adds first, because it
    // reads like scheduling metadata and is the thing you authenticate as. Refused rather than
    // filtered: a filter would let the scheduler keep working while its premise -- enumeration and
    // not access -- had quietly stopped being true.
    expect(() => toDueConnection(dueRow({ external_account_id: "act_123456" }))).toThrow(
      /external_account_id/,
    );
    expect(() => toDueConnection(dueRow({ credential_ciphertext: "\\xdead" }))).toThrow(StoreError);
  });

  it("REFUSES an unreadable last_backfill_at rather than reading it as never-pulled", () => {
    // NULL IS A MEANING IN THIS COLUMN, NOT AN ABSENCE. `app.due_connections` reads null as never
    // pulled, which means permanently due -- so the old `typeof x === "string" ? x : null` turned
    // any value it could not understand into an instruction to re-pull that connection on every
    // sweep forever, spending a platform quota shared across every tenant, silently.
    expect(() => toDueConnection(dueRow({ last_backfill_at: 1_757_635_200 }))).toThrow(
      /last_backfill_at/,
    );
    expect(() => toDueConnection(dueRow({ last_backfill_at: { a: 1 } }))).toThrow(StoreError);
    expect(() => toDueConnection(dueRow({ last_backfill_at: "5" }))).toThrow(StoreError);
    // A real null still means what it says.
    expect(toDueConnection(dueRow({ last_backfill_at: null })).lastBackfillAt).toBeNull();
  });

  it("refuses a row missing an identifier rather than claiming a lease against nothing", () => {
    expect(() => toDueConnection(dueRow({ connection_id: "" }))).toThrow(/connection_id/);
    expect(() => toDueConnection(dueRow({ workspace_id: undefined }))).toThrow(/workspace_id/);
  });

  it("refuses a restatement window that is not a whole number of days", () => {
    // This number decides how far back a pull reaches. A guessed default would silently shorten or
    // lengthen every restatement window on the platform.
    expect(() => toDueConnection(dueRow({ restatement_window_days: "7" }))).toThrow(
      /restatement_window_days/,
    );
    expect(() => toDueConnection(dueRow({ restatement_window_days: 7.5 }))).toThrow(StoreError);
  });

  it("CARRIES a null restatement window rather than refusing the row", () => {
    // `connections.restatement_window_days` is nullable, has no default, and nothing in this
    // repository writes it -- `scripts/seal-connection.ts` omits the column -- so every real row
    // carries null today. Refusing here aborted the whole cross-tenant sweep on the first real
    // connection, breaking this file's own rule about `provider`: a cross-tenant read must not be
    // refusable by one tenant's data. The null travels and the caller decides.
    expect(
      toDueConnection(dueRow({ restatement_window_days: null })).restatementWindowDays,
    ).toBeNull();
    expect(toDueConnection(dueRow({ restatement_window_days: 7 })).restatementWindowDays).toBe(7);
  });

  it("refuses something that is not a row at all", () => {
    expect(() => toDueConnection(null)).toThrow(/not a row/);
    expect(() => toDueConnection([dueRow()])).toThrow(/not a row/);
  });
});

describe("the work list over the wire", () => {
  it("posts the limit and identifies as app_scheduler", async () => {
    const f = fake([{ body: [dueRow()] }]);
    const rows = await createSchedulerStore(config(f.impl)).due(25);

    const call = f.calls[0] as Call;
    expect(call.url).toBe(`${URL_BASE}/rest/v1/rpc/due_connections`);
    expect(call.method).toBe("POST");
    expect(call.headers.apikey).toBe(API_KEY);
    expect(JSON.parse(call.body as string)).toEqual({ p_limit: 25 });

    const token = (call.headers.authorization as string).slice("Bearer ".length);
    expect(claimsOf(token).role).toBe("app_scheduler");
    expect(claimsOf(token).workspace_id).toBeUndefined();
    // The secret signs claims and travels nowhere else.
    expect(JSON.stringify(f.calls)).not.toContain(SECRET);

    expect(rows).toHaveLength(1);
  });

  it("REFUSES a limit above the ceiling rather than clamping it", async () => {
    // A clamped limit returns fewer rows than were asked for and says nothing, and a scheduler
    // cannot tell a short answer from a finished one: it concludes the sweep is complete and leaves
    // real work unpulled, every tick, forever.
    const f = fake([]);
    const store = createSchedulerStore(config(f.impl));
    await expect(store.due(MAX_DUE_LIMIT + 1)).rejects.toThrow(/ceiling is 500/);
    await expect(store.due(0)).rejects.toThrow(StoreError);
    await expect(store.due(1.5)).rejects.toThrow(StoreError);
    // Refused before the network, so a bad limit costs no request.
    expect(f.calls).toHaveLength(0);
  });

  it("refuses an answer that is not a list", async () => {
    const f = fake([{ body: { rows: [] } }]);
    await expect(createSchedulerStore(config(f.impl)).due()).rejects.toThrow(/other than a list/);
  });

  it("ONE TENANT'S NULL DOES NOT ABORT THE SWEEP", async () => {
    // The whole point of the fix, asserted at the level it actually mattered: a batch, not a row.
    // `restatement_window_days` is null on every connection this repository can create, so the
    // previous refusal meant the first real customer stopped every other customer's backfill.
    const f = fake([
      {
        body: [
          dueRow({
            connection_id: "11111111-1111-4111-8111-111111111111",
            restatement_window_days: null,
          }),
          dueRow({
            connection_id: "22222222-2222-4222-8222-222222222222",
            restatement_window_days: 7,
          }),
        ],
      },
    ]);
    const rows = await createSchedulerStore(config(f.impl)).due();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.restatementWindowDays).toBeNull();
    expect(rows[1]?.restatementWindowDays).toBe(7);
  });

  it("still aborts on a column it does not expect, which is the credential guard", async () => {
    // The widening above must not have loosened the thing that stops a credential column arriving
    // unannounced. Different failure, same batch.
    const f = fake([{ body: [dueRow({ credential_ciphertext: "\\xdead" })] }]);
    await expect(createSchedulerStore(config(f.impl)).due()).rejects.toThrow(/does not expect/);
  });
});

describe("taking and closing a lease", () => {
  it("returns the database's answer, and a false is an outcome rather than an error", async () => {
    const held = fake([{ raw: "true" }]);
    expect(await createSchedulerStore(config(held.impl)).claim(CONNECTION, "worker-1")).toBe(true);
    expect(JSON.parse((held.calls[0] as Call).body as string)).toEqual({
      p_connection_id: CONNECTION,
      p_claimed_by: "worker-1",
    });

    const taken = fake([{ raw: "false" }]);
    expect(await createSchedulerStore(config(taken.impl)).claim(CONNECTION, "worker-2")).toBe(
      false,
    );
  });

  it("REFUSES to read anything but a boolean as a lease taken", async () => {
    // Two instances pulling one connection spend a platform quota shared across every tenant twice,
    // which `10-credential-model.md` prices as halving the accounts one developer token supports.
    // Anything truthy-but-unknown read as `true` is exactly that.
    const f = fake([{ raw: '"t"' }]);
    await expect(
      createSchedulerStore(config(f.impl)).claim(CONNECTION, "worker-1"),
    ).rejects.toThrow(/rather than a boolean/);
  });

  it("refuses an anonymous lease, so a stuck connection can be attributed", async () => {
    const f = fake([]);
    const store = createSchedulerStore(config(f.impl));
    await expect(store.claim(CONNECTION, "   ")).rejects.toThrow(/anonymous lease/);
    await expect(store.claim(CONNECTION, "x".repeat(201))).rejects.toThrow(/200 characters/);
    await expect(store.claim("", "worker-1")).rejects.toThrow(StoreError);
    expect(f.calls).toHaveLength(0);
  });

  it("returns the instant the database recorded, and sends the lease holder and the checkpoint", async () => {
    const f = fake([{ body: { recorded_at: "2026-09-12T09:00:00+00:00", lease_closed: true } }]);
    const result = await createSchedulerStore(config(f.impl)).recordBackfill(
      CONNECTION,
      true,
      "worker-a",
      "2026-09-12T08:59:00+00:00",
    );
    expect(result).toEqual({ recordedAt: "2026-09-12T09:00:00+00:00", leaseClosed: true });
    expect(JSON.parse((f.calls[0] as Call).body as string)).toEqual({
      p_connection_id: CONNECTION,
      p_succeeded: true,
      p_claimed_by: "worker-a",
      p_checkpoint: "2026-09-12T08:59:00+00:00",
    });
  });

  it("reports a lease another instance now holds as an OUTCOME, not an error", async () => {
    // The pull that just ran is not invalidated -- its rows are written. What the caller must not
    // do is report a closed lease, and what an operator needs to know is that two instances were on
    // one connection.
    const f = fake([{ body: { recorded_at: "2026-09-12T09:00:00+00:00", lease_closed: false } }]);
    const result = await createSchedulerStore(config(f.impl)).recordBackfill(
      CONNECTION,
      true,
      "worker-b",
      null,
    );
    expect(result.leaseClosed).toBe(false);
  });

  it("REFUSES to report a lease closed on an answer that is not the expected shape", async () => {
    // The wrapper returns the instant because the adapter took the clock away from the caller. An
    // answer that is not one means the call did not reach the function it was aimed at, and
    // reporting success would strand the connection for the rest of the lease window in silence.
    const store = (body: unknown) => createSchedulerStore(config(fake([{ body }]).impl));
    await expect(store(null).recordBackfill(CONNECTION, false, "worker-a", null)).rejects.toThrow(
      /rather than an object/,
    );
    await expect(
      store({ lease_closed: true }).recordBackfill(CONNECTION, false, "worker-a", null),
    ).rejects.toThrow(/rather than the instant it recorded/);
    await expect(
      store({ recorded_at: "2026-09-12T09:00:00+00:00", lease_closed: "yes" }).recordBackfill(
        CONNECTION,
        false,
        "worker-a",
        null,
      ),
    ).rejects.toThrow(/rather than a boolean/);
  });

  it("refuses an anonymous close, because the ownership check could not then be made", async () => {
    const f = fake([]);
    await expect(
      createSchedulerStore(config(f.impl)).recordBackfill(CONNECTION, true, "   ", null),
    ).rejects.toThrow(/must name the instance that took it/);
    // Refused before the network, so a bad close costs no request.
    expect(f.calls).toHaveLength(0);
  });

  it("refuses a checkpoint that is not a timestamp", async () => {
    const f = fake([]);
    await expect(
      createSchedulerStore(config(f.impl)).recordBackfill(CONNECTION, true, "worker-a", "soon"),
    ).rejects.toThrow(/not a timestamp/);
    expect(f.calls).toHaveLength(0);
  });
});
