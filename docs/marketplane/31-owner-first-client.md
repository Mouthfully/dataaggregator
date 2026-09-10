# 31. An owner-first client, and a price the design got wrong

**PR:** #7 &nbsp;·&nbsp; **Date:** 2026-09-10 &nbsp;·&nbsp; **Status:** proposed — **design only, no code**

---

## 0. Numbering

**Numbered 31.** `29-positioning-reconciliation.md` and `30-thai-public-data-register.md` exist on
PR [#5](https://github.com/Mouthfully/dataaggregator/pull/5), which was open and unmerged when this
was written. Taking 29 or 30 would collide on merge. **`20-marketing-site.md` is still owed** — the
notes now jump 19 → 21 → … → 31, and this note is not it: this is the product application, not the
marketing page.

## 1. What this is, and the decision taken

`design/app/App.dc.html` is the product application design of record. It is a **desktop** app with
**eight** nav items, **six** settings tabs, **four** equal KPI tiles, and a settings tab that asks
the customer to manage `SHEETS_EXPORT_ID`, `GRABFOOD_STORE_ID`, an API token `tc_live_8f2a…c91e`
and a Zapier webhook URL.

§11A.1 decided the primary customer is **an owner-run business with no analyst and no IT function**.
Those two facts do not sit together, and nothing in the repository was going to notice: `design/**`
is exempt from both the brand and the token guards, deliberately, so a mockup can carry a working
name and hard-coded hexes.

**The decision taken: propose the simpler client as a second design folder rather than editing the
first.** `design/app/` stays the design of record. `design/app-simple/` argues against it. A design
note is a dated record and a mockup is evidence of intent; overwriting the artefact would destroy
the comparison that makes the argument legible.

**The alternative rejected** was editing `App.dc.html` in place. It is one file with a product name
in it, 148 KB of inline styles, and a persona; a diff across it would be unreadable, and the thing
being argued — *this is too much for this customer* — would become invisible the moment it landed.

Five phone artboards (390×844), laid out by `canvas.json`: **Today**, **Do**, **Ask**, **Setup**,
and **the LINE brief**. Static mockups, not a clickable prototype — they exist to argue a structure.

**What changed, each with its reason:**

- **Eight destinations become three.** Today · Do · Ask. `Reports` and `Alerts` are delivery
  preferences, not places. `Founder questions` and `Ask` are the same action in an owner's head.
  `Data sources` and `Settings` fold into a Setup you touch twice a year.
- **Four equal KPI tiles become one number.** Profit after fees is the figure no platform produces
  — it is the entire premise — and in the current design it is tile #2 of 4, weighted equally with
  Revenue, Orders and Delivery share. Here it is the only large figure and the rest is its
  breakdown.
- **Five connection states become two.** `on` / `prov` / `err` / `off` / `soon` is a vocabulary the
  customer has to learn. It is *Working* or *Needs you*, and the remedy is a sentence.
- **The developer surface goes behind one closed door**, labelled for the accountant or developer.
- **Phone-first**, because the owner is behind a counter rather than at a desk.
- **LINE is the primary surface**, per §11A.3. Most owners will never open the web app, so
  `Brief.dc.html` is the product for them and its reply box is the Ask surface. It is written in
  Thai; `Noto Sans Thai` was already in the artboard's font stack.

**The visual vocabulary is unchanged and was lifted from the file, not invented**: `#F4F6FA`
ground, `#0F172A` ink, `#2563EB` accent, `#0F766E` positive, `#F97316` warning, 16px card radii,
999px pills, `0 18px 44px rgba(15,23,42,0.08)`, Figtree / Young Serif / Noto Sans Thai.

## 2. The pricing correction

**This is the part worth reviewing.** The two artefacts describe different businesses.

| | `design/app/App.dc.html` | `finance/model.py` |
|---|---|---|
| Tiers | Free ฿0 · Small SME ฿990 · Medium SME ฿2,490 · Enterprise | Starter ฿1,590 · Growth ฿4,190 · Multi-unit ฿13,800 |
| VAT | *"Prices exclude 7% VAT"* | `price/1.07` — **inclusive** |
| Enterprise floor | none — "Annual contract" | ฿30,000 |
| Meter | source count, ฿250 per extra source | per connected account (§11.3) |

`model.py` line 50 is `STICK = {'S':1590,'G':4190,'M':13800}`; line 174 computes enterprise revenue
as `sum(EN[b]*EB[b]['price']/1.07 ...)`. `HANDOVER.md` §9 lists **both** the VAT-inclusive decision
and the ฿1,590 Starter under *"decisions already made — do not reopen"*, with the reasoning stated:
most Thai SMEs are not VAT-registered and cannot credit it back, and the extra hundred baht over
฿1,490 buys back the 8% of contribution VAT would otherwise take. The enterprise floor exists
because WorkOS SSO is ฿4,137/month per connection and does not shrink with deal size.

**`Setup.dc.html` renders the model's numbers.** It **keeps** the old design's shape — flat monthly
tiers, no credit meter — because that is a plausible answer to open question §11A.9.4, *"whether
credit pricing fits an owner-run business at all"*. It **drops** the per-source gate, because
§11.3 meters per connected account and the two differ whenever one shop runs two storefronts on one
platform.

**The unit stays open.** Source vs connected account vs credits is a founder decision. This design
assumes connected account and the README says so, rather than settling it by drawing it.

**No guard catches this class of drift**, and that is by design working rather than an oversight:
`design/**` is exempt from both guards so a mockup can carry hexes and a name. But nothing
reconciles a rendered price against `model.py`, and nothing can — a price in an artboard is a
picture. Recorded in §6 as something to decide rather than fixed here.

## 3. Cost estimate

**Per connected account per month:** `฿0.00 / $0.00`

No data-plane work. No connector, no schema, no scheduler, no read path, no bought data. Nothing
here changes rows/night, restatement depth, Workers invocations, R2 object count, KV writes or
Supabase disk, and nothing touches the polling ratio §8's open question turns on.

The repository grows by **8 files, ~114 KB**, of which 75 KB is `support.js` — the same runtime
already committed twice, copied so the folder renders standalone, matching `design/app/` and
`design/marketplane/`. **The 2.5 MB seeded canvas payload is deliberately not committed**: the
artboards are the source and the canvas is re-seeded from them, which is the existing convention in
both design folders.

## 4. Platform-terms check

### Credential

**1. BYOC.** `PASS` — no platform call exists in this diff; no token of any kind is read. The
`Setup` artboard *depicts* per-source connection, which is the BYOC model rather than a departure
from it.

**2. Vendor-key exception.** `N/A` — no data source is contacted.

**3. No token pass-through.** `N/A` — the MCP server and OAuth surface are untouched.

**4. Credential hygiene.** `PASS`, and worth stating rather than marking N/A, because the existing
design is where this nearly went wrong: `App.dc.html` renders a sample API token
(`tc_live_8f2a…c91e`) and a webhook URL. **No credential, real or sample, appears in these
artboards** — the developer surface is a closed door with a label, and nothing behind it is drawn.

### Tenancy

**5. RLS.** `N/A` — no table, view or migration. **6. No service-role bypass.** `N/A` — no request
path. **7. No cross-workspace read.** `N/A` — no query, cache key or aggregate.

**8. No cross-customer aggregation or benchmarking.** `PASS`, and this gate did real work here. A
simplified dashboard is exactly where "how do I compare?" gets added as a kindness. **Every figure
on every artboard compares the business only with its own history** — "more than last week", "the
Saturday before", "23 August". There is no peer set, no district average, no percentile, and the
`Setup` footer states the rule to the customer in their own words: *"Your numbers are yours. We
never mix them with another business's."* Meta 3.a.iv and Google's redistribution clause unchanged.

**9. API key scope.** `N/A` — no key path.

### Data movement

**10. No resale or redistribution.** `PASS` — nothing moves. The billing units depicted are §11.3's,
corrected; see §2.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path.

**12. Dependency licences.** `PASS` — no dependency added; `pnpm-lock.yaml` untouched. Fonts load
from Google Fonts in the artboard exactly as `App.dc.html` already does.

### PII and consent

**13. Hash at the edge.** `PASS` — no contact data, no persistence, no prompt. The `Brief` artboard
depicts a LINE message to the **owner**, who is the customer, not a matched end-customer.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress.

**15. Per-destination consent.** `N/A` — writes remain deferred (§11.4).

### Access tier and quota

**16. Tier reality.** `N/A` — no platform request is made or planned.

**17. No new long-lead dependency.** `PASS` — nothing depicted needs an approval this company does
not hold. Worth one line: the `Setup` artboard names *your till*, *GrabFood*, *Shopee* and *LINE*.
**None of those four is a launch connector**, and §11A.14's set is GA4, WooCommerce, Shopify and a
payments source. They are drawn as a Thai café's real world, not as a claim of coverage — the same
distinction `19-sme-repositioning.md` §3 raises about `App.dc.html`'s fourteen-logo strip, and it
is a **weaker** version of that problem (four, in a mockup, versus fourteen bound for a public
page). Flagged rather than fixed; see §5.

### Claims

**18. Claim provenance.** `PASS` — nothing user-visible changes. No product name appears anywhere
in these artboards; `brand.productNameSettled` is still `false`. **Nothing here may reach
`packages/brand/src/claims.ts`** without passing the claims gate *and* issue
[#6](https://github.com/Mouthfully/dataaggregator/issues/6)'s capability question: several screens
depict surfaces that are not built — the Ask answer, the action sheet, the LINE brief, the whole
after-fees number. A mockup may draw an unbuilt surface; a claim may not assert one.

**Result:** `7 PASS, 11 N/A, 0 FAIL`

## 5. What was left out

- **`design/app/App.dc.html` was not edited or deleted.** §1. It stays the design of record until a
  founder says otherwise.
- **The connector names in `Setup.dc.html` were not reconciled** with §11A.14's launch set. Gate 17.
  Doing it would have meant drawing a café that connects WooCommerce and Shopify, which is not the
  café in the persona. The honest fix is a decision about who the first design partner is, not a
  change to a mockup.
- **No admin or operator design.** There is none anywhere in the repository, and it is the surface
  most likely to break §15's "no cross-workspace aggregation ever" — a support screen listing all
  workspaces is one query away from it. That needs its **rules written before its screens**, which
  is its own note.
- **No landing page.** `20-marketing-site.md` is still owed and `design/marketplane/Main.dc.html`
  still predates §11A.1.
- **No onboarding, empty, loading or error states**, no Thai translation of the four app screens
  (only the LINE brief is in Thai), and no tablet or desktop breakpoint.
- **No guard reconciling a rendered price against `model.py`.** §2. It may not be buildable — a
  price in an artboard is a picture — and a guard that greps design files for baht figures would
  fire on every sample number. Recorded as a question, not attempted.

## 6. Open or unverified spec items this builds on

- **§11A.9.4 — whether credit pricing fits an owner-run business at all.** This design assumes it
  does not, and draws flat monthly tiers with no credit meter. **If credits return**, `Setup.dc.html`
  is wrong and the Plan card is redrawn; nothing else on any other artboard changes, which is the
  argument for keeping pricing on one card.
- **The metering unit.** §11.3 decided per connected account plus credits; the old design drew per
  source. This draws neither meter visibly, which is the honest position while the unit is open.
- **§11A.2's four surfaces are decided and none is built.** Every artboard here depicts one. That is
  legitimate for a mockup and is exactly what issue #6 says must not leak into a claim.
- **§11A.5's measurement class** is rendered on the Ask answer — *Counted* versus *A guess* — which
  is that requirement in an owner's vocabulary rather than the specification's. Whether those two
  words carry `observed / matched / modelled` faithfully enough is a question for whoever builds it;
  three classes are collapsed to two here, deliberately, and that is a simplification a reviewer
  should push back on if it loses something.

## 7. Verification

| | |
|---|---|
| `pnpm exec biome lint .` / `format .` | pass, by exit code |
| `pnpm -r typecheck` | pass |
| `pnpm -r test` | pass — **396 unit tests**, unchanged |
| `pnpm -r build` | pass |
| `pnpm check:brand` | pass |
| `pnpm check:tokens` | pass — `design/**` is exempt, as it is for `design/app/` |
| `pnpm check:dictionary` | pass — no dictionary change |
| Canvas parses | `seed-canvas.mjs --check` → `ok`, 5 artboards + `canvas.json` |

**No test covers a mockup, and none should.** The checks confirm a design-only change disturbed no
code. `apps/api-edge` prints `workerd` stack traces during its run (`Network connection lost`,
`FixedLengthStream`) — expected miniflare-pool noise; its 65 tests pass.

**No mutation testing.** There is no assertion here to break. The one thing that *could* be
asserted — that a rendered price matches `model.py` — is §5's last omission.
