# 14. The GA4 backfill arm, and where `first_seen_at` is actually kept

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`sources/ga4/backfill.ts`, which completes the connector unit §13.3 specifies:
`{client, normalize, backfill, fixtures, contract.test}`. It joins three units that already exist —
`planBackfill` (@repo/extract) decides *which* days, `client.ts` fetches them, `normalize.ts` turns
them into envelope rows — and owns the three decisions none of its neighbours can make.

### One: what to ask for

GA4 prices a request by **query complexity** (§7), so every extra dimension is quota spent from a
ceiling the customer's own tools draw on. The default report is the smallest set that answers §4.1's
questions: `date` × `sessions, conversions, totalRevenue`.

`date` is not optional — the normaliser refuses without it and the §7 upsert key is keyed on it.

And **exactly one revenue metric**. `totalRevenue`, `purchaseRevenue` and `eventValue` all mean
`conversions_value`, so asking for two is refused rather than silently collapsed. That refusal was
added in `12-ga4-normaliser.md` precisely so this choice would have to be made in the open, at the
place where the report is defined, and it does its job here: a test asserts the default set contains
exactly one metric mapping to `conversions_value`.

A second test asserts **every** default metric has a dictionary entry. A metric that does not would
be fetched — spending the customer's quota — and only then refused. Catching it at definition time
costs nothing.

### Two: a quota stop ends the plan, not the window

Windows share **one property's** quota, so moving to the next window after a floor stop spends the
same exhausted allowance. The plan stops. What it completed is handed over rather than discarded —
and because `planBackfill` returns windows **newest first**, a run cut short has already done the
days most likely to have changed.

**A quota stop and a failure are not the same event**, and this is the decision the mutation testing
sharpened. A quota stop is *planned degradation*: the pages that arrived are complete and correct,
so they are yielded before the plan ends. Any other error — a page that made no progress, a body
that is not JSON — means GA4 is behaving in a way this connector does not model, and **rows salvaged
from a response we no longer trust are worse than no rows**. They are dropped and the error
propagates untouched.

### Three: `first_seen_at` is not this unit's to guarantee

The envelope requires it immutable per row, and it is the anchor the whole restatement contract
hangs from (`@repo/contract`). **A connector cannot know whether a row already exists** — it has no
store. So every row is emitted with `first_seen_at = fetched_at`, which is correct for a first
sighting and wrong for a re-pull.

**The upsert must preserve the existing value on conflict**, along with `restates_until`, which is
derived from it. Stated here, in the module, and in a test — because pretending otherwise would put
the product's one durable guarantee in the layer least able to keep it. See §4 for what that means
for the store.

One `fetched_at` for the whole run, not one per window, so every row from a run agrees on when it
was pulled. A per-window timestamp would make two rows from the same sweep disagree about their own
freshness.

## 2. Cost estimate

**Per connected account per month: 5 GA4 requests per day, ~150 per month, unchanged from
`13-ga4-client.md`.** This unit adds no request; it decides their content.

It does move one term, in the direction that matters. GA4 charges by complexity, so the request
*shape* is the cost, and the default report is 1 dimension × 3 metrics — the floor for §4.1's
questions rather than a comfortable margin. Widening to the channel × landing-page grain §4.1
ultimately wants would multiply both the token cost and the row count, which is why it is left out
below rather than added quietly.

**On §8's open question** (3×–5× redundant polling collapsing the ~98% margin): the quota-stop rule
is what keeps GA4 at 1.0×. Stopping the plan rather than the window means an exhausted property is
not hammered window after window, and yielding the completed work means the next sweep re-reads only
what was never fetched.

## 3. Platform-terms check

### Credential
**1. BYOC.** `PASS` — the credential is `Ga4ClientOptions.accessToken`, the customer's, supplied per
call. This unit adds no credential path of its own.
**2. Vendor-key exception.** `N/A`. **3. No token pass-through.** `N/A` — no MCP surface.
**4. Credential hygiene.** `PASS` — no logging; errors are re-raised from the client unchanged, and
the client's messages are already tested to exclude the token.

### Tenancy
**5. RLS.** `N/A` — no table. **6. No service-role bypass.** `N/A` — no database access.
**7. No cross-workspace read.** `PASS` — one property per run, credential per run, generator state
local to the call. Nothing is shared between runs, so there is no key a tenant could be missing from.
**8. No cross-customer aggregation.** `PASS` — rows are emitted per window; nothing is combined
across properties, let alone across tenants.
**9. API key scope.** `N/A`.

### Data movement
**10. No resale or redistribution.** `PASS` — rows are yielded to the caller and nowhere else.
**11. Meta client list.** `N/A` — GA4.
**12. Dependency licences.** `PASS` — no new dependency; `@repo/extract` and `@repo/contract` were
already in this package.

