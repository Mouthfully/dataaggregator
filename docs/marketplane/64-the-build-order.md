# 64 — The build order: which connector next, and what each one costs to reach

**This is a research record, not a plan that has been agreed.** It is the output of nine agents
across two passes — a buildability pass over the Supermetrics and Windsor catalogue universe, and
a Thai market-demand pass — reconciled by a tenth. It is committed for the same reason
`58-plan-reconciliation.md` is: **its valuable findings are the negative ones**, and those are
what get forgotten and rediscovered at cost.

**Every external fact carries the marker its source pass gave it.** VERIFIED means a page was
read and the sentence is on it. UNVERIFIED means the figure came from a search summary, a
third-party blog, or a page that returned 403 to every attempt. Nothing has been upgraded by
being restated here, and section 6 is the list of things that could not be established at all.

**Three findings a reader should not be able to miss.**

1. **The three most valuable platforms in this market were never researched.** Shopee, Lazada and
   TikTok Shop top the demand evidence and are absent from the buildability pass entirely, because
   the candidate universe was two Western SaaS catalogues. That is a gap in METHOD, not a finding
   about the platforms. The GREEN list below is a ranking of what was researched.
2. **The site advertises thirteen platforms and three exist.** `_sections/IntegrationsStrip.tsx`
   and `_sections/IntegrationsMap.tsx` name thirteen; `SOURCES` holds six. There is a full
   connector page at `app/connectors/shopify/page.tsx` for a source not in the enum, and the map's
   body copy reads "Connect global platforms like Google Ads, Meta, Shopify, and Stripe" — half of
   that sentence is fiction today.
3. **The read-only pillar collides with the three best connectors.** LINE's channel access token
   can broadcast to every follower. Omise's secret key can create charges and refunds. Google's
   `drive.file` can edit and delete the files the customer picks. For the top of this build order,
   "read-only" is a promise about OUR behaviour rather than a constraint the platform enforces.
   Whoever writes the trust copy needs that decided before they write it, or the first security
   questionnaire will decide it for them.

---

# THE BUILD ORDER

**Status of this document.** It is a synthesis of two research passes: a buildability pass over the Supermetrics/Windsor catalogue universe, and a Thai market-demand pass. Every fact below is carried forward with the marker the source pass gave it. I have upgraded nothing. Where the two passes disagree, Section 5 names the disagreement rather than picking a winner silently.

**One structural fact that shapes everything.** The buildability pass enumerated its candidates from `supermetrics.com/connectors` and `windsor.ai/data-integration/`. Those catalogues are Western-biased, and the consequence is severe: **Shopee, Lazada and TikTok Shop — the three platforms the market evidence puts at the top — were never given a buildability pass at all.** The ecommerce family says so explicitly ("I deliberately spent the time on Shopify and the unresearched Western platforms instead"). So the GREEN list below is a ranked list of *what was researched*, not of what exists. Read Section 5 before treating the GREEN list as the opportunity set.

**What the product reads today** (`packages/contract/src/source.ts`): `google_ads`, `meta_ads`, `ga4`, `search_console`, `woocommerce`, `loyverse`, plus the affiliate/SERP vocabulary (`impact`, `awin`, `cj`, `partnerstack`, `dataforseo_serp`, `ai_answers`). Air4Thai is in flight and not yet in the enum.

---

## 1. THE GREEN LIST, RANKED BY VALUE TO A THAI SME

Forty-three platforms cleared GREEN. Ranked on value first, ease second, exactly as instructed. A marker in brackets says what the Thai-market pass actually found: **[TH-evidence]** = a Thailand-specific figure I can point at; **[TH-none]** = the market pass found no Thailand evidence either way, so the ranking is argued, not evidenced; **[TH-negative]** = Thailand evidence exists and it argues *against*.

**Band A — worth building for this market**

