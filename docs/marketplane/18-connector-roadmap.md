# 18. The connector roadmap, and why Thailand reorders it

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed — **a roadmap, not a scope change**

---

## 1. What this is, and what it does not change

A founder question: *what should the full connector list be for SMEs internationally, and especially
for Thailand, given the company is Thai and can reach Thai businesses directly?*

**Nothing here is decided, and nothing here may be built yet.** Two standing constraints bound it:

- **§11.9 and §0 decided the scope**: four connectors plus bought SERP. The kickoff is explicit that
  where §11 records a decision, that decision stands.
- **The kickoff gates any fifth connector** behind the tiered restatement backfill *and* the
  restatement webhook. Correctness over coverage. Neither is finished — `08-backfill-planner.md`
  plans windows, but no webhook has been built.

So this is a document for choosing what to build *after* that gate clears, and for recording what
must be established *before* any of it is built. It widens no PR. Each connector below is an issue,
not a branch.

## 2. Four legs, not one list

§4.1's diagnostic tree — *"which GA4 channel and landing page lost sessions?"* — cannot be answered
by ad platforms alone. A connector belongs to one of four legs, and a customer needs coverage across
them before `/v1/diagnose` and `/v1/reconcile` work properly:

| Leg | Answers | In scope today |
|---|---|---|
| **Ad sources** | what was spent, and what the platform claims it caused | Google Ads, Meta |
| **Analytics sources** | what visitors actually did, as the browser reported it | GA4 |
| **Delivery sources** (CDN) | what the server actually served, before any blocker or banner | **nothing** |
| **Order sources** | what money actually arrived | **nothing** |

**Two legs are empty.** §4's reconcile module is defined against "Meta, Google, GA4 **and your order
source**", and there is no connector for one — the largest structural gap in the current scope, and
why order sources rank above additional ad sources throughout this document.

The delivery leg is newer to this argument and is described in §4.5. It matters for a reason the
other three do not cover: **every source above is self-reported by a party with an interest in the
number.** An ad platform counts its own conversions; a browser-based analytics tag counts only the
visitors who let it run. A CDN counts requests it actually served, and that makes it the one
independent measurement in the set.

## 3. Three things that reorder the obvious list

### 3.1 The international ad bundle is already commoditised

§1, from the specification's own competitive round:

> Windsor's `/all` endpoint returns every connected source in one call … at 23 dollars a month …
> a Meta plus Google plus TikTok plus GA4 bundle sits at roughly $99/month with no per-call
> metering, so **there is no read-side price wedge**.

Supermetrics bundles API access from $44/month. Adding Bing, LinkedIn or Pinterest to a Meta +
Google + GA4 set therefore buys **nothing a competitor does not already sell** — it adds
maintenance, an approval gate and a quota regime in exchange for parity.

Not an argument against ever building them. An argument that they cannot be the differentiator.

### 3.2 The fourth slot was designed to be chosen by design partners

§0, verbatim:

> three to four connectors held permanently (Meta, Google, GA4, **and one more chosen by design
> partners**)

The fourth connector is deliberately unspecified. **If the design partners are Thai SMEs, the fourth
connector is a Thai one by the specification's own design** — not a deviation from it. That is the
cleanest route from this document to something buildable, and it re-litigates nothing.

### 3.3 In Thailand, the order source is a marketplace

Internationally the order source is Shopify, WooCommerce or Stripe. **In Thailand it is usually
Shopee, Lazada or TikTok Shop**, because that is where the transaction happens.

This changes their status. They are not "more ad connectors for later" — they are **the
reconciliation anchor for a Thai customer**, and one of the two flagship modules does not function
without one. That moves them from a coverage question to a correctness one, which is the axis the
kickoff says to optimise.

### 3.4 The consequence

