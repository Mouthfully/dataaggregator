# 22. Who gets audited: the POS opening, and the plan preconditions

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed — **documentation only, no code**

---

## 1. What this is, and the decision taken

Two questions, answered the way `21-thai-connector-shortlist.md` answered its own: by reading the
vendors' documentation rather than recalling it.

1. **Is there a Thai point-of-sale system whose API the merchant can supply a key for?** §11A.9.1
   records the category as blocked. Answer: **yes — POSPOS**, and the block was narrower than the
   open question states.
2. **What are the access models for the digital connectors** — PostHog, Semrush, Ahrefs, Search
   Console, Microsoft Ads, Google Ads?

**The decision taken.** **Connectors are ranked by who a reviewer looks at, and by whether the
customer can afford the precondition — not by API quality.** Two access models, and two tests:

| Model | Who is reviewed | Calendar risk |
|---|---|---|
| **Key paste** — the customer creates a key in their own account and hands it over | **Nobody** | None |
| **OAuth app** — we register an application and a platform reviews it | **Us** | Unbounded at Google, days at Microsoft |

And the second test, which the roadmap currently runs together with the first: **"easy for us" is not
"available to our customer."** A key-paste source whose key only exists on a $549/month plan is
trivial to integrate and unavailable to the customer §11A.1 names.

**The alternative rejected** was ranking on API ergonomics — auth scheme, pagination, response
shape. Ergonomics is a day of work. A review is a quarter, and a plan precondition is a customer the
product does not have.

## 2. POSPOS: the category was not blocked, the dominant vendor was

**POSPOS** (`pospos.co`) is Thai, and its Developer API is exactly the shape the question asked
about. The credential flow, as documented:

1. The shop owner signs in and copies a **Token Key** from the Shop / Developer Setting page.
2. The owner **emails that token to `support@pospos.co`**.
3. Staff review it and return an **API Key** by email.

Then REST, with the API key in an HTTP header.

**Every documented endpoint is `GET`.** Transaction, Stock, Member and Sell-Credit, plus Vendor, Buy
Document and Product Stock. A read-only surface is what this product wants and is rarer than it
should be.

**Rate limit: "not exceeding 300 calls per 10 seconds"**, and exceeding it *"may result in automatic
service suspension and key deactivation, depending on subscription terms."*

### 2.1 What it changes

§11A.9.1 says API access for FoodStory / Wongnai *"blocks the point-of-sale category"*. That
conflates a vendor with a category. FoodStory is blocked; **the category is not**, and the
distinction matters because point of sale is where the after-fees number of 11A.2 and the covers and
tickets grain of 11A.5 come from. It was the single largest hole in the SME product and it has a
floor now, even if it does not yet have the dominant vendor.

### 2.2 Three caveats, none disqualifying

- **The email step means this is not purely self-serve.** It is per-merchant and human-in-the-loop:
  the customer emails, waits, then pastes. That is **worse onboarding than OAuth and better than a
  partner key**, and it still passes gate 1 cleanly, because the credential is the merchant's and
  never ours. It is also **new UI work**: the Connect screen has no state for "email this token,
  wait for a reply, paste what comes back", because OAuth never needed one.
- **The rate limit is generous in aggregate and unforgiving in failure mode.** Thirty calls a second
  is far more headroom than GA4's tokens or PostHog's organisation-wide ceiling. But the documented
  consequence of exceeding it is **the merchant's key being deactivated** — the same class of harm as
  draining a customer's GA4 quota, and the reason `13-ga4-client.md`'s floor discipline applies here
  rather than a naive retry.
- **Adoption is unknown.** Nothing was established about how many Thai venues run POSPOS. A
  documented API is not a market.

### 2.3 What it does not change

**FoodStory is still where the volume is.** LINE MAN Wongnai's 50,000+ restaurant partners and its
POS acquisition are not replaced by a smaller vendor with better documentation. 11A.9.1 stays open;
it is narrowed to name the vendor rather than the category.

