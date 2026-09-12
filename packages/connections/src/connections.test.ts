import type { TokenResponse } from "@repo/oauth";
import { type CryptoLike, seal } from "@repo/vault";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ConnectionError,
  type ConnectionRow,
  type ConnectionStatus,
  type ConnectionStore,
  type CredentialLane,
  connect,
  connectWithKey,
  connectWithToken,
  connectionHealth,
  lanesFor,
  offersLane,
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
    // Narrowing on `kind` is the point of the union: a caller cannot reach `accessToken` without
    // first establishing that this is an OAuth credential and not a pasted key.
    expect(credential.kind).toBe("oauth");
    if (credential.kind !== "oauth") throw new Error("expected an oauth credential");
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
      credentialLane: "oauth" as CredentialLane,
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

describe("the key-paste lane", () => {
  const STORE_URL = "https://shop.example.com";

  async function connectWoo(overrides: { key?: string; secret?: string } = {}) {
    return connectWithKey(crypto, store, {
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
      provider: "woocommerce",
      externalAccountId: STORE_URL,
      key: overrides.key ?? "ck_a1b2c3d4e5f6",
      secret: overrides.secret ?? "cs_9z8y7x6w5v4u",
      kek: KEK,
      keyVersion: 1,
    });
  }

  it("seals a key and secret so neither appears on the row", async () => {
    const row = await connectWoo();
    const asText = JSON.stringify(row);
    expect(asText).not.toContain("ck_a1b2c3d4e5f6");
    expect(asText).not.toContain("cs_9z8y7x6w5v4u");
    // And the ciphertext is real rather than an empty buffer that would trivially satisfy the above.
    expect(row.credentialCiphertext.byteLength).toBeGreaterThan(0);
  });

  it("round-trips through the vault under its own discriminant", async () => {
    const row = await connectWoo();
    const credential = await openCredential(crypto, row, KEK);
    expect(credential.kind).toBe("key_secret");
    if (credential.kind !== "key_secret") throw new Error("expected a key_secret credential");
    expect(credential.key).toBe("ck_a1b2c3d4e5f6");
    expect(credential.secret).toBe("cs_9z8y7x6w5v4u");
  });

  it("records no expiry and no scopes, rather than inventing either", async () => {
    // `expiresAt: null` MEANS "no expiry" here, where for an OAuth row it would mean "unknown".
    // `grantedScopes: []` because WooCommerce reports nothing back about the permission level the
    // merchant chose -- an insufficient key surfaces as a 403 on the first pull.
    const row = await connectWoo();
    expect(row.expiresAt).toBeNull();
    expect(row.grantedScopes).toEqual([]);
    expect(row.status).toBe("active");
  });

  it("refuses an empty half before writing anything", async () => {
    // An empty secret seals successfully and fails hours later on a scheduled pull, with nothing
    // pointing at the cause -- the same failure the OAuth scope check exists to prevent.
    await expect(connectWoo({ secret: "   " })).rejects.toThrow(ConnectionError);
    await expect(connectWoo({ key: "" })).rejects.toThrow(/needs both a key and a secret/);
    expect(rows.size).toBe(0);
  });

  it("reports health without consulting a provider config it does not have", async () => {
    // The branch under test sits BEFORE `PROVIDERS[providerFor(row.provider)]`, which cannot accept
    // a key-paste provider at all. Reaching that lookup would throw rather than return a health.
    const row = await connectWoo();
    const health = connectionHealth(row, NOW);
    expect(health.usable).toBe(true);
    expect(health.needsCustomerAction).toBe(false);
    expect(health.reason).toMatch(/does not expire/i);
  });

  it("still honours a revocation, which is the one thing that does stop it", async () => {
    const row = await connectWoo();
    const revoked = { ...row, status: "revoked" as ConnectionStatus, revokedAt: NOW.toISOString() };
    expect(connectionHealth(revoked, NOW).usable).toBe(false);
    await expect(openCredential(crypto, revoked, KEK)).rejects.toThrow(/revoked/);
  });

  it("routes a 401 to needs_reauth, because only the merchant can reissue a key", async () => {
    const row = await connectWoo();
    expect(await recordFailure(store, row, { status: 401, message: "invalid key" })).toBe(
      "needs_reauth",
    );
  });

  it("knows which lanes each provider offers, including the one that offers two", () => {
    expect(lanesFor("woocommerce")).toEqual(["key_secret"]);
    expect(lanesFor("ga4")).toEqual(["oauth"]);
    // The entry the whole change exists for: same provider, same account, two ways in.
    expect(lanesFor("meta_ads")).toEqual(["oauth", "bearer"]);
    expect(offersLane("meta_ads", "bearer")).toBe(true);
    expect(offersLane("ga4", "bearer")).toBe(false);
    expect(offersLane("woocommerce", "oauth")).toBe(false);
  });
});

