# 37. The first real project, and the grant the local suite could not see

**PR:** #20 &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

A Supabase project exists. The migrations have been applied to it for the first time, which turned
three open questions into observations and produced one defect that was live, invisible to CI, and
of a class the repository had already been bitten by once.

**The project is `numbadee` in `ap-southeast-1`, and the Sydney one it replaces is paused, not
deleted.** The first project was created in `ap-southeast-2`. That value is not in
`organisations.data_region`'s CHECK constraint, which allows `eu-central-1`, `us-east-1` and
`ap-southeast-1` — the schema had already reasoned about this and chosen Singapore as the Asian
option. Supabase cannot move a project between regions, so the choice was widen the constraint or
re-create. **Re-creating won because the constraint was right**: Singapore is the nearest region to
Thailand and the schema's own answer to the question. The old project is paused rather than deleted
so the decision is reversible; the free-tier limit is two projects, which is why it had to be one
or the other.

**The product name is settled: `numbadee`.** A §12 founder decision, taken by the founder. Nothing
about the mechanism changed — `productName()` still gates on `brand.productNameSettled`, so the name
can be un-settled by flipping one boolean, and `check-brand.mjs` still bans the string everywhere
outside `brand.ts` while match-testing the infrastructure files that must carry it. The guard caught
`supabase/config.toml`'s `project_id` on the first run, which is the mechanism working.

**`brand.dataRegion` is now `ap-southeast-1`, and the `data-region` claim is still withheld.** This
is the decision worth arguing with. Setting the field satisfies the brand-fact gate, and under the
old rules the claim would have started rendering. Its text is *"Your data is held in the region you
choose."* There is one region, chosen here, and `organisations.data_region` is a column with no
picker behind it and nothing that writes it. **Recording where data lives and promising the customer
a say in it are different claims, and only the first is true**, so `data-region` now also declares
`requiresCapabilities: ["surface:region-choice"]` and stays unpublishable until choice exists. The
rejected alternative was rewording the claim to "held in Singapore": true, but it is a different
promise with a different citation, and inventing marketing copy is not what applying a migration is
for.

### The defect

`anon` held **SELECT, INSERT, UPDATE and DELETE** on `envelope_rows`, `restatement_events` and
`webhook_endpoints` on the live project. `GET /rest/v1/envelope_rows` with the anon key — the key
that ships in browsers — returned `200`.

Nothing leaked. All three are `ENABLE` + `FORCE` row level security with policies scoped
`to authenticated`, so the response was `[]` and the writes would have been refused. **Row-level
security is why it was not a breach; it is not why it was not a problem.** The repository's posture
for the other seven tables is grant-revocation *and* RLS, deliberately, and these three had one
layer where the others have two.

The cause is two mechanisms meeting:

1. `20260908000700_rls.sql` ends with `revoke all on all tables in schema public from anon`.
   `ALL TABLES` resolves **at execution time**. It covered the seven tables that existed in
   migration 0700 and said nothing about `envelope_rows` and `restatement_events` (1100) or
   `webhook_endpoints` (1200).
2. A hosted Supabase project ships
   `alter default privileges in schema public grant all on tables to anon, authenticated,
   service_role`. Verified on the project: `pg_default_acl` carries
   `anon=arwdDxtm/postgres` for `objtype='r'` in `public`. Every table created after the revoke
   arrived with full DML for `anon`.

**The decision is to fix the class, not the three tables.** The migration revokes what is granted
*and* changes the default privilege, so a table added by a future migration never receives the
grant. A revoke alone decays on the next `create table`; that is precisely how this happened.

### The part that matters more than the defect

`03_envelope_store.sql` **already asserted this**, and had since it was written:

```sql
  set local role anon;
  -- Denied before RLS is even consulted: `anon` holds no grant on this table, so the refusal is a
  -- privilege error rather than an empty result. Stronger than a zero count, and asserted as such.
  select app_test.check_denied('anon cannot read the table at all', ...
```

The assertion was correct and it passed for the wrong reason. A stock `postgres:16` container has no
Supabase default privileges, so `anon` held nothing locally no matter what the migrations did — the
test could not fail. **This is the same shape as issue #9**: the suite tests against a fiction of the
platform, and a whole class of defect is invisible until a real project exists.

So the durable fix is in `00_supabase_shim.sql`, which now models the platform's default privileges.
That single change made the existing assertion honest, and it immediately caught the live defect —
removing the new migration now fails `03_envelope_store.sql`, a file this PR does not touch.