1. **LINE Official Account** [TH-evidence] — 56M MAU vs Facebook's 51.5M (DataReportal, VERIFIED); ~6M OAs (LY Corp, VERIFIED); >90% SME-held (LINE Thailand via Marketing Oops, VERIFIED but 2022). The only GREEN connector that reaches all six target segments — cafés, salons, clinics, guesthouses and sellers all run an OA.
2. **Google Sheets (drive.file + Picker)** [TH-none] — the fallback that makes the un-connectable connectable. In a market where the readable systems are thin, the sheet is often the system of record. No review, no fee, `drive.file` currently Non-sensitive (VERIFIED).
3. **Omise / Opn Payments** [TH-evidence] — Thai-domiciled gateway covering PromptPay, TrueMoney QR, ShopeePay QR and Rabbit LINE Pay. `GET /charges` returns amount, fee, **net** and refunded_amount in one call — the cleanest money shape in the whole research.
4. **Stripe** [TH-none] — cross-border and online Thai sellers; the single best read-only credential anywhere in this research (per-resource Read/Write/None restricted keys); and the homepage already promises it.
5. **Amazon S3 / object storage** [TH-none] — reaches any customer with an export pipeline, including POS and ERP vendors that publish no API at all. AssumeRole + external ID is the only genuinely clean vendor-side credential model found.
6. **Shopify** [TH-negative] — GREEN and buildable today via custom distribution with real `read_*` scopes; but 4,256 live Shopify stores in all of Thailand (Storeleads, VERIFIED, 4 Sep 2026) against ~3M marketplace sellers. See Section 5.
7. **PayPal** [TH-none] — cross-border sellers and freelancers; Transaction Search gives gross and fee. Self-serve only because the credential is the merchant's own REST app.
8. **Zoho Books** [TH-none] — the only accounting platform in the research whose API works on the vendor's **free** plan (1,000 calls/day), with clean `.READ` scopes.
9. **Zoho CRM** [TH-none] — same self-serve OAuth, explicit `ZohoCRM.modules.READ`; fits clinics and salons running a pipeline.
10. **Airtable** [TH-none] — where small ops teams actually keep inventory, jobs and CRM; any user on any plan can mint a `data.records:read` token unaided.
11. **Notion** [TH-none] — same shape as Airtable; public OAuth connections work unlisted, no review.
12. **HubSpot** [TH-none] — free-tier CRM with genuine `crm.objects.*.read` scopes and private apps needing no review; also already promised on the homepage.

**Band B — clean to build, no Thai evidence, real elsewhere**

