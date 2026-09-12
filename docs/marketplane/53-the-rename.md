# 53. The rename: `numbadee` → `uniplain`, and the two defects setting a domain introduced

## 1. What this is, and the decision taken

The founder registered **uniplain.com** on 2026-09-12 and renamed the GitHub repository and the
Supabase project to match. This note brings the repository's own copy of the name into line, and
records the one thing about the rename that was not bookkeeping.

`37-first-real-project.md` §204 left this open in as many words:

> Whether `numbadee` survives contact with trademark and domain availability is a founder matter.

It did not. The founder chose a name that was available as a `.com`, which is the constraint that
actually decided it.

**The decision taken:** `productName` becomes `uniplain`, and `domain` — null since the brand file
was written, and described there as "UNRESOLVED and blocking" — becomes `uniplain.com`.

### The rename itself was three lines, and that was the point

`packages/brand/src/brand.ts` has claimed since it was written that changing the product name is
"a one-line change here and no npm rename". That claim had never been tested. It held:

| File | Why it carries the name |
|---|---|
| `packages/brand/src/brand.ts` | the source of truth |
| `packages/brand/src/brand.test.ts` | asserts the source of truth |
| `supabase/config.toml` | `project_id`; the CLI cannot read a TypeScript module |

That is the complete list in code. `apps/web` renders the name through `productName()` in
`app/_content.ts`, which reads the constant; no page, no package name, no Worker name and no route
carries it. `scripts/check-brand.mjs` is why — it bans every identity string outside a three-entry
allowlist, and it match-tests the allowlisted ones against the brand file rather than exempting
them, so `config.toml` cannot drift from `brand.ts` without failing the build.

The guard proved this on the rename rather than in principle: an **earlier draft of the new
`config.toml` comment** named the product in prose, and the guard failed the run. Only the value on
the `project_id` line is allowlisted; the rest of the file, comments included, is still ban-scanned.

### Setting the domain was not bookkeeping, and it broke two things

`domain` was not merely unknown — it was *load-bearing while null*. Two functions in `brand.ts`
were written around its absence and became wrong the moment it had a value. Neither was caught by a
test, because in both cases the existing tests had been written against the null.

**1. `siteUrl()` would have sent developers to production.** The resolution order was override →
Vercel URL → canonical domain → localhost, with localhost last. While `domain` was null the last
two could be written in either order and nothing could tell. With it set, `siteUrl({})` — a plain
local dev server — returns `https://uniplain.com`, and every local link and email preview points at
the live site. The localhost branch now precedes the domain branch.

**2. `apiUrl()` would have returned a URL that resolves and is wrong.** It ended in
`return `${siteUrl(env)}/api``. **The API is a different origin from the site**: the site is a Next
app on Vercel, the API is a Cloudflare Worker, and `apps/web` serves no `/api` route at all. While
`domain` was null this was harmless in production because `siteUrl` threw first. With the domain
set, the same line returns `https://uniplain.com/api` — which resolves, serves the marketing site's
404, and looks entirely plausible in a log.

It now throws instead. A missing API URL is a deployment that has not been finished; an API URL
pointing at the wrong origin is a deployment that *appears* finished and is not — the same
preference this repository applies to a wrong number that looks right.

`apiBaseUrl` stays null, and it is a different kind of null from the one `domain` just left. The
Worker is deployed at a `workers.dev` hostname, which is a deployment detail and not a public
product URL. Filling it in is adding a DNS record and a wrangler route; it is not a decision.

### What the hosted project kept

The Supabase project's **ref is unchanged**, and so is every migration applied to it. Only its
dashboard display name moved, and that name appears nowhere in this repository. Notes 1–52 call it
`numbadee`; they are describing the same project and have not been rewritten, because a design note
is a record of what was true when it was written.

## 2. Cost estimate

**฿0.00.** No platform call, no row, no object, no new binding. The domain was registered by the
founder outside this repository.

## 3. Platform-terms check

Twelve gates are `N/A` for the ordinary reason — this change makes no platform call, moves no data
and touches no credential. Three are worth answering rather than waving through.

