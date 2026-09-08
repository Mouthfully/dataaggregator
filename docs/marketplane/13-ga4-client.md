# 13. The GA4 client, and a quota that is not ours to spend

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The transport half of the GA4 connector: `sources/ga4/client.ts`. `12-ga4-normaliser.md` turns a
response into envelope rows; this turns a backfill window into responses. With both, the GA4
connector unit is complete but for `backfill.ts`, which is wiring rather than design.

**One sourced fact decides the whole design.** Specification §7, line 710:

> "token cost varying by query complexity so **per-call cost is unknowable at request time**"

A GA4 request does not cost one request. It costs some number of tokens Google will not disclose
until after they are spent. So this client **cannot budget ahead** the way `planBackfill` does for
Google Ads in `@repo/extract` — there is no number to plan against. It can only measure. Which is why
`returnPropertyQuota: true` is sent on every request and is deliberately **not a parameter**: a
caller who forgot it would spend a customer's quota blind, and the flag costs nothing.

The rejected alternative was a static per-request budget, mirroring the Google Ads planner. It would
have been a number that looks measured and is not — the failure `parseMetaThrottle` already refuses
elsewhere in this repo.

### Whose quota is this? Not ours.

§3.2's table: 40,000 core tokens per property per hour, **"shared with the customer's other tools"**.

That changes what exhaustion means. Draining a property's hourly quota does not degrade this
product — **it breaks the customer's own Looker Studio dashboards**, with no error message pointing
anywhere near us. So the client stops at a floor (10% remaining) rather than at zero, and a
quota-exhaustion 429 is deliberately **not** retried: the remainder is work for the next scheduled
sweep, not for a retry now.

There is a second ceiling that genuinely is ours, and it is the **GA4 analogue of the Google Ads
developer token** in `10-credential-model.md`: **14,000 core tokens per project per property per
hour**, where the project is our one OAuth client across every tenant. Usefully it also caps us at
35% of any one property's hourly allowance, so Google enforces "do not hog the customer's quota" on
our behalf — but **only per property, never across them**. Nothing stops one shared project
exhausting its own 14,000 on property A while property B waits.

### Four refusals, each of which otherwise yields a total quietly too low

| Refusal | What it prevents |
|---|---|
| An explicit `limit` on every request | GA4's `limit` **defaults to 10,000** and a report that hits it comes back truncated, with the true total in `rowCount` and **no error** |
| Page until `rowCount` is satisfied | The same truncation, one level up |
| A page returning 0 rows while rows remain | Continuing loops forever; stopping silently drops the remainder |
| The quota floor mid-report | Half a report emitted as if whole |

The floor is checked **only when another page is actually needed**. A last page that exhausts the
quota is not an error — the work is finished, and refusing there would discard a complete report over
a request that will never be made.

### An async generator, not an array

`fetchWithRetry` refuses to read a response body for a stated reason: a Worker isolate has 128 MB and
a Workflow step output is capped at 1 MiB (`00-repo-map.md` §5). This client *must* read the body,
because GA4 returns `propertyQuota` **in the body rather than a header** — there is no other way to
measure. So it reads one bounded page at a time and yields, rather than accumulating a whole report
into one array, which is the shape that cannot be fixed later.

## 2. Cost estimate

**Per connected account per month: one GA4 request per (property, backfill window), plus one extra
per 10,000 rows.**

The terms, derived rather than asserted:

- **Requests.** `planBackfill`'s GA4 arm produces 5 windows/day in the steady state (D+1, D+3, D+7
  and the tier ladder). One property-grained daily report over a ≤30-day window is far under 10,000
  rows, so **pagination adds nothing at the current grain** — it exists for the channel × landing-page
  grain §4.1 wants, which is left out below.
- **~150 requests/property/month.** Against 200,000 tokens/property/day this is not close to a
  ceiling; the binding constraint is the **shared 14,000/project/property/hour**, not the volume.
- **Workers.** One subrequest per page. A Worker allows 1,000 subrequests on paid plans and 6
  *simultaneous* connections, and this client is strictly sequential per property, so it consumes one.
