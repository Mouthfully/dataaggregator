# 12. The GA4 normaliser, and one word added to the dictionary

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The first half of the first connector: `sources/ga4/{normalize, fixtures, contract.test}`, the shape
§13.3 specifies. GA4 is first because it is the only MVP source that needs **no developer token and
no access-tier approval** — per `10-credential-model.md`, Google Ads is blocked behind a token
application and Meta behind an access review, and neither exists yet. GA4 needs only a customer's
OAuth grant, which `06-oauth-connect.md` already issues.

**The decision: refuse, everywhere, rather than coerce.** Every ambiguity in a GA4 response throws
instead of producing a row. That is not defensiveness for its own sake — it follows from the one
thing the product sells. A connector that coerces a bad value to zero, or defaults a missing
currency, emits a number that is *wrong and says nothing about it*, and "verified root cause" over
quietly-wrong numbers is worse than no product.

The rejected alternative was the ordinary one: skip the bad row and carry on. It produces a total
that is quietly too low, which is the exact failure mode §1 describes competitors having.

### The four GA4 traps, each of which yields plausible wrong numbers rather than an error

| Trap | What goes wrong silently |
|---|---|
| Metric values are **strings** — `"1284"`, not `1284` | `"1284" + "1102"` is `"12841102"`. A sum concatenates |
| Dates are **`YYYYMMDD`** | `Date.parse("20260814")` is not the date you meant |
| Currency and timezone arrive in **`metadata`**, not the request | A default labels a JPY property's revenue as EUR |
| GA4 has **no selectable attribution window** | A `null` here makes the envelope refuse the row — correctly for an unlabelled conversion count, wrongly for this one |

The fourth is why `@repo/contract` carries a `model` member: a label for *what the platform actually
did*, not an absence, and specifically not "unknown".

### Two refusals not in the spec, both found by mutation testing

**A canonical-metric collision.** `GA4_METRIC_MAP` is many-to-one — `totalRevenue`,
`purchaseRevenue` and `eventValue` all mean `conversions_value`. A report requesting two of them
writes both into one key and the second silently wins. The row then reports a number *nothing in the
response supports*. Refused.

**`is_provisional` is derived, not asserted.** It was hard-coded `true`. Replacing it with
`isProvisional(restates_until, fetched_at)` — the contract's own rule — immediately failed the
module's own fixture, and the fixture was right: `fetched_at` is 2026-09-08, the 12-day window closed
2026-08-26, and every row was claiming it might still change **thirteen days after it could not**.
A hard-coded `true` passes the schema and lies to the customer.

### One dictionary change: `sessions`

§13.3 rule 2 requires a dictionary change *before* a connector emits a new metric, rather than a
silent rename. `sessions` was added to `@repo/contract`.

The reason it was missing: the dictionary comes from Fivetran's `dbt_ad_reporting`, which is
**ad-centric and has no analytics grain at all**. But §4.1's diagnostic tree asks, verbatim, *"Which
GA4 channel and landing page lost sessions?"* — a question a GA4 connector cannot answer with a
dictionary that has no word for it. The alternative was mapping `sessions` onto an existing name,
which is the silent rename rule 2 exists to forbid.

`@repo/contract`'s 25 tests still pass unchanged.

## 2. Cost estimate

**Per connected account per month: `$0.00` in marginal infrastructure.** This unit is pure
computation over a response another unit fetches — no network, no storage, no new dependency.

It does move one term in the model, in the right direction. GA4's quota is **40,000 tokens per
property per hour, shared with the customer's other tools** (§16 gate), and the §8 open question is
whether platform limits force 3×–5× redundant polling. A normaliser that throws on an ambiguous
response does *not* cause a re-pull: `record_backfill(succeeded: false)` releases the lease without
advancing `last_backfill_at` (`11-scheduler-entry-point.md`), so the retry is the next daily sweep,
not an immediate second read of the same window. A connector that instead guessed and emitted a bad
row would need a *corrective* re-pull once someone noticed — which is redundant polling with a
human-latency detection loop attached.

## 3. Platform-terms check

### Credential
**1. BYOC.** `PASS` — no credential in this unit at all; it takes a parsed response as an argument.
**2. Vendor-key exception.** `N/A` — no key.
**3. No token pass-through.** `N/A` — no MCP or OAuth surface.
**4. Credential hygiene.** `PASS` — the fixtures are synthetic and carry no token, cookie or account
identifier; `raw` holds the platform's row verbatim, which for a `runReport` response is dimension
and metric values only.

### Tenancy
**5. RLS.** `N/A` — no table.
**6. No service-role bypass.** `N/A` — no database access.
**7. No cross-workspace read.** `PASS` — the function normalises one property's report and holds no
state between calls; there is nothing spanning two workspaces to leak.
**8. No cross-customer aggregation.** `PASS` — no aggregation of any kind. Every output row is
derived from exactly one input row.
**9. API key scope.** `N/A`.

### Data movement
**10. No resale or redistribution.** `PASS` — nothing leaves the process.
**11. Meta client list.** `N/A` — GA4.
**12. Dependency licences.** `PASS` — one workspace dependency, `@repo/contract`. No third-party
package added.

