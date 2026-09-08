/**
 * PKCE and CSRF state for the authorisation-code flow.
 *
 * The MCP auth specification makes PKCE mandatory (specification section 7), and it is the right
 * default for the dashboard's browser flows regardless: without it, an authorisation code
 * intercepted on the redirect is enough to obtain a token.
 *
 * As in packages/vault, `crypto` is a parameter rather than an ambient global. This code runs in the
 * Next app when a customer clicks Connect and in a Worker when a token is refreshed, and the two
 * runtimes type their WebCrypto differently.
 */

export interface CryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: {
    digest(algorithm: string, data: ArrayBufferView): Promise<ArrayBuffer>;
  };
}

/**
 * base64url, per RFC 7636. Not base64: the value travels in a URL, and `+`, `/` and `=` would each
 * need escaping, which providers handle inconsistently enough to be worth avoiding entirely.
 */
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64url(crypto: CryptoLike, byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export interface PkcePair {
  /** Kept server-side and presented at the token exchange. Never sent to the authorisation URL. */
  readonly verifier: string;
  /** Sent to the authorisation URL. The SHA-256 of the verifier, base64url encoded. */
  readonly challenge: string;
  readonly method: "S256";
}

/**
 * RFC 7636 requires the verifier to be 43-128 characters. 32 random bytes encode to 43, which is
 * the minimum; 64 bytes give 86 and cost nothing.
 */
export async function createPkcePair(crypto: CryptoLike): Promise<PkcePair> {
  const verifier = randomBase64url(crypto, 64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)), method: "S256" };
}

/**
 * The `state` parameter, which is CSRF protection rather than PKCE.
 *
 * The two are often conflated and are not interchangeable: PKCE stops an intercepted code being
 * redeemed, `state` stops an attacker starting a flow and having the victim's browser complete it,
 * which would attach the ATTACKER's platform account to the victim's workspace. For this product
 * that is the more damaging of the two -- it silently connects the wrong ad account to a tenant.
 */
export function createState(crypto: CryptoLike): string {
  return randomBase64url(crypto, 32);
}

/**
 * Constant-time comparison of the returned state against the stored one.
 *
 * Length is compared first and returns early, which does leak length; the values are fixed-length so
 * that reveals nothing. The loop is what matters: an early return on the first differing byte turns
 * verification into an oracle.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
