/**
 * THE CUSTOMER'S OWN SUPABASE ACCESS TOKEN, VERIFIED IN THE ISOLATE.
 *
 * `/v1/connections` is the first endpoint in this repository authenticated by a HUMAN rather than
 * by a credential this company issued. `/v1/performance` takes an `mp_live_…` key and resolves it
 * to one workspace; `/v1/ingest/run` takes an operator secret. Neither shape fits here: a person
 * connecting their own platform account belongs to a workspace through `members`, may belong to
 * several, and the question "may this person write here" is one only the database can answer.
 *
 * SO THIS FILE ANSWERS A SMALLER QUESTION: IS THIS A LIVE SESSION FOR A REAL PERSON. It reads no
 * workspace, resolves no membership and decides no access. `app.can_write_workspace()` does all
 * three, inside the `connections_insert` policy, on the insert itself -- which is the repository's
 * first principle and the reason this module is deliberately short.
 *
 * WHY VERIFY AT ALL, WHEN POSTGREST VERIFIES THE SAME TOKEN ONE STEP LATER. Because the step in
 * between is the seal. The endpoint takes a credential the customer typed, wraps it under
 * `CREDENTIAL_KEK` and only then writes; a token rejected by PostgREST would be rejected AFTER a
 * secret had been unwrapped from a request body, held in the isolate and encrypted under the one
 * key that protects every customer's platform access. Refusing here means an unauthenticated
 * request never reaches the vault at all.
 *
 * IT COSTS NO ROUND TRIP, AND THAT IS NOT LUCK. Supabase signs a user's access token with the
 * project's JWT secret -- the same HS256 material `SUPABASE_JWT_SECRET` already holds so that
 * PostgREST accepts the tokens `@repo/store` mints. One secret, two directions: that package signs
 * with it, this one verifies with it.
 *
 * THREE REFUSALS, AND EACH IS A KNOWN WAY THIS GOES WRONG.
 *
 *   THE ALGORITHM IS PINNED. A verifier that reads `alg` out of the header and obeys it accepts
 *   `{"alg":"none"}` from anyone, and accepts an RS256 token whose "signature" is an HMAC under the
 *   public key. Both are the textbook JWT failures and both are silent. HS256 is the only algorithm
 *   this project issues, so it is the only one read.
 *
 *   `exp` IS REQUIRED, NOT OPTIONAL. A token with no expiry is a permanent credential, and treating
 *   a missing claim as "does not expire" would turn one leaked token into forever.
 *
 *   `sub` IS REQUIRED, AND THAT REFUSES THIS WORKER'S OWN MINTED TOKENS. The token minted from an
 *   API key carries `role: authenticated` and a `workspace_id` and deliberately NO `sub`, because
 *   `app.can_write_workspace()` refuses outright when `app.current_user_id()` is null -- that
 *   absence is what stops a stolen read key re-pointing a connection. Such a token would be refused
 *   by the policy anyway; refusing it here means it is refused BEFORE a credential is sealed, and
 *   with a sentence that says why rather than a bare 403 from PostgREST.
 *
 * THE TOKEN NEVER APPEARS IN A MESSAGE. Not truncated, not fingerprinted. It is a bearer credential
 * for a live session, and every string this module produces was written here.
 */

/**
 * The slice of WebCrypto this module uses, declared structurally.
 *
 * Same reason `@repo/vault` declares its own: the handle type differs between runtimes, and naming
 * the operations is more honest than widening a tsconfig until a global appears. `hash` is part of
 * the algorithm object here because `importKey` for HMAC needs it, which is why this is not simply
 * `@repo/vault`'s `CryptoLike`.
 */
export interface AccessTokenCrypto {
  subtle: {
    importKey(
      format: "raw",
      keyData: ArrayBufferView,
      algorithm: { name: string; hash: string },
      extractable: boolean,
      keyUsages: readonly string[],
    ): Promise<object>;
    verify(
      algorithm: string,
      key: object,
      signature: ArrayBufferView,
      data: ArrayBufferView,
    ): Promise<boolean>;
  };
}

/**
 * Why a token was refused.
 *
 * FLAT, AND ALL OF THEM ANSWERED WITH THE SAME 401, for the reason `/v1/performance` gives: a
 * caller learning that its token was well formed but expired, rather than merely wrong, is a caller
 * being told how close it got. The discriminant exists so this repository's own tests can assert
 * WHICH check fired -- a suite that only ever sees "unauthorized" cannot tell a signature check
 * working from a signature check deleted.
 */
export type AccessTokenRefusal =
  /** No `Authorization: Bearer …` header at all. */
  | "missing"
  /** Not three base64url segments, or not JSON inside them. */
  | "malformed"
  /** The header names an algorithm this project does not issue. */
  | "unsupported_algorithm"
  /** The signature is not this project's. */
  | "bad_signature"
  /** `exp` is absent, unreadable, or in the past. */
  | "expired"
  /**
   * Well-signed and live, and not a person: no `sub`, or a `role` other than `authenticated`.
   * This Worker's own minted tokens land here, which is the point.
   */
  | "not_a_user";

