/**
 * `POST /v1/connections` -- the credential a customer typed, sealed and stored.
 *
 * ------------------------------------------------------------------------------------------------
 * WHY THIS IS IN THE WORKER AND NOT IN A SERVER ACTION. This is the decision the endpoint exists to
 * record, and it is about the blast radius of one key.
 *
 * A connection row holds its credential under envelope encryption (`@repo/vault`). The key
 * encryption key is `CREDENTIAL_KEK`, and today it lives in exactly two places: this Worker, and an
 * operator's shell when they run `scripts/seal-connection.ts`. It is not in the web app. Letting a
 * Next server action seal would put the one key that protects every customer's platform access onto
 * a second surface -- a different deploy target, a different log sink, a far larger dependency tree
 * and a far larger attack surface -- to save one network hop.
 *
 * So the web app never seals. It COLLECTS AND POSTS. Here is where the plaintext credential stops.
 *
 * ------------------------------------------------------------------------------------------------
 * THE WRITE GOES THROUGH POSTGREST AS THE CALLING CUSTOMER, AND NOT AS ANYTHING ELSE.
 *
 * The caller's own Supabase access token is forwarded verbatim on the insert. Not a service role,
 * which bypasses every policy; not a token minted by `@repo/store`, whose authority is a claim this
 * Worker writes for itself. `20260908000700_rls.sql` already carries the policy:
 *
 *     create policy connections_insert on public.connections
 *       for insert to authenticated
 *       with check (app.can_write_workspace(workspace_id));
 *
 * -- so whether this customer may create a connection in this workspace is decided by the database,
 * on the row, at the moment of the write. That is the repository's first principle: RLS does
 * tenancy, application code does not. A service-role write here would move the tenancy decision
 * into TypeScript, where it would be correct until the day somebody edits a filter.
 *
 * `workspace_id` THEREFORE ARRIVES IN THE BODY, which inverts `/v1/performance`'s rule that the
 * workspace comes from the credential and never from the caller. It has to: an API key names one
 * workspace, and a PERSON may belong to several, so there is no workspace to read out of this
 * credential. What makes it safe is not a check in this file -- it is that the value travels into
 * `with check (app.can_write_workspace(workspace_id))` and is refused there. Typing a different id
 * gets a 403 from Postgres, which is the same thing a wrong id has always got on the read path.
 *
 * A WORKSPACE THAT DOES NOT EXIST AND ONE THAT IS NOT YOURS ARE THE SAME 403, deliberately, for the
 * reason `@repo/store`'s connection read gives about its null: distinguishing them would turn this
 * endpoint into an oracle for which workspace ids exist elsewhere.
 *
 * ------------------------------------------------------------------------------------------------
 * THE CREDENTIAL REACHES NO RESPONSE, NO LOG AND NO ERROR MESSAGE.
 *
 * Not echoed, not masked, not fingerprinted -- a masked credential is still a statement about the
 * credential, and the response has nothing to prove. What comes back is the connection id and the
 * status the DATABASE reports for the row it wrote.
 *
 * Every sentence that can leave this module was written in this repository or in
 * `@repo/connections`, and none of them interpolates a key, a secret or a token. The log line
 * carries the route, a request id, the provider, the lane and the connection id -- and NOT
 * `external_account_id`, because for WooCommerce that field is the merchant's store origin, which
 * `/v1/ingest/run` already refuses to let into a log line for the same reason.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT IT REFUSES BEFORE ANYTHING IS SEALED: an unknown provider, a lane the provider does not
 * offer, a missing or malformed workspace id, a malformed external account id, and an empty or
 * already-dead credential. `PROVIDER_LANES` in `@repo/connections` is the authority on the first
 * two and is read rather than copied. Sealing first and discovering the refusal afterwards would
 * mean a credential had been unwrapped and encrypted for a row that was never going to exist.
 *
 * THE OAUTH LANE IS NOT HERE, AND ITS ABSENCE IS A DECISION. `connect()` turns a completed
 * authorisation into a row, and an authorisation does not arrive by being typed into a form -- it
 * arrives at a redirect URI with a code to exchange. This endpoint takes the two lanes a customer
 * can actually type: a key and a secret it issued itself, and a single bearer token it minted
 * itself. A body naming `oauth` is refused rather than accommodated, because accommodating it would
 * mean fabricating a `TokenResponse` out of a pasted string.
 */

