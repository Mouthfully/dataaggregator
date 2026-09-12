# The MVP plan: from a working pipeline to a number on a screen

**Status at the time of writing:** every component is built and tested. **Nothing is connected end
to end.** `envelope_rows` holds zero rows on the live project and will keep holding zero, because
nothing in the repository writes one.

This document is the gap analysis and the ordered build order. It was produced by six agents reading
the tree in parallel, and every load-bearing claim below was then re-verified directly — several of
their findings were wrong, and those corrections are recorded in §6 rather than quietly dropped.

---

## 1. Where the MVP actually stands

The chain from *"a shop owner pastes a WooCommerce key"* to *"a number appears on a screen"* has six
joints. **One and a half are connected.**

| # | Step | State |
|---|---|---|
| 1 | A workspace exists for them | **schema yes, caller no** — `create_organisation` exists; nothing calls it |
| 2 | A connection is created | **no** — `connectWithKey` has no HTTP route and no UI |
| 3 | Something triggers a pull | **no** — the Worker serves `/health` and `/v1/performance`, nothing else |
| 4 | The platform is fetched | **client yes, driver no** — four of five sources have no `backfill.ts` |
| 5 | Rows are persisted | **no** — nothing calls `app.upsert_envelope_row`, and it is **unreachable** (§2) |
| 6 | The numbers are read back and shown | **API yes, screen no** — `/v1/performance` works but 503s without bindings |

**The connectors are not the bottleneck.** All five have a tested client and a tested normaliser,
every metric they emit is already in `METRICS`, and every export is now reachable. What is missing is
everything *between* a normalised row and a screen.

Confirmed against the live project: `envelope_rows` 0, `connections` 0, `workspaces` 0,
`api_keys` 0. Nothing is observable because nothing has ever been written.

> **Naming.** Every note before 53 calls that project `numbadee`. It is the same project under a
> different display name — the ref never changed, so nothing that was applied to it was reapplied.
> See `53-the-rename.md`. The product is `uniplain` from 2026-09-12.

---

## 2. The blocker upstream of everything: the write is unreachable

`app.upsert_envelope_row` cannot be called by anything that exists.

- It lives in schema **`app`**, and `supabase/config.toml` exposes only `public` to PostgREST —
  deliberately: *"the tenancy helpers in `app` are a privilege boundary, not an API."*
- The Worker's **only** database transport is PostgREST. No Hyperdrive binding, no Postgres driver
  anywhere in the monorepo, no service-role key.
- **`app_ingest` is `NOLOGIN`**, and nothing grants it to `authenticator`. Verified on the live
  project: the `authenticator` role exists, and it is **not** a member of `app_ingest`.
- `MintedRole` in `packages/store/src/jwt.ts` is a two-member union — `"anon" | "authenticated"` —
  whose comment states that *"anything wider is a different design."* The Worker cannot currently
  spell the role it would need.

### The decision

**A forwarding function in `public`.** `public.ingest_envelope_rows(p_rows jsonb)`, `SECURITY
INVOKER`, revoked from `public, anon, authenticated` immediately after creation, granted only to
`app_ingest`; plus `grant app_ingest to authenticator`; plus `"app_ingest"` as a third `MintedRole`.

`SECURITY INVOKER` is what keeps the tenant invariant three deep: a tenant cannot execute the
wrapper (explicit revoke), cannot execute the `app` function (explicit revoke), and holds no write
grant and no write policy on the table. The inner function is already `SECURITY DEFINER`, so the
wrapper does not need to be.

**Rejected — exposing schema `app` to PostgREST.** `20260908000100_extensions.sql` already grants
`USAGE` on schema `app` to `authenticated`, so listing it in `config.toml` would make every function
in it addressable by any tenant, with per-function ACLs as the only barrier — and PostgreSQL grants
`EXECUTE` on a new function to `PUBLIC` by default, a hazard `20260912000200_position.sql` documents
from an incident in this repository.

**Rejected for now — Hyperdrive.** It stays the deferred answer for the webhook drain, which has the
identical problem and answers it by refusing.

**The honest cost, to be stated in the design note:** this makes `SUPABASE_JWT_SECRET` a *write*
credential and not only a read one. That is the thing Hyperdrive would later fix.

### Batch, not per row

