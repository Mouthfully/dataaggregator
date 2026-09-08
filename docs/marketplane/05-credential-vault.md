# 05. The credential vault

## 1. What this is, and the decision taken

`packages/vault` — envelope encryption for the customer's own platform grants, implementing gap 3
from `03-supabase-schema-and-rls.md` against the columns `20260908000500_connections.sql` already
carries.

Supabase Vault is simpler, and it puts the key material next to the ciphertext: one database
compromise yields both. What this product sells is custody of other people's platform credentials, so
**the database has to be worth nothing on its own.**

- A fresh 256-bit data encryption key per connection, per rotation.
- The credential sealed under it with AES-256-GCM.
- That key sealed under a key encryption key held in Cloudflare; only the wrapped form is stored.
- Postgres never sees a plaintext credential, a plaintext data key, or the key encryption key.

Non-negotiable 4 forbids shared platform tokens across tenants. That is structural rather than a rule
to remember: a credential hangs off exactly one connection and has its own data key.

### Two decisions worth stating

**The seals are bound to the row they belong to**, as AES-GCM additional authenticated data covering
the workspace, the connection, and which of the two seals it is.

This closes an attack the row-level security does not. RLS stops a tenant *reading* another tenant's
row. It does not stop a ciphertext being **relocated** into a row they can already read — anyone with
database write access could move `credential_ciphertext` from one connection to another and the
Worker would open it happily, because the bytes are valid. Different attack, different answer. The
purpose is in the binding too, so a wrapped data key cannot be presented as a credential even within
one row.

**The domain separation string is not the product name.** It is baked into the authentication tag of
every credential ever sealed, so changing it makes every stored credential unopenable. It has to
outlive anything that might be renamed, and the product name is explicitly unsettled. The brand guard
caught this on the first commit that tried it, which is the clearest evidence so far that the guard
earns its place: a product name in that literal would have been a latent data migration disguised as
a string.

**`crypto` is a parameter, never an ambient global**, for the same reason `siteUrl(env)` takes its
environment. This package compiles into both the Next app and workerd; the two runtimes type their
WebCrypto differently, and a package that reaches for a global typechecks under whichever config it
was written against and fails on the other. The slice actually used is declared structurally, which
is more honest than widening the tsconfig until a global appears.

Rotation re-wraps the data key and leaves the credential ciphertext untouched. That is the point of
the envelope: rotating the key encryption key across every connection is one small write per row,
not a re-encryption of every secret. It is also why `key_version` is a column.

## 2. Cost estimate

**Per connected account per month: effectively zero.** Two AES-GCM operations per credential open,
on secrets measured in hundreds of bytes. The measurable cost is one extra unwrap per open, which is
the price of not storing the key beside the data.

The line to watch is not CPU but **calls**: every scheduled pull opens a credential. At four sources
per account with restatement re-pulls at D+1, D+3, D+7 and D+28, that is a few hundred opens per
account per month — negligible against the platform calls they precede. Worth caching an opened key
in memory for the life of a single Workflow instance rather than per step, which is a change to the
caller, not to this package.

## 3. Platform-terms check

**Credential.** PASS × 4 — this *is* the credential-handling gate. No credential is read from an
environment variable or a shared token: the module only transforms bytes it is handed. There is no
Marketplane-held platform token anywhere. No pass-through: nothing here forwards a token upstream.

**Tenancy.** PASS × 3 — the AAD binding makes a credential unusable outside its own workspace and
connection, which is per-tenant separation enforced by cryptography rather than by a query predicate.
This is strictly stronger than the RLS layer and complements it.

**Data movement.** PASS × 3 — nothing leaves the process. A sealed record reveals nothing about the
plaintext, which is asserted rather than assumed.

**PII and consent.** PASS × 3 — no contact data. Credentials are platform grants, not personal data
about end users. Note that a plaintext credential must never be logged; that gate belongs to the
callers, and the design is deliberately shaped so a caller never holds one longer than a single call.

**Access tier and quota.** N/A × 2.

**Claims.** PASS × 3 — makes `byoc` and `read-only-oauth` in `packages/brand/src/claims.ts` true
rather than aspirational. No new claim.

## 4. What was left out

- **Where the key encryption key comes from.** A Worker secret; wiring it is the Connect unit's job,
  along with a documented generation procedure. `kekFromBase64` is the boundary.
- **The rotation runbook.** `rewrap` exists; the job that walks every connection, and the dual-read
  window while `key_version` is mixed, ship with the scheduler.
- **Reading and writing the `connections` row.** This module transforms bytes; persistence belongs
  to the data-access layer.
- **A hardware or managed KMS.** Cloudflare Secrets Store holds the key encryption key as a secret,
  not in an HSM. Worth revisiting if a design partner's security review asks for one; recorded here so
  the answer is "considered" rather than "overlooked".

## 5. Open or unverified spec items this builds on

Nothing in this unit rests on an open specification question. The scheme is standard envelope
encryption and does not depend on any platform behaviour the research left unresolved.

One thing is worth flagging as an assumption rather than a finding: the specification says only "in a
vault" (section 15), so the whole design is a decision taken in `03-supabase-schema-and-rls.md`
rather than a requirement being implemented. If a design partner's security review prefers Supabase
Vault or a managed KMS, the interface here does not change — only where `kek` comes from.

## 6. Verification

| | |
|---|---|
| `typecheck` | Clean, with `types: []` on the module itself, so it compiles under both runtimes |
| Tests, Node | **17/17** |
| Tests, real workerd | **2/2** in `apps/api-edge`, via `@cloudflare/vitest-pool-workers` |

**It is tested in workerd as well as Node on purpose.** The scheduler opens credentials to call
platform APIs, and Node's WebCrypto and workerd's are different implementations. A crypto module that
passes only on the runtime it was developed against is not verified.

**Mutation-checked**, on the two properties that carry the security:

- **Dropping the AAD binding** — 2 failures, both relocation cases: moved to another workspace, and
  moved to another connection in the same workspace.
- **Reusing a fixed nonce** — caught by "uses a fresh data key and nonce every time". Nonce reuse
  under one key breaks AES-GCM outright, so this is not a style point.

Both reverted; back to 17/17.

The suite also pins down what a database compromise is actually worth: the wrong key encryption key
fails, a tampered ciphertext, nonce or wrapped key each fail rather than returning garbage, and the
sealed bytes contain no recognisable fragment of the plaintext. On rotation it asserts the credential
ciphertext is byte-identical, the wrapped key is not, the new key opens it, and **the retired key no
longer does** — the last being the one that would otherwise let a leaked old key stay useful.
