# 42. The WooCommerce read path, and whose database pays for it

**PR:** #NNN &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`34` shipped a client that fetches **one page** and reports how many there are. Its §4 named three
gaps and left them: the page loop, window bisection for large stores, and the connect-time probe.
This is those three. WooCommerce is now readable end to end from a watermark, and a merchant finds
out at connect time — in a sentence naming the screen to open — why it is not.

**The decision taken, and it runs through all three: this connector treats the merchant's MySQL as a
resource it is a guest on, and it would rather refuse than spend it.** Every other source in this
repository is rate-limited by a platform that pushes back. WooCommerce is not. `32` §4 gate 16 and
`34` §2 both recorded the consequence and neither could act on it — *"WooCommerce is the one source
where redundant polling costs the **merchant's** server, not our quota"*. This is where that becomes
code: a page limit that refuses rather than pages deeper, a bisection that splits the date range
instead, and a probe that costs exactly one request.

Three things follow from it, and each was a choice with a live alternative.

**1. The page loop is bounded by a number read ONCE, and refused if it is absurd.**
`X-WP-TotalPages` comes from the merchant's server, so a loop that re-reads it every page is a loop
that server can extend forever — a caching plugin that recomputes the count, or one that ignores
`modified_before`, is enough, and neither is exotic. `fetchOrdersPages` reads the count from page 1,
refuses above `WOO_MAX_PAGES_PER_WINDOW`, and never looks at a later page's header again. **The
rejected alternative was the obvious `while (page <= totalPages)`**, which is correct against a
healthy store and unbounded against a broken one.

**2. The loop refuses a window it cannot prove it read whole.** `34` decision 3 pinned
`modified_before` so the result set cannot grow under an `OFFSET` walk, which closes the insert
race. **Two races survive it, and both are ordinary rather than theoretical:**

- **Ties.** `orderby=modified` is not unique. A bulk status change stamps dozens of orders with the
  same second, and MySQL's tie-break under `LIMIT/OFFSET` is undefined — so the same order can land
  on page 2 *and* page 3, which means another one landed on neither.
- **Deletion.** An order trashed mid-run shifts every later row one place toward page 1, and the row
  that crosses a page boundary backwards is never returned.

So ids are deduped across the window, and the unique count is checked against the store's own
`X-WP-Total`. A duplicate is a double-counted sale; a short count is revenue quietly too low, which
is the failure this product sells against. **It throws, and that is the recoverable direction**: the
run fails, the watermark does not advance, the next run reads the same window and succeeds. A
silently short window is permanent.

**The alternative here was `orderby=id`** — a unique sort key, which removes the tie race at its
source rather than detecting it. It is not taken, and the reason is a rule this repository already
lives by: WooCommerce's `orderby` is a fixed enum and whether the orders controller admits `id` has
not been verified against a live store. A wrong value is a `400` on **every request for every
merchant**. Detecting the race is verifiable without a store; changing the sort is not. The decision
is cheap to reverse the day someone runs one request against a real shop.

**3. A window that is too big is split, not paged deeper, and the recursion has two bounds because
one is not enough.** `WOO_MAX_PAGES_PER_WINDOW` is both the loop's bound and the bisection's
trigger — the same question either way: *is this window small enough to read in one pass?*

- **The trigger is page count, from page 1's own headers.** **Latency was the alternative and it is
  worse**: it is only known *after* the merchant's database has already done the work, it conflates
  their network with their MySQL, and a fast first page says nothing about page 30 — `OFFSET`
  degrades with depth, so the measurement that would decide is the one it is too late to take. A
  totalPages threshold comes from a request we were going to make anyway.
- **Depth terminates at one second.** `modified_after` and `modified_before` are second-granular —
  the designator-less format carries no milliseconds, and `ordersUrl` strips them before sending —
  so halving reaches a floor by arithmetic rather than by a guard. **A one-second window that is
  still too large is real**: a bulk edit, a re-import or a migration stamps thousands of orders with
  one `date_modified`. That case gets a **raised cap rather than a refusal**, because refusing would
  mean that second is never readable by any run, ever.
- **The tree is budgeted too.** Depth terminating does not make the tree small. If splitting never
  reduces the reported count — a cached `X-WP-Total`, a plugin overriding the query — a one-day
  window expands to 2^17 leaves, each a request against the store. `WOO_MAX_WINDOWS` bounds the
  whole read at 64 windows. The mutation run below is what proves both bounds are load-bearing
  rather than one being decoration.

