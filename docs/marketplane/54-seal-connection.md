# 54. `seal-connection` — the script that writes the row nothing has ever written

## 1. What this is, and the decision taken

**Step 5 of `MVP-PLAN.md` §5.** `POST /v1/ingest/run` reads a connection; nothing in this repository
has ever written one, and `public.connections` holds zero rows in the live project. This is the
script that puts one there.

**A script and not a UI, deliberately.** The `connections_insert` policy requires a non-null
`app.current_user_id()` and there is no login anywhere. The script **prints an `INSERT`**; an
operator runs it in the Supabase SQL editor, which connects as a role RLS does not apply to.

### It owns no cryptography, and that constraint chose the language

`seal` comes from `@repo/vault`, the store URL is normalised by `normaliseStoreUrl` and the header
built by `basicAuthHeader` — the same functions the scheduled read uses. A second implementation of
any of those agrees with the first right up until it does not, and the symptom is a credential that
seals successfully and cannot be opened, discovered hours later by a backfill.

That ruled out `.mjs`, which is what every other file in `scripts/` is. Node cannot load these
packages: they import with TypeScript's `.js`-for-`.ts` convention, which only a bundler resolves,
and their error classes use parameter properties, which strip-only mode rejects. Both were tried.
So the repository gains **one** dev dependency, `tsx`, and `scripts/*.ts` becomes a real place to put
an operator script — which step 7 (`mint-api-key`) will need for the same reason.

**`tsconfig.json` at the workspace root is part of this change and not incidental.** `pnpm -r` skips
the root, so a `.ts` file in `scripts/` would have been *unchecked TypeScript* — worse than the
`.mjs` it replaced. The root `typecheck` script now runs `tsc -p tsconfig.json` before recursing, and
CI runs `pnpm typecheck` rather than `pnpm -r typecheck`. It earned its place immediately: it caught
two `noUncheckedIndexedAccess` violations in `parseArgs` on its first run.

The eight `check-*.mjs` guards stay plain JavaScript with no workspace imports, so CI can run them
with bare `node` even when install is broken — which is when a guard is most worth having.

### The probe runs before anything is sealed

One page of one order — `GET /wp-json/wc/v3/orders?per_page=1` — which is the cheapest request that
exercises **the exact permission the backfill needs**. A key with Read on products and nothing on
orders authenticates fine and fails on the first scheduled pull. So does a key pasted with a
trailing space.

The four answers are four different sentences, because four different people fix them:

| | means | who fixes it |
|---|---|---|
| `401` / `403` | wrong key/secret, or no Read on orders | the merchant, in their admin |
| `404` | REST API disabled, or not a WooCommerce store | the merchant, in settings |
| `200` + non-array body | a security plugin or proxy is answering in front of WooCommerce | the merchant's host |
| network failure | the store is unreachable | names reachability and **nothing about the credential** |

An **empty** array is accepted. A store that has not sold anything yet is connectable, and the probe
is testing the permission, not the inventory.

### The `id` is written explicitly, and that is the whole reason the SQL carries a comment

`seal` binds the ciphertext to `{workspaceId, connectionId}` as AES-GCM additional authenticated
data. The row's primary key is part of what the tag covers.

Dropping the `id` column and letting `gen_random_uuid()` fill it produces a row that **inserts
without complaint and whose credential can never be opened by anyone, with the KEK, forever.** The
column looks redundant next to a default, which is exactly why the emitted SQL says so in place.

### The secret is not a command-line argument

`--secret` is **refused**, with the reason: argv is visible to every user on the machine through
`ps`, and lands in shell history. Key and secret come from the environment. Nothing prints either —
stderr gets the key's first nine characters and a four-byte SHA-256 prefix of the secret, enough for
an operator to tell which credential they sealed. Counts and identifiers on stderr, the artefact on
stdout, so `> row.sql` captures exactly the SQL and nothing else.

### The timezone check is the part that was wrong twice

`--timezone` is required, because `POST /v1/ingest/run` refuses a connection without one and
`20260912000500` makes the column immutable once set.

`assertWooTimezone` was not enough, and its own docstring says why: it asks whether a zone is *real*,
and "the canonical-form rule lives on the column instead ... where a hand-written row would otherwise
slip past". **The row this script emits is that hand-written row.** `--timezone asia/bangkok` sealed
happily; `pg_timezone_names` is case-sensitive and the trigger would have rejected the INSERT.

The first fix used `Intl.supportedValuesOf("timeZone")` as the oracle. **That was worse than the
bug.** On the Node build this was written against it returns 418 names that *include* `Asia/Calcutta`
and *exclude* `Asia/Kolkata` and `America/Argentina/Buenos_Aires` — both of which Postgres holds and
a real merchant would type. The second attempt, demanding `ICU-resolved === input`, fails the same
two: ICU here resolves them to their *backward* names.

What shipped checks only the two things ICU can actually answer for, and defers the rest to the
trigger:

1. **Shape** — `UTC`, or a name containing `/`. Not an approximation: this is the trigger's own rule.
2. **Case** — if ICU resolves the input to the same letters in a different case, it is a typo and the
   correct spelling is known, so the refusal names it. A resolution differing by more than case is
   an *alias*, not a typo, and is passed through.

**Verified against the live project rather than reasoned about.** Fourteen candidates, run against
`pg_timezone_names` on 2026-09-12; the script and the trigger agree on all fourteen:

