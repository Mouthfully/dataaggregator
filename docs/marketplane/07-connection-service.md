# 07. The connection service

## 1. What this is, and the decision taken

`packages/connections` — the seam where `packages/oauth`, `packages/vault` and the `connections`
table meet. A completed authorisation arrives as tokens; what has to come out is a row that contains
no readable credential, belongs to exactly one workspace, and carries enough about its own health
that a scheduled pull failing at 3am is diagnosable rather than mysterious.

**Persistence is injected, not imported.** There is no live Supabase project yet, and more
importantly the same logic runs from a Next server action when a customer connects *and* from a
Worker when the scheduler refreshes. A four-method store interface keeps both honest, and keeps this
testable against the **real** vault and the **real** OAuth code rather than against mocks of them —
the tests here exercise actual AES-GCM.

### The scope check happens before anything is written

Providers may grant less than was asked for. A connection missing the scope its source needs is not a
connection, it is a row that will 403 on the first scheduled pull, hours later, with nothing pointing
at the cause. So the check is at connect time, while the customer is still looking at the screen, and
the message names the missing scope and what to do.

With one exception that would otherwise make Meta unconnectable: **an empty granted-scope list means
"not reported", not "granted nothing".** Meta returns no scope string on its token endpoint. Treating
the two the same would reject every Meta connection.

### The two providers genuinely differ, and health is where it shows

Google issues a refresh token, so an expired access token is routine and self-healing — the scheduler
renews it and nobody is told. Meta issues none: a long-lived token simply expires after about sixty
days, and **only the customer can fix it.**

Collapsing those two either wakes someone for a refresh that would have happened anyway, or lets a
Meta connection go dark with nobody told. So `connectionHealth` reads
`PROVIDERS[...].issuesRefreshToken` and answers two separate questions — *can a pull run now* and
*does a human have to act* — rather than one status string. It also warns a week before a Meta token
expires rather than after, which is enough notice to act without becoming noise.

### A failed pull does not automatically blame the customer

A 401 or 403 is the customer's to fix and must be surfaced. Anything else is ours and must not be, or
every transient platform blip tells someone their account is broken.

## 2. Cost estimate

**Per connected account per month: effectively zero.** One vault open per scheduled pull, plus one
health evaluation, both pure computation on a row already read.

The line worth watching is the vault open, not this module: at four sources per account with
restatement re-pulls at D+1, D+3, D+7 and D+28, that is a few hundred opens per account per month. As
noted in `05-credential-vault.md`, the fix if it ever matters is caching an opened credential for the
life of one Workflow instance — a change to the caller, not to this package.

## 3. Platform-terms check

**Credential.** PASS × 4 — a credential exists in plaintext only inside `connect()` and
`openCredential()`, and is sealed before it reaches the store. The row that is written contains
ciphertext only, asserted rather than assumed: a test greps the serialised row for the token and
fails if it appears.

**Tenancy.** PASS × 3 — the seal is bound to `(workspaceId, connectionId)`, so a relocated ciphertext
becomes **undecryptable** rather than merely unauthorised. Two tests exercise exactly that. This is
the layer RLS does not cover: RLS stops a tenant *reading* another tenant's row, not a ciphertext
being *moved* into a row they can already read.

**Data movement.** PASS × 3 — no network access at all; the token exchange belongs to
`packages/oauth`. Nothing is aggregated across workspaces because nothing here can see two.

**PII and consent.** PASS × 3 — no contact data. Credentials are platform grants.

**Access tier and quota.** N/A × 2 — quota accounting belongs with the extractors.

**Claims.** PASS × 3 — no new claim. Makes `tenant-isolation` and `byoc` truer.

## 4. What was left out

- **The Postgres implementation of `ConnectionStore`.** Deliberate: it needs the Supabase client and
  a linked project. The interface is four methods precisely so that implementation is small.
- **Token refresh itself.** This package knows *whether* a provider refreshes; performing it is the
  scheduler's job, and it needs the client credentials.
- **The Connect screen.** Server actions, the account picker, and the Meta Custom Audience terms
  deep-link (section 3.2) are UI.
- **Revocation.** Setting `revoked_at` is a write the dashboard performs; this package only refuses
  to use an already-revoked row.
- **Quota tracking.** `connections.quota_used_today` exists; incrementing it belongs with the
  extractor that consumes the quota.

## 5. Open or unverified spec items this builds on

1. **Per-tenant Google developer tokens remain undocumented** (section 3.5). `ConnectionRow` does not
   yet carry one; the migration has the columns. The Google Ads extractor is where this has to be
   answered, and it is still unanswered.
2. **Meta's long-lived token lifetime is treated as ~60 days.** The specification records that Meta
   issues long-lived tokens without pinning the number. The seven-day warning window is a judgement
   call, not a sourced figure, and it is cheap to change.

## 6. Verification

| | |
|---|---|
| `typecheck` | Clean |
| Tests | **16/16**, against the real vault and the real provider registry |

**One test found a real bug**, which is the reason this note exists in its current form.

`recordFailure` marks a connection `needs_reauth` after a 401. `connectionHealth` then reported it as
**"Connected."** — because it derived `needs_reauth` only from the token expiry, and the token had not
expired on paper. The platform had rejected the grant and no clock we hold knew it. That is precisely
the silent failure the function exists to prevent, and it was invisible from reading the code: both
halves are individually correct.

Fixed by having a persisted `needs_reauth` outrank anything derived, and the mutation check confirms
the suite catches it if reintroduced.

**Mutation-checked:**

- **Dropping the persisted `needs_reauth` branch** — reproduces the bug above, caught by 1 test.
- **Dropping the scope check** — caught by 2, including that nothing is written when it fails.

Both reverted; back to 16/16.

The suite also pins down that the stored row contains no readable credential, that a credential
cannot be opened as another workspace's connection or under a different connection id, that a revoked
connection refuses to yield its credential at all, that Meta connects despite reporting no scopes, and
that a 503 is recorded as our problem rather than the customer's.
