# 15. The envelope store, and the promise note 14 made

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`envelope_rows`, its upsert function, its RLS, and a third repository guard. It exists because
`14-ga4-backfill.md` ended with an obligation rather than a feature:

> The upsert must preserve the existing `first_seen_at` on conflict, along with `restates_until`.
> **The `envelope_rows` table does not exist yet; this is the first requirement on it.**

**This table exists to keep one promise.** A connector emits `first_seen_at = fetched_at` on every
row because it has no store and cannot know whether a row already exists. If the upsert overwrites
it, the restatement anchor slides forward on every nightly re-pull, `restates_until` slides with it,
`is_provisional` never clears, and **the one guarantee the product sells never comes true**.

That is not hypothetical. It is the exact defect `packages/contract/src/restatement.ts` identifies in
the specification's own formula (`restates_until = fetched_at + Nd`) — and an upsert written the
obvious way, `set ... = excluded....` for every column, **reintroduces it one layer down**. So the
preservation is written out explicitly rather than achieved by omitting two columns from a `SET`
list, where the next person to add a column would silently undo it.

And one line does more than preserve:

```sql
is_provisional = (
  public.envelope_rows.restates_until is null
  or excluded.fetched_at < public.envelope_rows.restates_until
)
```

**Derived from the preserved window, not copied from the caller.** This is where "`is_provisional`
eventually clears" stops being a claim and becomes a fact: as a row's window closes, the next re-pull
flips the flag. A value copied from a connector could never clear, because a connector cannot know
a row's real anchor. There is a test for exactly that transition.

### No tenant identity may write this table

Not a human, not an API key. These rows are **derived platform data, not user input**, and a tenant
able to write them could fabricate the numbers the guarantee rests on. There is no `INSERT`,
`UPDATE` or `DELETE` policy and no grant — only `SELECT`.

Writes go through one `SECURITY DEFINER` function granted to one system role, the same shape as the
scheduler in `11-scheduler-entry-point.md` and deliberately a **different** role, because
enumeration and ingestion are different privileges:

| | can enumerate | can read a credential | can write a number |
|---|---|---|---|
| `app_scheduler` | yes (metadata only) | **no** | **no** |
| `app_ingest` | **no** | one, handed to it | yes, via one function |

Both directions are tested. A compromise of either yields strictly less than a compromise of one
combined role would.

### Three more decisions

**`raw` is an R2 object key, never the payload.** §7 names Supabase disk at $0.125/GB as the cost
line most likely to break the model, and the design-note template says it outright: *"only safe if
`raw` is an R2 KEY in Postgres, never a JSONB blob"*. A `jsonb` column here would work perfectly in
testing and become the largest line on the bill. There is a `CHECK` refusing a value that starts with
`{` or `[`.

**The API's refusal is restated as a `CHECK` constraint.** §2: "the API refuses to emit an
unlabelled conversion count." `envelope.ts` refuses it in zod. A rule enforced in one place is one
code path away from being unenforced, and **this is the place that outlives every code path**.

**`NULLS NOT DISTINCT` is load-bearing.** The §7 upsert key contains `attribution_window`, which is
legitimately null on an impressions-only row — and PostgreSQL's *default* unique-constraint
behaviour treats two NULLs as different values. A plain `UNIQUE` would silently accept unlimited
duplicates of exactly those rows: every re-pull inserting another copy instead of updating one,
**invisible until somebody sums the column**. This is the single most easily-missed line in the
migration and it has its own test.

### A third repository guard

The canonical vocabulary exists **twice** — `packages/contract` as TypeScript, the schema as
PostgreSQL enums and columns — and neither can import the other. Postgres cannot read a `.ts` file at
migration time; a Worker cannot ask a database it has not connected to what an attribution window is.

Drift between them does not raise an error. The API emits a value the database refuses, or the
database holds a value the API cannot parse, and a customer sees **a number go missing rather than a
build go red** — which is §13.3 rule 2's failure exactly. `scripts/check-dictionary.mjs` reads both
and asserts they are the same lists in the same order, and it runs in CI beside the brand and token
guards.

**It caught real drift on its first run.** I had written the SQL enums from memory: six attribution
windows that do not exist in the contract (`30d_click`, `1d_view_1d_click`, …) and five real ones
missing (`1d_ev`, `dda`, `incrementality`, `inline`, `custom`). The order of `SOURCES` was wrong too,
which matters because PostgreSQL sorts an enum by definition order — same members, different `ORDER
BY`, no error anywhere.

