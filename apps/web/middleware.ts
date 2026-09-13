import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { GATE_COOKIE, gateToken, isGated, tokensMatch } from "./app/_gate/token";

/**
 * REFRESHING THE SESSION, AND GUARDING THE SIGNED-IN ROUTES.
 *
 * Two jobs, and the first is the one that is easy to leave out. Supabase access tokens are short
 * lived; without a refresh on each request a signed-in person is silently logged out after an hour
 * of reading. `getUser()` below performs that refresh as a side effect, which is why it is called
 * even where its answer is not used.
 *
 * `getUser()` rather than `getSession()`: getSession trusts the cookie, getUser verifies the token
 * with the auth server. This function decides whether to let a request reach the dashboard, so the
 * difference is whether a forged cookie is believed.
 *
 * WHEN AUTH IS NOT CONFIGURED, this does nothing at all. The middleware runs on every request
 * including the marketing pages, and a missing environment variable must not take the public site
 * down -- the signed-in routes refuse on their own, which is the correct place for that failure.
 */
// `/connections` IS ON THIS LIST BECAUSE IT WAS NOT COVERED BY ANY PREFIX ALREADY HERE, checked
// rather than assumed. It is the screen that attaches a source, so an unauthenticated request must
// land on sign-in rather than on a credential form that then fails at the server action.
const PROTECTED = ["/connections", "/dashboard", "/billing", "/welcome"];

/**
 * Reachable WITHOUT the pre-launch password.
 *
 * Only three things, and each for a reason: the waiting list itself (there is nothing to gate a
 * stranger from on it), the action that submits it, and the endpoint that accepts the password.
 * Everything else -- including routes added months from now -- is gated by default, which is the
 * property a middleware has and a per-page check does not.
 */
const PUBLIC_WHILE_GATED = ["/waitlist", "/api/gate"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // THE PRE-LAUNCH GATE, BEFORE ANYTHING ELSE. A visitor without the password must not reach a
  // signed-in route, a marketing page, or the sign-in form -- so this runs ahead of the session
  // refresh rather than beside it.
  if (isGated() && !PUBLIC_WHILE_GATED.some((prefix) => path.startsWith(prefix))) {
    const presented = request.cookies.get(GATE_COOKIE)?.value ?? "";
    const expected = await gateToken(process.env.SITE_PASSWORD as string);

    if (!tokensMatch(presented, expected)) {
      const waitlist = new URL("/waitlist", request.url);
      // Carried so a person who unlocks lands where they were headed. It is a PATH from this
      // request, never a full URL from a query parameter -- the latter is an open redirect.
      if (path !== "/") waitlist.searchParams.set("from", path);
      return NextResponse.redirect(waitlist);
    }
  }

  return await session(request);
}

async function session(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((prefix) => path.startsWith(prefix))) {
    const signIn = new URL("/signin", request.url);
    // Carry the destination so the person lands where they were going rather than on a generic
    // home page, which is the difference between a redirect and an interruption.
    signIn.searchParams.set("next", path);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  // Everything except Next's own assets and the static files. The matcher is negative because the
  // session refresh has to happen on ordinary page loads, not only on the protected ones.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|platforms|brand|.*\\.(?:svg|png|ico)$).*)"],
};
