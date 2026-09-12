# 43. Two guards for the claims boundary: the sentence that went round it, and the citation that went stale

**PR:** _unassigned at the time of writing_ &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The claims boundary has two holes that the repository had already written down and not closed.
`claim()` and `optionalClaim()` throw on an unknown or withheld id, but only for text that passes
*through* them, so a sentence typed straight into the JSX renders like an approved promise. And
every claim cites specification sections while the changelog records which sections override which,
with nothing cross-checking the two — issue #16's generalisation, after the same class bit twice.
This PR adds `scripts/check-copy.mjs` and `scripts/check-claim-sources.mjs`, wired into CI beside
the four guards that exist, enforcing, with `--warn` supported and a `-ignore:` hatch each.

**Both are heuristics, and the decision that shapes both is where each one stops.** The alternative
— make each guard as wide as the failure it names — was rejected on the same ground in both cases:
each wide version fires on correct code in the tree as it stands today, and a guard that fires on
correct code gets switched off, after which it protects nothing. That is a worse outcome than not
writing it. So each guard is drawn narrow enough to pass clean on a tree nobody edited for it, and
each says in its header exactly what it therefore cannot see.

### The inline-copy guard, and a threshold read off the corpus

The rule: a **JSX text node**, a **string literal in a JSX child slot**, or a **human-visible JSX
attribute** fails when it ends a sentence (`.`, `!`, `?`, or an internal break followed by a
capital) **and** carries at least **5 words**.

Both halves are measured against the tree rather than picked. All 28 entries in `CLAIMS` are
sentences ending in a full stop; not one of the eight structural strings `page.tsx` renders —
"Every row says what it knows about itself" (8 words), "Your credentials, your data, your tenant"
(6), "Connect a workspace", "How it is priced" — ends in terminal punctuation at all. On today's
corpus terminal punctuation alone separates the two sets cleanly, so it is the primary signal.

**The floor is 5 because the shortest approved claim is 5 words: the tagline, "Know what changed.
And why."** A round 8 or 10 would pass a hand-typed copy of the tagline straight through, and the
hand-typed copy of an approved sentence is the likeliest form of the failure, not the least. The
floor exists to exclude fragments — "Yes.", "Coming soon.", a stray "e.g." — and it is set at the
lowest value that does that rather than at the value that makes the guard quietest.

**The rejected alternative was scanning every string literal in the file, not only the JSX ones.**
It fires immediately, and on something real: `layout.tsx` carries
`description: "Placeholder shell. The marketing site is a later milestone."` — nine words, two
sentences, customer-visible in a search result, resolved by nothing, and **false since the marketing
site shipped**. That is a genuine finding (§4), and it is exactly why the wide version was not
taken: head metadata has no `claim()` resolver behind it, so a guard reaching there would report a
defect whose only available fixes are editing marketing copy or writing a metadata resolver —
neither of which belongs in a PR that adds guards. The territory line is therefore drawn at *what
the JSX renders*, stated in the header as a decision, and the metadata surface is deferred with the
finding attached. Widening an allowlist to silence it was never on the table; moving the boundary
and naming what is outside it is a different act from pretending nothing is there.

### The superseded-citation guard, and an honest partial

`docs/MARKETING-DATA-PLANE.md` records an override in exactly two places, and today they agree:

```
11A.11 change-log row | 2026-09-08 | 11A.14 **Launch connector set substituted.** …
                        Overrides 11.9 and 11A.6 on first connectors. … |
11A.14 section body   **This overrides 11.9 and 11A.6 on which connectors ship first.**
```

Both shapes are parsed and the union is used, so rewording one without the other cannot quietly
disarm the guard; the overriding section comes from the row's own entry number or from the nearest
heading. Parsing **no** record at all is itself a finding, because a restructured document must not
turn this into a silent no-op.

**The decision is the two-tier rule, and it follows from one fact: an override is not total.**
11A.14 overrides 11.9 *on first connectors*. Everything else §11.9 decided still binds, which is
why `tagline`, `positioning` and `serp-bought` cite it correctly right now. A guard that failed on
every citation of an overridden section would have opened with three failures on correct copy. So:

| Tier | Condition | Effect |
|---|---|---|
| **FAIL** | the claim cites an overridden section **and** the claim's own id shares a topic word with the override's recorded scope | non-zero exit, naming claim, superseded section and the section that overrides it |
| **NOTE** | the claim cites an overridden section outside that scope | printed on every run, never enforced |

The **id**, not the text, is matched against the scope. A claim id is a hand-chosen topic slug from
a small controlled vocabulary — `connectors` against "first connectors" is the historical bug —
whereas claim text is marketing prose in which any word can turn up for rhetorical reasons. Matching
scope words against prose is how a heuristic earns a reputation for crying wolf.

**The changelog is not machine-readable enough to do this completely, and the guard says so rather
than pretending.** Scope is English, so scope matching is lexical. One line of convention closes it:
record the scope as data — `Overrides 11.9, 11A.6 (claims: connectors)` — and every tier-2 note
becomes a tier-1 failure with no guessing. Until then a claim whose id shares no word with the scope
phrase is a false negative. Under-firing is the direction a heuristic guard should fail in; the
tier-2 notes are what keeps the under-firing visible on every run instead of silent.

### One thing that could not be read

The brief names `docs/marketplane/38-marketing-site-visual-direction.md` §"Claims" as the
specification for guard 1 — *"it states precisely what the current mechanism does NOT do"*. **That
file does not exist in this checkout.** The docs run 00–37 plus the template and the handover, and
nothing in the tree references a 38. Rather than write against a paragraph nobody can read, the
guard was written against the statements that do exist and say the same thing from the other side:
`apps/web/app/page.tsx`'s own module comment ("EVERY SENTENCE HERE COMES FROM the strict or optional
claim resolver … Structural words — headings, labels, the step names — are the only prose written in
this file"), `_content.ts`'s description of `claim()` as the build-time boundary, and
`20-marketing-site.md` §1's decision to make the allowed-claims list "an executable publishing
boundary, rather than relying on copy review". If 38 lands later and draws the line somewhere else,
the guard's header is the place that has to change, and it is written to be argued with.

## 2. Cost estimate

**Per connected account per month:** `฿0.00` — no data-plane work.

Derived rather than asserted. The diff adds two Node scripts, two `package.json` script entries,
two CI steps and this note. Every term in the cost table is zero because none of them is touched:
**rows/night** unchanged (no connector, normaliser or entity), **restatement depth** unchanged (no
Workflow, no D+1/D+3/D+7/D+28 ladder), **Workers invocations and CPU ms** zero (nothing runs at the
edge), **R2** zero (no object written or read), **KV** zero, **Supabase disk** zero (no migration,
no row), **bought data** zero (no SERP or AI-answer call), **dependency** none — both guards are
plain Node ESM over `node:fs` through the existing `scripts/lib/scan.mjs`, and `pnpm-lock.yaml` is
untouched.

The only real cost is CI wall-clock. Measured on this machine, five runs each: `check-copy.mjs`
**112 ms** per run including Node start-up and its one `git ls-files`, `check-claim-sources.mjs`
**77 ms** per run over the 339 KB specification. **~0.19 s added per CI run**, on a job with a
20-minute timeout that already runs install, lint, typecheck, tests and two builds.

The three standing caveats do not move: §8's performance COGS and ~98% margin stay UNVERIFIED, §7's
table still has no disk-growth term, and this PR does not touch the scheduler, so it changes nothing
about the redundant-polling ratio §8's open question turns on.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no code path here touches Google, Meta, GA4, Search Console, TikTok or an
affiliate network. Both guards read repository text from disk and exit.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is used or introduced.

**3. No token pass-through.** `N/A` — no MCP server, OAuth surface or request path changes.

**4. Credential hygiene.** `PASS` — the guards read only source files and print repo-relative paths,
line numbers and the offending text. No environment variable, token or credential is read, and
nothing new is written to logs. `check-copy.mjs` prints matched sentences, which are marketing copy
by construction; `check-claim-sources.mjs` prints section numbers and claim ids.

### Tenancy

