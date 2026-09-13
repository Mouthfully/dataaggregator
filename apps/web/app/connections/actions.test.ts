import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WHAT THIS FILE IS ACTUALLY TESTING: that a customer's platform credential goes to exactly one
 * place and appears in none of the others. The assertions are deliberately about ABSENCE -- of the
 * key in the returned state, of a query string on the request, of a single console call on any path
 * -- because those are the failures that do not show up on screen and do not fail a build.
 *
 * The Supabase client and the workspace read are faked; the endpoint is faked; nothing here talks to
 * a network. What is real is the action itself, including its order of checks.
 */

const F = vi.hoisted(() => ({
  /** Shaped like the real thing so a leak is greppable, and never a real credential. */
  key: "ck_test_51NOTAREALKEY",
  secret: "cs_test_51NOTAREALSECRET",
  token: "EAAtest51NOTAREALTOKEN",
  access: "eyJhbGciOiJIUzI1NiJ9.session.signature",
  workspace: "11111111-2222-3333-4444-555555555555",
  api: "https://api.example.test",
  workspaceState: {
    kind: "ready" as string,
    workspace: { id: "11111111-2222-3333-4444-555555555555", name: "Workspace" },
  },
  session: { access_token: "eyJhbGciOiJIUzI1NiJ9.session.signature" } as {
    access_token: string;
  } | null,
}));

vi.mock("../_auth/server", () => ({
  supabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
      getSession: async () => ({ data: { session: F.session } }),
    },
  }),
}));

vi.mock("../_auth/workspace", () => ({
  currentWorkspace: async () => F.workspaceState,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import { CONNECTIONS } from "../_content";
import { type ConnectState, createConnection } from "./actions";

function wooForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("provider", "woocommerce");
  form.set("external_account_id", "https://shop.example.com");
  form.set("key", F.key);
  form.set("secret", F.secret);
  for (const [name, value] of Object.entries(overrides)) form.set(name, value);
  return form;
}

function metaForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("provider", "meta_ads");
  form.set("external_account_id", "act_1234567890");
  form.set("token", F.token);
  for (const [name, value] of Object.entries(overrides)) form.set(name, value);
  return form;
}

/** A fake endpoint that records what it was sent. */
function endpoint(status: number, body: unknown) {
  return vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

const CREATED = { ok: true, connection_id: "c-1", status: "active", request_id: "req-1" };

let fetchSpy: ReturnType<typeof endpoint>;
const consoleCalls: unknown[][] = [];

beforeEach(() => {
  process.env.PUBLIC_API_URL = F.api;
  F.workspaceState = { kind: "ready", workspace: { id: F.workspace, name: "Workspace" } };
  F.session = { access_token: F.access };
  fetchSpy = endpoint(201, CREATED);
  vi.stubGlobal("fetch", fetchSpy);

  consoleCalls.length = 0;
  for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function sentBody(): Record<string, unknown> {
  const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("the credential reaches the endpoint and nothing else", () => {
  it("posts it once, in a body, to a URL with no query string", async () => {
    const state = await createConnection({}, wooForm());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${F.api}/v1/connections`);
    // A credential in a query string lands in history, in access logs and in the Referer header.
    expect(url).not.toContain("?");
    expect(url).not.toContain(F.key);
    expect(init.method).toBe("POST");

    const body = sentBody();
    expect(body.key).toBe(F.key);
    expect(body.secret).toBe(F.secret);
    expect(body.credential_lane).toBe("key_secret");
    expect(state.connected).toBe(true);
  });

  it("forwards the signed-in person's own access token, not an API key", async () => {
    await createConnection({}, wooForm());
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${F.access}`);
  });

  /**
   * TENANCY IS NOT A FORM FIELD. The workspace comes from the session's own readable rows; a posted
   * one is ignored. What makes the write safe is `connections_insert`'s with-check, but there is no
   * reason to hand it a value a stranger chose either.
   */
  it("ignores a workspace id posted with the form", async () => {
    await createConnection({}, wooForm({ workspace_id: "99999999-9999-9999-9999-999999999999" }));
    expect(sentBody().workspace_id).toBe(F.workspace);
  });

  it("never returns the credential, whatever the endpoint answers", async () => {
    const answers: [number, unknown][] = [
      [201, CREATED],
      [400, { ok: false, error: "invalid_credential", message: "no" }],
      [403, { ok: false, error: "forbidden", message: "no", request_id: "req-2" }],
      [409, { ok: false, error: "already_connected", message: "no" }],
      [502, { ok: false, error: "upstream_unavailable", message: "no", request_id: "req-3" }],
      [503, { ok: false, error: "bad_kek", message: "no" }],
      // The worst case: an upstream body that echoes the credential back at us.
      [500, { ok: false, error: "boom", message: `key ${F.key} secret ${F.secret}` }],
    ];

    for (const [status, body] of answers) {
      fetchSpy = endpoint(status, body);
      vi.stubGlobal("fetch", fetchSpy);
      const state: ConnectState = await createConnection({}, wooForm());
      const rendered = JSON.stringify(state);
      expect(rendered, String(status)).not.toContain(F.key);
      expect(rendered, String(status)).not.toContain(F.secret);
      expect(rendered, String(status)).not.toContain("ck_");
      expect(rendered, String(status)).not.toContain("cs_");
    }
  });

  /**
   * NOT ONE LOG LINE, ON ANY PATH. A log is the one place a secret survives with nobody's
   * permission, and `actions.ts` has no console call for that reason -- this asserts it rather than
   * trusting the comment that says so.
   */
  it("writes nothing to the console, on any path", async () => {
    await createConnection({}, wooForm());

    fetchSpy = endpoint(403, { ok: false, error: "forbidden", message: "no" });
    vi.stubGlobal("fetch", fetchSpy);
    await createConnection({}, wooForm());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`network died carrying ${F.key}`);
      }),
    );
    await createConnection({}, wooForm());

    await createConnection({}, wooForm({ key: "" }));

    expect(consoleCalls).toEqual([]);
  });
});