## 3. The other point-of-sale systems, and a nationality correction

| System | Nationality | Credential model |
|---|---|---|
| **POSPOS** | **Thai** | Merchant token → emailed → API key returned. Read-only |
| **Loyverse** | **Not Thai** — Limassol, Cyprus per Crunchbase and PitchBook; one source says Vilnius | Merchant creates access tokens in the Back Office, **up to 20 per account** |
| **Qashier** | Singaporean | Publishes API-integration pages; **no public developer reference**. Notably asks merchants for a *Shopify Admin API access token*, so it is key-paste-shaped internally |
| **StoreHub** | Malaysian | Delivery integrations gated to Advanced/Pro plans; **no public developer docs found** |
| **FoodStory**, **Ocha** | Thai | Commercial. Unchanged from `21` §4.2 |

**Loyverse is the purest key-paste model on the board and carries a security property worth naming:**
its own documentation says the token gives **unlimited access to all resources**. There is no
scoping, so a leaked token is total. The vault handles storage; it does not shrink a blast radius,
and a connector design that assumes scoped read tokens would be wrong here.

**The nationality correction.** §11A.6's point-of-sale row reads *"FoodStory by Wongnai, Ocha
(Shopee), StoreHub, Loyverse, Qashier"* under a Thailand-first heading. **Three of the five are not
Thai companies.** They are used in Thailand, which is the honest description and a different claim —
it matters because the local-outreach advantage the founder has applies to a Thai vendor and does not
apply to a Malaysian or Cypriot one.

## 4. The two access models, verified

| Source | Model | Reviewed | Calendar | The catch |
|---|---|---|---|---|
| **PostHog** | Key paste — a **scoped** personal API key from account settings; org admins can audit every key | Nobody | Same day | Rate limits are **organisation-wide** (`00-recon-reports.md`): a backfill degrades the customer's own dashboards |
| **Semrush** | Key paste | Nobody | Same day | See §5 |
| **Ahrefs** | Key paste | Nobody | Same day | See §5 |
| **Search Console** | OAuth app | **Us**, by Google | **Unbounded if the scope is sensitive** | `webmasters.readonly` status **remains unconfirmed** — Google's OAuth scopes page does not list the webmasters scopes. I tried to close this and could not |
| **Google Ads** | OAuth app **plus a developer token** | Us, twice | Explorer 2,880 ops/day → Basic 15,000 (~5 business days) → Standard unlimited (~10 days, RMF compliance) | Rejected requests still count against the cap; per-tenant developer tokens in a multi-tenant service remain undocumented |
| **Microsoft / Bing Ads** | OAuth app + developer token, **but the token is instant** | Us, lightly | **Same day** | See §4.1 |

### 4.1 Microsoft's access is easier than Google's, and that is a verified surprise

From Microsoft Learn's own get-started page (`ms.date` 2026-05-11, updated 2026-06-05): sign in with
**Super Admin** credentials at the Developer Portal account tab, choose the user, click **Request
Token**, and *"the token will immediately be available"*. The **universal developer token** *"can be
used to authenticate with any Microsoft Advertising user credentials"* — one token, any number of
users, default since July 2019. The sandbox token is public: `BBD37VB98`. The Developer Portal page
moved on 31 May 2025 to `ads.microsoft.com/cc/Settings/DevSettings`.

**No tier ladder. No operations cap attached to the token. No review.** Against Google Ads' four
rungs and per-token daily caps, that is the inverse of the expected ordering.

**Precisely what this does and does not verify.** The page confirms the developer-token flow. **It
carries no SOAP feature-freeze or decommission dates.** `00-recon-reports.md` marks the 2026-10-01
freeze and 2027-01-31 decommission `UNVERIFIED` for want of a primary Microsoft source, and
**that marker stands** — nothing read this round sources them. Microsoft's deferral in `18` §6 still
rests on an unsourced reason, and the reason, not the outcome, is what is unproven.

## 5. "Easy for us" is not "available to our customer"

