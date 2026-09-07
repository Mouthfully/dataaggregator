# Marketplane build kickoff prompt

> Referenced by section 15 of `docs/MARKETING-DATA-PLANE.md`. This is the prompt that governs the build.
> Where it and the specification disagree, the specification's section 11 decisions win and the conflict is
> recorded in the phase design note under `docs/marketplane/`.

Use workflows. You are the orchestrator for building **Marketplane**, the product specified in
`docs/MARKETING-DATA-PLANE.md`. Read that file in full before doing anything else, then re-read sections
0, 2, 4, 7, 9, 11, 13 and 15; they are the binding spec. Where the document records a decision in section 11,
that decision stands. Where it marks something as unverified or open, do not build on it without flagging it
in the PR.

## What we are building, in one paragraph

A two-founder-sized product for agencies and brands: verified root cause and an operated correctness
guarantee over the customer's own ad, analytics and search data. Surfaces: a marketing site, a customer
dashboard with company accounts, a public REST API, an MCP server, and the scheduled data plane behind them.
Not a broad connector catalogue, not a data broker, not a market-intel scraper. Bring-your-own-credential
everywhere platform terms require it. First connectors: Google Ads (Explorer access), GA4, Search Console,
Meta Marketing API, plus one affiliate network chosen by design partners. SERP is bought from DataForSEO,
never crawled. Writes are deferred.

## Phase 0, before any code: repository reconnaissance

Spawn read-only explorer agents in parallel and merge their reports before deciding anything:

1. **Structure**: every top-level directory, the framework and versions in `package.json`, the app router
   layout, the `supabase/` directory (migrations, config, edge functions), tests, lint and build scripts, CI.
2. **Design system**: where colours, radii, shadows, spacing and type are defined today
   (`src/app/globals.css`, any Tailwind theme, `components.json`, shadcn primitives, fonts), and which
   components consume them. Report exact token names and values, not paraphrases.
3. **Existing patterns**: how auth, data fetching, forms, tables and charts are done; the design prototype
   under `design/` and the `.dc.html` artboards under `design/marketplane/`.
4. **Conventions**: commit style, branch naming, PR template, README claims, anything in
   `docs/BACKEND-HANDOVER.md` that constrains the backend.

Output of phase 0 is a written `docs/marketplane/00-repo-map.md` and a decision: build inside this
repository's conventions or scaffold a new app directory. State the decision and why. Do not skip this phase
to save time; every later agent is briefed from that map.

## Non-negotiables