import {
  CONNECTION_STATUSES,
  ConnectionError,
  type ConnectionProvider,
  type ConnectionRow,
  type ConnectionStatus,
  type ConnectionStore,
  type CredentialLane,
  connectWithKey,
  connectWithToken,
  lanesFor,
  offersLane,
  PROVIDER_LANES,
} from "@repo/connections";
import { normaliseStoreUrl, WooClientError } from "@repo/connectors";
import { callPostgrest, type PostgrestConfig, StoreError } from "@repo/store";
import { kekFromBase64, type CryptoLike as VaultCrypto } from "@repo/vault";

import {
  type AccessTokenCrypto,
  AccessTokenError,
  bearerToken,
  verifyAccessToken,
} from "./access-token.js";

/**
 * `connections.key_version` for a first seal.
 *
 * 1 because nothing has been rotated. `rewrap` in `@repo/vault` is the only thing that moves this,
 * and it moves it per row: a credential sealed under generation N cannot be opened under
 * generation N+1, so a number invented here would be a credential nobody can open.
 */
export const KEY_VERSION = 1;

/**
 * The longest `external_account_id` this endpoint accepts.
 *
 * The column is unbounded `text` and this is not a database limit dressed up as one. It is a
 * paste-error limit: the values that belong here are account ids and store origins, and something
 * two hundred characters long is a pasted page, a pasted curl command or a pasted credential --
 * the last of which must not be written to a column that is returned in the clear.
 */
export const MAX_EXTERNAL_ACCOUNT_ID = 200;

/** The two lanes a customer can type. See the module note for why `oauth` is not one of them. */
export const TYPED_LANES = ["key_secret", "bearer"] as const;

export type TypedLane = (typeof TYPED_LANES)[number];

/**
 * Why a connection was not created, as a code the response carries in `error`.
 *
 * FLAT AND SEPARATE, for `/v1/ingest/run`'s reason: each one sends whoever reads it somewhere
 * different. Unlike that route's list, five of the six map to the SAME status, and that is not an
 * oversight -- every one of them is a property of the body the caller sent, and the caller fixes
 * every one of them by editing the body. The distinction lives in `error`, which is what a client
 * branches on; a spread of statuses over one situation would be decoration.
 */
export type ConnectRefusal =
  | "bad_request"
  /** A provider name no connector in this build can drive. */
  | "unknown_provider"
  /** A real provider, and a lane it does not offer. `PROVIDER_LANES` is the authority. */
  | "unsupported_lane"
  /** An empty half, an empty token, or an `expires_at` that is not a timestamp. */
  | "invalid_credential"
  /** A bearer token that was already dead when it was pasted. */
  | "credential_expired"
  /** A deployment fault: `CREDENTIAL_KEK` is present and is not 32 bytes of base64. */
  | "bad_kek";

export class ConnectError extends Error {
  constructor(
    message: string,
    readonly refusal: ConnectRefusal,
  ) {
    super(message);
    this.name = "ConnectError";
  }
}

export const REFUSAL_STATUS: Record<ConnectRefusal, number> = {
  bad_request: 400,
  unknown_provider: 400,
  unsupported_lane: 400,
  invalid_credential: 400,
  credential_expired: 400,
  // 503, exactly as `/v1/ingest/run` answers the same fault: the request was fine and the
  // deployment cannot honour it. Nothing the caller edits will help.
  bad_kek: 503,
};

/**
 * A parsed request.
 *
 * THE CREDENTIAL IS IN HERE, WHICH IS WHY NOTHING SERIALISES THIS OBJECT. It is passed to
 * `connectWithKey`/`connectWithToken`, sealed, and dropped. It is never logged, never put in a
 * message, and never spread into a response body -- and `connect.test.ts` asserts the absence
 * across every refusal path rather than trusting this comment.
 */
export interface ConnectRequest {
  readonly workspaceId: string;
  readonly provider: ConnectionProvider;
  readonly externalAccountId: string;
  readonly displayName: string | null;
  readonly credential:
    | { readonly lane: "key_secret"; readonly key: string; readonly secret: string }
    | { readonly lane: "bearer"; readonly token: string; readonly expiresAt: string | null };
}

/** The providers this build can drive, from `PROVIDER_LANES` rather than written out again. */
const PROVIDERS = Object.keys(PROVIDER_LANES) as readonly ConnectionProvider[];

