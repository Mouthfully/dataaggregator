# The FAST Standard — a reference for the consolidated-reports export

`FAST-Standard-02c-July-2019.pdf` is the FAST Standard, version 02c, July 2019, published by the
FAST Standard Organisation. It is a REFERENCE, not a specification this repository implements.

## Licence and attribution — read this before quoting it

The document states on its contents page:

> This work is licensed under the Creative Commons Attribution 4.0 International License.
> To view a copy of this license, visit http://creativecommons.org/licenses/by/4.0/

**CC BY 4.0**, so the rules may be quoted, adapted and built on — **with attribution**. Any design
note, code comment or exported artefact that carries a FAST rule must name the standard, the version
and the organisation. A rule paraphrased without attribution is a licence breach, not a style
choice.

## Why it is in the repository

The same reason `design/bi-plan/Main.dc.html` is: it arrived as a chat upload, and a document that
exists only in a conversation cannot be checked by the next person. Decisions about the export's
structure will cite specific numbered rules, and a citation nobody can open is a citation nobody can
argue with.

## What it is

A set of rules on the structure and detailed design of **spreadsheet-based financial models**. The
acronym is its four design priorities:

| | |
|---|---|
| **Flexible** | models must run scenarios and be modified over time, by different modellers. "Flexibility is born of simplicity" |
| **Appropriate** | models must reflect key assumptions "directly and faithfully without being over-built" |
| **Structured** | rigorous consistency of layout, so logical integrity survives a change of author |
| **Transparent** | simple, clear formulas "that can be understood by other modellers and non-modellers alike" |

Roughly 150 numbered rules in four chapters — workbook design, worksheet design, the line item,
Excel features — with exceptions listed explicitly, because "rules are meant to be broken… such
pragmatic behaviour does not render the rule book useless". Appendix C is the whole rule list in
short form and is the fastest way in.

## Where it applies to this product, and where it does not

### It applies to ONE thing: the accountant, bank and investor export

Capability four of the product plan is the monthly investor update, the P&L by unit and channel, the
bank loan pack and the accountant export. Those are spreadsheets going to people who review
spreadsheets for a living, and FAST is the standard for exactly that artefact. The rules that carry
most directly:

| Rule | Why it matters here |
|---|---|
| `1.01-01` | Group or separate worksheets by type: **Foundation, Workings, Presentation, Control**. An export generator can emit precisely that shape |
| `1.01-07` | **Calculate only once.** Already how `packages/insights/src/figures.ts` works — every comparison is computed in one place and rendered from there |
| `2.05-02` | "A model must completely explain how it works without the need for other software applications to present the model outputs." A bank pack that only makes sense inside our web app is worth less to the person who asked for it |
| `2.05-03/04/05` | Describe the modelling standard used, the model's flow, and the keys to colour coding and abbreviations |
| `2.06-02` | **"Provide a list of model qualifications and weaknesses."** See below — this is the one to take seriously |
| `3.01-01` | Clear indication for constants vs series |
| `3.04-01` | **Do not write formulas with embedded constants.** The same rule this repository already enforces on itself |
| `3.05-01/03` | A label on every line item; every label unique |
| `3.05-04/08/09/13` | **A units designator on every line item, clear, unambiguous, and consistently applied.** This is the same decision `figures.ts` makes when it prints `THB 16,940.00` rather than `฿16,940` — the code, not the symbol, because "$" is the currency of at least four countries |

### Rule 2.06-02 is the one worth building the export around

A required **Control sheet listing what the model cannot do**. That is this product's central
distinction rendered in a format an accountant already trusts. For a real export it would carry:

- which figures are **observed**, which are **modelled**, and which are **absent** — not zero;
- which rows are still **provisional**, and for which sources that marker never comes off (a shop's
  own till restates forever — `restatement.ts`, `windowDays: null`);
- the **fetch time** of every source;
- what the period does **not** cover, and why — a source not connected, a metric the dictionary has
  no word for, a commission that is modelled because the platform does not return it.

`docs/marketplane/60-selling-decisions.md` §6 is that list in prose already. Rule 2.06-02 says put
it in the workbook.

### The "Appropriate" paragraph is independent backing for a rule this repository invented

> "Spurious precision is distracting, verging on dangerous, particularly when it is unbalanced. For
> example, over-specifying tax assumptions may lead to an expectation that all elements of the model
> are equally certain and, for example, lead to a false impression, if the revenue forecast is
> essentially guesswork."

That is the provisional-range decision in `packages/insights/src/figures.ts`, arrived at by a
different profession from first principles. Worth citing when someone asks why an impact estimate is
a range rather than a number.

### It does NOT apply to the rest of the product

The standard is tied to spreadsheet mechanics — freeze panes, `INDEX` over `CHOOSE`, never `OFFSET`
or `INDIRECT`, do not merge cells, do not use array formulas. None of that governs an API, a
TypeScript package or a language-model pipeline. Reaching for FAST to describe the platform would be
a category error.

## What may NOT be claimed

**"FAST compliant" is not a claim to put on the site.** Two reasons, and the first is a finding
rather than an opinion:

1. **This document defines no conformance or certification scheme.** It is a set of rules with
   listed exceptions and a philosophy that "rules are meant to be broken… with justification". There
   is nothing in it that makes compliance a binary anyone can assert. Whether the FAST Standard
   Organisation operates a separate certification or trade-mark policy was **not checked** — the
   organisation's own site is unreachable from this environment (it answers a captcha wall), so this
   is an open question and not a cleared one.
2. Even a genuinely FAST-structured export would say nothing about the product's other claims, and
   `packages/brand/src/claims.ts` is where a claim has to earn its place.

What may honestly be said, once an export exists and is built this way, is what is enforced: the
export separates workings from presentation, carries a units designator on every line item, embeds
no constants in formulas, and ships a Control sheet naming what the model cannot do — with the
standard cited and attributed.
