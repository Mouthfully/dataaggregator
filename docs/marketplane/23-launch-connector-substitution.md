# 23. The aggregator catalogue is a menu, not evidence

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed — **documentation only, no code**

---

## 1. What this is, and the decision taken

A founder question: **looking at the Supermetrics and Windsor.ai connector catalogues, which sources
could launch requiring nothing but OAuth or an API key, and still matter in Thailand?**

Answering it required applying `22-access-models.md`'s two tests to a competitor's source list. The
answer is short, and acting on it changes a decision taken earlier the same week — which is the real
content of this note.

**The decision taken.** **The launch connector set is substituted, not extended.** It becomes:

| Slot | Source | Credential | State |
|---|---|---|---|
| 1 | **GA4** | OAuth, our app, Google verification | **Built** |
| 2 | **WooCommerce** | Merchant-issued consumer key + secret, permission `Read` | Not built |
| 3 | **Shopify** | Merchant-issued custom app, Admin API token | Not built |
| 4 | **A payments source — Opn or Stripe** | Merchant-issued key either way | Reserved for the first design partner to name |

**Google Ads, Search Console and Meta move behind the fifth-connector gate.** Spec §11A.14 carries
the binding version, and states plainly that it overrides 11.9 and 11A.6 on this point.

**The alternative rejected** was adding these to the existing four. That is arithmetically
impossible: the kickoff gates any *fifth* connector behind tiered restatement backfill and the
restatement webhook, so a launch set of four is the budget. Choosing three commerce sources spends
it. Pretending otherwise would have broken the gate by accident rather than by decision.

## 2. The catalogue trap

Supermetrics' catalogue contains **Shopee Commerce, Shopee Ads, Lazada Commerce, Lazada Ads and LINE
Ads.** Those are the most Thailand-relevant sources on the entire board, and a reader could
reasonably conclude that they are therefore attainable.

**They are not.** A connector in a competitor's catalogue is evidence that **the competitor holds a
partner agreement** — nothing more. `21-thai-connector-shortlist.md` established that Shopee requires
*"a live product with existing ecommerce integrations"*, which is a cold start we cannot satisfy, and
that Lazada requires developer registration plus app review.

**The rule, and it generalises past this round: an aggregator's source list is a menu, not evidence
of access.** Every row still has to be derived from the platform's own terms. This matters because
the catalogue is the most tempting shortcut available — it is long, public, categorised, and
completely silent on the only question that decides the schedule.

## 3. "OAuth or an API key" hides a three-way split

The question's own framing treats OAuth as the cheap case. It is not. What decides the calendar is
**whose application is registered**, not which protocol it speaks.

| Model | Who is reviewed | Examples from the catalogue |
|---|---|---|
| **Merchant-issued credential** | **Nobody** | WooCommerce, Shopify, Stripe, Klaviyo private key, Mixpanel, Amplitude, Matomo |
| **Self-serve OAuth app** | Nobody, in practice | Xero; Microsoft Advertising's instant universal developer token (`22` §4.1) |
| **OAuth app with review** | **Us** | **Every Google property**, Meta, TikTok, Shopee, Lazada, LINE Ads |

**Every Google property sits in the third row.** GA4 and Search Console are "just OAuth" and both put
this company in front of a Google reviewer whose sensitive-scope verification is unbounded — the
specification records one observed case running from 2026-04-01 to 2026-06-12 unresolved. GA4 is in
the launch set because that cost is **already sunk**, not because it is cheap.

## 4. The filter applied to the catalogue

| Connector | Credential | Thai relevance | Verdict |
|---|---|---|---|
| **GA4** | OAuth, our app, Google verification | Universal | **Built.** Long lead already accepted |
| **WooCommerce** | **Merchant-issued** — Settings → Advanced → REST API → Add Key, permission **Read**, consumer key + secret. The secret is shown once | High: the default Thai SME website stack | **Include** |
| **Shopify** | **Merchant-issued** custom app → Admin API access token | Medium-high: Thai D2C brands | **Include** |
| **Stripe** | **Merchant-issued** restricted key | Medium: cross-border sellers. Thai-domestic more often uses Opn, 2C2P or Beam | **Fourth slot candidate** |
| **Klaviyo** | **Private API key is self-serve.** The five-install rule in `00-recon-reports.md` applies to the *public OAuth app* in Klaviyo's marketplace, not to a private key | Low-medium | Possible later, private-key path only |
| **Mixpanel, Amplitude, Matomo** | Merchant key | Low for SMEs, higher for startups | Optional, per `18` §4.4 |
| **Microsoft Advertising** | Instant universal developer token | **Negligible in Thailand** | Passes the filter, fails relevance |
| **Google Business Profile** | OAuth **plus a formal access request**, requiring a website whose domain matches the email domain | **Very high** for walk-in venues | **Blocked on the outstanding domain decision** |
| **Meta Ads, Facebook and Instagram Insights** | App Review + Business Verification | **Highest in Thailand** | Fails the filter |
| **TikTok Ads, TikTok Organic** | Production audit | Very high | Fails |
| **Shopee and Lazada, Commerce and Ads** | Partner app | Very high | Fails — §2 |
| **LINE Ads** | Partner-gated, terms unread | Very high | Fails, and unverified |
| **Semrush, Ahrefs, Moz, Similarweb** | The customer's own paid plan | — | Agency-channel per `22` §5 |

