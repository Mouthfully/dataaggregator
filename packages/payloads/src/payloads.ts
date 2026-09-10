/**
 * Raw platform payloads in R2.
 *
 * `00-repo-map.md` calls this the highest-risk unbriefed constraint in the whole build:
 *
 *   "Cloudflare Workers' 128 MB isolate memory and the 1 MiB Workflow step-output cap appear nowhere
 *    in section 7, yet together they forbid the most natural TypeScript implementation: fetch a
 *    report, JSON.parse it, return the rows from the step. EVERY EXTRACTOR MUST STREAM TO R2 AND
 *    RETURN A KEY. A builder agent not briefed on this will ship a Meta async-report connector that
 *    passes fixtures and fails on a real large account."
 *
 * This module is that brief, made executable. `fetchWithRetry` in @repo/extract already refuses to
 * read a response body for the same reason; this is where the body goes instead.
 *
 * A SECOND CONSTRAINT, WHICH ONLY A REAL R2 REVEALS, and which is the reason this module has two
 * functions instead of one:
 *
 *   R2 `put` REFUSES A STREAM OF UNKNOWN LENGTH.
 *   "Provided readable stream must have a known length (request/response body or readable half of
 *    FixedLengthStream)"
 *
 * A bare `ReadableStream` is rejected. So is `new Response(stream).body`, which is the obvious
 * workaround and does not work -- a Response built from a stream has no length either. Only a real
 * fetch body carrying `content-length`, or a `FixedLengthStream`, is accepted.
 *
 * THAT MAKES COMPRESSION AND STREAMING MUTUALLY EXCLUSIVE. You cannot know a payload's gzipped
 * length until you have gzipped it, and you cannot gzip it without holding it. So:
 *
 *   putPayload            length known  -> pure streaming, ANY size, no compression
 *   putBufferedPayload    length unknown -> buffered under a hard cap, compression available
 *
 * The streaming path is the one an extractor should reach for FIRST, because a platform report
 * response carries `content-length`. The buffered path exists because some do not (chunked
 * transfer), and refusing those outright would mean a connector that cannot fetch. Its cap is what
 * keeps the fallback from quietly becoming the failure the repo map predicts.
 *
 * BUT LENGTH IS NOT THE ONLY AXIS, AND THIS TABLE USED TO IMPLY IT WAS. It was written before the
 * redaction policy existed, and said the streaming path was "the one every extractor should use".
 * That is now false for a whole class of source: `putPayload` REFUSES any source whose disposition
 * is not `verbatim`, regardless of content-length, because a streamed payload is never parsed and
 * therefore can never be redacted. So the real rule is two questions, in this order:
 *
 *   1. Does this source need redaction?   yes -> putBufferedPayload. No choice, no exceptions.
 *   2. Is the content-length known?       yes -> putPayload. no -> putBufferedPayload.
 *
 * `woocommerce` is the first source to hit rule 1, and every commerce source after it will too --
 * an order carries a named buyer. For those, the cap on the buffered path is not a fallback's
 * consolation, it is the only path, which is why a connector must page the API narrowly enough to
 * stay under it rather than treating the cap as someone else's problem.
 *
 * WHAT THIS COSTS. Section 7 names Supabase disk at $0.125/GB as the line most likely to break the
 * cost model. R2 Standard is $0.015/GB-month, 8.3x cheaper -- but only if `raw` is a KEY in Postgres
 * rather than a JSONB blob, which is why `envelope_rows.raw_key` carries a CHECK constraint refusing
 * anything that looks like JSON (`15-envelope-store.md`).
 *
 * AND ONE COST THE SPECIFICATION NEVER COUNTS. `00-repo-map.md` section 8: "the mandated stack adds
 * two further uncosted terms (R2 object count, KV writes)". A Class A write is $4.50/million
 * REGARDLESS OF SIZE, so for the small frequent payloads a tiered restatement ladder produces, the
 * operations cost EXCEEDS the storage cost -- and compressing harder does nothing about it.
 * `estimateCost` computes both terms so the dominant one is visible rather than assumed.
 */

