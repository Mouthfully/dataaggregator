# 49. `position`, and the dictionary learning that not everything is a sum

**PR:** an `aggregation` semantic on every metric, `position` as the first metric that is not a
sum, and the dictionary guard taught to fold migrations and to check all four of the hand-written
metric lists instead of two.

## 1. What this is, and the decision taken

Note 48 left `position` recorded in the field registry as `dropped` with a `blockedOn`. This closes
it — and the reason it took a whole PR rather than a column is the interesting part.

### The column was never the hard bit

Search Console returns `position` on every row and the connector has read and discarded it since it
shipped. Adding a column is four lines. What made it wrong to ship that way:

**`position` is not additive.** Positions across two days do not add to a position. And they do not
plainly *average* either — Search Console's own figure is weighted by impressions, so a query seen
40,000 times at rank 3 and one seen 12 times at rank 30 must not count equally:

| | |
|---|---|
| simple mean | **16.5** |
| impression-weighted | **3.008** |

Both are printable. Both look like a rank. One is right.

**Every other metric in the dictionary is additive, and nothing said so**, because until now it was
universally true. So the first thing to roll a week up would have reached for `SUM` — correct for
eleven metrics and catastrophic for the twelfth, reporting *"average position 4,382"* with
`ok: true`. That is the silent-wrong-total this product sells against, introduced by the product.

### So `aggregation` is a required field, not a default

```ts
position: {
  unit: "rank",
  conversion: false,
  aggregation: { kind: "weighted_mean", weight: "impressions" },
}
```

Every existing metric declares `{ kind: "sum" }` explicitly. Making it required rather than
defaulted means **adding a metric now means answering the question**, which is the whole mechanism:
`unique_visitors` and `unique_users` — the headline numbers for Cloudflare and PostHog, both
non-additive across days — will hit it the day somebody writes them.

`weight` is a metric name and not a free number, so a weighted mean is reproducible from columns
stored on the same row. A test asserts every weight names a real metric **and that the weight is
itself additive** — weighting by something unsummable is the same error one level down, since the
denominator is a sum of the weights.

### `combineMetric`, because a declaration nobody calls is a comment

```ts
combineMetric("position", rows)   // impression-weighted
combineMetric("clicks", rows)     // summed
```

`sum` goes through it too, so the correct call is also the easy one. Three edge cases are decisions
rather than defaults:

- **Nothing measured returns `null`, not `0`.** Zero is a measurement — *"spend was nothing"*. A
  period with no rows has measured nothing, and collapsing the two turns an outage into a flat line.
- **A row with a value but no weight contributes neither.** Counting it would silently fall back to
  an unweighted mean *for that row*.
- **Zero total weight returns `null`.** Not `NaN`, and emphatically not `0` — which would be the
  *best possible rank* for a query nobody saw, the most misleading number available.

### Named `position`, not `avg_position`

The stored value is the **platform's** figure for that row, not an average this system computed.
How rows combine is what `aggregation` says, in a place a test can check; putting it in the column
name would duplicate the fact somewhere nothing can.

`position` is a `col_name` keyword in PostgreSQL, so this was verified rather than assumed — it
works unquoted as a column name, in `is distinct from`, and as a plpgsql parameter. It does **not**
work bare inside an aggregate: `max(position)` parses as `POSITION(x IN y)` and is a syntax error.
The test suite found that, which is recorded in §6 because the keyword check I ran first did not
cover it.

### The guard had to grow up, twice

**It was reading one migration.** `check-dictionary.mjs` carried a tripwire that failed the build
the moment another migration touched the dictionary, with an error saying *"teach it to fold later
migrations in before merging"*. This is that moment. Folding is two rules, and getting them the
wrong way round is silent in both directions:

| Shape | Rule | Why |
|---|---|---|
| columns, enum members | **accumulate** | additive; a later `add column` contributes |
| constraints, triggers, function bodies | **last wins** | redefined *whole*; reading the first definition checks a body that is no longer installed |

A `drop column` on a metric is refused outright rather than folded into "still present" — removals
are a change this guard cannot reason about, and saying so is better than absorbing one.

**It was checking two of four lists.** SQL cannot ask `METRICS` anything, so the metric set is
written out by hand in four places. The migration's own comment called it *"the third hand-written
metric list"*, undercounting by one — a fair indication of how easy they are to lose track of:

| # | List | Failure if a metric is missing |
|---|---|---|
| 1 | the fx constraint | a converted amount stored with no rate to reproduce it |
| 2 | the trigger `when` | the trigger never wakes; no restatement announced |
| 3 | **`app.record_restatement`** | trigger fires, function builds an empty diff and declines — **update lands, no event recorded** |
| 4 | **the upsert `SET` clause** | a re-pull never updates it; the value **freezes at the first fetch**, forever, with every later fetch reporting success |

3 and 4 were unchecked. Both are silent. Both now fail the build.

## 2. Cost estimate

**฿0.00 per connected account per month.** `position` rides on rows Search Console already returns
and this connector already fetches — no extra request, no extra quota, no extra R2 object. One
`numeric(20,6)` column on rows that already exist. `combineMetric` runs at read time on rows already
in memory.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — unchanged. Search Console is read on the customer's own OAuth grant; this
reads one more field from a response already being fetched.

**2. Vendor-key exception.** `N/A` — no company-held vendor key.

**3. No token pass-through.** `N/A` — no OAuth surface or request path changes.

**4. Credential hygiene.** `PASS` — no credential is read, logged or written. The upsert's grants
are *narrowed* back to `app_ingest` after the drop; see gate 6.

### Tenancy

**5. RLS.** `PASS` — one column added to an existing table. No policy changes, and
`01_rls_isolation.sql` passes from all seven principals.

