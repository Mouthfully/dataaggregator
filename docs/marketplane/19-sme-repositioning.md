# 19. The SME repositioning, recorded

**PR:** #2 &nbsp;·&nbsp; **Date:** 2026-09-08 &nbsp;·&nbsp; **Status:** proposed — **documentation only, no code**

---

## 1. What this is, and the decision taken

A founder update: the product's message moves from *"verified root cause over ad, analytics
and search data, for agencies and brands"* to *"a replacement for a business-intelligence
team, for small businesses — Thailand first, but not Thailand only"*, together with a new
product-application design.

**The decision was how to record it, not whether.** The specification is explicit that §11
holds decisions overriding earlier sections, and the brief says to add there rather than
rewrite. So:

| Where | What went in |
|---|---|
| **Spec §11A** | Ten dated decisions plus a change-log table. Decisions only |
| **Spec Appendix C** | The action sheet |
| **Spec Appendix D** | Consolidated reports and units |
| **`docs/SME-POSITIONING-AND-FINDINGS.md`** | Competitive landscape, connector inventory, the attribution model, design artefacts, open questions. **Findings, not decisions** |
| **`design/app/`** | The artboard received, with a README saying what it is |
| **README** | The new document in the reference table |

The split between §11A and the findings document is deliberate and load-bearing: **§11A is
binding and the findings document is not.** The findings document says so at the top, and
says that where the two disagree, §11A wins. A single document mixing a decision with an
unsourced market claim is how an unsourced market claim becomes a decision.

**Numbered 19, so the marketing site's design note is now 20 and still owed.** Named in §5.

## 2. What the brief asked for that the repository could not confirm

Three, and they change what could honestly be written.

### 2.1 The named branch does not exist

The brief cites `claude/landing-page-repo-design-oiixbf`. `git ls-remote --heads origin`
returns exactly two refs: `main` and `claude/marketplane-build-kickoff-cgbfxz`. Nothing was
lost — the branch was never pushed — but nothing could be read from it either.

### 2.2 The files that arrived are not the files the brief names

Expected `design/landing/Main.dc.html`, `Mobile.dc.html`, `canvas.json`. Received one
artboard, `App.dc.html`, plus its support runtime and a vendored React.

### 2.3 It is the product application, not a landing page

This is the one that mattered. The artboard is the **product**: a dashboard, a weekly action
sheet, an Ask surface, reports, alerts and settings. Not a marketing page.

**It is committed as `design/app/`, not `design/landing/`.** A folder named `landing`
holding an application design would be a false record, and every document pointing at it
would inherit the error — including this one. The landing page design is still outstanding
and the findings document says so.

**What that cost:** the brief's §8 asks to document bracketed placeholders
(`[DATA REGION]`, `[Owner name]`, `[LEGAL ENTITY]`, …) and owner quotes for Saphan 55 and
BREW. **None appears in the artefact received** — it uses template bindings and a
fully-realised persona instead. Both are recorded as pending the landing design rather than
described as though they were present.

## 3. Three things the artefact changed in the writing

Not from the brief — from reading the file.

**The connector logo strip is a bigger problem than "reconcile before publishing".** The
design names fourteen sources: GrabFood, Shopee, LINE MAN, K PLUS, Wongnai, Lazada,
foodpanda, TikTok Shop, Shopify, Stripe, PromptPay, Kasikorn, Xero, Google Business Profile.
**Not one is a launch connector, and every one is unverified.** Publishing it would
advertise fourteen integrations that do not exist — the exact failure `FORBIDDEN_CLAIMS`
exists to stop, in a form its regexes cannot catch, because they count words and this counts
logos.

**The design already writes measurement class correctly**, which is evidence the requirement
is implementable rather than aspirational: *"Measured on 41% of covers with a loyalty phone
or LINE id; rest modelled"*, and *"Modelled, band narrows as October fills"*. §11A.5 makes
that a rule; the design got there first.

**The name is in the file.** The artboard carries a working product name and a matching MCP
hostname. The founder has since confirmed the name is **still not decided**, so this became
its own decision entry (§11A.10) rather than a footnote: a design file is exactly how an
unsettled name leaks into places that are expensive to change, and the brand guard has
already caught that twice — in a cryptographic AAD and a database role name.

## 4. Cost estimate

**$0.00. No code, no dependency, no infrastructure.**

The cost this round *creates* is worth stating, because three decisions carry engineering
that does not exist:

- **§11A.5's measurement class and coverage** need a field on every insight and answer.
  Neither `envelope_rows` nor `@repo/contract` has one. This is the same shape as the
  sampling gap `17-payload-store.md` found: a correctness property the envelope cannot
  currently express.
- **Appendix D's units** need a tenancy level below `workspace`, which does not exist.
- **§11A.6's connector set** needs entity types and metrics — covers, tickets, net revenue,
  commission — that the dictionary does not have, and `check-dictionary.mjs` will fail the
  build until TypeScript and SQL move together.

None is scheduled. All three are named where they belong.

## 5. What was left out

- **The claims list and the marketing site were not touched.** `packages/brand/src/claims.ts`
  still carries the agency-and-brand `positioning` claim, and `apps/web` still renders it
  under test. **§11A.1 now contradicts a live, tested string.** Changing it is a code change
  that ripples into the site and its 24 assertions; doing it inside a documentation pass
  would have widened the scope the brief closed. It is the first thing to do next.
- **`20-marketing-site.md` is still owed** — the site shipped in `6ce3cd7` without its note.
- **No connector, surface or schema was built.** Appendices C and D say "nothing here is
  built" in their first line.
- **The competitive landscape was not verified.** It is recorded as it was given, under a
  sourcing note saying it was not produced the way the specification's own findings were.
- **`vendor/react*.js` was not committed**, matching `design/marketplane/`, which carries only
  an artboard and its support file.

## 6. Verification

| | |
|---|---|
| Lint, format | pass |
| Brand guard | pass — `docs/**` and `design/**` are exempt, which is why an artboard may carry a working name |
| Tokens guard | pass |
| Dictionary guard | pass — no dictionary change was made |
| Typecheck, test, build | pass, unchanged: **318 unit tests** |
| Database suite | pass, unchanged: **108 assertions** |

No test covers a document, and none should. The checks confirm what matters here: **that a
documentation change did not disturb the code**, and that the brand guard still holds
against a round that introduced a product name into the repository for the first time.
