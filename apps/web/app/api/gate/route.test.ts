import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { GATE_COOKIE, gateToken } from "../../_gate/token";
import { POST } from "./route";

/**
 * THE GATE'S EXCHANGE, TESTED FOR ITS STATUS CODE AND NOT ONLY ITS COOKIE.
 *
 * This file exists because of a bug it would have caught on the first run. Every redirect out of
 * the route used `NextResponse.redirect(url)`, whose default is 307 -- a status that PRESERVES the
 * request method. So a correct password produced a 307 to `/`, the browser re-issued the POST
 * against a page route with no POST handler, and the visitor was shown `405 Method Not Allowed`
 * having just been authenticated. The cookie was set correctly the whole time, which is precisely
 * why checking the cookie was not enough.
 *
 * The live check that missed it used `curl` to read the Set-Cookie header without following the
 * redirect as a browser would. So the assertions here are on the STATUS, and every path out of the
 * route has one -- a wrong password and the not-gated case redirect too, and a 307 on either is
 * the same 405 in a different place.
 */

const PASSWORD = "correct horse battery staple";

function post(fields: Record<string, string>): NextRequest {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new NextRequest("https://example.test/api/gate", { method: "POST", body });
}

let previous: string | undefined;

beforeEach(() => {
  previous = process.env.SITE_PASSWORD;
  process.env.SITE_PASSWORD = PASSWORD;
});

afterEach(() => {
  if (previous === undefined) delete process.env.SITE_PASSWORD;
  else process.env.SITE_PASSWORD = previous;
});

describe("the password exchange", () => {
  it("answers a correct password with 303, not 307", async () => {
    // 307 re-issues the POST at the destination, which is a page, which yields 405. This single
    // assertion is the whole bug.
    const response = await POST(post({ password: PASSWORD, from: "/pricing" }));
    expect(response.status).toBe(303);
  });

  it("sends the visitor where they were going, and sets the cookie", async () => {
    const response = await POST(post({ password: PASSWORD, from: "/pricing" }));
    expect(response.headers.get("location")).toBe("https://example.test/pricing");
    expect(response.cookies.get(GATE_COOKIE)?.value).toBe(await gateToken(PASSWORD));
  });

  it("answers a wrong password with 303 and no cookie", async () => {
    const response = await POST(post({ password: "wrong", from: "/pricing" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/waitlist?wrong=1");
    expect(response.cookies.get(GATE_COOKIE)).toBeUndefined();
  });

  it("refuses a protocol-relative destination rather than following it off-site", async () => {
    // `//evil.example` is a URL a browser follows off-site, which is how a login form becomes an
    // open redirect in a phishing mail.
    const response = await POST(post({ password: PASSWORD, from: "//evil.example" }));
    expect(response.headers.get("location")).toBe("https://example.test/");
  });

  it("redirects with 303 when no password is configured at all", async () => {
    delete process.env.SITE_PASSWORD;
    const response = await POST(post({ password: "", from: "/" }));
    expect(response.status).toBe(303);
  });
});
