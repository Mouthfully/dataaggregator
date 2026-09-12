# 51. Reading one connection, and the `bytea` that fails unreadably

**PR:** `packages/store/src/connections.ts` — one `GET` against `public.connections` as
`authenticated`, needing no new database object; `CREDENTIAL_KEK` declared as a Worker binding.

This is **step 4 of `MVP-PLAN.md` §5**. With step 3 merged it is the last thing step 6 is waiting
on: the ingest runtime cannot pull a store it cannot read the credential for.

## 1. What this is, and the decision taken

### The interesting part is how little it needed

Step 1 cost a migration, a role grant and a third `MintedRole`, because the **write** reaches a
function in a schema PostgREST deliberately cannot see. This read needed **nothing**:

| | write path (step 1) | read path (this) |
|---|---|---|
| target | `app.upsert_envelope_row` | `public.connections` |
| exposed to PostgREST | no — schema `app` is a privilege boundary | yes |
| grant | `app_ingest`, created for it | `select` to `authenticated`, since `20260908000700` |
| policy | none; `security definer` bypasses RLS | `connections_select`, already written |
| new objects | a forwarder, a grant, a `MintedRole` | **none** |

`connections_select` is `to authenticated using (app.can_read_workspace(workspace_id))`, and for a
key session `can_read_workspace` opens exactly the workspace the token names. So row-level security
does the isolation, not this file — the property gate 6 asks for, and the reason the Worker still
holds no service-role key.

The schema had already answered the transport question by partitioning itself, which is the same
finding `39-store-adapter.md` records for `/v1/performance`. Two of the three adapters this product
needs are one `GET` each.

### `bytea` is the one thing on this path that fails unreadably

PostgREST hands back a `bytea` as **Postgres's own hex output** — the JSON string `"\x4f37a1…"`.
Not base64, not bytes.

`new TextEncoder().encode(value)` on that produces 2N+2 bytes of ASCII that are not the ciphertext.
AES-GCM then fails authentication with an `OperationError`, and an `OperationError` is what a wrong
KEK looks like, and a wrong DEK wrapping, and a wrong scope binding. Whoever reads it checks the
binding, then the key version, then the scope, then re-seals a test credential — and the thing that
is wrong is a string prefix two layers away.

So the decode is here, once, with the prefix **asserted rather than assumed**: base64, bare hex and
a missing `\x` are each refused with a message naming the column. And the test that proves it is
right is not a shape assertion — it seals a real credential with `@repo/vault`, puts it on the wire
exactly as PostgREST would, reads it back through the adapter and **opens it**. Mutation K1 (read
the value as UTF-8) fails there and would pass everything else.

### Three things it deliberately does not do

**It does not decide whether the connection is usable.** `status`, `revoked_at` and `expires_at`
come back verbatim; `connectionHealth` and `openCredential` judge them. `openCredential` already
refuses a revoked row, and a second opinion here would be a second place for *"is this connection
fine?"* to be answered — which is the drift `credential_lane` was added to stop one layer down.

**It does not say why it found nothing.** A connection id that does not exist and one belonging to
another workspace are the **same null**. Distinguishing them turns the adapter into an oracle for
which ids exist elsewhere, for no gain: the operator holding the ingest secret already knows the
pair it typed.

**It logs nothing.** Not the row, not the ciphertext, not a length. Same rule as `callPostgrest`'s.

### Two filters and a limit of two, all of which look redundant

- `workspace_id=eq.…` alongside `id=eq.…`, when the token's claim already narrows to one workspace.
  It can only ever narrow further — and it makes a mismatched pair answer "nothing" through the
  **query** as well as through the policy.
- `limit=2` on a primary-key lookup, where a second row is impossible. **That is what makes it worth
  asserting:** the only way to get one is a filter that did not arrive, and a dropped filter must
  not hand back an arbitrary tenant's connection as *the* connection. Same argument as the
  `limit + 1` count check on the read path, which exists for the same reason.

### `ConnectionRecord` extends `ConnectionRow`, and the first draft did the other thing

This is the one decision in the PR that was taken twice, and the second answer is the opposite of
the first. It is recorded rather than quietly corrected because the *reasoning* that produced the
wrong one is reasoning this repository uses correctly elsewhere.

The first draft declared its own fifteen fields, with `provider`, `credentialLane` and `status`
widened to `string`, on the argument that `@repo/store` should not grow a dependency on
`@repo/connections` to borrow four string unions — **which is exactly the argument
`PerformanceQuery` makes**, in a neighbouring file, for being a structural copy rather than an
import.

**The typecheck said no, and it was right.** `openCredential` takes a `ConnectionRow`; a widened
`string` is not one of its unions; so the "structural check in the Worker" that the copy was
supposed to buy *did not exist*. A copy maintained by hand against a file nothing relates it to is
the arrangement `scripts/check-providers.mjs` exists because of — and there, the drift it catches is
four enum members with no TypeScript name at all.

