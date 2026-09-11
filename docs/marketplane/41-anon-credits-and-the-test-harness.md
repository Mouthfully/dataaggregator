# 41. Spending a tenant's credits with a uuid, and a suite that could pass by not running

**PR:** #21 &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

Two defects found on the first real Supabase apply, both of which had been true for as long as the
files existed and neither of which anything could see. One is an unauthenticated write to a
tenant's money; the other is the reason a test suite is allowed to be wrong about itself.

### Issue #19 — the anon grant on a function that writes

`20260908000800_api_key_verification.sql` states an invariant — `verify_api_key` is *"the only
anon-executable function in the schema"* — and thirty lines below it grants
`consume_api_key_credits(uuid, integer)` to `anon` as well.

The comment is not merely stale. The two functions differ in exactly the property that decides
whether an `anon` grant is sound:

| | reads or writes | gated on | grant defensible? |
|---|---|---|---|
| `verify_api_key(bytea)` | reads | SHA-256 of the key | yes — producing the argument **is** the proof of possession |
| `consume_api_key_credits(uuid, integer)` | **writes `credits_used`** | an `api_key_id` | no — a uuid is an identifier, not a secret |

The anon key is public by design; it ships in browsers. So the whole authorisation for driving a
workspace's `credits_used` to its monthly ceiling was *knowing a uuid* — the kind of value that
appears in logs, error payloads, support tickets and admin screens, and which nothing in the schema
treats as sensitive. §8's hard spend cap then works exactly as specified, against the victim: the
key stops working. A v4 uuid is not guessable, so this was never trivially exploitable. It was
exploitable by anyone who read a log line.

**The decision is option 2 of the issue: take the hash, not the id.**
`consume_api_key_credits(p_key_hash bytea, p_credits integer)`. `api_keys.key_hash` is `UNIQUE`, so
the lookup is the same single indexed row it always was, and the edge's two-call shape is unchanged
— it already hashed the presented key to call `verify_api_key`, and now passes the same bytes back.

