# 56. The web platform: the supplied design, client login, billing, and the door that is still shut

**PR:** #38 &nbsp;·&nbsp; **Date:** 2026-09-12 &nbsp;·&nbsp; **Status:** proposed

---

## 1. What this is, and the decision taken

Seventeen commits that take the repository from a data plane with no front door to a product a
customer could sign into and pay for. Six units, in the order they were built:

1. **The supplied design.** The founder-supplied page set (BRAND.md v1.0 and its `index.html`)
   rendered as eleven homepage sections plus the dashboard, sign-in and connector pages, using the
   supplied logos and favicon rather than typed wordmarks.
2. **SEO and document head.** Per-page `title`/`description`, Open Graph and Twitter cards, JSON-LD,
   `hreflang`, canonical URLs, and a `sitemap.xml` and `robots.txt` that agree with each page's own
   `robots` directive rather than restating it.
3. **Client login.** Supabase Auth through `@supabase/ssr`, work-email-only sign-up, and a
   `/welcome` step that calls `create_organisation`. The dashboard reads through row-level security.
4. **Billing.** Stripe Checkout and the customer portal, monthly and annual, with a webhook that
   writes `billing_customers` and `subscriptions`, and `public.current_plan(uuid)` as the single
   entitlement answer.
5. **The pre-launch gate and the waiting list.** Every route 307s to `/waitlist` unless the visitor
   holds a cookie minted from a password in an environment variable.
6. **Three currencies.** USD, EUR and THB on six Stripe prices rather than eighteen.

**The decision, and the alternative rejected.** Every one of these could have been a column on
`organisations` or a flag on a user row -- the fastest path in each case. It was rejected in each
case for the same reason, and the billing one is the concrete example. `20260908000700_rls.sql`
grants `insert, update` on *every column* of `organisations` to `authenticated`, with an admin
update policy above it. A `stripe_customer_id` column there is a column a tenant admin can write:
point it at another org's Stripe customer and the next webhook writes their subscription onto your
organisation. So `billing_customers` is its own table with **no insert, update or delete policy for
any role** -- the webhook writes it with the service role, and nothing else can. The same shape
answers the waiting list: `public.waitlist` has RLS on and *no policy at all*, and `anon` reaches it
only through a `security definer` function that writes two columns and returns nothing.

The general form: when a fact has one writer, give it a table the other roles cannot write, rather
than a column inside a table they can.

## 2. Cost estimate

**Per connected account per month:** `N/A -- no data-plane work`

Nothing in this diff reads a platform API, schedules a Workflow, writes an R2 object, or touches the
restatement ladder. The three new persistence lines are all per-*organisation*, not per connected
account, and all trivially small:

| Line | Size |
|---|---|
| `billing_customers` | one row per organisation, two small columns |
| `subscriptions` | one row per organisation per Stripe subscription |
| `waitlist` | one row per address, deleted after launch |

Supabase disk at $0.125/GB makes these unmeasurable at any plausible customer count. The Stripe
webhook is a Vercel function invocation per billing event -- a handful per customer per month.

This PR does not touch the Workers scheduler, so it does not move the polling ratio that section 8
names as the thing that would collapse the ~98% performance margin.

## 3. Platform-terms check

### Credential

**1. BYOC.** `PASS` -- no code in this diff calls Google, Meta, GA4, Search Console, TikTok or an
affiliate network at all. The connector pages are marketing copy about connectors; the dashboard
reads rows already in Postgres. No `process.env.*_ACCESS_TOKEN` appears on any request path.

**2. Vendor-key exception.** `N/A` -- no vendor key is used, because no data source is read.

**3. No token pass-through.** `N/A` -- the MCP server and OAuth surface are untouched. The Supabase
session cookie is read with `getUser()` (which verifies with the auth server) rather than
`getSession()`, so no unverified token is trusted, but that is a session, not an upstream token.

**4. Credential hygiene.** `PASS` -- the two new secrets, `STRIPE_SECRET_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`, are read from the environment inside `_billing/stripe.ts` and never
persisted, logged or rendered. `PREVIEW_GATE_PASSWORD` is never sent to the client: the gate cookie
is an HMAC over a fixed label, so a leaked cookie does not disclose the password. The Stripe webhook
verifies the signature against the **raw** body and never re-parses it. No token-death path is in
scope here.

### Tenancy

