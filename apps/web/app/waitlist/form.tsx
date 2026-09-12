"use client";

import { useActionState, useId } from "react";

import { joinWaitlist, type WaitlistState } from "./actions";

const COPY = {
  label: "Work email",
  placeholder: "you@yourcompany.com",
  submit: "Join the waiting list",
  pending: "Adding…",
  done: "You're on the list.",
  doneBody: "We'll be in touch when there's something worth showing you.",
} as const;

export function WaitlistForm({ source }: { source: string }) {
  const emailId = useId();
  const [state, submit, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});

  if (state.ok) {
    return (
      <div>
        <p className="text-ink font-bold">{COPY.done}</p>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">{COPY.doneBody}</p>
      </div>
    );
  }

  return (
    <form action={submit} noValidate>
      <input type="hidden" name="source" value={source} />
      <label htmlFor={emailId} className="text-ink block text-sm font-bold">
        {COPY.label}
      </label>
      <div className="mt-2 flex flex-wrap gap-3">
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={COPY.placeholder}
          aria-invalid={Boolean(state.error)}
          className="border-line text-ink placeholder:text-ink-faint focus-visible:outline-accent min-h-[46px] min-w-[240px] flex-1 rounded-md border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[3px]"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-accent text-ink-on-accent hover:bg-accent-hover min-h-[46px] rounded-md px-6 text-sm font-bold transition-colors disabled:opacity-60"
        >
          {pending ? COPY.pending : COPY.submit}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-accent-hover mt-2 text-xs font-bold">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