/**
 * `FixedLengthStream` is a WORKERD global with no DOM or Node equivalent, so it is declared
 * structurally here rather than pulled in from @cloudflare/workers-types.
 *
 * This package ships raw TypeScript and is compiled under the CONSUMER's tsconfig; importing
 * workers-types here would force every consumer to accept it, including apps/web, whose DOM lib
 * collides with it head-on. The real proof is the same as for @repo/connections: this package is
 * imported from apps/api-edge and typechecks there under workers-types with no DOM lib at all --
 * and is TESTED there against a real R2, which is the only place the constraint is observable.
 */
import type { Source } from "@repo/contract";

import {
  PayloadNotRedactableError,
  type PolicyTable,
  REDACTION_POLICY_VERSION,
  policyFor,
  redactJsonBytes,
} from "./redaction.js";

declare const FixedLengthStream: {
  new (expectedLength: number): { readable: ReadableStream; writable: WritableStream };
};

/** The subset of R2 this module uses. Structural, so a test can supply miniflare's real binding. */
export interface R2Like {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string | null,
    options?: {
      httpMetadata?: { contentType?: string; contentEncoding?: string };
      /**
       * Where the redaction record lives. It travels WITH the object rather than in a table
       * beside it, because an archive whose "was this redacted?" answer is in another system is an
       * archive nobody can audit after that system is restored from a backup.
       */
      customMetadata?: Record<string, string>;
    },
  ): Promise<{ key: string; size: number } | null>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; customMetadata?: Record<string, string> } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; size: number }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

export class PayloadKeyError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "PayloadKeyError";
  }
}

export class PayloadTooLargeError extends Error {
  constructor(
    message: string,
    readonly bytesSeen: number,
    readonly cap: number,
  ) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * What identifies one payload.
 *
 * `00-repo-map.md` section 5 specifies "one deterministically keyed object per (source, account,
 * date, window, fetched_at)". `workspaceId` is prepended, and that is not decoration:
 *
 *   * It makes a tenant-scoped LIST possible, so "delete my data" can enumerate what to remove. R2
 *     has no foreign keys and nothing cascades; without a tenant prefix, deletion means scanning
 *     the whole bucket.
 *   * It makes a cross-tenant prefix scan structurally impossible rather than merely forbidden.
 */
export interface PayloadKeyParts {
  readonly workspaceId: string;
  readonly source: string;
  readonly accountId: string;
  /** YYYY-MM-DD. */
  readonly date: string;
  /** The attribution window this payload was fetched under, or null where there is none. */
  readonly attributionWindow: string | null;
  /** RFC3339. Two pulls of the same day are two objects, which is what makes the store bitemporal. */
  readonly fetchedAt: string;
}

/**
 * Escape anything that would break the `/`-delimited structure or make a key ambiguous.
 *
 * A GA4 property id is `properties/123456` -- passed through, the slash creates a phantom directory
 * level and a prefix scan for that account misses everything under it.
 */