/**
 * A UUID, checked here rather than by Postgres.
 *
 * Same expression and same reason as `/v1/ingest/run`'s: `workspace_id` is a `uuid` column, and a
 * malformed one otherwise fails inside the database and comes back as an upstream error telling the
 * caller to retry something no retry can rescue. SHAPE ONLY -- whether a well-formed id names a
 * workspace this customer may write to is `app.can_write_workspace()`'s answer, not this file's.
 */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Whether a value carries a control character -- including the line break that means a whole
 * command, or a whole key block, was pasted into the field.
 *
 * A CODE-POINT TEST RATHER THAN A REGULAR EXPRESSION, and not because the expression was wrong:
 * `noControlCharactersInRegex` refuses one, for the good reason that a control character inside a
 * character class is usually a typo rather than an intention. Here it is the intention, and saying
 * so in arithmetic is clearer than silencing a rule.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function field(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConnectError(`\`${name}\` is required, as a string.`, "bad_request");
  }
  return value;
}

/**
 * A credential field: present, and nothing more is asked of it here.
 *
 * `field()` WOULD REFUSE AN EMPTY ONE AND MUST NOT BE USED FOR THESE. `connectWithKey` already
 * refuses a credential with an empty half, and `connectWithToken` an empty token, in sentences
 * written for the customer that explain what an empty half actually costs -- it seals successfully
 * and 401s on the first pull, hours later, with nothing pointing at the cause. Checking it here too
 * would mean two sentences about one rule, and the one that got there first would be the worse one.
 *
 * Nothing is sealed in the meantime: both of those refusals happen before `seal` is called.
 */
function credentialField(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new ConnectError(`\`${name}\` is required, as a string.`, "bad_request");
  }
  return value;
}

/**
 * The account at the provider, validated as far as this repository can honestly validate it.
 *
 * FOR WOOCOMMERCE IT IS THE STORE ORIGIN, and `normaliseStoreUrl` is the authority on what that
 * means -- it refuses a bare hostname, refuses plain HTTP (over which the WooCommerce API requires
 * OAuth 1.0a signing this repository deliberately does not implement) and reduces a pasted
 * `/wp-admin` URL to its origin. Borrowing it rather than re-deriving it is the same choice
 * `scripts/seal-connection.ts` made: a second opinion about what a store URL is would agree with
 * the first right up until the day the scheduler built a different URL from the same row.
 *
 * FOR EVERY OTHER PROVIDER, THE CHECK IS SHAPE AND NOTHING MORE, and pretending otherwise would be
 * worse than not checking. A Google Ads customer id, a GA4 property path and a Meta `act_…` id have
 * three different grammars, none of them published as a stable rule, and a pattern invented here
 * would refuse a legitimate account. What is actually knowable is that the value is one line of
 * text of a plausible length; whether it names a real account is a question only the first pull can
 * answer, and `recordFailure` already turns that answer into `needs_reauth`.
 *
 * The provider test is a name and not a lookup because WooCommerce is the only self-hosted source
 * here. A second one makes this a table.
 */
function externalAccountId(provider: ConnectionProvider, value: unknown): string {
  const raw = field(value, "external_account_id").trim();
  if (hasControlCharacter(raw)) {
    throw new ConnectError(
      "`external_account_id` contains a control character or a line break; paste the account " +
        "identifier alone.",
      "bad_request",
    );
  }
  if (raw.length > MAX_EXTERNAL_ACCOUNT_ID) {
    throw new ConnectError(
      `\`external_account_id\` is longer than ${MAX_EXTERNAL_ACCOUNT_ID} characters, which is a ` +
        "paste of something other than an account identifier.",
      "bad_request",
    );
  }
  if (provider !== "woocommerce") return raw;

  try {
    return normaliseStoreUrl(raw);
  } catch (error) {
    // `WooClientError`'s sentences are written in this repository and interpolate only the caller's
    // own input, which is on its way back to the caller who typed it. Same allowance
    // `/v1/ingest/run` makes for this error class, and for the same reason.
    if (error instanceof WooClientError) {
      throw new ConnectError(error.message, "bad_request");
    }
    throw error;
  }
}

/**
 * Turn a request body into something that can be sealed, or say exactly which field is wrong.
 *
 * THE ORDER IS THE POINT. Provider and lane are established before the credential is so much as
 * read off the body, so "an unknown provider is refused before any seal happens" is a property of
 * the control flow rather than of a comment. Nothing below the lane check can reach `seal`.
 */
