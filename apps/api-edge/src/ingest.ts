/**
 * `POST /v1/ingest/run` -- THE JOINT. The first thing in this repository that writes an envelope
 * row, and the reason every piece built before it stops being a component.
 *
 * The chain has six joints (`MVP-PLAN.md` §1) and this closes the four that were open at once: a
 * connection is read, a credential is opened, a platform is fetched, and rows are persisted. Every
 * part of it already existed and was tested; none of it had ever been called in sequence.
 *
 * A BOUNDARY OVER PORTS, WHICH IS WHY IT IS NOT IN `index.ts`. `handlePerformance` receives its
 * store and its authenticator and knows nothing about transports; this does the same, so the run
 * can be exercised end to end -- connection, credential, fetch, write -- against fakes, in real
 * workerd, with no network and no Supabase project. The route in `index.ts` is what turns bindings
 * into ports, and it is the only thing that touches `env`.
 *
 * ------------------------------------------------------------------------------------------------
 * A DEDICATED SECRET, NEVER THE API KEY, AND THE DIFFERENCE IS THE WHOLE AUTHORISATION MODEL.
 *
 * `/v1/performance` authenticates a customer's `mp_live_…` key and resolves it to one workspace.
 * That key is READ-ONLY by construction: the token minted from it carries no `sub`, so
 * `app.can_write_workspace()` refuses, and a stolen key cannot re-point a connection or invite a
 * member. If this route accepted the same key, holding one would mean being able to spend the
 * merchant's own store's capacity -- and to cause writes into `envelope_rows` -- which is a
 * strictly larger power than reading numbers back.
 *
 * So it takes `INGEST_TOKEN`, an operator secret, and the workspace arrives in the BODY rather than
 * from the credential. That inverts `performance.ts`'s rule ("accepting the workspace from the
 * caller would make cross-tenant access a matter of typing a different id") and it is sound here
 * for a reason that does not generalise: the holder of this secret is the operator, who already has
 * every workspace. The isolation that still applies is the one that cannot be typed around -- the
 * connection read runs under a token claiming exactly the workspace in the body, so a mismatched
 * (workspace, connection) pair is refused BY ROW-LEVEL SECURITY, not by this file.
 *
 * MANUAL, NOT A CRON, per `MVP-PLAN.md` Decision 2. A cron cannot be demonstrated on stage: you
 * would be waiting on a minute boundary and hoping. The cron is a later `scheduled` handler calling
 * exactly this function.
 *
 * ------------------------------------------------------------------------------------------------
 * COUNTS AND REASONS ONLY, in the response and in the log. Same rule as `ScheduledOutcome`'s, and
 * here it has teeth: the objects in scope during a run include a decrypted consumer secret and a
 * page of orders carrying buyer name, email, phone and address. Neither may reach a response body,
 * a log line, or an error message. `runReport` below is the only shape that leaves, and it holds
 * numbers, a connection id the caller already typed, and error text this repository wrote.
 *
 * THE WATERMARK IS RETURNED, NOT PERSISTED, and that is a limitation with a cause rather than an
 * oversight. `connections_update` is `using (app.can_write_workspace(workspace_id))`, which refuses
 * outright when `app.current_user_id()` is null -- and the token minted here deliberately has no
 * `sub`, because a fabricated human identity is what would turn this into a credential that can
 * re-point a connection. So the Worker physically cannot write `last_backfill_at`. Storing run
 * state needs a `security definer` advance function or a human session; until then the operator
 * holds the watermark, which is the honest shape for a manually triggered run.
 */

import { connectionHealth, openCredential } from "@repo/connections";
import type { EnvelopeRow } from "@repo/contract";
import {
  type WooBackfillBatch,
  type WooCheckpoint,
  parseRfc3339,
  runWooBackfill,
} from "@repo/connectors";
import type { ConnectionRecord, ConnectionStorePort, IngestStorePort } from "@repo/store";
import { type CryptoLike as VaultCrypto, kekFromBase64 } from "@repo/vault";

