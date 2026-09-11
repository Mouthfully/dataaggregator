# 40. The FX source moves from Frankfurt to Bangkok

**PR:** unopened — the change is uncommitted on `main` &nbsp;·&nbsp; **Date:** 2026-09-11
&nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

`packages/fx/src/fx.ts` hardcoded `FX_SOURCE = "ecb_reference_rates"` and stamped it onto every
conversion it produced, so a Thailand-first product priced baht off a European central bank.
`HANDOVER.md` §7 item 2 names it; `30-thai-public-data-register.md` §4 calls it "a shipped defect"
and §6 records that fixing it is its own PR because `fx_source` is an envelope field.

**It is not internal bookkeeping.** `packages/brand/src/claims.ts` sells `fx-on-row` in these words:
*"Currencies converted at fetch time, with the rate, its source and its date on the row."* The
source is a published promise about where a customer's number came from, and the promise was
naming Frankfurt.

**The decision: the rate source travels on the DATA, not in the module.** `fx_source` is now read
from `table.source.id` — the table that supplied the rate names itself — and the old module
constant is gone from the conversion path. `FX_SOURCE` survives as a stable exported identifier
with a new value, because downstream code and the envelope contract read it.

The alternative considered and rejected was the small edit: change the string, keep the constant.
It fixes today's wrong answer and leaves the mechanism that produced it. A constant cannot be
wrong about which feed the rates in front of it came from — and that is exactly the problem,
because it also cannot be right. A row claiming one source while carrying another's rate is the
single failure the envelope exists to prevent, and a hardcoded stamp is how you build one.

### The three decisions inside that one

**There is no automatic fallback to ECB, and that is deliberate rather than unfinished.** The brief
for a fallback is that the row must record which source was actually used; the stronger version is
a design where a mislabelled row is not writable. `convert` reads the id off the table it was
handed, so swapping the table swaps the label *with* the number, together, and there is no code
path where a missing Thai banking day quietly becomes a Frankfurt rate wearing a Bangkok label.
ECB stays in the tree as a second registered source — free, keyless, thirty currencies, useful to
anyone who needs a rate before BOT registration completes — but a caller that wants it must fetch
it, and then the row says so.

**`FX_SOURCE` is now `bot_daily_avg_exchange_rate`, and it names the series, not the institution.**
BOT publishes at least two exchange-rate products, and they are different numbers: the
weighted-average interbank rate (THB/USD only) and the commercial-bank average across currencies.
A product pricing Shopee in SGD and Meta in USD needs the second. `bot` alone would leave a
customer unable to reproduce the conversion, which is the entire point of the field.

