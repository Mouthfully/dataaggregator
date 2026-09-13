"use client";

import { useActionState, useId } from "react";

import { joinWaitlist, type WaitlistState } from "./actions";

/**
 * THE COLLECTION NOTICE, AND WHY THIS FORM IS THE ONE THAT MOST NEEDED ONE.
 *
 * The gate redirects every route to this page until somebody enters the password, so while the
 * product is pre-launch THIS IS THE ONLY SURFACE ON WHICH A STRANGER GIVES US PERSONAL DATA. It
 * took an email address with no statement of who was collecting it, what for, how long it would be
 * kept, or where the privacy notice was -- which made the least-guarded page the one carrying the
 * whole of the company's live collection.
 *
 * Thailand's PDPA is the law here and it is not conditional on anything: section 5 binds a
 * controller located in the Kingdom, and `packages/brand/src/brand.ts` records a Thai juristic
 * person. Section 19 requires consent to be requested in a form that is explicitly distinguishable,
 * and section 23 requires the purpose, the controller's identity and contact, the retention period
 * and the categories of recipient to be given AT OR BEFORE collection.
 *
 * WHAT IS WRITTEN HERE IS WHAT IS TRUE, AND THE RETENTION LINE IS THE HONEST ONE. No retention
 * schedule exists for this table or any other -- `docs/marketplane/62-compliance-claims.md` and the
 * privacy page's open clauses both record that -- so the notice says the address is kept until the
 * product opens or the reader asks for it to be deleted, which is a commitment this company can
 * actually keep, rather than a period nobody has set. Writing "12 months" here would be a
 * fabricated assurance, and the privacy page's own header explains why that is worse than an
 * admitted gap.
 */
const COPY = {
  label: "Work email",
  placeholder: "you@yourcompany.com",
  submit: "Join the waiting list",
  pending: "Adding…",
  done: "You're on the list.",
  doneBody: "We'll be in touch when there's something worth showing you.",
  noticeLead: "Your address is used to tell you when the product opens, and for nothing else.",
  noticeRetention:
    "It is kept until then, or until you ask us to delete it, whichever comes first. It is never sold or shared.",
  noticeLink: "Who holds it, and how to ask",
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

      {/* Below the control and above nothing else: a notice given after the address has been typed
          is not given "at or before" collection in any sense a reader would recognise, but one
          placed between the label and the input separates the person from the thing they came to
          do. This sits with the control, in the same visual block, before submission. */}
      <p className="text-ink-subtle mt-3 max-w-[420px] text-xs leading-[1.55]">
        {COPY.noticeLead} {COPY.noticeRetention}{" "}
        <a href="/privacy" className="text-accent font-bold hover:underline">
          {COPY.noticeLink}
        </a>
      </p>
    </form>
  );
}
