# 39. The store adapter, and the two silent answers it refuses to give

**PR:** _not yet opened_ &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`/v1/performance` has answered **503** since `16-performance-endpoint.md`, because `PerformanceStore`
was a port and the transport behind it could not be chosen honestly against a Supabase project that
did not exist. One exists now (`37-first-real-project.md`), so this is the adapter: a new package
`@repo/store`, wired into the Worker's route, with the 503 kept and repurposed.

**The transport decision was already taken by the schema, which partitioned itself.** Everything a
web identity touches is in `public` and granted to `authenticated`; everything a system role touches
is in `app`, and `supabase/config.toml` deliberately does not expose `app` to PostgREST. So the read
path needs **zero new database objects**: it is one `GET /rest/v1/envelope_rows` as `authenticated`,
carrying a short-lived HS256 token the Worker mints with the `workspace_id` claim that
`20260908000800_api_key_verification.sql` designed. The alternative — a direct connection through
Hyperdrive — remains the right answer for the **scheduled** half, whose role `app_webhook` is
`NOLOGIN` and whose vocabulary lives entirely in `app`. That is a separate decision with its own cost
line and is **not** taken here; `scheduled` still passes a null store and still says so.

**No dependency was added.** Not supabase-js, not postgrest-js. `fetch` and `crypto.subtle` are all
workerd needs to sign an HS256 token and make a request, and the whole surface is one GET and one RPC
POST. The rejected alternative — a client library — would have bought a bundle, a second place for
the tenancy rules to live, and a peer-dependency surface next to a `vitest` pin the repository cannot
afford to float.

**The authenticator is in this unit, not after it.** The workspace is not a query parameter — it
comes from the credential — so the store is literally unreachable without resolving one. `verify_api
_key` is the same transport, the same package and the same request; splitting it would have shipped a
store nothing could call and a 503 that was still a 503.

### The two silent answers this refuses to give

Both are failures the module note in `performance.ts` already argues against, one layer down.

**1. `as_of` is refused, not ignored.** `16-performance-endpoint.md` §5.3 recorded the problem in
plain words: the parameter is validated at the boundary and honoured by nothing, so *"a request with
`as_of` returns the same rows as one without, and that must not be sold."* `envelope_rows` holds one
current row per upsert key — there is no valid-time history to read — so this is not a bitemporal
read done badly, it is one the schema cannot answer at all. Answering it with today's numbers under
`ok: true` and an echoed `meta.as_of` tells a customer that this is what the platform reported three
weeks ago. It is not. The adapter throws, and the route answers **501 naming the parameter**. The
rejected alternative was leaving it as it was; that is the documented lie, kept.

**2. Paging is keyset, not `offset`.** `36-jwt-claims-and-the-paging-cap.md` left this choice to
whoever wrote the adapter. `offset` is trivially correct to *write* and wrong in exactly the way this
endpoint must never be wrong: the nightly re-pull **inserts** rows for dates inside the window a
customer is already paging through, an offset counted against a set that grew underneath you **skips
a row**, and the result is a total quietly too low returned with `ok: true`. Keyset cannot skip.

The cost is a filter that can be wrong **out loud**: a malformed `or=(…)` predicate is a PostgREST
400 on page two, where an offset that skips a row is a 200. Only one of those is discoverable by the
person holding the numbers.

The order is `date.desc, account_id.asc, entity_id.asc, attribution_window.asc.nullsfirst` — four
columns because the unique constraint is six and the query fixes two, and a keyset boundary on a
non-unique tuple skips the rest of the tie. **`nullsfirst` is load-bearing.** `attribution_window` is
legitimately null on an impressions-only row, SQL comparison against NULL yields NULL, and
`attribution_window.gt.<x>` would silently drop every unlabelled row. Ordering NULLs first makes
"after this window" expressible in both cases: after a NULL is `not.is.null`, after a value is `gt.`.

### Three smaller decisions worth the record

**Every filter value is quoted, always.** A PostgREST filter is `column=operator.value`, and `,`
`.` `(` `)` `"` all have meaning in that grammar — while `entity_id` and `account_id` are arbitrary
platform text (a search term is a customer's sentence; a GA4 page path carries commas as a matter of
course). An unquoted comma inside `or=(…)` does not error: **it ends the condition and starts
another**, producing a filter that means something else and still returns rows.

