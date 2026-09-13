# 61. The scheduler had an identity and no caller, and two defects were waiting behind it

**PR:** #41 &nbsp;·&nbsp; **Date:** 2026-09-13 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the correction it starts with

**The premise this work began from was wrong, and the correction is the most useful thing in this
note.** `58-plan-reconciliation.md` §2.3 says the scheduled half of this system has no identity, and
`60-selling-decisions.md` §6.1 repeated it: that `packages/store/src/jwt.ts` "can mint only
`anon | authenticated | app_ingest`", and that this blocks everything.

That has not been true since `20260912000800_scheduler_entry_point.sql`. `MintedRole` is
`anon | authenticated | app_ingest | app_scheduler`; the role is granted to `authenticator`; three
forwarders sit in `public`; `packages/store/src/scheduler.ts` speaks to them; and
`supabase/tests/02_scheduler.sql` and `13_scheduler_entry_point.sql` guard them.

**What was missing was a caller.** Nothing outside a test had ever called one of those three
functions. So the conclusion held — a product promising "every morning" had no morning — but the
diagnosis pointed at the wrong thing, and anyone acting on it would have rebuilt an identity that
already existed.

This PR is the caller: `apps/api-edge/src/scheduled-ingest.ts`, a third cron, and the two defects
that were waiting behind the fact that nothing had ever claimed a lease.

### The two defects, which are the reason this was not a wiring job

**ONE TENANT'S NULL ABORTED THE WHOLE CROSS-TENANT SWEEP.**
`public.connections.restatement_window_days` is `integer`, nullable by an explicit check
constraint, with no default — and **nothing in this repository writes it**.
`scripts/seal-connection.ts` is the only path that creates a connection and it omits the column. So
every real row carries null, `toDueConnection` threw `StoreError` on anything that was not an
integer, and `due()` maps every row through it. **The first real customer would have stopped every
other customer's backfill**, before a single lease was taken.

The file states the rule it was breaking, ten lines above the code that broke it, about `provider`:

> A cross-tenant read must not be refusable by one tenant's data.

The null now travels the way an undrivable provider travels, and the caller decides. It is **not**
defaulted to a number: `google_ads` is `perAccount: true` with a per-conversion-action window, so a
hardcoded fallback would silently re-read the wrong span and every row it produced would look
correct.

**CLOSING A LEASE DID NOT CHECK WHOSE IT WAS.** `20260912000800` recorded this itself, verbatim, as
a known gap — unreachable while nothing claimed. A caller makes it reachable, and the consequence is
two instances pulling one connection with the first releasing the second's lease out from under it,
spending a platform quota shared across tenants twice. `app.record_backfill` now takes
`p_claimed_by` and the UPDATE requires `claimed_by = p_claimed_by`.

### The watermark, and the silent hole it closes

`last_backfill_at` **cannot** be the resume point, and using it would have been the natural thing to
do:

- `runIngest` pins `until = fetchedAt` at the **start** of the run, so the window it read closes
  when the run began.
- `app.record_backfill` stamps `last_backfill_at = now()` at the **end**.

The gap between them is the duration of the run — up to the full fifteen-minute lease. Feeding it
back as the next `since` skips every order modified while the run was in flight. **Every night. The
totals stay plausible and nothing errors.** `connections.ingest_checkpoint` is a separate column
because it answers a different question: *how far has the walk reached*, not *was a pull completed
today*.

## 2. Three decisions taken, and one deliberately left open

**THE FIRST WALK STAYS MANUAL.** `runIngest` requires `since`, and `52-ingest-runtime.md` §4 says
why: "A default window on a watermark walk is the worst kind: too short opens a silent hole, too
long spends the merchant's store on history it already has, and the operator learns neither." A cron
has nobody to suggest a number to, so **it does not guess one** — a connection whose
`ingest_checkpoint` is null is reported `awaiting_first_run` and skipped. The alternatives were a
constant (guesses for every merchant) or a per-connection `initial_backfill_since` set at seal time
(better, and a larger change that belongs with onboarding).

**THE CHECKPOINT ADVANCES ONLY ON SUCCESS.** The argument for advancing on partial progress is that
a backfill longer than one invocation would otherwise restart forever. That argument does not apply
*because of the first decision*: the long first walk is manual, so the cron only ever walks one
incremental window. What is left is the house rule — trusting the arithmetic of a run that failed
for an unknown reason is how a silent hole gets written deliberately. **If onboarding is ever
automated, this decision reopens with it.**

