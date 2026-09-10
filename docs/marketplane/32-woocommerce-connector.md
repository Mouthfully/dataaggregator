# 32. WooCommerce, and a fee it refuses to invent

**PR:** #9 &nbsp;·&nbsp; **Date:** 2026-09-10 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

Slot 2 of §11A.14's launch set becomes expressible. `woocommerce` enters the dictionary, gets a
restatement clock and the **first `redact` redaction policy**, and a normaliser turns an order into
envelope rows. **It does not yet fetch anything** — see §5.

**The decision taken, and it is the one worth reviewing: when the payment fee is unknowable, the
connector emits nothing rather than zero, and withholds `net_revenue` entirely.**

Core WooCommerce exposes **no payment-processor fee**. This was verified against WooCommerce's own
source, not inferred. What exists is:

- **`fee_lines`**, which is a **merchant-authored surcharge** — a delivery charge, a packing fee —
  that **ADDS to the order total**. Reading it as a cost does not merely produce a wrong number, it
  **inverts the sign on the one figure this product exists to compute**.
- **gateway-specific `meta_data`** — `_stripe_fee`, `_wcpay_transaction_fee` — which some gateways
  write and many do not.

So `fees` comes only from a short allow-list of keys read against real responses, and is **absent**
otherwise. And because `net_revenue` means *what the owner actually keeps*, an unknown deduction
makes it uncomputable: it is emitted **only alongside a `fees` figure that is genuinely known.**

**The alternative rejected was `fees: 0`.** It is what a normaliser reaches for, it keeps the schema
tidy, and it asserts that the merchant paid nothing to be paid. That is false, it is false in the
**flattering** direction, and §11A.2 already names the failure: *"a dashboard that reports
platform-gross revenue to an owner who pays 30% delivery commission is not a smaller truth, it is
the wrong number."* A silent zero is the same error wearing a decimal point.

**This has a product consequence that outranks the code, and it should be decided rather than
absorbed.** §11A.14 put WooCommerce in the launch set on the assumption it delivers profit after
fees. On a merchant whose gateway is opaque — which is the common case, not the edge — **it delivers
revenue, orders and refunds, and stops there.** The fee arrives with slot 4, the payment source,
which sees its own settlement data directly. That ordering is now load-bearing rather than
convenient, and §6 records it as the open item it is.

**One row per order**, not per day. `24-commerce-grain.md` §6 records the choice as open with a cost
difference of roughly three orders of magnitude. Per-order is taken because **a refund restates one
order** and the upsert key can address it, where a daily aggregate would have to be recomputed from
a re-pull of the whole day to move by one refund. A daily roll-up can be built from these rows; the
reverse is not true.

### 1.1 The vocabulary is appended, never substituted

`woocommerce` goes on the **end** of `SOURCES` and of `app.envelope_source`, and **nothing is
removed**. §11A.14 substituted the *launch set*; it did not shrink the *vocabulary*. Google Ads, Meta
and Search Console keep their dictionary entries and move behind the fifth-connector gate — **a
build order is not a vocabulary**, and dropping a Postgres enum value is a migration hazard with no
upside.

The enum is edited **in place** rather than by a later `alter type`. That is not laziness:
`check-dictionary.mjs` **fails the build** the moment a second migration touches a dictionary enum,
deliberately, so the guard can never end up comparing a stale file. Its own error message says what
to do on the day a real database has applied these — teach it to fold later migrations in first.

### 1.2 Adding a source is a four-place act, and three places enforce themselves

Worth recording, because it is the repository working as designed:

| Place | What enforces it |
|---|---|
| `packages/contract/src/source.ts` | — |
| `supabase/migrations/…_envelope_rows.sql` | `check-dictionary.mjs` compares both lists |
| `packages/contract/src/restatement.ts` | `Record<Source, …>` — **total**; `tsc` fails |
| `packages/payloads/src/redaction.ts` | `Record<Source, …>` — **total**; `tsc` fails |

This settles a question left open earlier in the session: **the dictionary change cannot ship ahead
of the connector.** `redaction.ts` says so in its own comment — *"the commerce sources that do [need
redaction] are not in `SOURCES` until their connectors ship"*.

## 2. The restatement clock is null for a new reason

