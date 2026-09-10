# 30. Thai public data: what exists, what is callable, and what is a document

**PR:** #5 &nbsp;·&nbsp; **Date:** 2026-09-10 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

A survey of Thai public data sources as candidate inputs to the data plane, prompted by the
founder asking what is available and whether we could "add them all".

**The decision taken: sort by evidence of an access contract, not by agency or by usefulness.**
An agency-shaped list flatters itself — every ministry publishes *something*, so every row looks
like a candidate. Sorting by whether a request shape could be confirmed produces a list that is
mostly disappointing and entirely actionable, and it answers the question that was actually
asked. **Four of the most useful sources here have no API at all.**

| | |
|---|---|
| Confirmed endpoint — callable today | **5** |
| Data is real, access contract unverified | **6** |
| No official API — published as documents | **4** |
| Named but not investigated | **7** |

**The alternative rejected** was a per-agency inventory with a "usefulness" score. It would have
ranked the electricity tariff — a PDF announcement three times a year — above the Ministry of
Commerce price API, because the tariff is more obviously relevant to a café's costs. Usefulness
without an access contract is a wish.

**Nothing in this note is built.** No connector, no `SOURCES` entry, no schema. It is a register.

## 2. Cost estimate

**Per connected account per month:** `฿0.00` — no data-plane work in this diff.

The register creates no rows, no re-pulls, no Workers invocations, no R2 objects, no KV writes
and no Supabase disk. It touches nothing the restatement ladder or the polling ratio depends on.

**The cost it *describes* is worth stating, because it is unusual: every source below is free at
the point of use.** None charges per call. The real cost of adopting any of them is
**a design note and a terms read**, plus the standing obligation the stack rule creates — see §3.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no platform call exists in this diff, and none of the sources surveyed is a
platform under §11.2. Public-agency data is not tenant data and carries no per-workspace
credential.

**2. Vendor-key exception.** `PASS`, and this is the gate that governs the whole note. Every
source here is **public data**, which is the one permitted single-key surface (11.2), alongside
DataForSEO SERP and the AI-answer providers. A company-held key to the Bank of Thailand is the
same shape as a company-held DataForSEO key. **No platform data is involved, so the exception
applies cleanly rather than by argument.**

**3. No token pass-through.** `N/A` — no MCP or OAuth surface is touched.

**4. Credential hygiene.** `PASS` — no credential is added. Two of these sources require
registration (BOT, data.go.th); when either is adopted the key belongs in the connection vault
like any other, and this note does not create one.

### Tenancy

**5. RLS.** `N/A` — no table or migration.

**6. No service-role bypass.** `N/A` — no request path.

**7. No cross-workspace read.** `N/A` today, and **a live risk at adoption time.** Public-data
rows are not tenant-scoped by nature: one FX rate for one date serves every workspace. That is a
legitimate shared cache and it is also exactly the shape §15 forbids for platform data. When a
source is adopted, the rule to hold is that **public-data rows may be shared; any join that
combines them with tenant rows is workspace-scoped.**

**8. No cross-customer aggregation or benchmarking.** `PASS`, and worth stating rather than
marking N/A. A public-data source is the most plausible route by which a benchmarking feature
gets built by accident — "the average café in your district" reads as public statistics and is
built from tenant rows. Nothing here permits that. Meta 3.a.iv and Google's redistribution
clause are unchanged.

**9. API key scope.** `N/A` — no key path.

### Data movement

**10. No resale or redistribution.** `PASS` — nothing moves, and no billing unit changes. Note
for adoption: several of these sources carry their own redistribution terms, which are *ours* to
respect and have nothing to do with the platform terms.

**11. Meta client list.** `N/A` in this diff — but see the DBD row in §4. DBD is the
authoritative source for the Thai half of the 5.b.ii.2 client record, which we currently satisfy
by hand.

**12. Dependency licences.** `PASS` — no dependency added. The geography data discussed below
would be **vendored files**, and their licence must be read before they are committed.

### PII and consent

**13. Hash at the edge.** `PASS` — no source here returns contact data for a natural person. DBD
returns a *juristic person's* registered office address, which is a public commercial record, not
personal data under PDPA. **If a sole proprietor's registration ever returns a personal address,
it is contact data and §3.2 applies.** Flagged now because the distinction will not be obvious
at implementation time.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress.

**15. Per-destination consent.** `N/A` — writes remain deferred (11.4).

### Access tier and quota

**16. Tier reality.** `PASS` for the one documented limit found: `data.go.th` allows **1,000
requests per hour per IP**, which a nightly job cannot approach. Every other rate limit here is
unknown, which is part of why six sources sit in the unverified tier.

