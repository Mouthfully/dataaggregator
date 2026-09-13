"use server";

import { apiUrl } from "@repo/brand";
import { redirect } from "next/navigation";

import { supabaseServer } from "../_auth/server";
import { currentWorkspace } from "../_auth/workspace";
import { CONNECTIONS } from "../_content";
import { typedProvider } from "./_providers";
import { messageFor } from "./_refusals";

/**
 * THE CREDENTIAL'S ONE JOURNEY, AND EVERY PLACE IT IS NOT ALLOWED TO GO.
 *
 * This is the most sensitive code path in the web app: a customer's platform key arrives here in
 * the body of a POST and leaves in the body of another POST. Between those two moments it is a
 * local variable and nothing else.
 *
 *   IT IS NEVER STORED.   Nothing here writes to the database, to a file, or to a module-level
 *                         variable. The only persistence of this credential in the whole system is
 *                         the sealed blob `POST /v1/connections` writes, under a key this app does
 *                         not have.
 *   IT IS NEVER A COOKIE. Nothing here touches `cookies()` except through `supabaseServer()`, which
 *                         reads and refreshes the session and knows nothing about this form.
 *   IT IS NEVER LOGGED.   There is no `console` call in this file, deliberately -- not on the happy
 *                         path and not in a catch. An error object logged from the fetch below
 *                         would be one `cause` away from carrying the request body, and a log line
 *                         is the one place a secret survives with nobody's permission.
 *   IT IS NEVER IN A URL.  The action is a POST and its result is returned as state, never as a
 *                         redirect carrying parameters. A credential in a query string lands in
 *                         browser history, in every server access log on the way, and in the
 *                         `Referer` header of every request the next page makes.
 *   IT IS NEVER ECHOED BACK. `ConnectState` carries the provider and the account so the form can
 *                         keep its shape after a refusal, and carries neither the key, the secret
 *                         nor the token -- so no refusal path can put a credential back into HTML
 *                         that a browser or a proxy may cache.
 *
 * `actions.test.ts` asserts the last two against the real code rather than trusting this comment.
 *
 * WHY THE WEB APP DOES NOT SEAL, since that would remove the hop entirely: `CREDENTIAL_KEK` is the
 * one key that protects every customer's platform access, and it lives in the Worker. Putting it on
 * a second surface -- a different deploy target, a different log sink, a far larger dependency tree
 * -- to save a network call is the trade `apps/api-edge/src/connect.ts` opens by refusing. This app
 * collects and posts; the plaintext stops there.
 */

export interface ConnectState {
  /** One sentence from `CONNECTIONS.errors`. Never an upstream message; see `messageFor`. */
  readonly error?: string;
  /** The endpoint's request id, shown so support can find the same event. Not a secret. */
  readonly reference?: string;
  readonly connected?: boolean;
  /** Echoed so the form keeps the customer's choice. Neither of these is a credential. */
  readonly provider?: string;
  readonly account?: string;
}

/** Where a signed-out submission goes. A path, never a value from the request. */
const SIGN_IN = "/signin?next=%2Fconnections";

