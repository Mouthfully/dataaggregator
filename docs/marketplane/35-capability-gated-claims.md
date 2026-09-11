# 35. Capability-gated claims, and a page that can tell the smaller truth

**PR:** #14 &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The claims boundary now answers two independent questions before copy may render: whether the brand
facts behind it are settled, and whether the capability it describes has launched. The existing
`requires` axis remains unchanged; `requiresCapabilities` is the second axis, and the available set
contains only capabilities present in the repository. Claims for the business-intelligence team,
answer, audit log, diagnosis, second-pass verification, alerts, reconciliation, AI monitoring, cost
preview, DataForSEO, billing and agency switching are therefore withheld today.

**The decision is an explicit, default-empty capability set rather than inference from planned
vocabulary.** A source in the contract says a row can be represented; it does not say a client can
fetch one. A missing launch declaration now hides a claim, which is the safe failure when a human
forgets a step. The rejected alternative was default-on booleans attached to claims: they make an
omitted flag publish the sentence, recreating issue #6 with a different field name.

Connectors are the one capability whose existence has a uniform filesystem fact. The `connectors`
sentence is composed from `IMPLEMENTED_SOURCE_IDS`, currently `ga4` and `woocommerce`, and
`check-capabilities.mjs` compares that mirror with source directories that contain both `client.ts`
and `normalize.ts`. `packages/brand` remains a leaf; the guard is the same deliberate two-copy
tripwire used where TypeScript and PostgreSQL cannot import one another. The rejected alternative
was importing `packages/connectors` into brand, which reverses the package boundary and risks
shipping connector runtime code with static copy.

`claim()` still throws on every withheld or unknown id, because build-time callers should fail.
The page uses `optionalClaim()` for capability-dependent slots: a known withheld claim returns
`null`, its card or paragraph is omitted, and a section with no surviving claims is omitted whole.
An unknown id still throws. **The page renders less, not substitute prose**, because a local fallback
would bypass the one claims list and become a second unreviewed claim.

## 2. Cost estimate

**Per connected account per month: `฿0.00` — no data-plane work.**

This changes static TypeScript, rendered marketing markup, tests and a build-time repository guard.
It adds no platform request, scheduled job, Worker invocation, database row, R2 object, KV write,
Supabase disk, bought data or dependency. Traffic and ordinary Vercel bandwidth remain outside the
per-connected-account model because this change does not alter their unit economics.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — the static claims gate makes no platform call and reads no credential.

**2. Vendor-key exception.** `N/A` — no company-held vendor key is used.

**3. No token pass-through.** `N/A` — no MCP or OAuth request path changes.

**4. Credential hygiene.** `N/A` — no credential, log or connection-health path changes.

### Tenancy

**5. RLS.** `N/A` — no table or policy changes.

**6. No service-role bypass.** `N/A` — no request or database path changes.

**7. No cross-workspace read.** `N/A` — the page reads no workspace data.

**8. No cross-customer aggregation or benchmarking.** `N/A` — the page processes no customer data;
the existing non-pooling claim is unchanged.

**9. API key scope.** `N/A` — the page accepts no API key.

### Data movement

**10. No resale or redistribution.** `N/A` — no platform data moves or is exposed.

**11. Meta client list.** `N/A` — no Meta onboarding, lifecycle or deletion path changes.

**12. Dependency licences.** `PASS` — no dependency is added.

### PII and consent

**13. Hash at the edge.** `N/A` — no form, fixture, payload, persistence or model prompt changes.

**14. Forbidden payloads rejected before egress.** `N/A` — there is no data egress.

**15. Per-destination consent.** `N/A` — writes remain deferred and untouched.

### Access tier and quota

**16. Tier reality.** `N/A` — the change makes no source request.

**17. No new long-lead dependency.** `PASS` — the gate, page and guard require no platform approval;
an unavailable capability is omitted.

### Claims

**18. Claim provenance.** `PASS` — every rendered promise still resolves from `@repo/brand`, and now
must also survive the capability gate. The connector sentence names exactly GA4 and WooCommerce,
the two source directories with clients and normalisers; the guard fails if that fact or its order
drifts. Known withheld copy produces no fallback, while an unknown id still fails the build.

**Result:** `3 PASS, 15 N/A, 0 FAIL`

## 4. What was left out

- **No capability was marked launched merely because it is planned.** Contract vocabulary and a
  specification decision are not implementation evidence.
- **No protected connector, contract, connection, payload, database or edge file changed.** The
  guard reads connector filenames; it does not modify or import that package.
- **No capability-specific auto-detection beyond connectors.** Diagnosis, billing and product
  surfaces do not have one stable filesystem signature; their launch remains an explicit reviewable
  declaration whose omission withholds copy.
- **No redesign of the marketing page or its structural calls to action.** This PR removes false
  copy and empty sections only; visual and conversion work would widen issue #6.
- **No new claims for WooCommerce's limits.** The connector remains unable to promise payment fees,
  pagination, window bisection or a connect-time probe, as notes 32 and 34 record.

## 5. Open or unverified spec items this builds on

- The product name, domain, data region, EU representative and DPA remain unsettled. Their existing
  brand-fact gates are unchanged; answering any of them differently does not weaken the capability
  gate.
- §11A.14 reserves connector slots 3 and 4, while the handover records two founder decisions that
  may change the launch set. The connector sentence follows implemented source modules, not either
  plan, so those decisions require no change here until code ships.
- What constitutes launch for a non-connector surface is necessarily owned by that surface. If a
  future implementation is partial, leaving its capability absent continues to under-claim rather
  than publish a promise early.

## 6. Verification

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | pass by exit code; five existing warnings and one existing info diagnostic |
| `pnpm exec biome format .` | pass by exit code |
| `pnpm -r typecheck` | pass |
| `pnpm -r test` | pass — **461 unit tests, up from 444** |
| `pnpm -r build` | pass |
| `node scripts/check-brand.mjs` | pass |
| `node scripts/check-tokens.mjs` | pass |
| `node scripts/check-dictionary.mjs` | pass |
| `node scripts/check-capabilities.mjs` | pass |

The repository was checked out on Windows with `core.autocrlf`; the bare format and dictionary
commands interpret untouched CRLF files differently from CI. Their recorded pass is from a clean LF
worktree at the same commit, rather than rewriting unrelated files in the task checkout. Every exit
code above is the named command's own exit code; none was piped through another command.

### Mutations

| Mutation | Caught by |
|---|---|
| Skip the capability predicate entirely | brand test withholding every unlaunched claim |
| Accept any one requirement instead of every requirement | partial-billing test keeps the four-requirement pricing claim withheld |
| Remove `woocommerce` from the guarded source mirror | `check-capabilities.mjs` reports the implemented directory missing from the claim list |
| Restore the stale five-source connector sentence from `HEAD^` | brand test pins the derived two-source sentence and rejects the unimplemented names |
| Make `optionalClaim()` return declared copy without consulting the allowed map | web tests reject all eleven unlaunched page claims in rendered output |
| Make an unknown optional claim return `null` | web test requires unknown ids to throw rather than degrade |
| Render the pricing wrapper even when both claims are withheld | web test rejects the empty `How it is priced` section |

All seven mutations were taken from `git show` of the committed baseline or, for the stale connector
sentence, from `git show HEAD^`. Each was confirmed in the file before its failure was accepted, each
changed rendered or gating behaviour, and every named test was observed failing. No mutation
survived.
