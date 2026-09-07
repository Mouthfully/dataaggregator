# 00. Repository map and phase 0 decisions

**Status: in progress.** Six of seven reconnaissance explorers have reported; the repository-layout
explorer and the completeness critic are still running. Sections marked *pending* below are filled in
by a follow-up commit on this branch. Everything else is settled and is what later agents are briefed
from.

Evidence for every claim here is in [`00-recon-reports.md`](00-recon-reports.md), which records each
explorer's findings verbatim with confidence levels and sources.

---

## 1. What the repository actually contained

The kickoff brief's phase 0 assumes an existing Next.js application: a `package.json` to read versions
from, an app router layout, a `supabase/` directory, a `design/` prototype, `src/app/globals.css`, a
Tailwind theme, `components.json`, shadcn primitives, and a `docs/BACKEND-HANDOVER.md`. **None of that
exists.** At session start the repository was one commit (`3651cde`) and a 16-byte `README.md`.

So the four recon questions the brief poses — structure, design system, existing patterns, conventions —
have the same answer: there is nothing to inherit. Phase 0's real subject is the specification and the
design artboard, and that is what the explorers were pointed at instead.

| Question the brief asks | Answer |
|---|---|
| Top-level directories, framework, versions | None. No `package.json`, `tsconfig`, `.gitignore`, `.github`, `.claude`, `CLAUDE.md`, CI, lint or format config anywhere. |
| Where colours, radii, shadows, spacing and type are defined | Nowhere in code. Only in `design/marketplane/Main.dc.html`, as inline style attributes. |
| Existing auth, data-fetching, form, table and chart patterns | None. |
| Commit style, branch naming, PR template, README claims | None. `README.md` was the single string `# dataaggregator`. |

The specification, kickoff brief and artboard were supplied as session attachments rather than repository
files. They were committed to their expected paths first, so that later agents read them from the
repository rather than from a chat attachment: `docs/MARKETING-DATA-PLANE.md`,
`docs/MARKETPLANE-KICKOFF-PROMPT.md` (the path specification section 15 already cites), and
`design/marketplane/`. That landed as PR #1 and is now on `main`.

### Toolchain, verified rather than assumed

Node v22.22.2, npm 10.9.7, pnpm 10.33.0, yarn 1.22.22, bun 1.3.11, corepack 0.34.6, git 2.43.0. Globally:
tsc 6.0.2, eslint 10.1.0, prettier 3.8.1, playwright 1.56.1 with no browser binaries downloaded.
30 GB free disk, 15 GiB RAM, 4 CPUs.

The npm registry is reachable and fast (`npm ping` 427 ms; `registry.npmjs.org` sits in `NO_PROXY` so it
bypasses the agent proxy entirely; a 41.7 MB `next` tarball fetched HTTP 200). GitHub release assets also
fetch 200, so binary-downloading postinstalls work. **Nothing blocks a scaffold.**

Two absences that change how work is done:

- **No `gh` CLI.** All GitHub operations go through the `mcp__github__*` tools.
- **No Docker daemon** (binary present, `/var/run/docker.sock` missing). `supabase start` cannot run a
  local stack. Supabase work is therefore migration-file-first, applied against a hosted project or a
  Supabase branch, and RLS tests run against that rather than against a local container.

### Layout decision — *pending*

The brief requires a stated decision with a reason. Since the repository is empty, "build inside existing
conventions" is not available and the real question is what shape to scaffold: a single Next.js app at the
root with sibling Worker directories, or a workspace monorepo. The deciding constraint is that the brand
file and tokens stylesheet must be consumed by a Vercel app, several Cloudflare Workers, and generated
documents, without duplication. The explorer weighing this is still running; the decision and the
directory tree land in the follow-up commit.

---

## 2. The design tokens, and the divergence that has to be escalated

This is the most consequential finding of phase 0.

**The artboard and specification section 14 describe two different brands, and their palettes do not
intersect at all.** Zero of section 14's six named hexes appear anywhere in `Main.dc.html`, and zero of
the artboard's thirteen hexes appear anywhere in the specification.

