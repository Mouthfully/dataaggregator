# 21. The Thai connector shortlist, and what the bank portals actually publish

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed — **documentation only, no code**

---

## 1. What this is, and the decision taken

`18-connector-roadmap.md` §5 lists Thailand's connectors and then says, in §7, that **every row in
that table is unverified** — market claims and API claims alike, drawn from my own knowledge rather
than from anything read. It tells the reader not to build on §5 until the recon in §9 is done.

This note is that recon, done for one slice: **local Thai companies whose API a merchant could
connect to today.** The method was reading the vendors' own documentation, not recalling it.

**The decision taken.** Four Thai sources — **Opn Payments (Omise)**, **Beam Checkout**, **ZORT**
and **FlowAccount** — are recorded as the **verified shortlist**: the SME connectors whose access
model is known to fit non-negotiable 4, ranked by remaining engineering rather than by guesswork.
Spec §11A.12 carries the binding version.

**The alternative rejected** was ranking on market share. Share is what §5 already ranked on, and it
put the four largest platforms — LINE, Shopee, Lazada, TikTok Shop — at the top of a list whose
first four entries all require someone else's permission. Ranking on *verified access* produces a
different order and a shorter one, and it is the only ordering that can be acted on this quarter.

**Numbered 21. `20-marketing-site.md` is still owed** and is still reserved, as `19` recorded.

## 2. The three tests, and why the ease test and the terms test are the same test

A source qualifies if all three hold:

1. **The merchant issues the credential to themselves.** No partner approval, no app review, no
   account manager.
2. **Public REST documentation with read endpoints that list history** — not only `create`.
3. **Rows carry a date and a money amount**, so they can become envelope rows once the dictionary
   grows the vocabulary (§7).

Test 1 is worth being precise about, because it looks like a convenience heuristic and is not.
**It is kickoff non-negotiable 4 and platform-terms gate 1**, which forbid a company-held platform
token on a tenant request path. A source that can only be reached with a partner key shared across
tenants is not "harder"; it is **disqualified in its current form** (`18-connector-roadmap.md`
§9.2). So this shortlist is not "the easy ones first". It is *the ones that are permissible at all*,
sorted by what is left to build.

That equivalence is the useful finding of this round: on the Thai leg, the cheapest sources and the
compliant sources turn out to be the same set, which is not true of the international ad leg.

## 3. What was verified

Read from the vendors' own documentation on 2026-09-08. Every claim below is sourced in §12.

| Source | Thai? | Auth | Who issues the credential | Reads |
|---|---|---|---|---|
| **Opn Payments (Omise)** | Founded 2013 in Bangkok, still headquartered there; also SG, MY, JP, US | HTTP Basic — the key is the username, password blank | **Merchant, self-serve** from the dashboard. Test keys are distinguished by the string `_test_` | Charges, transfers, transactions. Public / secret / chain keys are separate |
| **Beam Checkout** | Thai | HTTP Basic — merchant ID + API key | **Merchant, self-serve**: *"self-managed through your account in Lighthouse under the Developers section."* Playground and production keys are separate and explicitly **cannot** be interchanged | Charges API, Transactions API, webhooks with documented event types and webhook authentication |
| **ZORT (Zortout)** | Thai | `storename` + `apikey` + `apisecret` headers, v4 at `open-api.zortout.com/v4` | **Merchant, self-serve**: Settings → Integration → Add Integration → ZORT Connect | Orders, products, stock |
| **FlowAccount** | Thai | ⚠️ **not stated on the pages read** | ⚠️ **not stated on the pages read** | Income, expenses, tax invoices, purchase orders, contacts. Sandbox and production hosts; the OpenAPI spec and a generated TypeScript SDK are published on GitHub |

**Opn is the closest thing Thailand has to Stripe**, and its API is close enough in shape that the
normaliser is recognisably the same work.

