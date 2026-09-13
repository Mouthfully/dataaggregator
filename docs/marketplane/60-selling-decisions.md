# 60. Selling a decision instead of a dashboard, and the ledger of what that claims

**PR:** #41 &nbsp;·&nbsp; **Date:** 2026-09-13 &nbsp;·&nbsp; **Status:** proposed

<!-- Issue #49 sections 1-4. The engine half of #49 is note 59. -->

---

## 1. What this is, and the decision taken

The homepage sold a dashboard. The founder's plan sells being told what to do about one. This is
that repositioning, plus the claims ledger issue #49 requires in place of silently absorbing it.

| | Before | Now |
|---|---|---|
| Eyebrow | "Your data, made plain" | "Business intelligence for small business" |
| Hero | "All your data. / One clear view." | "Your whole business on one page. / Every morning." |
| Hero visual | `$186.2K`, `8,241`, `ROAS 5.42×`, Jun 1–Jun 30 | a café day in baht: takings, orders, delivery share, an 08:00–21:00 axis, labelled a sample |
| Audience | named nowhere | cafés, bars and restaurants; hotels and guesthouses; online sellers; clinics and salons; accountants |
| The centre | — | a new **action sheet** section, rendered third |
| Capabilities | one grid duplicating the panel beside it | morning brief, action sheet, Ask, consolidated reports |

**The decision, and the alternative rejected.** The obvious way to do this was to rewrite the hero
and stop. It was rejected because the page argues a position in twelve sections and a hero that
disagrees with the eleven below it does not reposition anything — the FAQ in particular is where a
deleted claim comes back, and `FaqCta.tsx` already carried a comment about an answer that restated
three claims `/pricing` had just dropped, one section below the block that dropped them. So every
section that made the "you can see your data" promise was re-aimed, and `Pricing` and the
integration lists — which make no such promise — were left alone.

**Three specific calls worth recording:**

**`FeatureGrid` was given a new job rather than deleted.** It rendered the eyebrow, heading and
lead of `AssistantPanel` **byte for byte**; `58-plan-reconciliation.md` §5.1 lists that duplication
as copy that must stop. The grid took the four capabilities and the panel took the engine.

**`Templates` was replaced by `Reports`, not deleted.** §5.1 says the plan's owner "does not build
reports from templates; the product decides for them". But capability four — the monthly investor
update, the P&L by unit and channel, the bank loan pack, the accountant export — needed a home, and
the section's panel, bars and geometry already fit it. Same design, different argument.

**The audience cards lost their connector logos.** `UseCases` showed three real platform marks per
card. Five trades × three marks would have been fifteen new source promises, and §5.1 bans every
Thai POS, delivery platform and bank from appearing as a source on this site until one is both
built and reachable. Each card now names which metrics lead for that trade instead.

### The hero is specific and is not proof

§5.3 refuses a named Chiang Mai café as proof **at any price**: there are no customers, the
artboard's owner quotes are recorded as unapproved drafts, and its figures (฿97,400, 38 covers,
฿41,200 attributed to actions taken) are invented. Issue #49 asks for specificity in the same
breath, and the resolution is the artboard's own — it labels "Sample figures" in three separate
places.