### PII and consent
**13. Hash at the edge.** `PASS`, and this unit is where it becomes a real choice rather than a
formality: **it is the file that decides which dimensions are requested**, and the default set is
`date` alone. No `userId`, no `pagePath`, no `landingPage` — nothing that can carry an identifier or
a query string with an email in it. Widening the grain (§4 below) is therefore a PII decision as well
as a cost one, and it will need this gate answered again rather than inherited.
**14. Forbidden payloads.** `N/A` — read path. **15. Per-destination consent.** `N/A` — writes
deferred.

### Access tier and quota
**16. Tier reality.** `PASS` — the minimal report is a quota decision; the quota stop is enforced
plan-wide; the reading is carried through to the caller on every batch as `Ga4BackfillBatch.quota`.
No retry logic is added here, so nothing can storm.
**17. No new long-lead dependency.** `PASS` — no approval, no token, no audit.

### Claims
**18. Claim provenance.** `PASS` — no user-visible string.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 4. What was left out

- **THE UPSERT ITSELF, AND IT IS NOW A NAMED OBLIGATION.** This unit emits
  `first_seen_at = fetched_at` on every row. The store's `ON CONFLICT` must **keep the existing
  `first_seen_at` and `restates_until`**, not overwrite them. If it writes `excluded.first_seen_at`,
  the anchor slides on every re-pull and `is_provisional` never clears — which is exactly the defect
  `@repo/contract`'s restatement note identifies in the specification's own formula, reintroduced one
  layer down. **The `envelope_rows` table does not exist yet; this is the first requirement on it.**
- **The channel × landing-page grain** §4.1 asks for. It is a schema question (which entity type,
  what composite id), a cost question, and per gate 13 a PII question. Three answers, none of them a
  connector change.
- **Google Ads' per-account restatement window.** `restatesUntil` accepts `accountWindowDays`, and
  the "preserve `restates_until` on conflict" rule assumes the window does not change under a row.
  True for GA4's fixed 12 days; **not necessarily true for Google Ads**, whose window is read per
  account and per conversion action. That connector will have to say what happens when it moves.
- **Writing anywhere.** This yields rows. Persisting them is the ingest Worker's job.
- **Parallelism across windows.** Strictly sequential, for the reason `13-ga4-client.md` gives: using
  GA4's 10 concurrent slots needs the cross-tenant governor first.

## 5. Open or unverified spec items this builds on

1. **The default metric set is a judgement about §4.1, not a quotation from it.** §4.1 asks "which
   GA4 channel and landing page lost sessions?"; this ships `date × sessions, conversions,
   totalRevenue`, which answers the *sessions* half at the property grain and none of the channel or
   landing-page half. That is a deliberate first cut, and it is the gap named above.
2. **`totalRevenue` over `purchaseRevenue`** is a choice between two metrics that mean different
   things in GA4 — `purchaseRevenue` counts purchases, `totalRevenue` includes other monetised
   events. `totalRevenue` is the broader and matches `conversions_value`'s meaning in the
   dictionary, but a customer whose definition of revenue is purchases only will read a number they
   disagree with. **Worth making per-connection before this ships**, and it is a settings decision
   rather than a connector one.
3. **The fixtures remain synthetic** (`12-ga4-normaliser.md` §5.1). Unchanged, and now across four
   files.

## 6. Verification

| | |
|---|---|
| `@repo/connectors` tests | **50/50** (20 normaliser, 17 client, 13 backfill) |
| Whole repo | **239 tests**, lint, format, both guards, typecheck, build — green |

One of the backfill tests runs the **real plan** `planBackfill` produces for GA4 rather than a
hand-written window list, so the two units are asserted to fit together rather than each being tested
against its own idea of the other.

**Mutation-checked — ten mutations, ten caught:**

| Mutation | Result |
|---|---|
| Ask for two colliding revenue metrics | caught |
| Drop the `date` dimension | caught |
| Ask for a metric with no dictionary entry | caught |
| Swap the inclusive date-range ends | caught |
| Continue to the next window after a quota stop | caught |
| Discard the partial window instead of yielding it | caught |
| Use a fresh timestamp per window rather than one per run | caught |
| Swallow a non-quota client error | **survived at first** |
| Yield salvaged rows on any error, not only a quota stop | **survived at first** |
| *(after fixes, both re-run)* | caught |

**Both survivors were the same blind spot, and it is worth naming.** Returning instead of throwing
would have ended a backfill quietly and reported a partial pull as a finished one — the precise
failure this connector exists to refuse, sitting in its own error handler. The first test I wrote for
it did not catch the second mutation either, because the failing window had produced **no rows yet**,
so "yield the partial" and "drop the partial" were indistinguishable. The distinction only appears
when a window has already collected rows and *then* fails: one good page, then a page that makes no
progress. That test now exists.

This is the fourth time mutation testing has found something in this repo that reading did not, and
the second time the defect was in a test rather than in the code.