**ZORT is the structurally interesting one.** It is an order-and-stock hub that already mirrors
Shopee, Lazada, TikTok Shop and LINE for the merchant who uses it. One connector, no marketplace
approval, several channels — which is exactly the cold-start problem §3.3 of the roadmap describes,
solved from the side. It also creates a problem of its own; see §6.

**FlowAccount is ranked fourth and not higher for one missing sentence.** The portal, the changelog,
the sandbox, the published spec and the SDK are all real and public. Whether a developer can
self-register a client, or must ask, is stated on neither the tutorial nor the API-reference page.
**Test 1 is therefore unproven for FlowAccount**, and it stays below ZORT until an email to
`developer_support@flowaccount.com` settles it. It is a question, not a doubt: nothing observed
suggests the answer is "no".

### 3.1 Second rank — Thai, documented, but a shape mismatch

- **PEAK Account.** RESTful, with a free three-month UAT environment. Auth is Client Token + User
  Token + timestamp + signature — bespoke rather than OAuth or Basic, so it is a day of work rather
  than an hour. Credential issuance model likewise unstated.
- **Flash Express.** Genuinely open documentation (`open-docs.flashexpress.com`) with Order, Notify
  and Webhook APIs and sample code in four languages. But it is a **carrier**: it reports parcels
  and freight cost, not revenue. It feeds the *cost* side of the after-fees number of §11A.2, which
  makes it useful and not urgent.
- **Shippop.** API key plus published Postman documentation; same shape as Flash, aggregated across
  carriers.
- **MyCloudFulfillment.** Advertises API access to marketplaces and webstores on its integrations
  page; no public API reference found.

## 4. The negative results, which are the more valuable half

### 4.1 The banks do not publish what §11A.9.2 needs

All three major Thai banks run live developer portals. What they publish is the finding:

| Bank | Portal | Products published |
|---|---|---|
| **Kasikornbank (KBank / K PLUS)** | `apiportal.kasikornbank.com` | QR Payment, Inward Remittance, Information Sharing Service via K PLUS, Slip Verification |
| **Siam Commercial Bank** | `developer.scb` | Loans, payments and QR payments, customer profile sharing, authentication |
| **Bangkok Bank** | `developer.bangkokbank.com` | Portal and sign-up exist; the landing page does not enumerate products |

**None of them publishes a business-account transaction feed.** That changes the status of open
question 11A.9.2 in a way worth recording precisely: it is not unresearched, and it is not "we could
not find the portal". The portals are easy to find and the product **is not on them**. What remains
open is whether a bank would provide one under a commercial agreement — a different question, with a
different owner and a different timescale.

**One narrow finding worth keeping.** KBank's **Slip Verification** is the only sanctioned way to
confirm a PromptPay transfer, and PromptPay itself — as `18` already recorded in a different context
— is a scheme, not an API. But it is a *verification* endpoint: you can check a slip you were handed,
you cannot enumerate yesterday's receipts. It does not solve the payments leg. It solves
reconciliation of a claimed payment, which is a real product problem and a different one.

The practical consequence is that **Opn and Beam are the payments leg for now.** Money that arrives
through a gateway is visible; money that arrives as a bare PromptPay transfer into a bank account is
not, and no amount of engineering on our side changes that.

### 4.2 The point-of-sale category is still commercial

- **FoodStory / LINE MAN Wongnai.** The acquisition is confirmed — LMWN acquired FoodStory in 2023.
  API access for restaurants running their own systems is described by third parties, but there is
  **no public developer portal and no published reference**. Open question 11A.9.1 stands, unchanged
  and still commercial. This remains the connector that unlocks the after-fees number for
  restaurants, and it cannot be planned from public information.
- **Ocha** is published by UNICORN (THAILAND) COMPANY LIMITED. No public API found.

### 4.3 Loyalty and CRM: documented, but not self-serve