13. **Square** — best-factored read model in payments (`PAYMENTS_READ`, `ORDERS_READ`, `PAYOUTS_READ`); but Loyverse is already the POS pilot and Square has no Thai footprint.
14. **Klaviyo** — the best-documented reporting API found (40+ metrics including revenue per recipient and AOV); email is a weak channel in a LINE-first market.
15. **Brevo** — explicit `:read` scopes and docs that say "no form, no manual approval"; same email-channel caveat.
16. **Mailchimp** — biggest name in the category, but no read-only credential exists (keys "grant full access").
17. **Bing Webmaster Tools** — the structural twin of Search Console (already built) with a `Webmaster.read` scope and no Google verification queue. Cheapest incremental connector in the list.
18. **Microsoft Advertising** — the Bing/Copilot ads counterpart; SOAP, and the only scope is `msads.manage`, which also writes.
19. **Matomo (On-Premise)** — free forever, customer owns the whole instance; the privacy-first GA4 alternative.
20. **BigCommerce** — store-level read-only API accounts (`store_v2_orders_read_only`), zero review.
21. **Wix** — unlisted install link, explicitly no App Market submission needed, real read scopes.
22. **Adobe Commerce / Magento 2** — per-ACL read access; every merchant is a bespoke install with its own URL and WAF.
23. **PrestaShop** — per-resource view permissions; same per-install support cost.
24. **Squarespace Commerce** — self-serve key, but no read-only permission and two official pages contradict each other on the plan floor.
25. **Adyen** — self-serve Report user credential, but there is no "list my payments" endpoint: webhook + CSV pipeline, and every Adyen merchant is enterprise-contracted.
26. **eBay** — cross-border sellers; confidence UNVERIFIED throughout (developer.ebay.com returned 403 to every attempt) and a 5,000 calls/day default keyset ceiling.
27. **FreshBooks** — clean `:read` scope grammar; services businesses.
28. **Zoho Sheet** — clean OAuth; only earns its place where the customer already lives in Zoho.
29. **Pipedrive** — `deals:read`/`contacts:read` on OAuth; the personal-token route is unambiguous and self-serve.
30. **Intercom** — read scopes and unlisted OAuth install; must be OAuth (token-paste violates Intercom's ToS). A support tool, not a revenue source.
31. **Customer.io** — scoping exists, read-only scoping UNVERIFIED; developer-heavy audience.
32. **ActiveCampaign** — one per-user token, no scopes, account-specific base URL.
33. **Omnisend** — the Orders/Contacts permission bundles delete rights; no read-only option.

**Band C — GREEN and near-worthless; do not confuse cheapness for value**

34. **Cloudflare Web Analytics** — genuinely read-only token, but GraphQL, a per-property `siteTag`, and sampled counts that will never tie out against GA4 on the same dashboard.
35. **Fathom** — real read-only token, but every API call bills against the customer's own pageview quota.
36. **Umami** — full-access key only; two auth paths (cloud vs self-hosted).
37. **Apple Search Ads** — strongest read-only model found (identity-layer roles), but only serves app advertisers and asks the customer to run `openssl`.
38. **Snapchat Ads** — no read-only scope; requires standing up our own Snap Business Manager org first.
39. **Reddit Ads** — clean `adsread` scope, but needs our own verified Reddit business and carries an undocumented-allow-list risk.
40. **Vercel Web Analytics** — Hobby customers give 1 month of window and no custom events; the token is account-wide.
41. **Microsoft Clarity** — 10 API requests per project **per day**, data confined to the previous 1–3 days, 1,000 rows, no pagination. You cannot build a time series.
42. **Telegram** — one number, member count. No view or engagement data exists via the Bot API, despite the Telegram app showing owners rich post stats.
43. **Discord** — two explicitly *approximate* counts and no history.

---

## 2. THE NEXT FIVE

The homepage advertises thirteen platforms. `apps/web/app/_sections/IntegrationsStrip.tsx` and `IntegrationsMap.tsx` name: Google Ads, Meta Ads, **Shopify**, **TikTok Ads**, **HubSpot**, **Stripe**, **YouTube**, Google Analytics, **Google Sheets**, **BigQuery**, **Looker**, **LINE**, **Shopee**. Only three of those exist in `SOURCES`. The map's own body copy reads "Connect global platforms like Google Ads, Meta, Shopify, and Stripe" — half of that sentence is fiction. There is also a full connector page at `apps/web/app/connectors/shopify/page.tsx` for a source that is not in the enum.

That is the second axis for choosing the five: which builds retire the most fiction.

**1. LINE Official Account** — build now, no gate.
Highest Thai value of any GREEN platform and the only one reaching every named segment. Unlocks the customer-relationship channel, of which the product currently sees nothing: follower count over time, audience demographics, message delivery volume, per-broadcast interaction, rich-menu taps (`/v2/bot/insight/*`, VERIFIED at developers.line.biz). It retires the `line` chip on the homepage strip. Beat the alternatives because it is the only connector that is simultaneously top-of-market, GREEN, free, and self-serve.
Carry three caveats into the ticket: (a) the channel access token is **not read-only** — the same credential can broadcast to every follower, and LINE offers no narrower credential, only shorter-lived ones; (b) statistics below 20 return `null` by design, which is exactly the Thai SME case, so the UI must say "suppressed by LINE", not "0"; (c) **whether insights work on a 0 THB Free-plan OA is UNVERIFIED** — no page ties insights to a paid plan, but no page says they are free either. Test against a real Free-tier OA in the first hour. It decides whether the smallest merchants can onboard at all.

**2. Shopee Seller — one-day gate check first, then build.**
Largest addressable population by an order of magnitude: ~3 million sellers on Shopee/Lazada/TikTok Shop (trade.gov, VERIFIED), with Shopee and Lazada "commanding over 80% of Thailand's e-commerce market" (Nation Thailand citing Priceza/Creden, VERIFIED). Unlocks the actual revenue and order data of the online-seller segment — something WooCommerce cannot reach here, and retires the `shopee` chip.
**I cannot give this a tier. Shopee Open Platform was not researched.** The gate check is one day and answers three questions: is app registration self-serve or partner-gated; does a read-only scope exist; is there a review queue with a published timeline. Start it on day one in parallel with the LINE build so it does not serialize — the honest possible outcome is RED.

**3. Google Sheets (drive.file + Picker)** — build now, no gate.
Unlocks every customer with no readable platform at all: the salon's booking sheet, the clinic's takings tab, the guesthouse's occupancy log. Retires the `googlesheets` chip. Beats Stripe and HubSpot for this slot because it is the only connector whose addressable market is "anyone", and because it is the honest answer to a market where the most common systems have no API.
Verified and load-bearing: `drive.file` is currently classified **Non-sensitive**, and Google's own Requesting Minimum Scopes article says "Since drive.file is non-sensitive, an additional security assessment will not be necessary" — so no verification queue, no CASA. Multi-select is real (`google.picker.Feature.MULTISELECT_ENABLED`, VERIFIED). Caveat that must reach whoever writes the trust page: **`drive.file` is not read-only** — Google's own wording is "See, edit, create, and delete only the specific Google Drive files you use with this app." The read-only Google scopes (`spreadsheets.readonly`, `drive.readonly`) are Sensitive and Restricted respectively. There is no option that is both narrow and read-only.

**4. TikTok Shop Seller — one-day gate check first, then build.**
Fastest-growing commerce surface: TikTok Shop + Tokopedia reached two-thirds of Shopee's regional GMV (Momentum Works via Yicai, VERIFIED), Statista names TikTok Thailand's most-used purchase platform (VERIFIED as a claim on their page), and TikTok is #2 in Thai digital ad spend ahead of YouTube (DAAT × Kantar, VERIFIED).
Same caveat as Shopee, and one clarification that will otherwise waste a week: **the TikTok research in hand covers the organic/creator Display API only** (AMBER — mandatory app review, 1–5 demo videos, no published timeline, but a sandbox that lets you build during the queue). TikTok Shop and TikTok Ads are separate products with separate access regimes that were not evaluated. `business-api.tiktok.com/portal/docs` returned effectively empty content to the researcher.

**5. Omise / Opn Payments** — build now, no gate.
Unlocks money-in for online-checkout merchants, and it is the only payments connector in the set that is Thai-domiciled and covers PromptPay, TrueMoney and Rabbit LINE Pay. `GET /charges` gives gross, fee, net, status and refunded_amount directly — gross revenue, fee load and refund rate fall out of one endpoint.
Two things onboarding must handle: the live secret key is **displayed once, for 15 minutes, ever** (Opn's own FAQ), so a customer who set up months ago must roll their key — which breaks whatever else uses it; and the secret key is **not read-only** (the key that reads charges also creates charges and refunds).

**Runner-up, named so it is not lost: Lazada Seller**, which completes the marketplace trio and carries the same unresearched-buildability caveat.

**What I am explicitly recommending you do NOT build, despite the marketing page.** Shopify. It is GREEN, the page exists, and the Thai TAM is 4,256 stores (VERIFIED). Deleting or reframing `/connectors/shopify` is cheaper than building a connector for four thousand businesses — and the page needs attention anyway, because the admin-created custom app flow most Shopify guidance describes no longer exists ("You can no longer create new admin-created custom apps"; new custom apps blocked in the admin from 1 January 2026). If the page stays, it must describe custom distribution from the Dev Dashboard, not the old Settings → Develop apps path.

---

## 3. THE AMBER LIST, WITH WHAT IT COSTS

A queue you can start today while building something else is a cheap AMBER. A queue you cannot start until you already have customers is an expensive one. Sorted by that distinction.

**Start the queue now — the wait is the cost, the work is small**

| Platform | Gate | What the docs say about the wait |
|---|---|---|
| **Meta: Facebook Pages, Instagram, WhatsApp** | Advanced Access, which requires **Business Verification**. Standard Access only works for users who hold a role on our own app, so it is a dead end. | **No SLA is published on any Meta page read.** Blog figures of 24 hours to 20 days are UNVERIFIED. Business Verification is **serial** with App Review for some permissions, not parallel. |
| **YouTube (Data API v3 + Analytics)** | Google OAuth verification, then a separate quota audit above the default 10,000 units/day. | Sensitive-scope verification "typically takes 3-5 business days" (VERIFIED, for sensitive scopes generally). **Whether the YouTube scopes are classified sensitive is UNVERIFIED** — Google's master scope page truncated before the YouTube section. Quota audit has no published SLA: "A member of YouTube's API Services team will contact you as soon as possible." |
| **TikTok organic (Display API)** | Mandatory app review before any real user; 1–5 demo videos up to 50MB; app freezes during review. | **No timeline stated anywhere on the page.** Mitigation: sandbox mode lets you build and validate the whole connector without submitting, so the queue blocks nothing. |
| **Pinterest Ads** | Trial access, then Standard (requires a screen recording of the OAuth flow). | Trial: "Application requests are reviewed each business day" — the only concrete review cadence in the entire ads family. Standard: "reviewed regularly", no day count. Standard is effectively mandatory for multi-tenant because Trial is rate-limited *per app per day*. |
| **LinkedIn Ads** | Apply for the Advertising API product on the app's Product tab. | **No timeline published.** Explicit discretion clause: "LinkedIn reserves the right to review applications and select partners at its discretion and a partner might not be upgraded even if they meet these minimum requirements." Good news: the Development tier already grants *unlimited read* on ad accounts the member administers — the 5-account cap is a **write** cap, so a read-only BI product may never need the upgrade. |

**Meta is the one to start this week.** One Business Verification unblocks three connectors, and Facebook Pages has the strongest Thai case of the three: Krungsri's 2021 SME survey (VERIFIED, n=522) put Facebook at 86% among social sellers, ahead of LINE at 68%. Note the survey predates TikTok Shop entirely. Also prefer **Instagram API with Instagram Login** over the Facebook Login variant — it drops the linked-Page prerequisite, the most common SME onboarding failure.

**Expensive AMBER — cannot be pre-cleared, or the paperwork is company-identity work**

| Platform | Gate | Cost |
|---|---|---|
| **Dropbox** | Production approval. | Cannot be requested early: applications "will not be reviewed until your app has linked with at least 50 Dropbox users", then two weeks to complete. **No turnaround published.** You ship, then race a clock you did not start. |
| **Microsoft Graph (Excel/OneDrive/SharePoint)** | Publisher verification for a multitenant app requesting anything beyond basic sign-in. | Free ("Microsoft doesn't charge developers for publisher verification"), but requires a Partner One ID on a verified Microsoft AI Cloud Partner Program account that is the partner global account, plus a DNS-verified non-`onmicrosoft.com` domain. "Verified in minutes" only if that CPP account already exists. Separately: **consumer OneDrive is not supported by the Excel API at all.** |
| **QuickBooks Online** | Intuit app assessment questionnaire, required for **all** apps touching production data, listed or not. | Described as 30–40 minutes to complete; "in most cases, the assessment process is fast". **No day count published.** All Intuit figures are UNVERIFIED — help.developer.intuit.com returns a CSS-error shell to fetchers. |
| **Ecwid (Lightspeed)** | Multi-store install requires emailing API Support; there is no self-serve multi-store link. | No documented process, criteria or timeline; the App Market publication page 404s. |
| **Etsy** | Two sequential manual reviews: Personal App, then Commercial Access. | "Review time may vary." Also a hard UI obligation: a specific trademark disclaimer must appear "in a prominent position" in our product. |
| **Salla** | Verified Salla Partners account — a personal **ID check** — before any app can be created. | No timeline. Token lifetimes are short for BI: access 14 days, refresh 1 month, so a dormant dashboard silently disconnects. |

None of Dropbox, Graph/Excel, QuickBooks, Ecwid, Etsy or Salla has any Thailand evidence behind it. Start none of those queues on spec.

---

## 4. WHAT TO REFUSE, AND WHY

Each of these costs a week to discover. The gate is quoted so nobody has to rediscover it.

**Refused because a human must agree before you can start**

- **Criteo** — no independent sign-up. "Contact your Criteo representative to create an account… If you don't have credentials, please contact your Criteo account representative for access." The onboarding checklist reads like a clean self-serve funnel; the gate is one page upstream.
- **Taboola** — "Ask your Taboola Account Manager to provide you with a `client_id` and `client_secret`." No portal, no form, no timeline. Every customer would have to phone their own account manager and paste both halves of a secret.
- **Outbrain** — "Currently, the Amplify API is available for a select number of partners by request." Independently fatal: the primary documented auth path base64-encodes the customer's **actual Outbrain username and password**.
- **Amazon Ads** — "The Amazon Ads API requires an application and approval process before access is granted", with software vendors routed via the Partner Network. Confidence UNVERIFIED: advertising.amazon.com/API/docs is fully client-side rendered and returns a 36-byte body to every fetch method tried, including raw curl. Someone must open it in a browser before this is settled.
- **Amazon SP-API** — four independent gates: business identity verification (company registration number, government ID, bank statement), a full security review for public developers, a **mandatory** Appstore listing, and website guidelines requiring a live public site that "must clearly display your app or service's pricing structure" *before* you apply. Amazon states outright that meeting the guidelines "does not guarantee approval."
- **Google Business Profile** — approval gated on already operating a business: you must "Manage a Google Business Profile that is verified and active for 60+ days" plus a website for that business. **No timeline is published at all.** And the only documented scope is `business.manage` — read *and* write over the customer's public listing, hours, photos and replies. Two gates, and the read-only pillar cannot be honoured even after approval. (Genuinely painful, because its DailyMetric set — `CALL_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`, `BUSINESS_FOOD_ORDERS` — is the single most relevant offline-intent dataset for a Thai restaurant or clinic. Apply anyway if someone has a spare hour; it blocks nothing.)
- **Adobe Analytics** — three-legged OAuth starts "In Development" with a beta-user email list, and production promotion "may be required" depending on the API, which means asking Adobe. Wrong product for an SME dashboard regardless.
- **Slack workspace analytics** — the app must be "installed by an Admin or Owner of an Enterprise organization", org-wide. Unreachable for an SME. Note the tier flips entirely by scope: ordinary Slack read scopes are GREEN and return no business numbers at all.
- **LINE module channels** (sub-path, not a platform) — the only route to attaching to a customer's OA without a token paste is "available only to corporate customers who have made the prescribed applications", via a LINE sales representative, and only one module can bind to an OA at a time. The token-paste path is what keeps LINE GREEN. Do not go here.
- **Adyen partner OAuth**, **PayPal third-party partner access**, **Apple's third-party OAuth registration** (`ads-registration@group.apple.com`) — all RED sub-paths of platforms whose *other* path is GREEN. Take the other path.

**Refused because the customer must be on a paid tier of the platform**

- **Xero** — new developer pricing took effect **2 March 2026** (already live): free to 5 connections, then the 6th requires payment details and moves you to Core at **$35 AUD/month** with a 10 GB/month egress allowance and **$2.40 AUD/GB** overage, plus mandatory App Certification (≈5 working days to complete the assessment, then 5–10 working days for Xero to assess). Technically the best-designed accounting connector found; commercially RED from customer number six.
- **Plausible** — "Stats API is a Business plan feature." The typical Plausible SME is on the cheaper Growth tier.
- **Wave** — reported Pro/Advisor plan requirement to grant app access. **UNVERIFIED**: developer.waveapps.com and support.waveapps.com both returned 403 to every attempt, and one search summary directly contradicted another. Confirm with a browser before writing Wave off.
- **Hotjar** — reported Scale-tier gate, **UNVERIFIED** (help.hotjar.com 403'd three times). Wrong shape anyway — the API exports recordings, heatmaps and survey responses, not aggregate metrics — and hotjar.com now 301-redirects to contentsquare.com, so the owner is changing.
- **Salesforce** — the blocker is the *customer's* edition, not a review: Professional Edition "needs to order the Web Services API product through your Account Executive"; **Group and Essentials cannot buy API access at any price** (help.salesforce.com article 000385436, VERIFIED).
- **Smartsheet** — paid plan on **both** sides: our own registration email "must belong to an existing licensed Smartsheet user on a Business plan or higher", and the customer needs Business or Enterprise to generate a token.
- **FlowAccount** — OpenAPI behind a request form, requires the customer's **Pro Business package or higher**, "pay when you go live", volume pricing by phone or email to sales.
- **PEAK Account** — requires **PEAK PRO Plus at ฿12,000/year or above** plus a consultation Typeform; free UAT for 3 months then payment on go-live. Whether there is a separate API fee on top of the plan is not documented publicly.

**Refused for a reason nobody expects**

- **X / Twitter Ads** — the queue is short (a form, "Allow up to 3 business days for review"). It is RED because of a clause in the Ads API Agreement that no developer doc warns you about: **Exhibit A-1 §1, "Paid access to the Company Service must be priced on a fixed or variable percentage of spend fee structure."** A flat-rate BI subscription appears not to comply. X also decides read vs read/write "in its sole and absolute discretion". Both are click-through, no fee, no NDA — but they constrain this product's own pricing model. If X is ever seriously considered, a lawyer reads Exhibit A-1 before any engineering time. Negligible Thai relevance makes this an easy refusal today.
- **2C2P** — there is no self-serve bulk read API at all. Transaction Status Inquiry checks one transaction at a time by `paymentToken`. The actual data arrives as daily reconciliation CSVs over **SFTP**, and the merchant "must complete the SFTP setup form and submit it to the support team" — a bespoke human request per customer. Also, the secret key that would read is the same key that signs payments and refunds.

---

## 5. WHERE THE TWO LISTS DISAGREE

**a) The three most valuable platforms in Thailand were never researched for buildability.**
Shopee, Lazada and TikTok Shop sit at the top of the market evidence (~3M sellers, VERIFIED; 99% combined regional share for Shopee/Lazada/TikTok Shop, VERIFIED) and are entirely absent from the buildability pass, because the candidate universe was two Western SaaS catalogues. This is the single largest gap in the evidence base, and it is a gap in *method*, not in the platforms. Two of the five recommended builds are therefore spikes rather than tickets. Close this before the next roadmap conversation.

**b) Shopify: a marketing page for a connector with a four-thousand-business market.**
GREEN, buildable, already advertised at `apps/web/app/connectors/shopify/page.tsx` and in the homepage map copy — and 4,256 stores in the whole country (VERIFIED). Building it to make the page true costs a sprint and serves a rounding error; changing the page costs an afternoon. The tension is real if the customer base skews expat or cross-border, which no evidence in hand establishes either way. **Note the related gap: I found no count of WooCommerce stores in Thailand, and `woocommerce` is already built.** Worth closing, since the same argument may apply to a connector that already shipped.

**c) FlowAccount: the only Thai accounting platform with a number, and it is RED.**
The market pass says "if you build accounting, build FlowAccount" (160,000+ businesses, self-reported and internally inconsistent with the same page's "130,000 users", no dates). The buildability pass puts it RED: request form, Pro Business plan minimum, sales conversation for production pricing. PEAK is RED on the same shape at ฿12,000/year. So the accounting family for Thailand is: the platforms people use are gated, and the platforms that are open (Zoho Books, FreshBooks, Xero pre-tier) have **zero Thailand adoption evidence found**. There is no clean answer here — only a choice between paying a gate and serving nobody.

**d) Payments: the highest-value data is the least readable.**
PromptPay is how a Thai café actually gets paid (2C2P/IDC: domestic payments 26%, wallets 29% of 2026 ecommerce volume; "over 90 million" PromptPay registrations). Every readable path is a *gateway* — Omise/Opn (GREEN), 2C2P (RED), GB Prime Pay (UNKNOWN) — which reaches only merchants running online checkout, a far smaller population than "businesses that take PromptPay". No page was found offering an ordinary Thai SME self-serve programmatic access to its own bank transaction history; Krungsri, SCB, KBank and Bangkok Bank all run developer portals that appear to be corporate-agreement products (none fetched). Stated precisely: *no such page was found*, which is not proof none exists.