function segment(value: string, field: string): string {
  if (value === "") {
    throw new PayloadKeyError(`payload key: ${field} must not be empty`, field);
  }
  // Escape rather than strip. Stripping makes two different accounts collide on one key, and the
  // second write silently overwrites the first -- a lost payload with nothing to say so.
  const escaped = value.replace(/[^A-Za-z0-9._-]/g, (c) => `~${c.charCodeAt(0).toString(16)}`);
  if (escaped.length > 256) {
    throw new PayloadKeyError(`payload key: ${field} is too long after escaping`, field);
  }
  return escaped;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the object key.
 *
 * DETERMINISTIC, so a re-run of the same step writes the same object rather than a second copy.
 * A Workflow step can be retried by Cloudflare after a failure it already half-completed, and a
 * random or time-of-write key would leave the first attempt's object orphaned and paid for.
 */
export function payloadKey(parts: PayloadKeyParts): string {
  if (!DATE.test(parts.date)) {
    throw new PayloadKeyError(`payload key: date must be YYYY-MM-DD, got ${parts.date}`, "date");
  }
  if (Number.isNaN(Date.parse(parts.fetchedAt))) {
    throw new PayloadKeyError(
      `payload key: fetchedAt must be RFC3339, got ${parts.fetchedAt}`,
      "fetchedAt",
    );
  }
  return [
    segment(parts.workspaceId, "workspaceId"),
    segment(parts.source, "source"),
    segment(parts.accountId, "accountId"),
    // Date before window so a prefix scan can select a date range without knowing the windows.
    parts.date,
    segment(parts.attributionWindow ?? "none", "attributionWindow"),
    segment(new Date(parts.fetchedAt).toISOString(), "fetchedAt"),
  ].join("/");
}

/** Every object for one workspace. What "delete my data" has to enumerate. */
export function workspacePrefix(workspaceId: string): string {
  return `${segment(workspaceId, "workspaceId")}/`;
}

/**
 * The hard cap on the buffered fallback.
 *
 * 16 MB, against a 128 MB isolate. Deliberately far below it: the isolate also holds the runtime,
 * the compressed copy, and whatever else the Workflow step is doing, and a cap set near the limit
 * is a cap that only fails in production. A payload above this is a signal to page the platform
 * API, not to raise the number.
 */
export const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

export interface RedactionRecord {
  readonly source: string;
  readonly version: number;
  /** Keys removed. A count, never names -- see the header of `redaction.ts`. */
  readonly removed: number;
}

export interface PayloadRef {
  readonly key: string;
  /** Bytes STORED, which after compression is not the bytes fetched. */
  readonly size: number;
  readonly compressed: boolean;
  /**
   * `null` when the source's declared policy is `verbatim`, so a caller can tell "nothing needed
   * removing" from "nothing was checked". They are not the same fact and only one of them is safe.
   */
  readonly redacted: RedactionRecord | null;
}

export interface PutOptions {
  readonly bucket: R2Like;
  readonly key: string;
  /**
   * REQUIRED, and the reason is not bookkeeping. The source selects the redaction policy, and an
   * undeclared source is refused rather than defaulted (`redaction.ts`). Without this parameter the
   * store has no way to know whether the bytes it is about to keep contain a buyer's address.
   */
  readonly source: Source;
  /**
   * The policy table. Omit it: the default is the declared one. See `policyFor` for why this is a
   * parameter at all, and note that a production call site passing its own is a defect.
   */
  readonly policies?: PolicyTable;
  /** The platform response body. Never a parsed object -- that is the whole point. */
  readonly body: ReadableStream;
  /**
   * REQUIRED, from the platform's `content-length`.
   *
   * R2 refuses a stream whose length it does not know, so there is no way to make this optional
   * and still stream. A caller without a length uses `putBufferedPayload` and accepts its cap.
   */
  readonly contentLength: number;
  readonly contentType?: string;
  /**
   * Set when the platform's bytes are ALREADY encoded and are being stored as-is -- typically
   * `"gzip"`. This module never compresses on this path; it only records what arrived.
   */
  readonly contentEncoding?: string;
}

/**
 * Stream a payload into R2 and return its key.
 *
 * THE RETURN VALUE IS DELIBERATELY TINY. A Workflow step output is capped at 1 MiB, so a step that
 * calls this returns a key and a size -- never the payload, never the parsed rows. That cap is why
 * this function exists.
 *
 * The body is piped through a `FixedLengthStream` because that is the one form of unknown-provenance
 * stream R2 accepts. It is a pipe, not a buffer: bytes flow through a chunk at a time and the
 * isolate never holds the payload.
 */
export async function putPayload(options: PutOptions): Promise<PayloadRef> {
  // THE REFUSAL THIS PATH EXISTS TO MAKE. Redaction requires parsing; streaming exists so the
  // isolate never holds the payload. Both cannot be true, so a source whose responses can carry
  // contact data cannot stream -- and finding that out here, at the call, is the only place it
  // cannot be forgotten.
  const policy = policyFor(options.source, options.policies);
  if (policy.disposition !== "verbatim") {
    throw new PayloadNotRedactableError(
      `payloads: "${options.source}" is declared as needing redaction, and a streamed payload is ` +
        "never parsed, so it cannot be redacted. Use putBufferedPayload, which holds the body " +
        "under a cap and can. This is not a setting to relax: streaming it would store the " +
        "platform's response verbatim, contact data included.",
    );
  }

  if (!Number.isInteger(options.contentLength) || options.contentLength < 0) {
    throw new TypeError(
      `payloads: contentLength must be a non-negative integer, got ${options.contentLength}. ` +
        "R2 refuses a stream of unknown length; use putBufferedPayload when the platform sends none.",
    );
  }

  const fixed = new FixedLengthStream(options.contentLength);
  // Deliberately NOT awaited here: the pipe must be running while R2 reads the other half, and
  // awaiting it first would deadlock on any payload larger than the stream's internal buffer.
  const pumped = options.body.pipeTo(fixed.writable);

  const result = await options.bucket.put(options.key, fixed.readable, {
    httpMetadata: {
      contentType: options.contentType ?? "application/json",
      ...(options.contentEncoding === undefined
        ? {}
        : { contentEncoding: options.contentEncoding }),
    },
  });
  // NOT what enforces the declared length -- `put` above already does, and rejects in BOTH
  // directions: "Attempt to write too many bytes through a FixedLengthStream" when the body is
  // longer, "FixedLengthStream did not see all expected bytes before closing" when it is shorter.
  // An earlier comment here claimed this line was the guarantee; a mutation removing it changed
  // nothing, which is how the misattribution surfaced.
  //
  // It stays because the pipe's own rejection would otherwise be unhandled, and an unhandled
  // rejection inside a Workflow step is a failure with no message attached to it.
  await pumped;

  if (result === null) {
    throw new Error(
      `payloads: R2 returned no result for ${options.key}; the object was not stored`,
    );
  }
  return {
    key: result.key,
    size: result.size,
    compressed: options.contentEncoding === "gzip",
    redacted: null,
  };
}

export interface BufferedPutOptions {
  readonly bucket: R2Like;
  readonly key: string;
  /** See `PutOptions.source`. This path is the only one that can redact. */
  readonly source: Source;
  /**
   * The policy table. Omit it: the default is the declared one. See `policyFor` for why this is a
   * parameter at all, and note that a production call site passing its own is a defect.
   */
  readonly policies?: PolicyTable;
  readonly body: ReadableStream;
  readonly contentType?: string;
  /**
   * Compress before storing. Available ONLY here, because gzipped length is unknowable in advance
   * and R2 needs a length -- which is the whole reason this function is separate.
   *
   * Off by default: the caller reaching for this path is already the exceptional one, and silently
   * changing the stored bytes is not a default worth having.
   */
  readonly compress?: boolean;
  /** Override the cap. Raise it only with a measured reason. */
  readonly maxBytes?: number;
}

/**
 * Buffer a payload of unknown length, under a hard cap, then store it.
 *
 * THE FALLBACK, not the default. Some platforms respond with chunked transfer encoding and no
 * `content-length`, and refusing those outright would mean a connector that cannot fetch. But
 * buffering is the failure mode `00-repo-map.md` warns about, so it is bounded: the read stops and
 * throws the moment the cap is passed, rather than after the isolate dies.
 *
 * Throwing mid-read rather than at the end is the point. A 128 MB isolate that runs out of memory
 * takes the whole Workflow step with it and reports nothing useful; a `PayloadTooLargeError` names
 * the key, the cap, and how far it got.
 */
export async function putBufferedPayload(options: BufferedPutOptions): Promise<PayloadRef> {
  // Read BEFORE the body, so an undeclared source is refused without the payload ever entering the
  // isolate. Reading first and checking after would mean the bytes existed in memory of a source
  // nobody had decided anything about.
  const policy = policyFor(options.source, options.policies);
  const cap = options.maxBytes ?? MAX_BUFFERED_BYTES;
  const reader = options.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new PayloadTooLargeError(
        `payloads: ${options.key} exceeded the ${cap}-byte buffer cap at ${total} bytes. The ` +
          "platform sent no content-length, so it cannot be streamed; page the API instead of " +
          "raising this cap.",
        total,
        cap,
      );
    }
    chunks.push(value);
  }

  const assembled = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    assembled.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // REDACTION HAPPENS HERE, between holding the bytes and storing them, and nowhere else. It is
  // deliberately before compression: gzipping first would mean redacting a payload we would have to
  // decompress to read, and the order that lets a mistake through is the one where the store is
  // asked to look inside something it has already sealed.
  let redacted: RedactionRecord | null = null;
  let joined: Uint8Array<ArrayBufferLike> = assembled;
  if (policy.disposition === "redact") {
    const result = redactJsonBytes(assembled, policy);
    joined = result.bytes;
    redacted = {
      source: options.source,
      version: REDACTION_POLICY_VERSION,
      removed: result.removed,
    };
  }

  const compress = options.compress ?? false;
  // An ArrayBuffer has a known length, so R2 accepts it directly on this path -- which is the only
  // reason compression is possible here and not on the streaming one.
  //
  // Built from a one-shot ReadableStream rather than a Blob: `Blob` and `BlobPart` are DOM types
  // that @cloudflare/workers-types does not declare, and reaching for them makes this package
  // uncompilable in the runtime it targets.
  const stored: ArrayBuffer = compress
    ? await new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(joined);
            controller.close();
          },
        }).pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer()
    : (joined.buffer.slice(
        joined.byteOffset,
        joined.byteOffset + joined.byteLength,
      ) as ArrayBuffer);

  const result = await options.bucket.put(options.key, stored, {
    httpMetadata: {
      contentType: options.contentType ?? "application/json",
      ...(compress ? { contentEncoding: "gzip" } : {}),
    },
    ...(redacted === null
      ? {}
      : {
          customMetadata: {
            "redaction-source": redacted.source,
            "redaction-version": String(redacted.version),
            "redaction-removed": String(redacted.removed),
          },
        }),
  });
  if (result === null) {
    throw new Error(
      `payloads: R2 returned no result for ${options.key}; the object was not stored`,
    );
  }
  return { key: result.key, size: result.size, compressed: compress, redacted };
}

