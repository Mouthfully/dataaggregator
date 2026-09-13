# Compliance: what is actually implemented, what is partial, and what is absent

The reference `CLAUDE.md` points at. Read it before claiming anything is covered.

**Method.** Four frameworks were mapped against this repository by separate agents, each then
handed to an adversary told to refute it, with instructions that "this is not implemented" is the
most valuable finding available. Where a control is called **implemented** it names the file or test
that proves it. **No evidence, no "implemented".** Anything that could not be verified from this
environment is marked *unverified* rather than laundered into a fact.

**Status at a glance**, and the shape of it is the honest headline:

| Framework | Implemented | Partial | Absent | N/A | Of |
|---|---|---|---|---|---|
| SOC 2 Type II | **0** | 19 | 15 | 1 | 35 |
| ISO/IEC 27001:2022 | 4 | 14 | 6 | — | 24 |
| GDPR | 3 | 9 | 12 | 1 | 25 |
| PDPA (Thailand) | 2 | 3 | 12 | 3 | 20 |

Zero SOC 2 criteria are fully implemented. That is not a failure of engineering — it is what a
framework built around policies, an auditor and an observation window looks like when measured
against a codebase.

---

## 1. PDPA — Thailand. The one that binds now

**Applicability: total, with no test to fail.** PDPA s.5 governs collection, use or disclosure by a
controller *located in the Kingdom*, whether the processing happens inside or outside it.
`brand.legalEntity` is a Thai juristic person with a Thai registration and a Samut Prakan address.
That single fact settles it. It does not matter where the customers are, where the data subjects
are, or where the data is hosted — **hosting in Singapore does not move it out of reach, it adds a
s.28 cross-border transfer obligation on top.**

**What it is:** a law. No auditor, no report, no observation window, no certificate, nothing to
obtain. In force since 1 June 2022. There is no "audit-ready" milestone and no date on which a claim
becomes available.

### Implemented

| § | Requirement | Evidence |
|---|---|---|
| s.22 | Collect only what is necessary | `packages/connectors/src/sources/woocommerce/normalize.ts` — the normalised row carries identifiers, money, quantities, dates, currency and timezone, and **no buyer name, email, phone or address** |
| s.37(1), cookies | A non-essential cookie needs a basis | `apps/web/app/_gate/token.ts` — the pre-launch cookie is an HMAC over a fixed label, one-way, identifies nobody, holds no per-person value |

### The eight blocking gaps, worst first

1. **s.37(3) — no deletion system exists.** No retention period is set for `envelope_rows`,
   `restatement_events`, `connections`, `invitations`, `waitlist`, `members`, `billing_customers` or
   the R2 payload archive, and **nothing deletes any of them.**
2. **s.28 — every byte crosses a border with no mechanism.** Five transfers, each needing a s.28 or
   s.29 basis: Supabase (Singapore), Cloudflare R2, Vercel, Stripe, **and OpenRouter**, which
   receives prompts built from a tenant's figures.
3. **s.40 — the company calls itself a processor and has no instrument.** `/privacy` declares
   processor status for customer platform data; `brand.dpaAvailable` is `false` and no agreement
   exists. That leaves every future customer exposed on s.40's controller-processor requirement.
4. **s.23 — two mandatory disclosures are missing from the collection notice**: the retention period
   (s.23(3)) and the categories of recipient (s.23(4)). Both are `open: true` clauses on `/privacy`
   — the candour is right, the gap is still a gap.
5. **s.39 — no record of processing activities**, and the small-business exemption is **forfeited**
   because processing is not occasional: the ingest runs on a nightly cron (`INGEST_CRON`).
6. **s.30–s.36 — no data-subject rights path at all.** No intake, no identity check, no clock, no
   export, no rectification, no objection, no erasure.
7. **s.19 / s.23 at the waiting list.** *Partly fixed:* the form now carries a purpose, a retention
   statement and a link to the notice. Still absent: a consent artefact recording what was agreed
   and when.
8. **s.37(1) — no personal-data audit trail**, which also disables the s.37(4) breach assessment.
   No access-log table exists in any migration; `claims.ts` correctly withholds `audit-log`.

