# NN. <Title of this unit of work>

<!--
Copy this file to docs/marketplane/NN-<name>.md for every PR. The kickoff's working agreement:
"Each PR carries a short design note under docs/marketplane/ with the cost estimate, the
platform-terms check, and what was left out."

Delete the guidance comments as you fill it in. Do not delete a section: an empty section with
"N/A -- <reason>" is information; a missing section is a gap nobody can see.
-->

**PR:** #NNN &nbsp;·&nbsp; **Date:** YYYY-MM-DD &nbsp;·&nbsp; **Status:** proposed / merged

---

## 1. What this is, and the decision taken

<!--
One paragraph on what shipped. Then the decision and its reason in one sentence, in the form the
kickoff requires: a choice, not a constraint. If an alternative was considered and rejected, name
it -- the record should show a choice rather than a default nobody questioned.
-->

## 2. Cost estimate

**Per connected account per month:** `<figure>`

<!--
PER CONNECTED ACCOUNT PER MONTH. Specification 11.3 replaced per-row performance credits with
per-connected-account monthly metering, so the per-call and per-1M-call units in section 7's cost
table no longer describe a sellable unit for the largest revenue line. Performance reads still
return `meta.credits_used`, but report 0 and surface the connected-account meter instead.

Derive it, do not assert it. The terms that actually move:

| Term | Where it comes from |
|---|---|
| rows/night | entities x grains x sources for one connected account |
| restatement depth | the D+1, D+3, D+7, D+28 ladder -- every re-pull is a fresh read of the same rows |
| Workers invocations + CPU ms | one Workflow instance per (connection, source, ingest_date) |
| R2 | one object per (source, account, date, window, fetched_at) at $0.015/GB-month, plus CLASS A writes -- object COUNT is uncosted anywhere in the specification |
| KV | $5.00/million writes -- an envelope cache keyed per row is a cost line, not a cache |
| Supabase disk | $0.125/GB, the line section 7 names as most likely to break. Only safe if `raw` is an R2 KEY in Postgres, never a JSONB blob |
| Bought data | SERP at $0.002 synchronous / $0.0006 scheduled; AI answers $0.003 (batched Haiku) to $0.032 (Sonar Pro) -- a 3.2x blended-COGS swing that is a pricing decision, not an engineering one |

Three caveats that must be repeated, not assumed away:
  * Section 8 marks the performance COGS and the ~98% margin UNVERIFIED.
  * Section 7's table has no disk-growth term, by its own checker's admission.
  * Section 8's own open question is the sharpest: the ~98% margin collapses if platform limits
    force 3x-5x redundant polling per useful row -- which is exactly what the Workers scheduler
    decides. If this PR touches the scheduler, say what it does to that ratio.

"N/A -- no data-plane work" is a valid answer. Say why.
-->

## 3. Platform-terms check

<!--
The mandatory block. 18 binary gates, from the platform-terms recon in
docs/marketplane/00-recon-reports.md, recorded in 00-repo-map.md section 6. This PR passes only if
every applicable line is answered PASS or N/A with a one-line reason. The order is deliberate:
credential -> tenancy -> data movement -> PII -> access tier -> claims.

Answer every one. "N/A" is fine and will be the honest answer for most gates on most PRs; an
unanswered gate is not.
-->

### Credential