/** Read a payload back as a stream. Never as a string: the same 128 MB rule applies on the way out. */
export async function getPayload(bucket: R2Like, key: string): Promise<ReadableStream | null> {
  const object = await bucket.get(key);
  if (object === null) return null;
  // The caller decompresses if it needs to. Doing it here would hide from a caller streaming
  // straight to a client that the bytes are gzipped and can be forwarded as-is.
  return object.body;
}

/**
 * Delete every payload for one workspace.
 *
 * THIS EXISTS BECAUSE R2 DOES NOT CASCADE. `envelope_rows` is deleted by a Postgres foreign key when
 * a workspace is hard-deleted (`15-envelope-store.md`), and the payloads it referenced are simply
 * left behind: paid for, and still holding the customer's platform data after they asked for it to
 * be gone. Nothing in Postgres can reach them.
 *
 * Returns the number deleted so a caller can log it as evidence the erasure happened.
 */
export async function deleteWorkspacePayloads(
  bucket: R2Like,
  workspaceId: string,
): Promise<number> {
  const prefix = workspacePrefix(workspaceId);
  let deleted = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length > 0) {
      await bucket.delete(page.objects.map((o) => o.key));
      deleted += page.objects.length;
    }
    if (!page.truncated || page.cursor === undefined) return deleted;
    cursor = page.cursor;
  }
}

