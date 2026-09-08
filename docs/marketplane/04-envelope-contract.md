# 04. The envelope contract

## 1. What this is, and the decision taken

`packages/contract` — kickoff non-negotiable 5, "the envelope is the contract", as types plus a
runtime validator. Every connector emits through it, every read returns it, and the API cannot
serialise a row that violates it.

**It is a runtime validator, not only a type.** Specification section 2 says the API "refuses to emit
an unlabelled conversion count". A TypeScript type refuses nothing at runtime; it vanishes at build.
So the refusal is a zod schema, and `zod` is the one dependency added — justified because this is the
contract boundary itself, and it runs in workerd.

### Reconciling four envelopes that disagree

The specification prints four shapes and they do not agree (`00-repo-map.md` section 4). Section 2
defers to section 7 for the field specification, and the kickoff requires "the envelope in section 2
and section 7", so **section 7 owns the row and section 2 owns the wrapper.**

| Conflict | Resolved to | Why |
|---|---|---|
| Four freshness fields, or one `freshness` object | **Flat, four fields** | Section 7 line 762 refutes the object in terms. Section 13.3 still prints it, and a phase 0 reviewer proposed re-grouping them; a test now says no. |
| `is_final` or `is_provisional` | **`is_provisional` only** | Both appear across the document. Emitting a flag *and* its complement is how the two drift apart. |
| `conversion_value` or `conversions_value` | **`conversions_value`** | Two printed envelopes and the upstream Fivetran package, against one prose list. `revenue` stays a separate entry meaning order-source revenue, never an alias. |
| GA4 restates for 72 hours or 12 days | **12 days** | 72h conflates processing latency with the attribution window. |
| One row or many | **`data[]` wrapper** | Neither section defines a multi-row form, which every real read returns. |

### Five fields the specification requires and never prints

`account_id` and `entity_id` are named in section 7's upsert key and appear in no printed envelope —
without them a caller cannot reproduce a row's identity. `timezone` is sold as a guarantee in
sections 3.1 and 4.4, and used in the head-to-head against Supermetrics and Windsor, with no field
anywhere to carry it; without it that comparison is false advertising. `fx_rate` and `fx_base` exist
because section 13.3 requires "the rate ... recorded on the row" while sections 2 and 7 record only
its source and date — and a source and a date cannot reproduce a conversion when ECB publishes on
business days only and the carry-forward rule is unspecified. `first_seen_at` is the immutable
restatement anchor, below.

### The specification's restatement formula is defective, and is not implemented

Section 7's clocks table gives `restates_until = fetched_at + Nd`. **That anchors to a mutable
value.** The same section mandates a materialised store with nightly restatement-aware re-pulls, so
`fetched_at` is rewritten every night and `restates_until` slides another N days forward with it. No
row ever becomes final, `is_provisional` never clears, and the one guarantee the product sells never
comes true. The specification's own two examples disagree with the table and with each other, and one
applies Meta's 28-day rule to a `google_ads` row.

Implemented instead: `restates_until = max(date, first_seen_at) + window`, where `first_seen_at` is
written once on insert and never updated. `max()` because a backfill can first see a row long after
the day it describes, and the platform's clock cannot start before the row exists to be restated.

`restatesUntil()` **does not take `fetched_at` as a parameter at all**, which is the structural form
of the fix: the sliding bug is not merely avoided, it is unrepresentable.

Where a platform publishes no window — Search Console, the affiliate networks — the function returns
`null`, and `null` is treated as *still open*. Asserting a finality we cannot demonstrate is the exact
failure this envelope exists to prevent.

## 2. Cost estimate

**Per connected account per month: zero.** Types and a validator; no scheduled work, no platform
calls, no storage.

The one line it will drive: zod validation runs per row at the edge, inside a 128 MB isolate with 5
minutes of CPU per invocation. Validating a 50,000-row response row-by-row is a real cost. The
mitigation is already in the architecture — extractors stream to R2 and return a key rather than rows
(`00-repo-map.md` section 5), so the edge validates a page, not a dataset. Worth measuring against
the first connector rather than guessing now.

