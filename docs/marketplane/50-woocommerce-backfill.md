# 50. The WooCommerce backfill, the watermark, and the date that was in the wrong timezone

**PR:** `sources/woocommerce/backfill.ts` — the third file of the connector unit and the first
driver a pull can actually call; `public.connections.timezone` with an IANA validation trigger;
`wooGmtToDate` fixed to bucket in the store's zone rather than in UTC; the capability guard taught
to read `backfill.ts`.

This is **step 3 of `MVP-PLAN.md` §5**. It unblocks step 6, which is the Worker that turns these
rows into the first row `envelope_rows` has ever held.

## 1. What this is, and the decision taken

`client.ts` fetches pages and `normalize.ts` turns a page into envelope rows. Nothing decided
*which windows to ask for*, so nothing could drive a WooCommerce pull. This is that file.

### It is not `ga4/backfill.ts` with the names changed

Four of GA4's decisions invert, and all four invert for one reason:
`RESTATEMENT_CLOCKS.woocommerce.windowDays` is `null` because **no window ever closes** — the store
is the merchant's own database and an order can be refunded a year later. GA4's pull is a **ladder**
over independent calendar days. This one is a **watermark walk** over `modified_after`, and a
watermark is a different object from a plan.

| | GA4 | WooCommerce | Why it flips |
|---|---|---|---|
| plan source | `planBackfill` ladder | chunks cut here | a tiered ladder is derived from a restatement window; there is none |
| order | **newest first** | **oldest first** | a watermark is a *low*-water mark: it advances only through a contiguous prefix |
| batch grain | one per **window** | one per **page** | one Woo window may legally reach 128,000 orders; a page is capped at 100 |
| how far it got | not a question | the **checkpoint** | the next run's correctness depends on this answer being conservative |

**Oldest-first is forced, not stylistic.** GA4's windows are independent, so a run cut short by the
quota floor has still banked the days most likely to have changed. Reading newest-first here would
finish the newest chunk and leave the watermark exactly where it started, because *the gap behind it
is what the watermark means*.

### The checkpoint is answered twice, because there are two questions

Advancing a watermark past a span that was not read in full opens a **permanent hole**: nothing will
ever request a window behind the mark again. So:

- **`onChunk(checkpoint)`** fires after a chunk has been read *in full*. It is the only place a
  watermark may advance, and it fires as the run proceeds, so a run that dies half way has banked
  what it finished.
- **the generator's return value** says the whole span is done. A run that throws never reaches it,
  and `for await ... of` discards it — so it cannot be mistaken for a per-batch field.

A mutation that moves the checkpoint assignment *above* the page loop fails three assertions (T5
below). That is the property, not the code shape.

### Chunks share their boundary instant, deliberately

`client.ts` records that WooCommerce's `modified_after` / `modified_before` bounds are *probably*
inclusive at both ends and that **this has not been verified against a live store**. So chunk *n*
ends and chunk *n+1* begins at the same instant, with no second added:

| | inclusive (likely) | exclusive |
|---|---|---|
| shared instant (**chosen**) | one order read twice — the upsert collapses it | every order read exactly once |
| `+1s` | every order read exactly once | **one second of orders read by nobody, forever** |

An overlap is recoverable by a mechanism that already exists. A gap is recoverable by nothing.

*This differs from the bisector's own split, which uses `[after, mid]` / `[mid + 1s, before]` and
whose comment claims exactness "whichever way that turns out". That claim holds only under the
inclusive reading — under the exclusive one it drops `mid` and `mid + 1s`. Recorded in §5 rather
than changed here: it is the same unverified fact, and the fix is to verify it against a store, not
to swap one guess for another.*

### `WOO_BACKFILL_CHUNK_DAYS = 31`, derived from the bisector's own budget

