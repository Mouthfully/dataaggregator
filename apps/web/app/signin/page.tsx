import type { Metadata } from "next";

import { SiteHeader } from "../_chrome";
import { AUTH } from "../_content-auth";
import { SignInForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  description: AUTH.lead,
  // Nothing is gained by indexing a sign-in screen, and it competes with the page that should rank.
  robots: { index: false, follow: true },
};

/**
 * The sign-in screen.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, stated in the UI rather than only in this comment. The
 * work-email policy in `app/_work-email.ts` is real, tested and enforced on submit. The identity
 * provider is NOT connected: there is no Supabase Auth client in this repository, `auth.users` holds
 * zero rows, and no OAuth redirect URI has been registered with Google -- which
 * `53-the-rename.md` records as the expensive half of settling a domain and deliberately not yet
 * started. So the button is present, the validation runs, and the screen says plainly that it stops
 * there. A sign-in button that silently does nothing is worse than no button.
 */
export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-ground min-h-[calc(100dvh-94px)]">
        <div className="mx-auto flex max-w-[520px] flex-col px-8 py-16">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {AUTH.eyebrow}
          </span>
          <h1 className="font-display text-ink mt-3 text-[clamp(30px,3.4vw,40px)] leading-[1.1] font-bold tracking-[-0.04em]">
            {AUTH.heading}
          </h1>
          <p className="text-ink-muted mt-4 leading-relaxed">{AUTH.lead}</p>

          <div className="border-line bg-surface mt-8 rounded-xl border p-8">
            <SignInForm />
          </div>

          <p className="text-ink-faint mt-6 text-xs leading-relaxed">{AUTH.notice}</p>
        </div>
      </main>
    </>
  );
}
