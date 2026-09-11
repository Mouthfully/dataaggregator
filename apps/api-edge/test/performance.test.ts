// Vite resolves `?raw` to the file's text at build time. It is the only way this test can see
// config.toml: it runs inside workerd, where there is no filesystem.
import supabaseConfig from "../../../supabase/config.toml?raw";
import { envelopeSchema } from "@repo/contract";
import { describe, expect, it } from "vitest";
import {
  type Authenticator,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_RANGE_DAYS,
  type PerformanceQuery,
  type PerformanceStore,
  handlePerformance,
  parseQuery,
} from "../src/performance.js";

const WORKSPACE = "7c000000-0000-0000-0000-000000000001";

const ok: Authenticator = { authenticate: async () => ({ workspaceId: WORKSPACE }) };
const missing: Authenticator = { authenticate: async () => ({ error: "missing" }) };
const invalid: Authenticator = { authenticate: async () => ({ error: "invalid" }) };

/** A well-formed envelope row, so a test that is not about row shape does not have to be. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    source: "ga4",
    entity: {
      type: "property",
      id: "properties/123456",
      account_id: "properties/123456",
      native_entity_type: "property",
      native_id: "properties/123456",
    },
    dimensions: {
      date: "2026-08-14",
      currency: "EUR",
      timezone: "Europe/Berlin",
      attribution_window: "model",
    },
    metrics: { sessions: 1284, conversions: 37 },
    fetched_at: "2026-09-08T02:00:00Z",
    source_updated_at: null,
    restates_until: "2026-08-26T06:00:00Z",
    is_provisional: false,
    first_seen_at: "2026-08-14T06:00:00Z",
    fx_source: null,
    fx_rate_date: null,
    fx_rate: null,
    fx_base: null,
    ...overrides,
  };
}

function store(rows: readonly unknown[], nextCursor: string | null = null): PerformanceStore {
  return { read: async () => ({ rows, nextCursor }) };
}

/** Records what the store was asked, so the tenancy assertions can look at it. */
function recordingStore(rows: readonly unknown[] = []) {
  const queries: PerformanceQuery[] = [];
  return {
    queries,
    store: {
      read: async (query: PerformanceQuery) => {
        queries.push(query);
        return { rows, nextCursor: null };
      },
    } satisfies PerformanceStore,
  };
}

function get(url: string) {
  return new Request(url, { method: "GET", headers: { authorization: "Bearer k" } });
}

const CTX = { requestId: "req_test_1" };

describe("authentication comes first", () => {
  it("401s with no credential, before saying anything about the query", async () => {
    // Parsing first would turn an unauthenticated endpoint into a free description of the API:
    // which sources exist, which parameters are accepted, what a well-formed range looks like.
    const response = await handlePerformance(get("https://api.test/v1/performance"), {
      ...CTX,
      auth: missing,
      store: store([]),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, string>;
    expect(body.error).toBe("unauthorized");
    // Not a word about `source`, even though the request has none.
    expect(JSON.stringify(body)).not.toContain("source");
  });

  it("distinguishes a missing credential from a rejected one", async () => {
    const response = await handlePerformance(get("https://api.test/v1/performance"), {
      ...CTX,
      auth: invalid,
      store: store([]),
    });
    expect(response.status).toBe(401);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: "invalid_credential",
    });
  });

  it("rejects a non-GET before authenticating", async () => {
    const response = await handlePerformance(
      new Request("https://api.test/v1/performance", { method: "POST" }),
      { ...CTX, auth: ok, store: store([]) },
    );
    expect(response.status).toBe(405);
  });
});

describe("the workspace comes from the credential, never from the caller", () => {
  it("uses the authenticated workspace", async () => {
    const { queries, store: s } = recordingStore();
    await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-07"),
      { ...CTX, auth: ok, store: s },
    );
    expect(queries[0]?.workspaceId).toBe(WORKSPACE);
  });

  it("ignores a workspace_id supplied in the query string", async () => {
    // Accepting it would make cross-tenant access a matter of typing a different id, with
    // row-level security as the only thing in the way -- one misconfiguration from nothing.
    const { queries, store: s } = recordingStore();
    await handlePerformance(
      get(
        "https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-07" +
          "&workspace_id=7c000000-0000-0000-0000-000000000003",
      ),
      { ...CTX, auth: ok, store: s },
    );
    expect(queries[0]?.workspaceId).toBe(WORKSPACE);
  });
});

