"use client";

import { type FormEvent, useId, useState } from "react";

import { AUTH } from "../_content-auth";
import { checkWorkEmail } from "../_work-email";

/**
 * The only client component in the app, and it is client-side for one reason: the address is
 * checked as the user leaves the field, so a personal address is caught before a round trip.
 *
 * THE SAME CHECK MUST RUN ON THE SERVER when this is wired to an identity provider. `checkWorkEmail`
 * is a pure function in its own module precisely so that the server route can import the same one --
 * a policy enforced only in the browser is a suggestion, since the form can be posted without it.
 * The Google button is subject to the same rule: the provider is not the policy, the domain is, so
 * the callback has to run this against the profile it receives.
 */
export function SignInForm() {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  function validate(value: string): boolean {
    const verdict = checkWorkEmail(value);
    setError(verdict.ok ? null : (verdict.message ?? null));
    setAccepted(verdict.ok ? (verdict.domain ?? null) : null);
    return verdict.ok;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    validate(email);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <button
        type="button"
        className="border-line text-ink hover:bg-surface-inset flex min-h-[46px] w-full items-center justify-center gap-3 rounded-[10px] border px-5 text-sm font-bold transition-colors"
      >
        <GoogleMark />
        {AUTH.googleCta}
      </button>

      <div className="my-6 flex items-center gap-4">
        <span className="bg-line h-px flex-1" />
        <span className="text-ink-faint text-xs">{AUTH.divider}</span>
        <span className="bg-line h-px flex-1" />
      </div>

      <label htmlFor={emailId} className="text-ink block text-sm font-bold">
        {AUTH.emailLabel}
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={AUTH.emailPlaceholder}
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (error !== null) setError(null);
        }}
        onBlur={(event) => {
          if (event.target.value.trim() !== "") validate(event.target.value);
        }}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        className="border-line text-ink placeholder:text-ink-faint focus-visible:outline-accent mt-2 min-h-[46px] w-full rounded-[10px] border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[3px]"
      />

      {error === null ? (
        <p className="text-ink-subtle mt-2 text-xs">{AUTH.emailHint}</p>
      ) : (
        // The refusal is a live region so it reaches a screen reader on blur, where a plain <p>
        // swapped into the DOM would be announced only if focus happened to move through it.
        <p id={errorId} role="alert" className="text-accent-hover mt-2 text-xs font-bold">
          {error}
        </p>
      )}

      {accepted === null ? null : (
        <p className="text-brand-mint mt-2 text-xs font-bold">{accepted}</p>
      )}

      <button
        type="submit"
        className="bg-accent text-ink-on-accent hover:bg-accent-hover mt-6 min-h-[46px] w-full rounded-[10px] px-5 text-sm font-bold transition-colors"
      >
        {AUTH.submit}
      </button>

      <p className="text-ink-faint mt-4 text-xs leading-relaxed">{AUTH.terms}</p>
    </form>
  );
}

/**
 * Google's mark, drawn rather than hotlinked, so the page makes no third-party request and no
 * cookie is set on a visitor who never signs in.
 *
 * The four colours below are GOOGLE'S TRADEMARK COLOURS, not this product's design tokens. Google's
 * "Sign in with Google" guidelines require the mark in its own colours and forbid recolouring it; a
 * mark that followed --mp-accent would stop being the mark and would misrepresent a third party.
 * Same reasoning that exempts our own logo artwork in scripts/check-tokens.mjs, applied to someone
 * else's. They sit on one line so a single reasoned pragma covers them rather than four.
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
