import { describe, expect, it } from "vitest";
import {
  PayloadKeyError,
  type R2Like,
  deleteWorkspacePayloads,
  estimateCost,
  payloadKey,
  workspacePrefix,
} from "./payloads.js";
import {
  DECLARED_SOURCES,
  MAX_REDACTION_DEPTH,
  PayloadNotRedactableError,
  PayloadPolicyError,
  policyFor,
  redactJsonBytes,
  redactValue,
} from "./redaction.js";

const PARTS = {
  workspaceId: "7c000000-0000-0000-0000-000000000001",
  source: "ga4",
  accountId: "properties/123456",
  date: "2026-08-14",
  attributionWindow: "model",
  fetchedAt: "2026-09-08T02:00:00Z",
};

describe("the key", () => {
  it("puts the workspace first, so a tenant's objects can be enumerated and erased", () => {
    // R2 has no foreign keys and nothing cascades. Without a tenant prefix, "delete my data" means
    // scanning the whole bucket.
    expect(payloadKey(PARTS).startsWith(`${PARTS.workspaceId}/`)).toBe(true);
    expect(workspacePrefix(PARTS.workspaceId)).toBe(`${PARTS.workspaceId}/`);
  });

  it("is deterministic, so a retried Workflow step overwrites rather than orphans", () => {
    // Cloudflare can retry a step it already half-completed. A random or time-of-write key would
    // leave the first attempt's object behind: paid for, referenced by nothing.
    expect(payloadKey(PARTS)).toBe(payloadKey({ ...PARTS }));
  });

  it("escapes a slash in an account id rather than letting it create a directory level", () => {
    // GA4 account ids look like `properties/123456`. Passed through, the slash creates a phantom
    // level and a prefix scan for the account misses everything under it.
    const key = payloadKey(PARTS);
    expect(key).not.toContain("properties/123456");
    expect(key).toContain("properties~2f123456");
    // Five separators: workspace / source / account / date / window / fetched_at.
    expect(key.split("/")).toHaveLength(6);
  });

  it("escapes rather than strips, so two accounts cannot collide on one key", () => {
    // Stripping would map `a/b` and `a-b` onto the same key, and the second write would silently
    // overwrite the first: a lost payload with nothing to say so.
    const a = payloadKey({ ...PARTS, accountId: "a/b" });
    const b = payloadKey({ ...PARTS, accountId: "a-b" });
    expect(a).not.toBe(b);
  });

  it("puts the date before the window, so a date range scans without knowing the windows", () => {
    const parts = payloadKey(PARTS).split("/");
    expect(parts[3]).toBe("2026-08-14");
    expect(parts[4]).toBe("model");
  });

  it("labels a missing attribution window rather than leaving a gap", () => {
    // An empty segment would make `.../2026-08-14//...`, which is a different key shape and breaks
    // any parse that counts segments.
    expect(payloadKey({ ...PARTS, attributionWindow: null }).split("/")[4]).toBe("none");
  });

  it("makes two pulls of the same day two objects, which is what makes the store bitemporal", () => {
    const first = payloadKey({ ...PARTS, fetchedAt: "2026-09-08T02:00:00Z" });
    const second = payloadKey({ ...PARTS, fetchedAt: "2026-09-09T02:00:00Z" });
    expect(first).not.toBe(second);
  });

  it("normalises the fetch timestamp so two spellings of one instant are one object", () => {
    // "2026-09-08T02:00:00Z" and "2026-09-08T04:00:00+02:00" are the same moment. Keying on the
    // raw string would store the same payload twice and pay for it twice.
    expect(payloadKey({ ...PARTS, fetchedAt: "2026-09-08T04:00:00+02:00" })).toBe(
      payloadKey(PARTS),
    );
  });

  it("refuses a malformed date or timestamp rather than building a key from it", () => {
    expect(() => payloadKey({ ...PARTS, date: "14-08-2026" })).toThrow(PayloadKeyError);
    expect(() => payloadKey({ ...PARTS, fetchedAt: "yesterday" })).toThrow(/RFC3339/);
    expect(() => payloadKey({ ...PARTS, accountId: "" })).toThrow(/must not be empty/);
  });
});

