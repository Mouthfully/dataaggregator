/**
 * WHAT EACH PLAN IS ALLOWED, AS DATA.
 *
 * `plans.ts` holds what a plan COSTS. This holds what it BUYS, and it is a deliberately short file:
 * a limit belongs here only if this repository could actually count the thing being limited. The
 * rest of what the pricing page prints per tier -- refresh cadence, AI insight tiers, task
 * management, white-label reports, API access, support channel -- has no mechanism behind it in any
 * migration or module, and a record carrying those fields would launder marketing prose into
 * something that reads as a source of truth. They are absent on purpose; the ones worth naming are
 * named under WHAT IS NOT HERE, with what was looked for and not found.
 *
 * NOTHING ENFORCES ANY OF THIS TODAY, AND THAT IS STATED RATHER THAN IMPLIED.
 *
 * `public.current_plan(uuid)` in `supabase/migrations/20260912000600_billing.sql` answers which
 * plan an organisation is on. ONE thing calls it: the `supabase.rpc("current_plan", ...)` in
 * `app/billing/page.tsx`, which displays the answer. Four other files mention it in prose -- the
 * Stripe webhook, the terms page, this file and the pricing page -- and a mention is not a caller.
 * Nothing asks it before doing work.
 *
 * For connections there is no APPLICATION code path that creates one: `connect`, `connectWithKey`
 * and `connectWithToken` in `@repo/connections` have no callers outside their own tests,
 * `ConnectionStore.upsert` has no implementation anywhere, and `createConnectionStore` in
 * `@repo/store` is a read adapter. The operator route -- pasting the INSERT that
 * `scripts/seal-connection.ts` prints -- is how every row that exists today got there.
 *
 * BUT IT IS NOT THE ONLY ROUTE, AND THE DIFFERENCE DECIDES WHERE A GATE WOULD HAVE TO LIVE.
 * `20260908000700_rls.sql` grants `insert, update on public.connections to authenticated` (line
 * 237) and carries `connections_insert ... with check (app.can_write_workspace(workspace_id))`
 * (line 151). A signed-in member of a workspace can therefore POST a connection row straight to
 * PostgREST without touching this application at all.
 *
 * So an allowance enforced in app code would not be enforcement; it would be a suggestion any
 * client could skip, which is the same mistake as putting tenancy in application code instead of
 * RLS. When something finally counts connections, it belongs in the database -- a trigger or a
 * tightened `with check` -- next to the policy that already decides who may write the row.
 *
 * So this file is the catalogue half of an entitlement and the enforcement half does not exist yet.
 * Do not write on any page that connections are capped, metered or counted. Today they are not.
 *
 * WHERE THE NUMBERS COME FROM. They are the figures the site already publishes -- the per-tier
 * cards and the comparison table in `app/_sections/Pricing.tsx`, and the feature matrix in
 * `app/pricing/page.tsx`, which typed 3 / 10 / 50 / 200+ twice over until both were changed to read
 * this record. This file does not decide them; it is where they stopped being typed twice.
 *
 * WHAT THE COUNT WOULD BE OF, WHEN SOMETHING FINALLY COUNTS. Per ORGANISATION, because
 * `current_plan` takes an organisation id and an agency on one subscription holds one workspace per
 * client -- a per-workspace reading would make "200+" mean 200 per client, which is not a number
 * anybody priced. Which rows count is NOT decided anywhere: `connections_workspace_idx` is
 * partial on `revoked_at is null` and `app.due_connections` skips revoked rows, so live-only is the
 * natural reading, but nothing has ruled on it and this file does not rule on it either.
 *
 * WHAT IS NOT HERE, AND WHAT WAS LOOKED FOR.
 *
 *   REFRESH CADENCE. The cards sell Daily / Hourly / 15 min / 5 min. No migration has a cadence,
 *   interval or frequency column on any table -- `public.connections` holds `last_backfill_at` and
 *   `restatement_window_days` and nothing else about timing. The only schedule the code has is in
 *   `app.due_connections` (20260908001000_scheduler.sql), whose due-ness test is
 *   `last_backfill_at < date_trunc('day', p_now)`: one pull per day, for every connection, on every
 *   plan. That is a property of the scheduler, not of a subscription, so a per-plan field holding
 *   the same value four times would imply the plan decides something it does not.
 *
 *   WORKSPACES AND MEMBERS. Both are countable -- `public.workspaces` and `public.members` both
 *   carry `organisation_id` -- so they are here, holding null. Nothing in any migration or in this
 *   catalogue caps either, which is why the matrix already prints "Not set". Null means NO CAP HAS
 *   BEEN DECIDED. It does not mean unlimited, and rendering it as "Unlimited" would be selling an
 *   entitlement nobody agreed to.
 *
 *   ENTERPRISE. Not a plan. `app.billing_plan` has four members and so does `Plan`; the fifth
 *   column on the pricing page is a sales conversation, and giving it a record here would invent a
 *   tier the database cannot store.
 */

import { PLANS, type Plan } from "./plans";

/**
 * How many connections a plan allows.
 *
 * TWO FIELDS BECAUSE THE CATALOGUE PUBLISHES TWO DIFFERENT KINDS OF NUMBER. Free, Starter and
 * Growth are published as exact figures. Agency is published as "200+", which is a floor: at least
 * two hundred, with no stated ceiling. Storing 200 alone and letting a renderer print it would
 * quietly drop the "+" and turn a floor into a cap -- a smaller promise than the one on the page.
 * `formatAllowance` is the only thing that should ever turn this pair back into a string.
 */
export interface ConnectionAllowance {
  readonly count: number;
  /** True when the published figure is a floor ("200+") rather than an exact number. */
  readonly atLeast: boolean;
}

export interface PlanEntitlements {
  readonly plan: Plan;
  readonly connections: ConnectionAllowance;
  /** Workspaces in one organisation. Null means no cap decided -- never "unlimited". */
  readonly workspaces: number | null;
  /** Members of one organisation. Null means no cap decided -- never "unlimited". */
  readonly members: number | null;
}

/**
 * A `Record` rather than an array, so a plan added to `PLANS` without an entitlement record is a
 * type error at the moment it is added rather than an `undefined` a page renders as a blank cell.
 */
export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    plan: "free",
    connections: { count: 3, atLeast: false },
    workspaces: null,
    members: null,
  },
  starter: {
    plan: "starter",
    connections: { count: 10, atLeast: false },
    workspaces: null,
    members: null,
  },
  growth: {
    plan: "growth",
    connections: { count: 50, atLeast: false },
    workspaces: null,
    members: null,
  },
  agency: {
    plan: "agency",
    // "200+" on the cards and in the matrix. The floor, not a cap. See `ConnectionAllowance`.
    connections: { count: 200, atLeast: true },
    workspaces: null,
    members: null,
  },
};

export function entitlementsFor(plan: Plan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

/**
 * The allowance as the catalogue publishes it.
 *
 * The one place the "+" is added, because it is the one place it can be forgotten. A cell that
 * prints `String(allowance.count)` is wrong for Agency in the direction that matters -- it shrinks
 * a published floor into a cap -- and reads as correct.
 */
export function formatAllowance(allowance: ConnectionAllowance): string {
  return allowance.atLeast ? `${allowance.count}+` : String(allowance.count);
}
