# 02. Workspace scaffold, brand file and tokens stylesheet

## 1. What this is, and the decision taken

The foundation the rest of the build stands on: the pnpm-workspaces monorepo decided in
`00-repo-map.md` section 1, a Next.js app on Vercel, a Cloudflare Worker, the two single-source
non-negotiables (`packages/brand`, `packages/tokens`), and two guards that make those
non-negotiables properties of the repository rather than promises in a document.

Three decisions inside it are worth stating plainly.

**The brand register is the artboard, confirmed by the founder.** `00-repo-map.md` section 3 found
the artboard and specification section 14 describing two different brands with disjoint palettes —
zero of section 14's six hexes appear in `Main.dc.html` and zero of the artboard's thirteen appear
in the specification. The founder settled it: Young Serif display, Figtree body, Geist Mono, cool
`#F4F6FA` ground, one `#2563EB` accent. Section 14 contributes only the three semantic status hues
the artboard leaves undefined (`#0FB5A0` read, `#FF5A5F` write, `#FFB020` restate), restricted to
status marks and never to a button, with no competitor colour because section 11.5 drops that
module. Font families use semantic names (`--mp-font-display`, `--mp-font-body`, `--mp-font-mono`)
so a reversal is three variables and the font link, not a rebuild.

**The brand file ships now rather than waiting.** `00-repo-map.md` listed it as blocked on founder
decisions. Those arrived (`01-brand-identity.md`), so it ships — with genuinely unknown fields as
`null`, never as plausible-looking placeholders. Nulls are load-bearing: `claims.ts` withholds any
marketing claim whose supporting field is unset. That is what stops the site promising EU data
protection the company has not yet arranged.

**Both guards enforce from day one, not in warn mode.** A guard introduced in warn mode is a guard
nobody turns on.

## 2. Cost estimate

**Per connected account per month: zero.** This unit adds no scheduled work, no platform calls, no
storage and no egress. It is the correct unit — specification section 11.3 abolished per-call
metering for the largest revenue line — but nothing here consumes it yet.

Fixed monthly, once the projects exist:

| Line | Cost | Note |
|---|---|---|
| Vercel Pro | ~$20/seat/mo | `00-repo-map.md` section 5 records that section 7's cost table has no Vercel line at all. |
| Cloudflare Workers Paid | $5/mo | Required for Workflows, Queues and the 5-minute CPU limit the data plane needs. Not yet used. |
| Supabase Pro | $25/mo | Not yet provisioned. |
| CI | $0 | GitHub-hosted runners on a public-tier repository. |

Revised fixed monthly for the mandated stack is **$150–$200**, not section 7's $110–$150.

Two lines to watch from the first migration, neither of which the specification costs:
Supabase disk at $0.125/GB if `raw` ever lands in Postgres as JSONB rather than as an R2 key
(R2 Standard at $0.015/GB-month is 8.3× cheaper), and KV writes at $5.00/million if the envelope
cache is keyed per row.

## 3. Platform-terms check

The 18 gates, against a diff that touches no platform and no customer data.

**Credential.** N/A × 4 — no code path touches Google, Meta, GA4, Search Console or an affiliate
network; no credential of any kind is read, stored or transmitted; there is no MCP server yet, so
no token pass-through; no `.env` file and no secret is committed.

**Tenancy.** N/A × 3 — no database, no tenant-scoped table, no RLS policy, no cross-workspace
read path.

**Data movement.** PASS × 3 — nothing leaves the repository. No platform data is fetched, stored,
aggregated or redistributed. No cross-customer aggregation is possible because there is no data.

**PII and consent.** N/A × 3 — no contact data, no hashing path, no consent object, no write
destination.

**Access tier and quota.** N/A × 2 — no platform quota is consumed; no developer token exists.

**Claims.** PASS × 3, and this is the gate this unit actually exercises. `packages/brand/claims.ts`
carries 27 claims, each citing the specification section that supports it. Three are **withheld** by
the gate right now — `gdpr`, `dpa` and `data-region` — because `euRepresentative`, `dpaAvailable`
and `dataRegion` are unset. `FORBIDDEN_CLAIMS` bans the six things phase 0 found the artboard
selling that section 11 had already killed, and `brand.test.ts` asserts each ban against the
artboard's actual copy. One of those tests failed on first run and caught a real gap in the pattern:
the artboard's Competitors card sells the whole dropped market module without once using the word
"competitor".

## 4. What was left out

