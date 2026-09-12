# 46. The Meta Ads connector, and the window that is a dimension

**PR:** #TBD &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The `client` and `normalize` halves of the Meta Ads connector unit (specification §13.3), with
synthetic fixtures and three test files beside them. No schema change, no migration: `meta_ads` was
already in `SOURCES`, `RESTATEMENT_CLOCKS`, `REDACTION_POLICIES` and `@repo/oauth`, every metric it
emits was already in the dictionary, and `app.attribution_window` already carried Meta's six
click/view windows. The connector spends that groundwork rather than adding to it.

**The decision: one insights row becomes SEVEN envelope rows — one per requested attribution
window, plus one delivery row with no window at all.** Meta returns the same purchase under
`1d_click`, `7d_click`, `28d_click`, `1d_view`, `7d_view` and `28d_view` on a single row, and
returns `spend`, `impressions` and `clicks` once, meaning the same thing under every window.

The alternative — the one every incumbent takes, and the one `dbt_ad_reporting` bakes into its
schema — is to collapse conversions into a single column. It was rejected because it is not a
smaller truth, it is a different number every time the default changes underneath you (§2), and
because the store's own key already disagrees with it: `envelope_rows_pkey` is
`(workspace_id, source, account_id, entity_id, date, attribution_window)` with `NULLS NOT
DISTINCT`, so two windows written as one row do not error — **the second silently UPDATES the
first** and five of the six vanish on write.

Two consequences of that shape are load-bearing and neither is obvious:

- **Delivery metrics must not be copied onto the window rows.** `spend` is the same number in every
  window, so writing it seven times makes `sum(spend)` seven times the truth for anybody who does
  not know to filter first. It goes on one row, whose `attribution_window` is `null` — which the
  envelope permits precisely because, in its own words, a window on a delivery-only row is "a label
  with nothing to label". This is legal on a `campaign` entity only because `spend` is deliberately
  **absent** from `COMMERCE_METRICS`; a commerce metric there would be refused by
  `envelope_rows_commerce_on_ad_entity_needs_window`, correctly.
- **`value` is never read.** Meta documents it only as *"Metric value of default attribution
  window"* and never names the default. Reading it emits a conversion count whose window cannot be
  labelled — exactly the row §2 says the API refuses. So the client always sends
  `action_attribution_windows` explicitly and refuses to issue a request without it, and the
  normaliser reads only those keys. The fixture sets `value` to a figure that appears in no window,
  so any code that reaches for it produces a number nothing else in the repository can explain.

**The second decision: no rate-limit constant in this connector is Meta's.** `00-repo-map.md` §9
item 10 is explicit — the specification flags its own `5,000+40×` and `190,000+40×` figures as not
appearing in the cited source, and names only one of the three `x-fb-ads-insights-throttle` fields.
So pacing is **measured**: every response is scanned for whatever utilisation Meta reported, and the
rule is deliberately **name-blind** — a key is a utilisation percentage when it ends in `_pct`,
whatever Meta calls it. The two numbers that are ours (an 80% stop ceiling, a 25-page bound when no
header reports anything at all) are guesses, are labelled as guesses in the code, and are both
client options so a caller that has *observed* the real behaviour passes what it measured.

**The third decision: the credential never enters a URL.** Meta accepts `?access_token=` and returns
`paging.next` with the token embedded in it, so the obvious way to page writes the customer's token
into every log line and error message that carries a URL. This client sends `Authorization: Bearer`
and pages by rebuilding the request from `paging.cursors.after`. `paging.next` is read as a boolean
and never fetched.

## 2. Cost estimate

**Per connected account per month:** `≈ $0.005` (`≈ ฿0.17`) at campaign grain — **derived below, and
dominated by a term the specification does not cost.**

Every figure comes from code in this repository, not from a guess about Meta.