/** The only provider this runtime can drive. See `runIngest` for why it is a refusal and not a map. */
export const INGEST_SOURCE = "woocommerce";

/**
 * How far back a run with no `since` reaches.
 *
 * THERE IS NO DEFAULT AND THIS IS NOT ONE. `since` is REQUIRED; this constant exists only so the
 * refusal can suggest a value. A default window on a watermark walk is the worst kind of default:
 * too short and it opens a silent hole, too long and it spends the merchant's store on history it
 * already has, and in neither case does the operator learn which happened.
 */
export const SUGGESTED_FIRST_WINDOW_DAYS = 30;

/** What a run reports. Numbers, a connection id, and text this repository wrote. Nothing else. */
export interface IngestReport {
  readonly source: typeof INGEST_SOURCE;
  readonly connectionId: string;
  /**
   * Pages of orders YIELDED by the backfill -- not every page fetched from the store.
   *
   * THE DIFFERENCE IS REAL AND IT UNDERSTATES. When a window's first page reports too many pages,
   * that probe page has already been fetched from the merchant before the bisector discards it and
   * splits; those requests reach the store and never reach this counter. Review caught the original
   * wording ("pages fetched"), which claimed a request count this number does not measure.
   *
   * `splits` below is the missing signal: one split means at least one discarded probe.
   */
  readonly pages: number;
  /** Envelope rows normalised. One per order. */
  readonly rowsRead: number;
  /** Envelope rows the database confirmed. Equal to `rowsRead` on a clean run. */
  readonly rowsWritten: number;
  readonly chunks: number;
  /**
   * Windows the bisector had to split, each implying at least one fetched-and-discarded probe page.
   *
   * Reported because `pages` alone would tell an operator a busy store was cheap to read. A run
   * with `pages: 3, splits: 7` cost the merchant far more than three requests.
   */
  readonly splits: number;
  /**
   * The `since` the NEXT run must use. Present even on a failed run -- especially then.
   *
   * A partial run that reported no watermark would be re-done from the start, which is correct and
   * wasteful; a partial run that reported the span's END would skip everything it did not reach,
   * which is correct-looking and wrong forever. This is the last chunk read IN FULL.
   */
  readonly checkpoint: string;
  /** Whether the whole requested span was read. */
  readonly complete: boolean;
}

export interface IngestRequest {
  readonly workspaceId: string;
  readonly connectionId: string;
  /** RFC3339. The watermark the last run returned, or the start of history. */
  readonly since: string;
  /** RFC3339. Defaults to the run's start, pinned once. */
  readonly until?: string;
}

/**
 * Everything the run needs that is not a decision.
 *
 * `crypto` is injected for the reason `@repo/vault`'s own tests inject it: `CryptoKeyLike` is
 * deliberately opaque because the handle type differs between runtimes, so the port describes the
 * operations rather than nominally matching workerd's `SubtleCrypto`.
 */
