# Phase 0 reconnaissance: raw explorer reports
> Evidence appendix for `00-repo-map.md`. Produced by parallel read-only explorer agents over
> `docs/MARKETING-DATA-PLANE.md`, `design/marketplane/Main.dc.html` and the repository itself.
> Findings are recorded verbatim as returned, including confidence levels, so a later reader can
> audit any claim in the repo map back to its evidence. Nothing here is a decision; decisions are
> in `00-repo-map.md`.

---

## 1. Repository state and toolchain reality

The "empty repo, 16-byte README, one commit" premise is stale — it changed three times while I was running recon. Current HEAD is a057890 ("Merge pull request #1"), the working tree holds 5 tracked files (README.md 904 bytes, docs/MARKETING-DATA-PLANE.md 302667 bytes / 1680 lines, docs/MARKETPLANE-KICKOFF-PROMPT.md 8780 bytes / 113 lines, design/marketplane/Main.dc.html 41451 bytes, design/marketplane/support.js 69150 bytes) plus one empty untracked directory docs/marketplane/. There is still no package.json, no tsconfig, no .gitignore, no .github, no .claude, no CLAUDE.md, no CI, no lint/format config anywhere in the repo. The toolchain is complete and modern: node v22.22.2, npm 10.9.7, pnpm 10.33.0, yarn 1.22.22, bun 1.3.11, corepack 0.34.6, git 2.43.0, plus globally installed tsc 6.0.2, eslint 10.1.0, prettier 3.8.1, playwright 1.56.1 (no browser binaries downloaded). The npm registry is fully reachable — npm ping PONG in 427ms, registry.npmjs.org is in NO_PROXY so it bypasses the agent proxy entirely, and a real 41.7 MB next tarball fetched with HTTP 200. GitHub release assets also fetch 200, so binary-downloading postinstalls will work. 30 GB free disk, 15 GiB RAM, 4 CPUs, 1% inode use — nothing here blocks a scaffold. The only hard absences are the gh CLI (not installed; use the mcp__github tools) and a running Docker daemon (binary present, /var/run/docker.sock missing), which rules out `supabase start` local-stack development.

### Findings (36)

**The repository is no longer empty and mutated three times during this recon. At 12:40 UTC it was 1 tracked file (README 16 bytes) + untracked docs/ and design/; at 12:44:31 commit 01f6386 landed adding 4085 lines across 5 files; by 12:46:33 merge commit a057890 (PR #1) was HEAD on both the branch and origin/main.**  
`certain` · source: `/home/user/dataaggregator (git log, run 12:46:46 UTC)`  
> git log --oneline --graph --decorate --all: "*   a057890 (HEAD -> claude/marketplane-build-kickoff-cgbfxz, origin/main, origin/claude/marketplane-build-kickoff-cgbfxz) Merge pull request #1 from Mouthfully/claude/marketplane-build-kickoff-cgbfxz" / "| * 01f6386 docs: add binding specification, kickoff brief and design artboard" / "|/" / "* 3651cde (main) Initial commit"

**Local branch ref `main` is STALE at 3651cde while origin/main has advanced to a057890. Any agent that branches off local `main` will branch off the pre-docs commit and lose the spec.**  
`certain` · source: `/home/user/dataaggregator .git`  
> git log --decorate: "* 3651cde (main) Initial commit"; git ls-remote origin: "a057890e5e3e76c1d663aa987ff9bb80ab7f9ee0\trefs/heads/main"

**Current checked-out branch is claude/marketplane-build-kickoff-cgbfxz, in sync with its remote, working tree clean.**  
`certain` · source: `/home/user/dataaggregator`  
> git status --porcelain=v1 -b → "## claude/marketplane-build-kickoff-cgbfxz...origin/claude/marketplane-build-kickoff-cgbfxz" with no following lines

**Exact tracked file set is 5 files. There is nothing else in the repo except the empty directory docs/marketplane/.**  
`certain` · source: `/home/user/dataaggregator`  
> git ls-files -s → "100644 436b5664690eba5f625e74439201425f7aa1fde9 0\tREADME.md", "100644 4dd6b7c9f96e0a31b06e0a5572ce3d1d9d90cc61 0\tdesign/marketplane/Main.dc.html", "100644 cb009b69ec6b5e00f48c6287a587fe7e0c6c421b 0\tdesign/marketplane/support.js", "100644 ee03fc3d0f79d9a67753213fe3454c532b3cf02f 0\tdocs/MARKETING-DATA-PLANE.md", "100644 5bb669e2c24e11db0080d76f1d31d38045a0bf82 0\tdocs/MARKETPLANE-KICKOFF-PROMPT.md"

**README.md is NOT 16 bytes any more. It is 904 bytes and now contains the product name, tagline and a reference-documents table. The 16-byte original ("# dataaggregator", no trailing newline) survives only at commit 3651cde.**  
`certain` · source: `/home/user/dataaggregator/README.md`  
> Current: "# Marketplane\n\nVerified root cause and an operated correctness guarantee over your own ad, analytics and search data." … "Build status: phase 0, reconnaissance." (904 bytes). Original: `git show 3651cde:README.md | cat -A` → "# dataaggregator" with no $ terminator, wc -c = 16, wc -l = 0, md5 15f8d73a23f571bd66d6fdb05c5bec73

**docs/marketplane/ exists on disk but is empty, so git does not track it. It is the directory the kickoff prompt requires every design note to land in.**  
`certain` · source: `/home/user/dataaggregator/docs/marketplane, docs/MARKETPLANE-KICKOFF-PROMPT.md:37`  
> ls -la docs/marketplane → "total 8" with only . and .. ; kickoff prompt line 37: "Output of phase 0 is a written `docs/marketplane/00-repo-map.md`"

**There is NO .gitignore anywhere in the repository, and git confirms nothing is ignored.**  
`certain` · source: `/home/user/dataaggregator`  
> find . -name '.gitignore' → no output; `git check-ignore -v node_modules .next .env` → no output, exit 1

**There is no .github directory, no PR template, no issue template, no CI config of any kind (no .yml/.yaml anywhere), no .circleci, no .husky.**  
`certain` · source: `/home/user/dataaggregator`  
> find over the whole tree for CLAUDE.md, *.yml, *.yaml, .eslintrc*, eslint.config.*, .prettierrc*, prettier.config.*, .editorconfig, tsconfig*.json, package*.json, .gitignore, .nvmrc, wrangler.*, biome.json returned ZERO matches; ls of .github/.claude/.circleci/.husky → "No such file or directory" for all four

**There is no CLAUDE.md at repo level, at /home/user, or at /root. /root/.claude exists but holds only harness machinery (hooks, skills, plugins, sessions) — no project instructions.**  
`certain` · source: `/root/.claude, /home/user`  
> ls -la /root/CLAUDE.md /home/user/CLAUDE.md → "No such file or directory"; /root/.claude contains backups, environment-manager, launcher-settings.json, plugins, projects, session-env, session-start-git-identity.sh, sessions, shell-snapshots, skills, stop-hook-git-check.sh, stop-hook-reply-gate.py, uploads, user-prompt-submit-reply-reminder.py

**Git identity is set globally in /root/.gitconfig as Claude <noreply@anthropic.com>, not per-repo. The original repo owner is a different identity.**  
`certain` · source: `/root/.gitconfig, git log`  
> git config user.name → "Claude"; git config user.email → "noreply@anthropic.com"; both from "file:/root/.gitconfig". Commit 3651cde author: "Mouthfully <mouthfullyth@gmail.com>", committer "GitHub <noreply@github.com>"

**Commit signing is mandatory and configured: commit.gpgsign=true with gpg.format=ssh via the helper /tmp/code-sign, which is a symlink to /opt/env-runner/environment-manager. The referenced public key file is zero bytes.**  
`certain` · source: `/root/.gitconfig`  
> git config --list --show-origin: "file:/root/.gitconfig\tuser.signingkey=/home/claude/.ssh/commit_signing_key.pub", "gpg.format=ssh", "gpg.ssh.program=/tmp/code-sign", "commit.gpgsign=true"; ls -la → "lrwxrwxrwx /tmp/code-sign -> /opt/env-runner/environment-manager" and "-rw-r--r-- 1 claude claude 0 /home/claude/.ssh/commit_signing_key.pub"

**Remote is https://github.com/Mouthfully/dataaggregator for both fetch and push; git SSH URLs are rewritten to HTTPS and credentials are proxy-injected. Push demonstrably works — the parallel agent pushed 01f6386 and the PR merge during this recon.**  
`certain` · source: `/home/user/dataaggregator/.git/config`  
> git remote -v → "origin\thttps://github.com/Mouthfully/dataaggregator (fetch)/(push)"; command-line config "url.https://github.com/.insteadof=git@github.com:" and "credential.interactive=false"; git ls-remote origin shows refs/pull/1/head

**The `gh` CLI is NOT installed. GH_TOKEN/GITHUB_TOKEN are proxy-injected env vars, and the mcp__github tool family is available, so PR creation must go through those tools rather than `gh`.**  
`certain` · source: `shell PATH, env`  
> `gh pr list` → "timeout: failed to run command 'gh': No such file or directory"; env has GH_TOKEN=proxy-injected and GITHUB_TOKEN=proxy-injected

**Node 22.22.2 satisfies Next 16's engine requirement with room to spare.**  
`certain` · source: `/opt/node22/bin/node; npm registry`  
> node --version → v22.22.2; npm view next@16.3.4 engines → {"node": ">=20.9.0"}

**All four package managers plus corepack are present. pnpm 10.33.0 is installed globally and its store is already initialised.**  
`certain` · source: `shell`  
> npm 10.9.7 (/opt/node22/bin/npm), pnpm 10.33.0, yarn 1.22.22, bun 1.3.11 (/root/.bun/bin/bun), corepack 0.34.6; `pnpm store path` → /root/.local/share/pnpm/store/v10

**npm registry is fully reachable and NOT routed through the agent proxy — registry.npmjs.org is explicitly in NO_PROXY, so installs go direct.**  
`certain` · source: `shell env, npm ping`  
> `npm ping` → "npm notice PING https://registry.npmjs.org/" / "npm notice PONG 427ms"; NO_PROXY contains "registry.npmjs.org"; npm config get registry → https://registry.npmjs.org/

**Real tarball downloads work, not just metadata. Fetching the full next 16.3.4 tarball returned HTTP 200 and 41,736,673 bytes.**  
`certain` · source: `shell curl`  
> curl -w on https://registry.npmjs.org/next/-/next-16.3.4.tgz → "next tgz status=200 size=41736673"

**GitHub release-asset downloads work, so postinstall scripts that pull binaries from GitHub will succeed. An earlier 403 was only on the /releases/latest HTML redirect page, not on an asset.**  
`certain` · source: `shell curl`  
> curl -L https://github.com/supabase/cli/releases/download/v2.116.0/supabase_linux_amd64.tar.gz → "supabase asset status=200"; api.github.com/rate_limit → 200; https://github.com/supabase/cli/releases/latest → 403

**Provider control-plane hosts are reachable: vercel.com 200, supabase.com 200, api.cloudflare.com/client/v4 404 (host reachable, endpoint needs auth).**  
`certain` · source: `shell curl`  
> curl -w outputs: "vercel.com status=200", "supabase.com status=200", "api.cloudflare.com status=404"

**Disk, memory and CPU are ample for a Next.js + Cloudflare + Supabase install. 30 GB free (a full node_modules for this stack is ~1-2 GB), inode use 1%, 14 GiB RAM available, 4 CPUs. The npm cache already holds 238 MB.**  
`certain` · source: `shell`  
> df -h /home/user/dataaggregator → "/dev/vda 252G 7.2G 30G 20% /"; df -i → "16777216 155312 16621904 1%"; free -h → "Mem: 15Gi total, 14Gi available"; nproc → 4; du -sh /root/.npm → 238M

**There is no ~/.npmrc and no registry auth token. Only proxy settings come from the environment. A private-registry or scoped-token assumption would be wrong.**  
`certain` · source: `/root`  
> ls -la /root/.npmrc → "No such file or directory"; npm config list shows only "; \"env\" config from environment" with https-proxy and noproxy

**Docker is installed but there is no daemon. `supabase start` (the local Postgres/Studio stack) cannot run in this sandbox; Supabase work must target a hosted project or use the mcp__Supabase tools.**  
`certain` · source: `shell`  
> which docker → /usr/bin/docker; `docker info` → "failed to connect to the docker API at unix:///var/run/docker.sock … dial unix /var/run/docker.sock: connect: no such file or directory"

**Playwright is installed globally (1.56.1) and chromedriver 147.0.0 is present, but no browser binaries have been downloaded. Any e2e suite would trigger a several-hundred-MB browser download on first run.**  
`certain` · source: `shell`  
> npm ls -g → "playwright@1.56.1", "chromedriver@147.0.0"; ls /root/.cache/ms-playwright → "No such file or directory"

**The globally installed TypeScript is 6.0.2 while npm `latest` for typescript is 7.0.2. A scaffold that installs typescript@latest locally will run a different major than the global `tsc` on PATH.**  
`certain` · source: `npm registry, /opt/node22/lib/node_modules`  
> npm ls -g --depth=0 → "typescript@6.0.2"; npm view typescript version → 7.0.2; dist-tags: {"latest":"7.0.2","beta":"6.0.0-beta","rc":"7.0.1-rc","next":"7.1.0-dev.20260907.1"}

**eslint-config-next@16.3.4 accepts eslint >=9.0.0 and typescript >=3.3.1, so eslint 10.10.0 is in range. The globally installed eslint is 10.1.0, one minor behind latest.**  
`certain` · source: `npm registry`  
> npm view eslint-config-next@16.3.4 peerDependencies → {"eslint": ">=9.0.0", "typescript": ">=3.3.1"}; npm ls -g → "eslint@10.1.0"; npm view eslint version → 10.10.0

**@opennextjs/cloudflare@1.20.6 peers next ">=15.5.24 <16 || >=16.3.3" and wrangler ^4.125.0, so next 16.3.4 + wrangler 4.129.0 are a compatible pair IF the Next app is ever moved to Cloudflare. Per the spec and kickoff it should not be — Next lives on Vercel.**  
`certain` · source: `npm registry`  
> npm view @opennextjs/cloudflare@1.20.6 peerDependencies → {"next": ">=15.5.24 <16 || >=16.3.3", "wrangler": "^4.125.0", "rclone.js": "^0.6.6"}

**miniflare's `latest` dist-tag currently points at a prerelease (5.20260903.0-alpha). A Workers test setup should use @cloudflare/vitest-pool-workers 0.22.0 rather than installing miniflare@latest directly.**  
`certain` · source: `npm registry`  
> npm view miniflare version → "5.20260903.0-alpha"; npm view @cloudflare/vitest-pool-workers version → "0.22.0"

**`wrangler-action` is not an npm package — it is a GitHub Action. Any CI plan naming it must reference cloudflare/wrangler-action@vN in a workflow, not a dependency.**  
`certain` · source: `npm registry`  
> npm view wrangler-action version → "npm error A complete log of this run can be found in: /root/.npm/_logs/2026-09-07T12_45_54_481Z-debug-0.log" (404, no version resolved)

**Next 16.3.4 pulls platform-specific SWC binaries plus sharp as optionalDependencies. On this box (x64 linux, glibc 2.39) @next/swc-linux-x64-gnu is the one that resolves; all come from the npm registry, which is reachable, so no extra egress is needed.**  
`certain` · source: `npm registry, shell`  
> npm view next@16.3.4 optionalDependencies → includes "@next/swc-linux-x64-gnu":"16.3.4" and "sharp":"^0.35.4"; node -p arch/platform → "x64 linux"; ldd --version → "ldd (Ubuntu GLIBC 2.39-0ubuntu8.7) 2.39"

**The spec's own stack table (section 7) names dlt on Trigger.dev for extraction, which the kickoff prompt explicitly overrides with TypeScript extractors on Cloudflare Workers. Section 11 does not adjudicate this, so the kickoff rule governs and the trade-off must be written into the phase 1 design note.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:723 area (§7 Recommended stack table); docs/MARKETPLANE-KICKOFF-PROMPT.md:56-62`  
> Spec §7 table: "| Extraction | dlt core plus dlt-hub verified-sources | … | Extraction compute | Trigger.dev | Cloudflare Workers has no native long-running Python, which the checker flags as directly conflicting with dlt |". Kickoff non-negotiable 3: "Write extractors in TypeScript on Workers rather than adopting a Python extraction library, so the whole system stays on these three providers; record the trade-off against section 7's dlt recommendation in the phase 1 design note."

**Both the spec and the kickoff put the Next.js app on VERCEL, not Cloudflare. Cloudflare is scoped to Workers (public API edge), Workflows and Queues (scheduler), R2 (raw payloads) and KV (cache).**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1512; docs/MARKETPLANE-KICKOFF-PROMPT.md:56-60`  
> Spec §15: "Next.js on Vercel for the marketing site and dashboard, Supabase for Postgres, authentication, row-level security and storage, Cloudflare Workers, Workflows and Queues for the public API edge and scheduled pulls." Kickoff: "Vercel hosts the Next.js app: marketing site, dashboard, and the authenticated UI's server actions." / "Cloudflare hosts the public API edge (Workers), the scheduler (Workflows and Queues), object storage for raw platform payloads (R2) and a cache (KV)."

**The kickoff prompt fixes the two file paths the whole build hangs off: src/brand/brand.ts and src/styles/tokens.css. Neither exists yet, and no src/ directory exists.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:43-55; /home/user/dataaggregator`  
> Kickoff non-negotiable 1: "`src/brand/brand.ts` (or the equivalent under the repo's conventions) is the single source for company and product identity"; non-negotiable 2: "`src/styles/tokens.css` defines every colour, radius, shadow, spacing step, type scale and font family as CSS custom properties". find over the tree shows no src/ directory.

**The kickoff's phase 0 checklist asks explorer agents to report on package.json, the app router layout, a supabase/ directory, tests, lint and build scripts, CI, src/app/globals.css, any Tailwind theme, components.json, shadcn primitives, and docs/BACKEND-HANDOVER.md. NONE of these exist. Every one of those phase-0 questions resolves to "absent".**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:27-35; /home/user/dataaggregator`  
> Kickoff lines 27-35 enumerate them; exhaustive find over the tree returns only the 5 tracked files plus docs/marketplane/. `ls docs/BACKEND-HANDOVER.md` is covered by the same find — no match.

**The `geist` npm package (the font pair the kickoff names) is published and resolvable at 1.7.2.**  
`certain` · source: `npm registry; docs/MARKETPLANE-KICKOFF-PROMPT.md:54-55`  
> npm view geist version → 1.7.2; kickoff non-negotiable 2 names "Geist and Geist Mono"

**Next.js has a 15.x maintenance line still receiving releases (15.5.25 under the `backport` tag) alongside 16.3.4 as `latest`, so pinning to 15 is a real option if 16 causes friction.**  
`certain` · source: `npm registry`  
> npm view next dist-tags → {"latest":"16.3.4", "backport":"15.5.25", "next-15-3":"15.3.9", "canary":"16.4.0-canary.19", …}; npm view next@15 version → 15.5.23, 15.5.24, 15.5.25

**ulimit open files is 20000 and there is no swap. Neither constrains an npm/pnpm install at this scale, but a large parallel build has no swap headroom to fall back on.**  
`certain` · source: `shell`  
> ulimit -a → "open files (-n) 20000", "core file size (blocks, -c) 0"; free -h → "Swap: 0B 0B 0B"

### Exact values (76)

- next: 16.3.4 (npm view, latest)
- react: 19.2.8 (npm view, latest)
- react-dom: 19.2.8 (npm view, latest)
- typescript: 7.0.2 (npm view, latest)
- tailwindcss: 4.3.3 (npm view, latest)
- wrangler: 4.129.0 (npm view, latest)
- @supabase/supabase-js: 2.115.0 (npm view, latest)
- @supabase/ssr: 0.12.6 (npm view, latest)
- zod: 4.5.4 (npm view, latest)
- vitest: 5.0.0 (npm view, latest)
- eslint: 10.10.0 (npm view, latest)
- create-next-app: 16.3.4 (npm view, latest)
- @opennextjs/cloudflare: 1.20.6 (npm view, latest)
- @cloudflare/workers-types: 5.20260907.1 (npm view, latest)
- supabase (CLI): 2.116.0 (npm view, latest)
- @tailwindcss/postcss: 4.3.3 (npm view, latest)
- geist: 1.7.2 (npm view, latest)
- eslint-config-next: 16.3.4 (npm view, latest)
- typescript-eslint: 8.69.0 (npm view, latest)
- prettier: 3.9.6 (npm view, latest)
- @vitejs/plugin-react: 6.1.1 (npm view, latest)
- @testing-library/react: 16.3.3 (npm view, latest)
- shadcn: 4.21.0 (npm view, latest)
- @types/node: 26.4.1 (npm view, latest)
- @types/react: 19.2.18 (npm view, latest)
- @types/react-dom: 19.2.7 (npm view, latest)
- postcss: 8.5.28 (npm view, latest)
- autoprefixer: 10.5.5 (npm view, latest)
- @cloudflare/vitest-pool-workers: 0.22.0 (npm view, latest)
- miniflare: 5.20260903.0-alpha (npm view, latest — PRERELEASE on the latest tag)
- wrangler-action: NOT ON NPM (404; it is the GitHub Action cloudflare/wrangler-action)
- next dist-tags: latest=16.3.4, canary=16.4.0-canary.19, beta=16.0.0-beta.0, preview=16.3.0-preview.10, backport=15.5.25, next-15-3=15.3.9, next-15-2=15.2.9, next-15-0=15.1.12, next-14=14.2.35, next-13=13.5.11
- react dist-tags: latest=19.2.8, canary=19.3.0-canary-8425b691-20260904, next=19.3.0-canary-d5736f09-20260507, backport=19.0.8
- typescript dist-tags: latest=7.0.2, rc=7.0.1-rc, beta=6.0.0-beta, next=7.1.0-dev.20260907.1
- eslint dist-tags: latest=10.10.0, maintenance=9.39.5, next=10.0.0-rc.2
- vitest dist-tags: latest=5.0.0, V4=4.1.11, V3=3.2.7, beta=5.0.0-beta.7, rc=5.0.0-rc.4
- next@16.3.4 engines: node >=20.9.0
- next@16.3.4 peerDependencies: react ^18.2.0 || ^19.0.0; react-dom ^18.2.0 || ^19.0.0; sass ^1.3.0; @playwright/test ^1.51.1; @opentelemetry/api ^1.1.0; babel-plugin-react-compiler *
- eslint-config-next@16.3.4 peerDependencies: eslint >=9.0.0, typescript >=3.3.1
- @opennextjs/cloudflare@1.20.6 peerDependencies: next >=15.5.24 <16 || >=16.3.3, wrangler ^4.125.0, rclone.js ^0.6.6
- node: v22.22.2 (/opt/node22/bin/node)
- npm: 10.9.7 (/opt/node22/bin/npm)
- pnpm: 10.33.0 (/opt/node22/bin/pnpm)
- yarn: 1.22.22 (/opt/node22/bin/yarn)
- bun: 1.3.11 (/root/.bun/bin/bun)
- corepack: 0.34.6 (/opt/node22/bin/corepack)
- git: 2.43.0
- python3: 3.11.15
- globally installed: typescript@6.0.2, eslint@10.1.0, prettier@3.8.1, ts-node@10.9.2, playwright@1.56.1, chromedriver@147.0.0, nodemon@3.1.14, http-server@14.1.1, serve@14.2.6, @anthropic-ai/claude-code@2.1.42
- npm registry: https://registry.npmjs.org/ — npm ping PONG 427ms
- next-16.3.4.tgz fetch: HTTP 200, 41,736,673 bytes
- disk: /dev/vda 252G total, 7.2G used, 30G available, 20% used, mounted on /
- inodes: 16,777,216 total, 155,312 used, 16,621,904 free, 1% used
- memory: 15Gi total, 14Gi available, 0B swap
- cpus: 4 (nproc)
- ulimit -n: 20000; ulimit -c: 0
- npm cache: /root/.npm, 238M
- pnpm store: /root/.local/share/pnpm/store/v10
- platform: x64 linux, glibc 2.39 (Ubuntu GLIBC 2.39-0ubuntu8.7), kernel 6.18.44-fc-v24
- HEAD: a057890e5e3e76c1d663aa987ff9bb80ab7f9ee0 (Merge pull request #1)
- branch: claude/marketplane-build-kickoff-cgbfxz (in sync with origin)
- local main ref: 3651cde777d7e6bf69e96bed892eb66041d536b6 (STALE; origin/main = a057890)
- docs commit: 01f638662f9b14dafe27c6db49af8259615366e9, Claude <noreply@anthropic.com>, 2026-09-07 12:44:31 +0000, 5 files changed, 4085 insertions(+), 1 deletion(-)
- initial commit: 3651cde777d7e6bf69e96bed892eb66041d536b6, Mouthfully <mouthfullyth@gmail.com>, 2026-09-07 19:16:58 +0700, 'Initial commit'
- remote: https://github.com/Mouthfully/dataaggregator (fetch and push)
- git user.name: Claude (from /root/.gitconfig)
- git user.email: noreply@anthropic.com (from /root/.gitconfig)
- commit.gpgsign: true; gpg.format: ssh; gpg.ssh.program: /tmp/code-sign -> /opt/env-runner/environment-manager; user.signingkey: /home/claude/.ssh/commit_signing_key.pub (0 bytes)
- README.md original: 16 bytes, 0 newlines, content '# dataaggregator', md5 15f8d73a23f571bd66d6fdb05c5bec73
- README.md current: 904 bytes
- docs/MARKETING-DATA-PLANE.md: 302,667 bytes, 1680 lines
- docs/MARKETPLANE-KICKOFF-PROMPT.md: 8,780 bytes, 113 lines
- design/marketplane/Main.dc.html: 41,451 bytes
- design/marketplane/support.js: 69,150 bytes
- HTTPS_PROXY: http://127.0.0.1:45755 (registry.npmjs.org, pypi.org, jsr.io, index.crates.io, proxy.golang.org all in NO_PROXY — direct)
- NODE_EXTRA_CA_CERTS: /root/.ccr/ca-bundle.crt

### Conflicts raised (5)

- KICKOFF PROMPT (to me) vs REPO REALITY — 'The repository is EMPTY except for a 16-byte README.md and one commit.' That was true at 12:40 UTC and is false now. As of 12:46 UTC there are 3 commits (3651cde, 01f6386, a057890), 5 tracked files, and README.md is 904 bytes. REALITY WINS: any agent briefed on 'empty repo, 16-byte README' will write a README that clobbers the one a parallel agent just committed and merged. Re-read HEAD before writing anything.
- MY BRIEF vs SPEC §15 AND KICKOFF §3 — my task named a 'Next.js + Cloudflare + Supabase toolchain'. The spec and the kickoff both put Next.js on VERCEL. Cloudflare's role is Workers (public API edge), Workflows + Queues (scheduler), R2 (raw payloads), KV (cache) — not Next hosting. THE SPEC WINS: do NOT install @opennextjs/cloudflare for the web app. It resolves fine (1.20.6, compatible with next 16.3.4 + wrangler 4.129.0) but installing it would silently contradict non-negotiable 3 and add a Cloudflare build path nobody asked for. Wrangler belongs in a separate Workers package, not in the Next app.
- SPEC §7 vs KICKOFF NON-NEGOTIABLE 3 — §7's stack table selects dlt (Python, Apache 2.0) on Trigger.dev for extraction, on the explicit ground that 'Cloudflare Workers has no native long-running Python'. The kickoff overrides: 'Write extractors in TypeScript on Workers rather than adopting a Python extraction library.' Section 11 does NOT adjudicate this, and the kickoff's own header says §11 decisions win where they exist. Since §11 is silent, THE KICKOFF WINS, and the kickoff itself requires the trade-off be recorded in the phase 1 design note. Practical consequence for toolchain: no Python extraction dependency, no Trigger.dev account, python3 3.11.15 on this box is irrelevant to the build.
- NPM 'latest' vs BUILDABILITY — resolving everything to `latest` yields typescript 7.0.2, eslint 10.10.0, vitest 5.0.0 and tailwindcss 4.3.3, three of which are fresh majors. The globally installed tsc here is 6.0.2, a whole major behind npm latest, which is evidence that TS 7 adoption is not yet universal. typescript-eslint is at 8.69.0 and I did not verify it supports the TS 7 compiler API. RECOMMENDATION: pin explicit versions in package.json rather than caret-latest, and validate the typescript + typescript-eslint + eslint-config-next triangle in a single install before building on it. eslint-config-next@16.3.4 itself is permissive (eslint >=9, typescript >=3.3.1) so it will not be the thing that fails loudly.
- MINIFLARE 'latest' IS A PRERELEASE — npm view miniflare version returns 5.20260903.0-alpha. A naive `npm i -D miniflare` installs an alpha. Use @cloudflare/vitest-pool-workers@0.22.0 for Workers unit tests instead, which pins its own runtime.

### Open or unverified (8)

- The repo is being mutated by at least one parallel agent DURING recon. I observed three distinct repository states in six minutes (12:40 untracked docs, 12:44:31 commit 01f6386, 12:46:33 merge a057890 on origin/main). Everything in this report is a snapshot as of 2026-09-07 12:46:46 UTC. Any builder agent MUST re-read HEAD and `git fetch` before committing.
- Local `main` is stale at 3651cde while origin/main is a057890. Unverified whether other worktrees or sibling sessions are branching from the stale local ref. Anything branched from local `main` will not contain the spec or the kickoff prompt.
- SSH commit signing is enabled globally (commit.gpgsign=true) with a signing key file that is 0 bytes and a signer binary that is a symlink into the environment manager. I did NOT test whether a commit actually signs, because that would mutate. If commits start failing with a signing error, this is the cause and `-c commit.gpgsign=false` is the escape hatch — but the parallel agent's commit 01f6386 succeeded, which is indirect evidence signing works.
- I did NOT run any installer, so `npm install` / `create-next-app` success is inferred from registry reachability, a real 41.7 MB tarball fetch, correct platform binaries being published for x64-linux-gnu, and ample disk — not from an actual install. The inference is strong but untested.
- typescript-eslint 8.69.0 compatibility with typescript 7.0.2 is UNVERIFIED. If lint is part of the pre-push gate the kickoff mandates ('Before every push run the repository's own lint, typecheck, unit tests and build'), this pairing is the most likely first failure.
- Docker daemon is absent, so `supabase start` and any Testcontainers-based integration test are unavailable. Whether the build plan depends on a local Supabase stack for RLS tests (kickoff surface 1 requires 'row-level security tests') is UNRESOLVED and needs a decision: hosted Supabase project + branch, or pure SQL-level unit tests.
- Playwright browser binaries are not downloaded. If e2e is in scope, first run pulls several hundred MB. Reachability of Playwright's CDN was not tested.
- The kickoff's phase 0 asks for docs/BACKEND-HANDOVER.md 'that constrains the backend'. No such file exists anywhere in the repo. Either it was never written or it lives outside this repository.

### Recommendation

YES — a scaffold can be installed and built here. There is no blocker. Node 22.22.2 clears Next 16's >=20.9.0 engine, the npm registry is reachable direct (bypassing the proxy via NO_PROXY) with real 41.7 MB tarball throughput, GitHub release assets fetch 200 so binary postinstalls work, correct x64-linux-gnu SWC binaries are published, and 30 GB free disk / 14 GiB RAM / 4 CPUs is several times what this stack needs. Four things to act on. (1) THE REPO IS NOT EMPTY AND IS ACTIVELY MOVING — HEAD is a057890, README.md is already a 904-byte Marketplane README, and docs/MARKETPLANE-KICKOFF-PROMPT.md now exists. Re-read HEAD and git fetch before any write; do not regenerate README.md from the 'empty repo' premise, and note that local `main` is stale at 3651cde so branch from origin/main or the current branch, never local main. (2) LAND A .gitignore IN THE SAME COMMIT AS package.json, BEFORE ANY INSTALL — there is no .gitignore anywhere and git confirms nothing is ignored, so an install ahead of it exposes node_modules, .next, .open-next, .wrangler and .env to a careless `git add -A`. (3) PIN VERSIONS, DO NOT TAKE latest BLIND — latest currently resolves typescript to 7.0.2 (the global tsc here is still 6.0.2), eslint to 10.10.0, vitest to 5.0.0, and miniflare's latest tag is an alpha (5.20260903.0-alpha). Pin next 16.3.4 / react 19.2.8 / react-dom 19.2.8 / tailwindcss 4.3.3 / @tailwindcss/postcss 4.3.3 / zod 4.5.4 / @supabase/supabase-js 2.115.0 / @supabase/ssr 0.12.6 / geist 1.7.2 / eslint-config-next 16.3.4, keep wrangler 4.129.0 and @cloudflare/workers-types 5.20260907.1 in a SEPARATE Workers package, use @cloudflare/vitest-pool-workers 0.22.0 rather than miniflare directly, and validate the typescript + typescript-eslint 8.69.0 + eslint 10 triangle in one install before writing lint config on top of it. Do NOT install @opennextjs/cloudflare — spec §15 and kickoff non-negotiable 3 both put Next.js on Vercel. (4) TWO CAPABILITY GAPS TO PLAN AROUND, neither fatal: the gh CLI is not installed so PRs must go through the mcp__github tools, and there is no Docker daemon so `supabase start` is impossible — RLS tests must run against a hosted Supabase project/branch (the mcp__Supabase tools are available) rather than a local stack.

---

## 2. Design tokens, extracted exactly from design/marketplane/Main.dc.html, and reconciled against spec section 14

The artboard and spec section 14 describe two completely different brands. The intersection of their palettes is empty: zero of section 14's six named hexes (#FBFBF8, #ECE9E1, #4F46FF, #0FB5A0, #FF5A5F, #FFB020) appear anywhere in Main.dc.html, and zero of the artboard's thirteen hexes appear anywhere in the spec. The artboard is a cool Tailwind-slate-and-blue system: ground #F4F6FA, ink #0F172A, single accent #2563EB (blue-600), hairlines #CBD5E1 and #E2E8F0, inverse surface #0F172A. It ships one accent, not four; there is no teal, no coral, no amber. On type the divergence is total and inverted: section 14 says "the serif display moment from the first draft was dropped in favour of one consistent bold voice", but Young Serif at weight 400 is the display face on 21 elements including every h1 and h2, the wordmark, the pricing numerals and the four-views card titles. The body face is Figtree, not Geist; Geist Mono survives as the only shared font. The Google Fonts link requests no 800 weight at all, so section 14's "800 weight" headlines are not loadable from the artboard's own link. What does survive from section 14: 20px card radii (12 uses), white cards on a near-white ground, a soft shadow (0 24px 60px rgba(15,23,42,0.12)), and #2563EB honouring the ROLE of "one accent for the brand and every call to action" even though the hex is wrong. The kickoff prompt is itself internally split: it orders "Start from the values in design/marketplane/Main.dc.html" and then parenthesises the section 14 palette that file does not contain. Section 11 takes no design decision, so it does not resolve this.

### Findings (45)

**The artboard uses exactly 13 distinct hex colours plus one rgba. Counts by grep -o over the whole file: #FFFFFF 44, #2563EB 35, #CBD5E1 33, #0F172A 31, #475569 23, #94A3B8 17, #E2E8F0 12, #64748B 8, #BBF7D0 7, #F4F6FA 5, #22C55E 4, #F9FAFC 1, #93C5FD 1, #1D4ED8 1.**  
`certain` · source: `design/marketplane/Main.dc.html (whole file)`  
> grep -o '#[0-9A-Fa-f]\{6\}' Main.dc.html | sort | uniq -c | sort -rn

**#F4F6FA is the page ground. Role: background only (5 uses) - body rule, the outermost screen div, the assistant chat bubble fill (thinking + answer), and the 4:3 image-placeholder fill.**  
`certain` · source: `Main.dc.html:13, :21`  
> body { margin: 0; background: #F4F6FA; color: #0F172A; ... }  and  <div data-screen-label="Marketplane" style="...background: #F4F6FA; min-height: 100vh;">

**#FFFFFF is the card surface and the on-accent/on-inverse ink. Split: 15 uses as background:, 23 as color: in markup, plus 6 in the dc script (plan card bg/fg and question-chip bg/color).**  
`certain` · source: `Main.dc.html, markup lines 1-281 and script 282-367`  
> grep -o '[a-z-]*: *#FFFFFF' -> 15 background, 23 color (markup); dc script adds 6

**#0F172A is both the primary ink and the inverse surface. 16 uses as background: (nav pill button, hero primary CTA, dark 'IT and data' card, alerts section, code panel, footer, numbered step circles, final-CTA button, Scale plan card, selected question chip), 8 as color:, 1 as border-color: (chip hover).**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o '[a-z-]*: *#0F172A' -> 16 background, 8 color, 1 border-color

**#2563EB is the single accent / CTA colour. 10 uses as background: (hero eyebrow pill, all button hovers, alerts-section CTA, Growth plan card, CTA band, logo dot, demo status dot, caret, thinking dots), 22 as color: (eyebrow labels, the word 'why.' in the h1, cause-share numerals, /v1/* API paths, alert timestamps, numbered-circle glyphs, code-block $ and booleans, the a{} rule).**  
`certain` · source: `Main.dc.html:14 and throughout`  
> grep -o '[a-z-]*: *#2563EB' -> 10 background, 22 color; a { color: #2563EB; text-decoration: none; }

**There are two distinct hairline colours, used in a deliberate hierarchy. #CBD5E1 is the structural hairline: 9 uses as 'border: 1px solid' on white-backed cards, 6 more as 'border: 1px solid' on radius-bearing elements, 8 as border-top and 5 as border-bottom for section rules, plus 3 as color: on dark. #E2E8F0 is the softer interior divider: 8 as border-top inside lists, 1 as border-bottom, 2 as background (logo placeholder tiles), 1 as color (code panel base text).**  
`certain` · source: `Main.dc.html (whole file)`  
> CBD5E1: 9x 'FF; border: 1px solid', 8x 'border-top: 1px solid', 6x 'px; border: 1px solid', 5x 'der-bottom: 1px solid', 2x 'e-height: 1.5; color:', 1x 'ound: #0F172A; color:', 2x in dc script. E2E8F0: 8x 'border-top: 1px solid', 1x 'der-bottom: 1px solid', 1x 'ound: #0F172A; color:', 1x 'ius: 8px; background:', 1x 'ius: 6px; background:'

**The muted-ink ramp is three steps on light and one on dark. #475569 (23 uses, color: only) is body/secondary text on white. #64748B (8 uses, color: only) is tertiary - mono status text, eyebrow caps on cards, ruled-out line, placeholder captions. #94A3B8 (17 uses) is dark-surface-only: 14 as color: (13 of them JSON keys inside the #0F172A code panel, 1 as the 'IT and data' eyebrow on the dark card) and 3 as 'border: 1px dashed' for logo placeholders. #CBD5E1 is body ink on #0F172A.**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o '.\{0,22\}#94A3B8' -> 13 code-block spans + 1 'acing: 0.04em; color: #94A3B8' + 3 '0; border: 1px dashed #94A3B8'

**There are four code-block-only colours, all on the #0F172A panel: #E2E8F0 is the base code text (set on the panel container), #94A3B8 is JSON keys, #BBF7D0 is string literals (7 uses), #22C55E is numeric literals (4 uses), and #2563EB is the shell $ prompt and the boolean true.**  
`certain` · source: `Main.dc.html:206-221`  
> <div style="background: #0F172A; color: #E2E8F0; border-radius: 20px; padding: 24px 26px; box-shadow: 0 24px 60px rgba(15,23,42,0.12);"> ... <span style="color: #BBF7D0;">"google_ads"</span> ... <span style="color: #22C55E;">4210.55</span>

**#93C5FD appears exactly once, as the 'Watch' eyebrow on the dark alerts section - it is the artboard's own accent-on-dark variant, chosen because #2563EB is too dark there.**  
`certain` · source: `Main.dc.html:163`  
> <span style="font-size: 14px; font-weight: 700; color: #93C5FD;">Watch</span>

**#1D4ED8 appears exactly once, as the link hover, and #F9FAFC appears exactly once, as the demo card's chip-rail inset background.**  
`certain` · source: `Main.dc.html:14, :58`  
> a { color: #2563EB; text-decoration: none; } a:hover { color: #1D4ED8; }  /  <div style="padding: 16px 20px; ... border-bottom: 1px solid #E2E8F0; background: #F9FAFC;">

**The artboard palette is the Tailwind slate ramp plus blue-600 plus green-500/200, not a bespoke set. #0F172A=slate-900, #475569=slate-600, #64748B=slate-500, #94A3B8=slate-400, #CBD5E1=slate-300, #E2E8F0=slate-200, #2563EB=blue-600, #1D4ED8=blue-700, #93C5FD=blue-300, #22C55E=green-500, #BBF7D0=green-200. Only #F4F6FA and #F9FAFC are off-ramp. This means missing dark-mode values have obvious in-family continuations (slate-800 #1E293B, slate-700 #334155).**  
`likely` · source: `design/marketplane/Main.dc.html`  
> Exact match of eleven of thirteen hexes to Tailwind default palette stops

**There are 8 distinct border-radius values. 999px x20 (pills: nav CTA, hero CTAs, eyebrow pill, question chips, install chips, logo dot, status dots, thinking dots, numbered circles, all buttons). 20px x12 (cards and panels: demo card, three-people cards, image placeholder, integration group cards, four-views cards, code panel, plan cards). 18px 18px 4px 18px x1 (user chat bubble). 4px 18px 18px 18px x2 (assistant bubbles: thinking + answer). 16px x1 (alert rows). 12px x1 (cause rows inside the answer). 8px x1 (26px integration logo tile). 6px x1 (22px logo-strip tile).**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o 'border-radius: [^;"]*' | sort | uniq -c -> 20 999px, 12 20px, 2 '4px 18px 18px 18px', 1 each of 8px, 6px, '18px 18px 4px 18px', 16px, 12px

**There is exactly ONE box-shadow in the entire artboard, used twice: on the hero demo card and on the developer code panel. Every other card is border-only. Section 14's 'white cards with ... a soft shadow' overstates what the artboard does.**  
`certain` · source: `Main.dc.html:49 and :205`  
> box-shadow: 0 24px 60px rgba(15,23,42,0.12)

**Three font stacks, verbatim. Sans/body: "Figtree", "Helvetica Neue", Arial, sans-serif (body rule only; everything else inherits). Display: 'Young Serif', Georgia, serif (2 uses: the wordmark and the h1) and 'Young Serif', serif (19 uses: every h2, the four-views card titles, the three-people card titles, the cause-share numerals, the plan credit numerals, the footer wordmark) = 21 display uses total. Mono: 'Geist Mono', monospace (12 uses: demo status text, thinking steps, alert timestamps/kinds, /v1/* API paths, install chips, the code <pre>, the footer copyright).**  
`certain` · source: `Main.dc.html:13; :26,:41 (Georgia variant); 19 further`  
> body { ... font-family: "Figtree", "Helvetica Neue", Arial, sans-serif; ... }  /  grep -c "Young Serif" = 21  /  grep -o "font-family: 'Geist Mono', monospace" | wc -l = 12

**The Google Fonts link requests three families and no weight above 700. Young Serif has no weight axis given, so only 400 loads.**  
`certain` · source: `Main.dc.html:11`  
> <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Figtree:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">

**Only four font-weights are used, and headlines are NOT bold. font-weight: 700 x46, 400 x10, 600 x8, 500 x3. Every Young Serif headline is explicitly font-weight: 400.**  
`certain` · source: `Main.dc.html:41, :106 and 7 more h2s`  
> h1 ... font-weight: 400; font-size: clamp(48px, 6.5vw, 78px); line-height: 1.0; letter-spacing: -0.02em  /  h2 ... font-weight: 400; font-size: 52px; line-height: 1.05; letter-spacing: -0.015em

**21 distinct font-sizes. Display tier: clamp(48px, 6.5vw, 78px) h1 / 72px final-CTA h2 / 52px all eight section h2s / 42px plan credit numeral / 28px three-people card title / 24px four-views card title / 22px wordmark, footer wordmark and plan price / 20px hero subhead and cause-share numeral. Body tier: 19px how-it-works step title / 18px section lead paragraphs / 17px large button label / 16px card body, alert title, answer headline, medium button / 15.5px user chat bubble / 15px nav links, small button, step body, agency note, placeholder caption / 14.5px security-item body / 14px eyebrow labels, logo-strip label, alert body, cause text, hero legal line, footer body / 13.5px question chip / 13px uppercase eyebrow caps / 12.5px mono install chips, thinking steps, code pre / 12px uppercase micro-caps, /v1/* paths, footer copyright / 11.5px alert timestamp mono.**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o 'font-size: [^;"]*' | sort | uniq -c -> 15px x21, 14px x17, 16px x13, 52px x8, 12px x8, 14.5px x6, 13px x6, 12.5px x5, 24px x4, 19px x4, 18px x4, 28px x3, 22px x3, 17px x3, 20px x2, and one each of clamp(48px, 6.5vw, 78px), 72px, 42px, 15.5px, 13.5px, 11.5px

**Ten line-heights and three letter-spacings. line-height: 1.5 x19 (body), 1.45 x9 (dense body), 1.05 x8 (all h2), 1.15 x7 (card titles), 1.4 x2, 1.0 x2 (h1 and final-CTA h2), 1.65 x1 (code pre), 1.35 x1 (alert title), 1.2 x1 (cause numeral), 1 x1 (plan credit numeral). letter-spacing: -0.015em x8 (all 52px h2), 0.04em x7 (uppercase eyebrows), -0.02em x2 (h1 and 72px CTA h2).**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o 'line-height: [^;"]*' and 'letter-spacing: [^;"]*' | sort | uniq -c

**Two keyframe animations, verbatim: @keyframes mp-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } } and @keyframes mp-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }. Applied as 'animation: mp-blink 1s steps(1) infinite' on the 2x16px caret and 'animation: mp-rise 0.4s ease-out' on the answer bubble.**  
`certain` · source: `Main.dc.html:15,:16,:64,:70`  
> Main.dc.html lines 15-16 verbatim; usages at :64 and :70

**Section rhythm is padding: 96px 40px, used 8 times - every full-width section except nav (20px 40px), logo strip (22px 40px), hero (56px 40px 72px), the final CTA band (104px 40px) and the footer (56px 40px 64px). Container is max-width: 1280px; margin: 0 auto; width: 100%; box-sizing: border-box, used 13 times, always with 40px horizontal padding.**  
`certain` · source: `Main.dc.html:103,117,135,160,179,194,224,247 (96px); :23,38,94,265... (container)`  
> grep -c 'padding: 96px 40px' = 8; grep -c 'max-width: 1280px' = 13; '<div style="max-width: 1280px; margin: 0 auto; padding: 96px 40px; ..."'

**The spacing scale is 2px-based. Distinct gap values sorted: 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 56, 64, plus the two-axis '0 40px'. Distinct padding magnitudes sorted: 8, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 40, 56, 64, 72, 96, 104. Frequency leaders: gap 4px x12, gap 14px x11, gap 10px x10, gap 12px x8, gap 16px x7, gap 8px x6, padding '18px 0' x10 (list rows).**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o '[^-]gap: [^;"]*' and 'padding: [^;"]*' | sort | uniq -c

**Control heights form a five-step scale: 44px (nav 'Start free', padding 0 20px, 15px/700), 48px (integrations 'All 22 integrations', 0 22px, 15px/700), 52px x2 ('Set your first watch' and 'Read the docs', 0 24px, 16px/700), 56px x2 (hero primary 0 28px and hero secondary 0 26px, 17px/700), 58px (final CTA, 0 30px, 17px/700). All use border-radius: 999px and display: inline-flex; align-items: center.**  
`certain` · source: `Main.dc.html:33,142,165,204,44,45,267`  
> height: 44px; padding: 0 20px / height: 48px; padding: 0 22px / height: 52px; padding: 0 24px / height: 56px; padding: 0 28px / height: 56px; padding: 0 26px / height: 58px; padding: 0 30px

**grid-template-columns per section: hero 'minmax(0, 1.05fr) minmax(0, 1fr)' gap 56px; answer cause row '56px minmax(0, 1fr)' gap 12px; three-people 'repeat(3, minmax(0, 1fr))' gap 20px; how-it-works outer 'minmax(0, 0.9fr) minmax(0, 1.1fr)' gap 64px with step rows '44px minmax(0, 1fr)' gap 16px x4; integrations 'repeat(5, minmax(0, 1fr))' gap 16px; alerts outer 'minmax(0, 0.85fr) minmax(0, 1.15fr)' gap 64px with rows '96px minmax(0, 1fr)' gap 18px; four-views 'repeat(4, minmax(0, 1fr))' gap 16px; developers outer 'minmax(0, 0.9fr) minmax(0, 1.1fr)' gap 64px; pricing 'repeat(4, minmax(0, 1fr))' gap 16px; security outer 'minmax(0, 0.8fr) minmax(0, 2fr)' gap 56px with list 'repeat(2, minmax(0, 1fr))' gap '0 40px'; footer '1.4fr repeat(4, minmax(0, 1fr))' gap 32px.**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o 'grid-template-columns: [^;"]*' | sort | uniq -c -> 4x '44px minmax(0, 1fr)', 2x 'repeat(4, minmax(0, 1fr))', 2x 'minmax(0, 0.9fr) minmax(0, 1.1fr)', and one each of the rest

**The artboard has NO media queries, NO prefers-color-scheme block and only one clamp(). Responsive behaviour is carried entirely by minmax(0,Nfr) grids, flex-wrap and one fluid h1. The kickoff prompt requires light AND dark values in tokens.css, so dark-mode card surface and dark-mode hairline have no source value in the artboard and must be invented.**  
`certain` · source: `design/marketplane/Main.dc.html`  
> grep -c '@media' = 0; grep -c 'prefers-color-scheme' = 0; grep -c 'clamp(' = 1

**ZERO of section 14's six named hexes appear in the artboard, and ZERO of the artboard's thirteen hexes appear anywhere in the spec. The palettes are disjoint sets. This is not a drift, it is a different brand.**  
`certain` · source: `design/marketplane/Main.dc.html vs docs/MARKETING-DATA-PLANE.md:1469,1474`  
> grep -ic per hex in Main.dc.html: FBFBF8=0 ECE9E1=0 4F46FF=0 0FB5A0=0 FF5A5F=0 FFB020=0. grep -ic per hex in MARKETING-DATA-PLANE.md: F4F6FA=0 2563EB=0 0F172A=0 CBD5E1=0 E2E8F0=0 475569=0 64748B=0 94A3B8=0 F9FAFC=0 93C5FD=0 1D4ED8=0 BBF7D0=0 22C55E=0

**Section 14 asserts the serif was dropped; the artboard makes serif the entire display voice. Section 14: 'The serif display moment from the first draft was dropped in favour of one consistent bold voice.' The artboard uses Young Serif 21 times at weight 400, on every h1 and h2.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1474 vs Main.dc.html:41`  
> Spec: "The serif display moment from the first draft was dropped in favour of one consistent bold voice." Artboard: grep -c 'Young Serif' = 21; h1 font-family: 'Young Serif', Georgia, serif; font-weight: 400

**Font overlap between spec and artboard is exactly one family: Geist Mono. Spec names Geist, Geist Mono, Inter Tight, JetBrains Mono. Artboard ships Figtree, Young Serif, Geist Mono. Geist (sans) count in artboard: 0 standalone (all 13 'Geist' matches are 'Geist Mono'). Inter Tight: 0. JetBrains: 0. Figtree in spec: 0. Young Serif in spec: 0.**  
`certain` · source: `Main.dc.html:11,13 vs MARKETING-DATA-PLANE.md:1474`  
> grep -c per family - Geist artboard:13 spec:1 (all artboard hits are 'Geist Mono'); Figtree artboard:2 spec:0; 'Young Serif' artboard:21 spec:0; 'Inter Tight' artboard:0 spec:1; JetBrains artboard:0 spec:1

**Section 14's '800 weight' headline requirement is unloadable from the artboard's own font link, which requests a maximum of 700 (Figtree) and 400 (Young Serif). If Geist 800 is adopted, a new Google Fonts request is required.**  
`certain` · source: `Main.dc.html:11 vs MARKETING-DATA-PLANE.md:1474`  
> href="...family=Young+Serif&family=Figtree:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" vs spec "extra-bold Geist headlines set tight (800 weight, negative tracking)"

**Section 14 says eyebrows are 'small bold pills'. In the artboard only ONE eyebrow is a pill (the hero badge: padding 8px 14px, border-radius 999px, background #2563EB, color #FFFFFF, 14px/700). The other seven section eyebrows are plain unpilled text: font-size: 14px; font-weight: 700; color: #2563EB.**  
`certain` · source: `Main.dc.html:40 vs :105,:120,:138,:181,:196,:226,:249`  
> Hero: <span style="display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; padding: 8px 14px; border-radius: 999px; background: #2563EB; color: #FFFFFF;">  vs  <span style="font-size: 14px; font-weight: 700; color: #2563EB;">How it works</span>

**Section 14 claims the ground is warm near-white #FBFBF8 with warm #ECE9E1 hairlines. The artboard ground #F4F6FA is COOL (blue channel highest: F4/F6/FA) and its hairlines #CBD5E1 / #E2E8F0 are cool slate. #FBFBF8 is warm (red channel highest) and #ECE9E1 is a warm stone. Adopting one and not the other would produce a mismatched temperature.**  
`certain` · source: `Main.dc.html:13 vs MARKETING-DATA-PLANE.md:1469`  
> Artboard: background: #F4F6FA (R244 G246 B250, blue-leaning). Spec: '`#FBFBF8` ground, white cards, `#ECE9E1` hairlines' (R251 G251 B248, red-leaning)

**The artboard does not colour its semantic roles at all. The four alert kinds - Competitor, AI visibility, Revision, Tracking - are rendered identically in 11.5px 'Geist Mono' at #64748B with only the timestamp in #2563EB. There are no coloured icon tiles, contradicting section 14's 'four sample alerts, each with a coloured icon tile'.**  
`certain` · source: `Main.dc.html:167`  
> <div style="display: flex; flex-direction: column; gap: 4px; font-family: 'Geist Mono', monospace; font-size: 11.5px; color: #64748B;"><span style="color: #2563EB; font-weight: 500;">{{ a.when }}</span><span>{{ a.kind }}</span></div>

**Two accessibility defects exist in the artboard as drawn: #2563EB on #0F172A is 3.51:1, used for the numbered step-circle glyphs (15px/700, fails AA 4.5:1) and for the code-block $ prompt and boolean literals. The artboard already contains the fix pattern - #93C5FD on #0F172A is 9.98:1 - but applies it only to the 'Watch' eyebrow.**  
`likely` · source: `Main.dc.html:110,111,112,113 and :207-221`  
> <span style="width: 36px; height: 36px; border-radius: 999px; background: #0F172A; color: #2563EB; ... font-weight: 700; font-size: 15px;">1</span>

**All light-mode text colours the artboard uses on white DO pass WCAG AA: #2563EB 5.12:1, #64748B 4.79:1, #475569 7.58:1, #0F172A ~17:1. #94A3B8 would fail at 2.56:1 but is only ever used on dark surfaces or as a dashed border.**  
`likely` · source: `design/marketplane/Main.dc.html`  
> Computed relative-luminance contrast ratios against #FFFFFF for each hex the artboard sets as color: on a light ground

**None of section 14's three semantic hues can be used as text on white: #0FB5A0 is 2.58:1, #FF5A5F is 3.05:1, #FFB020 is 1.83:1 against #FFFFFF. All three fail AA for normal text and #FFB020 fails even the 3:1 non-text threshold as a thin mark. If adopted they must be solid fills or thick marks with a separate darker text token.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:1474`  
> Computed WCAG contrast ratios vs #FFFFFF for #0FB5A0, #FF5A5F, #FFB020 as named in spec line 1474

**Section 14 says the source artboards are 'Main.dc.html, DarkHero.dc.html, canvas.json' and that 'A second artboard shows an alternate direction: dark ground, serif headline ... violet accent.' Only Main.dc.html and support.js exist in the repo. DarkHero.dc.html and canvas.json are absent from disk and from git. There is no violet artboard to compare against.**  
`certain` · source: `design/marketplane/ and git ls-files`  
> ls design/marketplane/ -> Main.dc.html, support.js only. git ls-files -> README.md, design/marketplane/Main.dc.html, design/marketplane/support.js, docs/MARKETING-DATA-PLANE.md, docs/MARKETPLANE-KICKOFF-PROMPT.md

**The kickoff prompt is the binding build instruction for tokens.css and it is self-contradictory: it orders the build to start from the artboard file, then parenthetically restates section 14's palette, which that file does not contain.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:49-55`  
> "Start from the values in `design/marketplane/Main.dc.html` (near-white ground, white cards with 20 px radii and a soft shadow, electric indigo as the single call-to-action colour, teal for reads, coral for writes and competitor alerts, amber for restatements, Geist and Geist Mono). Nothing hard-codes a hex value outside this file."

**Section 11 records no design or palette decision. Its eleven subsections cover MVP ordering, architecture, pricing, audience writes, the market module, Supermetrics MCP, Google Ads tiers, AI-monitoring cost, the join, go-to-market and residual risks. Therefore the section-11-overrides rule does NOT resolve the artboard-vs-section-14 conflict; it must be resolved on other grounds.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1192-1260`  
> Section 11 headings: 11.1 MVP ordering / 11.2 The compliant architecture / 11.3 Performance read pricing / 11.4 Audience writes / 11.5 Market module / 11.6 Supermetrics MCP / 11.7 Google Ads access tiers / 11.8 AI-answer monitoring cost / 11.9 The join itself / 11.10 Go-to-market / 11.11 Residual risks

**Section 11.5 decides to DROP the market/competitor module entirely, which retires half of section 14's colour semantics: coral was assigned 'writes and alerts about competitors' and amber 'competitors and restatements'. After 11.5, coral's surviving role is writes/suppression only and amber's is restatements only.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1224 (section 11.5)`  
> "**Decision.** Drop. Remove the market rows from the public pricing table. Keep a `competitor` entity in the graph so `diagnose` can join to app-store rank ... and treat those three as enrichment inside `diagnose` rather than a product surface."

**The artboard still ships the dropped market module as a first-class surface: a 'Competitors' card in the four-views grid with the footnote /v1/market, a 'Competitors and reviews' integration group, a 'Competitor' alert kind and a competitor pricing question. Section 11.5 kills these, and section 14 itself concedes it ('If section 3.4's recommendation to drop the market module is accepted, the "Your competitors" card and the competitor logos group come out.').**  
`certain` · source: `Main.dc.html:190 and MARKETING-DATA-PLANE.md:1476`  
> <span style="font-family: 'Geist Mono', monospace; font-size: 12px; color: #2563EB; margin-top: auto;">/v1/market</span>

**Section 14's described page structure does not match the artboard's sections. Section 14 lists 9 blocks including 'Questions, not dashboards' as nine pill chips and a hero H1 of 'Know why. Not just what.' in 100-pixel type. The artboard has no standalone questions section (four chips live inside the demo card at 13.5px), its H1 is 'Know what changed. And <span>why.</span>' at clamp(48px, 6.5vw, 78px), and it adds two sections section 14 never mentions: 'Three people in the room' and 'What IT will ask. Answered.'**  
`certain` · source: `Main.dc.html:41 vs MARKETING-DATA-PLANE.md:1447`  
> Artboard h1 text: 'Know what changed. And <span style="color: #2563EB;">why.</span>' vs spec 'Hero: "Know why. Not just what." in 100-pixel extra-bold type'

**Section 14 lists 'Get a demo' as a deliberately avoided device ('What was deliberately avoided ... "Get a demo" as the primary action') and describes the CTA set as 'Start free' with 'Log in as the only other nav action'. The artboard ships 'Book a demo' as the hero secondary CTA (56px, 1px solid #CBD5E1 outline).**  
`certain` · source: `Main.dc.html:45 vs MARKETING-DATA-PLANE.md:1472`  
> <a style="display: inline-flex; align-items: center; height: 56px; padding: 0 26px; border: 1px solid #CBD5E1; color: #0F172A; font-size: 17px; font-weight: 700; border-radius: 999px;" style-hover="background: #0F172A; color: #FFFFFF;">Book a demo</a>

**Hover states are declared as a dc-specific style-hover attribute in four patterns: 'background: #2563EB; color: #FFFFFF;' x3 (dark buttons go blue), 'background: #FFFFFF; color: #0F172A;' x2 (buttons on coloured grounds go white), 'background: #0F172A; color: #FFFFFF;' x2 (outline buttons fill dark), 'border-color: #0F172A;' x1 (question chips). These are the source for the interactive token set.**  
`certain` · source: `Main.dc.html (whole file)`  
> grep -o 'style-hover="[^"]*"' | sort | uniq -c -> 3, 2, 2, 1

**Logo placeholders are dashed-outline tiles in two sizes with two radii: 22x22px / border-radius 6px / background #E2E8F0 / border 1px dashed #94A3B8 in the logo strip, and 26x26px / border-radius 8px / same fill and border in the integration cards. The large image placeholder is aspect-ratio 4 / 3, border 1px dashed #94A3B8, border-radius 20px, background #F4F6FA, padding 32px.**  
`certain` · source: `Main.dc.html:96, :150, :115`  
> <span style="width: 22px; height: 22px; border-radius: 6px; background: #E2E8F0; border: 1px dashed #94A3B8;" title="logo placeholder"> and <span style="width: 26px; height: 26px; border-radius: 8px; background: #E2E8F0; border: 1px dashed #94A3B8; flex-shrink: 0;" title="logo placeholder">

**Two opacity values are used as a tinting device on coloured card grounds, so that one markup pattern serves white, indigo and near-black plan cards: opacity 0.75 on the plan name eyebrow and 0.85 on the plan note.**  
`certain` · source: `Main.dc.html:236,:238`  
> <span style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75;">{{ p.name }}</span> and <span style="font-size: 14px; opacity: 0.85; line-height: 1.4; min-height: 40px;">{{ p.note }}</span>

**Interactive state colours are carried in the dc script, not the markup: the selected question chip is bg #0F172A / color #FFFFFF / border #0F172A, the unselected is bg #FFFFFF / color #0F172A / border #CBD5E1 at 1.5px; thinking dots are #2563EB when done-or-current and #CBD5E1 when pending; plan cards are #FFFFFF/#0F172A except Growth (#2563EB/#FFFFFF) and Scale (#0F172A/#FFFFFF).**  
`certain` · source: `Main.dc.html:339-340, :343, :361-364`  
> bg: i === qi ? "#0F172A" : "#FFFFFF", color: i === qi ? "#FFFFFF" : "#0F172A", border: i === qi ? "#0F172A" : "#CBD5E1"  /  dot: i < step ? "#2563EB" : i === step ? "#2563EB" : "#CBD5E1"

### Exact values (85)

- #FFFFFF - card surface, on-accent and on-inverse ink - 44 occurrences (15 background, 23 color in markup, 6 in dc script)
- #2563EB - the single accent/CTA/brand colour - 35 occurrences (10 background, 22 color, 3 in dc script)
- #CBD5E1 - structural hairline; also body ink on dark - 33 occurrences (15 'border: 1px solid', 8 border-top, 5 border-bottom, 3 color, 2 in dc script)
- #0F172A - primary ink AND inverse surface - 31 occurrences (16 background, 8 color, 1 border-color, 6 in dc script)
- #475569 - secondary body ink on light - 23 occurrences, color: only
- #94A3B8 - dark-surface faint ink and dashed placeholder border - 17 occurrences (14 color, 3 'border: 1px dashed')
- #E2E8F0 - soft interior divider, placeholder tile fill, code base ink - 12 occurrences (9 border, 2 background, 1 color)
- #64748B - tertiary ink on light - 8 occurrences, color: only
- #BBF7D0 - code string literals on dark - 7 occurrences, color: only
- #F4F6FA - page ground, assistant bubble fill, placeholder fill - 5 occurrences, background: only
- #22C55E - code numeric literals on dark - 4 occurrences, color: only
- #F9FAFC - demo card chip-rail inset background - 1 occurrence
- #93C5FD - accent on dark ('Watch' eyebrow) - 1 occurrence
- #1D4ED8 - link hover - 1 occurrence
- rgba(15,23,42,0.12) - the only shadow colour - 2 occurrences
- box-shadow: 0 24px 60px rgba(15,23,42,0.12) - the ONLY shadow, on the demo card and the code panel
- border-radius: 999px - x20 - pills, buttons, dots, numbered circles
- border-radius: 20px - x12 - cards, panels, code block, image placeholder
- border-radius: 18px 18px 4px 18px - x1 - user chat bubble
- border-radius: 4px 18px 18px 18px - x2 - thinking bubble and answer bubble
- border-radius: 16px - x1 - alert rows
- border-radius: 12px - x1 - cause rows inside the answer
- border-radius: 8px - x1 - 26px integration logo tile
- border-radius: 6px - x1 - 22px logo-strip tile
- font-family: "Figtree", "Helvetica Neue", Arial, sans-serif - body/sans, set once on body
- font-family: 'Young Serif', Georgia, serif - x2 - wordmark and h1
- font-family: 'Young Serif', serif - x19 - all h2, card titles, numerals, footer wordmark
- font-family: 'Geist Mono', monospace - x12 - status text, thinking steps, alert meta, /v1/* paths, install chips, code pre, copyright
- <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Figtree:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
- font-size: clamp(48px, 6.5vw, 78px) - h1 - weight 400, line-height 1.0, letter-spacing -0.02em
- font-size: 72px - final CTA h2 - weight 400, line-height 1.0, letter-spacing -0.02em, max-width 880px
- font-size: 52px - all 8 section h2 - weight 400, line-height 1.05, letter-spacing -0.015em
- font-size: 42px - plan credit numeral - Young Serif, line-height 1
- font-size: 28px - three-people card title - Young Serif, line-height 1.15
- font-size: 24px - four-views card title - Young Serif, line-height 1.15
- font-size: 22px - wordmark (Young Serif), footer wordmark (Young Serif), plan price (weight 700, margin-top 8px)
- font-size: 20px - hero subhead (line-height 1.5, #475569, max-width 540px) and cause-share numeral (Young Serif, line-height 1.2, #2563EB)
- font-size: 19px - how-it-works step title - weight 700
- font-size: 18px - section lead paragraphs - line-height 1.5, #475569 (or #CBD5E1 on dark)
- font-size: 17px - large button labels - weight 700
- font-size: 16px - card body (line-height 1.5), alert title (weight 700, line-height 1.35), answer headline (weight 700, line-height 1.45), medium buttons (weight 700), security item title (weight 700)
- font-size: 15.5px - user chat bubble - weight 600, line-height 1.4
- font-size: 15px - nav links (weight 600), 44/48px button labels (weight 700), step body (line-height 1.5, #475569), agency note (weight 500), placeholder caption (weight 600, #64748B)
- font-size: 14.5px - security item body - #475569, line-height 1.45
- font-size: 14px - section eyebrows (weight 700, #2563EB or #93C5FD), hero eyebrow pill (weight 700), logo-strip label (weight 600, #64748B), alert body (line-height 1.45, #475569), cause text (line-height 1.45), hero legal line (weight 500, #475569), footer body, plan note (opacity 0.85, line-height 1.4)
- font-size: 13.5px - question chip - weight 600, padding 8px 13px, border 1.5px
- font-size: 13px - uppercase eyebrow caps - weight 700, text-transform uppercase, letter-spacing 0.04em
- font-size: 12.5px - mono install chips (padding 8px 12px), thinking steps (#475569), code pre (line-height 1.65)
- font-size: 12px - uppercase micro-caps (weight 700, letter-spacing 0.04em, #64748B), /v1/* API paths (#2563EB, margin-top auto), demo status text (#64748B), footer copyright
- font-size: 11.5px - alert timestamp/kind - Geist Mono, #64748B
- font-weight: 700 x46, 400 x10, 600 x8, 500 x3 - no 800 anywhere
- line-height: 1.5 x19, 1.45 x9, 1.05 x8, 1.15 x7, 1.4 x2, 1.0 x2, 1.65 x1, 1.35 x1, 1.2 x1, 1 x1
- letter-spacing: -0.015em x8, 0.04em x7, -0.02em x2
- @keyframes mp-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
- @keyframes mp-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
- animation: mp-blink 1s steps(1) infinite - on the 2x16px caret
- animation: mp-rise 0.4s ease-out - on the answer bubble
- Container: max-width: 1280px; margin: 0 auto; width: 100%; box-sizing: border-box - 13 uses, always with 40px horizontal padding
- Section rhythm: padding: 96px 40px - 8 uses
- padding: 104px 40px - final CTA band (the one section that breaks rhythm)
- padding: 56px 40px 72px - hero; padding: 56px 40px 64px - footer; padding: 20px 40px - nav; padding: 22px 40px - logo strip
- Padding magnitudes sorted: 8, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 40, 56, 64, 72, 96, 104
- Gap values sorted: 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 56, 64 (plus '0 40px')
- Gap frequency: 4px x12, 14px x11, 10px x10, 12px x8, 16px x7, 8px x6, 40px x4, 24px x4, 18px x4, 64px x3, 28px x3, 56px x2, 32px x2
- Control heights: 44px (pad 0 20px), 48px (0 22px), 52px (0 24px) x2, 56px (0 28px primary / 0 26px secondary), 58px (0 30px)
- Card paddings: 30px (three-people), 26px (four-views), 28px (pricing), 22px (integration groups), 24px 26px (code panel), 32px (image placeholder)
- grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) - hero, gap 56px
- grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr) - how-it-works and developers, gap 64px
- grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr) - alerts, gap 64px
- grid-template-columns: minmax(0, 0.8fr) minmax(0, 2fr) - security, gap 56px
- grid-template-columns: repeat(3, minmax(0, 1fr)) gap 20px - three people
- grid-template-columns: repeat(4, minmax(0, 1fr)) gap 16px - four views and pricing
- grid-template-columns: repeat(5, minmax(0, 1fr)) gap 16px - integrations
- grid-template-columns: repeat(2, minmax(0, 1fr)) gap 0 40px - security list
- grid-template-columns: 1.4fr repeat(4, minmax(0, 1fr)) gap 32px - footer
- grid-template-columns: 44px minmax(0, 1fr) gap 16px x4 - how-it-works step rows
- grid-template-columns: 96px minmax(0, 1fr) gap 18px - alert rows
- grid-template-columns: 56px minmax(0, 1fr) gap 12px - answer cause rows
- aspect-ratio: 4 / 3 - the image placeholder, the only aspect-ratio in the file
- opacity: 0.75 (plan name) and 0.85 (plan note) - the tinting device for coloured plan cards
- min-height: 260px (three-people cards), 360px (demo transcript), 40px (plan note), 20px (chat bubble), 100vh (screen)
- Placeholder tiles: 22x22px radius 6px, and 26x26px radius 8px - both background #E2E8F0, border 1px dashed #94A3B8
- Dots: 30px logo ring (999px, #0F172A) with 12px inner dot (#2563EB); 10px demo status dot; 7px thinking dots; 2x16px caret
- style-hover="background: #2563EB; color: #FFFFFF;" x3; "background: #FFFFFF; color: #0F172A;" x2; "background: #0F172A; color: #FFFFFF;" x2; "border-color: #0F172A;" x1
- SPEC SECTION 14 CLAIMED (none present in artboard): #FBFBF8 ground, #ECE9E1 hairline, #4F46FF electric indigo, #0FB5A0 teal, #FF5A5F coral, #FFB020 amber, Geist 800, Geist Mono, Inter Tight fallback, JetBrains Mono fallback

### Conflicts raised (9)

- PALETTE, hex by hex. Spec 14 says ground #FBFBF8; artboard says #F4F6FA. Spec says hairline #ECE9E1; artboard says #CBD5E1 (structural) and #E2E8F0 (interior). Spec says accent #4F46FF electric indigo; artboard says #2563EB (Tailwind blue-600, a cooler, greener royal blue). Spec says teal #0FB5A0, coral #FF5A5F, amber #FFB020; the artboard contains none of the three and ships no third hue of any kind. The intersection is empty: 0 of 6 spec hexes in the artboard, 0 of 13 artboard hexes in the spec. WHICH WINS: the ARTBOARD, for ground, surface, ink, hairline, inverse surface and accent. Reasons: (1) the kickoff prompt's operative verb is 'Start from the values in design/marketplane/Main.dc.html' - the file is named, the parenthetical is a gloss on it, and where a gloss contradicts the artefact it summarises, the artefact is the value and the gloss is the error; (2) the artboard is a self-consistent system - #F4F6FA/#CBD5E1/#E2E8F0/#0F172A/#2563EB are all cool slate-and-blue stops that sit together, whereas grafting a warm #FBFBF8 ground onto cool slate hairlines produces a visible temperature clash; (3) the artboard is executable evidence of a rendered page, section 14 is prose describing a page that does not exist in the repo; (4) section 11 takes no design decision, so the override rule does not rescue section 14. The exception is the three SEMANTIC hues - see the next conflict.
- SEMANTIC ROLE COLOURS. Spec 14 assigns teal #0FB5A0 to reads, coral #FF5A5F to writes and competitor alerts, amber #FFB020 to competitors and restatements, and the kickoff prompt repeats that mapping verbatim as a build requirement. The artboard assigns nothing: its four alert kinds are all #64748B mono text and there are no coloured icon tiles. WHICH WINS: SECTION 14, but only for the three status hues and only outside the CTA/brand role. Reason: the artboard is SILENT here, not contradictory - it never had to express reads-vs-writes-vs-restatements because it is a marketing page, and the product needs the distinction on day one (provisional vs final numbers, restatement markers, suppression pushes). Section 14 is the only place in the corpus that binds a semantic to a colour, nothing in section 11 overrides it, and the kickoff prompt names the mapping as a deliverable. So: artboard wins every token it actually defines; section 14 wins only the three hues it defines that the artboard leaves undefined. Guard: keep the LITERAL hexes #0FB5A0 / #FF5A5F / #FFB020 so they remain greppable against the spec, but restrict them to status marks, tiles, dots and chart series - never a button, never a CTA panel, never the brand.
- ACCENT ROLE vs ACCENT HEX. Spec 14: 'electric indigo #4F46FF for the brand and every call to action'. Artboard: exactly one accent, #2563EB, doing exactly that job (10 background uses, all CTA-adjacent; 22 colour uses, all brand-adjacent). WHICH WINS: the artboard for the HEX, section 14 for the RULE. The principle 'one colour is the brand and every call to action' survives intact and should be enforced in tokens.css as a single --mp-accent with no sibling; only the value changes from #4F46FF to #2563EB.
- TYPOGRAPHY, font by font. Spec 14: 'extra-bold Geist headlines set tight (800 weight, negative tracking) ... Geist plus Geist Mono only, both on Google Fonts, with Inter Tight and JetBrains Mono as fallbacks. The serif display moment from the first draft was dropped in favour of one consistent bold voice.' Artboard: display is 'Young Serif', Georgia, serif at font-weight 400 on 21 elements including every h1 and h2; body is "Figtree", "Helvetica Neue", Arial, sans-serif; mono is 'Geist Mono', monospace. Geist sans appears zero times, Inter Tight zero, JetBrains zero. The Google Fonts link requests Young Serif (400 only), Figtree 400/500/600/700 and Geist Mono 400/500 - no 800 weight exists in the request, so section 14's headline weight is not loadable from the artboard's own link. WHICH WINS: the ARTBOARD, on the same 'named file beats gloss' ground, and additionally because section 14's sentence is a claim ABOUT a prior draft ('was dropped') that the surviving artefact falsifies - the serif was not dropped, it is the entire display voice. Negative tracking is the one thing that survives from section 14 and it is already in the artboard (-0.02em on h1/72px, -0.015em on all 52px h2). Escalate this to a human: this is the single largest divergence in the corpus and it changes the brand's whole register from bold-sans-tech to editorial-serif. Do not silently pick one - build from the artboard and flag it in the PR.
- RADII AND SHADOW. Spec 14: 'white cards with 20-pixel radii, a hairline border and a soft shadow'. Artboard: 20px radii confirmed (12 uses) and a hairline border confirmed (1px solid #CBD5E1), but the ONLY shadow in the file is 0 24px 60px rgba(15,23,42,0.12) and it appears on just two elements - the hero demo card and the developer code panel. Every other card is border-only. WHICH WINS: the ARTBOARD. Ship one --mp-shadow-lift token and apply it only where the artboard applies it. Do not blanket-shadow all cards on the strength of section 14's sentence; that would flatten the deliberate hierarchy where the hero demo is the only lifted object above the fold.
- EYEBROW TREATMENT. Spec 14: 'Eyebrows are small bold pills.' Artboard: only the hero badge is a pill (8px 14px, 999px, #2563EB ground, white text); the seven section eyebrows are plain 14px/700 #2563EB text with no pill, and card micro-eyebrows are 13px/700 uppercase with 0.04em tracking. WHICH WINS: the ARTBOARD, which draws a real three-tier eyebrow system (hero pill / section text / card caps) where section 14 sees only one tier. Token all three.
- MISSING ARTBOARDS. Spec 14 states the sources are 'Main.dc.html, DarkHero.dc.html, canvas.json' and describes a second dark/violet artboard. Only Main.dc.html and support.js exist on disk or in git. WHICH WINS: reality. There is no violet direction to compare against and no canvas manifest; treat Main.dc.html as the sole design source and do not attempt to reconcile against the described second artboard.
- DARK MODE HAS NO SOURCE. The kickoff prompt requires tokens.css to carry 'light and dark values'. The artboard has zero @media queries and zero prefers-color-scheme blocks, but it does ship a complete inverse SURFACE set (#0F172A ground, #CBD5E1 body ink, #FFFFFF headings, #93C5FD accent, #E2E8F0/#94A3B8/#BBF7D0/#22C55E code) across the alerts section, code panel, footer and dark card. WHICH WINS: derive dark mode from those inverse values rather than inventing a scheme. Two values still have no source and must be invented - a dark card surface and a dark hairline. Recommend #1E293B and #334155 (Tailwind slate-800 and slate-700), because eleven of the artboard's thirteen hexes are already exact Tailwind slate/blue/green stops, so these are the in-family continuations rather than free choices. Flag both as invented in the PR.
- DEAD SEMANTICS FROM SECTION 11.5. Section 11.5 decides 'Drop' on the market module and removes competitors as a product surface, but section 14's colour mapping still assigns coral to 'alerts about competitors' and amber to 'competitors and restatements'. WHICH WINS: SECTION 11.5, per the stated override rule. Net effect on tokens: coral's surviving role is writes/suppression only; amber's surviving role is restatements only. Ship --mp-write and --mp-restate with those narrowed meanings and do not create a competitor-specific colour token. The artboard's 'Competitors' card, /v1/market footnote, 'Competitors and reviews' integration group and 'Competitor' alert kind are all built on the dropped module - section 14 concedes this itself ('If section 3.4's recommendation to drop the market module is accepted, the "Your competitors" card and the competitor logos group come out').

### Open or unverified (8)

- Section 14 is explicitly labelled 'Landing page draft' and its final paragraph is titled 'Copy that must change before launch' - the whole section is provisional by its own framing, which further weakens it against the artboard as a token source.
- Section 14 marks credit pack prices as [DRAFT] and the SOC 2 line as [planned]. The artboard hardcodes €0 / €19 / €79 / €299 and 1,000 / 4,000 / 20,000 / 100,000 credits in the dc script, and renders 'SOC 2 Type II planned' in the security grid. Any pricing-card component built from these tokens carries draft numbers.
- Section 14: 'The sample answer and alerts use invented example numbers and must be replaced with a real design-partner case.' All four demo questions, their cause splits, the four alert bodies and the code panel's JSON (spend 4210.55, conversions 655, revised_from 611) are invented.
- Section 14: 'Brand marks are shown under nominative use in an integrations list; check each platform's brand guidelines before launch, and replace the lettered placeholders with licensed assets.' The artboard ships no real marks at all - every one of the 22 integration slots and 8 logo-strip slots is a dashed #94A3B8 placeholder tile. Section 14 claims marks come from Simple Icons with lettered placeholders for the rest; the artboard has neither, only dashed boxes. Icon tokens (tile size, radius, dashed border) are therefore stable, but the assets are entirely absent.
- Section 14 describes an artboard that does not exist in the repo (DarkHero.dc.html, canvas.json). Anything built on the 'alternate violet direction' is unverifiable.
- Section 11.11 lists 'Nobody pays for verified root cause either' as a High residual risk, and 11.5 drops the market module - so the four-views grid the artboard renders (Ads and sales, Customer lists, Competitors, Search and AI) is one card wider than the decided product surface. Colour tokens keyed to four modules would over-provision.
- Section 14's hero is specified at '100-pixel extra-bold type' and the artboard renders clamp(48px, 6.5vw, 78px) at weight 400 - the maximum size differs by 22px and the weight by 400. Neither source is marked authoritative on type size.
- No accessibility review exists anywhere in the corpus. Two contrast defects in the artboard as drawn (#2563EB on #0F172A at 3.51:1 for the numbered-circle glyphs and the code prompt/booleans) and three in section 14's palette (#0FB5A0 2.58:1, #FF5A5F 3.05:1, #FFB020 1.83:1 as text on white) are unflagged by both documents and must be resolved in the tokens layer, not left to component authors.

### Recommendation

BUILD FROM THE ARTBOARD. Treat Main.dc.html as the source of truth for ground, surface, ink, hairline, inverse surface, accent, radius, shadow, type and spacing; take from section 14 only the three semantic status hues the artboard leaves undefined, and only the RULE (not the hex) that one accent owns the brand and every CTA. Flag the type divergence to a human in the PR - it is a brand-register decision, not a token decision.

PROPOSED src/styles/tokens.css (light values; :root):

GROUND AND SURFACE
--mp-ground: #F4F6FA (page background)
--mp-surface: #FFFFFF (cards, white bands)
--mp-surface-subtle: #F9FAFC (inset rail, e.g. the demo chip row)
--mp-surface-inset: #F4F6FA (assistant bubble, placeholder fill; intentionally == ground)
--mp-surface-inverse: #0F172A (dark sections, code panel, footer, dark card)
--mp-surface-placeholder: #E2E8F0 (logo tile fill)

INK
--mp-ink: #0F172A
--mp-ink-muted: #475569 (7.58:1 on white)
--mp-ink-subtle: #64748B (4.79:1 on white)
--mp-ink-faint: #94A3B8 (2.56:1 on white - DARK SURFACES ONLY, never on light)
--mp-ink-on-inverse: #CBD5E1
--mp-ink-inverse-strong: #FFFFFF
--mp-ink-on-accent: #FFFFFF

LINES
--mp-line: #CBD5E1 (structural: card border, section rule)
--mp-line-soft: #E2E8F0 (interior list divider)
--mp-line-dashed: #94A3B8 (placeholder outline)

ACCENT - exactly one, no siblings
--mp-accent: #2563EB (5.12:1 on white, passes AA as text)
--mp-accent-hover: #1D4ED8
--mp-accent-on-dark: #93C5FD (9.98:1 on #0F172A)
--mp-on-accent: #FFFFFF

SEMANTIC STATUS - from spec 14, status-only, never a button
--mp-read: #0FB5A0        (reads: connection health, ingest, final-not-provisional)
--mp-read-ink: #0B7F72    (derived; the text-safe pair, #0FB5A0 is only 2.58:1 on white)
--mp-write: #FF5A5F       (writes: audience push, suppression export)
--mp-write-ink: #C7373B   (derived; #FF5A5F is only 3.05:1)
--mp-restate: #FFB020     (restatements: is_provisional, revised_from, restates_until)
--mp-restate-ink: #8A5A00 (derived; #FFB020 is only 1.83:1 - the worst of the three)

CODE (all on --mp-surface-inverse)
--mp-code-ink: #E2E8F0 / --mp-code-key: #94A3B8 / --mp-code-string: #BBF7D0 / --mp-code-number: #22C55E / --mp-code-punct: #93C5FD (NOT #2563EB - fixes the 3.51:1 defect)

RADII
--mp-radius-xs: 6px / -sm: 8px / -md: 12px / -lg: 16px / -xl: 20px / -pill: 999px
--mp-radius-bubble-user: 18px 18px 4px 18px
--mp-radius-bubble-agent: 4px 18px 18px 18px

SHADOW - one only
--mp-shadow-lift: 0 24px 60px rgba(15,23,42,0.12)

TYPE
--mp-font-display: 'Young Serif', Georgia, serif
--mp-font-sans: 'Figtree', 'Helvetica Neue', Arial, sans-serif
--mp-font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace
Sizes: --mp-text-hero clamp(48px, 6.5vw, 78px) / -cta 72px / -h2 52px / -numeral 42px / -h3 28px / -h4 24px / -wordmark 22px / -lead 20px / -subhead 19px / -lg 18px / -btn-lg 17px / -base 16px / -bubble 15.5px / -md 15px / -body-sm 14.5px / -sm 14px / -chip 13.5px / -caps 13px / -mono-sm 12.5px / -xs 12px / -mono-xs 11.5px
Leading: --mp-leading-none 1 / -hero 1.0 / -h2 1.05 / -h3 1.15 / -tight 1.2 / -snug 1.35 / -bubble 1.4 / -body 1.45 / -relaxed 1.5 / -code 1.65
Tracking: --mp-tracking-hero -0.02em / -h2 -0.015em / -caps 0.04em
Weights: --mp-weight-regular 400 / -medium 500 / -semibold 600 / -bold 700 (no 800; do not add one without changing the font link)

SPACING - 2px base, named by px so the artboard stays greppable
--mp-space-2 2px / -3 3px / -4 4px / -6 6px / -8 8px / -10 10px / -12 12px / -14 14px / -16 16px / -18 18px / -20 20px / -22 22px / -24 24px / -26 26px / -28 28px / -30 30px / -32 32px / -40 40px / -56 56px / -64 64px / -72 72px / -96 96px / -104 104px

LAYOUT AND CONTROLS
--mp-container: 1280px / --mp-gutter: 40px / --mp-section-y: 96px / --mp-section-y-cta: 104px
--mp-control-sm 44px / -md 48px / -lg 52px / -xl 56px / -2xl 58px, with paddings 0 20px / 0 22px / 0 24px / 0 28px / 0 30px, all border-radius: var(--mp-radius-pill)

MOTION
--mp-motion-blink: mp-blink 1s steps(1) infinite
--mp-motion-rise: mp-rise 0.4s ease-out
(ship both @keyframes verbatim from Main.dc.html:15-16 in the same file)

DARK VALUES (:root[data-theme="dark"], derived from the artboard's own inverse surfaces)
--mp-ground: #0F172A / --mp-surface: #1E293B (INVENTED - no artboard source) / --mp-surface-inverse: #F4F6FA / --mp-ink: #FFFFFF / --mp-ink-muted: #CBD5E1 / --mp-ink-subtle: #94A3B8 / --mp-line: #334155 (INVENTED) / --mp-line-soft: #1E293B / --mp-accent: #93C5FD for text and marks, with --mp-accent-fill staying #2563EB + #FFFFFF for buttons. Both invented values are the Tailwind slate-800/700 continuation of the ramp the artboard already uses for its other eleven hexes; flag them as invented in the PR.

HOW TO COLOUR THE SEMANTIC ROLES GIVEN ONE ACCENT
The artboard ships one accent because it is a marketing page with no state to express. The product has state, so add a status layer ABOVE the brand layer rather than widening the brand:
1. #2563EB stays the only colour that ever fills a button, a CTA panel or the wordmark. Nothing in the status layer may be used for an action.
2. Reads (#0FB5A0), writes (#FF5A5F) and restatements (#FFB020) appear only as: a 7px dot (reuse the artboard's thinking-dot primitive), a left rule on an alert or table row, a 26px icon tile (reuse the integration-tile primitive at radius 8px), a badge on a tinted ground, or a chart series. Text inside those marks uses the paired -ink token, never the raw hue, because all three fail AA on white.
3. Provisional vs final is the highest-traffic use: render is_provisional / revised_from / restates_until with --mp-restate as a 2px left rule or a filled dot plus --mp-restate-ink for the label. This is the one place the spec, section 11.3's restatement-aware pricing and the artboard's own "Revision" alert all agree a distinction must be visible.
4. Two states the artboard already encodes should be tokenised as-is rather than recoloured: pending-vs-done (#CBD5E1 -> #2563EB on the thinking dots) and selected-vs-unselected (#FFFFFF/#0F172A/#CBD5E1 -> #0F172A/#FFFFFF/#0F172A on the question chips). These are accent-family, not status-family, and need no new hue.
5. Do not introduce a competitor colour. Section 11.5 drops the market module, so section 14's "coral for competitor alerts" and "amber for competitors" halves are dead; only writes and restatements survive.

---

## 3. Landing page content, structure and every claim it makes (design/marketplane/Main.dc.html) audited against docs/MARKETING-DATA-PLANE.md sections 0, 9, 11, 14, 15

Main.dc.html is a single 367-line artboard with 13 sections (nav, hero + demo card, logo strip, "Three people", "How it works", Integrations, Alerts, "Four views", Developers, Pricing, Security, CTA, footer) and one DCLogic class holding all interactive data. The page was written against the pre-decision pitch, not against section 11: it markets 22 integrations when the decided MVP is five connected sources (Google Ads, GA4, Search Console, Meta, one affiliate network) plus SERP bought from DataForSEO and four AI engines; it ships a Competitors card on /v1/market that section 11.5 drops outright; it ships a Customer lists card on /v1/audience plus three write-side promises that section 11.4 defers past MVP; and its entire pricing block ("Pay as you go. Nothing monthly.", four credit packs) contradicts section 11.3, which decides two units, with performance metered per connected account per month. Every AI-answer claim on the page states a single deterministic result, which section 11.8 forbids ("Report confidence intervals, never a single rank"). Every number in the demo answers, the four alerts, the curl response and the status line is invented and section 14 says so explicitly. The security strip is the closest to shippable: four of its six items survive, but "Frankfurt by default", "UK GDPR", "DPA on request" and "SAML SSO on Scale" have no support anywhere in the spec. Roughly 40 percent of the page's copy survives section 11 unchanged; the demo card's mechanics, the developer strip, the reconcile question and four security items are the parts worth porting as-is.

### Findings (44)

**Page is one screen div (data-screen-label="Marketplane") containing 13 top-level sections in this order: NAV, HERO (2-col grid, left copy + right demo card), LOGO STRIP, THREE PEOPLE, HOW IT WORKS, INTEGRATIONS, ALERTS, FOUR VIEWS, DEVELOPERS, PRICING, SECURITY, CTA, FOOTER. Every section is a max-width 1280px container with 40px horizontal padding; content sections use 96px vertical padding.**  
`certain` · source: `design/marketplane/Main.dc.html:21-284`  
> HTML comments in file: <!-- NAV --> <!-- HERO --> <!-- DEMO --> <!-- LOGO STRIP --> <!-- THREE PEOPLE --> <!-- HOW IT WORKS --> <!-- INTEGRATIONS --> <!-- ALERTS --> <!-- FOUR VIEWS --> <!-- DEVELOPERS --> <!-- PRICING --> <!-- SECURITY --> <!-- CTA --> <!-- FOOTER -->

**Nav: wordmark 'Marketplane' with a dot-in-circle logo mark; five nav items Product / Integrations / Pricing / Developers / Agencies; then 'Log in' text link and a 'Start free' pill button.**  
`certain` · source: `design/marketplane/Main.dc.html:28-33`  
> <span>Product</span><span>Integrations</span><span>Pricing</span><span>Developers</span><span>Agencies</span> … <span>Log in</span> … >Start free</a>

**Hero: eyebrow pill 'Marketing data, finally in one place'; H1 'Know what changed. And why.' with 'why.' in accent blue; subhead 'Marketplane connects your ads, analytics, email, search rankings and AI answers, reconciles them into one set of numbers, and explains every move. Plain English for the marketer. One schema for IT.'; primary CTA 'Start free', secondary CTA 'Book a demo'; reassurance line 'Free to start. No card. Read-only access, your logins stay yours.'**  
`certain` · source: `design/marketplane/Main.dc.html:39-47`  
> Marketing data, finally in one place / Know what changed. And <span>why.</span> / …explains every move. Plain English for the marketer. One schema for IT. / Start free / Book a demo / Free to start. No card. Read-only access, your logins stay yours.

**Demo card header: blue dot, title 'Ask Marketplane', right-aligned mono {{ statusText }}. Below it a chip row rendering the four questions as buttons, then a 360px-min body holding the user bubble ({{ typed }} + blinking caret), the thinking block (sc-if isThinking) and the answer block (sc-if isAnswer).**  
`certain` · source: `design/marketplane/Main.dc.html:51-86`  
> <span …>Ask Marketplane</span> … {{ statusText }} … <sc-for list="{{ questions }}" as="q" hint-placeholder-count="4"> … <sc-if value="{{ isThinking }}"> … <sc-if value="{{ isAnswer }}">

**Answer block layout: headline paragraph (16px/700), then one card per cause as a 56px + 1fr grid showing {{ c.share }} in Young Serif 20px accent blue, {{ c.tag }} uppercase 12px, {{ c.text }} 14px; then {{ answer.ruledOut }} as 13px muted; then a top-bordered 'Do next' block listing {{ n }} for each item of answer.next.**  
`certain` · source: `design/marketplane/Main.dc.html:70-84`  
> {{ answer.headline }} … {{ c.share }} … {{ c.tag }} … {{ c.text }} … {{ answer.ruledOut }} … <span …>Do next</span> … {{ n }}

**Logo strip label reads 'Reads from 22 sources' followed by the eight logoStrip names, each with a dashed 22px placeholder square titled 'logo placeholder'.**  
`certain` · source: `design/marketplane/Main.dc.html:95-97`  
> <span …>Reads from 22 sources</span> … <span … title="logo placeholder"></span>{{ l }}

**'Three people' section: eyebrow 'Who it is for', H2 'Three people in the room. One set of numbers everyone trusts.', three cards. Card 1 (blue) 'The marketer' / 'Ask a question. Get the why.' / 'Ranked causes, the share each explains, and what to do about it. Never opens a spreadsheet.' Card 2 (white) 'Marketing ops' / 'One figure per metric.' / 'Reconciled numbers, a flag when a platform quietly revises last week, and audiences pushed to every platform from one place.' Card 3 (near-black) 'IT and data' / 'One key. One schema.' / 'Read-only OAuth, one tenant per client, EU hosting, audit log. Hosted MCP server and SDKs in TypeScript and Python.'**  
`certain` · source: `design/marketplane/Main.dc.html:105-114`  
> Who it is for … Three people in the room. One set of numbers everyone trusts. … The marketer … Ask a question. Get the why. … Marketing ops … One figure per metric. … IT and data … One key. One schema.

**'How it works': eyebrow 'How it works', H2 'Connect. Reconcile. Ask. Act.', four numbered rows, plus an image placeholder reading 'Image placeholder: product screenshot of the reconciled dashboard'. Step 1 'Connect your accounts' / 'Sign in to the tools you already use. Nothing to install. Two minutes per account.' Step 2 'We reconcile the numbers' / 'Currencies converted, attribution windows aligned, late conversions credited back. Every row carries a freshness flag.' Step 3 'Ask, or set a watch' / 'Plain-English questions. Or watch a rival's prices, your spot in AI answers, or numbers that get revised.' Step 4 'Act on it' / 'Push a do-not-target list to every ad platform. Send a segment to email. Drop the weekly summary in Slack.'**  
`certain` · source: `design/marketplane/Main.dc.html:121-135`  
> Connect. Reconcile. Ask. Act. … Connect your accounts … We reconcile the numbers … Ask, or set a watch … Act on it … Image placeholder: product screenshot of the reconciled dashboard

**Integrations: eyebrow 'Integrations', H2 'Plays nice with your stack.', body 'Ads, analytics, email, competitors and search, all speaking the same language, so you can put them side by side.', right-aligned outline button 'All 22 integrations', then a 5-column grid of sourceGroups cards with dashed 26px logo placeholders.**  
`certain` · source: `design/marketplane/Main.dc.html:138-155`  
> Plays nice with your stack. … Ads, analytics, email, competitors and search, all speaking the same language, so you can put them side by side. … All 22 integrations

**The '22' is exactly the sum of the sourceGroups grid: 5 Ads + 5 Analytics and sales + 4 Email and CRM + 4 Competitors and reviews + 4 Search and AI = 22. So both the logo-strip count and the button label are load-bearing on the grid contents; trimming the grid to MVP scope forces both numbers to change.**  
`certain` · source: `design/marketplane/Main.dc.html:346-351`  
> sourceGroups: Ads[5], Analytics and sales[5], Email and CRM[4], Competitors and reviews[4], Search and AI[4]

**Alerts (dark section): eyebrow 'Watch', H2 'Alerts that earn the ping.', body 'Sources are checked on a schedule. You hear about it only when something is confirmed twice and matters to your numbers. No test variants, no figures that change tomorrow.', CTA 'Set your first watch', then four alert rows rendering a.when / a.kind in mono and a.title / a.body.**  
`certain` · source: `design/marketplane/Main.dc.html:162-172`  
> Watch … Alerts that earn the ping. … Sources are checked on a schedule… No test variants, no figures that change tomorrow. … Set your first watch

**'Four views': eyebrow 'What is inside', H2 'Four views. One set of numbers.', four hard-coded cards (not a loop). Card copy and endpoint footnotes: 'Ads and sales' → /v1/performance; 'Customer lists' → /v1/audience; 'Competitors' → /v1/market; 'Search and AI' → /v1/visibility.**  
`certain` · source: `design/marketplane/Main.dc.html:181-189`  
> Ads and sales … /v1/performance | Customer lists … /v1/audience | Competitors … /v1/market | Search and AI … /v1/visibility

**Developers: eyebrow 'For IT, data teams and AI agents', H2 'The same answer, as JSON.', body 'One key. One response shape for every source, with freshness and revision flags on every row. A hosted MCP server, an agent skill file, and TypeScript and Python SDKs generated from one spec.', three mono pills 'npx @marketplane/mcp', 'npm i marketplane', 'pip install marketplane', CTA 'Read the docs', and a dark panel with a syntax-coloured curl + JSON block.**  
`certain` · source: `design/marketplane/Main.dc.html:196-219`  
> The same answer, as JSON. … npx @marketplane/mcp … npm i marketplane … pip install marketplane … Read the docs

**The curl block calls https://api.marketplane.dev/v1/performance/campaigns with Bearer mp_live_… and body source=google_ads&window=28d&group_by=campaign, returning ok/source/data[entity brand_uk, spend 4210.55, conversions 655, revised_from 611, attribution_window 7d_click]/meta[credits_used 1, as_of 2026-09-07, is_provisional true, restates_until 2026-10-05].**  
`certain` · source: `design/marketplane/Main.dc.html:207-218`  
> $ curl https://api.marketplane.dev/v1/performance/campaigns \ -H "Authorization: Bearer mp_live_…" \ -d 'source=google_ads&window=28d&group_by=campaign'

**Pricing: eyebrow 'Pricing', H2 'Pay as you go. Nothing monthly.', body 'Credits, like a prepaid phone. A quick look is one credit. A full "why did this happen" is about twelve. They never expire, and questions we cannot answer are free.', right-hand note 'Agencies: one account, all your clients, and a flat monthly plan if you prefer one invoice.', then a 4-column loop over plans rendering p.name / p.credits / p.note / p.price with p.bg and p.fg.**  
`certain` · source: `design/marketplane/Main.dc.html:228-241`  
> Pay as you go. Nothing monthly. … A quick look is one credit. A full "why did this happen" is about twelve. … Agencies: one account, all your clients, and a flat monthly plan if you prefer one invoice.

**Security: eyebrow 'Security', H2 'What IT will ask. Answered.', six two-column rows: 'Read-only OAuth' / 'We never hold your passwords. Revoke from the platform at any time.'; 'One tenant per client' / 'Data, keys and audiences are isolated. Agencies switch, never mix.'; 'EU hosting, GDPR and UK GDPR' / 'Frankfurt by default. DPA on request.'; 'Consent checked before export' / 'No list leaves without a consent flag on every row.'; 'Never used to train models' / 'Your data answers your questions. That is all it does.'; 'Audit log and SSO' / 'Every query, export and key logged. SAML SSO on Scale. SOC 2 Type II planned.'**  
`certain` · source: `design/marketplane/Main.dc.html:249-259`  
> What IT will ask. Answered. … Read-only OAuth … One tenant per client … EU hosting, GDPR and UK GDPR … Consent checked before export … Never used to train models … Audit log and SSO

**CTA band (accent blue): H2 'Stop stitching spreadsheets. Start asking.' at 72px, button 'Start free', sub-line '1,000 free credits. No card. First account connected in two minutes.'**  
`certain` · source: `design/marketplane/Main.dc.html:266-268`  
> Stop stitching spreadsheets. Start asking. … 1,000 free credits. No card. First account connected in two minutes.

**Footer: 5 columns. Brand column = 'Marketplane' / 'Know what changed. And why.' / '© 2026 · Frankfurt · London'. Product = Ask, Watch, Ads and sales, Customer lists, Competitors, Search and AI. Developers = Docs, API reference, MCP server, SDKs, Status. Pricing = Credits, Agencies, Enterprise. Company = Security, Privacy, Terms, Contact.**  
`certain` · source: `design/marketplane/Main.dc.html:275-280`  
> © 2026 · Frankfurt · London … Product|Ask|Watch|Ads and sales|Customer lists|Competitors|Search and AI … Developers|Docs|API reference|MCP server|SDKs|Status … Pricing|Credits|Agencies|Enterprise … Company|Security|Privacy|Terms|Contact

**State machine: initial state is {qi:0, typed:"", phase:"answer", step:0}, so the card renders Q[0]'s full answer on first paint (renderVals substitutes q.text for typed when phase is 'answer'). pick(i) clears the step timer, sets {qi:i, typed:"", phase:"typing", step:0}, then types one character every 28ms; on completion it switches to phase 'thinking' with step 0 and advances step every 520ms; when step reaches STEPS.length (3) it clears the timer and sets phase 'answer'. Thinking therefore lasts 3 × 520ms = 1560ms and a full cycle is 28ms × text.length + 1560ms.**  
`certain` · source: `design/marketplane/Main.dc.html:286,319-332`  
> this.t = setInterval(() => { n++; this.setState({ typed: text.slice(0, n) }); … }, 28); … this.t = setInterval(() => { s++; if (s >= this.STEPS.length) { clearInterval(this.t); this.setState({ phase: "answer" }); } else this.setState({ step: s }); }, 520);

**Autoplay: componentDidMount starts an 11000ms interval advancing to (qi+1) % Q.length only when props.autoplay is true or undefined. Clicking any question chip calls clearInterval(this.loop) before pick(i), so a single user click permanently stops rotation for that session. componentWillUnmount clears both this.loop and this.t.**  
`certain` · source: `design/marketplane/Main.dc.html:317-318,338`  
> componentDidMount() { if (this.props.autoplay ?? true) this.loop = setInterval(() => this.pick((this.state.qi + 1) % this.Q.length), 11000); } … pick: () => { clearInterval(this.loop); this.pick(i); }

**thinkingSteps dot colour has a redundant branch: i < step and i === step both yield #2563EB, only i > step yields #CBD5E1. In the React port this is simply `i <= step ? accent : muted`.**  
`certain` · source: `design/marketplane/Main.dc.html:342`  
> thinkingSteps: this.STEPS.map((t, i) => ({ text: t, dot: i < step ? "#2563EB" : i === step ? "#2563EB" : "#CBD5E1" }))

**Question chip styling is derived, not stored: active chip (i === qi) is bg #0F172A / color #FFFFFF / border #0F172A; inactive is #FFFFFF / #0F172A / #CBD5E1. Hover on any chip sets border-color #0F172A.**  
`certain` · source: `design/marketplane/Main.dc.html:337-339`  
> bg: i === qi ? "#0F172A" : "#FFFFFF", color: i === qi ? "#FFFFFF" : "#0F172A", border: i === qi ? "#0F172A" : "#CBD5E1"

**The blinking caret span is rendered unconditionally inside the user bubble, so it keeps blinking during the answer phase too. Animations declared in <helmet>: mp-blink (1s steps(1) infinite) for the caret and mp-rise (0.4s ease-out, translateY(8px) → none) applied to the answer block.**  
`certain` · source: `design/marketplane/Main.dc.html:15-16,64,71`  
> @keyframes mp-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } } @keyframes mp-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }

**Only two props exist. autoplay: boolean, default true, editor 'boolean', section 'Demo' — gates the 11s rotation only. pricing: enum ['credits','monthly'], default 'credits', tsType "'credits'|'monthly'", section 'Pricing' — switches only plans[].note and plans[].price between never-expiring packs and '€19 / mo' style subscription strings. Nothing else on the page reacts to either prop.**  
`certain` · source: `design/marketplane/Main.dc.html:284,335,357-361`  
> data-props="{"autoplay":{"editor":"boolean","default":true,"tsType":"boolean","section":"Demo"},"pricing":{"editor":"enum","options":["credits","monthly"],"default":"credits","tsType":"'credits'|'monthly'","section":"Pricing"}}"

**The pricing prop is internally inconsistent: setting pricing='monthly' renders '€19 / mo', '€79 / mo', '€299 / mo' directly under the H2 'Pay as you go. Nothing monthly.', which the prop does not change. Either the heading must become prop-driven in the port, or the monthly variant must be dropped.**  
`certain` · source: `design/marketplane/Main.dc.html:228,335,358-361`  
> const monthly = this.props.pricing === "monthly"; … price: monthly ? "€19 / mo" : "€19"  /  <h2 …>Pay as you go. Nothing monthly.</h2>

**Only 3 of the 22 marketed integrations are actual MVP connected accounts (Google Ads, Meta, Google Analytics). 15 are out of scope entirely (TikTok, Microsoft Ads, LinkedIn, Mixpanel, Shopify, Stripe, Amplitude, Klaviyo, HubSpot, Mailchimp, Braze, Amazon, App Store, Google Play, Trustpilot) and 4 (Google Search, ChatGPT, Perplexity, Gemini) are bought or probed data sources, not customer connections. Search Console and the affiliate network — both in MVP scope — are absent from the grid.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1244 (section 11.9)`  
> "The scope shrinks to what two founders can operate: Meta, Google, GA4 and one affiliate network, with SERP bought wholesale."

**The STEPS array is the one place on the page that already states the correct MVP source list, including Search Console. It should be preserved verbatim and reused as the source of truth for the integrations grid.**  
`certain` · source: `design/marketplane/Main.dc.html:316`  
> STEPS = ["Checking Google Analytics, Search Console, Google Ads, Meta", "Comparing against the previous 7 days and same week last year", "Ranking causes by share of the change"];

**Q[0]'s competitor cause ('A rival tripled brand ad spend on 21 Aug') survives section 11.5, because 11.5 keeps competitor ad-library creatives as enrichment inside diagnose. Q[2] (price watching, Amazon, Shopping bids) does not, because it sells competitor tracking as a product surface.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1224 (section 11.5)`  
> "Keep a `competitor` entity in the graph so `diagnose` can join to app-store rank, Shopify catalogue data and ad-library creatives, and treat those three as enrichment inside `diagnose` rather than a product surface."

**Q[1] (Meta vs GA4 reconciliation) is the strongest question on the page and maps directly to reconcile.conversions, named in section 4.2 as 'the single most common "the numbers don't match" ticket at every agency'. Its causes match the spec's named gap drivers (attribution window, restatement, tracking) exactly.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:513 (section 4.2)`  
> "`reconcile.conversions` lines up Meta, Google, TikTok, GA4 and the order source … and returns the discrepancy matrix with the most likely cause (duplicate pixel, missing CAPI dedup key, consent mode, timezone offset)."

**'A full "why did this happen" is about twelve [credits]' and the status line '12 credits' both contradict the spec's own credit table, which prices diagnose.metric at 20 to 40 credits.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:536 (section 4.3)`  
> | `diagnose.metric` | 20 to 40 reads plus two LLM passes | 20 to 40 |

**No element on the page carries n_runs, a confidence interval, a mention rate or a run count, yet three separate claims assert deterministic AI-answer results (the Search and AI card, alert 2, and Q[0]'s 'AI answers 25%' cause). This is the exact failure mode section 11.8 legislates against.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1238 (section 11.8)`  
> "Report confidence intervals, never a single rank."

**Section 14 states the demo and alert numbers are invented and must be replaced before launch, and that credit prices are [DRAFT] and SOC 2 is [planned]. The artboard carries no [DRAFT] marker, no 'Example' badge and no disclaimer anywhere.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1476 (section 14)`  
> "Credit pack prices are marked `[DRAFT]` and the SOC 2 line is marked `[planned]`. The sample answer and alerts use invented example numbers and must be replaced with a real design-partner case."

**Section 14 itself already anticipates the two module deletions: 'If section 3.4's recommendation to drop the market module is accepted, the "Your competitors" card and the competitor logos group come out.' Section 11.5 accepts it, so the deletion is decided, not optional.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1224 (section 11.5), 1476 (section 14)`  
> "Decision. Drop. Remove the market rows from the public pricing table."

**The word 'Frankfurt' does not appear anywhere in the 1680-line specification. The only data-residency commitments in the spec are 'Offer an EU processing region at launch rather than as an enterprise upsell' (3.2 compliance bar item 4) and 'data region' as a Settings screen field (15). 'UK GDPR' appears nowhere either.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:217 (section 3.2)`  
> grep -i 'frankfurt' docs/MARKETING-DATA-PLANE.md returns no matches; "4. Offer an EU processing region at launch rather than as an enterprise upsell."

**'SAML SSO on Scale' has no support: the spec's only SSO reference is 'Single sign-on later' in the account model, and the plans array attaches 'SSO included' to the €299 pack. Selling SSO on a named tier is a contractual promise the spec has not made.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1497 (section 15)`  
> | Member | A person with a login | Roles: owner, admin, analyst, viewer. Invited by email. Single sign-on later. |

**'Never used to train models' and 'One tenant per client' are the two best-supported security claims on the page. They map to the written processor-only posture and to Meta Platform Terms 5.b.ii.2 per-client separation, which the spec makes an architectural non-negotiable.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:218 (3.2), 404 (3.5)`  
> "5. Adopt a written processor-only posture: no own-purpose use, no cross-tenant joins, no model training on customer contact data." / "ensure that Platform Data you maintain on behalf of one Client is maintained separately from that of other Clients"

**The page is missing a required element: the kickoff prompt's marketing-site surface requires 'the public no-signup demo endpoint from section 10.3', and section 10.3's first-10 plan puts it in week 0 to 1. The artboard has no such component; 'Book a demo' is a sales gate, not the no-signup demo.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md (Product surfaces to build, item 7); docs/MARKETING-DATA-PLANE.md:1078 (10.3)`  
> "7. **Marketing site**: from `design/marketplane/Main.dc.html`, reading copy limits and claims from the brand file, with the public no-signup demo endpoint from section 10.3."

**Section 14 describes a page that does not match this artboard on nine points: headline ('Know why. Not just what.' vs 'Know what changed. And why.'), a three-card How it works (artboard has four numbered rows), a 'Questions, not dashboards' section with nine question chips (absent; the artboard has four chips inside the demo card), the developer heading ('Built for builders, too.' vs 'The same answer, as JSON.'), a trust strip as pill chips (artboard uses a two-column definition list), the CTA line ('Stop stitching. Start asking.' vs 'Stop stitching spreadsheets. Start asking.'), coloured module header bands on the four view cards (absent), coloured icon tiles on alerts (absent), and the palette/type direction (see conflicts).**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1449-1457 (section 14)`  
> "1. Hero: \"Know why. Not just what.\" in 100-pixel extra-bold type … 4. Questions, not dashboards (\"Ask anything. Get the why.\"): nine example questions as pill chips … 9. Trust strip as pill chips, a solid indigo rounded panel with \"Stop stitching. Start asking.\" in 72-pixel type"

**Section 14 says the source artboards are Main.dc.html, DarkHero.dc.html and canvas.json. Only Main.dc.html and support.js exist on disk, so the 'alternate dark direction' artboard referenced by the spec is unavailable and cannot be compared against.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1447; design/marketplane/`  
> "the source artboards live in `design/marketplane/` (`Main.dc.html`, `DarkHero.dc.html`, `canvas.json`)" — but `ls design/marketplane/` returns only Main.dc.html and support.js

**The curl example applies Meta's restatement clock to a google_ads row: restates_until 2026-10-05 is fetched_at + 28 days, but section 7 specifies Google Ads restates_until = fetched_at + the account conversion window (click-through max 90 days, default 30). It also invents a field, revised_from, that is not in the envelope, and omits currency, fetched_at, source_updated_at, fx_source and fx_rate_date, which the kickoff makes contractual.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:708 (section 7); MARKETPLANE-KICKOFF-PROMPT.md non-negotiable 5`  
> | Google Ads | … | restates_until = fetched_at + account conversion window, is_provisional, attribution_window, native_entity_type and native_id |

**The demo answers contradict each other across cards: Q[1] attributes 655 conversions and the 611 restatement to Meta, while the curl block attributes spend 4210.55, conversions 655 and revised_from 611 to google_ads. The same invented figures are reused for two different platforms on one page.**  
`certain` · source: `design/marketplane/Main.dc.html:297,213-214`  
> "No. Meta reports 655, GA4 reports 588." vs "\"source\": \"google_ads\", … \"conversions\": 655, \"revised_from\": 611"

**Q[3] names TikTok as a live suppression destination and the integrations grid lists TikTok under Ads, but section 11.9 shrinks scope to Meta, Google, GA4 and one affiliate network. Section 9's build table still shows 'Meta and TikTok connectors go live for tenants' in weeks 7 to 8, so the spec is internally inconsistent; 11.9 overrides.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:925 (section 9), 1244 (section 11.9)`  
> "| 7 to 8 | … | Meta and TikTok connectors go live for tenants." vs "The scope shrinks to what two founders can operate: Meta, Google, GA4 and one affiliate network"

**'Read-only access, your logins stay yours' and 'Read-only OAuth' are the page's most defensible differentiator and are the spec's own pitch language, so they should be promoted rather than merely kept.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:22 (section 0)`  
> "Bring-your-own-credential is mandatory and also the pitch. … The product sells normalisation, restatement, diagnosis and scheduling over the customer's own tokens."

**The repo README already states the correct one-line positioning, which matches section 11.9 and should govern the hero: 'Verified root cause and an operated correctness guarantee over your own ad, analytics and search data.' Note it says ad, analytics and search — not email, and not competitors.**  
`certain` · source: `README.md:3`  
> "Verified root cause and an operated correctness guarantee over your own ad, analytics and search data."

### Exact values (64)

- state (initial): { qi: 0, typed: "", phase: "answer", step: 0 }
- phase values: "typing" | "thinking" | "answer"
- Typing interval: 28ms per character (setInterval, typed = text.slice(0, n))
- Thinking step interval: 520ms; advances step until s >= STEPS.length (3), then phase = "answer". Total thinking duration 1560ms.
- Autoplay interval: 11000ms; advances to (qi + 1) % Q.length; guarded by `this.props.autoplay ?? true`
- Q[0].text: "Why did website traffic drop last week?"
- Q[0].headline: "Traffic is down 23% on the week before. Three things explain most of it."
- Q[0].causes: [{ tag: "Search", share: "60%", text: "You slid from position 3 to 11 on 42 core keywords since 27 Aug." }, { tag: "AI answers", share: "25%", text: "Google now shows an AI Overview for 38% of those searches and does not cite you." }, { tag: "Competitors", share: "10%", text: "A rival tripled brand ad spend on 21 Aug." }]
- Q[0].ruledOut: "Ruled out: broken tracking, seasonality, a cut to your own ad budget."
- Q[0].next: ["1. Refresh the 12 pages that lost AI citations.", "2. Restore the brand bid cap in Google Ads.", "3. Watch those 42 keywords daily."]
- Q[1].text: "Do our Meta and GA4 conversions match?"
- Q[1].headline: "No. Meta reports 655, GA4 reports 588. The 67 gap has three parts."
- Q[1].causes: [{ tag: "Attribution", share: "48", text: "Meta counts 7-day click, GA4 counts last click. Same buyers, different credit." }, { tag: "Revisions", share: "14", text: "Meta credited late conversions back on Thursday. Your Monday report used 611." }, { tag: "Tracking", share: "5", text: "Checkout tag changed Thursday 14:00. GA4 missed five orders." }]
- Q[1].ruledOut: "Ruled out: currency mismatch, timezone offset, duplicate pixels."
- Q[1].next: ["1. Report Meta on a 1-day click window to compare like with like.", "2. Fix the checkout tag; we will confirm when orders match again."]
- Q[2].text: "Did a competitor change prices this week?"
- Q[2].headline: "Yes. One rival cut Japan 10GB by 12% on Tuesday. It is already costing you clicks."
- Q[2].causes: [{ tag: "Price", share: "-12%", text: "€14.90 to €13.10. Seen on their site and Amazon, confirmed twice 40 minutes apart." }, { tag: "Search", share: "-9%", text: "Your click share on “eSIM Japan” fell 9 points since the cut." }, { tag: "Ads", share: "2x", text: "They doubled Shopping bids on the same keyword the next morning." }] (note: curly quotes U+201C/U+201D around eSIM Japan)
- Q[2].ruledOut: "No change seen from your other three tracked competitors."
- Q[2].next: ["1. Decide: match on Japan 10GB or hold and add a bundle.", "2. We keep watching and ping you on the next move."]
- Q[3].text: "Who should we stop paying to reach?"
- Q[3].headline: "4,812 people bought in the last 30 days and are still in your prospecting audiences."
- Q[3].causes: [{ tag: "Meta", share: "3,100", text: "Still in two lookalike sets. About €820 a week of spend." }, { tag: "Google", share: "1,400", text: "In Performance Max with no exclusion list attached. About €340 a week." }, { tag: "TikTok", share: "312", text: "New campaign, no exclusions yet. About €80 a week." }]
- Q[3].ruledOut: "Consent checked: all 4,812 rows are eligible for a suppression list."
- Q[3].next: ["1. Push the exclusion list to all three platforms now.", "2. Refresh it nightly."]
- STEPS: ["Checking Google Analytics, Search Console, Google Ads, Meta", "Comparing against the previous 7 days and same week last year", "Ranking causes by share of the change"]
- statusText: phase === "answer" ? "6 sources · 12 credits · 4.1s" : phase === "thinking" ? "checking sources…" : "listening"
- logoStrip: ["Google Ads", "Meta", "Google Analytics", "Shopify", "HubSpot", "Klaviyo", "Amazon", "ChatGPT"]
- sourceGroups[0]: { name: "Ads", items: ["Google Ads", "Meta", "TikTok", "Microsoft Ads", "LinkedIn"] }
- sourceGroups[1]: { name: "Analytics and sales", items: ["Google Analytics", "Mixpanel", "Shopify", "Stripe", "Amplitude"] }
- sourceGroups[2]: { name: "Email and CRM", items: ["Klaviyo", "HubSpot", "Mailchimp", "Braze"] }
- sourceGroups[3]: { name: "Competitors and reviews", items: ["Amazon", "App Store", "Google Play", "Trustpilot"] }
- sourceGroups[4]: { name: "Search and AI", items: ["Google Search", "ChatGPT", "Perplexity", "Gemini"] }
- alerts[0]: { when: "Today 09:12", kind: "Competitor", title: "A rival cut the price of Japan 10GB by 12%", body: "Seen on their site and Amazon. Confirmed twice, 40 minutes apart." }
- alerts[1]: { when: "Today 07:40", kind: "AI visibility", title: "You lost the AI Overview mention for “best eSIM for Japan”", body: "A competitor is cited instead. Three of your pages are the likely fix." }
- alerts[2]: { when: "Yesterday", kind: "Revision", title: "Meta revised last week: 611 conversions became 655", body: "Late conversions were credited back. Your Monday report is out of date." }
- alerts[3]: { when: "Thu 14:00", kind: "Tracking", title: "Google Analytics stopped matching Shopify orders", body: "Most likely cause: the checkout tag was changed." }
- plans[0]: { name: "Free", credits: "1,000", note: "to start, 200 more every month", price: "€0", bg: "#FFFFFF", fg: "#0F172A" }
- plans[1]: { name: "Starter", credits: "4,000", note: monthly ? "credits a month" : "credits, never expire", price: monthly ? "€19 / mo" : "€19", bg: "#FFFFFF", fg: "#0F172A" }
- plans[2]: { name: "Growth", credits: "20,000", note: monthly ? "credits a month, most popular" : "credits, most popular", price: monthly ? "€79 / mo" : "€79", bg: "#2563EB", fg: "#FFFFFF" }
- plans[3]: { name: "Scale", credits: "100,000", note: monthly ? "credits a month, SSO included" : "credits, SSO included", price: monthly ? "€299 / mo" : "€299", bg: "#0F172A", fg: "#FFFFFF" }
- questions[i] derived: { text: x.text, pick: () => { clearInterval(this.loop); this.pick(i); }, bg: i === qi ? "#0F172A" : "#FFFFFF", color: i === qi ? "#FFFFFF" : "#0F172A", border: i === qi ? "#0F172A" : "#CBD5E1" }
- typed derived: phase === "answer" ? q.text : typed
- thinkingSteps derived: STEPS.map((t, i) => ({ text: t, dot: i < step ? "#2563EB" : i === step ? "#2563EB" : "#CBD5E1" }))
- props.autoplay: { editor: "boolean", default: true, tsType: "boolean", section: "Demo" }
- props.pricing: { editor: "enum", options: ["credits", "monthly"], default: "credits", tsType: "'credits'|'monthly'", section: "Pricing" }
- API base URL shown: https://api.marketplane.dev/v1/performance/campaigns
- API key format shown: mp_live_…
- Install lines: npx @marketplane/mcp | npm i marketplane | pip install marketplane
- curl JSON response (verbatim structure): { "ok": true, "source": "google_ads", "data": [ { "entity": "brand_uk", "spend": 4210.55, "conversions": 655, "revised_from": 611, "attribution_window": "7d_click" } ], "meta": { "credits_used": 1, "as_of": "2026-09-07", "is_provisional": true, "restates_until": "2026-10-05" } }
- curl request line: source=google_ads&window=28d&group_by=campaign
- Endpoint footnotes on the four view cards: /v1/performance, /v1/audience, /v1/market, /v1/visibility
- Fonts loaded: Young Serif (display), Figtree 400;500;600;700 (body), Geist Mono 400;500 (mono)
- Colours used: #F4F6FA (page ground), #FFFFFF (cards), #0F172A (ink / dark sections), #2563EB (accent), #475569 (body muted), #64748B (label muted), #CBD5E1 (border / dark-section body), #E2E8F0 (hairline / placeholder fill), #94A3B8 (dashed placeholder border), #93C5FD (eyebrow on dark), #BBF7D0 and #22C55E (code string / number), radius 20px on cards and 999px on pills, shadow 0 24px 60px rgba(15,23,42,0.12)
- Layout constants: max-width 1280px, section padding 96px 40px, nav padding 20px 40px, hero padding 56px 40px 72px, CTA padding 104px 40px, footer padding 56px 40px 64px, demo body min-height 360px
- Type scale: H1 clamp(48px, 6.5vw, 78px); section H2 52px; CTA H2 72px; card display 24-28px; body 15-20px; mono 11.5-12.5px
- Section headings verbatim: "Know what changed. And why." / "Three people in the room. One set of numbers everyone trusts." / "Connect. Reconcile. Ask. Act." / "Plays nice with your stack." / "Alerts that earn the ping." / "Four views. One set of numbers." / "The same answer, as JSON." / "Pay as you go. Nothing monthly." / "What IT will ask. Answered." / "Stop stitching spreadsheets. Start asking."
- Eyebrows verbatim: "Marketing data, finally in one place" / "Who it is for" / "How it works" / "Integrations" / "Watch" / "What is inside" / "For IT, data teams and AI agents" / "Pricing" / "Security"
- CTA labels verbatim: "Start free" (nav, hero, CTA band) / "Book a demo" / "All 22 integrations" / "Set your first watch" / "Read the docs" / "Log in"
- Micro-copy verbatim: "Free to start. No card. Read-only access, your logins stay yours." / "Reads from 22 sources" / "1,000 free credits. No card. First account connected in two minutes." / "Agencies: one account, all your clients, and a flat monthly plan if you prefer one invoice."
- Footer verbatim: "© 2026 · Frankfurt · London"; Product = Ask, Watch, Ads and sales, Customer lists, Competitors, Search and AI; Developers = Docs, API reference, MCP server, SDKs, Status; Pricing = Credits, Agencies, Enterprise; Company = Security, Privacy, Terms, Contact
- Spec credit packs for comparison (section 8, dollars not euros): Free 1,000 one-time + 200/mo $0; Starter 4,000 $19; Growth 20,000 $79; Scale 100,000 $299; Volume 400,000 $999; Committed custom from $299/mo
- Spec credit costs for comparison (section 4.3): standard read 1; cross-module join 3-5; diagnose.metric 20-40; watch check 2-5; reconcile.conversions 5-10; AI-answer run 10 per prompt-engine-run; AI snapshot 4 engines 40
- Spec target ARPA (section 0): 250 to 400 dollars a month per account, not 50 to 100 dollars self-serve

### Conflicts raised (38)

- "Reads from 22 sources" (Main.dc.html:95) — cannot ship. Decided MVP is five connected sources plus wholesale SERP and four AI engines (0, 9, 11.9). REPLACE with: "Reads Google Ads, GA4, Search Console, Meta and your affiliate network" and drop the count entirely; a number invites a count that the grid will not support for a year.
- "All 22 integrations" button (Main.dc.html:142) — cannot ship, same reason, and it links to a page that would have to list 17 sources that do not exist. REPLACE with: "See what we connect" pointing at a page that lists the five MVP sources plus 'SERP via DataForSEO' and the four AI engines, each with its status.
- sourceGroups 22-item grid (Main.dc.html:346-351) — cannot ship. 15 of 22 are out of scope (TikTok, Microsoft Ads, LinkedIn, Mixpanel, Stripe, Amplitude, Klaviyo, HubSpot, Mailchimp, Braze, Amazon, App Store, Google Play, Trustpilot, Shopify) and the two MVP sources Search Console and the affiliate network are missing. REPLACE with three groups: Ads and analytics [Google Ads, Meta, Google Analytics], Search [Search Console, Google SERP], AI answers [ChatGPT, Perplexity, Gemini, AI Overviews]; add an 'Affiliate network' card once a design partner names theirs (Impact, CJ or PartnerStack; Awin only on Accelerate/Advanced).
- logoStrip (Main.dc.html:345) — cannot ship. Shopify, HubSpot, Klaviyo and Amazon are not connectors, and Amazon is specifically to be kept off any near-term surface (3.4, active litigant). REPLACE with: ["Google Ads", "Meta", "Google Analytics", "Search Console", "ChatGPT", "Perplexity", "Gemini"] and change the label to "Connects to".
- 'Competitors' card on /v1/market (Main.dc.html:187) — cannot ship. 11.5 decides Drop, and section 2 already marks /v1/market 'reserved namespace, not built'. REPLACE with: delete the card and make the section 'Three views. One set of numbers.' The competitor entity survives only as unnamed enrichment inside diagnose.
- Footer Product column entries 'Competitors' and 'Customer lists' (Main.dc.html:279) — cannot ship (11.5 drop, 11.4 defer). REPLACE the column with: Ask, Watch, Ads and sales, Search and AI.
- Integrations subhead "Ads, analytics, email, competitors and search, all speaking the same language, so you can put them side by side" (Main.dc.html:140) — cannot ship: names two dropped/deferred categories and reprises the join framing 11.9 retires. REPLACE with: "Ads, analytics and search on one schema, with the attribution window and freshness of every number stated on the row."
- How it works step 3 "Or watch a rival's prices, your spot in AI answers, or numbers that get revised." (Main.dc.html:130) — cannot ship: price watching is the dropped market module. REPLACE with: "Or watch how often AI answers cite you, and get told when a platform revises a number you already reported."
- alerts[0] competitor price-cut alert (Main.dc.html:353) — cannot ship (11.5). REPLACE with a restatement or quota alert, e.g. { when: "Today 09:12", kind: "Freshness", title: "Google Ads conversions for 28 Aug are still provisional", body: "The account's 30-day conversion window is open. We will re-pull and tell you if the figure moves." }
- Q[2] 'Did a competitor change prices this week?' in full (Main.dc.html:302-309) — cannot ship (11.5, plus it names Amazon as a monitored source). REPLACE the whole question with a restatement question: "Why did last month's report change?" answered from the bitemporal as_of diff, which is a capability no incumbent has (2, 4.2).
- 'Customer lists' card on /v1/audience (Main.dc.html:186) — cannot ship. 11.4 defers writes past MVP; section 2 labels the namespace '(write, deferred)'. REPLACE with: delete the card. If a roadmap signal is wanted, one line under the views grid: "Suppression sync to ad platforms is next; it is not live yet."
- 'Marketing ops' card clause "and audiences pushed to every platform from one place" (Main.dc.html:112) — cannot ship (11.4). REPLACE the card body with: "Reconciled numbers, the attribution window on every conversion row, and a flag when a platform quietly revises last week."
- How it works step 4 "Push a do-not-target list to every ad platform. Send a segment to email. Drop the weekly summary in Slack." (Main.dc.html:133) — first two sentences cannot ship (11.4; the ESP path additionally blocked by Klaviyo's five-live-installs rule, 3.2). REPLACE with: "Route the answer where the team already is: the weekly summary and every verified alert to Slack or email."
- Q[3] 'Who should we stop paying to reach?' (Main.dc.html:310-315), specifically ruledOut "Consent checked: all 4,812 rows are eligible for a suppression list" and next[0] "Push the exclusion list to all three platforms now" — cannot ship: promises a write, and names TikTok. REPLACE the question with "Where are Meta and Google disagreeing about the same campaign?" or, if the audience story must stay, strip it to a read-only finding with no push action and no consent claim.
- Security item 'Consent checked before export' / 'No list leaves without a consent flag on every row.' (Main.dc.html:256) — cannot ship: it describes a write path that does not exist, and the spec's consent bar is stricter and more specific than 'a consent flag'. REPLACE with a claim that is true today: 'No cross-customer aggregation' / 'Your platform data is never pooled, benchmarked, sold or licensed. Meta and Google terms forbid it and so do we.' Bring the consent line back when writes ship, worded as per-record ad_user_data / ad_personalization with EEA default-deny and Meta data_processing_options.
- Hero subhead word 'email' in "connects your ads, analytics, email, search rankings and AI answers" (Main.dc.html:42) — cannot ship: no ESP or CRM source is in scope. REPLACE the sentence with: "Marketplane reads your ads, analytics and search on your own logins, reconciles them into one set of numbers, and gives you the ranked reason a number moved. Plain English for the marketer. One schema for IT."
- Hero subhead "and explains every move" (Main.dc.html:42) — cannot ship as an absolute. Diagnose is the product but its value is explicitly unproven (0, 11.11 'Nobody pays for verified root cause either'; the week-12 exit criterion is one paid diagnose case). REPLACE with: "and gives you the ranked, evidenced reason a number moved."
- Pricing H2 "Pay as you go. Nothing monthly." (Main.dc.html:228) — cannot ship. 11.3 decides two units and performance is metered per connected account per month. REPLACE with: "Per connected account. Credits for the rest." and a body: "Performance data is one monthly price per connected account, restatement re-pulls included. SERP, AI answers and questions run on credits. Failed calls are never billed."
- Pricing body "A quick look is one credit. A full 'why did this happen' is about twelve." (Main.dc.html:229) — cannot ship: 4.3 prices diagnose.metric at 20 to 40 credits, and 11.8 forbids any flat price for the AI-answer leg. REPLACE with: "A read is one credit. A full 'why did this happen' is 20 to 40, and plan.explain shows the cost before it runs. AI-answer monitoring is a 2-credit fee plus the model cost at our published rate."
- plans array, four credit packs at €0 / €19 / €79 / €299 (Main.dc.html:357-361) — cannot ship as the whole pricing story: it omits the per-connected-account unit that 11.3 decides, omits the Volume ($999/400,000) and Committed (from $299/mo) tiers from section 8, silently converts the spec's dollars to euros at 1:1, and section 14 marks these prices [DRAFT]. REPLACE with a two-part block: (1) a per-connected-account price per month with restatement re-pulls included, (2) the credit packs carrying a visible [draft pricing] marker, plus the calculator that 11.3 requires (inputs: accounts, questions, watches). Target ARPA per section 0 is 250 to 400 dollars a month per account, which €19/€79 packs do not reach.
- plans[3].note 'SSO included' and security line 'SAML SSO on Scale' (Main.dc.html:258,361) — cannot ship: the spec says 'Single sign-on later' (15) and nothing commits SSO to a tier. REPLACE: drop both; keep 'Audit log' alone as the item title, body 'Every query, export and API key is logged.'
- pricing='monthly' prop variant rendering '€19 / mo' under the heading 'Nothing monthly' (Main.dc.html:228,358-361) — internally contradictory. REPLACE: once the headline becomes 'Per connected account. Credits for the rest.', make the prop switch the credit-pack framing only (one-time packs vs auto-recharge), or drop the prop.
- statusText "6 sources · 12 credits · 4.1s" (Main.dc.html:343) — cannot ship: 6 sources exceeds MVP breadth, 12 credits contradicts 4.3, and 4.1s is invented. REPLACE with: "4 sources · 28 credits · example" or, better, make the whole card carry an 'Example' badge and keep the status line qualitative: "4 sources checked".
- Security item 'EU hosting, GDPR and UK GDPR' / 'Frankfurt by default. DPA on request.' (Main.dc.html:255) — cannot ship as written: 'Frankfurt' and 'UK GDPR' appear nowhere in the spec, no region has been provisioned, and 3.2's bar requires a click-through Article 28 DPA plus a public sub-processor page with change notice, which is stronger than 'on request'. REPLACE with: 'EU data region' / 'Your data is processed in the EU. Click-through DPA with Article 28 terms, and a public sub-processor list with change notice.' Add the city only after the Supabase/Cloudflare/Vercel regions are actually chosen, and add UK GDPR only after counsel confirms it.
- Footer '© 2026 · Frankfurt · London' (Main.dc.html:275) — cannot ship: implies two offices for a company that section 9 week 0 has not yet incorporated. REPLACE with the registered entity name and single registered address, read from the brand file, once incorporation completes; until then omit the line.
- Search and AI card "whether ChatGPT, Perplexity, Gemini and AI Overviews cite you or a rival when people ask" (Main.dc.html:188) — cannot ship as a deterministic claim (11.8). REPLACE with: "How often ChatGPT, Perplexity, Gemini and AI Overviews cite you rather than a rival, measured over repeated runs and reported as a mention rate with a confidence interval, never a single rank."
- alerts[1] "You lost the AI Overview mention for 'best eSIM for Japan'" (Main.dc.html:354) — cannot ship: asserts a single-run binary result (11.8), and AI Overview detection is itself unreliable (3.3: best measured detection 68% at n=25). REPLACE with: { when: "Today 07:40", kind: "AI visibility", title: "Your citation rate for “best eSIM for Japan” fell from 62% to 31% (n=80, 95% CI ±10)", body: "A competitor is now cited more often. Three of your pages are the likely fix." }
- Q[0].causes[1] "Google now shows an AI Overview for 38% of those searches and does not cite you" (Main.dc.html:292) — cannot ship without a run count. REPLACE with: "An AI Overview now appears on 38% of those searches, and over 80 runs it cited you 12% of the time, down from 47%."
- Every number in Q[0]-Q[3], the four alerts, the curl response and the status line — cannot ship unlabelled. Section 14: 'The sample answer and alerts use invented example numbers and must be replaced with a real design-partner case.' REPLACE with: either a real design-partner case, or ship with a visible 'Example' badge on the demo card header and above the alerts panel, plus a brand-file flag (e.g. demoDataIsIllustrative: true) so the badge cannot be removed by editing copy alone.
- curl block meta.credits_used: 1 on /v1/performance (Main.dc.html:216) — cannot ship: 11.3 removes performance reads from credit metering entirely. REPLACE the meta object with: { "account": "acct_…", "fetched_at": "2026-09-07T06:00:00Z", "source_updated_at": "2026-09-07T05:45:00Z", "is_provisional": true, "restates_until": "2026-10-07", "fx_source": "ecb_reference_rates", "fx_rate_date": "2026-09-05" }.
- curl block restates_until "2026-10-05" and field revised_from (Main.dc.html:214,218) — cannot ship: 2026-10-05 is fetched_at + 28d, which is Meta's clock, not Google Ads' account conversion window (7); revised_from is not an envelope field. REPLACE: use the Google Ads clock (fetched_at + the account conversion window, default 30 days) and express the restatement through the as_of diff or a restated webhook, not an invented field. Add currency and the fx fields the kickoff makes contractual.
- How it works step 1 "Two minutes per account" and CTA "First account connected in two minutes" (Main.dc.html:126,268) — cannot ship: unsupported, and self-serve signup is gated on Google OAuth verification, observed at 10+ weeks (3.5, 11.11). REPLACE with: "Sign in with Google or Meta. Nothing to install." and "1,000 free credits. No card. Read-only access."
- How it works step 2 "attribution windows aligned" (Main.dc.html:128) — cannot ship: the product does not align windows, it makes the window a required dimension and refuses to emit an unlabelled conversion count (2, 4.4). REPLACE with: "Currencies converted at fetch time, the attribution window stated on every conversion row, late conversions credited back."
- 'One key. One schema.' (IT card, Main.dc.html:114) and 'One key.' (developers, Main.dc.html:198) — misleading as written: 11.2 restricts the one-key model to public-data modules and makes bring-your-own-credential mandatory for every ad and analytics platform. REPLACE with: 'Your logins. One schema.' and, in the developer paragraph, 'One Marketplane key over your own platform credentials. One response shape for every source…'.
- Brand marks in logoStrip and sourceGroups are rendered as dashed placeholders titled 'logo placeholder' — cannot ship as real marks without clearance. Section 14: marks are shown under nominative use and each platform's brand guidelines must be checked, with lettered placeholders replaced by licensed assets. REPLACE: keep wordmarks only until each guideline is checked; drop the Amazon mark permanently (3.4 keeps Amazon off any near-term surface).
- Missing required element: the public no-signup demo endpoint (kickoff surface 7; section 10.3 week 0-1, 'a public, no-signup, no-key demo endpoint plus a recurring free tier'). ADD: a live no-key demo block in or near the developer strip, and treat 'Book a demo' as secondary to it — the spec's own borrowed-devices table lists 'self-serve primary call to action, no demo gate' as the pattern being copied.
- Spec-vs-artboard design conflict (for the design recon agent, not content): section 14 and kickoff non-negotiable 2 specify Geist 800 extra-bold headlines, ground #FBFBF8, indigo #4F46FF, teal #0FB5A0, coral #FF5A5F, amber #FFB020, and state 'The serif display moment from the first draft was dropped'. The artboard ships Young Serif display, Figtree body, ground #F4F6FA and a single accent #2563EB. RESOLUTION I propose: the artboard is the later artifact and is what the kickoff points the build at ('Start from the values in design/marketplane/Main.dc.html'); take the artboard's palette and type into tokens.css, and correct section 14's palette paragraph in a doc note rather than rebuilding the page to a description of an older draft.
- Headline conflict: section 11.9 endorses 'the landing page copy "Know why. Not just what."' and section 14 specifies it; the artboard ships 'Know what changed. And why.' RESOLUTION I propose: keep the artboard's headline. Section 11 decides scope, pricing and modules, not copy, and the artboard line says the same thing while naming the change-detection half of the product. Record the deviation in the phase design note.

### Open or unverified (19)

- Credit pack prices are marked [DRAFT] in section 14. Nothing on the pricing block may be presented as final; ship a visible draft marker or no numbers at all until the two-unit model in 11.3 is priced.
- SOC 2 Type II is marked [planned] in section 14 and appears in the spec only as a $1,500-3,000/month 'Tooling, SOC 2, legal' line in the breakeven model (10.2). The word 'planned' must stay attached; no date, no 'in progress'.
- Whether anyone pays for verified root cause is unproven and is listed as a High residual risk (11.11): 'Every observed demand signal is per module, and the join itself is refuted (10.1).' The hero, the demo card and the whole 'Ask' story rest on this. Exit criterion: one paid diagnose case by week 12.
- Google Ads Standard Access may have no path for a headless product (11.11, High). Until a written answer from Google exists, the site must not imply unlimited Google Ads volume, and the dashboard's Numbers screen exists partly to satisfy the reporting-interface requirement.
- Whether Meta treats a pay-per-call API as a Tech Provider needing per-client authorisation and a client list (11.11, High). This bears directly on the 'One tenant per client' and agency claims; onboarding may need a Business-admin acceptance step the page does not mention.
- Google OAuth verification is unbounded: documented at 3 to 5 days, observed at 10+ weeks, and the 3-5 day figure could not be sourced at all (3.5 corrections). 'Start free' self-serve signup is gated on it (11.11 mitigation: 'self-serve signup gated on it, not the roadmap'), so the CTA may need to be 'Request access' at launch.
- webmasters.readonly sensitivity is unconfirmed (3.5 open questions): Search Console could fall behind the same OAuth gate as GA4, which would remove it from the launch integrations list.
- The affiliate network cannot be named: Awin advertiser API access is plan-gated to Accelerate/Advanced with personal tokens, Impact's master agreement bars competitors and requires written approval, and which network ships depends on what a design partner already holds (9, 10.4, 11.10).
- Performance COGS and the ~98% margin are explicitly unverified (8), so no margin, 'cheapest', or price-comparison claim may appear on the page.
- AI-answer monitoring cost carries 2-3x uncertainty and its COGS was refuted by the pricing lens' own fact-checker (11.8), so the AI leg cannot carry a fixed credit price anywhere on the page.
- The 250-agency survey (11.4x SEO-audit ROI, 32% cost-predictability blocker) and the MCP install-failure statistics are marked unverifiable (8). None of these may be used as social proof or stat-bar content.
- AI Overview detection is unreliable across all providers: 'the best measured detection [is] 68% at n=25, and three providers score 0%' (3.3). Any AI Overview claim needs a method note.
- Provider terms on automated querying are unread: OpenAI's terms page returned 403 to automated fetches and the checker did not upgrade the finding beyond medium confidence (3.3, 11.11). The hosted path must be described as official-APIs-only.
- Section 14 references DarkHero.dc.html and canvas.json, which are not present in design/marketplane/ (only Main.dc.html and support.js). The alternate dark direction cannot be compared and should not be assumed to exist.
- No data region has been chosen. 'EU processing region at launch' is a compliance-bar requirement (3.2 item 4), but the specific region, city and sub-processor list are undecided, so any city name on the page is fabrication.
- Internal spec inconsistency on free-tier size: section 8 sets Free at 1,000 one-time plus 200/month; section 10.3 recommends 'a recurring free tier of about 250 calls per month' with no one-time trial. The CTA's '1,000 free credits' follows section 8; confirm which governs before it goes on a pricing page.
- Internal spec inconsistency on TikTok: section 9's build track has 'Meta and TikTok connectors go live for tenants' in weeks 7-8, while 11.9 shrinks scope to Meta, Google, GA4 and one affiliate network. 11.9 wins, but the section 9 table has not been updated.
- Brand marks are shown under nominative use only; section 14 requires each platform's brand guidelines to be checked before launch and lettered placeholders replaced with licensed assets. None of this has been done.
- The repo README (904 bytes, not the 16 bytes stated in the kickoff context) already fixes a one-line positioning and a documents table; treat it as an existing claim surface that must agree with the brand file.

### Recommendation

Port the page's mechanics and roughly half its copy; rewrite the rest against section 11 before any of it reaches a URL. Keep verbatim: the demo card and its full state machine (28ms typing, 520ms x 3 thinking steps, 11s autoplay, click-stops-rotation), the STEPS array (it already names the correct MVP sources), Q[0] and Q[1] as the two demo questions, the alerts 'confirmed twice' framing, the 'Connect. Reconcile. Ask. Act.' spine, the developer strip and its three install lines, the api.marketplane.dev base URL, and the section headings 'Know what changed. And why.', 'Three people in the room…', 'Alerts that earn the ping.', 'What IT will ask. Answered.', 'Stop stitching spreadsheets. Start asking.' Delete outright: the Competitors card and /v1/market, the Customer lists card and /v1/audience, Q[2] and Q[3], alerts[0], the competitor and email groups in the integrations grid, the '22' counts, the write-side promises in the ops card and in step 4, and 'Consent checked before export'. Rebuild: the pricing block around two units, and every AI-answer claim around n_runs and confidence intervals.

ALLOWED-CLAIMS LIST for src/brand/brand.ts (each is supported by the cited section; nothing outside this list may appear on the marketing site):
1. "Verified root cause and an operated correctness guarantee over your own ad, analytics and search data." (0, 11.9, README)
2. "Know what changed. And why." (11.9 endorses the equivalent; scope-clean)
3. "Read-only OAuth. We never hold your passwords. Revoke from the platform at any time." (3.5, 11.2)
4. "Your logins stay yours. We sell normalisation, restatement handling, scheduling and the answer, not access to your data." (0, 11.2)
5. "One tenant per client. Data, keys and connections are isolated. Agencies switch, never mix." (3.5 Meta 5.b.ii.2, 15)
6. "Your platform data is never pooled, benchmarked, sold or licensed." (3.5, 4.2)
7. "Never used to train models. Your data answers your questions. That is all it does." (3.2 compliance bar item 5)
8. "EU data region. Click-through DPA with Article 28 terms and a public sub-processor list." (3.2 items 3 and 4)
9. "Audit log: every query, export and API key is logged." (15 Settings)
10. "SOC 2 Type II planned." — only with the word planned, no date. (14)
11. "Reads Google Ads, GA4, Search Console, Meta and your affiliate network on your own credentials." (9, 11.9)
12. "SERP is bought wholesale from DataForSEO, never crawled." (3.3, 11.9, kickoff)
13. "Google-only SERP today, and we say so." (9: 'Ship Google-only and say so')
14. "Currencies converted at fetch time, with the rate source and date on the row." (2, 7)
15. "The attribution window is a required dimension. The API refuses to emit an unlabelled conversion count." (2, 4.4)
16. "Every row carries fetched_at, source_updated_at, restates_until and is_provisional." (2, 7, kickoff non-negotiable 5)
17. "When a platform restates a number you already reported, you get a webhook with the before and after." (4.2)
18. "Ask for the data as the platform reported it on any earlier date, with as_of." (2, 4.2)
19. "Ranked causes with the evidence rows attached, what was ruled out, and a recovery plan." (4.1)
20. "Every cause is checked by a second pass before you see it." (4.1)
21. "Alerts fire only after a second check confirms the change is real." (4.2, 4.4)
22. "Reconcile Meta, Google, GA4 and your order source for the same window and name the likely cause of the gap." (4.2)
23. "AI-answer citation measured over repeated runs and reported as a mention rate with a confidence interval, never a single rank." (11.8)
24. "You choose n_runs, and plan.explain shows the cost before the question runs." (11.8, 4.2)
25. "Performance is priced per connected account per month, restatement re-pulls included." (11.3)
26. "Credits cover SERP, AI answers and composite questions. AI-answer monitoring is a small orchestration fee plus the model cost at a published rate." (11.3, 11.8)
27. "Credits never expire. Failed calls are never billed. Hard spend caps and per-key budgets." (8 retention design)
28. "Free to start. No card. No minimum deposit." (8, 10.3)
29. "One key over your own platform credentials. One response shape for every source." (2, 11.2)
30. "Hosted MCP server, an agent skill file, and TypeScript and Python SDKs generated from one spec." (7, 9)
31. "Agencies: one login across every client, with per-client isolation." (4.2, 15)
32. "Sign in with Google or Meta. Nothing to install." (9, 15)
33. "Slack and email delivery for verified alerts and the weekly summary." (4.2, kickoff surface 6)
FORBIDDEN-CLAIMS LIST (same file, so the ban is machine-checkable): any source count ("22 sources", "all N integrations"); competitor price, review, app-rank or market tracking as a product surface; any audience write, suppression push, exclusion list, segment export or consent-before-export claim; "Nothing monthly" or any pay-as-you-go-only framing; a fixed credit price for a diagnose or an AI-answer run; any single AI rank or binary "you lost the citation" statement; "Frankfurt", "London", "UK GDPR", "SAML SSO", "SSO included"; TikTok, Microsoft Ads, LinkedIn, Amazon, App Store, Google Play, Trustpilot, Shopify, Stripe, Mixpanel, Amplitude, Klaviyo, HubSpot, Mailchimp or Braze as connectors; "two minutes"; "joins in one call"; any unlabelled example number in the demo, the alerts or the curl block.

---

## 4. Binding API and data contract: envelope, endpoint surface and 25-endpoint cap, restatement clocks, platform quotas, upsert key, metric dictionary, credit tables, MCP server requirements, currency requirements

The spec prints four different envelope shapes and they do not agree. Section 2 (lines 45-63) is a response wrapper (`ok`, `module`, `meta{credits_used,schema,request_id}`, nested `entity`/`dimensions`); section 7 (lines 738-759) is a flat data row with `raw` and no wrapper; section 13.3 (line 1414-1416) gives a third contract with a `freshness` object that section 7 explicitly refutes at line 762; and the design artboard prints a fourth with `data[]`, `revised_from` and `as_of`/`is_provisional`/`restates_until` moved into `meta`. Section 2 defers to section 7 in its own text ("The full field specification ... is in section 7"), and the kickoff prompt requires "the envelope in section 2 and section 7", so the reconciliation is: section 7 owns the row, section 2 owns the wrapper, union them. The sharpest defect is `restates_until`: the section 7 clocks table states `restates_until = fetched_at + 28d` but the section 7 example computes it from the row date (2026-08-14 + 28d = 2026-09-11) while the section 2 example computes it from fetched_at (2026-09-07 + 28d = 2026-10-05) and applies Meta's 28-day formula to a `google_ads` row. The table formula is defective for a materialised store: anchoring to the mutable `fetched_at` means every nightly restatement re-pull slides `restates_until` 28 days forward and no row ever becomes final. It must anchor to an immutable per-row value. The upsert key is verbatim `(source, account_id, entity_id, date, attribution_window)` yet `account_id` appears in no printed envelope, and no timezone field exists despite timezone normalisation being promised as a spec'd guarantee in 3.1 and 4.4. The endpoint surface as written across all sections does not fit the 25-endpoint Stainless free-tier cap if per-grain reads are enumerated, but fits comfortably at 23 once section 11's decisions are applied (market dropped, audience deferred, Search Console and Trends demoted to free joins) and performance reads collapse onto one parametrised `/v1/performance/report`. Section 11 also kills two of section 8's own credit rows: 11.3 replaces per-row performance credits with per-connected-account monthly metering, and 11.8 replaces the flat 10-credit AI-answer price with 2 credits plus measured LLM pass-through.

### Findings (70)

**Section 2 prints a response-wrapper envelope with 13 top-level keys: ok, module, source, entity{}, dimensions{}, metrics{}, fetched_at, source_updated_at, restates_until, is_provisional, fx_source, fx_rate_date, meta{}.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:48-62 (section 2)`  
> { "ok": true, "module": "performance", "source": "google_ads", "entity": { "type": "ad_group", "id": "…", "native_entity_type": "ad_group", "native_id": "…" }, "dimensions": { "date": "2026-09-01", "currency": "EUR", "attribution_window": "7d_click" }, "metrics": { "spend": 4210.55, "impressions": 812000, "clicks": 18422, "conversions": 611, "conversions_value": 14350.2 }, "fetched_at": "2026-09-07T06:00:00Z", "source_updated_at": "2026-09-07T05:45:00Z", "restates_until": "2026-10-05", "is_provisional": true, "fx_source": "ecb_reference_rates", "fx_rate_date": "2026-09-05", "meta": { "credits_used": 1, "schema": "v1", "request_id": "req_…" } }

**Section 7 prints a flat data-row envelope with 14 top-level keys and no wrapper: source, native_entity_type, native_id, entity_type, date, attribution_window, metrics{}, currency, fetched_at, source_updated_at, restates_until, is_provisional, fx_source, fx_rate_date, raw{}.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:737-759 (section 7, Envelope specification)`  
> { "source": "meta_ads", "native_entity_type": "adset", "native_id": "23851234567890123", "entity_type": "ad_group", "date": "2026-08-14", "attribution_window": "7d_click", "metrics": { "spend": 1240.55, "impressions": 88214, "clicks": 3106, "conversions": 41, "conversions_value": 5210.00 }, "currency": "EUR", "fetched_at": "2026-09-07T02:14:33Z", "source_updated_at": "2026-09-07T01:45:00Z", "restates_until": "2026-09-11T00:00:00Z", "is_provisional": true, "fx_source": "ecb_reference_rates", "fx_rate_date": "2026-09-05", "raw": { "…": "verbatim platform response passthrough" } }

**Section 2 explicitly defers to section 7 for the field specification, which settles which of the two is authoritative for the row.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:44`  
> "Every response lands on one envelope. The full field specification with the restatement clocks that justify it is in section 7; the short form:"

**The kickoff prompt makes the union of both shapes binding, not a choice between them, and names the required fields explicitly.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md, Non-negotiables item 5`  
> "5. **The envelope is the contract.** Every read returns the envelope in section 2 and section 7, with `fetched_at`, `source_updated_at`, `restates_until`, `is_provisional`, `attribution_window` as a required dimension on every conversion metric, `fx_source` and `fx_rate_date`, and a `raw` passthrough. The API refuses to emit an unlabelled conversion count."

**restates_until is typed inconsistently: section 2 prints a bare date, section 7 prints a full RFC3339 timestamp. The clocks-table formulas are timestamp arithmetic on fetched_at, so the timestamp form is the coherent one.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:57, 754, 706`  
> §2: "restates_until": "2026-10-05"  |  §7: "restates_until": "2026-09-11T00:00:00Z"  |  §7 table: "restates_until = fetched_at + 28d"

**The two printed examples disagree on the SEMANTICS of restates_until, not just its type. Section 7's example anchors to the row date (2026-08-14 + 28d = 2026-09-11); section 2's example anchors to fetched_at (2026-09-07 + 28d = 2026-10-05). Neither matches the table for the source it is labelled with: section 2's row is google_ads, whose table formula is fetched_at + account conversion window (default 30d click), which would be 2026-10-07.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:49-57 vs 741-754 vs 706-707`  
> §7 example: date 2026-08-14, fetched_at 2026-09-07T02:14:33Z, restates_until 2026-09-11T00:00:00Z (= date + 28d). §2 example: source google_ads, date 2026-09-01, fetched_at 2026-09-07T06:00:00Z, restates_until 2026-10-05 (= fetched_at + 28d, the Meta formula). §7 table Google Ads row: "restates_until = fetched_at + account conversion window".

**The clocks-table formula restates_until = fetched_at + Nd is defective for the architecture the same section mandates. Because the product is a materialised store with nightly restatement re-pulls, a fetched_at anchor slides restates_until forward on every re-pull, so is_provisional never clears and no row ever becomes final. The anchor must be immutable per row.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:706, 710, 922`  
> "the product is a materialised store with an API skin, and the backfill scheduler must be built around restatement windows rather than new data" (§7 line 710) combined with "restates_until = fetched_at + 28d" (§7 line 706) and "Tiered restatement backfill: daily for D-0 to D-3, weekly to D-28 (Meta)" (§9 line 922).

**Section 13.3 states a third, incompatible connector contract using a nested freshness object, which section 7 explicitly refutes 650 lines earlier.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1414-1416 vs 762`  
> §13.3: "1. Emits the envelope `{source, entity, metrics, dimensions, fetched_at, freshness}` ... 3. `freshness` is explicit: `{window_days, last_restated_at, is_final}`"  vs  §7: "A single `freshness` timestamp cannot express three clocks, which is why the field set splits into `fetched_at`, `source_updated_at`, `restates_until` and `is_provisional`."

**is_final and is_provisional are competing names for the same complementary predicate. is_provisional wins on count and on the binding sources (section 2, section 7, section 4.4, kickoff non-negotiable 5, section 15 dashboard screen 5); is_final appears only in section 4.2, section 13.3 and section 13.4.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:516, 1417, 1507; MARKETPLANE-KICKOFF-PROMPT.md`  
> §4.2: "`as_of` returns the data as the platform reported it on that date, and `is_final` says whether the attribution window has closed"; §13.3: "marks rows `is_final=false` until the window closes"; §15: "Numbers shows `is_provisional` and restatement markers on every figure".

**The upsert key names account_id, but account_id appears in neither printed envelope. The materialised store therefore cannot be keyed from the published contract as written.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:710`  
> "upserting on (source, account_id, entity_id, date, attribution_window)" — no `account_id` key in §2 lines 48-62 or §7 lines 737-759.

**The upsert key also names entity_id, which exists only in the section 2 shape (as entity.id) and is absent from the section 7 shape entirely. Section 7 carries native_id and entity_type but no canonical entity identifier.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:52 vs 739-741`  
> §2: "entity": { "type": "ad_group", "id": "…", "native_entity_type": "ad_group", "native_id": "…" }  |  §7 has native_entity_type, native_id, entity_type and no id.

**Timezone normalisation is promised twice as a specified guarantee but has no envelope field anywhere in the spec.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:133, 556`  
> §3.1 implications: "Add timezone normalization next to currency as a second spec'd guarantee. Fivetran's package explicitly names both as unsolved"; §4.4 comparison table: "Converted at fetch time with `fx_source` and `fx_rate_date` on the row; timezone normalisation specified".

**Section 13.3 requires the FX rate itself on the row, but both envelopes carry only fx_source and fx_rate_date, no numeric rate. The auditability rationale in section 7 argues for the numeric rate.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1419 vs 762`  
> §13.3 rule 5: "Currency is normalised to the account's reporting currency at fetch time with the rate and source recorded on the row."  vs  §7: "`fx_source` and `fx_rate_date` exist because ECB itself says the rates are 'published for information purposes only' ... so customers must be able to audit the number."

**The design artboard prints a fifth-generation shape with a data[] array wrapper, a revised_from field that appears nowhere in the spec, and as_of/is_provisional/restates_until relocated into meta.**  
`certain` · source: `design/marketplane/Main.dc.html, developer strip`  
> { "ok": true, "source": "google_ads", "data": [ { "entity": "brand_uk", "spend": 4210.55, "conversions": 655, "revised_from": 611, "attribution_window": "7d_click" } ], "meta": { "credits_used": 1, "as_of": "2026-09-07", "is_provisional": true, "restates_until": "2026-10-05" } }

**The artboard's endpoint is GET /v1/performance/campaigns with query params source, window and group_by, which is the only concrete performance endpoint path published anywhere.**  
`certain` · source: `design/marketplane/Main.dc.html, developer strip`  
> curl https://api.marketplane.dev/v1/performance/campaigns -H "Authorization: Bearer mp_live_…" -d 'source=google_ads&window=28d&group_by=campaign'

**Seven namespaces are declared in section 2. Three are in scope, one is deferred, one is dropped, and three are composites that section 11.9 promotes to the core product.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:36-42`  
> /v1/performance/*  ads + analytics + affiliate networks (read) | /v1/audience/*  contacts, events, lists, custom audiences (write, deferred) | /v1/market/*  reserved namespace, not built (see 3.4) | /v1/visibility/*  SERP, AI-answer monitoring (read) | /v1/diagnose  cross-module root cause (composite) | /v1/watch/*  scheduled fan-out with verified change webhooks (composite) | /v1/reconcile/*  conversion reconciliation across platforms and order source (composite)

**Section 11.5 drops /v1/market entirely and removes its pricing rows; the competitor entity survives only inside diagnose.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1224 (section 11.5)`  
> "**Decision.** Drop. Remove the market rows from the public pricing table. Keep a `competitor` entity in the graph so `diagnose` can join to app-store rank, Shopify catalogue data and ad-library creatives, and treat those three as enrichment inside `diagnose` rather than a product surface."

**Section 11.4 defers /v1/audience past the MVP and demotes section 8's write credit table to a placeholder; suppression propagation ships first when writes do come, priced per connected destination rather than per call.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1218 (section 11.4)`  
> "**Decision.** Defer past the MVP, keep the entity graph ready, and when it ships, ship suppression propagation first (Google requires no consent for removals, and it is the closed loop no incumbent offers), priced per connected destination rather than per call. ... The write table in section 8 stands only as a placeholder for that later decision."

**Section 9 removes Search Console and Google Trends as billable endpoints, contradicting section 8's credit table which prices them at 1 credit each.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:936 vs 855`  
> §9: "**Google Trends and Search Console as paid reads**: Search Console is free and generous, so customers can call it directly; the official Trends API is still allow-listed alpha. Both stay as free joins inside `diagnose`, not as billable endpoints."  vs  §8 table row: "| Search Console, Google Trends | 1 cr each ($0.005) | Platform APIs are free; compute only (unverified) | High, unverified |"

**A raw passthrough endpoint is mandatory in v1, on the evidence that every surviving unified API needed one.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:70, 683, 655`  
> §2: "platform-specific fields ride in an optional `raw` passthrough, and a passthrough endpoint exists from v1 because every unified API that survived had one."  §6: "Ship raw passthrough in v1 and make attribution-window and delayed-conversion normalization the product"; graveyard table: "Nango / Apideck ... Survived by adding raw passthrough ('Advanced Request... use all features of an API, even if they are not part of the unified API') | Ship the escape hatch in v1"

**plan.explain is mandatory and must return the query plan and credit cost before execution; section 11.8 makes it the mechanism by which n_runs cost is shown.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:518, 1238; MARKETPLANE-KICKOFF-PROMPT.md`  
> §4.2: "the MCP server exposes `plan.explain` which returns the query plan and credit cost before execution"; §11.8: "let the customer choose `n_runs` with the cost shown before execution through `plan.explain`"; kickoff item 4: "MCP against the current protocol revision with `plan.explain` returning credit cost before execution".

**The 25-endpoint cap is a hard cost boundary set by Stainless's free tier, which supplies 5 generators (TypeScript SDK, Python SDK, docs, MCP server), 5 seats and 100 preview builds/month, and the price above it is unknown.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:723, 802`  
> "| SDK and MCP generation | Stainless Free | 5 generators covering TypeScript SDK, Python SDK, docs and MCP server | $0 at 25 endpoints or fewer, 5 seats, 100 preview builds/month |"  and open question: "What do Stainless Starter/Pro, Speakeasy and Fern actually cost above free? All three withhold prices, so crossing 25 endpoints has an unknown bill."

**Enumerated as written across sections 2, 4, 8, 9 and 15, the surface does not fit 25. Performance alone spans eight dbt_ad_reporting grains times per-source variants, plus audience (4 verbs), market (4 endpoints), visibility (5), composites (4), plus dashboard resources (organisations, workspaces, members, connections, API keys, usage). It fits at 23 only after applying section 11's drops and collapsing all performance grains onto one parametrised report endpoint.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:104, 853-863, 1490-1497`  
> dbt_ad_reporting grain list: "account, campaign, ad group, ad, keyword, search query, URL and monthly geo grain"; §8 prices market at 4 endpoints and audience at 4 verbs; §15 adds Organisation, Workspace, Member, Connection, API key as first-class resources.

**Meta restatement clock, verbatim: data lands with insights refreshing every 15 minutes and continuing to update for a couple of days after an ad completes; restates until 'do not change after 28 days of being reported', with delivery-vs-first-report start unresolved.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:706`  
> "Insights 'refresh every 15 minutes'; metrics 'may continue to update for a couple of days after an ad has completed'" | "'do not change after 28 days of being reported' (whether the clock starts at delivery or at first report is unresolved in the docs, per both researcher and checker)" | windows: "1d_click, 7d_click, 28d_click, 1d_view, 7d_view, 28d_view, 1d_ev, dda, incrementality, inline, custom; `value` is only 'Metric value of default attribution window' and the default is never named" | "fetched_at, source_updated_at, restates_until = fetched_at + 28d, is_provisional, attribution_window"

**Google Ads restatement clock, verbatim: no published freshness statement was found in three attempts; conversions credited back to the original interaction date; click-through window max 90 days (default 30), view-through max 30 days (default 1), engaged-view max 30 days with a 3-day default.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:707`  
> "No published freshness or finalisation statement equivalent to Meta's was found across three attempts; conversions are credited back to the original interaction date" | "Click-through window maximum 90 days (default 30); view-through maximum 30 days (default 1); engaged-view maximum 30 days with a 3-day default (default added by the checker)" | "Per-account and per-conversion-action window settings, not simultaneous windows on one row" | "restates_until = fetched_at + account conversion window, is_provisional, attribution_window, native_entity_type and native_id (ad_group vs adset)"

**GA4 restatement clock, verbatim: realtime a few minutes, intraday 2-6 hours, daily 12 hours to 24+ hours, 360 intraday about 1 hour; attribution credit can change for up to 12 days; restates_until = fetched_at + 12d.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:708`  
> "Realtime 'typically a few minutes'; intraday 2 to 6 hours; daily '12 hours to 24+ hours depending on volume' (the checker's correction to a flat 12 hours); 360 intraday about 1 hour" | "'Data processing can take 24-48 hours. During that time, data in your reports may change'; attribution credit 'can change for up to 12 days'; Google states 'This is not a guarantee, nor an SLA or an SLO'" | "Model-level attribution adjustment rather than selectable windows on the row" | "source_updated_at, restates_until = fetched_at + 12d, is_provisional, fx_source, fx_rate_date"

**The backfill schedule that operationalises the clocks is tiered and is capped by Meta's async breakdown job limit: daily for D-0 to D-3, weekly to D-28 (Meta), to the conversion window (Google Ads), to D-12 (GA4).**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:922 (section 9, week 2)`  
> "Tiered restatement backfill: daily for D-0 to D-3, weekly to D-28 (Meta), to the conversion window (Google Ads), to D-12 (GA4), because Meta caps async breakdown jobs at 10 per ad account per day."

**Section 13.3's backfill rule states GA4 at 72h, contradicting the section 7 clocks table's 12 days and section 9's D-12.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1417 vs 708`  
> §13.3: "Backfill re-pulls the platform's restatement window (Meta 28d, Google Ads conversion lag, GA4 72h) and marks rows `is_final=false` until the window closes."  vs §7 table: "restates_until = fetched_at + 12d".

**GA4 quotas force the whole architecture: live passthrough is off the table and the product must be a materialised store with an API skin, because token cost varies by query complexity so per-call cost is unknowable at request time.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:710`  
> "GA4 quotas force the shape of the whole system: 200,000 core tokens per property per day, 40,000 per hour, 14,000 per project per property per hour and only 10 concurrent requests on standard properties (2,000,000 / 400,000 / 140,000 and 50 concurrent on 360), with token cost varying by query complexity so per-call cost is unknowable at request time. Live passthrough is off the table"

**The GA4 per-property-per-hour quota is shared with the customer's other tools, so the product cannot assume the full 40,000.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:413 (section 3.5 access table)`  
> "200,000 core tokens per property per day, 40,000 per property per hour (shared with the customer's other tools), 14,000 per project per property per hour, 10 concurrent requests"

**Google Ads has four access rungs, all limited per developer token, and rejected requests that return a GoogleAdsFailure still count against the cap.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1232, 411, 786`  
> §11.7: "Explorer Access has existed since 2025-10-28 at 2,880 operations per day against production accounts, Basic is 15,000 per day, Standard is unlimited, and all limits are per developer token." §3.5: "limits are 'based on the number of API operations made per developer token,' and rejected requests returning a GoogleAdsFailure still count". §7 corrections: "Test, Explorer (2,880 production operations per day, blocking account creation, user management, keyword planning and billing), Basic (15,000), Standard (unlimited). Google 'may automatically upgrade your developer token from Test Account Access level to the Explorer Access level in some cases'."

**Meta rate limits: Development tier score cap 60 with 300s decay and 300s block versus 9,000 at Full Access; Ads Insights hourly quota per ad account is 600 (Dev) + 400 * active ads - 0.001 * user errors, versus 190,000 at Full Access; limits are scored per application as well as per ad account, making the vendor's own Meta app a shared bottleneck across tenants.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:412, 441, 1031`  
> "Development tier max score 60 with 300s decay and 300s block; Ads Insights hourly quota per ad account 600 (Dev) + 400 * active ads - 0.001 * user errors, versus 190,000 at Full Access" | "Meta Development tier caps the rate-limit score at 60 versus 9,000 at Full Access" | "Meta's rate limits are scored per application as well as per ad account, so the vendor's own Meta app is a shared bottleneck across all tenants, and async breakdown jobs cap at 10 per ad account per day against a 28-day restatement window."

**The x-fb-ads-insights-throttle header carries three fields; the spec names only the third, ads_api_access_tier, and identifies it as the instrumentation that confirms a Full Access upgrade took effect. The other two field names are never printed in the spec.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:795 (section 7, Corrections from fact-check)`  
> "Meta's `x-fb-ads-insights-throttle` header carries a third field, `ads_api_access_tier`, which is the instrumentation that confirms a Full Access upgrade actually took effect."

**Meta's Full Access qualification is 500+ Marketing API calls in the past 15 days with an error rate under 15% on a rolling last-500-call window; tiers were renamed on 2026-05-04 to Marketing API Access Tier with Limited and Full Access, and the screen-recording requirement was removed. Errors count against both the tier threshold and the insights quota via the user-errors penalty.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:440, 467`  
> "Meta lowered the Full Access bar effective 2026-05-04 to 500+ Marketing API calls in 15 days with error rate under 15% on a rolling last-500-call window, and removed the screen-recording requirement" | "Keep the error rate low: errors count against both the tier threshold and the insights quota through the user-errors penalty."

**An open Meta breakdowns issue constrains what breakdown dimensions the connector may request: an availability notice dated 2026-08-06 affects frequency_value, hourly_stats_aggregated_by_audience_time_zone and impression_device, requiring opt-in through Ads Manager.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:110 (section 3.1 key findings)`  
> "A newer Meta breakage is still open: an availability notice dated August 6, 2026 affecting the frequency_value, hourly_stats_aggregated_by_audience_time_zone and impression_device breakdowns, requiring opt-in through Ads Manager"

**Search Console quotas: Search Analytics 1,200 QPM per site and per user, 40,000 QPM and 30,000,000 QPD per project, plus undocumented load quotas over 10-minute and 1-day windows that can trigger errors before published limits.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:414`  
> "Search Analytics 1,200 QPM per site and per user, 40,000 QPM and 30,000,000 QPD per project; plus undocumented load quotas over 10-minute and 1-day windows that can trigger errors before published limits"

**Secondary-source quotas that constrain optional connectors: PostHog query endpoint 2,400/hour, analytics 240/minute and 1,200/hour applied to the entire organisation; Mixpanel Query API 5 concurrent and 60 queries/hour, Raw Data Export 100 concurrent, 60/hour, 3/second; LinkedIn three-legged auth only with no service tokens and ±3 noise per day on demographic pivots with a minimum-3 threshold; Apple Ads JWT client secret ES256 with max 180-day expiry and one-hour access tokens; Microsoft Advertising none documented as binding.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:420, 418, 419, 407`  
> "PostHog query endpoint 2,400/hour, analytics 240/minute and 1,200/hour, applied to the entire organisation; Mixpanel Query API 5 concurrent and 60 queries/hour, Raw Data Export 100 concurrent, 60/hour, 3/second" | "Three-legged auth only, no service tokens; ±3 noise per day on demographic pivots with a minimum-3 threshold" | "JWT client secret ES256 with max 180-day expiry, one-hour access tokens; access is revoked if a user's role changes"

**The upsert key for the materialised store, verbatim.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:710 (section 7)`  
> "the backfill scheduler must be built around restatement windows rather than new data, upserting on (source, account_id, entity_id, date, attribution_window)."

**The metric dictionary basis is Fivetran dbt_ad_reporting, Apache 2.0, covering 11 named ad platforms at eight grains, standardising country names to ISO-3166, not handling currency, and explicitly flagging timezone differences as unsolved.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:700, 104`  
> "Fivetran's `dbt_ad_reporting` (Apache 2.0) already unions 11 ad platforms (Amazon, Apple Search Ads, Facebook, Google, LinkedIn, Microsoft, Pinterest, Reddit, Snapchat, TikTok, Twitter) into account, campaign, ad group, ad, keyword, search and URL reports with standardised spend, clicks, impressions, conversions and conversions_value" and "covers exactly 11 ad platforms at account, campaign, ad group, ad, keyword, search query, URL and monthly geo grain, standardizes country names to ISO-3166, does not handle currency, and explicitly flags timezone differences across ad platforms as unsolved"

**The gap dbt_ad_reporting does not fill, and the strongest strategic finding in the research, is that no public schema models attribution window as a dimension: conversions collapse to a single column there while Meta returns 1d/7d/28d click and view plus dda and incrementality on the same row.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:700`  
> "no public schema, including `dbt_ad_reporting`, models attribution window as a dimension: the fact-checker confirmed that conversions collapse to a single column there, while Meta returns 1d/7d/28d click and view plus dda and incrementality on the same row. That gap is the strongest strategic finding in the research and it survived adversarial checking."

**The metric name conflicts: sections 2, 7 and the section 7 prose all use conversions_value (plural), while section 13.3's dictionary rule uses conversion_value (singular) and adds revenue, which appears in no envelope.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:54, 749, 700 vs 1415`  
> §2/§7: "conversions_value": 14350.2 / 5210.00; §7 prose: "standardised spend, clicks, impressions, conversions and conversions_value"  vs  §13.3: "Metric names come from the shared dictionary (`spend`, `impressions`, `clicks`, `conversions`, `conversion_value`, `revenue`); a new metric requires a dictionary PR first."

**The honest ceiling on cross-connector fields, with the exact census: 34,687 exposed fields across 251 connectors, of which about twenty are genuinely cross-connector.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:700`  
> "Windsor.ai's catalogue shows the honest ceiling: 34,687 exposed fields across 251 connectors, of which only about twenty are genuinely cross-connector (source at 251 connectors, date at 162, account_id at 149, campaign at 55, clicks at 55, impressions at 51, spend at 32, conversions at 23, currency at 22, ad_id at 20, creative_id at 19, device at 14)."

**Section 4.3's credit table, verbatim, in full.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:531-541 (section 4.3)`  
> Standard read | one platform call | 1 || Cross-module join | N platform calls, cached | 3 to 5 || `diagnose.metric` | 20 to 40 reads plus two LLM passes | 20 to 40 || `watch.*` per check | reads plus verifier | 2 to 5 || `reconcile.conversions` | 4 to 6 reads plus matching | 5 to 10 || AI-answer visibility run (one prompt, one engine, one run) | one grounded LLM call, cost passed through | 10 || AI-visibility snapshot (one prompt, 4 engines) | four grounded calls | 40 || Write (`contact.upsert`, `audience.sync`) | one destination call, batched | 1 per 100 contacts or 1,000 audience members

**Section 8's per-endpoint credit table, verbatim credit costs.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:853-863 (section 8)`  
> `/v1/performance` read: 1 cr per 1,000 rows, +1 cr per additional 1,000; scheduled pulls and backfills at the same rate || `/v1/visibility` SERP with feature detection: 2 cr ($0.01), COGS $0.002 DataForSEO live mode, 80% margin || Search Console, Google Trends: 1 cr each ($0.005) || Question mining (YouTube, Reddit, Quora): 2 cr ($0.01) || AI-answer monitoring, per prompt x model: 2 cr orchestration fee plus measured LLM cost passed through at cost || `/v1/market` product page, reviews page: 2 cr each ($0.01) || `/v1/market` app-store rank, change-detection check: 1 cr each ($0.005) || LLM sentiment or topic tagging on a fetched page: +3 cr ($0.015) || `/v1/audience` contact.upsert, event.track: 1 cr per 100 records ($0.00005/record) || `/v1/audience` audience.sync, suppression push: 1 cr per 1,000 members ($0.000005/member) || Cross-module composite join: Sum of leg costs plus 1 to 2 cr join premium (3 to 5 cr headline)

**Section 11.3 overrides the section 8 /v1/performance credit row: performance is metered per connected account per month with restatement re-pulls included; credits meter everything else.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1212 (section 11.3)`  
> "**Decision.** Two units, not one. Performance is metered per connected account per month, with restatement re-pulls included, because that is where the cost actually accrues and how agencies budget. Credits meter everything else: SERP, AI answers, composite calls (`diagnose`, `reconcile`, `watch` checks) and any future writes. The pricing page shows both, and the calculator takes accounts plus questions plus watches as inputs."

**Section 11.8 overrides section 4.3's flat 10-credit and 40-credit AI-answer prices: 2-credit orchestration fee plus measured LLM cost at a published per-model rate, batched cheap model by default, customer-chosen n_runs, confidence intervals never a single rank.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1238 (section 11.8)`  
> "**Decision.** No flat credit price for AI-answer monitoring. Charge a 2-credit orchestration fee plus the measured LLM cost passed through at a published per-model rate, default to a batched, cached, inexpensive model for the daily run, and let the customer choose `n_runs` with the cost shown before execution through `plan.explain`. Report confidence intervals, never a single rank."

**Credit metering has three hard behavioural rules that bind the API contract: never bill a failed call, return the credit cost in every API response header and MCP tool result, and publish one flat multiplier table per endpoint plus a per-model AI pass-through rate card.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:894, 895 (section 8, Retention design)`  
> "Never bill a failed call. Bright Data's 'pay only for success' is the standard" | "Publish one flat multiplier table per endpoint, return the credit cost in every API response header and MCP tool result, and publish the AI-monitoring pass-through rate card per model."

**The MCP protocol revision is fixed at 2026-07-28 and repeated in the MVP plan; the checker confirmed it verbatim as current.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:766, 924`  
> "Build against protocol revision 2026-07-28, which the checker confirmed verbatim as current." and §9 week 5-6: "MCP server against protocol revision 2026-07-28, generated with Stainless from a spec of at most 25 endpoints."

**MCP 2026-07-28 removes protocol-level sessions, the GET stream endpoint and Last-Event-ID resumption; makes server/discover a mandatory RPC returning supported versions, capabilities and identity in one call; and requires io.modelcontextprotocol/protocolVersion in _meta on every request plus three headers, with a mismatch returning HTTP 400 and JSON-RPC error -32020 HeaderMismatch.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:766`  
> "Protocol-level sessions are gone ('MCP has no protocol-level session'), the GET stream endpoint and Last-Event-ID resumption are removed, `server/discover` is a mandatory RPC returning supported versions, capabilities and identity in one call, and every request carries `io.modelcontextprotocol/protocolVersion` in `_meta` plus MCP-Protocol-Version, Mcp-Method and Mcp-Name headers (mismatch returns 400 with JSON-RPC error -32020 HeaderMismatch)."

**The MCP migration is a compatibility shim, not a rewrite: multiple protocol versions MAY be supported simultaneously, a documented backward-compatibility path exists for 2025-11-25 and earlier, and deprecated features stay for at least twelve months.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:767`  
> "Clients and servers 'MAY support multiple protocol versions simultaneously', there is a documented backward-compatibility path for 2025-11-25 and earlier, and deprecated features stay for at least twelve months. Budget a compatibility shim, not a rebuild."

**structuredContent must conform to a declared outputSchema (any JSON value, arrays included) AND the same JSON must also be serialised into a TextContent block for backwards compatibility.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:768`  
> "Return `structuredContent` conforming to a declared `outputSchema` (any JSON value, arrays included), and also serialise JSON into a TextContent block for backwards compatibility."

**Large result sets must be returned as resource_link URIs, not inlined; the first N rows come back inline as the envelope.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:769`  
> "Hand back `resource_link` URIs for large result sets rather than inlining a 50,000-row table into the model's context; return the first N rows inline as the envelope above."

**Because there are no protocol sessions, any multi-step flow must return an explicit opaque handle with a stated TTL in the tool description.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:770`  
> "Because there are no protocol sessions, any multi-step flow (build a query, then paginate it) must return an explicit opaque handle with a stated TTL in the tool description."

**x-mcp-header must be applied to a tenant or region parameter so the edge can rate-limit and route without parsing bodies, and the spec's warning not to mark sensitive parameters must be heeded.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:771`  
> "Use `x-mcp-header` on a tenant or region parameter so the edge can rate-limit and route without parsing bodies, and heed the spec's explicit warning not to mark sensitive parameters."

**The single MUST NOT in the MCP section: never forward the caller's token upstream. This mandates a per-tenant OAuth vault plus RFC 9728 metadata, RFC 8707 resource indicators and mandatory PKCE.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:772`  
> "Never forward the caller's token upstream: the auth spec states the MCP server 'MUST NOT pass through the token it received from the MCP client', which mandates a per-tenant OAuth vault, plus RFC 9728 metadata, RFC 8707 resource indicators and mandatory PKCE."

**The MCP Registry namespace should be claimed early via DNS or HTTP challenge but treated as preview distribution, not a moat; the registry warns of breaking changes or data resets and its API has been frozen at v0.1 since October 2025.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:773`  
> "claim the MCP Registry namespace early via DNS or HTTP challenge while treating the registry as preview distribution ('breaking changes or data resets may occur', API frozen at v0.1 since October 2025), not a moat. Note the checker's finding that Windsor.ai already ships 'Windsor MCP for AI analysis' on every plan including Free, so this channel is already occupied."

**The whitespace the MCP tool contract must occupy: no surveyed MCP server returns per-source freshness and completeness metadata with the numbers, which is the single most common way an agentic answer goes wrong.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:614 (section 5.1)`  
> "**Freshness and completeness semantics in the tool contract.** No surveyed MCP returns per-source `as_of` / backfill-window / partial-day / attribution-restatement metadata with the numbers. Agents therefore silently compare a fully-attributed week against a partially-reported one — the single most common way an agentic answer goes wrong, and nobody's schema prevents it."

**FX source is ECB euro reference rates cached daily, with Open Exchange Rates as the paid fallback; the ECB coverage figure was corrected downward from 42 to 32 currency pairs, widening the fallback gap by about ten currencies.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:721, 785`  
> "| FX | ECB euro reference rates, cached daily | Free, authoritative, auditable provenance for the envelope | Free | Public data | Open Exchange Rates Developer $12/mo (10,000 req); currencyapi.com Small $9.99/mo (15,000 req) |" and "ECB coverage is 32 currency pairs, not 42 (refuted). The gap a paid fallback must cover is about ten currencies wider than assumed, which strengthens the case for Open Exchange Rates."

**The reason fx_source and fx_rate_date must ride on the row is that ECB disclaims transactional use, so the customer must be able to audit the converted number.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:762`  
> "`fx_source` and `fx_rate_date` exist because ECB itself says the rates are 'published for information purposes only' and that 'using the rates for transaction purposes is strongly discouraged', so customers must be able to audit the number."

**Both envelope examples show fx_rate_date lagging fetched_at by two days (2026-09-05 against a 2026-09-07 fetch), and 2026-09-05 is a Saturday, on which ECB publishes no rate. The carry-forward rule for weekends and ECB holidays is therefore unspecified and the examples do not demonstrate a valid one.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:55-60, 752-757`  
> §2: "fetched_at": "2026-09-07T06:00:00Z", "fx_rate_date": "2026-09-05"; §7: "fetched_at": "2026-09-07T02:14:33Z", "fx_rate_date": "2026-09-05". 2026-09-07 is a Monday, 2026-09-05 a Saturday, 2026-09-04 the preceding Friday.

**Currency must be normalised to the account's reporting currency at fetch time, not at read time.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:71, 1419`  
> §2: "**Currency is normalised at fetch time** with the rate source and date recorded on the row." §13.3: "Currency is normalised to the account's reporting currency at fetch time with the rate and source recorded on the row."

**The API must refuse to emit an unlabelled conversion count; attribution_window is a required dimension, not a setting. This is restated in three places and in the kickoff prompt, so it is the most heavily reinforced rule in the contract.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:69, 762, 557`  
> §2: "**Attribution window is a dimension, not a setting.** The API refuses to emit an unlabelled conversion count." §7: "`attribution_window` is required on every conversion metric and the API should refuse to emit an unlabelled conversion count." §4.4: "Required dimension; the API refuses an unlabelled conversion count".

**as_of is a request-level bitemporal parameter, not a row field, and it is what makes the restatement diff a one-call operation.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:67`  
> "**Bitemporal by default.** `as_of` lets a caller ask for the data as the platform reported it on any earlier date, which is how 'why did last month's report change' becomes a one-call diff. No surveyed incumbent exposes restatements; they overwrite silently."

**A restatement webhook with before and after values is a named contract deliverable, and is scheduled for weeks 7-8 alongside watch.create.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:527, 925`  
> §4.2: "**Restatement webhooks.** When Meta restates a 28-day window or Google Ads credits a late conversion back to its click date, the row changes. A `restated` webhook with the before and after values is the alert every analyst wants and no incumbent sends." §9 week 7-8: "`watch.create` with the verifier pass and webhooks, including restatement webhooks."

**native_entity_type and native_id exist specifically to carry the Meta adset versus Google ad_group mismatch honestly, so entity_type is the canonical grain and native_entity_type is the platform's own word for it.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:762`  
> "`native_entity_type` and `native_id` carry the adset-versus-ad_group mismatch honestly instead of hiding it."

**The composite tools that survive section 11.9 and their exact names: diagnose.metric, watch.create, reconcile.conversions, plan.explain. market.playbook dies with the market module.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:495, 512, 513, 518, 515`  
> "One call, `diagnose.metric`, takes a metric, an entity and a window" | "`watch.create` on any entity" | "`reconcile.conversions` lines up Meta, Google, TikTok, GA4 and the order source" | "the MCP server exposes `plan.explain`" | "`market.playbook` combines ad-library creatives..."

**The visibility endpoint contract must return n_runs, mention rate with a confidence interval and share of consideration set, never a single rank, plus a published API-versus-UI divergence metric.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:523, 524`  
> "**Confidence, not a rank.** ... Every AI-visibility result therefore reports `n_runs`, mention rate with a confidence interval and share of consideration set, instead of a single 'rank in AI' number that 248 GEO tools report today." and "**Dual-mode collection with a published divergence metric.**"

**The design artboard still advertises /v1/market and /v1/audience as shipped module cards, contradicting section 11.4 and 11.5, and section 14 already flags the market card for removal.**  
`certain` · source: `design/marketplane/Main.dc.html; docs/MARKETING-DATA-PLANE.md:1478`  
> Artboard module footnotes: "/v1/performance", "/v1/audience", "/v1/market", "/v1/visibility" under "Four views. One set of numbers." §14: "If section 3.4's recommendation to drop the market module is accepted, the 'Your competitors' card and the competitor logos group come out."

**The artboard prices diagnose at about twelve credits, contradicting section 4.3's 20 to 40, and prices credit packs in euros where section 8 prices them in dollars, omitting the Volume and Committed tiers entirely.**  
`certain` · source: `design/marketplane/Main.dc.html:357-361 vs docs/MARKETING-DATA-PLANE.md:536, 842-847`  
> Artboard: "A quick look is one credit. A full \"why did this happen\" is about twelve." and plans: Free €0 / 1,000 to start, 200 more every month; Starter €19 / 4,000; Growth €79 / 20,000; Scale €299 / 100,000. §4.3: "`diagnose.metric` | 20 to 40 reads plus two LLM passes | 20 to 40". §8: Free $0 (1,000 one-time plus 200/mo), Starter $19/4,000, Growth $79/20,000, Scale $299/100,000, Volume $999/400,000, Committed from $299/mo.

**Section 14 marks the artboard's credit prices as draft, so the artboard is not a pricing authority.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1478`  
> "**Copy that must change before launch.** Credit pack prices are marked `[DRAFT]` and the SOC 2 line is marked `[planned]`."

### Exact values (42)

- Envelope field names, section 2 (wrapper): ok, module, source, entity, entity.type, entity.id, entity.native_entity_type, entity.native_id, dimensions, dimensions.date, dimensions.currency, dimensions.attribution_window, metrics, fetched_at, source_updated_at, restates_until, is_provisional, fx_source, fx_rate_date, meta, meta.credits_used, meta.schema, meta.request_id
- Envelope field names, section 7 (row): source, native_entity_type, native_id, entity_type, date, attribution_window, metrics, currency, fetched_at, source_updated_at, restates_until, is_provisional, fx_source, fx_rate_date, raw
- Envelope field names, section 13.3 (connector contract, conflicting): source, entity, metrics, dimensions, fetched_at, freshness, freshness.window_days, freshness.last_restated_at, freshness.is_final, raw
- Envelope field names, artboard (conflicting): ok, source, data[], data[].entity, data[].spend, data[].conversions, data[].revised_from, data[].attribution_window, meta.credits_used, meta.as_of, meta.is_provisional, meta.restates_until
- Metric names (sections 2, 7): spend, impressions, clicks, conversions, conversions_value
- Metric names (section 13.3 dictionary): spend, impressions, clicks, conversions, conversion_value, revenue
- Section 2 example literals: ok=true, module="performance", source="google_ads", entity.type="ad_group", dimensions.date="2026-09-01", currency="EUR", attribution_window="7d_click", spend=4210.55, impressions=812000, clicks=18422, conversions=611, conversions_value=14350.2, fetched_at="2026-09-07T06:00:00Z", source_updated_at="2026-09-07T05:45:00Z", restates_until="2026-10-05", is_provisional=true, fx_source="ecb_reference_rates", fx_rate_date="2026-09-05", credits_used=1, schema="v1", request_id="req_…"
- Section 7 example literals: source="meta_ads", native_entity_type="adset", native_id="23851234567890123", entity_type="ad_group", date="2026-08-14", attribution_window="7d_click", spend=1240.55, impressions=88214, clicks=3106, conversions=41, conversions_value=5210.00, currency="EUR", fetched_at="2026-09-07T02:14:33Z", source_updated_at="2026-09-07T01:45:00Z", restates_until="2026-09-11T00:00:00Z", is_provisional=true, fx_source="ecb_reference_rates", fx_rate_date="2026-09-05"
- Upsert key (verbatim, section 7 line 710): (source, account_id, entity_id, date, attribution_window)
- Namespaces: /v1/performance/*, /v1/audience/*, /v1/market/*, /v1/visibility/*, /v1/diagnose, /v1/watch/*, /v1/reconcile/*
- Concrete endpoint path published (artboard only): GET https://api.marketplane.dev/v1/performance/campaigns?source=google_ads&window=28d&group_by=campaign, auth header "Authorization: Bearer mp_live_…"
- Tool names: diagnose.metric, watch.create, reconcile.conversions, plan.explain, market.playbook (dropped), contact.upsert, event.track, audience.sync
- Meta attribution windows (exact list): 1d_click, 7d_click, 28d_click, 1d_view, 7d_view, 28d_view, 1d_ev, dda, incrementality, inline, custom; plus `value` = "Metric value of default attribution window", default never named
- Restatement formulas: Meta restates_until = fetched_at + 28d; Google Ads restates_until = fetched_at + account conversion window; GA4 restates_until = fetched_at + 12d
- Meta clocks: insights refresh every 15 minutes; metrics may continue to update for a couple of days after an ad has completed; "do not change after 28 days of being reported"
- Google Ads windows: click-through maximum 90 days, default 30; view-through maximum 30 days, default 1; engaged-view maximum 30 days, default 3 days
- GA4 clocks: realtime typically a few minutes; intraday 2 to 6 hours; daily 12 hours to 24+ hours; GA4 360 intraday about 1 hour; data processing 24-48 hours; attribution credit can change for up to 12 days
- Backfill tiers: daily D-0 to D-3; weekly to D-28 (Meta); to the conversion window (Google Ads); to D-12 (GA4); section 13.3 conflicting value: GA4 72h
- GA4 core token quotas, standard property: 200,000 per property per day; 40,000 per property per hour (shared with the customer's other tools); 14,000 per project per property per hour; 10 concurrent requests
- GA4 core token quotas, 360 property: 2,000,000 per day; 400,000 per hour; 140,000 per project per property per hour; 50 concurrent requests
- Google Ads access rungs (all per developer token): Test (test accounts only); Explorer 2,880 operations/day against production accounts, since 2025-10-28, blocks account creation, user management, keyword planning and billing; Basic 15,000 operations/day, typically approved within 5 business days; Standard unlimited, typically 10 business days, requires Required Minimum Functionality compliance. Rejected requests returning a GoogleAdsFailure still count.
- Meta rate limits: Development tier max score 60 with 300s decay and 300s block; 9,000 score at Full Access; Ads Insights hourly quota per ad account = 600 (Dev) + 400 * active ads - 0.001 * user errors; 190,000 at Full Access; async breakdown jobs cap at 10 per ad account per day; limits scored per application as well as per ad account
- Meta Full Access qualification: 500+ Marketing API calls in the past 15 days, error rate under 15% on a rolling last-500-call window, effective 2026-05-04, screen recording removed; tiers renamed 4 May 2026 to Marketing API Access Tier with Limited and Full Access
- x-fb-ads-insights-throttle: third field is ads_api_access_tier (the other two field names are never printed in the spec)
- Meta breakdowns opt-in notice 2026-08-06 affects: frequency_value, hourly_stats_aggregated_by_audience_time_zone, impression_device
- Search Console limits: Search Analytics 1,200 QPM per site and per user; 40,000 QPM and 30,000,000 QPD per project; undocumented load quotas over 10-minute and 1-day windows
- PostHog: query endpoint 2,400/hour; analytics 240/minute and 1,200/hour, applied to the entire organisation. Mixpanel: Query API 5 concurrent, 60 queries/hour; Raw Data Export 100 concurrent, 60/hour, 3/second
- Apple Ads: JWT client secret ES256, max 180-day expiry, one-hour access tokens. LinkedIn: three-legged auth only, no service tokens, ±3 noise per day on demographic pivots with a minimum-3 threshold. Microsoft Advertising sandbox developer token: BBD37VB98
- Stainless Free tier: $0 at 25 endpoints or fewer, 5 generators (TypeScript SDK, Python SDK, docs, MCP server), 5 seats, 100 preview builds/month; 30-day trial above free; free Starter for qualifying open-source projects
- MCP protocol revision: 2026-07-28
- MCP headers: MCP-Protocol-Version, Mcp-Method, Mcp-Name; _meta key io.modelcontextprotocol/protocolVersion; mismatch = HTTP 400 with JSON-RPC error -32020 HeaderMismatch
- MCP RPC and fields: server/discover (mandatory RPC), structuredContent, outputSchema, TextContent, resource_link, x-mcp-header; backward-compat target revision 2025-11-25 and earlier; 12-month deprecation floor
- MCP auth: MUST NOT pass through the token received from the MCP client; RFC 9728 metadata; RFC 8707 resource indicators; mandatory PKCE; per-tenant OAuth vault
- FX: fx_source="ecb_reference_rates"; ECB coverage 32 currency pairs (not 42); Open Exchange Rates Developer $12/mo (10,000 req); currencyapi.com Small $9.99/mo (15,000 req)
- Section 4.3 credits: standard read 1; cross-module join 3 to 5; diagnose.metric 20 to 40; watch.* per check 2 to 5; reconcile.conversions 5 to 10; AI-answer run (1 prompt, 1 engine, 1 run) 10; AI-visibility snapshot (1 prompt, 4 engines) 40; write 1 per 100 contacts or 1 per 1,000 audience members
- Section 8 per-endpoint credits: /v1/performance read 1 cr per 1,000 rows +1 cr per additional 1,000 (COGS ~$0.0001/call, ~98% margin); /v1/visibility SERP with feature detection 2 cr = $0.01 (COGS $0.002 DataForSEO live, 80% margin); Search Console and Google Trends 1 cr each = $0.005; question mining (YouTube, Reddit, Quora) 2 cr = $0.01 (68-94% margin); AI-answer monitoring per prompt x model 2 cr orchestration + LLM cost at cost; /v1/market product page and reviews page 2 cr each = $0.01; /v1/market app-store rank and change-detection check 1 cr each = $0.005; LLM sentiment or topic tagging +3 cr = $0.015; /v1/audience contact.upsert and event.track 1 cr per 100 records = $0.00005/record; /v1/audience audience.sync and suppression push 1 cr per 1,000 members = $0.000005/member; cross-module composite join = sum of leg costs + 1 to 2 cr join premium, 3 to 5 cr headline
- Section 8 credit packs: Free 1,000 one-time plus 200/mo recurring, $0; Starter 4,000 = $19 ($0.00475/cr); Growth 20,000 = $79 ($0.00395/cr); Scale 100,000 = $299 ($0.00299/cr); Volume 400,000 = $999 ($0.0025/cr); Committed custom from $299/mo committed down to $0.002/cr. Base unit $0.005 at entry. $5 auto-recharge, hard monthly budget cap, credits never expire, no minimum deposit.
- Artboard packs (EUR, marked [DRAFT] in section 14): Free €0 / 1,000 to start plus 200 every month; Starter €19 / 4,000; Growth €79 / 20,000; Scale €299 / 100,000. Artboard diagnose price: "about twelve" credits.
- AI-answer COGS anchors: batched Haiku 4.5 ~$0.003; Sonar Pro $0.024 to $0.032 at 1k in / 1k out; Opus 5 $0.030; Otterly $0.010 to $0.016 per model-prompt-run; Profound $0.044 to $0.066; Ahrefs checks $10 per 1,000 (Scale) to $20 per 1,000 (Basic)
- SERP COGS: DataForSEO $0.0006 standard (~5 min), $0.0012 priority (~1 min), $0.002 live (~6 s), per SERP of 10 results, $50 minimum deposit; SerpApi $0.00917 to $0.025; Browserbase Search $0.007 (11.7x DataForSEO); Brave Search $5 per 1,000
- Windsor.ai cross-connector field census: 34,687 fields across 251 connectors; source 251, date 162, account_id 149, campaign 55, clicks 55, impressions 51, spend 32, conversions 23, currency 22, ad_id 20, creative_id 19, device 14
- dbt_ad_reporting: Apache 2.0; 11 platforms (Amazon, Apple Search Ads, Facebook, Google, LinkedIn, Microsoft, Pinterest, Reddit, Snapchat, TikTok, Twitter); grains account, campaign, ad group, ad, keyword, search query, URL, monthly geo; ISO-3166 country names; no currency; timezone unsolved; conversions collapse to a single column

### Conflicts raised (17)

- ENVELOPE SHAPE, section 2 vs section 7. Section 2 nests entity{type,id,native_entity_type,native_id} and dimensions{date,currency,attribution_window} and adds ok, module and meta{credits_used,schema,request_id}; section 7 flattens entity_type, native_entity_type, native_id, date, attribution_window and currency to the top level, drops ok/module/meta and the canonical entity id, and adds raw. WHICH WINS: neither alone. Section 2 line 44 defers to section 7 for the field specification, and the kickoff prompt requires 'the envelope in section 2 and section 7'. Reconcile as: section 7 is authoritative for the ROW object; section 2 is authoritative for the RESPONSE WRAPPER around one or more rows. Keep section 2's nested entity{} and dimensions{} grouping (it is the only shape that carries a canonical entity.id, which the upsert key requires) and keep section 7's raw passthrough on the row.
- restates_until TYPE, section 2 (bare date '2026-10-05') vs section 7 (RFC3339 '2026-09-11T00:00:00Z'). WHICH WINS: section 7's RFC3339 timestamp. The clocks-table formulas are arithmetic on fetched_at, a timestamp, and a bare date cannot express 'until 06:00 UTC on the 5th' for a source that restates continuously. Serialise as RFC3339 UTC.
- restates_until SEMANTICS, section 2 example vs section 7 example vs the section 7 clocks table. The table says fetched_at + Nd. Section 7's example computes from the row date (2026-08-14 + 28d = 2026-09-11). Section 2's example computes from fetched_at (2026-09-07 + 28d = 2026-10-05) but applies Meta's 28-day formula to a google_ads row, which the table says should be fetched_at + account conversion window (default 30d click = 2026-10-07). WHICH WINS: none of the three as written. The table formula is defective because fetched_at is mutable under nightly restatement re-pulls, so restates_until would slide forward on every pull and is_provisional would never clear. Anchor to an immutable per-row value instead: restates_until = max(date, first_seen_at) + window, defaulting to the first_seen_at anchor because section 7 reads Meta's 'of being reported' as favouring first report. Flag as building on an explicitly open question.
- is_provisional vs is_final. Sections 2, 7, 4.4, 15 and the kickoff non-negotiables use is_provisional; sections 4.2, 13.3 and 13.4 use is_final. WHICH WINS: is_provisional. It appears in both envelope printings and in the binding kickoff list. Emit is_provisional only; is_final is its complement and must not also appear on the row.
- FRESHNESS REPRESENTATION, section 13.3 vs section 7. Section 13.3 requires a nested freshness{window_days, last_restated_at, is_final}; section 7 line 762 explicitly refutes it: 'A single freshness timestamp cannot express three clocks, which is why the field set splits into fetched_at, source_updated_at, restates_until and is_provisional.' WHICH WINS: section 7. Section 13.3's contract must be updated to the four-field split before any connector is merged, otherwise the connector contract test will reject the envelope the API is required to emit.
- METRIC NAME, conversions_value vs conversion_value. Sections 2, 7 and the section 7 dbt_ad_reporting prose all use conversions_value; section 13.3's dictionary rule uses conversion_value and adds revenue. WHICH WINS: conversions_value. Two envelope printings plus the description of the upstream Fivetran package outweigh one prose list. Treat conversion_value as a typo. Keep revenue as a separate dictionary entry meaning order-source revenue (Shopify, Stripe, affiliate), never as an alias for conversions_value.
- GA4 RESTATEMENT WINDOW, 12 days vs 72 hours. Section 7's table and section 9's backfill tier say 12 days (restates_until = fetched_at + 12d, backfill to D-12); section 13.3 rule 4 says 'GA4 72h'. WHICH WINS: 12 days. It is sourced to Google's own statement that attribution credit 'can change for up to 12 days' and is repeated in the MVP plan; 72h conflates the 24-48h processing latency with the attribution-restatement window.
- SEARCH CONSOLE AND GOOGLE TRENDS AS BILLABLE ENDPOINTS, section 8 vs section 9. Section 8's credit table prices them at 1 credit each; section 9 says 'Both stay as free joins inside diagnose, not as billable endpoints.' WHICH WINS: section 9. It is later, more specific, and reasons from the fact that the GSC API is free of charge (section 3.3) so a markup is indefensible, and the Trends API is still allow-listed alpha. Do not publish billable /v1/visibility/search-console or /v1/visibility/trends endpoints.
- PERFORMANCE PRICING UNIT, section 8 vs section 11.3. Section 8 prices /v1/performance at 1 credit per 1,000 rows; section 11.3 decides performance is metered per connected account per month with restatement re-pulls included, and credits meter only SERP, AI answers, composites and future writes. WHICH WINS: section 11.3, by the stated override rule. The section 8 /v1/performance row is dead. The API must still return meta.credits_used, but for performance reads it should report 0 credits and instead surface the connected-account meter.
- AI-ANSWER PRICING, section 4.3 vs section 11.8. Section 4.3 prices an AI-answer run at a flat 10 credits and a 4-engine snapshot at 40; section 11.8 decides there is no flat credit price at all: 2-credit orchestration fee plus measured LLM cost at a published per-model rate. WHICH WINS: section 11.8, which section 8's table already implements. Section 4.3's 10/40 rows are dead. Section 10.2 independently confirms the 10-credit line sits at or below honest collection cost.
- MARKET MODULE, section 2 and section 8 vs section 11.5. Section 2 reserves /v1/market/* and section 8 prices four market endpoints; section 11.5 decides 'Drop. Remove the market rows from the public pricing table.' WHICH WINS: section 11.5. /v1/market ships as neither an endpoint nor a price. The competitor entity survives in the graph only as diagnose enrichment. The design artboard still shows a /v1/market module card and must lose it; section 14 already anticipates this.
- AUDIENCE WRITES, section 8 vs section 11.4. Section 8 publishes a per-record write credit table; section 11.4 decides it 'stands only as a placeholder' and that writes ship per connected destination, suppression first. WHICH WINS: section 11.4. No /v1/audience endpoints in v1, no write credit rows on the pricing page. Section 10.2 calls 1 credit per contact.upsert 'a pricing bug'. The artboard still shows a /v1/audience module card and a 'Customer lists' promise, which must be cut or clearly marked as coming later.
- ARTBOARD RESPONSE SHAPE vs both spec envelopes. The artboard wraps rows in data[], moves as_of, is_provisional and restates_until into meta, drops module, source_updated_at, fx_source, fx_rate_date and raw, and introduces revised_from, which appears nowhere in the spec. WHICH WINS: the spec. The artboard is a marketing mock and section 14 marks its numbers as draft. But two artboard ideas are worth adopting deliberately: a data[] array wrapper (the spec's single-row envelope has no defined multi-row form, which every real read needs) and revised_from (the natural payload of the restatement webhook the spec requires). Adopt data[] as the wrapper. Put revised_from in the restatement webhook, not on the read row.
- ARTBOARD CREDIT VALUES vs section 8. Artboard: euros, four packs (Free/Starter/Growth/Scale), diagnose 'about twelve' credits. Section 8: dollars, six packs including Volume $999/400,000 and Committed from $299/mo, diagnose 20 to 40 credits (section 4.3). WHICH WINS: section 8 and section 4.3. Section 14 marks artboard prices [DRAFT]. The currency mismatch is a live decision: the product converts to EUR in both envelope examples and hosts in Frankfurt per the artboard security strip, so a EUR price list is defensible, but it must be decided once, not diverge.
- UPSERT KEY vs ENVELOPE. The key is (source, account_id, entity_id, date, attribution_window) but account_id appears in no printed envelope and entity_id (as entity.id) appears only in section 2's shape. WHICH WINS: the upsert key. It is the only statement about the store's primary key and it is unambiguous. Both fields must be added to the published envelope, otherwise callers cannot reproduce a row's identity and the as_of diff cannot be aligned client-side.
- TIMEZONE. Sections 3.1 and 4.4 promise timezone normalisation as a specified guarantee co-equal with currency, and dbt_ad_reporting flags timezone as explicitly unsolved, but no timezone field exists in any envelope. WHICH WINS: the promise. Add a timezone dimension (IANA name) or the guarantee is unshippable and the head-to-head claim against Supermetrics and Windsor in section 4.4 is false advertising.
- FX RATE ON THE ROW. Section 13.3 requires 'the rate and source recorded on the row'; sections 2 and 7 record only fx_source and fx_rate_date, not the numeric rate. WHICH WINS: section 13.3, backed by section 7's own auditability rationale ('customers must be able to audit the number'). A source and a date are not enough to reproduce a conversion when ECB publishes on business days only and the carry-forward rule is unspecified. Add fx_rate (numeric) and fx_base (the currency converted from).

### Open or unverified (16)

- Meta's 28-day clock start point is unresolved in the docs, per both researcher and checker: 'Does Meta's 28-day clock start at delivery or at first report? Both researcher and checker read "of being reported" as favouring first report, which would extend the tail well past 28 days from delivery for late-connecting accounts. Diff a historical pull against a re-pull thirty days later.' The restates_until formula for meta_ads is built directly on this, so every row the API emits carries an unverified assumption. Must be flagged in the PR and measured empirically.
- Google Ads has no authoritative freshness or conversion-finalisation statement: 'No published freshness or finalisation statement equivalent to Meta's was found across three attempts.' 'Without one, the 90-day window is an upper bound rather than a documented SLA, and 90-day nightly re-pulls may be over-engineered. Measure empirically on a live account first.' The google_ads restates_until value is therefore a guess dressed as a contract.
- GA4's own restatement statement is explicitly not an SLA: 'Google states "This is not a guarantee, nor an SLA or an SLO".' The 12-day figure cannot be sold as a guarantee.
- Meta's Ads Insights quota formula (600 + 400 * active ads - 0.001 * user errors) and the 190,000 Full Access figure are flagged upstream: section 3.2 correction 5 says 'The researcher's 5,000+40x and 190,000+40x rate-limit figures do not appear in the cited source.' Treat the 190,000 number as unverified.
- The x-fb-ads-insights-throttle header's first two field names are never printed in the spec. Only ads_api_access_tier is named. Do not hard-code field names for the other two without reading Meta's docs.
- Whether platform terms permit the product at all is unresolved and is a section 11.11 High risk: 'Do Meta, Google and TikTok platform terms permit reselling normalised performance data through a metered third-party API where the buyer is not the account owner? This needs a real read of Meta Platform Terms and Google Ads API Required Minimum Functionality, which was not done.'
- Whether a headless API can qualify for Google Ads Standard Access at all is unanswered and rated High severity: 'RMF categories are defined by what a tool displays.' Section 11.7 requires a written answer from Google before designing anything that needs Standard. This caps the whole system at 15,000 operations per day per developer token indefinitely.
- Cost of a composite join is unmodelled: 'What does a cross-module join cost to serve? If any leg triggers a live third-party fetch, one call can cost $0.015. Decide whether joins are restricted to pre-materialised data, and expose which happened in the envelope.' This is an explicit instruction to add a field the envelope does not have — a marker saying which legs were served from the materialised store and which were live.
- Stainless pricing above the free tier is unknown: 'What do Stainless Starter/Pro, Speakeasy and Fern actually cost above free? All three withhold prices, so crossing 25 endpoints has an unknown bill.' Crossing 25 is an unbounded cost, not a small one.
- Performance COGS and the ~98% margin are unverified and may collapse: 'What is blended Performance COGS once OAuth refresh, rate-limit backoff, retry storms and delayed-conversion re-reads are counted? The ~98% margin assumption collapses if platform limits force 3x to 5x redundant polling per useful row.' Both the ~$0.0001/call COGS and the ~98% margin in the section 8 table are marked (unverified) in the table itself.
- Audience write COGS and margins in the section 8 table are marked '(unverified)' on every row, and section 11.4 demotes the whole table to a placeholder.
- Search Console's webmasters.readonly sensitive-scope status is unconfirmed: 'the scope is not listed on Google's OAuth scopes page.'
- The DataForSEO LLM Responses total cost is unverified: 'the ~$0.012 figure is triangulated from Perplexity rates and could be off by 2 to 3x in either direction (unverified).'
- Google Trends API GA status and quotas are unknown: 'Is Google's Trends API (alpha, announced July 2025) generally available, and on what quotas and terms?' — one more reason section 9's demotion of Trends to a free join, not an endpoint, should stand.
- The per-tenant OAuth refresh and revocation burden is unmodelled: 'At 500 customers across four platforms that is 2,000 credentials to keep alive, and no vendor documentation covers the operational cost.'
- TikTok and Amazon Ads rate limits are 'Not established' in the access table, so any envelope contract for those sources is unbounded on quota.

### Recommendation

CANONICAL ENVELOPE (TypeScript). Row = section 7, wrapper = section 2, plus the three fields the spec requires but never prints (account_id, entity_id, timezone) and the fx_rate the auditability rationale demands.

```ts
// ---------- scalars ----------
type ISODate = string;      // "2026-08-14"
type Timestamp = string;    // RFC3339 UTC, "2026-09-07T02:14:33Z"
type CurrencyCode = string; // ISO 4217, "EUR"
type IanaTimezone = string; // "Europe/Berlin"

type Source =
  | "google_ads" | "meta_ads" | "ga4" | "search_console"
  | "impact" | "awin" | "cj" | "partnerstack"
  | "dataforseo_serp" | "ai_answers";

type Module = "performance" | "visibility" | "diagnose" | "watch" | "reconcile";

/** Canonical grain: dbt_ad_reporting hierarchy (§7). */
type EntityType =
  | "account" | "campaign" | "ad_group" | "ad"
  | "keyword" | "search_term" | "url" | "geo"
  | "property" | "page" | "query";

/** §7 clocks table. Meta's list verbatim; the two non-Meta sentinels are named
 *  because Google Ads and GA4 do not expose selectable windows on a row. */
type AttributionWindow =
  | "1d_click" | "7d_click" | "28d_click"
  | "1d_view"  | "7d_view"  | "28d_view"
  | "1d_ev" | "dda" | "incrementality" | "inline" | "custom"
  | "account_default"  // Google Ads: per-account / per-conversion-action setting
  | "model";           // GA4: model-level adjustment, not a window
// NOTE: there is deliberately no "unlabelled" member. §2/§7/§4.4: the API
// refuses to emit an unlabelled conversion count.

// ---------- row ----------
interface Entity {
  type: EntityType;              // canonical grain
  id: string;                    // canonical id — half the upsert key
  account_id: string;            // REQUIRED: named in the upsert key, absent from both printed envelopes
  native_entity_type: string;    // "adset" where we say "ad_group" (§7)
  native_id: string;             // platform's own id
  name?: string;
  parent_id?: string;            // entity graph edge (§4.2)
}

interface Dimensions {
  date: ISODate;                              // upsert key
  attribution_window: AttributionWindow;      // upsert key, required
  currency: CurrencyCode;                     // normalised at fetch time
  timezone: IanaTimezone;                     // REQUIRED: promised in §3.1/§4.4, missing from every printed envelope
  [key: string]: string | undefined;          // device, country (ISO-3166), etc.
}

/** dbt_ad_reporting names. `conversions_value` (plural) wins over §13.3's
 *  `conversion_value`. `revenue` is order-source revenue only, never an alias. */
interface Metrics {
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  conversions_value?: number;
  revenue?: number;
  [metric: string]: number | undefined;       // dictionary PR required to add one
}

/** §7: four fields, because Meta, Google Ads and GA4 restate on three clocks.
 *  A single `freshness` timestamp cannot express them (§7 refutes §13.3). */
interface Freshness {
  fetched_at: Timestamp;
  source_updated_at: Timestamp | null;        // null where the platform publishes none
  first_seen_at: Timestamp;                   // ADDED: immutable restatement anchor
  restates_until: Timestamp;                  // RFC3339 (§7 form), NOT §2's bare date
  is_provisional: boolean;                    // = now() < restates_until. Never emit is_final too.
  restatement_window_days: number;            // 28 Meta, account window Google Ads, 12 GA4
}

interface Fx {
  fx_source: "ecb_reference_rates" | "open_exchange_rates" | "none";
  fx_rate_date: ISODate;                      // ECB publishes business days only
  fx_rate: number;                            // ADDED: §13.3 requires the rate on the row
  fx_base: CurrencyCode;                      // ADDED: what we converted from
}

interface Row {
  source: Source;
  entity: Entity;
  dimensions: Dimensions;
  metrics: Metrics;
  freshness: Freshness;                       // grouping only; the four fields are §7's, unchanged
  fx: Fx;
  raw?: unknown;                              // §2/§6: passthrough escape hatch, ships in v1
}

// ---------- wrapper (§2) ----------
interface ResponseMeta {
  schema: "v1";
  request_id: string;                         // "req_…"
  credits_used: number;                       // 0 for performance reads (§11.3 meters per account)
  account_reads?: number;                     // the §11.3 second unit
  as_of: ISODate | null;                      // echo of the bitemporal request param (§2, §4.2)
  served_from: Array<"materialised" | "live">; // §7 open question: expose which legs were live
  next_cursor?: string;                        // opaque handle; MCP requires a stated TTL (§7)
}

interface Envelope<T = Row> {
  ok: true;
  module: Module;
  source: Source | Source[];                  // array for composites
  data: T[];                                  // array wrapper: the artboard is right, §2/§7 print one row only
  meta: ResponseMeta;
}

interface ErrorEnvelope {
  ok: false;
  module: Module;
  error: { code: string; message: string; retry_after_s?: number };
  meta: ResponseMeta;                         // credits_used MUST be 0 — never bill a failed call (§8)
}

/** Restatement webhook. `revised_from` comes from the artboard and is the
 *  natural payload for §4.2's before/after `restated` webhook. */
interface RestatementEvent {
  type: "restated";
  key: { source: Source; account_id: string; entity_id: string; date: ISODate; attribution_window: AttributionWindow };
  before: Metrics;                            // artboard: conversions 611
  after: Metrics;                             // artboard: conversions 655 (revised_from 611)
  detected_at: Timestamp;
}
```

Upsert the materialised store on exactly `(source, account_id, entity_id, date, attribution_window)` — verbatim, section 7 line 710 — with `first_seen_at` written once on insert and never updated, and `restates_until = max(date, first_seen_at) + restatement_window_days`. Do NOT implement the table's literal `fetched_at + Nd`: under nightly restatement re-pulls it slides forward on every pull and no row ever becomes final.

ENDPOINT LIST THAT FITS THE 25 CAP (23 operations, 2 spare). Counted as method+path. The move that makes it fit is collapsing all eight dbt_ad_reporting grains and all sources onto one parametrised report endpoint instead of a path per grain.

Performance and core reads (7)
1.  GET    /v1/performance/report          — grain, source, date range, attribution_window, as_of, group_by, currency, timezone
2.  GET    /v1/performance/accounts        — connected accounts, their reporting currency and timezone
3.  GET    /v1/performance/entities        — entity graph: campaign/adset/ad, native ids, competitor nodes
4.  GET    /v1/performance/restatements    — as_of A vs as_of B diff, the one-call "why did last month change"
5.  GET    /v1/performance/freshness       — per-connection clocks, backfill depth, quota headroom
6.  GET    /v1/sources                     — source and metric dictionary, attribution windows per source
7.  POST   /v1/passthrough/{source}        — raw escape hatch, mandatory in v1 (§2, §6)

Visibility (4)
8.  GET    /v1/visibility/serp             — SERP with feature detection, 2 cr
9.  POST   /v1/visibility/answers          — AI-answer run: prompt x engine x n_runs, 2 cr + LLM pass-through
10. GET    /v1/visibility/answers/{run_id} — n_runs, mention rate, confidence interval, divergence metric
11. GET    /v1/visibility/citations        — query-grain paid-search spend and CTR vs AI-Overview citation status (§11.9's honest wedge)

Composite (4)
12. POST   /v1/diagnose                    — diagnose.metric
13. GET    /v1/diagnose/{id}               — ranked causes, evidence rows, ruled-out, recovery plan
14. POST   /v1/reconcile/conversions       — reconcile.conversions
15. POST   /v1/plan/explain                — plan.explain, MUST return query plan + credit cost before execution

Watch (5)
16. POST   /v1/watch
17. GET    /v1/watch
18. GET    /v1/watch/{id}                  — includes verified-alert history
19. PATCH  /v1/watch/{id}
20. DELETE /v1/watch/{id}

Metering and delivery (3)
21. GET    /v1/usage                       — credits, connected-account meter, per-key spend caps
22. POST   /v1/webhooks                    — register restatement and verified-change endpoints
23. DELETE /v1/webhooks/{id}

Deliberately NOT in the OpenAPI: /v1/market/* (dropped, §11.5); /v1/audience/* (deferred, §11.4); billable Search Console and Google Trends endpoints (free joins inside diagnose only, §9); Bing SERP (§9); cross-customer benchmarks (§4.2, §3.5); and every account-management resource from section 15 (organisations, workspaces, members, connections, API keys). Section 15's resources are dashboard concerns and belong in Next.js server actions against Supabase with RLS, not in the public spec — putting them in would add 15-20 operations and blow the cap on its own.

MCP server: revision 2026-07-28; implement server/discover; send io.modelcontextprotocol/protocolVersion in _meta and the MCP-Protocol-Version, Mcp-Method and Mcp-Name headers; return 400 with -32020 HeaderMismatch on mismatch; ship a shim for 2025-11-25 and earlier rather than a rewrite; return structuredContent against a declared outputSchema and mirror it into a TextContent block; return resource_link for large result sets with the first N rows inline as the envelope above; return an opaque cursor with a stated TTL in the tool description for anything paginated; mark tenant/region with x-mcp-header and mark nothing sensitive; never forward the caller's token upstream — per-tenant OAuth vault, RFC 9728, RFC 8707, mandatory PKCE; put meta.credits_used in every tool result and in an API response header.

---

## 5. Platform terms, access friction and compliance constraints binding on the Marketplane architecture (spec sections 3.2, 3.5, 9, 10.4, 11.2, 11.4, 11.5, 11.7, 11.9, 11.10, 11.11, 15, plus kickoff prompt non-negotiable 4 and the Main.dc.html artboard claims)

Platform terms are the hard boundary of this build, not advice. Two clauses set the shape: Google Ads Developer Policies forbid letting third parties "avoid applying for their own Google Ads developer access and Google Cloud Platform project" and require written client consent before redistributing account-specific data; Meta Platform Terms 3.a.iv forbids selling, licensing or purchasing Platform Data and 5.b.ii.2 requires per-Client separation of Platform Data plus "an up-to-date list of your Clients and their contact information" provided to Meta. Section 11.2 turns this into a standing decision: bring-your-own-credential everywhere platform terms require it, which is every ad and analytics platform; the "one key" resale model is permitted only for public-data modules (SERP, AI answers). Google Ads daily limits are per developer token (Explorer 2,880 ops/day, Basic 15,000/day, Standard unlimited), so a shared multi-tenant token is both non-compliant and non-scalable. Access, not code, is the schedule: Google Ads Explorer and the affiliate networks are same-day, Meta needs Business Verification plus App Review (weeks 3-8) and a 500-calls-in-15-days cadence with under 15 percent errors on the rolling last 500, and Google OAuth sensitive-scope verification is unbounded (the "3 to 5 days" figure is unsourced; one observed case ran 2026-04-01 to 2026-06-12 unresolved), so self-serve signup gates on it, not the roadmap. Contact data, if it ever exists, is SHA-256 hashed at the edge and never stored raw, with a per-record consent object mapping to Google `ad_user_data`/`ad_personalization` (EEA default-deny) and Meta `data_processing_options`; the precedent is a CNIL 3.5 million euro fine on 30 December 2025 for exactly this use case without consent. Section 15's account model forces RLS keyed on organisation and workspace on every tenant-scoped table with no cross-workspace aggregation ever, and section 9 explicitly excludes writes, the market module, Microsoft, Apple, Bing SERP, affiliate-as-flagship and cross-customer benchmarks from the MVP. The artboard sells three things section 11 has already killed or deferred (/v1/audience writes, /v1/market competitors, "DPA on request"), so the marketing build needs an explicit claims gate.

### Findings (64)

**Bring-your-own-credential is a standing section 11 decision and applies to every ad and analytics platform; the product may only sell normalisation, restatement handling, joins, scheduling and the answer layer over the customer's own tokens.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1206 (11.2)`  
> "Bring-your-own-credential everywhere platform terms require it, which is every ad and analytics platform. The product is normalisation, restatement handling, joins, scheduling and the answer layer over the customer's own tokens."

**The single-key data-broker model is permitted ONLY for public-data modules. Any endpoint that returns platform data on a Marketplane-held credential is a terms violation by construction. This splits the credential model in two: platform data = per-tenant customer credential; SERP and AI answers = Marketplane's own vendor key.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1206 (11.2)`  
> "The SocialCrawl \"one key\" model applies only to public-data modules (SERP, AI answers, and any market data that survives). The landing page already says \"you keep your own logins\". Price accordingly: credits buy correctness and joins, not raw data."

**Google's developer policy forbids an architecture in which customers ride on Marketplane's developer access. Engineering requirement: no code path may serve a tenant's Google Ads data using a developer token or GCP project that the tenant did not itself obtain, and the per-tenant developer-token field must exist in the connection record.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:404, 438 (3.5)`  
> Google's developer policy states you "can't allow agencies, end-advertisers, or other third parties to access Google Ads access in a way that would allow those third parties to avoid applying for their own Google Ads developer access and Google Cloud Platform project"

**Google requires written client consent before any redistribution of account-specific data. Engineering requirement: a stored, per-connection consent artefact (who consented, when, to what) must exist before any Google Ads data leaves the tenant boundary in any form, including support exports, aggregate metrics and model inputs.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:404, 438 (3.5)`  
> "requires written client consent before 'selling, redistributing, sub-licensing, or otherwise disclosing or transferring data specific to their Google Ads accounts'; the fact-checker confirmed both passages verbatim"

**Google Ads daily operation limits are per developer token, not per customer, and rejected requests still consume quota. Engineering requirement: quota accounting is keyed on developer token, error responses are counted against the budget, and the scheduler must back off on GoogleAdsFailure rather than retry-storm.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:437 (3.5)`  
> "Daily API usage limits are based on the number of API operations made per developer token," with Explorer at 2,880 production operations/day and Basic at 15,000/day. A shared-token multi-tenant aggregator hits a shared wall almost immediately. Rejected requests returning a GoogleAdsFailure still count against the cap

**Meta Platform Terms 3.a.iv forbids selling, licensing or purchasing Platform Data outright. Engineering requirement: no billing unit may be denominated in Meta rows or Meta records, and no dataset derived from Meta may be sold, shared, or exposed outside the originating workspace.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:404, 439 (3.5)`  
> Meta Platform Terms section 3.a.iv forbids "Selling, licensing, or purchasing Platform Data"

**Meta Platform Terms 5.b.ii.2 imposes two obligations: per-Client separation of Platform Data, and an up-to-date client list handed to Meta. The correct citation is 5.b.ii.2, not bare 5.b; 5.a.i.1's 'solely on behalf of' language applies to Service Providers and must not be cited for siloing.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:404, 439, 453 (3.5)`  
> the obligation to "ensure that Platform Data you maintain on behalf of one Client is maintained separately from that of other Clients" sits at section 5.b.ii.2, which also requires Tech Providers to "maintain an up-to-date list of your Clients and their contact information and provide it to us."

**The Meta client-list obligation is concretely an onboarding requirement and a stored record. Onboarding for any workspace connecting Meta must capture the client's legal entity name and contact information; a queryable `meta_clients` record (workspace, client name, contact email, contact name, first-connected date, last-verified date, still-active flag) must be maintained and exportable on demand, and it must be updated on workspace deletion and on disconnect, not only on create.**  
`likely` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:453 (3.5), 1257 (11.11)`  
> "Section 5.b.ii.2 also requires handing Meta an up-to-date client list, an obligation the researcher missed and one enterprise buyers will raise in security review." Plus 11.11 mitigation: "Legal read of the terms before pricing goes live; onboarding step for Business admin acceptance"

**Cross-customer aggregation and benchmarking on platform data is banned and must be designed out, not merely disabled by policy. This forecloses any 'industry benchmark', 'peer comparison', 'median CPM across customers' or shared-model feature, and any query planner that can read across workspaces.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:463 (3.5)`  
> "Kill cross-customer benchmarking before it is designed in. Meta forbids selling or licensing Platform Data outright and Google requires written client consent to redistribute account-specific data; termination on either is product death."

**Cross-customer benchmarks are an explicit MVP exclusion, with platform termination as the stated reason.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:940 (9)`  
> "**Cross-customer benchmarks on platform data**: a platform-termination risk on Meta and Google (section 3.5)."

**Per-workspace separation is absolute: no cross-workspace aggregation is permitted even inside a single paying organisation. An agency with 40 client workspaces may not receive a roll-up over their platform data.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1496 (15)`  
> "Workspace | One client or brand inside an organisation | Agencies hold many; brands hold one. Connections, watches and questions are scoped to a workspace. No cross-workspace aggregation ever."

**Tenant isolation is specified at the database row level, not the application layer. Engineering requirement: Supabase RLS policies, not query-builder filters, and the request path must not run as a service role that bypasses RLS.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1495 (15)`  
> "Organisation | The paying company (an agency or a brand) | Owns billing, credits, API keys, connections and the entity graph. Strict tenant isolation enforced at the database row level."

**Every tenant-scoped table must key its RLS on BOTH organisation and workspace. Concretely: org_id on every tenant table; workspace_id on every table holding connections, watches, questions, envelopes, platform rows, alerts, request logs and credit ledger entries; policies asserting membership in the org AND scope to the workspace.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETPLANE-KICKOFF-PROMPT.md:63-64 (non-negotiable 3)`  
> "Supabase holds Postgres, authentication, row-level security, storage and pg_cron for light schedules. Every tenant-scoped table has row-level security keyed on organisation and workspace."

**The Connection entity is the credential boundary: it holds the customer's own OAuth grant or key in a vault plus health, quota consumption and the restatement schedule, and must prompt re-authorisation on token death. Engineering requirement: credentials are never stored in application tables, never logged, and a token-death path exists per connection.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1498 (15)`  
> "Connection | One authorised platform account in a workspace | Holds the customer's own OAuth grant or key in a vault, its health, quota consumption and the restatement schedule. Re-authorisation prompts when a token dies."

**API keys are workspace-scoped with a spend budget and a tool allow-list. Engineering requirement: an API key resolves to exactly one workspace; there is no org-wide key that can read across workspaces; budget and allow-list are enforced at the edge before any platform call.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1499 (15)`  
> "API key | A credential for the API and MCP server | Scoped to a workspace, with a spend budget and an allow-list of tools."

**Member roles are fixed at four (owner, admin, analyst, viewer), invited by email, with SSO deferred. RLS must therefore also carry a role dimension for write/admin operations, not only tenancy.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1497 (15)`  
> "Member | A person with a login | Roles: owner, admin, analyst, viewer. Invited by email. Single sign-on later."

**The MCP server must never forward the caller's token upstream; a per-tenant OAuth vault is mandated by the MCP auth spec together with RFC 9728 metadata, RFC 8707 resource indicators and mandatory PKCE. Also: do not mark tenant/region routing parameters as sensitive; use `x-mcp-header` so the edge can route and rate-limit without parsing bodies.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:772 (7, MCP server design)`  
> the auth spec states the MCP server "MUST NOT pass through the token it received from the MCP client", which mandates a per-tenant OAuth vault, plus RFC 9728 metadata, RFC 8707 resource indicators and mandatory PKCE

**Contact data must be hashed at the edge and never stored raw. This is a kickoff non-negotiable that cites section 3.2 and applies even though writes are deferred, so any speculative schema, fixture or test data touching contacts is in scope.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETPLANE-KICKOFF-PROMPT.md:70-71 (non-negotiable 4)`  
> "Contact data, if it ever appears, is hashed at the edge and never stored raw (section 3.2)."

**The section 3.2 rule is stronger than 'hash before storing': the API boundary itself accepts only SHA-256 hashes, normalisation happens in the SDK or at the edge, only hashes plus counters are persisted, and no payloads are logged. Engineering requirement: a boundary validator that rejects anything email-shaped or phone-shaped, and a logging policy that redacts request bodies on audience routes.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:214 (3.2, minimum compliance bar item 1)`  
> "1. Accept only SHA-256 hashes at the API boundary, normalize in the SDK or at the edge, persist hashes plus counters, log no payloads."

**Google Customer Match normalisation is exactly specified and must be implemented in the SDK/edge normaliser before hashing: trim, lowercase, E.164 phone format, strip Gmail periods and plus-suffixes, then SHA-256.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:180 (3.2, platform write requirements)`  
> "SHA-256 after normalization (trim, lowercase, E.164 phones, strip Gmail periods and plus-suffixes)."

**Meta requires contact info hashed before transmission on every surface except the JavaScript pixel. Since Marketplane has no pixel surface, the rule is absolute for this product: no unhashed contact field ever crosses the wire to Meta.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:182 (3.2)`  
> "Contact info hashed before transmission except via the JavaScript pixel. Robust prominent notice and cookie consent required."

**TikTok offers to hash raw values itself if given consistent capitalisation. That path is forbidden by compliance bar item 1 and must be explicitly disabled: email, external_id and phone are SHA-256 hashed by us before upload.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:183 (3.2)`  
> "Email, `external_id` and phone must be SHA-256 hashed for API use; TikTok will hash raw values itself if given consistent capitalization"

**SHA-256 hashing is not anonymisation under German case law, and a customer-list upload is a functional transfer requiring consent, not processing on behalf of a controller. Engineering consequence: hashing does not take the system out of GDPR scope, so the consent object, DPA and deletion paths are required even in a hash-only design.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:194 (3.2)`  
> German case law holds SHA-256 hashing is not anonymisation and that a customer-list upload is a functional transfer requiring consent, not processing on behalf of a controller ([BayVGH 5 CS 18.1157])

**Forbidden payload classes must be validated and rejected before egress, not filtered after: under-13 signals, SSNs, card numbers, and health or financial special-category fields.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:219 (3.2)`  
> "6. Validate and reject forbidden payloads before egress: under-13 signals, SSNs, card numbers, and health or financial special-category fields."

**Consent is per record and per destination, with a platform-specific field mapping, not a single boolean. Google: `ad_user_data` and `ad_personalization` required on create, not required on remove, and missing EEA consent is determined as NOT consented (default-deny). Meta: `data_processing_options` with country and state codes. Engineering requirement: a per-record consent object that serialises differently per destination.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:180, 215 (3.2)`  
> "2. Model a per-record consent object that maps to Google `ad_user_data` and `ad_personalization` with EEA default-deny, and to Meta `data_processing_options` with country and state codes." and "Consent fields `ad_user_data` and `ad_personalization` on create, not needed on remove; missing EEA consent is determined as not consented"

**Meta's Limited Data Use field name differs by surface and must not be normalised into one key: `dataProcessingOptions` in the Pixel versus `data_processing_options` in the Conversions API. Meta documents LDU as an audience-size effect, not a prohibition, and states no Pixel-to-CAPI consistency requirement, so do not build a hard cross-path consistency check and claim Meta requires it.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:182 (3.2), 209 (correction 6)`  
> "Field name differs by surface (`dataProcessingOptions` in Pixel vs `data_processing_options` in CAPI). Meta does not state a cross-path consistency requirement, and LDU is documented as an audience-size effect, not a prohibition."

**Meta's per-ad-account Custom Audience Terms acceptance cannot be performed by the vendor and is the recurring onboarding failure. Engineering requirement: detect non-acceptance, deep-link the Business-admin acceptance URL, and track it as a first-class onboarding step with state.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:181, 220 (3.2), 1503 (15)`  
> "Per-ad-account Custom Audience Terms acceptance that the vendor cannot perform. A Business admin must accept manually, and this is the recurring onboarding failure Klaviyo and ActiveCampaign document publicly." plus "7. Detect the missing Meta Custom Audience Terms acceptance and deep-link the Business-admin acceptance URL as a tracked onboarding step."

**Google Customer Match eligibility must be a runtime precheck surfaced as a capability field in the response, not a build-time assumption: targeting/manual bid adjustments require 90 days of Google Ads history and more than USD 50,000 total lifetime spend.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:180, 221 (3.2)`  
> "8. Gate Google Customer Match behind an eligibility precheck and surface the 90-day plus $50,000 targeting threshold as a capability field in the response."

**From 1 April 2026 new developer tokens are pushed onto the Data Manager API for Customer Match; this is grandfathering, not a shutdown, and it makes the new-entrant asymmetry worse. Any write design must target Data Manager API, not OfflineUserDataJobService/UserDataService.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:180 (3.2), 205 (correction 4)`  
> "From 1 April 2026 `OfflineUserDataJobService` and `UserDataService` reject Customer Match unless the developer token previously sent such requests. This is grandfathering, not a shutdown: incumbents keep the legacy path, new tokens must use Data Manager API"

**When writes eventually ship, suppression/removal ships before addition, priced per connected destination, because Google requires no consent for removals and it is the lowest-liability write. Meta web conversion tracking must never be built as a paid feature; Meta gives it away free.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1218 (11.4)`  
> "Defer past the MVP, keep the entity graph ready, and when it ships, ship suppression propagation first (Google requires no consent for removals, and it is the closed loop no incumbent offers), priced per connected destination rather than per call. Do not build Meta web conversion tracking; Meta gives it away."

**ESP and CRM integrations must be built as OAuth apps with least-permissive scopes, never pasted private keys, and each carries a review queue. Klaviyo's listing requires at least 5 installs with production-level API activity, and developer or company-associated accounts do not count, which is a genuine cold-start block.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:184, 222 (3.2)`  
> "OAuth app listing requires at least 5 installs with demonstrated production-level API activity; developer or company-associated accounts do not count" and "9. Build ESP and CRM integrations as OAuth apps, not pasted private keys, and budget for each review queue."

**Google Ads access tiers and their exact daily operation limits are settled by section 11.7: Explorer 2,880/day against production accounts, Basic 15,000/day, Standard unlimited, all per developer token. Plan on 2,880/day per token in week 1 and apply for Basic immediately.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1232 (11.7)`  
> "Explorer Access has existed since 2025-10-28 at 2,880 operations per day against production accounts, Basic is 15,000 per day, Standard is unlimited, and all limits are per developer token. **Decision.** Plan on 2,880 per day per token in week 1 and apply for Basic immediately."

**Explorer Access additionally blocks whole operation classes, which constrains what the connector may attempt: account creation, user management, keyword planning and billing.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:787 (7 corrections)`  
> "Google Ads has four access rungs, not three: Test, Explorer (2,880 production operations per day, blocking account creation, user management, keyword planning and billing), Basic (15,000), Standard (unlimited)."

**Google Ads Basic and Standard review timelines are documented as 5 and 10 business days respectively but both are reported as running longer during an acknowledged backlog with no resolution estimate; Standard additionally requires Required Minimum Functionality compliance.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:411 (3.5)`  
> Basic "typically approved within 5 business days," Standard "typically takes 10 business days," both reported as running longer during an acknowledged backlog

**Google OAuth sensitive-scope verification is the schedule wildcard: documented at 3 to 5 days in the risk table but that figure could not be sourced and Google publishes no duration; observed at 10+ weeks via a forum case open 2026-04-01 and still unresolved 2026-06-12. Engineering requirement: self-serve signup is gated on it, not the roadmap; design partners run under a testing-mode OAuth client with a user cap.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1261 (11.11), 454 (3.5 corrections), 411-415 (3.5)`  
> "Google OAuth verification is unbounded | Medium | Documented at 3 to 5 days, observed at 10 or more weeks | Started in week 1; self-serve signup gated on it, not the roadmap" and "The \"3-5 business days\" figure for Google OAuth sensitive-scope verification could not be sourced; Google's verification pages publish no duration. Treat it as unverified."

**Meta's third-party-account path requires Business Verification plus App Review per permission (ads_read, ads_management for Advanced Access), with business_management additionally required for custom audiences. Planned at weeks 3 to 6 for verification and weeks 4 to 8 for App Review outcome; no duration is published by Meta.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:413 (3.5), 181 (3.2)`  
> "Business Verification plus App Review per permission for ads_read and ads_management (Advanced Access) | Not published; researcher plans weeks 3 to 6 for verification and weeks 4 to 8 for App Review outcome"

**Meta's Full Access threshold, effective 2026-05-04, is 500+ Marketing API calls in the past 15 days with error rate under 15 percent measured on a rolling last-500-call window; the screen-recording requirement was removed. Engineering requirement: run a genuine call cadence against our own Business Manager from day one AND keep the error rate low, because errors count twice (tier threshold and the insights quota user-errors penalty).**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:440, 466 (3.5)`  
> "Meta lowered the Full Access bar effective 2026-05-04 to 500+ Marketing API calls in 15 days with error rate under 15% on a rolling last-500-call window, and removed the screen-recording requirement" plus "Keep the error rate low: errors count against both the tier threshold and the insights quota through the user-errors penalty."

**Meta's Development-tier ceilings are severe enough to constrain scheduling design: rate-limit score capped at 60 (versus 9,000 at Full Access) with 300s decay and 300s block, and Ads Insights hourly quota per ad account of 600 + 400 * active ads - 0.001 * user errors versus 190,000 at Full Access. Meta also caps async breakdown jobs at 10 per ad account per day.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:413, 441 (3.5), 927 (9)`  
> "Development tier max score 60 with 300s decay and 300s block; Ads Insights hourly quota per ad account 600 (Dev) + 400 * active ads - 0.001 * user errors, versus 190,000 at Full Access" and "because Meta caps async breakdown jobs at 10 per ad account per day"

**Current Meta terminology is mandatory in every spec, design note and investor doc: Marketing API Access Tier, Limited Access, Full Access (renamed 4 May 2026). The `ads_api_access_tier` field in the `x-fb-ads-insights-throttle` header is the instrumentation that confirms an upgrade took effect.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:232 (3.2), 794 (7 corrections)`  
> "Use current Meta terminology (Marketing API Access Tier, Limited, Full) in every spec and investor doc." and "Meta's `x-fb-ads-insights-throttle` header carries a third field, `ads_api_access_tier`, which is the instrumentation that confirms a Full Access upgrade actually took effect."

**GA4 and Search Console quotas are shared with the customer's own other tools, which makes quota a customer-facing surface rather than an internal detail. Engineering requirement: publish per-source budget consumption in the response envelope, make cadence configurable, and surface long backfills as multi-day jobs.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:471 (3.5)`  
> "Treat rate limits as a customer-facing surface. GA4's 40,000 tokens per property per hour, PostHog's org-wide limits and Mixpanel's 60 queries per hour are shared with the customer's existing tools, so publish per-source budget consumption in the response envelope, make cadence configurable, and surface long backfills as multi-day jobs."

**Search Console carries undocumented load quotas over 10-minute and 1-day windows that can throw before the published limits are reached, so the scheduler must treat quota errors as expected control flow rather than exceptional.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:455 (3.5), 415 (3.5)`  
> "undocumented load quotas over 10-minute and 1-day windows can trigger quota errors before the published QPS, QPM and QPD thresholds are reached, and URL Inspection also carries a 15,000 QPM per-project cap"

**TikTok has no day-one production access: sandbox only, gated behind an app audit, business verification and a data-security compliance check, and pending scope or rate-limit change requests block other portal changes. Timelines (sandbox in hours; production ~1-2 weeks clean, 2-4 weeks full audit) are explicitly unverified.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:416 (3.5)`  
> "Sandbox only | App audit, business verification, data-security compliance check | Sandbox in hours; production roughly one to two weeks for a clean submission, 2 to 4 weeks for the full audit (unverified) | Not established; pending scope or rate-limit change requests block other portal changes"

**The section 3.5 access table's claim that all four affiliate networks are self-serve with no review is superseded by section 10.4 and 11.10: Awin gates advertiser API access behind Accelerate or Advanced plans and issues user-scoped tokens, Everflow advertiser users cannot create keys at all, and ShareASale is being absorbed into Awin.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1128 (10.4), 1250 (11.10)`  
> "Awin, the network the plan leaned on hardest, gates advertiser API access behind its Accelerate or Advanced plan and issues user-scoped tokens; Everflow advertiser keys cannot be self-generated at all."

**Awin tokens are personal to a user account, not the advertiser account, and grant access to every account that user can see. Engineering requirement: connection health must detect employee-offboarding token death, and the connect UI must warn that the token's scope is the user's whole account visibility, which is a data-minimisation problem inside a workspace.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1136 (10.4), 417 (3.5)`  
> Token "linked to your user account", not the advertiser account; 20 requests/minute per user; transactions capped at 31 days, aggregated reports 400 days

**Awin's Access Advertiser Agreement clause 4.8 is the cleanest agent-authorisation path found in the research: an advertiser may delegate day-to-day operation to a third party on written notice while remaining primarily liable. Engineering requirement: build the written-notice step into onboarding rather than assuming it. Awin User Agreement 2.1 limits use to own business purposes and 3.5 bars re-sale.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1136, 1176, 1183 (10.4)`  
> "Awin Access Advertiser Agreement clause 4.8, which lets an advertiser delegate day-to-day operation to a third party on written notice while remaining primarily liable. This is the cleanest agent authorization path found across all networks." and "build the Awin clause 4.8 written-notice step into onboarding rather than assuming it"

**Impact's MSA is the hardest clause in the whole research and may bar Marketplane outright: no use of the Services 'for the benefit of any other person or entity', prior written approval at Impact's sole discretion for non-employee Users, and 'No User may be a competitor of IMPACT' (Impact owns Affluent and Trackonomics, which are aggregators). Engineering requirement: Impact is customer-credential-only processing on the customer's own account, never resale, and the legal question is unresolved.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1137, 1174 (10.4)`  
> "MSA 2.2: no sharing or using the Services \"for the benefit of any other person or entity\"; prior written approval \"in IMPACT's sole discretion\" for non-employee Users; \"No User may be a competitor of IMPACT\""

**Affiliate upstream quotas bound supply in a way no vendor can buy out, so affiliate endpoints must not be priced per call: Awin 20 req/min per user, Impact 1,000/hour default with ReportExport 100/day and ClickExport 10/day, 'subject to change at any given time'.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1184 (10.4), 1137 (10.4)`  
> "Do not price per call here. Awin's 20 req/min per-user ceiling and Impact's 100 ReportExport per day cap bound upstream supply with a quota no vendor can buy more of, and Impact says limits are \"subject to change at any given time\"."

**Section 9 excludes writes (/v1/audience) from the MVP for calendar-shaped access reasons, not engineering reasons: Klaviyo's 5-live-installs rule, Google's Data Manager API cutover with the spend gate, and Meta Business Verification plus App Review.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:938 (9), 1218 (11.4)`  
> "**Audience writes**: Klaviyo will not review an OAuth app before it has 5 live installs, Google forces new Customer Match integrations onto the Data Manager API with a 50,000-dollar lifetime-spend gate, Meta needs Business Verification and App Review for third-party accounts."

**Section 9 excludes the market module (/v1/market) entirely: no unit-economics room and the high-value sources are contractually closed. Section 11.5 makes it a decision and section 2 keeps /v1/market only as a reserved, unbuilt namespace. Only a `competitor` entity survives in the graph as enrichment inside diagnose.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:937 (9), 38 (2), 1224 (11.5)`  
> "**Market module**: no unit-economics room and the high-value sources are contractually closed (section 3.4). Keep the `competitor` entity in the graph so `diagnose` can join to app-store rank and Shopify catalog data later." and "/v1/market         reserved namespace, not built (see 3.4)"

**Section 9 excludes Microsoft Advertising and Apple Search Ads because both are mid-replatform and anything built now is built twice; excludes Bing SERP because Microsoft decommissioned the Bing Search APIs on 2025-08-11, so Bing coverage means a scraping vendor and its terms exposure; and keeps Google Trends and Search Console as free joins inside diagnose, never as billable endpoints.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:935-939 (9)`  
> "**Bing SERP**: Microsoft decommissioned the Bing Search APIs on 2025-08-11; Bing coverage means a scraping vendor and its terms exposure. Ship Google-only and say so." and "**Google Trends and Search Console as paid reads**: Search Console is free and generous, so customers can call it directly; the official Trends API is still allow-listed alpha. Both stay as free joins inside `diagnose`, not as billable endpoints."

**SERP must be bought from DataForSEO, never crawled. Buying moves scraping ToS exposure onto a vendor; SerpApi selling 'Legal Shield' as a paid feature is itself a signal about the underlying risk.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:780 (7), /home/user/dataaggregator/docs/MARKETPLANE-KICKOFF-PROMPT.md:21`  
> "Buying SERP moves scraping ToS exposure onto a vendor. SerpApi selling \"Legal Shield\" as a paid feature is itself a signal about the underlying risk." and kickoff: "SERP is bought from DataForSEO, never crawled."

**The hosted AI-answer collector may use official provider APIs only; UI-parity collection is an opt-in customer-session mode. This is the 11.11 mitigation for provider terms on automated querying, and OpenAI's terms page could not be fetched, so the constraint stands unverified on the provider side.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1264 (11.11), 933 (9)`  
> "Provider terms on automated querying | Medium | OpenAI's terms page could not be fetched | Hosted path uses official APIs only; UI parity is an opt-in customer-session mode"

**The CNIL precedent is the named fine behind the whole write-side compliance bar: 3.5 million euros on 30 December 2025 for transmitting loyalty-programme emails and phone numbers to a social network for ad targeting without informed consent, affecting more than 10.5 million people. CNIL did not name the fined company, so the press attribution must not be repeated as fact.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:191, 211 (3.2), 12 (0)`  
> "The CNIL fined a company €3.5M on 30 December 2025 for transmitting loyalty-programme emails and phone numbers to a social network for ad targeting without informed consent, affecting more than 10.5 million people." and "CNIL did not name the fined company. Do not repeat the press attribution as fact."

**GDPR Art. 28(3) requires eight mandatory clauses including sub-processor prior authorisation and full flow-down, with the processor remaining fully liable for sub-processor acts. Engineering requirement: the sub-processor list is a product surface with change notice, not a static page, and every new vendor (DataForSEO, Cloudflare, Supabase, Vercel, LLM providers, Trigger.dev if used) is a sub-processor entry.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:195, 216 (3.2)`  
> "[GDPR Art. 28(3)] sets eight mandatory clauses including sub-processor prior authorisation and full flow-down, with the processor remaining fully liable for sub-processor acts." and "3. Ship a click-through Art. 28 DPA covering all eight clauses, a public sub-processor page with change notice, and CCPA service-provider terms so customer disclosures to us are not a sale or share."

**An EU processing region must exist at launch and not be an enterprise upsell; data region is a brand-file field, a Settings screen control and a claim on the marketing site (Frankfurt by default).**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:217 (3.2), 1510 (15), /home/user/dataaggregator/docs/MARKETPLANE-KICKOFF-PROMPT.md:47-51`  
> "4. Offer an EU processing region at launch rather than as an enterprise upsell." plus Settings: "members and roles, data region, data deletion, sub-processor list, audit log" plus brand file must carry "default locale and currency, data region"

**A written processor-only posture is required and is directly enforceable in code: no own-purpose use, no cross-tenant joins, no model training on customer contact data. This is the second, independent ban on cross-tenant joins alongside the Meta and Google terms.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:218 (3.2)`  
> "5. Adopt a written processor-only posture: no own-purpose use, no cross-tenant joins, no model training on customer contact data."

**Data deletion is a named Settings surface, which implies a real cascade: deleting a workspace must revoke and destroy vault credentials, purge platform rows and raw payload objects in R2, purge derived envelopes and caches, and update the Meta client list.**  
`likely` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1510 (15)`  
> "8. Settings: members and roles, data region, data deletion, sub-processor list, audit log."

**Google Ads Standard Access may have no path for a headless product because Required Minimum Functionality categories are defined by what a tool displays. Two binding consequences: the Numbers reporting screen is a compliance artefact, not just a feature, and nothing may be designed that needs more than 15,000 operations per day until Google answers in writing.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1256 (11.11), 1489 (15), 1234 (11.7)`  
> "Google Ads Standard Access has no path for a headless product | High | RMF categories are defined by what a tool displays | Written question to Google in week 1; design partners live within Basic limits; a minimal reporting UI if required" and "A product with no reporting UI may have no path past 15,000 operations a day."

**Whether Meta treats a pay-per-call API as a Tech Provider needing per-client authorisation and a client list is unresolved and rated High severity; the stated mitigation gates the pricing page. Engineering consequence: do not ship a public pricing page for Meta-backed endpoints before the legal read, and build the Business-admin acceptance onboarding step regardless.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1257 (11.11), 478 (3.5)`  
> "Meta treats a pay-per-call API as a Tech Provider needing per-client authorisation and a client list | High | Section 5.b.ii.2 obligations are confirmed but the onboarding mechanics are not | Legal read of the terms before pricing goes live; onboarding step for Business admin acceptance"

**Dependency licences are a terms constraint on the same footing as platform terms: Airbyte's certified source-facebook-marketing is ELv2 (forbids providing the products to others as a managed service) and Windmill CE is AGPLv3 with terms forbidding serving it as a managed service. dlt core, dlt-hub verified-sources and dbt_ad_reporting are Apache 2.0 and are the safe bases; Meltano taps need individual audit.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:776-780 (7)`  
> "Airbyte's certified `source-facebook-marketing` declares `license: ELv2` ... ELv2 forbids providing the products to others as a managed service." and "Windmill is AGPLv3 for anything compilable without the enterprise flag ... Unusable as the scheduler behind a paid API without a commercial agreement."

**The public no-signup demo endpoint from section 10.3 must serve only public-data modules (SERP, AI answers) or synthetic fixtures. Serving any platform data on a Marketplane-held credential to an unauthenticated caller would breach both the Google third-party-access policy and Meta 3.a.iv.**  
`likely` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1077 (10.3), 1206 (11.2), 940 (9)`  
> "Ship a public, no-signup, no-key demo endpoint plus a recurring free tier of about 250 calls per month." read against 11.2's "The SocialCrawl \"one key\" model applies only to public-data modules"

**AI-visibility revenue must be kept under a third of the mix as a hedge against a first-party brand-citation report from OpenAI or Google. This constrains the pricing page and packaging, not only the roadmap.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1263 (11.11)`  
> "A first-party brand-citation report from OpenAI or Google | Medium | Nothing in the sources addresses it | Keep AI-visibility revenue under a third of the mix; the join and correctness layers are unaffected"

**Section 11.9 forbids the 'joins in one call' claim: it is refuted by Windsor's /all endpoint, Supermetrics Union/Join blends and Looker Studio blends, and the join is only well formed on the search-ads edge. The product must be described as verified root cause and an operated correctness guarantee. This is a marketing-copy constraint that the site build must honour.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETING-DATA-PLANE.md:1244 (11.9)`  
> "Stop describing the product as \"joins in one call\". Describe it as verified root cause and an operated correctness guarantee."

**Every marketing claim must originate in the brand file's allowed-claims list, which makes the artboard's security claims (EU hosting, GDPR and UK GDPR, never used to train models, SOC 2 Type II planned, SAML SSO on Scale, audit log) auditable strings rather than free copy. Any of them shipped without the backing implementation is both a false-claim risk and a brand-file violation.**  
`certain` · source: `/home/user/dataaggregator/docs/MARKETPLANE-KICKOFF-PROMPT.md:44-52; /home/user/dataaggregator/design/marketplane/Main.dc.html:248-258`  
> brand file is "the single source for company and product identity ... data region, and the marketing claims that are allowed on the site. Every page, email, invoice, generated document, MCP server description and SDK README reads from it."

### Exact values (53)

- 2,880 operations/day — Google Ads Explorer Access, production accounts, per developer token (the week-1 planning number)
- 15,000 operations/day — Google Ads Basic Access, per developer token (the ceiling design partners must live within)
- unlimited — Google Ads Standard Access daily operations (may have no path for a headless product)
- 5 business days — documented Google Ads Basic Access approval target, reported as running longer during an acknowledged backlog
- 10 business days — documented Google Ads Standard Access approval target, RMF-dependent
- 2025-10-28 — date Google Ads Explorer Access became available (NOT 2026-02-06; that date is a corrected error)
- 3 to 5 days — Google OAuth sensitive-scope verification 'documented' figure, which the fact-check could not source; do not publish it
- 10+ weeks — observed Google OAuth verification, from a forum case open 2026-04-01 and unresolved on 2026-06-12
- week 3 to week 16 — the planning range for Google OAuth verification landing
- 500+ Marketing API calls in the past 15 days — Meta Full Access qualification threshold, effective 2026-05-04
- under 15% error rate on the rolling last 500 calls — the second half of Meta's Full Access test
- Marketing API Access Tier / Limited Access / Full Access — mandatory Meta terminology as of 4 May 2026
- 60 — Meta Development-tier max rate-limit score, with 300s decay and 300s block (versus 9,000 at Full Access)
- 600 + 400 * active ads - 0.001 * user errors — Meta Ads Insights hourly quota per ad account at Development tier (versus 190,000 at Full Access)
- 10 async breakdown jobs per ad account per day — Meta cap that forces tiered restatement backfill
- ads_api_access_tier — third field of the x-fb-ads-insights-throttle header; the only confirmation a Full Access upgrade took effect
- Meta Platform Terms 3.a.iv — 'Selling, licensing, or purchasing Platform Data' prohibition
- Meta Platform Terms 5.b.ii.2 — per-Client data separation AND 'maintain an up-to-date list of your Clients and their contact information and provide it to us'
- Meta Platform Terms 5.a.i.1 — 'solely on behalf of' language; applies to Service Providers, NOT the siloing citation
- business_management — extra Meta permission required for custom audiences
- ads_read / ads_management — Meta permissions requiring App Review at Advanced Access
- 200,000 core tokens per property per day; 40,000 per property per hour; 14,000 per project per property per hour; 10 concurrent requests — GA4 Data API quotas, shared with the customer's other tools
- 12 to 24+ hours — GA4 daily data latency, depending on volume
- 1,200 QPM per site and per user; 40,000 QPM and 30,000,000 QPD per project; 15,000 QPM per project for URL Inspection — Search Console limits, plus undocumented 10-minute and 1-day load quotas
- SHA-256 — the only accepted contact-identifier form at the API boundary
- trim, lowercase, E.164 phones, strip Gmail periods and plus-suffixes — Google Customer Match normalisation before hashing
- ad_user_data, ad_personalization — Google consent fields, required on create, not on remove; missing EEA consent = not consented
- data_processing_options (CAPI) vs dataProcessingOptions (Pixel) — Meta LDU field names; country code 1 = USA, 0 = request geolocation; state codes 1000 to 1013
- 5,000 members minimum recommended; 20 identifiers per record; up to 100,000 per request — Google Customer Match sizing
- 90 days of Google Ads history + more than USD $50,000 total lifetime spend — Google Customer Match targeting gate
- 1 April 2026 — date OfflineUserDataJobService and UserDataService began rejecting Customer Match from tokens without prior history (grandfathering; new tokens use Data Manager API)
- 5 installs with production-level API activity — Klaviyo OAuth app listing prerequisite; developer/company-associated accounts do not count
- €3.5M, 30 December 2025, >10.5 million people — CNIL fine for transmitting loyalty emails and phones to a social network for ad targeting without informed consent
- €1,500 per plaintiff, four plaintiffs, 3 February 2026, appeal to BGH excluded — OLG Dresden, Meta as joint controller for Pixel, CAPI, SDK App Events, Offline Conversions, App Events API (medium confidence, single secondary source)
- BayVGH 5 CS 18.1157 — German holding that SHA-256 is not anonymisation and a customer-list upload is a functional transfer requiring consent
- GDPR Art. 28(3) — eight mandatory clauses, sub-processor prior authorisation, full flow-down, processor fully liable for sub-processor acts
- Awin Accelerate ($99/mo + 2.5%) or Advanced plan — advertiser API access gate; Access tier ($49/mo + 3.5%) excluded except Conversion API
- Awin: 20 requests/minute per user; transactions capped at 31 days; aggregated reports 400 days; token linked to the user account
- Awin Access Advertiser Agreement 4.8 — delegation of day-to-day operation to a third party on written notice; User Agreement 2.1 (own business purposes) and 3.5 (no re-sale)
- Impact MSA 2.2 — no use 'for the benefit of any other person or entity'; written approval at Impact's sole discretion; 'No User may be a competitor of IMPACT'
- Impact rate limits: 1,000 req/hour default, Catalogs 3,600/hour, ReportExport 100/day, ClickExport 10/day, 'subject to change at any given time'
- PartnerStack: 4,000 requests/minute per IP, HTTP Basic, test and production keys, no plan gate found
- Everflow: advertiser users 'cannot create keys themselves'; keys created by network users or an account manager
- BBD37VB98 — Microsoft Advertising public universal sandbox developer token (Microsoft is out of the MVP regardless)
- 31 January 2027 (Bing Ads SOAP decommission) and 26 January 2027 (Apple Campaign Management v5 sunset) — the stated deferral reasons for Microsoft and Apple; the Microsoft dates are marked unverified by the fact-check
- ±3 noise per day with a minimum-3 threshold — LinkedIn demographic pivots, which break naive daily-sum reconciliation (LinkedIn is out of the MVP)
- PostHog 2,400 queries/hour (query endpoint), 240/minute and 1,200/hour (analytics), applied org-wide; Mixpanel 5 concurrent and 60 queries/hour, Raw Data Export 100 concurrent, 60/hour, 3/second
- ELv2 — licence on Airbyte's certified source-facebook-marketing; forbids providing the products to others as a managed service
- AGPLv3 — Windmill CE; unusable as the scheduler behind a paid API
- Apache 2.0 — dlt core, dlt-hub verified-sources, Fivetran dbt_ad_reporting; the safe bases
- owner, admin, analyst, viewer — the four member roles
- Frankfurt by default; Frankfurt · London — the data-region claim and footer locations on the artboard (design/marketplane/Main.dc.html:255, :275)
- SOC 2 Type II planned; SAML SSO on Scale — artboard security claims that must be true and brand-file-sourced before shipping (design/marketplane/Main.dc.html:258)

### Conflicts raised (9)

- Artboard sells two surfaces section 11 has killed or deferred. design/marketplane/Main.dc.html:186 sells '/v1/audience — Customer lists ... Consent checked before anything leaves', :188 sells '/v1/market — Competitors', :110 promises 'audiences pushed to every platform from one place', and the demo script at :308-315 runs a full audience-suppression answer with 'Consent checked: all 4,812 rows are eligible for a suppression list.' Section 11.4 defers writes past the MVP and 11.5 drops the market module (section 2 keeps /v1/market as a 'reserved namespace, not built'). SECTION 11 WINS: the marketing build must not present either as a live product surface. If either card survives visually it must be labelled as roadmap, and no route, schema or MCP tool may be created for them.
- Artboard says 'DPA on request' (design/marketplane/Main.dc.html:255); section 3.2's compliance bar item 3 requires 'a click-through Art. 28 DPA covering all eight clauses, a public sub-processor page with change notice, and CCPA service-provider terms'. THE SPEC WINS: 'on request' is a weaker commitment than the bar and also contradicts section 15's Settings screen, which lists the sub-processor list as a product surface. Ship a click-through DPA and a live sub-processor page.
- Section 3.2's Google Customer Match cell contradicts itself: 'Targeting, manual bid adjustments and exclusions require 90 days of Google Ads history and more than USD $50,000 total lifetime spend. Basic access allows Observation and exclusions only' (docs/MARKETING-DATA-PLANE.md:180). Exclusions cannot both require the $50k gate and be allowed at basic access. This matters because 11.4 makes suppression the FIRST write to ship. RESOLUTION: treat eligibility as a runtime precheck surfaced as a capability field in the response (bar item 8), never as a compile-time assumption, and do not promise suppression availability in copy until the precheck is live.
- Section 3.5's access table says affiliate networks are 'Yes. All four are self-serve keys' with review 'None' and timeline 'Same day' (docs/MARKETING-DATA-PLANE.md:417); section 10.4 and 11.10 establish that Awin is plan-gated with user-scoped tokens, Everflow keys cannot be self-generated, and Impact's MSA bars competitors. SECTIONS 10.4 AND 11.10 WIN (they are the later gap round and 11 is decisive). Onboarding must run a plan/eligibility check per network, not assume same-day keys.
- Section 9 defers Microsoft Advertising citing a 'SOAP shutdown 31 January 2027', but the section 3.5 fact-check states 'The Bing Ads SOAP feature freeze on 2026-10-01 and decommission on 2027-01-31 have no primary Microsoft source ... do not let them drive a REST migration decision yet'. The OUTCOME still stands (11.9 narrows scope to Meta, Google, GA4 and one affiliate network, so Microsoft is out either way), but the STATED REASON is unverified and must not be repeated as fact in a design note or on the site.
- The TL;DR says 'writes have no price' (docs/MARKETING-DATA-PLANE.md:12); section 3.2 correction 7 and 11.4 both reject that framing ('Zapier did not abandon metering when its unit stopped fitting the work, it split the unit'; writes are 'priced per connected destination rather than per call'). SECTION 11.4 WINS. Do not build a free-writes assumption into the credit ledger schema.
- 11.11 records Google OAuth verification as 'Documented at 3 to 5 days, observed at 10 or more weeks' while the 3.5 corrections state the 3-5 day figure 'could not be sourced; Google's verification pages publish no duration. Treat it as unverified.' THE CORRECTION WINS on what may be published: never quote 3-5 days to a customer or in a plan; plan week 3 to week 16 and gate self-serve signup on the outcome.
- The kickoff prompt orders 'Write extractors in TypeScript on Workers rather than adopting a Python extraction library' (MARKETPLANE-KICKOFF-PROMPT.md:60-62) against section 7's dlt-on-Trigger.dev recommendation. The kickoff resolves it itself ('record the trade-off against section 7's dlt recommendation in the phase 1 design note'). Terms-wise the kickoff choice is the safer one: own TypeScript extractors avoid the Airbyte ELv2 managed-service trap entirely and remove a licence audit from the critical path. Note it in the design note either way.
- Artboard IT card reads 'One key. One schema.' (design/marketplane/Main.dc.html:111) which, read alone, is the exact SocialCrawl framing 11.2 rules out for platform data. It is saved by the hero line 'Read-only access, your logins stay yours' (:47) and 'Read-only OAuth ... one tenant per client' (:253-254). KEEP the copy only with the credential sentence adjacent; never let 'one key' appear next to a platform name without 'your logins stay yours'.

### Open or unverified (18)

- OPEN, HIGH (11.11): Whether Google Ads Standard Access has any path for a headless product. RMF categories are defined by what a tool displays and the document never addresses API-only clients. Anything requiring more than 15,000 operations/day is built on an unanswered question and must be flagged in the PR. Mitigation in plan: written question to Google in week 1; a minimal reporting UI if required.
- OPEN, HIGH (11.11, 3.5 open questions): Whether Meta treats a pay-per-call API as a Tech Provider under section 5.b, whether each customer's Business Manager must formally authorise the app, and how the 5.b.ii.2 client list is delivered and maintained. The obligations are confirmed; the onboarding mechanics are not. Pricing for Meta-backed endpoints is gated on a legal read.
- OPEN (3.5): If every tenant brings their own developer token, whose token appears in the request? Google usually grants one developer token per company and forbids using a third party's without written permission; the mechanics of per-tenant tokens in a multi-tenant service are undocumented. Any connection-schema design that assumes per-tenant developer tokens must flag this.
- UNCONFIRMED (3.5): Whether webmasters.readonly is a sensitive scope. Google's OAuth scopes page does not list the webmasters scopes at all, so Search Console could be pulled behind the same unbounded OAuth gate as GA4.
- UNKNOWN (3.5 open questions): Actual Google Ads Basic and Standard waits as of September 2026. The backlog was acknowledged with no resolution estimate and rests on a single secondary source contradicting Google's own docs. This determines whether 2,880 ops/day is a two-week or six-month ceiling.
- UNVERIFIED (3.5 corrections): All TikTok, Amazon and Apple access timelines. The fact-checker's search budget was exhausted before verification began.
- UNVERIFIED (3.5 corrections): Bing Ads SOAP feature freeze 2026-10-01 and decommission 2027-01-31 have no primary Microsoft source.
- OPEN (10.4): Whether Impact grants written approval under MSA 2.2 to third-party data vendors, and whether Supermetrics, Windsor and Improvado hold partner agreements or merely operate on customer credentials as tolerated processors. Directly determines whether an Impact connector is permitted at all.
- OPEN (10.4): Whether Awin's 20 req/min limit is per user token or per advertiser account, and whether advertiser-side Awin access is obtainable below Accelerate/Advanced. Also unknown: whether CJ personal access tokens survive the creating employee's departure, and CJ's rate limits and date-range caps (developers.cj.com is JS-rendered and did not yield).
- OPEN, LEGALLY LOAD-BEARING (3.2 open questions + correction 8): Whether a hash-only, zero-retention design keeps Marketplane outside processor status, given it holds the OAuth credential and can trigger reidentification at the destination. No regulator has applied EDPS v SRB to an adtech intermediary and that ruling is unverified at primary level. DO NOT present the hash-only architecture as resting on a verified CJEU ruling.
- MEDIUM CONFIDENCE, SINGLE SECONDARY SOURCE (3.2 correction 8): OLG Dresden 3 February 2026 joint-controller holding, the Meta one-click CAPI launch, and all Hightouch dollar figures. Do not cite Dresden as settled law in customer-facing security material.
- NOT NAMED (3.2 correction 9): CNIL did not name the fined company in the €3.5M decision. Repeating the press attribution is a factual error and a defamation risk.
- UNVERIFIABLE (3.2 correction 10): HubSpot rate limits and the $500/month add-on. Marked unverified in the spec.
- UNPUBLISHED (3.2 open questions): Segment's reverse-ETL overage rate above plan allowance, so the marginal price of a write above allowance is unknown rather than zero. Also unknown: whether a small vendor can obtain Google Data Manager API access on the same terms as named launch partners; the landing page states no allowlisting conditions, so eligibility is undocumented rather than restricted.
- NO POLICY EXISTS (3.5 open questions): No reviewed platform policy addresses MCP as a delivery surface, i.e. whether exposing platform data to an autonomous agent counts as third-party programmatic access. Any MCP tool that returns platform data ships against an unaddressed policy question and must say so in the design note.
- NOT ASSESSED (3.5 open questions, 11.11): Cost, latency and ToS constraints of AI-answer monitoring across ChatGPT, Perplexity, Claude and Gemini; some may prohibit systematic automated querying for competitive monitoring. OpenAI's terms page could not be fetched.
- OPEN (3.5 open questions): How tenant credentials fail silently, and what that does to a freshness guarantee. Apple revokes on role change, Awin tokens vanish with the user, LinkedIn offers no service tokens. Named as the most likely source of early churn, so connection health is not optional polish.
- CLAIMS NOT YET TRUE (design/marketplane/Main.dc.html:250-258): 'SOC 2 Type II planned', 'SAML SSO on Scale', 'EU hosting, GDPR and UK GDPR / Frankfurt by default', 'Never used to train models', 'Every query, export and key logged'. Each is a security claim a buyer will test. None may ship on the site until the brand file's allowed-claims list carries it and the implementation exists.

### Recommendation

Adopt the following as the mandatory \"platform-terms check\" block in every design note under docs/marketplane/ (the kickoff already requires one per PR). It is 18 binary gates; a PR passes only if every applicable line is answered PASS or N/A with a one-line reason. Order is deliberate: credential, tenancy, data movement, PII, access tier, claims.\n\nCREDENTIAL\n1. BYOC: does every code path that touches Google, Meta, GA4, Search Console, TikTok or an affiliate network read the credential from the per-workspace connection vault? FAIL if any platform call uses a Marketplane-held or env-var platform token, or a developer token/GCP project the tenant did not obtain (Google policy: third parties must not \"avoid applying for their own Google Ads developer access and Google Cloud Platform project\"). Grep the diff for hardcoded tokens, shared client secrets, and any `process.env.*_ACCESS_TOKEN` used on a tenant request path.\n2. Vendor-key exception: if the diff DOES use a Marketplane-held key, is the data source public-data only (DataForSEO SERP, AI-answer providers)? FAIL for any platform data. This is the only permitted single-key surface (11.2).\n3. No token pass-through: does the MCP server avoid forwarding a client token upstream (spec: \"MUST NOT pass through the token it received from the MCP client\")? Does the OAuth surface carry RFC 9728 metadata, RFC 8707 resource indicators and PKCE?\n4. Credential hygiene: are credentials absent from application tables, logs, error messages, request logs and fixtures? Is there a token-death path that flips connection health and prompts re-authorisation?\n\nTENANCY\n5. RLS: does every new table carry org_id, and workspace_id where workspace-scoped, with an RLS policy keyed on both? Is there a test proving a member of org A cannot read org B, and that workspace A cannot read workspace B?\n6. No service-role bypass: does the request path (Workers edge, server actions, MCP handler, scheduled job) run under the caller's identity rather than a service key that bypasses RLS? Any service-role use must be named and justified in the note.\n7. No cross-workspace read: does any query, view, materialisation, cache key or aggregate span more than one workspace_id? FAIL on any GROUP BY that omits workspace_id, any \"across all clients\" roll-up, any shared cache key without tenant in it. Section 15: \"No cross-workspace aggregation ever.\"\n8. No cross-customer aggregation or benchmarking: does the diff introduce percentiles, medians, industry averages, peer comparison, leaderboards, or training/fine-tuning inputs built from more than one tenant's platform data? FAIL — Meta 3.a.iv and Google's redistribution clause make this termination risk (3.5, 9).\n9. API key scope: does every API key resolve to exactly one workspace, with spend budget and tool allow-list enforced before the first upstream call?\n\nDATA MOVEMENT\n10. No resale or redistribution: is any billing unit denominated in platform rows/records, and does any response, export, webhook, support tool or shared link move platform data outside the originating workspace? If data leaves, is there a stored written-client-consent artefact (Google requires written client consent before \"selling, redistributing, sub-licensing, or otherwise disclosing or transferring data specific to their Google Ads accounts\")?\n11. Meta client list: if the diff touches Meta onboarding, workspace lifecycle or deletion, does it create/update/retire the client record (legal entity name + contact information) required by Platform Terms 5.b.ii.2, and is that record exportable on demand?\n12. Dependency licences: does the diff add a dependency under ELv2 or AGPL used in the served path (Airbyte connectors, Windmill)? Apache-2.0/MIT only for anything in the managed service; a new licence needs a named reason in the note.\n\nPII AND CONSENT (applies even though writes are deferred — fixtures and schemas count)\n13. Hash at the edge: can any raw email, phone, name or address reach persistence, logs, R2 payload storage, or an LLM prompt? The API boundary accepts SHA-256 only; normalisation (trim, lowercase, E.164, strip Gmail dots and plus-suffixes) happens in the SDK/edge; only hashes plus counters persist; no payloads logged.\n14. Forbidden payloads rejected before egress: under-13 signals, SSNs, card numbers, health and financial special-category fields.\n15. Per-destination consent: does every record carry a consent object serialising to Google `ad_user_data`/`ad_personalization` (EEA default-deny; not required on remove) and Meta `data_processing_options` with country/state codes? Do not normalise `dataProcessingOptions` (Pixel) and `data_processing_options` (CAPI) into one key. Meta Custom Audience Terms acceptance must be detected and deep-linked, never asserted on the customer's behalf.\n\nACCESS TIER AND QUOTA\n16. Tier reality: does the change fit the tier we actually hold? Google Ads Explorer 2,880 ops/day per developer token (Basic 15,000; Standard unlimited and possibly unreachable for a headless product); Meta Development score 60 and Ads Insights 600 + 400*active_ads - 0.001*user_errors per ad account per hour, 10 async breakdown jobs per ad account per day; GA4 40,000 tokens per property per hour shared with the customer's other tools; Awin 20 req/min per user; Impact ReportExport 100/day. Does the diff count rejected Google requests against quota and back off rather than retry-storm? Is per-source budget consumption exposed in the envelope?\n17. No new long-lead dependency: does the change depend on an approval we do not hold (Meta Full Access, Google Basic/Standard, Google OAuth verification, TikTok production audit, Klaviyo 5 installs, Awin Accelerate/Advanced, Impact written approval)? If yes, name the gate, its observed timeline, and the degraded path that ships without it.\n\nCLAIMS\n18. Claim provenance: does every user-visible claim come from the brand file's allowed-claims list and is it true today? Specifically banned or gated: \"joins in one call\" (11.9 forbids), any live presentation of /v1/audience or /v1/market (11.4, 11.5), \"DPA on request\" (bar item 3 requires click-through Art. 28 DPA plus a public sub-processor page), \"3 to 5 days\" for Google OAuth verification (unsourced), SOC 2 / SAML SSO / EU hosting / \"never used to train models\" unless implemented, and any repetition of the CNIL press attribution (CNIL did not name the company).\n\nAdditionally, three standing architectural defaults should be stated once in the phase-1 design note and then assumed: (a) the public no-signup demo endpoint serves public-data modules or synthetic fixtures only; (b) the hosted AI-answer collector uses official provider APIs only, with UI-parity collection as an opt-in customer-session mode; (c) the Numbers reporting screen is a compliance artefact for Google's Required Minimum Functionality, not a nice-to-have, and nothing may be designed that requires more than 15,000 Google Ads operations per day until Google answers in writing.

---

## 6. Stack delta between the kickoff mandate (Vercel + Cloudflare + Supabase, TypeScript extractors on Workers) and spec section 7's recommendation (dlt on Trigger.dev compute), plus the cost model (section 7 cost-per-1M-calls, section 8 pricing corrections, section 10.2 maintenance economics)

Section 7 recommends dlt core plus dlt-hub verified-sources (Apache 2.0) as the extraction layer, on Trigger.dev compute, orchestrated by Cloudflare Workflows and Queues into Supabase Postgres. It pairs Workflows with Trigger.dev for exactly one reason, stated verbatim at line 718: "Cloudflare Workers has no native long-running Python, which the checker flags as directly conflicting with dlt." dlt is chosen not for its runtime but for licence and coverage: it is "Only permissive option with Facebook Ads, Google Ads and GA4 sources", against Airbyte's ELv2 trap and Meltano's unaudited per-tap licences. The kickoff's TypeScript-on-Workers mandate therefore resolves the section 7 conflict by dropping the constrained side rather than the provider, and the spec records no section 11 decision on extraction compute, so nothing in section 11 opposes the mandate. What is genuinely lost is dlt's incremental cursor state, paginator library, retry/backoff client, chunked backfill windows, structural normalisation with merge/upsert dispositions, and three pre-built verified sources; what is not lost is schema evolution, which section 13.3 rule 2 bans by policy ("a new metric requires a dictionary PR first") and which the fixed envelope in sections 2 and 7 makes unwanted. Cloudflare Workers can run these extractors, but only as decomposed Workflow steps: verified limits are 5 min CPU per invocation on Paid, 128 MB isolate memory, 6 simultaneous open connections, a 1 MiB cap on step output, 10,000 steps per instance by default (25,000 configurable), and 15 min wall-clock on cron and queue consumers — so a whole-tenant 90-day backfill exceeds the default step budget and no single invocation can hold a large Meta report in memory. On cost, section 7's own table is already stale against section 8: applying section 8's fact-checked SERP live floor of $0.002 and Sonar Pro at $0.024–$0.032 roughly doubles the blended figure from ~$0.0009 to ~$0.0018 per call, and section 11.3 abolishes per-call metering for the 80% Performance leg entirely, so the blend no longer describes a sellable unit. The mandated stack's added R2 line directly relieves the one line section 7 names as most likely to break — Supabase disk overage at $0.125/GB — because R2 Standard is $0.015/GB-month, 8.3x cheaper, but only if `raw` is an R2 key in Postgres rather than a JSONB blob.

### Findings (48)

**Section 7's one-line recommended stack is dlt extractors on Trigger.dev compute, Cloudflare Workflows and Queues for orchestration, Supabase Postgres as the store, ECB FX with an Open Exchange Rates fallback, DataForSEO SERP, and a <=25-endpoint OpenAPI so Stainless free tier generates SDKs, docs and MCP server.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:700`  
> "Recommended stack in one line: dlt (Apache 2.0) extractors running on Trigger.dev compute, orchestrated by Cloudflare Workflows and Queues, materialised into Supabase Postgres, FX from cached ECB daily rates with an Open Exchange Rates fallback, SERP bought from DataForSEO, and a hand-held OpenAPI of 25 endpoints or fewer so Stainless's free tier generates the SDKs, docs and MCP server at zero cost."

**The exact and only reason section 7 pairs Cloudflare Workflows with Trigger.dev compute is that Workers cannot host long-running Python, which the fact-checker flagged as directly conflicting with dlt. This is the whole basis of the fourth provider.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:718`  
> "| Extraction compute | Trigger.dev | Cloudflare Workers has no native long-running Python, which the checker flags as directly conflicting with dlt | Free tier $5 monthly credits / Hobby $10 / Pro $50; Small-1x $0.0000338/s; invocations $0.25 per 10,000 runs | Commercial SaaS | Running dlt on Inngest or self-hosted workers |"

**The same constraint is restated in section 7's corrections-from-fact-check list, making it a checker-owned finding rather than a researcher preference.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:797`  
> "Cloudflare Workers has no native long-running Python, so Cloudflare orchestrates but something else must run dlt. The stack table reflects this by pairing Workflows with Trigger.dev compute."

**dlt is selected on licence and source coverage, not on runtime merit. The stated reason is that it is the only permissively licensed option carrying Facebook Ads, Google Ads and GA4 sources; the rejected alternatives are Airbyte (ELv2) and Meltano/Singer (per-tap licences unaudited).**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:717`  
> "| Extraction | dlt core plus dlt-hub verified-sources | Only permissive option with Facebook Ads, Google Ads and GA4 sources | Free | Apache 2.0 | Airbyte (ELv2 trap), Meltano/Singer taps (per-tap licences unaudited) |"

**The licensing pitfall dlt was chosen to avoid does not bind a TypeScript rewrite at all. Section 7 already concludes rewriting off Airbyte is cheap enough that the conservative licence read wins; dropping dlt for hand-written TypeScript is licence-clean by construction (no third-party connector code is embedded).**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:775-779 (Licensing pitfalls)`  
> "Airbyte's certified `source-facebook-marketing` declares `license: ELv2` ... ELv2 forbids providing the products to others as a managed service. ... Rewriting on dlt is cheap enough that the conservative read wins anyway."

**What dlt actually provides that must be hand-written in TypeScript: (1) incremental cursor state (dlt.sources.incremental with last_value/initial_value/end_value and pipeline state persisted in the destination); (2) a paginator library (JSON-link, offset, page-number, header-link and cursor paginators with auto-detection) in dlt's RESTClient; (3) schema inference and evolution with contracts at table/column/data-type granularity (evolve/freeze/discard_row/discard_value); (4) a retrying HTTP client with backoff and 429/5xx handling; (5) chunked backfill windows via start_value/end_value slicing; (6) structural normalisation (nested JSON unnested into child tables with _dlt_parent_id/_dlt_list_idx, snake_case naming, type coercion, variant columns on type conflict) plus merge/upsert write dispositions with primary and merge keys, deduplication and SCD2; (7) load packages with _dlt_load_id and _dlt_loads for load-level lineage; (8) pre-built Apache-2.0 verified sources for facebook_ads, google_ads and google_analytics.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:717, 780; remainder from model knowledge of dlt`  
> dlt feature set from library knowledge; the spec asserts only the licence and coverage properties ("Only permissive option with Facebook Ads, Google Ads and GA4 sources", "dlt core (\"Copyright 2022-2026 ScaleVector\") and dlt-hub/verified-sources are both Apache 2.0")

**Three of dlt's eight capabilities are unwanted for Marketplane and their loss costs nothing. Schema evolution is banned by policy: section 13.3's connector contract requires a fixed metric dictionary and a dictionary PR before any new metric, and forbids platform-specific fields outside `raw`.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1408-1414 (13.3 contract)`  
> "2. Metric names come from the shared dictionary (`spend`, `impressions`, `clicks`, `conversions`, `conversion_value`, `revenue`); a new metric requires a dictionary PR first." and "1. Emits the envelope ... and nothing platform-specific outside `raw` (optional passthrough)."

**dlt's structural normalisation does not produce the canonical schema the spec requires. The canonical layer is Fivetran's dbt_ad_reporting naming extended with attribution_window as a dimension, which is dbt SQL and semantic, not dlt's structural unnesting. So dlt would have been a loader under a hand-built semantic layer either way.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:716, 700`  
> "| Canonical schema | Fivetran `dbt_ad_reporting` naming, extended with attribution_window as a dimension | Ready-made 11-platform hierarchy; the attribution gap is exactly the white space to fill |" and "no public schema, including `dbt_ad_reporting`, models attribution window as a dimension"

**dlt's generic retry client does not understand any of the three platform quota regimes the spec says drive the design, so quota-aware backoff is hand-written work under either stack. Named regimes: GA4 token buckets with query-complexity-dependent cost, Google Ads per-developer-token daily caps where rejected requests still count, and Meta's x-fb-ads-insights-throttle with a per-application score.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:710, 480 (3.5 key findings), 795`  
> "200,000 core tokens per property per day, 40,000 per hour, 14,000 per project per property per hour and only 10 concurrent requests on standard properties ... with token cost varying by query complexity so per-call cost is unknowable at request time"; "Rejected requests returning a GoogleAdsFailure still count against the cap"; "Meta's `x-fb-ads-insights-throttle` header carries a third field, `ads_api_access_tier`"

**The genuine loss is the three pre-built verified sources (facebook_ads, google_ads, google_analytics) and the tacit platform knowledge encoded in them, notably Meta's async insights job submit/poll/download shape and its breakdown limits.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:717, 1031`  
> "Only permissive option with Facebook Ads, Google Ads and GA4 sources"; spec-side confirmation that the async shape is load-bearing: "async breakdown jobs cap at 10 per ad account per day against a 28-day restatement window"

**Section 10.2 makes that loss cheap in the spec's own terms: AI collapsed the price of writing a connector and not of operating one, so the value dlt's verified sources supply is exactly the half that already collapsed.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:996`  
> "The decisive finding is on substitution: AI has collapsed the price of writing a connector and not the price of operating one, which is fatal specifically because the stated pitch (\"we did the integration work so you don't have to, one schema\") is the half that collapsed."

**Section 10.2 also undercuts the counter-argument that a community maintains dlt's sources for you. A funded vendor with a dedicated connectors org missed a hard Meta deadline by more than two months, with 257 open connector bugs.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1026`  
> "A funded vendor with a dedicated connectors org missed a hard Meta deadline by more than two months: Airbyte #76483 was still open, untriaged and unassigned on 18 Aug 2026 against a 9 June 2026 cutoff, alongside 257 open connector bugs and a dedicated `api-deprecations` label. That bounds what a two-person team can promise."

**The maintenance burden section 10.2 quantifies falls on the founders regardless of extraction library, so it is not a cost created by dropping dlt: roughly 20-25 forced changes across seven platforms in 24 months, 1.0-1.5 FTE per 10 connectors per year, 0.8-1.2 FTE for the six-surface MVP, 3-4.5 FTE for the full catalogue, and 0.12-0.15 FTE permanently per additional ad platform.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:996, 1042`  
> "roughly 20 to 25 discrete forced changes across the seven proposed ad platforms in the last 24 months ... arriving at 1.0 to 1.5 FTE per 10 marketing connectors per year, or about 0.8 to 1.2 FTE for the six-surface MVP and 3 to 4.5 FTE for the full catalogue (medium confidence, this is a derived estimate)" and "Each additional ad platform is a permanent 0.12 to 0.15 FTE"

**Per-platform forced-change counts in the last 24 months (section 10.2 table): Meta 4 forced version migrations plus at least 6 non-version breaking changes (roughly one per quarter); Google Ads 4 sunsets observed, moving to 4 forced migrations per year from Jan 2026; Microsoft Advertising 1 full SOAP-to-REST rewrite; Apple Search Ads 2 full migrations; LinkedIn 12 versions per year with at least an annual re-pin; Klaviyo roughly annual deprecation. TikTok and Amazon are counted at ~1 forced change per year each with no dated examples.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1000-1008`  
> "| Meta Marketing API | 4 forced version migrations plus at least 6 non-version breaking changes, roughly one per quarter |" ... "| Google Ads API | 4 sunsets observed, moving to 4 forced migrations per year from Jan 2026 |" ... "TikTok and Amazon are counted at roughly one forced change per year each in the bottom-up FTE model but carry no dated examples in this evidence base."

**Cloudflare Workers Paid CPU limit is 5 minutes per invocation (default 30 s for HTTP requests), configurable to 300,000 ms. Free is 10 ms. This is CPU time, not wall clock, so IO waiting on ad platforms is not billed and not counted against it.**  
`certain` · source: `https://developers.cloudflare.com/workers/platform/limits/ (fetched 2026-09-07)`  
> Cloudflare Workers limits page: CPU time per invocation Free "10 ms", Paid "5 min" (default 30 seconds for HTTP requests), maximum configurable "300,000 ms"

**Wall-clock ceilings that bound the scheduler: HTTP requests have no wall-clock limit while the client is connected, but Cron Triggers, Queue Consumers and Durable Object Alarms are each capped at 15 minutes. A nightly restatement sweep therefore cannot run as one cron invocation; it must start Workflow instances and return.**  
`certain` · source: `https://developers.cloudflare.com/workers/platform/limits/`  
> Workers limits: "Cron Triggers: 15 min", "Queue Consumers: 15 min", "Durable Object Alarms: 15 min", HTTP requests "No limit" while client connected

**Memory is 128 MB per isolate on both plans. This, not CPU, is the binding constraint on TypeScript extractors: a large Meta async insights report or a wide GA4 page cannot be JSON.parse'd whole. Payloads must be streamed to R2 and parsed incrementally. The spec does not mention this constraint anywhere.**  
`certain` · source: `https://developers.cloudflare.com/workers/platform/limits/ ; absence verified against docs/MARKETING-DATA-PLANE.md:698-812`  
> Workers limits: memory "128 MB" per isolate, both plans. No occurrence of "memory", "128" or "isolate" in section 7 of the spec.

**Subrequests are not a constraint on Paid: 10,000 per invocation by default, configurable up to 10 million (Free is 50). Pagination-heavy pulls fit comfortably.**  
`certain` · source: `https://developers.cloudflare.com/workers/platform/limits/`  
> Workers limits: subrequests per invocation Free "50/request", Paid "10,000/request (up to 10M)"

**Simultaneous open connections are capped at 6 per invocation on both plans. Intra-invocation fan-out is therefore capped at 6 concurrent platform fetches regardless of plan; wider fan-out must go through Queues or separate Workflow instances. This sits below GA4's 10-concurrent-request quota, so it is self-limiting for GA4 but caps throughput.**  
`certain` · source: `https://developers.cloudflare.com/workers/platform/limits/ ; docs/MARKETING-DATA-PLANE.md:710`  
> Workers limits: simultaneous open connections "6" connections waiting for response headers, both plans. GA4 side: "only 10 concurrent requests on standard properties"

**Cloudflare Workflows limits (Paid): 10,000 steps per instance by default, configurable to 25,000; CPU per step 30 s default, configurable to 5 min; wall clock per step unlimited; max step output 1 MiB; max persisted state per instance 1 GB; state retention 30 days; concurrent instances per account 50,000; instance creation rate 300/s; max queued instances 2,000,000; max retries per step 10,000; max step sleep 365 days; max event payload 1 MiB.**  
`certain` · source: `https://developers.cloudflare.com/workflows/reference/limits/ (fetched 2026-09-07)`  
> Workflows limits page, Paid column: steps "10,000 (default) / configurable up to 25,000"; CPU per step "30 seconds (default) / configurable to 5 minutes"; step output "1MiB (2^20 bytes)"; persisted state "1GB"; retention "30 days"; concurrent instances "50,000"; creation rate "300 per second per account"; sleep "365 days (1 year)"; retries "10,000"

**The 1 MiB step-output cap is the single most load-bearing Workflow constraint for this build: an extraction step cannot return a page of rows through workflow state. It must write raw to R2 and rows to Postgres and return only a key. This makes the kickoff's R2 mandate architecturally necessary, not merely nice to have.**  
`certain` · source: `https://developers.cloudflare.com/workflows/reference/limits/ ; docs/MARKETPLANE-KICKOFF-PROMPT.md:59-60`  
> Workflows: "Max step output size: 1MiB (2^20 bytes) (both plans)"; kickoff mandate: "object storage for raw platform payloads (R2)"

**step.sleep up to 365 days makes the tiered restatement ladder expressible as one durable instance per (connection, source, date) with wake-ups at D+1, D+3, D+7 and D+28, and section 7 confirms idle sleep is not billed. This is the strongest single argument for Workflows over pg_cron owning restatement.**  
`certain` · source: `https://developers.cloudflare.com/workflows/reference/limits/ ; docs/MARKETING-DATA-PLANE.md:719, 1047`  
> Workflows: "Max step sleep duration: 365 days (1 year)"; spec: "idle time during step.sleep and upstream waits is not billed"; policy: "tiered restatement (daily D-0 to D-3, weekly D-4 to D-28) with freshness as a priced tier"

**A long backfill must be decomposed into Workflow steps, for five independent reasons, any one of which is sufficient: 15 min wall clock on cron/queue consumers; 5 min CPU per invocation; 128 MB isolate memory; 1 MiB step output; 6 simultaneous connections. The natural step unit is the spec's own upsert key.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:710 ; Cloudflare Workers and Workflows limits pages`  
> "the backfill scheduler must be built around restatement windows rather than new data, upserting on (source, account_id, entity_id, date, attribution_window)" plus the five Cloudflare limits above

**The default 10,000-step ceiling is reachable by a naive whole-tenant backfill. One step per (connection, source, date) for a 40-client agency at 4 sources over a 90-day Google Ads window is 40 x 4 x 90 = 14,400 steps, which exceeds the 10,000 default and needs either the 25,000 configuration or, better, one Workflow instance per connected account (4 x 90 = 360 steps, comfortably inside).**  
`certain` · source: `https://developers.cloudflare.com/workflows/reference/limits/ ; docs/MARKETING-DATA-PLANE.md:1019, 707`  
> Workflows steps "10,000 (default) / configurable up to 25,000"; spec agency persona "40-client agency"; Google Ads window "Click-through window maximum 90 days (default 30)"

**Workflow durability is replay-based and at-least-once at the step boundary: a step whose side effect lands but whose result fails to persist will re-execute on retry. Every extraction step must therefore be idempotent, which the spec's upsert key already supports, and every R2 write must be keyed deterministically rather than by a generated id.**  
`likely` · source: `https://developers.cloudflare.com/workflows/reference/limits/ ; model knowledge`  
> Model knowledge of durable-execution semantics; supported by "Max retries per step: 10,000" implying replay-on-failure. Not stated in the spec.

**Python Workers exist but are in open beta and cannot run dlt: arbitrary PyPI installation is not supported, only pure-Python packages, PyEmscripten wheels and packages bundled in Pyodide, which excludes most native/C-extension dependencies. dlt's Postgres/Arrow/pandas dependency surface is exactly that class. Section 7's constraint is therefore correct as stated and remains correct today.**  
`certain` · source: `https://developers.cloudflare.com/workers/languages/python/ and /packages/ (fetched 2026-09-07)`  
> "Python Workers are in beta."; "Arbitrary PyPI installation is not supported. The documentation specifies a curated set of compatible packages rather than unrestricted pip access." Supported: "Pure Python packages from PyPI, PyEmscripten wheels from PyPI, Packages included in Pyodide". "Only HTTP libraries that are able to make requests asynchronously are supported. Currently, these include aiohttp and httpx."

**There is a fourth option neither the spec nor the kickoff considers: Cloudflare Containers would run dlt in Python on Cloudflare, keeping the three-provider rule while preserving section 7's extraction recommendation. Instance types run from lite (1/16 vCPU, 256 MiB, 2 GB disk) to standard-4 (4 vCPU, 12 GiB, 20 GB disk), billed at $0.0000025 per GiB-second memory, $0.000020 per vCPU-second and $0.00000007 per GB-second disk, with 25 GiB-hours memory, 375 vCPU-minutes and 200 GB-hours disk included on Workers Paid. This is worth naming in the design note as the rejected alternative, because it makes the trade-off a real choice rather than a forced one.**  
`likely` · source: `https://developers.cloudflare.com/containers/pricing/ (fetched 2026-09-07)`  
> Cloudflare Containers pricing page: instance types and "Memory: 25 GiB-hours/month included +$0.0000025 per additional GiB-second", "CPU: 375 vCPU-minutes/month + $0.000020 per additional vCPU-second", "Disk: 200 GB-hours/month +$0.00000007 per additional GB-second". GA/beta status not stated on the page.

**Section 7's published Cloudflare inclusions and rates are accurate against Cloudflare's current pricing page and can be used verbatim: 10M requests, 30M CPU-ms, 500K Workflow steps and 1 GB storage included on Workers Paid; $0.30/M requests, $0.02/M CPU-ms, $0.80/100K steps, $0.20/GB-month; Queues $0.40/M ops with 1M included. The one thing section 7 omits is the $5/month Workers Paid base fee.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:719 ; https://developers.cloudflare.com/workers/platform/pricing/`  
> Spec line 719 vs Cloudflare pricing page: "$5 USD per month" base; "10 million included per month", "$0.30 per additional million"; "30 million CPU milliseconds included", "$0.02 per additional million CPU milliseconds"; Workflows "500,000 included", "$0.80/ additional 100,000", "1 GB included", "$0.20/ GB-month"; Queues "1,000,000 operations/month included", "$0.40/million operations"

**Workers KV is included in the Workers Paid plan at 10M reads/month then $0.50/M, 1M writes and deletes/month then $5.00/M, and $0.50/GB-month storage beyond 1 GB. The write side is 10x the read price, so an envelope cache written per row rather than per query result is the KV failure mode.**  
`certain` · source: `https://developers.cloudflare.com/workers/platform/pricing/`  
> Cloudflare pricing: KV "Included reads: 10 million/month", "Read overage: $0.50/million", "Included writes/deletes: 1 million/month", "Write/delete overage: $5.00/million", "Storage rate: $0.50/ GB-month"

**R2 is $0.015/GB-month Standard ($0.01 Infrequent Access), Class A $4.50/M requests, Class B $0.36/M, egress free, with a free tier of 10 GB-month storage, 1M Class A and 10M Class B per month. Zero egress is what makes R2 viable as the raw-payload store that Postgres reads by key.**  
`certain` · source: `https://developers.cloudflare.com/r2/pricing/`  
> R2 pricing page: Standard storage "$0.015 / GB-month"; Class A "$4.50 / million requests"; Class B "$0.36 / million requests"; "Egress (data transfer to Internet)" is "Free"; free tier "10 GB-month / month", "1 million requests / month" Class A, "10 million requests / month" Class B

**R2 Standard at $0.015/GB-month is 8.33x cheaper than Supabase Pro disk overage at $0.125/GB, so moving verbatim raw payloads out of Postgres and into R2 directly relieves the exact line section 7 names as most likely to break. The relief is conditional: it only applies if the envelope's `raw` field holds an R2 key, not a JSONB blob.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:729, 720, 758 (envelope) ; https://developers.cloudflare.com/r2/pricing/`  
> $0.125 / $0.015 = 8.33. Spec: "Supabase disk overage at $0.125/GB is the line most likely to break the 8 GB included". Envelope requires: "\"raw\": { \"…\": \"verbatim platform response passthrough\" }"

**Trigger.dev bills wall-clock seconds ($0.0000338/s Small-1x plus $0.25 per 10,000 runs) while Workers bills CPU-ms only ($0.02 per million CPU-ms = $0.00002 per CPU-second) and does not bill IO wait. For extraction that is overwhelmingly IO-bound (waiting on Meta async report jobs, GA4 responses, Google Ads paging), the mandated stack is materially cheaper per unit of work, not merely equal. Section 7 already grants the equivalent property to Workflows: idle time during step.sleep and upstream waits is not billed.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:718, 719 ; https://developers.cloudflare.com/workers/platform/pricing/`  
> "Small-1x $0.0000338/s; invocations $0.25 per 10,000 runs" vs "$0.02 per additional million CPU milliseconds"; "idle time during step.sleep and upstream waits is not billed"

**Section 7's cost table has no Vercel line at all. The kickoff mandates Vercel for the marketing site, dashboard and server actions, so the fixed-monthly figure of $110-$150 is missing a provider entirely. Vercel Pro is $20 per seat per month and Hobby prohibits commercial use, so a two-founder team adds roughly $40/month.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:729 ; docs/MARKETPLANE-KICKOFF-PROMPT.md:57-58`  
> Spec fixed-monthly note names only "Cloudflare Workers Paid plus Workflows steps, Queues, Supabase Pro with a compute upgrade, and an FX plan" — no Vercel. Kickoff: "Vercel hosts the Next.js app: marketing site, dashboard, and the authenticated UI's server actions."

**Section 7's Performance cost line is priced per call against a unit section 11.3 abolished. Section 11.3 decides Performance is metered per connected account per month with restatement re-pulls included, and credits meter everything else. The spec never gives a per-connected-account-per-month COGS figure, so the mandated build has no baseline for its largest revenue line.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1212 (11.3), 729`  
> "**Decision.** Two units, not one. Performance is metered per connected account per month, with restatement re-pulls included, because that is where the cost actually accrues and how agencies budget. Credits meter everything else" against "| Performance (materialised reads) | ~$0.0001 to $0.00015 | $110 to $150 |"

**Section 11.3 also states the cost multiplier the per-call table hides: restatement-aware backfill re-pulls each account 28 to 90 days deep every night, so per-account cost is 28 to 90 times a naive pull.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1211`  
> "Architecture showed restatement-aware backfill re-pulls each account 28 to 90 days deep every night, so per-account cost is 28 to 90 times a naive pull."

**Section 7's SERP cost row is superseded by section 8: the $0.0006 standard-queue price cannot back a synchronous endpoint (about 5 minutes of queue), so the true floor is $0.002 live mode, which cuts the 2-credit SERP margin from 94% to 80%.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:879 (section 8 corrections)`  
> "The DataForSEO wholesale floor for a synchronous endpoint is $0.002, not $0.0006. This cuts the 2-credit SERP margin from 94% to 80%."

**Section 7's AI-answers cost row (~$0.010 to $0.015, flagged unverified) is superseded by section 8's corrected figures and section 11.8's decision. Section 8 gives $0.024-$0.032 for Sonar Pro at 1k in / 1k out, $0.030 for Opus 5, and about $0.003 on batched Haiku 4.5; section 11.8 forbids any flat credit price and mandates a 2-credit orchestration fee plus measured LLM cost passed through at a published per-model rate.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:814, 1238 (11.8)`  
> "AI-answer monitoring costs real money per probe ($0.024 to $0.032 for Sonar Pro at 1k in / 1k out, $0.030 for Opus 5, about $0.003 on batched Haiku 4.5)"; "**Decision.** No flat credit price for AI-answer monitoring. Charge a 2-credit orchestration fee plus the measured LLM cost passed through at a published per-model rate"

**Recomputing section 7's 80/15/5 blend with section 8's fact-checked prices roughly doubles it. Section 7 states ~$0.0009 per call ($900-$1,000 per 1M). With SERP at $0.002 live and AI answers at $0.028 (Sonar Pro midpoint): 0.80 x $0.00015 + 0.15 x $0.002 + 0.05 x $0.028 = $0.00012 + $0.0003 + $0.0014 = $0.00182, i.e. about $1,820 per 1M calls. With a batched-Haiku default at $0.003: 0.80 x $0.00015 + 0.15 x $0.002 + 0.05 x $0.003 = $0.00057, about $570 per 1M. The AI-answer model choice alone swings blended COGS 3.2x.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:732, 814, 879 (derived)`  
> Arithmetic over spec inputs: "| Blended 80/15/5 mix | ~$0.0009 | ... Roughly $900 to $1,000 in COGS per 1M calls |"; "$0.024 to $0.032 for Sonar Pro"; "about $0.003 on batched Haiku 4.5"; "$0.002 live"

**No section 11 decision addresses extraction compute, extraction library, or hosting providers. The eight contradictions section 11 resolves are MVP ordering (11.1), compliant architecture (11.2), Performance read pricing (11.3), audience writes (11.4), market module (11.5), Supermetrics MCP (11.6), Google Ads access tiers (11.7) and AI-answer monitoring cost (11.8), plus 11.9-11.11. The kickoff's stack mandate therefore has no section 11 opponent and stands.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1192-1266`  
> Section 11 subsection headings 11.1 through 11.11, none of which name extraction, dlt, Trigger.dev, Cloudflare or Vercel

**Section 15 already independently states the mandated stack for the product surface, so the kickoff and the spec agree there: Next.js on Vercel for marketing site and dashboard, Supabase for Postgres, auth, RLS and storage, Cloudflare Workers, Workflows and Queues for the public API edge and scheduled pulls.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1512`  
> "**Build stack for this surface** (section 7 covers the data plane): Next.js on Vercel for the marketing site and dashboard, Supabase for Postgres, authentication, row-level security and storage, Cloudflare Workers, Workflows and Queues for the public API edge and scheduled pulls."

**The kickoff itself scopes pg_cron narrowly and correctly: "pg_cron for light schedules", with Cloudflare owning the scheduler. Nothing in the mandate asks pg_cron to own restatement.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:59-63`  
> "Supabase holds Postgres, authentication, row-level security, storage and pg_cron for light schedules." and "Cloudflare hosts the public API edge (Workers), the scheduler (Workflows and Queues)"

**pg_cron cannot own restatement on capability grounds, not only on architecture grounds: it schedules SQL inside Postgres with minute granularity, has no durable multi-day continuation, no per-step retry, no backoff, and needs pg_net to make any HTTP call at all. Every property the restatement ladder needs — 28-day sleeps, per-step retries with platform-aware backoff, idempotent replay — is a Workflows property.**  
`likely` · source: `https://developers.cloudflare.com/workflows/reference/limits/ ; model knowledge of pg_cron`  
> Model knowledge of pg_cron and pg_net; contrast with verified Workflows limits ("Max step sleep duration: 365 days", "Max retries per step: 10,000"). Not stated in the spec.

**There is real, high-value work for pg_cron that removes Workflow steps from the budget: the pure-SQL sweep that closes restatement windows. `UPDATE facts SET is_provisional = false WHERE restates_until < now()` is a set operation over millions of rows that would otherwise be one Workflow step per row.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:756-757 (envelope) ; design inference`  
> Envelope requires the two fields the sweep operates on: "\"restates_until\": \"2026-09-11T00:00:00Z\", \"is_provisional\": true"

**Meta's rate limits are scored per application as well as per ad account, so the vendor's own Meta app is a shared bottleneck across all tenants, and async breakdown jobs cap at 10 per ad account per day against a 28-day restatement window. This is the constraint that forces a global, cross-tenant concurrency governor in the scheduler — a Queues-and-Workflows property, not a pg_cron one.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1031`  
> "Meta's rate limits are scored per application as well as per ad account, so the vendor's own Meta app is a shared bottleneck across all tenants, and async breakdown jobs cap at 10 per ad account per day against a 28-day restatement window."

**Google Ads daily limits are per developer token, not per customer, with Explorer at 2,880 production operations/day and Basic at 15,000/day, and rejected requests returning a GoogleAdsFailure still count. Section 11.7 decides to plan on 2,880/day per token in week 1. The scheduler must budget operations globally per token before dispatching, which is a scheduler responsibility the spec never assigns to a component.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:480, 1232 (11.7)`  
> "Daily API usage limits are based on the number of API operations made per developer token," with Explorer at 2,880 production operations/day and Basic at 15,000/day. Rejected requests returning a GoogleAdsFailure still count against the cap"; "**Decision.** Plan on 2,880 per day per token in week 1"

**The GA4 quota is shared with the customer's own other tools, so the scheduler must expose per-source budget consumption in the envelope and make cadence configurable. Section 3.5 states this as an implication for the build.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:485 (3.5 implications)`  
> "Treat rate limits as a customer-facing surface. GA4's 40,000 tokens per property per hour, PostHog's org-wide limits and Mixpanel's 60 queries per hour are shared with the customer's existing tools, so publish per-source budget consumption in the response envelope, make cadence configurable, and surface long backfills as multi-day jobs."

**Step-budget model for the restatement ladder at 500 connected accounts: one Workflow instance per (connection, source, date) with ~6 steps (submit, poll, land, plus D+3/D+7/D+28 re-pulls) gives 500 x 4 x 30 x 6 = 360,000 steps/month against 500,000 included, i.e. inside the free allowance but with only ~28% headroom. Beyond that, steps cost $0.80 per 100,000, so even 2M steps/month is only $12/month. Workflow steps are not a cost risk; they are a design-granularity risk.**  
`likely` · source: `https://developers.cloudflare.com/workers/platform/pricing/ ; docs/MARKETING-DATA-PLANE.md:1047 (derived)`  
> Derived from Workflows inclusions "500,000 included per month", "$0.80/ additional 100,000" and spec cadence "tiered restatement (daily D-0 to D-3, weekly D-4 to D-28)"

**The mandated stack removes the Trigger.dev fixed line entirely ($0 free tier / $10 Hobby / $50 Pro) and its per-run charge ($0.25 per 10,000 runs), and adds Vercel (~$40/month for two seats), R2 ($0 at MVP under the 10 GB / 1M Class A / 10M Class B free tier) and KV ($0 at MVP inside Workers Paid inclusions). Net fixed monthly for the mandated stack is roughly $150-$200 against section 7's $110-$150, and the entire increase is Vercel, which section 7 never costed.**  
`likely` · source: `docs/MARKETING-DATA-PLANE.md:729, 718 (derived with Cloudflare and Vercel published rates)`  
> Derived: section 7 $110-$150 fixed, minus Trigger.dev $0-$50, plus Vercel Pro 2 seats ~$40, plus R2 $0 and KV $0 at MVP scale

### Exact values (60)

- Section 7 cost-per-1M-calls table, reproduced exactly (spec lines 727-732):
- Header: | Module | COGS per call | Fixed monthly | Notes |
- Row 1 | Performance (materialised reads) | ~$0.0001 to $0.00015 | $110 to $150 | Cloudflare Workers Paid plus Workflows steps, Queues, Supabase Pro with a compute upgrade, and an FX plan. The checker notes this estimate contains no disk-growth term; at 28 to 90 day restatement depth across tenants, Supabase disk overage at $0.125/GB is the line most likely to break the 8 GB included |
- Row 2 | Visibility (SERP) | $0.0006 standard queue, $0.0012 priority, $0.002 live; $0.0038 at SerpApi Cloud 1M | $50 DataForSEO minimum deposit | Buying beats scraping: Browserbase's published Search API is $7 per 1,000, i.e. $0.007 per search, about 11.7x DataForSEO (the checker's replacement for the research's derived 6.7x) |
- Row 3 | Visibility (AI answers) | ~$0.010 to $0.015 (unverified) | Perplexity and DataForSEO balances | Perplexity Sonar request fees are $5 low, $8 medium, $12 high per 1,000 with Sonar Pro at the top of the $5-6 / $8-10 / $12-14 spans, plus tokens; DataForSEO LLM Responses is "$0.0006 + price charged by LLM" live or "$0.0002 + $0.01" prepaid, with the per-model surcharge unpublished |
- Row 4 | Blended 80/15/5 mix | ~$0.0009 | as above | Roughly $900 to $1,000 in COGS per 1M calls. A credit must be worth about $0.003 to $0.005 for a 5 to 20 credit AI-visibility multiplier to hold; at $0.001 per credit an AI-answer check needs about 40 credits |
- --- Cloudflare rates as published today (verified 2026-09-07) ---
- Workers Paid base fee: $5.00/month
- Workers requests: 10,000,000 included/month, then $0.30 per additional million
- Workers CPU: 30,000,000 CPU-ms included/month (= 8.33 CPU-hours), then $0.02 per additional million CPU-ms (= $0.00002 per CPU-second)
- Workers CPU time per invocation: Free 10 ms; Paid 5 min (default 30 s for HTTP requests); max configurable 300,000 ms
- Workers wall clock: HTTP requests no limit while client connected; Cron Triggers 15 min; Queue Consumers 15 min; Durable Object Alarms 15 min
- Workers memory: 128 MB per isolate (both plans)
- Workers subrequests per invocation: Free 50/request; Paid 10,000/request, configurable up to 10,000,000
- Workers simultaneous open connections: 6 (both plans)
- Worker script size: 64 MiB uncompressed; env vars per Worker Free 64 / Paid 128, 5 KB each
- Workflows steps per instance: Free 1,024; Paid 10,000 default, configurable to 25,000
- Workflows steps billing: 500,000 included/month, then $0.80 per additional 100,000
- Workflows CPU per step: Free 10 ms; Paid 30 s default, configurable to 5 min. Wall clock per step: unlimited
- Workflows max step output size: 1 MiB (2^20 bytes), both plans
- Workflows max event payload size: 1 MiB (2^20 bytes), both plans
- Workflows persisted state per instance: Free 100 MB; Paid 1 GB. Storage billing 1 GB included, then $0.20/GB-month
- Workflows state retention: Free 3 days; Paid 30 days
- Workflows concurrent instances per account: Free 100; Paid 50,000. Creation rate: Free 100/s; Paid 300/s. Max queued: Free 100,000; Paid 2,000,000
- Workflows max daily executions: Free 100,000/day; Paid unlimited. Max retries per step: 10,000 (both)
- Workflows max step sleep: 365 days (both plans)
- Queues: 1,000,000 operations/month included, then $0.40 per million operations
- Workers KV reads: 10,000,000/month included, then $0.50 per million
- Workers KV writes and deletes: 1,000,000/month included, then $5.00 per million
- Workers KV storage: 1 GB included, then $0.50/GB-month
- R2 Standard storage: $0.015/GB-month. Infrequent Access: $0.01/GB-month
- R2 Class A operations: $4.50 per million (Standard), $9.00 per million (Infrequent Access)
- R2 Class B operations: $0.36 per million (Standard), $0.90 per million (Infrequent Access)
- R2 egress to Internet: $0.00 (free, both classes)
- R2 free tier (Standard only): 10 GB-month storage, 1,000,000 Class A ops/month, 10,000,000 Class B ops/month
- Cloudflare Containers (the unconsidered fourth option): lite 1/16 vCPU / 256 MiB / 2 GB disk; basic 1/4 vCPU / 1 GiB / 4 GB; standard-1 1/2 vCPU / 4 GiB / 8 GB; standard-2 1 vCPU / 6 GiB / 12 GB; standard-3 2 vCPU / 8 GiB / 16 GB; standard-4 4 vCPU / 12 GiB / 20 GB
- Cloudflare Containers billing: memory 25 GiB-hours/month included then $0.0000025/GiB-second; CPU 375 vCPU-minutes/month included then $0.000020/vCPU-second; disk 200 GB-hours/month included then $0.00000007/GB-second; egress NA+EU 1 TB/month included then $0.025/GB, other regions 500 GB/month
- --- Providers being dropped or added ---
- Trigger.dev (DROPPED): free tier $5 monthly credits / Hobby $10 / Pro $50; Small-1x $0.0000338 per wall-clock second; invocations $0.25 per 10,000 runs
- Vercel (ADDED by mandate, absent from section 7's table): Pro $20 per seat per month; Hobby is free but prohibits commercial use
- Supabase Postgres Pro (unchanged): $25/mo, 8 GB disk, $10 compute credit, 250 GB egress then $0.09/GB, disk overage $0.125/GB
- FX (unchanged): ECB reference rates free (32 currency pairs, not 42); Open Exchange Rates Developer $12/mo for 10,000 req; currencyapi.com Small $9.99/mo for 15,000 req
- SERP (unchanged): DataForSEO $0.0006 standard (~5 min), $0.0012 priority (~1 min), $0.002 live (~6 s), $50 minimum deposit
- Stainless Free (unchanged): $0 at 25 endpoints or fewer, 5 seats, 100 preview builds/month
- --- Restated cost model for the mandated stack ---
- Fixed monthly, mandated stack: Cloudflare Workers Paid $5 (carries Workflows 500K steps, Queues 1M ops, KV 10M reads / 1M writes, 1 GB Workflow storage) + Supabase Pro $25 + Supabase compute upgrade ~$60-$110 + FX $0-$12 + Vercel Pro ~$40 (2 seats) + R2 $0 at MVP + KV $0 at MVP = roughly $150 to $200/month, against section 7's $110-$150
- Performance COGS per call, mandated stack: unchanged at ~$0.0001 to $0.00015, and arguably lower on the compute term because Workers bills CPU-ms only ($0.00002/CPU-s) while Trigger.dev billed wall-clock ($0.0000338/wall-s) for work that is overwhelmingly IO-bound
- Visibility (SERP) COGS, mandated stack: use $0.002 (DataForSEO live), NOT the $0.0006 standard queue in section 7's table (section 8 correction, spec line 879)
- Visibility (AI answers) COGS, mandated stack: no flat price (section 11.8). Batched Haiku 4.5 ~$0.003; Sonar Pro $0.024-$0.032; Opus 5 $0.030 at 1k in / 1k out
- Blended 80/15/5 recomputed with section 8 prices at Sonar Pro: 0.80 x $0.00015 + 0.15 x $0.002 + 0.05 x $0.028 = $0.00182/call = ~$1,820 per 1M calls (2x section 7's ~$900-$1,000)
- Blended 80/15/5 recomputed with batched Haiku default: 0.80 x $0.00015 + 0.15 x $0.002 + 0.05 x $0.003 = $0.00057/call = ~$570 per 1M calls
- Line most likely to break first, as named by the spec: "Supabase disk overage at $0.125/GB is the line most likely to break the 8 GB included" at 28-to-90-day restatement depth across tenants
- Line most likely to break first, restated for the mandated stack: unchanged (Supabase disk) IF `raw` is stored as JSONB in Postgres; relieved 8.33x if `raw` is an R2 key ($0.015 vs $0.125 per GB-month). Second candidate under the mandate is Workers KV writes at $5.00/million (1M included) if the envelope cache is keyed per row rather than per query result. Workflow steps, Queues ops and Workers CPU-ms are all under $15/month even at 500 connected accounts and are not cost risks
- --- Section 10.2 maintenance figures ---
- Forced platform changes: roughly 20 to 25 discrete forced changes across seven ad platforms in the last 24 months, including two full connector rewrites (Microsoft SOAP, Apple Campaign Management v5) landing inside the first twelve months
- Per platform: Meta 4 forced version migrations plus at least 6 non-version breaking changes; Google Ads 4 sunsets observed, moving to 4 forced migrations per year from Jan 2026; Microsoft 1 full SOAP-to-REST rewrite; Apple Search Ads 2 full migrations; LinkedIn 12 versions per year; Klaviyo roughly annual deprecation; TikTok and Amazon ~1/year each with no dated examples
- Engineers per connector: 1.0 to 1.5 FTE per 10 marketing connectors per year; 0.8 to 1.2 FTE for the six-surface MVP; 3 to 4.5 FTE for the full catalogue (medium confidence, derived). Each additional ad platform is a permanent 0.12 to 0.15 FTE
- Bottom-up basis: 7 platforms x ~2 forced changes/year x 2 to 4 engineer-weeks, triangulated against a vendor figure of ~$150k/year to maintain ten in-house integrations
- Breakeven: two founders on ramen ~$12,000/month fixed, needing $24,000/month revenue at ~50% contribution margin = 240 to 400 paying accounts (400 at $60 ARPA, 240 at $100). Two salaried founders: 640 to 1,070 accounts. Five-person team: 1,700 to 2,900 accounts
- Infrastructure line in the breakeven model: $600 to $2,000/month for six surfaces, pre-scale — the mandated stack at ~$150-$200/month sits well inside the low end of that line

### Conflicts raised (8)

- PRIMARY: dlt (section 7, line 717-718) versus hand-written TypeScript extractors on Workers (kickoff, lines 59-62). Section 7 says: extraction is dlt core plus dlt-hub verified-sources, Apache 2.0, chosen because it is the "Only permissive option with Facebook Ads, Google Ads and GA4 sources", and it must run on Trigger.dev because "Cloudflare Workers has no native long-running Python, which the checker flags as directly conflicting with dlt". The kickoff says: write extractors in TypeScript on Workers so the system stays on three providers. WHICH WINS: the kickoff, decisively, and for reasons stronger than provider consolidation. (a) Section 13.3 rule 2 bans schema evolution by policy — "a new metric requires a dictionary PR first" — and the envelope in sections 2 and 7 is a fixed, hand-authored contract with a `raw` passthrough, so dlt's single largest differentiator is not merely unused but forbidden. (b) dlt normalises structure, not semantics; the canonical layer is dbt_ad_reporting naming extended with attribution_window as a dimension, which is dbt SQL and is hand-built either way ("no public schema, including `dbt_ad_reporting`, models attribution window as a dimension"). (c) dlt's generic retry client understands none of the three quota regimes the spec says drive the design (GA4 complexity-priced tokens, Google Ads per-developer-token caps where rejected requests still count, Meta's per-application throttle score), so quota-aware backoff is hand-written under either stack. (d) Section 10.2 states the trade is favourable in the spec's own words: AI collapsed the price of writing a connector and not of operating one, so dlt's verified sources supply exactly the half that collapsed. (e) The "someone else maintains it" benefit is empirically weak in this file: a funded vendor with a dedicated connectors org left Airbyte #76483 untriaged more than two months past Meta's 9 June 2026 cutoff, with 257 open connector bugs. HONEST COST OF WINNING: roughly 2-4 engineer-weeks of TypeScript to replace what genuinely transfers — incremental cursor state, a paginator library, a retrying HTTP client, chunked backfill windows, and merge/upsert with deduplication — plus the loss of tacit platform knowledge in the Meta async-report source, plus permanent ownership of the 20-25-forced-changes-per-24-months treadmill at 0.8-1.2 FTE for the MVP surface set. RECORD IN THE PHASE 1 DESIGN NOTE as the kickoff instructs.
- SECONDARY, and it makes the primary trade-off a real choice rather than a forced one: neither the spec nor the kickoff considers Cloudflare Containers, which would run dlt in Python on Cloudflare and satisfy both the three-provider rule and section 7's extraction recommendation. Instance types run to 4 vCPU / 12 GiB / 20 GB disk with 25 GiB-hours memory, 375 vCPU-minutes and 200 GB-hours disk included on Workers Paid. The design note should name it as the considered-and-rejected alternative (rejected on operational surface area for a two-founder team, cold-start latency inside a Workflow step, and the fact that dlt's differentiating features are banned by section 13.3 anyway), not omit it — otherwise the note claims a constraint that no longer holds.
- Section 7's cost table versus section 11.3, internal to the spec. Section 7 prices Performance at ~$0.0001-$0.00015 per call; section 11.3 decides "Two units, not one. Performance is metered per connected account per month, with restatement re-pulls included" and notes per-account cost is 28 to 90 times a naive pull. WHICH WINS: section 11.3, by the kickoff's own precedence rule. Consequence: the largest revenue line has no COGS baseline anywhere in the spec. The build must derive a per-connected-account-per-month COGS from the restatement ladder (rows/night x depth x sources) before any pricing page exists, and every design note's cost estimate for the data plane must be stated per connected account per month, not per call.
- Section 7's SERP cost row versus section 8's correction, internal to the spec. Section 7 row 2 leads with $0.0006 standard queue; section 8 states "The DataForSEO wholesale floor for a synchronous endpoint is $0.002, not $0.0006. This cuts the 2-credit SERP margin from 94% to 80%." WHICH WINS: section 8 (its own preamble says the checker is preferred throughout). Use $0.002 for any synchronous /v1/visibility endpoint; $0.0006 is only available to scheduled/queued collection, which is a legitimate second tier worth building precisely because the spec's watch and diagnose surfaces are scheduled.
- Section 7's AI-answers cost row versus sections 8 and 11.8, internal to the spec. Section 7 gives ~$0.010-$0.015 (flagged unverified); section 8 corrects to $0.024-$0.032 for Sonar Pro, $0.030 for Opus 5, ~$0.003 batched Haiku 4.5; section 11.8 decides there is no flat credit price at all. WHICH WINS: 11.8 plus section 8's numbers. Consequence: section 7's blended $0.0009 per call is understated roughly 2x on a premium-model default and overstated on a batched-Haiku default; the model choice alone swings blended COGS 3.2x, so the default model is a pricing decision, not an engineering one.
- Kickoff versus section 11.9 on connector scope, minor. Section 11.9 narrows to "Meta, Google, GA4 and one affiliate network, with SERP bought wholesale"; the kickoff names "Google Ads (Explorer access), GA4, Search Console, Meta Marketing API, plus one affiliate network". Search Console is the delta. NOT A REAL CONFLICT: section 9's build track schedules Search Console in weeks 3-4 and section 9's exclusion list keeps it as a free join inside diagnose rather than a billable endpoint. Build it, do not meter it.
- No conflict exists between the mandated stack and any section 11 decision. Section 11 resolves eight contradictions (11.1-11.8) plus 11.9-11.11 and none of them touches extraction compute, extraction library, or hosting providers. Section 15 line 1512 independently specifies the same three-provider stack for the product surface. The kickoff's stack mandate therefore stands unopposed by section 11, and the only spec-level constraint it overrides is the section 7 stack-table cell at line 718, which the kickoff explicitly instructs be recorded rather than silently overridden.
- Latent conflict the mandate creates and the spec does not anticipate: Cloudflare Workers' 128 MB isolate memory and 1 MiB Workflow step-output cap are not mentioned anywhere in section 7, yet they forbid the most natural TypeScript implementation (fetch a report, JSON.parse it, return the rows from the step). Every extractor must stream to R2 and return a key. If a builder agent is not briefed on this, the first Meta async-report connector will pass fixtures and fail on a real large account. This is the single highest-risk unbriefed constraint in the mandated stack.

### Open or unverified (15)

- Section 7 marks the AI-answers COGS row "~$0.010 to $0.015 (unverified)" and its open questions add: "What does a DataForSEO LLM Responses call total once the model's own tokens are added? The ~$0.012 figure is triangulated from Perplexity rates and could be off by 2 to 3x in either direction (unverified)." Anything priced off this number must be flagged in the PR.
- Section 8 marks the Performance COGS of ~$0.0001/call as unverified, and the ~98% gross margin as "unverified, rests on the COGS estimate". The entire Performance economics of the build sit on an unverified compute estimate.
- Section 7's cost table "contains no disk-growth term" per its own checker. The mandated stack adds two further uncosted terms the spec never had: R2 object count and KV write volume. Neither has a spec baseline.
- Section 8 open question: "What is blended Performance COGS once OAuth refresh, rate-limit backoff, retry storms and delayed-conversion re-reads are counted? The ~98% margin assumption collapses if platform limits force 3x to 5x redundant polling per useful row." This is precisely what the mandated Workers-based scheduler determines, and it is unanswered.
- Section 10.2 marks the 1.0-1.5 FTE per 10 connectors figure medium confidence and its open questions concede it "rests on a bottom-up count plus one self-interested vendor estimate". The engineers-per-connector number that justifies or condemns the dlt trade-off is itself unverified.
- Section 10.2 marks the whole breakeven model (founder draws, infrastructure $600-$2,000, tooling/SOC2/legal, ~50% contribution margin, blended ARPA $40-$100) medium confidence, sourced to a single vendor blog model.
- Section 7 open question: "Does Google Ads publish any authoritative freshness or conversion-finalisation statement the way Meta does? Three attempts found nothing. Without one, the 90-day window is an upper bound rather than a documented SLA, and 90-day nightly re-pulls may be over-engineered. Measure empirically on a live account first." The Workflow step budget and the R2 object count both scale linearly with this depth.
- Section 7 open question: "Does Meta's 28-day clock start at delivery or at first report?" Unresolved; if it is first report the restatement ladder extends well past 28 days and the step budget grows accordingly.
- Section 7 open question: "What are ClickHouse Cloud's compute and storage rates? Nothing is published, so the Postgres-versus-columnar crossover cannot be costed." The mandate forecloses this anyway (Supabase Postgres only), so the crossover point at which Postgres becomes the wrong store is unknown and unmonitored.
- Section 7 open question: "What is the per-tenant OAuth refresh and revocation burden at scale? At 500 customers across four platforms that is 2,000 credentials to keep alive, and no vendor documentation covers the operational cost." This lands squarely on the mandated Workers/Supabase-vault design and has no cost line anywhere.
- Section 3.5 open question, load-bearing for the whole quota model: "If every tenant brings their own developer token, whose token appears in the request? Google usually grants one developer token per company and forbids using a third party's without written permission; the mechanics of per-tenant tokens in a multi-tenant service are undocumented."
- Section 11.11 residual risk, High: "Google Ads Standard Access has no path for a headless product". Design partners must live within Basic limits and a minimal reporting UI may be required.
- Cloudflare Containers GA-versus-beta status could not be determined from its pricing page; treat the fourth-option alternative as available-but-unconfirmed-maturity.
- Cloudflare Workflows at-least-once step semantics and the exact replay behaviour on partial side effects were not verified from documentation in this pass; the idempotency requirement is inferred from the retry limit and general durable-execution semantics.
- Vercel Pro seat pricing and the Hobby commercial-use prohibition were not verified in this pass; the ~$40/month two-seat figure is from model knowledge and should be confirmed before it enters a design note.

### Recommendation

TAKE THE MANDATE, AND RECORD IT AS A WIN RATHER THAN A CONCESSION. dlt's decisive features (schema inference and evolution) are banned by section 13.3 rule 2 and made unnecessary by the fixed envelope; its normalisation is structural where this product needs semantic (dbt_ad_reporting plus attribution_window, hand-built either way); its retry client understands none of the three quota regimes that actually drive the design; and section 10.2's own finding is that connector writing is the half AI collapsed. The residual loss is 2-4 engineer-weeks of TypeScript plumbing plus the tacit platform knowledge in three verified sources. Name Cloudflare Containers in the phase 1 design note as the considered-and-rejected way to keep dlt on three providers, so the note records a choice and not a false constraint.

COMPONENT MAP, provider by piece:

VERCEL (Next.js): marketing site (static generation, edge cached, built from design/marketplane/Main.dc.html); customer dashboard (Connect, Ask, Watch, Numbers, Usage and billing, Developers, Settings); server actions for all authenticated UI mutations; the OAuth redirect/callback endpoints for Google and Meta, because they need a browser-visible domain and session. Vercel touches no scheduled work and no public API traffic.

CLOUDFLARE WORKERS (edge): the public REST API and the MCP server (both under the <=25-endpoint budget so Stainless free tier holds); envelope assembly and serialisation; per-key auth, spend budgets and rate limiting using the x-mcp-header tenant/region hint so the edge routes without parsing bodies; credit accounting writes; Cron Triggers that read the due-work view and start Workflow instances. Constraint to brief every builder: 128 MB isolate, 6 simultaneous connections, 5 min CPU per invocation, 15 min wall clock on cron and queue consumers.

CLOUDFLARE WORKFLOWS: the restatement scheduler, which is the heart of the system. One instance per (connection, source, ingest_date), with steps for submit, poll, land, and step.sleep-driven re-pulls at D+1, D+3, D+7 and D+28 (365-day sleep ceiling, idle not billed). One instance per connected account for backfills, never one per tenant — 4 sources x 90 days = 360 steps per account, safely inside the 10,000 default, whereas a 40-client agency in one instance is 14,400 and blows it. Every step returns an R2 key or a row count, never rows: the step-output cap is 1 MiB. Every step is idempotent on (source, account_id, entity_id, date, attribution_window). Meta's async insights job is the canonical Workflow shape: submit, sleep, poll, download, respecting the 10-async-jobs-per-ad-account-per-day cap.

CLOUDFLARE QUEUES: the cross-tenant concurrency governor. One queue per platform with a consumer concurrency cap set below the platform's per-application budget — this is the only place Meta's per-application throttle score and Google Ads' 2,880-per-developer-token daily cap can be enforced globally, because both are shared bottlenecks across all tenants and neither is visible from inside a single Workflow instance. Consumers are capped at 15 min wall clock, so a consumer dispatches Workflow instances rather than doing work.

CLOUDFLARE R2: verbatim raw platform payloads, one deterministically keyed object per (source, account, date, window, fetched_at), written by streaming from the platform response so nothing large is ever held in the 128 MB isolate. The envelope's `raw` field holds the R2 key and the API hydrates it on request. This is load-bearing twice over: it makes the 1 MiB step-output cap workable, and at $0.015/GB-month it takes the growth term off Supabase's $0.125/GB disk overage, the line section 7 names as most likely to break first.

CLOUDFLARE KV: the envelope cache, keyed on (workspace, query hash, as_of) with a short TTL, written once per query result and never per row — the write side is $5.00/million against 1M included and is the one KV line that can break. Also read-only config and feature flags. Not for anything requiring read-after-write consistency.

SUPABASE POSTGRES: the canonical store — fact tables upserted on (source, account_id, entity_id, date, attribution_window), the metric dictionary, the entity graph including the `competitor` entity kept for diagnose, bitemporal as_of history, the OAuth grant vault, organisations/workspaces/members/connections/API keys with RLS keyed on organisation and workspace, and the credit ledger. It stores R2 keys, not raw JSONB.

SUPABASE pg_cron: the light, pure-SQL, non-networked half of scheduling, and nothing else. It owns (1) the restatement close sweep — UPDATE ... SET is_provisional = false WHERE restates_until < now(), a set operation that would otherwise be one Workflow step per row and is the single largest step-budget saving available; (2) partition creation and retention pruning on the fact tables and as_of history; (3) materialised-view refresh for the Numbers screen; (4) credit-ledger period close, spend-cap counter rollover and monthly grant reset; (5) connection-health flag derivation from last_success_at, raising needs_reauth for the dashboard while a Worker does the actual token refresh; (6) maintaining the due-work view (connections x restatement policy x last_pulled_at) that the Cloudflare Cron Trigger reads. pg_cron is the clock and the bookkeeper. It never makes an HTTP call, never owns a retry, never owns a multi-day continuation.

EXTERNAL, unchanged from section 7: DataForSEO for SERP (use $0.002 live for synchronous endpoints, $0.0006 standard queue only for scheduled watch and diagnose collection); ECB reference rates cached daily with Open Exchange Rates at $12/month as the fallback for the ~10 currencies beyond ECB's 32 pairs; Stainless Free for SDK, docs and MCP generation at <=25 endpoints.

COST DISCIPLINE FOR EVERY DESIGN NOTE: state the estimate per connected account per month, not per 1M calls, because section 11.3 abolished per-call metering for Performance and section 7's table is priced against a unit that no longer exists. Budget the three lines that can actually break, in order: Supabase disk if raw ever lands in Postgres; KV writes if the cache is keyed per row; Workflow steps if step granularity ever drops below (connection, source, date). Workers CPU-ms, Queues operations and R2 operations are all under $15/month at 500 connected accounts and should not be optimised for.

---

## 7. Repository layout decision (scaffold shape, package manager, test runner, lint/format, CI, commit/branch conventions, design-note template)

The repository is empty of code (three files: README.md, docs/MARKETING-DATA-PLANE.md, docs/MARKETPLANE-KICKOFF-PROMPT.md, plus design/marketplane/{Main.dc.html,support.js}), so there are no conventions to build inside; the decision is purely what to scaffold. The decision is (b): a pnpm-workspaces monorepo with apps/web, apps/api-edge, apps/scheduler, apps/mcp and packages/{brand,tokens,contract,db,connectors,documents} plus supabase/ at the repository root. The deciding constraint is the two single-source non-negotiables: brand.ts must be read by Node (Next on Vercel), workerd (three Cloudflare Workers) and Deno (Supabase edge functions), and tokens.css must be read by Tailwind in Next AND by Worker-rendered emails and PDFs — only a named workspace package makes that a declared, build-enforced dependency instead of a convention. Option (a) fails on three checkable points: Vercel's automatic skip-unaffected requires workspace membership with explicit package.json deps, Cloudflare Workers Builds needs a per-Worker Root directory with its own package boundary, and a single root tsconfig cannot hold @cloudflare/workers-types and Next's DOM lib without global collisions on fetch/Request/Response/caches. Every platform in the stack is verified to support this shape: Vercel documents Root Directory plus filtered installs (pnpm install --filter web...), Cloudflare Workers Builds documents Root directory, Build command, Deploy command and Build watch paths per Worker, Supabase's CLI defaults to ./supabase/config.toml at the repository root with pgTAP tests under supabase/tests/ run by supabase test db, and Tailwind v4's own docs say shared theme variables "can be maintained in a separate package within a monorepo". Two toolchain facts constrain the build and must be pinned: @cloudflare/vitest-pool-workers@0.22.0 peers vitest ^4.1.0 while vitest latest is 5.0.0, and Next.js does not understand TypeScript project references, so internal packages must ship raw TypeScript consumed via transpilePackages rather than composite builds. Section 7's Stainless plan is dead — Stainless announced on 2026-05-18 that it is joining Anthropic and winding down all hosted products with new signups, projects and SDKs unavailable — so the repository must own openapi/ and hand-write apps/mcp rather than outsource SDK/docs/MCP generation.

### Findings (26)

**The repository has no code, no package.json, no CI and no conventions to inherit; the only prior art is three markdown/HTML documents and one design runtime file. 'Build inside this repository's conventions' is therefore a null option — the only real choice is what shape to scaffold.**  
`certain` · source: `/home/user/dataaggregator (find, git log)`  
> find output: ./design/marketplane/Main.dc.html, ./design/marketplane/support.js, ./README.md, ./docs/MARKETPLANE-KICKOFF-PROMPT.md, ./docs/MARKETING-DATA-PLANE.md. git log: 3 commits (3651cde Initial commit, 01f6386 docs: add binding specification…, a057890 Merge pull request #1).

**The brand file has at least four distinct runtimes as consumers, which is what forces a package rather than a directory: Next server/client on Vercel (Node), the public API edge and scheduler and MCP server on Cloudflare (workerd), Supabase edge functions (Deno), and CI codegen for the SDK README.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:43-48`  
> "Every page, email, invoice, generated document, MCP server description and SDK README reads from it. No string that identifies the company appears anywhere else."

**The tokens stylesheet has two incompatible consumption modes — a Tailwind/PostCSS pipeline in Next, and raw string inlining inside a Worker that renders emails and PDF exports. A single package that emits both tokens.css (verbatim) and a generated tokens.ts custom-property map satisfies both without duplicating a value.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:49-56`  
> "Tailwind's theme maps onto those variables; shadcn components are re-themed from them; the marketing site, the dashboard, emails and PDF exports all consume them. Nothing hard-codes a hex value outside this file."

**Tailwind v4's own documentation blesses the tokens-as-workspace-package pattern explicitly, and gives the exact mechanism for mapping an existing custom property into Tailwind's theme without redefining the value.**  
`certain` · source: `https://tailwindcss.com/docs/theme, https://tailwindcss.com/docs/colors (via Context7 /websites/tailwindcss)`  
> "Shared theme variables can be maintained in a separate package within a monorepo or published as an NPM package." and `@theme inline { --color-canvas: var(--acme-canvas-color); }` with `[data-theme="dark"]` overrides on :root.

**Vercel builds a monorepo app by setting Root Directory to the app folder; automatic skipping of unaffected projects requires pnpm workspaces with a pnpm-workspace.yaml, unique package names, and inter-package dependencies declared explicitly in each package.json. Option (a)'s relative-import sharing declares nothing, so every commit would rebuild the web app.**  
`certain` · source: `https://vercel.com/docs/monorepos (last_updated 2026-08-11)`  
> "The monorepo must be using npm, yarn, pnpm, or Bun workspaces… Packages in the workspace must be included in the workspace definition (`workspaces` key in `package.json` for npm and yarn or `pnpm-workspace.yaml` for pnpm)… All packages within the workspace must have a **unique** `name` field… Dependencies between packages in the monorepo must be explicitly stated in each package's `package.json`."

**Vercel supports filtered installs so the web build does not install the Workers' dependency tree.**  
`certain` · source: `https://vercel.com/docs/monorepos#filtered-installs`  
> vercel.json: {"installCommand": "pnpm install --filter web..."}

**Cloudflare Workers Builds natively supports a monorepo with multiple Workers on one repository: each Worker gets its own Root directory, Build command, Deploy command (default `npx wrangler deploy`) and Build watch paths. This closes the 'how does wrangler build a worker in a monorepo' question without a custom CI deploy job.**  
`certain` · source: `https://developers.cloudflare.com/workers/ci-cd/builds/configuration/`  
> Field names: "Root directory" (optional, "helpful in monorepos to isolate a specific project within the repository for builds"), "Build command", "Deploy command" ("will default to npx wrangler deploy"), "Build variables and secrets", "Build watch paths" ("a new build and deploy will trigger for each Worker if the change is within each of its included watch paths").

**Wrangler's documented monorepo limitation is confined to automatic framework detection, not to bundling a Worker that imports a workspace package. It does not apply to a hand-written wrangler.jsonc Worker, and workspace-root node_modules export resolution was fixed in workers-sdk.**  
`likely` · source: `https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/ ; https://github.com/cloudflare/workers-sdk/pull/7130`  
> "Support for monorepos and npm/yarn/pnpm workspaces is currently limited. Wrangler analyzes the project directory where you run the command, but does not detect dependencies installed at the workspace root" — stated on the automatic-configuration (framework detection) page, whose failure mode is "framework detection to fail if the framework is listed as a dependency in the workspace's root package.json". Separately, cloudflare/workers-sdk PR #7130 "Fix wrangler module import under npm monorepos" makes wrangler resolve workspace-root node_modules rather than only a relative node_modules.

**Supabase belongs at the repository root, not under apps/. The CLI defaults to ./supabase/config.toml relative to the working directory; a non-root location requires SUPABASE_WORKDIR or --workdir on every CLI invocation and every CI step, for zero benefit.**  
`certain` · source: `https://supabase.com/docs/guides/local-development/managing-config ; https://supabase.com/docs/guides/local-development/overview`  
> "When you run `supabase init`, it creates ./supabase/config.toml… You may override the directory path by specifying the SUPABASE_WORKDIR environment variable or --workdir flag." Migrations live in supabase/migrations.

**The kickoff's foundation requirement of 'row-level security tests' has a native runner that is not the JS test runner: pgTAP SQL files under supabase/tests/, executed by `supabase test db`. This is a second, SQL-shaped test surface the CI must carry, and it is another reason supabase/ sits at the root.**  
`certain` · source: `https://supabase.com/docs/guides/database/testing`  
> "all SQL files use pgTAP as the test runner"; test files follow supabase/tests/<table>_rls.test.sql; runnable by `supabase test db`, `pg_prove`, or plain psql; minimum CLI v1.11.4.

**The test runner must be pinned to Vitest 4.1.x, not the latest 5.0.0, because the Cloudflare Workers test pool has not moved to Vitest 5. Using `latest` will break Worker integration tests on the first install.**  
`certain` · source: `npm registry (npm view @cloudflare/vitest-pool-workers version peerDependencies; npm view vitest dist-tags)`  
> @cloudflare/vitest-pool-workers@0.22.0 peerDependencies: {"vitest": "^4.1.0", "@vitest/runner": "^4.1.0", "@vitest/snapshot": "^4.1.0"}. npm view vitest dist-tags: latest 5.0.0, V4 4.1.11.

**Internal packages must export raw TypeScript and be listed in Next's `transpilePackages`, NOT wired with TypeScript project references / composite builds, because Next.js does not understand project references. This also removes the per-package build step entirely: wrangler's esbuild compiles TS directly and Deno reads TS directly, so only packages/tokens needs a generator.**  
`likely` · source: `https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages (via Context7 /vercel/next.js) ; https://github.com/vercel/next.js/issues/67372`  
> Next docs: "Use `transpilePackages` in `next.config.js` to explicitly include external packages for bundling, which is useful for packages not pre-bundled, such as those from a monorepo" and "useful for dependencies shipping raw TypeScript, JSX, or modern syntax". Against: open issue vercel/next.js#67372 "Next.js does not understand TypeScript project references".

**pnpm's strict, non-hoisted node_modules is a correctness feature for this specific project, not just a speed one: a Worker that imports a package it did not declare fails at build time, which is what makes 'no string that identifies the company appears anywhere else' and 'nothing hard-codes a hex value outside this file' enforceable rather than aspirational. npm workspaces hoist, so an undeclared import silently succeeds.**  
`likely` · source: `pnpm -v (10.33.0); https://pnpm.io/settings`  
> pnpm 10.33.0 installed; pnpm settings doc: "Only auth and registry settings are read from .npmrc files. All other settings (like hoistPattern, nodeLinker, shamefullyHoist, etc.) must be configured in pnpm-workspace.yaml".

**pnpm 10 catalogs give one place to pin every version across all apps and packages, which is the mechanism that keeps the vitest 4.1.x pin (and react/next/tailwind/wrangler) from drifting between workspaces as two founders add packages.**  
`certain` · source: `https://pnpm.io/settings (catalogs)`  
> pnpm-workspace.yaml supports `catalog:` (default versions) and `catalogs:` (named sets), e.g. `catalog:\n  chalk: ^4.1.2`.

**Section 7's SDK/docs/MCP generation plan is void: Stainless announced on 2026-05-18 that it is joining Anthropic and winding down all hosted products, with new signups, projects and SDKs immediately unavailable. The repository must therefore own the OpenAPI document and hand-write the MCP Worker; a top-level openapi/ directory and apps/mcp are consequences of this, not optional extras.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:700,723,773,924 vs https://www.stainless.com/blog/stainless-is-joining-anthropic/`  
> Spec: "a hand-held OpenAPI of 25 endpoints or fewer so Stainless's free tier generates the SDKs, docs and MCP server at zero cost" (700) and "| SDK and MCP generation | Stainless Free | 5 generators… | $0 at 25 endpoints or fewer, 5 seats, 100 preview builds/month |" (723). Against: "As Stainless focuses on Claude Platform capabilities… it will wind down all hosted Stainless products" and "Starting immediately, new signups, projects, and SDKs are not available" (2026-05-18).

**The kickoff's Workers-only extraction rule eliminates a second language toolchain from the tree. Section 7 recommends dlt (Python) on Trigger.dev; the kickoff overrides it with TypeScript extractors on Workers. This means no pyproject.toml, no uv/poetry, no Python CI matrix — packages/connectors is plain TypeScript.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:60-62 ; docs/MARKETING-DATA-PLANE.md:797 (Corrections from fact-check)`  
> "Write extractors in TypeScript on Workers rather than adopting a Python extraction library, so the whole system stays on these three providers; record the trade-off against section 7's dlt recommendation in the phase 1 design note." The spec itself concedes the reason: "Cloudflare Workers has no native long-running Python, so Cloudflare orchestrates but something else must run dlt."

**Section 13.3's connector unit shape maps onto one workspace package with no friction: packages/connectors/src/sources/<name>/{client.ts,normalize.ts,backfill.ts,fixtures/,contract.test.ts}. Keeping all connectors in one package (rather than one package per connector) is the two-founder answer — the contract test, the metric dictionary and the envelope are shared, and 13.3's rule that 'a new metric requires a dictionary PR first' is enforced by making the dictionary a different package (packages/contract) that connectors import.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1398, 1406-1412`  
> "Each connector is a self-contained unit: `sources/<name>/{client,normalize,backfill,fixtures,contract.test}`." and "Metric names come from the shared dictionary (`spend`, `impressions`, `clicks`, `conversions`, `conversion_value`, `revenue`); a new metric requires a dictionary PR first."

**The account model in section 15 dictates the foundation migration set and the RLS test set exactly: organisation, workspace, member (owner/admin/analyst/viewer), connection, api_key — with tenant isolation 'enforced at the database row level' and 'No cross-workspace aggregation ever'.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1489-1495`  
> "| Organisation | The paying company… Strict tenant isolation enforced at the database row level. | Workspace | One client or brand inside an organisation… No cross-workspace aggregation ever. | Member | …Roles: owner, admin, analyst, viewer. Invited by email. | Connection | One authorised platform account in a workspace… | API key | …Scoped to a workspace, with a spend budget and an allow-list of tools. |"

**Section 15's eight dashboard screens fix the app router group layout for apps/web: Connect, Ask, Watch, Numbers, Usage and billing, Developers, Settings — preceded by sign-up/organisation/workspace creation. Only sign-up, invite acceptance and settings/members are in the foundation milestone; the other six are route stubs.**  
`certain` · source: `docs/MARKETING-DATA-PLANE.md:1503-1510`  
> "1. Sign up and create an organisation, then the first workspace. 2. Connect… 3. Ask… 4. Watch… 5. Numbers… 6. Usage and billing… 7. Developers: API keys, the MCP setup prompt, the agent skill file, SDK snippets, request logs. 8. Settings: members and roles, data region, data deletion, sub-processor list, audit log."

**A naive 'no company string outside brand.ts' guard is unimplementable, because infrastructure identifiers legitimately carry the name: wrangler Worker names, wrangler route patterns containing the domain, supabase config.toml project_id, and the @marketplane/* package scope. The guard must be a match test (assert the literal equals the brand value) for these files and a ban everywhere else, with a written allowlist.**  
`likely` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:43-48 (rule) vs wrangler/supabase config requirements`  
> Rule: "No string that identifies the company appears anywhere else." Unavoidable carriers: wrangler.jsonc `name`, wrangler `routes[].pattern` (api.<domain>/*), supabase/config.toml `project_id`, package.json `name` fields, pnpm-workspace.yaml.

**Commit convention is already established by the repository's only content commit and should be adopted rather than invented: Conventional Commits with a lowercase type, a wrapped body at ~88 columns, and two trailers.**  
`certain` · source: `git log 01f6386 (full format)`  
> Commit 01f6386: subject "docs: add binding specification, kickoff brief and design artboard"; trailers "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" and "Claude-Session: https://claude.ai/code/session_...".

**Branch convention is likewise already established: agent branches are claude/<slug>-<6-char-id>, merged to main by pull request, never pushed to main directly.**  
`certain` · source: `git branch -a; git log`  
> Branches: `claude/marketplane-build-kickoff-cgbfxz`, `main`; merge commit a057890 "Merge pull request #1 from Mouthfully/claude/marketplane-build-kickoff-cgbfxz". Remote: https://github.com/Mouthfully/dataaggregator.

**Every design note has three mandatory sections from the kickoff, plus two more forced by the kickoff's conflict and unverified-flag rules, plus one forced by its no-scope-widening rule.**  
`certain` · source: `docs/MARKETPLANE-KICKOFF-PROMPT.md:5,10,104,105`  
> "Each PR carries a short design note under `docs/marketplane/` with the cost estimate, the platform-terms check, and what was left out." (104) + "Where it and the specification disagree, the specification's section 11 decisions win and the conflict is recorded in the phase design note under `docs/marketplane/`." (5) + "Where it marks something as unverified or open, do not build on it without flagging it in the PR." + "Never widen scope in a PR; open an issue instead." (105)

**The design artboard's own token values do not match the kickoff's description of them, which is a design-system problem but has a layout consequence: packages/tokens must expose semantic role names so the value fight is settled in one file without touching any consumer.**  
`certain` · source: `design/marketplane/Main.dc.html:11-56 vs docs/MARKETPLANE-KICKOFF-PROMPT.md:49-56`  
> Artboard uses `font-family: "Figtree"`, `'Young Serif', Georgia, serif` for display, `'Geist Mono', monospace`, ground `#F4F6FA`, ink `#0F172A`, action `#2563EB`, border `#CBD5E1`, radius `20px`, shadow `0 24px 60px rgba(15,23,42,0.12)`. Kickoff says "electric indigo as the single call-to-action colour, teal for reads, coral for writes and competitor alerts, amber for restatements, Geist and Geist Mono" — no teal, coral, amber or Geist sans appears in the artboard.

**Turborepo is not worth its cost at foundation. Its main lever (dependsOn ^build caching) is neutralised by source-only internal packages that have no build step, and both deploy targets already do their own change detection (Vercel skip-unaffected, Workers Builds watch paths). pnpm -r / --filter covers a 10-workspace repo; adopt turbo only if CI wall time exceeds ~4 minutes.**  
`likely` · source: `https://vercel.com/docs/monorepos ; https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ ; npm view turbo version`  
> Vercel documents `turbo run build --filter=web` as one option but also documents plain filtered installs; Workers Builds documents per-Worker "Build watch paths". turbo latest is 2.10.12 (one turbo.json), so adoption later is cheap and reversible.

**Bun and npm workspaces were considered and rejected. Bun 1.3.11 is installed and Vercel supports Bun workspaces, but wrangler and the Supabase CLI are npm-shaped and Bun has no catalog equivalent for central version pinning. npm 10.9.7 hoists, which defeats the undeclared-import guard that makes the two single-source rules enforceable.**  
`likely` · source: `shell (node -v, npm -v, pnpm -v, bun -v, corepack -v)`  
> Installed: node v22.22.2, npm 10.9.7, pnpm 10.33.0, yarn 1.22.22, bun 1.3.11, corepack 0.34.6.

### Exact values (21)

- Installed toolchain: node v22.22.2 | npm 10.9.7 | pnpm 10.33.0 | yarn 1.22.22 | bun 1.3.11 | corepack 0.34.6 | wrangler NOT installed | supabase CLI NOT installed | deno NOT installed
- next = 16.3.4 (engines: node >=20.9.0; peer react ^18.2.0 || ^19.0.0; peer @playwright/test ^1.51.1)
- react = 19.2.8
- typescript = 7.0.2 (latest, stable 2026-07-08, Go-native; other stable lines available: 6.0.3, 5.9.3)
- tailwindcss = 4.3.3 ; @tailwindcss/postcss = 4.3.3
- wrangler = 4.129.0
- @cloudflare/workers-types = 5.20260907.1
- @cloudflare/vitest-pool-workers = 0.22.0 — peerDependencies vitest ^4.1.0, @vitest/runner ^4.1.0, @vitest/snapshot ^4.1.0
- vitest: latest = 5.0.0, V4 tag = 4.1.11 — PIN 4.1.11 (5.0.0 breaks the Workers pool)
- @biomejs/biome = 2.5.12 ; eslint = 10.10.0 ; prettier = 3.9.6 ; oxlint = 1.81.0
- turbo = 2.10.12 ; @changesets/cli = 3.0.2 (NOT recommended) ; syncpack = 15.3.3 (NOT needed, catalogs replace it)
- supabase (npm CLI) = 2.116.0 ; zod = 4.5.4 ; shadcn = 4.21.0 ; react-email = 6.9.3 ; @react-email/components = 1.0.12 ; drizzle-orm = 0.45.2
- Vercel project settings to use: Root Directory = apps/web ; Install Command = pnpm install --filter @marketplane/web... ; Build Command = framework default (next build) ; Skip deployment toggle = Enabled (under Root Directory settings) ; optional apps/web/vercel.json { "relatedProjects": [...] } (max 3 linked projects)
- Cloudflare Workers Builds fields (one connected Worker per app): "Root directory" = apps/api-edge | apps/scheduler | apps/mcp ; "Build command" (optional) ; "Deploy command" default `npx wrangler deploy` ; "Build variables and secrets" ; "Build watch paths" = apps/<name>/**, packages/**, pnpm-lock.yaml
- Supabase CLI defaults: ./supabase/config.toml ; ./supabase/migrations ; ./supabase/tests (pgTAP, run by `supabase test db`, min CLI v1.11.4) ; override only via SUPABASE_WORKDIR env or --workdir flag
- Tailwind v4 wiring in apps/web/app/globals.css: `@import "tailwindcss";` then `@import "@marketplane/tokens/tokens.css";` then `@theme inline { --color-ground: var(--mp-color-ground); ... }` ; dark values under `:root:not([data-theme="light"])` @media (prefers-color-scheme: dark) and `:root[data-theme="dark"]`
- Stainless config location (for the record, now unusable): .stainless/{workspace.json, openapi.json, stainless.yml} at repo root; hosted products wound down 2026-05-18, "new signups, projects, and SDKs are not available"
- package.json packageManager field = "pnpm@10.33.0" ; .node-version file = "22"
- Design artboard literal values (for packages/tokens/src/tokens.css seeding): ground #F4F6FA, card #FFFFFF, ink #0F172A, muted ink #475569, faint ink #64748B, border #CBD5E1, hairline #E2E8F0, tint #F9FAFC, action #2563EB, action-hover #1D4ED8, radius-card 20px, radius-pill 999px, shadow-card 0 24px 60px rgba(15,23,42,0.12), display font 'Young Serif', body font 'Figtree', mono font 'Geist Mono'
- Git: remote https://github.com/Mouthfully/dataaggregator ; branches main + claude/marketplane-build-kickoff-cgbfxz ; commit trailers already in use: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Hu8TqrMA16q8ny8PxHM68g`
- Workspace package names (all private, version 0.0.0, never published): @marketplane/web, @marketplane/api-edge, @marketplane/scheduler, @marketplane/mcp, @marketplane/brand, @marketplane/tokens, @marketplane/contract, @marketplane/db, @marketplane/connectors, @marketplane/documents

### Conflicts raised (6)

- Stainless (spec section 7) vs reality. Spec 7 line 700 and the stack table line 723 make Stainless Free the SDK/docs/MCP generator, and line 773 justifies the ≤25-endpoint budget by Stainless's free tier; line 924 says the MCP server is 'generated with Stainless'. But Stainless announced on 2026-05-18 that it is joining Anthropic and winding down all hosted products — 'Starting immediately, new signups, projects, and SDKs are not available'. The spec half-knows this (line 1036: 'Anthropic acquired Stainless (May 2026)') but section 7 was never updated. REALITY WINS. Layout consequence: a top-level openapi/ directory owned by this repo, a hand-written apps/mcp Worker, and an in-repo generator for the SDK and docs. Keep the ≤25-endpoint budget as scope discipline, but record in the design note that its stated justification is void and the real reason is now maintenance surface.
- dlt/Trigger.dev (spec section 7, lines 700 and 715-716) vs TypeScript-on-Workers (kickoff non-negotiable 3, lines 60-62). The kickoff explicitly overrides and explicitly demands the trade-off be recorded in the phase 1 design note. KICKOFF WINS — it is the governing brief, and the spec's own fact-check correction (line 797, 'Cloudflare Workers has no native long-running Python') shows the dlt line was already unstable. Layout consequence: no Python toolchain in the tree at all; packages/connectors is TypeScript-only.
- Literal path `src/brand/brand.ts` / `src/styles/tokens.css` (kickoff 43, 49) vs a monorepo. The kickoff grants the escape hatch itself ('or the equivalent under the repo's conventions'). RECOMMENDED EQUIVALENTS: packages/brand/src/brand.ts and packages/tokens/src/tokens.css. The alternative that preserves the literal paths — putting both under apps/web/src/ and having Workers import upward — must be rejected: it makes three Cloudflare Workers depend on the Next.js app, which inverts the dependency graph, breaks Vercel's skip-unaffected detection, and drags Next/React types into workerd typechecking. The mapping must be stated in docs/marketplane/00-repo-map.md so no later agent treats it as drift.
- Design artboard vs kickoff token description. Artboard: Figtree (body), Young Serif (display), Geist Mono, action #2563EB, ground #F4F6FA. Kickoff: 'electric indigo as the single call-to-action colour, teal for reads, coral for writes and competitor alerts, amber for restatements, Geist and Geist Mono'. The artboard contains no teal, coral, amber, or Geist sans, and contains a serif display face the kickoff never mentions. NOT MY AREA TO RESOLVE — flag to the design-system agent. Layout consequence only: packages/tokens must be authored with semantic role names (--mp-color-action, --mp-color-read, --mp-color-write, --mp-color-restatement, --mp-font-display, --mp-font-body, --mp-font-mono) so whichever side wins, no consumer file changes.
- Toolchain conflict, not a spec conflict: vitest latest (5.0.0) vs @cloudflare/vitest-pool-workers@0.22.0 (peer ^4.1.0). Any agent that runs `pnpm add -D vitest` will install 5.0.0 and break Worker tests. PIN 4.1.11 via the pnpm catalog. Same class of trap: typescript latest is 7.0.2 and Next does not understand TS project references (vercel/next.js#67372), so composite builds must not be used even though TS 7 supports them.
- Internal contradiction in the kickoff: 'No string that identifies the company appears anywhere else' is literally unsatisfiable because wrangler.jsonc requires a Worker `name`, wrangler routes require the domain in `routes[].pattern`, supabase/config.toml requires `project_id`, and every workspace package.json requires a `name`. RESOLUTION: the brand guard is a match test for a written allowlist of infrastructure files (assert the literal equals the value in brand.ts) and a hard ban everywhere else. Record the allowlist in 00-repo-map.md.

### Open or unverified (9)

- Spec 7 'Open questions' (line 803): 'What do Stainless Starter/Pro, Speakeasy and Fern actually cost above free? All three withhold prices, so crossing 25 endpoints has an unknown bill.' This is now moot for Stainless (wound down) and unresolved for Speakeasy/Fern. Anything the build assumes about SDK generation cost must be flagged in the PR that lands openapi/.
- Spec 7 (line 796): 'Stainless offers a 30-day trial above the free tier plus a free Starter plan for qualifying open-source projects' — superseded by the wind-down; do not build a CI job against it.
- Not verified: whether Vercel's automatic skip-unaffected detects a change to a non-JS file inside a workspace package (packages/tokens/src/tokens.css). The docs say 'the project source code has changed' and 'any of the project's internal dependencies have changed' without qualifying file type. If a tokens-only change fails to trigger a web rebuild, fall back to the documented Ignored Build Step. Flag in the foundation PR.
- Not verified: Cloudflare Workers Builds limits and pricing for three connected Workers on one repository (build minutes, concurrent builds). The spec's cost table (line 725-731) prices Workers Paid, Workflows, Queues and Supabase Pro but contains no Workers Builds line. The foundation design note's cost estimate must either source this or mark it unknown.
- Not verified: which `compatibility_date` and whether `nodejs_compat` is required for packages/contract and packages/connectors under workerd. Zod 4.x and any Node-shaped built-in usage decide this. Must be settled and pinned identically across all three wrangler.jsonc files before the first Worker merges, or the three Workers will silently diverge.
- Not verified: that a source-only @marketplane/contract typechecks cleanly under both @cloudflare/workers-types 5.x and Next's DOM lib. Mitigation designed in (packages/* tsconfig sets "lib": ["ES2023"] with no "dom" and no "types"), but the first cross-runtime import in the foundation PR is the real test. If it fails, the fallback is per-runtime entry points ("exports": {"worker": ..., "default": ...}), which is a bigger maintenance cost and must be argued for in a design note.
- TypeScript 7.0.2 is stable but three months old (2026-07-08) and is a compiler rewrite; Next 16 uses the project-local tsc CLI. If TS 7 misbehaves with Next 16 or Biome, the fallback is 6.0.3. Treat the TS major as a flagged choice in the foundation design note, not a settled one.
- Spec 11.11 residual risk 'Connector rot is a permanent cost line' with the mitigation 'Routine B (section 13) makes each connector a contract-tested unit with fixtures; budget one engineer permanently'. The layout supports this (packages/connectors with per-source fixtures and contract tests) but the maintenance budget is a business assumption the build cannot verify.
- The spec's section 9 week 7-8 requires an 'Agent skill file, CLI, docs' and section 15 screen 7 requires 'the agent skill file'. No home for these is proposed at foundation; they will need apps/cli and a skills/ or .well-known/ artefact. Flag so a later agent does not scatter them.

### Recommendation

DECISION: Option (b) — a pnpm workspaces monorepo. Not Turborepo, not Bun, not npm workspaces, and not option (a).

REASON, in one sentence: the two hardest non-negotiables (one brand file, one tokens stylesheet) each have consumers in three different runtimes — Node on Vercel, workerd on Cloudflare, Deno on Supabase — plus CI codegen, and only a named workspace package turns "everything reads from this one file" into a declared dependency that Vercel's skip-unaffected graph, wrangler's bundler, pnpm's strict resolver and CI can all enforce; option (a)'s relative imports make it a convention that decays on the first agent-written PR.

Supporting reasons, in priority order: (1) a single root tsconfig cannot host @cloudflare/workers-types alongside Next's DOM lib without colliding on fetch/Request/Response/caches, so per-app tsconfigs are mandatory once there is more than one runtime; (2) Vercel's automatic skip-unaffected requires pnpm-workspace.yaml with unique names and explicit inter-package deps — option (a) satisfies none of them, so every commit rebuilds the web app; (3) Cloudflare Workers Builds is designed for exactly this (per-Worker Root directory, Build command, Deploy command, Build watch paths), so three Workers cost three dashboard configs and zero CI code; (4) three deploy targets with three different change-detection systems need three package boundaries to point at.

COST CONTROL (the two-founder answer): keep the ceremony out. No Turborepo, no changesets, no versioning, no publishing — every package is "private": true, "version": "0.0.0", consumed as workspace:*. No per-package build step: internal packages export raw TypeScript ("exports": {".": "./src/index.ts"}), Next consumes them via transpilePackages, wrangler's esbuild and Deno compile TS directly. The only generator in the tree is packages/tokens (css -> ts custom-property map). All versions pinned once in the pnpm-workspace.yaml catalog. Net added ceremony versus option (a): about ten small files.

=== DIRECTORY TREE (foundation milestone, file level) ===
Legend: [F] lands in the foundation PR series; [S] stub only at foundation; [L] later milestone, shown so nobody invents a different home.

/
├── .github/
│   ├── workflows/ci.yml                            [F]
│   ├── workflows/db.yml                            [F]
│   ├── workflows/openapi.yml                       [L]
│   ├── PULL_REQUEST_TEMPLATE.md                    [F]
│   └── CODEOWNERS                                  [F]
├── apps/
│   ├── web/                                        [F]  Next 16 on Vercel (marketing + dashboard)
│   │   ├── app/layout.tsx
│   │   ├── app/globals.css            @import tailwindcss; @import @marketplane/tokens/tokens.css; @theme inline
│   │   ├── app/icon.svg               (re-exported from @marketplane/brand assets at build)
│   │   ├── app/(marketing)/layout.tsx
│   │   ├── app/(marketing)/page.tsx                [S] hero shell only; full site is milestone 7
│   │   ├── app/(auth)/sign-up/page.tsx
│   │   ├── app/(auth)/sign-in/page.tsx
│   │   ├── app/(auth)/callback/route.ts
│   │   ├── app/(auth)/accept-invite/[token]/page.tsx
│   │   ├── app/(dashboard)/layout.tsx
│   │   ├── app/(dashboard)/onboarding/page.tsx      create organisation, then first workspace (s15 screen 1)
│   │   ├── app/(dashboard)/connect/page.tsx        [S]
│   │   ├── app/(dashboard)/ask/page.tsx            [S]
│   │   ├── app/(dashboard)/watch/page.tsx          [S]
│   │   ├── app/(dashboard)/numbers/page.tsx        [S]
│   │   ├── app/(dashboard)/usage/page.tsx          [S]
│   │   ├── app/(dashboard)/developers/page.tsx     [S]
│   │   ├── app/(dashboard)/settings/page.tsx
│   │   ├── app/(dashboard)/settings/members/page.tsx
│   │   ├── actions/{organisation.ts,workspace.ts,member.ts,invitation.ts}
│   │   ├── components/ui/{button.tsx,card.tsx,input.tsx,badge.tsx,table.tsx}   shadcn, re-themed from tokens
│   │   ├── lib/supabase/{server.ts,browser.ts,middleware.ts}
│   │   ├── middleware.ts
│   │   ├── components.json                          shadcn config, cssVariables: true
│   │   ├── next.config.ts                           transpilePackages: ["@marketplane/brand","@marketplane/tokens","@marketplane/contract","@marketplane/db","@marketplane/documents"]
│   │   ├── postcss.config.mjs
│   │   ├── tsconfig.json
│   │   ├── vercel.json
│   │   └── package.json
│   ├── api-edge/                                   [F] health-check Worker only, to prove the target
│   │   ├── src/index.ts
│   │   ├── src/router.ts                           [L]
│   │   ├── src/auth/api-key.ts                     [L]
│   │   ├── test/health.test.ts
│   │   ├── wrangler.jsonc
│   │   ├── vitest.config.ts                        vitest-pool-workers
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── scheduler/                                  [L] Workflows + Queues
│   └── mcp/                                        [L] hand-written MCP Worker (Stainless is gone)
├── packages/
│   ├── brand/                                      [F]
│   │   ├── src/brand.ts            <-- THE brand file (kickoff's src/brand/brand.ts)
│   │   ├── src/claims.ts           allowed marketing claims, per kickoff non-negotiable 1
│   │   ├── src/index.ts
│   │   ├── src/brand.test.ts       asserts every required field is non-empty and well-formed
│   │   ├── assets/{logo.svg,logo-mark.svg,favicon.svg,og-default.png}
│   │   ├── tsconfig.json
│   │   └── package.json            exports: ".", "./assets/*"
│   ├── tokens/                                     [F]
│   │   ├── src/tokens.css          <-- THE tokens stylesheet (kickoff's src/styles/tokens.css), light + dark
│   │   ├── scripts/build-tokens.mjs  parses tokens.css -> dist/tokens.ts {light,dark} maps for email/PDF
│   │   ├── dist/                     gitignored, generated
│   │   ├── tsconfig.json
│   │   └── package.json            exports: "./tokens.css" -> src/tokens.css, "." -> dist/tokens.ts
│   ├── contract/                                   [F] the envelope is the contract (kickoff 5)
│   │   ├── src/envelope.ts         fetched_at, source_updated_at, restates_until, is_provisional,
│   │   │                           attribution_window, fx_source, fx_rate_date, raw
│   │   ├── src/metrics.ts          the dictionary: spend, impressions, clicks, conversions,
│   │   │                           conversion_value, revenue (13.3 rule 2)
│   │   ├── src/entities.ts         entity_type, native_entity_type, native_id
│   │   ├── src/errors.ts
│   │   ├── src/index.ts
│   │   ├── src/envelope.test.ts    proves an unlabelled conversion count cannot be constructed
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── db/                                         [F]
│   │   ├── src/types.generated.ts  from `supabase gen types typescript --local`; CI diffs for drift
│   │   ├── src/index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── connectors/                                 [L] 13.3 unit shape lives here
│   │   └── src/sources/<name>/{client.ts,normalize.ts,backfill.ts,fixtures/,contract.test.ts}
│   └── documents/                                  [F] invitation email only at foundation
│       ├── src/emails/{layout.tsx,invitation.tsx}  consumes @marketplane/brand + @marketplane/tokens
│       ├── src/pdf/                                [L] invoices, report exports
│       ├── tsconfig.json
│       └── package.json
├── supabase/                                       [F] root, per CLI default
│   ├── config.toml
│   ├── seed.sql
│   ├── migrations/
│   │   ├── 20260908000100_extensions.sql          pgcrypto, pg_cron, pgtap
│   │   ├── 20260908000200_organisations.sql
│   │   ├── 20260908000300_workspaces.sql
│   │   ├── 20260908000400_members_and_roles.sql   owner|admin|analyst|viewer
│   │   ├── 20260908000500_invitations.sql
│   │   ├── 20260908000600_connections.sql
│   │   ├── 20260908000700_api_keys.sql            workspace-scoped, spend budget, tool allow-list
│   │   └── 20260908000800_rls_policies.sql        every tenant table keyed on organisation + workspace
│   ├── tests/
│   │   ├── 000_helpers.sql
│   │   ├── organisations_rls.test.sql
│   │   ├── workspaces_rls.test.sql
│   │   ├── members_rls.test.sql
│   │   ├── invitations_rls.test.sql
│   │   ├── connections_rls.test.sql
│   │   ├── api_keys_rls.test.sql
│   │   └── cross_workspace_isolation.test.sql     proves "No cross-workspace aggregation ever" (s15)
│   └── functions/                                  [L] Deno edge functions
├── openapi/                                        [L] marketplane.yaml (<=25 endpoints) + budget check
├── scripts/                                        [F]
│   ├── check-brand.mjs        bans identity strings outside packages/brand/src/brand.ts;
│   │                          match-tests the allowlist (wrangler names/routes, supabase project_id, pkg names)
│   ├── check-tokens.mjs       bans #hex, rgb(), hsl(), oklch() outside packages/tokens/src/tokens.css
│   ├── check-db-types.sh      regenerates types and fails on drift
│   └── verify.sh              lint + typecheck + test + build + both guards (the pre-push gate)
├── docs/
│   ├── MARKETING-DATA-PLANE.md                     (exists)
│   ├── MARKETPLANE-KICKOFF-PROMPT.md               (exists)
│   └── marketplane/
│       ├── TEMPLATE.md                             [F]
│       ├── 00-repo-map.md                          [F] phase 0 output, required by the kickoff
│       └── 01-foundation.md                        [F]
├── design/marketplane/{Main.dc.html,support.js}    (exists, untouched)
├── .editorconfig                                   [F]
├── .gitignore                                      [F]
├── .node-version            "22"                   [F]
├── biome.jsonc                                     [F]
├── tsconfig.base.json                              [F]
├── vitest.config.ts         projects: node + workers [F]
├── pnpm-workspace.yaml      packages + catalog      [F]
├── package.json             private, packageManager pnpm@10.33.0, scripts [F]
├── pnpm-lock.yaml                                   [F]
└── README.md                                       (exists, update build status)

=== PACKAGE MANAGER ===
pnpm 10.33.0, declared as "packageManager": "pnpm@10.33.0" (corepack 0.34.6 is present). pnpm-workspace.yaml lists packages: ["apps/*", "packages/*"] and carries a `catalog:` block pinning every shared version in one place — next 16.3.4, react 19.2.8, tailwindcss 4.3.3, wrangler 4.129.0, @cloudflare/workers-types 5.20260907.1, vitest 4.1.11, @cloudflare/vitest-pool-workers 0.22.0, typescript 7.0.2, zod 4.5.4. Every package.json references them as "catalog:". Rejected: npm (hoisting defeats the undeclared-import guard that makes the brand/tokens rules enforceable), bun (no catalogs; wrangler and supabase CLI are npm-shaped), yarn 1 (unmaintained).

=== TEST RUNNER ===
Three surfaces, two runners, no more:
1. Vitest 4.1.11 (PINNED — 5.0.0 breaks the Workers pool), root vitest.config.ts using `projects`: a "node" project for packages/* unit tests and the 13.3 offline connector contract tests, and a "workers" project per Worker app using @cloudflare/vitest-pool-workers 0.22.0 against real workerd with Miniflare bindings.
2. pgTAP under supabase/tests/, run by `supabase test db`. This is the row-level-security test suite the foundation milestone requires; it is SQL, not TypeScript, and cannot be folded into Vitest.
3. Playwright deferred to the dashboard milestone (Next 16 peers @playwright/test ^1.51.1). Not at foundation.
Every connector fixture is a recorded real response with PII scrubbed and contract tests run offline in CI (13.3 rule 6).

=== LINT / FORMAT ===
Biome 2.5.12 alone, one biome.jsonc at the root: formatter + linter + import sorting for TS/TSX/JS/JSON/CSS. No ESLint, no Prettier. Reason: two founders, one config, one binary, no plugin resolution across ten workspaces. Trade-off to record in the design note: this gives up eslint-config-next's Next-specific rules (the @next/next/no-img-element class); mitigation is that `next build` still surfaces the build-breaking subset and the two rules that actually matter here are custom anyway. Add to biome.jsonc: `noRestrictedImports` forbidding apps/* from importing another app (packages only), and forbidding any import of @marketplane/tokens/dist from a Next component (Next reads the CSS, Workers read the TS map).
The two project-specific rules are node scripts, not lint plugins, because they must scan CSS, SQL, MDX and wrangler.jsonc — outside any JS linter's reach: scripts/check-brand.mjs and scripts/check-tokens.mjs, both wired into `pnpm verify` and into CI as their own named steps so a failure names the rule that was broken.

=== CI JOBS (.github/workflows) ===
ci.yml, on pull_request and push to main, one job "verify":
  checkout@v4 -> pnpm/action-setup@v4 (reads packageManager) -> setup-node@v4 with node-version-file: .node-version and cache: pnpm
  pnpm install --frozen-lockfile
  pnpm check:brand           # identity strings outside the brand file
  pnpm check:tokens          # hard-coded colours outside the tokens file
  pnpm lint                  # biome ci .
  pnpm typecheck             # tsc --noEmit per workspace, pnpm -r
  pnpm test                  # vitest run (node + workers projects)
  pnpm build                 # pnpm -r build
db.yml, same triggers, job "database":
  supabase start -> supabase db reset (migrations + seed) -> supabase db lint -> supabase test db (pgTAP RLS)
  -> supabase gen types typescript --local, diffed against packages/db/src/types.generated.ts; drift fails the job
openapi.yml [later milestone], job "contract":
  endpoint count <= 25 (scripts/check-endpoint-budget.mjs), spec lint, then regenerate MCP tool descriptions and
  SDK types and diff them — "any hand-edited drift fails the gate" (spec 13.4 docs parity)
Deploys are NOT GitHub Actions: Vercel's Git integration builds apps/web (Root Directory apps/web, skip-unaffected on), and Cloudflare Workers Builds builds each Worker from its own Root directory with Build watch paths covering apps/<name>/** and packages/**. CI verifies; the platforms deploy.
Branch protection on main: require the verify and database jobs, require one review, squash merge only, linear history.

=== COMMIT AND BRANCH CONVENTIONS ===
Adopt what the repository already does rather than inventing:
Commits — Conventional Commits, lowercase type, imperative subject under 72 chars, body wrapped at 88, blank line before trailers. Types: feat, fix, docs, chore, refactor, test, perf, build, ci. Scope is the workspace or connector: feat(web):, feat(api-edge):, feat(db):, feat(connectors/google-ads):, docs(marketplane):. Mandatory trailers, both already in use on 01f6386:
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: <session url>
Branches — claude/<milestone>-<unit>-<6-char-id>, e.g. claude/foundation-rls-policies-a1b2c3, matching the existing claude/marketplane-build-kickoff-cgbfxz shape. One builder agent, one isolated worktree, one branch, one PR, per 13.3. Never commit to main. PR title equals the head commit subject. PR body ends with the two lines the tooling requires (Generated with Claude Code + session link) and links its design note.
PR template (.github/PULL_REQUEST_TEMPLATE.md) requires: link to docs/marketplane/NN-<slug>.md, a checkbox that `pnpm verify` passed locally, a checkbox that no scope was widened (with the issue number if something was deferred), and a checkbox that any unverified/open spec item built on is flagged in the note.

=== DESIGN-NOTE TEMPLATE (docs/marketplane/TEMPLATE.md) ===
Filename docs/marketplane/NN-<slug>.md, NN zero-padded and sequential; 00-repo-map.md is fixed by the kickoff. Front matter: unit, milestone, branch, PR, date, author agent. Ten sections, the first three mandated verbatim by the kickoff, the next two by its conflict and unverified-flag rules, the sixth by its no-scope-widening rule:
1. What was built — one paragraph, plus the exact files added or changed.
2. Cost estimate — table (line item | unit price | assumed MVP volume | $/month | source), with section 7's cost table (spec lines 725-731) as the baseline, and a running total delta against the previous note. Every row cites a published price or is marked (unpriced).
3. Platform-terms check — table (platform | clause and URL | date read | what it constrains here | how this unit complies | residual risk). Five rows are mandatory on every note even when the answer is "not touched": no shared platform tokens across tenants; no cross-customer aggregation or benchmarking on platform data; per-workspace data separation; the Meta client-list obligation (spec 3.5); contact data hashed at the edge and never stored raw (spec 3.2).
4. Envelope and correctness — which envelope fields this unit emits or consumes; explicit answer to "can this unit emit an unlabelled conversion count?"; which restatement clock applies.
5. Spec conflicts — where the kickoff and the spec disagreed, which section 11 decision was applied, and what was done. Empty is an acceptable answer; absent is not.
6. Unverified or open items built on — each quoted from the spec with its own flag, why proceeding is safe, and what would falsify it.
7. What was left out — deliberate omissions with the issue number opened for each.
8. Tests — what proves this works, which fixtures, and what is explicitly not covered.
9. Rollback — how to undo, including the down-migration or the previous Worker version.
10. Follow-ups — ordered, each an issue link.

=== FIRST THREE PRs, IN ORDER ===
PR 1 docs(marketplane): phase 0 repo map and design-note template — 00-repo-map.md (this decision, the brand/tokens path mapping, the check-brand allowlist), TEMPLATE.md, PULL_REQUEST_TEMPLATE.md. No code.
PR 2 build: pnpm workspace scaffold — root package.json, pnpm-workspace.yaml with the catalog, tsconfig.base.json, biome.jsonc, .node-version, vitest.config.ts, ci.yml, both guard scripts, and an empty apps/web that builds. Proves the gate before anything depends on it.
PR 3 feat(brand,tokens): the two single sources — packages/brand and packages/tokens with tokens.css seeded from the artboard values under semantic role names, the css->ts generator, Tailwind @theme inline wiring in apps/web, and both guards turned from warn to fail.
Supabase schema, auth, invitations and the pgTAP RLS suite follow as PRs 4-6.

---

## 8. Completeness critic

> The only barrier in the reconnaissance workflow: it received every explorer report and looked for
> what no single explorer could see. Its resolutions are recorded verbatim.

**Verdict.** Yes — phase 1 can be proposed now, and should be, with two narrow blockers named up front rather than discovered mid-build. The recon is unusually complete on the things that decide the shape of the work: repository and toolchain reality is verified rather than assumed, the design tokens are extracted value-by-value with counts and roles, the envelope conflicts are located to the line, the platform-terms constraints are quoted with clause numbers, and the repository layout decision is argued against verified Vercel, Cloudflare and Supabase documentation. The contradictions above are all resolvable by an orchestrator except two: the display-register question and the brand file's identity facts, both of which sit inside kickoff non-negotiables 1 and 2 and therefore inside phase 1 itself. Sequence around them. PR 1 (docs/marketplane/00-repo-map.md plus the design-note and PR templates, recording the artboard-vs-§14 conflict, the brand/tokens path mapping, the guard allowlists, the token vocabulary and the RLS-testing path) and PR 2 (pnpm workspace scaffold, pinned catalog, Biome, vitest 4.1.11, CI, both guards in warn mode, an apps/web that builds) need neither decision and prove the toolchain nobody has actually run. PR 3 (packages/brand and packages/tokens) needs both. PRs 4–6 (Supabase schema, auth and invitations, pgTAP RLS suite) need the auth-tenancy mapping and the credential-vault choice, which are gaps the orchestrator can close by deciding them explicitly in the phase 1 design note — they are unspecified, not contested. Two things must not be carried forward unexamined: the 'empty repo' premise, which is false and would cause a builder to clobber a merged README; and the API recon's regrouped envelope, which is the one recommendation in the whole set that contradicts a binding non-negotiable and would harden into a wrong contract if it reached packages/contract unreviewed.

### Contradictions found and resolved (20)

#### `blocking` — Repository state: the "empty repo, 16-byte README, one commit" premise every agent (including this workflow's own brief and the kickoff's phase-0 checklist) was given

- **One side:** Task brief and kickoff phase 0: repo is empty except a 16-byte README and one commit; phase 0 asks explorers to report on package.json, app router, supabase/, CI, globals.css, components.json, docs/BACKEND-HANDOVER.md
- **Other side:** Toolchain recon, verified twice: HEAD is a057890 (merge of PR #1), 5 tracked files, README.md is 904 bytes and already carries the Marketplane positioning and a documents table; local `main` is STALE at 3651cde while origin/main is a057890; docs/marketplane/ exists but is empty
- **Resolution:** Reality wins. Before any write, `git fetch` and re-read HEAD; branch from origin/main or the current branch, never from local `main`. Do not regenerate README.md from the empty-repo premise — edit it. Every phase-0 question about package.json / app router / supabase / CI / globals.css / components.json / BACKEND-HANDOVER.md resolves to ABSENT, and 00-repo-map.md must say so explicitly rather than leaving it implied. Assume at least one sibling agent is mutating the repo: re-read before each commit.

#### `blocking` — Brand palette and display typeface: the artboard the kickoff points at versus the palette the kickoff and spec section 14 describe

- **One side:** Kickoff non-negotiable 2 and spec §14: near-white #FBFBF8 ground, #ECE9E1 hairlines, electric indigo #4F46FF as the single CTA, teal #0FB5A0 reads, coral #FF5A5F writes/competitors, amber #FFB020 restatements, Geist 800 headlines, Geist + Geist Mono only, "the serif display moment from the first draft was dropped"
- **Other side:** design/marketplane/Main.dc.html, verified: zero of §14's six hexes appear in it and zero of its thirteen hexes appear in the spec (disjoint sets). Ground #F4F6FA, hairlines #CBD5E1/#E2E8F0, one accent #2563EB, display is 'Young Serif' at weight 400 on 21 elements including every h1/h2, body is Figtree, mono is Geist Mono; the Google Fonts link requests no weight above 700, so §14's 800 is not even loadable from it
- **Resolution:** Two-part ruling. (1) VALUES: the artboard wins for every token it actually defines — ground, surface, ink, hairline, inverse surface, accent, radius (20px/999px), the single shadow 0 24px 60px rgba(15,23,42,0.12), spacing and type scale — because the kickoff's operative verb is "Start from the values in design/marketplane/Main.dc.html" and the parenthetical is a gloss on a file that does not contain it. §14 wins only for the three semantic status hues the artboard leaves undefined (read/write/restate), restricted to status marks and never to a button, with §11.5 narrowing coral to writes-only and amber to restatements-only (no competitor colour). The RULE "one colour is the brand and every CTA" survives with the value changed to #2563EB. (2) REGISTER: the serif-versus-extra-bold-sans display voice is NOT the orchestrator's to settle — see decisions_needed_from_user. Note for the record that the design recon's stated ground ("the artboard is the later artefact") is unproven: spec and artboard landed in the same commit 01f6386, §14 describes a page the artboard does not match on nine points, and §14's own alternate artboard (dark/violet) is a third direction. The artboard wins because it is the only artefact that exists and the kickoff names it, not because it is newer.

#### `blocking` — Envelope shape: the API recon's proposed canonical TypeScript regroups section 7's flat row fields into nested `freshness` and `fx` objects

- **One side:** API recon's recommended contract: interface Row { source, entity, dimensions, metrics, freshness: {fetched_at, source_updated_at, first_seen_at, restates_until, is_provisional, restatement_window_days}, fx: {fx_source, fx_rate_date, fx_rate, fx_base}, raw }
- **Other side:** Spec §7 line 762, verbatim: "A single `freshness` timestamp cannot express three clocks, which is why the field set splits into fetched_at, source_updated_at, restates_until and is_provisional" — an explicit refutation of §13.3's freshness object. Kickoff non-negotiable 5 requires "the envelope in section 2 and section 7" with those four fields named at the top level
- **Resolution:** §7 and the kickoff win on SHAPE. The row keeps fetched_at, source_updated_at, restates_until, is_provisional, fx_source, fx_rate_date at the top level, exactly as printed in §7, plus `raw`. The API recon's ADDITIONS are correct and should be adopted as additive top-level fields, because each is demanded elsewhere and printed nowhere: account_id and entity_id (named in the §7 upsert key, absent from both envelopes), timezone as an IANA name (promised as a spec'd guarantee in §3.1 and §4.4, absent from every envelope), fx_rate and fx_base (§13.3 requires the rate on the row; §7's ECB auditability rationale demands it), first_seen_at (the immutable restatement anchor). Wrapper is §2's — ok, module, source, meta{schema, request_id, credits_used} — extended with `data[]` for multi-row reads, since §2 and §7 print only a single row and every real read returns many. Any grouping into nested objects is a contract change and must not be made silently.

#### `blocking` — restates_until anchor: the §7 clocks-table formula versus both printed examples versus a materialised store

- **One side:** §7 clocks table: restates_until = fetched_at + 28d (Meta) / + account conversion window (Google Ads) / + 12d (GA4). §2's example computes it from fetched_at (2026-09-07 + 28d = 2026-10-05) but applies Meta's 28-day formula to a google_ads row. §7's own example computes it from the row date (2026-08-14 + 28d = 2026-09-11)
- **Other side:** §7 line 710 mandates a materialised store with nightly restatement-aware re-pulls, so fetched_at is mutable per row; anchoring to it slides restates_until forward on every re-pull and is_provisional never clears
- **Resolution:** None of the three as written. Anchor to an immutable per-row value: first_seen_at (written once on insert, never updated) with restates_until = max(date, first_seen_at) + window, defaulting to the first_seen_at anchor because §7 reads Meta's "of being reported" as favouring first report. Serialise as RFC3339 UTC (§7's form), not §2's bare date. This is an invention beyond the spec resting on a question the spec marks unresolved ("whether the clock starts at delivery or at first report is unresolved in the docs, per both researcher and checker") and MUST be flagged in the PR that lands the contract types. Correct §2's example separately: a google_ads row's clock is fetched_at + account conversion window, not +28d.

#### `blocking` — Section 13.3's connector contract versus the envelope the kickoff mandates — and the kickoff mandates both

- **One side:** Kickoff "How to run each unit of work": "Follow the routines in section 13." §13.3 clauses require the envelope {source, entity, metrics, dimensions, fetched_at, freshness}, freshness = {window_days, last_restated_at, is_final}, metric name `conversion_value`, GA4 backfill 72h
- **Other side:** Kickoff non-negotiable 5 plus §2 and §7: four separate freshness fields not a `freshness` object, `is_provisional` not `is_final`, `conversions_value` (plural, twice in printed envelopes and in the dbt_ad_reporting description), GA4 restatement 12 days (§7 table and §9 backfill tier)
- **Resolution:** Non-negotiable 5, §2 and §7 win on every point; §13.3's process shape (self-contained connector unit, fixtures, offline contract tests, dictionary-PR-before-new-metric, currency normalised at fetch time) stands. §13.3 clauses 1–4 are stale text and must be restated as amended in the phase 1 design note, because as written the mandatory pre-merge connector contract would reject the envelope the API is required to emit. Emit `is_provisional` only — never both it and its complement. `conversion_value` is a typo; `revenue` survives as a separate dictionary entry meaning order-source revenue, never an alias.

#### `important` — Extraction stack: spec §7's dlt-on-Trigger.dev versus the kickoff's TypeScript-on-Workers

- **One side:** §7 recommended stack: dlt (Apache 2.0) extractors on Trigger.dev compute, chosen because dlt is the "Only permissive option with Facebook Ads, Google Ads and GA4 sources" and paired with Trigger.dev because "Cloudflare Workers has no native long-running Python"
- **Other side:** Kickoff non-negotiable 3: "Write extractors in TypeScript on Workers rather than adopting a Python extraction library... record the trade-off against section 7's dlt recommendation in the phase 1 design note"
- **Resolution:** Kickoff wins — it says so itself, §11 takes no decision on extraction compute, and §15 independently states the same three-provider stack. The stack recon's supporting argument is sound and should go in the design note: dlt's decisive feature (schema inference and evolution) is banned by §13.3 rule 2 and made unnecessary by the fixed envelope; its normalisation is structural where this product needs semantic; its retry client understands none of the three quota regimes; and §10.2's own finding is that AI collapsed the price of writing a connector, not operating one. Residual honest cost: ~2–4 engineer-weeks of TypeScript (incremental cursor state, paginators, retrying client, chunked backfill windows, merge/upsert) plus loss of the three verified sources' tacit platform knowledge. Cloudflare Containers (which would run dlt in Python and still keep three providers) must be named in the note as considered-and-rejected, otherwise the note asserts a constraint that no longer holds.

#### `important` — Cloudflare Workers runtime limits that the spec never mentions and that forbid the obvious TypeScript extractor implementation

- **One side:** Spec §7 and §15 assign extraction and scheduling to Cloudflare with no mention of memory, step-output or connection limits
- **Other side:** Stack recon, verified against Cloudflare docs: 128 MB isolate memory, 1 MiB max Workflow step output, 6 simultaneous open connections, 5 min CPU per invocation, 15 min wall clock on cron and queue consumers, 10,000 steps per instance default (25,000 configurable)
- **Resolution:** The limits win and must be briefed to every data-plane builder. Consequences to state once in the phase 1 design note and then assume: no extraction step may return rows (write raw to R2, return a key); no large report may be JSON.parse'd whole (stream to R2 and parse incrementally); one Workflow instance per connected account, never per tenant (4 sources x 90 days = 360 steps versus 14,400 for a 40-client agency, which blows the default ceiling); intra-invocation fan-out capped at 6; nightly sweeps start Workflow instances and return. This makes the kickoff's R2 mandate architecturally necessary rather than optional. Left unbriefed, the first Meta async-report connector passes fixtures and fails on a real account.

#### `important` — Cost baseline: kickoff says §7's cost table is the baseline for every design note; §11.3 and §8 have already invalidated it

- **One side:** Kickoff non-negotiable 3: "put a cost estimate on every design note (section 7's cost table is the baseline)"
- **Other side:** §11.3 abolishes per-call metering for Performance (metered per connected account per month, restatement re-pulls included, 28–90x a naive pull); §8 corrections raise the SERP floor from $0.0006 to $0.002 for a synchronous endpoint and AI answers to $0.024–$0.032 (Sonar Pro) / ~$0.003 (batched Haiku); §7's table contains no Vercel line at all and no disk-growth term
- **Resolution:** §11.3 and §8's corrections win on numbers; §7's table survives only as the template. Every design note states cost per connected account per month, not per 1M calls, and uses $0.002 for synchronous SERP and no flat AI price. Recomputed 80/15/5 blend is ~$0.0018/call at Sonar Pro or ~$0.00057 at batched Haiku against §7's ~$0.0009 — the model choice alone swings blended COGS 3.2x, so the default model is a pricing decision. Add the missing Vercel line (~$40/mo for two Pro seats): mandated fixed monthly is roughly $150–$200, not §7's $110–$150. Budget the three lines that can break, in order: Supabase disk at $0.125/GB if `raw` ever lands in Postgres as JSONB (R2 at $0.015/GB-month is 8.3x cheaper and only relieves it if `raw` is an R2 key); KV writes at $5.00/million if the envelope cache is keyed per row; Workflow steps if granularity drops below (connection, source, date).

#### `minor` — SDK, docs and MCP generation: spec §7/§9 build on Stainless's free tier; the layout recon reports Stainless wound down

- **One side:** §7 line 700 and the stack table make Stainless Free the generator and justify the ≤25-endpoint budget by its free tier; §9 week 5–6 says the MCP server is "generated with Stainless"
- **Other side:** Layout recon: Stainless announced 2026-05-18 that it is joining Anthropic and winding down all hosted products, "new signups, projects, and SDKs are not available". The spec half-knows this (line 9 and line 1036 both note the acquisition) but §7 was never updated
- **Resolution:** Reality wins on the plan: do not build CI around Stainless, own openapi/ in-repo, and hand-write apps/mcp. BUT the wind-down claim was not independently verified in this session (a single external blog post), so it must be re-verified before it drives the API milestone, and until then it is a flagged assumption, not a fact. Keep the ≤25-endpoint budget regardless — its new justification is maintenance surface and MCP tool-list legibility, not Stainless pricing. No phase 1 impact.

#### `important` — Literal file paths for the two single sources: src/brand/brand.ts and src/styles/tokens.css versus a pnpm monorepo

- **One side:** Kickoff non-negotiables 1 and 2 name src/brand/brand.ts and src/styles/tokens.css; the toolchain recon treats both paths as "fixed by the kickoff"
- **Other side:** Layout recon: packages/brand/src/brand.ts and packages/tokens/src/tokens.css, because the brand file has consumers in Node (Vercel), workerd (three Workers) and Deno (Supabase functions), and tokens are consumed both by Tailwind in Next and as raw strings by Worker-rendered emails and PDFs
- **Resolution:** The monorepo mapping wins — the kickoff grants it explicitly ("or the equivalent under the repo's conventions") and the alternative (both files under apps/web, Workers importing upward) inverts the dependency graph, breaks Vercel's skip-unaffected detection and drags Next/React types into workerd typechecking. Record the mapping prominently in docs/marketplane/00-repo-map.md so no later agent reads it as drift. Adopt option (b), pnpm workspaces, not Turborepo, not Bun, not npm workspaces.

#### `important` — The "no company string anywhere else" and "no hex outside tokens.css" guards are literally unsatisfiable as stated

- **One side:** Kickoff non-negotiable 1: "No string that identifies the company appears anywhere else"; non-negotiable 2: "Nothing hard-codes a hex value outside this file"
- **Other side:** wrangler.jsonc requires a Worker `name` and routes carry the domain; supabase/config.toml requires project_id; every workspace package.json carries an @marketplane/* name; and design/marketplane/Main.dc.html plus support.js are 110 KB of hard-coded hexes that must not be edited
- **Resolution:** Implement both guards as match-tests plus a written allowlist, not as bans. Brand guard: for wrangler names/routes, supabase project_id and package.json names, assert the literal EQUALS the value in brand.ts; ban the string everywhere else. Token guard: exempt design/** (the source artboard), docs/** and packages/tokens/src/tokens.css; ban #hex, rgb(), hsl() and oklch() everywhere else. Both allowlists live in 00-repo-map.md. A naive guard as written would fail on the first commit.

#### `important` — Test-runner and linter versions: two recon reports give different answers

- **One side:** Toolchain recon EXACT VALUES: vitest latest 5.0.0, eslint 10.10.0, eslint-config-next 16.3.4, typescript-eslint 8.69.0 (TS 7 compatibility unverified, named as the most likely first failure)
- **Other side:** Layout recon: PIN vitest 4.1.11 because @cloudflare/vitest-pool-workers@0.22.0 peers vitest ^4.1.0; drop ESLint and Prettier entirely for Biome 2.5.12
- **Resolution:** Layout wins on both. Pin vitest 4.1.11 — an agent that reads only the toolchain report's "latest" column and runs `pnpm add -D vitest` installs 5.0.0 and breaks every Worker test. Choosing Biome also dissolves the unverified typescript-eslint/TS-7 triangle the toolchain report flagged, at the cost of eslint-config-next's Next-specific rules (record that trade-off). Pin every shared version once in the pnpm-workspace.yaml catalog: next 16.3.4, react/react-dom 19.2.8, tailwindcss and @tailwindcss/postcss 4.3.3, wrangler 4.129.0, @cloudflare/workers-types 5.20260907.1, zod 4.5.4, @supabase/supabase-js 2.115.0, @supabase/ssr 0.12.6, geist 1.7.2. Never install miniflare directly (its `latest` tag is a 5.x alpha) — use @cloudflare/vitest-pool-workers. Do not install @opennextjs/cloudflare: §15 and non-negotiable 3 put Next on Vercel.

#### `minor` — TypeScript major version and build wiring

- **One side:** Toolchain recon: global tsc is 6.0.2, npm latest is 7.0.2, TS 7 adoption is not universal, validate the triangle before building on it
- **Other side:** Layout recon: pin TS 7.0.2, ship internal packages as raw TypeScript consumed via Next's transpilePackages, and do NOT use project references (Next does not understand them, vercel/next.js#67372)
- **Resolution:** Adopt TS 7.0.2 with a stated fallback to 6.x, and adopt transpilePackages with no composite builds — the two reports do not actually disagree on mechanism, only on confidence. Treat the TS major as a flagged choice in the foundation design note with the rollback named, and validate the next+tailwind+TS+Biome combination in a single install in PR 2 before anything depends on it. Nobody has actually run an install or a build; the whole toolchain conclusion is inference from registry reachability.

#### `minor` — Landing-page headline: §11.9 quotes one line, the artboard ships another

- **One side:** §11.9 (a section 11 decision paragraph): "the landing page copy 'Know why. Not just what.' already reflects it"; §14 specifies the same headline at 100px extra-bold
- **Other side:** Main.dc.html h1: "Know what changed. And why." at clamp(48px, 6.5vw, 78px), weight 400, Young Serif
- **Resolution:** The artboard headline stands. What §11.9 actually DECIDES is the positioning ban — "Stop describing the product as 'joins in one call'. Describe it as verified root cause and an operated correctness guarantee" — and both headlines satisfy it. §11 decides scope, pricing and modules, not copy. Record the deviation in the design note. The binding, machine-checkable consequence is that "joins in one call" goes on the forbidden-claims list in brand.ts.

#### `important` — Marketing surfaces the artboard sells that section 11 has killed or deferred

- **One side:** Main.dc.html: a Competitors card on /v1/market, a Customer lists card on /v1/audience, "audiences pushed to every platform from one place", "Push a do-not-target list to every ad platform", "Consent checked before export", "Reads from 22 sources" / "All 22 integrations", pricing headed "Pay as you go. Nothing monthly.", four credit packs in EUR, "a full why did this happen is about twelve" credits
- **Other side:** §11.5 drops the market module outright (§2 already marks /v1/market "reserved namespace, not built"); §11.4 defers writes past the MVP; §11.9 shrinks scope to Meta, Google, GA4 and one affiliate network plus wholesale SERP; §11.3 decides two pricing units with Performance metered per connected account per month; §4.3 prices diagnose at 20–40 credits; §14 marks the pack prices [DRAFT]
- **Resolution:** Section 11 wins on every line. §14 already concedes the market deletion itself. The content recon's allowed-claims and forbidden-claims lists are the right mechanism and should be adopted essentially as given, because they make the ban machine-checkable from brand.ts: no source count, no competitor tracking as a product surface, no audience write or consent-before-export claim, no "Nothing monthly", no fixed credit price for diagnose or an AI run, no single AI rank or binary "you lost the citation", no "Frankfurt"/"London"/"UK GDPR"/"SAML SSO", no out-of-scope connector names, no "two minutes", no "joins in one call", no unlabelled example numbers. This is phase-1 work because the allowed-claims list ships inside brand.ts.

#### `important` — Security and compliance claims on the artboard that no implementation or spec text supports

- **One side:** Main.dc.html: "EU hosting, GDPR and UK GDPR / Frankfurt by default. DPA on request", "SAML SSO on Scale", "SOC 2 Type II planned", "Consent checked before export", footer "© 2026 · Frankfurt · London"
- **Other side:** "Frankfurt" and "UK GDPR" appear nowhere in the 1680-line spec; §3.2's bar requires a click-through Article 28 DPA covering all eight clauses plus a public sub-processor page with change notice, which is stronger than "on request"; §15 says "Single sign-on later" and commits SSO to no tier; §11.4 defers the write path the consent line describes
- **Resolution:** The spec wins. Replace with claims that are true today: "EU data region. Click-through DPA with Article 28 terms and a public sub-processor list with change notice"; drop SSO from both the security strip and the plan note; keep "SOC 2 Type II planned" only with the word planned and no date; replace the consent line with "No cross-customer aggregation. Your platform data is never pooled, benchmarked, sold or licensed." Omit the city/office line until incorporation and region selection are real. Never repeat the CNIL press attribution — CNIL did not name the company.

#### `important` — Token naming scheme: two reports propose different variable names for the same values

- **One side:** Design recon: --mp-ground, --mp-surface, --mp-ink, --mp-line, --mp-accent, --mp-read/--mp-write/--mp-restate, --mp-radius-xl, --mp-shadow-lift, --mp-text-h2, --mp-space-16
- **Other side:** Layout recon: --mp-color-action, --mp-color-read, --mp-color-write, --mp-color-restatement, --mp-font-display/body/mono
- **Resolution:** Pick one before any component is written, or two agents will emit two vocabularies into a file whose entire purpose is being the single source. Adopt the design recon's list verbatim (it is complete, derived value-by-value from the artboard, and already carries the light/dark split, the AA-safe paired -ink tokens for the three status hues, the two @keyframes and the control-height scale); take from the layout recon only the principle that names are semantic roles, so the pending typeface decision changes one line and no consumer. Publish the final list in 00-repo-map.md.

#### `minor` — Where /v1/audience, /v1/market and account-management resources sit in the 25-endpoint budget

- **One side:** §2 declares seven namespaces including /v1/audience/* and /v1/market/*; §8 prices four market endpoints and a per-record write table; §15 makes organisations, workspaces, members, connections and API keys first-class resources
- **Other side:** API recon's 23-operation list drops market and audience entirely and keeps every account-management resource out of the public OpenAPI, putting them in Next server actions against Supabase with RLS
- **Resolution:** The API recon's list wins and should be the phase-4 starting point: §11.5 and §11.4 settle market and audience, and §9 additionally removes billable Search Console and Trends endpoints (free joins inside diagnose only). Putting §15's account resources in the public spec would add 15–20 operations and blow the cap on its own. Two additions the list is missing: the public no-signup demo endpoint required by kickoff surface 7 and §10.3, which must serve public-data modules or synthetic fixtures only (serving platform data on a Marketplane-held credential to an unauthenticated caller breaches Google's third-party-access policy and Meta 3.a.iv); and a decision on whether `revised_from` lives only in the restatement webhook (it does) rather than on a read row.

#### `important` — Local development for row-level-security tests

- **One side:** Layout recon's foundation plan: pgTAP under supabase/tests/, run by `supabase test db`, with a db.yml CI job doing supabase start / db reset / test db
- **Other side:** Toolchain recon: the docker binary exists but there is no daemon and no /var/run/docker.sock, so `supabase start` cannot run in this sandbox at all
- **Resolution:** Both are right; the plan is unchanged in CI (GitHub runners have Docker) and blocked locally. Builder agents in this environment must validate RLS either by pushing to CI or against a hosted Supabase project/branch through the mcp__Supabase tools. Decide which before writing the first policy, and state it in 00-repo-map.md, because a loop of "write policy, push, wait for CI" at three retries per unit is the slowest path in the whole foundation milestone. Also note the gh CLI is absent — PRs go through the mcp__github tools.

#### `minor` — Section 3.5's access table versus sections 10.4 and 11.10 on affiliate networks

- **One side:** §3.5 access table: all four affiliate networks are self-serve keys, review "None", timeline "Same day"
- **Other side:** §10.4 and §11.10: Awin gates advertiser API access behind Accelerate/Advanced with user-scoped personal tokens, Everflow advertiser users cannot create keys at all, Impact's MSA bars competitors and requires written approval at Impact's sole discretion, ShareASale is being absorbed into Awin
- **Resolution:** §10.4 and §11.10 win (later gap round, and §11 is decisive). Onboarding must run a per-network plan/eligibility check rather than assume same-day keys, the Awin clause 4.8 written-notice delegation step must be built into onboarding rather than assumed, and the affiliate network cannot be named in any copy until a design partner names theirs. Not phase 1, but it changes the Connect screen's shape in phase 2.

### Decisions that belong to the founder (3)

1. The brand's display register, because the two binding documents point at two different brands and the artefact the kickoff names does not contain the palette the kickoff describes. Option A (recommended, and what the orchestrator will build absent an answer): the artboard as shipped — Young Serif at weight 400 for every headline, Figtree body, Geist Mono, cool ground #F4F6FA, one accent #2563EB, editorial register. Option B: section 14 as written — Geist 800 headlines set tight, warm ground #FBFBF8 with #ECE9E1 hairlines, electric indigo #4F46FF, bold-sans-tech register. This is a founder call because it changes the brand's whole voice and because §11 takes no design decision, so no rule in the corpus resolves it. Reversal is cheap (one token file) but only before the marketing site is built. Either way, the three semantic status hues (#0FB5A0 read, #FF5A5F write, #FFB020 restatement) are adopted from §14 for status marks only, never for a button, with the competitor role dropped per §11.5.
2. The brand file's identity facts, which cannot be invented and which block non-negotiable 1: is 'Marketplane' final (§12 only recommends it), is the domain registered and which TLD is primary (the artboard hard-codes api.marketplane.dev), what is the legal entity name and company/VAT number, the registered postal address, the support and legal email addresses, the default locale and currency (the artboard prices in EUR, §8 in USD), and the data region to commit to publicly. §9 week 0 implies the company is not yet incorporated, in which case the answer needed is which fields ship as placeholders and which claims come off the site until they are real.
3. Which legal entity and which accounts own the platform credentials and hosted infrastructure, because the answers are entity-bound, slow, and expensive to redo. Specifically: under what entity the Google Ads developer token and Google Cloud project are applied for (Explorer today, Basic applied for immediately per §11.7), under what entity the Meta app is created and Business Verification plus App Review is filed (weeks 3–8, and Full Access needs 500+ calls in 15 days at under 15% errors), and who owns the Vercel team, the Cloudflare account and the Supabase organisation. Google OAuth verification and Meta verification both start in week 1 on §9's plan and both restart if the entity changes; the Meta 5.b.ii.2 client-list obligation also attaches to the entity.

### Gaps the recon did not close (15)

1. Every value the brand file must hold is unknown. Nobody established the legal entity name, company/VAT number, registered postal address, support and legal email addresses, whether marketplane.dev (or .io) is registered and by whom, social handles, default locale and currency, or the data region. §12 only RECOMMENDS the name Marketplane ("If forced to one"); the README and kickoff assert it. Non-negotiable 1 cannot be satisfied and no page, email or invoice can render without these.
2. How Supabase Auth maps onto the organisation / workspace / member model, which is the central RLS design decision of the whole foundation milestone. No recon established whether tenancy resolves through JWT custom claims (auth hook) or through a membership-table join inside every policy, how the four roles (owner, admin, analyst, viewer) enter the policy, or how role changes propagate. Every migration and every pgTAP test in phase 1 depends on this and it is currently unspecified.
3. How a Cloudflare Worker authenticates an API key against Supabase without a service role that bypasses RLS. The terms recon makes 'no service-role bypass' a hard gate; §15 requires workspace-scoped keys with a spend budget and a tool allow-list. Nobody established the key format, the hashing/lookup scheme, or the request-identity mechanism at the edge. This blocks both the api-edge Worker and the api_keys migration.
4. Where and how the customer's OAuth grants are stored. §15 says 'in a vault' and non-negotiable 4 forbids shared tokens; nobody established whether that is Supabase Vault/pgsodium, Cloudflare Secrets Store, envelope encryption with a KMS key, or something else, nor who can decrypt and from which runtime. The `connections` table cannot be designed without it, and §3.5's open question about per-tenant Google developer tokens means the table may also need a per-tenant developer_token field.
5. How invitation emails are sent. The invitation flow is explicitly in the first milestone, and email delivery is not one of the three mandated providers. Nobody established whether Supabase Auth's built-in email suffices (no fourth provider), or whether a sender like Resend is needed — which requires the 'written reason' non-negotiable 3 demands, plus a sub-processor page entry per §3.2.
6. No install, build or typecheck was ever executed. Registry reachability, disk and CPU were verified; the actual combination (Next 16.3.4 + React 19.2.8 + Tailwind 4.3.3 + TypeScript 7.0.2 + Biome 2.5.12 + vitest 4.1.11 + @cloudflare/vitest-pool-workers 0.22.0 + wrangler 4.129.0 in one pnpm workspace) is untested. Unverified specifically: that a source-only shared package typechecks under both @cloudflare/workers-types 5.x and Next's DOM lib without colliding on fetch/Request/Response/caches, and that Vercel's skip-unaffected detection fires on a CSS-only change inside packages/tokens.
7. Provisioning status of every hosted account: no Vercel team or project, no Cloudflare account (Workers Paid, Workers Builds, R2 bucket, KV namespace), no Supabase organisation or project, and therefore no region chosen. Cloudflare Workers Builds limits and pricing for three connected Workers on one repo are unknown and absent from §7's cost table, as is Vercel entirely.
8. The two dark-mode values the kickoff requires have no source. The artboard has zero @media queries and zero prefers-color-scheme blocks; dark card surface and dark hairline must be invented (#1E293B and #334155 proposed as the in-family Tailwind slate continuation) and flagged as invented.
9. Font sourcing and licensing were never established: whether Young Serif and Figtree are used via Google Fonts links or self-hosted through next/font, their licences, and how a Worker rendering an email or PDF gets the same faces. The `geist` npm package (1.7.2) exists but Geist sans appears nowhere in the artboard, so it may not be needed at all.
10. Which artefact is authoritative on design was never resolved evidentially. §14 names three source artboards (Main.dc.html, DarkHero.dc.html, canvas.json); only Main.dc.html and support.js exist. §14 also names an editable design canvas at https://claude.ai/code/artifact/5175880c-2e6e-43cd-a157-4854ce6bb946 which nobody fetched, and which is the one artefact that could settle whether the artboard or §14's palette paragraph is the later intent. Fetch it before escalating the typeface question, or escalate with that gap stated.
11. docs/BACKEND-HANDOVER.md, which the kickoff's phase-0 checklist says 'constrains the backend', does not exist anywhere in the repo. Nobody established whether it was never written or lives outside this repository. If it exists elsewhere it may contain binding constraints the entire plan is missing.
12. Concurrency and ownership of the repository during the build. At least one sibling agent mutated the repo three times in six minutes during recon, local `main` is stale at 3651cde, commit signing (commit.gpgsign=true, ssh signer /tmp/code-sign, 0-byte public key) was never tested by this workflow, and git identity is 'Claude <noreply@anthropic.com>', not the founder's. No convention exists for who owns main or how parallel builder branches rebase.
13. No per-connected-account-per-month COGS baseline exists anywhere, even though §11.3 makes that the billing unit for the largest revenue line and the kickoff requires a cost estimate on every design note. It must be derived from the restatement ladder (rows/night x depth x sources) before any pricing surface is designed.
14. The timezone dimension the contract needs has no defined source: §3.1 and §4.4 promise timezone normalisation as a spec'd guarantee co-equal with currency, but no envelope prints it and nobody established where an account's IANA timezone or its reporting currency is read from per platform.
15. Whether the four alert kinds, the demo questions and the curl block ship with an 'Example' badge or wait for a real design-partner case. §14 requires the invented numbers be replaced before launch; no recon established whether a design partner exists yet, which determines whether the marketing milestone is buildable at all.

### Must be flagged in a PR (19)

1. Meta's 28-day restatement clock start is unresolved in Meta's own docs ('whether the clock starts at delivery or at first report is unresolved in the docs, per both researcher and checker', §7). The proposed first_seen_at anchor for restates_until builds directly on it. Flag in the PR that lands the contract types, and diff a historical pull against a re-pull thirty days later to settle it empirically.
2. Google Ads publishes no authoritative freshness or conversion-finalisation statement ('No published freshness or finalisation statement equivalent to Meta's was found across three attempts', §7). restates_until = fetched_at + account conversion window is a guess dressed as a contract, and 90-day nightly re-pulls may be over-engineered.
3. GA4's 12-day attribution-restatement figure carries Google's own disclaimer: 'This is not a guarantee, nor an SLA or an SLO' (§7). It cannot be sold as a guarantee anywhere, including in the envelope's semantics.
4. Google OAuth sensitive-scope verification is unbounded: the '3 to 5 days' figure could not be sourced and Google publishes no duration; one observed case ran from 2026-04-01 to 2026-06-12 unresolved (§3.5 corrections, §11.11). Never quote 3–5 days. Self-serve signup is gated on the outcome, not on the roadmap — which shapes the phase 1 auth and onboarding build.
5. Google Ads Standard Access may have no path for a headless product (§11.11, High): 'RMF categories are defined by what a tool displays.' Nothing may be designed that needs more than 15,000 operations per day until Google answers in writing, and the Numbers screen is a compliance artefact, not a feature.
6. Whether Meta treats a pay-per-call API as a Tech Provider needing per-client authorisation and a client list is unresolved (§11.11, High): 'Section 5.b.ii.2 obligations are confirmed but the onboarding mechanics are not.' The client-list record and the Business-admin acceptance step are being designed into the phase 1 schema on that unresolved basis, and pricing for Meta-backed endpoints is gated on a legal read.
7. The mechanics of per-tenant Google developer tokens in a multi-tenant service are undocumented (§3.5 open question: 'If every tenant brings their own developer token, whose token appears in the request?'). The connections schema encodes an answer that no source confirms.
8. webmasters.readonly's sensitive-scope status is unconfirmed — 'the scope is not listed on Google's OAuth scopes page' (§3.5). Search Console could fall behind the same unbounded OAuth gate as GA4, which would remove it from the launch connector list.
9. Performance COGS (~$0.0001/call) and the ~98% gross margin are marked unverified in §8, and §7's cost table 'contains no disk-growth term' per its own checker. Every design-note cost estimate inherits both, plus two further uncosted terms the mandated stack adds (R2 object count, KV write volume).
10. §8's open question is unanswered: 'What is blended Performance COGS once OAuth refresh, rate-limit backoff, retry storms and delayed-conversion re-reads are counted? The ~98% margin assumption collapses if platform limits force 3x to 5x redundant polling per useful row' — which is exactly what the Workers-based scheduler determines.
11. Meta's Ads Insights quota formula and the 190,000 Full Access figure are flagged upstream: '§3.2 correction 5: the researcher's 5,000+40x and 190,000+40x rate-limit figures do not appear in the cited source.' Do not hard-code them as budget constants. Only ads_api_access_tier of the three x-fb-ads-insights-throttle fields is named in the spec; do not invent the other two field names.
12. Whether a hash-only, zero-retention design keeps Marketplane outside processor status is legally unresolved (§3.2 open questions): 'No regulator has applied EDPS v SRB to an adtech intermediary and that ruling is unverified at primary level.' Do not present the hash-only architecture as resting on a verified CJEU ruling. The OLG Dresden 3 February 2026 joint-controller holding is medium confidence from a single secondary source, and CNIL did not name the fined company.
13. 'Nobody pays for verified root cause either' is a High residual risk in §11.11: 'Every observed demand signal is per module, and the join itself is refuted (10.1).' The entire product thesis carries a week-12 exit criterion of one paid diagnose case. Breakeven needs 640–1,070 accounts at the original price point, also High.
14. §14 marks the credit pack prices [DRAFT], the SOC 2 line [planned], and states that the sample answer, the four alerts and the curl numbers are invented and must be replaced with a real design-partner case. Any allowed-claims list or pricing copy in brand.ts inherits those flags — and brand.ts ships in phase 1.
15. Provider terms on automated AI querying are unread: 'OpenAI's terms page could not be fetched' (§3.3, §11.11). The hosted AI-answer path must be described as official-APIs-only, with UI parity as an opt-in customer-session mode. AI Overview detection is separately unreliable — best measured detection 68% at n=25, three providers at 0% (§3.3).
16. No reviewed platform policy addresses MCP as a delivery surface (§3.5 open questions) — whether exposing platform data to an autonomous agent counts as third-party programmatic access is an open policy question every MCP tool that returns platform data ships against.
17. Stainless pricing above the free tier is unknown ('All three withhold prices, so crossing 25 endpoints has an unknown bill', §7) and, per the layout recon, the hosted product is being wound down entirely — a claim not independently verified in this session. Flag both in the PR that lands openapi/.
18. The affiliate network cannot be named (Awin plan-gating and user-scoped tokens, Impact MSA 2.2 barring competitors and requiring written approval, Everflow keys not self-generable, §10.4/§11.10), and the TikTok, Amazon and Apple access timelines plus the Bing SOAP freeze/decommission dates are all explicitly unverified (§3.5 corrections). Do not repeat the Microsoft dates as fact even though the deferral outcome stands.
19. §9's build table still schedules TikTok connectors in weeks 7–8 and §8 still prices Search Console and Google Trends as billable reads; §11.9 and §9's own exclusion list override both. Any plan citing §9 or §8 must state that it is reading them with the §11 narrowing applied.
