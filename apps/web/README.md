# apps/web

The Next.js application: marketing site and customer dashboard, deployed to Vercel.

## Vercel project settings

Set **Root Directory** to `apps/web`. Everything else comes from `vercel.json` in this directory.

`installCommand` uses `--filter @repo/web...` (with the trailing ellipsis) so Vercel installs this
app *and its workspace dependencies* and nothing else. Without the filter every install pulls
`wrangler`, `workerd` and the Workers test pool into the build image for no reason.

## Skip-unaffected builds

`docs/marketplane/00-repo-map.md` section 12 names this as one of two assertions the scaffold had
to prove, and it is the one that **cannot be proven from inside the repository** — it is a property
of Vercel's build pipeline, so it is only observable once a Vercel project exists and two commits
have been pushed.

What is verifiable here is that the configuration is correct in shape:

- The app is a workspace member with a unique name and an explicit `workspace:*` dependency on
  `@repo/tokens`, which is what Vercel's dependency graph reads.
- `ignoreCommand` falls back to an explicit `git diff` over this directory, `packages/`, the
  lockfile and the workspace manifest, so a CSS-only change inside `packages/tokens` still
  triggers a build even if the graph-based path is unavailable.

**Verify it on the first two deploys**: push a change touching only `packages/tokens/src/tokens.css`
and confirm the web deployment *builds* rather than being skipped; then push a change touching only
`apps/api-edge/` and confirm it *is* skipped. Record the outcome in the design note. If the second
case builds anyway the layout still stands — it costs build minutes, not correctness — but say so
rather than leaving the claim untested.
