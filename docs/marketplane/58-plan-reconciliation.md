# 58. The plan against the repository: what is actually buildable

**Date:** 2026-09-12 &nbsp;·&nbsp; **Status:** research, no code

<!--
NOT a design note -- nothing was built. This is the research record behind the decisions the
founder now has to make, kept in the repository because its most valuable findings are NEGATIVE
and negative findings are the ones that get quietly forgotten and re-discovered.

Produced by eleven agents: six researching whether each source family the plan names has a
reachable API, four reading this repository against the plan's four capabilities, and one
reconciling both. Every external fact carries its own VERIFIED / UNVERIFIED marker and the URL it
came from. Agents were instructed that inventing an endpoint, a rate limit or a field name was the
worst available outcome, and that "I could not find public documentation" is a finding.

The plan is the founder-supplied BI mockup (design/marketplane, design/app, design/app-simple):
business intelligence for Thai small businesses, delivered as a morning brief, an action sheet,
plain-language Ask, and consolidated reports.
-->

---

# RECONCILIATION: THE PLAN vs THE REPOSITORY

**Provenance note, stated first because the rest depends on it.** Every external fact below is carried forward from the two research tracks with their own VERIFIED / UNVERIFIED markers preserved. I fetched nothing new and I have added no external fact of my own. Where the two tracks left something unverified, it stays unverified here — I have not upgraded anything by restating it. Repository claims marked **[spot-checked]** I read directly in this session; the rest are carried from the repository-gaps track.

---

## 1. WHAT THE PLAN PROMISES THAT CANNOT BE BUILT

### 1.1 The headline finding: the cafe on the mockup has no readable data source

The plan leads with cafes, bars and restaurants in Thailand. Take the canonical one — a Chiang Mai cafe running FoodStory, taking GrabFood and LINE MAN orders, banking with K PLUS. **Every single one of those sources is unreachable today, and three of them are unreachable in principle rather than on paperwork.**

| Source the plan names | Status | Why |
|---|---|---|
| FoodStory (Wongnai) | **No public API** | `api.foodstory.co` returns 401 "API key is required" — an API exists, no documentation, no developer portal, no merchant-facing authorise-an-app setting. Access runs through LINE MAN Wongnai, which acquired it in 2023. A partnership conversation, not an integration. |
| Ocha | **No API found at all** | No docs, no developer portal, no reachable API host. Unverified reports that it is offline-first, which would make cloud pulls structurally impossible regardless of any agreement. |
| StoreHub | **Docs password-gated** | `docs.storehub.com` answers 401, realm "StoreHub API docs (internal preview)", body "Ask WH for the password." Key issued by support to the account master email. "Extensive API access" is a Pro-plan feature. Credential is probably full-access, not read-only. |
| GrabFood | **Grab-issued partner credential** | Documented API, but `client_id`/`client_secret` come from Grab, not the merchant. Same `food.partner_api` scope covers AcceptOrder, CancelOrder, RefundOrder, UpdateMenu, PauseStore. No read-only scope exists. |
| foodpanda (restaurants) | **NDA + PGP + local rep** | Credentials issued PGP-encrypted after an NDA and a Foodpanda contact's go-ahead. It is a **push** architecture — you host a Plugin API and whitelist Delivery Hero's egress IPs. The only historical read is an Order Report Service covering **the last 24 hours**. |
| LINE MAN | **No public developer documentation of any kind** | Not a gap in the search. The only claim an API exists is third-party vendor marketing with no documentation behind it. |
| Booking.com | **Hard block, today** | connect.booking.com states verbatim that integrations with new connectivity providers are **paused until further notice**. The programme also presumes you are a channel manager loading a year of rates — not a read-only analytics tool. |
| K PLUS (KBank) | **Nothing to get approved for** | The public catalogue, read from the portal's own backend, is six products. The category literally named "Information" contains only Slip Verification. There is no balance, statement or transaction-history product. Security model is mTLS + IP allowlist + partner onboarding — the merchant authorises nothing with their own K PLUS login. |
| SCB | **Could not be verified at all** | `developer.scb.co.th` is NXDOMAIN; `developer.scb` returns 403 to the research network. Treat everything about SCB as an open question, not a finding. |

**The consequence for the mockup.** `design/app-simple/Brief.dc.html` shows a headline baht figure, a commission line and an ad-cost line for a Thai cafe. For a FoodStory + GrabFood cafe, none of the three can be fetched. The commission line in particular cannot be fetched even *after* a Grab partnership (see 1.2). The screens' own README already says the figures are invented and that they "depict surfaces that are not built" — that remains correct and must stay correct until a POS connector exists.

### 1.2 The after-fees number — the plan's premise — is not fetchable on the delivery platforms

This is the finding most likely to break a product promise quietly.

- **Grab:** the only object carrying a `commission` field (MerchantEarning) is documented verbatim as *"Only applicable for Dine out STO case. `null` if not applicable. Only present in submitOrder webhook. Not present in ListOrder response."* And `OrderPrice.Total` is documented as *"the total merchant-related amount calculated exclusive of commission charges."*
- **foodpanda:** the word "commission" does not appear anywhere in either the Partner API spec or the restaurant POS documentation.
- **Booking.com** is the only source in that family that returns a real per-booking `<commissionamount>` — and Booking.com is blocked.

