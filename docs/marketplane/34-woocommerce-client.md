# 34. The WooCommerce client, and five ways to fetch the wrong week

**PR:** #11 &nbsp;·&nbsp; **Date:** 2026-09-10 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decisions taken

`32` shipped the half that turns a WooCommerce order into envelope rows. `33` shipped the credential
lane that lets a merchant's key be stored at all. **This is the half that fetches**, and with it
slot 2 of §11A.14's launch set is readable end to end.

There is no single headline decision here; there are **five**, and what they share is that taking any
of them the other way produces **plausible data rather than an error**. That is why each is asserted
in a test rather than explained in a comment.

**1. HTTPS or nothing.** Over plain HTTP the WooCommerce API requires **OAuth 1.0a one-legged
signing** — `oauth_signature`, `oauth_nonce`, an HMAC over a constructed base string. That is a
second authentication scheme to build, test and maintain so that a merchant's own orders can travel
in clear. The store URL is refused at construction. **The message names OAuth 1.0a on purpose:** a
bare "https required" reads as pedantry and sends a merchant looking for a setting to turn off.

**2. `dates_are_gmt=true` on every request.** It **defaults to false**, and when false WooCommerce
interprets the window boundary in the merchant's *WordPress* timezone. For a Thai store that is seven
hours, so a nightly job asking for "since midnight" silently asks for a different day than it
reports. Nothing errors. Nothing looks wrong.

**3. `modified_before` is pinned to the run's start.** WordPress paginates with `OFFSET`, so a row
modified *during* the pull shifts position between page 1 and page 5 — and one that shifts backwards
past the cursor **is never returned at all**. Pinning the upper bound makes the result set immutable
for the run. This is the bug that would present as *"some orders are just missing sometimes"*, which
is close to the worst bug shape available.

**4. The filter is `modified_after`, not `after`.** `after` filters on **created** date and would
never return a refund of last month's order. `wc_create_refund` bumps the parent order's
`date_modified` unconditionally — verified in WooCommerce core — which is the entire mechanism by
which an incremental pull catches restatements. WooCommerce joins the two parameters with `AND`, so
*"created after X **or** modified after X"* is not expressible in one request; the modified window is
the one that subsumes the other.