| Term | Derivation | Result |
|---|---|---|
| Windows per night | `planBackfill({source:"meta_ads"})`: daily tier D-0…D-3 = 4 windows, weekly tier to D-28 = 4 windows | **8** |
| Requests per night | 8 insights requests + 1 ad-account node read (currency and timezone) | **9** |
| Requests per month | 9 × 30 | **270** |
| Day-rows re-read per night | 4 + 7 + 7 + 7 + 4 | **29 days** |
| Entities | SME account, campaign grain, assumed | **8 campaigns** |
| **Envelope rows per night** | 8 campaigns × 29 days × **7 rows** (1 delivery + 6 windows) | **1,624 upserts** |
| Rows added to the store per day | 8 × 7 | **56** |
| Workflow steps per night | 8 windows × 3 (submit, poll, land) | 24, vs a 10,000 limit |
| Workers | ~900 invocations/month at $0.30/M; ~36,000 CPU-ms at $0.02/M | **$0.0010** |
| R2 | 270 objects/month, Class A at $4.50/M; ~11 MB/month accruing at $0.015/GB-month | **$0.0025** |
| Supabase disk | 20,440 rows after a year ≈ 8 MB at $0.125/GB | **$0.0010** |
| KV | none — this connector caches nothing | **$0** |
| Bought data | none | **$0** |
| **Total** | | **≈ $0.0045** |

**The term that matters is the 7× fan-out, and it is the price of the product's central claim.**
Modelling the attribution window as a dimension multiplies both write volume and stored row count by
seven against a connector that reports one row per entity-day. Nothing in §7's cost table has a term
for it. At 400 connected accounts it is 108,000 R2 objects a month and ~650,000 upserts a day — still small
money, but it is the line that would move first if the grain moved from campaign to ad, where the
entity count rises by roughly 20× and takes the whole estimate with it (≈ $0.12/account/month).

**§8's open question — does the margin survive 3× to 5× redundant polling per useful row?** For Meta
the honest answer is worse than 5× and is unavoidable: **8 requests a night produce 1 genuinely new
day**, because a 28-day restatement window means yesterday's number is not finished. The tiering is
what keeps it at 8 rather than 28, and that was already decided in `08-backfill-planner.md`. At the
row level the ratio is 29 re-reads per new day-row. This is exactly the case §8 worries about, and it
is the reason §11.3 meters per connected account per month rather than per row: the redundant polling
costs platform quota and a fraction of a cent, not a billable unit.

**Two caveats repeated rather than assumed away.** §8 marks the performance COGS and the ~98% margin
UNVERIFIED, and §7's table still has no disk-growth term by its own checker's admission — the
Supabase line above is this PR's own arithmetic, not the specification's.

**What this does to Meta's ceilings.** 8 requests per ad account per day, against an hourly insights
quota the specification could not source. The 10-per-day async breakdown cap **does not bind**,
because this connector requests no breakdowns at all and never touches the async job path — which
also keeps it clear of the open 2026-08-06 availability notice on `frequency_value`,
`hourly_stats_aggregated_by_audience_time_zone` and `impression_device`.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — `MetaClientOptions.accessToken` is the customer's long-lived token, opened
from the per-workspace vault by the caller, exactly as GA4 does. No `process.env` platform
credential, no company-held token, no shared secret on the data path: `appsecret_proof` is
deliberately **not** sent, because computing it would put the application secret on a tenant request
path. (If Meta's app settings ever require that proof, it is a decision with a compliance
consequence and belongs in a design note, not a quiet patch.) `grep -rn "process.env"` over the diff
returns nothing.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is used; Meta is platform data and
could never qualify for one.

**3. No token pass-through.** `N/A` — no MCP or OAuth request path changes.

**4. Credential hygiene.** `PASS`, and asserted rather than intended. The token travels in an
`Authorization` header and never in a query string; `paging.next`, which embeds it, is read as a
boolean and never fetched; every error message names the ad account and never the token; the
fixtures contain no credential. A test asserts all three. The token-death path is unchanged and
already correct: `classify()` makes 401/403 non-retryable, which flows to `recordFailure` and marks
the connection `needs_reauth` — and for Meta that matters more than for Google, because a long-lived
token expires in ~60 days with no refresh (`connectionHealth` already distinguishes the two).

### Tenancy

**5. RLS.** `N/A` — no new table; no migration.

**6. No service-role bypass.** `N/A` — this unit executes no query.

**7. No cross-workspace read.** `PASS` — one ad account per client instance, and the normaliser
**refuses** a row whose `account_id` is not the account the pull was for (`account_mismatch`). The
only symptom otherwise would be one customer's spend appearing in another customer's total.

**8. No cross-customer aggregation or benchmarking.** `PASS` — no aggregate of any kind, no
percentile, no peer comparison. Nothing here reads more than one account.

