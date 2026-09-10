# 29. Making the site say what §11A.1 decided

**PR:** #4 &nbsp;·&nbsp; **Date:** 2026-09-09 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

On 8 September, spec decision **§11A.1** moved the primary customer from "agencies and brands"
to **an owner-run business with no analyst and no IT function**. The decision recorded, in its own
text, the one thing it could not do in its own pass:

> The `positioning` claim in `packages/brand/src/claims.ts` still states the agency-and-brand
> message, and `apps/web` renders it under test.

That contradiction has sat in `main`'s render path through four subsequent rounds — commerce
grain, redaction, the outbox, delivery, cron. `19-sme-repositioning.md` §5 called it "the first
thing to do next". This is that.

**The decision taken:** the positioning claim now reads

> The business-intelligence team a small business does not have. Your own numbers, and the
> verified reason they moved.

and cites `["11A.1", "11.9"]` rather than `["0", "11.9"]`. **`README.md` carries the same
sentence and changed with it** — `00-recon-reports.md` names the README as "an existing claim
surface that must agree with the brand file", and it was the source the original claim was cited
to. Leaving it would have left the repository with two different primary messages.

Two sentences, because §11A.1 is explicit that the correctness guarantee **did not change** —
it "stopped being the pitch and became the substance behind it: the reason an owner can trust a
number they did not compute themselves." The first sentence is the customer; the second is why
they can believe it. 11.9's narrowing still binds the second sentence: *verified root cause*,
never "joins in one call".

**The alternative that was rejected:** writing the new sentence directly in `apps/web`. That is
how the site outruns the specification, and it is exactly what the claims gate exists to prevent.
The string lives in the brand file or it does not exist.

**Geography was left out of the sentence.** §11A.1 says "Thailand first but not Thailand only".
A hero line that names Thailand narrows the product to less than the decision does; a hero line
that says "Thailand first" is a go-to-market fact, not a claim about the product. Neither belongs
in a one-line positioning statement, and the marketing site's own note is where the beachhead
should be argued.

## 2. Cost estimate

**Per connected account per month:** `฿0.00 / $0.00`

No data-plane work. No connector, no schema, no scheduler, no read path, no bought data. The diff
is one claim string, one citation array, one test, and three documents. Nothing here changes
rows/night, restatement depth, Workers invocations, R2 object count, KV writes or Supabase disk,
and nothing touches the polling ratio section 8's open question turns on.

The **static** cost of the site is unchanged: it is a Vercel build with no new dependency and no
new request path.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — no platform call exists in this diff. No token of any kind is read.

**2. Vendor-key exception.** `N/A` — no data source is contacted.

**3. No token pass-through.** `N/A` — the MCP server and OAuth surface are untouched.

**4. Credential hygiene.** `PASS` — the diff adds no credential, fixture or log line. `grep` for
`token`, `secret` and `process.env` across the diff returns nothing.

### Tenancy

**5. RLS.** `N/A` — no table, view or migration.

**6. No service-role bypass.** `N/A` — no request path.

**7. No cross-workspace read.** `N/A` — no query, cache key or aggregate.

**8. No cross-customer aggregation or benchmarking.** `PASS`, and worth stating rather than
marking N/A: a claim is exactly the surface on which a benchmarking promise would first appear.
The new sentence says "**your own** numbers". It promises a business its own data and nothing
derived from anyone else's. The `no-pooling` claim, unchanged, remains the explicit form of it.

**9. API key scope.** `N/A` — no key path.

### Data movement

**10. No resale or redistribution.** `PASS` — nothing moves. The billing units are untouched;
`pricing-two-units` is unchanged.

**11. Meta client list.** `N/A` — no Meta onboarding, workspace lifecycle or deletion path.

**12. Dependency licences.** `PASS` — no dependency added. `pnpm-lock.yaml` is untouched.

### PII and consent

**13. Hash at the edge.** `N/A` — no contact data, no persistence, no prompt.

**14. Forbidden payloads rejected before egress.** `N/A` — no egress.

**15. Per-destination consent.** `N/A` — writes remain deferred (11.4).

### Access tier and quota

**16. Tier reality.** `N/A` — no platform request is made or planned by this change.

**17. No new long-lead dependency.** `PASS` — the new sentence depends on no approval, tier or
partnership. That is deliberate: a positioning claim that needed Meta Full Access to be true
would be a promise with a queue in front of it.

### Claims

**18. Claim provenance.** `PASS`, and this gate is the whole PR. The new sentence comes from the
brand file's allowed-claims list, is rendered through `claim("positioning")`, and is true today:
the product reads a business's own data on its own credentials and reports a verified cause. It
makes no gated promise — no data region, no GDPR, no DPA, all three still withheld by
`allowedClaims()` because `brand.dataRegion`, `brand.euRepresentative` and `brand.dpaAvailable`
are still null. It trips none of the six `FORBIDDEN_CLAIMS` patterns, which the existing
"does not fire on the claims that are allowed" test proves rather than asserts.

