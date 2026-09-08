# 25. You cannot redact a stream you never parse

**PR:** #3 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decisions taken

`21` §9, `22` §8 and `24` §4 all record the same thing under platform-terms gate 13: **`raw` cannot
be stored as returned for a commerce source.** An order carries buyer name, email, phone and
shipping address; a charge carries cardholder details. `17-payload-store.md` keeps platform
responses **verbatim** in R2, and 11A.14 made the launch connector set three sources that return
orders. Verbatim stopped being safe and became the last thing standing between the dictionary and a
connector.

This is that path. Spec §11A.15 carries the binding version.

**The constraint that shaped every line of it:**

> **You cannot redact a stream you never parse.**

The streaming path exists so the isolate never holds the payload — that is the whole point of
`putPayload`, and of `fetchWithRetry` refusing to read a body. Redaction requires holding the
payload and parsing it. **Both cannot be true.** So a source whose response can carry contact data
cannot use the streaming path at all: it buffers under the existing 16 MB cap, or it stores nothing.
`putPayload` throws when asked, because the call is the one place that fact cannot be forgotten.

**Numbered 25. `20-marketing-site.md` is still owed.**

### 1.1 An allow-list, not a deny-list

A deny-list has to predict what a platform calls a phone number. WooCommerce says `billing.phone`;
Shopify says `customer.phone` **and** `shipping_address.phone`; Stripe says `billing_details.phone`.
The first field a platform adds ships unredacted, and nothing goes red.

An allow-list fails the other way. An unrecognised field is **dropped**, so a platform's new field
goes **missing** rather than leaking. A missing field is a bug report from a customer; a leaked one
is a notification to a regulator. That asymmetry is the entire argument, and it is why the keep-list
is applied **by key name at every depth** rather than by path: `line_items[].meta_data` and
`shipping_lines[].meta_data` are the same hazard, and a path list is one platform change away from
covering one and not the other.

### 1.2 The archive drops. It does not hash.

The kickoff says *"hashed at the edge and never stored raw"*, and it would have been easy to read
that as an instruction to hash here. It is not.

**"Hashed at the edge" governs the write path** — the offline-conversion upload of section 3.2,
deferred by 11.4 — where the platform dictates an **unsalted** SHA-256 of a normalised value,
because Meta and Google hash the same way and the values have to match. Storing that same hash in a
payload archive would build **a database of pseudonyms with no consumer**, and an unsalted SHA-256
of an email address is reversible by anyone holding a list of email addresses. Under PDPA and GDPR a
pseudonym is still personal data; hashing would have converted a clear obligation into a comfortable
one without changing what the archive holds.

So identifiers are **removed**. Where a person-level join is needed later — 11A.5's matched class,
where a loyalty phone number links a cover to a channel — the identifier is hashed **on the row
path**, when that path is designed, with a key scoped to one workspace. Never preserved in the
archive as a side effect of having once been fetched.

### 1.3 Fail closed on the source nobody has thought about

Every source in the dictionary is declared, each with a reason a human can read. **A source that is
not declared cannot store a payload at all** — `policyFor` throws and names the file to edit.

That refusal is the load-bearing part. Redaction that has to be remembered is redaction that will be
forgotten on the connector written at the end of a long week. The next author's build fails until
they have decided, which is the earliest possible moment to make them.

## 2. What this deliberately does not do

**It removes fields by key name. It never inspects values.**

A source whose personal data sits inside a **value**, under a key the keep-list must retain, is not
protected by anything in this module. **Search Console is exactly that shape**: its `keys` array is
free text a person typed, under a key no keep-list could drop without losing the row entirely.

That source is declared `verbatim`, with the reason written into the table: Google applies its own
anonymity threshold and withholds low-volume queries. **That is a dependency on Google's behaviour,
not a property of this system**, and the policy says so rather than implying the protection is ours.
A value-level rule — pattern matching, entity detection, a per-field classifier — is different work
with a different failure mode, and pretending this covers it would be the more dangerous outcome
than not having it.

**One related thing turned out already safe, and is worth recording rather than assuming.**
`GET /v1/performance` cannot leak `raw`: the API reads from `envelope_rows`, which stores
`raw_key` — an R2 object key — and never the payload. The envelope's own optional `raw` field is
transient, produced by a connector and never persisted. So the read surface needed no change.

## 3. The one seam, argued rather than shrugged at

`policyFor` takes the policy table as a defaulted parameter, and both store functions accept a
`policies` option they never need in production.

**Why a security control has a seam in it.** No source in the dictionary needs redaction yet — the
commerce sources that do are not in `SOURCES` until their connectors ship, which `24` §5 decided
deliberately. Without the seam the redaction path could not be exercised **at all** until the first
commerce connector arrives, and redaction that has never run is not a control, it is an intention.

The seam is narrow and visible: production passes nothing, the default is the declared table, and
any call site supplying its own is a one-word grep. Shipping untested redaction to avoid a testable
parameter would have been the worse trade, and the alternative — declaring `woocommerce` in the
table before it is in `SOURCES` — would have put two vocabularies in the repository to avoid one
parameter.

## 4. Cost estimate

**Per connected account per month: no new infrastructure, no dependency, no platform call.**

