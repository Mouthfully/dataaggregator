# 16. `GET /v1/performance`, and one deliberate addition to the envelope

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

The first real endpoint. `apps/api-edge` was a health check proving the workerd target builds; it now
serves the surface over the store `15-envelope-store.md` created, and the vertical is complete in
outline: **GA4 → normaliser → store → API**.

**What this unit owns is the boundary.** A request arrives with a bearer credential and query
parameters; a response leaves as the §2 envelope. Everything in between is validation — and
validation *is* the product. The store put the refusal in a `CHECK` constraint, `@repo/contract` put
it in zod, and this is the third place it has to hold **because it is the only one a customer ever
sees**.

### The store is a port, not an implementation

`PerformanceStore` is an interface the handler receives. Whether rows arrive over **PostgREST with a
minted workspace JWT** or over a **direct connection through Hyperdrive** is a real decision with a
real trade-off — PostgREST inherits RLS for free but cannot express the cursor pagination cheaply;
Hyperdrive is a direct `app`-role connection with the pooling caveat and needs its own identity —
and it **cannot be made honestly against a Supabase project that does not exist**.

So the port is named now and the route answers **503 with the reason**. Not 500 from a null store,
and specifically not an empty `data: []`, which a caller would read as *"no data"* rather than *"not
wired"*. The handler's behaviour is fully tested against injected ports; only the binding is
missing.

### Three refusals that are not defensiveness

**1. Every row is re-validated on the way out.** The store writes through a checked function and the
table has its own constraints, so a row reaching the handler *should* already be sound. "Should" is
the problem: a migration applied out of order, a hand-fixed row, a future bulk import. §2 says *the
API* refuses to emit an unlabelled conversion count — not that the database refuses to hold one.

**2. An unparseable row fails the request rather than being skipped.** Dropping it returns a total
quietly too low, **with `ok: true`** — worse than an error, because nothing anywhere says the number
is incomplete.

**3. The date range is bounded and must be asked for.** No default window. A caller who omits it gets
an error naming the parameter, not an arbitrary 30 days they will later mistake for a choice they
made.

### Two orderings that are security, not style

**Authenticate before parsing.** A caller with no credential learns they need one and nothing else —
not which sources exist, not which parameters are accepted, not whether their guessed range was
well-formed. Parsing first turns an unauthenticated endpoint into a free description of the API. A
test asserts the 401 body does not contain the word `source` even for a request that omits it.

**`workspace_id` is not a parameter.** It comes from the credential. Accepting it from the caller
would make cross-tenant access *a matter of typing a different id*, with row-level security as the
only thing in the way — one misconfiguration from nothing. A test supplies a foreign `workspace_id`
in the query string and asserts the store is still asked for the authenticated one.

### One deliberate addition to the envelope: `meta.next_cursor`

Made under §13.3 rule 2 rather than smuggled in. The specification prints **no pagination at all**,
and neither §2 nor §7 defines a multi-row response in the first place. But a read endpoint has to
bound its result set — unbounded is a memory limit waiting to be hit on the largest customer — and
**a bounded result with no cursor is an endpoint that cannot return page two**.

Alternatives considered: a `Link` header, which JSON clients ignore; an unbounded response, which is
the failure it exists to prevent.

**Absent rather than null when there is no further page.** "No more" and "did not say" are different,
and only one of them should make a client fetch again. A mutation emitting `null` is caught.

## 2. Cost estimate

**Per connected account per month: `$0.00003`, and this is the cheapest line in the model.**

| Term | Figure |
|---|---|
| Requests | A dashboard load is ~5 reads; a daily-checking customer is ~150/month |
| Workers | $0.30/million requests → **$0.000045/account/month** |
| CPU | Parse + up to 1,000 zod validations ≈ 2–4 ms; well inside the 10 ms free allotment |
| Egress | Zero — Cloudflare does not charge for it |
| Database | One indexed range scan on `envelope_rows_read_idx`, bounded by `MAX_LIMIT` |

The two bounds are what keep it there. **`MAX_RANGE_DAYS = 400`** stops one request scanning a
customer's whole history, and **`MAX_LIMIT = 1000`** caps both the scan and the validation work. An
unbounded endpoint is not merely more expensive — it is a 128 MB isolate failing on the largest
customer first, which is the customer least able to tolerate it.

**On §8's open question** (3×–5× redundant polling): this is the read side and does not poll at all.
It reduces polling pressure indirectly — a materialised store answered from Postgres is exactly why
§7 concluded "live passthrough is off the table" given GA4's token quotas.

## 3. Platform-terms check

### Credential
**1. BYOC.** `PASS` — no platform credential anywhere on this path. The bearer token is *our* API
key, resolved to a workspace; the customer's platform grants are never touched by a read.
**2. Vendor-key exception.** `N/A`.
**3. No token pass-through.** `PASS` in the direction that matters here: the `Authenticator` port
returns **only a workspace id**, never the credential, so nothing downstream can forward it. The
RFC 9728 / RFC 8707 obligations belong to the MCP surface, which is not this.
**4. Credential hygiene.** `PASS` — the credential is read from a header and passed to the
authenticator; it is never logged, never echoed, and appears in no error body. A rejected credential
yields `invalid_credential` with no detail about why.