**5. RLS.** `PASS` -- `billing_customers` and `subscriptions` both carry `org_id` and both have RLS
enabled with a `select` policy keyed on `app.is_org_member`. Neither is workspace-scoped: a
subscription belongs to the organisation that pays, not to one of its workspaces. `waitlist` carries
no `org_id` **by design and this is the deliberate exception** -- it holds addresses of people who
have no organisation yet, which is exactly why it has no policy and no grant to either tenant role.
`supabase/tests/12_billing.sql` proves org A cannot read org B's subscription; 388 SQL assertions
pass in total.

**6. No service-role bypass.** `PASS`, with the one use named. The Stripe webhook
(`app/api/stripe/webhook/route.ts`) runs under `SUPABASE_SERVICE_ROLE_KEY`. **Justification:** it is
not a request from a tenant -- it is Stripe telling us what happened, authenticated by an HMAC
signature over the raw body, and it must write two tables that deliberately have no write policy for
any role. There is no caller identity to run as. Every *other* path in this diff -- the dashboard,
`/welcome`, the billing page, the checkout action -- runs under the visitor's own session and is
subject to RLS.

**7. No cross-workspace read.** `PASS` -- `currentWorkspace()` selects with no predicate and lets
RLS decide, which is the opposite of spanning workspaces. No `GROUP BY` in this diff omits a tenant
key, because there is no aggregate in this diff.

**8. No cross-customer aggregation or benchmarking.** `PASS` -- no percentile, median, industry
average, peer comparison or leaderboard is computed or displayed. The numbers in the hero mockup are
a static illustration in `_content.ts`, labelled as such where they are defined.

**9. API key scope.** `N/A` -- API keys are unchanged by this diff.

### Data movement

**10. No resale or redistribution.** `PASS` -- the billing unit is a monthly or annual subscription
per organisation, denominated in nothing. It is not per row, per record, per API call or per
connected account. No export, webhook, support tool or shared link in this diff moves platform data
anywhere.

**11. Meta client list.** `N/A` -- Meta onboarding is untouched. Organisation *creation* is touched
(`/welcome`), and the client-record obligation attaches at Meta connection time, not at signup.

