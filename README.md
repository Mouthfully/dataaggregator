# Marketplane

Verified root cause and an operated correctness guarantee over your own ad, analytics and search
data.

> The product name is **not settled** — specification section 12 only recommends it. Every
> occurrence routes through `packages/brand/src/brand.ts` and packages use a neutral `@repo/*`
> scope, so settling on a different name is a one-line change and no npm rename.

## Getting started

```bash
pnpm install          # also generates packages/tokens/dist via its prepare script
pnpm dev              # every app in parallel
```

Node 22+ and pnpm 10 (the version is pinned in `package.json`'s `packageManager`; `corepack enable`
picks it up).

## Commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` in every package. Each app has its own tsconfig — see below. |
| `pnpm test` | Every package's tests. `apps/api-edge` runs under real workerd, not jsdom. |
| `pnpm build` | `next build` for the web app, `wrangler deploy --dry-run` for the Worker. |
| `pnpm lint` / `pnpm lint:fix` | Biome. There is no ESLint or Prettier. |
| `pnpm format` / `pnpm format:check` | Biome. `format` writes, `format:check` only checks. |
| `pnpm check` | Biome lint + format + import sorting in one pass. |
| `pnpm check:brand` | The brand guard. Enforcing. |
| `pnpm check:tokens` | The tokens guard. Enforcing. |
| `pnpm --filter @repo/tokens build` | Regenerate the token map after editing `tokens.css`. |

## Layout

A pnpm-workspaces monorepo. `docs/marketplane/00-repo-map.md` section 1 has the decision and its
reasons.

```
apps/web         Next.js on Vercel — marketing site and dashboard
apps/api-edge    Cloudflare Worker — public API edge (health check only so far)
packages/brand   THE brand file: company identity and the allowed-claims list
packages/tokens  THE tokens stylesheet, plus a generated map for emails and PDFs
docs/marketplane Design notes, one per unit of work
design/marketplane The source artboard the tokens are derived from
```

Internal packages export **raw TypeScript** and are consumed as `workspace:*`. There is no
versioning, no publishing and no per-package build step — with one deliberate exception:
`@repo/tokens` generates its `{ light, dark }` map from `tokens.css`, because Workers render emails
and PDFs that have no stylesheet and no cascade. Its `prepare` script keeps that output current on
every install.

## Two rules the repository enforces on itself

Both are non-negotiables from `docs/MARKETPLANE-KICKOFF-PROMPT.md`, made into properties of the
repository rather than promises in a document.

**One brand file.** No string identifying the company appears outside
`packages/brand/src/brand.ts`. `scripts/check-brand.mjs` enforces it. Because a literal ban is
unsatisfiable — wrangler needs a Worker name, `package.json` needs a name — infrastructure files are
*match-tested* against the brand file instead of banned, and prose (`README.md`, `docs/`, `design/`)
is exempt. Code that renders or deploys is not.

**One tokens stylesheet.** No hex, `rgb()`, `hsl()` or `oklch()` outside
`packages/tokens/src/tokens.css`. `scripts/check-tokens.mjs` enforces it, exempting the source
artboard under `design/`, which is 110 KB of hard-coded colour and must never be edited.

Both guards take `--warn` to report without failing, and both honour an escape hatch —
`brand-guard-ignore:` / `tokens-guard-ignore:` on the offending line or the one above it — for the
cases where a literal is the point. Use it with a reason; do not widen an exempt list.

## Things that will bite you

- **`vitest` is pinned to exactly 4.1.11.** `@cloudflare/vitest-pool-workers@0.22.0` peers
  `vitest ^4.1.0` while the latest is 5.0.0. `strict-peer-dependencies=true` makes a bad bump fail
  `pnpm install` rather than surface later as "no tests found".
- **`compatibility_date` in `apps/api-edge/wrangler.jsonc` is capped by the test runner, not by
  wrangler.** There are two workerd binaries in the tree; raising the date past the older one
  deploys fine and fails every test.
- **Each app has its own tsconfig on purpose.** Merging them compiles, thanks to `skipLibCheck`,
  and then typechecks your Worker against DOM shapes. See the comment in `tsconfig.base.json`.

## Reference documents

| Document | What it is |
|---|---|
| [`docs/MARKETING-DATA-PLANE.md`](docs/MARKETING-DATA-PLANE.md) | The binding specification. Section 11 records the decisions that override earlier sections. |
| [`docs/MARKETPLANE-KICKOFF-PROMPT.md`](docs/MARKETPLANE-KICKOFF-PROMPT.md) | The build brief and its non-negotiables. |
| [`docs/SME-POSITIONING-AND-FINDINGS.md`](docs/SME-POSITIONING-AND-FINDINGS.md) | The small-business repositioning: competitive landscape, the unverified SME connector inventory, and how attribution works for a business people walk into. Findings, not decisions — section 11A of the specification holds those. |
| [`docs/marketplane/00-repo-map.md`](docs/marketplane/00-repo-map.md) | Phase 0: the layout decision, the contract, and what is built on open questions. |
| [`docs/marketplane/01-brand-identity.md`](docs/marketplane/01-brand-identity.md) | Identity values and the two constraints they create. |

Build status: data plane foundations. Scaffold, brand file, tokens, Supabase schema and RLS, the envelope contract, vault, OAuth, connections, the GA4 connector, the envelope store, `GET /v1/performance`, the R2 payload store and the marketing site have landed. Next: the restatement webhook, which the kickoff gates the fifth connector behind.