**Buzzebees** publishes real documentation at `docs.buzzebees.com` — a Campaign API, and a History
API covering point-earning activity and transaction history. What is **not** public is how a
developer obtains a token or whether an enterprise agreement is required, and Buzzebees positions
itself as an enterprise loyalty platform. **ChocoCRM**: nothing public found.

This matters more than it looks, because 11A.5's **matched** measurement class is largely fed by
loyalty identifiers. If the loyalty platforms are enterprise-gated, the matched class for a small
venue rests on what the POS itself carries — which is §4.2 again.

### 4.4 Five where absence of documentation is not absence of an API

**Ketshopweb, LnwShop, Page365, Shipnity, Sellsuki** — no public API documentation found for any of
them. Four of the five are named in `18-connector-roadmap.md` §5's middleware row. The honest finding
is narrow: **none of them can be planned from public information.** Any of them may have an API
behind a login or a conversation, and a founder in Bangkok can establish in a phone call what a
documentation search cannot.

## 5. What this revises in note 18, and what it does not

**Revised.** §5 ranks middleware (`Zortout, Page365, Ketshopweb, LnwShop`) and payments
(`Omise/Opn, 2C2P`) last, *"only when a design partner names one."* That rule was a proxy for
uncertainty: nothing in §5 was verified, so the safe ordering was to wait for a customer to point.
**For four sources the uncertainty is now resolved, and the proxy should not outlive it.** Verified
self-serve access removes the single largest cost term in §10 — the long-lead approval and its
calendar risk — so it moves a source up the list. ZORT is the strongest of the middleware four, not
the least; Opn is a first-rank candidate, not a fallback.

**Not revised.**

- **The gate.** Tiered restatement backfill and the restatement webhook still come before any fifth
  connector. Verified access changes the ordering *within* the queue, never the queue's position.
- **§7's warning, for everything else.** LINE, Shopee, Lazada and TikTok Shop are still unverified
  here. I did not read their terms this round either, and nothing in this note should be read as
  upgrading them.
- **The design-partner rule itself**, for unverified sources. It was the right rule for a list nobody
  had checked.

## 6. The provenance problem ZORT creates

ZORT is the only source in the shortlist that reports **other platforms' data**. An order that
originated on Shopee and arrives through ZORT is second-hand, and three things follow.

1. **`source` must be `zort`.** 11A.4 makes provenance visible on every figure. A row labelled
   `shopee` that never touched Shopee's API is a false statement rendered in the UI, and it is
   exactly the class of error the envelope exists to prevent.
2. **`source_updated_at` is ZORT's, not Shopee's.** The freshness a customer sees is the freshness of
   the mirror. Whether ZORT itself restates — and on what clock — is unknown, which under the
   contract's own rule means `restates_until` is `null`, not a guess.
3. **Fee and commission granularity is likely lower second-hand than first-hand.** After-fees is the
   whole product (11A.2). A mirrored order that carries a gross total but not the marketplace's
   commission breakdown produces the *right shape* of number and the wrong number, which is worse
   than no number.

There is also a terms question that belongs in the recon and not in this note's conclusions.
**Our side is clean**: the merchant's own ZORT account, read with the merchant's own key, is
bring-your-own-credential. But the marketplace data inside ZORT reached it under an agreement
between the merchant, ZORT and the marketplace, to which we are not party. Gate 10 asks whether
platform data moves outside the originating workspace; it does not, here. What is unestablished is
whether the marketplaces' terms constrain onward reading of a mirror. **One line in the recon before
it is built, not after.**

## 7. What still blocks all four, and it is not access

**The dictionary.** Verified in `packages/contract/src` this round:

- `ENTITY_TYPES` — `account`, `campaign`, `ad_group`, `ad`, `keyword`, `search_term`, `url`, `geo`,
  `property`, `page`, `query`. **There is no `order`.**
- `METRICS` — `spend`, `impressions`, `clicks`, `sessions`, `conversions`, `conversions_value`,
  `revenue`. **There is a `revenue`, and it is gross.** There is no `orders` count, no `net_revenue`,
  no `fees` and no `commission`.
