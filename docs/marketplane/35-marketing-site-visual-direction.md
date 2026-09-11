# 35. Two reference sites, and the half of each we can actually use

**PR:** #TBD &nbsp;·&nbsp; **Date:** 2026-09-11 &nbsp;·&nbsp; **Status:** proposed — **direction only, no code, no artboard**

---

## 0. Numbering

**Numbered 35.** `34-woocommerce-client.md` is the last note on `main` and nothing is in flight, so
35 is free. This note is a *direction*, not a shipped unit: it is the first note in the sequence
that describes work not yet done, and it says so rather than pretending to be retrospective.

## 1. What this is, and the decision taken

The founder named two reference sites for the marketing site's design: **detrics.io** and
**truely.com**, as a combination. This note records what each of them actually is, which half of
each is usable here, and — the part worth reviewing — the four places where copying either one
would break a rule the repository already enforces.

**The decision taken: adopt detrics.io's information architecture and truely.com's register, and
refuse both palettes.** The two sites answer different questions. detrics answers *what sections
does a B2B data product's page need, and in what order*. truely answers *how does a page talk to a
buyer who is not an analyst*. Our buyer, per §11A.1, is an owner-run business with no analyst and no
IT function — so detrics' **skeleton** is right and detrics' **voice** is aimed at someone else.

**The alternative rejected** was treating "a combination of the two" as a visual instruction —
sampling truely's mint-on-teal palette and detrics' blue and arbitrating between them. That would
be an edit to `packages/tokens/src/tokens.css`, whose every value is extracted verbatim from
`design/marketplane/Main.dc.html` and founder-confirmed, and it would do it sideways, inside a page
change, with no record. If the brand register is to change, §5 below states the decision that needs
making and what it costs. Nothing in this note changes a token.

## 2. What the two references actually are

Both were read on 2026-09-11. detrics.io was read as rendered; truely.com returns 403 to a plain
fetch and was read from its served HTML, so its palette below is derived from literal counts in the
source rather than from measured prominence on screen — the hues are right, their weighting is an
inference.

| | **detrics.io** | **truely.com** |
|---|---|---|
| Product | Marketing data pipelines for PPC agencies — 37+ sources into Sheets, Looker Studio, BigQuery and an AI client | Consumer travel eSIM — unlimited data in 190+ countries |
| Buyer | An agency analyst who already knows what BigQuery is | A traveller who wants their phone to work when they land |
| Ground | White, light throughout; dark used only for nav and footer | Deep teal `#092927` and near-white `#F3F6F3`, alternating |
| Accents | Blue primary, purple/magenta for highlights | Mint `#2EFECC`, acid yellow `#FDFD74`, lilac `#E57EFB`, ice `#87EFFF` |
| Type | Sans throughout, large bold headlines over regular body | Oversized bold display sans, tight all-caps section labels |
| Hero | Centred headline, animated cube pattern, toggleable benefit list | Single promise — *"Unlimited data that travels with you"* — over a phone |
| Structure | Sticky nav with dropdowns → hero → three pillars → differentiators → case-study carousel → five-step how-it-works (one per destination) → four destination cards → competitor-migration CTA → G2 review wall → pricing comparison table → FAQ accordion → trust metrics → large footer | Nav → hero → four-benefit rail (looped as a carousel) → press strip → feature teaser → support strip → plans → pause/flex → loyalty → multi-plan → differentiators → video proof → testimonials → closing CTA → FAQ |
| Proof | *"1,000+ agencies"*, *"3,000+ users"*, G2 4.9 from 69 reviews, six case studies with named metrics | *"Featured on Top Global Media Platforms"*, testimonial wall, response-time claim, video |
| Pricing | Per-destination tiers from $10.99–$19.99/month annual, plus custom | Plans by destination and duration, with pause and referral mechanics |
| Motion | Carousels, toggles, hover states | Marquee text strips, looping card rails, emoji in headings |
| Voice | Benefit-led but jargon-tolerant — *"Give your people their hours back"* | Conversational to the point of slang — *"Got Questions? Hit Us Up!"*, *"Not to brag, but… travelers love us"* |