export interface IngestDeps {
  readonly connections: ConnectionStorePort;
  readonly ingest: IngestStorePort;
  /** Base64, 32 bytes. `kekFromBase64` refuses anything else. */
  readonly kek: string;
  readonly fetchImpl: typeof fetch;
  readonly crypto: VaultCrypto;
  readonly now?: () => Date;
  /** Injected so a test asserts retry behaviour without waiting. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

/**
 * Why a run did not happen, as a code the route maps to a status.
 *
 * FLAT AND LONG, for `client.ts`'s reason: each one sends an operator somewhere different, and
 * collapsing two is how somebody is sent to fix the wrong thing. `no_timezone` in particular is
 * NOT `bad_request` -- nothing about the request is wrong, the connection is incomplete, and the
 * fix is a column rather than a retry.
 */
export type IngestRefusal =
  | "bad_request"
  | "no_such_connection"
  | "unsupported_provider"
  | "no_timezone"
  | "connection_unusable"
  | "wrong_credential_lane"
  | "bad_kek"
  /**
   * The database could not be reached or refused the connection read.
   *
   * A REFUSAL AND NOT AN `IngestRunFailure`, because nothing has been read or written yet: the
   * counts are all zero and the checkpoint has not moved, so there is no partial progress to
   * report and a `run_incomplete` would imply there was. Added after review found that a
   * `StoreError` from `deps.connections.read()` escaped every handler and became an unstructured
   * 500 -- the one shape this route is built never to produce.
   */
  | "store_unavailable";

export class IngestError extends Error {
  constructor(
    message: string,
    readonly refusal: IngestRefusal,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

/** Parse a request body, or say exactly which field is wrong. */
export function parseIngestRequest(body: unknown): IngestRequest {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const workspaceId = uuid(b.workspace_id, "workspace_id");
  const connectionId = uuid(b.connection_id, "connection_id");
  // THROUGH `parseRfc3339`, NOT `Date.parse`, AND NOT A SECOND COPY OF IT. `Date.parse` normalises
  // `2026-02-30T00:00:00Z` to March 2 without complaint and reads an offset-less string as LOCAL
  // time; either would query a window nobody asked for and then advance the checkpoint past the
  // days it skipped. The connector already refuses both, so validating here is about WHERE the
  // refusal surfaces -- a 400 naming the field, rather than a 502 from inside the run -- and
  // borrowing its implementation is what stops the two answers diverging.
  const since = instant(b.since, "since");
  if (b.until === undefined || b.until === null) return { workspaceId, connectionId, since };

  const until = instant(b.until, "until");
  // ORDERING IS THE CALLER'S MISTAKE, SO IT IS A 400 HERE. `wooBackfillChunks` refuses the same
  // thing -- but it refuses it inside the generator, where the route wraps it as a 502
  // `run_incomplete`, which tells an operator to retry a request that cannot ever succeed.
  if (Date.parse(until) <= Date.parse(since)) {
    throw new IngestError(
      `\`until\` (${until}) is not after \`since\` (${since}). A window that ends where it starts ` +
        "can contain nothing, and one that ends before it is almost always two values swapped.",
      "bad_request",
    );
  }
  return { workspaceId, connectionId, since, until };
}

/**
 * One RFC3339 field, refused as a `bad_request` rather than as the connector's `invalid_window`.
 *
 * The check is the connector's; only the error type differs, because at this boundary the caller is
 * a person holding a request body and the right answer is a 400 naming the field.
 */
function instant(value: unknown, field: string): string {
  const text = str(value, field);
  try {
    parseRfc3339(text, field);
  } catch {
    throw new IngestError(
      `\`${field}\` is ${JSON.stringify(text)}, which is not an RFC3339 instant. ` +
        (field === "since"
          ? "It is the watermark the previous run returned; for a first run, pick a start date " +
            `deliberately -- ${SUGGESTED_FIRST_WINDOW_DAYS} days is a reasonable first window and ` +
            "this endpoint will not choose one for you."
          : "Use 2026-09-11T00:00:00Z."),
      "bad_request",
    );
  }
  return text;
}

/**
 * A UUID, checked here rather than by Postgres.
 *
 * `workspace_id` and `connection_id` are `uuid` columns and the token's `workspace_id` claim is
 * read as one. Any non-empty string used to reach PostgREST, where the cast failed and came back as
 * a `StoreError` -- and before the fix below, as an unstructured 500. Even with that fixed it would
 * be a 502 telling the caller to retry, for a request no retry can rescue.
 *
 * Shape only, not existence: whether a well-formed id names a real connection is row-level
 * security's answer, and it is deliberately the same `null` for "does not exist" and "not yours".
 */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function uuid(value: unknown, field: string): string {
  const text = str(value, field);
  if (!UUID.test(text)) {
    throw new IngestError(
      `\`${field}\` is ${JSON.stringify(text)}, which is not a UUID. Both identifiers are \`uuid\` ` +
        "columns; a malformed one fails inside the database rather than here.",
      "bad_request",
    );
  }
  return text;
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new IngestError(
      `\`${field}\` is required and must be a non-empty string.`,
      "bad_request",
    );
  }
  return value;
}

/**
 * Read one connection's store and write what it returns.
 *
 * THE WRITE HAPPENS PER PAGE, AND THE ORDER IS THE POINT. `runWooBackfill` yields one batch per
 * page and fires `onChunk` after a chunk has been read in full; this awaits the write of each page
 * before pulling the next, so by the time a checkpoint is offered EVERY PAGE BEHIND IT IS ALREADY
 * IN THE DATABASE. Buffering across pages to save round trips would break that: a run could report
 * a watermark covering rows it had read and not yet written, and the next run -- starting from the
 * watermark -- would never look at them again.
 *
 * A page is at most a hundred orders, which is the size `client.ts` capped `per_page` to precisely
 * so one fits in a 128 MB isolate. Writing it is one RPC carrying one bounded array.
 */
export async function runIngest(request: IngestRequest, deps: IngestDeps): Promise<IngestReport> {
  // Refused before the connection is read, because a malformed KEK is a deployment fault and
  // reading a credential we could not then open spends a query to learn nothing.
  let kek: Uint8Array;
  try {
    kek = kekFromBase64(deps.kek);
  } catch (cause) {
    throw new IngestError(
      `CREDENTIAL_KEK is not usable: ${(cause as Error).message}. Generate one with ` +
        "`openssl rand -base64 32`.",
      "bad_kek",
    );
  }

  // WRAPPED, BECAUSE THIS THROW IS OUTSIDE THE RUN'S OWN `try` AND NOTHING ELSE CATCHES IT. A
  // `StoreError` here -- Supabase unreachable, the gateway refusing, a malformed answer -- used to
  // escape every handler in the route and surface as an unstructured 500, which is the one shape
  // this route exists never to produce. `StoreError`'s own message is repository-authored and
  // carries no filter values (`postgrest.ts` drops PostgREST's `details` and `hint` for exactly
  // that reason), so it travels.
  let connection: ConnectionRecord | null;
  try {
    connection = await deps.connections.read({
      workspaceId: request.workspaceId,
      connectionId: request.connectionId,
    });
  } catch (cause) {
    throw new IngestError(
      `the connection could not be read: ${
        cause instanceof Error && cause.name === "StoreError"
          ? cause.message
          : "the database did not answer"
      }. Nothing was read and nothing was written.`,
      "store_unavailable",
    );
  }
  if (connection === null) {
    // ONE ANSWER FOR TWO SITUATIONS, deliberately, and inherited from the adapter: a connection
    // that does not exist and one in another workspace are indistinguishable here.
    throw new IngestError(
      `no connection ${request.connectionId} in workspace ${request.workspaceId}.`,
      "no_such_connection",
    );
  }

  assertRunnable(connection, deps.now?.() ?? new Date());

  // THE KEY CAN BE THE RIGHT LENGTH AND STILL BE THE WRONG KEY. `kekFromBase64` checks 32 bytes and
  // nothing more, so a KEK from another deployment decodes fine and then fails AES-GCM
  // authentication inside `open()`. That throw is not an `IngestError`, so it escaped to an
  // unstructured 500 -- for a deployment fault `bad_kek` is explicitly mapped to diagnose.
  //
  // `ConnectionError` is kept separate because it is a DIFFERENT diagnosis with a different owner:
  // a revoked connection or a lane that disagrees with the sealed blob is not a key problem.
  let credential: Awaited<ReturnType<typeof openCredential>>;
  try {
    credential = await openCredential(deps.crypto, connection, kek);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "ConnectionError") {
      throw new IngestError(
        `connection ${connection.id} could not be opened: ${cause.message}`,
        "connection_unusable",
      );
    }
    // Deliberately does NOT claim the KEK is wrong. A failed decryption is equally consistent with
    // a re-keyed deployment, a `key_version` that moved, or a ciphertext that did not survive its
    // round trip -- and naming one cause sends an operator to rule out the other two last.
    throw new IngestError(
      `connection ${connection.id} did not decrypt. CREDENTIAL_KEK decodes to 32 bytes, so it is ` +
        "well formed but did not open this credential: either it is not the key this credential " +
        "was sealed under, or the stored ciphertext, IV or scope does not match the row.",
      "bad_kek",
    );
  }
  if (credential.kind !== "key_secret") {
    // Unreachable through `credential_lane`, which `openCredential` already checks against the
    // sealed blob. Asserted anyway because the alternative is `credential.key` being `undefined`
    // and travelling into an `Authorization` header as the string "undefined".
    throw new IngestError(
      `connection ${connection.id} seals a ${credential.kind} credential; a WooCommerce pull needs ` +
        "a key and a secret.",
      "wrong_credential_lane",
    );
  }