**WHOSE MIDNIGHT IS OPEN, AND IS NOT SETTLED HERE.** `app.due_connections` offers a connection when
`last_backfill_at < date_trunc('day', p_now)`. `date_trunc` truncates in the **session's
TimeZone**, and nothing in this repository sets one — not `config.toml`, not a migration, not the
shim. So the boundary deciding whether a Thai café is pulled today is a setting outside this
repository, and it is **not** `connections.timezone`, a column that exists and that this predicate
does not read.

Making it timezone-aware means replacing the function's body and deciding what a null timezone does
there — and `20260912000400`'s own rule forbids `coalesce(timezone, 'UTC')`, calling a default "a
guess wearing the costume of a fact". That is a founder decision with a cost. **The predicate is
untouched and the marketing copy that asserted a local read time was deleted instead** — see §5.

One query would settle it against the live project: `select current_setting('TimeZone')` as
`authenticator`.

## 3. Cost estimate

**Per connected account per month:** `~90 extra PostgREST requests`

Three per connection per day — one `claim_connection`, one `record_backfill`, one connection read as
`authenticated` — plus one shared `due_connections` call per sweep amortised across every
connection. The WooCommerce page fetches and the `ingest_envelope_rows` writes are **not new**: they
are the same calls `POST /v1/ingest/run` makes today, moved from an operator's terminal to a clock.
No new vendor, no new key, no per-tenant charge.

**The real number is fixed, not per account: this requires Workers Paid.** Cloudflare's limits, read
2026-09-13 at `developers.cloudflare.com/workers/platform/limits`:

| | Free | Paid |
|---|---|---|
| CPU per Cron Trigger | **10 ms** | 30 s under a 1-hour interval; **15 min at ≥ 1 hour** |
| Wall clock per cron | 15 min | 15 min |
| Cron Triggers per **account** | 5 | 250 |

A sweep opens an AES-GCM credential, pages a merchant's store, normalises orders and writes envelope
rows. That does not fit in 10 ms, so on Free the invocation is terminated **with a lease held**. Free
also caps triggers at five per account and three are now declared.

**This is why `INGEST_CRON` is `23 2 * * *` and not an hourly-or-shorter interval.** Below one hour
the CPU ceiling drops from 15 minutes to 30 seconds, which no longer matches the 15-minute lease
that `app.claim_lease_interval()` was sized against — the sweep would be killed mid-run holding a
lease, and the connection stranded for the rest of the window with a log line that says nothing
about why. `scheduled.test.ts` asserts the minute and hour fields are not `*`.

I did not read the Workers Paid monthly fee in this session and am not going to state a figure.

## 4. Platform-terms check

**1. BYOC.** `PASS` — the sweep reaches a merchant's store through the same sealed per-workspace
credential `POST /v1/ingest/run` uses, opened with `CREDENTIAL_KEK` for one connection at a time. No
company-held platform token anywhere.

**2. Vendor-key exception.** `N/A`. **3. No token pass-through.** `N/A`.

**4. Credential hygiene.** `PASS`, and it is the reason the sweep's outcome type carries **codes and
counts only**. `SweptConnection.failure` is a code, never a message: an `Error` message can carry a
store URL, a filter value or a merchant's domain, and this object is `JSON.stringify`'d into a log
line. A test asserts the fake's own error text does not appear in the serialised outcome.

**5. RLS.** `PASS` — one column added to an existing table, covered by that table's existing
policies. No new table.

**6. No service-role bypass.** `PASS` — and the shape is the point. The sweep uses **two different
identities on purpose**: `app_scheduler` for the cross-tenant work list, which holds no table grant
at all, and `authenticated` for the per-connection read of the credential and the checkpoint, under
row-level security, for one workspace it already knows it is acting for. No service-role key exists
in this Worker.

**7. No cross-workspace read.** `PASS` with the standing exception this whole design is built
around: `due_connections` is the one cross-tenant query, it returns **scheduling metadata only**,
and `13_scheduler_entry_point.sql` asserts its column set exactly. **The checkpoint was deliberately
NOT added to it** — it is per-connection tenant data and it travels on the `authenticated` read
instead. Widening the work list is the exact thing that guard exists to refuse.

**8. No cross-customer aggregation.** `PASS` — nothing is aggregated.

