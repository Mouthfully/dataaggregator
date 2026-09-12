# 48. The field registry: one vocabulary, and the rule that keeps it one

**PR:** every platform field every connector reads, declared in one place, with a guard that makes
a connector unable to invent a column or drop a field in silence.

## 1. What this is, and the decision taken

The product is one place a business owner connects many platforms. **The value of that is not the
number of connectors — it is that the numbers arrive in one vocabulary.** A store where Cloudflare
wrote `cf_requests`, PostHog wrote `ph_events` and Shopify wrote `shopify_orders` has not
integrated anything; it has forwarded five vendors into one table with a shared primary key, and
every question that spans two of them is still the customer's problem.

That decay is never a decision anybody makes. It is a connector author, reasonably, using the words
their platform used, on a Tuesday.

### The order of precedence

1. **Does it already fit?** Map it. GA4 reports conversion value under `totalRevenue`,
   `purchaseRevenue` and `eventValue` depending on which report you asked for. All three are
   `conversions_value`. **Collapsing them is the integration** — it is the thing the customer is
   paying for.
2. **Can it be derived from what fits?** Compute it, or drop it and let the reader compute it.
   `ctr` is `clicks / impressions` and both inputs are stored.
3. **Only then**, does the dictionary genuinely lack the concept? Add it — deliberately, under
   §13.3 rule 2, with the rejection of 1 and 2 written down.

### What was actually wrong

The order above was already being followed, well, by everyone who had touched a connector. GA4's
three-into-one collapse is in the tree today. The problem was that **nothing recorded it**, and in
particular nothing recorded the cases where the answer was *no*:

- Each connector held its own map, and **no two were the same shape.** GA4 and Meta use
  `Record<field, MetricName>`; Google Ads uses `Record<field, {metric, micros}>` because it needs a
  unit transform; WooCommerce holds **no map at all**, because its metrics are computed from an
  order object rather than read from named fields.
- **A field a connector chose not to emit left no trace.** In a normaliser, "we looked and it does
  not fit" and "nobody looked" are the same absence — nothing.

So the registry is not a new discipline. It is the existing one, written down in a form that can be
checked.

### The three dispositions that matter, and why a fourth and fifth exist

`metric` and `derived` are the fits. `dropped` is the one that carries weight, because it **requires
a reason** and the guard fails without one.

`dimension` and `structural` are listed rather than ignored, and that is deliberate: *"this field
is not a metric"* is itself an answer. An **unlisted** field is what the guard is hunting, and it
can only be conspicuous if the mundane ones are present.

### The two Search Console drops, which look identical and are opposites

This pair is the argument for the whole file. In a normaliser both are one line of "read, not
emitted":

| Field | Disposition | Why |
|---|---|---|
| `ctr` | dropped, **settled** | `clicks / impressions`, both stored. Storing the quotient beside its inputs makes one number into two that drift: sum the inputs across a week and divide, and you get a different figure from averaging the stored ratio — with nothing saying which is meant. Computed at read time from columns that cannot disagree. |
| `position` | dropped, **blocked** | Average SERP rank. Nothing in the dictionary is a rank and it cannot be derived from anything that is. This is the one case rule 3 is for. |

`blockedOn` is what separates them, and a test asserts that `ctr` has none and `position` does.

### What `position` reveals, and the next PR

`position` is **not additive.** You cannot sum average positions across days or queries, and you
cannot plainly average them either — re-aggregating Search Console's own figure requires weighting
by impressions.

**Every metric in the dictionary today is implicitly additive**, and nothing says so, because until
now it was universally true. `position` is the first that is not, and it will not be the last:
unique visitors and unique users — the headline numbers for Cloudflare and PostHog — are not
additive across days either.

So adding a `position` column alone would be **wrong**, not merely incomplete: the first thing that
rolls a week up would `SUM` it and produce "average position 4,382" with `ok: true`, which is
precisely the silent-wrong-total this product sells against. The next PR is therefore an
**aggregation semantic in `METRICS`** — every existing metric declared `sum`, `position` declared
impression-weighted — and then the column. The registry records the gap in the meantime, in the one
place somebody adding a rank-like metric will be standing.

### This is also the document

*"Which of my platform's numbers do you actually keep, and what do you call them?"* is the first
question an integrator asks, and today the honest answer requires reading five normalisers in three
shapes. `metricsFor("meta_ads")` answers it in one call, derived rather than written down twice —
which is what makes it safe to publish later rather than a second thing to keep in sync.

## 2. Cost estimate

**฿0.00 per connected account per month.** No platform request, no quota, no row, no R2 object.
The registry is a constant; the guard reads six files on the CI runner in well under 100ms. Nothing
here executes on a request path.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no code path here touches a platform. The registry is a constant and the guard
reads files from disk.

**2. Vendor-key exception.** `N/A` — no company-held vendor key.

**3. No token pass-through.** `N/A` — no OAuth surface, MCP server or request path.

