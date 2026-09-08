# 27. Draining the outbox: signing, retrying, and giving up

**PR:** #3 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and what is still missing

`26-restatement-outbox.md` built detection and said plainly that nothing drained the outbox, so the
kickoff's gate — *"a tiered restatement backfill and a restatement webhook before any fifth
connector"* — was still closed. This is the other half: **claim, sign, POST, record.**

| | |
|---|---|
| `public.webhook_endpoints` | Where a workspace's deliveries go. HTTPS only, one active per workspace, readable by members, writable by nobody |
| `app.due_restatement_events` | Claims a batch under a lease and returns the payload with the endpoint to send it to |
| `app.record_delivery` | The whole retry policy: success, or a scheduled next attempt, or dead-letter |
| `@repo/webhooks` | Secret derivation, the signature scheme, and the drain loop over injected ports |

**What is still missing, precisely: nothing invokes the drain on a schedule.** There is no cron
trigger, because `apps/api-edge` has no database client at all — the same reason
`16-performance-endpoint.md` ships a `PerformanceStore` port with no live implementation. That is
one wiring step, blocked on the same absent infrastructure as everything else in the repository
(no Supabase project, no deployed Worker), and it is configuration rather than design. **Everything
the wiring would call exists and is tested.**

**Numbered 27. `20-marketing-site.md` is still owed.**

## 2. The signing secret is never stored

An endpoint's secret is **derived** — `HMAC(service_key, "<endpoint id>:<secret version>")` — by the
worker, at delivery time.

**Why:** a database dump contains no signing material at all. A backup, a read replica, a support
export, a misconfigured analytics sync: those are the leak paths that actually happen, and none of
them carries a secret if no secret is at rest.

**What it costs, stated rather than glossed:** the service key can derive *every* endpoint's secret,
so it must live only where the delivery worker runs, and rotating it rotates everyone at once.
That is exactly why `secret_version` is per endpoint — one customer's compromised endpoint is
rotated by incrementing an integer, and the previous secret stops verifying immediately, which is
what rotation has to mean.

**The alternative considered and rejected** was a random secret per endpoint, sealed with the
vault's envelope encryption. It reuses tested machinery, but it widens what one key compromise
unlocks — the KEK would then open credentials *and* signing secrets — and it puts ciphertext in
every backup for no gain over deriving.

## 3. The timestamp is inside the signature, and that is the whole scheme

`t=<unix seconds>,v1=<hex hmac of "t.body">`, Stripe's scheme, because receivers already have code
for it and a novel scheme is a novel way to be wrong.

**Signing the body alone would produce a token valid forever.** Anyone who captures one delivery
could replay it whenever they liked. Signing `timestamp.body` and rejecting a timestamp outside a
five-minute tolerance bounds that to the window.

**A mutation proved the tests did not know this.** Replacing the signed message with the body alone
survived every assertion in the file, because the replay test only demonstrated that the *tolerance
check* runs. With the timestamp outside the signature an attacker simply replaces `t` with now: the
tolerance passes and the signature still verifies. The test that now exists takes a captured header,
swaps its timestamp for a fresh one, and requires verification to fail.

`verifySignature` is exported deliberately: a receiver gets a reference implementation, and the
tests assert what a receiver would actually see rather than what the signer believes it produced.

## 4. The retry policy lives in SQL

`app.record_delivery` takes "it worked" or "it did not" and computes everything else: attempts, the
next attempt from `app.delivery_backoff`, and `failed_at` once the six attempts — about thirty hours
— are spent.

**A worker that owned the schedule could set the next attempt to now on every failure and spin**,
and there would be two copies of the policy for nothing to check. The worker's whole vocabulary is
two functions, and it holds no table grant at all: asserted with `has_table_privilege`, the same
shape as `app_ingest` and `app_scheduler`.

**The backoff is fixed and has no jitter.** Jitter needs a random source, which makes every
assertion about it probabilistic; the thundering-herd problem it solves is bounded here by the batch
size a worker claims rather than by the schedule.

**Six attempts, then stop.** An event that retries forever is an endpoint nobody notices is broken.
`failed_at` and `last_error` are what is left behind.

## 5. At-least-once, and every claimed event is recorded

**Delivery is at-least-once and the event id is the idempotency key.** A worker that POSTs
successfully and dies before recording will deliver that event again when its claim expires.
Recording *before* sending would lose events instead of duplicating them, and a receiver dedupes on
an id far more easily than it notices an absence.

That makes closing every claim the property worth testing, so three failure paths are handled rather
than allowed to abandon the batch:

- **`send` throws.** One unreachable endpoint must not strand the events queued behind it.
- **The payload fails its own contract.** Refused before sending, and recorded as a failure — so a
  producer bug exhausts the schedule and dead-letters with its reason in `last_error`, rather than
  being dropped silently. A malformed event delivered to a customer is worse than one that never
  arrives.
- **`record` itself throws.** The outcome is lost, not the event: the claim expires and it is
  delivered again. Counted separately in the report, so an operator can tell "the endpoint is
  broken" from "we are broken".

**The drain is sequential, not concurrent.** Concurrency would fan out to customer endpoints faster
than any of them asked to be called; the throughput knob that matters is how often the worker runs.

## 6. A bug the mutations found

The unique index was originally `(workspace_id, url) where active` — one active endpoint per URL,
which permits **several active endpoints per workspace**.

`restatement_events` carries **one delivery state per event**. So an event for such a workspace
would be claimed once, returned twice by the join, delivered twice, and closed by whichever
`record_delivery` arrived first — losing the other outcome entirely and retrying neither.