**The Thai stack is not commoditised.** No incumbent in §1's competitive table — Supermetrics,
Windsor, Funnel, Adverity, Improvado, Triple Whale, Polar — covers LINE, Shopee, Lazada or TikTok
Shop. A Thai SME's actual stack is invisible to all of them.

Against a §0 survival number of **240 to 400 paying accounts**, a niche the incumbents cannot serve
is worth more than parity on a bundle they sell for $99.

## 4. Analytics and delivery — the two families with no approval gate

Grouped because they share both properties that matter here: **they measure the same thing** —
traffic — and **neither requires a partner review**. A customer creates a key and hands it over, the
same day.

GA4 is built (`12-`, `13-`, `14-`). The rest of the analytics leg is **PostHog, Mixpanel and
Amplitude**, which the specification already researched. The delivery leg (§4.5) is **Cloudflare,
Bunny and their peers**, which it did not.

### 4.1 They cost nothing in calendar time, which nothing else here can say

§3.5's access table, verbatim:

> **PostHog and Mixpanel** | Yes, customer-supplied keys | **None** | **Same day** | PostHog query
> endpoint 2,400/hour, analytics 240/minute and 1,200/hour, **applied to the entire organisation**;
> Mixpanel Query API 5 concurrent and 60 queries/hour, Raw Data Export 100 concurrent, 60/hour,
> 3/second

**No review. No verification. No audit. Customer-supplied keys, working the same day.**

Every other connector family in this document carries a long-lead approval — gate 17, the one that
sets the calendar. Ad platforms need business verification and app review; marketplaces need partner
programmes. **Analytics needs none of it**, and that is sourced, not assumed.

The delivery leg (§4.5) appears to share the property — a Cloudflare or Bunny API token is something
a customer issues themselves — but **that is my inference, not the specification's research**, and it
is one of the things §9 item 1 has to confirm.

For a two-founder team on a fixed runway, an entire leg with no calendar risk is a stronger argument
for building early than anything about market size.

### 4.2 But access is not the differentiator — the join is

§1: *"HubSpot, Klaviyo, Mixpanel, PostHog and Amplitude all ship MCP servers"*, and §10 lists
single-domain anomaly detection as **table stakes, "assume zero differentiation"**, naming Amplitude
and GA4-in-UI directly.

So a PostHog connector that only exposes PostHog is worth nothing — the customer already has
PostHog's own MCP server, for free. §10 says exactly where the value is:

> **Cross-domain root cause that spans ads + web analytics + SEO/SERP + AI-answer visibility +
> competitor moves in one call.** Every RCA that exists today is *intra-domain*: Improvado correlates
> ads↔CRM, **Amplitude within product events**, Anodot within whatever metrics you fed it, Triple
> Whale within commerce.

An analytics connector earns its place **only as a leg of the join**, never as a destination. That
should be stated in whatever design note builds one, because it is the difference between a feature
and a commodity.

### 4.3 PostHog's rate limit is the GA4 quota problem, worse

§4.4: *"GA4's 40,000 tokens per property per hour, **PostHog's org-wide limits** and Mixpanel's 60
queries per hour are shared with the customer's existing tools."*

`13-ga4-client.md` already solved this shape: measure the quota, stop at a floor rather than at
zero, and never retry a quota exhaustion — because the quota is **the customer's**, and draining it
breaks their own dashboards, not ours.

PostHog is the harsher case. GA4's ceiling is per property; **PostHog's is organisation-wide**, so
one heavy backfill degrades every PostHog query the customer's own team runs. Mixpanel's 60
queries/hour is tighter still in absolute terms. The floor discipline is more necessary here, not
less, and any connector in this family should reuse it rather than reinvent it.

### 4.4 Ranking the analytics leg, and one thing worth checking

**PostHog first** — self-hostable, generous free tier, and the platform SMEs and startups actually
adopt when they outgrow GA4. **Mixpanel second.** **Amplitude third**, and lowest because §10 records
it already shipping "continuous metric monitoring, automated RCA on anomalies" — its customers are
the least likely to feel the gap this product fills.

