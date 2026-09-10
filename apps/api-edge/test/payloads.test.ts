import {
  MAX_BUFFERED_BYTES,
  PayloadTooLargeError,
  type PolicyTable,
  type R2Like,
  deleteWorkspacePayloads,
  getPayload,
  payloadKey,
  putBufferedPayload,
  putPayload,
} from "@repo/payloads";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * @repo/payloads against a REAL R2, not a fake one.
 *
 * The package's own suite covers key construction, erasure and cost with a structural double. It
 * cannot cover the two properties the module exists for, and this file is the reason both are known:
 *
 *   1. A large payload is never materialised in a 128 MB isolate. A fake bucket that accepts a
 *      `ReadableStream` proves nothing -- it will happily accept a stream backed by a 40 MB array.
 *
 *   2. R2 REFUSES A STREAM OF UNKNOWN LENGTH. That constraint is invisible to any double, and it is
 *      what split this module into a streaming path and a buffered one. The first version of this
 *      module compressed inside the pipe and could not have worked in production.
 */

const bucket = () => env.PAYLOADS as unknown as R2Like;

const PARTS = {
  workspaceId: "7c000000-0000-0000-0000-000000000001",
  source: "ga4",
  accountId: "properties/123456",
  date: "2026-08-14",
  attributionWindow: "model",
  fetchedAt: "2026-09-08T02:00:00Z",
};

/** A stream of `count` copies of one pre-encoded chunk, never assembled. */
function chunks(count: number, chunk: Uint8Array): ReadableStream {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= count) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += 1;
    },
  });
}

function textStream(body: string): ReadableStream {
  return chunks(1, new TextEncoder().encode(body));
}

async function readAll(stream: ReadableStream, gunzip: boolean): Promise<string> {
  const source = gunzip ? stream.pipeThrough(new DecompressionStream("gzip")) : stream;
  return await new Response(source).text();
}

describe("what R2 actually accepts, which is the constraint that shaped this module", () => {
  it("refuses a bare ReadableStream, which is why putPayload requires a length", async () => {
    // Recorded here as an executable fact rather than a comment. If a future workerd relaxes this,
    // this test fails and the two-function split can be revisited -- which is the point of pinning
    // a constraint you designed around.
    await expect(env.PAYLOADS.put("probe/bare", chunks(4, new Uint8Array(1024)))).rejects.toThrow(
      /known length/,
    );
  });

  it("refuses new Response(stream).body too, which is the obvious workaround and does not work", async () => {
    // A Response built from a stream has no length either. Believing otherwise is how a connector
    // ships that passes fixtures and fails on the first real account.
    await expect(
      env.PAYLOADS.put("probe/response", new Response(chunks(4, new Uint8Array(1024))).body),
    ).rejects.toThrow(/known length/);
  });
});

