/**
 * The provider registry.
 *
 * Bring-your-own-credential is not a preference here, it is what the platforms require. Google's
 * developer policy forbids letting third parties "avoid applying for their own Google Ads developer
 * access and Google Cloud Platform project"; Meta requires tech providers to process data solely on
 * behalf of each client, siloed (specification sections 3.5 and 11.2). So every scope below is
 * READ-ONLY, and every grant belongs to one workspace.
 *
 * Scope minimalism is also an access-timeline decision, not only a security one. Google's
 * sensitive-scope verification is the unbounded step in the whole plan -- documented at three to five
 * days, observed at over ten weeks (section 3.5) -- and it is scoped to what you ask for. Asking for
 * a write scope "for later" would put the entire launch behind a review nothing yet needs.
 */

export type ProviderId = "google" | "meta";

/** Which of the specification's sources a single grant can serve. */
export type SourceId = "google_ads" | "ga4" | "search_console" | "meta_ads";

export interface ScopeSpec {
  readonly scope: string;
  readonly source: SourceId;
  readonly reason: string;
  /**
   * Whether the platform classes this as sensitive or restricted, which is what triggers the slow
   * review. `"unconfirmed"` is used rather than a guess where the research could not establish it.
   */
  readonly sensitivity: "sensitive" | "standard" | "unconfirmed";
}

export interface ProviderConfig {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly scopes: readonly ScopeSpec[];
  /** Extra authorisation parameters this provider needs. */
  readonly extraAuthParams: Readonly<Record<string, string>>;
  /** Whether a refresh token is issued, and therefore whether re-consent is ever needed. */
  readonly issuesRefreshToken: boolean;
  readonly notes: readonly string[];
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  google: {
    id: "google",
    displayName: "Google",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      {
        scope: "https://www.googleapis.com/auth/adwords",
        source: "google_ads",
        reason: "Read campaign, ad group, ad and keyword performance.",
        sensitivity: "sensitive",
      },
      {
        scope: "https://www.googleapis.com/auth/analytics.readonly",
        source: "ga4",
        reason: "Read GA4 reports: sessions, channels, landing pages, conversions.",
        sensitivity: "sensitive",
      },
      {
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        source: "search_console",
        reason: "Read Search Console query, page and position data.",
        // Specification section 3.5, open question: this scope is not listed on Google's OAuth
        // scopes page, so whether it falls behind the same unbounded review as the other two is
        // unestablished. If it does, Search Console may not make the launch connector list.
        sensitivity: "unconfirmed",
      },
    ],
    extraAuthParams: {
      // Without both of these Google issues a refresh token only on the FIRST authorisation for a
      // given client and account. A customer who reconnects then gets an access token that expires
      // in an hour and no way to renew it, and the connection dies silently overnight.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    issuesRefreshToken: true,
    notes: [
      "Daily operation limits are per DEVELOPER TOKEN, not per account: Explorer 2,880, Basic 15,000, Standard unlimited (specification section 11.7).",
      "Sensitive-scope verification is unbounded. Documented at 3-5 days, observed at over ten weeks. Self-serve signup gates on the outcome, not on the roadmap.",
      "While verification is pending the OAuth client is in testing mode and only allow-listed test users can complete the flow. The Connect screen must say so rather than showing a generic failure.",
    ],
  },

  meta: {
    id: "meta",
    displayName: "Meta",
    authorizationEndpoint: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenEndpoint: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      {
        scope: "ads_read",
        source: "meta_ads",
        reason: "Read ad account, campaign, ad set and ad insights.",
        sensitivity: "sensitive",
      },
    ],
    extraAuthParams: {},
    // Meta issues long-lived tokens (about 60 days) rather than refresh tokens, so a connection
    // needs re-authorisation on a schedule rather than a silent renewal. connections.expires_at is
    // what the health check watches, and the difference is why it is a column rather than derived.
    issuesRefreshToken: false,
    notes: [
      "Requires Business Verification plus App Review for ads_read, typically weeks 3-8 (specification section 3.5).",
      "Full Access needs 500+ calls in 15 days at under 15% errors on the rolling last 500.",
      "Platform Terms 5.b.ii.2 requires per-Client separation and an up-to-date client list. workspaces.client_name and client_contact carry that record.",
      "Long-lived tokens expire in about 60 days: this is re-authorisation, not refresh.",
    ],
  },
};

/** The scopes to request for a given set of sources. Nothing wider is ever asked for. */
export function scopesFor(provider: ProviderId, sources: readonly SourceId[]): string[] {
  return PROVIDERS[provider].scopes.filter((s) => sources.includes(s.source)).map((s) => s.scope);
}

/** Which provider serves a source. */
export function providerFor(source: SourceId): ProviderId {
  return source === "meta_ads" ? "meta" : "google";
}