| accepted by both | refused by both |
|---|---|
| `Asia/Bangkok`, `UTC`, `Asia/Kolkata`, `Asia/Calcutta`, `America/Argentina/Buenos_Aires`, `America/Buenos_Aires`, `US/Eastern`, `Etc/GMT+5` | `asia/bangkok`, `utc`, `EST5EDT`, `Factory`, `localtime`, `posixrules` |

## 2. Cost estimate

**One HTTP request to the merchant's own store per run of the script**, and nothing else. No
platform fee, no row written by the script itself, no R2 object. The `INSERT` it prints writes one
row.

## 3. Platform-terms check

**1. BYOC.** `PASS` — the credential is the merchant's own, issued by the merchant in its own admin.
The script never mints, brokers or holds one on the company's behalf.

**2. Credential at rest.** `PASS` — AES-GCM envelope encryption via `@repo/vault`, DEK per
connection, wrapped under the KEK. This script performs no cryptography of its own.

**3. Credential in transit.** `PASS` — `normaliseStoreUrl` refuses `http://` outright, and it fired
in testing. The refusal's reason is recorded there: over plain HTTP the WooCommerce API requires
OAuth 1.0a request signing, which this connector deliberately does not implement.

**4. Credential in logs.** `PASS` — the secret is never written to stdout, stderr or the emitted SQL.
A test asserts the SQL contains neither the key nor the secret; the printed fingerprint is a
four-byte digest prefix.

**5. Credential lifetime.** `PASS` — `expires_at` is null and means *no expiry*, which is true of a
merchant-issued key pair; `key_version` is 1 and `rewrap` is what moves it.

**6. Tenancy.** `PASS` — `workspace_id` is required and is bound into the AAD, so a row moved to
another workspace cannot be decrypted. Verified by test.

**7–9 (Tenancy, continued).** `N/A` — the script adds no database object, policy or query. It emits
SQL for a human to run.

**10. Data movement.** `PASS` — one request for one order, and the response body is inspected only
for its shape. No order is read, stored or archived.

**11–12.** `N/A` — nothing buffered, nothing archived.

**13. PII.** `PASS` **by not reading.** The probe requests a page of one order and looks only at
whether the body is an array. The order's buyer fields are never touched, and the count is the only
thing carried out of the response.

**14–15.** `N/A` — no consent surface, no person-derived field emitted.

**16–17. Access tier and quota.** `PASS` — one request against the merchant's own store, which has
no platform quota. `quota_used_today` is left at its default.

**18. Claim provenance.** `N/A` — nothing user-visible renders from this.

**Result:** `11 PASS, 7 N/A, 0 FAIL`

## 4. What was left out

- **No `--skip-probe`.** The probe *is* the script's value. An escape hatch around it would be used
  exactly when the credential is wrong.
- **The script does not execute the INSERT.** It cannot: no credential in this system carries a
  non-null `current_user_id`, which is the same limitation `52-ingest-runtime.md` records for the
  watermark. Printing SQL is the honest shape, not a placeholder for an API call.
- **No workspace is created.** The script requires an existing `workspace_id` and does not seed one.
  Seeding a workspace is step 8.
- **One provider.** WooCommerce is the only source with a `backfill.ts`. A provider flag would offer
  four choices that cannot be ingested.
- **`--connection-id` is accepted but not required.** Supplying one lets an operator re-seal the same
  connection after a KEK rotation; `rewrap` is the better tool for that and this is not a substitute.
- **No `.env` file support.** Reading a dotfile would put the secret somewhere it persists.

## 5. Open or unverified spec items this builds on

- **No real WooCommerce store has been probed.** The probe's behaviour is tested against an injected
  `fetch`, and end-to-end runs used a local server — which the connector correctly refused for being
  `http://`. Every refusal path was exercised through the real CLI; the **success** path against a
  real store has not been.
- **The emitted SQL has not been executed against the live project**, because there is no workspace
  row to reference yet. The `bytea` literals are verified by round-trip through `decodeBytea`, the
  same function the connection adapter uses, but not by Postgres.
- **`ConnectionError`'s lane check was discovered, not anticipated.** `openCredential` refuses when
  `credential_lane` disagrees with the sealed `kind`. The first draft of the test hardcoded the lane
  and passed a row the Worker would have rejected; the test now reads the lane out of the emitted
  SQL.
- **The ICU/`pg_timezone_names` disagreement is a property of this Node build.** The live check was
  run once, on 2026-09-12. A different ICU build could change which names resolve to which, though
  the two rules that shipped — shape, and case-only mismatch — do not depend on the zone table.

## 6. Verification

- `pnpm exec biome lint .` / `format .` — clean (six pre-existing warnings, none in this change)
- `pnpm typecheck` — clean, now including the workspace root
- `pnpm -r test` — **903 passed** (`@repo/api-edge` 130 → **168**)
- `pnpm -r build` — clean
- All eight guards pass
- `./supabase/tests/run-local.sh` — 343 assertions, unchanged; this change adds no database object
- Fourteen timezone candidates checked against the live `pg_timezone_names` — see §1
- Every CLI refusal exercised through the real binary: secret-on-argv, missing KEK, short KEK,
  non-uuid workspace, `http://` store, and four timezone shapes
