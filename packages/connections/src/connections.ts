/**
 * The connection service: where the OAuth flow, the vault and the `connections` table meet.
 *
 * This is the seam the whole Connect milestone turns on. A completed authorisation arrives as
 * tokens; what has to come out is a row that (a) contains no readable credential, (b) belongs to
 * exactly one workspace, and (c) carries enough about its own health that a scheduled pull failing
 * at 3am is diagnosable rather than mysterious.
 *
 * Persistence is INJECTED rather than imported. There is no live Supabase project yet, and more
 * importantly the same logic runs from a Next server action when a customer connects and from a
 * Worker when the scheduler refreshes. A store interface keeps both honest and keeps this testable
 * against the real vault and the real OAuth code rather than against mocks of them.
 */

import type { CryptoLike as VaultCrypto, SealedCredential } from "@repo/vault";
import { open, seal } from "@repo/vault";
import type { SourceId, TokenResponse } from "@repo/oauth";
import { PROVIDERS, providerFor, scopesFor } from "@repo/oauth";

export type ConnectionStatus = "active" | "needs_reauth" | "revoked" | "error";

/** The row, as `20260908000500_connections.sql` defines it. */
export interface ConnectionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly provider: SourceId;
  readonly externalAccountId: string;
  readonly displayName: string | null;
  readonly credentialCiphertext: Uint8Array;
  readonly credentialIv: Uint8Array;
  readonly wrappedDek: Uint8Array;
  readonly keyVersion: number;
  readonly grantedScopes: readonly string[];
  readonly expiresAt: string | null;
  readonly status: ConnectionStatus;
  readonly lastError: string | null;
  readonly revokedAt: string | null;
}

/** What the caller must implement. Deliberately small: four operations, no query language. */
export interface ConnectionStore {
  upsert(row: Omit<ConnectionRow, "id"> & { id?: string }): Promise<ConnectionRow>;
  get(id: string): Promise<ConnectionRow | null>;
  markStatus(id: string, status: ConnectionStatus, lastError: string | null): Promise<void>;
}

/**
 * What gets sealed. Both halves of the grant travel together so a refresh has everything it needs
 * without a second read, and so a rotation re-seals one blob rather than two.
 */
