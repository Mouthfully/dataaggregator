import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  PENDING_TTL_MS,
  exchangeCode,
  redactSecrets,
  startAuthorization,
  verifyCallback,
} from "./flow.js";
import { type CryptoLike, base64url, createPkcePair, timingSafeEqual } from "./pkce.js";
import { PROVIDERS, providerFor, scopesFor } from "./providers.js";

const subject = globalThis.crypto as unknown as CryptoLike;
const NOW = new Date("2026-09-08T00:00:00Z");

type StartOverrides = Partial<Parameters<typeof startAuthorization>[1]>;

async function start(overrides: StartOverrides = {}) {
  return startAuthorization(subject, {
    provider: "google",
    workspaceId: "c0000000-0000-0000-0000-000000000001",
    sources: ["google_ads", "ga4"],
    clientId: "client-123.apps.googleusercontent.com",
    redirectUri: "http://localhost:3000/auth/callback",
    now: NOW,
    ...overrides,
  });
}

describe("PKCE", () => {
  it("derives the challenge as the base64url SHA-256 of the verifier", async () => {
    const pair = await createPkcePair(subject);
    const digest = await subject.subtle.digest("SHA-256", new TextEncoder().encode(pair.verifier));
    expect(pair.challenge).toBe(base64url(new Uint8Array(digest)));
    expect(pair.method).toBe("S256");
  });

  it("produces a verifier inside RFC 7636's 43-128 character range", async () => {
    const pair = await createPkcePair(subject);
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
  });

  it("uses base64url, not base64, because the value travels in a URL", async () => {
    const pair = await createPkcePair(subject);
    expect(pair.challenge).not.toMatch(/[+/=]/);
  });

  it("is different every time", async () => {
    const [a, b] = [await createPkcePair(subject), await createPkcePair(subject)];
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe("the authorisation URL", () => {
  it("sends the challenge and never the verifier", async () => {
    // Sending the verifier would defeat PKCE entirely: an interceptor would have both halves.
    const { url, pending } = await start();
    expect(url).toContain("code_challenge=");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).not.toContain(pending.codeVerifier);
  });

  it("requests only the scopes for the sources asked for", async () => {
    const { url } = await start();
    const scope = new URL(url).searchParams.get("scope") ?? "";
    expect(scope).toContain("adwords");
    expect(scope).toContain("analytics.readonly");
    // Search Console was not requested, so it is not asked for. Scope minimalism is an access
    // timeline decision as much as a security one: Google's sensitive-scope review is unbounded.
    expect(scope).not.toContain("webmasters");
  });

  it("asks only for read scopes", async () => {
    for (const provider of Object.values(PROVIDERS)) {
      for (const spec of provider.scopes) {
        expect(spec.scope).not.toMatch(/\b(write|manage|publish|modify)\b/);
      }
    }
  });

  it("sends the parameters Google needs to issue a refresh token at all", async () => {
    const params = new URL((await start()).url).searchParams;
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
  });

  it("refuses to start a flow for a provider that serves none of the sources", async () => {
    await expect(start({ provider: "meta", sources: ["ga4"] })).rejects.toThrow(/serves none of/);
  });

  it("routes each source to the provider that actually serves it", () => {
    expect(providerFor("meta_ads")).toBe("meta");
    expect(providerFor("google_ads")).toBe("google");
    expect(scopesFor("meta", ["meta_ads"])).toEqual(["ads_read"]);
  });
});

describe("the callback", () => {
  it("accepts a matching state inside the window", async () => {
    const { pending } = await start();
    expect(() => verifyCallback({ pending, returnedState: pending.state, now: NOW })).not.toThrow();
  });

  it("rejects a mismatched state", async () => {
    // The attack: someone starts a flow with THEIR ad account and has the victim's browser finish
    // it, silently attaching the wrong account to the victim's workspace.
    const { pending } = await start();
    try {
      verifyCallback({ pending, returnedState: "forged", now: NOW });
      throw new Error("should have rejected");
    } catch (error) {
      expect((error as AuthorizationError).code).toBe("state_mismatch");
    }
  });

  it("rejects an expired attempt", async () => {
    const { pending } = await start();
    try {
      verifyCallback({
        pending,
        returnedState: pending.state,
        now: new Date(NOW.getTime() + PENDING_TTL_MS + 1000),
      });
      throw new Error("should have rejected");
    } catch (error) {
      expect((error as AuthorizationError).code).toBe("expired");
    }
  });

  it("reports the provider's own refusal before anything else", async () => {
    // A customer who pressed Cancel should see that, not a state error.
    const { pending } = await start();
    try {
      verifyCallback({
        pending,
        returnedState: "irrelevant",
        providerError: "access_denied",
        now: NOW,
      });
      throw new Error("should have rejected");
    } catch (error) {
      expect((error as AuthorizationError).code).toBe("provider_denied");
    }
  });

  it("compares state in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("the token exchange", () => {
  function respondWith(payload: Record<string, unknown>, ok = true): typeof fetch {
    return (async () =>
      ({
        ok,
        status: ok ? 200 : 400,
        json: async () => payload,
      }) as unknown as Response) as unknown as typeof fetch;
  }

  it("presents the verifier and never the challenge", async () => {
    const { pending } = await start();
    let sentBody = "";
    const capturing = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await exchangeCode(
      { pending, code: "code-1", clientId: "cid", clientSecret: "secret", now: NOW },
      capturing,
    );
    expect(sentBody).toContain(`code_verifier=${encodeURIComponent(pending.codeVerifier)}`);
    expect(sentBody).not.toContain("code_challenge");
  });

  it("computes an absolute expiry from the relative one providers return", async () => {
    const { pending } = await start();
    const result = await exchangeCode(
      { pending, code: "c", clientId: "cid", clientSecret: "s", now: NOW },
      respondWith({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    );
    expect(result.expiresAt).toBe("2026-09-08T01:00:00.000Z");
  });

  it("fails loudly when Google issues no refresh token", async () => {
    // Without one the connection dies silently within the hour. Better a failure at connect time
    // than a mystery at 3am.
    const { pending } = await start();
    try {
      await exchangeCode(
        { pending, code: "c", clientId: "cid", clientSecret: "s", now: NOW },
        respondWith({ access_token: "at", expires_in: 3600 }),
      );
      throw new Error("should have rejected");
    } catch (error) {
      expect((error as AuthorizationError).code).toBe("missing_refresh_token");
    }
  });

  it("accepts Meta having no refresh token, because Meta issues none", async () => {
    // Meta gives a long-lived token instead. This is re-authorisation, not refresh, which is why
    // connections.expires_at is a column the health check watches.
    const { pending } = await start({ provider: "meta", sources: ["meta_ads"] });
    const result = await exchangeCode(
      { pending, code: "c", clientId: "cid", clientSecret: "s", now: NOW },
      respondWith({ access_token: "at", expires_in: 5_184_000 }),
    );
    expect(result.refreshToken).toBeNull();
    expect(result.expiresAt).toBe("2026-11-07T00:00:00.000Z");
  });

  it("records the scopes actually granted, which may be fewer than requested", async () => {
    // Turns a later 403 into "this connection lacks Search Console" rather than a guess.
    const { pending } = await start();
    const result = await exchangeCode(
      { pending, code: "c", clientId: "cid", clientSecret: "s", now: NOW },
      respondWith({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/adwords",
      }),
    );
    expect(result.grantedScopes).toEqual(["https://www.googleapis.com/auth/adwords"]);
  });

  it("does not put the provider's error body in the message", async () => {
    // Providers echo request parameters in errors, and the client secret is a request parameter.
    const { pending } = await start();
    await expect(
      exchangeCode(
        { pending, code: "c", clientId: "cid", clientSecret: "super-secret", now: NOW },
        respondWith({ error: "invalid_grant", client_secret: "super-secret" }, false),
      ),
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe("redaction", () => {
  it("removes every token-shaped field", () => {
    const redacted = redactSecrets({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      client_secret: "cs",
      code: "c",
      expires_in: 3600,
      scope: "adwords",
    });
    for (const key of ["access_token", "refresh_token", "id_token", "client_secret", "code"]) {
      expect(redacted[key]).toBe("[redacted]");
    }
    expect(redacted.expires_in).toBe(3600);
    expect(redacted.scope).toBe("adwords");
  });

  it("is applied to the raw payload the exchange returns", async () => {
    const { pending } = await start();
    const result = await exchangeCode(
      { pending, code: "c", clientId: "cid", clientSecret: "s", now: NOW },
      (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
        }) as unknown as Response) as unknown as typeof fetch,
    );
    expect(result.raw.access_token).toBe("[redacted]");
    expect(result.raw.refresh_token).toBe("[redacted]");
    // The real values still reach the caller through the typed fields, which go to the vault.
    expect(result.accessToken).toBe("at");
  });
});

describe("what the provider registry records about access", () => {
  it("marks webmasters.readonly as unconfirmed rather than guessing", () => {
    // Specification section 3.5 open question: the scope is not listed on Google's OAuth scopes
    // page, so whether it falls behind the same unbounded review is unestablished.
    const searchConsole = PROVIDERS.google.scopes.find((s) => s.source === "search_console");
    expect(searchConsole?.sensitivity).toBe("unconfirmed");
  });

  it("records that Meta issues no refresh token", () => {
    expect(PROVIDERS.meta.issuesRefreshToken).toBe(false);
    expect(PROVIDERS.google.issuesRefreshToken).toBe(true);
  });

  it("gives every scope a stated reason, for the Connect screen and for review", () => {
    for (const provider of Object.values(PROVIDERS)) {
      for (const spec of provider.scopes) {
        expect(spec.reason.length).toBeGreaterThan(10);
      }
    }
  });
});