**9. API key scope.** `N/A`. **10. No resale.** `PASS` — no data leaves a workspace.
**11. Meta client list.** `N/A`. **12. Dependency licences.** `PASS` — no dependency added.

**13. Hash at the edge.** `PASS` — the sweep moves no personal data. WooCommerce's buyer fields are
redacted by `@repo/payloads` on the path this reuses, unchanged.

**14. Forbidden payloads.** `N/A`. **15. Per-destination consent.** `N/A`.

**16. Tier reality.** `PASS`, and it is answered in §3 with the limits read this session rather than
recalled. **17. No new long-lead dependency.** `PASS` — no approval; a Workers Paid plan is a bill.

**18. Claim provenance.** `PASS` for what this PR adds, and it **removes** one unbacked claim:
`HERO.synced`'s "Read at 06:40" is deleted. The one line in note 60 §6.1 this backs is
`DashboardFeature`'s "The page you open once a day", and only once the cron is observed firing.
`AVAILABLE_CAPABILITIES` is untouched — `surface:answer` needs a delivered answer, and this delivers
data.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 5. What was left out

**The webhook drain is still unconfigured, and it is a different identity.**
`apps/api-edge/src/index.ts` still passes `store: null` for the deliver and prune crons.
`app_webhook` is `NOLOGIN NOBYPASSRLS`, its three functions live in the unexposed `app` schema with
**no `public.` forwarder migration and no adapter in `packages/store`**, so it needs Hyperdrive.
Reading "two of three crons say `not_configured`" as "the scheduler did not land" is the specific
misreading the Worker's own comment now guards against.

**No brief is generated and nothing is delivered.** A refreshed row is not a brief.
`generateInsight` still has no caller and there is no channel adapter. This is the first of the
three things note 59 §4 sets as the bar for `surface:answer`.

**Only WooCommerce is swept.** The sweep gates on `INGEST_SOURCE`, not on `DueConnection.drivable`,
and the distinction is load-bearing: `drivable` is true for all five providers in `PROVIDER_LANES`,
while `runIngest` raises `unsupported_provider` for four of them. A sweep trusting `drivable` would
claim a GA4 connection, fail, release, and be handed the same row forever — starving the one
connection it can pull, which sits behind four undrivable ones in a list ordered
`last_backfill_at asc nulls first`.

**`SWEEP_LIMIT` is 25, not the store's ceiling of 500.** A limit the invocation cannot honour is
worse than a small one: the connections past the cut are leased, not pulled, and released at the end
having achieved nothing. Raise it when the sweep is observed finishing early.

**The sweep is serial.** Each connection is a merchant's WordPress install serving customers, and
`50-woocommerce-backfill.md` is largely about not amplifying load on it. Five at once multiplies
that by five for no gain a nightly job needs.

**`MVP-PLAN.md` §4 Decision 2 is reversed by this PR** — "Cron or manual trigger? Recommendation:
manual… Add the cron afterwards". Two design notes cite it as the reason no cron exists
(`50-woocommerce-backfill.md`, `52-ingest-runtime.md`). "Afterwards" reads as a deferral rather than
a refusal, and this is the afterwards; it is recorded here rather than left to contradict two notes
silently.

## 6. Open or unverified items

- **Whose midnight.** §2, Decision 3. One query settles it.
- **Nothing writes `restatement_window_days`.** Is it a column waiting for the `google_ads`
  connector, or one that should have been derived from `RESTATEMENT_CLOCKS` all along? The answer
  decides whether `number | null` is permanent or transitional.
- **How many connections one sweep can finish.** 25 is a guess bounded by a fifteen-minute
  invocation pulling stores serially. It is unmeasured, and the tension is real: measuring it may
  argue for sweeping more often, which collides with the one-hour CPU cliff in §3.
- **Workers Paid is not provisioned.** Nothing in this PR checks it, and on Free the sweep will be
  killed at 10 ms with a lease held.

## 7. Mutation testing

| Mutation | Result |
|---|---|
| restore the throw on a null `restatement_window_days` | `api-edge=1`, two named tests, nothing else |

The rest of this unit's guards are asserted by the SQL suite, which runs the real migrations against
a real PostgreSQL: the old three-argument `app.record_backfill` is gone rather than merely unused,
a lease cannot be closed by an instance that does not hold it, a failed run does not advance the
watermark, a checkpoint in the future is refused, an anonymous close is refused, and `anon` and
`authenticated` are refused the new arity **by execution** rather than by `has_function_privilege`.
