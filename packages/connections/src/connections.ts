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

/**
 * Sources whose credential the MERCHANT issues to itself and pastes in.
 *
 * 11A.13's first test is "who is reviewed". An OAuth source puts THIS COMPANY in front of a
 * platform reviewer and that review is the schedule; a key-paste source has no reviewer and no
 * calendar, because the merchant generates the key in its own admin. That is a different lifecycle,
 * not a different flavour of the same one, and the difference is why this list exists rather than
 * a boolean on a provider config:
 *
 *   - There is no authorisation server, so no scope to check and none to be missing.
 *   - There is no refresh token, because there is nothing to refresh.
 *   - THE CREDENTIAL NEVER EXPIRES. It stops working when the merchant deletes it or the WordPress
 *     user behind it is removed, and neither event has a date we could hold. `expiresAt` is null
 *     and means "no expiry", not "unknown expiry".
 */
export const KEY_PASTE_PROVIDERS = ["woocommerce"] as const;

export type KeyPasteProvider = (typeof KEY_PASTE_PROVIDERS)[number];

/** Every provider a connection can be to. `app.connection_provider` must carry the same members. */
export type ConnectionProvider = SourceId | KeyPasteProvider;

export function isKeyPasteProvider(provider: ConnectionProvider): provider is KeyPasteProvider {
  return (KEY_PASTE_PROVIDERS as readonly string[]).includes(provider);
}

/** The row, as `20260908000500_connections.sql` defines it. */
export interface ConnectionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly provider: ConnectionProvider;
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
 * What gets sealed.
 *
 * A DISCRIMINATED UNION, because the two shapes have nothing in common but the fact that both are
 * secret. An OAuth grant is a pair of tokens with a clock; a key-paste credential is a key and a
 * secret with no clock at all. Modelling the second as the first -- stuffing a consumer key into
 * `accessToken` and calling `refreshToken` null -- would compile, work, and then lie in every place
 * that reasons about the token: `connectionHealth` would consult a provider config that does not
 * exist for it, and a refresh path would eventually try to renew something with no issuer.
 *
 * `kind` is REQUIRED on new credentials and ABSENT on every one sealed before this change. See
 * `openCredential`: a missing `kind` is read as "oauth", because that is what every existing blob
 * is. Do not remove that fallback without re-sealing them.
 */
export type StoredCredential =
  | {
      readonly kind: "oauth";
      readonly accessToken: string;
      readonly refreshToken: string | null;
    }
  | {
      /** The merchant issued this to itself. There is no authorisation server behind it. */
      readonly kind: "key_secret";
      readonly key: string;
      readonly secret: string;
    };

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
    kind: "oauth",
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
 * Store a key-paste credential.
 *
 * A SIBLING OF `connect`, NOT A BRANCH INSIDE IT, and that is the decision this function records.
 * Reusing `connect` would have meant fabricating a `TokenResponse` -- an access token that is not a
 * token, a null refresh token, an invented expiry -- and then `connect` would call
 * `scopesFor(providerFor(source), ...)`, which for a key-paste source is meaningless. The type
 * system says so: `providerFor` takes `SourceId`, and `woocommerce` is not one, so that lie does
 * not compile rather than merely being wrong.
 *
 * NO SCOPE CHECK, because there is nothing to check. The merchant chose the permission level when
 * it created the key -- WooCommerce offers Read, Write and Read/Write -- and the platform reports
 * nothing back about what was granted. `grantedScopes` is therefore empty rather than invented, and
 * an insufficient permission surfaces as a 403 on the first pull, which `recordFailure` already
 * turns into `needs_reauth`. That is the honest failure mode: only the merchant can widen a key,
 * so only the merchant can fix it.
 *
 * `externalAccountId` HOLDS THE STORE ORIGIN for WooCommerce, e.g. "https://shop.example.com".
 * That is not a special case dressed up: the field means "the id of the account at the provider",
 * and for a self-hosted store the origin IS the account. Documented here rather than adding a
 * `base_url` column for one source, and it stays out of the sealed blob because it is not a secret
 * -- the scheduler needs it to build a URL, and re-opening an envelope to read a hostname would be
 * a decryption on every request.
 */
export async function connectWithKey(
  crypto: VaultCrypto,
  store: ConnectionStore,
  options: {
    workspaceId: string;
    connectionId: string;
    provider: KeyPasteProvider;
    /** The account at the provider. For a self-hosted store, its https origin. */
    externalAccountId: string;
    displayName?: string;
    key: string;
    secret: string;
    kek: Uint8Array;
    keyVersion: number;
  },
): Promise<ConnectionRow> {
  if (options.key.trim() === "" || options.secret.trim() === "") {
    throw new ConnectionError(
      "a key-paste connection needs both a key and a secret. An empty half seals successfully and " +
        "fails on the first pull, hours later, with nothing pointing at the cause.",
      "no_credential",
    );
  }

  const credential: StoredCredential = {
    kind: "key_secret",
    key: options.key,
    secret: options.secret,
  };

  const sealed = await seal(crypto, {
    plaintext: JSON.stringify(credential),
    kek: options.kek,
    keyVersion: options.keyVersion,
    scope: { workspaceId: options.workspaceId, connectionId: options.connectionId },
  });

  return store.upsert({
    id: options.connectionId,
    workspaceId: options.workspaceId,
    provider: options.provider,
    externalAccountId: options.externalAccountId,
    displayName: options.displayName ?? null,
    credentialCiphertext: sealed.ciphertext,
    credentialIv: sealed.iv,
    wrappedDek: sealed.wrappedDek,
    keyVersion: sealed.keyVersion,
    // Empty, not invented. The platform reports no grant.
    grantedScopes: [],
    // NULL MEANS "NO EXPIRY", not "unknown". See KEY_PASTE_PROVIDERS.
    expiresAt: null,
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

  const parsed = JSON.parse(plaintext) as Partial<StoredCredential> & Record<string, unknown>;

  // BACKWARDS COMPATIBILITY, and the reason it is safe. Every credential sealed before the union
  // existed is an OAuth pair with no `kind`, so a missing discriminant is not ambiguous -- it is
  // dated. Defaulting the other way would read a real OAuth blob as a key/secret and hand the
  // scheduler two undefined fields. Remove this only after re-sealing, never before.
  if (parsed.kind === undefined) {
    return {
      kind: "oauth",
      accessToken: parsed.accessToken as string,
      refreshToken: (parsed.refreshToken as string | null) ?? null,
    };
  }

  return parsed as StoredCredential;
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

  // A KEY-PASTE CONNECTION HAS NO PROVIDER CONFIG AND NO CLOCK, so it must be answered before the
  // lookup below -- `providerFor` does not accept it, and every branch after this one reasons about
  // an expiry it does not have. Reaching the expiry logic with `expiresAt: null` would report
  // "Connected." by accident rather than on purpose; this says it on purpose.
  if (isKeyPasteProvider(row.provider)) {
    return {
      status: "active",
      usable: true,
      needsCustomerAction: false,
      reason: "Connected. This key does not expire; it stops working only if you delete it.",
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
