# 00. Repository map and phase 0 decisions

**Status: complete.** Seven read-only explorers plus a completeness critic, 8/8 returned. The critic's
verdict: *"phase 1 can be proposed now, and should be, with two narrow blockers named up front rather than
discovered mid-build."* This document is what every later agent is briefed from.

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

### Layout decision: a pnpm-workspaces monorepo

The brief requires a stated decision with a reason. "Build inside existing conventions" was not available,
so the decision is what to scaffold, and it is **a pnpm workspaces monorepo** — not Turborepo, not npm
workspaces, not a single app at the root.

**The reason, in one sentence:** the two hardest non-negotiables — one brand file, one tokens stylesheet —
each have consumers in three different runtimes (Node on Vercel, workerd on Cloudflare, Deno on Supabase
edge functions) plus CI codegen, and only a named workspace package turns "everything reads from this one
file" into a *declared dependency* that Vercel's skip-unaffected graph, wrangler's bundler, pnpm's strict
resolver and CI can each enforce. With relative imports it stays a convention, and a convention decays on
the first agent-written PR.

Three checkable facts rule out the single-root-app alternative:

1. A single root `tsconfig` cannot host `@cloudflare/workers-types` alongside Next's DOM lib without
   colliding on `fetch`, `Request`, `Response` and `caches`. Per-app tsconfigs are mandatory the moment
   there is more than one runtime.
2. Vercel's automatic skip-unaffected build detection requires `pnpm-workspace.yaml`, unique package names
   and explicit inter-package dependencies. Without them every commit rebuilds the web app.
3. Cloudflare Workers Builds is designed around a per-Worker root directory, build command and watch paths.
   Three Workers cost three dashboard configs and zero CI code.

**Ceremony is deliberately kept out**, because two founders maintain this: no Turborepo, no changesets, no
versioning, no publishing. Every package is `"private": true`, `"version": "0.0.0"`, consumed as
`workspace:*`. Internal packages export **raw TypeScript** (`"exports": { ".": "./src/index.ts" }`) — Next
consumes them via `transpilePackages`, and wrangler's esbuild and Deno compile TypeScript directly — so
there is no per-package build step. The only generator in the tree is `packages/tokens`, which parses
`tokens.css` into a TypeScript custom-property map for emails and PDFs.

That generator is the one **deliberate exception** to "no per-package build step", and it is worth
naming rather than leaving as an apparent contradiction. The `./tokens.css` export is raw and needs
no build; the `.` export does, because Workers render transactional emails and PDF exports that have
no stylesheet and no cascade and therefore need every token resolved per theme. The package's
`prepare` script regenerates it on every install, so the build step is invisible in normal use.
The cost is real and recorded in `02-scaffold-and-foundation.md`: after `rm -rf dist` or
`git clean -xfd` without a reinstall, Turbopack reports a bare "Can't resolve '#generated'" because
it does not implement subpath-imports array fallback, even though TypeScript does. Versions are pinned once in the
workspace catalogue. Net cost over a flat layout: about ten small files.

#### Where the brief's literal paths land