## 3. Platform-terms check

**Credential.** N/A × 4 — no credential is read, stored or transmitted; no platform is called.

**Tenancy.** N/A × 3 — no database access. The envelope carries `account_id` as an opaque platform
identifier, not a tenant key; tenancy is enforced by RLS on the tables that store these rows.

**Data movement.** PASS × 3 — nothing leaves the repository. No cross-customer aggregation is
expressible: the envelope describes one row from one account.

**PII and consent.** PASS × 3 — the metric dictionary is six numeric aggregates. No contact data, no
identifier that could carry one, and `metricsSchema` is `strict()`, so a connector cannot smuggle an
extra field into `metrics`. `raw` is the passthrough the specification requires and is deliberately
unvalidated — it must be scrubbed of PII at the connector, which is that unit's gate, not this one's.

**Access tier and quota.** N/A × 2.

**Claims.** PASS × 3 — this package makes several claims *true* that the brand file already allows:
`freshness-fields`, `attribution-required` and `fx-on-row` in `packages/brand/src/claims.ts` now
describe behaviour that exists.

## 4. What was left out

- **The restatement webhook payload.** `revised_from` belongs there, not on a read row
  (`00-repo-map.md` section 4). It ships with the webhook.
- **The `as_of` bitemporal read.** The wrapper carries the field; the query path that honours it is
  the canonical store's job.
- **Currency conversion itself.** The envelope records `fx_rate`, `fx_source` and `fx_rate_date`;
  fetching ECB rates is the data plane's work. Note ECB covers 32 pairs, not 42 — the fact-check
  correction in section 7 — so a paid fallback is wider than the specification assumed.
- **Entity-graph edges.** `parent_id` exists; resolution across modules (section 4.2) is later.
- **Per-source row builders.** Each connector maps its platform's shape onto this one, and its
  contract test is where that is checked.

## 5. Open or unverified spec items this builds on

1. **Meta's 28-day clock: delivery or first report?** Unresolved in Meta's own documentation, per
   both the specification's researcher and its fact-checker. `first_seen_at` implements the
   first-report reading, which both favoured. **Settle empirically**: diff a historical pull against a
   re-pull thirty days later. If delivery is right, the anchor changes and stored rows need
   recomputing — cheap now, expensive after a year of data.
2. **Google Ads publishes no freshness or finalisation statement.** Three attempts found none, so the
   30-day default and 90-day cap are an upper bound, not a documented SLA. `perAccount: true` records
   that the real value is read per account rather than hard-coded.
3. **GA4's 12 days is explicitly not a guarantee.** Google's own words: "This is not a guarantee, nor
   an SLA or an SLO." Recorded in the clock's `note` so it can never be sold as one.
4. **Search Console and the affiliate networks have no published window.** `null`, not a guess — an
   invented number would be indistinguishable from a sourced one.

## 6. Verification

| | |
|---|---|
| `pnpm --filter @repo/contract typecheck` | Clean, under both the DOM lib and `@cloudflare/workers-types` |
| Tests | **25/25** |

**The tests were mutation-checked**, because a suite that passes first time on the code it was
written against proves little:

- **Deleting the refusal** — 3 failures, naming exactly the unlabelled-conversion cases.
- **Re-anchoring `restates_until` on `Date.now()`**, which is the specification's own defective
  formula — 5 failures, including "is unchanged by a re-pull" and "eventually clears
  `is_provisional`".

Both mutations were reverted and the suite returns to 25/25.

What the suite pins down, beyond the two headline properties: a conversion metric cannot be emitted
without a window while an impressions-only row may leave it null; `account_default` and `model` are
accepted as *labels* for platforms with no selectable window, which is why there is no "unknown"
member to fall back on; a metric name absent from the dictionary is rejected, enforcing section 13.3's
rule that a new metric needs a dictionary change first; and the upsert key is built exactly as section
7 states it.