**4. Credential hygiene.** `PASS` — the guard reads source files and prints repo-relative paths and
field names. No environment variable, token or credential is read, and the registry contains
platform **field names**, which are public API documentation.

### Tenancy

**5. RLS.** `N/A` — no table, column or policy changes. Deliberately: the `position` column is the
next PR, not this one.

**6. No service-role bypass.** `N/A` — no database client.

**7. No cross-workspace read.** `N/A` — no query, view or cache key.

**8. No cross-customer aggregation or benchmarking.** `N/A` — nothing aggregates anything. Worth
stating plainly since this PR is *about* aggregation vocabulary: it describes how a single
workspace's own rows may be combined, and names no cross-tenant operation.

**9. API key scope.** `N/A` — no key, budget or tool allow-list.

### Data movement

**10. No resale or redistribution.** `N/A` — no billing unit, response, export or webhook. Note
that the registry makes it *easier* to state what is kept, which is the opposite of redistribution.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path.

**12. Dependency licences.** `PASS` — nothing added, removed or upgraded; `pnpm-lock.yaml`
untouched. The guard is zero-dependency Node ESM, matching the seven beside it. Metric names
continue to follow Fivetran's Apache-2.0 `dbt_ad_reporting`.

### PII and consent

**13. Hash at the edge.** `N/A` — no email, phone, name or address reaches this code.

**14. Forbidden payloads rejected before egress.** `N/A` — no payload, no egress.

**15. Per-destination consent.** `N/A` — no record, no consent object, no destination.

### Access tier and quota

**16. Tier reality.** `N/A` — no source request, no quota consumed.

**17. No new long-lead dependency.** `PASS` — runs on the CI runner with the toolchain already
installed. No platform approval, developer token or audit.

### Claims

**18. Claim provenance.** `PASS` — no user-visible copy changes. Nothing is added to `claims.ts`
and no new source is claimed; `check-copy.mjs`, `check-claim-sources.mjs` and
`check-capabilities.mjs` pass unchanged. **`metricsFor()` is a candidate future claim source** —
"connect WooCommerce, get orders and revenue" would be derived from the tree rather than typed —
but wiring that is a claims change and belongs with the guard that would police it, not here.

**Result:** `4 PASS, 14 N/A, 0 FAIL`

## 4. What was left out

- **The aggregation semantic and the `position` column.** The next PR, for the reason in §1: a
  column without the semantic is actively wrong rather than merely partial. The registry records
  the gap with `blockedOn` so it cannot be quietly forgotten.
- **No claim is derived from `metricsFor()` yet.** See gate 18.
- **The registry does not claim to list every field a platform returns.** That set is the vendor's
  to change and is not knowable from here; asserting a completeness we cannot verify would be worse
  than not asserting it. What is enforced is that every field **the repository touches** has an
  answer.
- **WooCommerce's derived fields are listed by the shape the normaliser reads** (`total`,
  `refunds[].total`, `fee_lines`), not by a formal path grammar. A grammar would be a parser to
  maintain for five entries.
- **No connector was changed.** This PR is entirely additive to the tree — the mutation table below
  is how I know, since two of the mutations had to be *introduced* to prove the guard sees the
  connectors at all.

## 5. Open or unverified spec items this builds on

- **§13.3 rule 2** ("a new metric requires a dictionary change first, not a silent addition") is
  what the precedence order operationalises. The rule existed; the mechanism to check it did not.
- **Whether `position` should be impression-weighted or simple-mean on re-aggregation** is stated
  here as impression-weighted, matching what Search Console itself reports. That is the next PR's
  to settle against the API documentation rather than this one's to assume.

## 6. Verification

On a clean checkout of `main` with a real `pnpm install --frozen-lockfile`.

- [x] `pnpm -r test` — **785 tests** across 12 workspaces (`@repo/contract` **50 → 61**)
- [x] `pnpm -r typecheck` — clean
- [x] `pnpm exec biome lint .` / `biome format .` — clean
- [x] **All eight guards pass**
- [x] No-deletions check against `origin/main` — empty

### The evidence that matters: the guard sees both directions

A guard that parses nothing passes. So before mutating it, I instrumented it to print what it had
actually read — all five connectors and all 28 registry fields — and only then broke things:

| # | Mutation | Result |
|---|---|---|
| R1 | a connector maps `video_thruplay_watched_actions`, which the registry does not list | **FAIL** — *"a tree that has outrun it answers nothing"* |
| R2 | the registry maps a field to `cf_requests`, which is not in `METRICS` | **FAIL** — *"a connector may not invent a column"* |
| R3 | `ctr` dropped with no reason | **FAIL** |
| R4 | `woocommerce.total` derived with no formula | **FAIL** |

R1 and R2 are the two halves of the rule this PR is for: **R2 stops a new column being invented,
R1 stops the tree drifting away from the registry that says so.** Each mutation was reverted
byte-identically, and R1 was re-run after the parser was rewritten to satisfy the linter — a
refactor that quietly disarms a guard is worse than never writing it.
