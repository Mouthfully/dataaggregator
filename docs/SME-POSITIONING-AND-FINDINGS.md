# SME positioning and findings

**Date:** 2026-09-08 · **Status:** findings, not decisions

The decisions from this round are in
[`MARKETING-DATA-PLANE.md` section 11A](MARKETING-DATA-PLANE.md). This document holds what
sits underneath them: the competitive landscape, the connector inventory with its
verification status, how attribution works for a business whose customers walk in without
identifying themselves, and the design artefacts the round produced.

**Nothing here is binding.** Where this document and section 11A disagree, section 11A wins.

> **A note on sourcing, before anything else.** The specification's own findings were
> produced by eight research lenses with a fact-checker, and every claim in it carries a
> confidence level. **This document was not produced that way.** The competitive landscape
> in §4 and the connector inventory in §2 come from the product and design work, not from a
> researched sweep. Treat them as a starting map with named gaps, not as evidence.

---

## 1. What changed, and what did not

The product's message moves from **"verified root cause over ad, analytics and search data,
for agencies and brands"** to **"a replacement for a business-intelligence team, for small
businesses — Thailand first, but not Thailand only."**

**What survives unchanged**, and is now the substance rather than the pitch:

- the **correctness guarantee** — the operated promise that a number is right, and says so;
- the **envelope** of section 7 — `fetched_at`, `source_updated_at`, `restates_until`,
  `is_provisional`, the attribution window, the FX rate on the row;
- the **diagnostic engine** of section 4.1 — ranked causes with evidence, what was ruled
  out, and a recovery plan.

The reason to keep them is not sentiment. An owner-run business has **less** ability to
check a number than an agency analyst does, not more. The correctness machinery is what
makes it defensible to give an owner a figure they cannot verify themselves — and it is the
one thing in §4's competitive map that nobody else is building.

**Who the customer is now.** Someone who runs the business themselves: a café, a bar, a
restaurant, a guesthouse, an online seller, a small venue group. No analyst. No IT
function. Probably no spreadsheet beyond takings. They do not want a data plane; they want
to know whether last week was good and what to do about Tuesday.

---

## 2. The SME connector inventory

Recorded by decision 11A.6 as a **later phase**. The first connectors — Google Ads, GA4,
Search Console, Meta, one affiliate network, SERP bought wholesale — are unchanged, and the
kickoff's gate before any fifth connector still stands.

**Every connector below is bring-your-own-credential and read-only.**

**API availability is unverified for every row except where noted.** "Unverified" here means
what it means everywhere else in this repository: nobody has read the terms, checked the
rate limits, or confirmed that a third party can hold a customer's credential at all.

| Category | Sources | Status |
|---|---|---|
| **Point of sale** | FoodStory by Wongnai, Ocha (Shopee), StoreHub, Loyverse, Qashier | Unverified. **FoodStory / Wongnai blocks the category** |
| **Delivery** | GrabFood, LINE MAN, foodpanda | Unverified |
| **Marketplaces** | Shopee, Lazada, TikTok Shop, Shopify (own site) | Unverified. Shopify is the one with a public partner programme |
| **Travel** | Agoda, Booking.com | Unverified |
| **Messaging and CRM** | LINE OA | Unverified. Also the delivery channel (11A.3) |
| **Payments and banking** | Stripe, PromptPay, K PLUS and SCB business accounts | Stripe is well documented. **Thai bank feeds are the largest unverified item in this round** |
| **Accounting** | FlowAccount, PEAK, Xero, QuickBooks | Unverified for the Thai two; Xero and QuickBooks have public APIs |
| **Presence** | Google Business Profile | Unverified in this context, though the API is public |

### 2.1 The two that block their own category

**FoodStory / Wongnai API access.** The point-of-sale connector is where the *after-fees*
number comes from — the gross figure is on the delivery platform, the commission is in the
POS reconciliation. Without a POS connector the headline promise of the dashboard (11A.2)
cannot be computed for a restaurant. And Wongnai is not a neutral party: LINE MAN Wongnai
owns FoodStory and is the closest thing this product has to a strategic competitor (§4).
**Whether they will grant a third party read access is an open commercial question, not a
technical one.**

