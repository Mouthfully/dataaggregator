import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentUser } from "../_auth/server";
import { isAuthConfigured } from "../_auth/env";
import { SiteHeader } from "../_chrome";
import { AUTH } from "../_content-auth";
import { SignInForm } from "./form";
import { isGoogleSignInEnabled } from "./google";

export const metadata: Metadata = {
  title: "Sign in",
  description: AUTH.lead,
  // Nothing is gained by indexing a sign-in screen, and it competes with the page that should rank.
  robots: { index: false, follow: true },
};

/** The callback's reasons, mapped to sentences. The query string is not shown to anyone. */
const ERRORS: Record<string, string> = {
  provider: AUTH.errorProvider,
  exchange: AUTH.errorExchange,
  work_email: AUTH.errorWorkEmail,
  missing_code: AUTH.errorMissingCode,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error } = await searchParams;

  // Already signed in: this page has nothing to offer. Checked on the SERVER so the redirect
  // happens before anything renders, rather than as a flash of the form.
  if (isAuthConfigured()) {
    const user = await currentUser();
    if (user) redirect("/dashboard");
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-ground min-h-[calc(100dvh-94px)]">
        <div className="mx-auto flex max-w-[520px] flex-col px-8 py-16">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {AUTH.eyebrow}
          </span>
          <h1 className="font-display text-ink mt-3 text-[clamp(30px,3.4vw,40px)] leading-[1.1] font-semibold tracking-[-0.04em]">
            {AUTH.heading}
          </h1>
          <p className="text-ink-muted mt-4 leading-relaxed">{AUTH.lead}</p>

          <div className="border-line bg-surface mt-8 rounded-xl border p-8">
            {isAuthConfigured() ? (
              <SignInForm
                initialError={error ? ERRORS[error] : undefined}
                // Read HERE rather than inside the client component. Next inlines
                // `process.env.NEXT_PUBLIC_*` into the client bundle at BUILD time, so a read down
                // there would mean turning the provider on in Supabase and setting the variable
                // still shows nothing until an unrelated commit triggers a rebuild.
                googleEnabled={isGoogleSignInEnabled()}
              />
            ) : (
              // Configuration is missing. Say so plainly rather than rendering a form that takes an
              // address and drops it -- the failure belongs in front of whoever deployed this, not
              // silently behind a button.
              <p className="text-ink-muted text-sm leading-relaxed">{AUTH.notConfigured}</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
