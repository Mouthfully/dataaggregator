# 52. The ingest runtime, and the mutation that survived

**PR:** `apps/api-edge/src/ingest.ts` and `POST /v1/ingest/run` — the first thing in this repository
that writes an envelope row. `INGEST_TOKEN` as a Worker binding.

This is **step 6 of `MVP-PLAN.md` §5**, and with steps 3 and 4 merged it closes the critical path
`1 → 2 → 3 → 6`. Every part of it already existed and was tested; none of it had ever been called in
sequence.

## 1. What this is, and the decision taken

`MVP-PLAN.md` §1 counts six joints between *"a shop owner pastes a key"* and *"a number on a
screen"*, and says one and a half were connected. This closes four at once: a connection is read, a
credential is opened, a platform is fetched, and rows are persisted.

### A dedicated secret, never the API key

`/v1/performance` authenticates a customer's `mp_live_…` key. That key is **read-only by
construction**: the token minted from it carries no `sub`, so `app.can_write_workspace()` refuses,
and a stolen one cannot re-point a connection or invite a member.

This route causes **writes** into `envelope_rows` and spends the merchant's own store's capacity.
That is a strictly larger power, so it does not share a credential with the smaller one. It takes
`INGEST_TOKEN`, an operator secret, compared in constant time.

**And the workspace arrives in the body**, which inverts `performance.ts`'s rule — *"accepting the
workspace from the caller would make cross-tenant access a matter of typing a different id"*. That
inversion is sound here for a reason that does not generalise: the holder of the operator secret
already has every workspace. What still applies is the isolation that cannot be typed around — the
connection read runs under a token claiming exactly the workspace in the body, so a mismatched
(workspace, connection) pair is refused **by row-level security**, not by this file.

### The write happens per page, and the order is the whole correctness argument

`runWooBackfill` yields one batch per page and fires `onChunk` after a chunk is read in full. This
awaits the write of each page *before* pulling the next, so:

> by the time a checkpoint is offered, every page behind it is already in the database.

Buffering pages to save round trips breaks that. A run could report a watermark covering rows it had
read and not yet written, and the next run — starting from the watermark — **would never look at
them again**. There is no mechanism anywhere that re-reads a window behind the mark.

A page is at most a hundred orders, which is the size `client.ts` capped `per_page` to precisely so
one fits in a 128 MB isolate. Writing it is one RPC carrying one bounded array. Mutation I1
(buffer across pages) fails three assertions.

### Two independent counts, not one printed twice

`rowsWritten` accumulates what the **database reported**, never what was read. `createIngestStore`
already compares the count it sent against the count returned and refuses a mismatch; this adds the
run's own arithmetic on top, so a response reading `rows_read: 217, rows_written: 217` is two
numbers agreeing rather than one echoed. Mutation I2 fails.

### Four refusals, four different people

