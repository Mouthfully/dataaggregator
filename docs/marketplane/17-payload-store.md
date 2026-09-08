# 17. The payload store, and a constraint no fake bucket could have shown

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`@repo/payloads` — verbatim raw platform payloads in R2, and the `raw_key` that `envelope_rows`
already has a `CHECK` constraint for but nothing yet writes.

`00-repo-map.md` calls this **the highest-risk unbriefed constraint in the whole build**:

> Cloudflare Workers' 128 MB isolate memory and the 1 MiB Workflow step-output cap appear nowhere in
> §7, yet together they forbid the most natural TypeScript implementation: fetch a report,
> `JSON.parse` it, return the rows from the step. **Every extractor must stream to R2 and return a
> key.** A builder agent not briefed on this will ship a Meta async-report connector that passes
> fixtures and fails on a real large account.

This module is that brief made executable. `fetchWithRetry` already refuses to read a response body
for the same reason; this is where the body goes instead.

### The constraint that changed the design, and how it was found

The first version of this module compressed inside the pipe: `body.pipeThrough(new
CompressionStream("gzip"))` straight into `bucket.put`. Elegant, streaming, and **it could not have
worked in production**. Against a real R2 it fails immediately:

> `Provided readable stream must have a known length (request/response body or readable half of
> FixedLengthStream)`

**R2 refuses a stream whose length it does not know.** A bare `ReadableStream` is rejected. So is
`new Response(stream).body` — the obvious workaround, which I probed rather than assumed, and which
does not work either: a Response built from a stream has no length. Only a real fetch body carrying
`content-length`, or a `FixedLengthStream`, is accepted.

**That makes compression and streaming mutually exclusive.** You cannot know a payload's gzipped
length until you have gzipped it, and you cannot gzip it without holding it. So the module has two
functions instead of one:

| | when | size | compression |
|---|---|---|---|
| `putPayload` | `content-length` known | **any** | none — records the platform's own encoding |
| `putBufferedPayload` | length unknown (chunked) | capped at **16 MB** | available |

The streaming path is what every extractor should use, because a platform report response carries
`content-length`. The buffered path exists because some do not, and refusing those outright would
mean a connector that cannot fetch. **Its cap is what keeps the fallback from quietly becoming the
failure the repo map predicts** — it throws mid-read, naming the key and the cap, rather than after
the isolate dies with nothing useful to say.

16 MB against a 128 MB isolate is deliberately far below it: the isolate also holds the runtime, the
compressed copy, and whatever else the step is doing. **A cap set near the limit is a cap that only
fails in production.** A payload above it is a signal to page the platform API, not to raise the
number.

### The key, and why the workspace comes first