**9. API key scope.** `N/A` — unchanged.

### Data movement

**10. No resale or redistribution.** `N/A` — no platform data leaves the workspace in this diff;
the connector produces rows for the store and nothing else.

**11. Meta client list.** `N/A` for code, and **worth recording anyway**: Platform Terms 5.b.ii.2
requires a per-Client record (legal entity name plus contact information), and
`workspaces.client_name` / `workspaces.client_contact` already carry it. This connector touches no
onboarding or workspace lifecycle path, so nothing here creates, updates or retires that record, and
the lifecycle is deliberately **not** built in a connector PR.

**12. Dependency licences.** `PASS` — no dependency added, removed or upgraded;
`pnpm-lock.yaml` untouched.

### PII and consent

**13. Hash at the edge.** `PASS` — `/insights` is aggregate reporting and carries no contact data,
which is why `REDACTION_POLICIES.meta_ads` is `verbatim`. That policy stays correct **because of the
field allow-list**: the normaliser refuses any field it does not recognise, so a future author
cannot widen `fields` into something that carries personal data without the pull failing loudly
first. No raw identifier can reach persistence, a log, R2 or a prompt through this path.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress, no write path.

**15. Per-destination consent.** `N/A` — writes remain deferred by §11.4.

### Access tier and quota

**16. Tier reality.** `PASS`, and this is the gate the client exists for. No Meta rate-limit constant
is hard-coded; pacing is read from whatever `x-fb-ads-insights-throttle`,
`x-business-use-case-usage`, `x-app-usage` and `x-ad-account-usage` actually report, by suffix rather
than by invented field name. The two numbers that are ours are labelled as guesses and are
overridable. Rejected requests are not retried (`classify()` stops at 4xx), which matters twice on
Meta: errors count against the insights quota *and* against the rolling error rate that gates Full
Access, so every request this client refuses to send before issuing it — a bad date range, a missing
window, a page size out of bounds — is an error not made. Per-source consumption is exposed to the
caller through `onUsage` and the `MetaUsage` record, including `ads_api_access_tier`, which is the
one instrumentation the specification names for confirming a Full Access upgrade took effect. It is
**not** in the envelope's `meta` block; that block belongs to the read API, not to this unit.

**17. No new long-lead dependency.** `PASS`, with the gate named as the template requires.
**The gate:** Meta Business Verification plus App Review for `ads_read`. **Observed timeline:**
weeks 3–8 (§3.5); Full Access additionally needs 500+ Marketing API calls in 15 days at under 15%
errors on the rolling last 500. **Degraded path that ships without it:** all of it. The unit is
testable without a credential by construction — normalisation is pure, the client takes an injected
`fetch` — so this code lands, is exercised against fixtures, and cannot be claimed to a customer
until the capability mirror is updated (see gate 18). Nothing else in the repository blocks on it.

### Claims

**18. Claim provenance.** `PASS` — **this PR publishes no claim.** The connector claim is generated
from `IMPLEMENTED_SOURCE_IDS` in `packages/brand/src/claims.ts`, which this PR does not touch and
may not: it is a shared file and three connector directories landed against it in the same window.
So the claim still reads "GA4 and WooCommerce", which is true today. The consequence is recorded
honestly in §6: **`check-capabilities.mjs` fails** until that mirror is updated once, for all three.
The sanctioned wording is already on the allowed list — *"Reads Google Ads, GA4, Search Console,
Meta and your affiliate network on your own credentials"* (`00-recon-reports.md`, claim 11) — so
nothing new has to be written, only enabled.

**Result:** `9 PASS, 9 N/A, 0 FAIL`

## 4. What was left out

- **`backfill.ts`, the third file of the connector unit.** `windowToRequest` and the plan
  orchestration have a GA4 shape to copy and are outside this PR's file scope. Until it exists there
  is no default report definition, so no default `fields` list and no default window set is declared
  anywhere — deliberately, because choosing them is that file's decision and guessing here would
  pre-empt it.
- **The barrel export.** `packages/connectors/src/index.ts` is shared and off limits; the exact
  export block is in the PR report rather than in the file.
- **The capability mirror.** One line in `packages/brand/src/claims.ts` plus a label. Shared with
  the Google Ads and Search Console connectors landing concurrently; it must be one edit, not three.