## 2. Cost estimate

**Per connected account per month: `$0.03–$0.12` of Supabase disk, and this is the line §7 names as
most likely to break the model.** Derived:

| Term | Figure |
|---|---|
| Rows/day, one GA4 property at the current grain | 1 |
| Rows/day, one Meta account at campaign × 3 windows × 30 campaigns | 90 |
| Row width | ~250 bytes of column data, plus index entries |
| Restatement re-pulls | **update in place, not insert** — the tiered ladder re-reads the same rows |
| Disk/account/month at 90 rows/day | ~0.7 MB data + ~0.3 MB index ≈ **1 MB** |
| At $0.125/GB-month | **~$0.0001** |

The number is negligible *because* of two decisions in this migration, and would not be otherwise:

- **`raw` as an R2 key.** A GA4 `runReport` response is 2–20 KB. Storing it inline at 90 rows/day is
  ~50 MB/account/month — **fifty times the row data**, and it grows with no ceiling. In R2 at
  $0.015/GB-month the same payload is ~$0.0008 and can be lifecycled.
- **Upsert rather than append.** The D+1/D+3/D+7/D+28 ladder re-reads each row ~8 times. Appending a
  version per read would multiply disk by 8 and make every query a `DISTINCT ON`.

**On §8's open question** (redundant polling collapsing the margin): this unit does not poll. It does
remove one *reason* to poll — a row whose `is_provisional` has correctly cleared never needs
re-pulling, and the `envelope_rows_provisional_idx` partial index is what lets a scheduler ask "what
is still open?" without a full scan.

## 3. Platform-terms check

### Credential
**1. BYOC.** `PASS` — no credential appears in this migration. `connection_id` is a foreign key, not
a credential, and `due_connections` is the only enumeration path (unchanged).
**2. Vendor-key exception.** `N/A`. **3. No token pass-through.** `N/A`.
**4. Credential hygiene.** `PASS`, and asserted from the other side: `app_ingest` **cannot read
`public.connections`**, so a compromised ingest worker cannot walk the credential table. It is handed
one connection by the scheduler.

### Tenancy
**5. RLS.** `PASS` — `workspace_id` on every row, `ENABLE` **and** `FORCE`, policy keyed on
`can_read_workspace`. Tested: an owner of org A reads their own rows and reads **zero** rows of org
B, and a `SUM` spanning both returns only their own number.
**6. No service-role bypass.** `PASS` — no service role anywhere. Both system roles are
`NOBYPASSRLS`, stated explicitly, and reach the table only through granted functions.
**7. No cross-workspace read.** `PASS` — `workspace_id` is the **first column of the unique key**, so
a key that spans tenants is not merely forbidden, it is unrepresentable. The same platform account
in two workspaces is two rows, and a test asserts it.
**8. No cross-customer aggregation.** `PASS` — every read goes through a policy scoped to one
workspace, so a `GROUP BY` that omits `workspace_id` still cannot see across one.
**9. API key scope.** `PASS` — `can_read_workspace` honours `api_key_workspace_id()`, so a key reads
exactly its own workspace's data. It cannot write, because nothing authenticated can.

### Data movement
**10. No resale or redistribution.** `PASS` — the billing unit is per connected account (§11.3), not
per row, and nothing here moves data out of its workspace.
**11. Meta client list.** `N/A` — no Meta onboarding or workspace-lifecycle change. Worth recording
that a **hard** workspace delete cascades to these rows, which is what "delete my data" must mean,
while a **soft** delete leaves them and stops the scheduler.
**12. Dependency licences.** `PASS` — no dependency; one Node script using only `node:fs`.

### PII and consent
**13. Hash at the edge.** `PASS`, and structurally so: there is **no free-text payload column**.
`raw_key` is constrained to be a key, so the one place a payload could hide is closed by a `CHECK`.
Dimension values live in `entity_id`/`native_id`, which are platform identifiers, and the decision
about which dimensions get requested is made in the connector (`14-ga4-backfill.md`, gate 13).
**14. Forbidden payloads.** `N/A` — read-side store. **15. Per-destination consent.** `N/A` — writes
deferred.

### Access tier and quota
**16. Tier reality.** `PASS` — no platform call. The partial index on provisional rows exists to
*reduce* pulls: a row that is final does not need re-reading.
**17. No new long-lead dependency.** `PASS` — plain PostgreSQL 16, no extension beyond `pgcrypto`
already in use.