**e) Instagram costs a Meta review and buys Thailand's fifth-largest surface.**
20.6M Instagram users vs LINE's 56M (VERIFIED). The verification is worth doing — but for **Facebook Pages**, the other half of the same unlock, where Krungsri's survey puts Facebook at 86% among social sellers. Do not let Instagram be the reason you start the queue; let Pages be.

**f) Trivially GREEN, and nobody here uses them.**
Telegram, Discord, Snapchat, Reddit, Apple Search Ads, Squarespace, PrestaShop, Wix, BigCommerce, Vercel, Microsoft Clarity. Each is a day or two of work and returns either nothing (Telegram's one member count; Discord's two approximate counts; Clarity's 10 calls/day and 72-hour window) or nothing Thai. **Ease is not a reason.** The most likely way this build order goes wrong is somebody clearing four of these in a week and calling it four connectors.

**g) The food-delivery gap, which may be larger than anything in either list.**
LINE MAN holds 41% of Thai food delivery GMV behind Grab's 47%, with **700,000 restaurants** on its roster and ~10 million MAU (Nikkei via KrASIA citing Momentum Works, VERIFIED). Two of the six target segments are F&B. **No public merchant API was found for LINE MAN Wongnai or GrabFood** — and that is an unresearched gap, not a negative finding. It deserves the same one-day spike as Shopee.

