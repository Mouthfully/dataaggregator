# 26. The restatement outbox, and why silence is the hard part

**PR:** #3 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and what it is not

The kickoff gates any fifth connector behind two things: *"a tiered restatement backfill (windows
sized to the platform's window) and a restatement webhook."* The backfill exists
(`08-backfill-planner.md`). This is the **first half of the second**: detection and the outbox.

**It is not the webhook.** Nothing is delivered anywhere. There is no endpoint table, no signature,
no retry, no drain loop. **The gate is not satisfied and the fifth connector still waits**, and
saying so plainly is worth more than a note that reads as though it were finished. Delivery is
named in §6 as the next unit.

What is built:

| | |
|---|---|
| **Detection** | An `after update` trigger on `envelope_rows` with a `when` clause over every metric |
| **The outbox** | `public.restatement_events` — one row per detected restatement, with `revised_from`, RLS'd, readable by the tenant and writable by nobody |
| **The payload contract** | `restatementEventSchema` in `@repo/contract`, with the three refusals only it can make |
| **The guard** | `check-dictionary.mjs` now checks the trigger's metric list **and** the fx constraint — the hole `24-commerce-grain.md` §1.3 named as uncatchable |

Specification §4.2 is the requirement, verbatim: *"When Meta restates a 28-day window or Google Ads
credits a late conversion back to its click date, the row changes. A `restated` webhook with the
before and after values is the alert every analyst wants and no incumbent sends."*

## 2. Silence is the hard part

The tiered ladder re-pulls every row in the window every night — D+1, D+3, D+7, D+28. **Almost none
of those re-pulls change anything.** A webhook that fires on each of them is not a noisy version of
a good feature; it is a worse outcome than no feature at all, because the customer turns it off
within a week and the one night a number really moves is buried with the rest.

So detection is **a trigger with a `when` clause**, not application logic:

```sql
create trigger envelope_rows_restated
  after update on public.envelope_rows
  for each row
  when (old.spend is distinct from new.spend or … )
  execute function app.record_restatement();
```

**It is a trigger rather than a branch inside `app.upsert_envelope_row` because the property must
not depend on who is writing.** A row updated by the ingest function, by a later migration, or by a
hand at a `psql` prompt is detected identically. Putting the detection in the writer would make it a
property of one code path, and the next write path would silently not have it.

`is distinct from` rather than `<>` because a metric can be null on either side, and `41 <> null` is
null, which is not true — so a metric appearing or disappearing would not have been detected at all.
And `numeric` equality is by value, so `41` and `41.000000` do not restate: asserted, because a
platform changing its response formatting must not wake a customer.

## 3. `revised_from` carries only what moved

§4.2 asks for "before and after values". That could mean the whole previous row, and it does not:
listing a metric that did not move under a heading that reads **revised from** would state that it
moved. So `revised_from` is a **diff**, and the full current metric set travels beside it so the
event is still self-contained.

Two smaller decisions fall out of that:

- **An absent metric is absent, not null.** `jsonb_strip_nulls`, because a consumer reading
  `spend: null` would reasonably conclude the platform reported zero spend.
- **A metric revised to absent is still a restatement.** A platform that stops reporting a number a
  customer saw yesterday has changed it, and that is exactly the change nobody notices unaided.

`revised_from` lives on the event and **not** on the read row, which is what `00-repo-map.md`
decided when it adopted the field from the artboard: a row states what is true now, and one carrying
its own history would make every read a changelog nobody asked for.

## 4. What the event schema refuses, and what it deliberately does not

The event is **derived** from a row the database has already validated. The conversion refusal, the
commerce refusal and the fx rule are enforced by `envelopeRowSchema` and by check constraints, and
an event cannot exist without a row that passed both. **Re-asserting them here would duplicate logic
that cannot disagree — and duplicated logic that cannot disagree is the kind that eventually does.**

So the schema refuses only what it alone can be wrong about:

1. **An empty diff.** Nothing moved, so there is no restatement to announce.
2. **A metric name the dictionary does not have.**
3. **A metric listed as revised whose value equals the current one.** An event saying a number
   changed, from and to the same number, is a false statement about the customer's data — and it is
   the failure this feature exists to avoid producing at scale.

The database enforces (1) again as a check constraint, because the outbox is written by a trigger
that no TypeScript ever sees.

## 5. Who may write an event

**Nobody.** `restatement_events` has `enable` **and** `force` row-level security, a `select` policy
for members of the workspace, and no insert, update or delete policy or grant for anyone.

- The **tenant** may read its own events and cannot forge or delete one. An event a customer could
  fabricate is an alert nobody can trust, and the argument that keeps tenants out of `envelope_rows`
  applies with more force to the thing that *announces a change* to it.
- **`app_ingest` has no grant on the table at all** — asserted directly with `has_table_privilege` —
  and its writes still produce events, because the privilege is the SECURITY DEFINER trigger
  function rather than the role. That is the same shape as `app.upsert_envelope_row` and narrower:
  nothing *calls* `app.record_restatement`, only the trigger fires it.

## 6. Cost estimate

**Per connected account per month: no new infrastructure, no dependency, no platform call.**

| Term | Effect |
|---|---|
| Write path, unchanged rows | One `when`-clause evaluation per updated row. No function call, no insert |
| Write path, changed rows | One PL/pgSQL call and one insert |
| **Storage** | The uncomfortable one. One row per restatement, and a broad platform restatement moves many rows at once. A Meta 28-day window over a large account is thousands of rows in one night |
| Read path | Untouched |

