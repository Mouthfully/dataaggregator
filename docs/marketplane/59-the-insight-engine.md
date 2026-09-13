# 59. The insight engine: the model writes language, it never does arithmetic

**PR:** #41 &nbsp;·&nbsp; **Date:** 2026-09-13 &nbsp;·&nbsp; **Status:** proposed

<!-- Issue #49 section 5. The copy half of #49 is note 60; this note is the engine only. -->

---

## 1. What this is, and the decision taken

`packages/insights` — the first generation code anywhere in this repository. Before this,
`grep -ri openrouter` matched three files, all under `docs/`, while `AssistantPanel.tsx` rendered
"Your AI-powered analyst" and a hardcoded `CARD_PROMPT = "Here are 3 ways to grow your business
this month:"` above three invented task rows. The copy was live and there was nothing behind it.

Six modules: `figures.ts` (the arithmetic), `brief.ts` (the prompt), `request.ts` (the body),
`client.ts` (the fetch), `verify.ts` (the gate), `generate.ts` (the loop once). 95 tests.

**The decision: the model writes language and never does arithmetic, and this is enforced at two
ends rather than asked for in a prompt.** Every delta, share, ranking and impact estimate is
computed in TypeScript, printed into the prompt as a given fact, and then checked back out of the
model's answer. A number that cannot be traced to the input set refuses the whole insight.

**The alternative rejected, and it is the one every product in this category takes:** hand the model
the rows and ask it to summarise them. It produces better prose, and it produces numbers. A number a
model invented that looks plausible is the exact failure this product is sold against — the same
class of mistake as `{row.revenue ?? 0}` printing a confident zero for a day nobody measured — and
it is indistinguishable from a correct brief right up until someone acts on it.

**The second decision, which cost the most to hold: a refusal is not repaired.** Not stripped, not
rounded to something true, not regenerated with a sterner prompt. Each of those is worse than it
looks. Stripping leaves a sentence whose remaining words still assert the deleted figure. Rounding
to a nearby true number makes the sentence a forgery rather than a mistake, because the words were
written about the invented one. And retrying is the worst: a loop that regenerates until the gate
passes is a loop selecting for outputs that slip past the gate. `generate.test.ts` asserts the
fetch is called exactly once after a refusal.

### Where uncertainty comes from

The artboard promises *"impact is an estimate from your own numbers, shown as a range where it is
uncertain"*. A range is only honest if both ends are arithmetic, so there is no error bar, no
confidence constant and no fudge factor anywhere in `figures.ts`. The width comes from one place —
the envelope's own `is_provisional` flag, splitting contributing rows into those the platform has
settled and those it may still restate:

| Contributing rows | Estimate |
|---|---|
| none provisional | a point, from every row |
| some provisional | a **range**: the settled rows at one end, every row at the other. That is the amount the platform can still move, measured rather than assumed |
| all provisional | a point, **marked provisional in words** |

The third row is the one worth arguing with, and it is deliberate. With no settled subset there is
nothing to bound the figure with, and manufacturing a band around it (`±10%`) would be exactly the
decoration the rule forbids. For a POS reading a merchant's own database nothing ever finalises —
`restatement.ts` already treats WooCommerce that way with `windowDays: null` — so this is the
permanent case for the plan's own target customer, and `58-plan-reconciliation.md` §1.5 requires the
UI to say so *in those words* rather than leaving `is_provisional` as a flag nobody explains.
`renderUserPrompt` does.

### What is refused rather than defaulted

Six refusals, each of which is a number this package will not print:

| Refusal | What it prevents |
|---|---|
| `mixed_currency` | totalling THB and USD. The envelope carries `fx_rate`; inventing one here is not this module's job |
| `no_rows` / `no_readable_metric` | a brief about a period nothing measured |
| `invalid_period` | a comparison against a span that runs backwards |
| percentage change against a zero comparison | "up 100%" from a period that measured nothing. The figure is **absent**, not `?? 0`, not `Infinity` |
| average ticket with zero orders | a division that renders as a confident amount |
| `spend_without_return` where the return side is absent | an action raised on a number nobody measured. Absent is not zero |

## 2. Cost estimate

**Per connected account per month:** `unchanged — nothing schedules this yet`

No scheduled work is added. `generateInsight` has no caller in `apps/` or `supabase/`, by choice:
`58-plan-reconciliation.md` §2.3 establishes that the scheduled half of this system has no identity
(`app_webhook` and `app_scheduler` are `NOLOGIN NOBYPASSRLS`, and `packages/store/src/jwt.ts` mints
only `anon | authenticated | app_ingest`), so there is no clock to hang a morning brief on. Wiring a
generator to a cron that returns `not_configured` would add cost and capability in the same commit
and deliver neither.

What the shape of the cost will be when something does call it, stated so the next person does not
have to derive it:

| Term | Value |
|---|---|
| calls per connected account per day | 1 for a morning brief, 1 per week for an action sheet |
| prompt size | the rendered figure set. Measured, not estimated: the test fixture — 8 rows, 12 dictionary metrics, 2 sources, 3 actions — renders **4,277 bytes over 60 lines, 40 figures**. It grows with *sources × metrics*, not with row count, because every row is aggregated before it reaches the prompt |
| completion size | bounded by the response schema: 3 summary lines, 1 unusual line, 1 action. ~200 tokens |
| inference | OpenRouter passes provider pricing through with no markup. At a mid-tier model this is a fraction of a cent per brief |
| retries | at most one, and never on a 4xx. A refused brief is **not** regenerated, so a fabricating model costs one call, not a loop |

The cost line that is *not* small is the one nobody bills for: a brief that is wrong. That is what
the gate is for.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — no platform call is added. `OPENROUTER_API_KEY` is a **platform** key for a
public inference service, not a tenant credential, and it is deliberately kept away from
`CREDENTIAL_KEK` and the vault path, which exist for per-tenant secrets under RLS. It is read from
options passed to `postInsight`, never from a vault.

**2. Vendor-key exception.** `PASS` — this is the permitted single-key surface (11.2): an
AI-answer/inference provider, not a platform data source. Note the distinction from gate 1: the
*key* is company-held; the *data* in the prompt is the tenant's own, which is why §3 gate 13 below
matters more than it usually does.

**3. No token pass-through.** `N/A` — no MCP surface touched.

**4. Credential hygiene.** `PASS` — the key appears only in an `authorization` header built inside
`attempt()`. It is not logged, not stored, not in a fixture, and not in an error message:
`InsightClientError("missing_api_key", …)` names the variable, never a value.

### Tenancy

**5. RLS.** `N/A` — no table added. `InsightRow` is a read shape, not a schema.

**6. No service-role bypass.** `N/A` — no request path added.

**7. No cross-workspace read.** `PASS` — `buildFigureSet` aggregates only the rows it is handed and
has no query of its own. The `user` field sent upstream is an opaque per-tenant digest, so even the
provider's own logs cannot group two workspaces together.

**8. No cross-customer aggregation or benchmarking.** `PASS` — and this is the gate the whole
package is shaped around. There is no percentile, no median, no peer comparison and no training
input. Every comparison is one tenant's own period against its own earlier period.
`provider: { data_collection: "deny" }` is the same commitment made to the inference provider.

**9. API key scope.** `N/A` — no API key surface added.

### Data movement

**10. No resale or redistribution.** `PASS`, with the honest caveat stated rather than buried:
**tenant business figures do leave the system, to an inference provider.** That is what the two
privacy fields are for, and they are a mitigation rather than a guarantee — see §5.

**11. Meta client list.** `N/A`.

**12. Dependency licences.** `PASS` — the package adds **no** third-party dependency. It depends on
`@repo/contract` and `@repo/brand` and calls `fetch`. There is no OpenRouter SDK, no LLM client
library, no tokeniser.

### PII and consent

**13. Hash at the edge.** `PASS`, and this one is enforced by the type rather than by care. The
gate asks whether a raw email, phone, name or address can reach *an LLM prompt*. `InsightRow` does
not carry an entity `name` field at all, and `renderUserPrompt` never prints `entity.id` or
`entity.account_id`. What reaches the prompt is: dictionary metric labels written in `figures.ts`,
dictionary source ids, ISO dates, an ISO 4217 code, an IANA timezone, and numbers this codebase
computed. `brief.test.ts` asserts it, against fixtures that carry deliberately identifiable ids so
the assertion cannot pass by accident. The system prompt is a module constant with no parameters,
so there is no signature through which tenant data could reach it.

**14. Forbidden payloads rejected before egress.** `PASS` — the metric dictionary has no
special-category field, and `metricsSchema` is `.strict()`.

**15. Per-destination consent.** `N/A` — no write path.

### Access tier and quota

**16. Tier reality.** `PASS` — OpenRouter is self-serve with a Bearer key and no approval gate.

**17. No new long-lead dependency.** `PASS` — nothing here waits on an approval.

### Claims

**18. Claim provenance.** `PASS` for this note's code, and the reason is that **this PR does not
turn on a claim.** `surface:answer` stays out of `AVAILABLE_CAPABILITIES` (see §4). The engine also
enforces the claims list in the other direction, which is new: `verifyInsight` runs
`FORBIDDEN_CLAIMS` over the model's own sentences, so a brief that writes "a competitor undercut
your listing" or "pay as you go" is refused before a customer sees it. The build-time guard could
never have caught that, because the sentence does not exist at build time.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 4. What was left out

**`surface:answer` is NOT flipped, and this is a considered refusal of one line in the issue's own
"done looks like" list.** Issue #49 names adding it to `AVAILABLE_CAPABILITIES` as the release
switch and says it "must not be flipped before the engine is real". The engine is now real. It is
still not flipped, because the capability gates the `byoc` claim — *"We sell normalisation,
restatement handling, scheduling and the answer, not access to your data"* — and **nothing delivers
an answer to a customer yet.** `generateInsight` has no caller. The issue itself draws the same
line: "building the engine is not the same as shipping four surfaces." Flipping a capability flag
because the code behind it compiles is precisely the failure the capability axis exists to prevent.