So for GrabFood and foodpanda, "after fees" is a **modelled** number, not a fetched one. Grab's own marketing blog says "on average, we charge merchants around 15%–30% commission" — indicative only, not a contract, not per-merchant, not per-order. The repository already has the right vocabulary for this (`revenue` gross and `commission` as separate metrics, with the comment quoting 11A.2), but it has no mechanism to mark a figure as modelled rather than observed. `docs/SME-POSITIONING-AND-FINDINGS.md` §3.2–3.3 already defines observed / matched / modelled classes; nothing in `packages/contract` implements them.

**Putting the after-fees number at the top of a public page as the one number the page is about is exactly the assertion `docs/marketplane/38-marketing-site-visual-direction.md` §3 already refused**, and nothing has changed since.

### 1.3 The cash position is blocked by regulation, not by paperwork

- KBank has no account-information product at all.
- BOT's Project "Your Data" names permitted data receivers as *"financial service providers, initially those supervised by the BOT, SEC and OIC."* An unregulated SaaS is not an eligible receiver. Deposit-account data begins rolling out **around end-2026**, expanding through 2027–28.
- The commercial escape hatch is closed: Salt Edge's own Thailand coverage page renders **0 Banks**; Finverse's bank-data page does not mention Thailand. (Brankas was not checked — unverified either way.)

There is no amount of partnership effort with an individual Thai bank that changes this in the near term. **The bank-sourced cash position must be dropped or redefined.**

The honest substitutes are (a) ledger cash from Xero (`/Reports/BankSummary`, `/Reports/BalanceSheet`) or QBO — only as fresh as the customer's own bookkeeping — and (b) settlement-side cash-in from Stripe/marketplace payouts. Both must say "as booked, not as banked" on the figure.

And the repository cannot store either one honestly today: **every metric in the dictionary is a flow over a day; a bank balance is a stock at an instant.** `Aggregation` is `{sum}` or `{weighted_mean}` **[spot-checked]**. Summing seven daily balances gives a large, plausible, meaningless number — precisely the failure `aggregation` exists to prevent. The dictionary's *shape* has to change before `cash_balance` can exist.

### 1.4 The marketplaces are not three interchangeable OAuth connectors

All three have real per-merchant token grants, so the trust pillar is technically satisfiable on each. None is self-serve for us.

- **TikTok Shop** is the fastest realistic runway: a **custom app launches privately by authorisation link**, review triggered only at 25+ seller authorisations, the Connector category, or on Partner Center's demand. But a Connector app is defined as one that connects TikTok Shop to an external system — which is exactly what uniplain is — so plan for review from the start. ISV registration needs a company business certificate plus a compliance/legal review the docs say **takes three or more weeks**. **Unverified and load-bearing:** the region rule says cross-border partners (China/Hong Kong) may select TH and "local partners should choose only their local market." What a Singapore, US or EU entity may select for a Thailand target market **is not stated anywhere and could not be confirmed**. That must be asked of partner@tiktokshop.com, not guessed.
- **Shopee** ISV criteria are a chicken-and-egg for a pre-launch product: *"Your business product has to be live, with existing ecommerce integrations which are identifiable via a provided trial account."* You must already have a live product with existing ecommerce integrations before Shopee admits you. Review 10 working days. Separate Thailand trap: the seller-developer route lists TH as "Mall Sellers OR Managed Sellers" — an ordinary small Thai Shopee seller does not qualify.
- **Lazada** is the one that breaks a product assumption. Multi-tenant means the "ERP System" category, whose policy is *"Allow subscribers to authorize: you need to first release your app to the Lazada Service MarketPlace, and sellers need to order before authorization. The authorization duration will be the same as the subscription duration."* The self-serve-feeling alternative, "Seller In-house APP", is **capped at 30 authorised users**. There is no Lazada path that quietly scales to many Thai cafes without a Service MarketPlace listing and each merchant buying a subscription there first.

### 1.5 Two promises that the repository itself cannot express

**"A provisional marker until the platform finalises it."** For every POS and merchant-database source, nothing ever finalises. `restatement.ts` already has the precedent — `woocommerce` is `windowDays: null` **[spot-checked]**, the merchant's own database, every row provisional forever. Loyverse, StoreHub, Shopee, Lazada, TikTok Shop and the delivery platforms all land there. **Neither research track found a documented finalisation lag on any delivery platform.** The only number in the whole family with documentation behind it is Booking.com's 14-day `last_change` re-read window, and Booking.com is blocked — and even that is a retrieval window, not a finalisation guarantee. Any statement of the form "GrabFood's August figures restate until the 5th" has nothing behind it and must not be written.

**"35 runs a week with a confidence interval."** `ai_answers` is a source with a clock **[spot-checked]** but there is no metric it can write. `position` is a rank, not a citation count. And `is_provisional` cannot express "an estimate with a sample size" — `docs/marketplane/18-connector-roadmap.md` §226–231 already flagged this exact shape for sampled data and left it unresolved.

