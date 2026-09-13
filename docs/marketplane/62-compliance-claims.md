# 62. A certification is a third party's attestation, and the ban that keeps it that way

**PR:** #41 &nbsp;·&nbsp; **Date:** 2026-09-13 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the distinction it rests on

The founder asked for SOC 2 Type II, ISO 27001 and GDPR compliance to be rules agents follow, and
for Thailand's PDPA alongside them. This is the enforcement half. The instruction files that state
the rules are a second unit.

**The distinction everything here turns on, because blurring it is the failure this repository is
organised against:**

| | What it is | Who can confer it |
|---|---|---|
| A **control** | something the code does | us, today |
| A **certification** | a third party's attestation | a CPA firm; an accredited certification body |
| A **legal obligation** | applies whether or not anyone writes it down | nobody — it is already the case |

**SOC 2 Type II** is a CPA's report on operating *effectiveness* over an observation window,
commonly three to twelve months. No engineering work shortens that window: evidence accumulates
while controls actually run. **ISO/IEC 27001** certifies an *ISMS* — clauses 4 to 10, most of which
is management-system work no codebase provides. Implementing every technical control in Annex A
produces a well-run system and not a certificate.

So writing "we are SOC 2 compliant" into a CLAUDE.md would not make it true, and on a
customer-facing page it is exactly the confident falsehood this codebase exists to refuse. What this
unit does instead is make the claim **mechanically unpublishable** until the document exists.

## 2. What changed

### The brand file gained five facts

`soc2TypeIIReport` and `iso27001Certificate` are booleans, both `false`, and **only a third party
handing over a document flips either**. They sit beside `euRepresentative` and `dpaAvailable`, which
already worked this way.

`governingPrivacyLaw`, `supervisoryAuthority` and `dataProtectionOfficer` are different in kind.
The PDPA is **not a certification and not optional** — a Thai juristic person processing personal
data is in scope, and there is nothing to hold and nothing to flip. The first two are plain strings
because the only honest value is the statute and the authority. The third is `null`, and the null is
load-bearing: the PDPA requires a DPO in defined circumstances, whether this entity meets the
trigger is a question for counsel, and **a plausible-looking name would be written to by a data
subject and answered by nobody.**

### Three claims were declared, so the existing machinery withholds them

`soc2`, `iso27001` and `governing-law` are now entries in `CLAIMS` with `requires` pointing at those
facts. `claim("soc2")` throws; `optionalClaim("soc2")` returns null. That is the same gate that has
kept `gdpr` and `dpa` off the site since the brand file landed.

### Four patterns were added to `FORBIDDEN_CLAIMS`, and they are built against this list's own misses

A withheld claim only stops copy that goes **through** `claim()`. Issue #49 is entirely about the
hand-written sentence that goes round it, so the ban is the other half.

The patterns are constructed against two recorded near-misses rather than theoretical ones:
`/\b\d+\s+(sources|integrations)\b/` let **"200+ integrations"** through because the `+` sat exactly
where the regex expected whitespace, and the competitor pattern catches "competitor" but not
"competitors" because `\b` fails before the plural. So:

- the separator is `\W{0,3}`, not `\s` — taking `SOC 2`, `SOC2`, `SOC-2`, `SOC . 2` and
  `ISO/IEC 27001` alike;
- the bare standard number is banned on its own, because *"certified to 27001"* names no acronym;
- `Service Organization Control 2` is banned, because the expansion is not the acronym.

**The acronyms themselves stay legal**, deliberately. A privacy notice has to be able to name the
law it operates under — that is the whole of the `governing-law` claim — so what is banned is the
**assertion**: `compliant`, `compliance`, `certified`, `accredited`, `fully`, and
`compliant with the GDPR`. Nineteen evasion spellings and eight must-stay-legal sentences are
asserted in `brand.test.ts`. A guard with false positives gets switched off, which is worse than no
guard.

### The ban and the claim are wired together

`brand.test.ts` already asserted that **no allowed claim matches a forbidden pattern**. That single
existing test now does something new: the day someone flips `soc2TypeIIReport`, the claim becomes
allowed, its text matches the ban, and **the suite goes red until the pattern is deleted in the same
change.** A compliance claim therefore cannot be published by a one-character edit. Nobody designed
that interaction; it fell out of two guards being pointed at each other, and it is recorded here so
the next person does not "fix" the red by weakening the ban.