describe("credentials sealed before the union existed", () => {
  /**
   * Seals the EXACT payload shape that is on disk today: an OAuth pair with no discriminant.
   *
   * This has to bypass `connect`, which now writes `kind`. An earlier version of this test called
   * `connect` and then re-opened the row -- so it exercised the modern path and asserted the
   * fallback it never reached. A test that cannot fail is not evidence.
   */
  async function sealLegacyBlob(payload: Record<string, unknown>): Promise<ConnectionRow> {
    const sealed = await seal(crypto, {
      plaintext: JSON.stringify(payload),
      kek: KEK,
      keyVersion: 1,
      scope: { workspaceId: WORKSPACE, connectionId: CONNECTION },
    });
    return store.upsert({
      id: CONNECTION,
      workspaceId: WORKSPACE,
      provider: "ga4",
      credentialLane: "oauth",
      externalAccountId: "properties/123",
      displayName: null,
      credentialCiphertext: sealed.ciphertext,
      credentialIv: sealed.iv,
      wrappedDek: sealed.wrappedDek,
      keyVersion: sealed.keyVersion,
      grantedScopes: [],
      expiresAt: null,
      status: "active",
      lastError: null,
      revokedAt: null,
    });
  }

  it("reads a blob with no `kind` as an OAuth credential", async () => {
    // A missing discriminant is dated, not ambiguous. Defaulting the other way would hand the
    // scheduler a key_secret with two undefined fields and no error.
    const row = await sealLegacyBlob({ accessToken: "ya29.legacy", refreshToken: "1//legacy" });
    const credential = await openCredential(crypto, row, KEK);
    expect(credential.kind).toBe("oauth");
    if (credential.kind !== "oauth") throw new Error("expected an oauth credential");
    expect(credential.accessToken).toBe("ya29.legacy");
    expect(credential.refreshToken).toBe("1//legacy");
  });

  it("normalises a legacy blob whose refreshToken was absent rather than null", async () => {
    // Meta issues no refresh token, and an older seal may have omitted the key entirely rather
    // than writing null. The caller must get null either way, not undefined.
    const row = await sealLegacyBlob({ accessToken: "EAAG.legacy" });
    const credential = await openCredential(crypto, row, KEK);
    if (credential.kind !== "oauth") throw new Error("expected an oauth credential");
    expect(credential.refreshToken).toBeNull();
  });
});

