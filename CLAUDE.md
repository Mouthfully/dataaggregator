# Working in this repository

Business intelligence for owner-run small businesses in Thailand. It reads a customer's own
platform data on the customer's own credentials, normalises it into one envelope shape, stores it
per-tenant under row-level security, and turns it into written insights. The customer has no
analyst and no IT department, which is the whole reason the product exists and the reason the rule
below is not negotiable.

---

## THE ONE RULE

**A wrong number that looks right is the worst possible outcome.** Worse than an error, worse than
a blank, worse than shipping late. An owner acts on it, and nothing tells them it was wrong.

So: **refuse rather than repair or default.**

- **Never `?? 0`.** Absent is not zero. Zero is a measurement — "spend was nothing" — and a null has
  measured nothing at all. `apps/web/app/dashboard/_figures.ts` returns a three-branch type with no
  number in two branches specifically so a `??` cannot collapse it.
- **Never round a number into truth.** `packages/insights/src/verify.ts` refuses a whole insight
  over one number it cannot trace, rather than stripping it, rounding it to something true, or
  regenerating with a sterner prompt. A repaired insight is one whose text no longer matches the
  reasoning that produced it.
- **Never default a unit, a window, a timezone or a currency.** `20260912000400`'s rule:
  `coalesce(timezone, 'UTC')` is "a guess wearing the costume of a fact".
- **A cross-tenant read must not be refusable by one tenant's data.** Refuse the row, report it,
  carry on — never abort the batch. This one was violated and shipped; see
  `packages/store/src/scheduler.ts`.
- **When you cannot verify something, say so.** "I could not find documentation" is a finding.
  Inventing an endpoint, a rate limit, a field name or a statutory deadline is the failure mode this
  repository has actually suffered.

## Guards that fail the build

| Guard | Refuses |
|---|---|
| `check-copy` | a JSX text node of 5+ words ending in terminal punctuation — copy must come from a named constant |
| `check-tokens` | a colour literal outside `packages/tokens/src/tokens.css` |
| `check-brand` | the product name, domain or contact address outside `packages/brand` — comments and fixtures included |
| `check-dictionary` | a metric name that is not in `packages/contract/src/metrics.ts`, or drift between it and the migrations |
| `check-capabilities` | a connector claimed in `claims.ts` that is not implemented and exported |
| `check-claim-sources` | a claim citing a superseded specification section |
| `check-providers`, `check-registry` | provider and field-registry drift |

Plus two test-shaped guards that behave the same way: `withheld-claims.test.tsx` refuses a claim the
capability gate withholds being rewritten as hand-typed section copy, and `forbidden-claims.test.ts`
scans **every route's source** for `FORBIDDEN_CLAIMS`.

Run everything **by exit code**, never by reading output:

```
pnpm -r test ; pnpm -r typecheck ; pnpm exec biome lint . ; pnpm exec biome format .
for f in scripts/check-*.mjs; do node "$f"; echo "$f=$?"; done
./supabase/tests/run-local.sh          # needs a local PostgreSQL
pnpm --filter web build                # a production build, not a dev server
```

---

## Compliance

The founder's instruction is that this product is SOC 2 Type II, ISO 27001, GDPR and PDPA
compliant. **Three of those four are not things this repository can make true, and one of them is
already binding whether anyone writes it down or not.** Hold the distinction:

| | What it is | Who confers it | State today |
|---|---|---|---|
| **Control** | something the code does | us | some done, most not — `AGENTS.md` |
| **SOC 2 Type II** | a CPA firm's report on operating **effectiveness over an observation window** (3–12 months) | an auditor | **not held.** `brand.soc2TypeIIReport` is `false` |
| **ISO/IEC 27001** | an accredited body's certificate against an **ISMS** (clauses 4–10 — most of it management-system work no codebase provides) | a certification body | **not held.** `brand.iso27001Certificate` is `false` |
| **PDPA** (Thailand) | **a law.** Nothing to obtain, no auditor, no window | nobody — it already applies | **binding now** |
| **GDPR** | a law, if Art. 3(2) reaches this entity | — | **undecided.** Turns on whether the business offers services to EU data subjects |

