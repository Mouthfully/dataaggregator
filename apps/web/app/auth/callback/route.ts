import { type NextRequest, NextResponse } from "next/server";

import { checkWorkEmail } from "../../_work-email";
import { supabaseServer } from "../../_auth/server";

/**
 * WHERE A PROVIDER REDIRECT BECOMES A SESSION -- and where the work-email rule is applied to it.
 *
 * The email lane is judged before the link is sent, in `_auth/actions.ts`. The Google lane cannot
 * be: the address does not exist until the provider hands it back. So the rule is applied HERE,
 * after the code exchange and before the person is let in, using the same `checkWorkEmail`.
 *
 * THE ORDER MATTERS AND IS THE WHOLE OF THIS FILE. The exchange has to happen first, because the
 * address is inside the session it produces. That means a personal account briefly HAS a session
 * when it is refused -- so the refusal path signs it out again rather than merely redirecting, or
 * the rejected user stays authenticated and can simply navigate to /dashboard.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) return NextResponse.redirect(new URL("/signin?error=missing_code", url.origin));

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/signin?error=exchange", url.origin));
  }

  const email = data.user.email ?? "";
  const verdict = checkWorkEmail(email);
  if (!verdict.ok) {
    // Sign out, do not merely redirect. The exchange above already created a session; leaving it
    // in place would mean a refused account is signed in and one URL away from the dashboard.
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/signin?error=work_email", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