- **Supabase.** No `supabase/` directory, no migrations, no RLS. Blocked on gaps 1–3 in
  `00-repo-map.md` section 10 (auth-to-tenancy mapping, API-key authentication without a
  service-role bypass, where OAuth grants are vaulted). Those are decided in the next design note.
- **The marketing site.** `apps/web` is a placeholder page. Rebuilding the artboard is milestone 7,
  and roughly 40% of its copy needs rewriting against section 11 first.
- **`packages/contract`.** The envelope types are specified in `00-repo-map.md` sections 4 and 8 but
  not written. They land with the first connector, flagged per section 9.
- **`apps/scheduler` and `apps/mcp`.** Later milestones. `apps/api-edge` is a health check that
  exists to prove the Workers target, not the API.
- **`legalEmail`, `socialHandles`, logo assets.** Unset or placeholder paths; nothing renders them.

## 5. Open or unverified spec items this builds on

- **The product name is unsettled** (specification section 12 recommends it only "if forced to
  one"). Mitigated structurally: `@repo/*` package scope, every occurrence through `brand.ts`, and
  the brand guard fails any package named after the product.
- **The domain is unresolved** and is the expensive one. Support is on one domain, the artboard
  hard-codes another. `brand.domain` and `brand.apiBaseUrl` are `null` and nothing hard-codes
  either, because OAuth redirect URIs are registered with Google and Meta and section 3.5 records
  Google's sensitive-scope verification as unbounded — documented at 3–5 days, observed at over ten
  weeks. Changing the domain after that clock starts restarts it.
- **The entity is Thai and the artboard sells EU data protection.** See `01-brand-identity.md` for
  the three things "EU hosting" conflates. Residency is configuration; an Article 27 representative
  and a transfer mechanism are not, and residency alone does not solve them. Enforced by the claims
  gate rather than by remembering.
- **Two invented token values** with no artboard source: dark card surface `#1E293B` and dark
  hairline `#334155`, both the in-family Tailwind continuation of the ramp the artboard already
  uses. Marked `INVENTED` in `tokens.css`.
- **Stainless has wound down**, verified directly against its 2026-05-18 announcement. Section 7's
  SDK, docs and MCP generation plan is void. No CI is built around it; `openapi/` and `apps/mcp`
  will be owned in-repo. No effect on this unit.

## 6. Verification

Every check run against the real tree, not asserted:

| Check | Result |
|---|---|
| `pnpm install` | Clean. 5 workspace projects. |
| `pnpm typecheck` | Clean in every package, under both the DOM lib and `@cloudflare/workers-types`. |
| `pnpm test` | 20 tests, 3 files. `apps/api-edge` runs under real workerd, not jsdom. |
| `pnpm build` | `next build` and `wrangler deploy --dry-run` both clean. |
| `pnpm lint` / `format:check` | Clean, 34 files. |
| `pnpm check:brand` / `check:tokens` | Both **enforcing**, both clean. |

**The two assertions `00-repo-map.md` section 12 said this PR had to prove:**

1. **A source-only shared package typechecks under both runtimes.** HOLDS, and it was proven by
   forcing the boundary rather than by reading code: `@repo/tokens` is imported from
   `apps/api-edge/src`, and `tsc --traceResolution` confirms `packages/tokens/src/index.ts` is
   compiled inside the workerd program (lib ES2022 + workers-types, no DOM) *and* inside the Next
   program (with `lib.dom.d.ts`) simultaneously. The raw TypeScript also executes in workerd under
   the Worker test.
2. **Vercel's skip-unaffected detection fires on a CSS-only change in `packages/tokens`.**
   **NOT PROVEN, and cannot be from inside the repository** — it is a property of Vercel's build
   pipeline, observable only once a project exists and two commits have been pushed. What is
   verified is that the configuration is correct in shape, and `apps/web/vercel.json` carries an
   `ignoreCommand` with an explicit `git diff` fallback so a token-only change still builds if the
   graph path is unavailable. `apps/web/README.md` records exactly what to check on the first two
   deploys. Half of one assertion is therefore outstanding; the layout decision does not reopen on
   it, because failing it costs build minutes rather than correctness.

**Guards proven to bite**, not merely to pass: renaming `@repo/web` to `@marketplane/marketing-site`
is caught even with no brand file present, and a rogue `#ff0000` in `apps/web/app/page.tsx` is
caught. Both were introduced, confirmed, and reverted.

**The vitest trap is proven closed at install time.** Setting the catalog to vitest 5.0.0 now fails
`pnpm install` with `ERR_PNPM_PEER_DEP_ISSUES` rather than installing cleanly and surfacing later as
"no tests found".