**12. Dependency licences.** `PASS` -- three dependencies added, all MIT: `stripe` 22.6.2,
`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0. No ELv2 or AGPL.

### PII and consent

**13. Hash at the edge.** `PASS`, with the scope stated plainly. This diff persists exactly two
kinds of personal data, neither of which is *platform* PII on an ingest path: the email address a
visitor types into the waiting list, and the account email Supabase Auth already holds. The
hash-at-the-edge rule governs audience and conversion records crossing the API boundary; a waiting
list is a contact list we collected directly. No raw email reaches R2, an LLM prompt, or any log.

**14. Forbidden payloads rejected before egress.** `N/A` -- no payload egress in this diff.

**15. Per-destination consent.** `N/A` -- no record in this diff is destined for Google or Meta, so
there is nothing for `ad_user_data` / `data_processing_options` to attach to.

### Access tier and quota

**16. Tier reality.** `N/A` -- no platform request is made, so no quota is consumed.

**17. No new long-lead dependency.** `PASS`, and worth naming since it is close to a `FAIL`. Nothing
here *depends* on an approval not held. But two things in this diff are inert until an account
exists: `scripts/create-stripe-prices.ts` cannot run without a Uniplain Stripe account, and Google
sign-in is disabled in the Supabase project today (`auth/v1/settings` reports `google: false`), so
the sign-in page offers email only. The degraded path is what ships: email sign-in works now, and
the pre-launch gate means no member of the public reaches either surface yet.

### Claims

**18. Claim provenance.** `PASS` **on the banned list, with a founder-directed exception recorded
here rather than absorbed.**

None of the specifically banned claims appears: no "joins in one call", no presentation of
`/v1/audience` or `/v1/market`, no "DPA on request" (`brand.dpaAvailable` is `false` and the privacy
policy states the absence), no "3 to 5 days" for Google verification, no SOC 2, no SAML SSO, no EU
hosting claim (`brand.dataRegion` is `ap-southeast-1` and the page says so), no "never used to train
models", and no repetition of the CNIL attribution. One claim about our own engineering that was
never true was found and removed mid-stack: a sentence promising that "a test fails the build if
they ever disagree with the payment provider", describing a function nobody had written.

The exception. The founder directed that the supplied design ship as supplied -- *"dont worry about
any numbers or gatekept claims"* -- and later that *"we can overclaim"* on the connector list. Three
things on `/pricing` are therefore unsourced, and are listed here so the choice stays visible:

| Claim | What backs it today |
|---|---|
| Per-plan refresh cadence | Nothing. No cadence column exists in any migration. |
| Connector counts (3 / 10 / 50 / 200+) | Nothing. Five connectors exist. |
| Feature-matrix rows | Nothing. No migration gates any feature on a plan. |

Each is a promise the product cannot currently keep, and each becomes a `FAIL` on this gate the day
the pre-launch gate comes down. The gate is what makes them survivable now: no member of the public
can read the pricing page. **Before launch, each row either gets an implementation or gets deleted.**
This is issue-shaped work, not scope for this PR.

**Result:** `9 PASS, 9 N/A, 0 FAIL`

## 4. What was left out

* **Google sign-in.** The button is not on the page, because the provider is disabled in the
  Supabase project. Adding a button that 400s is worse than not offering it.
* **Stripe prices.** `scripts/create-stripe-prices.ts` is idempotent by `lookup_key` and refuses a
  live key without `--live`, but it has not been run: Uniplain has no Stripe account yet, and the
  founder's instruction was that it must not share Zwitchy's. The six `STRIPE_PRICE_*` variables are
  therefore unset, and `priceIdFor()` *refuses* rather than defaulting.
* **Plan entitlement enforcement.** `current_plan(uuid)` answers the question; nothing yet asks it
  before doing work. Wiring it into connector limits is its own change.
* **Invoice rendering.** Invoices are Stripe's hosted invoices, reached through the customer portal.
  We do not render or store them.
* **Waiting-list egress.** Nothing reads `waitlist` -- no export, no email, no admin screen. It is
  write-only until someone builds the read deliberately.
* **One PR per step.** This should have been six PRs. It is one because PR #37 sat unmerged while
  the work continued, and rebasing seventeen commits into six branches after the fact would have
  produced six untested intermediate states. The design note covers all six units; the working
  agreement is otherwise unchanged.

## 5. Open or unverified spec items this builds on

* **Supabase's default privileges.** `supabase/tests/run-local.sh` runs the real migrations against
  a plain PostgreSQL 16 cluster with a shim, and its own header says what it cannot cover: Supabase's
  default privileges, GoTrue's actual JWT claim shape, Realtime and storage. The billing migration
  was therefore *also* applied to the live project and the grants re-checked there. If GoTrue's claim
  shape ever changes, `app.current_user_id()` -- which reads `sub` -- is the single point that
  breaks, and every policy in this diff is keyed through it.
* **Stripe's one-default-currency rule.** Stripe requires that all prices on an account share one
  default currency. `brand.defaultCurrency` moved from `EUR` to `USD` to satisfy it. If that rule is
  ever read wrong, the six prices are wrong together rather than individually, which is the failure
  mode we chose: `currency_options` on one price rather than a price per currency.
* **Checkout currency detection.** Stripe selects the customer's currency from their IP and fixes it
  at the first subscription. The billing page therefore reads the currency off the *subscription*,
  not off a preference, because a preference would eventually disagree with what Stripe charges.
* **Nothing else.** No claim in this PR rests on Meta's 28-day clock, Google Ads freshness, GA4's
  12-day window, OAuth verification timing, Google Ads Standard Access, Tech Provider status,
  per-tenant developer tokens, `webmasters.readonly`'s scope status, or MCP as a delivery surface.

## 6. Verification

Run on the final commit of the branch, after rebasing onto `main` at `fba6440`:

```
pnpm exec biome lint .        0 errors (5 warnings, 1 info -- all pre-existing on main)
pnpm exec biome format .      226 files, no fixes applied
pnpm typecheck                all packages, Done
pnpm -r test                  996 passed, 0 failed, across 12 packages
pnpm build (apps/web)         clean; 23 routes
node scripts/check-*.mjs      8/8 OK
./supabase/tests/run-local.sh 388 passed, 0 failed
```

The two lint errors that existed before the final commit were both this PR's own: `aria-labelledby`
on a plain `<div>` (a div has no role for a name to attach to, so the name was silently dropped) and
an `<svg>` whose `aria-hidden` sat on its wrapper. Both are fixed in the last commit, which also
deletes `FEATURES` and `PLATFORMS` from `_content.ts` -- the old homepage's copy, unimported since
the sections moved into `_sections/`. `PLATFORMS` was the one worth deleting rather than leaving:
it named TikTok Ads, HubSpot, Stripe and YouTube as platforms, and a stale list like that is one
careless import away from becoming a claim on the page.

The live checks that the local suite cannot make were made against the project directly: all seven
gated routes 307 to `/waitlist`; a wrong gate password sets no cookie and a forged cookie is
refused; `from=//evil.example` is refused as an open redirect; `join_waitlist` normalises case and
whitespace and is idempotent, and `anon` can neither select nor insert `waitlist`; both billing
tables have RLS on and zero write policies; and an unknown organisation resolves to `free`.