## 3. The synthesis, line by line

What is taken, what is refused, and the rule or fact that decides it. "Slot" means the section
exists in the layout and renders nothing until the fact behind it exists.

| From | Element | Verdict | Why |
|---|---|---|---|
| truely | **Phone-first hero device** | **Take — the single most valuable import** | §11A.3 makes LINE the primary surface and `31-owner-first-client.md` records that most owners will never open the web app. The hero device should be a phone showing the daily brief, not a desktop dashboard. `design/app-simple/Brief.dc.html` already exists to be drawn. |
| truely | One promise in the hero, not a feature list | Take | The page already leads with `tagline` + `positioning`. detrics' toggleable benefit list would bury both. |
| truely | Oversized display type, 999px pills, generous radii | Take | All three are already in `tokens.css`; this is a scale decision inside the existing system, not a new value. |
| truely | Marquee strips, looping rails | Take sparingly | Must honour `prefers-reduced-motion`, and a looping rail must not be the only way to reach a fact. |
| truely | Emoji in headings | Take **only** in the Thai and LINE surfaces | `Brief.dc.html` is already Thai. An emoji beside a freshness claim reads as unseriousness exactly where the page needs to be believed. |
| truely | EN/USD switcher | Take as **TH/EN and ฿** | The buyer is Thai and `finance/model.py` prices in baht, VAT-inclusive. |
| truely | Mint / yellow / lilac palette | **Refuse** | `tokens.css`: *"exactly one accent, and there is deliberately no sibling"*. The three status hues are marks only — never a button, never a CTA, never the brand. A second brand hue is §5's decision, not a page change. |
| truely | Deep-teal ground | **Refuse as a ground, available as a band** | `--mp-surface-inverse` `#0F172A` already carries dark bands and the shipped page uses one. A teal *ground* replaces `--mp-ground` and re-tempers every hairline in the system. |
| truely | Press strip, testimonial wall, video proof | **Slot** | We have no press and no customers. |
| truely | Referral give-20 / get-20 | **Refuse for now** | A referral discount is a change to `finance/model.py`, not a page section. |
| detrics | Sticky nav | Take, **one level, four items** | detrics' multi-dropdown nav is the eight-destination mistake `31-owner-first-client.md` already found in `design/app/App.dc.html`. |
| detrics | Five-step how-it-works | Take | The page ships four steps today; the shape is proven and the copy is already claim-resolved. |
| detrics | FAQ accordion | Take | Cheap and honest, and the artboard already has the content — *"What IT will ask. Answered."* |
| detrics | Pricing comparison table | Take the **shape** only | Numbers come from `finance/model.py` — ฿1,590 / ฿4,190 / ฿13,800, VAT-**inclusive**, ฿30,000 enterprise floor — not from the artboard's excl.-VAT tiers. See `31-owner-first-client.md` §2. |
| detrics | Destination cards (Sheets / Looker / BigQuery / AI client) | **Refuse as presented** | Those are detrics' destinations. Ours are LINE, the web app and JSON. No reviewed platform policy addresses MCP as a delivery surface at all, so it cannot be sold as a destination card. |
| detrics | *"37+ sources"* counter | **Refuse** | `packages/connectors/src/sources/` holds **two**: `ga4` and `woocommerce`. The `connectors` claim already names five — that is issue [#6](https://github.com/Mouthfully/dataaggregator/issues/6), and a big number on the page makes it worse. |
| detrics | Case studies with named metrics, G2 wall, *"1,000+ agencies"* | **Slot** | Fabricated social proof is the fastest available FAIL on gate 18. The slot is what makes it obvious the facts are missing rather than forgotten. |
| detrics | Competitor-migration CTA | **Defer** | Naming a competitor is a claim with legal surface and no specification citation. |
| detrics | Animated cube background | Refuse | Decoration with a rendering cost and no job. |

### The section order this produces

1. Nav — one level: Product · Sources · Pricing · Help. TH/EN.
2. Hero — `tagline`, `positioning`, a phone showing the LINE brief, one primary CTA.
3. The one number — profit after platform fees, the figure no platform produces.
4. Four-benefit rail — truely's shape, claim-resolved content.
5. How it works, five steps — detrics' shape, the page's existing four plus delivery.
6. What it reads — the honest connector count, with unbuilt sources marked as unbuilt.
7. Freshness and restatement, on `--mp-surface-inverse` — already shipped, keep.
8. Pricing — baht, VAT-inclusive, from `finance/model.py`.
9. Proof — **slot**.
10. FAQ — "what IT will ask".
11. Security and data — withheld claims stay withheld; the strip renders short.
12. Footer — legal entity, registration and support address, from the brand file.

Three of those twelve (2, 6, 9) are exactly where issue #6 bites: the claims list governs *whether
a sentence may be said*, never *whether the thing it describes has been built*. This direction does
not fix that, and the next change to this page should not ship without it.

## 4. What this would cost to build, and what it would touch

Nothing in this PR. When it is built, it is `apps/web/app/page.tsx`, a new artboard under
`design/marketplane/`, and — for the hero device and the honest source list — assets. It touches
`packages/brand/src/claims.ts` only if a new sentence is needed, and any new sentence needs a
specification citation like every other one.

**It does not touch `tokens.css`** unless §5's decision comes back the other way.

## 5. The one decision this note asks for

**Does the brand acquire a second hue?**

truely's energy is substantially carried by its palette: mint on deep teal, with yellow and lilac
as punctuation. Our system has one accent by rule, and the rule is load-bearing — `check-tokens.mjs`
fails the build on any colour literal outside the one stylesheet, so there is no way to try it on a
page and see.

| Answer | What it costs |
|---|---|
| **No** (assumed here) | Nothing. The synthesis above stands as written; truely contributes structure, scale, motion and voice, and `#2563EB` stays the only fill. |
| **Yes** | An edit to `tokens.css` adding the hue and its on-dark and on-accent pairs with computed contrast ratios; a matching edit or a recorded departure in `design/marketplane/Main.dc.html`, which is the provenance chain every token cites; and a decision about what the new hue is *for*, since the file's rule is that the accent alone fills a button, a CTA panel or the wordmark. Roughly a day, and it must not be done implicitly. |

This note assumes **No** and proceeds. Reversing it changes §3's palette rows and nothing else.

## 6. Cost estimate

**Per connected account per month: ฿0.00 / $0.00 — no data-plane work.**

Documentation only. No connector, no schema, no scheduler, no read path, no bought data. Nothing
here changes rows/night, restatement depth, Workers invocations, R2 object count, KV writes or
Supabase disk, and nothing touches the polling ratio §8's open question turns on. The repository
grows by one file, and one line of `HANDOVER.md` changes.

The page this describes, when built, stays static on the already-selected Vercel surface and adds
no per-account operation. Ordinary traffic and bandwidth are excluded for the reason
`20-marketing-site.md` §2 gives: they follow visits, not connected accounts, and no measured
traffic profile exists.

## 7. Platform-terms check

### Credential

**1. BYOC.** `N/A` — no platform call exists in this diff and no credential of any kind is read.

**2. Vendor-key exception.** `N/A` — no data source is contacted.

**3. No token pass-through.** `N/A` — the MCP server and OAuth surface are untouched. §3 declines
to sell MCP as a destination card, which is a restraint rather than a change.

**4. Credential hygiene.** `PASS` — no credential, real or sample, appears in this note. Worth
stating rather than marking N/A: `design/app/App.dc.html` renders a sample API token, and a
marketing page that screenshots a product is one careless crop away from doing the same.

### Tenancy

**5. RLS.** `N/A` — no table is added and no workspace data is read.

**6. No service-role bypass.** `N/A` — no database client exists here.

**7. No cross-workspace read.** `N/A` — no query is issued.

**8. No cross-customer aggregation or benchmarking.** `PASS` — and it needed checking. detrics'
page leads with aggregate proof (*"1,000+ agencies"*, *"20 hrs/week saved"*), and the tempting
version of that for a data product is a statistic computed from customers' platform data. §3 slots
proof as named, consenting case studies only. Any figure derived across tenants is a gate-8 FAIL
regardless of how the page phrases it.

**9. API key scope.** `N/A` — no API key is accepted.

### Data movement

**10. No resale or redistribution.** `N/A` — the page returns static public content, not platform
data. The hero device shows a designed mockup, never a real customer's numbers.

**11. Meta client list.** `N/A` — onboarding, lifecycle and deletion are untouched.

**12. Dependency licences.** `PASS` — no dependency is added. The motion in §3 is CSS.

### PII and consent

**13. Hash at the edge.** `N/A` — no form, fixture, persistence or LLM prompt. The proof slot, when
filled, carries a name and a company with written consent; that is a future change with its own note.

**14. Forbidden payloads rejected before egress.** `N/A` — there is no data egress.

**15. Per-destination consent.** `N/A` — audience writes remain absent.

### Access tier and quota

**16. Tier reality.** `N/A` — no source API is called.

**17. No new long-lead dependency.** `PASS` — nothing here requires a platform approval. §3
explicitly refuses the source count and the destination cards that would have implied ones we do
not hold.

### Claims

**18. Claim provenance.** `PASS`, as a direction. Every sentence the page renders still resolves
through `claim()`, which throws on an unknown or withheld id; this note adds no sentence and removes
no gate. The substance of the gate here is the four refusals: the source counter, the borrowed
social proof, the competitor-migration CTA and the destination cards are each a claim we cannot
cite, and each is refused rather than softened.

**But the note does not close issue #6 and must not be read as doing so.** The capability gate is
still missing, `connectors` still names five sources against a tree holding two, and §3's slots are
a convention rather than a mechanism. The next change to this page is where that gets built.

**Result:** `5 PASS, 13 N/A, 0 FAIL`

## 8. What was left out

- **The artboard.** A direction is cheap to argue and a 100 KB mockup is not; drawing one before §5
  is answered risks drawing it twice.
- **Any change to `tokens.css`.** §5 states the decision instead of taking it.
- **Thai copy.** The register belongs with the Thai surfaces, and translating English marketing
  prose is the wrong order of operations. `Brief.dc.html` is the precedent.
- **A motion specification.** Named as a constraint (`prefers-reduced-motion`, no
  motion-only facts) rather than designed.
- **The capability gate of issue #6.** Named twice, deliberately not attempted, for the same reason
  `20-marketing-site.md` gave: it belongs with the code change to this page.
- **Signup, analytics, lead capture, a competitor comparison page.** Each is a separate privacy or
  legal decision; none is needed to settle a visual direction.

## 9. Open or unverified spec items this builds on

- **The product name and domain are unsettled.** Both reference sites lead with a wordmark and
  both repeat it in the nav, the footer and half the headings. Ours cannot. The hero carries the
  tagline instead, which is why §3 keeps the hero to one promise. If the name lands, it lands in
  the brand file and the page picks it up; the layout does not change.
- **The data region, EU representation and DPA remain unresolved**, so the security strip (§3 item
  11) renders short. detrics and truely both run a full-width trust band; ours is honestly thinner
  until those facts exist, and padding it out is exactly what `01-brand-identity.md` forbids.
- **The pricing unit is open** — §11A.9.4 asks whether credit pricing fits an owner-run business at
  all. §3 takes detrics' table *shape*, which survives either answer; the rows do not.
- **MCP as a delivery surface is addressed by no reviewed platform policy.** That is why the
  destination-card pattern is refused rather than adapted.
- **Whether a claims list can be trusted without a capability gate** — issue #6, unchanged and
  still the sharpest open item on this page.

## 10. Verification

Documentation only; no test covers a document and none should. The guards were run to confirm the
note introduces nothing they catch:

```
pnpm check:brand    pass
pnpm check:tokens   pass
```

`docs/**` is exempt from both by design — `check-tokens.mjs` names "prose about colours" as the
reason — so the hex literals in §2 are quoted evidence about two external sites, not values
entering the system. They are not tokens and nothing may read them.