  const fetchedAt = (deps.now?.() ?? new Date()).toISOString();
  // PINNED ONCE, for `client.ts` decision 3: a boundary re-evaluated per request would make the
  // window slide under the read, and orders modified during the run would land in neither this run
  // nor the next.
  const until = request.until ?? fetchedAt;

  // A FUTURE `until` IS A PERMANENT HOLE, WHICH IS WHY IT IS REFUSED RATHER THAN CLAMPED.
  //
  // The window closes at `until` and the checkpoint becomes `until`. An order modified between the
  // moment this run finishes and that future instant is inside the banked window and was never
  // read -- and no later run asks for a window behind the mark. Clamping to `fetchedAt` silently
  // would answer a different question than the operator asked, so it says so instead.
  if (Date.parse(until) > Date.parse(fetchedAt)) {
    throw new IngestError(
      `\`until\` (${until}) is after this run started (${fetchedAt}). The checkpoint would cover ` +
        "orders that had not been modified yet, and nothing ever re-reads a window behind the " +
        "watermark. Omit `until` to pin it to the run's start.",
      "bad_request",
    );
  }

  let checkpoint: WooCheckpoint = { modifiedAfter: request.since, chunks: 0, rows: 0 };
  let pages = 0;
  let splits = 0;
  let rowsRead = 0;
  let rowsWritten = 0;

