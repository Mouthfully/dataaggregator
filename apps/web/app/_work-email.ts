/**
 * THE WORK-EMAIL POLICY.
 *
 * Sign-up is for company addresses. This module decides what that means, and it is a separate,
 * exported, tested function rather than a regex inside a form because the same decision has to be
 * made again on the server the moment sign-up is wired to Supabase -- a check that lives only in
 * the browser is a suggestion, not a policy.
 *
 * WHAT THIS IS NOT. It is not an attempt to enumerate every free mail provider; that list is tens
 * of thousands of domains long, changes weekly, and a repository is the wrong place to keep it. It
 * refuses the consumer domains that account for essentially all of the real traffic, and it is
 * honest in its own error message about being a first pass rather than a wall.
 *
 * THE FAILURE MODES ARE NOT SYMMETRIC, which is why the list is short rather than aggressive.
 * Wrongly ADMITTING a personal address costs a junk row someone can delete. Wrongly REFUSING a real
 * customer's real domain costs the customer, silently, at the only moment they were ever going to
 * sign up -- and the smaller the company, the likelier its domain looks unusual. So every entry
 * here is a domain that is unambiguously a free consumer mailbox, and anything uncertain is let
 * through to be dealt with by a human.
 *
 * Google sign-in is offered alongside this and is subject to the SAME rule: a Workspace account on
 * a company domain passes, a personal @gmail.com account does not. The provider is not the policy;
 * the domain is.
 */

export type EmailRefusal = "empty" | "malformed" | "consumer_domain" | "disposable";

export interface EmailVerdict {
  readonly ok: boolean;
  readonly refusal?: EmailRefusal;
  readonly message?: string;
  /** The lowercased domain, when one could be read. Useful to the caller for logging a count. */
  readonly domain?: string;
}

/**
 * Free consumer mailboxes. Ordered roughly by how often they turn up, not alphabetically, because
 * the common case should be the early exit.
 */
const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.jp",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "mail.com",
  "mail.ru",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "tutanota.com",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "hanmail.net",
  "daum.net",
  "rediffmail.com",
  "hotmail.fr",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "libero.it",
  "t-online.de",
]);

/**
 * Throwaway-inbox services. Separate from the list above, and given its own refusal, because the
 * two are different problems: a personal Gmail is a real person using the wrong address, and a
 * ten-minute mailbox is someone who does not intend to be reachable at all. They deserve different
 * sentences.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mintemail.com",
]);

/**
 * Deliberately permissive, and NOT an attempt at RFC 5322.
 *
 * The authoritative test of an address is whether mail sent to it arrives; a regex that tries to
 * be complete only ever produces false refusals -- the famous ones being plus-addressing, apostrophes
 * in Irish surnames, and new TLDs. This asks only for the shape a domain can be read out of, and
 * leaves the rest to a confirmation mail.
 */
const SHAPE = /^[^\s@]+@([^\s@.]+(?:\.[^\s@.]+)+)$/;

export function domainOf(email: string): string | null {
  const match = SHAPE.exec(email.trim().toLowerCase());
  return match?.[1] ?? null;
}

export function checkWorkEmail(input: string): EmailVerdict {
  const email = input.trim();
  if (email === "") {
    return { ok: false, refusal: "empty", message: "Enter your work email address." };
  }

  const domain = domainOf(email);
  if (domain === null) {
    return {
      ok: false,
      refusal: "malformed",
      message: "That does not look like an email address.",
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      ok: false,
      refusal: "disposable",
      domain,
      message: "That is a temporary mailbox. Use an address you can be reached at.",
    };
  }

  if (CONSUMER_DOMAINS.has(domain)) {
    return {
      ok: false,
      refusal: "consumer_domain",
      domain,
      // Names the domain, because the commonest cause is a person typing their personal address by
      // habit and not reading a generic refusal.
      message: `Use your company email rather than a personal ${domain} address.`,
    };
  }

  return { ok: true, domain };
}
