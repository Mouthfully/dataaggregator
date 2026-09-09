# Handover

Written 9 September 2026, at commit `5d5dc29` on `claude/marketplane-build-kickoff-cgbfxz`
(PR [#3](https://github.com/Mouthfully/dataaggregator/pull/3), open). Read this before touching
anything.

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
docs/marketplane/                 design notes 01–28, one per shipped unit
docs/marketplane/finance/         the financial model — see §6 below
packages/contract/                the envelope, metric dictionary, restatement event
packages/payloads/                raw payload store + PII redaction
packages/webhooks/                HMAC signing and at-least-once delivery
packages/connectors/              GA4 today; WooCommerce is next
packages/{brand,tokens}/          the one brand file, the one stylesheet
apps/api-edge/                    Cloudflare Worker: /v1/performance, drain, prune
supabase/migrations/              schema. No database has ever applied these.
scripts/check-*.mjs               brand, dictionary and token tripwires
```

---

## 4. State of the code

**Green at `5d5dc29`: 396 unit tests, 178 database assertions, CI passing.**

Verify with `pnpm test`. Note that `apps/api-edge` prints alarming `workerd` stack traces
(`Network connection lost`, `FixedLengthStream`) during its run — **these are expected noise
from the miniflare pool, not failures.** Read the `Test Files … passed` line, not the traces.

Shipped on PR #3, in order:

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

---

## 5. Blockers

1. **There is no Supabase project.** Three finished surfaces — `/v1/performance`, the webhook
   drain, and the prune — are written, tested against a local Postgres, and *unbound*. This is
   the single largest blocker and it needs the founder, not an agent.
2. **Founder decisions still open:** the domain; the data region and whether any EU claim is
   made given the Thai entity; which legal entity owns platform credentials; FlowAccount's API
   access model (`developer_support@flowaccount.com`).
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

1. **`docs/marketplane/20-marketing-site.md`.** Still missing — notes jump 19 → 21.
2. **`packages/brand/src/claims.ts` still carries the agency-and-brand `positioning` claim**,
   which contradicts spec §11A.1 (the SME repositioning). 24 site assertions in `apps/web`
   depend on it. This is a real inconsistency sitting in `main`'s path.
3. **WooCommerce as the first commerce connector.** Needs a `SOURCES` entry *and* a redaction
   keep-list, both shipping in the same PR — the redaction policy is `verbatim` until then, by
   design.
4. **The routing classifier** (§03 of the financial model). Highest financial return of any
   engineering work here; also required by the Ask surface.
5. **A design note for adding Google as a model vendor**, if the Gemini prep-layer saving is
   taken. The stack rule requires a written reason. Three checks first: a DPA with zero
   retention; a subprocessor disclosure; and a read of the advertising platforms' terms on
   transferring platform data to third parties.
6. **Register on the DEPA Thailand Digital Catalog** before the 2027 window closes.

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

Then pick from §7. Item 4 (the routing classifier) is worth more than the rest combined in cash
terms; item 2 (the contradictory brand claim) is the one actually sitting wrong in the tree.