  const run = runWooBackfill({
    client: {
      fetchImpl: deps.fetchImpl,
      storeUrl: connection.externalAccountId,
      credential: { key: credential.key, secret: credential.secret },
      now: deps.now ?? (() => new Date()),
      random: deps.random ?? Math.random,
      sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    },
    window: { modifiedAfter: request.since, modifiedBefore: until },
    // The only way to see the requests the bisector spends and discards. `onSplit` is the hook
    // `client.ts` added so a caller could "meter how hard a store is to read"; this is that caller.
    walk: {
      onSplit: () => {
        splits += 1;
      },
    },
    // Not null by this point -- `assertRunnable` refused a connection without one, which is the
    // whole reason the column exists.
    timezone: connection.timezone as string,
    fetchedAt,
    onChunk: (c: WooCheckpoint) => {
      checkpoint = c;
    },
  });

  const context = { workspaceId: connection.workspaceId, connectionId: connection.id };
  let complete = false;
  try {
    let next = await run.next();
    while (!next.done) {
      const batch: WooBackfillBatch = next.value;
      pages += 1;
      rowsRead += batch.rows.length;
      rowsWritten += await writeBatch(deps.ingest, batch.rows, context);
      next = await run.next();
    }
    checkpoint = next.value;
    complete = true;
  } catch (cause) {
    // THE PARTIAL RUN IS REPORTED, NOT DISCARDED. Everything written stays written -- the upsert is
    // idempotent, so a re-run over the same span costs requests and changes nothing -- and the
    // checkpoint names the last chunk read in full, which is where a resume is safe.
    throw new IngestRunFailure(report(), cause);
  }