describe("erasure, which R2 will not do for us", () => {
  function bucket(keys: string[]) {
    const deleted: string[] = [];
    const listed: Array<string | undefined> = [];
    const impl: R2Like = {
      put: async () => ({ key: "", size: 0 }),
      get: async () => null,
      delete: async (k) => {
        deleted.push(...(Array.isArray(k) ? k : [k]));
      },
      list: async (options) => {
        listed.push(options?.cursor);
        const all = keys.filter((k) => k.startsWith(options?.prefix ?? ""));
        const start = options?.cursor === undefined ? 0 : Number(options.cursor);
        const limit = options?.limit ?? 1000;
        const page = all.slice(start, start + limit);
        const next = start + limit;
        return {
          objects: page.map((k) => ({ key: k, size: 1 })),
          truncated: next < all.length,
          ...(next < all.length ? { cursor: String(next) } : {}),
        };
      },
    };
    return { impl, deleted, listed };
  }

  it("deletes every object under the workspace prefix", async () => {
    // Postgres deletes envelope_rows by foreign key when a workspace is hard-deleted. The payloads
    // they referenced are left behind: paid for, and still holding the customer's platform data
    // after they asked for it to be gone. Nothing in Postgres can reach them.
    const b = bucket(["w1/ga4/a/2026-08-14/model/t", "w1/ga4/a/2026-08-15/model/t"]);
    expect(await deleteWorkspacePayloads(b.impl, "w1")).toBe(2);
    expect(b.deleted).toHaveLength(2);
  });

  it("leaves another workspace's objects alone", async () => {
    const b = bucket(["w1/ga4/a/2026-08-14/model/t", "w2/ga4/a/2026-08-14/model/t"]);
    expect(await deleteWorkspacePayloads(b.impl, "w1")).toBe(1);
    expect(b.deleted).toEqual(["w1/ga4/a/2026-08-14/model/t"]);
  });

  it("follows the cursor, so erasure does not stop at the first page", async () => {
    // R2 lists 1,000 at a time. Deleting only the first page would report success while leaving
    // most of the customer's data in place -- the worst possible outcome for this function.
    const keys = Array.from({ length: 2_500 }, (_, i) => `w1/ga4/a/2026-08-14/model/t${i}`);
    const b = bucket(keys);
    expect(await deleteWorkspacePayloads(b.impl, "w1")).toBe(2_500);
    expect(b.deleted).toHaveLength(2_500);
    expect(b.listed.length).toBeGreaterThan(1);
  });

  it("reports zero for a workspace with nothing stored, rather than failing", async () => {
    const b = bucket([]);
    expect(await deleteWorkspacePayloads(b.impl, "w1")).toBe(0);
  });
});

describe("the cost term the specification never counts", () => {
  it("shows operations dominating for the small frequent payloads a restatement ladder produces", () => {
    // Five windows a day per account, ~30 days: 150 objects a month, each a few KB compressed.
    // A Class A write is $4.50/million REGARDLESS OF SIZE, so compressing harder does nothing here.
    // The lever is fewer, larger objects -- which is the opposite of what the storage price implies.
    const ladder = estimateCost({ objectsPerMonth: 150, averageStoredBytes: 3_000 });
    expect(ladder.dominatedBy).toBe("operations");
    expect(ladder.operationsUsd).toBeGreaterThan(ladder.storageUsd);
  });

  it("shows storage dominating once payloads are large", () => {
    const bulk = estimateCost({ objectsPerMonth: 150, averageStoredBytes: 5_000_000 });
    expect(bulk.dominatedBy).toBe("storage");
  });

  it("counts reads separately, at the cheaper Class B rate", () => {
    const withReads = estimateCost({
      objectsPerMonth: 100,
      averageStoredBytes: 1_000,
      readsPerMonth: 1_000_000,
    });
    const without = estimateCost({ objectsPerMonth: 100, averageStoredBytes: 1_000 });
    expect(withReads.operationsUsd - without.operationsUsd).toBeCloseTo(0.36, 6);
  });

  it("totals the two terms rather than reporting the larger", () => {
    const e = estimateCost({ objectsPerMonth: 1_000_000, averageStoredBytes: 1_000_000 });
    expect(e.totalUsd).toBeCloseTo(e.storageUsd + e.operationsUsd, 9);
    // A terabyte stored is $15.00; a million writes is $4.50. Both are real.
    expect(e.storageUsd).toBeCloseTo(15, 6);
    expect(e.operationsUsd).toBeCloseTo(4.5, 6);
  });
});