| Term | Effect |
|---|---|
| Verbatim sources | **Unchanged.** One policy lookup, a map read, before the body is touched |
| Redacted sources | Buffer + `JSON.parse` + filter + re-serialise, bounded by the existing 16 MB cap |
| **Stored bytes** | **Smaller**, materially. An order payload is mostly customer and address fields; keeping ids, money and line quantities is a fraction of it. R2 at $0.015/GB-month, and object COUNT is unchanged, so the Class A write cost `17-payload-store.md` found dominant is untouched |
| Isolate memory | The buffered path's cap already bounds it. Redaction adds one parsed copy plus one serialised copy of a payload already known to be under 16 MB |

**The cost that is not money.** A redacted archive can no longer reproduce a platform's response
byte for byte, so it cannot answer *"did the platform really send this field?"* about a field the
keep-list drops. That is the price of the rule, and it is the right way round: the archive exists to
reproduce **numbers**, and every number is kept.

## 5. Platform-terms check

**1. BYOC.** `N/A` — no credential path is touched.

**5–7. Tenancy.** `PASS`, unchanged. Keys still start with the workspace (`payloadKey`), and
`deleteWorkspacePayloads` still erases by that prefix. Redaction changes what is inside an object,
never where it lives.

**10. No resale or redistribution.** `PASS` — nothing moves between workspaces. Worth noting the
direction of travel: an archive holding less is less to disclose, whatever the disclosure.

**13. Hash at the edge.** **`PASS`, and this note is the reason it can now be answered that way at
all.** The rule was written for a write path; this is its read-path counterpart. Contact data cannot
reach R2 for a source declared to carry it, an undeclared source is refused, and §1.2 records why
the archive drops rather than hashes. **The one honest qualifier is §2**: this protects fields, not
values.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress. But the same allow-list is the
mechanism that would carry it: card numbers and special-category fields are absent by default rather
than banned by name.

**16, 17.** `N/A` — no quota, no approval.

**18. Claim provenance.** `PASS` — nothing user-visible. Specifically **not** claimable: this is not
anonymisation, and nothing in the brand file may say it is.

Gates 2–4, 8, 9, 11, 12, 15: `N/A`.

**Result:** `5 PASS, 13 N/A, 0 FAIL`

## 6. What was left out

- **No per-source keep-list for a commerce source.** WooCommerce's and Shopify's keep-lists ship
  with their connectors, where the fields are read against real responses rather than guessed. The
  test suite uses a WooCommerce-shaped policy to exercise the path; that is a fixture, not a
  declaration.
- **`SOURCES` is still untouched**, for the reason `24` §5 gives.
- **No value-level redaction.** §2.
- **No hashing, anywhere.** §1.2. When the matched class of 11A.5 is built it will need a
  workspace-scoped keyed hash on the row path; that is its work, not this one's.
- **`getPayload` does not check the redaction record.** Reading an object stored before a policy
  changed returns what was stored. Re-redacting an archive on a policy change is a migration
  question nobody has asked yet.
- **The three pre-existing lint warnings**, again. Same reason as `24` §5.

## 7. Open or unverified items this builds on

- **Search Console's reliance on Google's anonymity threshold** (§2). Undocumented as a guarantee,
  and if it changes, that policy row is wrong rather than merely dependent.
- **`ai_answers` is declared verbatim** on the grounds that it is bought public data. If the
  collector ever accepts customer-supplied prompts, that row needs revisiting — the prompts would be
  the customer's text, not a public source's.
- **Whether a redacted payload is still worth its storage** at all for a commerce source. If the
  keep-list is small enough, the answer may be to store the normalised envelope row and no payload,
  which would make this module's refusal moot for that source. Not decided.
- **11A.14 itself**, unchanged: if the first design partners are walk-in venues, the first redacted
  source is POSPOS, whose Member API returns member records — the same shape of problem.

## 8. Verification

**Ten mutations, ten caught.**

| Mutation | Caught by |
|---|---|
| `policyFor` defaults instead of refusing an undeclared source | payloads suite |
| `redactValue` keeps unknown keys | payloads suite |
| `redactValue` does not recurse into a kept value | payloads suite |
| `redactValue` filters arrays instead of mapping them | payloads suite — array length is load-bearing |
| The prototype exemption is restored | payloads suite — the bypass it was |
| The depth cap is effectively removed | payloads suite |
| `putPayload` lets a source needing redaction stream | api-edge suite, real R2 |
| The policy is resolved **after** the body is read | api-edge suite — asserted on `body.locked` |
| Redaction is skipped when compressing | api-edge suite |
| The redaction record is dropped from custom metadata | api-edge suite |

**One of those reported a false survivor first.** The mutation script's `str.index` found an earlier
occurrence than intended, so the edit never landed and the suite passed on unmutated code. Applied
by hand, the test fails as it should. **A mutation that "survives" is a claim about the harness
until the mutation is confirmed to have applied** — the same lesson `24` §7 records from the other
direction.

**Repository gates.**

| | |
|---|---|
| Lint | pass — the same 3 warnings present on `main` |
| Format, brand, tokens, dictionary guards | pass |
| Typecheck, build | pass |
| Unit tests | **352, up from 333** — 30 in `@repo/payloads`, 56 in `apps/api-edge` |
| Database suite | **118, unchanged** — no schema change |
