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

/**
 * Every status a connection can be in. `app.connection_status` must carry the same members.
 *
 * A RUNTIME LIST AND NOT ONLY A TYPE, because a type cannot narrow a value read from a database.
 * `app.connection_status` is `text` on the wire -- PostgREST serialises an enum as a string -- so
 * an adapter reading a connection row has to either check membership or cast, and a cast here
 * would let an unknown status through to `connectionHealth`, which would answer about it. The
 * union is derived from this rather than the other way round so the two cannot separate.
 */
export const CONNECTION_STATUSES = ["active", "needs_reauth", "revoked", "error"] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * HOW A CREDENTIAL GOT HERE, AND THEREFORE WHAT IS TRUE ABOUT IT.
 *
 * This replaces a list of "key-paste providers", and the reason is Meta. That list made the lane a
 * property of the PROVIDER -- woocommerce is key-paste, everything else is OAuth -- and Meta is a
 * counterexample the product needs rather than an edge case: the same Meta Ads account can be
 * connected by sending an owner through the OAuth dance, or by pasting a System User token the
 * customer minted in its own Business Manager. Same provider, same account, two lanes, and
 * everything downstream that matters -- whether a refresh exists, whether a null expiry means
 * "never" or "we were not told", what to say when it breaks -- differs between them.
 *
 * So the lane belongs to the CONNECTION. It is a column, not a lookup, and `connectionHealth`
 * reads it instead of asking which list the provider is on.
 *
 *   - `oauth`       an authorisation server issued it. It has scopes, a clock, and possibly a
 *                   refresh token. Only this lane can ever self-heal.
 *   - `key_secret`  the customer issued itself a key AND a secret in its own admin. No issuer, no
 *                   scopes reported back, no clock.
 *   - `bearer`      the customer issued itself ONE opaque token. No issuer, no scopes reported
 *                   back, and a clock only if the platform gave us a date -- Meta System User
 *                   tokens may be dated or permanent, a Shopify Admin token is permanent. A bearer
 *                   token is NEVER refreshable: there is no issuer to ask.
 */
export type CredentialLane = "oauth" | "key_secret" | "bearer";

export const CREDENTIAL_LANES = ["oauth", "key_secret", "bearer"] as const;

/**
 * Which lanes each provider actually offers.
 *
 * Enumerated rather than inferred, because offering a lane is a claim about the platform and not
 * about our code: Google has no pasteable long-lived token, so `bearer` for `ga4` would be a lane
 * a customer can never walk down. `connectWithToken` and `connectWithKey` both check this, so an
 * unsupported lane is refused at the seam instead of sealing a credential nothing can use.
 */
export const PROVIDER_LANES = {
  ga4: ["oauth"],
  google_ads: ["oauth"],
  search_console: ["oauth"],
  // BOTH, and this is the entry the type above exists for. §11A.13's "who is reviewed" test cuts
  // differently per lane: the OAuth lane puts this company in front of a Meta reviewer, the System
  // User lane puts nobody in front of anybody, because the customer minted the token itself.
  meta_ads: ["oauth", "bearer"],
  woocommerce: ["key_secret"],

  // OAUTH ONLY, AND THE SINGLE-ELEMENT ARRAY IS A REFUSAL RATHER THAN AN OMISSION.
  //
  // Loyverse DOES issue a pasteable long-lived credential -- a personal access token the merchant
  // mints in its own back office, exactly the shape `connectWithToken` exists for. It is not
  // listed, so `offersLane("loyverse", "bearer")` is false and `connectWithToken` refuses the
  // provider before anything is sealed.
  //
  // The reason is the platform's own sentence about that token: it "gives unlimited access to the
  // targeted account" -- no scopes, and on this API unlimited includes RECEIPTS_WRITE,
  // ITEMS_WRITE, INVENTORY_WRITE and TAXES_WRITE. `meta_ads` above carries two lanes because both
  // of Meta's are scope-bounded and the difference is only who gets reviewed; here the two lanes
  // differ in what the credential can DO, so offering both would mean the same connector
  // sometimes satisfies the read-only pillar and sometimes only promises to. See
  // `PROVIDERS.loyverse` in @repo/oauth for the full argument.
  loyverse: ["oauth"],
} as const satisfies Record<string, readonly CredentialLane[]>;

/** Every provider a connection can be to. `app.connection_provider` must carry the same members. */
export type ConnectionProvider = keyof typeof PROVIDER_LANES;

export function lanesFor(provider: ConnectionProvider): readonly CredentialLane[] {
  return PROVIDER_LANES[provider];
}

export function offersLane(provider: ConnectionProvider, lane: CredentialLane): boolean {
  return (PROVIDER_LANES[provider] as readonly CredentialLane[]).includes(lane);
}

