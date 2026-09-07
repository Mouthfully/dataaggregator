# 01. Brand identity facts, and two constraints they create

Supplied by the founder, 2026-09-07. These are the values `packages/brand/src/brand.ts` ships with. Two of
them change what the product may claim, and both are recorded here rather than resolved silently.

## The values

| Field | Value | Status |
|---|---|---|
| Legal entity | Now On Company Limited | confirmed |
| Registered address | 112/246 Srinakarin, 10540 Samut Prakan, Thailand | confirmed |
| Company registration | 0115564023284 | confirmed |
| Support email | support@help.zwitchy.io | confirmed |
| Responsible for content | Now On Company Limited | confirmed |
| VAT number | — | **not supplied.** Thailand's 13-digit juristic-person number doubles as the Tax ID and, where the company is VAT-registered, the VAT number. Recorded as `companyRegistration`; `vatNumber` stays `null` until confirmed separately, because an invoice that prints a wrong VAT number is worse than one that prints none. |
| Product name | not settled | Routed through the brand file from the first line; `@repo/*` package scope so no npm name is burned in. |
| Domain | **unresolved — see below** | blocking |
| Data region | **unresolved — see below** | blocking |

## Constraint 1: the entity is Thai, and the artboard sells EU data protection

The artboard's security strip claims *"EU hosting, GDPR and UK GDPR"*, *"Frankfurt by default"* and
*"DPA on request"*. The phase 0 copy audit had already flagged "Frankfurt", "UK GDPR" and "DPA on request"
as unsupported anywhere in the specification. The entity's jurisdiction is a second, independent reason to
gate them, and it is the stronger one.

Three distinct things get conflated by the phrase "EU hosting", and only the first is free:

1. **Data residency is achievable and cheap.** Supabase, Cloudflare and Vercel all offer EU regions. A Thai
   company can host EU-resident data. `"EU data region"` can be a true claim on the day the projects are
   provisioned in an EU region — it is a configuration, not a legal status.
2. **An EU representative is probably required, and is not automatic.** GDPR Article 27 requires a
   controller or processor established outside the EU that offers services to data subjects in the EU to
   designate a representative in the Union, in writing. The Article 27(2) exemption covers occasional,
   low-risk processing — a marketing data plane holding advertising and analytics data at scale is unlikely
   to qualify. This is a named service with an ongoing cost, not a checkbox.
3. **Transfers to Thailand need a transfer mechanism.** Thailand has no EU adequacy decision. Any personal
   data flowing from the EU to the entity — including support access, administrative access to a production
   database, or a founder reading a customer's data from Thailand — is a restricted transfer requiring
   Standard Contractual Clauses plus a transfer impact assessment. Access from Thailand to EU-hosted data
   counts; residency alone does not solve it.

None of this blocks the build, and none of it is a reason to change the plan. It changes what the
**allowed-claims list** may contain on day one:

| Claim | Ships when |
|---|---|
| "EU data region" | The Supabase, Cloudflare and Vercel projects are actually provisioned in EU regions. Configuration, verifiable, cheap. |
| "Your platform data is never pooled, benchmarked, sold or licensed" | Now. It is an architectural property, already a §11/§3.5 constraint. |
| "Never used to train models" | Now. |
| "GDPR" / "UK GDPR" compliance | An Article 27 representative is appointed and SCCs are in place. |
| "DPA on request" | A DPA with Article 28 terms and a transfer mechanism actually exists to send. |
| "Frankfurt by default" | Never as written — it names a city the specification never commits to. Say the region that is actually provisioned. |

The brand file's claims list is machine-checked, so a claim whose supporting field is unset cannot render.
That is the mechanism that keeps this honest rather than a promise to remember.

## Constraint 2: which domain is the product on

The support address is `support@help.zwitchy.io`, so the entity's live domain is **zwitchy.io**. The
artboard hard-codes **`api.marketplane.dev`**, and the product name is not settled.

This needs an answer before `packages/brand` lands, and it is expensive to change late — not because of the
code, which reads one variable, but because of what depends on it:

- **OAuth redirect URIs** are registered with Google and Meta. Changing the domain after Google OAuth
  sensitive-scope verification has started restarts it, and phase 0 recorded that verification as
  *unbounded* — documented at 3–5 days, observed at over ten weeks. That is the single worst thing to have
  to redo.
- **The Meta app** and its Business Verification attach to a domain and an entity.
- **The MCP registry namespace** is claimed by DNS or HTTP challenge against the domain.
- Every published API base URL, SDK README and docs link.

Until it is answered, nothing hard-codes either domain and the brand file carries the field unset.

## What ships regardless

The scaffold, the tokens stylesheet, the Supabase schema, auth, RLS and the connector work all proceed. None
of them depends on the domain, the data region or the VAT number. Only the brand file and the marketing
site's claims do.