**4. The probe answers in sentences, and `rest_no_route` is the one that matters.** It means the
REST route does not exist, which is what Plain permalinks does — **it is not a bad credential**. A
merchant told their key is wrong regenerates a key that was fine, pastes it, fails identically, and
now believes the product is broken. One `GET /orders?per_page=1` separates permalinks, credential,
key permission level, WordPress-user capability and "that URL is not a WooCommerce store", while a
human is looking at the screen. It re-runs `normaliseStoreUrl` on its own input rather than trusting
the caller, because *"validates the store URL"* otherwise means nearly nothing: a merchant pastes the
address bar, which is somewhere inside `/wp-admin`, and a probe that concatenated that would 404 and
report **permalinks** — the exact wrong answer this whole mapping exists to avoid. What it returns is
the normalised origin, which is the value the connect surface should store.

### 1.1 One distinction deliberately NOT drawn, for a Thailand-first reason

WooCommerce returns the same `woocommerce_rest_authentication_error` for *"consumer key is invalid"*
and for *"this key has Write permission and you asked to read"*. Only the human-readable `message`
differs — and that message goes through `__()`. **A Thai-language store returns it in Thai.** Matching
on it would work in the office and fail at the customer, which is the same shape of blindness
`32` §7 found when the suite only ran in UTC. Both causes are reported as `invalid_credential` with a
message naming both; they are fixed on the same screen anyway.