### Tenancy
**5. RLS.** `PASS` (inherited) — the store port takes `workspaceId` and the binding will run under a
workspace-scoped identity. No new table.
**6. No service-role bypass.** `PASS` — and named as a constraint on the deferred binding: whichever
transport is chosen must carry the caller's workspace identity, not a service key.
**7. No cross-workspace read.** `PASS`, and this is the gate the unit is built around. The workspace
comes from the credential, is passed explicitly to the port, and a caller-supplied `workspace_id` is
ignored — tested. The response carries one `source` and one workspace by construction; there is no
aggregate here at all.
**8. No cross-customer aggregation.** `PASS` — the endpoint returns rows, not roll-ups. No
percentile, median, benchmark or peer comparison exists to leak across tenants.
**9. API key scope.** `PASS` — the `Authenticator` resolves a key to **exactly one** workspace, and
the type makes any other outcome unrepresentable: it returns `{workspaceId}` or an error, never a
list. **Spend budget and tool allow-list are NOT enforced here** — see §4.

### Data movement
**10. No resale or redistribution.** `PASS` — a workspace's own data returned to that workspace.
`credits_used` is 0 and the billing unit is per connected account (§11.3), so nothing is denominated
in platform rows.
**11. Meta client list.** `N/A`. **12. Dependency licences.** `PASS` — one added workspace
dependency, `@repo/contract`. No third-party package.

### PII and consent
**13. Hash at the edge.** `PASS` — read path, nothing persisted, nothing logged. The endpoint returns
what the store holds, and the store has no free-text payload column (`15-envelope-store.md`).
**14. Forbidden payloads.** `N/A`. **15. Per-destination consent.** `N/A` — writes deferred.

### Access tier and quota
**16. Tier reality.** `PASS` — no platform call, so no platform quota. **Per-source budget
consumption is not in the envelope yet**, which §4.4 and the recon both ask for; the GA4 client
already returns the reading (`13-ga4-client.md`) and it needs a `meta` field plus a place to persist
it. Named in §4, not silently skipped.
**17. No new long-lead dependency.** `PASS`.

### Claims
**18. Claim provenance.** `PASS` — no user-visible marketing string. The 503 body states plainly that
the store is not configured, which is the honest version of an endpoint that does not work yet.

**Result:** `13 PASS, 5 N/A, 0 FAIL`

## 4. What was left out

- **THE STORE BINDING.** The decision, its trade-off and the 503 are above. This is the single
  largest thing missing and the route says so to anyone who calls it.
- **The real `Authenticator`.** `verify_api_key` exists in
  `20260908000800_api_key_verification.sql`; wiring it needs the same connection the store needs.
- **Spend budget and tool allow-list.** §15 scopes an API key to both, and gate 9 is only half
  satisfied without them. They belong at the authenticator, before the first upstream call — which
  is where the port already sits.
- **Per-source budget in `meta`.** Flagged in `13-ga4-client.md` and still true. It is an envelope
  change *and* a persistence change (quota is per request, the envelope is per read), so it is a unit
  of its own rather than a field added in passing.
- **Rate limiting.** Nothing stops a caller issuing the maximum query in a loop. Cloudflare's rate
  limiting binding, keyed on the API key, is the obvious answer and needs the key resolved first.
- **The other 22 endpoints.** `/v1/visibility`, `/v1/diagnose`, `/v1/watch`, `/v1/reconcile` and the
  rest. This one carries the shape they will share.
- **`as_of` semantics in the store.** The parameter is validated and passed through; what a
  bitemporal read *does* is a store-side query decision, and there is no store.

## 5. Open or unverified spec items this builds on

1. **`MAX_RANGE_DAYS = 400` and `MAX_LIMIT = 1000` are judgements, not sourced numbers.** 400 days
   covers a year plus a comparison period, which is what §4.1's questions need; 1,000 rows is a
   payload of roughly 400 KB, comfortably inside a Worker isolate. Neither is measured. **Revisit
   both against a real customer's largest account**, where the failure will show up first.
2. **`credits_used: 0` follows §11.3 over §8**, which still prints a per-call credit row for
   `/v1/performance`. §11.3 is later and explicitly replaces per-row metering with
   per-connected-account monthly metering, so §8's row is treated as dead. If that reading is wrong,
   this is one constant.
3. **The bitemporal `as_of` read is accepted at the boundary but unimplemented behind it**, so the
   parameter currently promises something no store honours. It is validated rather than ignored so
   that a caller using it gets correct behaviour the moment the store lands — but until then, **a
   request with `as_of` returns the same rows as one without**, and that must not be sold.

## 6. Verification

| | |
|---|---|
| `apps/api-edge` tests, in **real workerd** | **33/33** (21 new) |
| Repo | **260 unit tests**, 108 database assertions, three guards, lint, format, typecheck, build — green |

The response assertions parse the body with **`envelopeSchema` itself**, not a hand-written shape
check — so "the response is the envelope" is asserted against the contract rather than against my
memory of it.

**Mutation-checked — eleven mutations, eleven caught:**

| Mutation | Result |
|---|---|
| Take `workspace_id` from the query string | caught |
| Parse before authenticating (leaks the API shape) | caught |
| Skip an unemittable row instead of failing the request | caught |
| Trust the store and skip row validation entirely | caught |
| Default the date range to 30 days | caught |
| Drop the range bound | caught |
| Drop the limit bound | caught |
| Accept any source string | caught |
| Emit `next_cursor` as null instead of omitting it | caught |
| Report a nonzero credit for a performance read | caught |
| Collapse missing and invalid credentials into one error | caught |

Nothing survived this round, which is the first time in six units. The two that would have mattered
most — taking `workspace_id` from the caller, and skipping a row rather than failing — are the two
this unit exists to prevent.