**Not in the specification, and my own suggestion:** privacy-first analytics — **Matomo**,
**Plausible**, **Fathom**. Small individually, but they are self-hosted or EU-hosted, which makes
them the one analytics family that does not worsen the unresolved EU data-region problem in
`01-brand-identity.md`. Worth a look if European customers matter. Unsourced — see §6.

**No Thailand-specific analytics platform exists that I know of.** Thai SMEs use GA4 and the Meta
pixel like everyone else. The analytics leg is international; the localisation is in the other two.

### 4.5 The delivery leg: a CDN is the only source that is not self-reported

**Not in the specification. My own argument — see §7.**

Every source in §2 is reported by a party with an interest in the number, or by a tag the visitor can
switch off. A CDN sits in front of the origin and counts what it actually served. That independence
is the whole case, and it produces three things nothing else in the roadmap does:

**1. A traffic number that consent banners and blockers cannot suppress.** GA4 and every other
browser-tag analytics platform count only the visitors who allowed the tag to run. A CDN counts the
request either way. The gap between them is not noise — **it is a measurable number the customer
currently has no way to see**, and it is exactly the reconcile pattern this product already sells,
applied to traffic instead of revenue: *"GA4 reports 1,000 sessions; your CDN served 4,200 HTML
responses to non-bot clients. Here is the shape of the difference."*

**2. Origin health as a root cause.** §4.1's diagnostic tree asks why a number moved.
"Conversions fell because the origin returned 5xx for forty minutes" is a cause **no ad platform, no
analytics tag and no order source can see**, and it is a common real one. `/v1/diagnose` gets a
whole class of answer it cannot currently reach.

**3. AI crawler traffic, which is the supply side of the visibility module.** §11.8 sells AI-answer
citation monitoring, and it measures the *output* — whether a brand is cited. A CDN sees the *input*:
whether GPTBot, ClaudeBot, PerplexityBot and their peers fetched the pages at all. A brand that is
not cited because it was never crawled is a different problem, with a different fix, from one that is
crawled and not cited. **I believe this pairing is unbuilt anywhere**, and it is the strongest
argument in this section — though see the caveat below, because I have not verified what each CDN
exposes.

#### Which ones

| | Why |
|---|---|
| **Cloudflare** — GraphQL Analytics API | The largest SME footprint by a distance, and the richest analytics surface. Bot and AI-crawler classification is a first-party feature rather than something to infer |
| **Bunny.net** | Genuinely popular with cost-conscious SMEs, simple statistics API, no enterprise sales motion |
| **Vercel** — Web Analytics and Speed Insights | Relevant because the dashboard already deploys there, so the shape is easy to learn against our own account before asking a customer for a key |
| Fastly, Akamai, AWS CloudFront | Enterprise or awkward. CloudFront's usable path is CloudWatch and cost reports, which is a different integration shape. Only on a named request |

**Note on Cloudflare specifically:** the repository runs on Cloudflare (Workers, R2, Queues). That is
irrelevant to this connector and must stay irrelevant — **the credential is the customer's, per
kickoff non-negotiable 4**, and our own account is not a shortcut to theirs. Worth writing down
because the temptation to conflate them is real.

#### What it collides with

- **Requests are not sessions.** A CDN counts HTTP requests; GA4 counts sessions. Mapping one onto
  the other would be precisely the silent rename §13.3 rule 2 forbids, and it would make the
  reconciliation in point 1 above impossible by destroying the difference it depends on. The
  dictionary needs **`requests`**, and probably `bandwidth_bytes` and `cache_hit_ratio`, as their own
  terms.
- **The entity grain mostly fits, which is a pleasant surprise.** `url`, `page` and `geo` are already
  in `ENTITY_TYPES`. A CDN *zone* or hostname is not, but is close enough to `account` to be
  arguable — unlike the order leg (§8.1), this does not obviously force a schema change.
