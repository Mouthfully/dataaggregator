import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The endpoint's own refusal union, imported from its source. See `_providers.test.ts` for why a
// relative path into another workspace package is what a test may do and shipped code may not.
import { REFUSAL_STATUS } from "../../../api-edge/src/connect.ts";
import { CONNECTIONS } from "../_content";
import { ENDPOINT_MESSAGES, messageFor } from "./_refusals";

const CONNECT_SOURCE = new URL("../../../api-edge/src/connect.ts", import.meta.url);
const INDEX_SOURCE = new URL("../../../api-edge/src/index.ts", import.meta.url);

/**
 * EVERY `error` CODE THE ENDPOINT CAN PUT IN A BODY, READ OFF THE ENDPOINT.
 *
 * Two sources, because the codes come from two places. `fail(status, error, message)` in
 * `connect.ts` emits the refusals and the write failures; `handleConnections` in `index.ts` emits
 * `not_configured` before `handleConnect` is ever called, when a binding is missing. A code added to
 * either and not given a sentence here would reach a customer as the generic "not one this screen
 * recognises" -- which is the exact failure the brief names, so it fails a test instead.
 */
function codesTheEndpointCanReturn(): readonly string[] {
  const source = readFileSync(CONNECT_SOURCE, "utf8");
  const found = new Set<string>();
  for (const match of source.matchAll(/\bfail\(\s*\d+,\s*"([a-z_]+)"/g)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  // Every member of the parsed union reaches `fail` through `REFUSAL_STATUS[error.refusal]`, which
  // the regex above cannot see: it is a variable, not a literal.
  for (const refusal of Object.keys(REFUSAL_STATUS)) found.add(refusal);
  return [...found];
}

describe("the connect screen answers every refusal the endpoint can return", () => {
  it("has a message for each code, and none of them is the generic one", () => {
    const codes = codesTheEndpointCanReturn();
    // A guard that found nothing is not a passing guard.
    expect(codes.length).toBeGreaterThan(5);

    for (const code of codes) {
      expect(ENDPOINT_MESSAGES[code], code).toBeTypeOf("string");
      expect(messageFor(code), code).not.toBe(CONNECTIONS.errors.unexpected);
    }
  });

  it("covers the 503 the Worker answers before the endpoint is reached", () => {
    // `handleConnections` refuses a deployment missing SUPABASE_URL, SUPABASE_ANON_KEY,
    // SUPABASE_JWT_SECRET or CREDENTIAL_KEK with this code and never calls `handleConnect`.
    expect(readFileSync(INDEX_SOURCE, "utf8")).toContain('error: "not_configured"');
    expect(messageFor("not_configured")).toBe(CONNECTIONS.errors.not_configured);
  });

  /**
   * A CUSTOMER MUST BE ABLE TO TELL A WRONG KEY FROM A BROKEN SERVER. Two codes sharing a sentence
   * would put them back in the position this screen exists to get them out of.
   */
  it("says something different for each code", () => {
    const messages = Object.values(ENDPOINT_MESSAGES);
    const shared = new Set(messages);
    // `invalid_request` and `method_not_allowed` deliberately share one sentence: both mean this
    // app sent something malformed, which is one fault with one fix and not the customer's.
    expect(shared.size).toBe(messages.length - 1);
  });

  it("admits it does not recognise anything else", () => {
    expect(messageFor("something_new")).toBe(CONNECTIONS.errors.unexpected);
    expect(messageFor(undefined)).toBe(CONNECTIONS.errors.unexpected);
    expect(messageFor(7)).toBe(CONNECTIONS.errors.unexpected);
  });
});