export function parseConnectRequest(body: unknown): ConnectRequest {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const workspaceId = field(b.workspace_id, "workspace_id");
  if (!UUID.test(workspaceId)) {
    throw new ConnectError(
      "`workspace_id` is not a UUID. It is the workspace the connection belongs to; whether you " +
        "may write to it is decided by the database, but it has to be an id first.",
      "bad_request",
    );
  }

  const provider = field(b.provider, "provider");
  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    throw new ConnectError(
      `\`provider\` is ${JSON.stringify(provider)}, which this build cannot connect. It drives ` +
        `${PROVIDERS.join(", ")}.`,
      "unknown_provider",
    );
  }
  const knownProvider = provider as ConnectionProvider;

  const lane = field(b.credential_lane, "credential_lane");
  if (!(TYPED_LANES as readonly string[]).includes(lane)) {
    // `oauth` lands here, and the message says why rather than listing it as a typo.
    throw new ConnectError(
      `\`credential_lane\` is ${JSON.stringify(lane)}. This endpoint stores a credential the ` +
        `customer typed, which is ${TYPED_LANES.join(" or ")}. An OAuth grant is not typed -- it ` +
        "arrives at the redirect URI as a code to exchange.",
      "unsupported_lane",
    );
  }
  const typedLane = lane as TypedLane;

  // `PROVIDER_LANES` READ, NEVER COPIED. Offering a lane is a claim about the platform: Google
  // issues no pasteable long-lived token, so `bearer` for `ga4` is a lane a customer can never walk
  // down, and sealing one would produce a row nothing can ever use.
  if (!offersLane(knownProvider, typedLane as CredentialLane)) {
    throw new ConnectError(
      `${knownProvider} does not offer the ${typedLane} lane. Lanes it offers: ` +
        `${lanesFor(knownProvider).join(", ")}.`,
      "unsupported_lane",
    );
  }

  const externalAccount = externalAccountId(knownProvider, b.external_account_id);
  const displayName =
    typeof b.display_name === "string" && b.display_name.trim() !== "" ? b.display_name : null;

  if (typedLane === "key_secret") {
    return {
      workspaceId,
      provider: knownProvider,
      externalAccountId: externalAccount,
      displayName,
      credential: {
        lane: "key_secret",
        key: credentialField(b.key, "key"),
        secret: credentialField(b.secret, "secret"),
      },
    };
  }

  // NULL MEANS PERMANENT AND NEVER "unknown" -- `connectWithToken` says so, and `connectionHealth`
  // reads it that way. An absent field and an explicit null are therefore the same claim: the
  // customer minted a token that does not expire.
  const expiresAt =
    b.expires_at === undefined || b.expires_at === null ? null : field(b.expires_at, "expires_at");

  return {
    workspaceId,
    provider: knownProvider,
    externalAccountId: externalAccount,
    displayName,
    credential: { lane: "bearer", token: credentialField(b.token, "token"), expiresAt },
  };
}

/**
 * Postgres `bytea` in hex input form, which is what PostgREST writes through unchanged.
 *
 * NOT base64, AND THIS IS HALF OF AN AGREEMENT. `@repo/store`'s `decodeBytea` refuses any value
 * that does not begin `\x` rather than guessing, because the failure it prevents is the most
 * expensive one on this path: bytes that are not the ciphertext reach AES-GCM, authentication
 * fails, and the message sends whoever reads it looking at the KEK, the DEK wrapping and the scope
 * binding before they look at the encoding. This is the writing end of that agreement, and
 * `connect.test.ts` round-trips the two against each other rather than asserting a prefix.
 */