**Unverified and load-bearing:** whether the published contact address actually receives mail. One
agent reported no MX record; **I could not verify that from this environment** (no `dig`/`host`). If
it is true, the statutory rights channel on a public notice is a dead end, and it is the cheapest
serious gap on this list to close.

### Needs a human, not code

A founder decision on **retention per category**. A **Thai-qualified lawyer** for the s.40
controller-to-processor agreement and the s.28 transfer instruments. A **record of processing**
owned by a person. **Sub-processor diligence and contracts.** A **breach runbook with a named human
and a route to the PDPC**. A **deliverable legal inbox**. A **DPO watch** — no appointment is needed
today, but the trigger is a standing review item, not a one-off.

---

## 2. GDPR — applies only if a business decision says so

**Applicability is genuinely open and nobody has decided it.** The entity is Thai, so the GDPR
reaches it only through Art. 3(2) — offering goods or services to data subjects in the Union, or
monitoring their behaviour. That turns on whether the business sells into the EU. Until it is
settled, `brand.euRepresentative` stays `null` and the `gdpr` and `dpa` claims stay withheld.

Note: **if Art. 3(2) does bite, Art. 27 requires a representative in the Union designated in
writing**, and every PDPA gap above reappears with a different section number and a larger fine.

### Implemented

| Article | Requirement | Evidence |
|---|---|---|
| Art. 5(1)(c) | Data minimisation | `woocommerce/normalize.ts` emits no buyer identifier |
| Art. 25(1) | Data protection by design | **FORCE** row-level security (not merely ENABLE) on **all fifteen** tables in `public`, asserted from the catalogue by `supabase/tests/15_force_rls.sql`. Three tables had only ENABLE until `20260913000200_force_rls.sql`; the earlier version of this row said "all seven tenancy tables" and was silent about the eight added since |
| Art. 5(1)(a) / 12(1) | Transparency | `/privacy` and `/terms` — every statement is read out of the repository or declared absent; gaps are marked rather than filled |

Everything else is partial or absent, and the gaps mirror §1: Art. 15–20 rights, Art. 30 records,
Art. 32 security measures, Art. 33–34 breach notification, Art. 28 processor terms, Art. 44–49
transfers.

---

## 3. ISO/IEC 27001:2022 — not held, and mostly not a code problem

**Applicability: voluntary, by procurement.** No statute imposes it. PDPA and GDPR Art. 32(3)/42
treat certification as *one way of demonstrating* measures, never as a requirement. The demand would
come from an enterprise buyer — and decision 11A.1 moved the primary customer to an owner-run small
business that will never run a security review.

**What it is:** a certificate from an accredited body against an **ISMS** — clauses 4–10: context,
leadership, risk assessment, internal audit, management review. Annex A is a *reference* control set
justified in a Statement of Applicability. **Implementing every technical control in Annex A
produces a well-run system and not a certificate.**

### Implemented

| Control | Requirement | Evidence |
|---|---|---|
| A.5.15 | Access control enforced, not intended | FORCE RLS on **every** table in `public` (15 of 15), explicit per-table grants, `revoke all … from anon`; `supabase/tests/15_force_rls.sql` reads the catalogue rather than a list, so a table added without it fails on the day it lands |
| A.5.17 | Authentication information managed | `20260908000600_api_keys.sql` — only a SHA-256 `key_hash` and a non-secret prefix are stored; plaintext shown once |
| A.8.3 | Information access restricted | as A.5.15, plus no DELETE on `organisations`/`workspaces`/`invitations`/`api_keys` and no policy granting an API-key session write access. Note what this rests on: every SECURITY DEFINER writer here reaches a FORCED table through no policy admitting its owner, so the whole write path depends on the owner holding `BYPASSRLS`. Demonstrated as a mechanism in `15_force_rls.sql`; **unverified on the hosted project** |
| A.8.33 | Test information protected | every fixture is hand-written synthetic TypeScript; no production data in any test |

### Absent and code-shaped, so these are ours to fix

- **A.8.8 vulnerability management** — no `pnpm audit` step, no Dependabot or Renovate, no CodeQL or
  SAST, no secret scanning, no SBOM. *Verified: one CI workflow, no dependabot config, no audit or
  SAST step anywhere in `.github/`.*
- **A.8.15/A.8.16 logging and monitoring** — the Worker emits structured `console.log` with counts
  and reasons. That is emission, not monitoring: no alerting, no retention, no review.
