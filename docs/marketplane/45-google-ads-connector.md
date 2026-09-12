# 45. The Google Ads connector, and the developer token that belongs to the customer

**PR:** _unassigned (uncommitted branch work)_ &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The Google Ads connector unit, in the shape §13.3 specifies and `sources/ga4/` already demonstrates:
`client.ts`, `normalize.ts`, `fixtures.ts` and their two test siblings. It needs **no dictionary
change, no schema change and no migration** — `google_ads` is already in `SOURCES`,
`RESTATEMENT_CLOCKS` and `REDACTION_POLICIES`, the `adwords` scope is already declared on the same
Google provider as GA4, and every metric and entity type it emits already exists. That was verified
before a line was written, and it held.

**The decision: the developer token is the customer's, opened from the per-workspace vault on every
call, and this supersedes `10-credential-model.md` §2.**

That note decided "one shared developer token, Basic tier, applied for immediately", with per-tenant
tokens kept as an escape hatch, on the grounds that obtaining one "is not an onboarding step, it is
an onboarding wall". The wall is real. It is also what Google's developer policy requires: a third
party must not let customers "avoid applying for their own Google Ads developer access and Google
Cloud Platform project". Platform-terms gate 1 is a binary gate and a shared token fails it. So
`GoogleAdsClientOptions.developerToken` is a required argument with no environment fallback —
`connections.developer_token_ciphertext` has existed since `20260908000500_connections.sql`, added
against exactly this open question with a comment saying "revisit before the Google Ads connector
ships". This is that revisit.

**The consequence runs the other way from what §2 of that note expected, and it is the strongest
argument for the decision.** A shared token divides one ceiling across every tenant, which is why
`accountCapacity` says Explorer (2,880 ops/day) supports 360 accounts at this connector's request
rate and Basic is needed to clear the 240–400 survival number. A per-tenant token divides that same
ceiling across **one tenant's own accounts**. At 8 operations per account per day, Explorer carries
**360 accounts for a single customer** — beyond any SME and beyond most agencies. Explorer is
immediate and self-serve.

> **Basic access stops being a launch blocker.** It becomes a convenience for the largest agency
> tenant, not a gate the product waits behind.

The rejected alternative was to keep the shared token and treat gate 1 as satisfied by "our
application, their data". It compiles and it ships sooner; it also puts the two largest sources
behind a policy reading that the recon flags as a termination risk, and it makes every tenant's
backfill a charge against every other tenant's ceiling.

### The six traps, each of which yields plausible wrong numbers rather than an error

| Trap | What goes wrong silently |
|---|---|
| **Money is in micros** — `cost_micros` is millionths | 1,234,560,000 read as units is ฿1.2 billion of daily spend. Six orders of magnitude, in the headline number |
| …**but `conversions_value` is not** | Two money metrics on one row, scaled differently. One rule for "currency" gets one of them wrong whichever way it is written |
| **int64 is a string, double is a number** | `"18422"` and `37.5` in one `metrics` object; `"1284" + "1102"` is `"12841102"` |
| **A zero is omitted entirely** | proto3 JSON drops default values, so a paused campaign has no `costMicros` key. Refusing deletes every zero-spend day; accepting blindly invents zeroes |
| **The date is the account's own day** | `segments.date` is already `YYYY-MM-DD`. Any round trip through `Date` re-anchors it to the runtime's offset and can hand back the day before |
| **Currency and time zone must be SELECTed** | They arrive per row from `customer`. Defaulting either mislabels the money or moves the day boundary seven hours |

### The field mask is the authority, and it is what makes trap 4 safe

`SearchGoogleAdsResponse.field_mask` names exactly what the query selected, so:

* named in the mask **and** present in the row → the platform's value;
* named in the mask **and** absent → **zero**, because proto3 omits defaults;
* **not** named in the mask → not emitted, because it was never requested.

This rule is correct under *both* readings of trap 4: if Google in fact sends explicit zeroes, the
first line handles them and the second never fires. And it is only safe because `customer.id`,
`customer.currency_code` and `customer.time_zone` are mandatory — a response whose spelling this
module did not expect trips `missing_customer` before a single fabricated zero can be emitted.