describe("the query", () => {
  const url = (qs: string) => new URL(`https://api.test/v1/performance?${qs}`);

  it("requires a source, and names the ones that exist", () => {
    expect(() => parseQuery(url("from=2026-08-01&to=2026-08-07"), WORKSPACE)).toThrow(
      /`source` is required/,
    );
    expect(() => parseQuery(url("source=tiktok&from=2026-08-01&to=2026-08-07"), WORKSPACE)).toThrow(
      /must be one of/,
    );
  });

  it("requires an explicit date range rather than defaulting one", () => {
    // A caller who omits it gets an error naming the parameter, not an arbitrary window they will
    // later mistake for their own choice.
    expect(() => parseQuery(url("source=ga4&to=2026-08-07"), WORKSPACE)).toThrow(
      /`from` is required/,
    );
    expect(() => parseQuery(url("source=ga4&from=2026-08-01"), WORKSPACE)).toThrow(
      /`to` is required/,
    );
  });

  it("refuses a malformed or inverted range", () => {
    expect(() => parseQuery(url("source=ga4&from=01-08-2026&to=2026-08-07"), WORKSPACE)).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => parseQuery(url("source=ga4&from=2026-08-07&to=2026-08-01"), WORKSPACE)).toThrow(
      /must not be after/,
    );
  });

  it("bounds the range", () => {
    const inside = parseQuery(url("source=ga4&from=2025-08-01&to=2026-09-03"), WORKSPACE);
    expect(inside.from).toBe("2025-08-01");
    expect(() => parseQuery(url("source=ga4&from=2024-01-01&to=2026-09-03"), WORKSPACE)).toThrow(
      new RegExp(`maximum is ${MAX_RANGE_DAYS}`),
    );
  });

  it("bounds the limit and defaults it", () => {
    expect(parseQuery(url("source=ga4&from=2026-08-01&to=2026-08-07"), WORKSPACE).limit).toBe(
      DEFAULT_LIMIT,
    );
    expect(() =>
      parseQuery(url(`source=ga4&from=2026-08-01&to=2026-08-07&limit=${MAX_LIMIT + 1}`), WORKSPACE),
    ).toThrow(/`limit`/);
    expect(() =>
      parseQuery(url("source=ga4&from=2026-08-01&to=2026-08-07&limit=2.5"), WORKSPACE),
    ).toThrow(/`limit`/);
  });

  it("names the offending parameter in the error body", async () => {
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01"),
      { ...CTX, auth: ok, store: store([]) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()) as { parameter: string }).toMatchObject({ parameter: "to" });
  });
});

describe("the response is the envelope", () => {
  it("parses as the section 2 wrapper, not merely as something shaped like it", async () => {
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      {
        ...CTX,
        auth: ok,
        store: store([row(), row({ dimensions: { ...row().dimensions, date: "2026-08-15" } })]),
      },
    );
    expect(response.status).toBe(200);
    const parsed = envelopeSchema.safeParse(await response.json());
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.data).toHaveLength(2);
    expect(parsed.data?.module).toBe("performance");
  });

  it("reports zero credits for a performance read", async () => {
    // Section 11.3 replaced per-row credits with per-connected-account monthly metering, so
    // section 8's /v1/performance credit row is dead. The field stays for SERP and AI answers.
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([row()]) },
    );
    expect(((await response.json()) as { meta: { credits_used: number } }).meta.credits_used).toBe(
      0,
    );
  });

  it("carries as_of only when one was asked for", async () => {
    const without = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([row()]) },
    );
    expect(
      ((await without.json()) as { meta: Record<string, unknown> }).meta.as_of,
    ).toBeUndefined();

    const with_ = await handlePerformance(
      get(
        "https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31&as_of=2026-08-20",
      ),
      { ...CTX, auth: ok, store: store([row()]) },
    );
    expect(((await with_.json()) as { meta: Record<string, unknown> }).meta.as_of).toBe(
      "2026-08-20",
    );
  });

  it("omits next_cursor when there is no further page", async () => {
    // Absent rather than null: "no more" and "did not say" are different, and only one of them
    // should make a client fetch again.
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([row()], null) },
    );
    const body = (await response.json()) as { meta: Record<string, unknown> };
    expect("next_cursor" in body.meta).toBe(false);
  });

  it("carries next_cursor when there is one", async () => {
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([row()], "cur_2") },
    );
    const body = (await response.json()) as { meta: Record<string, unknown> };
    expect(body.meta.next_cursor).toBe("cur_2");
    expect(envelopeSchema.safeParse(body).success).toBe(true);
  });

  it("returns an empty data array rather than 404 when a workspace has no rows", async () => {
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([]) },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: unknown[] }).data).toEqual([]);
  });
});

