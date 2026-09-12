import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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
const PROTECTED = ["/dashboard"];

export async function middleware(request: NextRequest) {
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