- **No attribution collision at all.** CDN data carries no conversions, so `attribution_window` is
  legitimately null — the impressions-only case the envelope already allows.
- **Sampling is a different correctness problem from restatement, and the envelope has no word for
  it.** Some CDN analytics APIs return adaptively sampled data at high volumes. A sampled number is
  not provisional and it is not final; it is an estimate with a sample rate. `is_provisional` cannot
  express that, and reporting a sampled figure as exact would be the kind of quietly-wrong number
  this whole product sells against. **This needs settling before a CDN connector ships** — either a
  sample-rate field on the envelope, or a rule that only unsampled datasets are ingested.
- **IP addresses are personal data.** CDN *analytics* endpoints generally return aggregates; CDN *log
  push* returns per-request records including client IPs. The rule should be explicit and narrow:
  **aggregate analytics APIs only, never log delivery**, which keeps gate 13 answerable without a new
  PII regime.

## 5. Thailand

**Every row in this table is unverified. See §6 before treating any of it as a fact.**

| Connector | Leg | Why it ranks here |
|---|---|---|
| **LINE** — Official Account + LINE Ads Platform | Ad, and the closest thing to a CRM most Thai SMEs run | The single most important. LINE is the messaging layer of Thai commerce; the customer relationship lives in the OA, not in email |
| **Shopee** — Seller Center + Shopee Ads | **Order and ad** | The reconciliation anchor (§3.3) *and* a genuine ad platform. Dominant SEA marketplace |
| **Lazada** — Open Platform + Sponsored Solutions | Order and ad | The other half of the marketplace duopoly |
| **TikTok Shop** | Order | Distinct from TikTok Ads — two integrations, not one. Disproportionately large in Thailand |
| Order/inventory middleware — Zortout, Page365, Ketshopweb, LnwShop | Order | Where many Thai SMEs actually reconcile stock across marketplaces. Only on a named design-partner request |
| Payments — Omise/Opn, 2C2P | Order (money truth) | Settles what a marketplace's own reporting does not |

**Ordering rationale.** LINE first because nothing else reaches it. Shopee before Lazada on share.
TikTok Shop is the growth surface but the newest and least settled API. Middleware and payments only
when a design partner names one.

## 6. International

Beyond the four in scope, and after the restatement gate:

**Order sources first**, because §2 says the leg is empty: **Shopify**, **Stripe**, **WooCommerce**.

**Then ad sources by demand**: **TikTok Ads** (already researched — §3.5 gives sandbox in hours,
production audit one to four weeks), **Klaviyo** (§3.2 records the cold-start trap: an OAuth listing
needs five live installs, and you need the listing to get installs), **LinkedIn Ads** for B2B,
**Amazon Ads** for sellers, **Pinterest**, **HubSpot**.

**Microsoft Ads is deferred for a named reason, not a priority call.** §0 and the phase-1 timeline
both record it: *"its SOAP API is being replaced by REST with a 31 January 2027 shutdown, so it
would be built twice."* Build it after the replatform settles. Apple is deferred alongside it.

**Affiliate networks stay bring-your-own-credential and are not a wedge.** §0 gives three reasons:
Awin gates advertiser API access behind paid plans with user-scoped tokens, Impact's master agreement
bars competitors and requires written approval, and Strackr already aggregates the networks.
`impact`, `awin`, `cj` and `partnerstack` are already in the source dictionary; that is scope enough.

## 7. What is verified, and what is not

**This section is the most important one in this document.**

**Grounded in the repository's own research** (`00-recon-reports.md`, spec §1, §3.2, §3.5, §4.4,
§10): the analytics access table and every rate limit in §4; the MCP-is-table-stakes finding; the
cross-domain-join wedge; TikTok's access path; Klaviyo's five-install rule; Microsoft's SOAP
shutdown date; the affiliate networks' contractual gates; the incumbent pricing behind §3.1.