/**
 * Whether the customer minted this credential itself.
 *
 * Derived from the lane rather than stored, because it is a consequence and not a fact: both
 * non-OAuth lanes share the properties that matter here -- no authorisation server, so no scopes
 * came back and no refresh is possible -- and a third such lane should inherit them by default
 * rather than by somebody remembering to add it to a list. That forgetting is what this change is
 * repairing.
 */
export function isSelfIssued(lane: CredentialLane): boolean {
  return lane !== "oauth";
}

/** Narrows to the subset of providers that `providerFor` and `scopesFor` accept. */
export function isOAuthSource(provider: ConnectionProvider): provider is SourceId {
  return offersLane(provider, "oauth");
}

/** The row, as `20260908000500_connections.sql` defines it. */
export interface ConnectionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly provider: ConnectionProvider;
  /** Which lane this credential arrived on. `credential_lane` in the table; never inferred. */
  readonly credentialLane: CredentialLane;
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
    }
  | {
      /**
       * ONE opaque token the customer minted in its own admin.
       *
       * Not a degenerate `key_secret` with an empty half, and not an `oauth` with a null refresh
       * token. Both of those compile; both then lie. `connectWithKey` refuses an empty secret on
       * purpose -- an empty half seals fine and 401s hours later -- so a bearer token pushed
       * through it is rejected outright, and pushed through `connect` it would reach
       * `scopesFor(providerFor(...))` and be measured against scopes no System User token reports.
       */
      readonly kind: "bearer";
      readonly token: string;
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
    credentialLane: "oauth",
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
    provider: ConnectionProvider;
    /** The account at the provider. For a self-hosted store, its https origin. */
    externalAccountId: string;
    displayName?: string;
    key: string;
    secret: string;
    kek: Uint8Array;
    keyVersion: number;
  },
): Promise<ConnectionRow> {
  if (!offersLane(options.provider, "key_secret")) {
    throw new ConnectionError(
      `${options.provider} does not issue a key-and-secret pair. Lanes it offers: ` +
        `${lanesFor(options.provider).join(", ")}.`,
      "no_credential",
    );
  }

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
    credentialLane: "key_secret",
    externalAccountId: options.externalAccountId,
    displayName: options.displayName ?? null,
    credentialCiphertext: sealed.ciphertext,
    credentialIv: sealed.iv,
    wrappedDek: sealed.wrappedDek,
    keyVersion: sealed.keyVersion,
    // Empty, not invented. The platform reports no grant.
    grantedScopes: [],
    // NULL MEANS "NO EXPIRY", not "unknown". A key-and-secret pair has no clock at all.
    expiresAt: null,
    status: "active",
    lastError: null,
    revokedAt: null,
  });
}

/**
 * Store a single pasted bearer token.
 *
 * THE THIRD SIBLING, for the same reason `connectWithKey` was the second: the alternative is a
 * branch inside one function that fabricates the parts the lane does not have. Here that would
 * mean an empty `secret` to satisfy `connectWithKey`'s both-halves refusal -- defeating a check
 * that exists because an empty half seals successfully and 401s hours later with nothing pointing
 * at the cause.
 *
 * `expiresAt` IS ACCEPTED AND OPTIONAL, and that asymmetry with `connectWithKey` is the point.
 * A key-and-secret pair has no clock at all; a bearer token may or may not, and only the customer
 * knows which. Meta will mint a System User token that never expires or one dated sixty days out,
 * from the same screen. Passing null says "permanent" -- it does not say "unknown", and nothing
 * downstream may read it as unknown, because `connectionHealth` would then report "Connected." to
 * somebody whose token died last week.
 *
 * NO SCOPE CHECK, and no invented `grantedScopes`. A System User token carries whatever the
 * customer granted the system user, and the platform reports none of it back at paste time. An
 * insufficient permission surfaces as a 403 on the first pull, which `recordFailure` turns into
 * `needs_reauth` -- the honest failure mode, since only the customer can widen it.
 */