### PII and consent
**13. Hash at the edge.** `PASS`, and worth stating rather than waving through: GA4 reports *can*
carry PII-adjacent dimensions, and this unit persists nothing and logs nothing. Error messages quote
the **metric name and the offending value** — `"(not set)"`, a malformed number — never a dimension
value, so a `userId` or a landing-page URL with an email in a query string cannot reach a log
through a thrown error.
**14. Forbidden payloads.** `PASS` — no payload construction.
**15. Per-destination consent.** `N/A` — read path; writes are deferred past MVP.

### Access tier and quota
**16. Tier reality.** `PASS` — GA4's 40,000 tokens/property/hour is a limit on the *client*, which
is the next unit; this one issues no request. It does not retry, so it cannot retry-storm.
**17. No new long-lead dependency.** `PASS` — **this is the point of building GA4 first.** No
developer token, no access review, no audit. The only gate is Google OAuth verification, which
`06-oauth-connect.md` already records and which does not block development.

### Claims
**18. Claim provenance.** `PASS` — no user-visible string. And one claim is deliberately *not*
enabled by this unit: Google's own wording is that GA4 attribution "can change for up to 12 days"
followed by *"This is not a guarantee, nor an SLA or an SLO."* The 12-day window is implemented as a
window; it must never be sold as a guarantee.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 4. What was left out

- **`client.ts`.** The half that talks to `analyticsdata.googleapis.com`, using `fetchWithRetry` and
  the GA4 quota headers from `09-quota-aware-http.md`. Deliberately separate: normalisation is
  testable without a credential, transport is not.
- **`backfill.ts`.** The GA4 arm of the tiered ladder. `planBackfill` in `@repo/extract` already
  produces the windows; wiring is the client's PR.
- **Dimensions beyond `date`.** §4.1 wants channel and landing page. The envelope's `entity` carries
  one entity per row, so a channel × landing-page grain is a *schema* question — which entity type,
  what composite id — and not one to settle inside a normaliser.
- **`sessions` on any other source.** Added to the dictionary, emitted only by GA4.
- **FX conversion.** `fx_*` are null because GA4 has not converted anything. `@repo/fx` fills them
  when the row is converted to the workspace currency; asserting a conversion here would assert one
  that never happened.
- **`source_updated_at`.** Null. GA4 publishes no per-row freshness timestamp, and copying
  `fetched_at` would assert a freshness the platform never reported.

## 5. Open or unverified spec items this builds on

1. **THE FIXTURES ARE SYNTHETIC, AND §13.3 RULE 6 REQUIRES RECORDED ONES.** The rule is verbatim:
   *"every fixture is a recorded real response with PII scrubbed."* These are not. They are written
   from the documented `runReport` shape, because no GA4 credential exists yet.

   The difference is not cosmetic. **A synthetic fixture encodes what I believe the API returns; a
   recorded one encodes what it actually returns** — and every trap above is a case where those two
   diverged for somebody. I wrote both sides of this test, so it cannot find a trap I did not already
   know about. This is stated in the fixture file itself, at the top, with instructions to replace
   every fixture from a real property and re-run before the connector ships. If the recorded shape
   differs, the normaliser is wrong and the fixture is right.

   Not a blocker for merging a normaliser; **a blocker for shipping the connector.**

2. **The 12-day window is Google's own hedge**, quoted in `@repo/contract`'s restatement clocks with
   the disclaimer attached. Unchanged here.

3. **`entity.type: "property"` with `account_id === entity_id`.** GA4's report is property-wide, so
   the property is both the account and the entity. That makes the §7 upsert key well-formed but
   degenerate, and it will need revisiting when a sub-property grain lands (left out, above).

## 6. Verification

| | |
|---|---|
| `@repo/connectors` typecheck | clean |
| `@repo/connectors` tests | **20/20** |
| `@repo/contract` tests after the dictionary change | **25/25**, unchanged |

**Mutation-checked — ten mutations, ten caught.** Each breaks one property deliberately:

| Mutation | Result |
|---|---|
| Coerce a bad metric value to zero | caught |
| Pass `YYYYMMDD` through unchanged | caught (11 tests) |
| Default the currency to `EUR` | caught **only after a fixture fix** — see below |
| Default the timezone to `UTC` | caught **only after a fixture fix** |
| Drop the positional shape check | caught |
| Anchor restatement on `fetched_at` (the spec's own defective formula) | caught (2 tests) |
| Drop the canonical-metric collision check | caught |
| Hard-code `is_provisional: true` | caught |
| Emit a `null` attribution window | caught (3 tests) — by the envelope's refusal, not by a local assertion |
| Pass an unmapped metric through | caught |

**Two of those survived the first run, and the reason is worth recording.** The `NO_METADATA`
fixture omits the *whole* metadata object, so a default on **one** field is still caught by the
other throwing — the test passed without testing the thing it named. Two fixtures now isolate one
field each (`NO_CURRENCY`, `NO_TIMEZONE`). This is the second time in this repo that a green suite
turned out to be asserting something adjacent to what it claimed, and both times mutation testing
found it and reading did not.