### The attribution window is `account_default`, and the choice is not cosmetic

The envelope refuses an unlabelled conversion count, so this field is never null. Google attributes
by two per-account, per-conversion-action settings the report does not state on the row: a
click-through lookback window (30 days by default, 90 at most) and an attribution model.
`@repo/contract` carries `account_default` for this platform in as many words.

* `dda` was rejected because it asserts data-driven attribution — one of several models an account
  may use, and nothing in the response says which. A confidently wrong label is worse than a
  general true one, because a reader acts on it.
* `model` was rejected because it is GA4's label and means "no selectable window exists". Google
  Ads' window *is* selectable, by the advertiser. `model` would misdescribe the platform.

It is emitted on spend-only rows too, where the envelope would allow null. `attribution_window` is
part of the §7 upsert key, so a spend pull writing null and a conversions pull writing
`account_default` would produce **two rows for one campaign-day**. A test asserts the two pulls
produce the same key.

### The client is the mirror image of the GA4 client

GA4 cannot budget ahead — "per-call cost is unknowable at request time" (§7, line 710) — so it
measures, and asks for `propertyQuota` on every request. Google Ads is the opposite on both counts:
the cost of a request is knowable, and the platform reports **nothing** back about what remains. So
this client **counts** instead, the budget is an input rather than an output, and every page returns
a `GoogleAdsBudgetReading` — the same obligation `Ga4Page.quota` discharges.

Two consequences follow from *rejected requests still count*:

1. **The counter increments when a request is issued, not when it returns**, and counts every
   attempt `fetchWithRetry` makes. A 500 that succeeds on retry costs two operations. Over-counting
   costs unused headroom; under-counting overruns a ceiling whose penalty is every call under that
   token failing for the rest of the day.
2. **Two malformed inputs are refused locally, before a request exists to be rejected**: the dashed
   customer id Google's own UI displays, and an empty developer token. Each would otherwise be a
   400 or a 401 that spends an operation to learn nothing.

`onOperation` exists because the failure modes that spend the most quota are the ones that throw: a
call that raises never returns its budget reading, so the governor would never hear about the
operation it spent.

## 2. Cost estimate

**Per connected account per month: `$0.0017` in marginal infrastructure, and `243` Google Ads
operations.** Derived below; every term is either measured from the repository's own code or stated
as an assumption with its sensitivity.

**Requests.** Taken from `planBackfill` rather than guessed, because §11.3 meters per connected
account and this is the number that moves:

| Restatement window | Windows/day | Accounts on Explorer (2,880/day) | On Basic (15,000/day) |
|---|---|---|---|
| 30 days (the contract's default) | **8** | 360 | 1,875 |
| 90 days (an account at Google's cap) | **17** | 169 | 882 |

At the default: 8 operations/day × 30.4 = **243 operations per account per month**, one page each.
One page holds 10,000 rows, and a 7-day weekly window at campaign grain for a 50-campaign account is
350 rows — so pagination adds nothing until roughly **1,430 campaigns**, at which point the request
count doubles. *Assumption: 50 campaigns per account.* It moves storage linearly and requests not at
all below that threshold.

**Money.**

| Term | Working | Per account per month |
|---|---|---|
| Workers requests | 243 subrequests at $0.30/M | $0.00007 |
| Workers CPU | 243 × ~50 ms at $0.02/M ms | $0.00024 |
| R2 Class A writes | 243 objects at $4.50/M | **$0.0011** |
| R2 storage | 4 daily pages ≈ 18 KB + 4 weekly ≈ 120 KB = 552 KB/day → 16.8 MB/month at $0.015/GB | $0.00025, cumulative |
| Supabase disk | 1,500 rows upserted in place × ~400 B = 600 KB, `raw` an R2 **key** not a JSONB blob, at $0.125/GB | $0.000075, growing 600 KB/month |
| KV | none — no per-row envelope cache in this unit | $0.00 |
| Bought data | none | $0.00 |

**R2 Class A writes are 65% of it**, and object *count* is the term §7's cost table has no line for.
Storage compounds: twelve months of retained payloads is ~2,900 objects and ~200 MB, at which point
storage overtakes writes.

**On §8's open question — whether platform limits force 3×–5× redundant polling per useful row, and
whether the ~98% margin survives it. This connector does not clear that bar, and the reason is the
planner rather than the client.** A given calendar date is re-read by the daily tier on four run
days and by the weekly tier on every run day from D+4 to D+30, each of those amortised across a
seven-day window: **4 + 27/7 ≈ 7.9 operations per useful day** at a 30-day window, and ≈ 16.4 at 90.
That is the tiered restatement ladder working as designed — the product's guarantee is that a row
is re-pulled until its window closes — but it is above §8's threshold and should be read as such
rather than reported as 1.0×. What this unit contributes is that **none of that redundancy is
corrective**: each page is fetched once, the refusals below ensure a partial report is never
re-fetched to fix it, and a budget-floor stop re-reads only the part it never got.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — and this is the gate the PR is built around. `accessToken` and
`developerToken` are both required arguments, documented as opened from the per-workspace vault per
request. `grep -rn "process.env\|import.meta.env"` over `sources/google_ads/` returns nothing; there
is no environment read to fall back to and no company-held token anywhere in the unit. A test
asserts both credentials reach the wire as the workspace's own.

**2. Vendor-key exception.** `N/A` — no company-held key. This is platform data, where the
exception does not apply in any case.

**3. No token pass-through.** `N/A` — no MCP or OAuth request path changes. Worth noting the shape
is right for it: both credentials are parameters, so a handler physically cannot forward a token it
never obtains.

**4. Credential hygiene.** `PASS`, and **tested rather than asserted**. This request carries two
secrets where GA4 carries one, and the developer token is the credential a whole workspace's pulls
run on. A test drives an unparseable response and asserts the message contains the customer id and
**neither** token. Fixtures carry no credential. A 401/403 is classified `auth` by `@repo/extract`
and not retried, which is the token-death path: it reaches `recordFailure` and flips the connection
to `needs_reauth`.

### Tenancy

**5. RLS.** `N/A` — no table.

**6. No service-role bypass.** `N/A` — no database access.

**7. No cross-workspace read.** `PASS` — one customer id per call, both credentials supplied per
call, no module state and no cache. The daily budget is an **input**, so there is no shared counter
living in this unit for a tenant to be missing from.

**8. No cross-customer aggregation or benchmarking.** `PASS` — no aggregation of any kind. Every
output row derives from exactly one input row.

**9. API key scope.** `N/A`.

### Data movement

**10. No resale or redistribution.** `PASS` — pages are yielded to the caller and nothing else.
Nothing is billed in platform rows: §11.3's meter is the connected account.

**11. Meta client list.** `N/A` — Google.

**12. Dependency licences.** `PASS` — no dependency added, and `pnpm-lock.yaml` untouched. Two
workspace dependencies, `@repo/contract` and `@repo/extract`, both already in the package.

### PII and consent

**13. Hash at the edge.** `PASS`, and it is the reason one design decision went the way it did.
Nothing here persists or logs, and error messages quote the **metric path and the offending value**,
never a dimension value. More importantly, the grains this connector reads stop at `ad_group`:
`search_term_view.search_term` is free text a person typed, and `REDACTION_POLICIES.google_ads`
declares this source `verbatim` on the stated grounds that it is "aggregate campaign reporting; no
contact data". Emitting a search term would make that declaration untrue for every payload archived
afterwards, and an archived object has no way to know it changed. A test pins the level list so the
fourth grain cannot be added without someone meeting this argument.

**14. Forbidden payloads rejected before egress.** `N/A` — read path, no payload construction.

**15. Per-destination consent.** `N/A` — writes remain deferred past MVP (§11.4).

### Access tier and quota

**16. Tier reality.** `PASS`, and the unit's subject. `GOOGLE_ADS_TIERS` is read from
`@repo/extract` rather than restated: Explorer 2,880/day, Basic 15,000/day, Standard unlimited and
possibly unreachable. A **Test** token is refused outright with its own error code, because a pull
under one does not fail partway — it reports a confident empty account it never looked at. Rejected
requests are counted, retries are counted, a 401 stops at one attempt, and the floor refuses to
issue rather than spending an operation to discover the day is gone. Per-source budget consumption
is exposed on every page as `GoogleAdsPage.budget`, and on every issued request through
`onOperation`. **It is not yet in the response envelope** — `meta` has no field for it, which is an
`@repo/contract` change and the same gap `13-ga4-client.md` recorded.

**17. No new long-lead dependency.** `PASS`, with the gate named and the degraded path stated. The
code depends on no approval. Shipping to a customer depends on two, and the BYOC decision moves both
off this company's calendar: **Google OAuth sensitive-scope verification** (unbounded — documented
at 3–5 days, observed at over ten weeks; never quote the shorter figure) already gates GA4 and is
unchanged, and the **developer token** is now the tenant's to obtain. The degraded path is Explorer,
which is immediate and self-serve and carries 360 accounts for one tenant at this request rate. What
the decision costs is an onboarding wall — the customer needs a Google Ads manager account before
they can connect — and the Connect screen has to say so rather than showing a generic failure.

### Claims

**18. Claim provenance.** `PASS` for this diff, **with a required follow-up that the guard is
already refusing to let pass.** No user-visible string is added here. But `check-capabilities.mjs`
treats a source as claimable once its directory holds both `client.ts` and `normalize.ts`, so
merging this makes `google_ads` claimable and the connector claim's source mirror in
`packages/brand/src/claims.ts` must gain it. That file is outside this PR's scope; the guard fails
until it is updated, which is the mechanism working exactly as `check-capabilities.mjs` describes
("stale marketing copy cannot survive a connector change"). See §6.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **`backfill.ts`, and the GAQL query builder with it.** The same split `12-ga4-normaliser.md` and
  `13-ga4-client.md` made, for the same reason: the two halves here carry the design and the wiring
  is its own PR. The query is not left undefined, though — `GOOGLE_ADS_LEVELS[level].selectFields`
  is exported **as data**, so the query author and the parser read one list and a field missing from
  the query is a row refused with a message naming it.
- **The `ad`, `keyword` and `search_term` grains.** Gate 13, above. `search_term` is free text a
  person typed and would invalidate the existing payload redaction declaration for this source. That
  is a redaction decision, and folding it in here would make it invisibly.
- **`metrics.all_conversions`, and the per-conversion-action breakdown.** `all_conversions` counts a
  different thing from `conversions`, and mapping it onto the same canonical metric would put two
  different numbers in one column depending on which report ran last.
- **Reading the account's real conversion window.** `conversion_action.click_through_lookback_window_days`
  would make `restates_until` exact instead of defaulted. The normaliser takes `accountWindowDays`
  and `connections.restatement_window_days` exists to hold it; nothing fetches it yet, so today the
  contract's 30-day default applies unless a caller passes one.
- **The window as part of the row's identity.** `attribution_window` is constant per source, so an
  advertiser widening 30 → 90 days changes what the same upsert key *means* without changing the
  key. Not solved here; it is a store question, not a connector one.
- **Quota in the response envelope's `meta`.** Parsed and returned per page; the envelope has no
  field. Widening this PR to add one would be the scope creep the kickoff forbids.
- **The cross-tenant governor.** `consumedToday` is an input because a single connection's pull
  cannot see the token's running total. That belongs with the Queues-level pacer, one component
  solving one problem for both platforms.
- **`searchStream`.** Rejected rather than deferred: it returns one unbounded response, which cannot
  be bounded per page in a 128 MB isolate. Paged `search` is the shape that survives.
- **`returnTotalResultsCount`.** It would give the completeness check GA4 gets from `rowCount`, at a
  documented cost to query performance and an undocumented one to quota. The token guards below do
  the same job for nothing; revisit with a measurement.
- **Account discovery.** How a workspace learns which customer ids it may read
  (`listAccessibleCustomers`, `customer_client`) is onboarding, not extraction.
- **FX conversion.** `fx_*` are null because Google Ads converts nothing. `@repo/fx` fills them.

## 5. Open or unverified spec items this builds on

1. **THE FIXTURES ARE SYNTHETIC, AND §13.3 RULE 6 REQUIRES RECORDED ONES.** Unchanged from
   `12-ga4-normaliser.md` §5.1, and worse here: GA4 needed only a customer's OAuth grant, while one
   real Google Ads row needs a developer token behind a manager account. **Three values a single
   live call would settle**, named in `fixtures.ts` so the first call is worth making:
   whether `fieldMask` really returns camelCase; whether a zero metric really is omitted rather than
   sent as `0`; and whether an empty page can carry a `nextPageToken` at all. The first two are the
   load-bearing ones — the module survives being wrong about either, by design, but it should not
   have to.
2. **Google Ads publishes no freshness or finalisation statement at all.** `RESTATEMENT_CLOCKS`
   records that across three research attempts, and this connector takes it literally:
   `source_updated_at` is **null**, not a copy of `fetched_at`, because copying would manufacture
   the statement the research could not find. The 30-day window is an upper bound derived from the
   conversion window, not an SLA, and must never be sold as one.
3. **Per-tenant developer tokens in a multi-tenant service are undocumented** (`00-repo-map.md` §9,
   standing list). This PR makes them the default anyway, because gate 1 is binary and the shared
   alternative fails it. If Google's answer comes back the other way — that a provider's own token
   is expected — the change is one argument's source, and `10-credential-model.md` §2's shared-token
   arithmetic becomes live again along with its Basic-access dependency.
4. **Whether "operations" equal requests for a reporting call.** Google bills operations; this
   client counts requests, which is a **lower bound** — a paginated report may cost more than one
   per page. `accountCapacity` already documents itself as deliberately optimistic for this reason.
   If the true ratio is above 1, every capacity figure here is proportionally lower.
5. **The API version is a guess with an expiry date.** `GOOGLE_ADS_API_VERSION` is one exported
   constant rather than a literal in a URL, because a retired version is a 404 that still spends an
   operation.
6. **`page_size` is not sent.** Recent versions document it as deprecated and fix the page at
   10,000; sending a value that is silently ignored is a number that looks like control and is not.
   Paging follows `nextPageToken`, which is correct either way.
7. **The two paging refusals are stricter than anything Google documents.** An empty page offering a
   token, and a token already followed, are both refused. That is the right direction for a guess —
   a loud error on a shape never seen, rather than a report quietly short or a Workflow step that
   spins until it times out — but it is a guess, and item 1 settles it.
8. **Google Ads Standard access may have no path for a headless product** (§11.11, High). Nothing
   here needs it: Basic's 15,000 is not approached, and under per-tenant tokens neither is Explorer's
   2,880.
9. **`first_seen_at` as the restatement anchor** rests on the same open question as every other
   source — Meta's 28-day clock, delivery or first report. Unchanged, and inherited from
   `@repo/contract` rather than re-decided here.

## 6. Verification

Everything below was run. Counts are as printed.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | **exit 0** — 6 warnings, 1 info, **none in `sources/google_ads`** (all pre-existing or from concurrent work in `ga4`, `oauth`, `scripts`, `docs`) |
| `pnpm exec biome format --write` (five files of this PR) | 5 files formatted |
| `pnpm -r typecheck` | **exit 0**, whole workspace |
| `pnpm --filter @repo/connectors test` | **exit 0 — 316 passed, 14 files** (whole package, including concurrent work) |
| `vitest run src/sources/google_ads` | **67 passed, 2 files** — 45 contract, 22 client |
| `node scripts/check-brand.mjs` | **PASS** |
| `node scripts/check-tokens.mjs` | **PASS** |
| `node scripts/check-dictionary.mjs` | **PASS** — the point of the PR: no dictionary or schema change |
| `node scripts/check-capabilities.mjs` | **FAIL, 3 findings, and the failure is correct.** See below |

### The capability guard, and the one line this PR cannot write

```
packages/brand/src/claims.ts:1:1  implemented source "google_ads" is absent from the connector-claim source list
packages/brand/src/claims.ts:1:1  implemented source "meta_ads" is absent from the connector-claim source list
packages/brand/src/claims.ts:1:1  implemented source "search_console" is absent from the connector-claim source list
```

A source becomes claimable when its directory holds both `client.ts` and `normalize.ts`. Three
connectors crossed that line in the same checkout, and `packages/brand/src/claims.ts` is outside all
three scopes. The mirror needs, sorted as the guard requires:

```ts
export const IMPLEMENTED_SOURCE_IDS = ["ga4", "google_ads", "meta_ads", "search_console", "woocommerce"] as const;
// and in SOURCE_LABELS:  google_ads: "Google Ads",
```

The guard was green before this work and is red because of it, which is what it is for. It is
recorded here rather than worked around.

### Mutations — nine applied, nine caught, all reverted

| Mutation | Caught by | Failures |
|---|---|---|
| Return `cost_micros` without dividing | four tests, including the snake_case and never-selected ones | 4 |
| Re-anchor `segments.date` through `new Date(...T00:00:00)` | the date test **and the upsert key** | 2 |
| Refuse an omitted metric instead of reading it as zero | the zero-spend-day test | 1 |
| Default the currency to `EUR` when the row omits it | the row-level fixture, **not** the mask-level one | 1 |
| Count an operation only when the request succeeded | the 401 test and the retry test | 2 |
| Drop the pre-flight budget check | the Test-tier test and the floor test | 2 |
| Drop the already-followed page-token guard | the circular-token test — as a **fast** failure, not a hang | 1 |
| Check the budget floor before yielding the final page | both floor tests | 2 |
| Drop the micros safe-integer guard | the direct unit test only | 1 |

**Two results are worth more than the tally.**

*The date mutation is invisible in UTC, and that is the whole argument for `vitest.config.ts`.* The
mutated expression, evaluated directly:

```
TZ=UTC              -> 2026-08-14     (correct by accident)
TZ=Asia/Bangkok     -> 2026-08-13     (a day lost)
TZ=Europe/Berlin    -> 2026-08-13
TZ=America/New_York -> 2026-08-14     (correct by accident)
```

On a UTC CI runner — which is every CI runner — that assertion is decorative and the bug ships. It
fails here because the suite is pinned to Asia/Bangkok, and a test in this file asserts the pin
itself so that losing the config is a red test rather than three silently weakened ones.

*The currency mutation was caught by the row-level fixture and not the mask-level one,* which is the
GA4 lesson holding: `NO_CURRENCY` and `NO_TIMEZONE` isolate one field each, and
`ROW_MISSING_CURRENCY` covers the case where the query selected the field and the platform did not
answer. Three fixtures where one would have passed for the wrong reason.

### Two defects in my own code, both found by these tests before any mutation

- **The dual-spelling path reader only worked in one direction.** Mask paths are canonicalised to
  camelCase before lookup, so a camel-only read could never find a snake_case row — the exact case
  the tolerance exists for. `SNAKE_CASE_RESPONSE` failed with `spend: 0`, which is the fabricated-zero
  outcome the whole field-mask rule is built to prevent. Fixed; the comment now says so.
- **The metric-collision guard was unreachable.** Canonicalising the mask into a `Set` deduplicated
  the two spellings before the collision check ever saw them. The mask is now kept in both forms:
  the platform's own spellings for the collision check, canonical forms for membership.

### One thing done to the working tree that was not mine to do

Five files appeared inside `packages/connectors/src/sources/google_ads/` mid-run, from a concurrent
workflow: `page.tsx`, `_content.ts`, `claims.ts`, `MARKETING-DATA-PLANE.md` and an `md5.txt`
manifest naming their real homes. Two of them are `.ts` under `src/`, so they **broke
`@repo/connectors` typecheck** with five errors about `@repo/brand` and `./brand.ts`.

All five are byte-identical to the originals still in place at `apps/web/app/`,
`packages/brand/src/` and `docs/` — verified with `md5sum` against the manifest's own hashes. They
were **moved, not deleted**, to
`…/scratchpad/stray-files-found-in-google_ads/`, and typecheck went green again. Nothing was lost
and nothing was edited; if the workflow that wrote them needs them, they are recoverable there.