describe("refusals arrive one at a time, with their own sentence", () => {
  const cases: [string, string][] = [
    ["forbidden", CONNECTIONS.errors.forbidden],
    ["already_connected", CONNECTIONS.errors.already_connected],
    ["invalid_credential", CONNECTIONS.errors.invalid_credential],
    ["credential_expired", CONNECTIONS.errors.credential_expired],
    ["bad_request", CONNECTIONS.errors.bad_request],
    ["unknown_provider", CONNECTIONS.errors.unknown_provider],
    ["unsupported_lane", CONNECTIONS.errors.unsupported_lane],
    ["bad_kek", CONNECTIONS.errors.bad_kek],
    ["not_configured", CONNECTIONS.errors.not_configured],
    ["upstream_unavailable", CONNECTIONS.errors.upstream_unavailable],
    ["unauthorized", CONNECTIONS.errors.unauthorized],
  ];

  for (const [code, message] of cases) {
    it(`says its own thing about ${code}`, async () => {
      fetchSpy = endpoint(400, { ok: false, error: code, message: "upstream prose" });
      vi.stubGlobal("fetch", fetchSpy);
      const state = await createConnection({}, wooForm());
      expect(state.error).toBe(message);
      // The endpoint's own message names policies and bindings. It is not what a customer reads.
      expect(state.error).not.toContain("upstream prose");
      expect(state.connected).toBeUndefined();
    });
  }

  it("carries the endpoint's request id where there is one", async () => {
    fetchSpy = endpoint(502, {
      ok: false,
      error: "upstream_unavailable",
      message: "no",
      request_id: "req-9",
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect((await createConnection({}, wooForm())).reference).toBe("req-9");
  });

  it("does not claim nothing was stored when it never heard back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection reset");
      }),
    );
    const state = await createConnection({}, wooForm());
    expect(state.error).toBe(CONNECTIONS.errors.unreachable);
  });

  it("admits an answer it does not recognise", async () => {
    fetchSpy = endpoint(418, { ok: false, error: "brand_new_refusal" });
    vi.stubGlobal("fetch", fetchSpy);
    expect((await createConnection({}, wooForm())).error).toBe(CONNECTIONS.errors.unexpected);
  });
});

describe("nothing leaves until the submission is shaped right", () => {
  it("refuses an empty half without sending anything", async () => {
    const state = await createConnection({}, wooForm({ secret: "   " }));
    expect(state.error).toBe(CONNECTIONS.errors.missingKey);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a source that does not take a typed credential", async () => {
    const state = await createConnection({}, wooForm({ provider: "ga4" }));
    expect(state.error).toBe(CONNECTIONS.errors.unknownProvider);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an account nobody named", async () => {
    const state = await createConnection({}, wooForm({ external_account_id: " " }));
    expect(state.error).toBe(CONNECTIONS.errors.missingAccount);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when this deployment has nowhere to send it", async () => {
    process.env.PUBLIC_API_URL = "";
    const state = await createConnection({}, wooForm());
    expect(state.error).toBe(CONNECTIONS.errors.notConfigured);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a signed-out submission to sign in rather than reading its credential", async () => {
    F.session = null;
    await expect(createConnection({}, wooForm())).rejects.toThrow("redirect:/signin");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when the account has no workspace", async () => {
    F.workspaceState = { kind: "needsOrganisation", workspace: { id: "", name: "" } };
    const state = await createConnection({}, wooForm());
    expect(state.error).toBe(CONNECTIONS.errors.noWorkspace);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * THE EXPIRY IS THE ONE PLACE THIS FORM COULD STORE A FALSEHOOD. `connectWithToken` reads a null
 * `expires_at` as PERMANENT -- never as "we were not told" -- so a dated token posted with no answer
 * would be reported as healthy on the morning it stopped working.
 */
describe("a pasted token is asked whether it expires", () => {
  it("refuses a submission that did not answer", async () => {
    const state = await createConnection({}, metaForm());
    expect(state.error).toBe(CONNECTIONS.errors.missingExpiry);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an expiry date that was left blank", async () => {
    const state = await createConnection({}, metaForm({ expiry: "on", expires_on: "" }));
    expect(state.error).toBe(CONNECTIONS.errors.missingExpiry);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends null only when somebody said the token is permanent", async () => {
    await createConnection({}, metaForm({ expiry: "never" }));
    const body = sentBody();
    expect(body.expires_at).toBeNull();
    expect(body.credential_lane).toBe("bearer");
    expect(body.token).toBe(F.token);
  });

  it("refuses a date typed beside the answer that says it never expires", async () => {
    const state = await createConnection(
      {},
      metaForm({ expiry: "never", expires_on: "2027-01-31" }),
    );
    expect(state.error).toBe(CONNECTIONS.errors.contradictoryExpiry);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the date that was given", async () => {
    await createConnection({}, metaForm({ expiry: "on", expires_on: "2027-01-31" }));
    expect(sentBody().expires_at).toBe("2027-01-31");
  });
});