**"Read-only, never post or change anything."** True of Loyverse (granular `*_READ` scopes) and Xero (genuine read-only scopes). **Not true of** QuickBooks Online (one scope `com.intuit.quickbooks.accounting` covering read and write), FlowAccount (one scope `flowaccount-api`, likewise), GrabFood (`food.partner_api` covers refund, cancel, menu update, store pause), foodpanda, or StoreHub. On those, read-only is enforced by our code, not by the token. That is a materially weaker guarantee and must be worded as what we enforce.

### 1.6 Smaller unbuildables worth naming

- **Covers / spend per head from Loyverse: not available.** A grep of the full OpenAPI spec found no guest/cover/table/pax field; the only related field is a free-text `dining_option`. The one POS that is buildable cannot supply the metric the plan's cafe screens are built around. (Convergent with the repo: `docs/marketplane/24-commerce-grain.md` §5 already rejected `cover` and `room_night` once.)
- **Thai government public holidays: no free API.** Both live-tested negatives: Nager.Date returns HTTP 204 for TH; OpenHolidays lists 36 countries, none Thai. BOT gives *bank* holidays (free, OpenAPI, real schema) which is a good but imperfect proxy. Government public holidays need a curated in-repo calendar with the announcement source on every row.
- **Tourist arrivals: no machine-readable channel found.** TAT's developer API is a points-of-interest directory, not arrivals. Do not invent an endpoint. One authenticated call to BOT's `search-series` would settle whether a series exists.
- **Hourly takings is a grain problem, not a metric problem.** `date` is a calendar day and the upsert key has no time component. Derivable client-side from Loyverse receipts, but nowhere to *store* it.
- **Nothing in this repository runs on a timer.** `apps/api-edge/src/index.ts:358` passes `store: null` **[spot-checked]**, so both declared crons return `not_configured`. `app.due_connections` / `claim_connection` / `record_backfill` have **zero callers** in TypeScript **[spot-checked — the only hits are comments in `entitlements.ts`, `pricing/page.tsx` and the Shopify page]**. A product whose promise is "every morning" currently has no morning.
- **There is no insight generator and no LLM dependency** in any `package.json` in the workspace. `packages/connectors/src/sources/` contains exactly ga4, google_ads, meta_ads, search_console, woocommerce **[spot-checked]**. No Thai source exists anywhere in `packages/` or `supabase/` — Shopee appears only as a marketing SVG and a chip in `IntegrationsMap.tsx` **[spot-checked]**.

---

## 2. THE SHORTEST PATH TO ONE TRUE BRIEF

### 2.1 Buildable now, no approval, no partnership, no fee negotiation

| Source | Auth | What it gives |
|---|---|---|
| **Loyverse POS** | OAuth 2.0 + OIDC on the merchant's own login, granular read-only scopes, self-serve app registration | `/receipts` (cursor paging, `updated_at` filters, `receipts.update` webhook), `/shifts` (gross_sales, net_sales, expected vs actual cash), `/items`, `/stores`. Rate limit documented: 300 requests / 300 s per account. |
| **TMD legacy weather API** | Free self-service registration, `uid`+`ukey` query params, company-held | Station observations 8×/day, daily 07:00 obs, 7-day forecast by province, monthly rainfall back to ~2001 |
| **TMD NWP forecast** | Free registration, Bearer token | 2 km hourly forecast to 48 h, documented `cond` weather-condition enum, documented limits 60 req/min + 100,000 datapoints/hour |
| **Air4Thai** | **None** — unauthenticated GET | Hourly AQI, 174 stations. *Licence unresolved; see §4.* |
| **Bank of Thailand** | Free portal registration, API key in header | Financial-institution holidays (OpenAPI 3.0.1, exact schema read); FX reference rates; arbitrary statistical series |
| **DataForSEO** | HTTP Basic, self-serve, $1 free credits | LLM Scraper (real ChatGPT/Gemini), SERP `ai_overview`, `ai_mode` |
| **OpenRouter** | Bearer, self-serve | Brief generation, no markup on inference |
| **Xero** | OAuth on the customer's own login, **genuine read-only scopes** | P&L, Balance Sheet, Bank Summary; limits 60/min, 5,000/day per tenant |
| Already in the repo | — | ga4, google_ads, meta_ads, search_console, woocommerce |

Everything else in the plan is after-approval or blocked.

### 2.2 The minimum loop, concretely

**One business: a Thai cafe running Loyverse.** Not because Loyverse is the market leader — it is not, and the plan does not name it as a priority — but because it is the only POS in the world where a Thai owner-operator can click a consent screen today and the product can read their takings under scopes that literally satisfy every trust pillar as written.

**A source it can read:** Loyverse `/receipts` + `/shifts` over OAuth, using `RECEIPTS_READ`, `SHIFTS_READ`, `STORES_READ` and nothing else. Not the personal access token — the spec itself says that "gives unlimited access to the targeted account," which fails the pillar.

**A number it can compute — and this is the sharpest constraint in the whole plan:** with **zero dictionary changes**, exactly two existing metrics carry it. `revenue` (sum of receipt `total_money`, or shift `gross_sales`) and `orders` (receipt count). Average ticket is their quotient, computed at read, consistent with how `ctr` was handled. Everything else the plan's cafe screens show needs a dictionary change:

