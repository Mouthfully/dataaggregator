# Financial model

Three files, one source of truth.

| File | What it is |
|---|---|
| `model.py` | The 60-month model. Every number in the document and the artifact comes from here. |
| `cost-model.html` | The published document. Artifact body — no `<html>`/`<head>`/`<body>` wrapper. |
| `build-pdf.mjs` | Renders `cost-model.html` to a 35-page A4 PDF via Playwright. |

## Run the model

```bash
python3 docs/marketplane/finance/model.py
```

No dependencies. Prints the five-year P&L for the base case and the routed case, the corporate
income tax with and without BOI, and the three 36-month outlooks.

**If a figure in `cost-model.html` disagrees with this script, the script is right and the
document is stale.** The document was hand-written from the script's output; there is no
generator between them. Re-check the document whenever a parameter changes.

## Build the PDF

```bash
cd docs/marketplane/finance && node build-pdf.mjs
```

**Playwright is deliberately not a repo dependency** — adding a browser automation package to
the monorepo for a one-off document build would widen the stack for no product reason. Install
it ad hoc where you need it:

```bash
npm i playwright        # in a scratch directory, then run the script from there
```

The script points `executablePath` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
which is pre-installed in the Claude Code web environment. Change that line anywhere else.
It forces the light theme — the dark palette is wrong on paper — and sets `break-inside: avoid`
on tables and figures, which costs a few pages of whitespace but keeps every table in one piece.

## Publish the document

`cost-model.html` is published as an Artifact. To update it in a new session, pass the URL:

```
Artifact({ file_path: "docs/marketplane/finance/cost-model.html",
           url: "https://claude.ai/code/artifact/9b7d645f-2188-40df-b06d-88bf8ee9e7c9" })
```

Read it first (`action: "read"` with that URL) — a publish to an artifact the conversation has
not read or published is refused.

## Changing an assumption

Everything tunable is a named constant near the top of `model.py`, or a keyword argument on
`run()`. The switches worth knowing:

```python
run(route_from=15)   # ship the §03 routing engine in month 15
run(ann=0.45)        # annual-plan take-up
run(chm=.070, cha=.035)   # monthly-plan and annual-plan churn
run(cac=39500.)      # paid-channel CAC in baht
run(mul=0.60)        # multiplier on the SME acquisition schedule
run(emul=1.5)        # multiplier on the enterprise ramp
run(ent=False)       # switch the enterprise tier off entirely
```

Returns `(rows, ebitda_positive_month, peak_cash, cash_positive_month)` where `rows` is one dict
per month. Every field is documented by use in `report()` at the bottom of the file.
