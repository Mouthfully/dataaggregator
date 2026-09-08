# 09. The quota-aware HTTP client

## 1. What this is, and the decision taken

The retrying HTTP client every extractor calls through. A large part of what dropping dlt costs us
(`00-repo-map.md` section 5) — and the part dlt would not have got right anyway, because its generic
retry client understands none of the three quota regimes the specification says drive the design.

**One fact shapes every decision here.** On Google Ads, **rejected requests still count** against the
daily operation limit, and that limit is per **developer token** — shared across every tenant. So a
retry storm on one customer's connection does not merely delay that customer: it spends a ceiling
every other customer is drawing on. Section 8's own open question is whether the margin survives if
"platform limits force 3× to 5× redundant polling per useful row". This is where that is decided.

So retries are few, spaced, and **never attempted at all for a failure retrying cannot fix**:

| Response | Retried? | Why |
|---|---|---|
| 401, 403 | **No** | The grant is bad. Retrying spends shared quota *and* delays the reconnect prompt — the only signal that gets the customer to act. Flows to `recordFailure` and marks the connection `needs_reauth`. |
| 400, 404, 422 | **No** | Our request is wrong. It produces the same error forever. |
| 429 | Yes, on the platform's terms | `Retry-After` overrides our formula outright. |
| 5xx | Yes | Briefly broken. |
| Network failure | Yes | It never reached the platform, so it spent no quota. |

**Jitter is not decoration.** Without it, every connection that failed in the same minute retries in
the same later minute, and a platform incident becomes a self-inflicted thundering herd against a
shared ceiling. Full jitter, and the random source is injected so the delay is testable.

**The body is deliberately not read.** `fetchWithRetry` returns the `Response` unconsumed, because an
extractor must stream it to R2 and return a key rather than materialise rows — a Worker isolate has
128 MB and a Workflow step output is capped at 1 MiB. Reading the body here would make that
impossible for every caller, and a test asserts it stays unread.

**Meta's throttle header is parsed defensively.** The specification names exactly one field,
`ads_api_access_tier`, and explicitly warns that its other rate-limit figures "do not appear in the
cited source". So that field is named and every other field is kept verbatim. Inventing names for the
rest would produce numbers that look measured and are not — and `ads_api_access_tier` earns its place
alone, being the instrumentation that confirms whether a Full Access upgrade actually took effect.

## 2. Cost estimate

**Per connected account per month: this unit's whole purpose is to bound it.** Worst case per window
is 3 attempts; an auth failure costs exactly 1. Against the planner's 35 windows per account, a
steady state with no failures is 35 operations and a bad day is at most 105.

For context, Google Ads Explorer access allows 2,880 operations per day **per developer token, across
all tenants** — so a naive client that retried 401s three times over 40 connections would spend 120
operations producing nothing at all.

## 3. Platform-terms check

**Credential.** PASS × 4 — the client takes a prepared request; it never reads or stores a
credential. Error messages carry the URL and status, never a header or body, so an `Authorization`
header cannot reach a log through this path.

**Access tier and quota.** PASS × 2, the gate this unit exists for. Rejected requests counting against
the ceiling is the premise of the retry policy, not an afterthought. `onRetry` makes every spend
meterable by the caller.

**Tenancy.** N/A × 3 — no tenant data; one request at a time. Cross-tenant governance of a shared
developer-token ceiling belongs to the queue-level governor (section 5), which this cannot see.

**Data movement.** PASS × 3 — the response body is never read here, so nothing can be logged or
aggregated by accident.

**PII and consent.** N/A × 3. **Claims.** PASS × 3 — no new claim.

## 4. What was left out

- **Pagination.** Cursor shapes differ per platform; it belongs with each extractor rather than in a
  generic wrapper that would have to guess.
- **The streaming write to R2.** The client hands back an unread `Response` precisely so the caller
  can stream it; the R2 binding lands with the scheduler.
- **A circuit breaker.** Per-connection retry limits are here; cutting off a platform that is down
  for everyone is cross-tenant state, so it belongs with the queue.
- **Concurrency limiting.** Workers allow 6 simultaneous open connections; enforcing that is the
  caller's, since it spans requests.
- **Idempotency keys.** These are reads. It matters when writes ship, which section 11.4 defers.

## 5. Open or unverified spec items this builds on

1. **Meta's rate-limit figures are flagged by the specification itself** as not appearing in the cited
   source. Only `ads_api_access_tier` is named; everything else is kept verbatim rather than
   interpreted.
2. **"Rejected requests still count" is the premise of the whole design.** It comes from the
   specification's Google Ads access findings. If it turns out to be wrong the policy is merely
   conservative, which is the right way round for an assumption to fail.
3. **Three attempts is a judgement call**, not a sourced figure — chosen because the marginal value of
   a fourth try is low and its cost is paid by other tenants.

## 6. Verification

| | |
|---|---|
| `typecheck` | Clean, and under `@cloudflare/workers-types` via `apps/api-edge` |
| Tests | **45/45** across the package |

**Mutation-checked** on the two properties that carry the cost:

- **Removing the non-retryable early return** — 2 failures: an auth failure and a malformed request
  each start costing three attempts instead of one.
- **Removing the jitter** — caught by the thundering-herd test.

Both reverted.

The suite also pins down that `Retry-After` is honoured in both of its wire forms (seconds and an
HTTP date), that a past date yields zero rather than a negative wait, that nonsense yields `null`
rather than a guess, that even a platform-requested wait is capped, that the error carries its attempt
count and kind for `recordFailure` to act on, and that the response body is never consumed.
