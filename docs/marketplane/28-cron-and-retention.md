# 28. Scheduling the drain, and stopping the table growing forever

**PR:** #3 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is

Two things `27-webhook-delivery.md` named and did not do: **nothing invoked the drain**, and
**nothing ever left the outbox**. Both are now done, and the second one is the more interesting.

**Numbered 28. `20-marketing-site.md` is still owed.**

## 2. Retention, and the one rule that matters

Delivered events are kept **30 days**; dead-lettered ones **90**. A delivered event has done its
job. A dead-lettered one is the record of an endpoint that was broken for thirty hours, which is
precisely what an operator goes looking for weeks later, so it is kept three times as long.

**AN UNDELIVERED EVENT IS NEVER PRUNED, AT ANY AGE.** That is the load-bearing line and it is
asserted directly. An event still in the queue after nine months is **not garbage, it is a bug** —
a workspace with no endpoint, a worker that stopped running, a lease nobody released. Deleting it
would erase the evidence and the customer's alert in one statement, and leave a healthy-looking
table behind. A prune that quietly fixes its own symptom is worse than no prune.

**The prune is bounded and deliberately unordered.** Garbage collection has no deadline and no
preference: which five thousand rows go first does not matter, and an `order by` would sort a
growing table on every run. `for update skip locked` so it never blocks a delivery mid-flight.

**Two partial indexes**, one per outcome, rather than one over `occurred_at`. A single index would
have the prune scanning the *queue* as well as the settled rows, and the queue is the part that has
to stay fast.

**What is not decided.** `restatement_events` is readable by workspace members, so if the events
ever become a customer-facing history — "what changed in the last month" — then 30 days stops being
an operational default and becomes a product promise. Nothing exposes them today. When something
does, the window needs a decision rather than an inheritance.

## 3. The cron wiring, and what it did not change

Two schedules in `wrangler.jsonc`: **every minute** to deliver, because a restatement detected
during a nightly backfill should not wait for morning, and **daily at an arbitrary minute** to
prune, because every scheduled job in the world runs at `:00`.

**The store is still a port and is still unbound.** Whether events arrive over PostgREST with a
minted role JWT or through Hyperdrive cannot be decided honestly against a Supabase project that
does not exist — the same reason `/v1/performance` answers 503 rather than pretending
(`16-performance-endpoint.md`). Adding a database client to make this run would be choosing that
architecture by accident, in the file least suited to arguing for it.

**What did change is that an unconfigured run now says so, out loud.** Before, there was nothing to
say it with. Now every invocation returns a `ScheduledOutcome` and logs it, so
*"the deployment has no database"* is visible in the log rather than indistinguishable from *"there
was nothing to deliver"*. The outcome carries **counts and reasons only** — its shape is what
guarantees no payload and no secret can reach a log line.

### 3.1 Two refusals that earn the file

**An unknown cron is reported, never ignored.** A schedule added to `wrangler.jsonc` and forgotten
in the handler would otherwise be an invisible no-op running on someone's schedule forever. And
because Wrangler cannot import a TypeScript constant, the two lists are duplicated — so **a test
reads `wrangler.jsonc` and asserts every cron in it dispatches.** The config reaches the test
through a Vite `?raw` import, because the suite runs inside workerd where there is no filesystem;
the first attempt used `node:fs` and failed for exactly that reason.

**A missing signing key stops delivery *before* the claim.** Claiming first would lease a batch that
could not then be signed: every event would fail and burn six attempts each on a missing environment
variable. `deriveSecret` already refuses an empty key; catching it here turns a self-inflicted
outage into a log line.

## 4. Cost estimate

**Per connected account per month: no new infrastructure, no dependency.** One workspace dependency
added to the Worker.

| Term | Effect |
|---|---|
| Delivery cron | 1,440 invocations/day, almost all claiming nothing. Free-tier noise on Workers |
| Prune cron | One bounded statement a day |
| **Storage, before** | Unbounded. Every event ever detected, forever |
| **Storage, after** | Bounded by the retention windows — *for settled events*. An undelivered backlog still grows without limit, deliberately, because that backlog is a fault to fix rather than data to expire |

**One cost the prune does not pay.** With a 5,000-row limit and a daily schedule, a workspace
producing more than 5,000 settled events a day past its window would never catch up. That is a
volume nothing here reaches, and it is the same coalescing question `26` §6 raised; the fix when it
arrives is a larger limit or a more frequent prune, both configuration.

## 5. Platform-terms check

**5–7. Tenancy.** `PASS` — the prune matches on outcome and age, never on workspace, and deletes
only rows whose workspace still exists (a deleted workspace cascades already). RLS is unchanged.

**6. No service-role bypass.** `PASS` — `app.prune_restatement_events` is SECURITY DEFINER with a
pinned `search_path`, granted to `app_webhook` and revoked from `public`, `anon` and `authenticated`.
The delivery role's vocabulary is now three functions; it still holds no table grant.

**10. No resale or redistribution.** `PASS`, unchanged from 11A.16. The cron changes when delivery
happens, never where it goes.

**13. Hash at the edge.** `N/A` — no payload, no contact data. Worth noting the log line
specifically: `ScheduledOutcome` carries counts and reasons, so there is no shape in which an event
body could be logged.

**16, 17.** `N/A`. **18.** `PASS` — nothing user-visible.

Gates 1–4, 8, 9, 11, 12, 14, 15: `N/A`.

**Result:** `5 PASS, 13 N/A, 0 FAIL`

## 6. What was left out

- **The store implementation.** §3. The one remaining piece, and it is an architecture decision
  waiting on a Supabase project rather than an unwritten function.
- **Endpoint management.** Creating an endpoint and showing its secret once, per section 15.
- **Auto-disabling a dead endpoint.** Six failures dead-letter the event; the endpoint stays active.
- **Fan-out**, **coalescing**, **a `finalised` event** — unchanged from `27` §9 and `26` §8.
- **Configurable retention.** The windows are functions, so changing them is a migration rather than
  a deploy. Per-workspace retention would be a product feature nobody has asked for.

## 7. Verification

**Eight mutations, eight caught.**

| Mutation | Caught by |
|---|---|
| The prune deletes undelivered events too | database suite — the rule that matters |
| The prune ignores its limit | database suite |
| Failed events use the delivered window | database suite |
| A tenant may prune | database suite |
| An unknown cron is silently ignored | api-edge suite |
| Events are claimed before the signing key is checked | api-edge suite |
| An empty signing key is treated as present | api-edge suite |
| A cron is added to `wrangler.jsonc` but not to the handler | api-edge suite — the duplication check |

**Repository gates**, each checked by exit code:

| | |
|---|---|
| Lint, format | pass |
| Brand, tokens, dictionary guards | pass |
| Typecheck, build | pass |
| Unit tests | **396, up from 387** — 65 in `apps/api-edge` |
| Database suite | **178 assertions, up from 169** — 52 RLS, 20 scheduler, 46 envelope store, 22 outbox, 38 delivery |