`00-repo-map.md` §5 specifies "one deterministically keyed object per `(source, account, date,
window, fetched_at)`". `workspaceId` is prepended, and it is not decoration:

- **R2 does not cascade.** `envelope_rows` is deleted by a Postgres foreign key when a workspace is
  hard-deleted; the payloads it referenced are simply left behind — paid for, and still holding the
  customer's platform data after they asked for it to be gone, with nothing in Postgres able to
  reach them. `deleteWorkspacePayloads` exists for exactly that, and follows the list cursor, because
  deleting only the first page reports success while leaving most of the data in place.
- **A cross-tenant prefix scan becomes structurally impossible** rather than merely forbidden.

Two smaller decisions with teeth: **escape, never strip** — a GA4 property id is
`properties/123456`, and passing the slash through creates a phantom directory level that a prefix
scan misses, while stripping makes `a/b` and `a-b` collide so the second write silently overwrites
the first. And **normalise the fetch timestamp** — `2026-09-08T02:00:00Z` and
`2026-09-08T04:00:00+02:00` are one instant, and keying on the raw string stores the same payload
twice and pays for it twice.

**Deterministic**, so a Workflow step Cloudflare retries after a half-completed failure overwrites
its own object rather than orphaning one.

## 2. Cost estimate

**Per connected account per month: `$0.0007`, and the surprise is which term it is.**

| Term | Figure |
|---|---|
| Objects/month, tiered ladder | 5 windows/day × 30 ≈ **150** |
| Stored bytes each, GA4 at the current grain | ~3 KB |
| Storage | 450 KB → **$0.0000068** |
| **Class A writes** (`$4.50/million`, **regardless of size**) | **$0.000675** |
| Dominant term | **operations, by 99×** |

`00-repo-map.md` §8 flags this as one of two terms the specification never counts: *"the mandated
stack adds two further uncosted terms (R2 object count, KV writes)"*. `estimateCost` computes both
and reports `dominatedBy`, because the intuition the storage price sets up is **wrong for this
workload**: compressing harder does nothing to a per-object charge. The lever is fewer, larger
objects.

That inverts a decision. Batching a day's windows into one object would cut the dominant term 5×;
compression, which felt like the obvious win, moves a term worth less than a thousandth of a cent.
**Left out rather than done** (§4) because batching changes the key scheme the repo map specifies.

Storage still matters at scale — the crossover is around 300 KB per object — and it is what makes R2
the right store at all: §7 names Supabase disk at $0.125/GB as the line most likely to break the
model, and R2 Standard is **8.3× cheaper**, but only because `raw` is a key rather than a JSONB blob.

## 3. Platform-terms check

### Credential
**1. BYOC.** `PASS` — no credential in this module; it receives a body someone else fetched.
**2. Vendor-key exception.** `N/A`. **3. No token pass-through.** `N/A`.
**4. Credential hygiene.** `PASS` — no credential is stored, logged or keyed on. **Worth stating
plainly: a platform response body can carry a token in an error payload**, and this module stores
bodies verbatim by design. That risk is real and it is named in §5, not waved away.

### Tenancy
**5. RLS.** `N/A` — R2 has no row-level security, which is precisely why the tenant is in the key.
**6. No service-role bypass.** `N/A` — no database access.
**7. No cross-workspace read.** `PASS`, and structurally: every key begins with the workspace, and
`deleteWorkspacePayloads` scans one prefix. A mutation replacing that prefix with `""` — a
cross-tenant erasure — is caught.
**8. No cross-customer aggregation.** `PASS` — objects are stored and fetched individually.
**9. API key scope.** `N/A` — nothing here is reachable from an API key.

### Data movement
**10. No resale or redistribution.** `PASS` — payloads stay in one bucket, keyed per workspace, and
`getPayload` returns bytes to the caller that asked for that key.
**11. Meta client list.** `N/A` for onboarding — **but relevant to deletion**, and this unit is the
half that was missing: an erasure that cleared Postgres and left R2 was not an erasure.
**12. Dependency licences.** `PASS` — no dependency at all. `FixedLengthStream` is declared
structurally rather than by importing `@cloudflare/workers-types`, so consumers are not forced to
accept it (apps/web's DOM lib collides with it head-on).

### PII and consent
**13. Hash at the edge.** **This is the gate that needs care, and the honest answer is `PASS` with a
named limit.** Payloads are stored verbatim, so whatever the platform returned is what lands — and
for a report that requested a PII-adjacent dimension, that includes it. The decision about which
dimensions are requested is made in the connector (`14-ga4-backfill.md`, whose default set is `date`
alone). This module cannot make that decision and does not pretend to; it makes the consequence
*erasable*, which is the part it can own.
**14. Forbidden payloads.** `N/A` — no egress construction. **15. Per-destination consent.** `N/A`.

### Access tier and quota
**16. Tier reality.** `PASS` — no platform call. It removes a reason to re-call: a stored payload can
be re-normalised without re-fetching, which is the whole argument for keeping `raw`.
**17. No new long-lead dependency.** `PASS` — R2 needs no approval, no audit, no review.

### Claims
**18. Claim provenance.** `PASS` — no user-visible string.

**Result:** `11 PASS, 7 N/A, 0 FAIL`

## 4. What was left out

- **Batching a day's windows into one object.** The single largest cost lever, per §2 — 5× on the
  dominant term. It changes the key scheme `00-repo-map.md` §5 specifies, so it is a decision to take
  deliberately rather than a change to slip into this PR.
- **Lifecycle rules.** R2 can expire objects by age. A raw payload is worth keeping while its row is
  provisional and much less after; the retention period is a customer-facing commitment, not an
  engineering default.
- **Wiring it to the GA4 connector.** `runReportPages` currently parses the body it receives. Making
  it store-then-parse means the client returns a key and a second step reads it back — a real change
  to that unit, and its own PR.
- **Writing `raw_key` into `envelope_rows`.** The column, its constraint and this module now both
  exist; joining them belongs with the ingest Worker that has both bindings.
- **Content addressing / dedup.** Two identical pulls store two objects. Hashing would dedupe but
  requires reading the payload to hash it, which is the thing this module refuses to do.
- **Multipart upload.** R2 supports it for very large objects; `FixedLengthStream` covers everything
  a report API returns today.

## 5. Open or unverified spec items this builds on

1. **A platform error body can contain a credential.** OAuth endpoints have been known to echo
   request parameters in error responses, and this module stores bodies verbatim. Nothing here
   inspects what it stores — by design, since inspecting means parsing. **The mitigation belongs at
   the extractor**: store payloads only for 2xx responses, and let a non-2xx go to structured
   logging with `redactSecrets` (which `@repo/oauth` already has). **Not implemented in this PR, and
   it should be settled before a connector stores anything from a real account.**
2. **The 16 MB buffer cap is a judgement, not a measurement.** It is one eighth of the isolate, which
   leaves generous headroom, but no real chunked platform response has been measured against it.
3. **`content-length` is assumed present on platform report responses.** True for GA4 and Google Ads
   as documented; **unverified for Meta's async report downloads**, which redirect to a CDN. If those
   arrive chunked, they take the buffered path and its cap, and a large Meta account is exactly the
   case `00-repo-map.md` warns about. **Verify before the Meta connector ships.**
4. **R2's "known length" behaviour is pinned by a test rather than by documentation.** Two assertions
   record that a bare stream and a `Response`-wrapped stream are both refused, so if a future workerd
   relaxes it, the test fails and the two-function split can be revisited.

## 6. Verification

| | |
|---|---|
| `@repo/payloads` unit tests | **17/17** |
| `apps/api-edge` in **real workerd with a real R2** | **50/50** (18 new) |
| Repo | **294 unit tests**, 108 database assertions, three guards, lint, format, typecheck, build — green |

The split is deliberate. The package's own suite uses a structural double for keys, erasure and cost.
**It cannot cover the two properties the module exists for** — that a 40 MB payload never enters the
isolate, and that R2 refuses an unknown length — because a double accepts anything. Those live in the
Worker app, against miniflare's real R2.

**Mutation-checked — twelve mutations, eleven caught:**

| Mutation | Result |
|---|---|
| Strip unsafe characters instead of escaping them | caught |
| Drop the workspace prefix from the key | caught |
| Key on the raw `fetchedAt` string, not the normalised instant | caught |
| Leave a missing attribution window as an empty segment | caught |
| Stop erasure at the first page | caught |
| Erase with no prefix at all (cross-tenant deletion) | caught |
| Await the pipe before handing R2 the readable half (deadlock) | caught |
| Accept a non-integer content length | caught |
| Check the buffer cap only after the whole body is read | caught |
| Compress by default on the buffered path | caught |
| Report `dominatedBy` as always "storage" | caught |
| **Swallow a length mismatch** | **survived — correctly** |

**The survivor was my comment, not my code.** I had written that `await pumped` is what surfaces a
length mismatch. It is not: `bucket.put` rejects on its own, in **both** directions — *"Attempt to
write too many bytes through a FixedLengthStream"* when the body is longer than declared, *"did not
see all expected bytes before closing"* when shorter. Removing the `await` changed nothing because
the line was never the guarantee.

The comment now says what is true, and the `await` stays for the reason it actually earns: an
unhandled rejection inside a Workflow step is a failure with no message attached to it. And a new
test pins the **longer-than-declared** direction, which is the dangerous one — a silent success there
would store a truncated object under a key claiming to be a whole report.

**Two other things this unit found, neither of which was in its scope.**

*The Worker's test `env` has been typed as `{}` since the app was created.* `env.d.ts` declared
`interface ProvidedEnv extends Env {}`, but the pool declares `export const env: Cloudflare.Env` —
so tests resolved the global, empty interface, not the app's. Nothing noticed because no test had
touched a binding: the only assertion was `expect(env).toBeDefined()`, which passes against `{}`.
Bindings are now declared once, in `Cloudflare.Env`, which is the documented extension point and what
`wrangler types` generates — so a binding added to `wrangler.jsonc` and forgotten in types is a
typecheck failure rather than a silent `undefined` at runtime.

*And the design that could not have worked.* Compression-in-the-pipe passed every review I gave it
and failed the first time it met a real R2. It is the clearest case yet for `00-repo-map.md`'s own
rule about fixtures: a double confirms what you believe, and this module's whole purpose is a
property only the real thing can demonstrate.