`public.ingest_envelope_rows(p_rows jsonb)` takes an array. WooCommerce emits **one row per order**,
so a per-row RPC is one HTTPS round trip per order inside a Worker's CPU allotment. The three enum
parameters are declared `text` inside the jsonb and cast in the body (`p_source::app.envelope_source`)
so PostgREST never resolves a type from an unexposed schema.

Connectors written against a per-row port are the expensive thing to undo, not the function.
`docs/marketplane/15-envelope-store.md` flagged this as open *"pending a Worker to measure against"* —
this is that Worker.

---

## 3. Decisions already resolved, with evidence

| Decision | Answer | How it was established |
|---|---|---|
| **Does the project verify JWTs with a shared HS256 secret, or asymmetric keys?** | **Shared HS256.** The plan is viable. | The live project's legacy anon key decodes to `{"alg":"HS256","typ":"JWT"}`, `type: legacy`, `disabled: false`. A modern `sb_publishable_…` key exists alongside it, but legacy is **not** disabled — so tokens the Worker mints with the shared secret are accepted. |
| **Does the migration owner carry `BYPASSRLS`?** | **Yes.** | `select rolbypassrls from pg_roles where rolname = current_user` returns true for `postgres` on the live project. The `SECURITY DEFINER` helpers rely on running outside RLS; had this been false, every authenticated read would silently return empty. `run-local.sh` connects as a superuser, so the local suite structurally cannot see this. |
| **Is `authenticator` already a member of `app_ingest`?** | **No.** The grant is genuinely required. | Verified via `pg_auth_members` on the live project. Without it, PostgREST's `SET LOCAL ROLE` fails in a way that reads as a bad token rather than a missing membership. |

**This was the highest-risk unknown in the plan and it is now closed.** Had the project been on
asymmetric keys, every token the Worker mints would be rejected and both the read path and the ingest
path would be dead on arrival.

---

## 4. Decisions still open

1. **Where does a WooCommerce store's timezone come from?** `normalizeWooOrders` **requires** it,
   has no default, and throws without it. `probeStore` returns only `{storeUrl, totalOrders}`, and no
   `connections` column holds one. **Recommendation:** add a nullable `timezone text` column to
   `public.connections`, populated by the seed script. Guessing mislabels every date on every row —
   exactly the class of quiet wrong number this product is sold against.
2. **Cron or manual trigger?** **Recommendation: manual** — `POST /v1/ingest/run` behind a dedicated
   Worker secret (never the API key, which stays read-only). A cron cannot be demonstrated on stage;
   you would be waiting on a minute boundary and hoping. Add the cron afterwards.
3. **Which attribution windows does Meta request?** Each requested window emits one additional
   envelope row, so the row-count cost should be visible in one place. That is a product decision,
   not a code one.

---

## 5. The build order

Each step is one PR, independently reviewable, depending only on earlier ones.

