import type { TokenResponse } from "@repo/oauth";
import type { CryptoLike } from "@repo/vault";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ConnectionError,
  type ConnectionRow,
  type ConnectionStatus,
  type ConnectionStore,
  connect,
  connectionHealth,
  openCredential,
  recordFailure,
} from "./connections.js";

const crypto = globalThis.crypto as unknown as CryptoLike;
const KEK = new Uint8Array(32).fill(7);
const NOW = new Date("2026-09-08T00:00:00Z");

const WORKSPACE = "c0000000-0000-0000-0000-000000000001";
const CONNECTION = "e0000000-0000-0000-0000-000000000001";

/** An in-memory store. The real one is Postgres; the logic under test is the same either way. */
function memoryStore() {
  const rows = new Map<string, ConnectionRow>();
  const store: ConnectionStore = {
    async upsert(row) {
      const id = row.id ?? CONNECTION;
      const stored = { ...row, id } as ConnectionRow;
      rows.set(id, stored);
      return stored;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async markStatus(id, status, lastError) {
      const existing = rows.get(id);
      if (existing) rows.set(id, { ...existing, status, lastError });
    },
  };
  return { store, rows };
}

function googleTokens(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return {
    accessToken: "ya29.access",
    refreshToken: "1//refresh",
    expiresAt: "2026-09-08T01:00:00Z",
    grantedScopes: ["https://www.googleapis.com/auth/adwords"],
    raw: {},
    ...overrides,
  };
}

let store: ConnectionStore;
let rows: Map<string, ConnectionRow>;

beforeEach(() => {
  ({ store, rows } = memoryStore());
});

async function connectGoogleAds(tokens = googleTokens()) {
  return connect(crypto, store, {
    workspaceId: WORKSPACE,
    connectionId: CONNECTION,
    source: "google_ads",
    externalAccountId: "111-111-1111",
    tokens,
    kek: KEK,
    keyVersion: 1,
  });
}

describe("connecting", () => {
  it("stores no readable credential", async () => {
    const row = await connectGoogleAds();
    const asText = new TextDecoder().decode(row.credentialCiphertext);
    expect(asText).not.toContain("ya29");
    expect(asText).not.toContain("refresh");
    expect(JSON.stringify(row)).not.toContain("1//refresh");
  });

  it("round-trips the credential through the vault", async () => {
    const row = await connectGoogleAds();
    const credential = await openCredential(crypto, row, KEK);
    expect(credential.accessToken).toBe("ya29.access");
    expect(credential.refreshToken).toBe("1//refresh");
  });

  it("refuses a grant missing the scope its source needs, before writing anything", async () => {
    // Providers may grant less than was asked for. Without this the row is written, and the first
    // scheduled pull 403s hours later with nothing pointing at the cause.
    await expect(
      connectGoogleAds(
        googleTokens({ grantedScopes: ["https://www.googleapis.com/auth/userinfo.email"] }),
      ),
    ).rejects.toThrow(ConnectionError);
    expect(rows.size).toBe(0);
  });

  it("names the missing scope and what to do about it", async () => {
    try {
      await connectGoogleAds(googleTokens({ grantedScopes: ["something-else"] }));
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ConnectionError).code).toBe("missing_scope");
      expect((error as Error).message).toContain("adwords");
      expect((error as Error).message).toContain("Reconnect");
    }
  });

  it("accepts a provider that reports no scopes at all", async () => {
    // Meta does not return a scope string on this endpoint. "Not reported" is not "granted
    // nothing", and treating them the same would make Meta unconnectable.
    const row = await connect(crypto, store, {
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
      source: "meta_ads",
      externalAccountId: "act_222",
      tokens: {
        accessToken: "EAA...",
        refreshToken: null,
        expiresAt: "2026-11-07T00:00:00Z",
        grantedScopes: [],
        raw: {},
      },
      kek: KEK,
      keyVersion: 1,
    });
    expect(row.status).toBe("active");
  });
});