Option 1 (charge inside `verify_api_key`'s trust boundary) was rejected on a product constraint, not
a technical one: §8 promises that **a failed call is never billed**, so the charge has to happen
after the work and verification happens before it. Folding them together either bills work that did
not happen or requires a refund path, which is a ledger nobody asked for. Option 3 (keep the grant,
fix the comment) needs a stated reason why an `api_key_id` is a secret, and there is none — the
verification function deliberately does not return the hash but does return the id, precisely
because the id was never treated as sensitive.

There is no caller — `/v1/performance` returns 503 and no store adapter exists — so the signature is
free today and will not be tomorrow. The change is a `drop` and not a `create or replace`, because
replace with different argument types creates an **overload**: the id-keyed function and its `anon`
grant would both still be there, which is the defect surviving its own fix. A mutation below is
exactly that mistake.

### The part that matters more than the defect

The invariant was **written down** and contradicted thirty lines later, because nothing checked it.
So `07_anon_grants.sql` now enumerates the anon-executable functions in `public` off `pg_proc` and
fails on the **third**, rather than on a hand-written list somebody has to remember to update.

That enforcement has to live in the test suite, and it is worth saying why, because the obvious
alternative looks like it should work and does not. `20260911000100_anon_has_nothing.sql` fixed the
equivalent class for **tables** with two statements — revoke what is granted, then change the
default so a future migration's table never receives the grant. **There is no analogue for
functions.** Observed on this schema:

```
alter default privileges in schema public revoke all on functions from anon;    -- insufficient
alter default privileges in schema public revoke all on functions from public;  -- no effect at all
create function public.zz_probe() ...;
-- proacl = {=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--           ^^^^^^^^^^^ PUBLIC still holds EXECUTE, and anon is a member of PUBLIC
```

PostgreSQL's **built-in** default ACL grants `EXECUTE` on a new function to `PUBLIC`, and
`ALTER DEFAULT PRIVILEGES` is merged on top of that rather than replacing it. So every function
created in `public` is anon-executable the moment it exists, and the only defence is the explicit
`revoke all ... from public` each of these four functions carries. The "fix the class, not the
three tables" move from #20 is unavailable here; the assertion is the class fix. That asymmetry is
recorded in the migration itself so the next reader does not spend an hour rediscovering it.

### Issue #17 — a rolled-back block discards its own assertions

`app_test.check()` records a verdict by INSERTing a row, so a `begin … rollback` block throws away
its own evidence: the assertions run, the rows vanish, the summary counts what survived, and nothing
says anything was lost. **A suite that stopped running is indistinguishable from a suite that
passed.**

It was live in `01_rls_isolation.sql`'s final block, where the rollback is load-bearing — it undoes
a soft delete that would otherwise leak into files 02 through 07 — so `commit` is not the fix it was
in `06_jwt_claims.sql`. The file reported 52 and had written 54. The two lost assertions are about
whether *"delete my data"* actually removes access.

**The decision is `app_test.check_undone`: compute inside a subtransaction, record after it aborts.**
The change and the probes go into a PL/pgSQL `EXCEPTION` block — which PostgreSQL implements as a
savepoint — and that block is aborted on purpose. What survives the abort is PL/pgSQL **variables**:
they are memory, not database state, and a subtransaction rollback does not restore them. The
verdicts are inserted afterwards, in the outer transaction, which commits. That is the issue's
"savepoint" shape and its "compute-then-record-after" shape at the same time, and it needs neither a
temp table (whose contents roll back with everything else) nor a second connection.

The third shape, `dblink`, was rejected: it is the only true out-of-transaction write, and it costs
an extension **in the production schema** so that the test harness can write rows. The harness does
not get to change what is deployed.

`check_undone` also carries a `p_undone` probe that is *not* an assertion. If the setup is still in
place after the abort, the run **stops**. Leaking a soft-deleted workspace into five later files and
reporting the leak as a pass is the same failure mode in a different costume, and a test harness
that can be silently wrong about its own cleanup has no business asserting anything else.

Then the floor — `if v_total < N then raise` — is added to `01` through `05`. `06` and `07` already
had one.

### One finding against the issue

**#17 is wrong that files 02–05 lose nothing.** `02_scheduler.sql`'s final block is also
`begin … rollback`, and has been discarding its one assertion — *"a deleted workspace stops
generating work at once"* — since it was written. It is repaired the same way. That is why `02`'s
total moves as well as `01`'s.

**And the recovered assertions pass.** All three of them. There is no hidden soft-deletion defect —
what there was, for every run since they were written, was no way to tell.

## 2. Cost estimate

**Per connected account per month:** `฿0.00` — no data-plane work.

Derived rather than asserted, term by term from the table in the template:

| Term | This diff |
|---|---|
| rows/night | unchanged — no entity, grain or source is added, and no scheduler behaviour changes |
| restatement depth | unchanged — the D+1/D+3/D+7/D+28 ladder is untouched |
| Workers invocations + CPU ms | zero — no Workflow, no edge handler, no adapter; `/v1/performance` still returns 503 |
| R2 | zero objects, zero CLASS A writes |
| KV | zero writes |
| Supabase disk | unchanged — one function is dropped and one created; no table, column, index or row |
| Bought data | none |

The one runtime term that moves at all is the credit-spend call itself, and it moves **down by
nothing measurable**: the `WHERE` clause changes from `id = $1` to `key_hash = $1`, both unique
btree lookups of one row. `verify_api_key` already reads by `key_hash`, so the plan shape is one the
schema was already paying for.

§8's own open question — whether the ~98% performance margin collapses if platform limits force
3x–5x redundant polling — is untouched: this PR does not go near the scheduler, and the polling
ratio is exactly what it was.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no code path in this diff touches Google, Meta, GA4, Search Console, TikTok or
an affiliate network; no platform token of any kind is read, added or moved.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is used or introduced.

**3. No token pass-through.** `N/A` — the MCP server and the OAuth surface are not touched; no
request path forwards any token.

**4. Credential hygiene.** `PASS` — and this gate is most of the PR. The plaintext key still never
reaches the database; what changes is that the **hash becomes the argument that authorises the
write**, so an `api_key_id` stops functioning as a de facto credential the moment it appears in a
log or a support ticket. No credential is committed; the test fixtures hash synthetic strings.

**5. RLS.** `PASS` — no table is added, so no new `org_id`/`workspace_id` pair is owed. The existing
proof that org A cannot read org B and workspace A cannot read workspace B is not only intact but
**two assertions larger**, both of them about soft deletion actually removing access.

**6. No service-role bypass.** `PASS` — the whole point of the narrow anon-executable surface is
that the API edge holds no service-role key (§1 of `05-credential-vault.md`). This PR keeps the
two-call shape that makes that possible while making the second call prove possession; nothing in
the diff introduces a service key, and `07_anon_grants.sql` now fails if a third privileged entry
point appears.

**7. No cross-workspace read.** `PASS` — no query, view, cache key or aggregate is added. The
changed function addresses exactly one row, by a `UNIQUE` hash, in one workspace's key.

**8. No cross-customer aggregation or benchmarking.** `N/A` — no percentile, median, peer comparison
or training input exists anywhere in the diff.

**9. API key scope.** `PASS` — every key still resolves to exactly one workspace, and the spend
budget is now enforced **against a caller who proved possession of the key** rather than one who
named it. The tool allow-list is unchanged and still returned by `verify_api_key`.

### Data movement

**10. No resale or redistribution.** `N/A` — no platform data exists in the schema, and nothing in
this diff moves data anywhere. The billing unit is not touched.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path changes.

**12. Dependency licences.** `PASS` — no dependency added, and `pnpm-lock.yaml` is untouched. This
is also where the `dblink` option died: an extension in the production schema, added so that the
test harness could write rows, is a dependency by another name.

### PII and consent

**13. Hash at the edge.** `PASS` — no email, phone, name or address is introduced. The fixtures hash
synthetic strings (`mp_live_aaaaaaaa_secret_one`), and the function's only argument is already a
digest. Nothing is logged.

**14. Forbidden payloads rejected before egress.** `N/A` — there is no egress in this diff.

**15. Per-destination consent.** `N/A` — writes to ad platforms remain deferred past MVP; no consent
object is read or written.

### Access tier and quota

**16. Tier reality.** `N/A` — no source API is called, so no Google, Meta, GA4, Awin or Impact quota
is consumed or affected, and no back-off behaviour changes.

**17. No new long-lead dependency.** `PASS` — nothing here waits on Meta Full Access, Google Basic
or Standard, OAuth verification, a TikTok audit or any written approval. Both changes were made and
verified inside this session against a local PostgreSQL 16.

### Claims

**18. Claim provenance.** `N/A` — no user-visible copy changes, no claim becomes publishable or
unpublishable, and the brand file is untouched. `check-brand.mjs` and `check-capabilities.mjs` both
pass unchanged.

**Result:** `8 PASS, 10 N/A, 0 FAIL`

## 4. What was left out

- **`consume_api_key_credits` still does not check `expires_at`, where `verify_api_key` does.** The
  two predicates for "is this key usable" have always differed and still do. It is not exploitable
  in the flow that exists — an expired key cannot be verified, so there is no authorised work to
  charge for, and the only budget an expired key's holder can spend is their own — but two
  functions disagreeing about what a live key is will eventually be somebody's afternoon. Not folded
  in: it is a behaviour change with no failing test behind it, and this PR is about a grant.
- **The other four `public` functions' reliance on an explicit `revoke ... from public`.** There is
  no schema-level way to make that the default (see §1), so `create_organisation` and
  `accept_invitation` are closed only because their migration says so. The new enumeration assertion
  is what catches the next one that forgets. Making the revoke unnecessary is not available; making
  it *mandatory* would need a migration-linting step that does not exist.
- **`function_search_path_mutable` on eight `app` functions**, raised in #19's second half. The
  reasoning in #18 §4 still holds — all eight are `SECURITY INVOKER`, so a shadowing schema captures
  no privilege — and none is a privilege boundary. Pinning them would quiet the linter and
  contradict the helpers file's own stated rule that the pins mark `SECURITY DEFINER` boundaries.
  Still a decision, still not urgent, still not this PR.
- **A `check_undone` shared between suites.** It is defined twice, in `01` and `02`, exactly as
  `check_denied` already is. The suites are deliberately self-contained so that any one of them can
  be run alone against a fresh database; a shared harness file would be better and is a different
  change with a different blast radius.
- **`03`, `04` and `05` keep `commit` blocks that delete workspaces.** Those are correct — the
  deletions are their own last assertions and the rows are theirs — so they were given floors but
  not converted. Converting them would be motion, not improvement.
- **Asserting the absence of a `service_role` grant on the two anon functions.** `service_role`
  holds `EXECUTE` on both, from Supabase's default privileges. It bypasses RLS anyway, so the grant
  changes nothing about what it can do, and an assertion about it would be about the platform's
  defaults rather than this schema's posture.

## 5. Open or unverified spec items this builds on

- **§8's "failed calls are never billed" is what rejected option 1**, and §8 also marks the
  performance COGS and the ~98% margin **UNVERIFIED**. If the billing model changes so that
  authorisation and charge collapse into one call, option 1 becomes available again and this
  signature should be revisited — the two-call shape is a consequence of the promise, not a
  preference.
- **The edge that will call this does not exist.** `/v1/performance` returns 503 and no store
  adapter is written, so "the caller already has the hash" is a property of the design in
  `20260908000800`, verified against that file, not against running code. If the eventual adapter
  finds a reason it holds the id and not the hash at charge time, that is a finding against this
  decision and should be filed rather than worked around — re-hashing a key it no longer holds is
  not a workaround, it is the defect.
- **The hosted project runs PostgreSQL 17.6; `run-local.sh` and CI run 16.** The subtransaction
  behaviour `check_undone` depends on — PL/pgSQL variables surviving an `EXCEPTION` block's abort —
  is documented and long-standing in both, and the default-ACL behaviour recorded in §1 was observed
  on 16. Neither has been re-observed on 17.6. This is the standing gap #37 §5 already names.
- **The local harness installs pgcrypto into `public`**, where a Supabase project puts it in
  `extensions`. The new enumeration assertion excludes extension-owned functions for exactly that
  reason. It is the same "the suite tests a fiction of the platform" shape as #9 and #20, handled
  rather than fixed: aligning the shim with the platform here would be a change to `run-local.sh`'s
  bootstrap and belongs with whoever next touches it.

## 6. Verification

Everything below was run. Nothing below is what should pass.

| Gate | Result |
|---|---|
| `./supabase/tests/run-local.sh` | **pass, exit 0 — 284 database assertions, up from 272** |
| `node scripts/check-brand.mjs` | pass — 8 identity strings checked against the allowlist |
| `node scripts/check-tokens.mjs` | pass — 159 files scanned |
| `node scripts/check-dictionary.mjs` | pass — contract and schema agree |
| `node scripts/check-capabilities.mjs` | pass — the connector claim names exactly the implemented sources |

The repo-wide pre-push gate (`biome lint`, `biome format`, `pnpm -r typecheck / test / build`) was
**not** run, and this is a deliberate omission rather than a skipped step: two other workflows hold
`packages/store`, `apps/api-edge` and `packages/fx` in this same checkout while this was written, so
a repo-wide result would describe their in-flight state and not this diff. This PR touches only
`supabase/**` and one document; no TypeScript, no dependency, no lockfile.

### Per suite, before and after

| Suite | Before | After | Why it moved |
|---|---|---|---|
| `01_rls_isolation` | 52 | **54** | the two assertions the rollback was discarding, recovered |
| `02_scheduler` | 20 | **21** | a third discarded assertion, in a block #17 says does not exist |
| `03_envelope_store` | 46 | 46 | floor added only |
| `04_restatement_events` | 22 | 22 | floor added only |
| `05_webhook_delivery` | 38 | 38 | floor added only |
| `06_jwt_claims` | 12 | 12 | untouched; already had a floor |
| `07_anon_grants` | 82 | **91** | the anon-executable enumeration, and what the write can do without the key |
| **total** | **272** | **284** | |

`01` moves by exactly the two assertions that were being discarded, which is the proof #17 asks for.
Read directly out of `app_test.results` after the file ran, rather than inferred from the count:

```
 id |                         name                         | passed | detail
----+------------------------------------------------------+--------+--------
 53 | a soft-deleted workspace disappears for its owner    | t      | (null)
 54 | a soft-deleted workspace's connections disappear too | t      | (null)
```

and the setup the block needed undone, after the block:

```
c0..002 deleted_at = NULL
```

### Mutations

| # | Mutation | Caught by | Observed |
|---|---|---|---|
| 1 | `grant execute on … create_organisation … to anon` — a third anon-executable function appears | `07_anon_grants.sql`, the `pg_proc` enumeration | 2 FAILs, `90 passed / 2 failed / 92`, exit 3: *"public.create_organisation(text, text, text) is callable by anon, so it is callable by the internet"* |
| 2 | Delete the `drop function … (uuid, integer)` line, so the fix lands as an **overload** and the id-keyed function keeps its anon grant | `07_anon_grants.sql` | 3 FAILs, `89 / 3 / 92`, exit 3: *"the id-keyed consume_api_key_credits is gone, not merely superseded"* plus the set mismatch |
| 3 | Return `01`'s final block to `begin … rollback` with a plain `app_test.check()` | the new floor in `01_rls_isolation.sql` | `52 passed, 0 failed, 52` — **and the run still fails**: *"RLS isolation: only 52 assertion(s) ran; expected at least 54"*, exit 3 |
| 4 | Remove the deliberate abort from `check_undone`, so the soft delete commits | `check_undone`'s own `p_undone` guard | exit 3 before any summary: *"app_test.check_undone: the setup was NOT undone, later suites are now dirty"* |
| 5 | Change a recovered probe to claim `count(*) = 2` | `01_rls_isolation.sql` | `53 / 1 / 54`, exit 3, FAIL on *"a soft-deleted workspace disappears for its owner"* — the recovered assertions are live, not decorative |

Mutation 3 is the one worth keeping. **"52 passed, 0 failed"** is what issue #17 describes, printed
verbatim, and it is now a red build. Mutation 5 is its necessary companion: a recovered assertion
that is merely *counted* would pass mutation 3 and prove nothing.

Mutation 2 also cost a line of the file it was testing. On the first run it was caught by the wrong
thing — `consume_api_key_credits(null, 1)` became ambiguous against two overloads, and psql's
`ON_ERROR_STOP` aborted at that line before the readable assertions above it could report. The call
is now `consume_api_key_credits(null::bytea, 1)`, with the reason written beside it. Being told by
a parser error that a security assertion exists is worse than being told by the assertion.