**Thai bank feeds** (K PLUS, SCB business accounts). Thailand has no open-banking mandate
comparable to PSD2, so there may be no sanctioned API path at all for a third party to read
a business account. The alternatives — screen scraping, statement upload, an aggregator —
have very different cost, legal and reliability profiles, and none has been evaluated.

### 2.2 What every one of these needs before it is built

The eight questions in `docs/marketplane/18-connector-roadmap.md` §9 apply unchanged: access
path and timeline, whose credential, redistribution terms, quota regime, restatement
behaviour, attribution model, entity grain and metric vocabulary, and PII exposure.

**Three of those bite harder here than they did for ad platforms.**

- **Entity grain.** `ENTITY_TYPES` in `@repo/contract` is the `dbt_ad_reporting` hierarchy —
  `account`, `campaign`, `ad_group`, `ad`, `keyword`, `search_term`, `url`, `geo`,
  `property`, `page`, `query`. **A cover, a ticket, an order line and a room night are none
  of them.** This is the same schema gap the order leg already had, one degree worse.
- **Metric vocabulary.** `METRICS` has no `covers`, no `tickets`, no `net_revenue`, no
  `commission`. §13.3 rule 2 requires the dictionary change before a connector emits, and
  `scripts/check-dictionary.mjs` fails the build if the TypeScript and the SQL enum drift.
- **PII.** A POS loyalty record and a reservation carry a name and a phone number. Section
  3.2's hash-at-the-edge rule was written for a write path; here it governs an ingest path,
  and 11A.5's matched class makes it routine.

---

## 3. Attribution and identity for a business people walk into

This is the part of the repositioning with the most engineering consequence, and it is
recorded as a **new specification requirement** in 11A.5.

### 3.1 The problem, stated plainly

A café served 180 covers on Tuesday. It also spent ฿900 on Meta and appeared in 2,400
Google Business Profile searches. **How many of the 180 came from the ฿900?**

For most of them the honest answer is *nobody can know*. They walked in. They did not scan
anything, mention anything, or identify themselves. An ad platform will happily report a
conversion figure anyway, and a dashboard that repeats it has told the owner something
false with a decimal point on it.

### 3.2 Three classes, and why the boundary matters

| Class | Confidence | What it is |
|---|---|---|
| **Observed** | Counted | Source-tagged orders from delivery apps, OTAs, reservations and marketplaces; POS covers and tickets; Google Business Profile actions; ad platform reach and clicks |
| **Matched** | Linked, per person | A promo code or LINE coupon redeemed at the POS; a LINE OA follow from an ad QR; a loyalty phone in the POS; a reservation phone; a platform customer id; an offline-conversion upload |
| **Modelled** | Inferred | Channel contribution for anonymous walk-ins, from correlating daily spend and Business Profile actions against covers while controlling for weekday, weather and holidays; or from geo and time-split lift tests |

The boundary between **matched** and **modelled** is the one that must never blur. A matched
customer is a fact about a person. A modelled contribution is a statistical statement about
a population, and presenting it at per-customer resolution is a fabrication.

### 3.3 Coverage is shown, always

**Return rates are measured only on identified covers**, and the figure must say so:
*"measured on 41% of covers"*.

A 44% return rate measured on 41% of covers is a useful number. The same 44% presented as
though it covered everyone is a wrong number that will survive until someone checks it.

The design system gains a **"how we know"** element — the class label plus the coverage
figure, attached to the number rather than hidden in a footnote. This is the same discipline
as the envelope's `is_provisional`, applied to the question of *who was counted* rather than
*when it was fetched*.

### 3.4 Two hard rules

**Identifiers are hashed at the edge and never stored raw.** Section 3.2 of the
specification, unchanged. A loyalty phone number that reaches persistence in plaintext is a
PDPA problem and a Meta Custom Audience Terms problem simultaneously.

