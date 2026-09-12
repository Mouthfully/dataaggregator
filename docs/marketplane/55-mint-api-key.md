# 55. `mint-api-key` — the other half of the demo

## 1. What this is, and the decision taken

**Step 7 of `MVP-PLAN.md` §5**, whose one-line description is the whole problem: *"nothing mints a
key today."* `/v1/performance` authenticates a bearer credential and there has never been a way to
create one, so the **read** half of the product has been unreachable for the same reason the write
half was until step 6.

With step 5 there is now a path in and a path out: one script seals a connection, one mints a key.

**It does not hash the key itself.** `hashApiKey` comes from `@repo/store` — the same function
`authenticator.ts` calls on every request. A second SHA-256 here would agree with it until one of
them changed encoding or framing, and the symptom would be a key that mints successfully and
authenticates as nothing, indistinguishable from a revoked one because `verify_api_key` collapses
every failure into the same null.

### The key is printed, once, and that inverts step 5

`seal-connection.ts` never prints its secret. This one prints its secret and nothing else can.

The difference is not style. There, the secret already existed in the merchant's WooCommerce admin
and the script was merely handling it. Here the secret is **brought into existence by the run**, and
the database stores only its SHA-256 — so a run whose output is lost is a key nobody will ever hold
again. There is no recovery path, by construction, and the emitted SQL says so in a comment because
someone will eventually go looking in the file for it.

Identifiers and the key on stderr, the `INSERT` on stdout, so `> key.sql` captures exactly the
artefact. The SQL is the part that gets pasted into a browser, a chat and a shell history; a test
asserts the key is not in it.

### Thirty-two symbols, not thirty-six

The column's check is `[a-z0-9]`, which is 36 symbols — and **36 does not divide 256**. Drawing a
byte and taking it modulo 36 makes the first four letters measurably likelier than the rest.

The bias is small, and it is also entirely unnecessary. Lowercase base32 is 32 symbols, exactly five
bits, so every draw is uniform with no rejection loop and no modulo at all — and it is a subset of
`[a-z0-9]`, so the column is satisfied either way.

**The test proves it rather than restating it.** Feeding every byte value 0–255 exactly once must
yield every symbol exactly eight times. Under `% 36` four symbols would come out eight times and the
rest seven, and no amount of looking at generated keys would show it.

`i`, `l`, `o`, `0` and `1` are kept, where a human-typed code would drop them: these keys are copied
and pasted, never transcribed, so removing symbols costs entropy for a confusion that cannot arise.

### The prefix is a genuine prefix

`key_prefix` is a real prefix of the key rather than a separately generated identifier, which is
what makes it useful — an operator reading a row can match it against the key in their password
manager without holding the secret. Forty bits is not a security boundary; the whole key is hashed
and the column's own comment declares the prefix non-secret. It only has to avoid colliding in a
`UNIQUE` index, which at forty bits is a coin-flip at roughly a million keys, and a collision fails
the INSERT — a retry, not an incident.

### `--env` has no default

A key that reaches production because `test` was assumed, and a demo that burns real credits because
`live` was, are both decisions nobody made.

## 2. Cost estimate

**฿0.00 and no network call at all.** The script talks to nothing; it generates, hashes and prints.

## 3. Platform-terms check

**1–3.** `N/A` — no platform credential is involved. This mints the product's *own* credential.

**4. Credential in logs.** `PASS` — the key reaches stderr once and is absent from the SQL, asserted
by test. The database receives only a SHA-256.

**5. Credential lifetime.** `PASS` — `--expires` is optional, and an expiry in the past is refused
rather than minted: such a key inserts fine and authenticates as nothing, which looks exactly like a
wrong key.

**6. Tenancy.** `PASS` — `workspace_id` is required and is the entire authority of the resulting key;
`app.api_key_workspace_id()` opens exactly that workspace and no other.

**7–9.** `N/A` — no database object, policy or query added.

**10–15.** `N/A` — no data is fetched, moved, archived, and no person-derived field is touched.

**16. Access tier.** `PASS` — `monthly_credit_budget` is passed through when given and null
otherwise, which the column reads as no ceiling.

**17.** `N/A` — no quota consumed.

**18. Claim provenance.** `N/A` — nothing user-visible renders from this.

**Result:** `6 PASS, 12 N/A, 0 FAIL`

## 4. What was left out

- **`allowed_tools` is always empty**, which the column defines as *every tool*. A flag would offer
  a restriction against a tool list that does not exist yet.
- **The script does not execute the INSERT**, for the reason `54` records: no credential in this
  system carries a non-null `current_user_id`.
- **No revocation or rotation.** Both are `update` statements on an existing row and neither needs a
  generator.
- **`created_by` is not set.** It references `members`, and there are no members — `auth.users` holds
  zero rows.

## 5. Open or unverified spec items this builds on

- **No minted key has ever been presented to `/v1/performance`.** The hash is asserted against
  `hashApiKey`, which is what the Worker calls, but the end-to-end path — mint, insert, `curl` —
  requires a workspace row, which does not exist. That is step 8.
- **The `mp_` prefix is inherited, not chosen.** It is bound by a `CHECK` constraint and predates the
  rename to `uniplain`; `53-the-rename.md` §4 records why it was not changed.
- **Forty bits of prefix** is judged sufficient against a `UNIQUE` index, not measured against a real
  key population, because there is none.

## 6. Verification

- `pnpm exec biome lint .` / `format .` — clean
- `pnpm typecheck` — clean
- `pnpm -r test` — `@repo/api-edge` 168 → **184**
- `pnpm -r build` — clean
- All eight guards pass
- `./supabase/tests/run-local.sh` — 343 assertions, unchanged; no database object added
- The CLI was run: a real key was minted, and its `INSERT` inspected
