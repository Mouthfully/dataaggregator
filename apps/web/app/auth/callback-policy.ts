import { checkWorkEmail } from "../_work-email";

/**
 * THE TWO DECISIONS THE OAUTH CALLBACK MAKES, PULLED OUT OF THE ROUTE SO THEY CAN BE TESTED.
 *
 * `auth/callback/route.ts` cannot be unit tested without standing up a Supabase client and a
 * cookie store, so for as long as these rules lived inside it they were asserted by nobody. The
 * work-email restriction in particular is the kind of rule that is either enforced or decorative,
 * and "decorative" is indistinguishable from "enforced" by reading the route. Hence this module:
 * the route keeps the I/O, this keeps the judgement, and `callback-policy.test.ts` holds it to it.
 *
 * WHY THE EMAIL IS JUDGED BEFORE THE DESTINATION. A refused account has no destination -- reading
 * `next` first and then refusing would be harmless today but invites a later edit that honours the
 * destination on a path that has not yet decided whether the person is allowed in at all.
 */

/**
 * WHAT MAY BE PUT IN FRONT OF `new URL(next, origin)`.
 *
 * `new URL()` resolves an absolute or protocol-relative reference against nothing, so an
 * unvalidated `next` turns this app's own sign-in into an open redirect a phishing mail can point
 * at. `app/api/gate/route.ts` already refuses `//evil.example` for the pre-launch gate and this is
 * the same rule, made stricter on one point that matters:
 *
 * A BACKSLASH IS NOT A PATH SEPARATOR IN A URL, IT IS A SLASH. WHATWG URL parsing normalises `\`
 * to `/` for special schemes, so `/\evil.example` resolves to `https://evil.example/` -- verified
 * against Node's `URL` -- while passing a `^\/(?!\/)` test unharmed. Refusing the backslash
 * outright is the cheap half of this rule and the half that a slash-only check misses.
 *
 * Control characters are refused for the same family of reason: a stripped CR or LF changes what
 * the parser sees, and nothing legitimate puts one in a path.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to reject control bytes.
const SAFE_NEXT = /^\/(?![/\\])[^\\\x00-\x20\x7f]*$/;

/** Where a person lands when they arrived with no destination, or an unusable one. */
export const DEFAULT_NEXT = "/dashboard";

export function safeNext(raw: string | null | undefined): string {
  return raw && SAFE_NEXT.test(raw) ? raw : DEFAULT_NEXT;
}

export type CallbackDecision =
  | { readonly kind: "allow"; readonly next: string }
  | { readonly kind: "refuse"; readonly error: "work_email" };

/**
 * THE WORK-EMAIL RULE, APPLIED TO AN IDENTITY THAT ALREADY EXISTS.
 *
 * The email lane judges the address before the link is sent; the Google lane cannot, because the
 * address does not exist until the provider hands it back. Same `checkWorkEmail`, later moment.
 * The provider is not the policy -- a Workspace account on a company domain passes and a personal
 * @gmail.com does not, which is exactly what the email lane already says.
 *
 * AN ABSENT ADDRESS IS A REFUSAL, NOT A PASS. A provider that returns no email leaves nothing to
 * judge, and the house rule is to refuse rather than default: `checkWorkEmail("")` refuses, so the
 * empty case needs no branch of its own and cannot be lost in a later edit of one.
 */
export function callbackDecision(
  email: string | null | undefined,
  rawNext: string | null | undefined,
): CallbackDecision {
  if (!checkWorkEmail(email ?? "").ok) return { kind: "refuse", error: "work_email" };
  return { kind: "allow", next: safeNext(rawNext) };
}