Fan-out needs a per-(event, endpoint) delivery row. It is not built, so **the configuration is now
impossible** rather than allowed to half-work: one active endpoint per workspace, with the reason in
the migration and an assertion in the suite. Section 4.2 promises a webhook, not fan-out, so nothing
promised is narrowed.

This was found by chasing a mutation that survived — "an inactive endpoint still receives" — which
survived because a second join happened to filter it. The mutation was wrong; the code it pointed at
was not.

## 7. Cost estimate

**Per connected account per month: no new infrastructure, no dependency, no platform call.** One new
workspace package with one workspace dependency.

| Term | Effect |
|---|---|
| Claim | One indexed query per drain, bounded by the batch size |
| Delivery | One HTTPS request per event. **This is where the volume question of `26` §6 lands** |
| Failure | Up to six requests per event before it stops |
| Storage | Unchanged; the outbox columns were already there |

**The unbounded-outbox risk `26` §6 named is now bounded in one direction and not the other.**
Delivered and dead-lettered events stop consuming requests, but **nothing deletes them**: retention
is still unwritten, and a busy connector will grow the table indefinitely. Named again rather than
quietly inherited.

## 8. Platform-terms check

**5–7. Tenancy.** `PASS` — `webhook_endpoints` carries `workspace_id`, `enable` and `force` RLS, a
select policy keyed on `app.can_read_workspace`, and assertions in both directions. Every query in
the claim is keyed on one workspace.

**6. No service-role bypass.** `PASS` — `app_webhook` is `nobypassrls`, holds **no table grant**,
and can execute exactly two SECURITY DEFINER functions with pinned `search_path`. Asserted, and a
tenant is asserted unable to call either.

**10. No resale or redistribution.** **`PASS`, and this is the first PR that has had to answer it
rather than mark it N/A.** A delivery carries one workspace's rows to a URL configured for that
workspace, over HTTPS, signed. No path exists by which one workspace's data reaches another's
endpoint. A tenant cannot create or repoint an endpoint, because minting a signing secret is an
account-management action under section 15 — asserted directly, since a tenant who could write that
table could point another workspace's deliveries at itself the day the policy loosened by one
clause. Recorded as spec decision 11A.16.

**13. Hash at the edge.** `N/A` — an event carries metrics and a row identity. No payload, no
contact data.

**16, 17.** `N/A` — no platform call, no approval.

**18. Claim provenance.** `PASS` — nothing user-visible ships. §4.2's line about what "no incumbent
sends" still may not enter the claims list: nothing is scheduled to run, so nothing is delivered.

Gates 1–4, 8, 9, 11, 12, 14, 15: `N/A`.

**Result:** `6 PASS, 12 N/A, 0 FAIL`

## 9. What was left out

- **The cron trigger.** §1. Blocked on infrastructure that does not exist, not on design.
- **Endpoint management.** Creating an endpoint and showing its secret once belongs in a server
  action against Supabase with RLS, per section 15.
- **Fan-out.** §6.
- **Retention.** §7.
- **Auto-disabling a dead endpoint.** Six failures dead-letter the *event*; the endpoint stays
  active and the next event tries again. Disabling after N consecutive failures is the obvious next
  behaviour and is not built.
- **`410 Gone` as a special case.** Treated as any other failure and retried, which is wasteful and
  correct.
- **A `finalised` event.** Unchanged from `26` §8.

## 10. Verification

**Nineteen mutations. Eighteen caught; one cannot be caught by any test.**

| Mutation | Outcome |
|---|---|
| Sign the body only, dropping the timestamp | survived a whole-file mutation, **caught** once a timestamp-binding test existed and the signer alone was mutated |
| `verifySignature` ignores the tolerance window | caught |
| The secret ignores `secret_version` — rotation does nothing | caught |
| The secret ignores the endpoint — one secret signs everything | caught |
| `timingSafeEqual` short-circuits on the first difference | **SURVIVED, and no test can catch it** |
| A thrown `send` abandons the batch | caught |
| An invalid payload is sent anyway | caught |
| A failed `record` aborts the drain | caught |
| `fetchSend` follows redirects | caught |
| The claim lease is ignored, so two workers deliver twice | caught |
| A delivered event stays due | caught |
| An inactive endpoint still receives | survived a half-applied mutation; **caught** once both joins were mutated — and finding out why produced §6 |
| Success does not release the claim | caught |
| A failure retries immediately instead of backing off | caught |
| The attempt schedule never ends | caught |
| An outcome can be recorded twice | caught |
| An `http://` endpoint is allowed | caught |
| Tenants may create endpoints | caught |
| A second active endpoint per workspace is allowed | caught (the assertion added in §6) |

**The surviving mutation is honest, not an excuse.** Replacing the constant-time comparison with
`a === b` is functionally identical; only its timing differs, and a timing assertion is flaky by
construction. It stays constant-time because a signature comparison that returns early leaks the
signature one byte at a time to anyone who can measure — and that property is defended by review,
not by this suite. Saying so is better than a test that passes for the wrong reason.

**Two mutations were wrong before the code was.** One mutated signer and verifier together, so the
round-trip still agreed; one mutated a join that a second join duplicated. Both taught something: a
"survived" result is a claim about the harness until the mutation is confirmed to have landed the
way it was meant to.

**Repository gates**, each checked by exit code:

| | |
|---|---|
| Lint, format | pass |
| Brand, tokens, dictionary guards | pass |
| Typecheck, build | pass |
| Unit tests | **387, up from 362** — 25 in `@repo/webhooks` |
| Database suite | **169 assertions, up from 140** — 52 RLS, 20 scheduler, 46 envelope store, 22 outbox, 29 delivery |