**Do not promise Google store-visit conversions.** They require a volume of ad clicks and
modelled store visits that a single venue does not produce. Google will simply not report
them, and a product that has already promised them has to explain an empty column.

### 3.5 The unmeasured floor

Modelled attribution needs enough daily volume for a correlation to mean anything. **That
threshold has not been measured**, and below it the modelled class is noise wearing a
percentage sign. Open question 11A.9.5.

---

## 4. Competitive landscape

**No Thai company was found doing cross-source, after-fees, answer-first BI for small
businesses.** That is the finding this positioning rests on, and it is the one most worth
attacking — see the sourcing note at the top.

What exists is adjacent, and it clusters.

| Cluster | Who | What they do | Why it is not this |
|---|---|---|---|
| **Integrated stack** | **LINE MAN Wongnai** with **FoodStory** | POS, delivery and CRM in one stack | **The main strategic risk.** They own the demand side, the POS and the messaging channel, and could bundle insights on top at any point |
| POS dashboards | Ocha, StoreHub, Qashier | Reporting on their own POS data | Single-source. They cannot see the ad spend or the delivery commission |
| Loyalty | Buzzebees, ChocoCRM | Loyalty programmes and campaigns | Identity, not measurement |
| Marketplace consolidation | ZORT, Sellsuki, SellerPao | Order consolidation across marketplaces, with reports | Closest on plumbing. Consolidates orders, does not explain them |
| Delivery aggregation | Klikit | Delivery order aggregation | One channel |
| Accounting dashboards | FlowAccount, PEAK, AccRevo | Books, with reporting | Backward-looking and after the fact; no marketing side |
| Enterprise BI | Bluebik, Datawow, Sertis | Consulting and custom BI | Wrong customer, wrong price |
| Regional restaurant BI | Tenzo, Restroworks, Momos | Restaurant analytics for chains | Chains, not owner-run single sites; and restaurants only |

### 4.1 The position

Three claims, in the order they should be defended:

1. **Independent across every channel, including ones LINE MAN competes with.** A venue on
   GrabFood *and* LINE MAN needs a number that neither of them has an interest in shading.
   An integrated stack cannot credibly offer that; it is the structural argument, and it is
   the only one an incumbent cannot copy.
2. **Not restaurants only.** Guesthouses, online sellers, bars, venue groups. The restaurant
   BI cluster is vertical by construction.
3. **Better at the "why" and the action than at order consolidation.** ZORT and Sellsuki
   already consolidate orders and will keep doing it well. Competing there is competing on
   plumbing; the diagnostic engine and the verified action sheet are where the specification
   has spent its effort.

### 4.2 The risk, stated without softening

**LINE MAN Wongnai could bundle this.** They have the POS, the delivery demand, the CRM and
the messaging channel that 11A.3 makes the primary delivery surface. If they ship
good-enough insights inside FoodStory, the addressable market for a Thai restaurant product
shrinks sharply — and they are also the party who has to grant the FoodStory API access
that unblocks the point-of-sale category (§2.1).

That is a single point of failure sitting on both the product and the go-to-market. Claim 1
above is the answer, and claim 2 is the hedge.

---

## 5. Design artefacts, placeholders and drafts

### 5.1 What is in the repository

| Path | What it is |
|---|---|
| `design/marketplane/Main.dc.html` | The **marketing** artboard. `apps/web` is built from it, gated by the claims list |
| `design/app/App.dc.html` | The **product application** design, added this round: dashboard, action sheet, Ask, reports, alerts, settings |

### 5.2 What was expected and what arrived

The update brief describes `design/landing/Main.dc.html`, `Mobile.dc.html` and `canvas.json`
on branch `claude/landing-page-repo-design-oiixbf`.

**None of that was received.** The branch does not exist on the remote — `git ls-remote`
shows only `main` and the build branch. The upload contained a single artboard,
`App.dc.html`, with its support runtime, and it is **the product application, not a landing
page**.