describe("the bearer lane, and the token a customer mints for itself", () => {
  let store: ConnectionStore;
  let rows: Map<string, ConnectionRow>;

  beforeEach(() => {
    ({ store, rows } = memoryStore());
  });

  function connectToken(overrides: Record<string, unknown> = {}) {
    return connectWithToken(crypto, store, {
      workspaceId: WORKSPACE,
      connectionId: CONNECTION,
      provider: "meta_ads",
      externalAccountId: "act_1234567890",
      token: "EAAG_system_user_token",
      kek: KEK,
      keyVersion: 1,
      now: NOW,
      ...overrides,
    });
  }

  it("seals one token under its own discriminant rather than half a key pair", async () => {
    const row = await connectToken();
    expect(row.credentialLane).toBe("bearer");
    const credential = await openCredential(crypto, row, KEK);
    expect(credential.kind).toBe("bearer");
    if (credential.kind !== "bearer") throw new Error("expected a bearer credential");
    expect(credential.token).toBe("EAAG_system_user_token");
  });

  it("refuses a provider that has no pasteable token, before writing anything", async () => {
    // Google issues no long-lived pasteable token, so offering the lane would be offering a road
    // with no end. The refusal names the lanes that do exist rather than just saying no.
    await expect(connectToken({ provider: "ga4" })).rejects.toThrow(/no pasteable long-lived/);
    await expect(connectToken({ provider: "ga4" })).rejects.toThrow(/oauth/);
    expect(rows.size).toBe(0);
  });

  it("refuses an empty token, for the reason an empty key half is refused", async () => {
    await expect(connectToken({ token: "   " })).rejects.toThrow(ConnectionError);
    expect(rows.size).toBe(0);
  });

  it("refuses a token that has already expired, while the customer is still at the keyboard", async () => {
    // The alternative is discovering it on a scheduled pull at 3am, when the only available action
    // is marking the row broken.
    await expect(connectToken({ expiresAt: "2026-09-01T00:00:00Z" })).rejects.toThrow(
      /expired at 2026-09-01/,
    );
    expect(rows.size).toBe(0);
  });

  it("refuses an unparseable expiry rather than storing it as null", async () => {
    // Null means PERMANENT here. Silently coercing a typo to null would promote a dated token to
    // a permanent one, which is the one direction that fails silently.
    await expect(connectToken({ expiresAt: "next tuesday" })).rejects.toThrow(
      /must be a timestamp/,
    );
    expect(rows.size).toBe(0);
  });

  it("reports no scopes, because the platform reports none back at paste time", async () => {
    const row = await connectToken();
    expect(row.grantedScopes).toEqual([]);
    expect(row.expiresAt).toBeNull();
  });

  it("calls a null expiry permanent, and says so in words the customer can act on", async () => {
    const health = connectionHealth(await connectToken(), NOW);
    expect(health.usable).toBe(true);
    expect(health.needsCustomerAction).toBe(false);
    expect(health.reason).toMatch(/does not expire/i);
  });

  it("does NOT call a dated token permanent -- the defect the old provider list produced", async () => {
    // THIS IS THE TRAP THE LANE EXISTS TO REMOVE, and it is worth stating precisely rather than
    // dramatically. The old model keyed health off the PROVIDER: `isKeyPasteProvider(row.provider)`
    // returned early with "this key does not expire". So adding the Meta paste lane the obvious way
    // -- putting `meta_ads` in KEY_PASTE_PROVIDERS -- would have made that branch answer for EVERY
    // Meta connection, OAuth grants included, reporting `usable: true` on a grant that expired
    // sixty days ago. The only alternative under that model was not offering the lane at all.
    // Keying off the connection's own lane is what makes both answers available at once.
    const dead = await (async () => {
      const row = await connectToken();
      return { ...row, expiresAt: "2026-09-07T00:00:00Z" };
    })();
    const health = connectionHealth(dead, NOW);
    expect(health.usable).toBe(false);
    expect(health.needsCustomerAction).toBe(true);
    expect(health.status).toBe("needs_reauth");
    expect(health.reason).toMatch(/mint a new one/i);
    // And it must not tell them to reconnect an account, because there is no account to reconnect.
    expect(health.reason).not.toMatch(/reconnect the account/i);
  });

  it("warns a week out, so the gap is avoidable rather than reported", async () => {
    const row = await connectToken();
    const soon = { ...row, expiresAt: "2026-09-11T00:00:00Z" };
    const health = connectionHealth(soon, NOW);
    expect(health.usable).toBe(true);
    expect(health.needsCustomerAction).toBe(true);
    expect(health.reason).toMatch(/within a week/i);
  });

  it("stays quiet when the expiry is comfortably away", async () => {
    const row = await connectToken();
    const later = { ...row, expiresAt: "2026-11-07T00:00:00Z" };
    expect(connectionHealth(later, NOW)).toMatchObject({
      usable: true,
      needsCustomerAction: false,
      reason: "Connected.",
    });
  });

  it("lets one provider hold both lanes without either learning the other's rules", async () => {
    // Meta over OAuth expires and cannot be refreshed -- `connectionHealth` says "reconnect the
    // account". The same provider over a pasted token says "mint a new one". Same provider, same
    // expiry, different instruction, because the customer's actual next action differs.
    const pasted = { ...(await connectToken()), expiresAt: "2026-09-07T00:00:00Z" };
    const granted = {
      ...pasted,
      credentialLane: "oauth" as CredentialLane,
      expiresAt: "2026-09-07T00:00:00Z",
    };
    expect(connectionHealth(pasted, NOW).reason).toMatch(/mint a new one/i);
    expect(connectionHealth(granted, NOW).reason).toMatch(/reconnect the account/i);
  });

  it("refuses to open a credential whose blob disagrees with its column", async () => {
    // The column is readable without the KEK; that is why it exists. The cost is a second copy of
    // one fact, and a second copy that can drift is exactly how this module's history went wrong.
    const row = await connectToken();
    const mislabelled = { ...row, credentialLane: "oauth" as CredentialLane };
    await expect(openCredential(crypto, mislabelled, KEK)).rejects.toThrow(
      /recorded as a oauth credential but seals a bearer one/,
    );
  });

  it("routes a 401 to needs_reauth, because only the customer can mint another", async () => {
    const row = await connectToken();
    expect(await recordFailure(store, row, { status: 401, message: "invalid token" })).toBe(
      "needs_reauth",
    );
  });
});
