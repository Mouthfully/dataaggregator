# The owner-first client design

A **direction, not a decision.** `design/app/App.dc.html` remains the product
application design of record; this folder proposes a simpler one for the customer
§11A.1 actually names — an owner-run business with no analyst, no IT function and
very little time.

## What it is

Five phone artboards (390×844), laid out by `canvas.json`:

| Artboard | Screen |
|---|---|
| `Main.dc.html` | Today — the one number |
| `Do.dc.html` | Do — three actions, priced |
| `Ask.dc.html` | Ask — one question surface |
| `Setup.dc.html` | Setup — sources, plan, and one closed door |
| `Brief.dc.html` | The LINE daily brief, in Thai |

Static mockups, not a clickable prototype: they exist to argue a structure, not to
be driven.

## What changed from `design/app/`, and why

- **Eight nav items become three.** Today · Do · Ask. `Reports` and `Alerts` are
  delivery preferences, not destinations. `Founder questions` and `Ask` were the
  same action in an owner's head, so they are one screen. `Data sources` and
  `Settings` fold into a Setup you touch twice a year.
- **Four equal KPI tiles become one number.** Profit after fees is the figure no
  platform produces, which is the entire premise; it should not share the screen
  with three tiles of equal weight. Revenue, orders and refunds become the
  breakdown *beneath* it.
- **Five connection states become two.** `on` / `prov` / `err` / `off` / `soon`
  is a vocabulary the owner has to learn. It is *Working* or *Needs you*, and what
  to do about it is a sentence, not a status code.
- **The developer surface goes behind one closed door.** `SHEETS_EXPORT_ID`,
  `GRABFOOD_STORE_ID`, `tc_live_…` and a Zapier webhook URL are not things a café
  owner manages. They live under "For your accountant or developer".
- **Phone-first.** The existing design is a desktop app with a sidebar. The owner
  is behind a counter.
- **LINE is treated as the primary surface**, per §11A.3 — most owners will never
  open the web app, so `Brief.dc.html` is the product for them and its reply box
  is the Ask surface.

## The pricing correction

`design/app/App.dc.html` carries `Free ฿0 / Small SME ฿990 / Medium SME ฿2,490 /
Enterprise`, gated on source count, with *"Prices exclude 7% VAT"*.

`docs/marketplane/finance/model.py` line 50 carries
`STICK = {'S':1590, 'G':4190, 'M':13800}`, and computes enterprise revenue as
`price/1.07` — **VAT-inclusive**. `HANDOVER.md` §9 lists VAT-inclusive pricing and
the ฿1,590 Starter under "decisions already made — do not reopen", and sets the
enterprise floor at ฿30,000.

`Setup.dc.html` renders the model's numbers. **What it keeps from the old design is
the shape** — flat monthly tiers with no credit meter — which is a plausible answer
to open question §11A.9.4, *"whether credit pricing fits an owner-run business at
all"*. What it drops is the per-source gate, because §11.3 meters per **connected
account**, not per source, and those differ whenever a shop has two storefronts on
one platform.

**The unit is still open.** Source vs connected account vs credits is a founder
decision; this design assumes connected account and says so here rather than
settling it by drawing it.

## Two things to know before quoting it

**The figures are invented.** ฿97,400, the ฿5 price rise, 38 covers, the rain —
all sample data, as in `design/app/`. The *prices* are the exception: those are
`model.py`'s and should stay reconciled with it.

**Nothing here is a claim.** No product name appears; `productNameSettled` is still
false. Nothing in these artboards may reach `packages/brand/src/claims.ts` without
passing the claims gate and issue #6's capability question — several screens depict
surfaces that are not built.