- `SOURCES` — ten entries, all ad, analytics, affiliate or bought data. None of the four.

`scripts/check-dictionary.mjs` compares these against the SQL enums including order, so **this is a
guard-enforced two-file change**: TypeScript and the migration move together or the build fails. That
is the design working. It is one change, made once, after which each of these four becomes a
GA4-shaped unit — `client + normalize + backfill + fixtures + contract.test`.

**And the gate.** The ordering is fortunate rather than inconvenient: **payments restate hard.** A
refund or a chargeback rewrites last month's net revenue weeks after the fact, which is precisely
what `restates_until` and `is_provisional` exist for. Both Opn and Beam publish webhooks. So the
restatement webhook — half the gate, and currently unbuilt — gets a real first customer instead of a
synthetic one, and building it first is the right order even ignoring the gate.

## 8. Cost estimate

**Per connected account per month: $0.00. This note adds no code, no dependency and no
infrastructure.**

The forward cost is worth stating, because it differs from `18-connector-roadmap.md` §10 in one term
and one term only.

| Term | This shortlist |
|---|---|
| `client + normalize + backfill + fixtures + contract.test` | Unchanged — one GA4-sized unit each |
| Dictionary change | **One-time**, shared across all four, guard-enforced across two files |
| Platform-terms recon | Unchanged, and still the expensive unparallelisable part — except that §3 has now done the access half for four sources |
| **Long-lead approval and its calendar risk** | **Zero for three of the four, and unproven for FlowAccount.** This is the entire difference |
| Quota and restatement surface | Unchanged, and unknown for all four — a recon item, not a cost estimate |

One economy worth naming: **Opn and Beam are the same shape** — HTTP Basic, a charge object, a
transactions list, webhooks. The second is materially cheaper than the first. Nothing else in the
Thai leg has that property.

## 9. Platform-terms check

Documentation only; no code path exists to violate a gate. The gates that this *plan* stresses are
answered on the plan, and the rest are `N/A` because nothing was built.

**1. BYOC.** `PASS` — the shortlist's first test is this gate. Every source here issues the
credential to the merchant; anything requiring a shared partner key was excluded rather than ranked,
which is why 2C2P and the LINE MAN Wongnai path do not appear in §3.

**2. Vendor-key exception.** `N/A` — no company-held key is proposed. These are not public-data
sources and the exception would not apply if one were.

**8. No cross-customer aggregation.** `PASS`, and restated deliberately. A payments connector makes
the temptation concrete — *"how do my card fees compare?"* is one sentence away from a peer set, and
11A.8 exists because the founder-question surface makes that drift easy. There is no peer set.

**10. No resale or redistribution.** `N/A` — nothing built, nothing moves. **The ZORT second-hand
question of §6 is recorded as required recon**, and is the reason this gate is `N/A` rather than
`PASS`: it cannot be answered from what was read.

**13. Hash at the edge.** `N/A` — and **this is the sharpest forward risk in the note.** An Opn or
Beam charge can carry cardholder name and email; a ZORT order carries buyer name, phone and address.
`18-connector-roadmap.md` §9.8 already warns that the hash-at-the-edge rule was written for a *write*
path, not an order feed. These four make it concrete: **the API returns personal data whether the
product wants it or not**, and `17-payload-store.md` keeps `raw` in R2. **`raw` for these sources
cannot be stored as returned.** Settle it before the first of them is built, not during.

**16. Tier reality.** `N/A` — **no rate limit is published for any of the four**, and none was
observed. This is an unknown, not a pass.

**17. No new long-lead dependency.** `PASS` — the defining property of the shortlist. Three are
verified self-serve; FlowAccount is unproven and is ranked accordingly.

