# 11. The scheduler's entry point

## 1. What this is, and the decision taken

The question the scheduler has to ask is the one the whole schema exists to make unaskable:
**"which connections, across every tenant, need pulling right now?"**

Every other actor here is a tenant — a human with a membership, or an API key bound to one workspace
— and row-level security is defined in terms of that. The scheduler is neither. It is a system actor,
and no tenant identity can answer its question.

The usual answer is a service-role key, which bypasses RLS entirely. That is ruled out for the same
reason it was ruled out for the API edge in `03-supabase-schema-and-rls.md`: **a bypass is not a
narrower privilege, it is the absence of one.** It would undo every guarantee the policies provide,
at exactly the layer that runs unattended.

### The decision: a system role whose entire vocabulary is three functions

`app_scheduler`, `NOBYPASSRLS` stated explicitly rather than relied on as a default, and
granted nothing but:

| Function | What it can do |
|---|---|
| `app.due_connections` | Return **scheduling metadata only** |
| `app.claim_connection` | Take a lease |
| `app.record_backfill` | Close a lease |

**The important part is what `due_connections` does not return.** No `credential_ciphertext`, no
`wrapped_dek`, no `credential_iv`, not even `external_account_id`. A scheduler needs to know *that* a
connection is due, not how to authenticate as it. **Enumeration and access are deliberately different
privileges**, so a compromised scheduler learns which tenants exist and when they were last pulled —
and not one credential. The credential is fetched separately, per connection, by a caller that
already knows which workspace it is acting for.

### Three conditions that are correctness, not tidiness

- **An expired grant is not offered as work.** Pulling with it burns quota to earn a 401 — and on
  Google Ads a rejected request still counts against a ceiling shared with every other tenant
  (`09-quota-aware-http.md`).
- **A soft-deleted workspace or organisation stops generating work immediately.** Otherwise "delete
  my data" keeps calling the customer's ad platform on their behalf.
- **Oldest first**, so one busy tenant cannot starve the rest.

### Leasing, because two instances spending the same quota twice is worse than a delay

`claim_connection` takes a lease and the `WHERE` clause *is* the lock: two instances racing on one row
means exactly one `UPDATE` matches and the loser gets `false`. Double-pulling is not merely wasteful —
it spends a platform quota shared across tenants.

The lease expires after **15 minutes**, matching Cloudflare's wall-clock limit on a cron or queue
consumer. A Worker that dies mid-backfill cannot release its own lease, so the lease has to time out;
shorter would let a slow-but-alive run be stolen, much longer would strand a connection after a crash.

`record_backfill(succeeded: false)` releases the claim **without** advancing `last_backfill_at`, so a
failed run is retried on the next sweep rather than silently skipped for a day.

## 2. Cost estimate

**Per connected account per month: negligible, and it caps the rest.** One indexed sweep per cron
tick plus two small writes per connection per day.

The sweep is the cheap part; what it *prevents* is the expensive part. Without the lease, two
overlapping cron ticks double every platform call — and per `10-credential-model.md`, Explorer access
supports about 169 accounts on a shared developer token. Double-pulling halves that to ~84.

## 3. Platform-terms check

**Credential.** PASS × 4 — the defining property of this unit. No function here can return credential
material; a test asserts `due_connections` has no such column rather than trusting the definition.

**Tenancy.** PASS × 3 — cross-tenant enumeration is confined to one role and three functions, and
tested from the other side: an owner calling `due_connections` is denied, and so is `anon`. The
scheduler role additionally cannot read `connections`, `api_keys`, `members` or `organisations`
directly.

**Data movement.** PASS × 3 — no data leaves the database. Soft deletion stops work at once.

**Access tier and quota.** PASS × 2 — the lease exists to stop double-spending a shared per-developer-
token ceiling, and expired grants are excluded so quota is not spent earning 401s.

**PII and consent.** N/A × 3. **Claims.** PASS × 3 — no new claim.

## 4. What was left out

- **The Worker that calls these.** The cron trigger and Workflow instance land with the scheduler app.
- **How the scheduler authenticates as `app_scheduler`.** A connection string in a Worker
  secret. Worth noting it is a *database* role, so it needs a direct connection rather than PostgREST —
  which is a real constraint on where the sweep can run.
- **Per-platform pacing.** `due_connections` returns work; the cross-tenant governor that decides how
  fast to spend a shared ceiling is Cloudflare Queues (`00-repo-map.md` section 5).
- **Fetching the credential.** Deliberately a separate privilege, and a separate call.

## 5. Open or unverified spec items this builds on

1. **A daily cadence is assumed.** `due_connections` offers a connection once per calendar day, which
   matches §9's tiered backfill. If a customer needs intraday freshness that becomes a per-connection
   setting rather than a hard-coded `date_trunc`.
2. **The 15-minute lease matches Cloudflare's documented consumer limit**, not a measured failure
   rate. If Workers change that limit the constant follows it.

## 6. Verification

| | |
|---|---|
| Migrations | 10/10 apply clean |
| RLS suite | **52/52** |
| Scheduler suite | **20/20** |

**Mutation-checked**, on the two properties that carry the design:

- **Granting `due_connections` to `authenticated`** — caught, and the failure reads
  `POLICY BYPASS: affected 1 row(s)`, which is the harness distinction from
  `03-supabase-schema-and-rls.md` earning its keep: a permissive `SELECT` does not raise, it just
  returns rows, and a suite that only caught exceptions would have called that a pass.
- **Dropping the lease check** — caught by "the second instance is refused" and by the abandoned-claim
  test.

**The brand guard blocked the first commit of this**, catching the product name in the role name.
It was right, and for the same reason as the vault's AAD: a database role is created once, renaming
it later means rewriting every grant and every connection string, and the name is unsettled. Renamed
to `app_scheduler`, matching the `app` schema rather than the product.

One test correction worth recording. Two assertions originally counted *all* due connections and
expected 2. They failed, and the code was right: the earlier RLS suite leaves its own connections in
the database, and `due_connections` **legitimately returns those too** — that is the cross-tenant
behaviour under test. The assertions now name the rows they mean instead of depending on an absolute
count that another suite can move.