Every other `null` in `RESTATEMENT_CLOCKS` means *nobody has measured it*. WooCommerce's means
**there is no number to measure**. The store is the merchant's own database, not a platform
reporting pipeline: an order can be refunded, edited or cancelled a year later. No window closes.

Two consequences, accepted deliberately rather than discovered later:

- **Every row stays provisional forever.** `restatesUntil` returns null, so `isProvisional` is always
  true. For a row that can genuinely change forever that is the honest answer, and it is exactly what
  §11A.4's visible-provenance rule should show an owner.
- **The backfill planner sees no ladder to climb**, which is correct here for the same reason:
  re-pulling on D+1/D+3/D+7/D+28 would chase a window that does not exist. Restatements are caught by
  a `modified_after` pull instead — load-bearing, and verified in WooCommerce core, where
  `wc_create_refund` bumps the parent order's `date_modified` **unconditionally**.

## 3. Cost estimate

**Per connected account per month:** `฿0.00 today; ~฿0.40–฿2.00 once the client ships`

Nothing in this diff fetches, stores or schedules, so today's marginal cost is genuinely zero. The
figure above is the derivation for the connector this makes possible, and it is **deliberately not**
the per-1M-call unit of §7:

| Term | Derivation |
|---|---|
| Rows/night | **One row per changed order.** A café at ~50 orders/day is ~50 rows; a busy online seller at 500 is ~500. Per-order is the choice that makes this term linear in orders rather than flat. |
| Restatement depth | **1×, not 4×.** No ladder — §2. The `modified_after` pull re-reads only orders that actually moved, which for a mature store is a small fraction of the day's volume. This is materially cheaper than the D+1/D+3/D+7/D+28 sources. |
| Workers invocations | One Workflow instance per (connection, date), plus one request per 100 orders — `per_page` caps at 100, verified against WordPress core, which WooCommerce does not override. |
| R2 | One object per page fetched, not per order. At 50 orders/day that is one object a night. **Object COUNT is the term §7's table omits**, and per-page rather than per-order is what keeps it small. |
| Supabase disk | ~50–500 rows/night/account at the envelope's fixed column set. `raw` is an R2 key, never a JSONB blob. |
| Bought data | None. WooCommerce is the merchant's own server on the merchant's own key. |

**Two costs this does not pay, and one it might.** There is no platform quota to burn, so §8's
open question — *the ~98% margin collapses if platform limits force 3–5× redundant polling* — does
not apply here at all; WooCommerce is the one source where redundant polling costs the **merchant's**
server rather than our quota. That is the cost it might: WordPress pagination is `OFFSET`-based
against the merchant's own MySQL, so deep paging degrades on a large store. The mitigation is narrow
windows rather than deep pages, and it belongs with the client.

## 4. Platform-terms check

### Credential

**1. BYOC.** `PASS`, and by construction rather than by design care. WooCommerce is **key-paste**: the
merchant generates a consumer key and secret in its own WordPress admin at *WooCommerce → Settings →
Advanced → REST API* with permission `Read`. There is no company-held token, no developer token, no
shared client secret, and **no reviewer** — §11A.13's test 1 answers *nobody*. This diff reads no
credential at all; the normaliser is pure.

**2. Vendor-key exception.** `N/A` — not invoked. This is tenant data on tenant credentials, not
bought public data.

**3. No token pass-through.** `N/A` — the MCP server and OAuth surface are untouched. Worth one line:
WooCommerce is **not** an OAuth source, and `packages/oauth`'s `SourceId` is correctly narrower than
`Source` (`"google_ads" | "ga4" | "search_console" | "meta_ads"`), so `providerFor("woocommerce")` is
a **type error rather than a silent wrong answer**. Checked, because a research pass claimed
otherwise.

**4. Credential hygiene.** `PASS` — no credential, fixture or log line in this diff. The fixtures
carry invented buyer data and no key material.

### Tenancy

**5. RLS.** `PASS` — no new table. `envelope_rows` already carries `workspace_id` under its existing
policy; a WooCommerce row is an `envelope_rows` row like any other.

**6. No service-role bypass.** `N/A` — no request path in this diff.

**7. No cross-workspace read.** `PASS` — the normaliser is pure and per-order. `account_id` is the
store origin, so rows are scoped to one store by construction; nothing aggregates.

