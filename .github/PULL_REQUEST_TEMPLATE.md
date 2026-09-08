<!--
Every section below is required by the kickoff brief's working agreement ("Each PR carries a short
design note under docs/marketplane/ with the cost estimate, the platform-terms check, and what was
left out. Never widen scope in a PR; open an issue instead.").

Keep it short. The long form -- the full 18-gate platform-terms check and the cost derivation --
lives in the design note; this page is the summary and the link to it.
-->

## What changed

<!-- Two or three sentences. What a reviewer needs to know before reading the diff. -->

**Design note:** `docs/marketplane/NN-<name>.md`

## Cost estimate

**Per connected account per month:** <!-- e.g. "~$0.14/account/month" or "N/A -- no data-plane work" -->

<!--
PER CONNECTED ACCOUNT PER MONTH, not per call and not per 1M calls. Specification 11.3 replaced
per-row performance credits with per-connected-account monthly metering, so a per-call figure no
longer describes a sellable unit for the largest revenue line.

Derive it in the design note from the restatement ladder: rows/night x restatement depth (D+1, D+3,
D+7, D+28) x sources, plus R2 object count, KV writes and Supabase disk. Say "N/A" only when the
change touches no data plane at all, and say why.
-->

## Platform-terms check

18 gates, answered in the design note: <!-- e.g. "6 PASS, 12 N/A, 0 FAIL" -->

- [ ] Every applicable gate is answered `PASS` or `N/A` with a one-line reason in the design note.
- [ ] No gate is answered `FAIL`.

<!-- The gates and their order (credential, tenancy, data movement, PII, access tier, claims) are
     in docs/marketplane/DESIGN-NOTE-TEMPLATE.md. Copy that block into the note; do not summarise
     it away. -->

## What was left out

<!-- Deliberate omissions and why. If you wanted to do more, that is an issue, not a bigger PR. -->

## Open or unverified spec items this builds on

<!--
Required by the kickoff: do not build on anything the specification marks unverified or open
without flagging it. Name each one, and what happens to this change if the answer comes back the
other way. "None" is a valid answer only if it is true.

The standing list is docs/marketplane/00-repo-map.md section 9.
-->

## Before pushing

- [ ] `pnpm exec biome lint .` and `pnpm exec biome format .`
- [ ] `pnpm -r typecheck`
- [ ] `pnpm -r test`
- [ ] `pnpm -r build`
- [ ] `pnpm check:brand` and `pnpm check:tokens` -- no NEW findings (both run in warn mode in CI)
- [ ] Scope not widened: everything in this diff is what the PR title says it is