**5. `per_page` caps at 100.** Not documented on WooCommerce's orders page — it is WordPress core's
collection parameter (`'maximum' => 100`), which WooCommerce does not override. Asking for more
**does not error; it silently returns 100**, which is precisely how a `limit + 1` next-page probe
stops working. (The same collision issue [#9](https://github.com/Mouthfully/dataaggregator/issues/9)
records between `MAX_LIMIT` and PostgREST's `max_rows`, arriving from a different direction.)
Pagination therefore reads `X-WP-TotalPages` rather than inferring from a short page — **and a
missing header means one page, not zero**, because a proxy that strips it must not make a store with
orders look empty.

### 1.1 Two credential refusals that are not the same refusal

- **A non-ASCII character makes `btoa` throw** when the request is built. That surfaces on a
  scheduled pull as a *network-shaped* failure rather than as a bad paste the merchant can fix.
- **A control byte does not throw.** `btoa` is Latin-1 and encodes `\r\n` happily — but a bare CR or
  LF in a credential is **how a second header gets appended**. Header injection is a different
  failure from an encoding failure and needs its own test, which it has.

Both are rejected before the header exists.

### 1.2 The secret never touches the URL

WooCommerce documents a query-string fallback (`consumer_key`/`consumer_secret`) for hosts that strip
the `Authorization` header. It is **not** the default here, and a test asserts it never becomes one by
accident: a secret in a URL is a secret in the merchant's access log, and in every proxy log between
us and them. The fallback is recorded in §4 as deliberately unimplemented rather than forgotten.

## 2. Cost estimate

**Per connected account per month:** `~฿0.40–฿2.00`, and this PR is where the figure `32` projected
becomes real.

| Term | Derivation |
|---|---|
| Requests/night | `ceil(changed_orders / 100)`. A café at ~50 orders/day is **one** request; a seller at 500 is five. The `per_page` cap is what makes this term small. |
| Restatement depth | **1×.** No ladder (`32` §2) — the `modified_after` window re-reads only orders that actually moved. |
| Workers | One Workflow instance per (connection, date); `fetchWithRetry` at 3 attempts, and a non-retryable status stops immediately rather than spending two more. |
| R2 | One object **per page**, not per order. |
| Bought data | None. The merchant's own server, the merchant's own key. |

**The cost this one does not pay, and the one it might.** There is no platform quota to burn, so §8's
open question — *the ~98% margin collapses if platform limits force 3–5× redundant polling* — does
not apply: WooCommerce is the one source where redundant polling costs the **merchant's** server, not
our quota. Which is the risk. WordPress pagination is `OFFSET`-based against the merchant's MySQL, so
deep pages degrade and can hit PHP's `max_execution_time`. The mitigation is narrow windows rather
than deep paging; the client makes windows explicit parameters so a caller *can* narrow them, and
does not itself bisect. See §4.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — every request carries the merchant's own consumer key and secret, passed in by
the caller. No company-held token exists in this file or anywhere it reaches.

**2. Vendor-key exception.** `N/A` — not invoked.

**3. No token pass-through.** `N/A` — no MCP or OAuth surface.

**4. Credential hygiene.** `PASS`, and it is the gate this file could most easily have failed. The
credential appears **only** in an `Authorization` header, never in a URL, never in a log line, and
never in an error message — `WooClientError` names *which* rule was broken, never the value that
broke it. Two tests assert it: one that the URL contains neither the secret nor `consumer_secret`,
one that a control byte cannot reach the header at all.

### Tenancy

**5–9.** `N/A` — no table, no query, no cache key, no aggregate, no API key of ours. The client is a
pure request builder plus one fetch; the caller supplies the credential and owns the tenancy.

### Data movement

**10. No resale or redistribution.** `PASS` — data moves from the merchant's store to the merchant's
own workspace and nowhere else. **11, 12.** `N/A` — no Meta path, no dependency added
(`@repo/extract` was already a dependency).

### PII and consent

**13. Hash at the edge.** `PASS` **by deferral, and worth being precise about.** This client
deliberately **does not read the response body into rows** — `fetchWithRetry` returns the `Response`
so an extractor can stream it to R2. The order payloads it fetches *do* carry buyer name, email,
phone and address, and what protects them is `33`'s keep-list applied at the archive boundary, not
anything here. This file's obligation is to not *log* what it fetches, which it meets by never
reading the body except to parse the array.

**14. Forbidden payloads rejected before egress.** `N/A` — nothing egresses.

**15. Per-destination consent.** `N/A` — read path; writes remain deferred (§11.4).

### Access tier and quota

**16. Tier reality.** `PASS`, inverted. There is no tier and no documented quota, because the ceiling
is the merchant's own hosting. That is the opposite of the usual risk and carries its own: the client
must be well-behaved by construction rather than by permission. It sends an identifying `User-Agent`
so a host admin can attribute the traffic, caps `per_page`, and inherits `fetchWithRetry`'s
stop-on-non-retryable behaviour.

**17. No new long-lead dependency.** `PASS` — nothing here waits on anyone.

### Claims

**18. Claim provenance.** `PASS` — nothing user-visible changes. WooCommerce is now readable, which
moves it closer to claimable, but §11A.12's rule stands and issue #6's capability gate is still
unbuilt.

**Result:** `8 PASS, 10 N/A, 0 FAIL`

## 4. What was left out

- **The page loop.** This fetches *one* page and reports `totalPages`; nothing yet walks them. The
  loop belongs with the backfill integration, where the window-narrowing decision below also lives.
- **Window bisection for large stores.** When `X-WP-Total` on page 1 is large, the right move is to
  halve the window rather than page deep into someone's MySQL. The client exposes the parameters that
  make that possible and does not decide the policy.
- **The query-string auth fallback.** Documented by WooCommerce for hosts that strip the
  `Authorization` header, and deliberately not implemented: it puts the secret in the merchant's
  access log. If a real merchant turns out to need it, it should be an explicit per-connection opt-in
  with that consequence stated, not a silent retry.
- **The connect-time probe.** One `GET /orders?per_page=1` validates store URL, key, permission
  level, WP-user capability and pretty-permalinks at once, and maps each failure to a different
  sentence — notably `rest_no_route`, which means permalinks are off and is **not** a bad credential.
  It belongs with the connect surface, which is what a human is looking at when it fails.
- **The refunds pass.** Inline `refunds[]` carries `{id, reason, total}` — **no date** — so it cannot
  date a restatement. A store-wide `/refunds` endpoint exists on newer WooCommerce; establishing the
  version floor is its own work.
- **No integration test against a live store.** Every assertion here is on the request the client
  builds, not on a response a real WooCommerce returned. That is the honest limit of this PR.

## 5. Open or unverified spec items this builds on

- **WooCommerce's rate limits remain unknown**, as `23-launch-connector-substitution.md` records.
  Self-throttling is therefore a judgement, not a calibration.
- **Whether `dates_are_gmt` is honoured by `/refunds`** as it is by `/orders` could not be confirmed
  from the parameter tables. An unrecognised parameter is **silently ignored** rather than rejected,
  which would fail closed into site-timezone boundaries — the exact failure decision 2 exists to
  prevent, arriving through a door this PR does not open.
- **Whether a host strips the `Authorization` header** is a documented failure mode with no data on
  frequency, which is why the fallback is deferred rather than pre-emptively built.
- **Deep-page performance** is reasoned about (`OFFSET` against the merchant's MySQL) and not
  measured.

## 6. Verification

| | |
|---|---|
| `pnpm exec biome lint .` / `format .` | pass, by exit code |
| `pnpm -r typecheck` | pass |
| `pnpm -r test` | pass — **444 unit tests, up from 428** |
| `pnpm -r build` | pass |
| `pnpm check:brand` / `check:tokens` / `check:dictionary` | pass |

### Eight mutations, eight caught

| Mutation | Caught by |
|---|---|
| Allow plain-HTTP stores | the refusal, and its OAuth 1.0a message |
| `dates_are_gmt=false` | the window would become the merchant's timezone |
| Leave `modified_before` open | rows would shift between pages |
| Filter on created date instead of modified | a refund of an old order would never return |
| Send `per_page` as asked instead of clamping | the caller would believe it asked for 500 |
| A missing pagination header means zero pages | a store with orders would look empty |
| Stop rejecting non-printable credentials | header injection, and a `btoa` throw at request time |
| Sort by date instead of modified | page order would be unstable under `OFFSET` |

**Twenty-two mutations across this session's three connector PRs, all caught** — after three
survivors, each of which taught something the code did not: that CI running in UTC made a whole
class of assertion worthless, that a mutation can land textually and change nothing, and that a test
can assert a fallback it never reaches.
