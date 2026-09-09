# 24. The commerce grain, and the hole that opening it made

**PR:** #3 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decisions taken

Decision 11A.14 made the launch connector set WooCommerce, Shopify and a payments source, and every
one of them was blocked on the same thing: **the dictionary had no word for what they report.**
`ENTITY_TYPES` stopped at `ad`; `METRICS` carried a gross `revenue` and nothing that could express
what an owner actually keeps, which is 11A.2's entire promise.

This adds `order` to the grain and `orders`, `net_revenue`, `fees` and `commission` to the metrics,
**in the contract and the schema together** — which the dictionary guard requires, and which is what
having the guard is for.

**Numbered 24. `20-marketing-site.md` is still owed.**

Three decisions inside the change are judgements rather than transcription, and each is the reason a
line of the diff looks the way it does.

### 1.1 `orders` is not a conversion metric — and that opens a hole

`orders` is the shop's own count of orders placed, the way `sessions` is the property's own count of
sessions. Nothing is attributed, so an attribution window on it would be a label with nothing to
label. Making it `conversion: true` would force every WooCommerce row to name a window, and the
window enum deliberately has no member meaning "not attributed" — adding one would weaken the enum
that exists to prevent exactly that ambiguity.

**But `conversion: false` opens a hole the first refusal cannot see.** A marketplace ad platform
reporting *"orders from this campaign"* is reporting a conversion. It would arrive under a name
section 2's refusal does not cover, and the product's central guarantee would be lost to a synonym.

**So there is a second refusal**, in `envelopeRowSchema` and as a check constraint:

> A commerce metric on a `campaign`, `ad_group`, `ad`, `keyword` or `search_term` requires an
> `attribution_window`.

**It covers `revenue` as well**, which had the same hole open since the dictionary was written and
nobody had noticed, because no connector had yet been in a position to exploit it.

`account` is deliberately outside the rule. An account is an ad account on Google and a **shop** on
WooCommerce, so a day's orders at account grain is an honest unattributed count. `spend` is outside
it too, and for a sharper reason: spend is what the advertiser paid. It is never attributed and
never restated by a refund, so grouping it with commerce would be a category error dressed as
consistency.

### 1.2 `net_revenue` may be negative, and the missing check is the decision

Every other numeric column carries `>= 0`. `net_revenue` does not.

**A day whose refunds and chargebacks exceed its sales has a genuinely negative net.** A
non-negative check would reject a true row and leave a connector two choices, both lies: write a
floor of zero, or drop the day. `fees` and `commission` keep their checks, because a platform never
charges a negative fee — the asymmetry is the information.

This is the kind of omission that reads as an oversight in six months, so it is commented in the
migration, asserted in the database suite, and mutation-tested: adding the check back turns the
suite red.

### 1.3 The fx constraint had to be extended by hand, and nothing would have caught it

The contract finds currency metrics by **asking** `METRICS` which units are currency. SQL cannot ask
anything, so `envelope_rows_converted_needs_rate` writes the list out — and **the dictionary guard
compares names, not constraints.** A new currency metric added to the column list and forgotten in
the constraint would pass the guard, pass typecheck, pass every unit test, and quietly store a
converted amount with no rate to reproduce it.

The database suite asserts it instead, for `net_revenue` and `commission` separately.

## 2. Two things about the schema that are not obvious

**The migration was edited in place rather than added to.** No database has ever applied these
migrations — there is no Supabase project yet, and CI applies all eleven files to a scratch
PostgreSQL 16 on every run — so in-place editing is safe today and produces a schema a reader can
understand in one file instead of one file plus archaeology. **The boundary is explicit: the first
time a real project applies these, in-place editing stops.** An additive migration would also have
had to `drop function` before recreating `app.upsert_envelope_row`, because four new defaulted
parameters make an overload, not a replacement, and PostgreSQL would then face two candidate
functions for the old argument list.

**The guard's single-file assumption is now defended.** `check-dictionary.mjs` reads one migration
**by name**. The day a later migration alters an enum or adds a metric column, the guard would keep
comparing the old file, keep passing, and stop meaning anything — silently, which is the failure it
exists to prevent. It now fails loudly if any other migration touches the dictionary, and says what
to do about it. That is a small addition made because this change is the one that makes the
assumption load-bearing, not a general tidy-up.

## 3. Cost estimate

**Per connected account per month: no new infrastructure, no dependency, no platform call.**

The one real cost is disk, and it lands on the line section 7 names as most likely to break the
model:

- Four nullable `numeric(20, 6)` columns cost **nothing on existing ad rows** — they are null, the
  null bitmap already exists, and PostgreSQL stores no value.
- On a commerce row they cost roughly **8 to 12 bytes each**, so a WooCommerce order row is a few
  tens of bytes wider than a GA4 row.
- The volume question is not this change's: whether a connector writes one row per order or one row
  per day is the connector's decision, and the difference is three orders of magnitude for a busy
  shop. `order` grain makes both expressible; **nothing here commits to either.**

**What it saves is the point.** Slots 2, 3 and 4 of the launch set were each blocked on this. They
are now one connector unit apiece — `client + normalize + backfill + fixtures + contract.test` —
with no further dictionary work between them.

## 4. Platform-terms check

