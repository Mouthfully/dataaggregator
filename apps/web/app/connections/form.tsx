"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";

import { CONNECTIONS } from "../_content";
import { TYPED_PROVIDERS, typedProvider } from "./_providers";
import { type ConnectState, createConnection } from "./actions";

/**
 * THE CREDENTIAL-ENTRY SURFACE. Four decisions in this file are security decisions rather than
 * layout ones, and each is here because its opposite is the ordinary thing to write.
 *
 * 1. THE CREDENTIAL INPUTS HAVE NO `defaultValue`. The account field has one, so a refused
 *    submission does not make somebody retype their store address; the key, the secret and the
 *    token deliberately do not, because a value in `defaultValue` is a value in the HTML the
 *    server sends -- and this app's own action never carries one back for exactly that reason.
 *    With JavaScript on, the browser keeps what was typed in the live DOM and nothing is lost.
 * 2. THEY ARE `type="password"` WITH `autoComplete="off"`. Not to hide them from their owner, but
 *    because a plaintext field is read over a shoulder, captured by a screen recorder, and offered
 *    to a password manager that will store it under the wrong identity.
 * 3. THE FORM POSTS. `action={submit}` is a server action, which is a POST; nothing here builds a
 *    URL, and no refusal path redirects with parameters. A credential in a query string lands in
 *    browser history, in access logs and in the `Referer` header of every request the next page
 *    makes -- and unlike a leaked page, none of those can be recalled.
 * 4. THE EXPIRY IS A QUESTION, NOT A DEFAULT. A blank answer would be posted as "permanent", which
 *    is what a bearer token's null expiry means downstream -- so the token lane asks, and
 *    `actions.ts` refuses a submission that did not answer.
 *
 * The set of fields follows the selected source, which needs JavaScript to switch; the server
 * action checks every one of them again regardless, because a form can be posted without ever
 * loading this file.
 */

/**
 * The per-source labels, keyed by the provider id the endpoint takes.
 *
 * `_table.test.tsx` asserts every provider in `TYPED_PROVIDERS` has the labels its lane needs, so a
 * source added to the mirror without copy fails a test rather than rendering blank labels.
 */
const FIELD_COPY: Record<
  string,
  {
    readonly accountLabel: string;
    readonly accountHint: string;
    readonly credentialHint: string;
    readonly keyLabel?: string;
    readonly secretLabel?: string;
    readonly tokenLabel?: string;
  }
> = {
  woocommerce: CONNECTIONS.fields.woocommerce,
  meta_ads: CONNECTIONS.fields.meta_ads,
};

/**
 * The same bound `MAX_EXTERNAL_ACCOUNT_ID` applies at the endpoint, where it is enforced. Here it
 * only stops a paste of something that is plainly not an account identifier before it travels.
 */
const ACCOUNT_MAX = 200;

const LABEL = "text-ink block text-sm font-bold";
const INPUT =
  "border-line text-ink focus-visible:outline-accent mt-2 min-h-[46px] w-full rounded-md border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[3px]";
const HINT = "text-ink-subtle mt-2 text-xs leading-relaxed";

export function ConnectForm() {
  const [state, submit, pending] = useActionState<ConnectState, FormData>(createConnection, {});
  const first = TYPED_PROVIDERS[0];
  const [providerId, setProviderId] = useState<string>(state.provider ?? first?.id ?? "");

  const providerField = useId();
  const accountField = useId();
  const keyField = useId();
  const secretField = useId();
  const tokenField = useId();
  const expiryField = useId();

  const provider = typedProvider(providerId);
  const copy = FIELD_COPY[providerId];

  if (state.connected === true) {
    return (
      <div>
        <p className="text-ink font-bold">{CONNECTIONS.successHeading}</p>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">{CONNECTIONS.successBody}</p>
        {/* A LINK AND NOT A RESET BUTTON: navigating re-runs the page on the server, so the list
            above is re-read through RLS and the form arrives empty rather than being cleared by
            hand here. The href carries nothing. */}
        <Link
          href="/connections"
          className="border-line text-ink hover:bg-surface-inset mt-6 inline-flex min-h-[46px] items-center rounded-md border px-5 text-sm font-bold transition-colors"
        >
          {CONNECTIONS.connectAnother}
        </Link>
      </div>
    );
  }

  if (provider === null || copy === undefined) return null;

  return (
    <form action={submit}>
      <label htmlFor={providerField} className={LABEL}>
        {CONNECTIONS.providerLabel}
      </label>
      <select
        id={providerField}
        name="provider"
        value={providerId}
        onChange={(event) => setProviderId(event.target.value)}
        className={INPUT}
      >
        {TYPED_PROVIDERS.map((option) => (
          <option key={option.id} value={option.id}>
            {CONNECTIONS.providerNames[option.id] ?? option.id}
          </option>
        ))}
      </select>

      <label htmlFor={accountField} className={`${LABEL} mt-6`}>
        {copy.accountLabel}
      </label>
      <input
        id={accountField}
        name="external_account_id"
        required
        maxLength={ACCOUNT_MAX}
        defaultValue={state.account}
        autoComplete="off"
        spellCheck={false}
        className={INPUT}
      />
      <p className={HINT}>{copy.accountHint}</p>

      {provider.lane === "key_secret" ? (
        <>
          <label htmlFor={keyField} className={`${LABEL} mt-6`}>
            {copy.keyLabel}
          </label>
          <input
            id={keyField}
            name="key"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />
          <label htmlFor={secretField} className={`${LABEL} mt-6`}>
            {copy.secretLabel}
          </label>
          <input
            id={secretField}
            name="secret"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />
        </>
      ) : (
        <>
          <label htmlFor={tokenField} className={`${LABEL} mt-6`}>
            {copy.tokenLabel}
          </label>
          <input
            id={tokenField}
            name="token"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />

          <fieldset className="border-line mt-6 rounded-md border p-4">
            <legend className="text-ink px-2 text-sm font-bold">{CONNECTIONS.expiryLegend}</legend>
            <label className="text-ink-muted flex items-center gap-3 text-sm">
              <input type="radio" name="expiry" value="never" />
              {CONNECTIONS.expiryNever}
            </label>
            <label className="text-ink-muted mt-3 flex items-center gap-3 text-sm">
              <input type="radio" name="expiry" value="on" />
              {CONNECTIONS.expiryOn}
            </label>
            <label htmlFor={expiryField} className="text-ink-subtle mt-3 block text-xs">
              {CONNECTIONS.expiryDateLabel}
            </label>
            <input id={expiryField} name="expires_on" type="date" className={INPUT} />
            <p className={HINT}>{CONNECTIONS.expiryNote}</p>
          </fieldset>
        </>
      )}

      <p className={HINT}>{copy.credentialHint}</p>

      {state.error === undefined ? null : (
        <p role="alert" className="text-accent-hover mt-6 text-xs font-bold leading-relaxed">
          {state.error}
          {state.reference === undefined ? null : (
            <span className="text-ink-subtle mt-2 block font-mono font-normal">
              {CONNECTIONS.referenceLabel} {state.reference}
            </span>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-ink-on-accent hover:bg-accent-hover mt-6 min-h-[46px] w-full rounded-md px-5 text-sm font-bold transition-colors disabled:opacity-60"
      >
        {pending ? CONNECTIONS.pending : CONNECTIONS.submit}
      </button>

      <p className={HINT}>{CONNECTIONS.formNote}</p>
    </form>
  );
}
