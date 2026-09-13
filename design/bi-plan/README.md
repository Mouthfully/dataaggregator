# The BI product plan — founder-supplied artboard

`Main.dc.html` is a design mockup of the product as originally planned, exported from a visual
design tool. It is a REFERENCE, not production code.

## Why it is in the repository

It arrived as a chat upload, which means it was readable by one session and nobody else. Every
decision it drives — the positioning, the four capabilities, the audience — is a decision someone
will need to check the source for later, and a file that exists only in a conversation cannot be
checked. So it is committed.

It is NOT the same artboard as `design/marketplane/Main.dc.html` (41 KB, the marketing page this
site was built from). This one is 172 KB and describes the whole product.

## What it specifies

"Business intelligence for small business. Your whole business on one page. Every morning."

Target: owner-operated businesses in Thailand — cafés, bars and restaurants, hotels and
guesthouses, online sellers, clinics and salons — with no analyst and no IT department.

Four capabilities:

1. **The morning brief** — yesterday in three lines, anything unusual, one thing worth doing today.
   Reply to ask a follow-up. Thai or English.
2. **The action sheet** — a weekly to-do list ranked by what each item is worth, impact as a range
   where uncertain, and the following week it checks whether each one worked and says so.
3. **Ask** — plain-language questions answered from the business's own data, causes ranked by how
   much of the change they explain, what was ruled out, every figure linking to its source and
   fetch time.
4. **Consolidated reports** — monthly investor update, P&L by unit and channel, bank loan pack.

Plus an AI-answer visibility module: how often ChatGPT, Gemini, Perplexity and Google's AI Overview
cite this business versus rivals, counted over 35 runs a week because one check means nothing.

## Read this before implementing any of it

`docs/marketplane/58-plan-reconciliation.md` establishes which of the plan's named data sources are
actually reachable. The short version: the plan's canonical café — FoodStory POS, GrabFood orders,
K PLUS bank — has no readable data source, and three of those are unreachable in principle rather
than on paperwork.

The delivery channel in the mockup is LINE. The founder has since said delivery is pluggable
(LINE, Slack, Discord, Telegram, email), so build a channel adapter rather than a LINE feature.

## Viewing

Serve the folder and open `Main.dc.html`; the runtime files it shipped with (`support.js`,
`vendor/`) were not committed — they render the component in a browser and are not design content.