The same honesty applies to `woocommerce_rest_cannot_view`, which has **two causes one response
cannot separate**: the WordPress user behind the key cannot see orders, or the host stripped the
`Authorization` header so WooCommerce never saw a key at all (`34` §1.2's case, whose query-string
workaround stays unimplemented because it puts the secret in the merchant's access log). The message
names both and says which to check first. Naming one would be a guess dressed as a diagnosis.

### 1.2 What this PR does not do, and will not

**No payment-fee capability.** `32` §1 and `34` establish that core WooCommerce exposes no
payment-processor fee, and that `fee_lines` is a merchant **surcharge that ADDS to the total** —
reading it as a cost inverts the sign on the headline number. Nothing here touches `normalize.ts`.
Whether the launch set can ship a connector that delivers revenue, orders and refunds but not profit
after fees is the founder decision `32` §6 filed, and it is still open.

## 2. Cost estimate

**Per connected account per month:** `~฿0.40–฿2.00, unchanged` — and of that, **these three pieces
are ฿0.01 (café) to ฿0.85 (a store large enough to bisect)**. Derived below rather than asserted,
which turns out to matter: the band `32` and `34` projected describes the **large** merchant, and the
café is an order of magnitude under it.

Unit prices: R2 `$0.015`/GB-month and Supabase disk `$0.125`/GB from the design-note template;
Cloudflare Class A writes at `$4.50`/million is the published rate and is **not** re-verified in
this PR — the template's own note is that object COUNT is uncosted anywhere in the specification.
Workers requests are inside the 10M included on Workers Paid (`finance/cost-model.html` §infra), so
marginal invocations here are `$0`. FX `฿32.9 = $1.00`, the rate that file verified on 7 Sep 2026.
Row and payload sizes are **estimates** and labelled as such.

| Term | Derivation |
|---|---|
| Requests to the store | `ceil(changed_orders / 100)` per window, plus **one discarded page-1 per split**. Unchanged from `34` for every store under 2,000 changed orders in a window, which is every store `32` §3 described. |
| Windows | 1 until `totalPages > 20`. Bisection is off for the café and the busy seller entirely. |
| R2 objects | One per **yielded** page. A refused page-1 is never archived — the refusal happens before the yield — so splitting adds requests to the merchant and **no objects** to us. |
| Supabase rows | One per changed order, unchanged: this PR adds no row and no column. |
| Probe | **One request per connect attempt**, non-retryable on every failure it exists to distinguish (`classify` stops on a 4xx). At ≤3 connects a year that is 0.25 requests a month. Its cost is measured in support tickets, not in dollars. |
| Bought data | None. The merchant's own server, the merchant's own key. |

**Three merchants, worked:**

| | café (50/night) | seller (500/night) | bulk-edit night (6,000) |
|---|---|---|---|
| Pages | 1 | 5 | 60 |
| Windows visited | 1 | 1 | **7** — 1 root + 2 halves refused, 4 quarters read |
| Requests/night | 1 | 5 | **63** (3 discarded) — a **5%** overhead over paging 60 deep |
| R2 objects/month | 30 | 150 | 1,800 |
| R2 Class A | $0.00014 | $0.00068 | $0.0081 |
| R2 storage (~1.5 KB/order, est.) | $0.00003 | $0.00034 | $0.004 |
| Supabase disk (~0.6 KB/row, est.) | $0.0001 | $0.0011 | $0.0135 |
| **Total/month** | **$0.0003 ≈ ฿0.01** | **$0.002 ≈ ฿0.07** | **$0.026 ≈ ฿0.85** |

**The number worth arguing with is the worst case, not the average.** `WOO_MAX_WINDOWS` ×
`WOO_FLOOR_MAX_PAGES` is `64 × 200 = 12,800` page requests plus 64 sizing requests — about **12,864
requests against one merchant's store in one run**. That is not a budget, it is the ceiling the
refusals exist to make unreachable, and it is reachable only by a store whose reported count does not
respond to its own date filter. The connector stops there and says so rather than continuing.

**What this does to §8's open question.** The `~98%` margin collapses if platform limits force 3–5×
redundant polling. WooCommerce has no platform limit, so the redundancy here is **paid by the
merchant**, and this PR is the first code that bounds it: 5% overhead on the pathological night,
0% on every ordinary one. The margin question is unchanged; the *merchant-goodwill* question, which
has no line in §7's table, moves in the right direction.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — every request, probe included, carries the merchant's own consumer key and
secret passed in by the caller. No env var is read and no company-held token exists on this path.

**2. Vendor-key exception.** `N/A` — not invoked; this is tenant data on tenant credentials.

**3. No token pass-through.** `N/A` — no MCP or OAuth surface. WooCommerce is key-paste (`33`).

**4. Credential hygiene.** `PASS`, and the probe is where it could most easily have failed: it maps
error **bodies** to messages, and a store can echo the consumer key back inside its own error text.
`probeFailure` interpolates the store URL and never the credential, and a test feeds it a store whose
error message contains the key and asserts neither key nor secret survives into the refusal.

### Tenancy

**5. RLS.** `N/A` — no table, no migration.

**6. No service-role bypass.** `N/A` — no request path of ours; the caller supplies `fetchImpl`.

**7. No cross-workspace read.** `PASS` — the walker is per-store and per-window. The dedupe set holds
order ids from one store for the life of one window and is discarded with it.

**8. No cross-customer aggregation or benchmarking.** `PASS` — no aggregate of any kind. Order-level
commerce data across merchants remains the most tempting benchmarking substrate in the product and
§15 forbids it absolutely.

**9. API key scope.** `N/A` — no key path of ours.

### Data movement

**10. No resale or redistribution.** `PASS` — pages move from the merchant's store to the merchant's
own workspace and nowhere else. No billing unit changes.

**11. Meta client list.** `N/A` — no Meta path.

**12. Dependency licences.** `PASS` — no dependency added. `@repo/extract` was already a dependency
and its `fetchWithRetry` is reused rather than a second retry loop being written.

### PII and consent

**13. Hash at the edge.** `PASS`, **and the probe is the reason this gate needed re-answering.**
`per_page=1` fetches one **real order**, carrying a real buyer's name, email, phone and address. It
is parsed only far enough to confirm the response is a JSON array and then dropped: `WooProbe`
carries the store URL and an order **count**, so no personal data reaches a connect screen, a log
line or an error message. A test asserts the fixture buyer's name cannot be found in the result.
`per_page=1` is also what bounds that exposure to one buyer rather than a hundred. The walker's
per-page buffer is unchanged and still lands in `putBufferedPayload` under `33`'s keep-list.

**14. Forbidden payloads rejected before egress.** `N/A` — no new field is read or kept; nothing
egresses.

**15. Per-destination consent.** `N/A` — read path; writes remain deferred (§11.4).

### Access tier and quota

**16. Tier reality.** `PASS`, **and this is the gate the PR exists for.** There is no tier and no
documented quota, so the ceiling is the merchant's own hosting — `32` §4 recorded that *"the client
must self-throttle rather than discover it"* and deferred the mechanism. This is the mechanism: a
page cap that refuses after one request rather than paging deeper, bisection that trades one request
of ours for 1,900 rows of their `OFFSET` scan, a window budget that bounds the pathological case, and
`fetchWithRetry`'s stop-on-non-retryable inherited rather than re-implemented (asserted: a 401 mid-
walk is not retried).