One judgement recorded rather than hidden: **"business-intelligence team" is a comparison, not a
capability claim.** It says what the product replaces. The four surfaces that make it true —
dashboard, weekly action sheet, founder questions, consolidated reports — are decided in §11A.2
and **none of them is built**. The claim is therefore true of the product as specified and
premature against the product as shipped. It is a marketing-site question, not a brand-file one:
the site should not render a hero for surfaces that do not exist, and `20-marketing-site.md` is
where that gets decided. The claims gate governs whether a sentence *may* be said; it has never
governed when a page is ready to say it.

**Result:** `8 PASS, 10 N/A, 0 FAIL`

## 4. What was left out

- **`00-recon-reports.md` was not rewritten**, though it quotes the superseded sentence three
  times, once inside its own allowed-claims list. It is a dated phase-0 record of what recon found
  in the README on 7 September, not a live claim surface; rewriting it would falsify the record.
  The README itself, which *is* a live surface, changed.
- **`apps/web` copy was not otherwise touched.** One claim id changed meaning; the page still
  renders the same 23 claims in the same order. Re-cutting the page against the SME customer is
  the marketing-site note's job, and doing it here would widen the PR the brief closed.
- **The `agency-mode` claim was left in place, and left on the page.** §11A.1 keeps agencies as
  "a secondary channel, not the design target", so the claim is still true. Whether a secondary
  channel deserves a section on the front page is a layout question for `20-marketing-site.md`,
  not a truth question for the claims gate. Flagging it rather than deciding it.
- **`19-sme-repositioning.md` was not rewritten.** It is the record of what that round did and
  did not do, and "it is the first thing to do next" was true when it was written. A design note
  is a dated record, not a live document.
- **`20-marketing-site.md` is still owed.** Notes now jump 19 → 21 → … → 29.
- **No name went on the site.** `brand.productNameSettled` is still false; `productName()` still
  returns null; the eyebrow still reads "A marketing data plane". Founder decision 2 is open.

## 5. Open or unverified spec items this builds on

**One, and it is a decision rather than an unverified fact.** §11A.1 itself is a positioning bet
taken on 8 September, informed by `docs/SME-POSITIONING-AND-FINDINGS.md` — which carries its own
sourcing note saying the competitive landscape "was recorded as it was given" and not produced
the way the specification's own findings were.

**If §11A.1 is reversed**, this change reverses with it: one string, one citation, one test
expectation. That is the argument for putting it in the brand file rather than in twelve places
across a site. The blast radius of a positioning reversal is now three lines.

Nothing else. This change builds on no platform behaviour, no rate limit, no restatement window
and no unresolved Meta or Google question.

## 6. Verification

| | |
|---|---|
| `pnpm -r test` | pass — **397 unit tests**, up from 396 |
| `packages/brand` | 20 tests, up from 19 |
| `apps/web` | 24 tests, unchanged — the site still renders every claim it names |
| `pnpm exec biome lint .` / `format .` | pass |
| `pnpm -r typecheck` | pass |
| `pnpm -r build` | pass |
| `pnpm check:brand` | pass |
| `pnpm check:tokens` | pass |

`apps/api-edge` prints `workerd` stack traces during its run (`Network connection lost`,
`FixedLengthStream`). Expected noise from the miniflare pool; its 65 tests pass.

### The mutations

The new test is `"positions on the primary customer 11A.1 names, not the one it replaced"`. Each
mutation was confirmed present in the file before the suite was run, per the discipline
`HANDOVER.md` §4 records — twice this project has believed a survivor that never landed.

| Mutation | Caught by |
|---|---|
| Restore the **exact** superseded string | `expected '…' not to contain 'Verified root cause and an operated c…'` |
| Revert the citation to `["0", "11.9"]` | `expected [ '0', '11.9' ] to include '11A.1'` |
| Delete the `positioning` claim entirely | `the positioning claim was removed rather than reconciled` |
| Replace it with a third sentence that is neither | `expected 'Your numbers, and the verified reason…' to match /small business/i` |

**The first row is a correction, and it is the useful part of this note.** The test as first
written asserted only that the claim did not match `/\bagenc(y|ies)\b|\bbrands\b/i`, and the
mutation run against it appended *"for agencies and brands"* to the old sentence — so it tested a
string that had never been in the file. **The real superseded text contains neither word:**

> Verified root cause and an operated correctness guarantee over your own ad, analytics and search data.

The audience lived in §11A.1's prose *around* the sentence, never inside it. A straight `git
checkout` of the old line would have passed the first version of this test, which is precisely the
route by which the old pitch comes back. Verified directly:

```
$ node -e '…/\bagenc(y|ies)\b|\bbrands\b/i.test(old)'
old assertion would have caught it: false
```

The test now asserts the superseded string by name and asserts that the replacement says *small
business*, which is what makes the positive half load-bearing rather than decorative. The keyword
filter is kept as a forward guard against the audience reappearing inside the sentence.

**Caught by review, not by the mutation run** — `chatgpt-codex-connector` on PR #5. The lesson is
narrower than "mutation testing failed": the mutation was invented from the *description* of the
old claim rather than copied from the file, so it tested a strawman. **Take the mutation from
`git show`, not from memory of what the thing said.**

The delete-the-claim row still matters most among the rest. `claim("positioning")` already throws
at build time on an unknown id, so a deletion breaks the site loudly — but as a *build* error with
no explanation, and the next person restores the old sentence from history.
