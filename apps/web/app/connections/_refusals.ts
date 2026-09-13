import { CONNECTIONS } from "../_content";

/**
 * THE REFUSAL TABLE, IN ITS OWN MODULE FOR A MECHANICAL REASON: `actions.ts` carries the
 * `"use server"` directive, and a file with that directive may export nothing but async functions.
 * A constant exported from beside the action fails `next build`, which is the last step before
 * deploy. It also lets the test import the table without importing the action.
 */

/**
 * A MESSAGE FOR EVERY CODE THE ENDPOINT CAN ANSWER WITH, which is the point of the table.
 *
 * `handleConnect` returns six `ConnectRefusal` codes, `handleConnections` adds `not_configured` when
 * a binding is missing, `writeFailure` adds `unauthorized`, `forbidden`, `already_connected` and
 * `upstream_unavailable`, and the method and JSON guards add two more. Collapsing any of them into a
 * single "something went wrong" is precisely the failure this screen exists to avoid: a customer who
 * cannot tell a wrong key from a broken server emails support either way.
 *
 * `_refusals.test.ts` asserts this table covers every code the endpoint's own source can emit --
 * read off `connect.ts` and `index.ts` -- so a refusal added there fails a test here rather than
 * falling through to the generic sentence.
 *
 * THE UPSTREAM `message` IS DELIBERATELY DISCARDED. Those sentences are written for whoever is
 * holding the API -- they name `credential_lane`, `connections_insert` and `CREDENTIAL_KEK` -- and
 * one of them quotes the caller's own `external_account_id` back. What a customer reads is ours.
 */
export const ENDPOINT_MESSAGES: Record<string, string> = {
  unauthorized: CONNECTIONS.errors.unauthorized,
  forbidden: CONNECTIONS.errors.forbidden,
  already_connected: CONNECTIONS.errors.already_connected,
  bad_request: CONNECTIONS.errors.bad_request,
  unknown_provider: CONNECTIONS.errors.unknown_provider,
  unsupported_lane: CONNECTIONS.errors.unsupported_lane,
  invalid_credential: CONNECTIONS.errors.invalid_credential,
  credential_expired: CONNECTIONS.errors.credential_expired,
  bad_kek: CONNECTIONS.errors.bad_kek,
  not_configured: CONNECTIONS.errors.not_configured,
  upstream_unavailable: CONNECTIONS.errors.upstream_unavailable,
  // Both mean this file sent something malformed, which is a bug here and not a mistake the
  // customer made. Saying "check your details" would send them to look at a correct form.
  invalid_request: CONNECTIONS.errors.clientFault,
  method_not_allowed: CONNECTIONS.errors.clientFault,
};

/** The sentence for an endpoint code, or the one that admits this screen does not recognise it. */
export function messageFor(code: unknown): string {
  if (typeof code !== "string") return CONNECTIONS.errors.unexpected;
  return ENDPOINT_MESSAGES[code] ?? CONNECTIONS.errors.unexpected;
}
