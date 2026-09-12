import { describe, expect, it } from "vitest";

import { GATE_COOKIE, gateToken, isGated, tokensMatch } from "./token";

describe("the pre-launch gate token", () => {
  it("never contains the password", async () => {
    // The whole reason the cookie holds an HMAC rather than the password: a cookie read off a
    // shared machine, or out of a proxy log, must not hand over the secret itself.
    const token = await gateToken("hunter2-correct-horse");
    expect(token).not.toContain("hunter2");
    expect(token).not.toContain("horse");
  });

  it("is deterministic, so a returning visitor is recognised with no session store", async () => {
    expect(await gateToken("same")).toBe(await gateToken("same"));
  });

  it("changes completely when the password changes, invalidating every issued cookie", async () => {
    // This is what makes a leaked shared password recoverable: rotate it and every cookie already
    // out there stops working, with nothing to revoke.
    const before = await gateToken("old-password");
    const after = await gateToken("new-password");
    expect(after).not.toBe(before);
  });

  it("is cookie-safe base64url, not base64", async () => {
    // `+`, `/` and `=` are not legal in a cookie value without quoting, and a quoted cookie is
    // handled inconsistently enough that it is simpler not to produce one.
    expect(await gateToken("anything")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("names one cookie, so the middleware and the endpoint cannot disagree", () => {
    expect(GATE_COOKIE).toBe("up_preview");
  });
});

describe("the comparison", () => {
  it("accepts an exact match and rejects everything else", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("", "")).toBe(true);
  });

  it("rejects a prefix, which a length check alone would let through", () => {
    expect(tokensMatch("abc", "abcdef")).toBe(false);
    expect(tokensMatch("abcdef", "abc")).toBe(false);
  });

  it("rejects an empty presented value against a real token", () => {
    // The commonest case in production: no cookie at all.
    expect(tokensMatch("", "a-real-token")).toBe(false);
  });

  it("compares the whole input rather than stopping at the first difference", () => {
    // Asserted STRUCTURALLY, because a timing test is flaky and proves little: the two functions
    // agree on every answer and differ only in how long they take to be wrong. What is checkable
    // is that the loop has no early exit -- the same posture the Worker's own token compare takes.
    const source = tokensMatch.toString();
    expect(source).not.toMatch(/\breturn\b[\s\S]*\breturn\b/);
  });
});

describe("whether the gate is on", () => {
  it("is off when no password is set, so the site is simply public", () => {
    expect(isGated({})).toBe(false);
    expect(isGated({ SITE_PASSWORD: "" })).toBe(false);
  });

  it("is on the moment a password exists", () => {
    expect(isGated({ SITE_PASSWORD: "x" })).toBe(true);
  });
});
