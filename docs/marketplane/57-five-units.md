# 57. Five units: two drivers, the offline page, Google sign-in, and what a plan actually buys

**PR:** #38 &nbsp;·&nbsp; **Date:** 2026-09-12 &nbsp;·&nbsp; **Status:** proposed

<!-- Shares a PR with note 56 because #38 was still open when this work landed. Two notes, one PR,
     rather than one note covering work it was not written for. -->

---

## 1. What this is, and the decision taken

Five units, built in parallel by five agents and each checked by a sixth prompted to refute it:

1. **Meta Ads and Search Console backfill drivers.** Three of five connectors had a client and a
   contract but no driver. Two now have one.
2. **`/envelope`** -- MVP plan step 10. Five normalisers run against committed fixtures at render
   time, then one field of one row is nulled and the schema's refusal is rendered verbatim.
3. **Google sign-in**, behind `NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED`, with the work-email rule applied
   to the OAuth identity.
4. **`PLAN_ENTITLEMENTS`** -- what each plan buys, as data.
5. **Gate 18 closed** -- the three unsourced `/pricing` claims backed or deleted.

**The decision, and the alternative rejected.** Every unit could have been verified by its own
builder. That was rejected: a builder checking its own work re-reads its own reasoning, and the
failure mode on this repository has never been bad reasoning, it has been *invented facts stated
confidently*. So each unit got an independent agent told to refute it, given the builder's own
report as the thing to attack. **All five came back `needs-fixes`, and four of the findings were
things no test would ever have caught** -- a page asserting something false about the repository, a
header claiming one caller where there was one caller and four mentions, a test comparing a constant
with itself, and three copies of deleted marketing surviving on pages outside the deleting change.

The cost is roughly double the tokens. The thing it bought is listed in section 6.

## 2. Cost estimate

**Per connected account per month:** `unchanged -- no scheduled work is added`

The two drivers are the first units here that touch the data plane at all, and they add no
*scheduled* cost: nothing calls either one yet. What they fix is the shape of the cost when
something does, and the two clocks pull in opposite directions:

| Term | Meta Ads | Search Console |
|---|---|---|
| `RESTATEMENT_CLOCKS[...].windowDays` | `28` | `null` |
| Window source | `planBackfill`, newest first | the driver's own chunks, oldest first |
| Requests per run | one per window per page, plus **one** `getAdAccount` | one per report per chunk per page |
| Ceiling that binds | 10 async breakdown jobs per ad account per day | 1,200 queries/minute per site |

The `getAdAccount` call is the cost line worth naming: it is read **once per run**, not per window,
because a per-window read would multiply the cheapest call in the connector by the plan length --
and a run that read the zone twice could date two windows of one run differently.

Search Console's chunk size is `SEARCH_CONSOLE_BACKFILL_CHUNK_DAYS = 1`. That is stated in the file
as an admission rather than a measurement: no cardinality measurement for any real property exists
in this repository, so 1 is the value that assumes nothing. A caller who measures should widen it.