describe("streaming, the path every extractor should use", () => {
  it("stores a payload and returns a key, never the payload", async () => {
    const key = payloadKey(PARTS);
    const body = '{"rows":[1,2,3]}';
    const ref = await putPayload({
      bucket: bucket(),
      source: "ga4",
      key,
      body: textStream(body),
      contentLength: body.length,
    });

    expect(ref.key).toBe(key);
    expect(ref.size).toBe(body.length);
    // The whole point of the return value: it fits in a 1 MiB Workflow step output with room to
    // spare, because it is a key and a number.
    expect(JSON.stringify(ref).length).toBeLessThan(200);
  });

  it("round-trips the exact bytes", async () => {
    const key = payloadKey({ ...PARTS, date: "2026-08-15" });
    const body =
      '{"dimensionHeaders":[{"name":"date"}],"rows":[{"metricValues":[{"value":"1284"}]}]}';
    await putPayload({
      bucket: bucket(),
      source: "ga4",
      key,
      body: textStream(body),
      contentLength: body.length,
    });
    expect(await readAll((await getPayload(bucket(), key)) as ReadableStream, false)).toBe(body);
  });

  it("returns null for a key that was never written", async () => {
    expect(await getPayload(bucket(), "nope/nope/nope/2026-08-14/none/x")).toBeNull();
  });

  it("records the platform's own content-encoding rather than re-encoding", async () => {
    // This path never compresses. When a platform's bytes arrive already gzipped they are stored
    // as-is and labelled, so a reader knows without guessing and a proxy can forward them untouched.
    const key = payloadKey({ ...PARTS, date: "2026-08-16" });
    const gz = await new Response(
      textStream("hello hello hello").pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();

    const ref = await putPayload({
      bucket: bucket(),
      source: "ga4",
      key,
      body: chunks(1, new Uint8Array(gz)),
      contentLength: gz.byteLength,
      contentEncoding: "gzip",
    });
    expect(ref.compressed).toBe(true);
    expect(await readAll((await getPayload(bucket(), key)) as ReadableStream, true)).toBe(
      "hello hello hello",
    );
  });

  it("refuses a negative or fractional content length rather than passing it to R2", async () => {
    await expect(
      putPayload({
        bucket: bucket(),
        source: "ga4",
        key: "bad/length/x/2026-08-14/none/t",
        body: textStream("x"),
        contentLength: -1,
      }),
    ).rejects.toThrow(/non-negative integer/);
  });

  it("refuses a body SHORTER than the declared length", async () => {
    await expect(
      putPayload({
        bucket: bucket(),
        source: "ga4",
        key: payloadKey({ ...PARTS, date: "2026-08-17" }),
        body: textStream("short"),
        contentLength: 5_000,
      }),
    ).rejects.toThrow(/did not see all expected bytes/);
  });

  it("refuses a body LONGER than the declared length, which is the dangerous direction", async () => {
    // A silent success here would store a TRUNCATED object under a key that claims to be a whole
    // report -- a number quietly too low, with a valid-looking payload behind it. R2 rejects it,
    // and this test is what says so rather than a comment claiming it.
    await expect(
      putPayload({
        bucket: bucket(),
        source: "ga4",
        key: payloadKey({ ...PARTS, date: "2026-08-23" }),
        body: chunks(1, new TextEncoder().encode("x".repeat(1_000))),
        contentLength: 100,
      }),
    ).rejects.toThrow(/too many bytes/);
    expect(await getPayload(bucket(), payloadKey({ ...PARTS, date: "2026-08-23" }))).toBeNull();
  });
});

describe("the 128 MB rule, which is what this module exists for", () => {
  it("streams a payload far larger than a Workflow step output can carry", async () => {
    // 40 MB, streamed in 64 KB chunks and never assembled. `00-repo-map.md`: "a builder agent not
    // briefed on this will ship a Meta async-report connector that passes fixtures and fails on a
    // real large account". This is the assertion that would catch that.
    //
    // The chunk is encoded ONCE and re-enqueued, so the TEST does not materialise 40 MB either --
    // if it did, a passing result would prove nothing about the isolate.
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    const count = 640;
    const total = count * chunk.byteLength;

    const ref = await putPayload({
      bucket: bucket(),
      source: "ga4",
      key: payloadKey({ ...PARTS, date: "2026-08-18" }),
      body: chunks(count, chunk),
      contentLength: total,
    });

    expect(ref.size).toBe(total);
    expect(ref.size).toBeGreaterThan(40_000_000);
    // And the 1 MiB step-output cap holds regardless of how big the payload was.
    expect(JSON.stringify(ref).length).toBeLessThan(1024 * 1024);
  });
});

describe("the buffered fallback, bounded so it cannot become the failure it guards", () => {
  it("stores a payload whose length the platform never declared", async () => {
    const key = payloadKey({ ...PARTS, date: "2026-08-19" });
    await putBufferedPayload({
      bucket: bucket(),
      source: "ga4",
      key,
      body: textStream('{"chunked":true}'),
    });
    expect(await readAll((await getPayload(bucket(), key)) as ReadableStream, false)).toBe(
      '{"chunked":true}',
    );
  });

  it("compresses when asked, which only this path can do", async () => {
    // Gzipped length is unknowable in advance and R2 needs a length, so compression is impossible
    // on the streaming path. Here the bytes are already in hand.
    const body = `{"rows":[${Array.from({ length: 2_000 }, () => '{"metricValues":[{"value":"1284"}]}').join(",")}]}`;
    const key = payloadKey({ ...PARTS, date: "2026-08-20" });

    const ref = await putBufferedPayload({
      bucket: bucket(),
      source: "ga4",
      key,
      body: textStream(body),
      compress: true,
    });
    expect(ref.compressed).toBe(true);
    expect(ref.size).toBeLessThan(body.length / 8);
    expect(await readAll((await getPayload(bucket(), key)) as ReadableStream, true)).toBe(body);
  });

  it("does not compress by default, because silently changing the stored bytes is not a default", async () => {
    const body = "y".repeat(10_000);
    const ref = await putBufferedPayload({
      bucket: bucket(),
      source: "ga4",
      key: payloadKey({ ...PARTS, date: "2026-08-21" }),
      body: textStream(body),
    });
    expect(ref.compressed).toBe(false);
    expect(ref.size).toBe(body.length);
  });

  it("throws mid-read when the cap is passed, rather than after the isolate dies", async () => {
    // An out-of-memory isolate takes the whole Workflow step with it and reports nothing useful.
    // A PayloadTooLargeError names the key, the cap, and how far it got.
    const chunk = new TextEncoder().encode("z".repeat(64 * 1024));
    const error = await putBufferedPayload({
      bucket: bucket(),
      source: "ga4",
      key: payloadKey({ ...PARTS, date: "2026-08-22" }),
      body: chunks(100, chunk),
      maxBytes: 256 * 1024,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PayloadTooLargeError);
    expect((error as PayloadTooLargeError).cap).toBe(256 * 1024);
    expect((error as PayloadTooLargeError).bytesSeen).toBeLessThanOrEqual(256 * 1024 + 64 * 1024);
    expect((error as Error).message).toMatch(/page the API instead of raising this cap/);
    // Nothing was stored: a partial payload under a real key is worse than no payload.
    expect(await getPayload(bucket(), payloadKey({ ...PARTS, date: "2026-08-22" }))).toBeNull();
  });

  it("defaults to a cap far below the isolate limit", () => {
    // A cap set near 128 MB is a cap that only fails in production: the isolate also holds the
    // runtime, the compressed copy, and whatever else the step is doing.
    expect(MAX_BUFFERED_BYTES).toBe(16 * 1024 * 1024);
    expect(MAX_BUFFERED_BYTES).toBeLessThan((128 * 1024 * 1024) / 4);
  });
});

describe("erasure against a real bucket", () => {
  it("removes one workspace's objects and leaves another's", async () => {
    const mine = { ...PARTS, workspaceId: "erase-me" };
    const theirs = { ...PARTS, workspaceId: "keep-me" };

    for (const date of ["2026-08-01", "2026-08-02", "2026-08-03"]) {
      await putPayload({
        bucket: bucket(),
        source: "ga4",
        key: payloadKey({ ...mine, date }),
        body: textStream("{}"),
        contentLength: 2,
      });
    }
    await putPayload({
      bucket: bucket(),
      source: "ga4",
      key: payloadKey(theirs),
      body: textStream("{}"),
      contentLength: 2,
    });

    expect(await deleteWorkspacePayloads(bucket(), "erase-me")).toBe(3);
    expect(await getPayload(bucket(), payloadKey({ ...mine, date: "2026-08-01" }))).toBeNull();
    expect(await getPayload(bucket(), payloadKey(theirs))).not.toBeNull();
  });

  it("is idempotent, so a retried erasure is not an error", async () => {
    expect(await deleteWorkspacePayloads(bucket(), "erase-me")).toBe(0);
  });
});

/**
 * A source that must be redacted. No such source is in the dictionary yet -- the commerce
 * connectors 11A.14 names are not built -- so the table is supplied here, which is what the
 * `policies` seam exists for. Shaped like a WooCommerce order, because that is the first payload
 * this will meet.
 */
const ORDER_POLICIES = {
  ga4: { disposition: "verbatim", reason: "aggregate" },
  shop: {
    disposition: "redact",
    keep: new Set(["id", "status", "currency", "total", "total_tax", "line_items", "quantity"]),
    reason: "an order carries buyer name, email, phone and shipping address",
  },
} as const satisfies PolicyTable;

const ORDER = JSON.stringify({
  id: 10482,
  status: "completed",
  currency: "THB",
  total: "1290.00",
  total_tax: "84.39",
  billing: { first_name: "Somchai", phone: "0812345678", email: "s@example.co.th" },
  shipping: { address_1: "88 Sukhumvit 55", city: "Bangkok" },
  customer_note: "leave with the guard",
  line_items: [{ quantity: 2, name: "Latte", meta_data: [{ key: "gift_to", value: "Malee" }] }],
});

describe("the redaction path, against a real bucket", () => {
  it("refuses to STREAM a source that must be redacted", async () => {
    // The constraint the whole module turns on: a streamed body is never parsed, so it can never be
    // redacted. This is the one place that fact cannot be forgotten.
    await expect(
      putPayload({
        bucket: bucket(),
        source: "shop" as never,
        policies: ORDER_POLICIES,
        key: payloadKey({ ...PARTS, date: "2026-09-01" }),
        body: textStream(ORDER),
        contentLength: ORDER.length,
      }),
    ).rejects.toThrow(/cannot be redacted/);
  });

  // `shopify`, not `woocommerce`: the latter is declared now that its connector has shipped.
  // The name must be one the dictionary genuinely lacks, or this stops testing anything.
  it("refuses a source nobody has declared a policy for, on both paths", async () => {
    const key = payloadKey({ ...PARTS, date: "2026-09-02" });
    await expect(
      putPayload({
        bucket: bucket(),
        source: "shopify" as never,
        key,
        body: textStream(ORDER),
        contentLength: ORDER.length,
      }),
    ).rejects.toThrow(/no redaction policy declared/);

    const body = textStream(ORDER);
    await expect(
      putBufferedPayload({ bucket: bucket(), source: "shopify" as never, key, body }),
    ).rejects.toThrow(/no redaction policy declared/);
    // AND THE BODY WAS NEVER READ. The policy is resolved before the stream is touched, so an
    // undeclared source's bytes never enter the isolate at all.
    expect(body.locked).toBe(false);
  });

  it("stores only the kept fields, and nothing that identifies the buyer", async () => {
    const key = payloadKey({ ...PARTS, date: "2026-09-03" });
    const ref = await putBufferedPayload({
      bucket: bucket(),
      source: "shop" as never,
      policies: ORDER_POLICIES,
      key,
      body: textStream(ORDER),
    });

    const stored = await readAll((await getPayload(bucket(), key)) as ReadableStream, false);
    expect(JSON.parse(stored)).toEqual({
      id: 10482,
      status: "completed",
      currency: "THB",
      total: "1290.00",
      total_tax: "84.39",
      line_items: [{ quantity: 2 }],
    });

    // Asserted on the raw text, not the parsed object: a leak could hide in a key as easily as in a
    // value, and `toEqual` above would not see a stray string.
    for (const leak of [
      "Somchai",
      "0812345678",
      "s@example.co.th",
      "Sukhumvit",
      "Malee",
      "guard",
    ]) {
      expect(stored).not.toContain(leak);
    }
    expect(ref.redacted?.removed).toBeGreaterThan(0);
  });

  it("records that redaction happened, in metadata that travels with the object", async () => {
    const key = payloadKey({ ...PARTS, date: "2026-09-04" });
    await putBufferedPayload({
      bucket: bucket(),
      source: "shop" as never,
      policies: ORDER_POLICIES,
      key,
      body: textStream(ORDER),
    });
    const object = await bucket().get(key);
    expect(object?.customMetadata?.["redaction-source"]).toBe("shop");
    expect(object?.customMetadata?.["redaction-version"]).toBe("1");
    expect(Number(object?.customMetadata?.["redaction-removed"])).toBeGreaterThan(0);
  });

  it("redacts BEFORE compressing, so the stored bytes were never a verbatim order", async () => {
    const key = payloadKey({ ...PARTS, date: "2026-09-05" });
    const ref = await putBufferedPayload({
      bucket: bucket(),
      source: "shop" as never,
      policies: ORDER_POLICIES,
      key,
      body: textStream(ORDER),
      compress: true,
    });
    expect(ref.compressed).toBe(true);
    const stored = await readAll((await getPayload(bucket(), key)) as ReadableStream, true);
    expect(stored).not.toContain("Somchai");
    expect(JSON.parse(stored).id).toBe(10482);
  });

  it("distinguishes a verbatim source from a redacted one in the return value", async () => {
    // `null` is not `{removed: 0}`. "Nothing needed removing" and "nothing was checked" are
    // different facts and only one of them is safe.
    const key = payloadKey({ ...PARTS, date: "2026-09-06" });
    const body = '{"rows":[1,2,3]}';
    const ref = await putPayload({
      bucket: bucket(),
      source: "ga4",
      key,
      body: textStream(body),
      contentLength: body.length,
    });
    expect(ref.redacted).toBe(null);
    expect((await bucket().get(key))?.customMetadata?.["redaction-source"]).toBeUndefined();
  });
});
