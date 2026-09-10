# Handover

Written 9 September 2026, last revised 10 September at commit `0ce44a6`. **Everything described
below is on `main`** — PRs [#3](https://github.com/Mouthfully/dataaggregator/pull/3),
[#5](https://github.com/Mouthfully/dataaggregator/pull/5),
[#7](https://github.com/Mouthfully/dataaggregator/pull/7),
[#8](https://github.com/Mouthfully/dataaggregator/pull/8),
[#10](https://github.com/Mouthfully/dataaggregator/pull/10) and
[#11](https://github.com/Mouthfully/dataaggregator/pull/11) are merged, and nothing is in flight.
Read this before touching anything.

**One PR is open and cannot merge.**
[#4](https://github.com/Mouthfully/dataaggregator/pull/4) carries a competing rewrite of the
`positioning` claim that #5 landed differently: it would conflict on
`packages/brand/src/claims.ts` and break a test asserting a sentence no longer in the tree. Its one
genuinely useful file, `20-marketing-site.md`, was salvaged. **It should be closed as superseded.**

---

## 1. What this is

A business-intelligence data plane for Thai SMEs. It connects the platforms a small Thai
business actually sells on — Shopee, Lazada, LINE MAN, Meta ads, Google ads, a POS — and
produces the one number none of them produce: **profit after platform fees, commissions,
returns and ad spend.** On top of that sits an advice layer: a weekly action sheet, a daily
brief delivered in LINE, and an ask-anything surface.

**There is a working product name, and it lives in exactly one file** —
`packages/brand/src/brand.ts`, alongside the legal entity, support address and company
registration. That is the whole point: the name is not banned, it is *centralised*. Every one of
those identity strings is forbidden everywhere else in the tree, including in this file, and
`scripts/check-brand.mjs` fails the build if one leaks. Run it before you commit anything that
mentions the company. Whether the working name is the final name is a founder decision that has
not been made.

The governing specification is `docs/MARKETING-DATA-PLANE.md` (2,246 lines). Where §11 of that
document records a decision, **that decision stands** — do not relitigate it, extend it.

---

## 2. Binding constraints

These came from the founder at kickoff and have not been relaxed. The security-relevant ones
are quoted exactly:

> "Platform terms are constraints, not guidance. No shared platform tokens across tenants, no
> cross-customer aggregation or benchmarking on platform data, per-workspace data separation,
> and the Meta client-list obligation designed in from the start (section 3.5). Contact data,
> if it ever appears, is hashed at the edge and never stored raw (section 3.2)."

> "Bring-your-own-credential everywhere platform terms require it… SERP is bought from
> DataForSEO, never crawled. Writes are deferred."

> "Never widen scope in a PR; open an issue instead."

And the rest:

- **One brand file.** No company-identifying string anywhere else. One tokens stylesheet, no
  hex outside it. Enforced by `check-brand.mjs` and `check-tokens.mjs`.
- **Stack: Vercel, Cloudflare, Supabase — nothing else without a written reason.** Anthropic is
  an accepted exception. Adding Google as a model vendor is *proposed* in the financial model
  and needs its own design note before it ships (see §7).
- **The envelope is the contract.** The API refuses to emit an unlabelled conversion count.
  There are now two refusals; see `packages/contract/src/envelope.ts`.
- **Correctness over coverage.** Tiered restatement backfill **and** the restatement webhook
  both land before a *fifth* connector.
- **Every PR carries a design note** under `docs/marketplane/`, with a cost estimate, a
  platform-terms check, and what was left out.

---

## 3. Repo map

```
docs/MARKETING-DATA-PLANE.md      the specification. §11 records decisions.
docs/marketplane/                 design notes 01–34, one per shipped unit. None owed.
docs/marketplane/finance/         the financial model — see §6 below
design/app/                       the product application design of record
design/app-simple/                the owner-first proposal against it (§4). A direction, not a decision.
design/marketplane/               the marketing artboard, predating §11A.1
packages/contract/                the envelope, metric dictionary, restatement event
packages/payloads/                raw payload store + PII redaction. `woocommerce` is the first `redact`.
packages/webhooks/                HMAC signing and at-least-once delivery
packages/connections/             OAuth AND key-paste credentials — a discriminated union (§4)
packages/connectors/              ga4 and woocommerce; shopify is slot 3
packages/{brand,tokens}/          the one brand file, the one stylesheet
apps/api-edge/                    Cloudflare Worker: /v1/performance, drain, prune
supabase/migrations/              schema. No database has ever applied these.
scripts/check-*.mjs               brand, dictionary and token tripwires
```

---

## 4. State of the code

**Green at `0ce44a6`: 444 unit tests, 178 database assertions, CI passing.**

Verify with `pnpm test`. Note that `apps/api-edge` prints alarming `workerd` stack traces
(`Network connection lost`, `FixedLengthStream`) during its run — **these are expected noise
from the miniflare pool, not failures.** Read the `Test Files … passed` line, not the traces.

Shipped on PR #3 and now on `main`, in order:

1. **Commerce grain** — `orders`, `revenue`, `net_revenue`, `fees`, `commission` in the metric
   dictionary; `order` appended to `ENTITY_TYPES`; a second refusal that rejects commerce
   metrics on an advertising entity with a null attribution window.
2. **Payload redaction** — `packages/payloads/src/redaction.ts`. Allow-list at every depth, no
   prototype exemption, arrays mapped not filtered, depth cap 64. All ten sources are currently
   `verbatim`; a source only becomes `redact` when its keep-list ships *with* the connector.
3. **Restatement outbox** — a trigger-fed table with delivery state, in
   `supabase/migrations/20260908001100_envelope_rows.sql`.
4. **Webhook delivery** — derived (never stored) secrets, Stripe-style `t=…,v1=…` with the
   timestamp inside the signature, 300s tolerance, at-least-once with the event id as the
   idempotency key, one active endpoint per workspace.
5. **Retention and cron wiring** — `* * * * *` drain, `17 3 * * *` prune, 30-day delivered /
   90-day failed retention. The prune never touches an undelivered event.

### Shipped 10 September, PRs #5, #7, #8, #10 and #11, all merged

1. **The positioning claim reconciled with §11A.1**, and `30-thai-public-data-register.md`. The
   claim had carried the agency-and-brand message for four rounds; `README.md` changed with it.
2. **The owner-first client design** — `design/app-simple/`, five phone artboards. Eight nav items
   become three, five connection states become two, the developer surface goes behind one closed
   door, and LINE is treated as the primary surface per §11A.3. `design/app/` remains the design
   of record. **It also corrects a price**: the old design carried ฿990/฿2,490 gated on source
   count and marked *"excludes 7% VAT"*, against `model.py`'s ฿1,590/฿4,190/฿13,800 **inclusive**.
   See `31-owner-first-client.md` §2.
3. **WooCommerce, end to end** — slot 2 of §11A.14. Dictionary entry in TypeScript and SQL, a
   restatement clock, **the repository's first `redact` keep-list**, a normaliser and a client.
   Notes `32` and `34`.
4. **The key-paste credential lane** — `StoredCredential` becomes a discriminated union and
   `connectWithKey` is a sibling of `connect`. This unblocked Shopify, Opn and ZORT as much as
   WooCommerce: every remaining launch slot was behind it. Note `33`.
5. **`20-marketing-site.md`**, owed since the numbering first jumped 19 → 21, salvaged from the
   unmergeable PR #4 with two now-false paragraphs corrected in place.

**Adding a source is a four-place act, and three of the four enforce themselves.** `SOURCES`,
the Postgres enum (`check-dictionary.mjs` compares them), `RESTATEMENT_CLOCKS` and
`REDACTION_POLICIES` — the last two are total `Record<Source, …>`, so `tsc` fails if you skip one.
Which settles a question that used to come up every round: **the dictionary change cannot ship
ahead of the connector.** `redaction.ts` says so in its own comment.

**`app.connection_provider` is the exception, and it is a trap.** No guard relates it to its
TypeScript twin — `check-dictionary.mjs` covers sources, entity types, attribution windows and
metrics, not connection providers. A one-sided edit fails at runtime, not at build time.

### Two bugs mutation testing caught, and what they taught

- The trigger's `when` clause is a **cost** guarantee, not a correctness one. A mutation that
  removed it did not break any assertion. The comment now says so.
- Multiple active endpoints per workspace would have **double-delivered**. The unique index is
  now partial on `active`.

**Keep the discipline: break each load-bearing property and confirm the suite catches it.**
Twice this session a mutation "survived" because it never actually landed — a `str.replace`
that hit both the signer and the verifier so the round-trip still agreed, and an `index()` that
matched the wrong occurrence. **Confirm the mutation is really in the file before believing a
survivor.**

A third failure mode showed up on PR #5 and is worse, because the suite went green and stayed
green: **the mutation was invented from a description of the old code rather than copied out of
it.** The test asserted the positioning claim did not say "agencies" or "brands"; the real
superseded sentence contained neither word, so a straight `git checkout` of the old line would
have passed. A review bot caught it, not the mutation run. **Take the mutation from `git show`,
not from memory of what the thing said.**

**Two more from 10 September, out of 22 mutations run across three connector PRs.** All 22 were
eventually caught; these two survived first, and both were worth more than the twenty that did not.

**Fourth: the test could not fail, because CI runs in UTC.** Deleting the `Z` that `wooGmtToDate`
appends to WooCommerce's designator-less `_gmt` timestamps — the exact defect the code exists to
prevent — left the whole suite green. In UTC the wrong reading and the right reading produce the
**identical string**. The comment above the assertion claimed that asserting "on the value rather
than the runtime" was enough; it was not. **The connectors suite now runs in `Asia/Bangkok`**,
pinned in `packages/connectors/vitest.config.ts`, so every connector added after inherits it. A
Thailand-first product whose tests only ever run in UTC is structurally blind to this.

**Fifth: a mutation run cannot fail a comment.** Two documentation defects were found on PR #11 by
re-reading the diff, invisible to all 22 mutations. The client's own module note said it "does not
read the body — so an extractor can stream it to R2", pointing at a path that **throws for that
source**: `putPayload` refuses any non-`verbatim` source, and WooCommerce is the first `redact`
one. Grepping for that mistake rather than assuming it was unique found the same claim in
`packages/payloads/src/payloads.ts` — *"the streaming path is the one every extractor should
use"* — sitting eleven lines above the code that enforces the opposite, wrong since the redaction
policy landed. **A wrong comment survives every test in the suite, and the more confidently it is
written the longer it survives.**

---

## 5. Blockers

1. **There is no Supabase project for this product, and this was checked rather than assumed.**
   The account holds exactly one project, `SO.Reporting` in org `MWS HK LTD` — an affiliate
   reporting database for a **different** product (80k orders, Impact.com partner data, leads and
   outreach). **It must not be touched.** So three finished surfaces — `/v1/performance`, the
   webhook drain and the prune — are still written, tested against local Postgres in CI, and
   *unbound*. Still the single largest blocker, and it still needs the founder: creating a project
   costs money.

   **Two defects will bite on the first apply**, filed as issue
   [#9](https://github.com/Mouthfully/dataaggregator/issues/9) and verified against the files.
   One is potentially **total denial**: `app.current_user_id()` and `app.api_key_workspace_id()`
   read `request.jwt.claim.sub`, the *pre-PostgREST-9 singular* GUC, while Supabase's own docs say
   claims now arrive as `request.jwt.claims` JSON. If the singular form is unset every RLS
   predicate is false and **every authenticated read returns zero rows** — not an error, an empty
   result. The fix is the coalesce-over-both pattern Supabase's own `auth.uid()` uses. The other:
   `MAX_LIMIT` (1000) exactly equals PostgREST's `max_rows` (1000), so a `limit + 1` next-page
   probe silently never sees a next page. **The database suite cannot catch either** — it sets
   those GUCs by hand, so it tests the helpers against its own assumption.

   **A security finding on the OTHER project, surfaced because it was seen and not because it is
   ours:** 16 tables in `SO.Reporting` have RLS disabled, including `orders` (80,642 rows),
   `impact_actions` (11,532) and `leads` (232). Anyone with that project's anon key can read or
   modify every row. Not this repository's to fix; worth knowing.
2. **Founder decisions still open:** the domain; the data region and whether any EU claim is
   made given the Thai entity; which legal entity owns platform credentials; FlowAccount's API
   access model (`developer_support@flowaccount.com`). **Plus the two in §7 item 1**, which are
   larger than any of these because they change what the launch set is.
3. The seven open questions in spec §11A.9 are unanswered.

---

## 6. The financial model

`docs/marketplane/finance/` — see its own `README.md`. Three files:

- **`model.py`** — the 60-month model. **Single source of truth for every published number.**
  Run it with `python3 docs/marketplane/finance/model.py`; no dependencies.
- **`cost-model.html`** — the published document (11 sections, 3 charts). Artifact body only.
- **`build-pdf.mjs`** — renders a 35-page A4 PDF.

Published at **https://claude.ai/code/artifact/9b7d645f-2188-40df-b06d-88bf8ee9e7c9**. To update
it from a new session you must pass that `url` and read it first; publishing without the URL
creates a *separate* artifact.

**The document was hand-written from the script's output. There is no generator between them.**
If you change a parameter, the HTML is immediately stale — re-check every affected figure.

**Every figure in the table below was re-run against `model.py` on 10 September and reconciles
exactly** — revenue, EBITDA, ARR and headcount across all five years, peak cash −฿19,276,720,
cumulative cash positive M39, ฿134,855,406 at M60, gross margin 75.7%, BOI ฿17,901,994 (฿25,516,746
routed) against a ceiling of ฿38,348,333, and the routing engine at ฿38,073,760. **EBITDA turns
positive in month 28**, which the table does not state.

Of §03's four cost levers, only the third — the routing classifier — is tracked in §7. The other
three are implementation facts rather than projects: **lever 1** is using a cheap model for routing,
retrieval, extraction and verification and never for advice; **lever 2** is prompt-caching the
system prompt, action rubric and business profile, roughly 12k of the 35k input, worth 12% and
marked verified; **lever 4** is batch, and see §9 — the published numbers already assume it.

### What it currently says (base case, no routing engine)

| | Y1 | Y2 | Y3 | Y4 | Y5 |
|---|---|---|---|---|---|
| Revenue | ฿1.2M | ฿19.8M | ฿65.3M | ฿131.6M | ฿210.9M |
| EBITDA | −฿13.5M | −฿11.8M | +฿3.8M | +฿30.8M | +฿80.3M |
| Exit ARR | ฿4.7M | ฿36.9M | ฿92.1M | ฿168.1M | ฿249.0M |
| Headcount | 5 | 14 | 23 | 33 | 37 |

Peak cash **−฿19.3M** at month 24; cumulative cash positive month 39; **฿134.9M** by month 60.
Gross margin 75.7%, flat. The recommended raise is **฿24–26M** (~$730–790k), sized so the
pessimistic case survives rather than only the base case.

### The three findings that carry the document

1. **90:1.** Serving a customer's data costs ฿1.65/month; answering fifteen questions costs
   ฿148. Hence the free tier gives away the entire data plane — an incumbent with per-seat
   costs cannot follow.
2. **The routing engine** (route lookups to SQL and a cheap model, reserve the frontier model
   for judgement) cuts cost per question ฿9.87 → ฿3.36. Shipped in month 15 it is worth
   **฿38.1M of cumulative cash by month 60** — about twice the raise — and lifts gross margin
   to 84.6%. It is work the Ask surface requires anyway. **This is the highest-return
   engineering decision in the plan.**
3. **The enterprise floor is a cost, not a preference.** WorkOS SSO is ฿4,137/month per
   connection and does not shrink with deal size, so below ~฿25,000/month an SSO-carrying
   contract earns less than the self-serve tier beneath it. Enterprise starts at ฿30,000.

### Thailand-specific, both verified

- **BOI activity 8.1** — 8-year corporate income tax exemption. Worth ฿0 in years 1–3 (losses
  shelter it) and **฿17.9M over five years** (฿25.5M routed). The exemption ceiling is
  cumulative Thai IT salary paid *after* approval, so **apply early**; at ฿38.3M over 60 months
  it never binds for a company that genuinely builds in Thailand.
- **DEPA 200% deduction** — a Thai SME under ฿5M capital and ฿30M revenue gets a 200% CIT
  deduction on software subscriptions **if the vendor is listed on DEPA's Thailand Digital
  Catalog.** That is the Revenue Department funding 15–20% of the customer's bill.
  **It expires 31 December 2027.** Registering is a form and is the cheapest pricing power
  available. Nobody has done it yet.

---

## 7. What is owed, in order

1. **Two founder decisions, and they outrank the engineering below because they change what the
   launch set IS.** Both are new evidence against a premise of §11A.14, not a wish to re-decide it,
   and both were deliberately left unwritten so they arrive as decisions rather than side effects.
   - **WooCommerce does not deliver profit after fees.** Core exposes **no payment-processor fee**;
     `fee_lines` is a merchant *surcharge* that ADDS to the total, so reading it as a cost inverts
     the sign on the headline number. The real fee lives in gateway-specific `meta_data` that some
     gateways write and many do not. For an opaque gateway — the common case — WooCommerce delivers
     revenue, orders and refunds, and the fee waits for slot 4. See `32` §1 and §6.
   - **Nothing blocks BUILDING any ad platform today**, and **Google Ads and Search Console are one
     shared approval, not two** (the same GCP consent-screen verification; the Ads developer-token
     half is now documented as minutes, not weeks). Microsoft issues a universal token with no
     review at all. Every one of the six has a sandbox or test-account path, so the calendar and
     the build order are independent — which undercuts the arithmetic that spent three of four
     launch slots on commerce. The research is verified but unwritten; ask for it as a §11A.17.
2. **Swap `FX_SOURCE` from ECB to the Bank of Thailand.** `packages/fx/src/fx.ts` hardcodes
   `FX_SOURCE = "ecb_reference_rates"`, so a Thailand-first product prices THB off a European
   central bank. BOT is the rate a Thai auditor and the Revenue Department recognise, and
   `fx-on-row` promises the source on the row. **This is a defect with a named fix**, small and
   self-contained, and it is its own PR because it changes an envelope field. See
   `30-thai-public-data-register.md`; one registration on `portal.api.bot.or.th` also carries
   tourism indicators and payment statistics.
3. **Finish WooCommerce's read path.** The connector is built and readable, but three pieces are
   named in `34` §4 and not done: **the page loop** (the client fetches one page and reports
   `totalPages`; nothing walks them), **window bisection** for a store large enough that deep
   `OFFSET` paging hurts the merchant's own MySQL, and **the connect-time probe** — one
   `GET /orders?per_page=1` that validates store URL, key, permission level, WordPress-user
   capability and pretty-permalinks at once. Note that `rest_no_route` means permalinks are off,
   **not** a bad credential, and the probe belongs where a human is looking at the screen.
4. **Shopify, slot 3.** The credential lane now exists, so this is a `SOURCES` entry, a keep-list
   read against real responses, a normaliser and a client — the same five surfaces WooCommerce
   took, minus the foundation work.
5. **The routing classifier** (§03 of the financial model). Highest financial return of any
   engineering work here; also required by the Ask surface.
6. **A capability gate for the claims list** — issue
   [#6](https://github.com/Mouthfully/dataaggregator/issues/6). `allowedClaims()` gates on brand
   fields being non-null and has no notion of whether the thing a claim describes exists. Eight of
   the 23 claims the site renders name capabilities that are not built; `connectors` names five
   sources when `packages/connectors/src/sources/` holds only `ga4`. Not urgent — the site is not
   deployed — but it must land before the first deployment, and the fix belongs with item 1.
6. **`run()` in `finance/model.py` ignores its `A` parameter.** Line 158 reads
   `CBn,CBr=BLEND(A_now),BLEND(A_new)` from the module globals; `A` appears nowhere in the body.
   Any sensitivity run passed through `A=` silently returns the baseline, and the model is the
   source of truth for every published figure. Small fix, but it needs its own PR because making
   the parameter live means re-verifying the document against it. Workaround until then: patch the
   module globals before calling `run()`. See `30-thai-public-data-register.md` §5.
7. **Cloudflare AI Gateway, for per-workspace cost attribution.** §03 of the cost model calls
   this "the reason to adopt it, and it is worth more than the caching" — **you cannot price a
   metered product you cannot measure per tenant**, and §11.3 prices per connected account per
   month plus credits. The envelope carries a `credits_used` field and *nothing aggregates cost
   per workspace*. It is free on any Cloudflare plan, already on the stack, and needs no
   stack-rule exception. It also buys provider failover behind one endpoint and per-workspace
   rate limiting, which is how a fair-use cap gets enforced without writing a quota system.
8. **A design note for adding Google as a model vendor**, if the Gemini prep-layer saving is
   taken. The stack rule requires a written reason. Three checks first: a DPA with zero
   retention; a subprocessor disclosure; and a read of the advertising platforms' terms on
   transferring platform data to third parties.
9. **Register on the DEPA Thailand Digital Catalog** before the 2027 window closes.

---

## 8. Gotchas that cost this session real time

- **`git checkout --` destroyed uncommitted work four times, twice fatally** — once wiping the
  entire commerce-grain change. **Commit first, mutate second, and verify with `git status`
  afterwards.**
- **Local gates must be checked by exit code.** CI went red on `ea46fb1` because a gate piped
  `biome format` into `tail`, discarding the exit status. Fixed in `037d9db`.
- **Never run `biome check --write` repo-wide.** It touched 31 unrelated files via
  organize-imports. CI runs `biome lint` and `biome format` only.
- **`node:fs` is unavailable inside workerd.** Assertions about `wrangler.jsonc` use a Vite
  `?raw` import with a `declare module "*?raw"` shim.
- **The database suite is order- and clock-sensitive.** UUID collisions across suites, `PERFORM`
  at psql top level (use `select`), and `next_attempt_at` defaulting to real `now()` against
  fixed test timestamps have each broken it once.
- **Artifact wake subscriptions do not work in this environment** (`relay_unavailable`, HTTP 404
  through the session gateway). Do not claim to be watching an artifact; comments on it will not
  reach the session.

---

## 9. Decisions already made — do not reopen

- Prices are **VAT-inclusive** because most Thai SMEs are not VAT-registered and cannot credit
  it back. Starter ฿1,590 (not ฿1,490 — the extra hundred baht buys back the 8% of contribution
  VAT would otherwise take).
- **Annual billing at ten months for twelve.** Worth ฿3.7M of funding and, more importantly,
  an annual customer repays 2.6× their own CAC on the first invoice.
- **Founder draw steps**: ฿120,000/month in year one, ฿150,000 from month 13. Payroll budgeted
  at 14 months of salary a year (12 + 13th month + performance bonus).
- **A conventional 200 sqm central-Bangkok lease, fitted out** — not serviced desks. Costs
  ฿6.45M more over three years and the founder chose it deliberately; a controlled office is
  also materially easier to evidence in a SOC 2 audit.
- **A security and data-protection engineer from month 10.** An earlier draft argued against an
  IT function; that was wrong. The stack being managed removes *ops*, not *security*, and this
  product holds bring-your-own credentials for thousands of businesses.
- **Churn is 4.5%/month on monthly plans**, the middle of the published self-serve SMB band —
  not the flattering 3.5% B2B median an earlier draft used.
- **The published COGS assumes the Batch API.** §02 prices the weekly action sheet at ฿11.02
  "batched at 50% off" and monthly reports at ฿11.52 batched; lever 4 in §03 applies the same to
  verification runs. **Every EBITDA and cash figure in §6 above depends on it.** Action sheets,
  briefs, reports and verification runs have nobody waiting on them, so build them through the
  batch endpoint — build any of them synchronously and those COGS lines double while the model
  keeps reporting the old number.
- **Route model calls through Cloudflare AI Gateway, but never its unified billing.** Unified
  billing adds **5%** on credit purchases, the same toll OpenRouter charges. Route through the
  gateway, pay the providers directly. Anthropic primary, Gemini and OpenRouter as failover.
- **A hard CAC ceiling of twelve months' contribution** (฿14,532 Starter / ฿37,608 Growth /
  ฿119,520 Multi-unit). If measured CAC breaches it, stop buying rather than buy harder —
  spending through a broken funnel is the one failure mode in the model with no recovery path.

---

## 10. If you are picking this up cold

Read in this order:

1. This file.
2. `docs/MARKETING-DATA-PLANE.md` §11 and §11A — the decision log.
3. `docs/marketplane/finance/README.md`, then run `model.py`.
4. The three or four most recent design notes (`26`, `27`, `28`) for the house style — a design
   note states the cost, the platform-terms check, and **what was deliberately left out**.

Then pick from §7. **Item 4 (the routing classifier) is worth more than the rest combined in cash
terms** — ฿38.1M of cumulative cash by month 60, roughly twice the raise, and the Ask surface needs
it anyway. **Item 2 (the FX source) is the one actually sitting wrong in the tree** and is a
half-day of work; it is the better first commit for a new session, because it is small enough to
finish and it exercises the whole loop — envelope field, design note, platform-terms check,
mutation testing, PR.

Do not start item 3 (WooCommerce) before reading `25-payload-redaction.md`: a connector without its
redaction keep-list in the same PR is the one thing that note exists to prevent.

**And do not adopt anything from `30-thai-public-data-register.md` before item 4 ships.** §5 of that
note works it through: public-data context is worth about ฿385,000 of cumulative cash per percentage
point it lifts the cheap-path routing share, and costs ฿0.215 a question blended — but *before* the
router exists it costs ฿0.493 on every question and converts none, because there is no cheap path to
route to. It is the one piece of work in §7 whose value is negative if taken early.

---

## 11. Starting a new session

Paste this as the opening message. It is deliberately short: everything else is in this file, and
a long prompt competes with the file rather than pointing at it.

> Read `docs/marketplane/HANDOVER.md` first, then `docs/MARKETING-DATA-PLANE.md` §11 and §11A.
> The binding constraints in §2 of the handover are not negotiable and were set by the founder.
> Start your branch from `origin/main`. **§7 item 1 is two founder decisions, not work** — put
> them to me and do not decide them yourself. Then take §7 item 2 (the FX source swap) and take it
> all the way: design note, platform-terms check, mutation testing, PR.

**Item 2 is still the right first commit** for the reason it always was — small enough to finish,
and it exercises the whole loop. Item 3 (finishing WooCommerce's read path) is the larger and more
useful piece of work, and the foundation it needs now exists.

### What parallelises, and what does not

Most of §7 is **not** safely parallel, and it is worth knowing why before fanning work out.

- **Item 2 (FX source)** touches `packages/fx` and an envelope field. **Item 4 (Shopify)** touches
  `SOURCES`, the metric dictionary and the redaction keep-list. Both edit `packages/contract`, and
  `check-dictionary.mjs` fails the build if TypeScript and SQL disagree. Running them concurrently
  produces two branches that each pass alone and conflict on merge. **This is now proven rather
  than predicted**: WooCommerce touched four of those places on 10 September and three of them
  fail the build if you miss one.
- **`20-marketing-site.md` (now landed) and item 6 (capability gate)** are the one pair that
  genuinely belongs together — the gate decides what the page renders when a claim is withheld, and
  `claim()` currently *throws* on a withheld id rather than degrading. Note `20` §3 gate 18 now
  states the problem in full.
- **Research is parallel; commits are not.** Reading platform terms, pricing a source, or
  surveying an API can fan out freely. Anything that writes to `packages/contract`,
  `supabase/migrations/` or the dictionary should be one worker at a time.

### The two things a new session gets wrong

1. **It writes code before reading §11A.** The specification records decisions, and re-deciding
   one is the most expensive mistake available here — it invalidates design notes that cite it.
2. **It trusts a green suite.** See §4: this project has had two mutations that never landed and
   one taken from memory instead of from `git show`. A test that has never been seen to fail is
   not evidence.
