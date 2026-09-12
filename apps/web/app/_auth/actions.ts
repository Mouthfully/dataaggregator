"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { checkWorkEmail } from "../_work-email";
import { supabaseServer } from "./server";

/**
 * SIGN-IN, AND THE POINT AT WHICH THE WORK-EMAIL POLICY BECOMES A POLICY.
 *
 * `app/_work-email.ts` runs in the browser too, on blur, so a person gets told before they submit.
 * That copy is a COURTESY. This one is the rule: a form can be posted without ever loading the
 * page's JavaScript, so a check that exists only in the client is a suggestion with a nice
 * animation. Same function, called where it cannot be skipped.
 *
 * THE GOOGLE LANE IS SUBJECT TO THE SAME RULE and it is not enforced here, because it cannot be --
 * the address only exists after the provider redirects back. `auth/callback` applies it there, and
 * that split is the whole reason `checkWorkEmail` is a pure exported function rather than a regex
 * inside a form.
 */

/** Where the provider and the magic link come back to. Derived, never written down twice. */
async function callbackUrl(next: string): Promise<string> {
  // `origin` comes from the request rather than from brand.domain on purpose: a preview deployment
  // must send people back to ITSELF, and a redirect to production from a branch build is a bug that
  // only appears in preview, which is where nobody looks for it.
  const header = await headers();
  const origin = header.get("origin") ?? `https://${header.get("host") ?? ""}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export interface SignInState {
  readonly error?: string;
  readonly sent?: boolean;
  readonly email?: string;
}

export async function signInWithEmail(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");

  const verdict = checkWorkEmail(email);
  if (!verdict.ok) return { error: verdict.message, email };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: await callbackUrl("/dashboard") },
  });

  if (error) {
    // The provider's own message is not shown. It distinguishes "no such user" from "rate limited"
    // from "sending failed", and the first of those turns a sign-in form into a way to ask whether
    // an address has an account here.
    return { error: SEND_FAILED, email };
  }
  return { sent: true, email };
}

const SEND_FAILED = "That did not send. Check the address and try again in a moment.";

export async function signInWithGoogle(): Promise<never> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: await callbackUrl("/dashboard"),
      // `select_account` so a shared machine does not silently sign in whoever used it last, and
      // so a person with both a personal and a work Google account is asked which one -- which is
      // exactly the choice the work-email rule then judges.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect("/signin?error=provider");

  // `typedRoutes` types redirect() against this app's own routes, and this destination is Google's.
  // The cast is the narrow, honest way to say "this one leaves the app" -- widening the config to
  // untyped routes to accommodate one external redirect would give up the checking everywhere else.
  redirect(data.url as Parameters<typeof redirect>[0]);
}

export async function signOut(): Promise<never> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
