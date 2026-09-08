# 03. Supabase schema, tenancy and row-level security

## 1. What this is, and the decisions taken

The account model from specification section 15 as nine migrations, plus the row-level security that
makes "strict tenant isolation" and "no cross-workspace aggregation ever" properties of the database
rather than of whichever codebase happens to be reading it. The API edge, the dashboard's server
actions and the scheduler are three codebases in two runtimes; a rule enforced in three places is a
rule enforced in none.

These are the three gaps `00-repo-map.md` section 10 said were unspecified rather than contested,
so they are decided here rather than discovered mid-build.

### Gap 1 — tenancy resolves through a membership join, not JWT claims

Custom claims via an auth hook are faster: no subquery per policy evaluation. They are also a
**snapshot**. Remove someone from a workspace and their existing token keeps working until it
expires — typically an hour. For a product whose pitch is tenant isolation, and which is bound by
Meta Platform Terms 5.b.ii.2 on per-Client separation, "revoked but still reading for another fifty
minutes" is not a window worth taking.

So every policy resolves through `app.*` helper functions that read the membership tables live. The
cost is bounded and paid for: each is a single indexed read marked `STABLE`, so the planner
evaluates it once per statement rather than once per row. If profiling later shows this is the
bottleneck, the fix is a claims cache with explicit invalidation — not a silent switch to snapshot
semantics.

Two details that are easy to get wrong and are handled explicitly:

- Every helper is `SECURITY DEFINER` for one specific reason: a policy on `members` that queries
  `members` recurses infinitely. Running the lookup as the owner, outside RLS, breaks the cycle.
- Each therefore pins `search_path`. Without it, a caller who can create a shadowing `public.members`
  captures the function's privileges. A `SECURITY DEFINER` function with a mutable search path is a
  privilege-escalation primitive, not a convenience.

**One table is added that section 15 does not list.** `workspace_members` exists because section 15
says agencies need "one login across many client accounts with per-client isolation", and an
organisation-level role alone cannot express "this analyst sees three of our forty clients".
Isolation would stop at the organisation boundary, which is the wrong boundary. Owners and admins
reach every workspace implicitly; analysts and viewers reach only what is granted. That asymmetry is
the whole feature.

### Gap 2 — the edge holds no service-role key

Verifying an API key is a chicken and egg: to find the key row you must read a table, and to read a
table you must already be authorised. The usual shortcut is to hand the edge a service-role key,
which bypasses RLS entirely and with it every guarantee the product sells.

Instead there is exactly one privileged surface, `public.verify_api_key(bytea)`:

- it takes a **SHA-256 hash**, never a plaintext key, so the credential itself never reaches the
  database;
- it returns only what the edge needs to authorise a request — workspace, organisation, allowed
  tools, remaining budget — and never the hash;
- it is the **only** `anon`-executable function in the schema.

The edge then mints a short-lived token carrying `workspace_id`, and every subsequent query goes
through RLS as an ordinary authenticated session. `consume_api_key_credits` is deliberately separate,
because specification section 8 says failed calls are never billed, so the charge cannot happen at
authorisation time.

**Residual risk, stated rather than buried:** the edge holds a JWT signing secret, and anything that
can mint tokens can mint one for any workspace. That is strictly better than a service-role key —
which bypasses policies rather than being subject to them — but it is not nothing. Mitigations: a
~60-second TTL, a secret that exists only as a Worker secret, and the fact that a minted token still
cannot touch `api_keys`, `members` or `invitations`, because no policy grants an API-key session
access to them. That last point is tested, not assumed.

### Gap 3 — OAuth grants use envelope encryption with the key outside the database

Supabase Vault is simpler and puts the key material next to the ciphertext: one database compromise
yields both. What this product sells is custody of other people's platform credentials, so the
database has to be worth nothing on its own.

- A fresh 256-bit data encryption key per connection, per rotation.
- The credential sealed under it with AES-256-GCM.
- That key itself sealed under a key encryption key held in Cloudflare; only the wrapped form is
  stored.
- Postgres never sees a plaintext credential, a plaintext data key, or the key encryption key.

Decryption happens in the Worker via WebCrypto, which is also the only place that needs it — the
scheduler calls platform APIs, Postgres never does. `key_version` makes a key rotation a re-wrap of
data keys rather than a re-encryption of every credential.

Non-negotiable 4 forbids shared platform tokens across tenants. That is structural here rather than a
rule to remember: a credential hangs off exactly one workspace and has its own data key. Two
workspaces may legitimately hold the same external ad account — an agency and its client can each
connect it — and each gets its own grant and its own key.

## 2. Cost estimate

**Per connected account per month: unchanged at zero.** No scheduled work, no platform calls, no
storage of platform data. This is schema only.

The lines this schema *will* drive, recorded now because they are cheaper to design for than to
discover:

| Line | Driver | Note |
|---|---|---|
| Supabase Pro | $25/mo | Not yet provisioned. |
| Row storage | Negligible | Tenancy rows are per-account, not per-fact. The volume arrives with the canonical store. |
| `verify_api_key` write amplification | One indexed `UPDATE` per authorised request | `last_used_at` on every call. The alternative is a key nobody can tell is unused, which is the key nobody revokes. Revisit if request volume makes it a hot row. |
| Policy evaluation | One indexed read per statement | `STABLE` helpers, not per-row. The measurement to take before optimising. |