**1. BYOC.** `N/A` — no platform call, no credential path. The dictionary is source-agnostic.

**5. RLS.** `PASS` — no new table. `envelope_rows` keeps `workspace_id` in its primary key and its
policies are untouched; the database suite's 52 RLS assertions still pass unchanged.

**6. No service-role bypass.** `PASS` — the write path is still `app.upsert_envelope_row` under
`app_ingest`, `SECURITY DEFINER` with a pinned `search_path`. The four new parameters changed the
function's signature, so **the `revoke` and `grant` were updated to match**; a stale signature there
would have left the function granted to nobody or, worse, ungranted from `public`.

**8. No cross-customer aggregation.** `PASS`, and worth naming rather than ticking. `net_revenue` is
precisely the metric someone would want to benchmark — *"how do my margins compare?"* — which 11A.8
forbids absolutely. Nothing here aggregates, and the column existing makes the temptation nearer,
not the rule weaker.

**13. Hash at the edge.** `N/A` today, and **closer than it was.** This change creates the grain that
order data will land on; it does not yet carry any. `21` §9 and `22` §8 both record that `raw`
cannot be stored as returned for a commerce source, because an order carries buyer name, phone and
address. That work is still owed and is now the last thing between the dictionary and a connector.

**16. Tier reality.** `N/A` — no platform quota is touched.

**18. Claim provenance.** `PASS` — nothing user-visible. A metric existing is not a connector
existing, and neither may be claimed.

Gates 2–4, 7, 9–12, 14, 15, 17: `N/A` — no credential, no cross-workspace read, no egress, no
dependency, no consent object, no approval.

**Result:** `4 PASS, 14 N/A, 0 FAIL`

## 5. What was left out

- **`SOURCES` is untouched.** `woocommerce`, `shopify` and a gateway are not in the enum. A source
  entry is **per-connector** and belongs in that connector's PR, where its terms, quota and
  restatement behaviour are established at the same time. The commerce vocabulary is the part that
  is *shared* across all three, and that is what this change is.
- **`product`, `ticket`, `cover` and `room_night` were not added.** 11A.14 names `order`; the others
  belong to surfaces nothing is being built against yet. `18` §8.1 records the wider grain question
  and it stays open.
- **`refunds` and `discounts` were not added.** A refund is expressible today as a movement in
  `net_revenue`, which is what the restatement machinery is for. A separate column would be a
  second way to say the same thing.
- **No connector, no normaliser, no fixture.** The change is the vocabulary.
- **The three pre-existing `useImportType` lint warnings were left alone.** `biome check --write`
  fixes them and touches 31 unrelated files; CI runs `biome lint` and `biome format`, which pass
  with warnings, and reverting the unrelated churn was the smaller diff. It is a tidy-up, not part
  of this change.

## 6. Open or unverified items this builds on

- **11A.14 itself**, which is a decision rather than a validated bet. If the first design partners
  turn out to be walk-in venues rather than online sellers, slot 4 becomes POSPOS — and this
  vocabulary still fits, because a POS ticket is an order by another name.
- **Whether a connector writes per-order or per-day rows.** Undecided, and the cost difference is
  large. Both are expressible on purpose.
- **The PII redaction path for `raw`** (§4, gate 13). Still owed, and now the binding constraint.
- **The restatement webhook**, unchanged: it and the tiered backfill still gate any fifth connector,
  and commerce data is the reason that ordering is fortunate rather than inconvenient — a refund
  rewrites a closed month.

## 7. Verification

**Every load-bearing property was broken deliberately and the suite had to catch it.** Eleven
mutations, eleven caught.

| Mutation | Caught by |
|---|---|
| Delete the second refusal from the contract | contract suite |
| `COMMERCE_METRICS` gains `spend` | contract suite |
| `ADVERTISING_ENTITY_TYPES` gains `account` | contract suite |
| Drop `net_revenue` from `METRICS` | contract suite |
| Drop `'order'` from the SQL enum | dictionary guard |
| Swap two metric columns in the migration | dictionary guard (order matters: PostgreSQL sorts an enum by definition order) |
| A later migration alters the dictionary | dictionary guard — the new tripwire |
| Drop the second-refusal check constraint | database suite |
| fx constraint forgets the new currency metrics | database suite |
| Conflict clause forgets `net_revenue` | database suite — a restatement that silently does not restate |
| `net_revenue` gains a non-negative check | database suite — a refunded day is rejected |

**One process note, recorded because it cost real work.** The first mutation run reverted with
`git checkout -- packages scripts supabase` against an **uncommitted** tree and destroyed the change
it was testing, then reported five false survivors against the restored original. Every result above
was produced against a committed baseline. Mutation testing needs a commit to revert to; without
one the harness is indistinguishable from `git reset`.

**Repository gates.**

| | |
|---|---|
| Lint | pass — 3 warnings, the same three present on `main` |
| Format | pass |
| Brand guard | pass |
| Tokens guard | pass |
| Dictionary guard | pass — and this is the first change it has ever had to approve rather than ignore |
| Typecheck, build | pass |
| Unit tests | **333, up from 318** |
| Database suite | **118 assertions, up from 108** — 52 RLS, 20 scheduler, 46 envelope store |
