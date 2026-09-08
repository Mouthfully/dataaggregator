# 08. The restatement backfill planner

## 1. What this is, and the decision taken

`packages/extract` — the arithmetic behind the scheduler. Kickoff non-negotiable 6, "correctness over
coverage": tiered restatement backfill ships before a fifth connector.

**The backfill is built around restatement, not around new data.** That is the whole reason this is a
materialised store rather than a passthrough. Yesterday's numbers are not finished: Meta keeps
changing a row for 28 days after it is first reported, Google Ads credits late conversions back to
the original click date across its conversion window, and GA4 adjusts attribution for 12 days. A
scheduler that only fetches new days produces a report that silently disagrees with the platform's
own UI a week later — which is precisely the failure the product exists to sell against.

The shape, from section 9 week 2: **daily for D-0 to D-3, then weekly out to the platform's window.**
Recent days move most and are cheapest to re-pull; a row three weeks old moves rarely, and pulling it
daily costs twenty times the quota for almost nothing.

Two smaller decisions worth stating:

**Windows are returned newest first.** If a run is cut short by a quota error or a Workflow timeout,
the days most likely to have changed are already done and the tail is the part that moves least.

**A source with no published window gets no weekly tier at all.** Search Console's window is `null` in
the clocks table, and null means unknown. Inventing a depth here would be indistinguishable from a
sourced one.

## 2. Cost estimate

This unit exists to *produce* the cost estimate, so the numbers are the deliverable. All measured, not
projected:

| | Windows | Workflow steps |
|---|---|---|
| One connected account, four sources | 35 | **105** |
| Forty clients in one instance | 1,400 | **4,200** |
| Naive daily equivalent, one account | 360 | 1,080 |
| Naive daily, forty clients | 14,400 | 43,200 |

Per source, in the steady state: Google Ads at a 90-day account window is 17 windows, Meta 8, GA4 6,
Search Console 4.

**Tiering cuts the request count by roughly 10×** against a naive daily backfill, which is the
difference between fitting inside Meta's per-account cap and being throttled by it.

## 3. Platform-terms check

**Credential.** N/A × 4 — pure arithmetic; no credential, no platform call.

**Tenancy.** PASS × 3 — a plan is per connection. Nothing here can see two workspaces, and the
step-budget function exists specifically to keep one Workflow instance scoped to one account.

**Data movement.** N/A × 3 — no data is fetched or moved.

**Access tier and quota.** PASS × 2, and this is the gate this unit exercises. Meta's cap of 10 async
breakdown jobs per ad account per day is enforced, with the caveat below. Google Ads' per-developer-
token limits are not this module's concern: those are a *cross-tenant* ceiling and belong to the
queue-level governor (`00-repo-map.md` section 5), not to a per-connection plan.

**PII and consent.** N/A × 3. **Claims.** PASS × 3 — no new claim.

## 4. What was left out

- **The extractors themselves.** Each connector's client, normaliser and fixtures are their own units
  (section 13.3). This is the schedule they run on.
- **The Workflow definition.** `stepBudget` says whether a plan fits; the instance that executes it is
  the scheduler's.
- **Quota accounting.** `connections.quota_used_today` exists; incrementing it belongs with the
  extractor that spends it.
- **Cross-tenant governance.** Meta's per-application throttle and Google Ads' per-developer-token cap
  are shared ceilings invisible from inside one plan. Cloudflare Queues, per section 5.
- **Retry and backoff.** Part of the HTTP client, which lands with the first connector.

## 5. Open or unverified spec items this builds on

1. **Meta's rate-limit figures are flagged by the specification itself** as not appearing in the cited
   source (section 3.2, correction 5). So `dailyRequestCap` is an overridable input rather than a
   hard constant: a caller that has measured the real ceiling — from the
   `x-fb-ads-insights-throttle` header — passes what it observed. The default of 10 comes from
   section 9 and is enforced, but nothing depends on it being exactly right.
2. **Google Ads publishes no finalisation statement**, so its window is read per account and passed in
   rather than assumed. A 90-day nightly re-pull may well be over-engineered; the planner makes that
   a one-number change once it is measured.
3. **The seven-day Meta expiry warning** in `packages/connections` and the four-day daily tier here are
   both judgement calls sitting on top of sourced windows, not sourced figures themselves.

## 6. Verification

| | |
|---|---|
| `typecheck` | Clean |
| Tests | **19/19** |

**This unit corrected one of my own earlier documents.** `00-repo-map.md` section 5 warned that a
40-client agency in one Workflow instance would cost 14,400 steps and exceed the 10,000 limit. That
figure assumed a **naive daily backfill** — four sources times ninety days. With tiering the same
coverage costs 35 windows per account rather than 360, so one account is 105 steps and forty clients
are 4,200: comfortably inside. The ceiling is reached at about **95 accounts**, not 28.

The advice is unchanged — one instance per connected account, never per tenant — but it now rests on a
measured number rather than an overstated one. The map has been amended in place with a pointer here,
rather than quietly edited.

**A second correction, this time to a test rather than to code.** The Meta cap test originally
asserted that a plan gets *trimmed* to fit the 10-per-day ceiling. It does not: tiering brings the
28-day window down to 8 windows, so nothing is dropped — which is exactly what the weekly tier is
*for*. The planner was right and the test was wrong. The test now asserts the true property, and the
trim path is exercised directly through `dailyRequestCap` so it is not an untested branch.

Both are the same lesson in different places: a number that was reasoned about rather than measured
was wrong, and only running it showed that.

The suite also pins down that the first run is one bulk window rather than hundreds of daily pulls,
that the daily tier never reaches back before a connection has data, that a never-restated source
gets no weekly tier, that windows come back newest first, and that an unparseable date throws instead
of planning against `NaN`.