**Now is the moment this costs nothing.** The Supabase project holds zero rows (`37` §2: "the
schema holds no rows"), no connector imports `@repo/fx` — grep the tree, there are no importers —
and every normaliser currently writes `fx_source: null`. So **not one row anywhere carries
`"ecb_reference_rates"`**, and changing a contract-visible field is a rename in one package. Every
day this waits it gets more expensive, and after the first real customer row it is a migration.

### The storage convention, which is the part worth arguing about

Sources disagree on direction. BOT publishes baht per one unit of foreign currency; ECB publishes
units of foreign currency per one euro. Two directions in one codebase means two paths through the
cross-rate arithmetic, and a cross-rate bug is small enough to survive review and large enough to
break a reconciliation. So there is one internal convention and adapters normalise into it — which
means exactly one source takes a reciprocal.

The convention chosen is **the price of one unit of the currency, in the table's base** — BOT's own
direction. Under it, converting into the base divides by exactly 1.0, so the `fx_rate` written to
the row is BOT's published figure bit-for-bit and an auditor comparing the row against BOT's table
sees the same number rather than the same number plus an ulp. ECB takes the reciprocal instead, and
the cost is measured rather than asserted: over every four-decimal rate from 0.0001 to 200, 237,251
of 2,000,000 values do not round-trip exactly and the worst relative error is **1.57e-16** — one
ulp, eleven orders of magnitude below the precision ECB publishes at. The primary source is exact;
the fallback eats the rounding.

### What a missing rate does

BOT publishes on Thai banking days, and there is a publication lag. The carry-forward rule is
unchanged from the ECB implementation because it was right: carry the most recent published rate
**forward**, never interpolate, never reach backwards from a later date, and put the **real**
publication date on the row, so a Sunday row honestly says it used Friday's rate. Both legs of a
cross-rate resolve to one published day before either rate is looked up, so a pair can never be
assembled from two moments.

**What was missing is a ceiling, and this diff adds one.** `dayFor` walked back to the first day at
or before the requested date however old it was, so a feed that had been broken for six weeks kept
converting — silently, with a truthful but unread `fx_rate_date` six weeks stale. Carrying Friday's
rate to Sunday is disclosure; carrying August's rate into October is a wrong number with an alibi.

`MAX_CARRY_FORWARD_DAYS = 10`, and the arithmetic is Thai rather than generic. The longest run of
consecutive Thai non-banking days is the Songkran cluster — 13 to 15 April, plus the weekend it
straddles, plus substitution days when one falls at a weekend — which reaches about five. Add the
publication lag and a weekend on the far side and a legitimate gap can touch seven. Ten clears
every real closure with margin. Past ten the explanation is never a holiday; it is a feed that
stopped, a key that expired, or a job failing unnoticed, and that must surface as a refusal
(`FxError` code `stale_rate`). Tested at the bound, one day past it, and at six weeks.

The one path that never consults the table is a currency converted into itself. One baht is one
baht through Songkran, and refusing a THB row in a THB workspace because the banks were shut would
be absurd. Tested.

### Two traps found while writing the client

**`Number("")` is 0, not NaN.** BOT returns rates as strings. If a non-banking day comes back as a
row with an empty rate — which is one of the two plausible shapes and is not verified here — a
`Number.isFinite` check passes it and stores a rate of **zero**, which converts every amount to
nothing on one leg and divides by zero on the other. The `> 0` test is what catches it.

**A currency quoted per 100 read as per 1 is wrong by 100×.** BOT's published table quotes yen per
100 yen. The parser reads the unit out of the currency's own name — `"JAPAN : YEN (100)"` — rather
than from a table of assumptions, and a currency on `BOT_UNIT_QUOTED` that arrives *without* a
declared unit is **refused, not guessed**. The asymmetry is the whole argument: being wrong about a
member of that list costs coverage of one currency; being wrong the other way costs correctness of
every row carrying it.

## 2. Cost estimate

**Per connected account per month:** `฿0.00`, and it stays ฿0.00 when this is wired.

**In this diff:** nothing. No platform read, no scheduled invocation, no Worker request, no R2
object, no KV write, no bought data, no dependency, no migration, no Supabase disk. `@repo/fx` has
no importers in the tree, so no code path executes any of it yet.

**When it is wired**, the figure is still ฿0.00 per connected account, and the reason is the one
property that makes public data different: **the cost does not scale with tenants.** One FX rate
for one date serves every workspace, so the fetch happens once for the system, not once per
account:

| Term | Steady state | Month | Source |
|---|---|---|---|
| BOT requests | 1/day | ~31 | one series call covers every currency for the day |
| Workers invocations | 1/day scheduled | ~31 | against a 100,000/day free allowance |
| KV writes | ~10 rate rows/day | ~300 | `30` §5 books exactly this line at ~300/month |
| KV write cost | — | **$0.0015** | 300 writes at $5.00/million |
| R2 objects | 0 | 0 | FX rates are not envelope payloads |
| Supabase disk | 0 | 0 | rates live in KV, not in `envelope_rows` |

$0.0015 a month, about ฿0.05, for the entire system — against the ฿2,006–8,224/month the model
already books for R2, KV, domain and DNS. Divided across any number of connected accounts it is
zero to every digit that has ever been printed.

**A five-year backfill is 1,826 days.** The API caps a request at a month, so `botDateRanges` splits
it into **61 requests, once, ever, shared by every tenant** — not 61 per account. That is the number
worth writing down, because a per-account reading of it would look like a cost line and is not one.

**Nothing here touches the polling ratio §8 flags.** FX is not a platform read and does not enter
the 3×–5× redundant-polling risk that the ~98% margin depends on.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no code path here touches Google, Meta, GA4, Search Console, TikTok or an
affiliate network. BOT is not a platform under §11.2; public-agency data is not tenant data and
carries no per-workspace credential.

**2. Vendor-key exception.** `PASS`, and this is the gate that governs the change. BOT is **public
data**, the one permitted single-key surface (11.2), the same shape as a company-held DataForSEO
key — settled in `30` §3 gate 2. No platform data is involved, so the exception applies cleanly
rather than by argument.

**3. No token pass-through.** `N/A` — no MCP or OAuth surface is touched.

**4. Credential hygiene.** `PASS` — no credential is added, and the module is built so one cannot
leak into it: `BotApiConfig` has **no default endpoint, no default header name and no default key**,
so there is nothing to commit by accident. The test fixture's key literal is `SYNTHETIC-NOT-A-KEY`.
When registration happens the key belongs in the connection vault like any other.

### Tenancy

**5. RLS.** `N/A` — no table, no migration, no column.

**6. No service-role bypass.** `N/A` — no request path exists in this diff.

**7. No cross-workspace read.** `PASS`, and it needs stating rather than marking N/A. An FX rate
for a date is not tenant-scoped by nature and the same row legitimately serves every workspace —
`30` §3 gate 7 and §5 record this as the one dataset that may be cached globally. Nothing in this
diff caches or joins anything. **The boundary to hold when it is wired: public-data rows may be
shared; any join that combines them with tenant rows is workspace-scoped.**

**8. No cross-customer aggregation or benchmarking.** `PASS` — a conversion is per-row arithmetic
over one workspace's own figure. No percentile, median, peer comparison or training input.

**9. API key scope.** `N/A` — no tenant API-key path changes. The BOT key is a company key to
public data under gate 2, not a workspace credential.

### Data movement

**10. No resale or redistribution.** `PASS` — nothing moves and no billing unit changes. Noted for
adoption: **BOT's own terms of use are ours to respect and have not been read** — see §4.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path.

**12. Dependency licences.** `PASS` — no dependency added. `packages/fx` still declares only
`typescript` and `vitest`; the BOT parser is hand-rolled guards specifically so that reading one
JSON shape does not add a schema library to the served path.

### PII and consent

**13. Hash at the edge.** `PASS` — an exchange rate carries no email, phone, name or address, and
no fixture in this diff contains contact data of any kind.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress.

**15. Per-destination consent.** `N/A` — writes remain deferred (11.4).

### Access tier and quota

**16. Tier reality.** `PASS` for what is known, with the unknown named. The one documented limit —
"API must get data less than 31 days per request" — is handled by `botDateRanges` rather than
discovered in production, and `BOT_MAX_RANGE_DAYS = 30` reads it conservatively because whether the
bound is inclusive is not stated. **The per-key rate limit is unknown**; at one request a day in
steady state and 61 for a five-year backfill, no plausible limit is approachable.

**17. No new long-lead dependency.** `PASS`, with the gate named. BOT requires **registration**, and
`30` §3 gate 17 establishes that this is a registration rather than an approval queue — no review,
nothing resembling Meta Full Access or a TikTok audit. **The degraded path that ships without it is
this entire diff**: it is pure code with no fetch wired, and ECB remains a working keyless source
for anyone who needs a rate before the key arrives.

### Claims

**18. Claim provenance.** `PASS`, and this gate is what the PR is for. `fx-on-row` promises the
source on the row; the source it was naming was wrong for the market. **No claim text changes** —
the sentence was always true of the field and is now true of the right source.

Deliberately **not** added: any claim naming the Bank of Thailand. `30` §3 gate 18 is explicit that
naming a government source on the marketing site is a claim requiring a citation, and it would be a
claim about a source no connector reads yet — precisely the defect issue
[#6](https://github.com/Mouthfully/dataaggregator/issues/6) inventories.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

- **Wiring it.** No connector reads `@repo/fx` today and none does after this diff. The scheduled
  fetch, the KV cache and the normaliser call are the connector's PR; this one is the defect fix
  named in `HANDOVER.md` §7 item 2 and nothing else.
- **The `ecb_reference_rates` literals still in the tree**, in `packages/contract/src/envelope.test.ts`
  and `supabase/tests/03_envelope_store.sql`. Both are sample data in files owned by other scopes,
  and neither asserts anything about which source the product uses. Deferred, named here so the
  next reader does not think the rename was missed.
- **BOT's terms of use.** `30` §6 records that no terms were read for any source in the register and
  this note does not perform one. `30` §7's standing rule applies: an endpoint that returns 200 is
  not a licence to use what it returns.
- **An endpoint, a header name and a key.** See §5. Shipping a guessed URL that looks confirmed is
  worse than shipping none.
- **The buying and selling rates.** Only `mid_rate` is stored. The Revenue Department's rules
  distinguish buying and selling rates by the direction of the transaction — **unverified here** —
  which is a question for whoever builds a tax surface, and is a reason the *rate* rides on the row
  and not only the source: a customer who must use a different leg can see what we used and redo it.
- **The weighted-average interbank series** (`/Stat-ReferenceRate/v2`). USD only; the multi-currency
  product is what a marketplace P&L needs. Worth revisiting if a customer's auditor asks for it
  specifically.
- **Open Exchange Rates**, still unbuilt. `00-recon-reports.md` prices it at $12/month and the
  coverage gap it would close is unchanged by this diff.
- **A Thai financial-institution holiday calendar.** `30` Tier C records that BOT publishes these as
  announcements, not an API, and that they differ from public holidays. The staleness ceiling is a
  bound, not a calendar: it knows ten days is too many and does not know that a given Tuesday was
  Songkran. A calendar would let the refusal be tighter; it is a hand-maintained table and its own
  change.
- **Any claim naming BOT on the marketing site.** Gate 18 above.

## 5. Open or unverified spec items this builds on

**The honest headline: no live call was made, and five things are consequently unverified.**
`portal.api.bot.or.th` requires registration and there is no API key in this repository. The
alternative — inventing an endpoint and a fixture of plausible baht rates — would produce a module
that reads as verified and is not, in a repository whose entire premise is numbers you can trust.

| # | Unverified | What is actually known |
|---|---|---|
| 1 | **The request URL** — gateway host and full path | The official portal lists the listen paths `/Stat-ExchangeRate/v2` (Average Exchange Rate — THB / Foreign Currency) and `/Stat-ReferenceRate/v2` (Weighted-average Interbank — THB / USD), and states in its own words that "there are currently no API Products documentation available" publicly |
| 2 | **The auth header name** | Third-party clients show v1 using an `api-key` header against `iapi.bot.or.th`. v1 is the service BOT scheduled for discontinuation on 31 December 2025, and **both v1 hosts are gone** — see the DNS check below |
| 3 | **The v2 response shape** | The parser targets the documented v1 shape — `result.data.data_detail[]` with `period`, `currency_id`, `currency_name_eng`, `buying_sight`, `buying_transfer`, `selling`, `mid_rate`, rates as **strings** — taken from third-party clients, not from BOT |
| 4 | **The currency catalogue** | Not asserted. `BOT_SOURCE.catalogue` is `null` rather than a list, because a list typed from memory is a fabricated coverage guarantee. `required` carries the defensible floor instead: `["USD"]` |
| 5 | **What a non-banking day returns** | Either an absent row or a row with an empty rate string. The parser survives both; the `Number("")` guard is there for the second |

**The one thing that WAS verified is a negative, and it is the reason there is no default
endpoint.** DNS, run from this session:

```
apiportal.bot.or.th  -> ENOTFOUND
iapi.bot.or.th       -> ENOTFOUND
portal.api.bot.or.th -> 23.215.9.150
www.bot.or.th        -> 23.215.9.153
```

Both hosts that appear in every surviving third-party example are **dead**, which is `30` §4's "one
live gotcha" confirmed and extended: the discontinuation took `iapi` with it. Any endpoint this
module could have defaulted to would have been a URL that does not answer, shipped with the
authority of a committed constant. Hence `BotApiConfig` requires the endpoint.

**One live call settles all five**, and it is the smallest possible one: a single request for a
three-day range including a weekend, with a registered key. It returns the working URL and header
(1, 2), the v2 field names and types (3), the full list of `currency_id` values on one day (4), the
shape of the non-banking rows (5) — and, as a bonus, whether `currency_name_eng` carries the
`(100)` that `BOT_UNIT_QUOTED` exists to insist on for JPY.

**Until that call happens, the code is written so being wrong is loud rather than quiet.** A shape
that is not the documented one parses to an **empty** table, not a partial one, and `validateTable`
refuses an empty or USD-less table at ingest before it can reach the store.

Also standing:

- **BOT registration is not held.** `30` §4 records that one registration also carries tourism
  indicators (`EC_EI_028_S2`) and payment statistics, so the key is worth more than this module.
- **The Revenue Department's buying/selling direction rule** is named in §4 and unverified. Reporting
  a P&L is not filing a return; if that distinction ever becomes a product surface it needs its own
  research.
- **`30` §5's sequencing trap does not apply here.** It says not to adopt a public-data source before
  the routing classifier exists, because context costs money and converts nothing. That argument is
  about attaching context to LLM prompts. This is a correctness fix to a field the envelope already
  carries, and it does not put a token in any prompt.
- **§11.3 metering is untouched.** Performance reads still report `credits_used: 0`.

## 6. Verification

Everything below was run; the numbers are copied from the output.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | **pass** — 5 warnings, 2 infos, **zero in `packages/fx`**. `pnpm exec biome lint packages/fx` alone: "Checked 9 files. No fixes applied.", no findings. Every warning is pre-existing and in another scope: `build-pdf.mjs`, two ga4 tests, `oauth/flow.test.ts`, `check-dictionary.mjs`, `check-claim-sources.mjs` |
| `pnpm exec biome format --write <own files>` | **pass** — first run "Formatted 7 files in 13ms. Fixed 2 files."; final run "Formatted 7 files. No fixes applied." Only `packages/fx/src/*.ts` was passed to it. No repo-wide formatter and no `pnpm -r` write command was run at any point |
| `pnpm -r typecheck` | **`packages/fx` Done**, along with `brand`, `connections`, `connectors`, `contract`, `extract`, `oauth`, `payloads`, `store`, `tokens`, `vault`, `webhooks`, `web`. One failure outside this scope — see below |
| `pnpm --filter @repo/fx test` | **pass — 54 tests in 3 files, up from 22** |
| DNS for the four BOT hosts | **`apiportal.bot.or.th` and `iapi.bot.or.th` do not resolve**; `portal.api.bot.or.th` (23.215.9.150) and `www.bot.or.th` (23.215.9.153) do |
| `node scripts/check-brand.mjs` | pass — 8 identity strings checked against the allowlist |
| `node scripts/check-tokens.mjs` | pass — 164 files scanned |
| `node scripts/check-dictionary.mjs` | pass — contract and schema agree |
| `node scripts/check-capabilities.mjs` | passed on this change, **and fails now for a reason in another scope** — see below |

### What failed, and why none of it is this change

**The checkout moved underneath this work.** Two other workflows are editing
`packages/store/**`, `apps/api-edge/**` and `supabase/**` in the same tree concurrently, and the
file count biome sees went from 133 to 138 between the first verification pass and the last. Both
failures below are theirs, and neither can be reached from this diff: **`@repo/fx` has no importers
anywhere in the tree** — grepped, and the answer was "no importers" — so nothing in
`packages/fx/**` is on any other package's compile or test path.

**1. `apps/api-edge` typecheck.**

```
apps/api-edge typecheck: test/store.test.ts(132,17): error TS18048: 'call.headers.authorization' is possibly 'undefined'.
apps/api-edge typecheck: test/store.test.ts(181,19): error TS2532: Object is possibly 'undefined'.
apps/api-edge typecheck: test/store.test.ts(207,12): error TS18048: 'call.headers.authorization' is possibly 'undefined'.
```

`noUncheckedIndexedAccess` findings in an api-edge test file, mid-edit. An earlier pass in this same
session showed a *different* failure in that scope — `packages/store` reporting
`TS2307: Cannot find module '@repo/contract'` with pnpm's own warning *"Local package.json exists,
but node_modules missing"* — which has since been resolved by whoever owns it. `packages/store` now
reports Done. The scope is moving; it is not this scope.

**2. `check-capabilities.mjs`.**

```
packages/brand/src/claims.ts:1:1  implemented source "search_console" is absent from the
                                  connector-claim source list
```

`packages/connectors/src/sources/search_console/` now exists with both `client.ts` and
`normalize.ts`, and `IMPLEMENTED_SOURCE_IDS` in `packages/brand/src/claims.ts` still reads
`["ga4", "woocommerce"]`. That is the guard **working exactly as designed** — `35-capability-gated-claims.md`'s
whole point is that "stale marketing copy cannot survive a connector change" — catching a
half-landed connector in another workflow's scope. All four guards passed on this change before
that connector appeared. **Not fixed here:** `packages/brand/**` and `packages/connectors/**` are
not this scope, and editing the claims mirror would collide with the workflow that owns the
connector.

### Mutations

Each mutation was applied to the working tree, the suite was run, and the file was restored from a
byte-identical backup (`diff -q` clean afterwards, suite back to 54 passed).

| # | Mutation | Caught by | Observed |
|---|---|---|---|
| 1 | Re-hardcode the stamp: `fxSource: source.id` → `fxSource: "bot_daily_avg_exchange_rate"` | "reads the source id off the table that supplied the rate"; "cannot produce a row claiming one source while holding another's rate" | 2 failed — `expected 'bot_daily_avg_exchange_rate' to be 'ecb_reference_rates'` **twice**. This is the original defect, and it is now a red build |
| 2 | Remove the staleness ceiling: `carried === null \|\| carried > maxCarry` → `carried === null` | "refuses one day past it"; "refuses a six-week-old rate outright" | 2 failed — `expected undefined to be 'stale_rate'`, `expected [Function] to throw an error` |
| 3 | Accept `Number("")`: drop `&& rate > 0` from `readRate` | "drops a holiday row whose rate is an empty string rather than storing zero" | 1 failed — `expected [ { date: '2026-09-07', …(1) }, …(1) ] to have a length of 1 but got 2`. The empty-rate row became a day with a **zero** rate |
| 4 | Guess the missing unit: delete the `BOT_UNIT_QUOTED` refusal | "refuses a suspected per-100 currency that arrives without its unit" | 1 failed — `expected 700 to be undefined`. That is the 100× error, caught at the parser |
| 5 | Drop the ECB inversion: `rates[currency] = 1 / value` → `= value` | 3 tests in `ecb.test.ts` | 3 failed — `expected 1.1 to be 0.9090909090909091`, and the round-trip off by 0.19 |
| 6 | Resolve a contradictory duplicate quote by arrival order instead of dropping both | "drops both quotes when one day carries two different rates for one currency" | 1 failed — `expected 11 to be undefined` |

**One mutation was NOT caught on the first attempt, and it changed the code.** Dropping `&& rate > 0`
from `readRate` initially left all 54 tests green, because a second guard downstream
(`if (!Number.isFinite(price) || price <= 0) continue;`) caught the zero. That guard was
**unreachable** given the first one — `readRate` refuses anything not above zero and `quotedUnit`
refuses any unit that is not, so a positive rate stays positive through the division. A redundant
guard no mutation can reach makes a suite look stronger than it is, so it was removed and replaced
with a comment saying why nothing stands there. Mutation 3 above is the re-run against the single
decision point, and it fails as it should.

**Not covered by any of this, and worth saying plainly:** every test above runs against synthetic
fixtures. They prove the parser, the arithmetic, the carry-forward rule and the refusals are what
this note says they are. **They prove nothing about whether BOT's response looks like the shape
being parsed.** That is §5's job, and it needs one call.