**h) The read-only pillar collides with the three best connectors.**
LINE's channel access token can broadcast to every follower. Omise's secret key can create charges and refunds. Google's `drive.file` can edit and delete the files the customer picks. WhatsApp's documented Tech Provider route requires Advanced Access to the *message-sending* permission. The platforms with genuinely enforced read-only credentials — Stripe, Square, Zoho, Pinterest, LinkedIn, Brevo, Apple, Reddit — are largely the ones with the weakest Thai case. Whoever writes the trust and security copy needs this decided before they write it: "read-only" is, for the top of this build order, a promise about our behaviour rather than a constraint the platform enforces. Say that honestly or the first security questionnaire will say it for you.

---

## 6. WHAT COULD NOT BE ESTABLISHED

Carried forward unchanged. Nothing here is upgraded by having been restated.

**Load-bearing and worth closing this week**

1. **Whether LINE insight endpoints work on a 0 THB Free-plan OA.** UNVERIFIED. No page ties insights to a paid plan; no page says they are free. Decides whether the smallest Thai merchants can onboard. Test empirically.
2. **Shopee, Lazada and TikTok Shop seller API access terms.** Not researched at all. Self-serve or partner-gated; read-only scope or not; review queue or not — all unknown.
3. **Thailand-specific Shopee/Lazada/TikTok Shop GMV shares.** Only the *regional* split was read. The widely-quoted "Thailand GMV US$35.5bn" and "Shopee >50% share in Thailand" come from a Momentum Works report whose press release PDF returned 403; Bangkok Post returned 451. UNVERIFIED.
4. **Whether a public merchant API exists for LINE MAN Wongnai or GrabFood.** Not investigated.
5. **The Thai payment split.** Two credible, commercially motivated sources materially disagree (2C2P/IDC: wallets 29% / domestic 26% / cards 24% / COD 16%; an unverified Worldpay-shaped alternative: bank transfer 44% / wallets 25% / COD 15%). Bank of Thailand's payment statistics tables are one level below the landing page fetched, and were not pulled.