**1. BYOC.** Does every code path that touches Google, Meta, GA4, Search Console, TikTok or an
affiliate network read the credential from the per-workspace connection vault? FAIL if any platform
call uses a company-held or env-var platform token, or a developer token / GCP project the tenant
did not obtain (Google policy: third parties must not "avoid applying for their own Google Ads
developer access and Google Cloud Platform project"). Grep the diff for hardcoded tokens, shared
client secrets, and any `process.env.*_ACCESS_TOKEN` used on a tenant request path.
> `PASS` / `N/A` --

**2. Vendor-key exception.** If the diff DOES use a company-held key, is the data source
public-data only (DataForSEO SERP, AI-answer providers)? FAIL for any platform data. This is the
only permitted single-key surface (11.2).
> `PASS` / `N/A` --

**3. No token pass-through.** Does the MCP server avoid forwarding a client token upstream (spec:
"MUST NOT pass through the token it received from the MCP client")? Does the OAuth surface carry
RFC 9728 metadata, RFC 8707 resource indicators and PKCE?
> `PASS` / `N/A` --

**4. Credential hygiene.** Are credentials absent from application tables, logs, error messages,
request logs and fixtures? Is there a token-death path that flips connection health and prompts
re-authorisation?
> `PASS` / `N/A` --

### Tenancy

**5. RLS.** Does every new table carry `org_id`, and `workspace_id` where workspace-scoped, with an
RLS policy keyed on both? Is there a test proving a member of org A cannot read org B, and that
workspace A cannot read workspace B?
> `PASS` / `N/A` --

**6. No service-role bypass.** Does the request path (Workers edge, server actions, MCP handler,
scheduled job) run under the caller's identity rather than a service key that bypasses RLS? Any
service-role use must be named and justified here.
> `PASS` / `N/A` --

**7. No cross-workspace read.** Does any query, view, materialisation, cache key or aggregate span
more than one `workspace_id`? FAIL on any `GROUP BY` that omits `workspace_id`, any "across all
clients" roll-up, any shared cache key without the tenant in it. Section 15: "No cross-workspace
aggregation ever."
> `PASS` / `N/A` --

**8. No cross-customer aggregation or benchmarking.** Does the diff introduce percentiles, medians,
industry averages, peer comparison, leaderboards, or training / fine-tuning inputs built from more
than one tenant's platform data? FAIL -- Meta 3.a.iv and Google's redistribution clause make this a
termination risk on the two largest sources.
> `PASS` / `N/A` --

**9. API key scope.** Does every API key resolve to exactly one workspace, with spend budget and
tool allow-list enforced before the first upstream call?
> `PASS` / `N/A` --

### Data movement

**10. No resale or redistribution.** Is any billing unit denominated in platform rows or records,
and does any response, export, webhook, support tool or shared link move platform data outside the
originating workspace? If data leaves, is there a stored written-client-consent artefact (Google
requires written client consent before "selling, redistributing, sub-licensing, or otherwise
disclosing or transferring data specific to their Google Ads accounts")?
> `PASS` / `N/A` --

**11. Meta client list.** If the diff touches Meta onboarding, workspace lifecycle or deletion,
does it create / update / retire the client record (legal entity name + contact information)
required by Platform Terms 5.b.ii.2, and is that record exportable on demand?
> `PASS` / `N/A` --

**12. Dependency licences.** Does the diff add a dependency under ELv2 or AGPL used in the served
path (Airbyte connectors, Windmill)? Apache-2.0 / MIT only for anything in the managed service; a
new licence needs a named reason here.
> `PASS` / `N/A` --

### PII and consent

<!-- Applies even though writes are deferred past MVP: fixtures and schemas count. -->

**13. Hash at the edge.** Can any raw email, phone, name or address reach persistence, logs, R2
payload storage, or an LLM prompt? The API boundary accepts SHA-256 only; normalisation (trim,
lowercase, E.164, strip Gmail dots and plus-suffixes) happens in the SDK or at the edge; only
hashes plus counters persist; no payloads logged.
> `PASS` / `N/A` --

**14. Forbidden payloads rejected before egress.** Under-13 signals, SSNs, card numbers, health and
financial special-category fields.
> `PASS` / `N/A` --

**15. Per-destination consent.** Does every record carry a consent object serialising to Google
`ad_user_data` / `ad_personalization` (EEA default-deny; not required on remove) and Meta
`data_processing_options` with country and state codes? Do not normalise `dataProcessingOptions`
(Pixel) and `data_processing_options` (CAPI) into one key. Meta Custom Audience Terms acceptance
must be detected and deep-linked, never asserted on the customer's behalf.
> `PASS` / `N/A` --

### Access tier and quota

**16. Tier reality.** Does the change fit the tier actually held? Google Ads Explorer 2,880 ops/day
per developer token (Basic 15,000; Standard unlimited and possibly unreachable for a headless
product); Meta Development score 60, Ads Insights `600 + 400*active_ads - 0.001*user_errors` per ad
account per hour, 10 async breakdown jobs per ad account per day; GA4 40,000 tokens per property
per hour, shared with the customer's other tools; Awin 20 req/min per user; Impact ReportExport
100/day. Does the diff count rejected Google requests against quota and back off rather than
retry-storm? Is per-source budget consumption exposed in the envelope?
> `PASS` / `N/A` --

**17. No new long-lead dependency.** Does the change depend on an approval not held (Meta Full
Access, Google Basic or Standard, Google OAuth verification, TikTok production audit, Klaviyo 5
installs, Awin Accelerate or Advanced, Impact written approval)? If yes, name the gate, its
observed timeline, and the degraded path that ships without it.
> `PASS` / `N/A` --

### Claims

**18. Claim provenance.** Does every user-visible claim come from the brand file's allowed-claims
list, and is it true today? Specifically banned or gated: "joins in one call" (11.9 forbids); any
live presentation of `/v1/audience` or `/v1/market` (11.4, 11.5); "DPA on request" (requires a
click-through Article 28 DPA plus a public sub-processor page); "3 to 5 days" for Google OAuth
verification (unsourced -- never quote it); SOC 2, SAML SSO, EU hosting and "never used to train
models" unless implemented; and any repetition of the CNIL press attribution (CNIL did not name the
company).
> `PASS` / `N/A` --

**Result:** `N PASS, N N/A, 0 FAIL`

<!--
Three standing architectural defaults are stated once in the phase 1 design note and assumed
everywhere after. Do not restate them; do flag any change that breaks one:
  (a) the public no-signup demo endpoint serves public-data modules or synthetic fixtures only;
  (b) the hosted AI-answer collector uses official provider APIs only, with UI-parity collection as
      an opt-in customer-session mode;
  (c) the Numbers screen is a compliance artefact for Google's Required Minimum Functionality, not
      a feature, and nothing may be designed that needs more than 15,000 Google Ads operations per
      day until Google answers in writing.
-->

## 4. What was left out

<!--
Deliberate omissions, each with a reason. Anything you wanted to add and did not is an issue, not a
bigger PR: "Never widen scope in a PR; open an issue instead."
-->

## 5. Open or unverified spec items this builds on

<!--
The kickoff: do not build on anything the specification marks unverified or open without flagging
it. For each, say what happens to this change if the answer comes back the other way. The standing
list is 00-repo-map.md section 9; the ones most likely to apply:

  * Meta's 28-day clock -- delivery or first report? Unresolved in Meta's own docs. The
    `first_seen_at` anchor for `restates_until` builds directly on it.
  * Google Ads publishes no freshness or finalisation statement at all.
  * GA4's 12-day restatement window carries Google's own disclaimer: "not a guarantee, nor an SLA
    or an SLO." It cannot be sold as a guarantee.
  * Google OAuth sensitive-scope verification is unbounded. Never quote 3-5 days.
  * Google Ads Standard Access may have no path for a headless product.
  * Whether Meta treats a pay-per-call API as a Tech Provider needing per-client authorisation.
  * Per-tenant Google developer tokens in a multi-tenant service are undocumented.
  * `webmasters.readonly`'s sensitive-scope status is unconfirmed.
  * No reviewed platform policy addresses MCP as a delivery surface at all.
  * Do not hard-code Meta's rate-limit constants: the specification flags its own 5,000+40x and
    190,000+40x figures as absent from the cited source.

"None" is a valid answer only when it is true.
-->

## 6. Verification

<!--
What was actually run, with the real output -- not what should pass. The pre-push gate:
  pnpm exec biome lint .      pnpm exec biome format .
  pnpm -r typecheck           pnpm -r test            pnpm -r build
  pnpm check:brand            pnpm check:tokens
-->