Both SEO sources are key-paste and therefore trivial to integrate. Both carry a precondition the
primary customer of 11A.1 cannot meet.

**Semrush.** API access sits on **Advanced at about $549/month** ($455.67 billed annually), with a
legacy **Business at $499.95** still documented as carrying it. The plan does not include units: it
unlocks the *ability to buy* them. Units are sold in packages of **2, 5, 10 or 20 million with no
published price** — one third-party estimate puts them near $50 per million, which is an estimate and
is recorded as one. Consumption is not flat per request: a traffic overview may cost 1 unit per line
where historical paid-search data costs 100.

**Ahrefs.** API v3 is available from **Lite** upward, which is better than its reputation:

| Plan | API units / month | Max rows per request |
|---|---|---|
| Lite | 100,000 | 100 |
| Standard | 400,000 | 250 |
| Advanced | 1,000,000 | 500 |
| Enterprise | 2,000,000 | Unlimited |

**Extra units can only be purchased on Enterprise**, and Enterprise is where the row cap disappears.
A minimum request costs 50 units.

**The consequence is strategic, not technical.** An owner-run café will never hold a Semrush Advanced
plan or an Ahrefs Enterprise seat. **These are agency-channel connectors** — and 11A.1 made agencies
the secondary channel. Two of the cheapest integrations available serve the customer the product
deprioritised, which is the same ICP mismatch `21` found from the opposite direction: the *verified*
sources serve the online seller, and the *cheap* sources serve the agency, and neither is the café
that §11A.1 names first.

**The repository already holds the right answer for SME SEO and does not need either.** Section 11.2
buys SERP wholesale from **DataForSEO** under the gate 2 vendor-key exception, because it is public
data. The customer needs to own no SEO tool at all. That decision looks better after this round, not
worse.

## 6. What this changes in the roadmap

**`18-connector-roadmap.md` §4 is right and generalises further than it claims.** It groups analytics
and delivery as *"the two families with no approval gate"*. The gate-free property is not a property
of analytics; **it is a property of the key-paste model**, and it extends to Semrush, Ahrefs and —
unexpectedly — Microsoft's developer token. §4's title is narrower than its own finding.

**§4.4's ranking of PostHog first survives, and gains a second reason.** It was ranked on adoption
and self-hostability. It is also **the only key-paste source in the analytics-and-SEO family whose
plan precondition an SME actually meets.**

**§4.1's claim that access costs nothing in calendar time needs one qualifier.** True for the review;
false for the wallet. A source with no reviewer and a $549 precondition has no calendar risk and no
customer.

## 7. Cost estimate

**Per connected account per month: $0.00.** No code, no dependency, no infrastructure.

Forward cost, and it differs from `21` §8 in one place:

| Term | This round |
|---|---|
| POSPOS as a connector | One GA4-shaped unit, plus the **same** dictionary change `21` §7 already names — shared, not additional |
| **The email-approval onboarding state** | **New, and not shared.** A Connect screen flow for "copy this token, email it, wait, paste the key back" exists nowhere in the product. It is small UI work and it is real |
| PostHog | One unit; the quota client already exists |
| Semrush, Ahrefs | One unit each and near-zero access cost — but see §5 before scheduling either |
| Microsoft Ads | Cheap access, **and still built twice**: the SOAP-to-REST replatform is the reason to defer, and it is unchanged by the token being easy |

## 8. Platform-terms check

Documentation only. The gates this *plan* stresses are answered against the plan.

**1. BYOC.** `PASS` — POSPOS, Loyverse, PostHog, Semrush and Ahrefs all issue the credential to the
customer. **The two ad platforms are where this gate bites**: Google Ads and Microsoft both require
*our* OAuth application and a developer token, and Google's policy forbids a third party letting
customers *"avoid applying for their own Google Ads developer access and Google Cloud Platform
project"*. The per-tenant developer token question (`00-recon-reports.md`, §3.5 open) is unchanged
and is restated here because this round makes the contrast visible: **the key-paste sources satisfy
gate 1 by construction; the OAuth sources satisfy it only by design.**

