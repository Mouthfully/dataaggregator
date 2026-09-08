/**
 * The authorisation-code flow: building the URL a customer is sent to, and turning the code they
 * come back with into a credential.
 *
 * Nothing here reads a global. The redirect URI is passed in because it derives from the runtime
 * environment (`siteUrl` in packages/brand) and the domain is deliberately unsettled; the client
 * credentials are passed in because they live in a Worker secret.
 */

import { type CryptoLike, createPkcePair, createState, timingSafeEqual } from "./pkce.js";
import { PROVIDERS, type ProviderId, type SourceId, scopesFor } from "./providers.js";

/** What the caller must persist between the redirect out and the callback in. */
export interface PendingAuthorization {
  readonly provider: ProviderId;
  readonly workspaceId: string;
  readonly sources: readonly SourceId[];
  readonly state: string;
  /** Never leaves the server, and never appears in the authorisation URL. */
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly createdAt: string;
}

export interface AuthorizationStart {
  readonly url: string;
  readonly pending: PendingAuthorization;
}

/**
 * Build the URL to send the customer to.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the caller controls the clock, which
 * makes expiry testable without waiting and keeps this callable from a Workflow step.
 */
export async function startAuthorization(
  crypto: CryptoLike,
  options: {
    provider: ProviderId;
    workspaceId: string;
    sources: readonly SourceId[];
    clientId: string;
    redirectUri: string;
    now: Date;
  },
): Promise<AuthorizationStart> {
  const config = PROVIDERS[options.provider];
  const scopes = scopesFor(options.provider, options.sources);
  if (scopes.length === 0) {
    throw new RangeError(
      `startAuthorization: ${options.provider} serves none of [${options.sources.join(", ")}]`,
    );
  }

  const pkce = await createPkcePair(crypto);
  const state = createState(crypto);

  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    ...config.extraAuthParams,
  });

  return {
    url: `${config.authorizationEndpoint}?${params.toString()}`,
    pending: {
      provider: options.provider,
      workspaceId: options.workspaceId,
      sources: options.sources,
      state,
      codeVerifier: pkce.verifier,
      redirectUri: options.redirectUri,
      createdAt: options.now.toISOString(),
    },
  };
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "state_mismatch"
      | "expired"
      | "provider_denied"
      | "token_exchange_failed"
      | "missing_refresh_token",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** How long a started flow stays valid. Long enough to sign in and pick an account, not longer. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Check the callback before spending anything on a token exchange.
 *
 * Order matters. The provider's own error is reported first, because a customer who declined should
 * see that rather than a state error. State is then compared in constant time: an early return on
 * the first differing byte turns this into an oracle for forging a state.
 */
export function verifyCallback(options: {
  pending: PendingAuthorization;
  returnedState: string;
  providerError?: string | null;
  now: Date;
}): void {
  if (options.providerError) {
    throw new AuthorizationError(
      `the provider refused the authorisation: ${options.providerError}`,
      "provider_denied",
    );
  }

  if (!timingSafeEqual(options.pending.state, options.returnedState)) {
    // The attack this stops: someone starts a flow with THEIR platform account and has the victim's
    // browser complete it, silently attaching the wrong ad account to the victim's workspace.
    throw new AuthorizationError("state did not match the pending authorisation", "state_mismatch");
  }

  const age = options.now.getTime() - Date.parse(options.pending.createdAt);
  if (Number.isNaN(age) || age > PENDING_TTL_MS || age < 0) {
    throw new AuthorizationError("the authorisation attempt has expired", "expired");
  }
}

export interface TokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string | null;
  readonly grantedScopes: readonly string[];
  /** Verbatim provider response, minus the secrets. For diagnosing a connection, never for storage. */
  readonly raw: Record<string, unknown>;
}

/**
 * Exchange the code for tokens.
 *
 * `fetchImpl` is injected so this is testable without a network and callable from either runtime.
 */
export async function exchangeCode(
  options: {
    pending: PendingAuthorization;
    code: string;
    clientId: string;
    clientSecret: string;
    now: Date;
  },
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  const config = PROVIDERS[options.pending.provider];

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.pending.redirectUri,
    code_verifier: options.pending.codeVerifier,
  });

  const response = await fetchImpl(config.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });

  if (!response.ok) {
    // Deliberately does not include the response body: providers echo request parameters in errors,
    // and the client secret is a request parameter.
    throw new AuthorizationError(
      `token exchange with ${config.displayName} failed with HTTP ${response.status}`,
      "token_exchange_failed",
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) {
    throw new AuthorizationError(
      `${config.displayName} returned no access token`,
      "token_exchange_failed",
    );
  }

  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : null;
  if (config.issuesRefreshToken && !refreshToken) {
    // Google issues a refresh token only on the first authorisation unless prompt=consent is sent.
    // Without one the connection dies silently in an hour, so this is a hard failure at connect
    // time rather than a mystery at 3am.
    throw new AuthorizationError(
      `${config.displayName} issued no refresh token; the connection would expire within the hour ` +
        "and could not be renewed. Check that access_type=offline and prompt=consent were sent.",
      "missing_refresh_token",
    );
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;

  return {
    accessToken,
    refreshToken,
    expiresAt:
      expiresIn === null ? null : new Date(options.now.getTime() + expiresIn * 1000).toISOString(),
    // Providers may grant fewer scopes than asked for. Recording what was actually granted is what
    // turns a later 403 into "this connection lacks Search Console" rather than a guess.
    grantedScopes:
      typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
    raw: redactSecrets(payload),
  };
}

/** Strip anything token-shaped before a payload can reach a log or a diagnostic view. */
export function redactSecrets(payload: Record<string, unknown>): Record<string, unknown> {
  const SECRET_KEYS = ["access_token", "refresh_token", "id_token", "client_secret", "code"];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = SECRET_KEYS.includes(key) ? "[redacted]" : value;
  }
  return out;
}