**6. No service-role bypass.** `PASS`, **and this gate caught a real regression I introduced.**
Adding a parameter to `app.upsert_envelope_row` required a `drop` (a `create or replace` with new
argument types makes an *overload*, which is issue #19's defect one schema over). **A dropped
function takes its ACL with it, and PostgreSQL's built-in default grants `EXECUTE` on a new
function to `PUBLIC`** — so the recreated function was briefly callable by every role, writing
envelope rows directly and bypassing row-level security. `03_envelope_store.sql` failed three
assertions immediately (*"POLICY BYPASS: affected 1 row(s)"*). The revoke and grant are restored,
and `09_position.sql` now pins the ACL directly so the next signature change is told which property
broke rather than inferring it.

**7. No cross-workspace read.** `N/A` — no query or cache key.

**8. No cross-customer aggregation or benchmarking.** `PASS` — `combineMetric` combines rows handed
to it and has no query of its own. Everything reaching it comes from one workspace's own rows.

**9. API key scope.** `N/A` — no key or budget.

### Data movement

**10. No resale or redistribution.** `N/A` — no billing unit, response, export or webhook changes.

**11. Meta client list.** `N/A` — no Meta path touched.

**12. Dependency licences.** `PASS` — nothing added or upgraded; `pnpm-lock.yaml` untouched.
`position` is **not** from `dbt_ad_reporting`, which is ad-centric and has no rank grain; it is an
addition under §13.3 rule 2, recorded as such.

### PII and consent

**13. Hash at the edge.** `N/A` — a rank carries no personal data. Search Console's anonymity
threshold is Google's own protection and `totalsByDate` still refuses to total thresholded rows.

**14. Forbidden payloads rejected before egress.** `N/A`.

**15. Per-destination consent.** `N/A`.

### Access tier and quota

**16. Tier reality.** `PASS` — `position` is on the standard Search Analytics response at every
tier. No extra call.

**17. No new long-lead dependency.** `PASS` — no approval, token or audit.

### Claims

**18. Claim provenance.** `PASS` — no user-visible copy changes. What the PR *enables* is a claim
worth being careful about: position is what separates "we ranked worse" from "the SERP changed
around us", and §4.1's diagnostic tree can now evidence two branches it could only guess between.
Saying so in marketing is a claims change and belongs with the guard that would police it.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **`ctr` still does not ship, and this PR strengthens rather than weakens that.** It is
  `clicks / impressions` with both inputs stored; the quotient would be a second source of truth.
  A reader who needs it computes it from columns that cannot disagree. A decision, not a deferral —
  and the registry now records which of the two Search Console drops is which.
- **`totalsByDate` does not carry position**, deliberately. It *sums*, which is right for clicks
  and impressions and catastrophic for a rank. A test asserts the absence rather than trusting it.
- **No read path aggregates anything yet**, so `combineMetric` has no caller in the request path.
  That is the point of shipping it *with* the column rather than after: the first caller finds a
  correct function already there.
- **`unique_visitors` and `unique_users` are not added.** They are the next non-additive metrics
  and they belong with the connectors that report them. The semantic that makes them expressible is
  here.
- **No backfill of `position` for existing rows.** There are none — `envelope_rows` is empty on the
  live project. Had there been, a re-pull would fill it, since the upsert now carries the column.

## 5. Open or unverified spec items this builds on

- **Impression-weighting is stated to match Search Console's own re-aggregation.** That is what
  Google documents for its property-level figure. It has not been verified against a live property
  by differencing query-grain rows against the date-grain total — the fixtures are synthetic. Worth
  doing when a real property is connected; the shape of the answer would not change, only the
  confidence.
- **§13.3 rule 2** is the authority for `position` being an addition rather than a mapping, and the
  field registry is where the rejection of rules 1 and 2 is recorded.

## 6. Verification

On a clean checkout of `main` with a real `pnpm install --frozen-lockfile`, plus a PostgreSQL 16
run of the full database suite.

- [x] `pnpm -r test` — **803 tests** (`@repo/contract` 61 → **75**, `@repo/connectors` 319 → **323**)
- [x] `pnpm -r typecheck` — clean
- [x] `pnpm exec biome lint .` / `biome format .` — clean
- [x] **All eight guards pass**
- [x] `./supabase/tests/run-local.sh` — nine suites, **307 assertions**, 0 failures, including the
      new `09_position.sql` at 14
- [x] No-deletions check against `origin/main` — empty

### Every new check fires on a real defect

| # | Mutation | Caught by | Result |
|---|---|---|---|
| D1 | `position` removed from the trigger `when` | `check-dictionary.mjs` | **FAIL** |
| D2 | `position` removed from `app.record_restatement` *(previously unchecked)* | `check-dictionary.mjs` | **FAIL** |
| D3 | `position` removed from the upsert `SET` *(previously unchecked)* | `check-dictionary.mjs` | **FAIL** |
| D4 | a currency metric absent from the fx constraint | `check-dictionary.mjs` | **FAIL** |
| D5 | a later migration `drop column`s a metric | `check-dictionary.mjs` | **FAIL** |
| D6 | a metric entry whose `unit` cannot be read | `check-dictionary.mjs` | **FAIL** |
| S1 | `position` removed from `record_restatement` | `09_position.sql` **at runtime** | **FAIL** — *"recorded 0 event(s)"* |

D2 and S1 are the same defect caught statically and at runtime, which is the point of having both:
the guard says the list is short, the suite proves a customer would not have been told.

### Three things found while writing this, all by a mechanism

None of these were found by reading, which is the argument for the mechanisms.

1. **The guard was not checking `position` at all, and reported PASS.** `tsMetricUnits` parsed
   metrics with a regex requiring the whole entry **on one line**. `position` is the first metric
   whose entry needed a comment and a multi-line body, so it matched nothing and was absent from
   the list driving all four SQL checks. **D1, D2 and D3 were each caught by nothing** on the first
   run — three mutations, three silent passes. The parser is now brace-matched, an entry whose
   `unit` cannot be read is *reported rather than skipped*, and a new check asserts the two metric
   parsers agree with each other, because their disagreement was the whole failure.
2. **The `drop`/recreate silently handed the ingest function to `PUBLIC`.** See gate 6. Caught by
   `03_envelope_store.sql` on the first run after the drop was added.
3. **`max(position)` is a syntax error.** The keyword check I ran before choosing the name covered a
   bare select, `is distinct from` and a plpgsql parameter — not an aggregate call, where `position`
   parses as `POSITION(x IN y)`. The suite's own `v_reached` sentinel reported the verdicts void;
   it now also *captures the error*, which turned a second failure (`max(jsonb)` does not exist)
   from an afternoon into a line of output.

I also wrote `app.record_restatement` from memory when recreating it and **got it wrong in four
places** — the dollar-quote tag, a missing `v_after`, the `jsonb_strip_nulls` build, and the entire
`restatement_events` column list. It would have failed on apply. The version in the migration is
the original, extracted programmatically, with exactly two lines added; a diff against the source
is in the commit history rather than my recollection.