**2. Vendor-key exception.** `N/A` — nothing built. Recorded because §5 leans on it: DataForSEO
remains the permitted single-key surface, and it is why an SME needs no SEO subscription.

**13. Hash at the edge.** `N/A`, and flagged. **POSPOS's Member API returns customer member data**
and its Transaction API returns payment records. This is the same finding as `21` §9 — a read path
that returns personal data unbidden — and it now reaches the POS leg as well as payments and orders.
**`raw` cannot be stored as returned.** Loyverse compounds it: an unscoped token cannot be narrowed
to non-personal resources even if we wanted to.

**16. Tier reality.** `N/A` — nothing built, but the numbers are now known rather than assumed:
POSPOS 300 calls / 10 seconds with key deactivation as the penalty; PostHog organisation-wide;
Semrush and Ahrefs metered in units with per-request row caps; Google Ads per developer token with
rejected requests counted; **Microsoft documents none as binding**.

**17. No new long-lead dependency.** `PASS` for every key-paste source and for Microsoft's token.
`FAIL` by construction for Search Console and Google Ads, which is why neither is affected by this
note: both already carry their gate in the specification.

**18. Claim provenance.** `PASS` — nothing user-visible. Explicitly: **POSPOS may not appear in a
logo strip or the claims list until it is built**, the same rule `21` §9 applied to its four.

Gates 3–12, 14, 15: `N/A` — no code, no schema, no credential path, no dependency, no consent
object, no egress.

**Result:** `3 PASS, 15 N/A, 0 FAIL`

## 9. What was left out

- **No connector was built and no dictionary change was made.** POSPOS needs the same `order`,
  `ticket` and net-revenue vocabulary `21` §7 names; the guard keeps it one deliberate change.
- **§11A.6's point-of-sale row was not edited in place.** The nationality correction is recorded in
  §3 and in 11A.13; rewriting a decision table inside a documentation pass would edit a decision
  under cover of a note.
- **No approach was made to POSPOS, and no key was requested.** Nothing here is validated against a
  live account, which means the endpoints are documented rather than exercised.
- **Semrush's unit price is unpublished** and the ~$50/million figure is one third party's estimate.
  It is not a cost model and is not treated as one.
- **Search Console's scope question could not be closed.** It was attempted; Google's scopes page
  still omits the webmasters scopes.
- **`docs/SME-POSITIONING-AND-FINDINGS.md` was not updated**, for the same reason as `21` §10.

## 10. Open or unverified items this builds on

- **POSPOS adoption**, and whether the email-approval step scales past a handful of merchants. If it
  is slow or discretionary, the connector is technically fine and commercially awkward.
- **Whether POSPOS restates.** No published window. The contract's rule gives `null`, not a guess.
- **Loyverse's nationality** — Cyprus and Lithuania both appear in reputable profiles. It does not
  change the engineering; it changes whether the local-outreach argument applies.
- **`webmasters.readonly`'s sensitivity**, unchanged from `00-recon-reports.md`.
- **Per-tenant Google developer tokens**, unchanged.
- **Microsoft's SOAP dates**, still unsourced — see §4.1.

## 11. Verification

**Sources read on 2026-09-08.** POSPOS Developer API and API overview articles (`pospos.co`);
Loyverse token documentation (`help.loyverse.com`) and developer docs; Qashier API-integration pages;
StoreHub delivery-integration help; PostHog personal API keys (`posthog.com/docs/api`); Semrush API
plan and unit reporting; Ahrefs API v3 plan table (`help.ahrefs.com`); Microsoft Advertising
get-started (`learn.microsoft.com`); Google's OAuth scopes page.

**Repository gates.**

| | |
|---|---|
| Lint, format | pass |
| Brand guard | pass |
| Tokens guard | pass |
| Dictionary guard | pass — no dictionary change was made |
| Typecheck, test, build | pass, unchanged: **318 unit tests** |
| Database suite | unchanged: **108 assertions** |