**8. No cross-customer aggregation or benchmarking.** `PASS` — no aggregate of any kind. Worth
stating for a commerce source specifically: order-level data across merchants is the most tempting
benchmarking substrate in the whole product ("the average café's basket size"), and Meta 3.a.iv and
Google's redistribution clause are not what forbids it here — §15 is, and it forbids it absolutely.

**9. API key scope.** `N/A` — no key path in this diff.

### Data movement

**10. No resale or redistribution.** `PASS` — nothing moves; no billing unit changes.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path.

**12. Dependency licences.** `PASS` — no runtime dependency added. `@repo/payloads` is added as a
**devDependency** of `@repo/connectors` so the connector's own contract test proves its own fixtures
survive its own keep-list. Nothing in the served path imports it, and there is no cycle.

### PII and consent

**13. Hash at the edge.** `PASS`, **and this gate is the substance of the PR.** A WooCommerce order is
a record of one named person buying something — §11A.12 already settled that `raw` cannot be stored
as returned for any commerce source. This ships the **first `redact` policy**:

- **Dropped by not being named:** `billing` and `shipping` (each one key carrying name, company,
  street, city, postcode, country, email and phone), `customer_note`, `customer_ip_address`,
  `customer_user_agent`, `customer_id`, `meta_data`, and a refund's free-text `reason`.
- **`customer_id` is dropped deliberately**, and it is the call a reviewer will query. It is only a
  WordPress user id — but `redaction.ts`'s own header is explicit that a pseudonym is still personal
  data, and an archive of order-to-customer-id mappings is a re-identification table with no
  consumer. §11A.5's matched class hashes on the **row** path when that path is designed; it does not
  inherit an identifier from an archive that once happened to fetch it.
- **`meta_data` is dropped whole, and this is the sharpest call.** The payment fee lives in it.
  Keeping it means naming `key` and `value`, which at **every depth** admits every plugin's meta —
  a leak with an unknowable shape, which is exactly what an allow-list exists to refuse. **The
  normaliser reads the fee keys it understands out of the LIVE response instead**: the fee reaches
  the row as a typed metric and the bag never reaches the archive at all.
- **And the limit, restated because this is the first policy where it bites.** This removes **keys**,
  not **values**. `line_items[].name` is a product name and is kept, because without it the archive
  cannot say what was sold. A merchant who names a product after its buyer has put personal data
  where no keep-list can reach.

**14. Forbidden payloads rejected before egress.** `PASS` — no under-13 signal, SSN, card number or
special-category field is kept. Card data never appears in a WooCommerce order in the first place;
`payment_method_title` is a label, and `transaction_id` is a gateway reference, not an instrument.

**15. Per-destination consent.** `N/A` — writes remain deferred (§11.4). This is a read path.

### Access tier and quota

**16. Tier reality.** `PASS` — there is no tier. The merchant's own server imposes no documented
quota, which is the opposite of the usual risk and carries its own: the ceiling is the merchant's
hosting, so the client must self-throttle rather than discover it. Recorded for the client PR, with
the `per_page` cap of 100 verified against WordPress core.

**17. No new long-lead dependency.** `PASS` — **nothing here waits on anyone.** No app review, no
business verification, no developer token, no audit. That is the entire reason §11A.14 spent the
launch budget on commerce.

### Claims

