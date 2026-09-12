import { type NextRequest, NextResponse } from "next/server";

import { GATE_COOKIE, gateToken, isGated, tokensMatch } from "../../_gate/token";

/**
 * THE PASSWORD, EXCHANGED FOR THE COOKIE.
 *
 * A POST, never a GET with the password in the query string: a URL lands in browser history, in
 * server logs, and in the `Referer` header sent to every third party the next page loads.
 *
 * The comparison is constant-time and against the DERIVED token rather than the password, so the
 * same code path serves the form and a returning cookie. A wrong password is answered exactly like
 * a missing one, with no hint of how close it was.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isGated()) return NextResponse.redirect(new URL("/", request.url));

  const form = await request.formData();
  const presented = String(form.get("password") ?? "");
  const rawNext = String(form.get("from") ?? "/");

  // ONLY A PATH, and one that starts with a single slash. `//evil.example` is a
  // protocol-relative URL that browsers follow off-site, which is how a login form becomes an
  // open redirect somebody uses in a phishing mail.
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

  const password = process.env.SITE_PASSWORD as string;
  const expected = await gateToken(password);

  if (!tokensMatch(await gateToken(presented), expected)) {
    return NextResponse.redirect(new URL("/waitlist?wrong=1", request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(GATE_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    // Thirty days. Long enough that a reviewer is not re-entering it daily, short enough that a
    // password shared in a chat a year ago stops working.
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