**17. No new long-lead dependency.** `PASS` — nothing here waits on anyone.

**18. Claim provenance.** `PASS` — nothing user-visible changes. `woocommerce` was already in
`IMPLEMENTED_SOURCE_IDS` because `client.ts` and `normalize.ts` both existed before this diff, so
`check-capabilities.mjs` answers exactly as it did before.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **Nothing calls it yet.** There is no `woocommerce/backfill.ts` joining `fetchOrdersWindow` to
  `normalizeWooOrders` and `putBufferedPayload`, and the client half is still absent from
  `packages/connectors/src/index.ts` — it was before this PR too. Both are outside this change's
  file scope. That is the next PR, and it owns one decision this one deliberately does not touch:
  whether an `incomplete_window` failure should fail the whole run or just that window.
- **WordPress installed in a subdirectory.** `normaliseStoreUrl` reduces a pasted URL to
  `url.origin` (`34`, and its test), so a store at `https://example.com/shop/` has its REST root at
  `/shop/wp-json/...` and this connector asks the wrong host path. The probe now answers that with a
  permalinks message, which is **wrong for that merchant**. Found while writing the failure
  taxonomy; not fixed here because it changes what a stored store URL means and belongs with the
  connect surface. It is an issue, not a wider diff.
- **`orderby=id`.** §1 records why: an unverified enum value is a 400 for every merchant, and the
  race is detectable without a live store. Reversible in one line the day a real request settles it.
- **A sizing probe at `per_page=1` before each window.** It would make the split trigger exact and
  cheap on the merchant, at the cost of **doubling** the request count for the café that never
  splits. The discarded page-1 is the cheaper trade at the volumes `32` §3 describes.
- **Cross-window deduplication.** The halves are built to share no second, so a duplicate across
  sub-windows is impossible by construction; a global id set would be memory spent to re-prove it.
- **The query-string auth fallback**, still deliberately unimplemented for `34` §1.2's reason. The
  probe now at least names header-stripping as one of the two causes it cannot rule out.
- **No integration test against a live store**, unchanged from `34` §4. Every assertion here is on
  what the client does with a response, not on a response a real WooCommerce sent.
- **A pre-existing lint warning** — an ineffective `biome-ignore` above `basicAuthHeader`'s control-
  byte regex — is left exactly as found. It is not this PR's line and `biome lint` exits 0.

## 5. Open or unverified spec items this builds on

- **Whether `modified_after` / `modified_before` are inclusive is still unverified** (`34` §5). The
  split is built not to care: halves are `[after, mid]` and `[mid + 1s, before]`, so no order can
  satisfy both and no second falls between them, whichever way inclusivity turns out. If the answer
  arrives, nothing changes.
- **`X-WP-Total` is assumed to be computed by the same query as the page it accompanies.** If a
  caching plugin serves a stale count, `incomplete_window` fires on a window that was actually whole,
  the run fails and retries, and a badly-cached store could flap. The failure is loud and
  self-healing, which is the right direction, but it is a real operational edge and the first
  candidate for a per-connection tolerance if one is ever needed.
- **Deep-page performance is still reasoned about and not measured** (`34` §5). The 20-page trigger
  is a judgement from `OFFSET` amplification (20x at page 20, 49x at page 50), not a benchmark. It is
  a parameter for exactly that reason.
- **Whether Plain permalinks yields `rest_no_route` or a themed HTML 404 depends on the host's
  rewrite configuration.** Both are mapped, to different codes, and permalinks is named in both
  messages — so a merchant is pointed at the same screen either way.
- **The WooCommerce error codes are read from the shape of its source, not from a live store.** If
  `woocommerce_rest_cannot_view` turns out to carry a different code on some versions, that failure
  degrades to `not_a_wp_rest_endpoint`, whose message names a security plugin first. Wrong, but
  wrong toward "something is in the way" rather than toward "your key is bad".
- **WooCommerce's rate limits remain unknown** (`23`). Self-throttling here is a judgement, not a
  calibration — the same sentence `34` §5 had to write, now attached to numbers that can be tuned.

## 6. Verification

