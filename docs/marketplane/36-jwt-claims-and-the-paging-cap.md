# 36. Two latent defects, and the test that could not see either

**PR:** #18 &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

Issue [#9](https://github.com/Mouthfully/dataaggregator/issues/9) filed two defects that only
appear on a real Supabase project. Both are fixed here, ahead of the first migration apply, because
the first apply is exactly when one of them either bites or does not — and diagnosing an empty
result set through a brand-new store adapter is far more expensive than doing this cold.

**Defect 1, the tenancy helpers.** `app.current_user_id()` and `app.api_key_workspace_id()` read
`request.jwt.claim.sub` and `request.jwt.claim.workspace_id` — the pre-PostgREST-9 per-claim GUCs.
Current PostgREST exposes claims as one JSON object in `request.jwt.claims`. Every RLS policy in
`20260908000700_rls.sql` is built on these two functions, so if a project sets only the form the
helpers do not read, both return `NULL`, every predicate evaluates false, and **every authenticated
read returns zero rows** — not an error, an empty result a customer mistakes for lost data.

**The decision was to coalesce over both forms rather than to pick one and be right by luck.**
Supabase's own documentation contradicts itself on which form a project sets — the Realtime
Authorization page demonstrates `request.jwt.claims`, the RAG with Permissions page still describes
`auth.uid()` as reading `request.jwt.claim.sub` — and that contradiction is precisely why Supabase's
shipped `auth.uid()` reads both. The rejected alternative was to wait, observe a live project, and
then hard-code whichever form it sets: it trades a defect that cannot bite for a defect that waits
for the project to change underneath us, and it blocks on a founder action for no gain. Reading both
makes the question stop mattering.

The per-claim GUC is read **first**, so the shape the existing RLS suite has always exercised keeps
winning where both are present. That precedence is now asserted rather than incidental.

**Defect 2, the paging cap.** `MAX_LIMIT` was 1000 and PostgREST's `max_rows` is 1000. The ordinary
way to answer "is there another page?" is to ask for `limit + 1` rows and look for the extra one; at
the maximum limit that asks for 1001, PostgREST silently returns 1000, the probe never sees its
extra row, and a caller paging at the maximum is told with `ok: true` that it has everything.

**The decision was `MAX_LIMIT = 999` plus a cross-file guard, not a keyset cursor.** The issue
offered keyset paging as the better design, and it is — it removes the coupling rather than
budgeting around it. It is rejected *here* because the store adapter that would implement it does
not exist yet, and choosing a cursor design in the abstract, with no PostgREST to measure against,
is the kind of decision this repository keeps deferring on purpose. One row of headroom removes the
trap today and costs the adapter's author nothing if they later choose keyset.

**The guard is the actual deliverable of defect 2.** The two constants live in different files in
different languages and nothing relates them; the symptom — "pagination doesn't work at high
limits" — does not look like a configuration collision to whoever hits it. `performance.test.ts`
now reads `max_rows` out of `config.toml` through the same `?raw` import the Worker already uses to
assert `wrangler.jsonc`'s crons, and fails if the two ever meet again.

### The third thing, which was not in the issue

`supabase/tests/06_jwt_claims.sql` was written with each block wrapped in `begin … rollback`, to
keep the GUC settings from leaking between cases. It ran, reported **`0 passed, 0 failed, 0 total`**
and exited 0. `app_test.check()` records a verdict by INSERTing a row, so a rolled-back block
discards its own evidence; the file passed by not running.

Every block now ends in `commit` — the blocks set only transaction-local GUCs and read, so there is
nothing to undo, and `set local role` and `set_config(…, true)` revert at commit exactly as they do
at rollback. The file also asserts a **floor on the number of assertions that ran**, so a block that
silently stops recording fails the suite instead of shrinking it. The same latent hazard exists in
`01_rls_isolation.sql`'s final `rollback` block, which is not this PR's to change; it is noted in §4.

## 2. Cost estimate

**Per connected account per month:** `฿0.00` — no data-plane work.

Two SQL function bodies, one TypeScript constant, one new test file and three added unit tests. No
platform read, scheduled invocation, Worker request, database row, R2 object, KV write, Supabase
disk, bought data or dependency is added or removed. `MAX_LIMIT` bounds what one request may ask
for; lowering it by one row changes no per-account unit, because the connected-account meter counts
accounts and not response rows.

The coalesce adds one `current_setting` lookup and, only when the per-claim GUC is absent, one jsonb
parse per call. Both functions are `STABLE`, so the planner evaluates them once per statement rather
than once per row — the property the helpers file already relies on for the membership-join
decision — and the cost does not scale with result size.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no platform call, credential read or connection path changes. The helpers
resolve a session identity inside Postgres; they never touch a vault entry.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is involved.

**3. No token pass-through.** `N/A` — no MCP or OAuth request path changes.

**4. Credential hygiene.** `N/A` — no credential is stored, logged or fixtured. The new test file's
claims objects contain a fixture uuid and a role, never a token or a secret.

### Tenancy

**5. RLS.** `PASS` — no new table, and the change makes the existing policies *reachable* on a
PostgREST that sets only the JSON claims form. Isolation is asserted on that path, not assumed:
`06_jwt_claims.sql` proves a claims-JSON session reads its own organisation and workspace **and**
that it reads no other organisation's rows.

**6. No service-role bypass.** `PASS` — every end-to-end assertion in the new file runs as
`authenticated` under `set local role`, because the owner and any superuser bypass RLS and would
make the file pass trivially. No service role is introduced or used.

**7. No cross-workspace read.** `PASS` — no query, view, cache key or aggregate is added. The
coalesce widens where an identity may be *read from*, never which rows an identity may reach: the
resolved uuid still flows through the unchanged `can_read_workspace` join. The "still cannot reach
another organisation" assertion exists specifically to catch a coalesce written as "any identity in
either form".

**8. No cross-customer aggregation or benchmarking.** `N/A` — no aggregate, percentile or
cross-tenant input is added.

**9. API key scope.** `PASS` — `app.api_key_workspace_id()` still resolves exactly one workspace and
is still the entire authority of a key session; only the GUC it reads that value from is widened.
Two assertions pin that a claims-JSON key session reads its bound workspace and no other.

### Data movement

**10. No resale or redistribution.** `N/A` — no platform data moves. `MAX_LIMIT` bounds a response
that has no store behind it yet.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path changes.

**12. Dependency licences.** `PASS` — no dependency is added. The `?raw` import is a Vite build-time
transform already in use in this app.

### PII and consent

**13. Hash at the edge.** `N/A` — no payload, persistence, log or LLM prompt changes. The fixture
email in the new test file is a `.test` literal in a local-only suite, matching `01_rls_isolation`.

**14. Forbidden payloads rejected before egress.** `N/A` — there is no egress.

**15. Per-destination consent.** `N/A` — audience writes remain absent.

### Access tier and quota

**16. Tier reality.** `N/A` — no source API is called and no quota is consumed.

**17. No new long-lead dependency.** `PASS` — both fixes are self-contained. Neither needs a
Supabase project, a platform approval or a founder decision, which is why they could land now
rather than waiting behind Phase 1 of the plan in
[#13](https://github.com/Mouthfully/dataaggregator/issues/13).

### Claims

**18. Claim provenance.** `N/A` — no user-visible claim changes. `MAX_LIMIT` is not published in
any claim, and the capability gate added in #14 is untouched.

**Result:** `7 PASS, 11 N/A, 0 FAIL`

## 4. What was left out

- **Keyset paging.** The better fix for defect 2 and explicitly deferred, per §1: the adapter that
  would implement it does not exist, and designing a cursor against an unmeasured PostgREST is the
  kind of premature decision the `PerformanceStore` port exists to avoid.
- **Settling which GUC form this product's project actually sets.** It still needs one query against
  a live project, and there is no project. The coalesce is what makes the answer non-load-bearing;
  it is not a substitute for observing it. Issue #9 should stay open until it is observed, and this
  PR does not close it.
- **The same `rollback`-discards-its-own-assertions hazard in `01_rls_isolation.sql`.** Its final
  block asserts two things about soft deletion and then rolls them away, so the suite's reported
  total is two lower than the assertions it wrote. It is real, it is not this PR's, and fixing it
  means changing a file this PR otherwise does not touch, and its `rollback` is load-bearing — it
  undoes a soft delete that would otherwise leak into files 02 to 06 — so it cannot be fixed the way
  `06` was. Filed as [#17](https://github.com/Mouthfully/dataaggregator/issues/17).
- **An assertion floor on the other five database suites.** Same reasoning: the guard belongs with
  whoever next edits each file, and adding it to all six here would widen a two-defect PR into a
  test-harness change. Carried in #17.
- **`search_path` pins on the two helpers.** They remain `SECURITY INVOKER`, so a shadowing schema
  captures no privilege, and `pg_catalog` is searched before the path's own schemas — the `::jsonb`
  cast and `->>` operator resolve to built-ins either way. Pinning them would contradict the file's
  own stated rule that the pins mark `SECURITY DEFINER` privilege boundaries.
- **Any change to how the edge mints its workspace token.** `20260908000800_api_key_verification.sql`
  decides the claim's name and shape; this PR only widens where the database looks for it.

## 5. Open or unverified spec items this builds on

- **Which JWT claim form a live Supabase project sets is unobserved, and deliberately so.** If it
  turns out to set the per-claim GUCs, nothing here changes: that path is read first and is pinned
  by assertion. If it sets only the JSON object, this PR is the difference between a working product
  and every authenticated read returning zero rows.
- **PostgREST's `max_rows` is read from `supabase/config.toml`, which describes a local stack.** A
  hosted project's effective cap is a project setting, and if it is ever configured below 1000 the
  guard compares against a stale number. The guard fails loudly if `max_rows` disappears from the
  file, which is the reachable half of that risk; the hosted value should be checked at the same
  time as the claim form, in the one session that has a project.
- **No store adapter exists**, so defect 2 remains a trap rather than an observed bug. The guard is
  written to spring for whoever writes the adapter.
- Nothing here depends on the open connector, restatement-clock, access-tier or MCP-policy
  questions: no source is called and no envelope field changes.

## 6. Verification

Run on this branch at the merge of #14, against a local PostgreSQL 16 cluster.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | pass, exit 0 — 5 warnings and 1 info, all pre-existing and unchanged |
| `pnpm exec biome format .` | pass, exit 0 — 120 files, no fixes applied |
| `pnpm -r typecheck` | pass — no errors |
| `pnpm -r test` | pass — **464 unit tests, up from 461** |
| `pnpm -r build` | pass — `next build` and `wrangler deploy --dry-run` |
| `./supabase/tests/run-local.sh` | pass, exit 0 — **190 database assertions, up from 178** |
| `node scripts/check-brand.mjs` | pass |
| `node scripts/check-tokens.mjs` | pass |
| `node scripts/check-dictionary.mjs` | pass |
| `node scripts/check-capabilities.mjs` | pass |

### Mutations

Four mutations, four caught. Each was applied to the committed tree, confirmed present in the file,
observed failing, and reverted.

| Mutation | Caught by | Observed |
|---|---|---|
| Revert both helpers to reading the per-claim GUC only | `06_jwt_claims.sql` | 5 assertions fail, exit 3 |
| Reverse the coalesce so the JSON form outranks the per-claim GUC | `06_jwt_claims.sql` | "the per-claim GUC wins when both forms are present" fails, exit 3 |
| Restore `MAX_LIMIT = 1000` | `performance.test.ts` | "leaves room for a limit + 1 next-page probe" fails |
| Return one block to `begin … rollback`, so it runs but records nothing | `06_jwt_claims.sql` floor | 11 passed, 0 failed — and the run still fails: "only 11 assertion(s) ran; expected at least 12" |

**The first mutation is the one worth recording.** Under it, the other five database suites —
`01_rls_isolation`, `02_scheduler`, `03_envelope_store`, `04_restatement_events`,
`05_webhook_delivery`, 178 assertions between them — **all still passed**. That is issue #9's
central claim demonstrated rather than argued: the existing suite sets the GUC by hand and so tests
the helpers against its own assumption, and it cannot see this defect at all.

The same mutation also settles the severity question empirically, for the JSON-only case: the
assertion that failed was "a claims-JSON session reads its own workspace rather than zero rows", and
it failed by reading **zero rows**, with no error raised. Total denial, silently. What remains
unobserved is only whether a real project is in that case — which is why #9 stays open.
