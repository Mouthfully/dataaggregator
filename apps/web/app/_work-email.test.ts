import { describe, expect, it } from "vitest";

import { checkWorkEmail, domainOf } from "./_work-email";

describe("the work-email policy", () => {
  it("admits an ordinary company domain", () => {
    for (const address of [
      "manuel@nowon.co.th",
      "ops@northstar-studio.com",
      "a.b@sub.example.co.uk",
      "first+tag@agency.io",
      "o'neill@irishfirm.ie",
    ]) {
      expect(checkWorkEmail(address), address).toMatchObject({ ok: true });
    }
  });

  it("refuses the consumer mailboxes, and names the domain in the refusal", () => {
    // Naming it matters: the commonest cause is someone typing their personal address from habit
    // and not reading a generic sentence.
    const verdict = checkWorkEmail("someone@gmail.com");
    expect(verdict.ok).toBe(false);
    expect(verdict.refusal).toBe("consumer_domain");
    expect(verdict.message).toContain("gmail.com");
  });

  it.each(["yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "qq.com"])(
    "refuses %s",
    (domain) => {
      expect(checkWorkEmail(`a@${domain}`)).toMatchObject({ refusal: "consumer_domain" });
    },
  );

  it("separates a throwaway inbox from a personal one", () => {
    // Different problems deserve different sentences: a personal Gmail is a real person using the
    // wrong address; a ten-minute mailbox is someone who does not intend to be reachable.
    expect(checkWorkEmail("x@mailinator.com")).toMatchObject({ refusal: "disposable" });
    expect(checkWorkEmail("x@gmail.com")).toMatchObject({ refusal: "consumer_domain" });
  });

  it("is case and whitespace insensitive, because a pasted address carries both", () => {
    expect(checkWorkEmail("  Someone@GMAIL.com  ")).toMatchObject({ refusal: "consumer_domain" });
    expect(checkWorkEmail("  Ops@Northstar.COM ")).toMatchObject({
      ok: true,
      domain: "northstar.com",
    });
  });

  it("distinguishes empty from malformed", () => {
    expect(checkWorkEmail("")).toMatchObject({ refusal: "empty" });
    expect(checkWorkEmail("   ")).toMatchObject({ refusal: "empty" });
    expect(checkWorkEmail("not-an-address")).toMatchObject({ refusal: "malformed" });
    expect(checkWorkEmail("a@b")).toMatchObject({ refusal: "malformed" });
    expect(checkWorkEmail("a@@b.com")).toMatchObject({ refusal: "malformed" });
  });

  it("does not refuse a domain merely for CONTAINING a consumer domain's name", () => {
    // `gmail.com.attacker.example` and `notgmail.com` are different domains, and a substring check
    // -- the obvious way to write this -- would refuse the second, which could be a real customer.
    expect(checkWorkEmail("a@notgmail.com")).toMatchObject({ ok: true });
    expect(checkWorkEmail("a@gmail.com.example.org")).toMatchObject({ ok: true });
    expect(checkWorkEmail("a@mygmail.com")).toMatchObject({ ok: true });
  });

  it("lets an unknown domain through rather than guessing", () => {
    // The failure modes are not symmetric. Wrongly admitting a personal address costs a junk row;
    // wrongly refusing a real customer costs the customer, silently, at the only moment they were
    // ever going to sign up. Anything uncertain is a human's problem, not this function's.
    expect(checkWorkEmail("a@some-obscure-isp.example")).toMatchObject({ ok: true });
  });

  it("reads the domain without deciding anything", () => {
    expect(domainOf("Someone@Example.COM")).toBe("example.com");
    expect(domainOf("broken")).toBeNull();
  });
});
