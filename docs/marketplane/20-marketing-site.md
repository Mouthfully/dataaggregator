# 20. The marketing site, and the claims boundary it enforces

**PR:** #4 &nbsp;·&nbsp; **Date:** 2026-09-09 &nbsp;·&nbsp; **Status:** merged retrospectively — **documentation only**

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

This note records the unit as it shipped; it does not bless its present copy. Spec §11A.1 was added
later and now contradicts the live `positioning` claim, as `19-sme-repositioning.md` records. Fixing
that claim and its site assertions is a separate code change, not hidden inside this retrospective
documentation PR.

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
the allowed-claims list, withheld claims are unreachable, and tests reject forbidden output. The
later §11A.1 positioning contradiction is explicitly outstanding and is why this retrospective
note does not describe the current page as launch-ready.

**Result:** `3 PASS, 15 N/A, 0 FAIL`

## 4. What was left out

- **The §11A.1 positioning correction.** It post-dates the site and belongs in its own code PR with
  the dependent assertions updated.
- **The interactive demo card and state machine.** The source artboard contained them, but the
  static first screen did not need client-side state to establish the claims boundary.
- **A settled product name, domain, data region, EU representative and DPA claim.** Those remain
  founder or legal decisions; the site withholds rather than invents them.
- **Signup, authentication, analytics and lead capture.** None was required to replace the
  placeholder, and each would introduce a separate privacy or product decision.
- **The later SME application surfaces.** The daily brief, weekly action sheet, reports and Ask
  surface are product work, not marketing-site scope.

## 5. Open or unverified spec items this builds on

- **The product name and domain are unsettled.** The site renders neither; settling them changes
  brand data rather than licensing local literals.
- **The data region and any EU representation or DPA promise are unresolved.** Their claims remain
  withheld until the corresponding facts exist.
- **Platform availability and approval timelines are not marketing claims.** The page names only
  the connector categories permitted by its claims list and makes no timing promise.
- **The current primary-customer message is resolved by §11A.1 but not yet reflected in code.** The
  separate positioning correction must land before the current site is treated as publishable.

None of the unresolved platform restatement, access-tier or MCP-policy questions affect this static
page because it performs no data operation.

## 6. Verification

The original implementation reported 318 unit tests and 108 database assertions, with lint,
format, typecheck, build and all three repository guards passing. This retrospective note was
verified again against the current tree; the commands and current totals belong to the PR record,
not to the historical implementation claim above.