**5. RLS.** `N/A` — no table, column or policy changes.

**6. No service-role bypass.** `N/A` — no request path and no database client.

**7. No cross-workspace read.** `N/A` — no query, view, materialisation or cache key exists here.

**8. No cross-customer aggregation or benchmarking.** `N/A` — nothing aggregates anything; the
guards read repository files, not tenant data.

**9. API key scope.** `N/A` — no key, budget or tool allow-list is involved.

### Data movement

**10. No resale or redistribution.** `N/A` — no billing unit, response, export, webhook or shared
link. No platform data moves anywhere.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path.

**12. Dependency licences.** `PASS` — no dependency added, removed or upgraded, and
`pnpm-lock.yaml` is untouched. Both guards are zero-dependency Node ESM, matching the four that
exist; the brief's no-parser-library constraint and the repository's own precedent agree here.

### PII and consent

**13. Hash at the edge.** `N/A` — no email, phone, name or address reaches this code; there is no
persistence, no R2 write, no log line and no LLM prompt.

**14. Forbidden payloads rejected before egress.** `N/A` — no payload, no egress.

**15. Per-destination consent.** `N/A` — no record, no consent object, no destination.

### Access tier and quota

**16. Tier reality.** `N/A` — the change makes no source request and consumes no platform quota.

**17. No new long-lead dependency.** `PASS` — both guards run on the CI runner with the toolchain
already installed. No platform approval, developer token, verification or audit is required, and
there is no degraded path to describe because there is no gate.

### Claims

**18. Claim provenance.** `PASS` — and this gate is what the PR is for. Every user-visible claim
still comes from `packages/brand/src/claims.ts` through `claim()` / `optionalClaim()`, and two ways
of evading that are now executable failures rather than review habits: a sentence written into the
JSX without passing through a resolver, and a claim citing a section the changelog has superseded
within the scope of the override. The gate's second half — *"and is it true today"* — is precisely
what guard 2 mechanises: a citation that was true when written and false after the specification
moved is the form the `connectors` defect took. Nothing on the banned list ("joins in one call", a
live `/v1/audience` or `/v1/market`, "DPA on request", "3 to 5 days", SOC 2, SAML SSO, EU hosting)
is introduced; no copy changes in this PR at all.

**Result:** `4 PASS, 14 N/A, 0 FAIL`

## 4. What was left out

- **`export const metadata` in `apps/web/app/layout.tsx` is out of the inline-copy guard's
  territory, and it carries a real finding.** `description: "Placeholder shell. The marketing site
  is a later milestone."` is customer-visible in a search result, was written before the marketing
  site existed, and is now false. It resolves through nothing. Fixing it is a copy decision and
  covering it properly needs a `claim()`-shaped resolver for `metadata` first; both are their own
  change. Deferred with the finding recorded here so it is not lost.
- **Three in-flight connectors currently fail `check-capabilities.mjs`.** As of this writing
  `packages/connectors/src/sources/` has grown `google_ads/`, `meta_ads/` and `search_console/`,
  each with a `client.ts` and a `normalize.ts`, while `IMPLEMENTED_SOURCE_IDS` still names only
  `ga4` and `woocommerce` — so the existing capability guard exits 1 with three findings. That is
  the guard working exactly as designed, a connector landing ahead of its claim mirror, and it
  belongs to the connector change. `packages/brand/src/claims.ts` was deliberately not edited.
- **No AST, and no scope creep into one.** Both guards are regex-and-line-scan over source text,
  matching `check-brand.mjs` and `check-tokens.mjs`. `check-copy.mjs` carries a ~40-line backwards
  walk that classifies a position as JSX text, brace, tag or module scope; that is a lexical
  heuristic, deliberately, and its blind spots are listed in its header rather than hidden.
- **Guard 2 does not check that a cited section EXISTS.** A claim citing a section number the
  specification never had would pass. It is a different check with a different failure mode
  (§ numbering is cited across eleven design notes), and adding it here would widen the PR.
- **Guard 1 does not follow values.** A sentence built by concatenation, assembled from a `const`
  array outside the JSX, or interpolated from fragments is invisible to it. Following a value needs
  the AST the repository has decided not to add.
