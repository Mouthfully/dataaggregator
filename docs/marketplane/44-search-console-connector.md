# 44. The Search Console connector, and a source whose rows do not add up

**PR:** _unassigned at the time of writing_ &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp;
**Status:** proposed

---

## 1. What this is, and the decision taken

`packages/connectors/src/sources/search_console/` — `client.ts`, `normalize.ts`, `fixtures.ts` and
their two test siblings, the §13.3 connector unit less `backfill.ts`. It is the second Google
connector and it reuses everything the first one established: the same OAuth provider and client
(`packages/oauth/src/providers.ts` already declares `webmasters.readonly`), the same
quota-aware HTTP layer, the same envelope. It needed **no dictionary change, no enum change, no
migration and no new credential lane** — `clicks` and `impressions` were already in `METRICS`,
`property`, `query` and `page` were already in `ENTITY_TYPES`, `search_console` was already in
`SOURCES`, `RESTATEMENT_CLOCKS` and `REDACTION_POLICIES`. Each of those was verified rather than
assumed before a line was written.

**The decision this connector turns on: Google withholds rows, so the connector refuses to let
anybody add up the ones that arrive.**

Search Console applies an anonymity threshold and drops low-volume queries. A query-grain response
is therefore a *subset*, and its sum is lower than the property's own number by an amount nobody can
compute — arriving as well-formed data, with no field, header or count anywhere in the response
marking the gap. A connector that hands those rows back bare has produced the exact failure this
product is sold against: a total that is quietly too low, with nothing saying so.

Three things follow, and they are the shape of the whole unit:

1. `normalizeSearchAnalytics` returns a **struct, not an array** — deliberately unlike
   `normalizeGa4Report`. The envelope row has no field that can carry "these rows are a subset", so
   if the rows came back bare the one fact a caller most needs would be the one fact the call did
   not return. `anonymityThresholded` is handed over whether the caller wants it or not.
2. `totalsByDate` **exists in order to throw.** Adding the rows up is the obvious thing to do with
   them and it is the one thing that must not happen at query grain. A comment saying "do not sum
   these" is a comment; a function that every caller reaches for and that refuses by grain is a
   control. At `property` grain it does sum, because a date-only response *is* Google's own total.
3. The reports are pulled as a **pair**, not as a choice. `SEARCH_CONSOLE_REPORTS.totals`
   (`["date"]`) returns Google's number including anonymised queries; `byQuery`
   (`["date", "query"]`) returns the diagnostic detail. Stored at two entity grains, the difference
   between them *is* the anonymity gap, stated rather than hidden. Pulled apart, the query rows are
   a total that is wrong.

The rejected alternative was to emit query rows alone and document the caveat. It is one request
cheaper per window and it puts the warning in a place — a design note — that no downstream query
reads.

### The grain, argued against the enum rather than invented

Search Console's `query` and `page` dimensions are **already members of `ENTITY_TYPES`, spelled
identically**; the map is the identity function, which is itself the argument for using the enum's
existing values. A date-only report lands on `property`, which is also Search Console's own word —
its UI calls a site a property — with `native_entity_type: "site"` carrying the API's path segment.

`url` was the alternative for the page grain and was rejected. In the `dbt_ad_reporting` lineage the
canonical list comes from, `url` sits beside `keyword` and `geo` as an attribute of an *ad* (its
final URL); Search Console's `page` is a unit of the **site's own content** and the platform calls
it `page`. Choosing `url` would have been inventing a synonym for a value that already exists.

**Country, device and search-appearance are refused, not half-supported.** `country` would plausibly
land on the existing `geo` type; `device` and `searchAppearance` have no home in the canonical grain
at all. Each needs a decision recorded before a row can carry it, and until then a report asking for
one is refused *before* it costs a request.

**A composite grain is refused too**, and this is the sharper of the two refusals.
`["date", "query", "page"]` is a legal and useful Search Console report, and there is no
`query_page` member of `ENTITY_TYPES` to land it on. Emitting it at `query` grain silently discards
the page half of the key and collapses several genuinely distinct rows onto one id; emitting it at
`page` grain does the same the other way. Refusing is the only option that neither invents an enum
value nor loses half of every row — and inventing an enum value is a migration this change is
deliberately not making.

### The entity id carries its grain, and this is the first source that needs it

The §7 upsert key is `(source, account_id, entity_id, date, attribution_window)`. **It does not
include the entity type.** Search Console is the first connector in this repository to emit two
grains for one account on one date, and a search query can itself be a URL — somebody typing
`https://example.test/shoes/running` into Google produces a query-grain row whose raw id is
byte-identical to a page-grain row's. Unprefixed, those two upsert onto each other and one of the
two numbers disappears.

