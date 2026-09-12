/**
 * WHETHER THE GOOGLE BUTTON EXISTS AT ALL.
 *
 * THE FACT THIS MODULE IS BUILT AROUND: Google is not enabled in the live Supabase project.
 * `auth/v1/settings` reports `google: false`, so `signInWithOAuth({ provider: "google" })` is a 400
 * for every visitor who presses the button. A button that is always there is therefore worse than
 * no button -- it is the most prominent control on the page, it looks like the fast path, and it
 * fails after the click rather than before it.
 *
 * So the default is ABSENT, and the button is opt-in per deployment. Turning the provider on in
 * Supabase and setting this variable are two halves of one change; whoever does the first does the
 * second, and until then no Google button renders.
 *
 * NOT quite "the page is unchanged", which an earlier draft of this comment claimed. The
 * divider above the button used to render unconditionally; it is now inside the same
 * condition, because a separator with nothing on one side of it is worse than no separator.
 * So the disabled page is the old page minus that rule, not byte-for-byte the old page.
 *
 * ONLY AN EXPLICIT AFFIRMATIVE COUNTS, not mere presence. `NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED=false`
 * is what a person writes when they mean off, and a "set means on" reading would render the broken
 * button for precisely the deployer who was trying to avoid it. Refusing to guess costs a deployer
 * one glance at this list; guessing costs every visitor a 400.
 */
const AFFIRMATIVE = new Set(["1", "true", "yes", "on", "enabled"]);

/**
 * Read on the SERVER, at render time, and passed down as a prop -- never read inside the client
 * component. Next inlines `process.env.NEXT_PUBLIC_*` into a client bundle at BUILD time, so a
 * client-side read would mean flipping the variable in the deployment dashboard changes nothing
 * until someone happens to rebuild. The failure mode of that is a button that appears or vanishes
 * at an unrelated commit, which is the hardest kind of bug to attribute.
 */
export function isGoogleSignInEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return AFFIRMATIVE.has((env.NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED ?? "").trim().toLowerCase());
}