## 2. Cost estimate

**Per connected account per month:** `฿0.00` — no data-plane work, and the project itself is free.

`get_cost` for a new project in this organisation returns `$0/month`, confirming the finding in #13
that the "single largest blocker" in `HANDOVER.md` §5 was sitting behind an unpriced assumption. The
diff adds one migration of `revoke`/`alter default privileges`, one test file, three shim lines,
three brand-file values and a capability id. No platform read, scheduled invocation, Worker request,
R2 object, KV write, bought data or dependency.

Supabase disk — the line §7 names as most likely to break — is unchanged: the schema holds no rows.
The paused Sydney project accrues nothing while paused.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no platform call or credential path changes. No customer credential exists yet;
`connections.credential_ciphertext` is empty on the project.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is used.

**3. No token pass-through.** `N/A` — no MCP or OAuth request path changes.

**4. Credential hygiene.** `PASS` — the project's anon and publishable keys are designed to be
public and are not secrets; no service-role key was requested, held or used at any point, which is
the property `05-credential-vault.md` depends on. No credential is committed.

### Tenancy

**5. RLS.** `PASS` — verified on the live project rather than asserted: all ten `public` tables are
`relrowsecurity` **and** `relforcerowsecurity`, with 25 policies between them. The schema fingerprint
(columns, constraints, policies, indexes, functions, enums, RLS flags — 323 objects) hashes
identically to a local database built from the same migration files.

**6. No service-role bypass.** `PASS` — no service-role key was used to apply or verify anything.
The end-to-end read below ran as `authenticated`; the owner and any superuser bypass RLS and would
have made it pass trivially.

**7. No cross-workspace read.** `PASS` — and this gate is the reason the defect is filed as a defect
rather than a note. `anon` holding DML on `envelope_rows` is not a cross-workspace read while RLS
holds, but it is one policy mistake away from being one. It now holds nothing.

**8. No cross-customer aggregation or benchmarking.** `N/A` — no aggregate or cross-tenant input.

**9. API key scope.** `N/A` — unchanged. The anon-executable `consume_api_key_credits` contradiction
found during this work is filed as #19 rather than fixed here; it is a different decision.

### Data movement

**10. No resale or redistribution.** `N/A` — no platform data exists or moves.

**11. Meta client list.** `N/A` — no Meta onboarding or lifecycle path changes.

**12. Dependency licences.** `PASS` — no dependency added.

### PII and consent

**13. Hash at the edge.** `PASS` — the verification fixture used a synthetic uuid and no email; the
signup probe was abandoned rather than send mail to a domain the project does not own, and every
fixture row was deleted afterwards (`organisations`, `workspaces`, `members`, `envelope_rows` and
`auth.users` all confirmed at 0).

**14. Forbidden payloads rejected before egress.** `N/A` — no egress.

**15. Per-destination consent.** `N/A` — writes remain deferred.

### Access tier and quota

**16. Tier reality.** `PASS` — free tier, two-project limit, which is why Sydney is paused. No source
API is called.

**17. No new long-lead dependency.** `PASS` — no approval needed. The project was created and applied
inside this session.

### Claims

**18. Claim provenance.** `PASS`, and this is the gate the PR does the most work for. Settling the
product name un-gates it across the site, and the guard proves it still lives in one file. Setting
`dataRegion` would have published *"held in the region you choose"* — a promise nobody can keep
today — so the claim is withheld on the capability axis instead, with a test that fails if it ever
becomes allowed while `surface:region-choice` is absent.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **Deleting the Sydney project.** Paused instead: reversible, and the decision to re-create should
  be inspectable for a while. It holds schema and no rows.
- **`consume_api_key_credits`'s anon grant**, which contradicts the comment thirty lines above it.
  Filed as #19. It is a security *decision* with three plausible answers, not a typo, and folding it
  in would hide it.
- **`function_search_path_mutable` on eight `app` functions.** Also #19, with the reasoning for why
  the eight are not privilege boundaries. Unchanged from #18 §4.
- **Pinning `major_version` in `config.toml` to the hosted Postgres.** The file says 16; the project
  runs 17.6. Nothing in this diff is version-sensitive and the fingerprints match across both, but
  the local stack and CI model a different major version from production. Its own change.
- **An `auth.users` signup path, and any end-to-end test through a real login.** Needs an email
  domain the project owns, or a service-role key to use the admin API. Neither exists, and
  `example.com` is rejected by Supabase's validator. The RLS verification below is the honest
  substitute and says what it does not cover.
