# 47. The credential lane: how a connection got here, and why the provider stopped being the answer

**PR:** the lane column, the bearer credential shape, and the provider guard the connections
migration asked for in a comment and shipped without.

## 1. What this is, and the decision taken

The product's direction is "as many connectors as possible, connected either by authenticating or
by pasting an API key". The second half of that is where this note lives, and it turned out not to
be a matter of adding one more shape.

`packages/connections` modelled the two existing ways in as a property of the **provider**:

```ts
export const KEY_PASTE_PROVIDERS = ["woocommerce"] as const;
```

Everything was OAuth except WooCommerce, and `connectionHealth` asked `isKeyPasteProvider(row.provider)`
to decide what a connection was worth. **Meta is the counterexample, and it is not an edge case.**
The same Meta Ads account can be connected by sending an owner through the OAuth dance, or by
pasting a System User token the customer minted in its own Business Manager. Same provider, same
`external_account_id`, two lanes — and everything that decides whether a connection is healthy
differs between them.

### The trap, stated precisely

Under the old model there were exactly two ways to offer the Meta paste lane, and both were wrong:

1. **Put `meta_ads` in `KEY_PASTE_PROVIDERS`.** That branch returns early with *"this key does not
   expire"* — for **every** Meta connection, OAuth grants included. A grant that expired sixty days
   ago would report `usable: true`.
2. **Don't offer the lane.** Which is the feature not existing.

There was no third option, because the question *"can this self-heal?"* was being asked of the
wrong noun. It is not a fact about Meta. It is a fact about **this connection**.

### The decision

The lane moves onto the connection, as a column:

```sql
create type app.credential_lane as enum ('oauth', 'key_secret', 'bearer');
```

- `oauth` — an authorisation server issued it. Scopes, a clock, possibly a refresh token. **The
  only lane that can ever self-heal.**
- `key_secret` — the customer issued itself a key *and* a secret in its own admin. No issuer, no
  clock at all.
- `bearer` — the customer issued itself **one** opaque token. No issuer, and a clock only when the
  platform gave us a date. Never refreshable: there is no issuer to ask.

`PROVIDER_LANES` in TypeScript records which lanes each provider actually offers, and it is
enumerated rather than inferred, because offering a lane is a claim about the *platform*: Google
has no pasteable long-lived token, so `bearer` for `ga4` would be a road with no end.

### Why `bearer` is a third shape and not a reused one

A single token is not a degenerate `key_secret` with an empty half, and not an `oauth` with a null
refresh token. Both of those compile, and both then lie:

- Pushed through `connectWithKey`, it hits the both-halves refusal — which exists because an empty
  half seals successfully and 401s hours later with nothing pointing at the cause. Satisfying that
  check with a fake empty secret defeats the check.
- Pushed through `connect`, it reaches `scopesFor(providerFor(...))` and gets measured against
  scopes no System User token reports.

So `connectWithToken` is a third sibling, for the reason `connectWithKey` was the second.

### The expiry asymmetry, which is the point of the lane

`connectWithToken` accepts an `expiresAt`; `connectWithKey` does not. A key-and-secret pair has no
clock. **A bearer token may or may not, and only the customer knows which** — Meta will mint a
System User token dated or permanent from the same screen.

`null` therefore means **permanent**. It does not mean "unknown", and nothing downstream may read
it as unknown, because `connectionHealth` would then report *"Connected."* to somebody whose token
died last week. Two refusals defend that meaning at paste time, while the customer is still at the
keyboard and can mint another:

- An **unparseable** date is refused rather than coerced to null — silently promoting a dated token
  to a permanent one is the one direction that fails quietly.
- An **already-expired** date is refused outright. The alternative is discovering it on a scheduled
  pull at 3am, when the only available action is marking the row broken.

### What the customer is told, which differs by lane and not by provider