- **Breakdowns** (device, placement, country, age). None are requested, and that is a decision, not
  an omission: breakdowns push the pull onto Meta's async job path with its 10-per-ad-account-per-day
  cap, and an availability notice dated 2026-08-06 still affects three of them. The connector's
  grains come from `level`, which stays on the synchronous edge.
- **The async insights job path** (submit → poll → land). The synchronous edge with cursor paging is
  sufficient at SME scale and has a different failure model; building both would mean maintaining two.
  `stepBudget` already assumes three steps per window, so the budget does not change when it lands.
- **A fix for Meta's throttle errors arriving as HTTP 400.** Meta reports rate limiting with error
  codes (17, 613) inside a 4xx body, and `classify()` in `@repo/extract` is status-only, so such a
  failure is labelled `client` rather than `rate_limited` and the body is discarded before the code
  can be read. The *behaviour* is right — a 400 is not retried, so there is no storm — but the label
  the scheduler sees is misleading. Fixing it means changing `@repo/extract`, which is another PR.
- **Detecting an entity-day that stops being reported entirely.** The normaliser writes an explicit
  zero for a window Meta credits nothing to, which catches a restatement *down* to zero. It cannot
  catch a row that disappears from the response altogether; that is deletion detection and belongs to
  the store, alongside the `first_seen_at` preservation the same layer already owns.
- **Ratio metrics** (`cpc`, `cpm`, `ctr`, `cost_per_action_type`, `reach`, `frequency`). Every one is
  computable from `spend`, `impressions` and `clicks`, and every one is a different number when
  computed over a denominator we cannot see. Storing a figure nobody can reproduce fails §7's
  auditability requirement.
- **Business-level fan-out across many ad accounts.** One connected account per client instance.

## 5. Open or unverified spec items this builds on

**Nothing here has been run against Meta. There is no credential in this repository, and Meta access
is itself gated on App Review.** Everything below is built from the documented response shape.

1. **Meta's 28-day clock: delivery, or first report?** Unresolved in Meta's own documentation, per
   both the specification's researcher and its fact-checker. **This connector does not decide it** —
   it calls `restatesUntil`, which anchors on `first_seen_at` and says why. *If the answer comes back
   the other way:* for a row first seen on the day it describes the two readings agree, so only
   backfilled history moves — and it moves in the safe direction, holding a row provisional longer
   than a delivery anchor would. Settle it empirically: diff a historical pull against a re-pull
   thirty days later. Changing the answer is one edit in `@repo/contract`, not in this connector,
   which is the point of asking rather than computing.
2. **Meta's rate-limit figures are flagged by the specification itself** as not appearing in the
   cited source, and only `ads_api_access_tier` of the throttle header's three fields is named. The
   whole pacing design exists to be correct under that ignorance. **One call settles it:** the
   response headers of a single `/insights` request print which headers come back and what their
   fields are called — at which point the suffix rule can stay (it costs nothing) and the 80%
   ceiling can be replaced by something measured.
3. **`estimated_time_to_regain_access` is assumed to be in MINUTES.** Documented that way for the
   business-use-case header; unverified. Wrong by a factor of sixty, it errs toward waiting longer,
   which is the safe direction. The same call settles it.
4. **Whether `action_attribution_windows` accepts `dda`, `incrementality`, `inline` or `custom`.**
   The contract's vocabulary carries them because Meta reports them somewhere; the client refuses to
   request them because a value the parameter rejects fails the whole call. If they are accepted,
   `META_ACTION_WINDOWS` widens and nothing else changes.
5. **Whether Meta omits a zero window key, returns `"0"`, or omits the whole action entry.** The
   normaliser reads absent as zero and emits the row regardless, so the first two behaviours store
   the same number. The third would mean a restatement down to zero arrives as an absence and the
   previous non-zero row stands uncorrected. **One recorded response from a campaign whose
   conversions fell to zero settles it**, and it is the fixture most likely to be wrong.
6. **Whether `/insights` returns only the fields requested.** The allow-list refuses any other field,
   so a field Meta adds uninvited fails a pull rather than being dropped silently. That is the right
   way round, and it is the assumption most likely to produce a noisy first live call.
