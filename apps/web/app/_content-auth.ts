/**
 * Copy for the sign-in screen. Held out of the JSX for the reason `_content.ts` records: the copy
 * guard refuses a JSX text node of five or more words ending in terminal punctuation, and holding
 * the sentences in one module makes the whole surface of what the product says reviewable in a
 * single pass.
 */
export const AUTH = {
  eyebrow: "Sign in",
  heading: "Your data, made plain.",
  lead: "Use your company email address. Personal mailboxes are not accepted.",
  googleCta: "Continue with Google",
  divider: "or",
  emailLabel: "Work email",
  emailPlaceholder: "you@yourcompany.com",
  emailHint: "We will send a sign-in link. No password to remember.",
  submit: "Continue with email",
  terms: "By continuing you agree to be contacted about your account.",
  switchPrompt: "Already have an account?",
  switchAction: "Sign in",
  notConfigured:
    "Sign-in is not configured on this deployment. Set the Supabase URL and anon key and redeploy.",
  submitPending: "Sending…",
  sentHeading: "Check your inbox.",
  sentBody: "We sent a sign-in link. It works once and expires shortly.",
  errorProvider: "Google sign-in is unavailable right now. Try the email link instead.",
  errorExchange: "That sign-in link did not work. Request a new one.",
  errorWorkEmail: "That account is a personal mailbox. Sign in with your company address.",
  errorMissingCode: "That sign-in link is incomplete. Request a new one.",
} as const;