| | Specification §14 (and the kickoff brief, verbatim) | `design/marketplane/Main.dc.html`, as built |
|---|---|---|
| Ground | `#FBFBF8` (warm near-white) | `#F4F6FA` (cool near-white) |
| Hairline | `#ECE9E1` | `#CBD5E1` structural, `#E2E8F0` interior |
| Accent | `#4F46FF` electric indigo | `#2563EB` (Tailwind blue-600) |
| Reads | `#0FB5A0` teal | *absent* |
| Writes / competitor alerts | `#FF5A5F` coral | *absent* |
| Restatements | `#FFB020` amber | *absent* |
| Display face | Geist, weight 800, "the serif display moment was dropped" | **Young Serif, weight 400**, on 21 elements including every `h1` and `h2` |
| Body face | Geist | **Figtree** |
| Mono face | Geist Mono | Geist Mono ✓ |

The type divergence is not a near-miss, it is inverted: section 14 states the serif was dropped in favour
of "one consistent bold voice", and the surviving artefact makes a serif the entire display voice. The
artboard's own Google Fonts link requests no 800 weight at all, so §14's headline weight is not even
loadable from it. This changes the brand's register from bold-sans-tech to editorial-serif.

**What survives from §14 unchanged:** 20 px card radii (12 uses), white cards on a near-white ground, one
soft shadow (`0 24px 60px rgba(15,23,42,0.12)`), negative tracking on display type (`-0.02em` on the hero,
`-0.015em` on section headings), and — importantly — the *rule* that one colour owns the brand and every
call to action. `#2563EB` does exactly that job in the artboard: 10 background uses, all CTA-adjacent.

### The decision taken

**Build from the artboard.** The kickoff brief's operative instruction is "Start from the values in
`design/marketplane/Main.dc.html`"; the parenthetical that follows is a gloss on that file, and where a
gloss contradicts the artefact it summarises, the artefact is the value and the gloss is the error. The
artboard is also internally coherent — eleven of its thirteen hexes are exact Tailwind slate/blue/green
stops that sit together — whereas grafting a warm `#FBFBF8` ground onto cool slate hairlines produces a
visible temperature clash. Section 11 takes no design decision, so its override rule does not rescue §14.

**With one carve-out.** The three semantic status hues are taken from §14, because the artboard is *silent*
on them rather than contradictory: it is a marketing page with no product state to express, and it never
had to distinguish a read from a write from a restatement. The product needs that distinction on day one.
So teal `#0FB5A0`, coral `#FF5A5F` and amber `#FFB020` ship as a status layer *above* the brand layer, with
these constraints:

- `#2563EB` remains the only colour that ever fills a button, a CTA panel or the wordmark. Nothing in the
  status layer may be used for an action.
- Status hues appear only as dots, left rules, icon tiles, badges on a tinted ground, or chart series. All
  three fail AA as text on white (teal 2.58:1, coral 3.05:1, amber 1.83:1), so each ships with a paired
  darkened `-ink` token for any label.
- **No competitor colour.** Section 11.5 drops the market module, so §14's "coral for competitor alerts"
  and "amber for competitors" halves are dead. Coral's surviving role is writes; amber's is restatements.

**Dark mode** is derived from the inverse surfaces the artboard already ships across its alerts section,
code panel, footer and dark card (`#0F172A` ground, `#CBD5E1` body ink, `#FFFFFF` headings, `#93C5FD`
accent). Two values have no source and are invented: a dark card surface `#1E293B` and a dark hairline
`#334155`, both the in-family Tailwind continuation. **Flagged as invented.**

One defect in the artboard is fixed rather than copied: the code panel's punctuation uses `#2563EB` on
`#0F172A` at 3.51:1, which fails AA. The token uses `#93C5FD` (9.98:1) instead.

> **This needs a human decision.** Whether the brand is editorial-serif (the artboard) or bold-sans (§14
> and the kickoff brief) is a brand-register question, not a token question. The tokens stylesheet is built
> from the artboard so work can proceed, and this is flagged rather than silently resolved. Reversing it
> later is a change to three font variables and the Google Fonts link, not a rebuild — the token names are
> designed so the values can swap without touching a component.

---