A chunk no amount of splitting can read ends the run at `window_budget_exhausted`. `32` §3 puts the
busiest launch-target store at ~500 changed orders a night, so 31 days is ~15,500 orders → ~155
pages → eight leaves of ~1,940 after `WOO_MAX_PAGES_PER_WINDOW` splits → a tree of 15 windows
against a budget of 64. The floor is the other half of the same choice: a chunk costs at least one
request even when empty, so two years of history is 24 requests at 31 days and 105 at 7. The nightly
case is one chunk either way.

### Decision 1 of the plan, closed: `public.connections.timezone`

`normalizeWooOrders` **requires** an IANA zone and throws without one. `probeStore` returns
`{storeUrl, totalOrders}`. No column held one. So the value had nowhere to live between the merchant
telling us and a Worker needing it — which is the definition of a column.

**Nullable, no default.** Every connection that exists predates it, and WordPress's own
`timezone_string` is **empty** on a site configured with a manual UTC offset, so even asking the
store does not always answer. A null means *nobody has told us*, and the backfill refuses to run
against it. `'UTC'` as a default would mean *we know, and it is UTC*.

**Validated by trigger, not by a `check` constraint**, because the only authority is
`pg_timezone_names` and a `check` may not read a table. Two conditions, and the second earns its
keep: **sixteen** of that view's 499 rows on PostgreSQL 16 carry no `/` at all, and fifteen of them
are not `Area/Location` zone names — `localtime`, `posixrules`, `Factory`, `EST5EDT`, `CET`, `GMT`
and friends. Each passes a bare membership test and then reaches the customer as
`dimensions.timezone`, where `Intl.DateTimeFormat` rejects `localtime` and `posixrules` outright.
An `Area/Location` name, or exactly `UTC` — the sixteenth — is the set both agree on. The match is
also **case-sensitive**: PostgreSQL resolves `asia/bangkok` happily and IANA does not call it that.

### And then the column exposed a defect the column was meant to prevent

`wooGmtToDate` returned the **UTC** calendar day, while the same row's `dimensions.timezone` said
`Asia/Bangkok`. The row asserted a day in a zone it had not been computed in.

GA4 does not have this: its `date` comes from the property's own calendar and its `timezone` from
`metadata.timeZone`, so the two agree. The envelope's convention is therefore **the date is the day
in the timezone the row names**, and `20260908001100_envelope_rows.sql` calls that guarantee
*"co-equal with currency"*.