**NOT RESEARCHED ANYWHERE IN THE SPECIFICATION OR THE RECON REPORTS: every Thailand-specific claim in
§5, the whole of the delivery leg in §4.5, and the privacy-first analytics suggestion in §4.4.**
LINE, Shopee, Lazada, TikTok Shop, the middleware, the payment providers, Cloudflare, Bunny, Vercel,
Matomo, Plausible, Fathom — none appears in `00-recon-reports.md`, in the specification, or in the
artboard. They come from my own knowledge, which means:

- **The market claims are plausible but unsourced.** "LINE is where Thai commerce happens" and
  "Shopee and Lazada are a duopoly" are widely held and I believe them, but this document cites
  nothing. A founder in Bangkok knows better than I do and should overrule me freely.
- **The API claims are weaker still.** LINE Ads Platform, Shopee Open Platform and Lazada Open
  Platform all have partner-approval gates whose current terms, quotas and data-use clauses I cannot
  state reliably. I have not read them.
- **The CDN claims are a mix.** That a CDN counts requests a blocked tag does not is structural and I
  am confident in it. **What each vendor actually exposes is not**: which datasets are sampled and at
  what volume, whether AI-crawler classification is available on which plan tier, what the API rate
  limits are, and whether "no approval gate" survives contact with their terms. §4.5's third point —
  the AI-crawler pairing — is the least verified and the most load-bearing claim in this document.

Treat §5 as a hypothesis to test, the way phase 0 treated the specification's own open items.
**Nothing in §5 may be built on before the recon in §9 is done for it.**

## 8. Three architectural collisions the order leg creates

Not reasons to avoid it — the design work it implies. Finding them now is the point of writing this
before building.

### 8.1 An order source does not fit the entity hierarchy

`ENTITY_TYPES` in `@repo/contract` is the `dbt_ad_reporting` grain: `account`, `campaign`,
`ad_group`, `ad`, `keyword`, `search_term`, `url`, `geo`, `property`, `page`, `query`.

**There is no `order`, no `product`, no `listing`.** A Shopee order is none of the eleven. Either the
hierarchy grows a commerce branch — a real schema decision affecting the §7 upsert key — or order
data lives somewhere that is not `envelope_rows`. **This is the single largest open question in this
document**, and it applies to Shopify and Stripe exactly as much as to Shopee.

### 8.2 The metric dictionary has no commerce vocabulary

`METRICS` is `spend`, `impressions`, `clicks`, `sessions`, `conversions`, `conversions_value`,
`revenue`. An order source needs at least an **order count** and probably **units**; a marketplace
needs **GMV**, which is not `revenue` and must not be silently mapped onto it.

§13.3 rule 2 requires the dictionary change *first*, and `scripts/check-dictionary.mjs` now enforces
that the TypeScript and the SQL enum move together — a two-file change, with the build failing if you
do one without the other. Working as intended, and a small tax per connector.

The analytics leg has the same shape and a shorter list: `sessions` was added for GA4, and PostHog or
Mixpanel would likely want **events** and **active users**, neither of which exists yet.

### 8.3 Marketplace platforms report their own attribution

`ATTRIBUTION_WINDOWS` carries Meta's list plus `account_default` and `model`. Shopee and Lazada report
conversions under their own attribution models, which may map onto none of those members.

The envelope **refuses to emit an unlabelled conversion count** — in zod, in a `CHECK` constraint and
in the API (`16-performance-endpoint.md`). So a marketplace connector cannot ship until its
attribution is mapped to an existing member or the dictionary gains one with the platform's
documentation cited. **The refusal will block the connector, correctly, and that is the system
working.**

## 9. What each connector needs before it is built

Per connector, an issue answering these — the gates a *new platform* actually stresses. The rest are
answered the same way every time and are not repeated.