- **A.8.32 change management** — *verified: no `CODEOWNERS`, and the ten most recent commits are all
  unsigned (`%G?` = `N`).* Changes reach `main` without required review.
- **A.5.19–A.5.22 supplier security** — no vendor register, no DPA with any of the five vendors that
  hold data, no review of their reports.

---

## 4. SOC 2 Type II — not held, and the window is the part you cannot shortcut

**Applicability: by choice, and the case for it is currently weak.** A Thai entity can engage a CPA
firm under AT-C 205 exactly as a US one can. Whether it *should* is a procurement question, and the
stated customer will never ask.

**What it is:** an **attestation**, not a certification. No certificate, no accredited body, no
registry, no logo entitlement. A CPA firm produces a **report** in four parts — the auditor's
opinion, **management's assertion**, **management's written description of the system**, and the
tests performed. Parts two and three are written by *the company*, and **no such description exists
anywhere in this repository.**

**Type I is design at a point in time. Type II is operating effectiveness over a window** — commonly
3 to 12 months. That window is the thing no engineering work shortens.

### Zero implemented, and one gap explains why

**There is no population to observe.** Type II tests effectiveness by sampling what accumulated
during the period. `envelope_rows` holds no rows, there are no customers, and until recently nothing
ran on a clock. An auditor sampling this system would find nothing to sample.

The rest: **no written policies at all** (CC5.3 is unsatisfiable, and roughly a third of the Common
Criteria depend on a policy existing to be tested against); **no audit log** (CC6.1); **changes reach
production without review or approval** (CC8.1); **no monitoring, alerting or incident response**
(CC7.2–7.5); **no vulnerability management** (CC6.8, CC7.1); **no vendor management** while the
entire system is vendors (CC9.2); **no defined service commitments** — a Type II opinion is rendered
against the entity's own stated commitments, and there is no SLA, RPO or RTO to render one against.

### Needs a human, not code

A **licensed CPA firm** — no consultancy or compliance platform can issue the report. **Management's
description and assertion.** A **full approved policy set**. A **named security owner** with
independent oversight. **HR controls** — background checks where lawful in Thailand, confidentiality
agreements, recorded security-awareness training. An **independent penetration test within the
window**. **Executed DPAs with every sub-processor.** **Cyber liability and professional indemnity
insurance** — CC9.1 explicitly contemplates insurance, and this company custodies other people's
platform credentials.

---

## 5. The claim surface

What stops any of this being asserted before it is true.

| Control | Evidence |
|---|---|
| A machine-readable ban list, each entry carrying the decision that killed it | `packages/brand/src/claims.ts` → `FORBIDDEN_CLAIMS` |
| SOC 2 and ISO 27001 declared as claims withheld by a brand fact only a third party can set | `claims.ts` `soc2`/`iso27001`; `brand.ts` both `false` |
| Flipping a certification fact cannot silently publish copy — the ban and the claim are interlocked | `brand.test.ts` "does not fire on the claims that are allowed" goes red until the ban is deleted in the same change |
| The governing law and supervisory authority stated once, as facts about the entity | `brand.governingPrivacyLaw`, `brand.supervisoryAuthority`, rendered on `/privacy` |
| The ban applied to **every route**, not just the homepage | `apps/web/app/forbidden-claims.test.ts` — source scan, comments stripped, `\uXXXX` decoded |
| A withheld claim cannot be rewritten as hand-typed section copy | `apps/web/app/withheld-claims.test.tsx` — five-word runs |

**Still absent:** nothing checks the `/privacy` clauses against the PDPA's *required contents*. The
page names the law; no guard asserts that what it says satisfies it. That needs a lawyer, not a
regex.

---

## 6. If you are about to do compliance work

**Order it by what binds.** The PDPA binds today and nobody is asking for the other three. Retention
and deletion (s.37(3)), a rights path (s.30–36), and the transfer basis for OpenRouter (s.28) are
the three that are both legally live and genuinely code-shaped.

**The cheapest serious win is not a framework control.** It is a mailbox that receives mail, so the
rights channel already published on a public notice is not a dead end.

**Do not implement a control in order to claim it.** The claim is gated on a document, not on the
control. Build the control because the obligation is real; the claim follows a third party, or it
does not follow.