- **RLS on Supabase's own tables.** `auth`, `vault`, `realtime` and `supabase_migrations` carry
  tables without RLS. They are not exposed through PostgREST — verified, `/rest/v1/users` and
  `/rest/v1/vault.secrets` both return 404 — and they are managed by platform services that connect
  as their own roles. Enabling RLS on them risks breaking login and secret decryption for no gain.
- **Rewording the `data-region` claim.** See §1: a true sentence about Singapore is a different
  claim with a different citation, and this PR is not where marketing copy gets written.

## 5. Open or unverified spec items this builds on

- **The data region is now decided, and the EU question is not.** `ap-southeast-1` makes the Thai
  entity's data Asian, which does not help any GDPR or DPA claim; both remain withheld behind
  `euRepresentative` and `dpaAvailable` exactly as before. `01-brand-identity.md`'s three-way split
  of what "EU hosting" conflates is untouched by this.
- **The domain is still unsettled**, so `siteUrl()` still refuses to guess in production. Settling
  the name does not settle the domain, and §11A.13's clock starts at the domain, not the name.
- **Whether `numbadee` survives contact with trademark and domain availability** is a founder matter.
  The repository's cost of changing it is one file and one `project_id` line, which is what the
  brand-file design was for.
- **The hosted project runs Postgres 17.6; CI and `run-local.sh` run 16.** The 323-object fingerprint
  matches across both, so nothing in the schema depends on the difference today. It is a standing
  gap between what CI proves and what production runs.
- **Region choice is declared as a capability that does not exist.** If it is never built, the
  `data-region` claim is never publishable — which is the correct outcome, not a loose end.

## 6. Verification

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | pass, exit 0 — 5 warnings, 1 info, all pre-existing |
| `pnpm exec biome format .` | pass — 120 files, no fixes applied |
| `pnpm -r typecheck` | pass — no errors |
| `pnpm -r test` | pass — **465 unit tests, up from 464** |
| `pnpm -r build` | pass |
| `./supabase/tests/run-local.sh` | pass, exit 0 — **272 database assertions, up from 190** |
| `node scripts/check-brand.mjs` | pass — after it caught `config.toml`, which is the point of it |
| `node scripts/check-tokens.mjs` | pass |
| `node scripts/check-dictionary.mjs` | pass |
| `node scripts/check-capabilities.mjs` | pass |

### Against the live project

| Check | Result |
|---|---|
| Schema fingerprint vs local | **identical** — `b221a0cbad0403d27d94909cb9e2251a`, 323 objects |
| All ten `public` tables | `relrowsecurity` **and** `relforcerowsecurity`, 25 policies |
| `anon` privileges on `public`, after | zero on all ten tables, all seven privilege types |
| `GET /rest/v1/{envelope_rows,restatement_events,webhook_endpoints,organisations}` as anon | `401 permission denied` on all four — a privilege error, which is what `03_envelope_store.sql` says it should be |
| `auth.users`, `vault.secrets` over PostgREST | `404` — not exposed |
| Authenticated read, claims-JSON session only | `app.current_user_id()` resolves; own org 1, own workspace 1, **other orgs 0** |
| Fixture cleanup | `organisations`, `workspaces`, `members`, `envelope_rows`, `auth.users` all 0 |

The fingerprint check earned its place. The first apply transcribed the migrations with comments
stripped, and the comparison caught four functions whose *bodies* differed — `pg_get_functiondef`
returns the source verbatim, comments included. Logic was identical (whitespace-stripped hashes
matched) but the deployed source had lost its reasoning, which in this repository is most of the
value. Re-applied with comments; the Singapore project was applied comment-intact and matched
first time.

### Mutations

| Mutation | Caught by | Observed |
|---|---|---|
| Remove `20260911000100_anon_has_nothing.sql` | `03_envelope_store.sql` — **a file this PR does not touch** | "anon cannot read the table at all: POLICY BYPASS: affected 1 row(s)", exit 3 |
| Remove the three `alter default privileges` lines from the shim | the same assertion silently passes again | the defect becomes invisible, which is the state this PR found the repository in |

The first mutation is the result worth keeping. The assertion that catches it is older than this PR
and was written by someone who had the invariant exactly right; it could not fail because the test
database was not the platform. **The fix that mattered was three lines in a shim, not the migration.**