**18. Claim provenance.** `PASS` — nothing user-visible ships here, and to be explicit: **none of
these four may appear in the marketing site's claims list or in a logo strip until it is built.**
`19-sme-repositioning.md` §3 records the fourteen-logo problem in the application design; adding four
more that also do not exist would be the same failure with better sourcing.

Gates 3–7, 9, 11, 12, 14, 15: `N/A` — no code, no schema, no credential path, no dependency, no
consent object, no egress.

**Result:** `4 PASS, 14 N/A, 0 FAIL`

## 10. What was left out

- **No connector was built, and no dictionary change was made.** Both are named in §7; neither
  belongs in a documentation pass. Widening here is the thing the kickoff forbids.
- **No issue was opened per source.** `18-connector-roadmap.md` §9 defines the eight-question recon
  each connector needs. This note answers questions 1 and 2 for four sources; questions 3 to 8 —
  redistribution terms, quota regime, restatement behaviour, attribution model, entity grain, PII
  exposure — are untouched.
- **`docs/SME-POSITIONING-AND-FINDINGS.md` was not updated.** Its §2 says API availability is
  unverified for every row except where noted; four rows now have notes, and reconciling that
  document is a separate pass rather than a silent edit inside this one.
- **2C2P was not assessed.** It is in `18` §5's payments row and is Thai-founded; it was not read
  this round and nothing here should be taken as a judgement on it.
- **LINE was not assessed as a data source.** It is not a Thai company, and 11A.3 already decides it
  as a *delivery* channel rather than a source. Whether the Official Account exposes readable
  engagement data is a separate question that this note does not open.
- **No market claim was verified.** Whether Thai SMEs actually use these four is a founder's
  question. This note establishes that their APIs are reachable, not that anyone is on them.

## 11. Open or unverified items this builds on

- **FlowAccount's access model** (§3). If it comes back "approval required", FlowAccount leaves the
  shortlist and the set is three; nothing else changes.
- **Restatement behaviour, all four.** Refunds and chargebacks say the data restates; no published
  window says the contract must record `null`. If any of them publishes one later, `restates_until`
  gets a real clock — which is an improvement, not a rework.
- **Quota regimes, all four.** Unknown. The GA4 unit's quota-aware client exists precisely because
  this is never benign.
- **PII in the returned payload** (§9, gate 13). If the answer is that `raw` cannot be stored for
  these sources, the payload store gains a redaction path it does not have.
- **The ZORT onward-reading question** (§6).
- **`18-connector-roadmap.md` §7's standing warning** still governs every Thai source not verified
  here, which is most of them.

## 12. Verification

**Sources read on 2026-09-08.** Opn/Omise authentication and API docs (`docs.omise.co`), Opn company
profile; Beam introduction and authentication (`docs.beamcheckout.com`); ZORT API v4
(`developers.zortout.com`) and the key-generation steps (`zortout.com/en/docs/zort-api`); FlowAccount
developer portal (`developers.flowaccount.com`) and `github.com/flowaccount/open-api`; PEAK
(`developers.peakaccount.com`); Flash Express (`open-docs.flashexpress.com`); Shippop
(`shippop.com/en/for-developers`); KBank (`apiportal.kasikornbank.com`); SCB (`developer.scb`);
Bangkok Bank (`developer.bangkokbank.com`); Buzzebees (`docs.buzzebees.com`); LMWN's FoodStory
acquisition announcement; MyCloudFulfillment's integrations page.

**Repository gates.**

| | |
|---|---|
| Lint, format | pass |
| Brand guard | pass — `docs/**` is exempt |
| Tokens guard | pass |
| Dictionary guard | pass — no dictionary change was made, which is §7's whole point |
| Typecheck, test, build | pass, unchanged: **318 unit tests** |
| Database suite | unchanged: **108 assertions** |

No test covers a document. What the gates confirm is that a documentation change did not disturb the
code — and, for the dictionary guard specifically, that the vocabulary gap in §7 is still open rather
than half-closed by an edit nobody noticed.