- **Storage, egress: $0.00 here.** This unit persists nothing.

**On §8's open question** — whether platform limits force 3×–5× redundant polling and collapse the
~98% margin: this client makes GA4 **1.0× per useful row**, not 3×. Each page is fetched once and the
refusals ensure a partial report is never re-fetched to correct it. The one place redundancy could
enter is a quota-floor stop, which re-reads the *unfetched* remainder next sweep and never re-reads
what it already has.

## 3. Platform-terms check

### Credential
**1. BYOC.** `PASS` — `accessToken` is a required argument, documented as *the customer's* token
opened from the per-workspace vault per request. No `process.env` read anywhere in this unit; no
company-held key, no developer token, no service account.
**2. Vendor-key exception.** `N/A` — no company-held key.
**3. No token pass-through.** `N/A` — no MCP surface. Worth noting the shape is right for it: the
token is a parameter, so an MCP handler physically cannot forward a client token it never obtains.
**4. Credential hygiene.** `PASS`, and **tested rather than asserted** — a test drives an unparseable
response and asserts the resulting message contains the property id and **not** the token. An error
message is a log line, and a bearer token in a log is a credential under a different retention policy
with a different audience. A 401 is classified `auth` by `@repo/extract` and **not retried**, which is
the token-death path: it reaches `recordFailure` in `@repo/connections` and flips the connection to
`needs_reauth`.

### Tenancy
**5. RLS.** `N/A` — no table.
**6. No service-role bypass.** `N/A` — no database access.
**7. No cross-workspace read.** `PASS` — one property per call, credential supplied per call, no
module state and no cache. There is no shared key for a tenant to be missing from.
**8. No cross-customer aggregation.** `PASS` — no aggregation. Quota readings are per property and
per call and are not accumulated anywhere.
**9. API key scope.** `N/A`.

### Data movement
**10. No resale or redistribution.** `PASS` — the response is yielded to the caller and nothing else.
**11. Meta client list.** `N/A` — GA4.
**12. Dependency licences.** `PASS` — one added workspace dependency, `@repo/extract`. No
third-party package.

### PII and consent
**13. Hash at the edge.** `PASS` — no persistence, no logging, no LLM prompt. The client does not
choose dimensions; it forwards the caller's request, so a PII-adjacent dimension is a decision made
where the report is defined, not here.
**14. Forbidden payloads.** `N/A` — read path.
**15. Per-destination consent.** `N/A` — writes deferred past MVP.

### Access tier and quota
**16. Tier reality.** `PASS`, and this gate is the unit's subject. GA4's 40,000/property/hour shared
with the customer's tools is implemented as a floor, not a target; the 14,000/project/property/hour
is documented as the tenant-shared ceiling. **Rejected requests are not retried into a storm** — a
401/403 stops at one attempt, `maxAttempts` is a caller parameter set to 2 in tests, and the floor
stops paging before exhaustion.