**The metric columns in `select=` come from `METRICS`, not from a hand-written list.**
`check-dictionary.mjs` already asserts the contract's dictionary against the migration's columns,
name for name and order for order. A fourth copy here would be one the guard does not read, and a
metric added under §13.3 rule 2 would be stored, constrained, typed — and silently absent from every
read. Everything else in the list *is* written out, because `select=*` would pull `raw_key` and make
a renamed column an `undefined` field instead of a PostgREST 400 that names it.

**A null metric column is an absent metric.** Not zero — `spend: 0` on a day with no spend data is
the most damaging lie this envelope could tell. Not null either — `metricsSchema` is `.strict()` over
optional numbers and would fail the whole request over a perfectly sound row. Omitting is the only
honest mapping, and the same rule covers `entity_name` and `parent_id`, which the contract makes
`.optional()` rather than `.nullable()`.

### The 503 did not go away; it changed meaning

It was *"this has not been decided"*. It is now *"`SUPABASE_JWT_SECRET` is missing on this
deployment"* — the same status, with the binding named, because a deployment that cannot reach its
database and a workspace with no rows must not look alike and `data: []` makes them identical.

## 2. Cost estimate

**Per connected account per month:** `$0.0006` — about twenty times `16-performance-endpoint.md`'s
figure for the same endpoint, and still the cheapest line in the model. The increase is entirely
Supabase egress, which that note could not price because it had no database.