  function report(): IngestReport {
    return {
      source: INGEST_SOURCE,
      connectionId: connection === null ? request.connectionId : connection.id,
      pages,
      rowsRead,
      rowsWritten,
      chunks: checkpoint.chunks,
      splits,
      checkpoint: checkpoint.modifiedAfter,
      complete,
    };
  }

  return report();
}

/**
 * A run that wrote something and then failed.
 *
 * It carries the report because the COUNTS AND THE CHECKPOINT ARE THE VALUABLE PART OF A FAILURE:
 * without them the operator's only safe move is to redo the whole span. The cause is kept for the
 * route to classify and is never itself returned.
 */
export class IngestRunFailure extends Error {
  constructor(
    readonly report: IngestReport,
    // `Error` declares `cause` in lib.es2022, so this is an override rather than a new field.
    override readonly cause: unknown,
  ) {
    super("the ingest run did not complete");
    this.name = "IngestRunFailure";
  }
}

/**
 * Refuse a connection this run cannot honestly drive.
 *
 * Every branch is a DIFFERENT SENTENCE for a different person: a provider is a developer's problem,
 * a missing timezone is an operator's, and an unusable connection is the merchant's.
 */
function assertRunnable(connection: ConnectionRecord, now: Date): void {
  if (connection.provider !== INGEST_SOURCE) {
    // A refusal and not a lookup table. Four of the five connectors have no `backfill.ts` yet, so a
    // map would be four entries pointing at nothing; naming the one that works is the honest shape
    // until there is a second.
    throw new IngestError(
      `connection ${connection.id} is a ${connection.provider} connection. This runtime drives ` +
        `${INGEST_SOURCE} only -- the other sources have a client and a normaliser but no backfill.`,
      "unsupported_provider",
    );
  }

  // ASKED BEFORE THE TIMEZONE, AND THE ORDER IS THE MESSAGE. A revoked connection that also has no
  // timezone would otherwise be told to populate a column -- work that cannot make it runnable,
  // sending an operator to fix the wrong thing while the merchant's reauthorisation is what is
  // actually needed. Terminal health first; the incomplete-row problem second.
  //
  // `connectionHealth` owns this question rather than it being re-derived here: it knows a
  // persisted `needs_reauth` outranks an expiry that has not passed, which is a distinction this
  // file would have got wrong.
  const health = connectionHealth(connection, now);
  if (!health.usable) {
    throw new IngestError(
      `connection ${connection.id} is not usable: ${health.reason}`,
      "connection_unusable",
    );
  }

  if (connection.timezone === null) {
    // NOT `bad_request`. The request is fine; the connection is incomplete, and the fix is to set
    // the column. Guessing UTC here would move every order placed in the merchant's evening onto
    // the previous day -- which is the whole reason the column exists.
    throw new IngestError(
      `connection ${connection.id} has no timezone. Every date on every row would be computed in ` +
        "a zone nobody chose. Set `public.connections.timezone` to the store's IANA zone.",
      "no_timezone",
    );
  }
}

/**
 * Write one page, and insist the database agrees about how many landed.
 *
 * `createIngestStore` already refuses a batch whose rows do not satisfy the envelope and already
 * compares the count it sent against the count returned. This adds the run's own arithmetic on top:
 * `rowsWritten` is accumulated from what the DATABASE reported, never from what was read, so a
 * response saying `rowsRead: 217, rowsWritten: 217` is two independent counts agreeing rather than
 * one number printed twice.
 */
async function writeBatch(
  store: IngestStorePort,
  rows: readonly EnvelopeRow[],
  context: { workspaceId: string; connectionId: string },
): Promise<number> {
  return store.write(rows, context);
}