**1–5 (Credential).** `N/A` — no credential is read, written, stored or transported. The one
credential-adjacent line in the brand file, `supportEmail`, is unchanged (see §4).

**6–9 (Tenancy).** `N/A` — no database object, no policy, no query. `supabase/config.toml`'s
`project_id` is the local CLI project name, not the hosted ref, and carries no tenancy meaning.

**10–12 (Data movement).** `N/A` — nothing is fetched, buffered or archived.

**13–15 (PII and consent).** `N/A` — no field derived from a person is read or emitted.

**16–17 (Access tier and quota).** `N/A` — no quota is consumed and no access tier changes.

**18. Claim provenance.** `PASS`, **and this gate is the reason the section is not skipped.** The
brand file's opening comment states the rule: "Filling a null in is how a claim turns on." Setting
`domain` therefore has to be checked against the claims list rather than assumed harmless.

It turns on nothing. No claim in `claims.ts` declares `requires: ["domain"]`; the fields any claim
gates on are `dataRegion`, `euRepresentative` and `dpaAvailable`, and all three are untouched. The
withheld set is identical before and after, and `apps/web/app/page.test.tsx` asserts the rendered
claim set independently.

The one claim-shaped statement this note *does* make — that the domain is registered and serving —
is not rendered anywhere. It is a fact about infrastructure, recorded here.

**Result:** `1 PASS, 17 N/A, 0 FAIL`

## 4. What was left out

- **No imprint page.** The founder's legal notice carries three things the brand file has no field
  for: an external-links liability disclaimer, a "brand of Now On Company Limited" line, and
  third-party trademark attributions for Apple and Google Play. The disclaimer and the brand line
  belong on an imprint page, which does not exist — the homepage renders the entity, address and
  registration, and nothing else. The Apple and Google Play attributions were **deliberately not
  carried over**: they exist because another product of the same company ships a mobile app. This
  product has none, and attributing trademarks you do not use is noise that makes the ones you do
  use harder to trust.
- **The `mp_` API key prefix is untouched.** It is now inconsistent with two names rather than one,
  and it is still the wrong thing to change here: the prefix is bound by a `CHECK` constraint, so
  changing it is a migration over live key rows — and it is the one identity string a customer
  pastes into their own code.
- **No `api.uniplain.com` route.** That is a DNS record plus a wrangler route plus a redeploy, and
  it belongs with the step that needs the Worker on a stable public hostname.
- **No OAuth redirect URIs registered.** This is the expensive half of a domain and the reason
  `brand.ts` called it blocking: §3.5 records Google's sensitive-scope verification as unbounded
  (documented 3–5 days, observed at over ten weeks), and changing the domain after that clock
  starts restarts it. Settling the domain *before* the clock starts is precisely what makes this
  change cheap; nothing here starts it.
- **Notes 1–52 were not rewritten.** See §1.
- **No logo, wordmark or favicon.** `logoPath`, `logoMarkPath` and `faviconPath` are unchanged and
  point at the existing files. The founder has design files to supply.

### The legal identity was confirmed, not changed

The founder supplied the legal notice during this change. Four of its fields were checked against
`brand.ts` and **all four already matched exactly** — `Now On Company Limited`, `112/246
Srinakarin, 10540 Samut Prakan, Thailand`, registration `0115564023284`, and responsible party.
Nothing was edited. That is the result the brand guard is for: the values had one home, so there
was nothing to reconcile.

The one field that changed is the contact address, which the founder moved onto the product domain:
`contact@uniplain.com`. `brand.test.ts` now asserts its host **equals `brand.domain`** rather than
asserting the literal, because the half-move — new domain, address left behind — is the failure an
equality assertion on the address alone passes straight through.

## 5. Open or unverified spec items this builds on

- **The name has not been checked against trademark.** `37-first-real-project.md` §204 raised
  availability *and* trademark; a registered `.com` answers only the first. This remains a founder
  matter and is recorded, not resolved.