| Term | Where it comes from | Figure |
|---|---|---|
| Reads | §16's unit, unchanged: ~5 per dashboard load, a daily-checking customer ~150/month | 150 |
| Workers requests | $0.30/million | **$0.000045** |
| Workers CPU | parse + **two** HMAC-SHA256 signings (~0.2 ms) + up to 999 zod validations ≈ 2–4 ms | inside the 10 ms allotment |
| Worker subrequests | **2 per read now, not 0**: `verify_api_key`, then the row select | not billed; 0.2% of the 1,000-per-request limit |
| Supabase egress | 150 × ~40 KB (a 100-row page at §16's ~400 B/row) ≈ 6 MB, at $0.09/GB beyond the included 5 GB | **$0.00054** |
| Supabase statements | 450/month: 150 key lookups, **150 `api_keys.last_used_at` updates**, 150 range scans | inside a shared Micro instance |
| R2 | none — `raw_key` is neither read nor emitted | $0.00 |
| KV | none — nothing is cached | $0.00 |
| Supabase disk | unchanged; this unit writes no row | $0.00 |
| Bought data | none | $0.00 |

**The line worth naming is not a dollar figure: every read is also a write.** `verify_api_key` does
`update public.api_keys set last_used_at = now()` on every authorised call, which the migration
justifies plainly — *"the alternative is a key nobody can tell is unused, which is the key nobody ever
revokes"*. It is one indexed update against a tiny table and costs nothing measurable, but a "read
endpoint" that writes on every request is the kind of fact that should be in the record before
somebody discovers it in a lock-contention graph.

The two bounds are what hold the rest down. `MAX_RANGE_DAYS = 400` stops one request scanning a
customer's whole history; `MAX_LIMIT = 999` caps the scan, the validation work and the response size.
The `limit + 1` probe costs exactly one extra row per page — 1% at the default limit of 100, 0.1% at
the maximum.

Three caveats that must be repeated rather than assumed away:

* **§8 marks the performance COGS and the ~98% margin UNVERIFIED.** Nothing here measures either.
* **§7's cost table has no disk-growth term**, by its own checker's admission. Unchanged: this unit
  adds no row.
* **§8's sharpest open question — the margin collapsing if platform limits force 3×–5× redundant
  polling — is about the WRITE side.** This is the read side and polls nothing. If anything it is the
  argument *for* the materialised store: §7 concluded live passthrough was off the table precisely
  because of GA4's token quotas, and this is the endpoint that makes the store worth having.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — no platform call, platform credential or connection-vault read on this path. The
only credentials involved are **ours**: the caller's API key, resolved to one workspace, and the
project's own JWT secret. No `process.env.*_ACCESS_TOKEN`, no developer token, no GCP project.

**2. Vendor-key exception.** `N/A` — no company-held vendor key; no bought data is touched.

**3. No token pass-through.** `PASS` in the direction that applies: the presented API key **never
leaves the isolate** — only its SHA-256 travels, and `verify_api_key` takes a hash by design so the
credential reaches no query log and no backup. The `Authenticator` returns only a workspace id, so
nothing downstream can forward anything. RFC 9728 / RFC 8707 / PKCE belong to the MCP and OAuth
surfaces, which this is not.

**4. Credential hygiene.** `PASS` — the JWT signing secret is a Worker secret: never committed, never
a `var`, never in `wrangler.jsonc`, never in a fixture, and asserted absent from the request the
adapter actually makes. PostgREST's `details` and `hint` are dropped before any error is constructed,
because both echo the failing query and a failing query here carries the caller's own filter values;
the log line is `{route, failure, upstream_status, request_id}` and nothing else — the same "counts
and reasons only" rule as `ScheduledOutcome`. A rejected credential yields `invalid_credential` with
no hint as to whether the key is unknown, revoked, expired or bound to a deleted workspace. The
token-death half of this gate is `N/A`: no platform grant is touched.

### Tenancy

**5. RLS.** `PASS` — no new table, no new database object of any kind. The read runs as
`authenticated` under a token whose `workspace_id` claim is the entire authority of the session, and
`envelope_rows_select`'s `app.can_read_workspace(workspace_id)` is what filters. The cross-tenant
assertion is the existing `01_rls_isolation.sql` and `06_jwt_claims.sql` work; this unit adds the
transport that finally exercises it.

**6. No service-role bypass.** `PASS`, and this gate is the one the whole design is built around. The
Worker holds **no service-role key** and this PR does not introduce a path to one. The minted token
carries `role: authenticated` and is subject to every policy. The residual risk is stated rather than
buried, exactly as the migration states it: anything that can mint tokens can mint one for any
workspace. That is strictly better than a service key, which bypasses the policies rather than being
subject to them, and the mitigations are the 60-second TTL, a secret that exists only as a Worker
binding, and the fact that no policy opens `api_keys`, `members` or `invitations` to a key session.

**7. No cross-workspace read.** `PASS` — the workspace comes from the credential and appears twice:
as the token claim RLS enforces, and as an explicit `workspace_id=eq.` filter sent for the planner's
sake so the range scan can use `envelope_rows_read_idx`. A redundant filter can only narrow what RLS
already allows. The **cursor is deliberately unsigned** and that is safe for the same reason: every
filter ANDs, so a forged cursor can only move the boundary within the workspace, source and date
range the request already fixed — the worst a caller can do with a handmade cursor is skip their own
rows. No `GROUP BY`, no roll-up, no shared cache key; nothing is cached at all.

**8. No cross-customer aggregation or benchmarking.** `PASS` — the endpoint returns rows. No
percentile, median, industry average, peer comparison or training input exists here to leak across
tenants.

**9. API key scope.** `PASS` on the half this unit owns: a key resolves to **exactly one** workspace,
and the type makes any other outcome unrepresentable — `{workspaceId}` or an error, never a list.
**Spend budget and tool allow-list are still NOT enforced**, unchanged from §16's §4:
`verify_api_key` returns `allowed_tools` and `credits_remaining` and this adapter deliberately drops
both rather than half-implementing a budget. Carried in §4 below, not silently skipped.

### Data movement

**10. No resale or redistribution.** `PASS` — a workspace's own data returned to that workspace and
nowhere else. `credits_used` stays 0 and the billing unit is per connected account (§11.3), so no
billing unit is denominated in platform rows. Nothing is exported, shared or webhooked by this path.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path changes.

**12. Dependency licences.** `PASS` — **no npm dependency added, removed or upgraded.** One new
workspace package, `@repo/store`, depending only on `@repo/contract`.

### PII and consent

**13. Hash at the edge.** `PASS` — a read path. Nothing is persisted except `api_keys.last_used_at`
(a timestamp), nothing is logged beyond a failure kind and a status, and no email, phone, name or
address exists anywhere on this path. The one thing that could have leaked is the R2 object key:
`raw_key` is neither selected nor emitted, because an internal storage key is not the customer's
"verbatim platform response" and naming our bucket layout in a response would be wrong twice.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress of customer-supplied payloads.

**15. Per-destination consent.** `N/A` — audience writes remain absent.

### Access tier and quota

**16. Tier reality.** `PASS` — no source API is called, so no platform quota is consumed and no
back-off applies. The only ceiling in play is PostgREST's own `max_rows`, and the `limit + 1` probe
fits inside it by `MAX_LIMIT = 999` rather than by luck; the hosted project's effective value is
still unchecked and is carried in §5. Per-source budget in the envelope is still absent — §16's §4
item, unchanged.

**17. No new long-lead dependency.** `PASS` — no approval, audit or verification queue. The project
exists, and the deployment needs three bindings and one `wrangler secret put`.

### Claims

**18. Claim provenance.** `PASS` — no user-visible marketing string is added, and no brand or claim
file is touched. The 503, 501 and 502 bodies are plain statements of what did not happen. **This PR
removes a potential false claim rather than adding one**: refusing `as_of` retires the "bitemporal
read" the endpoint was accepting and could not honour, which §16 §5.3 explicitly said must not be
sold.

**Result:** `14 PASS, 4 N/A, 0 FAIL`

## 4. What was left out

- **THE WEBHOOK DRAIN'S TRANSPORT — the deliberate deferral.** `app_webhook` is `NOLOGIN` and its
  whole vocabulary (`app.due_restatement_events`, `app.record_delivery`,
  `app.prune_restatement_events`) is in the schema PostgREST does not expose, so it needs either a
  grant and a login role or a direct connection through **Hyperdrive** — a different identity, a
  different pooling story and its own cost line. This unit is the READ path. `scheduled` still passes
  a null store and still reports `not_configured`, unchanged.
- **`pnpm-lock.yaml` is deliberately NOT regenerated, and CI will fail on that until it is.** Adding
  `@repo/store` and `"@repo/store": "workspace:*"` to `apps/api-edge` changes the lockfile's
  importers, and CI installs with `--frozen-lockfile`. The repository rule for this change forbade
  touching the lockfile — correctly, since two other workflows share this checkout — so the next step
  is one `pnpm install` on a quiet tree. Everything verified below ran against a hand-linked
  `node_modules`, which is what `pnpm install` will produce.
- **Spend budget and tool allow-list.** Gate 9 is half-satisfied. `allowed_tools` and
  `credits_remaining` are on the verification result and are dropped rather than half-enforced;
  `consume_api_key_credits` also carries the open anon-grant question filed as #19. This is §15 work
  and belongs with whoever settles that, not folded in here.
- **Rate limiting.** Nothing stops a caller issuing the maximum query in a loop. §16 §4 named
  Cloudflare's rate-limiting binding keyed on the API key; it needs the key resolved first, which is
  now true, so this became *possible* in this PR rather than *done in* it.
- **Retry and back-off on a transient PostgREST failure.** `@repo/extract`'s `fetchWithRetry` exists,
  and it is built around platform quota semantics — rejected requests counting against a shared
  developer-token ceiling — which describe nothing about our own database. A synchronous read the
  customer will retry themselves is a different problem from a nightly pull nobody is watching, and
  choosing a policy for it without a latency measurement would be a guess.
- **Caching the minted token or the imported `CryptoKey` within an isolate.** Two HMAC signings per
  request is ~0.2 ms against a 10 ms allotment, and a cached token is a token outliving the request
  that justified it. Not worth trading the TTL for.
- **`as_of` as a feature.** It is refused, not implemented. Implementing it means valid-time history
  — a second row per key, or an audit table — which is a schema decision, a disk-cost decision and
  §7's most-likely-to-break line all at once.
- **Anything in `wrangler.jsonc`.** The three bindings are a secret and two deployment-specific vars,
  and committing a project URL would put a guess about *which project* into the repository — the same
  mistake `supabase/config.toml` refuses to make about `site_url`. They are declared once in
  `env.d.ts`, which that file states is the single declaration point.
- **A second failure, not mine to fix:** `node scripts/check-capabilities.mjs` goes red in this
  checkout because another workflow added `search_console`, `google_ads` and `meta_ads` under
  `packages/connectors/src/sources` without extending the connector claim in
  `packages/brand/src/claims.ts` — the guard working exactly as designed, on somebody else's
  in-flight change. Fixing it would mean editing a brand file and a claim list this unit has no
  business in, and the correct resolution is that workflow's, not this one's. Recorded in §6 with
  timestamps rather than silently repaired or quietly reported as green.

## 5. Open or unverified spec items this builds on

No Supabase project was reachable from this session, so **everything below is a decision made against
documentation and the schema rather than against a live PostgREST.** Each is written so that being
wrong produces a loud failure rather than a wrong number.

1. **How PostgREST renders `numeric`.** PostgreSQL emits it into JSON unquoted, so a metric should
   arrive as a JSON number. The mapper accepts the decimal-string spelling as well, because that is
   the same value in the other legal form and `Number()` on it is lossless in exactly the way
   `JSON.parse` on the unquoted form already was. If both readings are wrong, the value passes
   through untouched and the envelope refuses the row — which is refusal 2 working, not a silent zero.
2. **Whether `verify_api_key`'s composite comes back as an object.** `app.api_key_context` is
   declared in `app`, which `config.toml` does not expose to PostgREST, so an unexpanded record
   literal is a real possible answer. The adapter **refuses an unrecognised shape rather than reading
   it as a rejected credential** — reading it as "invalid" would 401 every caller holding a perfectly
   good key and make a deployment fault look like theirs. Worth a single call against the live
   project before this is relied on.
3. **Whether the hosted API gateway accepts `apikey: <publishable key>` alongside a self-minted
   `Authorization: Bearer`.** PostgREST validates the token against the project's JWT secret, which is
   what we sign with; the gateway leg is the unverified half. If it refuses, the failure is a 401
   surfaced as a 502 on every request — immediate and unmistakable.
4. **No `aud` claim is minted**, on the reasoning that the project's own publishable key carries none
   and so audience validation cannot be enabled without breaking the key Supabase itself hands out.
   Unverified.
5. **The hosted project's effective `max_rows`.** `36-jwt-claims-and-the-paging-cap.md` §5 flagged
   this and it is still unchecked: `supabase/config.toml` describes a local stack, and a hosted
   project configured below 1000 would truncate the `limit + 1` probe at high limits and report a
   short page as complete. The `MAX_LIMIT` guard in `performance.test.ts` compares against the file,
   which is the reachable half. **This should be checked in the same session that checks item 2.**
6. **A `numeric(20,6)` beyond 2⁵³ loses precision crossing JSON**, whichever spelling it arrives in.
   Not reachable at any plausible ad spend or order count, and named so nobody has to rediscover it.
7. **Enum ordering.** The keyset relies on `attribution_window`'s comparison order matching
   PostgREST's `order`, which holds because Postgres sorts an enum by definition order and
   `20260908001100_envelope_rows.sql` appends members rather than inserting them. That migration
   already says so; the keyset is now a second thing that depends on it.
8. **The nested `or=(…)` grammar has never met a real PostgREST.** It is asserted character for
   character in a test, which pins what we *believe* it should be; the belief itself is unverified.
   A mistake here is a 400 on page two, by design.
9. **Refusing `as_of` is a behaviour change at the API boundary.** A caller who was sending it and
   ignoring the fact that it did nothing now gets a 501. That is the point — §16 §5.3 said the
   present behaviour must not be sold — but it is a change, and it reverses if valid-time history is
   ever built.
10. Nothing here depends on the open connector, restatement-clock, access-tier or MCP-policy
    questions: no source is called and no envelope field changes.

## 6. Verification

Run on this branch, in a checkout other workflows were concurrently editing (`packages/fx/**`,
`supabase/**`, and — during these runs — `packages/connectors/**` and `packages/brand/**`). Two gates
below therefore have timestamps: a repository-wide check run against a tree somebody else is halfway
through is a measurement of their work as much as of mine, and saying "green" without saying when
would be worthless.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | **pass, exit 0** — 152 files on the final run, 6 warnings and 1 info. Every finding is in `packages/connectors/**`, `packages/oauth/**` or `scripts/check-dictionary.mjs`; **none is in a file this PR touches.** |
| `pnpm exec biome format --write <own files>` | **pass, exit 0** — 13 files, no fixes applied on the final run |
| `pnpm -r typecheck` | **pass — all 14 workspace projects**, `@repo/store` and `@repo/api-edge` among them. (It failed transiently at 17:09 on `packages/connectors/.../paging.test.ts(228,9): TS2322`, a file another workflow was writing at the time; that workflow fixed it and the final run is clean.) |
| `pnpm --filter @repo/api-edge test` | **pass — 100 tests in 9 files, up from 68 in 8.** 32 new, in real workerd. |
| `node scripts/check-brand.mjs` | **pass** — 8 identity strings checked against the allowlist |
| `node scripts/check-tokens.mjs` | **pass** — 161 files scanned |
| `node scripts/check-dictionary.mjs` | **pass** — contract and schema agree on sources, entity types, attribution windows, metrics, the fx constraint and the restatement trigger |
| `node scripts/check-capabilities.mjs` | **passed at 17:05, FAILS at 17:13 — and not because of this PR.** Another workflow created `packages/connectors/src/sources/{search_console,google_ads,meta_ads}` between those two runs without updating `packages/brand/src/claims.ts`, and the guard reports exactly that: *"implemented source `google_ads` is absent from the connector-claim source list"*, ×3. Neither file is in this unit's scope and neither is touched by this diff. See §4. |

`pnpm -r test` and `pnpm -r build` were **not** run: the instruction for this unit was to run only
this package's tests while two other workflows hold the same checkout. `pnpm -r typecheck` is in the
gate list and was run in full, which is how the `connectors` failure above was seen at all.

**No network call was made by any test.** Every `fetch` is a fake with a queue of canned responses,
and no test needs a Supabase project. The signing secret in the file is a fixture and is obviously
one; the real secret exists only as a Worker secret.

### Mutations

Seven mutations, seven caught. Each was applied to the working tree, confirmed present in the file,
observed failing, and reverted — with a byte-for-byte diff against the pre-mutation copy afterwards.

| # | Mutation | Caught by | Observed |
|---|---|---|---|
| 1 | Add a `sub` claim to the minted token | "carries role, workspace_id and a one-minute expiry — and no `sub`"; "verifies as `anon`…" | 2 failed / 98 passed — `expected [ 'exp', 'iat', 'role', 'sub', …(1) ] to deeply equal [ Array(4) ]` |
| 2 | Build the cursor from the **probe** row instead of the last row returned | 4 tests across the paging block | 4 failed / 96 passed — `expected { d: '2026-08-14', …(3) } to deeply equal { … }` |
| 3 | Make `quote()` return its value unchanged | "filters by workspace, source and the date range…"; the keyset predicate; the punctuation test | 3 failed / 97 passed — `expected 'eq.7c000000-…' to be 'eq."7c000000-…"'` |
| 4 | Report a null metric column as `0` | "omits a null metric column rather than reporting it as zero" | 1 failed / 99 passed — `expected [ 'clicks', 'commission', …(9) ] to deeply equal [ 'conversions', 'sessions' ]` |
| 5 | Ignore `as_of` instead of refusing it | "refuses `as_of` rather than answering it with today's numbers" | 1 failed / 99 passed — the store made a request it should never have made |
| 6 | Drop the `limit` parameter from the query | "asks for one row more than the limit…" | 1 failed / 99 passed — `expected null to be '1000'` |
| 7 | Express "after a null window" as `attribution_window.gt.""` | "expresses `after a null attribution_window` as `not.is.null`…" | 1 failed / 99 passed — the predicate that silently drops every unlabelled row |

**Mutations 2 and 7 are the two worth keeping.** Both are one-token changes that leave every other
test green, produce a perfectly valid-looking PostgREST query, and return `200` with a total quietly
too low — which is the exact failure mode this endpoint exists to make impossible. They are the
reason the paging assertions pin the predicate character for character instead of checking that a
cursor is merely present.

One gap found while mutating and closed rather than noted: the fake fetch does not honour `select`,
so **every test would have kept passing with a column missing from `SELECT_COLUMNS`**. The test
"selects enough columns to build a whole envelope row" projects the fixture row onto the select list
and asserts the result still satisfies `envelopeRowSchema`, which makes the list's *sufficiency*
testable rather than assumed.
