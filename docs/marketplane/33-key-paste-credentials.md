# 33. A key-paste credential lane, and the union that forces it

**PR:** #10 &nbsp;·&nbsp; **Date:** 2026-09-10 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`32-woocommerce-connector.md` §5 named this as *"the real blocker"*, and it was understated:
`packages/connections` modelled an OAuth grant — an access token, a refresh token, an expiry — and a
merchant-issued consumer key and secret fits **none** of that. **Every remaining slot of §11A.14's
launch set was behind this**, not just WooCommerce. Shopify's Admin API access token, Opn's HTTP
Basic key, ZORT's `storename`+`apikey`+`apisecret` are all the same shape.

**The decision: `StoredCredential` becomes a discriminated union, and `connectWithKey` is a sibling
of `connect` rather than a branch inside it.**

The two credential shapes have nothing in common except that both are secret. An OAuth grant is a
pair of tokens with a clock; a key-paste credential is a key and a secret with **no clock at all**.
Modelling the second as the first — a consumer key stuffed into `accessToken`, `refreshToken` set to
null — **would have compiled, would have worked, and would then have lied** in every place that
reasons about the token: `connectionHealth` consulting a provider config that does not exist for it,
and eventually a refresh path trying to renew something with no issuer behind it.

**The alternative rejected was a branch inside `connect`.** It is the smaller diff and it is wrong
for a reason the type system states out loud: `connect` calls
`scopesFor(providerFor(options.source), …)`, and `providerFor` takes `SourceId` — which is
`"google_ads" | "ga4" | "search_console" | "meta_ads"` and **not** `woocommerce`. Reusing `connect`
would mean fabricating a `TokenResponse` to get past a function that cannot mean anything here. **The
lie does not compile**, which is the best possible outcome for a lie.

### 1.1 Three consequences, each recorded rather than discovered later

- **No scope check, because there is nothing to check.** The merchant chose the permission level when
  it created the key — WooCommerce offers `Read`, `Write`, `Read/Write` — and the platform reports
  nothing back about what was granted. `grantedScopes` is therefore **empty rather than invented**,
  and an insufficient key surfaces as a 403 on the first pull, which `recordFailure` already routes
  to `needs_reauth`. That is the honest failure mode: only the merchant can widen a key, so only the
  merchant can fix it.
- **`expiresAt` is null and MEANS "no expiry"**, where on an OAuth row the same null means *unknown*.
  A pasted key stops working when the merchant deletes it, or when the WordPress user behind it is
  removed — WooCommerce's own documentation is explicit that a key dies with its user and is not
  transferred. Neither event has a date we could hold.
- **`connectionHealth` answers key-paste connections BEFORE the provider-config lookup**, which
  cannot accept them at all. Falling through to the expiry logic with a null `expiresAt` would report
  *"Connected."* **by accident** rather than on purpose, and the two are indistinguishable from
  outside until the day the logic changes.

### 1.2 Where the store origin lives

`externalAccountId` holds it — `https://shop.example.com`. **Not a special case dressed up:** the
field means *the id of the account at the provider*, and for a self-hosted store the origin **is** the
account, exactly as `properties/123` is the account for GA4.

It stays **out of the sealed blob** deliberately. It is not a secret, the scheduler needs it to build
every URL, and re-opening a crypto envelope to read a hostname would be a decryption per request. The
alternative — a `base_url` column for one source — was rejected as a schema change bought by one
connector.

## 2. Cost estimate

**Per connected account per month:** `฿0.00`

No data-plane work. No connector, no read path, no scheduled job, no bought data, no new dependency.
Nothing here changes rows/night, restatement depth, Workers invocations, R2 object count, KV writes
or Supabase disk, and nothing touches the polling ratio §8's open question turns on.