export function toByteaHex(bytes: Uint8Array): string {
  let out = "\\x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** The columns the insert returns. Two, because two is what the response carries. */
const RETURNED_COLUMNS = "id,status";

/**
 * A `ConnectionStore` that inserts one row through PostgREST AS THE CALLING CUSTOMER.
 *
 * THE TOKEN IS THE CALLER'S, FORWARDED VERBATIM. Everything else in this repository that reaches
 * PostgREST mints its own token with `SUPABASE_JWT_SECRET`; this does not, and the difference is
 * the whole design. A minted `authenticated` token carries a `workspace_id` claim and no `sub`, so
 * `app.can_write_workspace()` would refuse it outright -- correctly, because that token's authority
 * is a claim this Worker wrote for itself, and using it here would mean the Worker deciding who may
 * write where.
 *
 * IT INSERTS; IT DOES NOT UPSERT, despite the port's name. A duplicate
 * `(workspace_id, provider, external_account_id)` comes back as a 409 rather than quietly replacing
 * a credential somebody else stored: re-pointing an existing connection is an UPDATE, governed by a
 * different policy, and a POST that silently overwrote a live credential would break a running
 * ingest with `ok: true`.
 *
 * `get` AND `markStatus` REFUSE RATHER THAN PRETEND. `connectWithKey` and `connectWithToken` call
 * neither, and an implementation that quietly returned null would be a trapdoor for whoever wires
 * this store into something that does. Reading a connection back is `@repo/store`'s job; changing
 * its health is the ingest path's.
 */
export function createInsertingStore(
  config: PostgrestConfig,
  accessToken: string,
  connectionId: string,
): ConnectionStore {
  return {
    async upsert(row) {
      // The id the credential was SEALED AGAINST. `@repo/vault` binds the ciphertext to
      // `{workspaceId, connectionId}` as additional authenticated data, so a row stored under any
      // other id holds a credential nothing can ever open.
      const id = row.id ?? connectionId;

      const body = await callPostgrest(config, {
        path: `/rest/v1/connections?select=${RETURNED_COLUMNS}`,
        token: accessToken,
        method: "POST",
        action: "write",
        // `return=representation` because the response reports what the DATABASE holds rather than
        // what this file sent. `status` has a column default and a trigger could move it; echoing
        // the value we posted would be inventing an answer that happens to be right today.
        headers: { prefer: "return=representation" },
        body: {
          id,
          workspace_id: row.workspaceId,
          provider: row.provider,
          // NO DEFAULT IN THE DATABASE, DELIBERATELY (`20260912000100_credential_lane.sql`): an
          // insert that forgot this column would file a bearer connection as a grant, and
          // `openCredential` would refuse to open it at pull time, hours later.
          credential_lane: row.credentialLane,
          external_account_id: row.externalAccountId,
          display_name: row.displayName,
          credential_ciphertext: toByteaHex(row.credentialCiphertext),
          credential_iv: toByteaHex(row.credentialIv),
          wrapped_dek: toByteaHex(row.wrappedDek),
          key_version: row.keyVersion,
          granted_scopes: row.grantedScopes,
          expires_at: row.expiresAt,
          status: row.status,
          // `timezone` IS NOT WRITTEN, and null there means NOBODY HAS TOLD US rather than UTC.
          // It labels `dimensions.date` on every envelope row a connection produces, and a guess is
          // indistinguishable from a measurement. A WooCommerce connection created here therefore
          // cannot be ingested until somebody supplies one -- which `/v1/ingest/run` refuses by
          // name, with `no_timezone`, rather than defaulting and mis-dating seven hours of every
          // day forever.
        },
      });

      const written = writtenRow(body, id);
      return { ...row, id: written.id, status: written.status } as ConnectionRow;
    },

    async get() {
      throw new Error("connect: this store creates a connection and cannot read one back");
    },

    async markStatus() {
      throw new Error("connect: this store creates a connection and cannot change its health");
    },
  };
}

/**
 * The inserted row, or a refusal.
 *
 * The id is checked against the one the credential was sealed against rather than trusted. If the
 * database stored the row under a different id -- a trigger, a rewritten default -- the ciphertext's
 * additional authenticated data no longer matches the row that holds it, and the credential is
 * already unopenable. Saying so here beats discovering it at 03:00 from a decryption failure that
 * looks exactly like a wrong KEK.
 */
function writtenRow(body: unknown, expectedId: string): { id: string; status: ConnectionStatus } {
  if (!Array.isArray(body) || body.length !== 1) {
    throw new StoreError(
      "the database did not answer the insert with exactly one row; refusing to report a " +
        "connection id this endpoint cannot see.",
      "upstream",
      200,
    );
  }
  const r = (typeof body[0] === "object" && body[0] !== null ? body[0] : {}) as Record<
    string,
    unknown
  >;
  if (r.id !== expectedId) {
    throw new StoreError(
      "the database stored the connection under a different id than the credential was sealed " +
        "against, so the credential cannot be opened from the row that holds it.",
      "upstream",
      200,
    );
  }
  if (
    typeof r.status !== "string" ||
    !(CONNECTION_STATUSES as readonly string[]).includes(r.status)
  ) {
    throw new StoreError(
      `the database returned status = ${JSON.stringify(r.status)}, which this build does not ` +
        "know. Refusing to report a health nothing downstream can act on.",
      "upstream",
      200,
    );
  }
  return { id: expectedId, status: r.status as ConnectionStatus };
}

/** Everything the endpoint needs that is not a decision. */
export interface ConnectDeps {
  /** Carries the REST origin, the publishable key and the project's JWT secret. */
  readonly postgrest: PostgrestConfig;
  /** Base64, 32 bytes. `kekFromBase64` refuses anything else. */
  readonly kek: string;
  readonly crypto: VaultCrypto & AccessTokenCrypto;
  readonly requestId: string;
  /** Injected so an expiry check is assertable rather than dependent on a clock. */
  readonly now?: () => Date;
  /** Injected so a test can name the id the credential is sealed against. */
  readonly newConnectionId?: () => string;
}

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error, message, ...extra }, { status });
}