**17. No new long-lead dependency.** `PASS` — nothing in this diff depends on an approval. Two
sources require registration (BOT, data.go.th), neither of which is an approval gate with a
review queue. No source here has anything resembling Meta Full Access or a TikTok audit.

### Claims

**18. Claim provenance.** `PASS` — no user-visible claim changes. Note for adoption: **naming a
government source on the marketing site is a claim.** "Rates from the Bank of Thailand" belongs
in `packages/brand/src/claims.ts` with a citation like anything else, and is subject to issue
[#6](https://github.com/Mouthfully/dataaggregator/issues/6) — a claim about a source we have not
wired is exactly the defect that issue inventories.

**Result:** `8 PASS, 10 N/A, 0 FAIL`

## 4. The register

### Tier A — confirmed endpoint, callable today

| Source | Access | Returns | Why it matters here |
|---|---|---|---|
| **Bank of Thailand** | `portal.api.bot.or.th`, registration required | FX reference rates, policy and interest rates, debt-securities auctions, payment-system statistics, tourism indicators (`EC_EI_028_S2`) | **Corrects a shipped defect.** `FX_SOURCE` in `packages/fx/src/fx.ts` is `ecb_reference_rates` — a European central bank pricing a Thailand-first product. BOT is the rate a Thai auditor and the Revenue Department recognise, and `fx-on-row` promises the source on the row. |
| **Ministry of Commerce** | `dataapi.moc.go.th`, no key observed | Domestic wholesale and retail commodity prices; international trade. `/gis-products` for the code, then `/gis-product-price?product_id=…&from_date=…&to_date=…` | **The only source surveyed that touches cost.** Pork, chicken, eggs, oil, rice — the input side of the P&L that "profit after fees" currently cannot see. |
| **DBD** | `openapi.dbd.go.th/api/v1/juristic_person/{id}`; DataWarehouse+ for financials | Registration number, status, type, registered capital, Thai and English name, registered office, registration date, business objectives | **Meta client list (5.b.ii.2).** Authoritative source for the Thai legal-entity record we hold by hand. Also fills a workspace from a 13-digit number instead of a form. |
| **data.go.th** | `opend.data.go.th/register_api`, key required, 1,000 req/hour per IP | CKAN-style cross-agency catalogue | A discovery surface, not a runtime dependency. The agencies above publish better versions of their own data directly. |
| **Administrative geography** | Static JSON on GitHub; `api.openthailand.org` for reverse geocode | 77 provinces, 928 districts, 7,436 subdistricts, Thai and English, with postcodes and coordinates | **Vendor it, do not call it.** Appendix D needs a tenancy level below `workspace` — the venue — which needs canonical district codes. Static files carry no vendor and no uptime. `api.openthailand.org` is a private party, not an agency. |

**One live gotcha.** The old BOT host `apiportal.bot.or.th` was scheduled for discontinuation on
**31 December 2025**. Any documentation found referencing it is stale.

### Tier B — the data is real, the contract is unread

Each demonstrably publishes what we want; for none could an access contract be confirmed.

| Source | Returns | Why it matters here |
|---|---|---|
| **TMD** (`data.tmd.go.th/api/index1.php`) | Forecasts and station observations | §4.1 ranks causes *and names what it ruled out*. "40 mm fell between 18:00 and 21:00, and your ads were fine" beats anything derived from ad platforms alone. |
| **Air4Thai** (Pollution Control Dept.) | PM2.5, PM10, O₃, NO₂, CO, SO₂ by station; hourly at some, daily at all. Thai reference points are 37.5 µg/m³ over 24 h and 15 µg/m³ annual — **not** the US EPA AQI | **The strongest non-obvious signal found.** Chiang Mai's burning season empties terraces January–April. Honest input for §11A.5: an *observed* covariate, not a modelled one. |
| **GISTDA hotspots** | Five-satellite constellation, up to ten passes a day, coordinates within ~2 h, reported to subdistrict level; season December–May | The upstream explanation for the Air4Thai number. If GISTDA has no callable feed, **NASA FIRMS covers Thailand with a real keyed API**. |
| **Thai FDA (อย.)** | Registration status for food, drugs, cosmetics, medical devices, hazardous goods | An อย. number is a listing gate on Shopee and Lazada. A lapsed registration is **a revenue cliff with no advertising explanation** — aimed squarely at the online-seller beachhead of 11A.14. |
| **Ministry of Tourism & Sports** | Visitor arrivals by nationality; provincial figures revised between publications | A bad November in Phuket is usually arrivals, not ads. **Reachable through BOT**, so it costs no additional vendor — which is why it is here and not its own integration. |
| **Revenue Department** | VAT registration lookup; e-Tax Invoice & e-Receipt (XML, digital certificate, monthly submission, ETDA-certified providers) | Context for the open **FlowAccount** question. FlowAccount sits on this rail, so this tells us what any Thai accounting connector can see. |

### Tier C — no official API

| Source | How it is published | What to do instead |
|---|---|---|
| **Electricity tariff (ERC)** | Ft fuel-adjustment charge set **three times a year** in four-month periods. May–Aug 2026 averages ฿3.95/kWh including Ft ฿0.1623 before 7% VAT; SME ฿4.18; TOU off-peak ฿3.80, on-peak ฿5.27 | Three changes a year is a **hand-maintained table**, not an integration. MEA covers Bangkok, Nonthaburi and Samut Prakan; PEA the other 74 provinces and 22.06 M customers — but the tariff is national, so the venue's province does not change the rate. |
| **Holiday calendars** | BOT announces financial-institution holidays; the cabinet announces public ones. Neither as an API | **Financial-institution holidays decide when a marketplace payout lands**, and they differ from public holidays. A small table plus a watch on the announcement. |
| **Customs Department** | HS codes are 11 digits, first 8 the ASEAN AHTN code. Record-level trade data only via commercial resellers | **A purchase, not an integration.** Needs its own case if landed cost ever matters. |
| **National Statistical Office** | PDF and CSV files, plus a dashboard | Market sizing. Nothing operational — no file download on a request path. |

### Tier D — named, not investigated

Excise Department (alcohol licensing); Social Security Office (employer headcount, the closest
public proxy for a venue's real size); Thailand Post (address normalisation, if the vendored
geography proves insufficient); ETDA (annual e-commerce value survey); Royal Gazette
(ราชกิจจานุเบกษา — where a regulation changing a customer's obligations is published first);
Department of Land Transport; BOI (relevant to us as a company, not to the product).

Listed so the register says where it stops. Calling them candidates would overstate what is known.

## 5. What was left out

- **No source was adopted, and no `SOURCES` entry was added.** Adding one means a connector, a
  redaction keep-list and a design note, per the standing rule from `25-payload-redaction.md`.
  A register that quietly became an integration would be the scope-widening the brief forbids.
- **The BOT FX swap was not made**, though it is the clearest correctness case here.
  `FX_SOURCE = "ecb_reference_rates"` is a defect with a named fix and it is **its own PR** — it
  changes an envelope field, and §7's `fx_source` is part of the contract.
- **No terms were read.** This note records that six sources need a terms read; it does not
  perform one. Saying a source "looks open" would be the public-data version of the mistake
  11A.14's standing rule warns against.
- **Non-government sources were excluded**, including NASA FIRMS, which is named only as the
  practical substitute for GISTDA. The question asked was about Thai public data.
- **Nothing was said about LINE.** The LINE Official Account Insight API is a commercial platform
  API under 11A.3, not public data, and belongs with the connector roadmap.

## 6. Open or unverified spec items this builds on

**Two, and both are named rather than assumed away.**

- **Appendix D's tenancy level below `workspace` does not exist.** The geography row is only
  useful once it does; `19-sme-repositioning.md` §4 already records that this is unbuilt. If the
  venue level is never added, vendored district codes are dead weight.
- **11A.14's launch connector set is a decision, not a validated bet.** The Thai FDA row assumes
  the online-seller beachhead. If the first design partners turn out to be walk-in venues, the
  FDA row drops in priority and the weather/air-quality trio rises.

**And one standing rule, restated because this note is exactly where it gets broken.** 11A.14
records: *a competitor's connector catalogue is a menu, not evidence of access.* The public-data
form is the same shape — **an endpoint that returns 200 is not a licence to use what it
returns.** Every source here is derived from its own terms, never from the fact that it responded.

**A closing constraint that outranks the whole register: none of this substitutes for platform
data.** These are context sources. They explain a number; they do not produce one. Revenue still
comes from Shopee, Lazada, Meta, Google and the point of sale, all bring-your-own-credential.

## 7. Verification

| | |
|---|---|
| Lint, format | pass |
| Typecheck, test, build | pass, unchanged — **397 unit tests** |
| Brand guard | pass |
| Tokens guard | pass |
| Dictionary guard | pass — no dictionary change |

No test covers a document, and none should. The checks confirm a documentation change did not
disturb the code.

**Survey date 10 September 2026.** "Unverified" means the access contract was not found on that
date, not that it does not exist. Every figure quoted — tariffs, station thresholds, record
counts, dataset codes, rate limits — comes from the cited source rather than from estimation.