Run at `2026-09-11`, in a working tree **five other workflows were writing to at the same time**:
`meta_ads`, `search_console` and `google_ads` connector directories all appeared under
`packages/connectors/src/sources/` during this session, and the repo-wide gates went red and green
several times as their files landed half-written. The final sweep is below, at `17:18Z`, with every
failure attributed by file. **Zero findings of any kind, at any point, named a file in this diff** —
checked by grepping each gate's output for `woocommerce`.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | **exit 0** — the only `woocommerce` line in the output is the pre-existing ineffective `biome-ignore` above `basicAuthHeader`'s control-byte regex, a warning. Confirmed pre-existing by linting that function alone in a scratch file, where it reproduces with no other code present |
| `pnpm exec biome lint packages/connectors/src/sources/woocommerce/` | **exit 0** — "Checked 7 files", 1 warning, the one above |
| `pnpm exec biome format packages/connectors/src/sources/woocommerce/` | **exit 0** — "Checked 7 files in 22ms. **No fixes applied**" |
| `pnpm -r typecheck` | **exit 1** at `17:19Z`, and not here: every error is in `sources/google_ads/_content.ts` and `sources/google_ads/claims.ts` — files that did not exist when this work started. `grep -c woocommerce` on the output is **0**, and `tsc --noEmit` filtered to everything outside the three in-flight source directories is clean. An earlier sweep, before those files landed, was **exit 0 across every package** |
| `pnpm --filter @repo/connectors test` | **pass — 319 tests, 0 failed** at `17:19Z`. Sweeps ten minutes earlier showed 2 failures in `search_console` and then 6 in `meta_ads`, each reproduced with this PR's `client.ts` restored byte-identical (`md5 fe8661ee…`) to rule this diff out, and each gone once that workflow finished its file |
| `pnpm exec vitest run src/sources/woocommerce` | **pass — 70 tests, 4 files, up from 37 in 2 files** |
| `node scripts/check-brand.mjs` | **pass** — 8 identity strings checked against the allowlist |
| `node scripts/check-tokens.mjs` | **FAIL, and not from this diff** — 7 findings, all hard-coded colours inside `sources/google_ads/MARKETING-DATA-PLANE.md`, a 1,900-line document another workflow placed under `packages/connectors/src/` mid-session. Passed on every earlier sweep |
| `node scripts/check-dictionary.mjs` | **pass** — contract and schema agree on every list |
| `node scripts/check-capabilities.mjs` | **FAIL, and not from this diff** — three findings, *"implemented source `google_ads` / `meta_ads` / `search_console` is absent from the connector-claim source list"*. `woocommerce` has been in `IMPLEMENTED_SOURCE_IDS` since `32` and is not among them. The fix is in `packages/brand/src/claims.ts`, which this change may not touch — and the guard is doing exactly its job: a connector cannot ship ahead of the claim that describes it |

### Seven mutations, seven caught

| Mutation | Caught by | Observed |
|---|---|---|
| Re-read `totalPages` from every page instead of pinning page 1's | "reads the page count ONCE, from page 1" | one extra request — a broken store can extend the loop |
| Remove the cross-page dedupe | "yields a duplicated order exactly once" **and** "refuses a window it read short" | the duplicate is yielded twice **and** the short count is masked by it, which is the sharper half |
| Split at `mid` on both sides instead of `mid` / `mid + 1s` | three bisection tests | halves that share a second, i.e. an order in both |
| Map `rest_no_route` to `invalid_credential` | "maps rest_no_route to permalinks, not to the credential" | `expected 'invalid_credential' to be 'permalinks_disabled'` |
| Disable the `unique !== totalOrders` check | the tie-break test **and** the deletion test | a window read short reported as whole |
| Remove the one-second floor (`before >= after`) | "stops splitting at one second" and "refuses a single second…" | `expected 'window_budget_exhausted' to be 'window_too_large'` |
| Let the probe trust the caller's store URL instead of normalising it | "validates the store URL itself" and "refuses a plain-HTTP store at connect time" | a pasted `/wp-admin` URL reaches the request, and an `http://` store is probed instead of refused |

**The last one is the result worth keeping.** Removing the floor should have hung the suite; instead
the window budget stopped it after 64 sub-windows and the assertion failed on the *wrong error code*
rather than on a timeout. That is the two bounds catching each other: depth alone would have looped,
and the budget alone would have turned a legitimate bulk-edit second into a 64-window crawl. Neither
is decoration, and no single mutation could have shown that.