**One cost avoided rather than paid**, and it is the reason `externalAccountId` carries the origin: a
`base_url` on the sealed blob would have made every scheduled pull perform an AES-GCM open to
discover a hostname it could have read from a column. At one pull per connection per night that is
invisible; at the per-order restatement volume commerce implies, it is a decryption per page.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS`, **and this diff is the mechanism for it.** A key-paste connection is BYOC by
construction: the merchant issues the credential to itself in its own admin and pastes it. No
company-held token, no shared client secret, no developer token, no GCP project the tenant did not
obtain. This is the lane that lets a source satisfy gate 1 *by construction* rather than *by design
care* — §11A.13's distinction.

**2. Vendor-key exception.** `N/A` — not invoked; this is tenant data on tenant credentials.

**3. No token pass-through.** `N/A` — no MCP or OAuth request path is touched. `packages/oauth` is
unchanged, and correctly so: its `SourceId` stays narrow and a key-paste provider is not a member.

**4. Credential hygiene.** `PASS`, and the gate that carries the PR. The key and secret are sealed by
`@repo/vault` with the same AES-GCM envelope and the same `{workspaceId, connectionId}` AAD binding
as an OAuth grant, so moving a row to another workspace makes it **undecryptable rather than merely
unauthorised**. A test asserts neither half appears anywhere in the serialised row, and asserts the
ciphertext is non-empty so that assertion cannot pass trivially. Nothing is logged; `ConnectionError`
messages name the missing half, never its value.

### Tenancy

**5. RLS.** `PASS` — no new table. `public.connections` already carries `workspace_id` under its
existing policy; `app.connection_provider` gains a member and nothing else changes.

**6. No service-role bypass.** `N/A` — no request path in this diff.

**7. No cross-workspace read.** `PASS` — the AAD binding is per-connection, so a credential is
cryptographically scoped to one workspace. This is stronger than a policy check and is unchanged.

**8. No cross-customer aggregation or benchmarking.** `N/A` — no query, aggregate or cache key.

**9. API key scope.** `N/A` — this is the *platform* credential path, not the customer's API key to
us. Worth keeping the two words apart: nothing here touches `verify_api_key`.

### Data movement

**10. No resale or redistribution.** `N/A` — nothing moves.

**11. Meta client list.** `N/A` — no Meta onboarding, lifecycle or deletion path. Note for later: Meta
remains an OAuth source and this lane does not touch its obligations.

**12. Dependency licences.** `PASS` — no dependency added.

### PII and consent

**13. Hash at the edge.** `N/A` — a consumer key is not personal data and no contact data is handled.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress.

**15. Per-destination consent.** `N/A` — writes remain deferred (§11.4).

### Access tier and quota

**16. Tier reality.** `N/A` — no platform request is made. The lane exists precisely for sources with
no tier.

**17. No new long-lead dependency.** `PASS`, and it is the point of the whole change. A key-paste
source has **no reviewer and no approval calendar** — §11A.13's first test answers *nobody*. This
diff removes the last engineering obstacle to that being true in code as well as on paper.

### Claims

**18. Claim provenance.** `PASS` — nothing user-visible changes. Nothing here may be claimed: a
credential lane is not a connector, and §11A.12's rule stands that no launch source enters the claims
list until it exists.

**Result:** `9 PASS, 9 N/A, 0 FAIL`

## 4. What was left out

- **The WooCommerce HTTP client still does not exist.** This unblocks it; it does not write it. That
  remains the next PR, with the request shape `32` §5 already records.
- **No connect-time probe.** A single `GET /wp-json/wc/v3/orders?per_page=1` would validate the store
  URL, the key, the permission level, the WordPress user's capability and pretty-permalinks all at
  once, and map each failure to a different sentence. It belongs with the client, which is what makes
  the request.
- **No URL validation on `externalAccountId`.** WooCommerce over plain HTTP requires OAuth 1.0a
  signing, which this lane deliberately does not implement, so a non-`https` origin must be refused —
  **at the boundary that accepts it from a human**, which is the connect surface, not this function.
  Recorded so it is not lost.
- **`shopify`, `opn`, `zort` were not added to `KEY_PASTE_PROVIDERS`.** Each arrives with its
  connector, its `SOURCES` entry and its redaction keep-list, per the rule `25-payload-redaction.md`
  exists to enforce.
- **No guard relating `app.connection_provider` to `KEY_PASTE_PROVIDERS` and `SourceId`.**
  `check-dictionary.mjs` covers sources, entity types, attribution windows and metrics — **not
  connection providers**. Adding a member to one side and forgetting the other fails at runtime, not
  at build time, which is the exact failure that guard exists to prevent everywhere else. Recorded in
  a comment in the migration and left as a follow-up rather than widening this PR.
- **No re-sealing of existing credentials.** The backwards-compatibility path in `openCredential`
  reads a missing `kind` as `oauth`; a migration that re-seals every blob with its discriminant would
  let that path be deleted. Not worth doing while no database holds a credential.

## 5. Open or unverified spec items this builds on

- **§11A.12's FlowAccount row is still provisional**, and it is the one source on the verified Thai
  shortlist whose access model is unconfirmed. If it turns out to require approval, it leaves the
  shortlist — but it does not affect this lane, which is agnostic about *which* sources are key-paste.
- **Whether a pasted key should be re-validated periodically.** Nothing here polls a credential's
  liveness, so a key deleted by the merchant is discovered on the next scheduled pull rather than
  when it happens. That is the same latency an expired OAuth token has, and it may be the wrong answer
  for a credential with no expiry to warn about — an explicit health check has no design yet.
- **WooCommerce's key-to-WordPress-user coupling.** A key dies with the user that created it, which
  means a merchant firing a staff member silently breaks the connection. `needs_reauth` is the right
  status; whether the *message* can say so specifically depends on distinguishing that 401 from a
  deleted key, and nothing establishes that they differ on the wire.

## 6. Verification

| | |
|---|---|
| `pnpm exec biome lint .` / `format .` | pass, by exit code |
| `pnpm -r typecheck` | pass |
| `pnpm -r test` | pass — **428 unit tests, up from 418** |
| `pnpm -r build` | pass |
| `pnpm check:brand` / `check:tokens` / `check:dictionary` | pass |

### Six mutations, six caught

| Mutation | Caught by |
|---|---|
| Accept an empty key or secret silently | the refusal, and `rows.size` proving nothing was written |
| Seal a pasted key under the `oauth` discriminant | the round-trip's narrowing on `kind` |
| Drop the key-paste branch in `connectionHealth` | the health assertion |
| Read a legacy blob as `key_secret` instead of `oauth` | the legacy-blob test |
| Invent an expiry for a credential that has none | `expiresAt` must be null |
| Invent a granted scope the platform never reported | `grantedScopes` must be empty |

**And one test was rewritten because it could not fail.** The legacy-credential test first called
`connect()` and re-opened the row — which exercised the *modern* path and asserted a fallback it
never reached, because `connect()` now writes `kind`. It now seals the exact payload shape that is on
disk today, bypassing `connect()` entirely. This is the **third** time this project has caught a test
or mutation that did not mean what it looked like, and the accumulated lesson is now three-part:
confirm the mutation is in the file, confirm it changes behaviour, and confirm the test could ever
have failed.
