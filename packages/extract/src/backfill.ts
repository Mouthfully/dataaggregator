/**
 * The restatement backfill planner.
 *
 * Kickoff non-negotiable 6, "correctness over coverage": tiered restatement backfill ships before a
 * fifth connector. This is that scheduler's arithmetic, and it is the reason the product is a
 * materialised store rather than a passthrough.
 *
 * The backfill is built around RESTATEMENT, not around new data (specification section 7). Yesterday's
 * numbers are not finished: Meta keeps changing a row for 28 days after it is first reported, Google
 * Ads credits late conversions back to the original click date across its conversion window, and GA4
 * adjusts attribution for 12 days. A scheduler that only fetches new days produces a report that
 * silently disagrees with the platform's own UI a week later.
 *
 * The shape, from section 9 week 2: daily for D-0 to D-3, then weekly out to the platform's window.
 * Recent days move most and are cheapest to re-pull; a row three weeks old moves rarely and pulling
 * it daily buys almost nothing for 20x the quota.
 *
 * There is a hard ceiling that shapes it further: Meta caps async breakdown jobs at 10 per ad account
 * per day (section 9). A plan that ignores that does not fail politely -- it gets throttled partway
 * through and leaves a tenant with a half-updated window and no obvious cause.
 */

import { RESTATEMENT_CLOCKS, type Source } from "@repo/contract";

const DAY_MS = 86_400_000;

export interface BackfillWindow {
  /** Inclusive start, YYYY-MM-DD. */
  readonly from: string;
  /** Inclusive end, YYYY-MM-DD. */
  readonly to: string;
  readonly tier: "daily" | "weekly" | "initial";
  readonly reason: string;
}

export interface BackfillPlan {
  readonly source: Source;
  readonly windows: readonly BackfillWindow[];
  /** One platform request per window, which is what the per-day caps are counted against. */
  readonly requestCount: number;
  /** Set when the plan had to be trimmed to fit a platform's per-day cap. */
  readonly trimmed: { droppedWindows: number; cap: number } | null;
}

/**
 * Per-day request caps that are per ACCOUNT, not per developer token.
 *
 * Section 9: "Meta caps async breakdown jobs at 10 per ad account per day."
 *
 * With the tiering below, Meta's 28-day window costs 8 windows and never reaches this cap. That is
 * the designed outcome, not a coincidence -- 28 daily pulls would be 28. The cap stays enforced
 * anyway, because the specification explicitly flags its own Meta rate-limit figures as not
 * appearing in the cited source (section 3.2, correction 5), so the real number may be lower than
 * this one. `dailyRequestCap` lets a caller pass the number it actually observed rather than
 * trusting a constant the research could not verify.
 */
const DAILY_REQUEST_CAP: Partial<Record<Source, number>> = {
  meta_ads: 10,
};

