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

export type ProviderId = "google" | "meta" | "loyverse";

/** Which of the specification's sources a single grant can serve. */
export type SourceId = "google_ads" | "ga4" | "search_console" | "meta_ads" | "loyverse";

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

  // ---------------------------------------------------------------------------------------------
  // LOYVERSE -- THE FIRST PROVIDER WHERE THE PLATFORM OFFERED A SIMPLER CREDENTIAL AND IT WAS
  // REFUSED. That refusal is why this entry is long.
  //
  // Loyverse publishes TWO authorisation methods, and describes the easier one like this, verbatim:
  //
  //     "Personal access tokens are a simple way to make calls to the API. This authorization
  //      method suites best e.g. for periodically running scripts on data of your own account."
  //     "Be aware that personal access token gives unlimited access to the targeted account."
  //
  // One pasted string, no scopes, no issuer, no expiry, and by the platform's own sentence
  // UNLIMITED ACCESS -- which on this API includes `RECEIPTS_WRITE`, `ITEMS_WRITE`,
  // `INVENTORY_WRITE`, `TAXES_WRITE`, `SUPPLIERS_WRITE`, `CUSTOMERS_WRITE` and
  // `POS_DEVICES_WRITE`, every one of them read out of the permissions table in the same document.
  // It would have been the shortest connect flow in the repository: one text field, no client
  // registration, no redirect, no refresh. It is refused anyway, and `PROVIDER_LANES.loyverse` is
  // `["oauth"]` alone so the refusal is STRUCTURAL rather than conventional -- `connectWithToken`
  // rejects the provider outright.
  //
  // WHY THAT IS NOT MERELY CAUTIOUS. `58-plan-reconciliation.md` section 1.5 separates the sources
  // where read-only is enforced BY THE TOKEN from those where it is enforced BY OUR CODE, and puts
  // Loyverse in the first group precisely because of the granular `*_READ` scopes below. Taking the
  // personal access token would move Loyverse into the second group -- the group holding
  // QuickBooks, FlowAccount, GrabFood and StoreHub -- and it would do so while the product is
  // telling a cafe owner that this is the connector whose permissions are narrow. "We promise not
  // to call the write endpoints" is a different, weaker sentence, and the whole reason Loyverse is
  // the pilot source is that it does not require it.
  //
  // THE SCOPE SET IS TWO, AND IT IS NARROWER THAN THE PLAN'S. Section 2.2 names `RECEIPTS_READ`,
  // `SHIFTS_READ` and `STORES_READ`. Only the first is requested here, plus `MERCHANT_READ`, and
  // both absences are deliberate:
  //
  //   * `SHIFTS_READ` would fetch `expected_cash` vs `actual_cash` -- which section 2.2 itself
  //     calls the best "anything unusual" signal in the whole Loyverse surface and then says has
  //     NOWHERE TO LIVE in the envelope. No metric in the dictionary holds a cash variance. Asking
  //     a merchant to grant a scope for a number this system cannot store is asking for data with
  //     no consumer, which the scope-minimalism note at the top of this file forbids for write
  //     scopes and forbids no less for read ones.
  //   * `STORES_READ` returns a store's name, address, city, postal code and phone. Takings are
  //     computed without any of it -- the receipt already carries `store_id`, which is what
  //     `entity.parent_id` gets -- and the `Store` object has neither a currency nor a timezone,
  //     so it answers no question this connector has. It is address data about premises, requested
  //     for a label.
  //
  // `MERCHANT_READ` IS NOT PADDING AND IS NOT OPTIONAL. `dimensions.currency` is required on every
  // envelope row, and a Loyverse RECEIPT CARRIES NO CURRENCY: `total_money` is a bare number whose
  // own description says only that "The money amount format depends on country of account
  // registration". The single place the ISO 4217 code appears in the whole API is
  // `GET /merchant/`'s `currency.code`. Without this scope every monetary value would be labelled
  // with a guess, which is the failure `normalizeWooOrders` already refuses an order for. One
  // request per run buys the label.
  //
  // `OPENID` IS AVAILABLE AND IS NOT REQUESTED. It returns an id_token carrying the merchant's
  // email, business name and country. `GET /merchant/` already supplies the account id this
  // connector keys on, so OPENID would add identity data for nothing.
  // ---------------------------------------------------------------------------------------------
  loyverse: {
    id: "loyverse",
    displayName: "Loyverse",
    // Both quoted from the Authorization section of Loyverse's own OpenAPI document, not inferred.
    authorizationEndpoint: "https://api.loyverse.com/oauth/authorize",
    tokenEndpoint: "https://api.loyverse.com/oauth/token",
    scopes: [
      {
        scope: "RECEIPTS_READ",
        source: "loyverse",
        reason: "Read receipts: the day's takings, and the count of them.",
        // Self-serve. developer.loyverse.com/apps issues client_id and client_secret on the spot
        // and the merchant consents with their own Loyverse login. There is no review queue and
        // therefore no sensitivity tier to report -- unlike Google's and Meta's, this grant puts
        // nobody in front of a reviewer.
        sensitivity: "standard",
      },
      {
        scope: "MERCHANT_READ",
        source: "loyverse",
        reason:
          "Read the account's ISO 4217 currency code. A receipt carries no currency, and every " +
          "envelope row must name one.",
        sensitivity: "standard",
      },
    ],
    extraAuthParams: {},
    // `expires_in: 43200` -- twelve hours -- with a `refresh_token` beside it, and a documented
    // `grant_type=refresh_token` exchange at the same endpoint. An expired access token is
    // routine and self-healing here exactly as it is for Google, and `connectionHealth` should say
    // so rather than sending a merchant to reconnect something that renews itself.
    issuesRefreshToken: true,
    notes: [
      "Self-serve app registration at developer.loyverse.com/apps; no review queue, no partnership.",
      "Rate limit is 300 requests per 300 seconds PER ACCOUNT, and no response header reports " +
        "consumption -- unlike GA4's property quota or Meta's usage header, the budget has to be " +
        "counted client-side. Over it, Loyverse answers `429 RATE_LIMITED`.",
      "Access tokens last 12 hours (expires_in 43200). A refresh token is issued and the refresh " +
        "grant is documented, so renewal is silent.",
      "The personal access token is REFUSED. Loyverse's own words are that it \"gives unlimited " +
        'access to the targeted account", which fails the read-only pillar. See the note above.',
      "Loyverse spells its scopes UPPERCASE in the permissions table and in its token-response " +
        "example. Any comparison against a granted scope string must be case-insensitive: the " +
        "platform is not consistent about it and a merchant should not lose a good grant to that.",
    ],
  },
};

/** The scopes to request for a given set of sources. Nothing wider is ever asked for. */
export function scopesFor(provider: ProviderId, sources: readonly SourceId[]): string[] {
  return PROVIDERS[provider].scopes.filter((s) => sources.includes(s.source)).map((s) => s.scope);
}

/**
 * Which provider serves a source.
 *
 * A TOTAL MAP, NOT A TERNARY, AND THE CHANGE IS THE POINT. This read
 * `source === "meta_ads" ? "meta" : "google"` while `google` was the only other answer -- correct
 * then, and a trap the moment a third provider arrived: `providerFor("loyverse")` would have
 * returned `"google"`, silently, and every caller would have gone on to read Google's endpoints
 * and Google's refresh behaviour for a Loyverse connection. A total map makes a source with no
 * provider a COMPILE error instead of a wrong answer.
 */
const SOURCE_PROVIDERS: Readonly<Record<SourceId, ProviderId>> = {
  google_ads: "google",
  ga4: "google",
  search_console: "google",
  meta_ads: "meta",
  loyverse: "loyverse",
};

export function providerFor(source: SourceId): ProviderId {
  return SOURCE_PROVIDERS[source];
}