1. **Access path and timeline** (gate 17). What approval, what evidence, what observed duration, what
   degraded path ships without it. *Already answered for PostHog and Mixpanel: none, same day.*
2. **Whose credential** (gate 1). Is there a bring-your-own-credential path, or does the platform
   require a partner key? A partner key shared across tenants is forbidden by kickoff non-negotiable
   4 and would disqualify the connector in its current form.
3. **Redistribution and data-use terms** (gates 8, 10). Does the platform forbid aggregation across
   customers, or require written client consent to move data? Meta 3.a.iv and Google's redistribution
   clause set the bar; assume every marketplace has its own.
4. **Quota regime** (gate 16). Per app, per seller, per token, or organisation-wide as PostHog's is?
   Shared with the customer's other tools? Are rejected requests counted, as on Google Ads?
5. **Restatement behaviour** (§7). Does the platform revise figures after first report, over what
   window? No published window means `null`, not a guess — the rule `@repo/contract` already applies
   to Search Console. **And separately: is the data sampled?** Sampling is not restatement and the
   envelope has no word for it (§4.5).
6. **Attribution model** (§8.3).
7. **Entity grain and metric vocabulary** (§8.1, §8.2).
8. **PII exposure** (gate 13). A marketplace order carries buyer name, address and phone; a product
   analytics platform carries user identifiers and event streams. **Both are categorically more
   sensitive than anything the four MVP connectors touch**, and the hash-at-the-edge rule was written
   for a write path, not for an order feed or an event export. Settle it before, not during.

Item 8 deserves emphasis. Ad platform reporting is aggregate; **order and product-analytics data is
personal data about identifiable people**, and a Thai entity holding EU or UK data has obligations
this repository has already recorded as unresolved (`01-brand-identity.md`: no data region chosen, no
Article 27 representative, no DPA). The marketing site withholds all three claims for exactly that
reason (`apps/web/app/_content.ts`). **A connector on either leg makes that gap materially worse and
should not ship before it is closed.**

## 10. Cost

**No infrastructure cost — this document adds no code.**

What matters is per-connector engineering and calendar. From what the GA4 unit actually took here,
one connector is `client + normalize + backfill + fixtures + contract.test` (`12-`, `13-`, `14-`),
plus:

- a dictionary change where the vocabulary grows (two files, guard-enforced);
- a platform-terms recon (§9) — the expensive part, and unparallelisable, because it is reading
  contracts;
- a long-lead approval with its own calendar risk (gate 17) — **except on the analytics leg, where
  there is none**;
- ongoing quota and restatement surface, which is what "correctness over coverage" protects.

**That recurring surface is why the kickoff gates the fifth connector.** Each one added before the
restatement machinery is finished multiplies the work of finishing it.

## 11. What this does not decide

- **Which connector is fourth.** §0 says design partners choose it. This document argues that if the
  partners are Thai the answer follows; it does not assert that they are.
- **Whether to be a Thailand-first product.** A positioning decision with consequences for the
  marketing site, the claims list and pricing. The founder's.
- **Anything in §8.1.** Naming the schema question is not answering it.
- **Any timeline.** Nothing here is scheduled, because the gate before it is not built.

## 12. Outstanding, and not hidden

- **The marketing site's design note is still owed** (`19-marketing-site.md`). The site shipped in
  `6ce3cd7`; its note did not, and the commit says so.
- **The restatement webhook does not exist.** It is half the gate the kickoff sets before a fifth
  connector, and no note yet covers it.
- **The order leg is empty**, and `/v1/reconcile` is defined against it (§2). The delivery leg is
  empty too, and §4.5 argues it is the only independent measurement available.
- **The envelope cannot express a sampled figure** (§4.5). It blocks the delivery leg and nothing
  else today, but it is a contract gap, not a connector one.
- **Nothing in §5 has been verified.** Repeated because it is the thing most likely to be quoted back
  from this document as though it were established.