/**
 * Turn a PostgREST refusal into a response.
 *
 * FOUR OUTCOMES THAT MEAN FOUR DIFFERENT THINGS, and the 403 is the one this endpoint is about: it
 * is row-level security refusing the row, which is the tenancy decision working. Collapsing it into
 * a generic 502 would tell a customer to retry a write the database will refuse forever.
 *
 * NOTHING FROM THE UPSTREAM BODY TRAVELS. `StoreError` already drops PostgREST's `details` and
 * `hint` because both echo the failing query -- and the failing query here is the INSERT, whose
 * values include the sealed credential.
 */
function writeFailure(error: StoreError, requestId: string): Response {
  // Counts and reasons only, exactly as `/v1/ingest/run` logs. No workspace, no account, no row.
  console.log(
    JSON.stringify({
      route: "/v1/connections",
      failure: error.failure,
      upstream_status: error.status,
      request_id: requestId,
    }),
  );

  if (error.status === 401) {
    return fail(
      401,
      "unauthorized",
      "The database rejected that session. Sign in again and retry.",
    );
  }
  if (error.status === 403) {
    return fail(
      403,
      "forbidden",
      "The database refused this write. `connections_insert` admits an owner or admin of the " +
        "workspace's organisation, or an analyst with an explicit grant on the workspace; a " +
        "workspace that does not exist and one you may not write to are deliberately the same " +
        "answer.",
      { request_id: requestId },
    );
  }
  if (error.status === 409) {
    return fail(
      409,
      "already_connected",
      "That account is already connected in this workspace. Replacing the credential on an " +
        "existing connection is an update, not a create, and this endpoint will not do it " +
        "silently -- a live ingest would break with `ok: true`.",
      { request_id: requestId },
    );
  }
  return fail(
    502,
    "upstream_unavailable",
    "The database could not accept this connection. Nothing was stored rather than something " +
      "partial; retry, and quote the request id if it persists.",
    { request_id: requestId },
  );
}

/**
 * Seal and store, in that order, with nothing between them that can fail on the caller's account.
 *
 * `@repo/connections` OWNS THE SEAL, and this file does not call `@repo/vault` directly. The lane
 * refusals, the `kind` discriminant written into the blob, the scope the ciphertext is bound to and
 * the shape of the row all live there, and a second implementation would agree with the first right
 * up until it did not -- at which point a credential seals successfully and cannot be opened, hours
 * later, with nothing pointing at the cause.
 */
async function store(
  parsed: ConnectRequest,
  deps: ConnectDeps,
  accessToken: string,
): Promise<ConnectionRow> {
  let kek: Uint8Array;
  try {
    kek = kekFromBase64(deps.kek);
  } catch {
    // The message is not carried through: `kekFromBase64` says what is wrong with the key, and
    // nothing about the key encryption key belongs in a customer's response body.
    throw new ConnectError(
      "`CREDENTIAL_KEK` on this deployment is not 32 bytes of base64, so no credential can be " +
        "sealed. Nothing was stored.",
      "bad_kek",
    );
  }

  const connectionId = (deps.newConnectionId ?? (() => crypto.randomUUID()))();
  const connections = createInsertingStore(deps.postgrest, accessToken, connectionId);

  if (parsed.credential.lane === "key_secret") {
    return connectWithKey(deps.crypto, connections, {
      workspaceId: parsed.workspaceId,
      connectionId,
      provider: parsed.provider,
      externalAccountId: parsed.externalAccountId,
      ...(parsed.displayName === null ? {} : { displayName: parsed.displayName }),
      key: parsed.credential.key,
      secret: parsed.credential.secret,
      kek,
      keyVersion: KEY_VERSION,
    });
  }

  return connectWithToken(deps.crypto, connections, {
    workspaceId: parsed.workspaceId,
    connectionId,
    provider: parsed.provider,
    externalAccountId: parsed.externalAccountId,
    ...(parsed.displayName === null ? {} : { displayName: parsed.displayName }),
    token: parsed.credential.token,
    expiresAt: parsed.credential.expiresAt,
    kek,
    keyVersion: KEY_VERSION,
    now: (deps.now ?? (() => new Date()))(),
  });
}