function toDate(iso: string): number {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new TypeError(`backfill: unparseable date ${iso}`);
  return parsed;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface PlanInput {
  readonly source: Source;
  /** Today, as the scheduler sees it. Passed in so a plan is reproducible and testable. */
  readonly today: string;
  /**
   * The earliest date this connection has data for. On a first run this is the start of the initial
   * backfill; afterwards it bounds how far back a window may reach.
   */
  readonly earliestDate: string;
  /** Null on the first run. */
  readonly lastBackfillAt: string | null;
  /** Google Ads reads its window per account; ignored for sources with a fixed one. */
  readonly accountWindowDays?: number;
  /**
   * Override the per-account daily request cap.
   *
   * Exists because the specification flags its own Meta rate-limit figures as unverified. A caller
   * that has measured the real ceiling -- from the `x-fb-ads-insights-throttle` header, say -- should
   * pass it rather than trusting the constant here.
   */
  readonly dailyRequestCap?: number;
}

/**
 * Build the windows to pull.
 *
 * Returns them newest first. That ordering is deliberate: if a run is cut short by a quota error or
 * a Workflow timeout, the days most likely to have changed are already done, and the tail is the
 * part that moves least.
 */
export function planBackfill(input: PlanInput): BackfillPlan {
  const clock = RESTATEMENT_CLOCKS[input.source];
  const windowDays = clock.perAccount
    ? (input.accountWindowDays ?? clock.windowDays ?? 0)
    : (clock.windowDays ?? 0);

  const today = toDate(input.today);
  const earliest = toDate(input.earliestDate);
  const windows: BackfillWindow[] = [];

  // First run: one window covering everything, rather than hundreds of daily pulls. The initial
  // load is a bulk read; the tiers exist for the steady state.
  if (input.lastBackfillAt === null) {
    windows.push({
      from: input.earliestDate,
      to: input.today,
      tier: "initial",
      reason: "First pull for this connection: load the full available history in one request.",
    });
    return { source: input.source, windows, requestCount: 1, trimmed: null };
  }

  // Tier 1: D-0 to D-3, one window per day. These move most.
  const DAILY_TIER_DAYS = 4;
  for (let offset = 0; offset < DAILY_TIER_DAYS; offset += 1) {
    const day = today - offset * DAY_MS;
    if (day < earliest) break;
    windows.push({
      from: toIso(day),
      to: toIso(day),
      tier: "daily",
      reason: "Within the daily tier: recent days change most and are cheapest to re-pull.",
    });
  }

  // Tier 2: weekly out to the platform's restatement window. A row three weeks old moves rarely,
  // and pulling it daily costs 20x the quota for almost nothing.
  //
  // A window of 0 means the source is never restated (a SERP observation is re-measured, not
  // revised), so the weekly tier is skipped entirely rather than producing empty work.
  if (windowDays > DAILY_TIER_DAYS) {
    let cursor = today - DAILY_TIER_DAYS * DAY_MS;
    const floor = Math.max(today - windowDays * DAY_MS, earliest);
    while (cursor >= floor) {
      const chunkStart = Math.max(cursor - 6 * DAY_MS, floor);
      windows.push({
        from: toIso(chunkStart),
        to: toIso(cursor),
        tier: "weekly",
        reason: `Inside ${input.source}'s ${windowDays}-day restatement window, where rows still change but rarely.`,
      });
      cursor = chunkStart - DAY_MS;
    }
  }

  // Trim to the per-account cap if there is one. The daily tier survives; the oldest weekly windows
  // are dropped first, because they are the least likely to have changed and will be picked up on
  // the next run.
  const cap = input.dailyRequestCap ?? DAILY_REQUEST_CAP[input.source];
  if (cap !== undefined && windows.length > cap) {
    const dropped = windows.length - cap;
    return {
      source: input.source,
      windows: windows.slice(0, cap),
      requestCount: cap,
      trimmed: { droppedWindows: dropped, cap },
    };
  }

  return { source: input.source, windows, requestCount: windows.length, trimmed: null };
}

/**
 * Cloudflare Workflows allows 10,000 steps per instance by default.
 *
 * `00-repo-map.md` section 5 warned that a 40-client agency in one instance would cost 14,400 steps
 * and blow this. THAT FIGURE ASSUMED A NAIVE DAILY BACKFILL -- four sources times ninety days. With
 * the tiering above the same coverage costs 35 windows per account rather than 360, so one account
 * is 105 steps and forty clients are 4,200: comfortably inside.
 *
 * The advice is unchanged and now rests on a real number instead of an overstated one. One instance
 * per connected ACCOUNT, never per tenant, because the ceiling is reached at about 95 accounts and
 * an agency can exceed that -- and when it does, the failure arrives mid-backfill on the largest
 * customer rather than in testing.
 */
export const WORKFLOW_STEP_LIMIT = 10_000;

export interface StepBudget {
  readonly steps: number;
  readonly withinLimit: boolean;
  readonly limit: number;
  readonly advice: string;
}

/**
 * Steps a plan costs, at the granularity the Workflow actually uses.
 *
 * Each window is submit, poll, land: three steps. Meta's async insights jobs are the canonical case
 * and the most expensive, so the estimate is built for them rather than for the cheapest source.
 */
export function stepBudget(plans: readonly BackfillPlan[]): StepBudget {
  const STEPS_PER_WINDOW = 3;
  const steps = plans.reduce((total, plan) => total + plan.requestCount * STEPS_PER_WINDOW, 0);
  const withinLimit = steps <= WORKFLOW_STEP_LIMIT;
  return {
    steps,
    withinLimit,
    limit: WORKFLOW_STEP_LIMIT,
    advice: withinLimit
      ? "Within one Workflow instance."
      : "Too many steps for one instance. Split by connected account -- never one instance per tenant.",
  };
}