**The distinction worth keeping from this table** is that the sources which fail are not failing on
difficulty. They are failing on **someone else's calendar**, which is the only cost this project
cannot compress by working harder.

## 5. What neither catalogue carries

**The LINE Messaging API / Official Account.** The merchant creates a provider and channel in the
LINE Developers console and issues a **channel access token**; the Insight API returns follower
counts, message-delivery statistics and demographics. **Merchant-issued, self-serve, and the single
most Thailand-relevant source that passes the filter** — and it is in neither aggregator's catalogue.

That is `18-connector-roadmap.md` §3.1 arriving as evidence rather than as an argument: **aggregators
carry the commoditised bundle, so anything that could differentiate this product is by construction
absent from their list.** A competitor's catalogue is therefore a good place to find what is cheap
and a bad place to find what is valuable.

**Two caveats, and it is not adopted here.** It is the Official Account side, not LINE Ads: it
carries engagement, not spend. And **11A.3 already decides LINE OA as a *delivery* channel** — the
place the brief is sent. Reading *from* it is a different thing, and turning a delivery channel into
a data source is a scope question the specification has not answered. **Recorded as open question
11A.9.7, not built.**

## 6. The substitution, and what it costs

This is a positioning change wearing a connector question's clothes: it swaps an **ad-measurement**
launch for a **commerce-consolidation** launch. Three things follow, and all three are costs.

**No ad spend at launch.** The set can compute revenue, net revenue after fees, margin and channel
mix. It **cannot** compute ROAS, CAC or any spend-derived figure, because no ad platform is in it.
For a product whose specification is built around ad diagnostics, that is a real capability loss, not
a sequencing detail. The mitigation is calendar, not code: **Meta's App Review and Business
Verification start now, in parallel**, because they consume weeks that the restatement webhook is
consuming anyway.

**A visible gap against the comparison.** Supermetrics carries Shopee, Lazada and LINE Ads and this
product will not. Anyone comparing source counts will find it, and `FORBIDDEN_CLAIMS` already bans
source-count claims for a different reason. Consistency is the answer: the product does not compete
on breadth and should not start.

**The dictionary change stops being "later".** WooCommerce, Shopify and either payments source all
need the `order` entity type and the commerce metrics that `21` §7 recorded as absent —
`ENTITY_TYPES` has no `order`, `METRICS` has a gross `revenue` and no `orders`, `net_revenue`, `fees`
or `commission`. **Every one of slots 2, 3 and 4 is blocked on it**, which promotes it from a
recorded gap to the immediate next piece of code. `check-dictionary.mjs` keeps it a single
two-file change.

So the engineering standing between here and this launch set is exactly two things: **the dictionary
change**, and **the gate** — tiered restatement backfill plus the restatement webhook.

## 7. What this does not change

- **11A.1's primary customer.** The owner-run small business is unchanged. What narrows is the
  **launch beachhead**, to the online-seller subset of it. A beachhead is not an ICP, and conflating
  the two would be the second repositioning this week rather than a sequencing decision.
- **The gate.** Four is the budget; this spends it. A fifth connector still waits on the restatement
  machinery.
- **The fourth slot belongs to a design partner.** `18` §3.2 records that the fourth connector is
  chosen by the partners, not by us. Opn and Stripe are both merchant-issued and both one unit of
  work; which one is a customer's answer.
- **Meta is not abandoned.** It is the largest ad platform for Thai SMEs and it is started now. It
  is simply not a *launch* connector under a filter that excludes anything needing review.

## 8. Cost estimate

**Per connected account per month: $0.00.** No code, no dependency, no infrastructure.

Forward cost of the set this decides:

| Term | Cost |
|---|---|
| Dictionary change | **One-time, two files, guard-enforced.** Blocks slots 2, 3 and 4 |
| WooCommerce, Shopify, payments | One GA4-shaped unit each — `client + normalize + backfill + fixtures + contract.test` |
| **Long-lead approval** | **Zero** for slots 2, 3 and 4. That is the entire point of the substitution |
| Meta App Review, started in parallel | Weeks of calendar, no engineering until it lands |
| Quota and restatement surface | Unknown for all three; a recon item per `18` §9, not an estimate |

**One economy and one anti-economy.** WooCommerce and Shopify are both merchant-key REST commerce
APIs, so the second is cheaper than the first. Against that, **commerce data restates in a way ad
data does not** — refunds, cancellations and commission adjustments rewrite a closed month — so the
restatement machinery this set depends on is load-bearing rather than incidental.

## 9. Platform-terms check

Documentation only; nothing is built.

**1. BYOC.** `PASS` — slots 2, 3 and 4 are merchant-issued by construction. Slot 1 is our OAuth app
against Google, which is unchanged and already accounted for.

**8. No cross-customer aggregation.** `PASS` — nothing here aggregates. Restated because a
commerce-first launch invites "how does my basket size compare", which 11A.8 forbids absolutely.

**13. Hash at the edge.** `N/A`, and flagged for the third consecutive note. **A WooCommerce or
Shopify order carries buyer name, email, phone and shipping address**, and a payments charge carries
cardholder details. `21` §9 and `22` §8 both record that `raw` cannot be stored as returned; this
decision makes those three sources the *launch set*, so the redaction path moves from "settle it
before the first one" to **"settle it before any of them"**.

**16. Tier reality.** `N/A` — no rate limit was read for WooCommerce, Shopify or the payment
gateways this round. Unknown, not benign.

**17. No new long-lead dependency.** `PASS` — the defining property of the substitution. Meta's
review is named as a deliberate parallel dependency with no launch path depending on it.

**18. Claim provenance.** `PASS` — nothing user-visible. **No source in §1's table may appear in the
claims list or a logo strip until it is built**, GA4 included, since the marketing site's claims gate
is what enforces it.

Gates 2–7, 9–12, 14, 15: `N/A` — no code, no schema, no credential path, no dependency, no consent
object, no egress.

**Result:** `4 PASS, 14 N/A, 0 FAIL`

## 10. What was left out

- **No connector and no dictionary change.** §6 names the dictionary as the next code task; making it
  inside a documentation pass is the scope-widening the kickoff forbids.
- **Windsor.ai's catalogue was not enumerated row by row.** It was consulted; the analysis rests on
  the Supermetrics list, which is the larger of the two, and no claim here depends on a source unique
  to Windsor.
- **LINE OA was recorded as an open question, not adopted.** §5.
- **Meta's App Review was not started.** That is a founder action requiring the legal entity and
  Business Verification, both of which are outstanding founder decisions.
- **`11.9` was not rewritten.** 11A.14 overrides it in the way section 11 is designed to, and editing
  the original would erase the record of the change.
- **No pricing consequence was drawn.** A commerce-first launch may price differently from an
  ad-measurement one; 11A.9.4 already holds that question and this note does not answer it.

## 11. Open or unverified items this builds on

- **Whether the first design partner is an online seller.** If the partners turn out to be walk-in
  venues, this substitution serves the wrong customer and slot 4 should become POSPOS (`22` §2)
  rather than a payment gateway.
- **Rate limits and restatement behaviour** for WooCommerce, Shopify, Opn and Stripe. All unknown.
- **The domain decision**, which blocks Google Business Profile and therefore the walk-in venue's
  single best observed-class source.
- **`webmasters.readonly`'s sensitivity**, unchanged — it decides whether Search Console's return
  after the gate is cheap or unbounded.
- **11A.9.7**, newly recorded: whether LINE OA may be read as a source and not only written to.

## 12. Verification

**Sources read on 2026-09-08.** The Supermetrics connector catalogue as enumerated by a third-party
review; Windsor.ai's integrations directory; WooCommerce REST API authentication and key-generation
documentation; Klaviyo's private-key and app-review documentation; LINE's Insight API documentation.
Shopify, Stripe, Shopee and Lazada access models are carried from `21`, where they were read
directly.

**Repository gates.**

| | |
|---|---|
| Lint, format | pass |
| Brand guard | pass |
| Tokens guard | pass |
| Dictionary guard | pass — **no dictionary change was made**, which §6 names as the next thing to change |
| Typecheck, test, build | pass, unchanged: **318 unit tests** |
| Database suite | unchanged: **108 assertions** |