An expired OAuth grant is fixed by reconnecting an account. An expired pasted token is fixed by
minting another and pasting it. Telling someone to *"reconnect the account"* when there is no
account screen to reconnect from sends them looking for a button that does not exist — so
`selfIssuedExpiry` is a separate path, and a test asserts a dated Meta bearer connection says
"mint a new one" while a dated Meta **OAuth** connection says "reconnect the account". Same
provider, same expiry, different instruction.

### The second copy, and what defends it

The credential already carries a `kind` discriminant — inside AES-256-GCM ciphertext the database
cannot open, and whose KEK lives in Cloudflare. Health checks, the connections list and the connect
surface would each need a **decryption** to answer "is this one fine?". That is the cost the column
removes, and its price is one fact stored twice.

A second copy that can drift silently is a defect generator, so `openCredential` now **refuses**
when the column and the blob disagree, rather than preferring either. If they differ, every cheap
read has been answering from the wrong one, and which is right is not knowable from there.

### The guard the schema asked for

`20260908000500_connections.sql` wrote this and then shipped without it:

> *"NOTE FOR WHOEVER ADDS THE NEXT ONE: no guard relates this enum to its TypeScript twin.
> check-dictionary.mjs covers sources, entity types, attribution windows and metrics — NOT
> connection providers. Adding a member here and forgetting the other side fails at runtime, not at
> build time, which is the failure mode that guard exists to prevent everywhere else."*

**It had already happened.** `app.connection_provider` carries `impact`, `awin`, `cj` and
`partnerstack`; no TypeScript names any of them. `scripts/check-providers.mjs` is the seventh
guard, and its asymmetry is deliberate:

| Direction | Rule | Why |
|---|---|---|
| TypeScript → database | **Must be total** | A provider the column cannot store fails on the `INSERT`, in production, *after* the customer has finished authorising — the latest possible moment to learn it. |
| database → TypeScript | **Surplus allowed, but declared** | Four affiliate networks are a planned set written ahead of the code. Harmless — a row cannot acquire a provider no code can write. Each is listed with a reason, so the guard fails on the member nobody thought about. |
| lanes, both ways | **Equality** | There is no planned set of lanes. |

A reason that outlives its member fails too: `DB_ONLY_PROVIDERS` excusing a member the enum no
longer carries is a comment claiming something untrue.

### One comment promoted to an enforced fact

`08_credential_lane.sql` tests the backfill by **re-running the migration's `update`** against rows
it inserts itself. It has to: a backfill cannot be observed after the fact, because the migration
runs against an empty table in a scratch database, so its own execution proves nothing.

That means the statement exists twice, and the test said *"Verbatim from …"* about a copy nothing
compared. Edit the mapping in the migration alone and the test goes on passing while the migration
is wrong. The guard now compares the two, whitespace-insensitively — the same move as
`performance.test.ts` reading `max_rows` out of `config.toml`.

## 2. Cost estimate

**Zero per connected account per month.** No code path here makes a platform request, consumes
quota, or writes an R2 object. The column is one `enum` per row — 4 bytes, absorbed by existing row
padding — on a table holding at most a few dozen rows per workspace. The guard runs on the CI
runner in under 100ms and adds nothing to any request path.

The bearer lane's cost arrives when a connector *uses* it, and is that connector's to account for.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — the bearer lane is bring-your-own-credential in its purest form: the customer
mints the token in its own Business Manager, under its own review, and pastes it. No company-held
credential is introduced, and the OAuth lane is unchanged.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is used or introduced.

**3. No token pass-through.** `PASS` — a pasted token is sealed by `packages/vault` on arrival and
is never returned, logged or echoed. `connectWithToken` reads it once into the plaintext it seals;
the refusal messages name the *provider* and the *expiry*, never the token.

**4. Credential hygiene.** `PASS` — this is the gate the change is most exposed to, so it was
written against it. The token appears in no error message: the empty-token refusal quotes nothing,
the expiry refusals quote the **date**, and the lane-mismatch refusal in `openCredential` names the
two **lanes**. `credential_lane` is deliberately the one non-secret fact promoted out of the
ciphertext, and it is a three-valued enum — it discloses how a customer connected, not what with.

