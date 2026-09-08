# 06. OAuth: the authorisation-code flow for Connect

## 1. What this is, and the decision taken

`packages/oauth` — the authorisation-code flow with PKCE for Google and Meta, on the **customer's own
credentials**. The first half of the Connect milestone: building the URL a customer is sent to, and
turning the code they return with into tokens the vault can seal.

Bring-your-own-credential is not a preference. Google's developer policy forbids letting third parties
"avoid applying for their own Google Ads developer access and Google Cloud Platform project"; Meta
requires tech providers to process data solely on behalf of each client, siloed (sections 3.5 and
11.2). Every scope requested is read-only, and every grant belongs to exactly one workspace.

### PKCE and `state` are both required, and they are not the same thing

They get conflated. They defend different attacks, and for this product the second is the worse one:

- **PKCE** stops an intercepted authorisation code being redeemed by whoever intercepted it.
- **`state`** stops an attacker starting a flow with *their* platform account and having the victim's
  browser complete it — which silently attaches **the attacker's ad account to the victim's
  workspace**. Every number the customer then sees is someone else's.

`state` is compared in constant time. An early return on the first differing byte turns verification
into an oracle for forging one.

### Scope minimalism is an access-timeline decision, not only a security one

Google's sensitive-scope verification is the unbounded step in the entire plan — documented at three
to five days, observed at over ten weeks (section 3.5) — and the review is scoped to what you ask
for. Requesting a write scope "for later" would put the whole launch behind a review nothing yet
needs. `scopesFor()` asks for exactly the sources being connected and nothing else.

### Two provider differences that are load-bearing, not trivia

**Google issues a refresh token only on the first authorisation** for a given client and account,
unless `access_type=offline` and `prompt=consent` are both sent. Without one, a reconnected account
gets an access token that expires in an hour and no way to renew it — the connection dies silently
overnight. So a Google exchange that returns no refresh token is a **hard failure at connect time**,
with a message naming the cause. A loud failure while the customer is still looking at the screen
beats a mystery at 3am.

**Meta issues no refresh token at all.** It gives a long-lived token, about 60 days. That is
re-authorisation on a schedule, not silent renewal, and it is why `connections.expires_at` is a column
the health check watches rather than something derived. The registry records
`issuesRefreshToken: false` so the difference is data, not a special case buried in a branch.

### Nothing reads a global

`crypto` and `fetch` are parameters, as in `packages/vault` and `siteUrl(env)`. This code runs in the
Next app when a customer clicks Connect and in a Worker when a token is refreshed. Injecting `fetch`
also makes the token exchange testable without a network.

## 2. Cost estimate

**Per connected account per month: effectively zero.** One authorisation per connection, plus a
refresh per access-token lifetime — hourly for Google, so roughly 730 refreshes per connected account
per month, each a single outbound request. Negligible beside the platform reads they enable.

The real cost here is not compute, it is **calendar**: Google's verification is unbounded and Meta's
Business Verification plus App Review runs weeks 3–8. That is the schedule risk section 9 reorders the
whole MVP around, and no amount of engineering shortens it.

## 3. Platform-terms check

**Credential.** PASS × 4 — this is the gate that makes bring-your-own-credential real. Every flow is
per workspace; there is no Marketplane-held platform token; `clientId`/`clientSecret` are the
registered *application's* identity, which is what OAuth requires and is not a customer credential. No
pass-through: tokens go to the vault, never onward.

**Tenancy.** PASS × 3 — `PendingAuthorization` carries `workspaceId`, so a completed flow can only
attach to the workspace that started it, and `state` is what stops that binding being forged.

**Data movement.** PASS × 3 — the only outbound call is the provider's own token endpoint. The error
path deliberately **omits the provider's response body**, because providers echo request parameters
in errors and the client secret is a request parameter.

**PII and consent.** PASS × 3 — no contact data. Scopes are read-only analytics and advertising, and
each carries a stated reason for the Connect screen and for the review submission.

**Access tier and quota.** PASS × 2 — the registry records that Google's daily limits are *per
developer token* (Explorer 2,880, Basic 15,000), which is a shared ceiling rather than a per-account
budget, and that Meta's Full Access needs 500+ calls in 15 days at under 15% errors.

**Claims.** PASS × 3 — makes `read-only-oauth` and `byoc` true. No new claim.

## 4. What was left out

- **Persisting the pending authorisation.** `PendingAuthorization` is returned for the caller to
  store; where it lives (a signed cookie, a short-lived row) is the Connect screen's decision.
- **Token refresh.** The registry knows which providers refresh; the scheduled job belongs with the
  scheduler.
- **Account selection.** Google and Meta both return a grant that may cover several ad accounts, and
  choosing which to connect is a screen, not a protocol step.
- **The Meta Custom Audience terms deep-link.** Section 3.2 requires detecting per-ad-account terms
  acceptance and deep-linking it as a tracked step. That belongs with the Connect screen.
- **Client credential storage.** Worker secrets, wired with the app.
- **Anything write-side.** Section 11.4 defers writes past the MVP, so no write scope is even listed.

## 5. Open or unverified spec items this builds on

1. **`webmasters.readonly`'s sensitivity is unconfirmed.** Section 3.5's open question: the scope is
   not listed on Google's OAuth scopes page, so whether Search Console falls behind the same unbounded
   review as Ads and Analytics is unestablished. The registry records `sensitivity: "unconfirmed"`
   rather than guessing, and a test asserts it stays that way. **If it is sensitive, Search Console may
   not make the launch connector list at all.**
2. **Per-tenant Google developer tokens are undocumented.** Section 3.5 asks "whose token appears in
   the request?" and no source answers it. This unit does not depend on the answer — a developer token
   is not part of the OAuth flow — but the Google Ads connector will.
3. **Google's verification timeline is unbounded.** Never quote 3–5 days anywhere in the product; the
   registry note says so, and the Connect screen must show testing-mode state honestly rather than a
   generic failure.

## 6. Verification

| | |
|---|---|
| Tests, Node | **26/26** |
| Tests, real workerd | **2/2** in `apps/api-edge` |
| `typecheck` | Clean standalone, **and under `@cloudflare/workers-types` with no DOM lib** |

**On the tsconfig, honestly:** this package uses WHATWG globals both runtimes provide but
`lib: ["ES2022"]` does not declare, so its standalone typecheck uses the DOM lib. That is the *weaker*
check, because DOM declares more than workerd does. The real proof is that `apps/api-edge` imports
this package and typechecks under `@cloudflare/workers-types` with no DOM lib at all — recorded in the
tsconfig comment, because if that ever breaks the package's own config will not tell you.

**Mutation-checked** on the three properties that carry the security:

- **State comparison always succeeds** — 2 failures, including "rejects a mismatched state".
- **Verifier sent in the authorisation URL** instead of the challenge, which defeats PKCE entirely —
  caught by "sends the challenge and never the verifier".
- **Refresh-token requirement removed** — caught by "fails loudly when Google issues no refresh
  token".

All reverted; back to 26/26.

The suite also pins down that only read scopes are ever requested (asserted across the whole registry,
so a future write scope fails the build), that the exchange presents the verifier and never the
challenge, that granted scopes are recorded because providers may grant fewer than asked, and that
every token-shaped field is redacted from the payload kept for diagnostics.