- **`scripts/lib/scan.mjs` was not extended.** Both guards use it as it stands — `listFiles`,
  `readText`, `matchesAny`, `positionAt`, `lineAt`, `pragmaScope`, `hasIgnorePragma`, `parseArgs`,
  `report`. Every existing caller is untouched.
- **No copy, claim, citation or capability was changed.** Guard 2 found no live violation to fix,
  and if it had, the fix would have been a separate PR by the same rule.

## 5. Open or unverified spec items this builds on

- **The override record's shape is a convention, not a schema.** Guard 2 depends on the sentence
  "Overrides `<sections>` on `<scope>`" continuing to be how `MARKETING-DATA-PLANE.md` records an
  override. If a future entry writes it differently, the guard silently parses one record fewer —
  which is why the note line prints the record count and the shapes it found on every run, and why
  finding zero records fails the build. `supersedes` is accepted as a synonym pre-emptively.
- **§11A.11's own rule that "nothing is renumbered" is load-bearing here.** The guard matches
  citations to sections by number. If entries were ever renumbered, every `source` array in
  `claims.ts` would need rewriting and this guard would be the thing that noticed, in the worst
  possible way — as a wave of failures. The changelog states the no-renumbering rule explicitly, so
  this builds on a decision rather than on a hope.
- **§11A.14's launch set is itself under pressure.** `HANDOVER.md` §7 records two founder decisions
  that may change which connectors ship — WooCommerce's missing payment-processor fee, and the
  finding that Google Ads and Search Console are one approval rather than two. If either lands as a
  §11A.17, a new override record appears and this guard starts checking it the next time it runs.
  Nothing here needs changing for that; that is the point of guarding the class.
- **The product name, domain, data region, EU representative and DPA remain unsettled.** Neither
  guard reads a brand fact, so answering any of them differently changes nothing here.
- **`docs/marketplane/38-marketing-site-visual-direction.md` does not exist in this checkout** (§1).
  Guard 1's rule was written against `page.tsx`, `_content.ts` and `20-marketing-site.md` instead.
  If 38 exists elsewhere and draws the structural/claim line differently, the threshold and the
  three scanned positions are the things to re-argue.

## 6. Verification

Run on this machine, real results. **Five other workflows are editing this checkout concurrently on
disjoint paths, and the repo-wide gates move between runs because of it** — `pnpm -r typecheck` and
`pnpm exec biome lint .` were each red at one point in this session and green at the end, on files
this PR does not touch. Results below are the final observed run, with what fluctuated named rather
than rounded to "pass".

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | **pass** (exit 0) — 5 warnings and 1 info, none in a file this PR touches. It briefly exited 1 mid-session on `packages/connectors/src/sources/woocommerce/client.ts` and `docs/marketplane/finance/build-pdf.mjs`, both since fixed by their own workflows. The two new guards produce no diagnostic: `biome lint scripts/check-copy.mjs scripts/check-claim-sources.mjs package.json` → 0. |
| `pnpm exec biome format --write` on this PR's files only | **pass** — 3 files checked, 2 reformatted (the two new guards), re-verified clean afterwards. No repo-wide formatter was run. |
| `pnpm exec biome format .` (read-only, whole repo) | **FAILS on three files, none of them this PR's**: `packages/connectors/src/sources/google_ads/{client,fixtures,normalize}.ts`, landed minutes earlier by the concurrent connectors workflow. `pnpm exec biome format scripts/ package.json .github/` passes: 8 files, no fixes. |
| `pnpm -r typecheck` | **pass** (exit 0), every package including `apps/web`. It failed earlier in the session on `packages/connectors/src/sources/woocommerce/paging.test.ts(227,9): error TS2322`, fixed by that workflow since. This PR adds no TypeScript. |
| `pnpm --filter web test` | **pass — 1 file, 38 tests.** The rendered-output assertions are untouched and still green. |
| `node scripts/check-brand.mjs` | **pass** |
| `node scripts/check-tokens.mjs` | **pass** |
| `node scripts/check-dictionary.mjs` | **pass** |
| `node scripts/check-capabilities.mjs` | **FAILS, 3 findings**: `google_ads`, `meta_ads` and `search_console` are implemented under `packages/connectors/src/sources/` and absent from `IMPLEMENTED_SOURCE_IDS`. The concurrent connector work landed `client.ts` + `normalize.ts` for each without the claim mirror; `packages/brand/src/claims.ts` is byte-identical to how this PR found it (md5 `1d4ef828…`, verified before and after every experiment below). Theirs to close, and their guard is telling them so. |
| `node scripts/check-copy.mjs` | **pass** — 2 rendered files scanned |
| `node scripts/check-claim-sources.mjs` | **pass** — 4 override records parsed (1 change-log row, 1 section-prose statement, 2 sections each), 28 claims with citations, 3 out-of-scope citations reported as notes |