### Claims
**18. Claim provenance.** `PASS` — no user-visible string. And the claim this table underwrites is
the one that needed underwriting: `is_provisional` clearing is now demonstrable rather than asserted.

**Result:** `14 PASS, 4 N/A, 0 FAIL`

## 4. What was left out

- **The read API.** No `/v1/performance` endpoint yet; this is the store, not the surface.
- **The ingest Worker, and how it authenticates as `app_ingest`.** A connection string in a Worker
  secret, as with the scheduler. Worth repeating that it is a *database* role, so it needs a direct
  connection rather than PostgREST — a real constraint on where ingest can run.
- **R2 itself.** `raw_key` is a key to a bucket that does not exist. The column and its constraint
  land now so no code writes a payload into it in the meantime.
- **Partitioning.** At the volumes above, a single table is right for a long time. When it stops
  being right the answer is monthly range partitions on `date`, and the index choices here do not
  block that.
- **`entity_name` / `parent_id` history.** A renamed campaign overwrites its old name on the next
  pull. Slowly-changing-dimension handling is a separate decision with its own cost.
- **A batch upsert.** One row per call. A `COPY`-into-temp-then-merge would be faster for a large
  backfill and is worth doing when there is a Worker to measure it against.

## 5. Open or unverified spec items this builds on

1. **`restates_until` is preserved, which assumes a row's window does not move under it.** True for
   GA4's fixed 12 days. **Not necessarily true for Google Ads**, whose window is per account *and*
   per conversion action and can be changed by the customer. When that connector lands it must say
   what happens when a customer widens their window from 30 to 90 days: preserving the old
   `restates_until` would call a row final that the platform will still restate. Named in
   `14-ga4-backfill.md` too; it is the same open question and it is not closed here.
2. **The numeric precision `numeric(20,6)` is a judgement.** It holds a trillion units with
   six decimal places, which covers currency minor units and fractional conversions with room. No
   platform documents a maximum.
3. **`app_ingest`'s privileges are asserted against PostgreSQL 16 with the local shim**, not against
   a real Supabase project. `run-local.sh` states the gap already: Supabase's own default privileges
   and GoTrue's real JWT claim shape are not covered. **This must be re-verified on the first real
   project**, because a default `GRANT` to `authenticated` that Supabase applies and this shim does
   not would quietly undo the "no tenant writes" decision.

## 6. Verification

| | |
|---|---|
| Migrations | 11/11 apply clean |
| RLS suite | **52/52** |
| Scheduler suite | **20/20** |
| Envelope store suite | **36/36** |
| Repo | 239 unit tests, lint, format, **three** guards, typecheck, build — green |

**Mutation-checked — twelve mutations on the migration, twelve caught:**

| Mutation | Result |
|---|---|
| Overwrite `first_seen_at` on conflict (the sliding-anchor defect) | caught |
| Overwrite `restates_until` on conflict | caught |
| Copy `is_provisional` instead of deriving it | caught |
| Plain `UNIQUE` instead of `NULLS NOT DISTINCT` | caught |
| Drop the unlabelled-conversion refusal | caught |
| Drop the converted-amount-needs-a-rate refusal | caught |
| Drop the raw-key-is-not-a-payload guard | caught |
| Let tenants write their own numbers | caught |
| Let any tenant call the ingest function | **survived at first** |
| Cascade the connection delete instead of nulling it | caught |
| `bigint` conversions, truncating data-driven attribution | caught |

**And four on the dictionary guard**, all caught: a member added to one side only (either side), the
same members in a different order, a metric renamed in the contract only.

**The survivor was the most dangerous hole in the migration**, and the suite passed cleanly with it.
`upsert_envelope_row` is `SECURITY DEFINER` and takes `workspace_id` as an **argument** — it does not
consult RLS. Granting it to `authenticated` would let any tenant write rows into **any workspace**,
and the absent table grant would stop nothing. Every isolation assertion I had written tested the
*table*; none tested the *function*. Two assertions now do, one for the caller's own workspace and
one for somebody else's.

**A second thing worth recording: the dictionary guard's first useful act was to fail on my own
work.** I wrote the SQL enums from memory rather than from the contract, and got eleven values wrong
across two enums plus an ordering that PostgreSQL would have silently honoured. No test would have
caught it — the store suite only ever uses windows that happen to exist in both lists.

This is the fifth and sixth time in this repo that a deliberate break found something reading did
not.