So the dependency is taken. It is one `import type` plus three runtime constants, `apps/api-edge` —
the only consumer — already depends on both packages, and `ConnectionRecord extends ConnectionRow`
restates nothing.

Why `PerformanceQuery` is genuinely different: it mirrors a type declared **in an app**, and a
package cannot import from an app at all. There was no dependency available to take. Here there was,
and the resemblance between the two situations was superficial.

`timezone` is on this record and **not** on `ConnectionRow`, because `ConnectionRow` is the shape
the *connect* path builds and upserts, and connect has nothing to put in it — `probeStore` returns
`{storeUrl, totalOrders}`. Adding it there would make every `connect` call site name a field it
cannot know. Moving it belongs with `scripts/seal-connection.mjs`, which is the thing that will
write one.

### The column is wider than the type, and the adapter narrows rather than casts

`app.connection_provider` carries **nine** members; `PROVIDER_LANES` names **five**. `impact`,
`awin`, `cj` and `partnerstack` are rows the database will happily hold and that no connector here
can drive — and `@repo/connections` already cannot represent one, since `ConnectionRow.provider` is
the five-member union.

So the choice is: refuse at the read, or cast a lie that surfaces as an undefined lookup during a
pull, hours later. It refuses, naming the value and what this build accepts. `credential_lane` and
`status` are narrowed the same way, against `CREDENTIAL_LANES` and a new `CONNECTION_STATUSES` —
because **a type cannot narrow a value read from a database**, and `ConnectionStatus` had no runtime
witness. The union is now derived from that constant rather than the other way round, so the two
cannot separate. The provider list is `Object.keys(PROVIDER_LANES)`, never written out.

### `CREDENTIAL_KEK` is declared ahead of its only reader, on purpose

Nothing in this PR reads it, and that is not a placeholder. **A credential sealed under one KEK
cannot be opened under another** — changing it later means re-wrapping every DEK. The thing that
seals the first one is `scripts/seal-connection.mjs` (step 5), which runs *before* the route that
opens it (step 6). A deployment configured from `env.d.ts` today is a deployment that does not have
to re-seal tomorrow.

## 2. Cost estimate

**฿0.00 per connected account per month.** One `GET` per ingest run against a table with single-digit
row counts, on a project already paid for. No R2 object, no KV write, no additional Supabase disk,
and no platform call of any kind — this adapter never leaves Supabase.

The run that *uses* it costs what `50-woocommerce-backfill.md` §2 prices; this is one request added
to the front of it.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — the row read is the customer's own sealed credential and nothing else.

**2. Vendor-key exception.** `N/A` — no company-held vendor key.

**3. No token pass-through.** `PASS` — the adapter moves **ciphertext**. It holds no KEK, cannot
open what it returns, and has no outbound request to any platform.

**4. Credential hygiene.** `PASS`, and it is the gate this PR is mostly about. The sealed bytes are
never logged, never interpolated into a URL, never placed in a header, and never returned in an
error message. `select` is an explicit column list precisely so
`developer_token_ciphertext`/`_iv`/`_wrapped_dek` — a **second** sealed credential this path has no
use for — are not moved at all. A test asserts their absence.

### Tenancy

**5. RLS.** `PASS` — the isolating mechanism, unchanged and unassisted. `connections_select` existed
before this PR; no policy, grant or table is touched.

**6. No service-role bypass.** `PASS` — an `authenticated` token with a `workspace_id` claim and no
`sub`, asserted as an exact key set. A `sub` would make `app.current_user_id()` non-null and
`app.can_write_workspace()` stop refusing, which is what stops a key session re-pointing a
connection at an attacker's account.

**7. No cross-workspace read.** `PASS` — the workspace is resolved before the call and passed
explicitly, never read from a parameter. It is both the token's only authority and an explicit
filter, and a mismatched pair answers null rather than the other tenant's row.

**8. No cross-customer aggregation.** `N/A` — one row, by primary key.

**9. API key scope.** `N/A` — no key or budget path changes. Notably the ingest route (step 6) will
**not** use an API key for this; the key stays read-only.

### Data movement

**10. No resale or redistribution.** `N/A` — no response, export or webhook surface changes. Nothing
reaches a customer from this PR.

**11. Meta client list.** `N/A`.

**12. Dependency licences.** `PASS` — nothing added to the lockfile. Two workspace edges appear
(`@repo/store` → `@repo/connections`, `apps/api-edge` → `@repo/connections`), both `workspace:*`
links to code already in this repo. No cycle: `@repo/connections` imports `@repo/vault` and
`@repo/oauth`, neither of which imports `@repo/store`.

### PII and consent

**13. Hash at the edge.** `N/A` — a connection row carries no personal data. `display_name` is
merchant-chosen and `external_account_id` is a store origin.