### The evidence that matters: each guard fires on a real violation and not on correct code

**False positives.** Both guards pass clean on the tree as it stands, and `check-copy.mjs` passes
while actually seeing the copy — a guard that passes because it extracts nothing is worthless. Its
candidate extraction, dumped on `page.tsx` and `layout.tsx`, finds all eight structural strings and
the one child literal, and rejects every one of them on the rule:

```
[JSX text] words=3 shaped=false  "Connect a workspace"
[JSX text] words=3 shaped=false  "Read the API"
[JSX text] words=8 shaped=false  "Every row says what it knows about itself"
[JSX text] words=6 shaped=false  "Your credentials, your data, your tenant"
[JSX text] words=3 shaped=false  "What it reads"
[JSX text] words=4 shaped=false  "How it is priced"
[JSX text] words=2 shaped=false  "Company registration"
[JSX child literal] words=4 shaped=false  "A marketing data plane"
```

Three further non-firing cases were planted and confirmed: `<h2>Your business's numbers</h2>` (an
apostrophe in rendered text is not a string delimiter, and the possessive does not make a sentence),
`<p>Numbers you can trust, e.g. revenue after fees</p>` (an abbreviation's full stop is not a
sentence end), and every `{/* … */}` comment in `page.tsx`, which are masked before the scan and so
contribute nothing despite being full sentences.

**True positives.** Planted, run, then reverted; `md5sum` confirmed both files byte-identical
afterwards.

`check-copy.mjs`, three violations in `page.tsx` — one per scanned position:

```
page.tsx:72:18  title attribute carries a sentence of 8 words … "Set up in under five minutes, we promise."
page.tsx:73:11  JSX text carries a sentence of 7 words … "We reconcile every platform for you automatically."
page.tsx:76:13  JSX child literal carries a sentence of 5 words … "Know what changed. And why."
FAIL: 3 findings   (exit 1)
```

The third is the case the threshold was chosen for: a verbatim copy of the approved tagline typed
inline instead of resolved, caught at exactly the 5-word floor. With
`{/* copy-guard-ignore: … */}` on the line above, the JSX-text finding drops out and the other two
remain — the hatch is per-finding and needs a reason.

`check-claim-sources.mjs`, the historical defect replanted — `connectors` returned to `source:
["11.9"]`, which is what it carried before #14:

```
packages/brand/src/claims.ts:234:5  claim "connectors" cites 11.9, which 11A.14 overrides on
"first connectors" / "which connectors ship first" (docs/MARKETING-DATA-PLANE.md:1483).
Cite 11A.14 instead, or correct the claim it supports.
FAIL: 1 finding   (exit 1)
```

The message names the claim, the superseded section, the section that overrides it and the line of
the record — the fix is legible without opening the specification. `claim-source-guard-ignore:` on
the line above silences it, and the same run still reports `positioning`, `serp-bought` and
`tagline` as out-of-scope citations of 11.9 without failing, which is the tier-2 half working.

**Both guards support `--warn` (findings reported, exit 0) and reject an unknown option with exit
2**, matching `check-tokens.mjs` and `check-capabilities.mjs`. Both are wired into
`.github/workflows/ci.yml` enforcing, with `if: ${{ !cancelled() }}`, beside the four that exist.