- **`uniplain.com` is verified as registered, zoned on Cloudflare and CNAME'd to Vercel** — that
  much was read from the live account. **The site has not been fetched over that hostname**, so
  "serving the web app" is inferred from the DNS record, not observed.
- **`dataRegion` is still `ap-southeast-1` and the EU-hosting question is untouched.** The rename
  changes nothing about where data lives, and `brand.ts` still records that gate as unresolved.
- **`brand.domain` is now the *canonical* domain, which is a stronger statement than "a domain the
  company owns".** Nothing yet redirects `www`, and no apex-vs-`www` decision has been taken.
- **`contact@uniplain.com` DOES NOT RECEIVE MAIL YET, and this was verified rather than assumed.**
  Read from the live Cloudflare zone while writing this note: one `CNAME` record, **no `MX`
  record**, and an Email Routing configuration that exists but reads `enabled: false`,
  `status: "unconfigured"`. The address is in the brand file on the founder's instruction and is
  rendered on the homepage as a `mailto:`; until the routing is finished, mail sent to it bounces.
  This is the one place in this change where the repository states something that is not yet true
  of the world, and it is recorded here for that reason.

## 6. Verification

- `pnpm exec biome lint .` / `format .` — clean
- `pnpm -r typecheck` — clean
- `pnpm -r test` — see the PR body for the count
- `pnpm -r build` — `next build` and `wrangler deploy --dry-run` clean
- All eight `scripts/check-*.mjs` — pass, with the brand guard's failure on the draft
  `config.toml` comment recorded in §1 as evidence it was enforcing rather than passing vacuously
- `./supabase/tests/run-local.sh` — unchanged; this change adds no database object

### Mutations

Each mutation restores the pre-change code exactly, not a partial revert of it.

| # | Mutation | Result |
|---|---|---|
| N1 | `domain` left as `null` with `productName` renamed | **FAIL** — 2: the relationship test, and the production-resolution test |
| N2 | `siteUrl` localhost branch moved back after the domain branch | **FAIL** — 1: the development fallback test |
| N3 | `apiUrl` restored to `` `${siteUrl(env)}/api` `` | **FAIL** — 1: `expected [Function] to throw an error` |
| N4 | `config.toml` `project_id` left on the old value | **FAIL** — the brand guard: `project_id "numbadee" must equal the brand file value "uniplain"` |
| N5 | support address left on the old domain | **FAIL** — 1: `expected 'help.zwitchy.io' to be 'uniplain.com'` |
| N6 | the page's domain exemption stripped the domain instead of the address | **SURVIVED, then closed — see below** |

**N2 failing exactly one test is the result, not a weakness.** Twenty-five assertions in that file
could not see the reordering, because while `brand.domain` was null the two branches were
indistinguishable — which is precisely why the bug was there to introduce. The one test that
catches it is the one written for it. The same is true of N3.

**N6 survived on the first attempt, and the survival was real.** The homepage test asserts that the
page prints no absolute address of its own. Moving the support address onto the product domain
created a legitimate occurrence of the domain in the markup, so the assertion needed an exemption,
and the obvious form was: strip the support address, then assert the domain is absent.

Stripping `brand.domain` instead of `brand.supportEmail` — a one-word slip, and a plausible one —
makes that assertion vacuously true. Every test in the repository still passed.

The fix was to remove the degree of freedom rather than to test it. The assertion is now a **count**:
every occurrence of the domain in the markup must be an occurrence of the support address, plus a
guard that the address occurs at least once so the comparison cannot be `0 === 0`. Re-mutated by
injecting a bare `uniplain.com` into the markup, it fails with `expected 3 to be 2` — the 2 being
the address's own `href` and link text.

The lesson is the same one 52 recorded about a half-reverted mutation: a check that can be made
vacuous by a plausible edit is not protected by the tests that pass over it.

N1 is the other one worth stating plainly. Two separate equality assertions — `productName` is
`uniplain`, `domain` is `uniplain.com` — would both pass on a half-finished rename that changed one
and not the other. The test asserts the *relationship*: the domain's registrable label is the
product name. That is the assertion a half-rename fails.