export interface StoredCredential {
  readonly accessToken: string;
  readonly refreshToken: string | null;
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly code: "missing_scope" | "no_credential" | "revoked" | "expired",
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * Turn a completed authorisation into a stored connection.
 *
 * The scope check happens BEFORE anything is written. A connection missing the scope its source
 * needs is not a connection — it is a row that will 403 on the first scheduled pull, hours later,
 * with nothing pointing at the cause. Providers may grant less than was asked for, so this is a real
 * case rather than a defensive one.
 */
export async function connect(
  crypto: VaultCrypto,
  store: ConnectionStore,
  options: {
    workspaceId: string;
    connectionId: string;
    source: SourceId;
    externalAccountId: string;
    displayName?: string;
    tokens: TokenResponse;
    kek: Uint8Array;
    keyVersion: number;
  },
): Promise<ConnectionRow> {
  const required = scopesFor(providerFor(options.source), [options.source]);
  const missing = required.filter((scope) => !options.tokens.grantedScopes.includes(scope));

  // An empty grantedScopes means the provider did not report them, which is not the same as
  // granting nothing. Meta does not return a scope string on this endpoint.
  if (options.tokens.grantedScopes.length > 0 && missing.length > 0) {
    throw new ConnectionError(
      `the grant is missing ${missing.join(", ")}, which ${options.source} needs. Reconnect and ` +
        "accept every permission, or connect a different account.",
      "missing_scope",
    );
  }

  const credential: StoredCredential = {
    accessToken: options.tokens.accessToken,
    refreshToken: options.tokens.refreshToken,
  };

  const sealed = await seal(crypto, {
    plaintext: JSON.stringify(credential),
    kek: options.kek,
    keyVersion: options.keyVersion,
    // Binds the ciphertext to this row. Moving it to another workspace's connection makes it
    // undecryptable rather than merely unauthorised. See packages/vault.
    scope: { workspaceId: options.workspaceId, connectionId: options.connectionId },
  });

  return store.upsert({
    id: options.connectionId,
    workspaceId: options.workspaceId,
    provider: options.source,
    externalAccountId: options.externalAccountId,
    displayName: options.displayName ?? null,
    credentialCiphertext: sealed.ciphertext,
    credentialIv: sealed.iv,
    wrappedDek: sealed.wrappedDek,
    keyVersion: sealed.keyVersion,
    grantedScopes: options.tokens.grantedScopes,
    expiresAt: options.tokens.expiresAt,
    status: "active",
    lastError: null,
    revokedAt: null,
  });
}

/**
 * Open a stored credential, for the scheduler.
 *
 * Refuses on a revoked connection rather than returning a credential that should no longer be used.
 * A revoked row is kept for the audit trail, not for use.
 */
export async function openCredential(
  crypto: VaultCrypto,
  row: ConnectionRow,
  kek: Uint8Array,
): Promise<StoredCredential> {
  if (row.revokedAt !== null || row.status === "revoked") {
    throw new ConnectionError(
      `connection ${row.id} is revoked and its credential must not be used`,
      "revoked",
    );
  }

  const sealed: SealedCredential = {
    ciphertext: row.credentialCiphertext,
    iv: row.credentialIv,
    wrappedDek: row.wrappedDek,
    keyVersion: row.keyVersion,
  };

  const plaintext = await open(crypto, {
    sealed,
    kek,
    scope: { workspaceId: row.workspaceId, connectionId: row.id },
  });

  return JSON.parse(plaintext) as StoredCredential;
}

export interface ConnectionHealth {
  readonly status: ConnectionStatus;
  /** Whether a scheduled pull can run right now. */
  readonly usable: boolean;
  /** Whether the customer has to do something. */
  readonly needsCustomerAction: boolean;
  readonly reason: string;
}

/**
 * Whether a connection is fit to pull with.
 *
 * The provider difference is the whole point of this function. Google issues a refresh token, so an
 * expired access token is routine and self-healing. Meta issues none: a long-lived token simply
 * expires after about sixty days, and only the customer can fix it. Treating those two the same
 * either wakes someone for a refresh that would have happened anyway, or lets a Meta connection go
 * dark with nobody told.
 */
export function connectionHealth(row: ConnectionRow, now: Date): ConnectionHealth {
  if (row.revokedAt !== null || row.status === "revoked") {
    return {
      status: "revoked",
      usable: false,
      needsCustomerAction: false,
      reason: "This connection was revoked.",
    };
  }

  if (row.status === "error") {
    return {
      status: "error",
      usable: false,
      needsCustomerAction: true,
      reason: row.lastError ?? "The last pull failed.",
    };
  }

  // A PERSISTED needs_reauth outranks anything derived from the expiry.
  //
  // Found by the test rather than by reading: without this branch a connection the scheduler had
  // already marked needs_reauth after a 401 fell through to "Connected.", because the access token
  // had not expired on paper. That is precisely the silent failure this function exists to prevent
  // -- the platform has rejected the grant, and no clock we hold knows it.
  if (row.status === "needs_reauth") {
    return {
      status: "needs_reauth",
      usable: false,
      needsCustomerAction: true,
      reason: row.lastError ?? "The platform rejected this connection. Reconnect the account.",
    };
  }

  const config = PROVIDERS[providerFor(row.provider)];
  const expiresAt = row.expiresAt === null ? null : Date.parse(row.expiresAt);
  const expired = expiresAt !== null && expiresAt <= now.getTime();

  if (expired && config.issuesRefreshToken) {
    // Routine. The scheduler renews it without involving anyone.
    return {
      status: "active",
      usable: true,
      needsCustomerAction: false,
      reason: "The access token has expired and will be refreshed on the next pull.",
    };
  }

  if (expired) {
    return {
      status: "needs_reauth",
      usable: false,
      needsCustomerAction: true,
      reason: `${config.displayName} tokens cannot be refreshed and this one has expired. Reconnect the account.`,
    };
  }

  // Warn before it breaks, not after. Meta's window is ~60 days, so a week is enough notice for
  // someone to act without it becoming noise.
  const WARN_MS = 7 * 24 * 60 * 60 * 1000;
  if (!config.issuesRefreshToken && expiresAt !== null && expiresAt - now.getTime() < WARN_MS) {
    return {
      status: "active",
      usable: true,
      needsCustomerAction: true,
      reason: `This ${config.displayName} connection expires within a week and cannot be refreshed automatically. Reconnect it to avoid a gap.`,
    };
  }

  return { status: "active", usable: true, needsCustomerAction: false, reason: "Connected." };
}

/**
 * Record a failed pull.
 *
 * An authorisation failure is the customer's to fix and must be surfaced; anything else is ours and
 * must not be, or every transient platform blip tells a customer their account is broken.
 */
export async function recordFailure(
  store: ConnectionStore,
  row: ConnectionRow,
  error: { status?: number; message: string },
): Promise<ConnectionStatus> {
  const isAuthFailure = error.status === 401 || error.status === 403;
  const status: ConnectionStatus = isAuthFailure ? "needs_reauth" : "error";
  await store.markStatus(row.id, status, error.message);
  return status;
}