Per-source budget consumption is **parsed and returned** on every page as `Ga4Page.quota`, which is
what §4.4 and the recon both require ("publish per-source budget consumption in the response
envelope"). **It is not yet in the envelope** — the envelope is per row and quota is per request, so
carrying it needs a `meta` field, and adding one is an envelope change, not a connector change.
Named in §4 below rather than smuggled in.
**17. No new long-lead dependency.** `PASS` — no developer token, no access review, no audit. This
remains the reason GA4 is first.

### Claims
**18. Claim provenance.** `PASS` — no user-visible string.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 4. What was left out

- **`backfill.ts`.** The GA4 arm that turns `planBackfill`'s windows into `Ga4ReportRequest`s. Wiring
  between two units that already exist; no design decision left in it.
- **Quota in the response envelope.** Parsed and returned per page, but `meta` has no field for it.
  That is an envelope change (`@repo/contract`), and **widening this PR to make it would be exactly
  the scope creep the kickoff forbids.** The data is available the moment the field exists.
- **A cross-property governor.** The 14,000/project/property/hour ceiling is per property, so nothing
  here coordinates spend across tenants. That belongs in Cloudflare Queues with the Google Ads pacer
  (`00-repo-map.md` §5), which is one component solving one problem for both platforms.
- **Concurrency.** Strictly sequential. GA4 allows 10 concurrent requests per property, and using
  them would need the governor above to know it is not stealing from another tenant first.
- **`runRealtimeReport`, `batchRunReports`, `checkCompatibility`.** Not needed for a daily backfill.
  `batchRunReports` is worth revisiting once the grain widens — it may cost fewer tokens than the
  same reports issued separately, which is measurable but not yet measured.
- **Retry tuning.** `maxAttempts` is the caller's. Two is right for GA4 and is not hard-coded here.

## 5. Open or unverified spec items this builds on

1. **The quota group names are not in the specification.** `tokensPerDay`, `tokensPerHour`,
   `tokensPerProjectPerHour`, `concurrentRequests`, `serverErrorsPerProjectPerHour`,
   `potentiallyThresholdedRequestsPerHour` come from Google's `PropertyQuota` message, not from §3.2,
   which gives the *numbers* but not the field names. The parser is therefore **defensive by
   construction**: an unrecognised or absent group is reported as `null`, never as zero, and a
   response with no `propertyQuota` at all returns `null` and is allowed to proceed. If a name is
   wrong, this client under-protects rather than mis-stops — which is the right direction for a
   guess, but it *is* a guess. **Verify against a real response with the recorded fixtures.**

2. **The 10% floor is a judgement, not a measurement.** It follows from a defensible premise — the
   last page's token cost is a *lower* bound on the next one's, since a page deeper into a report is
   not cheaper — but the specific fraction is chosen, not derived. Once real token costs are
   observable the floor should become "the last page's cost plus a margin".

3. **`concurrentRequests` is excluded from the floor**, on the reading that it is an in-flight count
   rather than a depleting allowance. If Google's semantics differ, a client at its own concurrency
   limit would be treated as having quota it does not have. Sequential issuance makes this
   unreachable today.

4. **The fixtures remain synthetic** (`12-ga4-normaliser.md` §5.1). Same §13.3 rule 6 deviation,
   unchanged, and it now covers a second file: the quota shapes above are written from documentation
   rather than recorded.

## 6. Verification

| | |
|---|---|
| `@repo/connectors` typecheck | clean |
| `@repo/connectors` tests | **37/37** (20 normaliser, 17 client) |
| Whole repo | **226 tests**, lint, format, both guards, typecheck, build — green |

**Mutation-checked — eleven mutations on the client, eleven caught:**

| Mutation | Result |
|---|---|
| Drop `returnPropertyQuota` from the request | caught |
| Drop the limit range guard | caught |
| Leak the access token into an error message | caught |
| Apply the depletion floor to `concurrentRequests` | caught |
| Refuse when the quota reading is absent | caught |
| Treat a missing quota group as zero remaining | caught |
| Stop after the first page, ignoring `rowCount` | caught |
| Advance the offset by the limit rather than rows received | caught |
| Drop the no-progress guard | caught |
| Drop the mid-report quota floor | caught |
| Check the floor before yielding the final page | caught |

**Two of those needed work, and one of them changed the test harness.**

*Offset arithmetic.* `offset += limit` survived the first run, because every page in the paging test
returned exactly `limit` rows and the two expressions coincided. A page that comes back **short of
the limit while rows remain** is the case that separates them: `offset += limit` steps over the rows
GA4 did not send and the report comes back short with nothing saying so. There is now a test for
exactly that shape.

*The no-progress guard.* Removing it did not fail the suite — **it hung it**, because the recorder
replayed its last response forever and the generator looped. In CI that is a twenty-minute timeout
rather than a red test. The recorder now **throws when its queue is exhausted**, so every test
declares how many requests it expects and one request too many is a fast, legible failure. The
mutation is caught in under a second.

This is the third time in this repo that mutation testing found something reading did not, and the
first time it found a defect in the *tests* rather than in the code.