What it takes to flip it, so the next person does not have to guess: a scheduler identity
(§2.3 of note 58), a route or channel adapter that delivers a brief, and a stored record of the
brief with its provenance. Then the claim is true.

**No caller, no cron, no route.** See §2.

**No hourly grain, no `occupancy`, no `cost_of_goods`.** The artboard's café screens lead with
hourly revenue and its guesthouse screens with occupancy. `date` is a calendar day and the upsert
key has no time component; `occupancy` and `cost_of_goods` are not in the dictionary. Adding either
to `leadingMetrics` would fail `scripts/check-dictionary.mjs`, which is the guard working. The
per-business-type emphasis is therefore expressed only over metrics that exist — which is exactly
what "a café gets hourly revenue and delivery share" reduces to once it has to be true.

**Only three detectors.** `channel_decline`, `commission_load`, `spend_without_return`. A fourth,
`weekday_gap`, is declared in `ACTION_KINDS` and has no detector: it needs a per-weekday spread to
express uncertainty honestly, and with a two-week window there are not enough observations of any
one weekday to compute one. Naming the kind without implementing it is deliberate — the ranked list
is data, and a detector added later needs no change anywhere else.

**No figure-id citation in the model's output.** The gate checks that every number came from the
set; it does not check that each number was used for the claim it belongs to. "Commission was THB
4,000" passes if THB 4,000 is *some* figure. Binding each number to its own claim needs the model
to cite figure ids in the response schema, and that is the next thing to build here.

**Direction is not checked.** Matching is on magnitude, so "up 9%" where the data fell 9% passes the
number check. The prompt states the direction and the figure labels carry it; this is a language
error the gate is not built to find, and it is written into `verify.ts`'s own header rather than
left for someone to discover.

**One spelled numeral is allowed through.** `SPELLED_QUANTITIES` refuses "two", "double", "half"
and thirty-odd others, because a quantity written as a word cannot be checked against a figure.
**"one" is deliberately absent**, because the product's own central sentence is "one thing worth
doing today" and an owner reading "1 thing worth doing today" is reading a machine. The cost is that
"orders fell by one" would pass. Accepted, and written down.

## 5. Open or unverified spec items this builds on

**OpenRouter's provider policy data is its own best knowledge, not a guarantee.** OpenRouter states
that its provider-policy data "is not a definitive source of third party data policies, but
represents our best knowledge", and `data_collection: "deny"` alone still permits 30–55 day
retention at some providers. **So the site must not say "your data is never used to train AI."** It
may say what is enforced: both privacy fields on every call, in one builder that cannot be
bypassed, no plugins, an opaque tenant id. If the policy data turns out to be wrong about a
provider, what protects the tenant is that the request asked — and that is all any caller can do.

**`data_collection` defaults to `"allow"` upstream.** The safe behaviour is opt-in. This is the
reason `request.ts` exists as a module at all, and the reason `client.ts` re-checks a body it did
not build.

**Which provider served a call is not knowable from the request.** Default routing can serve the
same request from a different provider run to run, so `InsightCompletion` carries `servedByModel`
and `servedByProvider` read off the *response*. A caller that stores briefs should store both; a
brief nobody can attribute is one nobody can audit.

**Nothing in this repository runs on a timer** (note 58 §1.6, spot-checked). A product whose promise
is "every morning" currently has no morning. This package does not change that.

## 6. Mutation testing: every guard broken on purpose, once

A refusal nothing tests is one the next person deletes. Each mutation below was applied, the test
suite run, the exit code recorded, and the mutation reverted. `1` means the guard fired.

| # | Mutation | Result |
|---|---|---|
| 1 | delete `data_collection: "deny"` from `PRIVACY_FIELDS` | `request.test=1  client.test=1  generate.test=1` |
| 2 | delete `zdr: true` | `request.test=1  client.test=1` |
| 3 | make `client.ts` skip `assertPrivacyFields` | `client.test=1` |
| 4 | make the verifier accept an unmatched number | `verify.test=1  generate.test=1` |
| 5 | make the verifier **repair** — strip the bad number instead of refusing | `verify.test=1` |
| 6 | `?? 0` on the zero-comparison percentage (`/ (Math.abs(prior) \|\| 1)`) | `figures.test=1` |
| 7 | manufacture a `±10%` band for the all-provisional case | `figures.test=1` |
| 8 | sum `position` instead of weighting it by impressions | `figures.test=1` |
| 9 | total across two currencies instead of refusing | `figures.test=1  generate.test=1` |
| 10 | retry on a 4xx | `client.test=1` |
| 11 | regenerate once after a refusal | `generate.test=1` |

All eleven reverted; the suite is green at 95 passing. Mutation 6 is worth singling out: it is the
one-character change that turns this package back into every other BI tool, and the test that
catches it asserts the *absence* of a number rather than the presence of one.
