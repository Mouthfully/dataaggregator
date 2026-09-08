/**
 * SIGNING A RESTATEMENT WEBHOOK.
 *
 * A webhook is the first thing in this system that sends a customer's data to a URL rather than
 * answering a request for it, so the receiver has a problem the read API never had: anyone can POST
 * to a public endpoint. The signature is how they tell our delivery from someone else's.
 *
 * THE SECRET IS DERIVED, NEVER STORED. `deriveSecret` computes an endpoint's secret from a service
 * key plus the endpoint's id and its `secret_version`, so no signing material exists in the
 * database at all -- a backup, a read replica or a support export carries none. The service key
 * therefore lives only where the delivery worker runs, and `secret_version` exists so one
 * customer's endpoint can be rotated without rotating everyone's.
 *
 * THE TIMESTAMP IS INSIDE THE SIGNATURE, which is what makes it worth anything. Signing the body
 * alone produces a token that is valid forever: anyone who captures one delivery can replay it at
 * any time and the signature still verifies. Signing `timestamp.body` and rejecting a timestamp
 * outside a tolerance window bounds that to the window. The scheme is Stripe's, because receivers
 * already have code for it and a novel scheme would be a novel way to be wrong.
 */

const encoder = new TextEncoder();

/** How far a delivery's timestamp may be from the receiver's clock. Five minutes, both directions. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const SIGNATURE_HEADER = "x-signature";
export const EVENT_ID_HEADER = "x-event-id";

/**
 * Deliberately generic header names.
 *
 * A product name in a header is a string every customer writes into their own code, and this one is
 * not settled (11A.10). The brand guard has already caught the name in a cryptographic AAD and a
 * database role, and a header would be the same mistake in the one place it is hardest to change:
 * someone else's codebase.
 */

export interface CryptoLike {
  subtle: Pick<SubtleCrypto, "importKey" | "sign">;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, message: string, crypto: CryptoLike): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key as CryptoKey, encoder.encode(message)));
}

/**
 * The signing secret for one endpoint.
 *
 * The version is part of the derivation rather than beside it: bumping it produces a different
 * secret, so the previous one stops verifying immediately. That is what rotation has to mean.
 */
export async function deriveSecret(
  serviceKey: string,
  endpointId: string,
  secretVersion: number,
  crypto: CryptoLike = globalThis.crypto,
): Promise<string> {
  if (serviceKey.length === 0) {
    throw new Error("webhooks: refusing to derive a signing secret from an empty service key");
  }
  if (!Number.isInteger(secretVersion) || secretVersion < 1) {
    throw new Error(`webhooks: secretVersion must be a positive integer, got ${secretVersion}`);
  }
  return await hmac(serviceKey, `${endpointId}:${secretVersion}`, crypto);
}

/** `t=<unix seconds>,v1=<hex hmac of "t.body">`. */
export async function signPayload(options: {
  secret: string;
  body: string;
  timestamp: Date;
  crypto?: CryptoLike;
}): Promise<string> {
  const t = Math.floor(options.timestamp.getTime() / 1000);
  const signature = await hmac(
    options.secret,
    `${t}.${options.body}`,
    options.crypto ?? globalThis.crypto,
  );
  return `t=${t},v1=${signature}`;
}

/**
 * Constant-time string comparison.
 *
 * A second copy of `timingSafeEqual` from @repo/oauth, and the duplication is deliberate: the
 * alternative is for the webhook delivery path to depend on the OAuth package, which would couple
 * two unrelated concerns to share five lines whose behaviour cannot drift.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a delivery. Shipped so a receiver has a reference implementation and so the tests can
 * assert what a receiver would actually see, rather than what the signer believes it produced.
 */
export async function verifySignature(options: {
  secret: string;
  body: string;
  header: string;
  now: Date;
  toleranceSeconds?: number;
  crypto?: CryptoLike;
}): Promise<boolean> {
  const parts = new Map(
    options.header.split(",").map((part) => {
      const at = part.indexOf("=");
      return at === -1
        ? ([part.trim(), ""] as const)
        : ([part.slice(0, at).trim(), part.slice(at + 1).trim()] as const);
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (t === undefined || v1 === undefined || t === "" || v1 === "") return false;

  const seconds = Number(t);
  if (!Number.isFinite(seconds)) return false;

  const tolerance = options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  const skew = Math.abs(Math.floor(options.now.getTime() / 1000) - seconds);
  if (skew > tolerance) return false;

  const expected = await hmac(
    options.secret,
    `${t}.${options.body}`,
    options.crypto ?? globalThis.crypto,
  );
  return timingSafeEqual(expected, v1);
}