/** R2 Standard, published prices. */
export const R2_PRICES = {
  storagePerGbMonth: 0.015,
  /** Writes. $4.50 per million. */
  classAPerMillion: 4.5,
  /** Reads. $0.36 per million. */
  classBPerMillion: 0.36,
} as const;

export interface CostEstimate {
  readonly storageUsd: number;
  readonly operationsUsd: number;
  readonly totalUsd: number;
  /** Which term dominates. The answer is not the one the storage price suggests. */
  readonly dominatedBy: "storage" | "operations";
}

/**
 * What a month of payloads costs, in both terms.
 *
 * THE POINT IS THE `dominatedBy` FIELD. A Class A write is $4.50/million regardless of size, so for
 * small frequent payloads -- exactly what a tiered restatement ladder produces, five windows a day
 * per account -- the operations cost EXCEEDS the storage cost, and compressing harder does nothing
 * about it. The lever there is fewer, larger objects, not smaller ones.
 */
export function estimateCost(input: {
  objectsPerMonth: number;
  averageStoredBytes: number;
  readsPerMonth?: number;
}): CostEstimate {
  const gb = (input.objectsPerMonth * input.averageStoredBytes) / 1_000_000_000;
  const storageUsd = gb * R2_PRICES.storagePerGbMonth;
  const operationsUsd =
    (input.objectsPerMonth / 1_000_000) * R2_PRICES.classAPerMillion +
    ((input.readsPerMonth ?? 0) / 1_000_000) * R2_PRICES.classBPerMillion;

  return {
    storageUsd,
    operationsUsd,
    totalUsd: storageUsd + operationsUsd,
    dominatedBy: operationsUsd > storageUsd ? "operations" : "storage",
  };
}