### Tenancy

**5. RLS.** `PASS` — `public.connections` already carries its policies and this adds a column, not a
table. No policy is changed, and `01_rls_isolation.sql` still passes from all seven principals. The
three `check_denied` inserts were updated to supply the lane **so that they keep testing RLS**: a
`not_null_violation` routes to `check_denied`'s `when others` and fails the assertion, so leaving
them alone would have been a visible failure rather than a false pass — but they would no longer
have been exercising the policy.

**6. No service-role bypass.** `N/A` — no request path and no database client changes.

**7. No cross-workspace read.** `N/A` — no query, view, materialisation or cache key.

**8. No cross-customer aggregation or benchmarking.** `N/A` — nothing aggregates anything.

**9. API key scope.** `N/A` — this is about credentials *inbound to* platforms, not the API keys
customers use against us. No key, budget or tool allow-list is involved.

### Data movement

**10. No resale or redistribution.** `N/A` — no billing unit, response, export, webhook or shared
link. No platform data moves anywhere.

**11. Meta client list.** `PASS`, and worth stating rather than waving through, since Meta is the
provider this change exists for. Nothing here onboards a Meta client, changes a workspace lifecycle
or touches a deletion path. The System User lane in fact **narrows** our exposure: the customer's
own system user holds the grant, and revoking it is entirely in their hands.

**12. Dependency licences.** `PASS` — no dependency added, removed or upgraded; `pnpm-lock.yaml` is
untouched. The guard is zero-dependency Node ESM, matching the six that exist.

### PII and consent

**13. Hash at the edge.** `N/A` — no email, phone, name or address reaches this code.

**14. Forbidden payloads rejected before egress.** `N/A` — no payload, no egress.

**15. Per-destination consent.** `N/A` — no record, no consent object, no destination.

### Access tier and quota

**16. Tier reality.** `PASS` — a Meta System User token is available on a standard Business Manager
and needs no tier we do not have. It is the lane that **avoids** a long-lead dependency, not one
that creates one.

**17. No new long-lead dependency.** `PASS`, and this is the commercial point of the bearer lane.
The OAuth lane puts this company in front of a Meta App Review whose calendar we do not control.
The System User lane puts **nobody** in front of anybody: the customer mints the token itself. A
customer blocked on our app review has a way in that does not wait on it.

### Claims

**18. Claim provenance.** `PASS` — no user-visible copy changes in this PR. Nothing is added to
`claims.ts`, no new source is claimed, and `check-copy.mjs`, `check-claim-sources.mjs` and
`check-capabilities.mjs` all pass unchanged. The bearer lane is plumbing; the sentence that
advertises it belongs with the connector that uses it.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **No check constraint tying each provider to the lanes it offers.** `PROVIDER_LANES` is that
  table, and duplicating it in SQL would put one mapping in two languages with nothing relating
  them — the exact arrangement that produced the drift this PR's guard exists to catch. One source,
  guarded, beats two that agree today.
- **No connector uses the bearer lane yet.** This PR builds the lane and proves it end to end; the
  Meta System User client is the next stream. Shipping them together would have made a credential
  model change and a connector change reviewable only as one diff.
- **The four affiliate providers are still unnameable in TypeScript.** They are declared in
  `DB_ONLY_PROVIDERS` with a reason rather than given lanes, because inventing lanes for
  connectors that do not exist is the abandoned-roadmap failure in a new place.
- **No re-sealing of legacy blobs.** `openCredential` still reads a missing `kind` as `oauth`, and
  the new column/blob cross-check runs only when `kind` is present — so a pre-union blob is
  unaffected. Removing that fallback needs a re-seal, which is its own migration.
- **`developer_token_*` columns are untouched.** The open question in §3.5 they encode is unchanged
  by this PR.

