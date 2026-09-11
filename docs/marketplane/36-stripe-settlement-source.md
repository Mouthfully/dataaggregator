# 36. Stripe settlement truth before another shop feed

**PR:** TBD &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

This implements §11A.17: Stripe precedes Shopify because a second shop feed would repeat the gross
number WooCommerce already provides, while Stripe's Balance Transactions contain the processor fee
and net settlement WooCommerce core does not.

**The decision is to ingest Balance Transactions, not Charges.** Charges describe what the buyer
paid; Balance Transactions describe what reached the merchant's Stripe balance and carry `amount`,
`fee`, `net`, `available_on`, status and a finance-oriented `reporting_category`. The normaliser
asserts Stripe's documented `amount - fee = net` invariant, emits signed refunds, and excludes
payouts and transfers because those move money already counted as a sale. The rejected alternative
was to join Charges to expanded balance transactions. It adds a second pagination stream and brings
billing contact fields into the hot path without improving the settlement arithmetic.

The connection accepts only `rk_test_` and `rk_live_` restricted keys. A GET-only client with a
broad `sk_` key is still a write-authorised integration if that key leaks, so method discipline is
not enough. The connector exposes a connect-time probe for both Account and Balance Transactions.
The customer connection surface must complete that probe before calling the separate encrypted-
storage operation; that orchestration is deliberately not claimed by this PR.

Stripe payloads use an allow-list. A Balance Transaction is normally free of contact data, but its
`source` is expandable into a Charge carrying billing name, email, phone, address and metadata. The
policy keeps settlement arithmetic, clocks, categories and object ids, and drops descriptions and
customer fields.

Official references used for the implementation: [Balance Transactions](https://docs.stripe.com/api/balance_transactions),
[reporting categories](https://docs.stripe.com/reports/reporting-categories),
[currency minor units](https://docs.stripe.com/currencies), and
[restricted keys](https://docs.stripe.com/keys-best-practices).

## 2. Cost estimate

**Per connected account per month: approximately ฿0.40–฿2.00.**

This uses the same request and storage envelope as the WooCommerce client estimate: one to five
100-row pages per nightly incremental window for a typical SME, one redacted R2 object per page,
and one envelope row per payments-related Balance Transaction. Stripe charges no fee for these API
reads and cursor pagination adds no `limit + 1` request. At the financial model's ฿32.9/USD, the
existing Workers, R2 and Supabase rates keep that shape inside the Woo estimate's range.

The estimate is provisional until two design partners provide real transaction volume and redacted
payload sizes. It excludes ordinary Stripe processing fees: those are the customer's existing cost
being measured, not a cost created by this product.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — every call uses one merchant's own restricted key; no shared platform key.

**2. Vendor-key exception.** `N/A` — Stripe is not bought public data.

**3. No token pass-through.** `N/A` — this is direct REST, not MCP or OAuth brokerage.

**4. Credential hygiene.** `PASS` — the key is sealed by the existing per-row vault, absent from
URLs and logs, and broad secret or publishable keys are refused before persistence and fetch.

### Tenancy

**5. RLS.** `PASS` — Stripe uses existing workspace-bound connection and envelope tables; both
force RLS.

**6. No service-role bypass.** `PASS` — no service key is introduced; ingestion still writes only
through the narrow `app_ingest` function.

**7. No cross-workspace read.** `PASS` — the credential is cryptographically bound to its workspace
and connection id, and each row carries that connection's Stripe account id.

**8. No cross-customer aggregation or benchmarking.** `PASS` — the client reads one Stripe account
and the normaliser produces only that account's rows.

**9. API key scope.** `N/A` — this gate concerns this product's customer API keys, not upstream
Stripe credentials.

### Data movement

**10. No resale or redistribution.** `PASS` — settlement data enters only the owning workspace.

**11. Meta client list.** `N/A` — no Meta data or lifecycle changes.

**12. Dependency licences.** `PASS` — no dependency was added; the connector uses existing Web APIs.

### PII and consent

**13. Hash at the edge.** `PASS` — no person-level join is created, and expanded Charge contact
fields are dropped by the source allow-list before archive storage.

**14. Forbidden payloads rejected before egress.** `PASS` — Stripe is declared `redact`; it cannot
use the streaming archive path and an undeclared policy still fails closed.

**15. Per-destination consent.** `N/A` — there is no write to an audience or destination.

### Access tier and quota

**16. Tier reality.** `PASS` — pagination obeys Stripe's 100-item maximum, follows `has_more` with
`starting_after`, pins a half-open created window, and honours Retry-After through the shared client.

**17. No new long-lead dependency.** `PASS` — a merchant creates its restricted key in the Stripe
Dashboard; there is no app review in this key-paste path.

### Claims

**18. Claim provenance.** `PASS` — the guarded implemented-source mirror gains Stripe only with a
client and normaliser present. No after-fees surface capability is enabled by this PR.

**Result:** `12 PASS, 6 N/A, 0 FAIL`

## 4. What was deliberately left out

- Shopify. §11A.17 defers it; no Shopify vocabulary, credential, fixture or placeholder is added.
- Live scheduling and connection-surface orchestration. The connector exposes the probe, page loop,
  typed normaliser and encrypted-storage primitive, but the next surface PR must order the probe
  before persistence. No dedicated Supabase project exists and issue #9 still blocks first apply.
- A WooCommerce-to-Stripe object join. Stripe rows carry the related source id, but matching it to a
  Woo order is gateway-specific and must be learned from real partner payloads rather than guessed.
- Payout reconciliation and accounting exports. Treating payouts as revenue would double-count sales.
- Stripe Connect. This reads each merchant's own account with its own key; it is not a marketplace.

## 5. Open or unverified spec items this builds on

- The dedicated Supabase project is still absent and issue #9's JWT-GUC and pagination defects must
  be fixed before any migration is applied.
- Stripe account access for the first design partners is not yet in hand. The client is contract-
  tested against official response shapes; a live sandbox smoke test remains required before launch.
- Balance Transaction `available_on` is used as the row's settlement/finality clock. This must be
  diffed against a real account over time before it graduates to a customer promise.

## 6. Verification and mutation testing

Every repository gate is run by exit code before the PR is pushed, followed by GitHub Actions.

| Mutation taken from the committed diff | What must catch it |
|---|---|
| Accept `sk_` as well as `rk_` | connection and client least-privilege tests |
| Replace `amount - fee !== net` with equality | Stripe contract arithmetic test |
| Include `payout` in the revenue-category set | payout double-counting test |
| Divide JPY by 100 | zero-decimal currency test |
| Remove `created[lt]` from later pages | pinned-window pagination test |
| Return on `has_more` with an empty page | stalled-pagination test |
| Add `billing_details` and its contact children to the redaction keep-list | fixture PII redaction test |
| Remove Stripe from the guarded brand mirror | capability guard |