**18. Claim provenance.** `PASS` — nothing user-visible changes, and **nothing here may be claimed
yet**. Per §11A.12's standing rule, none of the launch set may enter the claims list or a logo strip
until it exists, and this is half of one connector. Issue
[#6](https://github.com/Mouthfully/dataaggregator/issues/6) covers the wider defect: the `connectors`
claim already names five sources when two now exist in the dictionary and one is fetchable.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 5. What was left out

- **The HTTP client, and therefore fetching.** This PR makes WooCommerce **expressible**, not
  **readable**. The client is its own PR because it needs the item below first, and because its
  decisions — Basic auth over HTTPS with a query-string fallback for header-stripping hosts,
  `dates_are_gmt=true` on every request, `modified_before` pinned to run start so rows do not shift
  between pages, `orderby=modified&order=asc`, `per_page=100`, pagination by `X-WP-TotalPages` —
  deserve their own review rather than a paragraph here.
- **The key-paste credential lane**, and it is the real blocker. `packages/connections` models an
  OAuth token with a refresh token and an expiry; a consumer key and secret fit none of that.
  `StoredCredential` needs to become a discriminated union, `app.connection_provider` needs a
  `woocommerce` member, `connectionHealth` needs a branch for a connection that cannot expire, and
  the store origin needs somewhere to live. **That is the next PR**, and every remaining slot of the
  launch set is blocked on it, not just this one.
- **The backfill planner integration.** No ladder applies (§2), so the incremental shape is different
  enough to be its own decision.
- **`shopify` was not added.** Slot 3, its own PR, its own keep-list read against its own responses.
- **Slot 4's payments source was not added.** §11A.14 reserves it for the first design partner to
  name; inventing the name would be inventing the decision.
- **No `refunds` or `discounts` metric.** `24-commerce-grain.md` §5 settled this — a refund is a
  movement in the money, not a second column — and this PR does not reopen it.

## 6. Open or unverified spec items this builds on

- **§11A.14 assumed WooCommerce delivers profit after fees.** §1 establishes it does not, for any
  merchant whose gateway writes no fee meta. **If the answer is that most gateways write nothing**,
  WooCommerce is a revenue-and-refunds connector and the after-fees number waits for slot 4. That
  changes what the launch set *is*, not just what this connector does, and it is a founder decision
  rather than an engineering one.
- **Per-order versus per-day rows** (`24` §6) is still formally open. This PR takes per-order and says
  why; a reversal costs one normaliser and no schema.
- **WooCommerce's rate limits and restatement behaviour** are recorded as unknown in
  `23-launch-connector-substitution.md`. The restatement half is now answered from core source (§2).
  The rate-limit half remains unknown and lands on the client.
- **The store's IANA timezone has no home.** The envelope requires `dimensions.timezone`; GA4 reads it
  from the report metadata and WooCommerce has no equivalent. The normaliser takes it as an option,
  which defers rather than solves it — `connections` is where it should live, alongside the store
  origin.

## 7. Verification

| | |
|---|---|
| `pnpm exec biome lint .` / `format .` | pass, by exit code |
| `pnpm -r typecheck` | pass |
| `pnpm -r test` | pass — **418 unit tests, up from 397** |
| `pnpm -r build` | pass |
| `pnpm check:brand` / `check:tokens` / `check:dictionary` | pass |

### The mutations: eight run, eight caught — after two survived

| Mutation | Caught by |
|---|---|
| Drop the `Z`, reading a UTC instant as local time | contract test — **only after the fix below** |
| Read the merchant surcharge as a payment fee | `fee_lines` never reaches `fees` |
| An unknown fee becomes `0` instead of absent | absent-not-zero assertion |
| Publish `net_revenue` without a known fee | the refusal — **only after the fix below** |
| Subtract refunds instead of adding them | revenue would read 1,250 on a refunded 1,000 order |
| Admit `billing` to the keep-list | buyer data found in the redacted payload |
| Drop `quantity`, so `line_items` empties out | the depth rule |
| Give WooCommerce a restatement window | rows would go final |

**Two survived first, and both are worth more than the six that did not.**

**The `Z` survived because CI runs in UTC, where the wrong reading and the right reading produce the
identical string.** The assertion could not fail, and the comment above it claimed the opposite — that
asserting "on the value rather than the runtime" was enough. It was not. The fix is bigger than the
test: **the connectors suite now runs in `Asia/Bangkok`**, pinned in `vitest.config.ts`. A
Thailand-first product whose tests only ever run in UTC is structurally blind to this class of bug,
and every connector added after this one inherits the fix. The fixture also moved to 02:00, because
even in Bangkok a late-evening stamp does not separate the readings — the date moves only when the
local interpretation crosses midnight UTC.

**The `net_revenue` survivor was my own error, not the code's.** The mutation edited a line *inside*
`if (fee !== null)`, where `fee` can never be null: it landed textually and did nothing. Re-run with
the assignment moved **out** of the guard, it is caught. That is the **third** time this project has
been misled by a mutation that did not mean what it looked like, and `HANDOVER.md` §4 now has a third
lesson to record: confirming the mutation is *in the file* is not enough — confirm it changes
**behaviour**.