**14. Forbidden payloads rejected before egress.** `N/A` — nothing egresses.

**15. Per-destination consent.** `N/A`.

### Access tier and quota

**16. Tier reality.** `PASS` — a `select` on a table, on the project's existing plan.

**17. No new long-lead dependency.** `PASS` — no approval, token or audit. `CREDENTIAL_KEK` is 32
bytes from `openssl rand -base64 32`.

### Claims

**18. Claim provenance.** `N/A` — no user-visible copy, and nothing here is claimable on its own.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **No write.** The adapter reads. It cannot set `last_backfill_at`, a watermark, or a status, and
  that is not an omission this PR could fix: `connections_update` requires
  `app.can_write_workspace()`, which refuses when `app.current_user_id()` is null, and the minted
  token deliberately has no `sub`. Persisting run state needs either a `security definer` advance
  function or a human session — a decision that belongs where a caller exists to measure it against.
  Step 6 returns the checkpoint to the operator instead.
- **No list, no `by external_account_id`.** One lookup by primary key, because that is what step 6
  needs. A connections list is a dashboard's query and should be written against a dashboard.
- **No caching.** A minted token lives sixty seconds and an ingest run is manual; there is nothing
  to amortise, and a cached credential row is a credential with a longer life than it needs.
- **`ConnectionRow` did not grow a `timezone`.** See §1; it belongs with step 5.
- **No guard relates `CONNECTION_STATUSES` to `app.connection_status`.** `check-providers.mjs`
  covers the provider enum and `check-dictionary.mjs` covers sources, entity types, attribution
  windows and metrics; neither covers statuses or lanes. Adding a member to either enum and
  forgetting the other side still fails at runtime rather than at build time. Filed rather than
  folded in — it is a guard, not a line, and it belongs with whichever PR next touches that enum.
- **`CREDENTIAL_KEK` has no reader**, deliberately. See §1.
- **No route.** Nothing in `apps/api-edge/src/` calls this yet. It is a port with its first caller
  one PR away, which is the same shape `createIngestStore` shipped in.

## 5. Open or unverified spec items this builds on

- **That PostgREST serialises `bytea` as Postgres hex output** is asserted at runtime rather than
  trusted: the adapter refuses anything without the `\x` prefix rather than guessing, so a
  deployment where this is untrue fails with a message naming the column instead of failing inside a
  cipher. **It has not been checked against the live project**, because `public.connections` holds
  zero rows there — step 5 seals the first one, and that is the moment to confirm it.
- **`MintedRole`'s `authenticated` lane is verified** (`MVP-PLAN.md` §3: the project's legacy anon
  key is HS256 and not disabled), so the same token shape the read path already uses works here. If
  legacy JWT verification is ever turned off, this and `/v1/performance` die together.
- **`app.can_read_workspace` is `security definer` and relies on the migration owner carrying
  `BYPASSRLS`**, confirmed true on the live project in `MVP-PLAN.md` §3. The local suite runs as a
  superuser and structurally cannot see this.

## 6. Verification

- [x] `pnpm -r test` — **855 tests**, 0 failures (`@repo/api-edge` 114 → **130**)
- [x] `pnpm -r typecheck` — clean
- [x] `pnpm exec biome lint .` / `biome format .` — clean
- [x] **All eight guards pass**
- [x] `pnpm -r build` — clean
- [x] `./supabase/tests/run-local.sh` — twelve suites, **337 assertions**, 0 failures (unchanged:
      this PR adds no database object, which is the point)

### Every new check fires on a real defect

| # | Mutation | Caught by | Result |
|---|---|---|---|
| K1 | `decodeBytea` reads the value as UTF-8 — **the expensive misreading** | `store.test.ts` | **FAIL** — 3, including the seal→open round trip |
| K2 | the `workspace_id` filter dropped from the query | `store.test.ts` | **FAIL** |
| K4 | a missing connection raises instead of answering null | `store.test.ts` | **FAIL** — 3 |
| K6 | `workspace_id` read as nullable, giving an empty AES-GCM scope | `store.test.ts` | **FAIL** |
| K7 | the three enum columns **cast** instead of narrowed | `store.test.ts` | **FAIL** — 2 |

K1 is the one worth reading. Two of its three failures are shape assertions that any careful reader
would have written; the third is the round trip, and it is the only one that would have caught a
decode that was *nearly* right — an off-by-one on the prefix, or hex parsed in the wrong nibble
order. A cipher does not tell you which.

K7 is the mutation that would have shipped had the typecheck not objected: it is the first draft's
behaviour, expressed as a cast instead of a widened type, and it passes every shape assertion.

K6 is the same class one level up. An empty `workspaceId` does not fail loudly — `open()` binds the
ciphertext to `{workspaceId, connectionId}` as additional data, so a wrong scope produces a
ciphertext that simply does not authenticate. Identical symptom, different cause, and the row was
merely incomplete.