7. **Whether `paging.cursors.after` alone reproduces `paging.next`.** Rebuilding the request is what
   keeps the token out of URLs, and it assumes `next` carries no request state beyond the cursor.
   Two pages of a real report settle it.
8. **Whether Meta treats a pay-per-call API as a Tech Provider** needing per-client authorisation
   (§11.11, High). Unresolved. It bears on onboarding, not on this code, but it is the reason the
   5.b.ii.2 client record exists in the schema already.
9. **Meta's Full Access qualification** — 500+ calls in 15 days at under 15% errors on the rolling
   last 500 — is a cadence this connector must not break. At 9 calls per account per day, four
   connected accounts reach the call threshold inside 15 days; the error half is what the client's
   refuse-before-sending behaviour protects.
10. **`value`'s default window is never named by Meta.** This is not a gap this connector works
    around — it is the reason the connector never reads the field.

## 6. Verification

Everything below was run; the results are the real ones.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | pass, exit 0 — 6 warnings, 1 info, **none in this diff** (all pre-existing: `ga4`, `oauth`, `woocommerce`, `scripts/`, `docs/finance/`) |
| `pnpm exec biome format --write packages/connectors/src/sources/meta_ads/` | 6 files, no fixes outstanding |
| `pnpm -r typecheck` | pass — every package, including `apps/api-edge` under `@cloudflare/workers-types` |
| `pnpm --filter @repo/connectors test` | pass — **319 tests, 14 files** at the last run (the count moves: two other connector PRs are landing in the same package), of which **82 tests in 3 files** are this connector's |
| `node scripts/check-brand.mjs` | pass — 8 identity strings checked |
| `node scripts/check-tokens.mjs` | pass |
| `node scripts/check-dictionary.mjs` | pass — no dictionary change was needed, and the guard confirms none happened |
| `node scripts/check-capabilities.mjs` | **FAIL**, expected and not fixable here — see below |

The capability guard reports three findings, not one:

```
packages/brand/src/claims.ts:1:1  implemented source "google_ads" is absent from the connector-claim source list
packages/brand/src/claims.ts:1:1  implemented source "meta_ads" is absent from the connector-claim source list
packages/brand/src/claims.ts:1:1  implemented source "search_console" is absent from the connector-claim source list
```

The guard's rule is that a source directory holding both `client.ts` and `normalize.ts` is claimable
and must appear in the mirror. Three connector directories landed in the same window, and the mirror
is a single shared file none of the three PRs may touch. **The guard is working exactly as designed**
— stale marketing copy cannot survive a connector change — and the fix is one sorted list plus three
labels, made once. This PR's contribution to it is `"meta_ads"` and `meta_ads: "Meta"`.

### Mutations

Six, each applied to the real source, run, and reverted. Every file was restored from a checksummed
copy and the suite re-run green afterwards.

| Mutation | Caught by | Observed |
|---|---|---|
| Copy the delivery metrics onto every window row | `carries spend, impressions and clicks on exactly one row` | 1 failure — `sum(spend)` becomes 8,641.92 for a day that cost 1,234.56 |
| Fall back to `value` when a window key is absent | `ignores it even when it is the only key on the entry`, `emits an explicit zero for a window Meta credited nothing to` | 2 failures |
| Label every attributed row with the first requested window | `distinct upsert key`, `puts each window's own count on its own row`, `refuses an unlabelled conversion count`, +3 | **6 failures** |
| Remove the aggregated-range refusal (`date_stop !== date_start`) | `refuses an aggregate over the window rather than reading it as a day` | 1 failure |
| Ignore the measured utilisation reading (hard-code "always allowed") | `stops at the ceiling`, `yields the completed pages before refusing at the ceiling` | 2 failures |
| Move the credential into the query string | `puts the credential in a header and never in a URL`, `never fetches paging.next` | 2 failures |

**The second mutation is the one that earned its keep.** It was caught by exactly ONE test on the
first run — the `VALUE_ONLY` fixture — because `SPARSE_WINDOWS` carried no `value` field for a buggy
normaliser to fall back to, and `DAILY_CAMPAIGN` has every window key present so no fallback ever
fires. A response that carries `value` *and* a partial set of windows is the realistic shape, and it
was missing. `SPARSE_WINDOWS` now carries `value: "27"`, which is none of its window figures, and
the mutation is caught twice. The fixture was wrong, not the test.
