import { describe, expect, it } from "vitest";
import {
  ExtractError,
  backoffMs,
  classify,
  fetchWithRetry,
  parseMetaThrottle,
  parseRetryAfter,
} from "./http.js";

const NOW = new Date("2026-09-08T00:00:00Z");

/** A fetch that returns a scripted sequence, and records how many times it was called. */
function scripted(statuses: Array<number | "network">, headers: Record<string, string> = {}) {
  let calls = 0;
  const impl = (async () => {
    const next = statuses[Math.min(calls, statuses.length - 1)] ?? 200;
    calls += 1;
    if (next === "network") throw new Error("ECONNRESET");
    return {
      ok: next >= 200 && next < 300,
      status: next,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}

function options(overrides: Record<string, unknown> = {}) {
  const waited: number[] = [];
  return {
    waited,
    opts: {
      random: () => 0.5,
      now: () => NOW,
      sleep: async (ms: number) => {
        waited.push(ms);
      },
      ...overrides,
    },
  };
}

describe("classifying a failure", () => {
  it("never retries an authorisation failure", () => {
    // The quota-preserving branch. On Google Ads rejected requests still count against a ceiling
    // shared with every other tenant, and retrying also delays the reconnect prompt.
    for (const status of [401, 403]) {
      const result = classify(status);
      expect(result.kind).toBe("auth");
      expect(result.retryable).toBe(false);
    }
  });

  it("never retries a request that is simply wrong", () => {
    for (const status of [400, 404, 422]) {
      expect(classify(status).retryable).toBe(false);
      expect(classify(status).kind).toBe("client");
    }
  });

  it("retries rate limiting and server errors", () => {
    expect(classify(429).kind).toBe("rate_limited");
    expect(classify(429).retryable).toBe(true);
    for (const status of [500, 502, 503]) expect(classify(status).retryable).toBe(true);
  });
});

describe("backoff", () => {
  it("grows exponentially", () => {
    const random = () => 1;
    expect(backoffMs({ attempt: 1, random })).toBe(1000);
    expect(backoffMs({ attempt: 2, random })).toBe(2000);
    expect(backoffMs({ attempt: 3, random })).toBe(4000);
  });

  it("jitters, so a platform incident does not become a thundering herd", () => {
    // Without jitter every connection that failed in the same minute retries in the same later
    // minute, against a shared per-developer-token ceiling.
    expect(backoffMs({ attempt: 3, random: () => 0 })).toBe(0);
    expect(backoffMs({ attempt: 3, random: () => 0.5 })).toBe(2000);
    expect(backoffMs({ attempt: 3, random: () => 1 })).toBe(4000);
  });

  it("is capped, so a late attempt does not wait forever", () => {
    expect(backoffMs({ attempt: 20, random: () => 1 })).toBe(60_000);
  });

  it("lets the platform override the formula entirely", () => {
    // A server that has told us when to come back knows better than we do.
    expect(backoffMs({ attempt: 1, retryAfterSeconds: 42, random: () => 1 })).toBe(42_000);
  });

  it("caps even what the platform asks for", () => {
    expect(backoffMs({ attempt: 1, retryAfterSeconds: 9999, random: () => 1 })).toBe(60_000);
  });
});

describe("Retry-After", () => {
  it("reads a plain number of seconds", () => {
    expect(parseRetryAfter("120", NOW)).toBe(120);
  });

  it("reads an HTTP date, which is the other form that appears in the wild", () => {
    expect(parseRetryAfter("Tue, 08 Sep 2026 00:02:00 GMT", NOW)).toBe(120);
  });

  it("never returns a negative wait for a date in the past", () => {
    expect(parseRetryAfter("Mon, 07 Sep 2026 00:00:00 GMT", NOW)).toBe(0);
  });

  it("returns null for nonsense rather than guessing", () => {
    expect(parseRetryAfter("soon", NOW)).toBeNull();
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter("", NOW)).toBeNull();
  });
});

describe("fetching with retries", () => {
  it("returns a successful response without retrying", async () => {
    const { impl, calls } = scripted([200]);
    const { opts } = options();
    await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
    expect(calls()).toBe(1);
  });

  it("spends exactly ONE attempt on an auth failure", async () => {
    // The whole point. Three attempts here would be three operations off a shared daily ceiling,
    // for an error no retry can fix.
    const { impl, calls } = scripted([401]);
    const { opts, waited } = options();
    await expect(fetchWithRetry(impl, { url: "https://example.test/x" }, opts)).rejects.toThrow(
      ExtractError,
    );
    expect(calls()).toBe(1);
    expect(waited).toHaveLength(0);
  });

  it("spends exactly one attempt on a malformed request", async () => {
    const { impl, calls } = scripted([400]);
    const { opts } = options();
    await expect(fetchWithRetry(impl, { url: "https://example.test/x" }, opts)).rejects.toThrow();
    expect(calls()).toBe(1);
  });

  it("retries a server error and succeeds", async () => {
    const { impl, calls } = scripted([503, 503, 200]);
    const { opts, waited } = options();
    const response = await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
    expect(response.status).toBe(200);
    expect(calls()).toBe(3);
    expect(waited).toHaveLength(2);
  });

  it("stops at maxAttempts rather than retrying forever", async () => {
    const { impl, calls } = scripted([503]);
    const { opts } = options();
    await expect(fetchWithRetry(impl, { url: "https://example.test/x" }, opts)).rejects.toThrow();
    expect(calls()).toBe(3);
  });

  it("honours Retry-After on a 429", async () => {
    const { impl } = scripted([429, 200], { "retry-after": "30" });
    const { opts, waited } = options();
    await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
    expect(waited).toEqual([30_000]);
  });

  it("retries a network failure, which never reached the platform and so spent no quota", async () => {
    const { impl, calls } = scripted(["network", "network", 200]);
    const { opts } = options();
    await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
    expect(calls()).toBe(3);
  });

  it("reports the attempt count and kind on the error it throws", async () => {
    const { impl } = scripted([503]);
    const { opts } = options();
    try {
      await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as ExtractError).attempts).toBe(3);
      expect((error as ExtractError).kind).toBe("transient");
      expect((error as ExtractError).status).toBe(503);
    }
  });

  it("tells the caller about every retry, so quota spend is meterable", async () => {
    const seen: string[] = [];
    const { impl } = scripted([503, 200]);
    const { opts } = options({ onRetry: (i: { reason: string }) => seen.push(i.reason) });
    await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
    expect(seen).toHaveLength(1);
  });

  it("does not read the body, so an extractor can stream it to R2", async () => {
    // A Worker isolate has 128 MB and a Workflow step output is capped at 1 MiB. Reading the body
    // here would make streaming impossible for every caller.
    let bodyRead = false;
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        get body() {
          bodyRead = true;
          return null;
        },
        json: async () => {
          bodyRead = true;
          return {};
        },
      }) as unknown as Response) as unknown as typeof fetch;
    const { opts } = options();
    await fetchWithRetry(impl, { url: "https://example.test/x" }, opts);
    expect(bodyRead).toBe(false);
  });
});

describe("Meta's throttle header", () => {
  it("reads the one field the specification actually names", () => {
    // The specification warns that its other rate-limit figures do not appear in the cited source,
    // so only ads_api_access_tier is given a name here.
    const throttle = parseMetaThrottle(
      '{"app_id_util_pct":22.5,"ads_api_access_tier":"standard_access"}',
    );
    expect(throttle?.accessTier).toBe("standard_access");
  });

  it("keeps every field verbatim, so the real ceiling can be learned rather than guessed", () => {
    const throttle = parseMetaThrottle('{"app_id_util_pct":22.5,"acc_id_util_pct":5}');
    expect(throttle?.raw.app_id_util_pct).toBe(22.5);
    expect(throttle?.raw.acc_id_util_pct).toBe(5);
  });

  it("returns null rather than throwing on a header that is not JSON", () => {
    expect(parseMetaThrottle("not json")).toBeNull();
    expect(parseMetaThrottle(null)).toBeNull();
  });

  it("survives the tier being absent", () => {
    expect(parseMetaThrottle('{"app_id_util_pct":1}')?.accessTier).toBeNull();
  });
});