Note the same mechanism now points at an existing claim: `gdpr`'s text is *"GDPR compliant, with a
representative in the Union."* It is withheld today, so the suite is green — but appointing an
Article 27 representative will turn it red, which is the right prompt. Having a representative is
not the same as being compliant, and that sentence should be rewritten when somebody has to look at
it.

### The ban now covers every route, not one

`page.test.tsx` renders the homepage and asserts it matches no forbidden pattern. That covered
**exactly one route.** `/privacy`, `/terms`, `/pricing`, `/integrations`, `/docs`, `/connectors/*`
and `/dashboard` were never checked — and the legal pages are precisely where a compliance claim
would be written, because that is where a reader goes looking for one.

`forbidden-claims.test.ts` scans the **source** of every route instead. Rendering them all was
rejected: several are server components that read a session, a plan or a database, so the test would
assert a fixture rather than the copy. Scanning source also sees strings that never render, and for
a **ban list** specifically that trade is right — a forbidden phrase sitting unrendered in a source
file is one edit away from rendering.

Comments are stripped first, because this repository explains its bans next to the code they bind
and scanning comments would fire on the explanation of the rule. `\uXXXX` escapes are **decoded**
rather than skipped: `"SOC 2"` is "SOC 2" on the page, and this app already writes a baht sign
that way.

### The privacy page named no law

Seven hundred lines describing who holds what, and the notice named **no governing law and no
supervisory authority**. For a Thai entity that is not a stylistic omission: the PDPA is where the
obligations come from, and a reader with a complaint had no route off the page. Rights with no
address are rights on paper. Both are now rows in the controller panel, read from the brand package
like every other value there.

**The GDPR is deliberately still not named there.** Whether it reaches this entity turns on Article
3(2) — on whether the business offers services to data subjects in the Union — and nobody has taken
that decision. Naming a second law in the controller panel would assert that it applies.

A `data-protection-officer` clause was added, marked `open` like the sub-processor and transfer
clauses: no DPO is appointed, the PDPA requires one in defined circumstances, and until that is
determined requests go to the contact address and are answered by the people running the service.

## 3. Cost estimate

**Per connected account per month:** `N/A — no data-plane work.` Five constants, three claims, four
regexes and two tests.

## 4. Platform-terms check

Gates 1 through 17: `N/A` — no credential, no table, no platform call, no PII path, no quota.

**18. Claim provenance.** `PASS`, and this unit is entirely about that gate. It **narrows** what may
be said rather than widening it: two claims declared and withheld, one declared and withheld, four
bans added, and the ban list extended from one route to all of them. `AVAILABLE_CAPABILITIES` is
untouched.

**Result:** `1 PASS, 17 N/A, 0 FAIL`

## 5. What was left out

**This unit claims nothing about whether the controls behind these frameworks exist.** It stops the
claim; it does not do the work. The mapping of which SOC 2 criteria, ISO 27001 Annex A controls,
GDPR articles and PDPA provisions are actually implemented — with the file that proves each, and the
gaps — is the companion unit and lands in `AGENTS.md`.

**No guard checks the `/privacy` clauses against the PDPA's required contents.** The page now names
the law; nothing asserts that what it says satisfies it. That needs a lawyer, not a regex.

**The DPO trigger is unresolved.** Whether this entity meets the PDPA's appointment threshold is a
question for counsel. The clause says so rather than guessing either way.

**Whether the GDPR applies at all is a business decision, not an engineering one.** Article 3(2)
turns on whether the company offers services to data subjects in the Union. Until that is settled,
`euRepresentative` stays null and both GDPR-dependent claims stay withheld.

## 6. Mutation testing

| Mutation | Result |
|---|---|
| `STATUS_VALUE = "SOC 2 Type II certified"` on `/privacy` | `scan=1`, naming `privacy/page.tsx:99` |
| the same claim written as `"SOC 2 compliant"` | `scan=1` — the escape is not a way through |
| `"ISO/IEC 27001 certified"` on `/terms`, a page nothing previously guarded | `scan=1`, naming `terms/page.tsx:76` |

All three reverted. The suite is green at 204 web tests and 59 brand tests, and the nineteen evasion
spellings plus eight must-stay-legal sentences run on every commit.