**The volume question is real and is not answered here.** §4.2 describes a per-row event and that is
what this produces; whether a consumer wants one event per row or one coalesced event per
(source, account, date) is a **delivery** decision, and delivery does not exist yet. The outbox
keeps `attempts` and `delivered_at` columns so that unit does not have to guess what the first
events should have recorded — but nothing drains them, so **an unbounded outbox is a real risk the
day a connector starts writing at volume.** Named, not solved.

## 7. Platform-terms check

**5. RLS.** `PASS` — the new table carries `workspace_id`, `enable` and `force` RLS, a select policy
keyed on `app.can_read_workspace`, and tenant-isolation assertions in both directions.

**6. No service-role bypass.** `PASS` — no service key. The trigger function is SECURITY DEFINER
with a pinned `search_path`, the same narrow-privilege pattern as the ingest function, and the
suite asserts `app_ingest` holds no grant on the table.

**7. No cross-workspace read.** `PASS` — every query is keyed on one `workspace_id`; the pending
index leads with it.

**8. No cross-customer aggregation.** `PASS` — an event describes one row of one workspace.

**10. No resale or redistribution.** `N/A` today, **and this is the gate the delivery unit will
have to answer.** A webhook is the first thing in this system that moves platform data *out* of the
workspace by design, to a URL the customer nominates. That is the customer's own data going to the
customer's own endpoint, which is fine — but it is the first egress path, and it needs an explicit
answer rather than an inherited one.

**13. Hash at the edge.** `N/A` — an event carries metrics and a row identity, never a payload and
never contact data.

**16, 17.** `N/A` — no platform call, no approval.

**18. Claim provenance.** `PASS` — nothing user-visible. Specifically **not** claimable yet: there
is no webhook to sell, and §4.2's line about what "no incumbent sends" stays out of the claims list
until something is delivered.

Gates 1–4, 9, 11, 12, 14, 15: `N/A`.

**Result:** `6 PASS, 12 N/A, 0 FAIL`

## 8. What was left out

- **Delivery.** Endpoints, signing, retries, backoff, dead-lettering, the drain loop. The next unit,
  and the one that closes the gate.
- **A `finalised` event.** A row's `is_provisional` clearing is the moment the product's central
  promise comes true, and it is arguably the more valuable alert. §4.2 names `restated`; the event
  carries a `type` field precisely so adding one later does not break a consumer's switch.
- **Coalescing.** §6.
- **Currency and timezone changes.** A platform correcting a row's currency changes what the numbers
  mean without changing the numbers. The trigger does not fire on it. Arguably it should; nothing
  decided.
- **Retention.** Nothing deletes a delivered event.

## 9. Verification

**Eleven mutations. Ten caught, and the eleventh is the most useful result in this note.**

| Mutation | Outcome |
|---|---|
| Drop the trigger's `when` clause | **SURVIVED** — see below |
| `revised_from` always includes `spend` | caught, after the assertion was strengthened |
| `revised_from` always includes `conversions` | caught, after an assertion was added |
| Drop `jsonb_strip_nulls` | caught |
| Drop the empty-diff check constraint | caught |
| Let tenants insert events | caught |
| Delete the empty-diff refusal from the contract | caught |
| Delete the did-not-restate refusal from the contract | caught |
| Drop a metric from the trigger's list | caught by the dictionary guard |
| Drop a currency metric from the fx constraint | caught by the dictionary guard |

**The survivor changed a comment, not the code.** Deleting the `when` clause entirely leaves every
assertion passing, because `app.record_restatement` declines on its own when its diff comes out
empty. So the clause is the **cost** guarantee, not the correctness one — and the comment beside it
claimed it was "THE FEATURE". That claim is now replaced by what the mutation established:
correctness rests on `v_before = '{}'` in the function, cost rests on the clause, and the two
staying in step rests on the dictionary guard, which is the only thing that fails when a metric is
in one and not the other.

**Two assertions were weak and the mutations found them.** The first checked `revised_from` had
`conversions` and not `spend`; a mutation that unconditionally added `conversions` was invisible to
it, because that was the metric the test already expected. It now asserts the **exact key set**. The
second gap was subtler: with the `when` clause in place, a function-internal bug can only show where
one metric moved and another did **not**, and no assertion covered a row where a metric was null on
both sides. One was added, and the mutation is caught.

**A process note, because it cost the most time in this unit.** `git checkout --` was used four
times in this session to revert a mutation, and **twice it reverted uncommitted work instead** —
once destroying the whole commerce-grain change, once destroying this migration after it had been
written and applied. The rule that actually works: **commit first, mutate second**, and treat a
"survived" result as a claim about the harness until the mutation is confirmed to have landed.

**Repository gates**, each checked by exit code rather than by reading output — the omission that
turned CI red on `ea46fb1`:

| | |
|---|---|
| Lint, format | pass |
| Brand, tokens guards | pass |
| Dictionary guard | pass, and now checking two more lists than it did |
| Typecheck, build | pass |
| Unit tests | **362, up from 352** |
| Database suite | **140 assertions, up from 118** — 52 RLS, 20 scheduler, 46 envelope store, 22 restatement outbox |