| # | Step | Size | Depends on |
|---|---|---|---|
| 1 | **`public.ingest_envelope_rows` + role plumbing.** The wrapper, `grant app_ingest to authenticator` behind an `if exists` guard, `authenticator` added to the local shim, `07_anon_grants.sql`'s expected array extended, `"app_ingest"` added to `MintedRole`. | medium | §2, §3 |
| 2 | **The ingest write adapter** — `packages/store/src/ingest.ts`. Nested→flat mapper sourced from `METRIC_COLUMNS`, **never hand-listed**; validates each row against `envelopeRowSchema` *before* sending; mints an `app_ingest` token with **no** `workspace_id` claim. | medium | 1 |
| 3 | **WooCommerce `backfill.ts`** — the third file of the connector unit, modelled on `ga4/backfill.ts`. Drives `fetchOrdersWindow`. **Not** through `planBackfill`: `RESTATEMENT_CLOCKS.woocommerce.windowDays` is null, so the tiered planner emits nothing useful. Adds the `timezone` column. | medium | Decision 1 |
| 4 | **Connection read adapter** — one `GET` on `/rest/v1/connections` as an `authenticated` token. Needs **no** new database object: RLS and the grant already exist. Adds `CREDENTIAL_KEK` as a Worker binding. | medium | none |
| 5 | **`scripts/seal-connection.mjs`** — probe, seal with `@repo/vault`, print the `INSERT`. A script and not a UI, deliberately: `connections_insert` requires a non-null `current_user_id`, and there is no login anywhere. | small | 3 |
| 6 | **The ingest runtime** — `apps/api-edge/src/ingest.ts` and `POST /v1/ingest/run`. Reads the connection, opens the credential with the KEK, runs the backfill, batches rows through the adapter. Returns counts and reasons only — never a payload, never a credential. | large | 2, 3, 4 |
| 7 | **`scripts/mint-api-key.mjs`** — key matching `^mp_(live\|test)_[a-z0-9]{8}$`, SHA-256 hashed. Nothing mints a key today. | small | none |
| 8 | **Deploy** — apply migrations, set bindings, seed a workspace, seal a real credential, run the backfill, read it back with `curl`. | medium | 1, 5, 6, 7 |
| 9 | **A screen** — `apps/web/app/dashboard/page.tsx`. **Two traps:** `@repo/contract` must be added to `transpilePackages` or only `next build` fails, which is the last step before the demo; and `check-copy.mjs` rejects any JSX text node of five or more words ending in `.`/`!`/`?`, so every sentence comes through `claim()`. | medium | 8 |
| 10 | **Insurance: the offline envelope page.** Imports the five normalisers and their committed fixtures — **no network, no database, no credentials** — renders real `EnvelopeRow[]`, then nulls one row's `attribution_window` and renders the schema's refusal. Depends on nothing. **Build in parallel from day one.** | medium | none |
| 11 | **Stretch: Meta Ads via the bearer lane.** The only other source reachable without a consent screen. Two-call unit: `getAdAccount` is the sole source of `timezone_name`. | large | 2, 6 |

### The shortest credible demo

**Steps 1–8** put a real shop's real orders into `envelope_rows` and read them back over HTTP —
demonstrable as a `curl` on stage. **Step 9** makes it look like a product rather than a pipeline;
it is one PR and the one not to skip.

The critical path is **1 → 2 → 3 → 6**. Steps 4, 5 and 7 are small and parallelise; step 3 depends on
nothing in 1–2.

**Build step 10 in parallel from the start.** It depends on nothing, needs no credentials and no
network, and shows the product's one genuinely differentiated behaviour — the envelope *refusing* an
unlabelled conversion count — executing live rather than being asserted. If the pipeline slips it is
a credible presentation on its own; if it lands, the two together are a better story than either.

### Keep Google off the critical path

GA4, Google Ads and Search Console all need OAuth, and `supabase/config.toml` records Google's
verification as **documented at 3–5 days and observed at over ten weeks**. WooCommerce
(`key_secret`) and Meta System User tokens (`bearer`) need **no redirect URI, no consent screen and
no domain at all**.

---

## 6. Corrections to the analysis

Recorded because a plan that hides its own errors is worth less than one that shows them.

- **"Three connectors export nothing."** True when the investigation started, fixed by PR #31
  mid-flight, so the synthesiser correctly reported it as already resolved. Both were right about
  different moments.
- **But the fix was incomplete, and the guard did not notice.** PR #31 enumerated exports with a
  pattern matching `export async function` and **missed `export async function*`** — so every
  single-page fetcher was exported and all five **page walkers** were not: `searchPages`,
  `getInsightsPages`, `querySearchAnalyticsPages`, `fetchOrdersPages`, `fetchOrdersWindow`. Those are
  the functions a scheduled pull actually calls; `fetchOrdersWindow` carries a comment in its own
  module saying *"THIS IS THE ONE A SCHEDULED PULL SHOULD CALL"*. The capability guard passed
  throughout, because it asked only whether the barrel **mentioned** each module. It now asks whether
  the barrel re-exports **every name** each module exports.
- **`packages/extract` is not the backfill planner for WooCommerce.** `planBackfill` emits a
  calendar-day ladder; Woo windows are two RFC3339 instants and its restatement clock is null.
  Routing step 3 through it would produce nothing useful.
- **`/v1/performance` is not broken — it is unconfigured.** It returns 503 naming the missing binding
  on every request until `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_JWT_SECRET` are set.
- **The API key prefix is `mp_`** (Marketplane) while `brand.ts` and `config.toml` now both say
  `uniplain`. The rename did not close this and deliberately did not try: the `CHECK` constraint is
  what binds, so changing the prefix is a migration over live key rows, not a config edit. It is
  also the one identity string a customer has already pasted into their own code.
