"use client";

import { useActionState, useId } from "react";

import { createOrganisation, type WelcomeState } from "./actions";

export function WelcomeForm({
  copy,
}: {
  copy: { label: string; hint: string; submit: string; pending: string };
}) {
  const nameId = useId();
  const [state, submit, pending] = useActionState<WelcomeState, FormData>(createOrganisation, {});

  return (
    <form action={submit}>
      <label htmlFor={nameId} className="text-ink block text-sm font-bold">
        {copy.label}
      </label>
      <input
        id={nameId}
        name="name"
        required
        maxLength={200}
        defaultValue={state.name}
        autoComplete="organization"
        className="border-line text-ink focus-visible:outline-accent mt-2 min-h-[46px] w-full rounded-md border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[3px]"
      />
      {state.error ? (
        <p role="alert" className="text-accent-hover mt-2 text-xs font-bold">
          {state.error}
        </p>
      ) : (
        <p className="text-ink-subtle mt-2 text-xs">{copy.hint}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-ink-on-accent hover:bg-accent-hover mt-6 min-h-[46px] w-full rounded-md px-5 text-sm font-bold transition-colors disabled:opacity-60"
      >
        {pending ? copy.pending : copy.submit}
      </button>
    </form>
  );
}
