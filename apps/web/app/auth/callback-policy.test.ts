import { describe, expect, it } from "vitest";

import { DEFAULT_NEXT, callbackDecision, safeNext } from "./callback-policy";

describe("the work-email rule on the Google lane", () => {
  it("refuses a personal Google account, so the restriction is not decorative", () => {
    // The whole point of judging the address in the callback: a person with both a work and a
    // personal Google account can pick the personal one at the provider's account chooser, and
    // that account must land in exactly the same place the email form puts it.
    expect(callbackDecision("someone@gmail.com", "/dashboard")).toEqual({
      kind: "refuse",
      error: "work_email",
    });
    expect(callbackDecision("someone@googlemail.com", null).kind).toBe("refuse");
  });

  it("admits a Workspace account on a company domain", () => {
    // Google is not the policy, the domain is -- a Workspace mailbox reaches the app through this
    // lane and is indistinguishable from a company address typed into the form.
    expect(callbackDecision("ops@northstar-studio.com", "/dashboard")).toEqual({
      kind: "allow",
      next: "/dashboard",
    });
  });

  it("refuses an identity the provider returned without an address", () => {
    // Refuse rather than default. There is nothing to judge, and letting an unjudged identity in
    // is the failure this whole module exists to prevent.
    expect(callbackDecision(null, "/dashboard").kind).toBe("refuse");
    expect(callbackDecision(undefined, "/dashboard").kind).toBe("refuse");
    expect(callbackDecision("", "/dashboard").kind).toBe("refuse");
  });

  it("refuses a throwaway mailbox arriving through the provider too", () => {
    expect(callbackDecision("x@mailinator.com", "/dashboard").kind).toBe("refuse");
  });

  it("does not hand a refused account a destination", () => {
    // A refusal carries no `next`. If it did, a later edit could start honouring the destination
    // before deciding whether the person is allowed in at all.
    expect(callbackDecision("someone@gmail.com", "/billing")).not.toHaveProperty("next");
  });
});

describe("the redirect target", () => {
  it("keeps an ordinary in-app path, including its query", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/billing?plan=team")).toBe("/billing?plan=team");
    expect(safeNext("/")).toBe("/");
  });

  it("refuses a protocol-relative reference", () => {
    // `new URL("//evil.example", origin)` resolves to https://evil.example/ -- this route's only
    // job is to end in a redirect, so an unchecked `next` is a phishing link with our domain on it.
    expect(safeNext("//evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext("///evil.example")).toBe(DEFAULT_NEXT);
  });

  it("refuses a backslash, which a slash-only check lets through", () => {
    // Verified against Node's URL: `new URL("/\\evil.example", origin)` is https://evil.example/,
    // because WHATWG parsing normalises a backslash to a slash for special schemes. This case is
    // the reason this rule is not simply a copy of the pre-launch gate's.
    expect(safeNext("/\\evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\\/evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext("/dashboard\\..\\evil")).toBe(DEFAULT_NEXT);
  });

  it("refuses an absolute URL and a non-http scheme", () => {
    expect(safeNext("https://evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext("http://evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext("javascript:alert(1)")).toBe(DEFAULT_NEXT);
    expect(safeNext("data:text/html,x")).toBe(DEFAULT_NEXT);
  });

  it("refuses anything that is not a path at all", () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNext("")).toBe(DEFAULT_NEXT);
    expect(safeNext("dashboard")).toBe(DEFAULT_NEXT);
  });

  it("refuses control characters and whitespace", () => {
    // A stripped CR or LF changes what the parser sees, and nothing legitimate carries one here.
    expect(safeNext("/dash\nboard")).toBe(DEFAULT_NEXT);
    expect(safeNext("/dash\rboard")).toBe(DEFAULT_NEXT);
    expect(safeNext("/ /evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext("\t/dashboard")).toBe(DEFAULT_NEXT);
  });

  it("never resolves off-origin, which is the property the regex is a means to", () => {
    // Asserted through URL rather than through the regex, because the regex is the implementation
    // and this is the requirement. Any future rewrite has to keep passing this.
    const origin = "https://app.example";
    for (const raw of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
    ]) {
      expect(new URL(safeNext(raw), origin).origin, raw).toBe(origin);
    }
  });
});