Nothing here changes the polling ratio section 8 names as the thing that would collapse the ~98%
performance margin, because nothing here schedules a poll.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` -- both drivers take a client the caller constructed and never read a credential
themselves. No `process.env.*_ACCESS_TOKEN` appears in either. `/envelope` reads no credential at
all; that is its defining property.

**2. Vendor-key exception.** `N/A` -- no company-held key is used.

**3. No token pass-through.** `PASS` -- the Google OAuth flow goes through Supabase Auth, which
issues our own session. No upstream Google token is forwarded anywhere, stored, or logged.

**4. Credential hygiene.** `PASS` -- the one new secret path is Google's client secret, held in the
Supabase project rather than this repository. On refusal the OAuth callback calls `signOut()` rather
than leaving a rejected identity holding a session.

### Tenancy

**5. RLS.** `N/A` -- no new table, and no migration in this change.

**6. No service-role bypass.** `PASS` -- nothing added here uses the service role. The OAuth callback
runs as the visitor it just authenticated.

**7. No cross-workspace read.** `PASS` -- neither driver knows what a workspace is; both take a
client and windows and yield batches. `/envelope` reads fixtures on disk.

**8. No cross-customer aggregation.** `PASS` -- no aggregate is computed anywhere in this change.

**9. API key scope.** `N/A` -- unchanged.

### Data movement

**10. No resale or redistribution.** `PASS` -- the billing unit is still a subscription per
organisation. `PLAN_ENTITLEMENTS` denominates an allowance in *connected accounts*, which is a count
of connections the customer owns, **not** a count of platform rows or records. That distinction is
the one specification 11.3 turns on and it was deliberate.

**11. Meta client list.** `N/A` -- the driver reads insights; it does not onboard an account or
create a client record. The obligation attaches at connection time.

**12. Dependency licences.** `PASS` -- no dependency added. The only `package.json` change is two
`workspace:*` links.

### PII and consent

**13. Hash at the edge.** `PASS`, and worth one line because a verifier checked it rather than
assuming: `woocommerce/fixtures.ts` carries real-looking names, emails and addresses on purpose, and
`/envelope` renders WooCommerce rows. The normaliser drops them -- an `EnvelopeRow` has no field
that could hold one -- and the verifier confirmed no WooCommerce PII appears in the rendered HTML.

**14. Forbidden payloads.** `N/A` -- no egress.

**15. Per-destination consent.** `N/A` -- nothing here is destined for Google or Meta.

### Access tier and quota

**16. Tier reality.** `PASS`. Meta's driver spends one `getAdAccount` per run and its insights pages
go through the existing client, which already carries the usage reading and stops on a throttle;
whether `getAdAccount` counts against the 10-per-ad-account-per-day async cap is **not established
anywhere readable**, and the file says only that the call is made once rather than claiming it is
free. Search Console's chunking is what bounds its request count, and the driver runs every report
of a chunk before starting the next so a refusal leaves a clean boundary.

**17. No new long-lead dependency.** `PASS` -- neither driver needs an approval beyond what the
existing clients already assume. Google sign-in needs an OAuth client, which is a form rather than a
review: basic email/profile scopes are not sensitive scopes.

### Claims

**18. Claim provenance.** `PASS`. This is the change that *closed* the standing exception in note 56,
and the detail is recorded there rather than duplicated here. In summary: refresh cadence and the
feature matrix deleted, connector counts rebound onto `PLAN_ENTITLEMENTS` and renamed to
"Connected accounts", and three further copies removed from `FaqCta.tsx`, `IntegrationsMap.tsx` and
the Shopify connector page -- the last of which had been *contradicting* the new `/pricing` text.

The allowance figures themselves still have no source but the supplied design. They are publishable
because an allowance is a promise the company makes rather than a capability it claims, and
under-enforcement cannot falsify it. A catalogue count asserts something exists, which is why
"200+ integrations" could not survive in any wording.

**Result:** `11 PASS, 7 N/A, 0 FAIL`

## 4. What was left out

* **`google_ads/backfill.ts`** -- the third missing driver. Out of scope; the brief named two.
* **Any enforcement of the allowance.** Deliberate, and the reason is in `entitlements.ts`:
  `20260908000700_rls.sql` grants `insert, update on public.connections to authenticated` with a
  `connections_insert` policy, so a signed-in member can POST a connection straight to PostgREST.
  An allowance enforced in app code would be a suggestion any client could skip -- the same mistake
  as putting tenancy in application code instead of RLS. It belongs in the database when it comes.
* **A default span for the Search Console driver.** How long a Search Console figure keeps moving is
  unmeasured -- that is what the null clock *means* -- so any default would be an invented number
  deciding how much of a customer's history gets re-read. The caller supplies the span.
* **A cross-check between Meta's account `currency` and each row's `account_currency`.** The
  normaliser owns row-level refusals; a second opinion in the driver is the duplication
  `woocommerce/backfill.ts` warns about.
* **The Google sign-in button's copy in `_content-auth.ts`.** Every string it renders is an existing
  `AUTH.*` member; nothing new was written.

## 5. Open or unverified spec items this builds on

* **Meta's `action_attribution_windows` parameter accepting all seven values in
  `META_ACTION_WINDOWS`** is unverified against a live call -- `1d_ev` is the least certain. The
  default report asks for all seven, so a rejection fails the whole request loudly rather than
  silently, and the repair is one constant.
* **Whether Meta returns `date_start`/`date_stop` without their being named in `fields`.** If it does
  not, the normaliser refuses with `missing_date` rather than mis-dating anything.
* **Every fixture in this repository is synthetic**, and `/envelope` now says so on the page. The
  drivers' tests therefore prove them against a *believed* response shape. If a recorded response
  ever differs, the fixture is right and the code is wrong.
* **Search Console's restatement window remains null.** Nothing in this change sets one, and nothing
  should until it is measured.
* **Whether `getAdAccount` counts against Meta's async-job cap** -- see gate 16.

## 6. Verification

Every step checked by **exit code**, not by reading its output:

```
pnpm exec biome lint .        exit 0
pnpm exec biome format .      exit 0
pnpm typecheck                exit 0
pnpm -r test                  exit 0   -- 1075 passed, 0 failed, 12 packages
pnpm build (apps/web)         exit 0   -- 25 routes
node scripts/check-*.mjs      exit 0   -- 8/8
./supabase/tests/run-local.sh          -- 388 passed, 0 failed
```

That phrasing is not decoration. The first push of this work went red on CI's Format check: the
local run had printed an empty result for that step and the blank output was read as a pass, when
the step had exited 1 and said so only in its status. **A gate read by eye is not a gate.**

### What the five verifiers found, since that is the record worth keeping

| Unit | Finding that mattered |
|---|---|
| Backfill drivers | A run with `windows: []` spent the `getAdAccount` call and then returned a clean completion having read nothing -- indistinguishable in a log from a successful pull. Also a test asserting `META_DEFAULT_REPORT.attributionWindows` equals `META_ACTION_WINDOWS`: the same object, so narrowing the list moved both sides together and the test could never fail. |
| `/envelope` | The page stated "every fixture file says so in its own header". Four of five do; `woocommerce/fixtures.ts` uses the word zero times. The substance was true of all five and the sentence was still false. Two of its tests could not fail. |
| Google sign-in | `biome lint` failed on the new file -- a control-character regex with no suppression, where the repo already had the precedent one line away. The change also claimed the disabled page was "exactly the page it is today"; the divider had been unconditional. |
| Entitlements | The header claimed `current_plan` had two callers (one), and that a connections row comes into existence "exactly one way" (two -- the RLS grant is the second, and it is what decides where a gate must live). |
| Pricing claims | The three deleted claims were alive on three other pages, one of them **contradicting** the page that had just deleted them. |

And one finding that came from running the build rather than from any agent: adding `/envelope`
pulled four packages into the web app's module graph for the first time, and `next build` failed
with 21 `Module not found` errors. `tsconfig.base.json` had predicted exactly this in writing. 103
specifiers across contract, connectors, extract and payloads now name the file that exists, and
`check-capabilities.mjs` -- which had hard-coded `\.js` in its barrel matcher, making it a second
copy of that same convention -- matches either extension now.

Both new refusals in the Meta driver and the relaxed capability guard were mutation-tested:
removing each fails exactly the test written for it and nothing else.
