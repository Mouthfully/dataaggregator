import { PROVIDERS, type CryptoLike, createPkcePair, startAuthorization } from "@repo/oauth";
import { describe, expect, it } from "vitest";

// packages/oauth typechecks standalone against the DOM lib, which is the weaker check: DOM declares
// more than workerd does. This file is the real proof, because it compiles the same source under
// @cloudflare/workers-types with NO DOM lib, and runs it in the runtime that will refresh tokens.
describe("the OAuth flow under workerd", () => {
  const subtle = crypto as unknown as CryptoLike;

  it("derives a PKCE pair with workerd's WebCrypto", async () => {
    const pair = await createPkcePair(subtle);
    expect(pair.method).toBe("S256");
    expect(pair.challenge).not.toMatch(/[+/=]/);
  });

  it("builds an authorisation URL, which exercises URL and URLSearchParams here", async () => {
    const { url, pending } = await startAuthorization(subtle, {
      provider: "google",
      workspaceId: "c0000000-0000-0000-0000-000000000001",
      sources: ["google_ads"],
      clientId: "cid",
      redirectUri: "https://example.test/auth/callback",
      now: new Date("2026-09-08T00:00:00Z"),
    });
    expect(url.startsWith(PROVIDERS.google.authorizationEndpoint)).toBe(true);
    expect(url).not.toContain(pending.codeVerifier);
  });
});