export async function createConnection(
  _previous: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  // THE SESSION IS SETTLED FIRST, before a single credential field is read off the body. A signed
  // out submission is sent to sign in without this code ever touching the string it carried.
  //
  // `getUser()` verifies the token with the auth server and `getSession()` then yields the raw
  // string to forward. Both, and in that order: the Worker verifies the signature, the expiry, the
  // role and the subject itself, and `app.can_write_workspace()` decides tenancy from the same
  // token -- so forwarding one read out of a cookie is safe. What the verification buys is a
  // refusal shaped like a sign-in page rather than a 401 round trip that carried a credential.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) redirect(SIGN_IN);

  // The workspace comes from the session's own readable rows, never from the form. It travels in
  // the body because a person may belong to several -- and what makes that safe is not this line
  // but `connections_insert`'s `with check (app.can_write_workspace(workspace_id))`, which refuses
  // the row at the moment of the write. A tampered id gets a 403 from the database, not from here.
  const workspace = await currentWorkspace();
  if (workspace.kind === "needsOrganisation") return { error: CONNECTIONS.errors.noWorkspace };
  if (workspace.kind !== "ready") return { error: CONNECTIONS.errors.workspaceUnavailable };

  const providerId = String(formData.get("provider") ?? "");
  const provider = typedProvider(providerId);
  if (provider === null) return { error: CONNECTIONS.errors.unknownProvider };

  const account = String(formData.get("external_account_id") ?? "").trim();
  if (account === "") {
    return { error: CONNECTIONS.errors.missingAccount, provider: providerId };
  }

  const shape = { provider: providerId, account };
  const body: Record<string, unknown> = {
    workspace_id: workspace.workspace.id,
    provider: provider.id,
    credential_lane: provider.lane,
    external_account_id: account,
  };

  if (provider.lane === "key_secret") {
    const key = String(formData.get("key") ?? "");
    const secret = String(formData.get("secret") ?? "");
    // Presence only. Whether the pair opens the store is the first read's answer, and a rule
    // invented here would refuse a legitimate key that happens not to match it.
    if (key.trim() === "" || secret.trim() === "") {
      return { error: CONNECTIONS.errors.missingKey, ...shape };
    }
    body.key = key;
    body.secret = secret;
  } else {
    const token = String(formData.get("token") ?? "");
    if (token.trim() === "") return { error: CONNECTIONS.errors.missingToken, ...shape };

    // THE EXPIRY IS ASKED AND NOT ASSUMED. `connectWithToken` reads a null `expires_at` as
    // PERMANENT and never as "we were not told", and `connectionHealth` answers from it -- so a
    // dated token posted with no expiry is reported as healthy on the morning it stops working.
    // A blank answer is therefore refused rather than defaulted.
    const expiry = String(formData.get("expiry") ?? "");
    const expiresOn = String(formData.get("expires_on") ?? "").trim();
    if (expiry === "on") {
      if (expiresOn === "") return { error: CONNECTIONS.errors.missingExpiry, ...shape };
      // The date is sent as typed, which the database reads as midnight UTC on that day. That is
      // EARLIER than the moment the platform kills the token, never later, so the connection is
      // called expired slightly early rather than reported healthy after it has died.
      body.expires_at = expiresOn;
    } else if (expiry === "never") {
      // A DATE TYPED BESIDE "never" IS A CONTRADICTION, NOT A STRAY VALUE, and the safe-looking
      // resolution -- take the radio, drop the date -- is the one that seals "permanent" over a
      // token somebody told us dies in January. Neither half is guessed; the question is asked
      // again.
      if (expiresOn !== "") return { error: CONNECTIONS.errors.contradictoryExpiry, ...shape };
      body.expires_at = null;
    } else {
      return { error: CONNECTIONS.errors.missingExpiry, ...shape };
    }
    body.token = token;
  }

  let endpoint: string;
  try {
    // Throws when neither `PUBLIC_API_URL` nor `brand.apiBaseUrl` is set, and deliberately refuses
    // to derive an origin from the site's own: a guessed URL would post a credential at the
    // marketing site rather than fail.
    endpoint = `${apiUrl(process.env)}/v1/connections`;
  } catch {
    return { error: CONNECTIONS.errors.notConfigured, ...shape };
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      // The credential is in here and this is the only place it is serialised. Nothing catches this
      // object afterwards, and nothing prints it.
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    // The thrown error is not read, not logged and not shown. The request may or may not have
    // reached the Worker, so the message says to look rather than claiming nothing happened.
    return { error: CONNECTIONS.errors.unreachable, ...shape };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: CONNECTIONS.errors.unexpected, ...shape };
  }

  const answer =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const reference = typeof answer.request_id === "string" ? answer.request_id : undefined;

  if (response.ok && answer.ok === true) {
    // No redirect, and nothing in a URL. Returning state re-renders this route on the server, so
    // the list below the form is re-read through RLS and the new row appears.
    return { connected: true, provider: providerId };
  }

  return {
    error: messageFor(answer.error),
    ...(reference === undefined ? {} : { reference }),
    ...shape,
  };
}