## 3. The contract: four envelope shapes, reconciled into one

The specification prints **four different envelopes and they do not agree**: §2 is a response wrapper with
`ok`/`module`/`meta` and nested `entity`/`dimensions`; §7 is a flat data row with `raw` and no wrapper;
§13.3 gives a third with a nested `freshness` object that §7 explicitly refutes at line 762; and the
artboard prints a fourth with `data[]`, `revised_from`, and the freshness fields moved into `meta`.

Reconciliation, since §2 itself defers to §7 ("The full field specification … is in section 7") and the
kickoff requires "the envelope in section 2 and section 7":

- **§7 is authoritative for the row.** **§2 is authoritative for the wrapper.** Union them.
- Keep §2's nested `entity{}` and `dimensions{}` grouping — it is the only shape carrying a canonical
  `entity.id`, which the upsert key requires. Keep §7's `raw` passthrough on the row.
- **`is_provisional`, never `is_final`.** Both appear across the document; `is_provisional` is in both
  envelope printings and in the kickoff's binding list. `is_final` is its complement and must not also
  appear on the row.
- **`conversions_value`, not `conversion_value`.** §13.3's spelling is a typo against two envelope
  printings and the upstream Fivetran package. `revenue` stays a separate dictionary entry meaning
  order-source revenue, never an alias.
- **GA4 restates for 12 days, not 72 hours.** §13.3's "72h" conflates processing latency with the
  attribution-restatement window; 12 days is sourced to Google's own statement and repeated in §9.
- §13.3's nested `freshness{}` contract must be rewritten to the four-field split before any connector
  merges, or the connector contract test will reject the envelope the API is required to emit.

### A real defect in the specification

The §7 clocks table gives `restates_until = fetched_at + Nd`. **That formula is broken for a materialised
store.** `fetched_at` is mutable under nightly restatement re-pulls, so `restates_until` slides 28 days
forward on every pull and no row ever becomes final — `is_provisional` never clears, which is the one
guarantee the product sells. The specification's own two examples disagree with the table and with each
other (one anchors to the row date, one to `fetched_at`, and the second applies Meta's 28-day rule to a
`google_ads` row).

Anchor to an immutable per-row value instead: `restates_until = max(date, first_seen_at) + window`. This
builds on §7's explicitly open question of whether Meta's 28-day clock starts at delivery or at first
report, and **is flagged as such**.

### Three fields the specification requires but never prints

- **`account_id`** — named in the upsert key `(source, account_id, entity_id, date, attribution_window)`
  but absent from every printed envelope. Without it a caller cannot reproduce a row's identity.
- **`entity_id`** — present only in §2's shape.
- **`timezone`** — §3.1 and §4.4 promise timezone normalisation as a guarantee co-equal with currency, and
  the head-to-head table in §4.4 sells it against Supermetrics and Windsor. No timezone field exists in any
  envelope. Without an IANA timezone dimension that guarantee is unshippable and the comparison claim is
  false.

Also added: **`fx_rate`** (numeric) and **`fx_base`**. §13.3 requires "the rate and source recorded on the
row"; §2 and §7 record only `fx_source` and `fx_rate_date`. A source and a date cannot reproduce a
conversion when ECB publishes on business days only and the carry-forward rule is unspecified — and §7's
own rationale is that "customers must be able to audit the number".

Two ideas are adopted from the artboard deliberately: a **`data[]` array wrapper** (the specification's
single-row envelope has no defined multi-row form, which every real read needs), and **`revised_from`** —
placed in the restatement webhook payload, not on the read row.

### Endpoint budget

The surface does **not** fit under the 25-endpoint Stainless free-tier cap if per-grain reads are
enumerated. It fits at **23** once section 11's decisions are applied: `/v1/market` dropped (11.5),
`/v1/audience` deferred (11.4), Search Console and Trends demoted to free joins inside `diagnose` rather
than billable endpoints (§9 over §8), and performance reads collapsed onto one parametrised
`/v1/performance/report`.

Section 11 also kills two of §8's own credit rows: **11.3** replaces per-row performance credits with
per-connected-account monthly metering, and **11.8** replaces the flat 10-credit AI-answer price with
2 credits plus measured LLM pass-through. Performance reads still return `meta.credits_used`, but report
`0` and surface the connected-account meter instead.