| refusal | status | who fixes it |
|---|---|---|
| `bad_request` | 400 | the caller |
| `no_such_connection` | 404 | the caller (or nobody — it may be another tenant's) |
| `unsupported_provider` | **501** | a developer: four sources have a client and a normaliser and no `backfill.ts` |
| `no_timezone` | **409** | an operator: the request is fine, the *connection* is incomplete |
| `connection_unusable` | 409 | the merchant |
| `wrong_credential_lane` | 409 | whoever sealed it |
| `bad_kek` | **503** | whoever deployed it |

`no_timezone` is the one worth defending. It is **not** a bad request — nothing about the request is
wrong — and guessing UTC would move every order placed in the merchant's evening onto the previous
day, which is the entire reason `50-woocommerce-backfill.md` added the column. Mutation I4 (drop the
check and default to UTC) fails.

`connectionHealth` is **asked**, not re-derived: it knows a persisted `needs_reauth` outranks an
expiry that has not passed, which is a distinction this file would have got wrong.

### `since` and `until` go through the connector's own RFC3339 check

`Date.parse` is not RFC3339 validation — `2026-02-30T00:00:00Z` normalises to March 2 without
complaint, and an offset-less string is read as *local* time. Either would query a window nobody
asked for and then advance the checkpoint past the days it skipped.

`parseRfc3339` is exported from `@repo/connectors` and used here, so the HTTP boundary and the
connector cannot come to disagree about what an instant is. Only the error type differs: at this
boundary the caller is a person holding a request body, so it is a `bad_request` naming the field
rather than a 502 surfacing from inside the run.

### What a failed run still tells you

A partial run throws `IngestRunFailure`, which **carries the report**. The route answers 502 and
includes the counts and the checkpoint anyway, because without them the operator's only safe move is
to redo the whole span. Everything written stays written — the upsert is idempotent, so a resume
costs requests and changes nothing.

What must never happen is the checkpoint naming the span's *end*. Mutation I3 does exactly that and
fails two assertions, one of which is the sharpest property in the suite: a run whose **write**
fails reports `rows_written: 0` and a checkpoint unmoved from `since`.

### Counts and reasons only, and one of them was leaking

Same rule as `ScheduledOutcome`'s, and here it has teeth: the objects in scope during a run include
a decrypted consumer secret and a page of orders carrying buyer name, email, phone and address.

`reasonOf` lets through only text this repository wrote — `WooClientError`, `WooNormalizeError`,
`WooBackfillError`, `StoreError`, all of which are sentences written for a human and none of which
interpolates a credential. **Everything else is reduced to its name**, and `ExtractError` is why:
its message interpolates the request URL, and the request URL is the merchant's store origin, on its
way into a response body and a log line. Mutation I6 (return every message) fails.

### The watermark is returned, not persisted

`connections_update` is `using (app.can_write_workspace(workspace_id))`, which refuses outright when
`app.current_user_id()` is null — and the minted token deliberately has no `sub`, because a
fabricated human identity is exactly what would turn this into a credential that can re-point a
connection. **So the Worker physically cannot write `last_backfill_at`.** That is a limitation with
a cause, not an oversight; see §4.

## 2. Cost estimate

**฿0.00 per connected store per month in platform fees**, unchanged from
`50-woocommerce-backfill.md` §2: WooCommerce is the merchant's own install, and this PR adds no
platform call. What it adds is the write, priced per run:

| Run | Merchant requests | PostgREST calls | Rows |
|---|---|---|---|
| nightly, café (~50 changed orders) | 1 | 1 read + 1 write | ~50 |
| nightly, busy seller (~500) | 1–6 | 1 read + 1–6 writes | ~500 |
| first backfill, 2 years, quiet store | 24 | 1 read + 0–24 writes | varies |

One write per page rather than one per run is **more** round trips than the alternative and is the
correct trade: see §1. At `per_page=100` the extra calls are one per hundred orders.

Supabase disk: one `envelope_rows` row per order, which
`20260908001100_envelope_rows.sql` sizes and `24-commerce-grain.md` §6 records as ~3 orders of
magnitude above a daily aggregate — a decision taken in the normaliser, not here.

No R2 object is written. See gate 14.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — the merchant's own consumer key, sealed by the merchant's own connection row,
opened in the isolate with a KEK the database never sees.

**2. Vendor-key exception.** `N/A` — no vendor.

**3. No token pass-through.** `PASS` — the opened credential reaches `basicAuthHeader` and the
`Authorization` header of a request to the merchant's own origin, and nothing else. It is never
logged, never returned, never in a URL, and never in an error message: `reasonOf` is the gate, and
a test asserts it.

**4. Credential hygiene.** `PASS` — the plaintext exists in one isolate for the duration of one run.
`CREDENTIAL_KEK` and `INGEST_TOKEN` are Worker secrets and appear in no file in this repository.

### Tenancy

**5. RLS.** `PASS` — the connection read is subject to `connections_select`. A mismatched
(workspace, connection) pair is refused by the policy, not by this file, and the run then answers
404 for the same reason it answers 404 for a connection that does not exist.

**6. No service-role bypass.** `PASS` — two minted tokens, both narrow. `authenticated` with a
`workspace_id` claim and no `sub` for the read; `app_ingest` with **no claims at all** for the
write, which is executable by no other role. Verified against the live project while writing this
note: `app_ingest` → 200, `anon` → 401 `42501`, `authenticated` → 403 `42501`.

**7. No cross-workspace read.** `PASS` — `workspace_id` and `connection_id` on every written row come
from the **connection row**, never from the request body. A connector physically cannot choose a
workspace: it never sees one.

**8. No cross-customer aggregation.** `N/A` — one connection per run.

**9. API key scope.** `PASS`, and it is the point of §1: the customer's key is explicitly **not**
accepted here, so this route cannot be reached by anything holding one.

### Data movement

**10. No resale or redistribution.** `N/A` — nothing is sent anywhere. The merchant's own orders go
into the merchant's own workspace.

**11. Meta client list.** `N/A`.

**12. Dependency licences.** `PASS` — nothing added to the lockfile. Two workspace edges appear
(`apps/api-edge` → `@repo/connectors`, `@repo/extract`).

### PII and consent

**13. Hash at the edge.** `PASS` — a WooCommerce order carries buyer name, email, phone and address,
and **none of it is read**. `WooOrder` names only the fields the normaliser consumes; no envelope row
carries a field derived from a person. The response and the log are counts.

**14. Forbidden payloads rejected before egress.** `PASS` by not writing one. WooCommerce's
redaction policy is `redact` and `putPayload` refuses a non-`verbatim` source outright, so the only
open path is `putBufferedPayload` — deliberately not wired here (§4).

**15. Per-destination consent.** `N/A` — no destination.

### Access tier and quota

**16. Tier reality.** `PASS` — core `wc/v3` on any install with pretty permalinks. No tier, no
approval, no developer token.

**17. No new long-lead dependency.** `PASS` — two `openssl rand -base64 32` values.

### Claims

**18. Claim provenance.** `PASS` — no user-visible copy changes. What this **enables** is the
product's central claim moving from "implemented and tested" to "demonstrable", which is a claims
change only once somebody writes it down.

**Result:** `14 PASS, 4 N/A, 0 FAIL`

## 4. What was left out

- **The watermark is not persisted.** See §1. Storing it needs a `security definer` advance function
  or a human session; until then the operator holds it, which is the honest shape for a manually
  triggered run and is why `checkpoint` is in every response including the failures.
- **`last_backfill_at`, `quota_used_today` and `last_error` are untouched**, same reason. A failed
  run does not mark the connection — `recordFailure` in `@repo/connections` exists and cannot be
  reached from here.
- **No payload archived.** `putBufferedPayload` is the only path open to WooCommerce and wiring it
  means deciding retention, the R2 key shape under a per-order grain, and whether a redaction
  failure fails the run. Three decisions, none of which the first write needs.
- **No cron.** `MVP-PLAN.md` Decision 2. The cron is a later `scheduled` handler calling exactly
  this function, and it is deliberately not this PR: a cron cannot be demonstrated on stage.
- **One provider.** `unsupported_provider` is a refusal and not a lookup table, because four of the
  five connectors have no `backfill.ts` — a map would be four entries pointing at nothing.
- **No concurrency control.** Two simultaneous runs against one connection would both read and both
  write; the upsert makes that harmless rather than wrong, and `app.claim_connection` exists for
  when it stops being harmless.
- **`since` has no default.** A default window on a watermark walk is the worst kind: too short
  opens a silent hole, too long spends the merchant's store on history it already has, and the
  operator learns neither. The refusal suggests a number instead.

## 5. Open or unverified spec items this builds on

- Everything `50-woocommerce-backfill.md` §5 lists, since this drives it: the **inclusive-bounds
  question**, `WOO_MAX_PAGES_PER_WINDOW` as a judgement, and the ~50/~500 orders-a-night estimates.
- **No real WooCommerce store has been read.** Every test here uses a fake `fetch`. The client's own
  suite has the same limitation and `34` §5 records it. What has now been verified live is the other
  end — the write path against the real Supabase project (gate 6).
- **The `bytea` wire format has still not been seen from the live project**, because
  `public.connections` holds zero rows there. `51`'s adapter refuses anything without the `\x`
  prefix rather than guessing, so a surprise fails with a message naming the column.
- **`is_provisional` is derived by the upsert, not sent.** This run relies on that, and
  `03_envelope_store.sql` asserts it.

## 6. Verification

- [x] `pnpm -r test` — **883 tests**, 0 failures (`@repo/api-edge` 130 → **151**)
- [x] `pnpm -r typecheck` — clean
- [x] `pnpm exec biome lint .` / `biome format .` — clean
- [x] **All eight guards pass**
- [x] `pnpm -r build` — clean
- [x] `./supabase/tests/run-local.sh` — twelve suites, **343 assertions**, 0 failures (unchanged;
      this PR adds no database object)
- [x] **The write path exercised against the live `numbadee` project** — see below

### Every new check fires on a real defect

| # | Mutation | Caught by | Result |
|---|---|---|---|
| I1 | rows buffered across pages instead of written per page | `ingest.test.ts` | **FAIL** — 3 |
| I2 | `rowsWritten` taken from what was read, not what the database confirmed | `ingest.test.ts` | **FAIL** |
| I3 | a failed run reports the span's end as its checkpoint | `ingest.test.ts` | **FAIL** — 2 |
| I4 | the timezone refusal removed, defaulting to UTC | `ingest.test.ts` | **FAIL** |
| I5 | `tokenMatches` replaced with `===` | `ingest.test.ts` | **FAIL** — *see below* |
| I6 | `reasonOf` returns every error's raw message | `ingest.test.ts` | **FAIL** |

### I5 survived, and what that cost

**On the first run, I5 passed all twenty tests.** Replacing a constant-time comparison with
`presented === expected` is undetectable by a suite that asserts results, because the two functions
**agree on every answer** — they differ only in how long they take to be wrong. A timing test would
be flaky and would still prove little.

The suite could not see the one property that mattered about that function, and the tests written
for it were, in that respect, decoration.

What closed it is the posture `scripts/check-*.mjs` already takes: when the thing that matters is
not observable from outside, read the source and say so. `src/index.ts` is imported with `?raw` —
the mechanism `webhooks.test.ts` uses for `wrangler.jsonc` and `performance.test.ts` for
`config.toml` — and the assertion is structural: **a comparison that walks the whole input has
exactly one exit**. Every short-circuiting variant has more, or is a single expression with a
different shape. I5 now fails.

### The live verification

Run against the `numbadee` project directly, with an **empty array**, so nothing was written:

| token | call | result |
|---|---|---|
| `app_ingest` | `ingest_envelope_rows([])` | **200**, returned `0` |
| `anon` | same | **401** `42501 permission denied for function` |
| `authenticated` | same | **403** `42501 permission denied for function` |
| wrong signing secret | same | **401** `PGRST301 None of the keys was able to decode the JWT` |

The first line confirms four things the plan could previously only assert: the shared HS256 secret
is live, `authenticator` really is a member of `app_ingest`, the forwarder is reachable through
PostgREST, and it executes. Lines 2 and 3 confirm the revoke holds from **both** directions — a
tenant able to call it could fabricate the numbers the product guarantees, which is the one thing
the whole ingest design exists to prevent.

`20260912000400_connection_timezone.sql` was also applied and its trigger exercised live, inside a
transaction that was rolled back: `Asia/Bangkok` and `UTC` accepted; `""`, `Asia/Bangkokk`,
`asia/bangkok`, `localtime`, `posixrules`, `EST5EDT`, `Factory` and `UTC+7` refused; a null
accepted; an `UPDATE` to an unknown zone refused.
