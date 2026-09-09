# 29. Reconcile the live positioning claim with the SME decision

**PR:** #5 &nbsp;·&nbsp; **Date:** 2026-09-09 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

Spec §11A.1 moves the primary customer from agencies and brands to an owner-run small business
with no analyst and no IT function. It explicitly names the `positioning` claim and the marketing
site that renders it as contradictory code that must be reconciled before launch. This change
closes only that inconsistency.

**The decision was to replace the claim in place, retaining its stable identifier and making
§11A.1 its sole source.** Keeping the identifier means every consumer receives the decided message
without duplicating copy or introducing a migration layer. Retaining §11.9 as a claim source was
rejected: verified root cause and the correctness guarantee remain product substance, but §11A.1
explicitly says they stop being the pitch.

The rendered-page test now asserts all three load-bearing properties directly: the new SME message
is visible, its claim cites §11A.1, and the superseded agency-and-brand message is absent.

## 2. Cost estimate

**Per connected account per month: ฿0.00.** One static string and its build-time assertion changed.
There is no platform read, model call, database row, scheduled invocation, dependency or additional
served byte attributable to a connected account.

## 3. Platform-terms check

**1–4. Credential.** `N/A` — no credential or platform request path changed.

**5–9. Tenancy.** `N/A` — no table, query, cache, aggregate or API key changed.

**10–11. Data movement and Meta client list.** `N/A` — the page moves no platform or client data.

**12. Dependency licences.** `N/A` — no dependency changed.

**13–15. PII and consent.** `N/A` — no input, payload, persistence, model prompt or write exists.

**16–17. Access tier and long-lead dependencies.** `N/A` — no source API or approval is involved.

**18. Claim provenance.** `PASS` — the changed user-visible sentence remains in the central claims
list, cites the binding decision that supports it, and is rendered through the existing `claim()`
boundary. The test refuses both citation drift and survival of the superseded message.

**Result:** `1 PASS, 17 N/A, 0 FAIL`

## 4. What was left out

- **A wider site redesign.** Page structure, calls to action, developer-oriented sections and the
  four later application surfaces are unchanged; this PR reconciles the contradiction §11A.1 names.
- **A new tagline.** The existing tagline is compatible with the SME decision and has not been
  contradicted by the decision log.
- **Removal of agency support.** Agencies remain a secondary channel under §11A.1, so the separate
  agency-mode claim remains true and is not the primary positioning sentence.
- **Connector claims.** The launch substitution and later Thai commerce set have their own shipped
  decisions and connector work; changing their site presentation here would widen scope.
- **The unsettled name, domain and legal promises.** Their existing brand-field gates remain intact.

## 5. Open or unverified spec items this builds on

None. §11A.1 is a recorded decision rather than an unverified finding. This change does not depend
on the open founder decisions, connector access, source quotas, data region or platform policy
interpretations.

## 6. Verification

The repository gates, focused brand and web suites, typecheck and production builds pass. The full
suite now contains **397 unit tests**. A deliberate mutation restoring the old positioning sentence
was confirmed in the source, failed the new rendered-page assertion, and was then removed; the
committed tree was checked clean afterwards.