---

## 4. Stack: the dlt trade-off, recorded as the kickoff requires

The kickoff mandates TypeScript extractors on Cloudflare Workers. Specification §7 recommends dlt on
Trigger.dev compute, and pairs them for exactly one reason, stated verbatim at line 718: *"Cloudflare
Workers has no native long-running Python."*

**The mandate wins, and on stronger grounds than provider consolidation:**

1. §13.3 rule 2 bans schema evolution by policy — "a new metric requires a dictionary PR first" — and the
   envelope is a fixed hand-authored contract. dlt's single largest differentiator is not merely unused,
   it is forbidden.
2. dlt normalises *structure*; this product needs *semantic* normalisation (dbt_ad_reporting naming
   extended with `attribution_window` as a dimension), which §7 itself says no public schema models. That
   is hand-built either way.
3. dlt's generic retry client understands none of the three quota regimes that actually drive the design
   (GA4's complexity-priced tokens, Google Ads' per-developer-token caps where rejected requests still
   count, Meta's per-application throttle score). Quota-aware backoff is hand-written under either stack.
4. §10.2's own finding is that AI collapsed the price of *writing* a connector and not of *operating* one.
   dlt's verified sources supply exactly the half that collapsed.
5. The "someone else maintains it" benefit is empirically weak in this document: a funded vendor with a
   dedicated connectors org left Airbyte #76483 untriaged more than two months past Meta's cutoff.

**Honest cost of winning:** roughly 2–4 engineer-weeks of TypeScript to replace what genuinely transfers —
incremental cursor state, a paginator library, a retrying HTTP client, chunked backfill windows, and
merge/upsert with deduplication — plus the tacit platform knowledge embedded in three verified sources,
plus permanent ownership of §10.2's 20–25 forced platform changes per 24 months at 0.8–1.2 FTE.

**Considered and rejected:** Cloudflare Containers would run dlt in Python on Cloudflare and satisfy both
the three-provider rule and §7 simultaneously (4 vCPU / 12 GiB instances, 375 vCPU-minutes included on
Workers Paid). Rejected on operational surface area for a two-founder team, cold-start latency inside a
Workflow step, and the fact that dlt's differentiating features are banned by §13.3 anyway. Named here so
the record shows a choice rather than a constraint that no longer holds.

### The highest-risk unbriefed constraint

Cloudflare Workers' **128 MB isolate memory** and the **1 MiB Workflow step-output cap** appear nowhere in
§7, yet together they forbid the most natural TypeScript implementation: fetch a report, `JSON.parse` it,
return the rows from the step. **Every extractor must stream to R2 and return a key.** A builder agent not
briefed on this will ship a Meta async-report connector that passes fixtures and fails on a real large
account. This goes in every connector builder's brief.

Other verified limits: 5 min CPU per invocation on Paid, 6 simultaneous open connections, 10,000 steps per
Workflow instance by default (25,000 configurable), 15 min wall clock on cron and queue consumers.

### Component map

| Provider | Owns |
|---|---|
| **Vercel** | Marketing site (static, edge-cached), dashboard, server actions for authenticated mutations, and the Google/Meta OAuth redirect and callback endpoints — those need a browser-visible domain and session. No scheduled work, no public API traffic. |
| **Cloudflare Workers** | Public REST API and MCP server, envelope assembly, per-key auth and spend budgets, rate limiting via the `x-mcp-header` tenant hint so the edge routes without parsing bodies, credit accounting, and Cron Triggers that start Workflow instances. |
| **Cloudflare Workflows** | The restatement scheduler — the heart of the system. One instance per `(connection, source, ingest_date)`, with `step.sleep`-driven re-pulls at D+1, D+3, D+7 and D+28 (365-day sleep ceiling, idle not billed). **One instance per connected account for backfills, never per tenant**: 4 sources × 90 days = 360 steps per account, safely inside the default; a 40-client agency in one instance is 14,400 and blows it. |
| **Cloudflare Queues** | The cross-tenant concurrency governor, one queue per platform with consumer concurrency capped below the platform's per-application budget. This is the only place Meta's per-application throttle score and Google Ads' 2,880-per-developer-token cap can be enforced globally — both are shared bottlenecks invisible from inside a single Workflow instance. |
| **Cloudflare R2** | Verbatim raw platform payloads, one deterministically keyed object per `(source, account, date, window, fetched_at)`, written by streaming so nothing large enters the isolate. |
| **Supabase** | Postgres canonical store, auth, RLS, storage, pg_cron for light schedules. |

### Cost model corrections

Section 7's cost table is already stale against §8 and §11:

- **SERP: $0.002, not $0.0006**, for any synchronous endpoint. §8's fact-check gives the wholesale floor as
  $0.002 and notes this cuts the 2-credit SERP margin from 94% to 80%. The $0.0006 standard queue is
  available only to *scheduled* collection — worth building precisely because `watch` and `diagnose` are
  scheduled.
- **AI answers: $0.024–$0.032** for Sonar Pro, $0.030 for Opus 5, ~$0.003 batched Haiku 4.5. The default
  model choice alone swings blended COGS 3.2×, which makes it a pricing decision, not an engineering one.
- **Blended cost roughly doubles**, from ~$0.0009 to ~$0.0018 per call.
- **The largest revenue line has no COGS baseline anywhere in the specification.** §11.3 meters performance
  per connected account per month, so a per-call figure no longer describes a sellable unit. Every design
  note's data-plane cost estimate must be stated **per connected account per month**, derived from the
  restatement ladder (rows/night × depth × sources), before a pricing page exists.
- R2 relieves the line §7 names as most likely to break — Supabase disk overage at $0.125/GB — because R2
  Standard is $0.015/GB-month, 8.3× cheaper. **Only if `raw` is an R2 key in Postgres rather than a JSONB
  blob.**

---

## 5. Platform terms, as engineering constraints

Two clauses set the architecture's shape. Google Ads Developer Policies forbid letting third parties
"avoid applying for their own Google Ads developer access and Google Cloud Platform project", and require
written client consent before redistributing account-specific data. Meta Platform Terms 3.a.iv forbids
selling, licensing or purchasing Platform Data; 5.b.ii.2 requires per-client separation plus "an
up-to-date list of your Clients and their contact information" provided to Meta.

Consequences that are not negotiable:

- **Bring-your-own-credential on every ad and analytics platform.** Google Ads daily limits are *per
  developer token*, so a shared multi-tenant token is both non-compliant and non-scalable.
- **A single Marketplane-held key is permitted only for public-data sources** — DataForSEO SERP and the AI
  answer providers. Never for platform data.
- **The Meta client list is a stored, maintained record from day one**, not a launch-day scramble.
- **Contact data, if it ever exists, is SHA-256 hashed at the edge and never stored raw**, with a per-record
  consent object mapping to Google `ad_user_data`/`ad_personalization` (EEA default-deny) and Meta
  `data_processing_options`. The precedent is a CNIL €3.5 M fine on 2025-12-30 for exactly this use case
  without consent.
- **RLS keyed on organisation and workspace on every tenant-scoped table. No cross-workspace aggregation,
  ever.** No cross-customer benchmarking on platform data — that is a termination risk on the two largest
  sources.
- **Access is the schedule, not code.** Google Ads Explorer and the affiliate networks are same-day; Meta
  needs Business Verification plus App Review (weeks 3–8) and a 500-calls-in-15-days cadence at under 15%
  errors; Google OAuth sensitive-scope verification is unbounded — the "3 to 5 days" figure is unsourced
  and one observed case ran from 2026-04-01 to 2026-06-12 unresolved. **Self-serve signup gates on that,
  not the roadmap.**

The full 18-gate platform-terms checklist, ordered credential → tenancy → data movement → PII → access tier
→ claims, is in [`00-recon-reports.md`](00-recon-reports.md) and becomes the mandatory block in every
design note.

---

## 6. The marketing site cannot ship as designed

The artboard was written against the pre-decision pitch, not against section 11. Roughly 40% of its copy
survives unchanged.

| On the artboard | Killed by | Action |
|---|---|---|
| "Reads from 22 sources", "All 22 integrations", and the 22-mark grid | §0, §9, §11.9 — the decided scope is five connected sources plus bought SERP | Delete the counts; regroup to what actually connects |
| Competitors card, `/v1/market`, the competitor logo group, `alerts[0]` | §11.5 "Drop" | Delete outright. §14 already anticipates this. |
| Customer lists card, `/v1/audience`, "Consent checked before export", and three write-side promises | §11.4 — writes deferred past MVP | Delete or mark clearly as later |
| "Pay as you go. Nothing monthly." and four credit packs | §11.3 — two units, performance metered per connected account per month | Rebuild the whole block |
| Every AI-answer claim stated as a single deterministic result | §11.8 — "confidence intervals, never a single rank" | Rebuild around `n_runs` |
| "Frankfurt by default", "UK GDPR", "DPA on request", "SAML SSO on Scale" | Unsupported anywhere in the specification | Delete or substantiate |
| Every number in the demo answers, alerts, `curl` response and status line | §14 says so explicitly — all invented | Replace with a real design-partner case |

**Worth porting verbatim:** the demo card and its full state machine (28 ms typing, 3 × 520 ms thinking
steps, 11 s autoplay, click stops rotation), the `STEPS` array (it already names the correct MVP sources),
the first two demo questions, the alerts' "confirmed twice" framing, the "Connect. Reconcile. Ask. Act."
spine, the developer strip and its three install lines, and the section headings.

A **33-item allowed-claims list** and a **forbidden-claims list** are recorded in
[`00-recon-reports.md`](00-recon-reports.md). Both go into `brand.ts` so the ban is machine-checkable and
no marketing string can outrun the specification.

---

## 7. Built on open questions — flagged, as the brief requires

The kickoff says not to build on anything the specification marks unverified or open without flagging it.
These are the ones the plan does build on:

1. **Meta's 28-day restatement clock: delivery or first report?** (§7, open). The `restates_until` anchor
   assumes first report. Resolution is empirical: diff a historical pull against a re-pull 30 days later.
2. **Google Ads publishes no freshness or conversion-finalisation statement** (§7, open, three attempts
   found nothing). The 90-day window is an upper bound, not a documented SLA; 90-day nightly re-pulls may
   be over-engineered. Measure on a live account first.
3. **Whether a headless API can qualify for Google Ads Standard Access at all** (§11.11, High severity).
   Requires a written answer from Google in week 1. Design partners live within Basic limits meanwhile.
4. **Whether Meta treats a pay-per-call API as a tech provider needing per-client authorisation**
   (§11.11, High). Needs a legal read before pricing goes live.
5. **DataForSEO LLM Responses total cost** (§7, unverified, "could be off by 2 to 3× in either direction").
6. **Dark-mode card surface and hairline** — invented, no artboard source.
7. **Whether anyone pays for verified root cause** (§11.11, High). The specification's own exit criterion
   requires one paid `diagnose` case by week 12; if none, "the honest conclusion is that the product is a
   report and a dataset, not a data plane."

---

## 8. Decisions that belong to the founder, not the orchestrator

*Provisional — the completeness critic may add to this list.*

1. **Brand register: editorial-serif or bold-sans?** The artboard says Young Serif + Figtree; §14 and the
   kickoff brief say Geist 800. Building from the artboard so work proceeds; this is reversible as a
   variable swap, but it is a brand decision.
2. **Pricing currency: EUR or USD?** The artboard prices in euros, §8 in dollars. Both envelope examples
   convert to EUR. Needs to be decided once rather than diverging.
3. **Default AI-answer model.** Batched Haiku 4.5 at ~$0.003 versus Sonar Pro at $0.024–$0.032 swings
   blended COGS 3.2×. §11.8 makes it a published pass-through rate, so it is a pricing decision.

---

## 9. What phase 1 does with this

*Pending the layout explorer and the critic.* The foundation milestone is the brand file, the tokens
stylesheet, the Supabase schema for the §15 account model, authentication, the invitation flow and RLS
tests — in that order, because everything else reads from the first two.
