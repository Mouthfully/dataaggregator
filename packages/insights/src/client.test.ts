import { describe, expect, it } from "vitest";

import { InsightClientError, postInsight } from "./client.ts";
import { type OpaqueTenantId, type OpenRouterBody, buildRequest } from "./request.ts";

const TENANT = "b".repeat(64) as OpaqueTenantId;
const BODY = buildRequest({ model: "some/model", userPrompt: "figures", tenant: TENANT });

function completion(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "gen-123",
    model: "vendor/model-actually-served",
    provider: "SomeProvider",
    choices: [{ message: { content: '{"summary":["a","b","c"],"unusual":null,"action":null}' } }],
    ...overrides,
  });
}

/** A fetch that records every call, so "did not retry" is an assertion rather than a hope. */
function recorder(handler: (call: number) => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl = (async (_url: string, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    return await handler(calls.length);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function ok(bodyText = completion()): Response {
  return new Response(bodyText, { status: 200, headers: { "content-type": "application/json" } });
}

describe("the privacy fields are enforced at the wire, not only at the builder", () => {
  it("refuses to send a body that lost them", async () => {
    // A hand-rolled body, which is exactly what the builder cannot prevent on its own.
    const smuggled = {
      ...BODY,
      provider: { data_collection: "allow", zdr: true },
    } as unknown as OpenRouterBody;
    const { impl, calls } = recorder(() => ok());

    await expect(postInsight(smuggled, { apiKey: "k", fetchImpl: impl })).rejects.toMatchObject({
      code: "privacy_fields_missing",
    });
    // Nothing reached a provider.
    expect(calls).toEqual([]);
  });

  it("refuses a body with no provider object at all", async () => {
    const { provider: _dropped, ...rest } = BODY;
    const { impl, calls } = recorder(() => ok());
    await expect(
      postInsight(rest as unknown as OpenRouterBody, { apiKey: "k", fetchImpl: impl }),
    ).rejects.toMatchObject({ code: "privacy_fields_missing" });
    expect(calls).toEqual([]);
  });

  it("puts both fields in the body that actually goes out", async () => {
    const { impl, calls } = recorder(() => ok());
    await postInsight(BODY, { apiKey: "k", fetchImpl: impl });
    expect(JSON.parse(calls[0] ?? "{}")).toMatchObject({
      provider: { data_collection: "deny", zdr: true },
    });
  });
});

describe("the key", () => {
  it("refuses before sending when it is missing", async () => {
    const { impl, calls } = recorder(() => ok());
    await expect(postInsight(BODY, { apiKey: "   ", fetchImpl: impl })).rejects.toMatchObject({
      code: "missing_api_key",
    });
    expect(calls).toEqual([]);
  });
});

describe("what comes back", () => {
  it("records which model and which provider actually served it", async () => {
    // The request names a slug; only the response says what happened. Default routing can serve
    // the same request from a different provider run to run.
    const { impl } = recorder(() => ok());
    const result = await postInsight(BODY, { apiKey: "k", fetchImpl: impl });
    expect(result.servedByModel).toBe("vendor/model-actually-served");
    expect(result.servedByProvider).toBe("SomeProvider");
    expect(result.generationId).toBe("gen-123");
    expect(result.content).toContain("summary");
  });

  it("reports null rather than guessing when the response does not say", async () => {
    const { impl } = recorder(() =>
      ok(
        JSON.stringify({
          choices: [{ message: { content: "{}" } }],
        }),
      ),
    );
    const result = await postInsight(BODY, { apiKey: "k", fetchImpl: impl });
    expect(result.servedByModel).toBeNull();
    expect(result.servedByProvider).toBeNull();
  });

  it("refuses an empty completion rather than returning a blank brief", async () => {
    const { impl } = recorder(() =>
      ok(JSON.stringify({ choices: [{ message: { content: "  " } }] })),
    );
    await expect(postInsight(BODY, { apiKey: "k", fetchImpl: impl })).rejects.toMatchObject({
      code: "no_content",
    });
  });

  it("refuses a response with no choices", async () => {
    const { impl } = recorder(() => ok(JSON.stringify({ choices: [] })));
    await expect(postInsight(BODY, { apiKey: "k", fetchImpl: impl })).rejects.toMatchObject({
      code: "no_content",
    });
  });

  it("refuses a response that is not JSON", async () => {
    const { impl } = recorder(() => new Response("<html>", { status: 200 }));
    await expect(postInsight(BODY, { apiKey: "k", fetchImpl: impl })).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
});

describe("retry policy", () => {
  it("does NOT retry a 4xx", async () => {
    for (const [status, code] of [
      [400, "bad_status"],
      [401, "unauthorised"],
      [403, "unauthorised"],
      [422, "provider_refused"],
      [429, "rate_limited"],
    ] as const) {
      const { impl, calls } = recorder(() => new Response("{}", { status }));
      await expect(postInsight(BODY, { apiKey: "k", fetchImpl: impl })).rejects.toMatchObject({
        code,
      });
      // Sending the same wrong request again changes nothing except the bill.
      expect(calls).toHaveLength(1);
    }
  });

  it("retries a 5xx exactly once", async () => {
    const { impl, calls } = recorder((call) =>
      call === 1 ? new Response("{}", { status: 503 }) : ok(),
    );
    const result = await postInsight(BODY, { apiKey: "k", fetchImpl: impl });
    expect(calls).toHaveLength(2);
    expect(result.servedByProvider).toBe("SomeProvider");
  });

  it("retries a dropped connection exactly once, then gives up", async () => {
    const { impl, calls } = recorder(() => {
      throw new Error("connection reset");
    });
    await expect(postInsight(BODY, { apiKey: "k", fetchImpl: impl })).rejects.toMatchObject({
      code: "network",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("the timeout", () => {
  it("gives up rather than hanging past the morning", async () => {
    const impl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as unknown as typeof fetch;

    await expect(
      postInsight(BODY, { apiKey: "k", fetchImpl: impl, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("the error type", () => {
  it("carries a code and, where there was one, a status", () => {
    const error = new InsightClientError("bad_status", "boom", 502);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("bad_status");
    expect(error.status).toBe(502);
  });
});