describe("the refusal, at the last place a customer can see it", () => {
  it("refuses to emit an unlabelled conversion count even if the store hands one over", async () => {
    // The store writes through a checked function and the table has its own constraints, so this
    // row should be impossible. "Should" is the problem: a migration applied out of order, a
    // hand-fixed row, a future bulk import. Section 2 says the API refuses.
    const unlabelled = row({
      dimensions: { ...row().dimensions, attribution_window: null },
    });
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([unlabelled]) },
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; issues: Array<{ path: string }> };
    expect(body.error).toBe("unemittable_row");
    expect(body.issues[0]?.path).toContain("attribution_window");
  });

  it("fails the whole request rather than dropping the bad row", async () => {
    // Dropping it would return a total quietly too low -- with ok: true, which is worse than an
    // error, because nothing anywhere says the number is incomplete.
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      {
        ...CTX,
        auth: ok,
        store: store([
          row(),
          row({
            metrics: { conversions: 5 },
            dimensions: { ...row().dimensions, attribution_window: null },
          }),
          row(),
        ]),
      },
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; data?: unknown };
    expect(body.ok).toBe(false);
    expect(body.data).toBeUndefined();
  });

  it("refuses a converted amount with no rate", async () => {
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      {
        ...CTX,
        auth: ok,
        store: store([
          row({ metrics: { conversions_value: 100 }, fx_source: "ecb", fx_rate: null }),
        ]),
      },
    );
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe("unemittable_row");
  });

  it("refuses a metric that is not in the dictionary", async () => {
    // Section 13.3 rule 2: a new metric is a deliberate dictionary change, never a row that
    // happens to carry an extra key.
    const response = await handlePerformance(
      get("https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-31"),
      { ...CTX, auth: ok, store: store([row({ metrics: { sessions: 1, bounce_rate: 0.4 } })]) },
    );
    expect(response.status).toBe(500);
  });
});

describe("the paging limit and PostgREST's row cap, which live in different files", () => {
  /**
   * Issue #9, defect 2. `MAX_LIMIT` is a TypeScript constant in this Worker; `max_rows` is a
   * PostgREST setting in supabase/config.toml. Nothing in the build relates them, and when they
   * are equal a `limit + 1` next-page probe at the maximum limit asks for one more row than
   * PostgREST will ever return -- so the probe sees no extra row, `next_cursor` stays null, and a
   * caller paging at the maximum is told it has everything after one page.
   *
   * There is no store adapter yet, so this is a trap rather than a live bug, and it is laid for
   * exactly the person who writes that adapter. Asserting the relationship is what makes the trap
   * spring at build time instead of looking like "pagination doesn't work at high limits".
   */
  function maxRows(): number {
    // config.toml's [api] table is the only place `max_rows` appears; match it at line start so a
    // commented-out or nested occurrence cannot satisfy this.
    const match = supabaseConfig.match(/^max_rows\s*=\s*(\d+)\s*$/m);
    if (match === null) {
      throw new Error("supabase/config.toml no longer declares max_rows; this guard is blind");
    }
    return Number(match[1]);
  }

  it("finds max_rows in config.toml at all", () => {
    expect(maxRows()).toBeGreaterThan(0);
  });

  it("leaves room for a limit + 1 next-page probe at the maximum limit", () => {
    expect(MAX_LIMIT + 1).toBeLessThanOrEqual(maxRows());
  });

  it("still accepts the maximum limit it advertises", () => {
    const query = parseQuery(
      new URL(
        `https://api.test/v1/performance?source=ga4&from=2026-08-01&to=2026-08-07&limit=${MAX_LIMIT}`,
      ),
      WORKSPACE,
    );
    expect(query.limit).toBe(MAX_LIMIT);
  });
});