It is committed as `design/app/` because that is what it is. A folder called `landing`
holding an application design would be a false record, and everything downstream of it —
including whichever document says "this is the landing page" — would inherit the error.

**The landing page design is still outstanding.**

### 5.3 Placeholders

The brief lists bracketed placeholders to be sourced from the brand file: `[DATA REGION]`,
`[Owner name]`, `[LEGAL ENTITY]`, `[ADDRESS]`, `[COMPANY NUMBER]`, `[LINE ID]`,
`[Online brand]`, `[City]`.

**None of them appears in the artefact received.** It uses template bindings
(`{{ priv.region }}`) and a fully-realised persona instead — a named owner, a named venue, a
named LINE handle, invented revenue.

The rule the brief intends is right and is already enforced in code: every identity value
comes from `packages/brand`, and the brand guard fails the build on any company-identifying
string outside it. **What is missing is the artefact that needs it.** When the landing design
arrives, its placeholders map onto `brand.legalEntity`, `brand.postalAddress`,
`brand.companyRegistration` and `brand.dataRegion` — the last of which is `null`, which is
why the claims list withholds `data-region`, `gdpr` and `dpa` today.

### 5.4 Drafts awaiting approval

- **Owner quotes for Saphan 55 and BREW** are drafts and are not approved. They do not appear
  in the artefact received; they belong to the landing page. **No customer quote ships
  without the customer's approval in writing.**
- **Founder answers and the investor report carry a "Sample figures" chip** until real data
  exists. The application design's figures — revenue, covers, cohort percentages, the
  ฿41,200/month attributed to actions taken — are all invented. Specification section 14
  already says this of the earlier artboard's numbers; it is true again, and the chip is how
  a reader is told.
- **The connector logo strip must be reconciled with the launch connector list before
  publishing.** The application design names GrabFood, Shopee, LINE MAN, K PLUS, Wongnai,
  Lazada, foodpanda, TikTok Shop, Shopify, Stripe, PromptPay, Kasikorn, Xero and Google
  Business Profile. **Not one of them is a launch connector** (11A.6 leaves the first four
  unchanged), and every one is unverified. Publishing that strip would advertise fourteen
  integrations that do not exist — which is the failure `FORBIDDEN_CLAIMS` was written to
  prevent, in a form the regex does not catch because it counts words, not logos.

### 5.5 The product name

**Still not decided.** The application design carries a working name and a matching MCP
hostname; `packages/brand` holds `productNameSettled: false`, and `allowedClaims()` withholds
the name from every rendered surface.

The brand guard exempts `design/**` and `docs/**` so a mockup can carry a working name and a
document can discuss one. Everywhere else it fails the build — which it has already done
twice, on a cryptographic AAD and a database role name, both places where a rename would
have been expensive.

**Nothing may read a product name out of a design file.** See 11A.10.

---

## 6. Open questions

Recorded, not resolved. Repeated from 11A.9 so this document stands alone.

| # | Question | Blocks |
|---|---|---|
| 1 | API access for FoodStory / Wongnai | The point-of-sale category, and with it the after-fees number for restaurants |
| 2 | Thai bank feed access (K PLUS, SCB) | Payments and banking. Largest unverified item in this round |
| 3 | LINE OA messaging cost at scale | The COGS of 11A.3's primary delivery channel |
| 4 | Whether credit pricing fits an owner-run business, or a flat monthly plan is needed | The pricing page, and 11.3's two-unit decision |
| 5 | The volume threshold below which modelled attribution is meaningless | 11A.5's modelled class |
| 6 | Which two design partners validate the action-sheet verification loop | Appendix C |

**Two more that this document adds**, because they follow from the findings rather than from
the brief:

| # | Question | Why |
|---|---|---|
| 7 | Does the entity hierarchy grow a commerce and hospitality branch, or do covers, tickets and room nights live outside `envelope_rows`? | §2.2. The same schema question the order leg already had, one degree worse |
| 8 | Is the "no Thai company doing this" finding survivable under a real research sweep? | §4. The entire positioning rests on it, and it was not produced the way the specification's findings were |