- margin → needs `cost_of_goods` (a currency metric — Loyverse line items do carry `cost` and `cost_total`, so the data is there, but the column is not, and a currency metric requires the fx-constraint guard fix first)
- covers / spend per head → **not available from Loyverse at all**
- after fees → for a Loyverse-only cafe there are no platform fees to deduct; the honest v1 brief says "takings," not "after fees"
- hourly takings → grain problem
- cash variance from `/shifts` (`expected_cash` vs `actual_cash`) → genuinely the best "anything unusual" signal in the whole Loyverse surface, and it has nowhere to live in the envelope

**A comparison it can make:** yesterday vs the same weekday over the trailing four weeks, from rows the store already holds. Context from TMD (rain, temperature) and BOT bank holidays — both free, both fetched once nationally and fanned out internally rather than per tenant.

**An insight it can generate:** OpenRouter `chat/completions` with `provider: { data_collection: "deny", zdr: true }` on every call, enforced in one shared request builder that cannot be bypassed, with a test that fails if either field is missing. `data_collection` **defaults to `"allow"`** — the safe behaviour is opt-in and a forgotten field silently permits providers that store and train. Record which model *and which provider* actually served each brief; default routing can serve the same request from a different provider run to run.

**A message it can deliver:** one channel adapter. See §4.3 — this is a decision, not a default.

**Every figure carries `fetched_at` and `is_provisional` from `packages/contract`.** Loyverse's clock is `windowDays: null` on the WooCommerce rationale, so `is_provisional` is permanently true, and the brief must say so in words rather than leaving it as a flag nobody explains.

### 2.3 What stands between here and that brief

Nothing in the list above is the hard part. The hard part is that **the scheduled half of this system has no identity.** `app_webhook` and `app_scheduler` are `NOLOGIN NOBYPASSRLS`, the `app` schema is not exposed to PostgREST, and `packages/store/src/jwt.ts` can mint only `anon | authenticated | app_ingest`. Until that is resolved, no cron can do real work, no connector can be pulled on a schedule, and no brief can be sent. It is step one of everything.

---

## 3. THE ORDERED BUILD

Sizes: **S** ≈ 1–2 days · **M** ≈ 1–2 weeks · **L** ≈ 3+ weeks or open-ended.
`∥` marks steps that can run in parallel with the step above them.

### Phase 0 — Decisions and paperwork (day 1, no code)

| # | Step | Size | Depends on |
|---|---|---|---|
| 0.1 | Make the §4 decisions. Nothing below starts without 4.1–4.4. | S | — |
| 0.2 ∥ | **Send the emails on day one, because they are calendar time, not work time.** StoreHub (docs password + written answer on whether a read-only, merchant-revocable credential exists); TikTok Shop `partner@tiktokshop.com` (the region rule for a non-TH/non-CN entity); LMWN `partnership@lmwn.com` led with FoodStory, Ocha as a rider; TMD (written confirmation before redistributing bulk observations); PCD or the Envilink CKAN licence field for Air4Thai. Do **not** start Booking.com — new connectivity providers are paused. | S | — |
| 0.3 ∥ | Delete or archive the six live Stripe prices. **The Dashboard delete route is open only until the first subscription.** Nobody has subscribed. After that, archive-only, forever. | S | — |
| 0.4 ∥ | Write the dictionary triage doc — the next numbered doc under `docs/marketplane/`, in `24-commerce-grain.md`'s exact shape — running every number the plan names through `registry.ts`'s three precedence rules. It must address why `24` §5's rejection of `cover` and `room_night` does or does not still hold. (It does hold for now: Loyverse cannot supply covers.) | S | 0.1 |

### Phase 1 — Make something run on a clock

| # | Step | Size | Depends on |
|---|---|---|---|
| 1.1 | **Settle the scheduled-half identity and replace `store: null`.** Choose between a login role for `app_webhook`/`app_scheduler` over Hyperdrive and a fourth mintable role over an exposed surface (`39-store-adapter.md` §4 frames it). Implement one `WebhookStore`. Keep `ScheduledOutcome`'s distinction between "nothing to do" and "not configured" — the repo has been silently no-op-ing for weeks and that must never happen invisibly again. | M | 0.1 |
| 1.2 | Write the ingest cron caller nobody wrote: `app.due_connections` → `app.claim_connection` → the existing `runIngest` from `apps/api-edge/src/ingest.ts` → `app.record_backfill`. Add a third cron. Reuse the function, do not duplicate it. | S | 1.1 |
| 1.3 ∥ | **Close the two dictionary-guard holes before any metric lands.** (a) `sqlConstraintBody` (`check-dictionary.mjs:220-223`) structurally cannot match an `alter table … add constraint`, and since in-place migration editing ended that is the only form available — so the fx constraint is **currently unguarded**. (b) Add `public.ingest_envelope_rows(jsonb)` as a fifth checked metric list; the guard has never seen it. Verify both by mutation: delete a metric from each and watch the guard go red. | S | — |