So the hero panel carries a trade and a city, three separate sample marks (`heroVisualLabel`, a
`Sample` chip where the reference drew a "JD" user avatar, and "sample" as the first word of the
chart's accessible name) and **no business name, no owner, no quote, no "trusted by" and no
testimonial section**. `page.test.tsx` asserts the label renders and that the words "trusted by"
and "testimonial" do not.

### The assistant panel is fed, not redrawn

Issue #49 requires `AssistantPanel.tsx` to stay as drawn — same gradient panel, same card, same
tick list. It does: same JSX, same `{ title, detail }` row shape, only the copy constants moved.

What changed underneath is that **its numbers are now computed by `@repo/insights` at build time**,
from illustrative rows committed in `_sample-brief.ts`. The panel's heading is "It writes the
sentence. Never the number." Typing three illustrative figures into the card under that sentence
would be a claim about arithmetic with no arithmetic behind it, which is the thing the section
argues the product does not do. So `buildFigureSet` — the function that will compute a real
customer's figures — computes these, and the card prints its renderings verbatim.

That is what caught the panel's first draft. It read **"Worth about ฿3,100 a month, give or take
฿500"** — a plus-or-minus band. The engine does not produce one and will not: an error bar is a
constant somebody chose, and `figures.ts` has none. Its range is the settled rows at one end and
every row at the other. The card now shows `THB 1,500.00 to THB 2,000.00`, which is the shape the
code actually returns.

**And wiring the engine to a surface found a real gap in the engine.** A delta figure printed its
magnitude and not its direction, so the prompt was telling the model that revenue changed by THB
1,800.00 without telling it which way — asking for a guess, and a guessed direction is exactly as
wrong as a guessed amount. `figures.ts` now prints "up THB 1,800.00" / "down THB 1,800.00" / "no
change, THB 0.00", the verifier still compares magnitudes, and the direction is a word the model
copies like any other.

## 2. Cost estimate

**Per connected account per month:** `unchanged — no data-plane work`

Marketing copy and one build-time computation. `_sample-brief.ts` calls `buildFigureSet` over nine
committed rows while `next build` runs: no network, no database, no API key, nothing at request
time. The homepage is still statically prerendered — the production build reports `○ /` — so the
per-visitor cost is unchanged.

One cost is *removed*: `Templates.tsx` is gone, and with it 190 lines.

## 3. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no platform call. **2. Vendor-key exception.** `N/A`. **3. No token
pass-through.** `N/A`. **4. Credential hygiene.** `N/A` — no credential in the diff.

### Tenancy

**5. RLS.** `N/A` — no table. **6. No service-role bypass.** `N/A`. **7. No cross-workspace read.**
`N/A` — nothing is read; the sample rows are literals in a source file. **8. No cross-customer
aggregation or benchmarking.** `PASS` — no benchmark, percentile or peer comparison is claimed
anywhere in the new copy, and the audience cards deliberately describe a single business.

### Data movement

**10. No resale or redistribution.** `N/A`. **11. Meta client list.** `N/A`. **12. Dependency
licences.** `PASS` — `@repo/insights` is a workspace package; no third-party dependency added.

### PII and consent

**13. Hash at the edge.** `PASS` — no personal data anywhere. The sample rows carry no buyer field;
`InsightRow` has none to carry. **14. Forbidden payloads.** `N/A`. **15. Per-destination consent.**
`N/A`.

### Access tier and quota

**16. Tier reality.** `N/A`. **17. No new long-lead dependency.** `PASS` — the copy names no
platform whose approval is not held. Loyverse, FoodStory, GrabFood, LINE MAN, Booking.com, K PLUS
and SCB appear nowhere on the site.

### Claims

**18. Claim provenance.** **`FAIL`, deliberately and in full, and §6 is the ledger.** The homepage's
copy has not come from `claims.ts` since the founder-supplied page set replaced it — `page.test.tsx`
records that in its own header — so "does every user-visible claim come from the brand file's
allowed-claims list" is already no for this page and was before this PR. What this PR adds is a
large number of claims about capabilities that do not exist. The founder's standing instruction is
to write the copy and record every unbacked claim rather than silently absorb it. §6 is that record.

**What this PR did NOT do, and it is the one line of gate 18 that is now enforced by a test rather
than by care:** it does not restate a *withheld* claim as section copy. See §5.

**Result:** `5 PASS, 12 N/A, 1 FAIL (gate 18, recorded in §6)`

## 4. What was left out

**`surface:answer` is not flipped.** Note 59 §4 gives the reasoning in full: the engine is real,
nothing delivers an answer to a customer, and the claim the capability gates says we sell the
answer.

**Four things I could not fix from `apps/web/app/`, each named rather than quietly left:**

| Thing | Why it is still wrong | What was done instead |
|---|---|---|
| `client-dashboard.png` | a dollar dashboard, and it is a binary asset | a visible "Product concept. Sample figures, not a customer." caption beside it |
| `/pricing` quotes USD | §4.8 records the THB ladder as an unsettled founder decision where two files disagree by 2.3× | left alone; changing it would settle a decision by editing copy |
| `IntegrationsStrip` / `IntegrationsMap` show thirteen and eight marks for five implemented connectors | outside this change's argument, and a real fix is a connector question | reported here |
| `/dashboard` renders "Northstar Studio", "Everyday Mug" and USD figures | another agent's territory this session | reported here |

**No AI-answer visibility section.** The plan has one. `FORBIDDEN_CLAIMS` bans the competitor
vocabulary, and §5.1 separately notes the pattern's `\b` fails on "rivals" — so the guard would
have let the plan's own "versus rivals" framing through. Writing the section would have meant
widening the ban first. Not this PR.

**No owner quotes.** The artboard has three. All three are recorded as unapproved drafts and §5.3
calls a proof section built from them "the fastest available failure of the one rule this whole
project is organised around".

## 5. Two new guards, and the hole they close

### `withheld-claims.test.tsx`

Issue #49 names the hole precisely: `surface:answer` is absent from `AVAILABLE_CAPABILITIES`, "so
the guard correctly withholds *claims* — but hand-written section copy is not a claim and renders
anyway." A withheld claim rewritten as prose renders exactly like an approved one and republishes a
promise the repository deliberately switched off.

The test takes every claim `withheldClaims()` reports, extracts its five-word runs, drops any run
that also occurs in a claim that IS allowed to render, and asserts none of the rest appears in the
rendered page. Five words because that is the length of the shortest approved claim, which is the
same floor `check-copy.mjs` measured against the same corpus.

**It caught a live one on its first run.** The Ask card read *"Causes ranked by how much of the
change they explain, what was ruled out, and where each figure came from"* — the `diagnose` claim,
which is withheld behind `surface:diagnose`, on the five-word run `what was ruled out and`. The
card now promises the question and the provenance (`fetched_at` is a real envelope column that
`/dashboard` renders) and not the ranked causes, which are still switched off.

It does not catch a paraphrase sharing no five-word run with its source. It is a tripwire on the
cheapest and commonest route around the gate — somebody reading a withheld claim and typing it into
a section — and it fails in the under-firing direction, which is the only direction a heuristic
guard may fail in if it is to stay switched on.

### `sample-brief.test.tsx`

Every numeric token the assistant panel renders must be one `allowedNumbers()` licensed for the
sample rows. It is `verify.ts`'s rule applied to our own marketing copy, and it fails for the same
reason: a number on that page the arithmetic did not produce is the thing the section says the
product does not do. Decorative elements are stripped first, because the card draws its list
positions as visible `aria-hidden` numerals and those are not figures.

### Mutation-proven

| Mutation | Result |
|---|---|
| type "up 41,200 on the week" into a card row | `sample-brief.test=1`, naming `41,200` |
| re-introduce "give or take" in the range caption | `sample-brief.test=1` |
| restate the withheld `diagnose` claim as the Ask card's body | `withheld-claims.test=1`, naming `diagnose` |

All three reverted; the suite is green.

## 6. GATE 18: every claim written ahead of its capability

The ledger issue #49 requires. Grouped by what is missing, because that is what determines when
each line can be deleted or backed.

### 6.1 The schedule — the largest single unbacked thing on the page

**Nothing in this repository runs on a timer.** `apps/api-edge/src/index.ts:358` passes
`store: null` (verified in this session), so both declared crons return `not_configured`, and
`app.due_connections` / `claim_connection` / `record_backfill` have no TypeScript caller on a
request path. A product whose promise is "every morning" has no morning.

Every one of these asserts a cadence:

| Where | What it says |
|---|---|
| `SITE.heroLine2` | "Every morning." |
| `SITE.heroLead` | "Wake up to yesterday in three lines…" |
| `SITE.footerTagline` | "Yesterday in three lines. One thing to do today." |
| `HERO.synced` | "Read at 06:40. Still provisional." |
| `ActionSheet` LEAD | "Each Monday you get a short list… Next Monday it checks whether each one worked" |
| `FeatureGrid` LEAD | "…at breakfast, a ranked list on Monday… on the first" |
| `DashboardFeature` | "The page you open once a day." |
| `Reports` | "…would write. On the 1st." |
| `FinalCta` | "Connect tonight. Decide at breakfast." |
| FAQ | "What does \<product\> send me each morning?" |

**What backs it today:** nothing. **What would:** the scheduler identity of note 58 §2.3 — this is
step one of everything, and until it lands every line above is a promise about a clock that does
not tick.

### 6.2 The three capabilities that do not exist

Verified, not assumed: there is no brief generator, no action sheet and no Ask surface in `apps/`.

| Where | What it says | What backs it |
|---|---|---|
| `FeatureGrid` brief card | "Yesterday in three lines, anything unusual, and one thing worth doing today. Reply to ask a follow-up, in Thai or English." | `packages/insights` can generate exactly this brief; nothing delivers it. **Nothing in the repository is localised to Thai** and no channel adapter exists |
| `FeatureGrid` action card | "A short weekly list, ordered by what each item is worth. The following week it checks whether each one worked." | the ranking and the worth are real (`rankActions`, `Estimate`). **The following-week check does not exist anywhere** |
| `FeatureGrid` Ask card | "Ask a question the way you would ask a business partner. Every figure in the answer says which source it came from and when it was read." | the provenance half is real — `fetched_at` and `source` are envelope columns `/dashboard` renders. **The asking half does not exist**, and the reworded card no longer claims the ranked causes that `surface:diagnose` withholds |
| `FeatureGrid` reports card | the investor update, the P&L by unit and channel, the bank loan pack, the accountant export | none of the four exists. See 6.3 for why two of them cannot yet exist |
| `ActionSheet` heading, lead, card, `FOLLOW_UP` | the whole section | the arithmetic is real; the weekly cadence, the delivery and the follow-up check are not |
| `SimplerWay` "Check" step | "Next week it says whether it worked, in your own numbers." | nothing |
| `HERO.search`, `HERO_NAV` | "Ask about your shop…", "Today / Do / Ask" | surfaces that do not exist, inside a sample-labelled panel |
| `ActionSheet` CTA | "See this week's list" → `/dashboard` | `/dashboard` shows no list |

### 6.3 Claims the data model cannot express

These are worse than unbuilt: the contract has no shape for them, so they cannot be delivered
without a dictionary change first.

| Where | What it says | Why it cannot be expressed |
|---|---|---|
| hero axis, `HERO.chart`, `UseCases` café and clinic cards | hourly revenue, "utilisation by hour" | `date` is a calendar day and the upsert key has **no time component** (note 58 §1.6). There is nowhere to store an hourly figure |
| hero metric, `UseCases` café card | "Delivery share" | not a metric in `packages/contract/src/metrics.ts`, and no source behind it |
| `UseCases` guesthouse card | "occupancy and channel cost" | `occupancy` is not in the dictionary; Booking.com, the only source returning a real per-booking commission, is a hard block (§1.1) |
| `UseCases` seller card | "margin by listing and by channel" | margin needs `cost_of_goods`, which the dictionary does not have (§2.2) |
| `Reports` lead | "Every unit, channel, bank account and ad account consolidated" | no bank connector exists and Thai deposit data is regulator-blocked until ~2027 (§1.3); **"unit" has no dimension in the envelope** (§4.4) |
| `UseCases` accountant card | "Close every client's month from one export." | no export exists, and multi-client switching sits behind the withheld `surface:agency-switching` |

The hourly and delivery-share lines are the plan's own emphasis and issue #49 asks for them by
name. They are written, labelled as a sample, and recorded here — which is the whole point of this
section.

### 6.4 Per-trade adaptation

`SimplerWay` ("works out which numbers matter for the trade you are in", "It works out what kind of
business you run from the data"), `DashboardFeature` ("laid out for the trade you are in"),
`UseCases` lead and all five "Leads with…" lines.

**Nothing infers a business type.** `leadingMetrics(business)` in `packages/insights/src/figures.ts`
takes the type as an **input**. The per-trade emphasis is real code; the *inference* is not.

### 6.5 The audience itself

All five audience cards presume a POS, a PMS or a marketplace connector.
`packages/connectors/src/sources` holds ga4, google_ads, meta_ads, search_console and woocommerce.
**For four of the five trades there is no reachable source at all** (§1.1), and `SITE.heroLead`'s
"the tools your business already runs on" inherits the same gap for a café.

This is the deepest claim on the page and the one that no amount of engineering closes: §1.1's
finding is that three of the sources the plan's canonical café runs on are unreachable *in
principle* rather than on paperwork.

### 6.6 Backed by a library, not delivered by a product

`packages/insights` exists and these are true of the code. They are not yet true of the product,
because nothing renders an insight for a customer and `surface:answer` is still withheld.

- `AssistantPanel`'s heading, lead and all four tick items
- `ActionSheet`'s "Ordered by value, biggest first" and "Impact is an estimate from your own
  numbers, shown as a range where it is uncertain"
- The three figures on the assistant card — computed by the shipped engine, from sample rows, and
  labelled as such

### 6.7 What is actually backed today

For contrast, and so the ledger is not read as "none of it is true":

| Claim | What backs it |
|---|---|
| "Nothing is done for you. You stay in control of prices, ads and staff" | the product has no write path at all. §11.4 defers writes past the MVP |
| every figure carries when it was read, and a marker while it may still change | `fetched_at` and `is_provisional` are real envelope columns, rendered by `/dashboard` today |
| "On a shop's own till that marker never comes off" | `restatement.ts`, `windowDays: null` for a merchant's own database |
| read access on your own logins, worded as what we ask for and what our code enforces | §5.1's required wording. True of Loyverse and Xero at the token level; enforced by our code elsewhere |
| "The Free plan includes 3 connected accounts" | `PLAN_ENTITLEMENTS` |
| the ranking, the worth and the range on the assistant card | `packages/insights`, computed at build time, asserted by `sample-brief.test.tsx` |

## 7. Open or unverified spec items this builds on

**The THB pricing ladder is unsettled** (§4.8) and two files disagree by 2.3×. `/pricing` still
quotes USD. If the ladder settles, the hero's baht figures and the pricing section stop
contradicting each other; until then the page shows baht in a labelled sample and dollars in the
price list, which is visibly odd and is the honest state.

**The `FORBIDDEN_CLAIMS` competitor pattern does not catch "rivals"** (§5.1). Nothing in this PR
relies on that, because no competitor section was written — but the next person to write one must
widen the pattern first, or the ban will be doing the opposite of its job on the one module it was
written for.

**"Read-only" is a weaker guarantee on five of the named platforms than the words suggest** (§1.5).
The copy is worded as what we ask for and what our code enforces, which is §5.1's requirement, and
that wording must survive any future edit that tries to tighten it back into a guarantee.
