/**
 * THE PRE-LAUNCH GATE'S TOKEN.
 *
 * The site is not public yet. A shared password unlocks it; everyone else sees the waiting list.
 *
 * THE PASSWORD IS NEVER PUT IN A COOKIE. What is stored is an HMAC of a fixed label under the
 * password as key -- one-way, so a stolen cookie does not yield the password, and deterministic, so
 * no session store is needed to recognise a returning visitor. Changing the password invalidates
 * every existing cookie by construction, which is what a shared password needs when it leaks.
 *
 * THIS IS A CURTAIN, NOT A VAULT, and saying so is the point. It keeps an unfinished product off
 * the open web and out of search results. It is one shared secret with no per-person identity, so
 * it is not an access control for anything that matters -- the signed-in routes have their own,
 * through Supabase Auth and row-level security, and none of that is replaced by this.
 */

/**
 * The domain separation label, and deliberately NOT the product name.
 *
 * It is baked into every cookie this gate ever issues, so a rename would invalidate all of them at
 * once. `packages/vault/src/vault.ts` took the same decision for the same reason and says it best:
 * a name in here "would be a latent data migration disguised as a string literal". The brand guard
 * enforces it independently, and caught this line when it did name the product.
 */
const LABEL = "preview-gate:v1";

export const GATE_COOKIE = "up_preview";

const encoder = new TextEncoder();

/** Base64url of the HMAC. Base64url, not base64: a cookie value may not contain `+`, `/` or `=`. */
export async function gateToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(LABEL));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Constant-time comparison.
 *
 * ONE EXIT, no early return. `a === b` on a secret is a timing oracle: it stops at the first
 * differing byte, so the time it takes reveals how much of a guess was right. The same property is
 * asserted structurally on the Worker's own token compare, for the same reason.
 */
export function tokensMatch(presented: string, expected: string): boolean {
  const a = encoder.encode(presented);
  const b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}

/** Whether the gate is switched on at all. No password set means the site is simply public. */
export function isGated(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SITE_PASSWORD);
}
