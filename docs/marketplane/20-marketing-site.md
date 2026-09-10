# 20. The marketing site, and the claims boundary it enforces

**PR:** #8 &nbsp;·&nbsp; **Date:** 2026-09-10 &nbsp;·&nbsp; **Status:** retrospective — **documentation only**

<!--
PROVENANCE. The body of this note was written by `codex/establish-a-connection` on PR #4 and is
salvaged here largely verbatim, because it is the note owed since `19-sme-repositioning.md` first
recorded that the numbering jumps 19 -> 21. PR #4 also carried a competing rewrite of the
`positioning` claim which PR #5 landed differently on 2026-09-10; #4 cannot merge as a whole
without conflicting on `packages/brand/src/claims.ts` and breaking `apps/web/app/page.test.tsx`,
whose assertion names a sentence no longer in the tree. Taking the note and leaving the rest is the
salvage. Two paragraphs are corrected where merging #5 made them false; both corrections are marked.
-->

---

## 1. What this is, and the decision taken

This is the design note owed by the marketing site shipped in commit `6ce3cd7`. The site replaced
the placeholder in `apps/web` with a static Next.js page whose marketing sentences are resolved by
identifier from `@repo/brand`; an unknown or withheld identifier throws instead of silently
rendering fallback copy. It also introduced rendered-output assertions for forbidden claims,
withheld claims, identity leakage and colour literals.

**The decision was to make the allowed-claims list an executable publishing boundary, rather than
relying on copy review.** Page structure remains local to the application, but publishable factual
claims live in `packages/brand/src/claims.ts`, carry specification citations, and can depend on
brand facts that must exist before the claim becomes available. The alternative — duplicating
approved prose in the page — was rejected because a later specification decision could not
reliably withdraw every copy.

The site deliberately omitted the unsettled product name and domain. It led with the tagline and
the then-current positioning claim, while legal identity and contact fields were read from the one
brand file. Its visual values came from the one token stylesheet through `@repo/tokens`.

**CORRECTED ON SALVAGE.** As written on 9 September this paragraph said the §11A.1 positioning
contradiction was outstanding and that fixing it was "a separate code change, not hidden inside
this retrospective documentation PR". That separate change **landed on 2026-09-10** as
`29-positioning-reconciliation.md`, and the claim now reads *"The business-intelligence team a
small business does not have. Your own numbers, and the verified reason they moved."*, citing
`["11A.1", "11.9"]`. The note's own argument is unaffected — it is the record of a unit as it
shipped, and the boundary it describes is exactly what made a one-string correction sufficient
later.

## 2. Cost estimate

**Per connected account per month: ฿0.00 — no data-plane work.**

The page is static and adds no platform reads, scheduled work, database storage, bought data or
per-account operation. Its deployment uses the already-selected Vercel surface. The added test
dependencies run at build time and do not enter the served application.

This estimate excludes ordinary Vercel traffic and bandwidth because those costs follow page
visits, not connected accounts, and no measured traffic profile exists from which to derive them.
It also makes no use of the specification's unverified performance-COGS estimate.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — the static page makes no platform call and reads no credential.

**2. Vendor-key exception.** `N/A` — it uses no company-held data-provider key.

**3. No token pass-through.** `N/A` — it has no MCP or OAuth request path.

**4. Credential hygiene.** `N/A` — it handles no credentials, logs or connection health.

### Tenancy

**5. RLS.** `N/A` — it adds no table and reads no workspace data.

**6. No service-role bypass.** `N/A` — it has no database client or service role.

**7. No cross-workspace read.** `N/A` — it issues no query and has no cache of customer data.

**8. No cross-customer aggregation or benchmarking.** `N/A` — it processes no customer data.

**9. API key scope.** `N/A` — it accepts no API key.

### Data movement

**10. No resale or redistribution.** `N/A` — it returns static public content, not platform data.

**11. Meta client list.** `N/A` — it does not touch onboarding, lifecycle or deletion.

**12. Dependency licences.** `PASS` — the site added only the repository's existing React,
Next.js and Vitest toolchain families; no ELv2 or AGPL served-path dependency was introduced.

### PII and consent

**13. Hash at the edge.** `N/A` — there is no form, fixture, persistence or LLM prompt.

**14. Forbidden payloads rejected before egress.** `N/A` — there is no data egress.

**15. Per-destination consent.** `N/A` — audience writes remain absent.

### Access tier and quota

**16. Tier reality.** `N/A` — no source API is called.

**17. No new long-lead dependency.** `PASS` — the page requires no platform approval; facts that
need founder or legal decisions are withheld instead of being presented.

### Claims

**18. Claim provenance.** `PASS` for the shipped unit — rendered marketing sentences resolve from
the allowed-claims list, withheld claims are unreachable, and tests reject forbidden output.

**CORRECTED ON SALVAGE.** The original ended this gate by saying the §11A.1 contradiction was why
the note "does not describe the current page as launch-ready". The contradiction is resolved, and
the page is still not launch-ready — for a different and larger reason recorded after this note was
drafted. Issue [#6](https://github.com/Mouthfully/dataaggregator/issues/6): `allowedClaims()` gates
on brand fields being non-null and **has no notion of whether the thing a claim describes exists**.
Eight of the 23 claims the page renders name capabilities that are not built; `connectors` names
five sources when `packages/connectors/src/sources/` holds only `ga4`. The claims boundary this
note celebrates is real and load-bearing, and it governs *whether a sentence may be said* — never
*whether the thing it describes has been built*. That second gate is still missing.

**Result:** `3 PASS, 15 N/A, 0 FAIL`

## 4. What was left out

- **The §11A.1 positioning correction.** It post-dates the site and belonged in its own code PR
  with the dependent assertions updated. It has since landed; see `29-positioning-reconciliation.md`.
- **The interactive demo card and state machine.** The source artboard contained them, but the
  static first screen did not need client-side state to establish the claims boundary.
- **A settled product name, domain, data region, EU representative and DPA claim.** Those remain
  founder or legal decisions; the site withholds rather than invents them.
- **Signup, authentication, analytics and lead capture.** None was required to replace the
  placeholder, and each would introduce a separate privacy or product decision.
- **The later SME application surfaces.** The daily brief, weekly action sheet, reports and Ask
  surface are product work, not marketing-site scope. `31-owner-first-client.md` now proposes a
  design for them; none is built.
- **The capability gate of issue #6.** Named here, deliberately not attempted. It belongs with the
  next change to this page rather than with a retrospective note about the last one.

## 5. Open or unverified spec items this builds on

- **The product name and domain are unsettled.** The site renders neither; settling them changes
  brand data rather than licensing local literals.
- **The data region and any EU representation or DPA promise are unresolved.** Their claims remain
  withheld until the corresponding facts exist.
- **Platform availability and approval timelines are not marketing claims.** The page names only
  the connector categories permitted by its claims list and makes no timing promise.
- **Whether a claims list can be trusted without a capability gate.** Issue #6, and the sharpest
  of these. The boundary is executable for *provenance* and unenforced for *existence*.

None of the unresolved platform restatement, access-tier or MCP-policy questions affect this static
page because it performs no data operation.

## 6. Verification

The original implementation reported 318 unit tests and 108 database assertions, with lint, format,
typecheck, build and all three repository guards passing.

**On salvage**, the current tree was re-verified: lint, format, typecheck, build and the brand,
token and dictionary guards all pass by exit code, with **397 unit tests** and 178 database
assertions. Those totals belong to the tree this note landed on, not to the historical
implementation above, which is why both are stated.

No test covers a document, and none should.