### Phase 2 — One source, one true number

| # | Step | Size | Depends on |
|---|---|---|---|
| 2.1 | Loyverse OAuth provider in `packages/oauth` + connector in `packages/connectors/src/sources/loyverse`. Append `loyverse` to `SOURCES` and `app.envelope_source` (**append-only** — the guard compares enum order) and supply a `RESTATEMENT_CLOCKS` entry: `windowDays: null`, WooCommerce rationale verbatim. Request `RECEIPTS_READ`/`SHIFTS_READ`/`STORES_READ` only; never offer the personal access token as a shortcut. Map receipts to `revenue` + `orders` at `order` grain. **No new metrics.** | M | 1.2 |
| 2.2 | The ambient table — its own migration, keyed by `(place, date)`, **no `workspace_id`, no RLS predicate**, joined at read. Weather (TMD) + bank holidays (BOT). Include the decision note: ambient data has no account owner, no currency, no attribution window, no restatement clock, and no unit in the taxonomy that fits an AQI. One national fetch fanned out internally, never one call per tenant (TMD's datapoint quota makes this a hard constraint, not a preference). | M | 1.1 (parallel with 2.1) |
| 2.3 ∥ | Air4Thai connector into the same ambient table — **only after** the licence question in 0.2 returns. Handle the `-1`-as-string missing-reading encoding; treating it as a measurement poisons every average. No documented historical endpoint exists, so backfill means polling hourly and storing it ourselves. | S | 2.2 + licence answer |

### Phase 3 — The brief

| # | Step | Size | Depends on |
|---|---|---|---|
| 3.1 | Migration: `message_recipients` (workspace, channel, address, locale, send_local_time, **timezone NOT NULL** — a recipient's zone, not a connection's), `channel_credentials` (the customer's **own** channel token as vault ciphertext, never a shared token), `outbound_messages`, and `message_deliveries` — **one row per (message, recipient)**, which is the per-(event, endpoint) delivery row the existing webhook migration already says fan-out needs. RLS mirroring `webhook_endpoints`. | M | 1.1 |
| 3.2 | Generalise `packages/webhooks/src/delivery.ts`: keep the claim→send→record ordering, the at-least-once posture, the lease semantics and the SQL-owned retry **verbatim**; replace the hard-coded `restatementEventSchema.safeParse` with a per-kind validator lookup and `serialise()` with an adapter-supplied `render`. Its 12 existing tests passing against a restatement adapter is the proof the generalisation preserved behaviour. | M | 3.1 |
| 3.3 | `packages/channels`: `{ id, render, send, verifyInbound, parseInbound }`. Implement the first adapter (§4.3). Per-channel idempotence handled honestly in one place — `X-Line-Retry-Key` on LINE (24 h, 409 + `x-line-accepted-request-id`); Telegram, Slack and Discord document **none**, so those are enforced by recording `channel_message_id` before releasing the claim. Write down which channels are genuinely idempotent and which are best-effort. | M | 3.2 |
| 3.4 | The brief composer as a **pure function**: `(workspace, date, locale) → BriefMessage`, reading the envelope store, every figure carrying its `fetched_at` and `is_provisional`. Tested in Thai and English against fixture rows. Rendering to a channel is the adapter's job, not this function's. | M | 2.1 + 3.3 |
| 3.5 ∥ | Inbound route `POST /v1/channels/{channel}/inbound`, dispatching to the adapter's `verifyInbound` before anything about the body is trusted, returning 2xx immediately. **Do not assume one shared verify function** — LINE is base64 HMAC-SHA256 over the raw body, Slack is hex HMAC over `v0:ts:body` with a 5-minute window, Telegram is a shared-secret header with no body signature, Discord is Ed25519, Postmark inbound documents none. Raw-byte access on Workers is the implementation hazard: any re-serialisation before verification breaks three of them at once. | M | 3.3 |

**After 3.4 the plan's core loop is real for one business.** Everything below is expansion.

### Phase 4 — Expansion (largely parallel)

| # | Step | Size | Depends on |
|---|---|---|---|
| 4.1 ∥ | **AI-answer visibility.** Fully parallel, no approval, self-serve. Build on **LLM Scraper** (`/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced` — real ChatGPT and Gemini, `sources` vs `search_results` is exactly the cited-vs-retrieved distinction) plus SERP `ai_overview` and `ai_mode`. Use LLM Responses only for Perplexity and Claude, marked honestly as an API-model probe, **not** as "ChatGPT". Blocked on the §4.7 sample-size contract decision. **Measure, do not assume, whether two identical prompts are independently sampled** — nothing documents caching or de-duplication. | M | 4.7 decision |
| 4.2 ∥ | Grain decision implemented (day vs sub-day; branch; in-POS channel), if 4.4's decision was to go sub-day. Touches `envelope_rows_pkey` and `app.upsert_envelope_row`. | M–L | 0.4 |
| 4.3 | Currency metrics: `cost_of_goods`, then margin in the brief. Separate sitting from any count metrics, because currency metrics additionally require redefining the fx constraint — the one the guard cannot currently see. | M | 1.3 + 0.4 |
| 4.4 ∥ | Xero connector (read-only scopes, self-serve). The ledger-cash substitute for the dropped bank cash position. Check Thai bank-feed coverage first — **unverified**, and if Xero has no Thai feeds the figure is only as fresh as manual imports, which changes the promise materially. | M | 2.1 |
| 4.5 | Action sheet: `action_items` (with `estimated_worth_low/point/high` **in the schema**, not computed at render — the plan's "range where uncertain") and `action_verdicts`. Needs at least four weeks of real data before the verdict loop means anything. **A verdict is a causal claim about the customer's own money and nothing yet gates a generated verdict sentence** the way `check-claim-sources.mjs` gates marketing copy. | L | 3.4 + 4 weeks of data |
| 4.6 ∥ | TikTok Shop custom app, **if** 0.2 returns a workable region answer. Private authorisation link, no public listing, usable pilot runway to 25 sellers. Adaptive scheduler required — TikTok publishes a dynamic-QPS model with explicitly non-guaranteed baselines, and a 06:00 Bangkok fan-out is exactly the shape it throttles. | M | 0.2 answer |
| 4.7 ∥ | Shopee ISV application — **only after** a live product with existing ecommerce integrations exists, which is what Shopee requires and is the reason this cannot be step one. | S (application) | 3.4 shipped |
| 4.8 | Ask: plain-language questions, ranked causes, what was ruled out. | L | 3.5 |
| 4.9 | Consolidated reports. | L | 4.3 |
| — | **Lazada:** Seller In-house APP for a ≤30-merchant pilot only, with the Service MarketPlace dependency surfaced to the founder as a commercial decision before Lazada is promised anywhere. | M | founder decision |
| — | **FoodStory / Ocha / StoreHub:** design a file/mailbox ingest path rather than blocking on a partnership. FlowAccount — Thailand's largest SME accounting vendor — integrates Wongnai POS and Ocha POS by having the merchant download a CSV and import it. That is the state of the art in this market. It degrades the promise honestly: daily rather than intraday, with a clear fetch time. | M | 0.2 answers |

---

## 4. WHAT MUST BE DECIDED BY A HUMAN

### 4.1 Which pilot vertical — and therefore whether anything is buildable at all

**This is the first decision and it is not the one the plan assumes.** The plan's POS list is FoodStory, Ocha, StoreHub, Loyverse. Three of the four are unreachable. Loyverse is reachable and excellent — and is not the one with Thai market position.

- **Option A — a Loyverse cafe.** Buildable in weeks. Costs: covers and spend per head are unavailable; the after-fees story collapses to plain takings because there is no delivery platform in the picture. The founder gets a real, honest, end-to-end brief.
- **Option B — a FoodStory/Wongnai cafe (the plan's actual target).** Requires an LMWN partnership with no published terms, competing for merchant attention in the same surface area (reports, promotions, CRM) that this product occupies. Unknown calendar time. Fallback is CSV/mailbox ingest, daily cadence.
- **Option C — an online seller on Shopee/TikTok Shop.** Sidesteps the POS problem entirely; TikTok Shop's custom-app runway is genuinely usable. But it is a different product to the one the mockups draw, and Shopee's "must already be live" rule makes it a second move, not a first.

Recommendation: **A to prove the loop, B pursued in parallel as BD, C as the second connector.** But it is the founder's call, because it changes who the site talks to.

### 4.2 Billing — a three-way disagreement, one side of which is a failing test

Three positions exist in this project simultaneously:

1. **Monthly tiers** — what the code does. Four plans, six live Stripe prices, `current_plan()` that gates nothing.
2. **"Pay as you go, nothing monthly"** — the plan's closing line. **This is currently a red build**: `packages/brand/src/claims.ts` bans `/\bnothing monthly\b|\bpay as you go\b/i` **[spot-checked]** and `page.test.tsx` asserts the homepage matches no forbidden pattern.
3. **Per connected account per month, plus credits** — the repository's own recorded §11.3 decision, which is what the ban list and the envelope's `credits_used` field were built for.

Costs of each:
- **Pure usage** requires a unit, and **the unit's subject does not exist**: no brief generator, no action-sheet generator, no Ask, no report, no LLM dependency anywhere in the workspace. You cannot meter a thing no code emits. It also means rewriting the webhook (which reads `subscription.items.data[0]` and treats any unrecognised price as a reason to write *nothing*, so a metered item would leave a paying customer reading as `free`), and accepting Stripe's own trade: Stripe recommends Metronome for all new usage integrations, and lists Metronome's Checkout support as "Limited — requires custom API calls and webhook configuration," while the fully-Checkout-compatible Billing Meters carries a "Not Recommended" banner. **Every purchase in this repo goes through Checkout.**
- **Monthly tiers** cost nothing to keep but contradict the plan's closing sentence.
- **§11.3 hybrid** is expressible in Stripe (flat fee + overages is supported on both platforms) but not in this schema: `subscriptions.organisation_id` is UNIQUE with a single `stripe_price_id` column.

**Deadline attached:** the Dashboard delete route for the six live prices closes permanently at the first subscription. Archiving remains available forever and is harmless.

**Unverified and should not be restated as fact:** whether one Checkout Session may mix a licensed and a metered line item (a 30-minute test-mode check), and the meter-event-stream throughput figures.

### 4.3 The delivery channel for v1 — and a spec that contradicts the founder

The founder now says delivery is pluggable. **`docs/MARKETING-DATA-PLANE.md` §11A.3 decides that the brief is delivered to a LINE Official Account**, with email secondary. Until 11A is amended, a claim written to an abstract channel **has no citation that supports it**, and `check-claim-sources.mjs` will surface that the moment the promise is written as a claim rather than as section prose.

Channel costs:
- **LINE** — what Thai owners actually use. Push is 2,000 req/s, inbound signature is well documented, `X-Line-Retry-Key` gives real idempotence. Two structural costs: messages are **metered by the Official Account's subscription plan** and counted per recipient (~30/month per business before follow-ups — *plan prices were not verified; do not model a number without fetching the current official pricing page*), and a push needs a user ID that only arrives after the owner has added the account and sent an event, so **the first inbound message must precede the first outbound brief**. That is an onboarding constraint, not a delivery one.
- **Telegram** — cheapest to build, no metering, no friend-graph prerequisite. Wrong audience.
- **Email** — universal, but Postmark's inbound webhook documents **no signature, basic-auth or IP-allowlist mechanism**, which means the reply path is the weakest link in the design.
- **Discord** — an incoming webhook is explicitly **one-way**; "reply to ask a follow-up" needs a bot or interactions endpoint.

Recommendation: build the adapter boundary against **LINE and email together**, because LINE forces the hardest constraints and email forces the weakest, and an interface shaped by one channel will be wrong.

### 4.4 The grain — the decision with no cheap reversal

Day vs sub-day; whether a branch is an `account_id`, an entity type, or a new dimension; whether in-POS channel (dine-in / takeaway / delivery) is a dimension or is refused. Adding an hour to `envelope_rows_pkey` rewrites the unique constraint on a table a real database has already applied, changes `app.upsert_envelope_row`'s signature, and multiplies row count by up to 24. Encoding time in `entity_id` avoids all of that and buys a vocabulary the guard cannot police. **Pick deliberately; do not let the first POS connector pick by accident.**

The plan promises "P&L by unit and channel." `source` covers cross-platform channel; nothing expresses dine-in vs takeaway inside one POS, and nothing expresses a branch unless the POS happens to issue one account per branch.

### 4.5 The cash position — drop, redefine, or change the dictionary's shape

Drop it for launch (recommended), or redefine it as ledger cash / settlement cash with an "as booked, not as banked" caveat on the figure. If it is kept as a stored number, the `Aggregation` union needs a period-closing member before `cash_balance` can exist — and note `metrics.test.ts:34` currently asserts `ADDITIVE_METRICS.length === METRICS.length - 1`, which a second non-additive metric breaks.

### 4.6 Which partner applications to start, and when

Each is calendar time that only starts when someone sends the email. Shopee (10 working days review, but gated on already having a live product); TikTok Shop (3+ weeks compliance review, plus the unverified region question); Lazada (same-day app approval but a 30-user ceiling, then a Service MarketPlace commercial dependency); LMWN (unknown, no published terms); StoreHub (days, not months — the cheapest of all); Booking.com (**do not start — paused**).

### 4.7 How a sampled estimate is expressed in the contract

`is_provisional` cannot express "an estimate with a sample size." This blocks the AI-visibility module and was already flagged for sampled CDN data. **Resolve it once for both**, before either is built.

### 4.8 Two loose ends with deadlines of their own

**Air4Thai's licence.** No terms of use, no licence, no API documentation is published by PCD. "No terms published" is not "redistribution permitted." The highest-value single follow-up in the whole research is reading the CKAN licence field on `envilink.go.th` or `data.go.th` from an unblocked Thai network — it would likely resolve in minutes.

**Which THB price ladder is real.** `apps/web/app/_billing/plans.ts` ships 690/1790/3590; `docs/marketplane/finance/model.py` ships 1590/4190/13800 VAT-inclusive and `HANDOVER.md` §9 marks it do-not-reopen. They disagree by 2.3× at the top tier. Any repositioning that quotes baht without settling this publishes whichever file the writer happened to open.

---

## 5. WHAT THE SITE MUST STOP SAYING — AND WHAT IT MAY START SAYING

### 5.1 Must stop

**Source claims that are not true.**
- Stop listing FoodStory, Ocha, StoreHub, GrabFood, foodpanda, LINE MAN, Booking.com, K PLUS and SCB as sources, in any form — logo, chip, "planned" row or FAQ sentence — unless each is explicitly marked as not built and not reachable. `apps/web/app/integrations/page.tsx` currently lists 15 connectors of which 10 are `status: "planned"`, and `/connectors/shopify/` is a 739-line page whose primary CTA reads "Connect Shopify" for a source that does not exist.
- Stop implying Shopee, Lazada and TikTok Shop are three interchangeable OAuth connectors. They are not, and Lazada in particular is not.
- Stop LINE appearing in the *source* list. It is a delivery channel, not a data source, and LINE MAN (delivery) and LINE Messaging API (channel) are different products that must never be conflated in copy.

**Promises the platforms do not support.**
- Stop "read-only, never post or change anything" as an unqualified guarantee. It is true of Loyverse and Xero. It is enforced by our code, not by the token, on QuickBooks, FlowAccount, Grab, foodpanda and StoreHub. Reword to what we enforce.
- Stop "every number carries a provisional marker until the platform finalises it" where nothing finalises. For a Thai cafe's POS history, `is_provisional` is permanently true, and the UI must say that in those words or the pillar reads as a bug.
- Stop any specific restatement deadline for a delivery platform. **No such number is documented anywhere.**
- Stop the after-fees figure as the headline number on a public page. It cannot be fetched for GrabFood or foodpanda, and for a restaurant it cannot be computed at all today.

**Copy that is already failing or already wrong.**
- "Pay as you go. Nothing monthly." — a failing test until §4.2 is settled and `claims.ts` amended.
- Unification as the product ("All your data. One clear view.", "Connect your tools, unify your data", "Ready to unify your data?"). The plan sells a decision; unification is plumbing.
- USD hero figures ($186.2K, 5.42× ROAS, "Everyday Mug", "Northstar Studio") for a baht-billed Thai owner-operator.
- "Agencies & consultants" as a named audience — 11A.1 demotes agencies to a secondary channel.
- "A yearly term is twenty per cent off twelve months" — the code computes 16.67% and says so, and the same page says "2 months free" four hundred lines later.
- `FeatureGrid` and `AssistantPanel`, which render byte-identical eyebrow, headings and lead. One of them is redundant on any positioning.
- `Templates` — the plan's owner does not build reports from templates; the product decides for them.

**And one trap that cuts the other way.** The `FORBIDDEN_CLAIMS` competitor pattern catches "competitor" but **not** "competitors" or "rivals" — the `\b` fails before the plural. The plan's own AI-visibility framing ("versus rivals") sails through a guard that exists precisely to stop it. Widen the pattern *before* writing that section, or the ban is doing the opposite of its job on the one module it was written for.

### 5.2 May start

- **Loyverse, named.** Merchant-authorised OAuth on their own login, read-only scopes requested in isolation, per-merchant token storage, revocable by the merchant. It satisfies every trust pillar literally as written — provided the site also says what it cannot give (no guest count, therefore no spend per head).
- **Weather, air quality and Thai bank holidays as named context**, each with its attribution: TMD with a link to data.tmd.go.th, CCDC DustBoy with the exact required string *"supported by Climate Change Data Center, Chiang Mai University (CCDC CMU)"*, Air4Thai attributed to the Pollution Control Department once the licence question returns. These are genuinely the daily-cadence explanators the morning brief needs — tourist arrivals are a monthly backdrop, useless for a brief about yesterday.
- **Fetch time on every figure.** This is real; the envelope carries it and the store enforces it.
- **Per-tenant isolation and no pooling.** Real, enforced in RLS, asserted from `pg_policy` in the test suite rather than merely commented.
- **No training on customer data** — but worded as what we enforce, not as a third-party guarantee: `provider: { data_collection: "deny", zdr: true }` on every call, both OpenRouter logging toggles off, no web-search plugin on tenant data, an opaque tenant id in the `user` field. OpenRouter itself says its provider-policy data "is not a definitive source of third party data policies, but represents our best knowledge," and `data_collection: "deny"` alone still permits 30–55 day retention at some providers. A blanket "your data is never used to train AI" with no enforcement in code is exactly the wrong-fact-that-looks-right this project exists to avoid.
- **AI-answer visibility over many runs with a confidence interval**, once §4.7 is resolved — and it should say which surface each count came from, because Google AI Overview, Google AI Mode, real ChatGPT via LLM Scraper and the OpenAI-API probe are four different instruments with four different prices and four different answers. If LLM Mentions is ever used, say plainly that it is bought panel data about brands, or it will look like pooling.
- **Named sources, never counted.** `check-claim-sources.mjs` bans `\b\d+\s+(sources|integrations)\b` and `38-marketing-site-visual-direction.md` §3 already settled that naming is the only surviving form.

### 5.3 What it may not say yet, at any price

A named Chiang Mai cafe as proof. There are no customers. The Saphan 55 and BREW owner quotes are recorded as unapproved drafts, the artboard figures (฿97,400, 38 covers, ฿41,200 attributed to actions taken) are invented, and `check-brand.mjs` would separately refuse a hardcoded venue name outside `packages/brand`. A proof section built from those would be fabricated social proof — the fastest available failure of the one rule this whole project is organised around.

---

**The single sentence the founder needs.** The product's core loop is real and cheap to build — for a Loyverse cafe, on free public Thai data, with a self-serve LLM and one chat adapter, in roughly six to eight weeks of ordered work. The product *as drawn* — a Thai restaurant's after-commission takings from FoodStory and GrabFood, with a K PLUS cash balance — is not blocked on engineering. It is blocked on a partnership nobody has started, a commission figure the platforms do not return, and a banking regulation that does not reach unregulated software companies until 2027 at the earliest.