export async function connectWithToken(
  crypto: VaultCrypto,
  store: ConnectionStore,
  options: {
    workspaceId: string;
    connectionId: string;
    provider: ConnectionProvider;
    externalAccountId: string;
    displayName?: string;
    token: string;
    /** When the platform says it dies. Null means PERMANENT, never "we do not know". */
    expiresAt?: string | null;
    kek: Uint8Array;
    keyVersion: number;
    /** Injected so the already-expired refusal below is testable rather than clock-dependent. */
    now?: Date;
  },
): Promise<ConnectionRow> {
  if (!offersLane(options.provider, "bearer")) {
    throw new ConnectionError(
      `${options.provider} has no pasteable long-lived token. Lanes it offers: ` +
        `${lanesFor(options.provider).join(", ")}.`,
      "no_credential",
    );
  }

  if (options.token.trim() === "") {
    throw new ConnectionError(
      "a bearer connection needs a token. An empty one seals successfully and fails on the first " +
        "pull, hours later, with nothing pointing at the cause.",
      "no_credential",
    );
  }

  const expiresAt = options.expiresAt ?? null;
  if (expiresAt !== null) {
    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) {
      throw new ConnectionError(
        `\`expiresAt\` must be a timestamp, got ${JSON.stringify(expiresAt)}. An unparseable ` +
          "date would be stored as null, and null means permanent here.",
        "no_credential",
      );
    }
    // Refused at paste time rather than discovered at 3am. The customer is at the keyboard now and
    // can mint another; the scheduler, later, can only mark the row broken.
    if (parsed <= (options.now ?? new Date()).getTime()) {
      throw new ConnectionError(
        `that token expired at ${expiresAt}. Mint a new one and paste that instead.`,
        "expired",
      );
    }
  }

  const credential: StoredCredential = { kind: "bearer", token: options.token };

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
    credentialLane: "bearer",
    externalAccountId: options.externalAccountId,
    displayName: options.displayName ?? null,
    credentialCiphertext: sealed.ciphertext,
    credentialIv: sealed.iv,
    wrappedDek: sealed.wrappedDek,
    keyVersion: sealed.keyVersion,
    // Empty, not invented. Nothing was reported back.
    grantedScopes: [],
    expiresAt,
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

  // THE COLUMN AND THE BLOB MUST AGREE, and until now nothing checked that they did.
  //
  // `credential_lane` is readable without the KEK -- that is the whole reason it is a column, so
  // `connectionHealth` and the connect surface can reason about a connection without decrypting
  // it. The cost of that convenience is a second copy of one fact, and a second copy that can
  // drift silently is how this file's own history went wrong. If they disagree, every cheap read
  // has been answering from the wrong one, so refuse rather than pick a winner.
  if (parsed.kind !== row.credentialLane) {
    throw new ConnectionError(
      `connection ${row.id} is recorded as a ${row.credentialLane} credential but seals a ` +
        `${parsed.kind} one. Everything that reads the lane without decrypting -- health, the ` +
        "connect surface -- has been answering from the wrong one.",
      "no_credential",
    );
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
/** A week. Long enough to act on, short enough not to become noise. */
const WARN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What a DATED self-issued credential is worth right now.
 *
 * Separated from the OAuth path because the advice differs in the only way the customer cares
 * about: an expired OAuth grant is fixed by reconnecting an account, and an expired pasted token
 * is fixed by minting another and pasting it. Telling someone to "reconnect the account" when
 * there is no account to reconnect sends them looking for a button that does not exist.
 */
function selfIssuedExpiry(expiresAtIso: string, now: Date): ConnectionHealth {
  const expiresAt = Date.parse(expiresAtIso);
  if (expiresAt <= now.getTime()) {
    return {
      status: "needs_reauth",
      usable: false,
      needsCustomerAction: true,
      reason: "This token has expired and cannot be refreshed. Mint a new one and paste it in.",
    };
  }
  if (expiresAt - now.getTime() < WARN_MS) {
    return {
      status: "active",
      usable: true,
      needsCustomerAction: true,
      reason:
        "This token expires within a week and cannot be refreshed automatically. " +
        "Mint a new one and paste it in to avoid a gap.",
    };
  }
  return { status: "active", usable: true, needsCustomerAction: false, reason: "Connected." };
}

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

  // A SELF-ISSUED CREDENTIAL HAS NO PROVIDER CONFIG, so `providerFor` -- which takes a `SourceId`
  // -- cannot be reached with one. What it MAY have is a clock: that is the whole difference
  // between the two self-issued lanes and the reason this is no longer one early return.
  //
  // A key-and-secret pair never expires, so it is answered here and done. A bearer token may be
  // permanent or dated from the same screen, so a DATED one has to fall through to the expiry
  // logic below. The previous version of this function returned "This key does not expire" for
  // anything not on the OAuth list, which for a dated System User token is a sentence that is
  // simply false -- and reports `usable: true` on a connection that 401s.
  if (isSelfIssued(row.credentialLane)) {
    if (row.expiresAt === null) {
      return {
        status: "active",
        usable: true,
        needsCustomerAction: false,
        reason:
          row.credentialLane === "key_secret"
            ? "Connected. This key does not expire; it stops working only if you delete it."
            : "Connected. This token does not expire; it stops working only if you revoke it.",
      };
    }
    return selfIssuedExpiry(row.expiresAt, now);
  }

  // `isOAuthSource` rather than a cast: the lane says this connection came from an authorisation
  // server, and the narrowing makes the compiler agree instead of being told.
  if (!isOAuthSource(row.provider)) {
    return {
      status: "error",
      usable: false,
      needsCustomerAction: false,
      reason: `${row.provider} has no OAuth lane, so this connection's recorded lane is wrong.`,
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