The brief names `src/brand/brand.ts` and `src/styles/tokens.css`, and grants the escape hatch itself ("or
the equivalent under the repo's conventions"). The equivalents are:

| Brief's path | This repository |
|---|---|
| `src/brand/brand.ts` | `packages/brand/src/brand.ts` |
| `src/styles/tokens.css` | `packages/tokens/src/tokens.css` |

Recorded here so no later agent reads it as drift. The alternative that preserves the literal paths —
putting both under `apps/web/src/` and having the Workers import upward — is rejected: it makes three
Cloudflare Workers depend on the Next.js app, inverts the dependency graph, breaks Vercel's
skip-unaffected detection, and drags Next and React types into workerd typechecking.

#### One non-negotiable is literally unsatisfiable, and how it is satisfied instead

The brief says "No string that identifies the company appears anywhere else." That cannot hold: `wrangler`
requires a Worker `name`, wrangler routes require the domain in `routes[].pattern`, `supabase/config.toml`
requires a `project_id`, and every workspace `package.json` requires a `name`.

Resolution: the brand guard is a test that **asserts each of those literals equals the value in
`brand.ts`**, over a written allowlist of infrastructure files, plus a hard ban everywhere else. The
allowlist is `wrangler.jsonc` (×3), `supabase/config.toml`, and each `package.json` `name` field. Anything
outside it fails the guard.

#### Toolchain pins that will otherwise bite

- **`vitest` must be pinned to 4.1.11.** `@cloudflare/vitest-pool-workers@0.22.0` peers `vitest ^4.1.0`
  while the current latest is 5.0.0, so any agent running `pnpm add -D vitest` installs 5.0.0 and breaks
  every Worker test. Pin it in the workspace catalogue.
- **No TypeScript project references / composite builds.** Next.js does not understand them
  (`vercel/next.js#67372`), even though TypeScript 7 supports them. This is why internal packages ship raw
  TypeScript.

The full file-level directory tree for the foundation milestone is in
[`00-recon-reports.md`](00-recon-reports.md).

---

## 2. Section 7's SDK and MCP plan is void: Stainless has wound down

**Verified independently, not taken from an agent's word.** Stainless announced on **18 May 2026** that it
is joining Anthropic and winding down its hosted products: *"Starting today, new signups, projects, and
SDKs will not be available."* Existing customers keep the SDKs they already generated; new projects cannot
be created.

The specification depends on it in four places — §7 line 700 ("a hand-held OpenAPI of 25 endpoints or fewer
so Stainless's free tier generates the SDKs, docs and MCP server at zero cost"), the §7 stack table line
723, §7 line 773, and §9 line 924 ("MCP server … generated with Stainless"). It is also an **internal
contradiction**: §0 and §10.2 both record the acquisition, and §0 reads it as making "spec-to-SDK-to-MCP a
commodity pipeline", while §7 plans on a free tier that no longer accepts projects.

Consequences, which are not optional extras:

- The repository **owns `openapi/`** — the OpenAPI document is a first-class source file, not a generator
  input handed to a vendor.
- **`apps/mcp` is hand-written** against protocol revision `2026-07-28`, with the §7 MUST/MUST-NOT list
  implemented directly rather than generated.
- **The 25-endpoint budget stays, but its stated justification is void.** It was "so Stainless's free tier
  covers five generators". The real reason now is maintenance surface for two founders — every endpoint is
  a hand-written MCP tool, a hand-written SDK method and a documented contract. Keeping the cap is still
  right; the reason in the design note must be the true one.

---

## 3. The design tokens, and the divergence that has to be escalated

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

## 4. The contract: four envelope shapes, reconciled into one

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

## 5. Stack: the dlt trade-off, recorded as the kickoff requires

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
| **Cloudflare Workflows** | The restatement scheduler — the heart of the system. One instance per `(connection, source, ingest_date)`, with `step.sleep`-driven re-pulls at D+1, D+3, D+7 and D+28 (365-day sleep ceiling, idle not billed). **One instance per connected account for backfills, never per tenant.** *(Figure corrected in `08-backfill-planner.md`: this originally said 360 steps per account and 14,400 for a 40-client agency, which assumed a naive daily backfill. The tiered planner costs 105 steps per account and 4,200 for forty clients — inside the limit. The ceiling is reached at about 95 accounts, so the advice stands; the arithmetic behind it did not.)* |
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

## 6. Platform terms, as engineering constraints

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

## 7. The marketing site cannot ship as designed

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

## 8. Guards against the two ways this contract could go wrong

The completeness critic found one recommendation in the whole recon set that contradicts a binding
non-negotiable and would have hardened into a wrong contract if it reached `packages/contract` unreviewed.
Both guards are recorded here because they bind the next PR, not this one.

**The freshness fields stay flat.** The API explorer's proposed TypeScript regrouped §7's row into nested
`freshness{fetched_at, source_updated_at, restates_until, is_provisional}` and `fx{...}` objects. That is
exactly what §7 line 762 refutes in terms: *"A single `freshness` timestamp cannot express three clocks,
which is why the field set splits into `fetched_at`, `source_updated_at`, `restates_until` and
`is_provisional`."* Kickoff non-negotiable 5 names the same four at the top level. **They stay at the top
level.** The explorer's *additions* are adopted — `account_id`, `entity_id`, `timezone`, `fx_rate`,
`fx_base`, `first_seen_at` — as additive top-level fields, because each is demanded elsewhere in the
specification and printed nowhere. `entity{}` and `dimensions{}` keep §2's nesting because that is §2's own
printed shape. Any further grouping is a contract change and is not made silently.

**Section 13.3's connector contract is stale and must be restated before any connector merges.** The
kickoff mandates both "follow the routines in section 13" *and* non-negotiable 5, and on four points they
disagree. §13.3 wins on process — the self-contained connector unit, recorded fixtures with PII scrubbed,
offline contract tests in CI, dictionary-PR-before-new-metric, currency normalised at fetch time. §2, §7
and non-negotiable 5 win on the contract itself:

| §13.3 as written | Amended to |
|---|---|
| `freshness{window_days, last_restated_at, is_final}` | The four flat fields |
| `is_final` | `is_provisional` only — never both a flag and its complement on one row |
| `conversion_value` | `conversions_value` (two printed envelopes and the Fivetran package) |
| GA4 backfill 72 h | GA4 restates 12 days (§7 table, §9 backfill tier) |

Left unamended, the mandatory pre-merge connector contract test would reject the envelope the API is
required to emit.

**A third guard, on process:** the "empty repository" premise is already false and mutated three times
during reconnaissance. Local `main` is stale at the pre-documentation commit while `origin/main` has moved.
Every agent fetches and re-reads `HEAD` before writing, branches from `origin/main` or the current branch
and never from local `main`, and edits `README.md` rather than regenerating it.

---

## 9. Built on open questions — flagged, as the brief requires

The kickoff says not to build on anything the specification marks unverified or open without flagging it.
These are load-bearing for phase 1 and after; the full 19-item list is in
[`00-recon-reports.md`](00-recon-reports.md).

**Flagged in the PR that lands the contract types:**

1. **Meta's 28-day clock: delivery or first report?** Unresolved in Meta's own docs, per both the
   specification's researcher and its fact-checker. The `first_seen_at` anchor builds directly on it.
   Settle empirically: diff a historical pull against a re-pull 30 days later.
2. **Google Ads publishes no freshness or finalisation statement at all** — three attempts found nothing.
   `restates_until = fetched_at + account conversion window` is a guess dressed as a contract, and 90-day
   nightly re-pulls may be over-engineered.
3. **GA4's 12 days carries Google's own disclaimer**: *"This is not a guarantee, nor an SLA or an SLO."*
   It cannot be sold as a guarantee anywhere, the envelope's semantics included.

**Flagged in the auth and onboarding PRs:**

4. **Google OAuth sensitive-scope verification is unbounded.** The "3 to 5 days" figure could not be
   sourced and Google publishes no duration; one observed case ran 2026-04-01 to 2026-06-12 unresolved.
   **Never quote 3–5 days.** Self-serve signup gates on the outcome, not the roadmap.
5. **Google Ads Standard Access may have no path for a headless product** (§11.11, High) — "RMF categories
   are defined by what a tool displays." Nothing may be designed that needs more than 15,000 operations per
   day until Google answers in writing. **The Numbers screen is a compliance artefact, not a feature.**
6. **Whether Meta treats a pay-per-call API as a Tech Provider** needing per-client authorisation is
   unresolved (§11.11, High). The client-list record and the Business-admin acceptance step are being
   designed into the phase 1 schema on that basis.
7. **Per-tenant Google developer tokens in a multi-tenant service are undocumented** — the specification's
   own open question is "whose token appears in the request?". The `connections` schema encodes an answer
   no source confirms.
8. **`webmasters.readonly`'s sensitive-scope status is unconfirmed** — not listed on Google's OAuth scopes
   page. Search Console could fall behind the same unbounded gate as GA4, which would remove it from the
   launch connector list.

**Flagged on every design note's cost estimate:**

9. Performance COGS and the ~98% margin are marked unverified in §8; §7's table has no disk-growth term by
   its own checker's admission; and the mandated stack adds two further uncosted terms (R2 object count, KV
   write volume). §8's own open question is the sharpest: *"the ~98% margin assumption collapses if platform
   limits force 3× to 5× redundant polling per useful row"* — which is exactly what the Workers scheduler
   determines.
10. **Do not hard-code Meta's rate-limit constants.** The specification flags its own 5,000+40× and
    190,000+40× figures as not appearing in the cited source. Only `ads_api_access_tier` of the three
    `x-fb-ads-insights-throttle` fields is named; do not invent the other two.

**One item the critic flagged that is now closed:** it marked the Stainless wind-down as resting on a
single unverified blog post. It was verified directly against the announcement during this session —
published 18 May 2026, *"Starting today, new signups, projects, and SDKs will not be available."* It is a
fact, not an assumption. Stainless pricing above the free tier remains unknown and is moot.

---

## 10. Gaps the orchestrator closes by deciding, not by asking

The critic separated *contested* from *unspecified*. These four are unspecified — no source contradicts
another, nobody established an answer, and phase 1 cannot proceed without one. They are decided explicitly
in the phase 1 design note rather than discovered mid-build.

1. **How Supabase Auth maps onto organisation / workspace / member.** The central RLS design decision of
   the whole foundation milestone: JWT custom claims via an auth hook, or a membership-table join inside
   every policy; how the four roles enter the policy; how role changes propagate. Every migration and every
   pgTAP test depends on it.
2. **How a Cloudflare Worker authenticates an API key against Supabase without a service role that
   bypasses RLS.** "No service-role bypass" is a hard gate from the platform-terms work, and §15 requires
   workspace-scoped keys with a spend budget and a tool allow-list. Key format, hashing and lookup scheme,
   and request identity at the edge are all unestablished. Blocks both `apps/api-edge` and the `api_keys`
   migration.
3. **Where the customer's OAuth grants live.** §15 says "in a vault" and non-negotiable 4 forbids shared
   tokens. Supabase Vault/pgsodium, Cloudflare Secrets Store, or envelope encryption with a KMS key — and
   who can decrypt, from which runtime. The `connections` table cannot be designed without it, and open
   question 7 above means it may also need a per-tenant `developer_token` field.
4. **How invitation emails are sent.** The invitation flow is in the first milestone and email delivery is
   not one of the three mandated providers. Either Supabase Auth's built-in email suffices — no fourth
   provider, so no written reason needed — or a sender like Resend does, which needs the written reason
   non-negotiable 3 demands **plus** a sub-processor page entry per §3.2.

---

## 11. Decisions that belong to the founder

Five, and the first three block work that is otherwise ready.

1. **Brand display register.** *Option A (recommended, and what gets built absent an answer):* the artboard
   as shipped — Young Serif 400 headlines, Figtree body, Geist Mono, cool `#F4F6FA` ground, one accent
   `#2563EB`, editorial register. *Option B:* §14 as written — Geist 800 set tight, warm `#FBFBF8` ground
   with `#ECE9E1` hairlines, electric indigo `#4F46FF`, bold-sans-tech register. No rule in the corpus
   resolves this: §11 takes no design decision. Reversal is one token file, but only before the marketing
   site is built. Either way the three semantic status hues are adopted from §14 for status marks only.
2. **The brand file's identity facts**, which cannot be invented and which block non-negotiable 1 outright:
   is *Marketplane* final (§12 only recommends it — "If forced to one"); is the domain registered and which
   TLD is primary (the artboard hard-codes `api.marketplane.dev`); the legal entity name, company and VAT
   number, registered postal address, support and legal email addresses; default locale and **currency**
   (artboard EUR, §8 USD); and the data region to commit to publicly. §9 week 0 implies the company is not
   yet incorporated — if so, the answer needed is *which fields ship as placeholders and which claims come
   off the site until they are real.*
3. **Which legal entity and which accounts own the platform credentials and hosted infrastructure.** The
   answers are entity-bound, slow, and expensive to redo: under what entity the Google Ads developer token
   and GCP project are applied for; under what entity the Meta app is created and Business Verification and
   App Review are filed; who owns the Vercel team, the Cloudflare account and the Supabase organisation.
   Google OAuth verification and Meta verification both start in week 1 on §9's plan and **both restart if
   the entity changes**. The Meta 5.b.ii.2 client-list obligation also attaches to the entity.
4. **Default AI-answer model.** Batched Haiku 4.5 at ~$0.003 versus Sonar Pro at $0.024–$0.032 swings
   blended COGS 3.2×. §11.8 makes it a published pass-through rate, so it is a pricing decision.
5. **Pricing currency**, if not already settled by (2).

---

## 12. Phase 1 plan

Sequenced so the two blocked decisions do not stall work that is ready. Each PR carries a design note under
`docs/marketplane/` with a cost estimate **per connected account per month** (not per 1M calls — §11.3
abolished the per-call unit for the largest revenue line), the 18-gate platform-terms check, and what was
left out.

| PR | What | Blocked on |
|---|---|---|
| **1** | This map, the evidence appendix, the design-note template, the PR template | — *(this PR)* |
| **2** | pnpm workspace scaffold: pinned catalogue, Biome, vitest 4.1.11, CI, both guards in warn mode, an `apps/web` that actually builds, a health-check `apps/api-edge` to prove the Workers target | — |
| **3** | `packages/brand` and `packages/tokens` | Founder decisions 1 and 2 |
| **4** | Supabase schema: organisations, workspaces, members and roles, invitations, connections, API keys | Gaps 1–3 |
| **5** | Auth and the invitation flow | Gaps 1 and 4 |
| **6** | pgTAP RLS suite, including a cross-workspace isolation test that proves "no cross-workspace aggregation, ever" | Gaps 1–3 |

**PR 2 is the one nobody can skip and nobody has done.** No install, build or typecheck has been executed
in this session. Two things are asserted and untested: that a source-only shared package typechecks under
both `@cloudflare/workers-types` and Next's DOM lib without colliding on `fetch`/`Request`/`Response`/
`caches`, and that Vercel's skip-unaffected detection fires on a CSS-only change inside `packages/tokens`.
The whole layout argument rests on both. PR 2 proves them or the layout decision reopens.

Two cost lines to watch from the first migration, both of which the specification misses: Supabase disk at
$0.125/GB if `raw` ever lands in Postgres as JSONB rather than as an R2 key, and KV writes at $5.00/million
if the envelope cache is keyed per row. Mandated fixed monthly is roughly **$150–$200**, not §7's
$110–$150 — §7's table has no Vercel line at all.