So `entity.id` is `query:running shoes`, `page:https://…`, `property:sc-domain:…`, and
`entity.native_id` keeps the platform's value unprefixed so nothing downstream has to unpick the
namespace. There is a fixture and a test for exactly this collision; without the prefix, three tests
fail.

### Three fields the envelope demands that Search Console does not report

| Field | What this connector puts there, and why it is a statement rather than a default |
|---|---|
| `dimensions.currency` | **`XXX`** — the ISO 4217 code for "no currency involved". Search Console reports no money at all. The rejected alternative, stamping the workspace's currency on the row, passes the schema and asserts something false: it denominates a click count and invites the FX layer to convert it |
| `dimensions.timezone` | **`America/Los_Angeles`**, a documented constant rather than a reading. GA4 sends `metadata.timeZone` per property, so a GA4 row's timezone is an *observation*; Search Console sends nothing and documents a Pacific reporting day for every property. A workspace default would be worse than stale — it would assert that a Bangkok customer's Search Console day ends at midnight ICT, and a join against a GA4 property set to `Asia/Bangkok` would then silently compare two different days |
| `dimensions.attribution_window` | **`null`, and here that is the label.** Clicks and impressions are counts of what happened; nothing is attributed to anything. `envelopeRowSchema` permits null for precisely this row shape and refuses it the moment a conversion metric appears, so this is the schema agreeing rather than being dodged. GA4 needed `model` because it carries conversions; this connector does not |

Being explicit about the second one: `SEARCH_CONSOLE_TIMEZONE` is a fact about Google transcribed
into code, which means it can go stale silently in a way an observation cannot. If Google ever moves
its reporting day boundary, no response will say so and every row this connector has emitted becomes
mislabelled by up to a day. It is a constant with a comment saying so, which is the best available
answer, not a good one.

### Why this client looks nothing like the GA4 client

The GA4 client is shaped by one fact: `propertyQuota` comes back in the body, so it can measure what
it spent and stop at a floor before it eats the customer's own allowance. **A
`searchAnalytics.query` response carries no quota information of any kind.** There is nothing to
measure, so there is no floor to implement, and inventing a budget would produce a number that looks
measured and is not — the failure `parseMetaThrottle` already refuses elsewhere in this repository.

What replaces it, given the published ceilings (§3.2 / Search Console limits): 1,200 QPM **per site
and per user**, 40,000 QPM and 30,000,000 QPD per project, *plus* "undocumented load quotas over
10-minute and 1-day windows that can trigger errors before published limits". A limit that is both
undocumented and lower than the documented one cannot be planned against at all. So the client
spends as little as the work allows and treats a quota rejection as expected control flow:
sequential requests, the largest page the platform permits, the two smallest report shapes that
answer the question, and nothing retried that retrying cannot fix.

**Five defaults are sent explicitly, each because its silent change alters what the number means:**

| Sent | Platform default | What the default costs |
|---|---|---|
| `rowLimit` | **1,000** | A report that hits it comes back truncated with no error, no total and no cursor. The same trap as GA4's 10,000 — and worse, because GA4 at least returns `rowCount` to check against |
| `startRow` | 0 | Harmless alone; load-bearing with the above |
| `dataState: "final"` | `final` | See below. Transcribing a default is not the same as choosing it |
| `type: "web"` | web | The envelope has no dimension for search type, so a web row and an image row would be stored as the same thing and a change in Google's default would change what every historical row means |
| The dimension list | — | Validated by the normaliser's own `grainFor` *before* the request is built. The refusal is the normaliser's either way; raising it here costs nothing, raising it after the response costs a round trip against a shared per-site ceiling |

`dataState: "final"` is a decision and not a transcription. `"all"` includes fresh data Google itself
labels incomplete and that will change, and `RESTATEMENT_CLOCKS.search_console.windowDays` is
`null` — nobody has measured how long a Search Console figure keeps moving — so this connector has
no model of how much `"all"` would move or for how long. **The cost is accepted and is real:** under
`final`, recent days return fewer rows or none, so the backfill planner's D-0 to D-3 tier will see
empty responses at its newest end. An empty response is not an error here; it is the platform saying
"not yet", which is true and is a better answer than a number that will be different tomorrow.

### Paging, where this platform gives nothing to stop on

GA4 knows when it is finished: `rowCount` states the total. **Search Console publishes no row total
and no cursor.** The only end-of-report signal is a page shorter than `rowLimit` — which means a
page *exactly* equal to `rowLimit` is indistinguishable from the last page of a report that divides
evenly, so the final request of any full report always returns nothing. That is the correct trade:
one spare request against a report that silently stops short.

