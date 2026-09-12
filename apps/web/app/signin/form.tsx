"use client";

import { useActionState, useId, useState } from "react";

import { signInWithEmail, signInWithGoogle, type SignInState } from "../_auth/actions";
import { AUTH } from "../_content-auth";
import { checkWorkEmail } from "../_work-email";

/**
 * THE SIGN-IN FORM.
 *
 * The address is checked TWICE and the two checks are not redundant. This one runs on blur so a
 * person is told before they submit; `_auth/actions.ts` runs the same function on the server, where
 * it cannot be skipped by posting the form without ever loading this file. A policy enforced only
 * in a browser is a suggestion with a nice animation.
 *
 * `useActionState` rather than a fetch: the form posts to a server action, so it works with
 * JavaScript disabled and the pending state comes from the framework rather than from a boolean
 * this file would have to keep in sync.
 */
export function SignInForm({
  initialError,
  googleEnabled,
}: {
  initialError?: string;
  /**
   * GOOGLE IS OFF IN THE LIVE SUPABASE PROJECT -- `auth/v1/settings` reports google: false -- so
   * `signInWithOAuth` answers 400 for every visitor who presses the button. It is therefore not
   * rendered unless a deployment says it works. Decided on the server by `./google.ts`; false is
   * the default and the page is then exactly the page it was before this existed.
   */
  googleEnabled: boolean;
}) {
  const emailId = useId();
  const errorId = useId();
  const [state, submit, pending] = useActionState<SignInState, FormData>(signInWithEmail, {
    error: initialError,
  });
  const [local, setLocal] = useState<string | null>(null);

  const error = local ?? state.error;

  if (state.sent) {
    return (
      <div>
        <p className="text-ink font-bold">{AUTH.sentHeading}</p>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">{AUTH.sentBody}</p>
        <p className="text-ink font-mono mt-4 text-sm">{state.email}</p>
      </div>
    );
  }

  return (
    <>
      {googleEnabled ? (
        <>
          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="border-line text-ink hover:bg-surface-inset flex min-h-[46px] w-full items-center justify-center gap-3 rounded-md border px-5 text-sm font-bold transition-colors"
            >
              <GoogleMark />
              {AUTH.googleCta}
            </button>
          </form>

          {/* The divider goes with the button, not above the email form. "or" separating one
              option from nothing is a rule with a word on it. */}
          <div className="my-6 flex items-center gap-4">
            <span className="bg-line h-px flex-1" />
            <span className="text-ink-faint text-xs">{AUTH.divider}</span>
            <span className="bg-line h-px flex-1" />
          </div>
        </>
      ) : null}

      <form action={submit} noValidate>
        <label htmlFor={emailId} className="text-ink block text-sm font-bold">
          {AUTH.emailLabel}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          placeholder={AUTH.emailPlaceholder}
          onChange={() => setLocal(null)}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value === "") return;
            const verdict = checkWorkEmail(value);
            setLocal(verdict.ok ? null : (verdict.message ?? null));
          }}
          aria-invalid={error !== undefined && error !== null}
          aria-describedby={error ? errorId : undefined}
          className="border-line text-ink placeholder:text-ink-faint focus-visible:outline-accent mt-2 min-h-[46px] w-full rounded-md border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[3px]"
        />

        {error ? (
          // A live region, so the refusal reaches a screen reader on blur. A plain <p> swapped into
          // the DOM is announced only if focus happens to pass through it.
          <p id={errorId} role="alert" className="text-accent-hover mt-2 text-xs font-bold">
            {error}
          </p>
        ) : (
          <p className="text-ink-subtle mt-2 text-xs">{AUTH.emailHint}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="bg-accent text-ink-on-accent hover:bg-accent-hover mt-6 min-h-[46px] w-full rounded-md px-5 text-sm font-bold transition-colors disabled:opacity-60"
        >
          {pending ? AUTH.submitPending : AUTH.submit}
        </button>

        <p className="text-ink-faint mt-4 text-xs leading-relaxed">{AUTH.terms}</p>
      </form>
    </>
  );
}

/**
 * Google's mark, drawn rather than hotlinked, so the page makes no third-party request and no
 * cookie is set on a visitor who never signs in.
 *
 * The four colours are GOOGLE'S TRADEMARK COLOURS, not this product's design tokens. Their
 * "Sign in with Google" guidelines require the mark in its own colours and forbid recolouring it.
 * They sit on one line so a single reasoned pragma covers them rather than four.
 */
// tokens-guard-ignore: Google trademark colours, reproduced as their guidelines require.
const GOOGLE_MARK = ["#4285F4", "#34A853", "#FBBC05", "#EA4335"] as const;

const GOOGLE_PATHS = [
  "M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z",
  "M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z",
  "M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z",
  "M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z",
] as const;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {GOOGLE_PATHS.map((d, index) => (
        <path key={d} fill={GOOGLE_MARK[index]} d={d} />
      ))}
    </svg>
  );
}