## 5. Open or unverified spec items this builds on

- **§11A.13 "who is reviewed"** is what the lane distinction operationalises. The specification
  frames it per *source*; this PR shows it is per *connection*, since Meta answers it differently
  down each lane. Recorded here rather than edited into the specification.
- **Whether Meta System User tokens in practice arrive dated or permanent** is not settled by this
  PR and does not need to be: both are handled, and `expiresAt` carries whichever the customer
  reports. It will matter when the connector ships, because that is where the value comes from.

## 6. Verification

Run on a clean checkout of `main` with a real `pnpm install --frozen-lockfile`.

- `pnpm -r test` — **774 tests pass** across 12 workspaces (`@repo/connections` 26 → **39**)
- `pnpm -r typecheck` — clean
- `pnpm exec biome lint .` and `pnpm exec biome format .` — clean (the CI gates; note that
  `pnpm check` also runs the `organizeImports` assist and **already fails on `main`**, unchanged
  here)
- **All seven guards pass**
- `./supabase/tests/run-local.sh` against PostgreSQL 16 — every suite green, including the new
  `08_credential_lane.sql` at **9 assertions**

### The evidence that matters: every new check fires on a real defect

A test that cannot fail is not evidence, so each was run against a deliberate mutation and then
reverted byte-identically.

| # | Mutation | Caught by | Result |
|---|---|---|---|
| M1 | self-issued credentials always report permanent (*the old behaviour*) | `connections.test.ts` | **4 failed** |
| M2 | the column/blob cross-check removed from `openCredential` | `connections.test.ts` | **1 failed** |
| M3 | an already-expired pasted token accepted | `connections.test.ts` | **1 failed** |
| M4 | an unsupported lane allowed through `connectWithToken` | `connections.test.ts` | **1 failed** |
| G1 | `PROVIDER_LANES` names `shopify`, which the enum cannot store | `check-providers.mjs` | **FAIL** |
| G2 | `tiktok_ads` added to the enum, no TypeScript name | `check-providers.mjs` | **FAIL** |
| G3 | a fourth `CredentialLane` the column cannot hold | `check-providers.mjs` | **FAIL** |
| G4 | the `CredentialLane` union and `CREDENTIAL_LANES` tuple drift apart | `check-providers.mjs` | **FAIL** |
| G5 | `DB_ONLY_PROVIDERS` excuses a member the enum no longer carries | `check-providers.mjs` | **FAIL** |
| G6 | the migration's mapping edited, the test's copy left behind | `check-providers.mjs` | **FAIL** |
| S1 | the backfill maps WooCommerce to `oauth` (*both copies changed together*) | `08_credential_lane.sql` | **1 failed** |

G6 and S1 are the pair worth reading together: the guard catches the two copies **drifting apart**,
and the SQL suite catches the mapping being **wrong when they agree**. Neither alone is sufficient.

### Two things the suite caught while this was being written

Both are recorded because they are the failure modes this repository keeps rediscovering, and both
were found by a mechanism rather than by reading.

1. **The NOT NULL bit immediately.** Six fixture inserts across three existing suites omitted the
   column. That is the constraint working — a default of `'oauth'` would have let every one of them
   succeed and be wrong, which is precisely why the column has none.
2. **The assertion floor caught this very file.** `08_credential_lane.sql` first reported **4 of 8**
   assertions: the backfill block ended in `rollback`, and `app_test.check()` records by
   *inserting*, so the block discarded its own evidence — issue #17, reproduced by someone who had
   read the note about it. `commit` was not available as the fix here, because the block drops a
   `NOT NULL` constraint before restoring it and a half-committed run would leave the schema weaker
   than the migration made it. It now uses `01_rls_isolation.sql`'s pattern: verdicts computed into
   PL/pgSQL variables inside a deliberately-aborted subtransaction, recorded outside it, with a
   `v_reached` sentinel so an early error cannot be counted as a pass and a post-condition check
   that the constraint really came back.