It also means a response that always returns exactly `rowLimit` rows has **no termination condition
at all**, and a generator with no termination condition inside a Workflow step is a timeout rather
than an error. `SEARCH_CONSOLE_MAX_PAGES` turns that into a refusal that names itself, and it
refuses rather than stopping, because a report that stops early and reports success is the failure
this connector exists to refuse.

## 2. Cost estimate

**Per connected account per month: `$0.000` today, and `$0.005` at the margin for a small site,
`$0.041` and rising for a large one.** Every line falls inside an included tier at one connected
account, so the honest figure is two numbers: the share of the inclusions consumed, and the rate the
account would face once the inclusions are gone. Derived below, not asserted.

**Assumptions, stated so they can be argued with:** one Search Console property per connected
account; steady state, not first run; the default report pair (`totals` + `byQuery`) per window;
`~320 bytes` per stored `envelope_rows` row all-in including the primary-key index (`raw` is an R2
key, never JSONB — §7's most-likely-to-break line depends on it); two site sizes, **500** and
**25,000** surviving query rows per day. R2 is keyed per
`(source, account, date, window, fetched_at)`, which carries no page component, so the object count
is bounded above by the request count and is used as such below. Unit prices are the ones already recorded in
`00-recon-reports.md` against Cloudflare's and Supabase's published pages.

**Windows per day: 4.** `planBackfill("search_console")` reads `windowDays` as `null`, so
`clock.windowDays ?? 0` gives a zero-day window and **the weekly tier does not exist at all** — only
D-0 to D-3. `08-backfill-planner.md` already records this as "Search Console 4". A source with no
published window gets no ladder to climb, which is correct here for the same reason the null is.

| Term | Small site (500 queries/day) | Large site (25,000/day) |
|---|---|---|
| Platform requests | 4 windows × (1 totals + 1 byQuery) = **8/day, 240/month** | byQuery pages at 10,000 → 3 requests; 4 × 4 = **16/day, 480/month** |
| Envelope rows stored | 30 property + 15,000 query = **15,030/month** | 30 + 750,000 = **750,030/month** |
| Supabase disk @ $0.125/GB | 4.8 MB/month; 58 MB in year one = **0.7% of the 8 GB included**; marginal **$0.0006/mo** | 240 MB/month; 2.9 GB in year one = **36% of the 8 GB included, from one account**; marginal **$0.030/mo and cumulative** |
| R2 objects, Class A @ $4.50/M (1M free) | 240 = 0.02% of free tier; marginal **$0.0011/mo** | 480; marginal **$0.0022/mo** |
| R2 storage @ $0.015/GB-mo (10 GB free) | 7.8 MB/month, 94 MB/year = 0.9% of free; marginal **$0.0001/mo** | 390 MB/month, **4.7 GB/year = 47% of the free tier from one account**; marginal **$0.006/mo** |
| Workflow steps @ $0.80/100K (500K free) | 3 steps × 4 windows × 30 = 360 = 0.07% of free; marginal **$0.0029/mo** | 360; **$0.0029/mo** |
| Workers requests + CPU-ms | ~270 requests, ~4,800 CPU-ms; both under 0.02% of inclusions; marginal **$0.0002/mo** | ~510 requests, ~0.1M CPU-ms; marginal **$0.0002/mo** |
| KV | **$0.00 — not used, deliberately** | **$0.00** |
| Bought data | **$0.00 — the Search Console API is free of charge (§3.3)** | **$0.00** |
| **Marginal total** | **≈ $0.005** | **≈ $0.041 in month one, rising with cumulative disk** |

**The ratio between the two columns is eight to one and every bit of it is query cardinality.** That
is the cost driver and it is a dimension the *customer* controls, not one this repository chooses.
It is also the first line in the model that grows without bound: the daily tier never prunes, stored
rows accumulate, and by month twelve the large account's history alone is costing roughly
`$0.36/month` in Supabase disk and holding half of R2's free tier. The lever, if it is ever needed,
is the grain — `byQuery` is optional in a way `totals` is not.

**KV is $0.00 on purpose and it is worth one sentence.** An envelope cache keyed per row is the
documented KV failure mode at $5.00/million writes with 1M included, and a query-grain source is the
worst possible thing to key that way: 15,000 writes/month for a small account, 750,000 for a large
one — one large account would consume three quarters of the inclusion on its own.

**On §8's open question**, the sharpest caveat in the template: whether platform limits force
3×–5× redundant polling and collapse the ~98% margin. **This connector runs at exactly 4×**, which
is inside that band and is not an accident — the D-0 to D-3 tier reads each calendar date four
times and then never again. And here the 4× is harmless, for a reason specific to this source: it
multiplies a platform cost of **zero** (the API is free of charge) and an R2 write line of
$0.0011/month. It does *not* multiply stored rows, because re-pulls upsert onto the same
`(source, account_id, entity_id, date, attribution_window)` key. This is the first source in the set
where the specification's warning is real in shape and harmless in money, and the reason is that
Google does not charge for it.

Three standing caveats, repeated rather than assumed away: §8 marks the performance COGS and the
~98% margin **unverified**; §7's table has no disk-growth term by its own checker's admission, which
is precisely the term this connector moves most; and this PR touches no scheduler, so the ratio
above is what the planner already produces rather than something this change decides.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` — `accessToken` is a required argument documented as *the customer's*, opened
from the per-workspace vault per request. No `process.env` read anywhere in the unit, no company-held
key, no developer token, no service account, no GCP project the tenant did not obtain. The same
Google OAuth client as GA4, with `webmasters.readonly` already declared in
`packages/oauth/src/providers.ts`.

**2. Vendor-key exception.** `N/A` — no company-held key.

**3. No token pass-through.** `N/A` — no MCP surface. Worth the note GA4's client note also makes:
the token is a parameter, so a handler physically cannot forward a client token it never obtains.

**4. Credential hygiene.** `PASS`, and **tested rather than asserted** — a test drives an
unparseable body and asserts the resulting message contains the site and **not** the token. An error
message is a log line, and a bearer token in a log is a credential under a different retention policy
with a different audience. The token-death path is `@repo/extract`'s: a 401 classifies as `auth`,
is not retried, and reaches `recordFailure` in `@repo/connections`. No fixture carries a credential.
The one ambiguity in that path is named at gate 16 and in §5 rather than papered over.

### Tenancy

**5. RLS.** `N/A` — no table.

**6. No service-role bypass.** `N/A` — no database access.

**7. No cross-workspace read.** `PASS` — one site per call, the credential supplied per call, no
module state and no cache. There is no shared key for a tenant to be missing from.

**8. No cross-customer aggregation or benchmarking.** `PASS`, and this gate is sharper here than it
was for GA4. `totalsByDate` is the only aggregation in the unit; it sums within one response for one
property and refuses outright on a thresholded grain. No percentile, median, industry average, peer
comparison or leaderboard. **The temptation this source uniquely offers** — pooling query strings
across tenants into a "what people are searching for" dataset — is exactly what Meta 3.a.iv and
Google's redistribution clause make a termination risk, and nothing here retains a query beyond the
call that returned it.

**9. API key scope.** `N/A`.

### Data movement

**10. No resale or redistribution.** `PASS` — rows are returned to the caller and nothing else.
Nothing here is billed, and §9's decision stands: Search Console is a free join inside `diagnose`,
never a billable endpoint, because the API is free of charge and a markup is indefensible. **Build
it, do not meter it.** No billing unit in this diff is denominated in platform rows.

**11. Meta client list.** `N/A` — Google.

**12. Dependency licences.** `PASS` — **no dependency added**; `pnpm-lock.yaml` untouched. The
package's existing workspace dependencies (`@repo/contract`, `@repo/extract`) are unchanged.

### PII and consent

**13. Hash at the edge.** `PASS`, **with a caveat that must be stated rather than waved through.**
Nothing in this unit persists, logs or prompts — it returns rows to its caller. But a Search Console
query string is **free text a person typed**, and a person can type an email address or a name into
Google. That text reaches `entity.native_id`, `entity.id` and `raw`.

This is a pre-existing, recorded decision rather than something this PR introduces.
`REDACTION_POLICIES.search_console` already declares `verbatim` with the reasoning written down:
Google applies its own anonymity threshold upstream and withholds low-volume queries, **which is a
dependency on Google's behaviour rather than a property of ours**, and the policy says so.
`25-payload-redaction.md` §2 names Search Console as exactly the shape the module cannot protect —
personal data inside a *value*, under a key no keep-list could drop without losing the row. This PR
adds no new exposure and changes no policy; it does add the row path, where a query reaches Postgres
as an entity id. Carried forward in §4 and §5, not fixed here — a value-level rule is different work
with a different failure mode.

**14. Forbidden payloads rejected before egress.** `N/A` — read path; nothing is sent to a platform.

**15. Per-destination consent.** `N/A` — writes remain deferred past MVP (§11.4).

### Access tier and quota

**16. Tier reality.** `PASS`, and this gate is the client's subject. Against 1,200 QPM per site and
per user, the derivation above gives **8 requests/day** for a small account — under 1% of a single
minute's per-site budget even if all eight fired together — and 16 for a large one. Rejected
requests do not storm: a 401/403 stops at one attempt because `classify` marks it non-retryable, a
429 waits for `Retry-After`, and the page cap refuses rather than looping.

**Per-source budget consumption is NOT in the envelope, and unlike GA4 it cannot be.** GA4 parses
`propertyQuota` per page and is blocked only by the envelope having no `meta` field for it. Search
Console reports **no quota at all**, so there is nothing to publish. That is stated here rather than
satisfied with an invented number.

**One ambiguity this client cannot resolve from where it sits**, recorded because it is a real risk
and not a hypothetical: `@repo/extract`'s `classify` reads **403 as `auth`** and refuses to retry it,
which is right for a dead grant. Google APIs have historically also returned 403 with a
`rateLimitExceeded` reason for quota, and `fetchWithRetry` deliberately never reads a body — so from
here a quota 403 and a revoked grant are the same event, and a quota 403 would flip a healthy
connection to `needs_reauth`. **Softening the auth path on a suspicion is the wrong fix**: it would
delay the reconnect prompt for every genuinely dead grant in order to hedge one unmeasured case. One
live over-quota call settles it; §5 says so.

**17. No new long-lead dependency.** `PASS` for the code, **with a named gate**. No developer token,
no access review, no audit — which is why Search Console sits beside GA4 as pure
bring-your-own-credential (`10-credential-model.md`). The gate that could bite is
`webmasters.readonly`'s **unconfirmed sensitive-scope status**: Google's OAuth scopes page does not
list the webmasters scopes at all, `22-access-models.md` records an attempt to close this that
failed, and if it *is* sensitive then Search Console falls behind the same unbounded verification as
GA4 — documented at 3 to 5 days, **observed at over ten weeks, and never to be quoted as the former**.
The degraded path is the one GA4 already runs: a testing-mode OAuth client with allow-listed design
partners, workable for design partners and fatal for self-serve signup. This PR does not depend on
the answer; the launch connector list does.

### Claims

**18. Claim provenance.** `PASS` in this diff — **no user-visible string is added or changed** — and
it hands on a decision that is deliberately not taken here.

`node scripts/check-capabilities.mjs` now **FAILS, and that is the guard working exactly as
designed.** A source with both `client.ts` and `normalize.ts` is claimable, and
`packages/brand/src/claims.ts` names only `ga4` and `woocommerce`. As of this writing the guard
reports **three** findings — `google_ads`, `meta_ads` and `search_console` — because three
connectors are in flight at once; `43-claims-guards.md` §4 independently recorded the same finding
and reached the same conclusion, that it belongs to the connector changes and that `claims.ts` was
deliberately not edited.

**`claims.ts` is outside this PR's scope and was not touched.** Beyond scope, there is a reason not
to want it touched here: the change would make the site render *"Reads GA4, Search Console and
WooCommerce on your own credentials."*, and whether that sentence is true today is a judgement — the
connector is code, not a running scheduler, and §11A.14 puts Search Console behind the fifth-connector
gate. Making a marketing claim render as a **side effect** of adding two source files is precisely
the decision the guard exists to force somebody to take deliberately. The exact edit is listed in §4.

**Result:** `10 PASS, 8 N/A, 0 FAIL`

## 4. What was left out

### `position`, and the case for it

**This is the omission that costs the most, and it is not a matter of taste.** Search Console returns
`position` on every row and the connector reads it and drops it. What adding it actually requires:

1. **A third member of `METRICS`'s unit union**, today `"currency" | "count"`. An average position is
   neither. It is a **mean of 1-based ordinals and it is not additive** — you cannot sum positions
   across days, across queries or across anything else, and re-aggregating Search Console's own
   impression-weighted average requires weighting by impressions. So the third unit is not cosmetic
   labelling: it is the flag that tells every downstream aggregator *do not `SUM` this, and do not
   `AVG` it either*. Getting that wrong produces a number that looks like a rank and is not one.
2. **A new `envelope_rows` column.** `metricsSchema` maps one-to-one onto columns, and
   `check-dictionary.mjs` asserts the TypeScript and the SQL are the same lists in the same order.
3. **A change to `app.upsert_envelope_row`'s signature.**
4. Therefore **a migration** — which is currently being touched by concurrent work, and which
   `00-repo-map.md` is explicit belongs in its own change rather than riding along in a connector.
5. And **the re-aggregation rule itself**, stated in the store rather than discovered by whoever
   writes the first `AVG(position)`.

**What the connector loses meanwhile.** Issue #13 argues position answers a large share of "why did
my traffic drop?", and the mechanism is concrete. An owner facing a drop is facing one of three
causes, which call for opposite actions:

| Cause | Impressions | Position | CTR | Action |
|---|---|---|---|---|
| The query got less popular | down | flat | flat | Nothing to fix; demand moved |
| We ranked worse | flat-ish | **down** | down | An SEO problem |
| The SERP changed around us | flat or up | **flat** | down | Still ranked first, nobody clicks — the AI Overview case §10.1 is built on |

With clicks and impressions only, **the second and third are indistinguishable**, and they are the
two that need a decision. §4.1's diagnostic tree asks for ranked causes *with evidence*; without
position this connector can evidence one branch of three and has to guess between the other two. It
also weakens the single unoccupied cell §10.1 identifies — query-grain paid performance against AI
Overview citation status — because that comparison is much thinner without organic rank beside it.

**The recommendation is a follow-up PR**: one migration (unit member, column, upsert signature), one
store-layer statement of the impression-weighted rule, and a **three-line change** to
`SEARCH_CONSOLE_METRIC_MAP` here. The connector ships useful without it — query grain is the only
dimension the paid and organic sides share — but it ships *diagnostic* with it.

### `ctr`, which is not coming back

`ctr` is `clicks / impressions` and both inputs are already stored. Storing the quotient beside them
is how one number becomes two sources of truth that drift: a reader who sums clicks and impressions
across a week and divides gets a different figure from one who averages the stored `ctr`, and nothing
in the store says which is meant. Anyone who needs it computes it at read time from columns that
cannot disagree. This is a decision, not a deferral.

### Everything else

- **`backfill.ts`.** GA4's client note left its own on the grounds of "wiring rather than design";
  here it is a genuine decision — whether the `totals` report runs on every window or once per date,
  and whether `byPage` runs at all — and it belongs with the scheduler change that would carry it.
- **The barrel export.** `packages/connectors/src/index.ts` is owned by concurrent work. The export
  lines are listed in the PR report rather than written into a file another change holds.
- **`packages/brand/src/claims.ts`.** See gate 18. The edit, when somebody takes it deliberately, is
  `IMPLEMENTED_SOURCE_IDS = ["ga4", "search_console", "woocommerce"]` (the guard requires it sorted)
  plus `search_console: "Search Console"` in `SOURCE_LABELS`. Whoever makes it will be making it for
  `google_ads` and `meta_ads` at the same time.
- **`country`, `device` and `searchAppearance`.** Refused at request time. `country` plausibly maps
  to the existing `geo` type; the other two need a dictionary decision. Half-supporting a dimension
  is worse than refusing it.
- **Composite grains.** No composite entity type exists; see §1.
- **Search types other than `web`.** No envelope dimension can label them, so image and web rows
  would be stored as the same thing. Pulling them would be actively wrong, not merely incomplete.
- **A value-level PII rule for query strings.** `25-payload-redaction.md` §2 names it as different
  work with a different failure mode, and it is not pretended at here.
- **Changing `@repo/extract`'s `classify` for the 403/quota ambiguity.** Naming it is this PR's
  contribution; changing the shared classifier to hedge an unmeasured case would degrade a working
  safety path for every source.
- **Quota in the response envelope.** GA4 left this out because `meta` has no field for it. Here
  there is additionally nothing to put in it.
- **Measuring the restatement window.** The method is two pulls and a diff (§5). It needs a
  credential and calendar time, neither of which a PR can supply.
- **Concurrency.** Strictly sequential, for the reason the GA4 client gives and one more: the
  1,200 QPM ceiling is **per site and per user**, so parallel requests for one property race each
  other against a budget shared with the customer's own tools.

## 5. Open or unverified spec items this builds on

**And first, the honest limit on all of it: no call to Search Console was made.** There is no
credential in this repository and none can be obtained from here. Every fixture is synthetic, says
so in its own header, and encodes *what I believe the API returns* rather than what it does. The
traps this normaliser handles are the ones I anticipated; the ones I did not anticipate are
precisely the ones these fixtures cannot contain, because I wrote both sides. §13.3 rule 6 requires
recorded responses and this connector does not satisfy it. **Before it ships: record real responses
from a real property, scrub them, re-run the contract test, and where the recorded shape differs, the
fixture is right and the normaliser is wrong.**

### What one live call would settle, in the order a single session could do it

| # | Question | What settles it |
|---|---|---|
| 1 | Is the search-type field `type` or `searchType` on the `webmasters/v3` path? Google documents both, in different places | One request. An unknown field is a 400 naming it, which `classify` reports as non-retryable. One constant, one line to correct |
| 2 | Is `rows` truly **omitted** on an empty window, rather than `[]`? | One query over a date with no data |
| 3 | Do `clicks` and `impressions` ever arrive non-integer, or as strings the way GA4's do? | Any successful response |
| 4 | Does a quota rejection arrive as **429 or 403**? | One deliberate over-quota burst. This is the gate-16 ambiguity, and the answer decides whether a healthy connection can be flipped to `needs_reauth` by traffic |
| 5 | How large is the anonymity gap for a real property? | Two calls on one date: `["date"]` and `["date","query"]`, then subtract |
| 6 | Do **page-grain** rows include impressions from anonymised queries? | The same two calls at `["date","page"]`. `SEARCH_CONSOLE_ANONYMITY_THRESHOLDED.page` is currently `true` as a **deliberate guess in the safe direction** — a wrong `true` costs a refused convenience, a wrong `false` publishes a total that is too low, and those are not comparable |
| 7 | Does `startRow` have a hard ceiling, and what happens past it? | One paged report on a large property |
| 8 | How many days does `dataState: "final"` lag? | One call for D-0 and D-1 |
| 9 | What values does `responseAggregationType` actually take per dimension set? | Any response; it is recorded on every page object already |
| 10 | **The restatement window** | Pull `final` for one date, pull it again at D+10 and D+30, diff. That puts a measured number where `RESTATEMENT_CLOCKS` currently has a null |

### Specification items this builds on

1. **`webmasters.readonly`'s sensitive-scope status is unconfirmed** (§3.5, `22-access-models.md`,
   `06-oauth-connect.md`). If it is sensitive, Search Console falls behind the same unbounded Google
   OAuth verification as GA4 and **may not make the launch connector list at all**. The code is
   unaffected either way; the access timeline is not.
2. **`RESTATEMENT_CLOCKS.search_console.windowDays` is `null`, deliberately** — the specification
   publishes no window and an invented number would be indistinguishable from a sourced one. Three
   things follow automatically and would reverse automatically: `restates_until` is null, so
   `is_provisional` is **always true** and no Search Console row is ever marked final; and
   `planBackfill` grows **no weekly tier**, so the steady state is four windows a day. If item 10
   above ever returns a number, rows start becoming final and the ladder appears with no connector
   change at all.
3. **Google's anonymity threshold is undocumented as a guarantee**
   (`25-payload-redaction.md` §7). Two things in the repository depend on it: the `verbatim`
   disposition of `REDACTION_POLICIES.search_console`, and `SEARCH_CONSOLE_ANONYMITY_THRESHOLDED`
   here. If the threshold changes or is removed, **both are wrong rather than merely dependent** —
   the policy would be storing unthresholded query text, and this connector would be refusing sums
   it need not refuse or, worse, permitting one it should not.
4. **§9's decision that Search Console is a free join, never a billable endpoint**, overriding §8's
   credit table which prices it at 1 credit. §9 is later, more specific, and reasons from the API
   being free of charge. Nothing in this PR meters anything; anything built on top must not either.
5. **§11A.14's fifth-connector gate.** GA4, WooCommerce, Shopify and a payments source are the launch
   set; Google Ads, Search Console and Meta keep their dictionary entries and sit behind the gate.
   This is code landing ahead of the gate, which is fine and is what `23-launch-connector-substitution.md`
   describes ("a build order is not a vocabulary"). The **marketing claim** is the part the gate
   governs, which is why gate 18 hands that decision on rather than taking it.
6. **The Search Console quota figures themselves** come from §3.2's access table and Google's limits
   page. The undocumented 10-minute and 1-day load quotas are acknowledged by the specification as
   able to fire *before* the published thresholds, which means the published numbers are an upper
   bound on what is safe and not a budget.

## 6. Verification

Real results, not intentions. Everything below was run after the mutation experiments and with
every mutation reverted.

**One observation about the tree these were run in, recorded because it is true rather than because
it changes the result.** Five other changes are editing this checkout concurrently. Mid-session
`packages/connectors/src/sources/google_ads/` briefly acquired a scratch working directory —
`_content.ts`, `claims.ts`, `page.tsx`, `md5.txt` and a copy of `MARKETING-DATA-PLANE.md` — which
failed `tsc` for the whole package and, in one run, failed two tests in another connector's file
mid-write. Both cleared on their own. The final numbers below are from a clean sweep taken after
that, and `tsc --noEmit` over **this change's directory alone**, under the same
`packages/connectors/tsconfig.json` compiler options, **exits 0** independently of any of it.

| Gate | Result |
|---|---|
| `pnpm exec biome lint .` | **pass, exit 0** — 5 warnings, 1 info, **all pre-existing** and none in this diff (`ga4/backfill.test.ts`, `ga4/contract.test.ts`, `oauth/flow.test.ts`, `woocommerce/client.ts`, `scripts/check-dictionary.mjs`, `finance/build-pdf.mjs`) |
| `pnpm exec biome format packages/connectors/src/sources/search_console/` | **pass** — 5 files, no fixes applied |
| `pnpm -r typecheck` | **pass — all 14 workspace projects, no errors.** Separately, `tsc --noEmit` scoped to `src/sources/search_console/**` under the package's own compiler options **exits 0**, and `grep -c search_console` over the package's full diagnostic output during the broken interval was **0** |
| `pnpm --filter @repo/connectors test` | **pass — 14 files, 319 tests**, of which **50 in 2 files are this connector's** (`src/sources/search_console` run alone: 2 files, 50 tests, pass). Baseline before this work: **5 files, 87 tests**; the rest of the growth is three other connectors landing in the same package during this session |
| `node scripts/check-brand.mjs` | **pass, exit 0** |
| `node scripts/check-tokens.mjs` | **pass, exit 0** |
| `node scripts/check-dictionary.mjs` | **pass, exit 0** — and this is the load-bearing one: **no dictionary change was needed**, so the TypeScript and the SQL still agree |
| `node scripts/check-capabilities.mjs` | **FAILS, exit 1, 3 findings** — `google_ads`, `meta_ads` and `search_console` are implemented and absent from `IMPLEMENTED_SOURCE_IDS`. **This is the guard working**, see gate 18. `packages/brand/src/claims.ts` was not edited by this change |

`pnpm -r test` and `pnpm -r build` were not run, and `pnpm exec biome format --write` was pointed at
this change's five files only: a whole-repo write or a whole-repo result would be a reading of five
other people's work rather than of this one. The package this change touches was run in full, and the
directory it adds was run and typechecked in isolation as well.

### Mutations

Eleven mutations, **ten caught, one survives with a reason**. Each was applied to `normalize.ts` or
`client.ts`, run against the 50 tests in `src/sources/search_console`, and reverted.

| # | Mutation | Result |
|---|---|---|
| 1 | `entity.id` loses its grain prefix | **caught** — 3 failed |
| 2 | The impossible-date round trip becomes a bare `NaN` check | **caught** — 2 failed |
| 3 | `totalsByDate` sums a thresholded grain instead of refusing | **caught** — 1 failed |
| 4 | A full page is treated as the end of the report | **caught** — 3 failed |
| 5 | The positional keys/dimensions length check is dropped | **caught** — 1 failed |
| 6 | The currency defaults to the workspace's instead of `XXX` | **caught** — 1 failed |
| 7 | The absent-value branch of `parseSearchConsoleMetric` is deleted | **survived, then caught** — see below |
| 7b | An absent metric is coerced to **zero** | **caught** — 1 failed |
| 8 | The site URL is interpolated without percent-encoding | **caught** — 3 failed |
| 9 | The page cap stops instead of refusing | **caught** — 2 failed |
| 10 | `is_provisional` is hard-coded `true` instead of derived | **survives, unkillably — see below** |

**Mutation 7 changed a test, which is the point of running these.** Deleting the absent-value branch
left the *later* finite-number check to refuse `undefined` anyway, so the row was still refused and
the suite still passed — for the wrong reason, and with an error message that no longer told the
caller what was actually wrong. The test asserted the error *code* and not the *message*. It now
asserts the message too, and the mutation is caught. The genuinely dangerous version of the same
edit, 7b, returning `0` instead of throwing, was caught either way.

**Mutation 10 survives and cannot be killed from here, and saying so is more useful than hiding
it.** Replacing `isProvisional(restates, …)` with a literal `true` passes all 50 tests, because
`RESTATEMENT_CLOCKS.search_console.windowDays` is `null` and the two therefore agree at **every**
fetch time there is. The derivation stays not because today's suite can see it but because the day
somebody measures the window and sets a number is the day a hard-coded `true` starts lying — about
every row the connector has ever emitted. The contract owns the rule; the connector asks it. The
test carries that reasoning in a comment so the next reader does not mistake a passing test for
coverage.

Mutation testing has found a defect in this repository's *tests* rather than its code before —
`13-ga4-client.md` and the note at the top of `vitest.config.ts` both record one. What is new here is
the second kind of result: a **correct line that no test can currently justify**, kept on an argument
about a future state rather than on coverage, and labelled as such rather than quietly counted as
tested.