export class AccessTokenError extends Error {
  constructor(
    message: string,
    readonly refusal: AccessTokenRefusal,
  ) {
    super(message);
    this.name = "AccessTokenError";
  }
}

/** What a verified token establishes. One field, because one field is all it establishes. */
export interface VerifiedAccessToken {
  /** `sub`. The person, as Supabase's auth schema knows them. Never a workspace. */
  readonly userId: string;
  /** `exp`, in seconds. Returned so a caller can assert the TTL rather than assume one. */
  readonly expiresAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const BEARER = /^bearer[ \t]+(.+)$/i;

/**
 * Pull the credential out of an `Authorization` header, or say it is absent.
 *
 * Same expression and same reason as `/v1/ingest/run`'s: the scheme is case-insensitive per
 * RFC 7235, and a tab is legal whitespace after it.
 */
export function bearerToken(authorization: string | null): string | null {
  const matched = BEARER.exec((authorization ?? "").trim());
  const token = matched?.[1]?.trim();
  return token === undefined || token === "" ? null : token;
}

/**
 * base64url, decoding. The mirror of `@repo/store`'s `base64url` encoder, and not importable from
 * it because that package exports only the encoding direction.
 *
 * The padding is re-added rather than omitted: `atob` refuses a string whose length is not a
 * multiple of four, and a JWT segment is stripped of `=` by definition.
 */
function decodeSegment(segment: string, part: string): Uint8Array {
  const standard = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new AccessTokenError(
      `the token's ${part} is not base64url. Send the Supabase access token from the customer's ` +
        "own session, unmodified.",
      "malformed",
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string, part: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(decodeSegment(segment, part)));
  } catch (error) {
    if (error instanceof AccessTokenError) throw error;
    throw new AccessTokenError(`the token's ${part} is not JSON`, "malformed");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AccessTokenError(`the token's ${part} is not a JSON object`, "malformed");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Verify one access token, or refuse.
 *
 * `now` is a parameter rather than a call to the clock for `mintToken`'s reason: an expiry checked
 * against an untestable clock is an expiry nobody has checked.
 */
export async function verifyAccessToken(
  token: string,
  options: {
    /** The project's JWT secret. The same binding `@repo/store` signs with. */
    readonly secret: string;
    readonly now: Date;
    readonly crypto: AccessTokenCrypto;
  },
): Promise<VerifiedAccessToken> {
  if (options.secret.length === 0) {
    // Refused rather than verified against nothing. An HMAC under an empty key verifies perfectly
    // well, and every deployment sharing the mistake would accept every other deployment's tokens
    // -- the same failure `mintToken` refuses at the signing end.
    throw new Error("connect: refusing to verify a token against an empty signing secret");
  }

  const parts = token.split(".");
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  if (
    parts.length !== 3 ||
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signatureSegment === undefined
  ) {
    throw new AccessTokenError(
      "that is not a JSON Web Token. Send the customer's Supabase access token as " +
        "`Authorization: Bearer <token>`.",
      "malformed",
    );
  }

  const header = decodeJson(headerSegment, "header");
  if (header.alg !== "HS256") {
    // NOT "whatever the header says". See the module note: obeying `alg` is how a verifier comes to
    // accept `none`, and how an RS256 token gets verified as an HMAC under a public key.
    throw new AccessTokenError(
      `this deployment verifies HS256 tokens and that header says ${JSON.stringify(header.alg)}. ` +
        "The algorithm is not read from the token.",
      "unsupported_algorithm",
    );
  }

  const key = await options.crypto.subtle.importKey(
    "raw",
    encoder.encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // `subtle.verify` rather than a comparison of two strings: it is constant-time by construction,
  // which is the same property `tokenMatches` spells out by hand for the ingest secret.
  const signed = await options.crypto.subtle.verify(
    "HMAC",
    key,
    decodeSegment(signatureSegment, "signature"),
    encoder.encode(`${headerSegment}.${payloadSegment}`),
  );
  if (!signed) {
    throw new AccessTokenError("that token was not signed by this project", "bad_signature");
  }

  // AFTER the signature, never before. Claims from an unverified token are an attacker's JSON, and
  // a refusal phrased from them tells the attacker which claim to forge next.
  const payload = decodeJson(payloadSegment, "payload");

  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    throw new AccessTokenError(
      "that token carries no `exp`. A session credential with no expiry is a permanent one.",
      "expired",
    );
  }
  if (exp * 1000 <= options.now.getTime()) {
    throw new AccessTokenError("that token has expired. Sign in again.", "expired");
  }

  if (payload.role !== "authenticated") {
    throw new AccessTokenError("that token is not a signed-in customer's session.", "not_a_user");
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || sub === "") {
    // The minted API-key token is exactly this shape, deliberately. See the module note.
    throw new AccessTokenError(
      "that token names no user, so `app.can_write_workspace()` would refuse it. Creating a " +
        "connection is an account action and takes a signed-in customer's session, not an API key.",
      "not_a_user",
    );
  }

  return { userId: sub, expiresAt: exp };
}
