# The product application design

`App.dc.html` is the design for the **product itself** — the dashboard, the action
sheet, Ask, reports, alerts and settings. It is a reference mockup exported from a
visual design tool, not production code: the values to replicate live in its inline
`style="…"` attributes and its `<helmet><style>` block.

`support.js` is the runtime that renders it. The upload also carried
`vendor/react*.js`; those are not committed, matching `design/marketplane/`, which
carries only the artboard and its support file. To view the page, serve this folder
over HTTP with React available — some browsers block the scripts over `file://`.

## What this is not

**It is not the landing page.** `docs/marketplane/19-sme-repositioning.md` records
what was expected, what arrived, and the difference. `design/marketplane/Main.dc.html`
remains the marketing artboard that `apps/web` is built from.

## Two things to know before quoting it

**It carries a product name.** The name is unsettled in `packages/brand`
(`productNameSettled: false`), so the name in this file is a design placeholder and
not a decision. The brand guard exempts `design/**` precisely so a mockup can carry
one; nothing outside the brand file may.

**Its figures are invented.** Revenue, covers, cohort percentages, the venue and the
owner persona are all sample data for the design. Specification section 14 already
says this of the earlier artboard's numbers, and it is true again here.