**Platform facts that could not be read**

6. **Amazon Ads** — scopes, terms of use, any security-assessment requirement, any review timeline. The docs site returns a 36-byte body to all automated fetches. The "72 hours" and "security assessment" figures in search results were never seen on an Amazon page.
7. **Reddit Ads** — the official v3 docs describe fully self-serve app creation with no approval anywhere; three third-party blogs assert an undocumented sales-team allow-list based on advertiser status and spend. No Reddit-owned page confirms it; business.reddithelp.com is JS-rendered and would not load. Test with a throwaway business account before committing a sprint.
8. **eBay** — everything. developer.ebay.com returned 403 to every WebFetch and curl attempt. The scope strings, the "free to join", the 5,000 calls/day default and the "3–5 business days" Growth Check response are all search-summary derived.
9. **QuickBooks Online** — tier names, the 500,000 CorePlus credits figure, and the entire rate card. help.developer.intuit.com serves a CSS-error shell; blogs.intuit.com redirects to a 403; the App Partner Program Guide PDF could not be text-extracted. Treat the *shape* (reads metered, Builder free, hard block, questionnaire required even for private apps) as reliable and every *number* as unconfirmed.
10. **Wave** — Pro-plan gate. Both developer.waveapps.com and support.waveapps.com 403'd; two summaries of those pages contradict each other.
11. **Hotjar** — Scale-tier gate. help.hotjar.com 403'd on all three article URLs tried.
12. **GB Prime Pay** — tier UNKNOWN, not guessed. doc.gbprimepay.com renders empty to a fetcher; globalprimepay.com/developer returns HTTP 500. Three specific questions remain open: does the merchant self-generate the public/secret/token keys; does any endpoint list transactions by date range; is there any read-only credential.
13. **Criteo** — whether a read-only authorization level exists. The app-scope page was never read.
14. **Smartsheet** — the scope list and whether a read-only scope exists. The current API reference was only reachable as a page marked "(DEPRECATED site)". The RED tier rests on the two plan requirements, which *are* verified.
15. **Salesforce** — connected-app mechanics and the OAuth scope names. Both help.salesforce.com articles returned a JS loading error; developer.salesforce.com returned 403. The edition/fee fact *is* verified; the app-creation flow is not.
16. **Pipedrive** — whether an unlisted private OAuth app can install into customer accounts without review. Widely repeated, but the registration page actually fetched documents only the public/marketplace flow. GREEN rests on the personal API token, which is unambiguous.
17. **ActiveCampaign** — plan tiers and App Studio terms (help-centre 403). **Customer.io** — scope names. **Omnisend** — plan requirement, and several api-docs pages 404'd.
18. **Google/YouTube scope sensitivity** — whether `youtube.readonly` and `yt-analytics.readonly` are formally classified sensitive. Google's master scope page truncated before the YouTube section.
19. **Zoho multi-datacentre behaviour** (`.com` / `.eu` / `.in` / `.com.au`) across Books, CRM and Sheet. Only `accounts.zoho.com` was ever seen documented. Do not assume one auth host serves every customer.
20. **Zoho Sheet** — whether `ZohoSheet.dataAPI.READ` alone suffices for all fetch endpoints. Zoho's own examples always pair READ with UPDATE.
21. **Meta review and Business Verification timelines** — no SLA on any Meta page read. Do not put a date in a plan.
22. **Facebook Page Insights deprecations after November 2025** — the Nov 15 2025 removal of `impressions` and `page fans` is VERIFIED on Meta's own blog; a further June 15 2026 round covering unique-reach and unique-video metrics was reported only by third parties. Build the connector to discover metrics and degrade on an invalid-metric error rather than hardcoding a schema.
23. **WhatsApp** — whether the merchant must hold a payment-method-backed WABA. If yes, WhatsApp moves toward RED for SMEs on the plan rule.
24. **Discord** — the bot-verification threshold and privileged-intent gate at scale. The commonly cited 100-server figure was not confirmed on a Discord page.
25. **Non-AWS S3-compatible stores** (R2, MinIO, Wasabi, B2) — no vendor docs fetched. The one thing known by construction is that AWS's AssumeRole/external-ID pattern is AWS-specific, so those are static-key-only and reintroduce the vendor-held-credential problem.
26. **Shopify public app review timeline, Ecwid App Market terms, Etsy Commercial Access timeline, Salla review timeline, Amazon approval timeline** — five platforms that publish no number. Any roadmap that assumes one is assuming.
27. **Thailand adoption of Xero and QuickBooks** — no figures found from any readable source. That is a gap, not evidence of low adoption, though the absence of Thailand-specific marketing from either vendor points the same way.
28. **Clinics, salons and hotels** — no Thailand-specific software-adoption data found for any of them. The claim that independent Thai hotels depend on Agoda/Booking.com at 15–25% commission is plausible, unsourced, and should not be planned against.
29. **A general caution that applies to roughly half of everything above.** For most platforms the finding is "the documentation describes API access and never mentions a fee". That is **not** a page stating the API is free. No fee figure appears anywhere in the ads family at all. Google's CASA assessment requires a "Google-approved third party" assessor annually and says nothing about who pays — treat CASA cost as genuinely unknown, not as zero.

---

**Files referenced (read-only; nothing was modified):**
- `packages/contract/src/source.ts` — the `SOURCES` enum; append-only, and the place a new connector's vocabulary lands.
- `apps/web/app/_sections/IntegrationsStrip.tsx` and `apps/web/app/_sections/IntegrationsMap.tsx` — advertise 13 platforms; 3 exist.
- `apps/web/app/connectors/shopify/page.tsx` — a full connector page for a source not in the enum.
- `packages/contract/src/registry.ts` — the field registry every new connector must declare into.
