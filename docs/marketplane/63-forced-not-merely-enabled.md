# 63. FORCE, not merely ENABLE — and the two guards that did not guard

**PR:** #41 &nbsp;·&nbsp; **Date:** 2026-09-13 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

Three tables — `billing_customers`, `subscriptions` and `waitlist` — had `ENABLE ROW LEVEL SECURITY`
without `FORCE`. `20260908000700_rls.sql` states the rule and the reason in its own opening lines:

> FORCE ROW LEVEL SECURITY on every table, not merely ENABLE: without FORCE, the table owner
> bypasses its own policies, and migrations run as the owner.

`20260913000200_force_rls.sql` adds the missing setting and nothing else. The interesting half is
why nothing caught it, because **two separate guards were in position and neither could fire.**

**The decision:** assert the property from the **catalogue, for every table**, rather than extend the
list that missed it. A test that names the tables it knows about cannot fail for the table it does
not — and "a table added later" is this bug's entire failure mode. The alternative, adding three
names to `12_billing.sql`, was rejected for exactly that reason: it would have been correct today
and useless on the next migration.

## 2. What was actually wrong, in four parts

**a. My own first reading was wrong, and it is worth recording how.** I reported five tables. It was
three. `20260912000900_ambient_readings.sql` writes `force  row level security` with two spaces, and
the grep I checked against used a single-space pattern. The ambient tables had been correct all
along. The original compliance report said three and was right; I "verified" it into five by using a
pattern stricter than the SQL. A verification that is narrower than the thing verified is not a
verification.

**b. The first draft of the migration would have opened a hole.** Both remaining definer paths —
`public.join_waitlist` and `app.record_ambient_reading` — execute as the table owner, which is the
role FORCE binds, so the draft added permissive policies to keep them open. A permissive
`for all using (true)` applies to `authenticated` as much as to the owner, and
`14_ambient.sql` asserts that a tenant can neither insert, update nor delete a reading — an
assertion that gets all its force from there being **no write policy at all**. The draft would have
turned those three red. The suite caught it, which is the suite working.

The shipped migration adds **no policies**, because `waitlist` is not a new bet:
`app.claim_connection` and `app.record_backfill` on `connections`, `app.upsert_envelope_row` on
`envelope_rows`, `app.create_organisation` on `organisations` and `members`, and
`app.record_ambient_reading` on `ambient_readings` all already write FORCED tables through no policy
admitting their owner. They rest on one property: **BYPASSRLS beats FORCE.** If that is false on the
hosted project, ingest, signup and the scheduler are already broken and the waiting list is the
least of it — which is a finding about the whole schema, not a licence to give one table a policy
the other twelve do not have.

**c. `12_billing.sql` had a check in the shape of a check.** Line 58 read
`from pg_class c where c.relname = v_tbl and c.relrowsecurity`, under an assertion named *"has
row-level security ENABLED — without it the absent policies mean nothing"*. Absent policies mean
nothing **to the table owner** unless the table is FORCED, so the assertion's own name described a
property it did not test. It now tests `relrowsecurity and relforcerowsecurity`, and is qualified by
schema, which it also was not.

**d. `12_billing.sql` could not fail the run at all.** Every other suite in the directory ends by
raising when an assertion failed. This one printed `FAIL` and exited 0 — the only one of fourteen
without the floor. So even had (c) been written correctly, `run-local.sh` would have gone green over
it and so would the gate. That is the same defect as (c), one layer out: a file that looked like a
check on billing and was a report about billing. **Demonstrated, not assumed** — see §6, M3b.

## 3. What the local suite can and cannot prove

`run-local.sh` connects as a **superuser**, and a superuser bypasses row security whether or not
FORCE is set. So FORCE never binds in that database and **no assertion can prove that it binds in
the hosted one.** Rather than leave the whole unit resting on a sentence quoted from the manual,
`15_force_rls.sql` demonstrates the mechanism on a throwaway table owned by a throwaway role with
neither attribute, written through a SECURITY DEFINER function it owns — the exact arrangement every
write path here uses. Three states:

| State | Result | What it corresponds to |
|---|---|---|
| ENABLE only | the definer write **lands** | the state the three tables were in |
| ENABLE + FORCE | the same write is **denied** | what this migration establishes |
| + BYPASSRLS on the owner | it **lands** again | what every `app.*` writer and `join_waitlist` need |

**A wrong turn worth keeping.** The third state failed on the first run, which read for some minutes
like a discovery that BYPASSRLS does *not* beat FORCE and that the schema's every write path was
broken. It is not: `alter role … bypassrls` **does not invalidate plans already cached in a live
session**, so the function reused the plan built in state two. A fresh session gets it right; that
one had to be told, and `discard plans` is in the file with this reason attached so it is not
deleted as tidiness.

That is an operational hazard, not a quirk of a test: an operator granting BYPASSRLS to clear an
outage will see nothing change on connections that have already run the statement — the pooler's in
particular, which outlive any single request. The fix is a new connection, not a second grant.

## 4. Cost estimate

**Per connected account per month:** `N/A — no data-plane work.` Three `alter table` statements, one
test file, one corrected assertion, one added failure floor. No new row, object, invocation or call.

## 5. Platform-terms check

Gates 1–17: `N/A` — no credential, no platform call, no PII path, no quota, no new table or column.

**18. Claim provenance.** `PASS`. `AGENTS.md` cited FORCE RLS as the evidence for GDPR Art. 25(1)
and ISO A.5.15 and said *"on all seven tenancy tables, verified"*. That was true of the seven and
silent about the eight tables added since, three of which did not have it. The evidence line now
reads fifteen of fifteen and names the test that asserts it. **A control cited as evidence must be
the control that exists**, which is the same rule as the claim ban, applied to ourselves.

**Result:** `1 PASS, 17 N/A, 0 FAIL`

## 6. Mutation testing

Every mutation run through `./supabase/tests/run-local.sh` and judged **by exit code**.

| # | Mutation | Result |
|---|---|---|
| M1 | drop `force` on `waitlist` | `exit=3` — *public.waitlist has row-level security FORCED, not merely enabled* |
| M2 | drop `force` on `billing_customers` | `exit=3` — the corrected `12_billing.sql` assertion, which the original would have passed |
| M3a | break a billing-only assertion, floor present | `exit=3` |
| M3b | the same failure, floor removed — **the state the file shipped in** | **`exit=0` with six `FAIL` rows printed** |
| M4 | point the catalogue query at a schema with no tables | `exit=3` — *the catalogue query found the tables it is checking (0 found)* |
| M5 | delete `discard plans` from the BYPASSRLS demonstration | `exit=3` |

M3b is the one to keep: six assertions printed `FAIL` and the runner exited 0. M4 exists because a
loop over an empty set passes every assertion it does not make, and a catalogue-driven test fails
open in exactly that way.

All reverted; the suite is green at **45 assertions** in `15_force_rls.sql` and 23 in `12_billing.sql`.

## 7. What was left out

**Nothing asserts FORCE binds on the hosted project**, because nothing in a local suite can — see §3.
Confirming that Supabase's `postgres` role holds `BYPASSRLS` is one query against the real project
and it is not something this environment can run. Until someone runs it, the schema's write path
rests on a property that is demonstrated in principle and unverified in place.

**`run-local.sh` is still not in CI.** Every guard in this note fails the run correctly and the run
happens only when a person types the command. That is a separate unit and a bigger one — it needs a
PostgreSQL service in the workflow — but it is the reason this class of defect keeps reaching `main`
and it should not be rediscovered a third time.

**The suites share one `app_test.results` table and each truncates it**, so a file that fails to
reach its own floor reports on whatever ran last. Harmless today because the runner stops at the
first `ERROR`, and worth naming before something runs them out of order.