For a UTC+7 store the cost is every order between 17:00 and midnight UTC — **seven hours of every
day, on every row, with `ok: true`**, filed one day early. `wooGmtToDate` now takes the zone and
buckets in it via `formatToParts` (not `format`, which is a locale's idea of a date).

Shipping the column without this would have added an input nothing read, which is the worst of both:
the cost of the migration and none of the correctness.

### Three findings from review, all real, all fixed

A Codex review on the first push raised three, and verifying them found all three sound. The second
is the sharpest, because **this PR introduced it**.

**P1 — a timezone change forks every keyed row.** The upsert key is
`(workspace_id, source, account_id, entity_id, date, attribution_window)`. Making `date` depend on
the store's zone — which is what this PR does — means a zone change recomputes the key for any order
near midnight, so the next re-pull **inserts a second row** instead of updating the first. The old
row stays, nothing points at it, both are returned, and the total goes silently *up*. Orders never
re-pulled keep the old date, so the table holds two timezones at once with nothing recording which
is which.

Before this PR `date` was UTC-derived and independent of the column, so a zone change moved only the
label. The hazard is new, and it is mine.

**The fix is a new migration, not an edit to `…000400`.** That file had already been applied to the
live `numbadee` project when the review arrived. An applied migration is immutable: a project that
ran the original and a project that runs an edited copy would disagree about what version
`20260912000400` *means*, and the disagreement is invisible — `supabase_migrations` records the
version, never the body. So `20260912000500_connection_timezone_immutable.sql` carries the
amendment, which is also the honest history: the column shipped, a review found a hazard, this
closed it.

Re-keying every affected row is not something anything here can do yet, so the column is now
**immutable once set**: null → a zone is allowed (it is how one gets set), the same zone again is
allowed (a no-op update must not fail), and any other change is refused with a message naming the
consequence. A change back to `null` is refused too — otherwise
`Asia/Bangkok → null → America/New_York` is the same change in two steps. `envelope_rows` holds zero
rows on every project today, so this costs nothing now and closes the hazard before there is data to
damage.

**P2 — `Date.parse` is not RFC3339 validation.** Three of its answers are dangerous, and the first
is the one that matters:

| input | `Date.parse` | why it is not harmless |
|---|---|---|
| `2026-02-30T00:00:00Z` | **2026-03-02** | a watermark on a day that does not exist silently skips two days of orders, and the checkpoint then advances past them |
| `2026-09-11T00:00:00` | parsed as **local** | this repository has a documented history with exactly that reading — it is why `wooGmtToDate` appends a `Z` and why the suite is pinned to Asia/Bangkok |
| `September 11, 2026` | accepted | not a format any caller should reach here |

`parseRfc3339` now matches the shape and then checks the **calendar** by rebuilding the instant from
its own components: `Date.UTC(2026, 1, 30)` rolls forward, so a date that does not survive the round
trip did not exist. Exported, because `apps/api-edge` validates the same two fields at its HTTP
boundary and two implementations of *"is this an instant"* is how they come to disagree.

**P2 — `onChunk` was typed `=> void` and not awaited.** A caller banking the watermark durably will
want to *write* it, and a `void` signature accepts an `async` function while dropping its promise:
the next chunk starts while the write is in flight, two writes can land out of order, and a rejected
one surfaces as an unhandled rejection while the run reports success. Every one of those ends the
same way — a watermark ahead of what was stored, which is the single thing this callback exists to
prevent. It now returns `void | Promise<void>` and is awaited.

### The guard grew a third file

`check-capabilities.mjs` read `client.ts` and `normalize.ts` and not `backfill.ts` — which is the
**driver**, the layer above the five page walkers it was extended to catch last time. A barrel that
dropped it would leave the connector complete, tested, claimable and unusable by the one caller that
matters. Absent is still allowed (four sources have no driver yet); **present-but-half-exported** is
not. Mutation C3 proves the hole was live: removing `runGa4Backfill` from the barrel passed on
`main` and fails now.

## 2. Cost estimate

**฿0.00 per connected store per month in platform fees.** WooCommerce is the merchant's own
WordPress install: no vendor, no quota purchased from anyone, no developer token. The costs are
somebody else's database and our own CPU, and both are bounded arithmetic rather than trust.

| Run | Requests against the merchant's store | Notes |
|---|---|---|
| nightly, café (~50 changed orders) | **1** | one chunk, one page |
| nightly, busy seller (~500) | **1–6** | one chunk, ≤6 pages at `per_page=100` |
| first backfill, 2 years, quiet store | **24** | one per chunk |
| first backfill, 2 years, busy store | ~24 + ~155/mo pages | bisection splits where it must |
| pathological (date filter ignored) | ≤ 64 + 64×200 per chunk | `WOO_MAX_WINDOWS` × `WOO_FLOOR_MAX_PAGES`, then it refuses |

No R2 object is written by this file and no payload is archived by it — `putBufferedPayload` is a
separate decision belonging to step 6.

The `timezone` column is one nullable `text` on a table with single-digit row counts. The validation
trigger runs on connection writes only, which happen when a merchant connects.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — the merchant's own consumer key and secret, issued by the merchant in its own
WooCommerce admin. `connectWithKey` is the only way one gets stored and it is unchanged here.

**2. Vendor-key exception.** `N/A` — no company-held vendor key exists for WooCommerce; there is no
vendor.

**3. No token pass-through.** `PASS` — the credential reaches `basicAuthHeader` and the
`Authorization` header of a request to the merchant's own origin, and nowhere else. This file never
reads it: it passes `WooFetchOptions` through opaquely.

**4. Credential hygiene.** `PASS` — no credential is logged, returned, or placed in a URL. The one
new error path (`assertWooTimezone`) quotes a timezone.

### Tenancy

**5. RLS.** `PASS` — one column added to an existing table. Policies unchanged;
`01_rls_isolation.sql` passes from all seven principals, and `11_connection_timezone.sql` asserts
the column is reachable by `authenticated` with **no new grant** and unreachable by `anon`.

**6. No service-role bypass.** `PASS` — no function gains `security definer`. The trigger function
is `app.connections_timezone_is_iana()`, plain `security invoker`, and it only raises.

**7. No cross-workspace read.** `PASS` — the connector has no query. `account_id` is stamped from
`options.client.storeUrl`, the origin the request was actually sent to, so a row cannot name a store
the run did not read.

**8. No cross-customer aggregation.** `N/A` — nothing aggregates.

**9. API key scope.** `N/A` — no key or budget path changes.

### Data movement

**10. No resale or redistribution.** `N/A` — no response, export or webhook surface changes.

**11. Meta client list.** `N/A`.

**12. Dependency licences.** `PASS` — nothing added. `pnpm-lock.yaml` untouched. `Intl` is a
platform built-in in both Node 22 and workerd.

### PII and consent

**13. Hash at the edge.** `N/A` — no personal data is read by this file. The orders it hands to the
normaliser carry buyer name, email and address, and the normaliser reads **none** of them: `WooOrder`
names only the fields it consumes, and the fixtures deliberately carry real-looking PII so a broken
keep-list cannot pass.

**14. Forbidden payloads rejected before egress.** `N/A` — this file writes no payload. WooCommerce's
redaction policy is `redact` and `putPayload` refuses a non-`verbatim` source outright; the buffered
path is step 6's to wire.

**15. Per-destination consent.** `N/A`.

### Access tier and quota

**16. Tier reality.** `PASS` — `wc/v3` orders with `modified_after` / `dates_are_gmt` is core
WooCommerce, present on every install with pretty permalinks. No tier, no approval.

**17. No new long-lead dependency.** `PASS` — and this is the point of doing WooCommerce first.
No redirect URI, no consent screen, no domain, no Google verification whose observed lead time is
over ten weeks.

### Claims

**18. Claim provenance.** `PASS` — no user-visible copy changes. What the PR *repairs* is a claim
already being made: `20260908001100_envelope_rows.sql` sells timezone normalisation as a guarantee
co-equal with currency, and it was false for WooCommerce rows. Nothing said so, because no row had
ever been written.

**Result:** `11 PASS, 7 N/A, 0 FAIL`

*(Gate 5 re-checked after the immutability trigger: still `PASS`. It adds no policy and no grant,
and `01_rls_isolation.sql` passes from all seven principals.)*

## 4. What was left out

- **The watermark is not persisted.** It is returned to the caller. The Worker *cannot* write
  `connections`: `connections_update` requires `app.can_write_workspace()`, which refuses when
  `app.current_user_id()` is null, and a minted ingest token deliberately carries no `sub`. Storing
  it needs either a `security definer` advance function or a human session — a decision belonging
  with step 6, where the caller exists to measure it against. Until then `POST /v1/ingest/run` takes
  `since` and returns the checkpoint, which is the honest shape for a manually triggered run.
- **`last_backfill_at` is not touched** for the same reason.
- **No payload is archived.** See gate 14.
- **No `putBufferedPayload`, no store, no HTTP.** This file is a generator over a client; every
  I/O decision above it is step 6's.
- **The bisector's `+1s` split is not changed.** §5.
- **`probeStore` still does not return a timezone,** and no attempt was made to add one. Whether a
  WooCommerce consumer key can read the site's `timezone_string` at all is **unverified** — the
  setting lives in WordPress core rather than in WooCommerce, and this connector has never had a
  live store to ask. So the seed script asks the merchant and the column records the answer, which
  is the one path that works regardless. Verifying it against a real store is cheap and would remove
  a question from the connect flow; guessing at the endpoint would put an unverified platform fact
  in the code, which is what `21` and `34` §5 exist to stop.
- **No cron.** `MVP-PLAN.md` Decision 2 takes manual, and a demo that waits on a minute boundary is
  a demo that can fail on stage.

## 5. Open or unverified spec items this builds on

- **Whether WooCommerce's `modified_after` / `modified_before` bounds are inclusive is still
  unverified** (`34` §5). This PR's chunk boundaries are chosen to be correct *either way*; the
  bisector's are correct only under the inclusive reading, which was not previously written down.
  One read against a live store settles both. **Recorded, not fixed** — swapping one guess for
  another is not progress.
- **`WOO_MAX_PAGES_PER_WINDOW = 20` is a judgement, not a measurement** (`34` §5), and
  `WOO_BACKFILL_CHUNK_DAYS` is derived *from* it, so it inherits that status.
- **The ~50 and ~500 changed-orders-a-night figures come from `32` §3**, which states them as
  launch-target estimates rather than observations.
- **Re-keying existing rows after a timezone correction.** The column is immutable instead, which
  refuses the operation rather than performing it. Doing it properly means deleting every
  `envelope_rows` row for the connection and rewinding the watermark to the start of history — a
  destructive operation with no caller, no UI and no audit trail, and the wrong thing to invent
  speculatively. Filed; the refusal message says what it would take.
- **`envelope_rows.timezone` has no validation of its own.** The connection column is validated and
  the connector refuses an unknown zone, so the two live paths are covered; a hand-written row into
  `envelope_rows` is not. Filed rather than folded in: that table's write path is
  `app.upsert_envelope_row`, and adding a per-row `pg_timezone_names` lookup to the hottest write in
  the system is a cost decision that should be taken with a measurement.

## 6. Verification

On this branch with a real `pnpm install --frozen-lockfile`, plus a PostgreSQL 16 run of the full
database suite.

- [x] `pnpm -r test` — **846 tests**, 0 failures (`@repo/connectors` 323 → **352**)
- [x] `pnpm -r typecheck` — clean
- [x] `pnpm exec biome lint .` / `biome format .` — clean
- [x] **All eight guards pass**
- [x] `pnpm -r build` — `next build` and `wrangler deploy --dry-run` both clean
- [x] `./supabase/tests/run-local.sh` — twelve suites, **343 assertions**, 0 failures, including the
      new `11_connection_timezone.sql` at 21
- [x] Both migrations applied to the live `numbadee` project and the trigger exercised there inside
      a transaction that was rolled back — see below

### Every new check fires on a real defect

Each mutation was applied to a green tree, the suite run, and the tree restored.

| # | Mutation | Caught by | Result |
|---|---|---|---|
| M1 | trigger drops the `Area/Location`-or-`UTC` rule, keeping bare `pg_timezone_names` membership | `11_connection_timezone.sql` | **FAIL** — *accepted {localtime,posixrules,EST5EDT,Factory}* |
| M2 | trigger declared `before insert` only | `11_connection_timezone.sql` | **FAIL** — an UPDATE to an unknown zone lands |
| M3 | column given `default 'UTC'` | `11_connection_timezone.sql` | **FAIL** |
| M4 | column made `not null` | `11_connection_timezone.sql` | **FAIL** — 6 assertions |
| M5 | membership test made case-insensitive | `11_connection_timezone.sql` | **FAIL** — *accepted {asia/bangkok}* |
| C1 | one name dropped from the barrel's woo-backfill block | `check-capabilities.mjs` | **FAIL** |
| C2 | the whole woo-backfill block dropped from the barrel | `check-capabilities.mjs` | **FAIL** |
| C3 | **`runGa4Backfill` dropped from the barrel** *(passed on `main`)* | `check-capabilities.mjs` | **FAIL** |
| T1 | `wooGmtToDate` buckets in UTC — **the defect this PR fixes** | `contract.test.ts`, `backfill.test.ts` | **FAIL** — 3 |
| T2 | the `Z` dropped from `wooGmtToDate` *(the historic mutation, re-run)* | `contract.test.ts`, `backfill.test.ts` | **FAIL** — 3 |
| T3 | chunks walked newest first | `backfill.test.ts` | **FAIL** — 5 |
| T4 | chunk boundaries separated by `+1s` | `backfill.test.ts` | **FAIL** — 2 |
| T5 | checkpoint advanced *before* the chunk is read | `backfill.test.ts` | **FAIL** — 3 |
| T6 | timezone checked at normalise time rather than before the first request | `backfill.test.ts` | **FAIL** — 2 |
| T7 | one batch per chunk (GA4's shape) instead of one per page | `backfill.test.ts` | **FAIL** |
| R1 | `onChunk` not awaited *(the review finding, restored)* | `backfill.test.ts` | **FAIL** — 2 |
| R2 | RFC3339 left to `Date.parse` *(the review finding, restored)* | `backfill.test.ts` | **FAIL** — 4 |
| R3 | the timezone immutability rule removed *(the review finding, restored)* | `11_connection_timezone.sql` | **FAIL** — 3 |
| R4 | immutability keeps only the "different zone" case, allowing a `null` detour | `11_connection_timezone.sql` | **FAIL** — 2 |

C3 is the one worth reading twice: it is a hole that existed before this PR and that the guard's
previous version reported as PASS.

### Exercised against the live project

Both migrations are applied to `numbadee`, and the trigger was run there inside a transaction that
was rolled back, so nothing was left behind.

| probe | result |
|---|---|
| `Asia/Bangkok`, `UTC` | accepted |
| `""`, `Asia/Bangkokk`, `asia/bangkok`, `localtime`, `posixrules`, `EST5EDT`, `Factory`, `UTC+7` | refused |
| `null` | accepted — it means nobody has told us |
| `null` → `Asia/Bangkok` | accepted (the setting path) |
| `Asia/Bangkok` → `Asia/Bangkok` | accepted (a no-op update must not fail) |
| `Asia/Bangkok` → `America/New_York` | **refused** |
| `Asia/Bangkok` → `null` | **refused** |
| the stored value afterwards | `Asia/Bangkok`, untouched |

### Three things found while writing this, all by a mechanism

1. **The date was in the wrong timezone, and the old test asserted the wrong answer.** The previous
   whole-day loop asserted `2026-09-09` for all twenty-four UTC hours — which is *exactly* what a
   normaliser ignoring the store's zone produces. It could not have failed. The loop now expects the
   9th for hours 00–16 and the **10th for 17–23**, which separates all three readings (correct, no
   `Z`, no zone). T1 and T2 both fail on it; neither did before.
2. **The keyword check was worth running.** `20260912000200_position.sql` records `max(position)`
   parsing as `POSITION(x IN y)`. `timezone` is also a function name, so it was exercised bare in a
   select list, in `is distinct from`, and as `new.timezone` in a trigger before the column was
   named. It is fine in all four — which is a fact now, rather than an assumption.
3. **The review found something the whole suite could not.** The P1 above is not a bug in code this
   PR wrote — every test passed, every guard passed, and the database suite was green. It is a
   consequence of a *correct* change meeting an existing key, visible only to somebody holding both
   facts at once. Worth recording because no amount of mutation testing on this diff would have
   surfaced it: the mutation that reveals it is "change a connection's timezone", which is not an
   edit to any file here.
4. **A mutation that should have failed and did.** The first draft of the "watermark stays at the
   last complete chunk" test made chunk 2 return a body with no pagination headers, expecting a
   refusal. `readPagination` treats a missing header as *one page* — deliberately, so a store behind
   a header-stripping proxy is read once rather than skipped — so the chunk succeeded and the test
   asserted nothing. It now uses a 500, which fails through `fetchWithRetry`: a layer *beneath* this
   module, which is the stronger property to assert anyway.