1. **One brand file.** `src/brand/brand.ts` (or the equivalent under the repo's conventions) is the single
   source for company and product identity: legal entity name, product name, tagline, domain and base API
   URL, support and legal email addresses, postal address, VAT or company number, social handles, logo and
   favicon paths, default locale and currency, data region, and the marketing claims that are allowed on the
   site. Every page, email, invoice, generated document, MCP server description and SDK README reads from it.
   No string that identifies the company appears anywhere else.
2. **One tokens stylesheet.** `src/styles/tokens.css` defines every colour, radius, shadow, spacing step,
   type scale and font family as CSS custom properties, with light and dark values. Tailwind's theme maps
   onto those variables; shadcn components are re-themed from them; the marketing site, the dashboard, emails
   and PDF exports all consume them. Start from the values in `design/marketplane/Main.dc.html` (near-white
   ground, white cards with 20 px radii and a soft shadow, electric indigo as the single call-to-action
   colour, teal for reads, coral for writes and competitor alerts, amber for restatements, Geist and Geist
   Mono). Nothing hard-codes a hex value outside this file.
3. **Stack: Vercel, Cloudflare, Supabase, nothing else without a written reason.**
   - Vercel hosts the Next.js app: marketing site, dashboard, and the authenticated UI's server actions. Use
     static generation and edge caching for the marketing site; keep dashboard bundles small.
   - Cloudflare hosts the public API edge (Workers), the scheduler (Workflows and Queues), object storage for
     raw platform payloads (R2) and a cache (KV). Write extractors in TypeScript on Workers rather than
     adopting a Python extraction library, so the whole system stays on these three providers; record the
     trade-off against section 7's dlt recommendation in the phase 1 design note.
   - Supabase holds Postgres, authentication, row-level security, storage and pg_cron for light schedules.
     Every tenant-scoped table has row-level security keyed on organisation and workspace.
   - Speed and cost are first-class: materialise reads, never pass a customer request straight through to GA4
     or Meta, cache the envelope at the edge, batch platform calls under quota, and put a cost estimate on
     every design note (section 7's cost table is the baseline).
4. **Platform terms are constraints, not guidance.** No shared platform tokens across tenants, no
   cross-customer aggregation or benchmarking on platform data, per-workspace data separation, and the Meta
   client-list obligation designed in from the start (section 3.5). Contact data, if it ever appears, is
   hashed at the edge and never stored raw (section 3.2).
5. **The envelope is the contract.** Every read returns the envelope in section 2 and section 7, with
   `fetched_at`, `source_updated_at`, `restates_until`, `is_provisional`, `attribution_window` as a required
   dimension on every conversion metric, `fx_source` and `fx_rate_date`, and a `raw` passthrough. The API
   refuses to emit an unlabelled conversion count.
6. **Correctness over coverage.** Tiered restatement backfill (daily for day 0 to day 3, weekly to the
   platform's window) and a restatement webhook ship before any fifth connector.

## Product surfaces to build, in order

1. **Foundation**: brand file, tokens stylesheet, Supabase schema for organisations, workspaces, members and
   roles, connections and API keys (section 15), authentication, invitation flow, row-level security tests.
2. **Connect**: OAuth flows for Google and Meta on the customer's own credentials, a vault for grants,
   connection health, quota consumption, and the platform-specific onboarding steps the research surfaced.
3. **Data plane**: extractors for Google Ads, GA4, Search Console and Meta; the canonical store; restatement
   scheduler; currency table from ECB reference rates; DataForSEO adapter for SERP and AI-answer collection
   with `n_runs` and confidence intervals.
4. **Public API and MCP server**: at most 25 endpoints so SDK generation stays on the free tier; MCP against
   the current protocol revision with `plan.explain` returning credit cost before execution; API keys with
   spend budgets.
5. **Dashboard**: Connect, Ask, Watch, Numbers, Usage and billing, Developers, Settings, as listed in
   section 15. The Ask surface is the chat card from the landing page hero. Numbers shows `is_provisional`
   and restatement markers on every figure.
6. **Diagnose, reconcile, watch**: the diagnostic tree in section 4.1, conversion reconciliation, verified
   alerts with a second-pass check before anything fires, Slack and email delivery.
7. **Marketing site**: from `design/marketplane/Main.dc.html`, reading copy limits and claims from the brand
   file, with the public no-signup demo endpoint from section 10.3.

## How to run each unit of work

Follow the routines in section 13. For every connector, screen or endpoint: one builder agent in an isolated
worktree, one schema or contract reviewer, one test skeptic with fixtures and a live sandbox where one exists,
a loop of at most three retries, then a PR. Before every push run the repository's own lint, typecheck, unit
tests and build. Each PR carries a short design note under `docs/marketplane/` with the cost estimate, the
platform-terms check, and what was left out. Never widen scope in a PR; open an issue instead.

## Definition of done for the first milestone

A design partner can sign up, create a workspace, connect Google Ads and GA4 on their own credentials, see
provisional and final numbers with restatement markers, ask "why did organic traffic drop last week" and
receive a ranked, evidenced answer, set one watch that fires a verified alert, and see exactly what it cost in
credits. All of it on Vercel, Cloudflare and Supabase, with every brand string coming from the brand file and
every colour from the tokens stylesheet.