**The PDPA is the primary obligation, not a footnote to the GDPR.** Section 5 binds a controller
*located in the Kingdom*, and `brand.legalEntity` is a Thai juristic person. That settles it with no
test to fail and no decision to take — it does not matter where the customers, the data subjects or
the servers are. Hosting in Singapore does not move it out of reach; it adds a cross-border transfer
obligation on top.

Note the inversion: every data-protection field in `brand.ts` was GDPR-shaped (`euRepresentative`,
`dpaAvailable`) while the law that actually binds is the PDPA. `governingPrivacyLaw`,
`supervisoryAuthority` and `dataProtectionOfficer` were added for that reason.

### Rules when you are about to write code

- **Before adding a column that could hold personal data**, check it against
  `packages/payloads/src/redaction.ts`. That module removes identifiers from archived payloads **by
  key** and is explicit that it does not inspect **values** — a personal datum inside a kept key is
  not protected by anything.
- **Never store a hash as a substitute for deleting an identifier.** An unsalted SHA-256 of an email
  address is reversible by anyone holding a list of email addresses, so a pseudonym is still personal
  data. The archive **drops**.
- **Nothing tenant-written reaches a model prompt.** `packages/insights/src/brief.ts` builds the
  system prompt from a module constant and the user prompt from computed figures, dictionary metric
  labels and source ids. `InsightRow` carries no entity name; the prompt never prints an entity or
  account id. If you add a field, that property is yours to keep.
- **Every OpenRouter call carries `provider: { data_collection: "deny", zdr: true }`.**
  `data_collection` **defaults to `"allow"` upstream**, so a forgotten field silently permits
  providers to store and train on a customer's business data. `request.ts` is the only builder and
  `client.ts` re-checks the body it is handed.
- **Two identities, never one.** Cross-tenant work runs as `app_scheduler`, which holds **no table
  grant at all**; per-tenant reads run as `authenticated` under RLS for one workspace. There is no
  service-role key in the Worker. Do not add one.
- **Do not widen `public.due_connections`.** It is the one cross-tenant query and returns scheduling
  metadata only. `supabase/tests/13` asserts its column set exactly.
- **A new SQL function is `EXECUTE`-able by `PUBLIC` by default**, and `alter default privileges`
  cannot revoke it. Every migration adding one must `revoke all … from public, anon, authenticated`.
  This has already gone wrong once in this schema.

### Claims: what may never be said

`SOC 2`, `ISO 27001`, `27001`, "GDPR compliant", "PDPA compliant", "independently audited",
"penetration tested" and their evasion spellings are in `FORBIDDEN_CLAIMS` and fail the build on
every route. **The acronyms themselves stay legal** — a privacy notice must be able to name the law
it operates under. What is banned is the **assertion**.

When a certificate is genuinely obtained, flipping the brand fact turns `brand.test.ts` red until
the matching ban is deleted in the same change. That is deliberate: a compliance claim cannot be
published by a one-character edit.

**`AGENTS.md` has the control-by-control mapping** — which SOC 2 criteria, ISO 27001 Annex A
controls, GDPR articles and PDPA sections are implemented, partial or absent, each with the file
that proves it. Read it before claiming anything is covered.

---

## Working agreement

- **A design note per PR**, under `docs/marketplane/NN-name.md`, with the cost estimate per
  connected account per month, the **18-gate platform-terms check**, and what was left out. Copy the
  block from `DESIGN-NOTE-TEMPLATE.md`; do not summarise it away.
- **Never widen scope in a PR. Open an issue instead.**
- **Mutation-prove every guard and every refusal.** Break it, watch a named test go red, put it
  back, and record it in the note. A refusal nothing tests is one the next person deletes.
- **Write down the negative findings.** They are the ones that get forgotten and rediscovered at
  cost. `docs/marketplane/58-plan-reconciliation.md` exists entirely for that reason.
- **Comments explain the decision, not the syntax** — what would go wrong if the code were written
  the obvious way. Match that register.
