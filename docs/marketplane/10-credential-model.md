# 10. The credential model: what the customer supplies, and what we must hold

## 1. The question, and why it needs a written answer

*Do customers provide their own credentials, or do we need our own developer token?*

**Both**, and conflating them is how this decision gets re-litigated. Three different things get
called "our credentials" and only one is a data credential:

| | Whose | Required | What it can do alone |
|---|---|---|---|
| **Access / refresh token** | **The customer's** | Every platform | Read their data. This is the credential. |
| **OAuth client ID + secret** | Ours | Every platform | Nothing. It identifies the *application* on the consent screen. It cannot read one byte without a customer's token. |
| **Google Ads developer token** | **Open question — decided below** | Google Ads only | Nothing on its own, but no Ads call succeeds without one. |

The customer authenticates their own account, and that is not a preference — it is what the platforms
require. Google's developer policy forbids letting third parties "avoid applying for their own Google
Ads developer access and Google Cloud Platform project"; Meta requires tech providers to process data
solely on behalf of each client, siloed (sections 3.5, 11.2). Their token, their consent, their
revocation, sealed per connection so that even our own database cannot read it
(`05-credential-vault.md`).

An OAuth client ID being ours is not a compromise of that. It is what an OAuth application *is*: the
thing the customer sees on the consent screen when deciding whether to trust us. A product with no
client ID is a product with no consent screen.

### Per platform

- **GA4, Search Console** — pure bring-your-own-credential. Customer's token, our client ID, nothing
  else.
- **Meta** — customer's token. Our app carries Business Verification and App Review, but the
  credential reading data is theirs. No developer-token equivalent exists.
- **Google Ads** — customer's token **plus** a `developer-token` header on every call. OAuth alone
  does not authenticate an Ads request.

## 2. The decision: one shared developer token, Basic tier, applied for immediately

Specification section 3.5 leaves this open in as many words: *"If every tenant brings their own
developer token, whose token appears in the request?"* No source answers it. So it is decided here.

**Marketplane holds one developer token.** Per-tenant tokens stay available as an escape hatch —
`connections` already carries encrypted columns for one — but are not the default, because obtaining
one requires a Google Ads manager account and an application form *before a customer can connect
anything*. That is not an onboarding step, it is an onboarding wall.

The cost of that decision is that **daily limits are per developer token, shared across every
tenant**. So capacity is a function of the tier and of how many requests the scheduler issues per
account. Both are now computed rather than estimated — `packages/extract/src/capacity.ts`, with the
request count taken from `planBackfill` so it tracks whatever the scheduler actually does:

| Tier | Ops/day | Accounts supported | Covers survival (240–400)? |
|---|---|---|---|
| Test | 0 | 0 | No production data at all |
| **Explorer** (immediate) | 2,880 | **169** | **No** |
| **Basic** (5-day review) | 15,000 | **882** | **Yes** |
| Standard | unlimited | — | Unresolved, see below |

At a 90-day window the planner issues **17 requests per account per day**, and 2,880 ÷ 17 = 169.

**That is the finding that decides the access plan: a single shared token on Explorer cannot reach
breakeven.** Section 0 puts survival at 240–400 paying accounts; Explorer supports 169. Basic clears
it with room. This is why section 9 applies for Basic in week 1 rather than waiting to need it — the
review takes five business days, and discovering the ceiling at 170 customers would be discovering it
far too late.

**Read the table as a ceiling, not a plan.** Google counts *operations*, not requests: a paginated
report can cost more than one, and — per `09-quota-aware-http.md` — a rejected request still counts.
The real figures are lower. The tests assert the arithmetic, not the sufficiency.

## 3. What is still unresolved, and who has to resolve it

1. **Google Ads Standard Access may have no path for a headless product** (§11.11, High severity).
   RMF categories are defined by what a tool *displays*. A written question to Google in week 1, and
   part of why the Numbers screen exists as a compliance artefact rather than a feature. Until
   answered, **nothing may be designed that needs more than Basic's 15,000/day** — which the table
   above shows is enough for the survival number anyway.
2. **Whether Meta treats a pay-per-call API as a Tech Provider** needing per-client authorisation
   (§11.11, High). The client-list record is already designed in (`workspaces.client_name`,
   `client_contact`), but the onboarding mechanics are unconfirmed and pricing for Meta-backed
   endpoints is gated on a legal read.
3. **Whether `webmasters.readonly` is a sensitive scope.** Not listed on Google's OAuth scopes page
   (§3.5). If it is, Search Console falls behind the same unbounded verification as Ads and
   Analytics and may not make the launch connector list. `packages/oauth` records it as
   `"unconfirmed"` and a test keeps it that way.
4. **Google OAuth verification is unbounded** — documented at 3–5 days, observed at over ten weeks.
   Self-serve signup gates on the outcome, not on the roadmap, and **the product must never quote
   3–5 days.**

## 4. What this means for the build

- **Nothing changes in what is built.** `packages/oauth` already requests only read scopes, per
  workspace, on the customer's own account. `packages/vault` already seals each grant to one
  connection. This note records a decision the code already assumes.
- **One thing is added to the Google Ads connector's brief**: the developer token comes from a Worker
  secret, is the same for every tenant, and its daily spend is a **cross-tenant** budget. That makes
  it the queue-level governor's concern (`00-repo-map.md` section 5), not the per-connection
  planner's — a single tenant's backfill cannot see the ceiling it is drawing on.
- **The Connect screen must be honest about testing mode.** While Google verification is pending, the
  OAuth client only admits allow-listed test users. `packages/oauth`'s provider notes say so; the
  screen has to show it rather than a generic failure.

## 5. Verification

The numbers in section 2 are not prose. `packages/extract/src/capacity.test.ts` asserts them against
the planner's real output — 17 requests per account, 169 accounts on Explorer, 882 on Basic — so if
the restatement depth changes, the capacity figures change with it and the test says so. **52/52 tests
pass in `@repo/extract`.**

A number in a design note that nothing checks is a number that drifts, and this one is load-bearing
for an access application with a five-day turnaround.