## 3. Platform-terms check

**Credential.** PASS × 4 — no platform token is read or stored by this diff; the schema stores only
*ciphertext the database cannot open*. No shared token is possible: `connections` is keyed on one
workspace and carries its own wrapped key. The per-tenant developer-token columns exist for the same
reason. No token pass-through: the edge mints its own short-lived token and never forwards a
caller's.

**Tenancy.** PASS × 3 — every tenant-scoped table has `ENABLE` **and** `FORCE ROW LEVEL SECURITY`;
without `FORCE` the owner bypasses its own policies, and migrations run as the owner. Cross-workspace
reads are tested from five different principals. Meta's client-list obligation is a standing record:
`workspaces.client_name` and `client_contact` exist because a workspace *is* a client.

**Data movement.** PASS × 3 — nothing leaves the database. No cross-customer aggregation is
expressible: there is no query path that returns rows from two organisations, and the suite asserts
it from a hostile session rather than assuming it.

**PII and consent.** N/A × 3 — no contact data, no hashing path, no write destination. `invitations`
holds an email address, which is a member's own address rather than a customer's contact record.

**Access tier and quota.** N/A × 2 — no platform quota consumed. `connections.quota_used_today`
exists to *record* the tenant's share of a per-developer-token ceiling (Google Ads Explorer 2,880/day,
Basic 15,000/day), which is a shared ceiling, not an independent budget.

**Claims.** PASS × 3 — no new marketing claim. The claims gate is untouched.

## 4. What was left out

- **The canonical store.** No facts, metrics or envelope tables. Those land with `packages/contract`
  and the first connector.
- **Audit log.** Section 15's Settings screen requires one. It belongs with the actions worth
  auditing, not before them.
- **Credits ledger.** `api_keys.credits_used` is a counter, not a ledger. Invoicing needs the ledger;
  a spend cap does not.
- **`pg_cron` schedules.** No scheduled work exists yet. The restatement scheduler is Cloudflare
  Workflows' job (`00-repo-map.md` section 5); pg_cron takes only light periodic work.
- **Generated TypeScript types.** `packages/db` is not populated: `supabase gen types` needs a linked
  project, and there is none.
- **Storage buckets and Realtime.**

## 5. Open or unverified spec items this builds on

1. **Per-tenant Google developer tokens are undocumented.** Specification section 3.5's own open
   question is "If every tenant brings their own developer token, whose token appears in the
   request?" No source answers it. The `developer_token_*` columns on `connections` encode an answer
   nothing confirms. Flagged in the migration itself; revisit before the Google Ads connector.
2. **Restatement windows.** `connections.restatement_window_days` is nullable because section 7's
   own open questions are whether Meta's 28-day clock starts at delivery or first report, and whether
   Google Ads publishes any finalisation statement at all (three attempts found none). The column
   records a per-connection value rather than hard-coding a constant the specification does not have.
3. **Data region.** `organisations.data_region` is nullable and constrained to a short list. It stays
   null until projects are actually provisioned — see `01-brand-identity.md` for why a Thai entity
   makes "EU hosting" three separate questions rather than one.

## 6. Verification

**These migrations were executed, not merely written.** `supabase start` needs Docker, which this
environment does not have, so `supabase/tests/run-local.sh` applies the real migrations — unmodified
and in order — to a scratch PostgreSQL 16 database, with `00_supabase_shim.sql` supplying the few
objects a Supabase project provides (the `auth` schema, the `anon` / `authenticated` / `service_role`
roles, the `extensions` schema).

| | |
|---|---|
| Migrations applied in order | 9/9 clean |
| RLS assertions | **52/52 pass** |
| Principals exercised | owner, analyst with a partial grant, viewer, a separate tenant, a member of nothing, an API-key session, `anon` |

Every assertion runs as `authenticated` or `anon`. Running them as the owner or a superuser would
pass trivially — superusers bypass RLS entirely — which is why the tables are `FORCE ROW LEVEL
SECURITY` and the suite never runs as `postgres`.

**The suite was verified to catch real bypasses**, because a suite that has never failed on a genuine
hole proves nothing. Two were injected deliberately and both were caught: relaxing
`connections_select` to `using (true)` failed 8 assertions across five principals, and letting any
org member update `members` produced `POLICY BYPASS: statement affected 1 row(s)`.

**That second case is why the harness distinguishes two kinds of denial.** RLS denies an `INSERT` by
raising on the `WITH CHECK`, but denies an `UPDATE` or `DELETE` by *filtering* — no error at all, the
statement succeeds and affects zero rows. A harness that only catches exceptions reports "unexpectedly
succeeded" for every correctly denied update; one that treats any non-error as success would pass an
update that really did modify another tenant's row. Three of the first run's failures were this
harness bug rather than schema defects, confirmed by reading the data back: the analyst was still an
analyst and the connection still pointed where it had.

**What this does not cover**, and where the hosted project still has to be checked: Supabase's own
default privileges (this schema grants explicitly and revokes `anon` rather than relying on them),
GoTrue's exact JWT claim shape, Realtime, and storage.