describe("the redaction policy table", () => {
  // The table is what makes this fail closed: an undeclared source cannot store a payload at all,
  // so the next connector's author has to decide before their bytes go anywhere.

  it("declares a policy for every source in the dictionary", () => {
    for (const source of DECLARED_SOURCES) {
      expect(() => policyFor(source)).not.toThrow();
    }
  });

  // THE NAME HERE MUST BE A SOURCE THAT IS GENUINELY NOT IN THE DICTIONARY, and keeping that true
  // is a real maintenance obligation. This test read `woocommerce` until its connector shipped, at
  // which point it inverted: the source became declared and the refusal it asserts stopped
  // happening. `shopify` is slot 3 of 11A.14's launch set and is next in line to do the same, so
  // whoever ships it re-points this at the next undeclared name rather than deleting the test --
  // the fail-closed path is the reason this module exists and must never go unexercised.
  it("refuses a source nobody has decided about, and says where to decide it", () => {
    expect(() => policyFor("shopify")).toThrow(PayloadPolicyError);
    expect(() => policyFor("shopify")).toThrow(/redaction\.ts/);
  });

  it("refuses a redact policy with no keep-list, which would remove everything", () => {
    const broken = { bad: { disposition: "redact", reason: "forgot the keep-list" } } as const;
    expect(() => policyFor("bad", broken)).toThrow(/policy bug/);
  });

  it("gives every verbatim source a reason a human can read", () => {
    for (const source of DECLARED_SOURCES) {
      expect(policyFor(source).reason.length).toBeGreaterThan(10);
    }
  });
});

describe("redactValue: an allow-list, applied at every depth", () => {
  const keep = new Set(["id", "total", "line_items", "quantity"]);

  it("drops every key not on the list", () => {
    const { value, removed } = redactValue(
      { id: 1, total: "1290", billing: { phone: "0812345678" }, customer_note: "leave at door" },
      keep,
    );
    expect(value).toEqual({ id: 1, total: "1290" });
    expect(removed).toBe(2);
  });

  it("applies the list inside nested objects, not only at the top", () => {
    const { value } = redactValue({ line_items: { quantity: 2, sku_owner_email: "a@b.c" } }, keep);
    expect(value).toEqual({ line_items: { quantity: 2 } });
  });

  it("preserves array length, because a row count that changed would break the metrics", () => {
    const { value } = redactValue(
      { line_items: [{ quantity: 1, note: "x" }, { quantity: 2 }, { note: "y" }] },
      keep,
    );
    expect(value).toEqual({ line_items: [{ quantity: 1 }, { quantity: 2 }, {}] });
  });

  it("counts removals inside arrays too", () => {
    const { removed } = redactValue({ line_items: [{ note: "x" }, { note: "y" }] }, keep);
    expect(removed).toBe(2);
  });

  it("leaves primitives alone", () => {
    expect(redactValue("a string", keep).value).toBe("a string");
    expect(redactValue(null, keep).value).toBe(null);
    expect(redactValue(7, keep).value).toBe(7);
  });

  it("filters an object with no prototype, which an earlier version let through untouched", () => {
    const exotic = Object.create(null) as Record<string, unknown>;
    exotic.phone = "0812345678";
    exotic.id = 4;
    expect(redactValue(exotic, keep).value).toEqual({ id: 4 });
  });

  it("refuses a payload nested deeper than the cap rather than overflowing the stack", () => {
    let deep: unknown = { id: 1 };
    for (let i = 0; i < MAX_REDACTION_DEPTH + 2; i += 1) deep = { id: deep };
    expect(() => redactValue(deep, keep)).toThrow(/nests deeper/);
  });
});

describe("redactJsonBytes", () => {
  const policy = {
    disposition: "redact",
    keep: new Set(["id", "total"]),
    reason: "test",
  } as const;

  it("returns bytes carrying only the kept keys", () => {
    const input = new TextEncoder().encode('{"id":1,"total":"90","email":"a@b.c"}');
    const { bytes, removed } = redactJsonBytes(input, policy);
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({ id: 1, total: "90" });
    expect(removed).toBe(1);
  });

  it("refuses a body that is not JSON rather than storing it unexamined", () => {
    const input = new TextEncoder().encode("<html>not json</html>");
    expect(() => redactJsonBytes(input, policy)).toThrow(PayloadNotRedactableError);
    expect(() => redactJsonBytes(input, policy)).toThrow(/the leak this policy exists to prevent/);
  });
});
