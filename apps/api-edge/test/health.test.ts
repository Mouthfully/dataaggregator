import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns 200 with {ok:true}", async () => {
    const response = await SELF.fetch("https://api-edge.test/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects a non-GET method with 405", async () => {
    const response = await SELF.fetch("https://api-edge.test/health", { method: "POST" });

    expect(response.status).toBe(405);
  });
});

describe("unknown routes", () => {
  it("404s", async () => {
    const response = await SELF.fetch("https://api-edge.test/nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
  });
});

describe("the test environment", () => {
  it("exposes the Worker's env", () => {
    expect(env).toBeDefined();
  });
});