describe("the credential is bound to its row", () => {
  it("cannot be opened as another workspace's connection", async () => {
    // The attack RLS does not cover: relocating a ciphertext into a row the attacker can read.
    const row = await connectGoogleAds();
    await expect(
      openCredential(crypto, { ...row, workspaceId: "c0000000-0000-0000-0000-000000000002" }, KEK),
    ).rejects.toThrow();
  });

  it("cannot be opened under a different connection id", async () => {
    const row = await connectGoogleAds();
    await expect(
      openCredential(crypto, { ...row, id: "e0000000-0000-0000-0000-000000000009" }, KEK),
    ).rejects.toThrow();
  });

  it("refuses to open a revoked connection", async () => {
    // The row is kept for the audit trail, not for use.
    const row = await connectGoogleAds();
    try {
      await openCredential(crypto, { ...row, revokedAt: NOW.toISOString() }, KEK);
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ConnectionError).code).toBe("revoked");
    }
  });
});

describe("health, and why the two providers differ", () => {
  function row(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
    return {
      id: CONNECTION,
      workspaceId: WORKSPACE,
      provider: "google_ads",
      externalAccountId: "111",
      displayName: null,
      credentialCiphertext: new Uint8Array(),
      credentialIv: new Uint8Array(),
      wrappedDek: new Uint8Array(),
      keyVersion: 1,
      grantedScopes: [],
      expiresAt: null,
      status: "active" as ConnectionStatus,
      lastError: null,
      revokedAt: null,
      ...overrides,
    };
  }

  it("treats an expired Google token as routine, because it can be refreshed", () => {
    const health = connectionHealth(row({ expiresAt: "2026-09-07T00:00:00Z" }), NOW);
    expect(health.usable).toBe(true);
    expect(health.needsCustomerAction).toBe(false);
  });

  it("treats an expired Meta token as needing the customer, because it cannot", () => {
    // Meta issues no refresh token. Only the customer can fix this, and nothing else will.
    const health = connectionHealth(
      row({ provider: "meta_ads", expiresAt: "2026-09-07T00:00:00Z" }),
      NOW,
    );
    expect(health.status).toBe("needs_reauth");
    expect(health.usable).toBe(false);
    expect(health.needsCustomerAction).toBe(true);
    expect(health.reason).toContain("Reconnect");
  });

  it("warns before a Meta token expires rather than after", () => {
    const health = connectionHealth(
      row({ provider: "meta_ads", expiresAt: "2026-09-11T00:00:00Z" }),
      NOW,
    );
    expect(health.usable).toBe(true);
    expect(health.needsCustomerAction).toBe(true);
    expect(health.reason).toContain("within a week");
  });

  it("does not nag about a Meta token that is still weeks out", () => {
    const health = connectionHealth(
      row({ provider: "meta_ads", expiresAt: "2026-11-07T00:00:00Z" }),
      NOW,
    );
    expect(health.needsCustomerAction).toBe(false);
  });

  it("reports a revoked connection as unusable and not the customer's problem", () => {
    const health = connectionHealth(row({ revokedAt: NOW.toISOString() }), NOW);
    expect(health.status).toBe("revoked");
    expect(health.usable).toBe(false);
    expect(health.needsCustomerAction).toBe(false);
  });

  it("surfaces the recorded error when a connection is in error", () => {
    const health = connectionHealth(row({ status: "error", lastError: "quota exceeded" }), NOW);
    expect(health.reason).toBe("quota exceeded");
  });
});

describe("recording a failed pull", () => {
  it("asks the customer to reconnect on an authorisation failure", async () => {
    const row = await connectGoogleAds();
    const status = await recordFailure(store, row, { status: 401, message: "invalid_grant" });
    expect(status).toBe("needs_reauth");
    expect(connectionHealth(rows.get(CONNECTION) as ConnectionRow, NOW).needsCustomerAction).toBe(
      true,
    );
  });

  it("does not blame the customer for anything else", async () => {
    // A transient platform blip must not tell a customer their account is broken.
    const row = await connectGoogleAds();
    expect(await recordFailure(store, row, { status: 503, message: "upstream unavailable" })).toBe(
      "error",
    );
    expect(await recordFailure(store, row, { message: "socket hang up" })).toBe("error");
  });
});