/**
 * Handle one request.
 *
 * AUTHENTICATE BEFORE PARSING, for `/v1/performance`'s reason: a caller with no session learns that
 * they need one and nothing else -- not which providers exist, not which lanes each offers, not
 * whether the body they guessed at was well formed. Parsing first would turn an unauthenticated
 * endpoint into a free description of the API.
 *
 * AND PARSE BEFORE SEALING, which is this endpoint's own version of the same rule: every refusal
 * above `store()` happens with the credential still an unread string on a body, so an unknown
 * provider never reaches the vault.
 */
export async function handleConnect(request: Request, deps: ConnectDeps): Promise<Response> {
  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "`/v1/connections` is a POST.");
  }

  const presented = bearerToken(request.headers.get("authorization"));
  if (presented === null) {
    return fail(
      401,
      "unauthorized",
      "Send the customer's own Supabase access token as `Authorization: Bearer <token>`. This is " +
        "not an API key: creating a connection is an account action, and the database refuses it " +
        "for a session that names no user.",
    );
  }

  try {
    // The result is deliberately unused. Nothing here reads a workspace out of the token and
    // nothing writes the user id onto the row -- `app.can_write_workspace()` resolves the person
    // from the same token, on the insert. What this call buys is the refusal: an unauthenticated
    // request never reaches the seal. See `access-token.ts`.
    await verifyAccessToken(presented, {
      secret: deps.postgrest.jwtSecret,
      now: (deps.now ?? (() => new Date()))(),
      crypto: deps.crypto,
    });
  } catch (error) {
    if (error instanceof AccessTokenError) {
      // ONE STATUS AND ONE `error` CODE for all six refusals. A caller learning that its token was
      // well formed but expired, rather than simply wrong, is a caller being told how close it got.
      return fail(401, "unauthorized", error.message);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_request", "The body is not JSON.");
  }

  let parsed: ConnectRequest;
  try {
    parsed = parseConnectRequest(body);
  } catch (error) {
    if (error instanceof ConnectError) {
      return fail(REFUSAL_STATUS[error.refusal], error.refusal, error.message);
    }
    throw error;
  }

  try {
    const row = await store(parsed, deps, presented);
    // The provider, the lane, the id and a request id. NOT the account, which for a self-hosted
    // store is the merchant's origin, and certainly not the credential.
    console.log(
      JSON.stringify({
        route: "/v1/connections",
        request_id: deps.requestId,
        provider: row.provider,
        credential_lane: row.credentialLane,
        connection_id: row.id,
      }),
    );
    // 201, and the two fields are the whole response. The id is what every later call names the
    // connection by; the status is what the database holds. Nothing about the credential.
    return Response.json(
      { ok: true, connection_id: row.id, status: row.status, request_id: deps.requestId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ConnectError) {
      return fail(REFUSAL_STATUS[error.refusal], error.refusal, error.message);
    }
    if (error instanceof ConnectionError) {
      // `@repo/connections` refused the credential itself. Its sentences are written for a customer
      // to read and none of them interpolates the credential -- `connectWithKey`'s both-halves
      // refusal and `connectWithToken`'s empty-token refusal name the shape, never the value.
      const refusal: ConnectRefusal =
        error.code === "expired" ? "credential_expired" : "invalid_credential";
      return fail(REFUSAL_STATUS[refusal], refusal, error.message);
    }
    if (error instanceof StoreError) {
      return writeFailure(error, deps.requestId);
    }
    // Re-raised rather than flattened into a 502. An unrecognised throw is a bug in this file, and
    // a 502 would tell the caller to retry it forever.
    throw error;
  }
}
