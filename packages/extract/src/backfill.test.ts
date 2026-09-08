import { describe, expect, it } from "vitest";
import { WORKFLOW_STEP_LIMIT, planBackfill, stepBudget } from "./backfill.js";

const TODAY = "2026-09-08";

function plan(overrides: Partial<Parameters<typeof planBackfill>[0]> = {}) {
  return planBackfill({
    source: "meta_ads",
    today: TODAY,
    earliestDate: "2020-01-01",
    lastBackfillAt: "2026-09-07T02:00:00Z",
    ...overrides,
  });
}

describe("the first run", () => {
  it("loads history in one window rather than hundreds of daily pulls", () => {
    const result = plan({ lastBackfillAt: null, earliestDate: "2026-06-01" });
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]?.tier).toBe("initial");
    expect(result.windows[0]?.from).toBe("2026-06-01");
    expect(result.windows[0]?.to).toBe(TODAY);
  });
});

describe("the daily tier", () => {
  it("pulls D-0 to D-3 one day at a time", () => {
    const daily = plan().windows.filter((w) => w.tier === "daily");
    expect(daily.map((w) => w.from)).toEqual([
      "2026-09-08",
      "2026-09-07",
      "2026-09-06",
      "2026-09-05",
    ]);
    // Each is a single day, not a range.
    for (const window of daily) expect(window.from).toBe(window.to);
  });

  it("does not reach back before the connection has data", () => {
    const result = plan({ earliestDate: "2026-09-07" });
    const daily = result.windows.filter((w) => w.tier === "daily");
    expect(daily).toHaveLength(2);
  });
});

describe("the weekly tier", () => {
  it("covers the rest of the platform's restatement window in weekly chunks", () => {
    // GA4 restates for 12 days: 4 daily windows, then the remaining 8 days weekly.
    const result = plan({ source: "ga4" });
    const weekly = result.windows.filter((w) => w.tier === "weekly");
    expect(weekly.length).toBeGreaterThan(0);

    const oldest = weekly[weekly.length - 1];
    // The 12-day window from 2026-09-08 reaches back to 2026-08-27.
    expect(oldest?.from).toBe("2026-08-27");
  });

  it("stops at the platform's window rather than pulling forever", () => {
    const result = plan({ source: "ga4" });
    const dates = result.windows.map((w) => w.from).sort();
    expect(dates[0]).toBe("2026-08-27");
  });

  it("reaches further for a source with a longer window", () => {
    // Google Ads reads its window per account, and the cap is 90 days.
    const short = plan({ source: "google_ads", accountWindowDays: 30 });
    const long = plan({ source: "google_ads", accountWindowDays: 90 });
    expect(long.windows.length).toBeGreaterThan(short.windows.length);
  });

  it("is skipped entirely for a source that is never restated", () => {
    // A SERP observation is re-measured, not revised, so a weekly re-pull would be empty work.
    const result = plan({ source: "dataforseo_serp" });
    expect(result.windows.every((w) => w.tier === "daily")).toBe(true);
  });

  it("is skipped for a source whose window is unknown", () => {
    // Search Console has no published window. Null means unknown, and inventing a depth here would
    // be indistinguishable from a sourced one.
    const result = plan({ source: "search_console" });
    expect(result.windows.filter((w) => w.tier === "weekly")).toHaveLength(0);
  });
});

describe("Meta's per-account cap", () => {
  // Section 9: Meta caps async breakdown jobs at 10 per ad account per day. A plan that ignores it
  // gets throttled partway through, leaving a half-updated window and no obvious cause.

  it("never exceeds 10 requests for one Meta account in a day", () => {
    const result = plan({ source: "meta_ads" });
    expect(result.requestCount).toBeLessThanOrEqual(10);
  });

  it("fits under the cap WITHOUT trimming, which is what the weekly tier is for", () => {
    // 28 daily pulls would be 28 requests and hit the cap immediately. The tiering brings Meta's
    // 28-day window down to 8, so nothing has to be dropped. Measured, not assumed: this test
    // originally asserted that trimming happened, and the planner was right and the test was wrong.
    const result = plan({ source: "meta_ads" });
    expect(result.windows).toHaveLength(8);
    expect(result.trimmed).toBeNull();
  });

  it("still trims, and says what it dropped, if the real cap turns out lower", () => {
    // The specification flags its own Meta rate-limit figures as not appearing in the cited source,
    // so the observed ceiling may be lower than 10. This is that path, exercised directly rather
    // than left as an untested branch.
    const result = plan({ source: "meta_ads", dailyRequestCap: 5 });
    expect(result.requestCount).toBe(5);
    expect(result.trimmed?.cap).toBe(5);
    expect(result.trimmed?.droppedWindows).toBe(3);
    // The daily tier survives a trim: those days move most.
    expect(result.windows.filter((w) => w.tier === "daily")).toHaveLength(4);
  });

  it("does not cap a source with no documented per-account limit", () => {
    expect(plan({ source: "google_ads", accountWindowDays: 90 }).trimmed).toBeNull();
  });
});

describe("ordering", () => {
  it("returns newest first, so a run cut short has done the days that matter", () => {
    // If a run dies on a quota error or a Workflow timeout, the days most likely to have changed
    // are already done and the tail is the part that moves least.
    const windows = plan({ source: "ga4" }).windows;
    const froms = windows.map((w) => w.from);
    expect(froms).toEqual([...froms].sort().reverse());
  });
});

describe("the Workflow step budget", () => {
  // 00-repo-map.md section 5: one instance per connected ACCOUNT, never per tenant. This is the
  // arithmetic behind that instruction.

  it("fits four sources for one account comfortably", () => {
    const plans = [
      plan({ source: "google_ads", accountWindowDays: 90 }),
      plan({ source: "meta_ads" }),
      plan({ source: "ga4" }),
      plan({ source: "search_console" }),
    ];
    const budget = stepBudget(plans);
    expect(budget.withinLimit).toBe(true);
    expect(budget.steps).toBeLessThan(WORKFLOW_STEP_LIMIT / 10);
  });

  it("costs 105 steps for one account across four sources", () => {
    const budget = stepBudget([
      plan({ source: "google_ads", accountWindowDays: 90 }),
      plan({ source: "meta_ads" }),
      plan({ source: "ga4" }),
      plan({ source: "search_console" }),
    ]);
    expect(budget.steps).toBe(105);
    expect(budget.withinLimit).toBe(true);
  });

  it("CORRECTS the phase 0 estimate: 40 clients cost 4,200 steps, not 14,400", () => {
    // docs/marketplane/00-repo-map.md section 5 put a 40-client agency at 14,400 steps and called
    // it over the limit. That figure assumed a NAIVE daily backfill -- 4 sources x 90 days. Tiering
    // makes the same coverage cost 35 windows per account instead of 360, so 40 clients fit
    // comfortably. The map has been corrected; the number is measured here.
    const oneAccount = [
      plan({ source: "google_ads", accountWindowDays: 90 }),
      plan({ source: "meta_ads" }),
      plan({ source: "ga4" }),
      plan({ source: "search_console" }),
    ];
    const budget = stepBudget(Array.from({ length: 40 }, () => oneAccount).flat());
    expect(budget.steps).toBe(4200);
    expect(budget.withinLimit).toBe(true);
  });

  it("still breaks, and says what to do, at the scale where it actually breaks", () => {
    // 95 accounts per instance, not 28. The advice is unchanged -- one instance per connected
    // account -- but it is now justified by a real number rather than an overstated one.
    const oneAccount = [
      plan({ source: "google_ads", accountWindowDays: 90 }),
      plan({ source: "meta_ads" }),
      plan({ source: "ga4" }),
      plan({ source: "search_console" }),
    ];
    const budget = stepBudget(Array.from({ length: 100 }, () => oneAccount).flat());
    expect(budget.withinLimit).toBe(false);
    expect(budget.advice).toContain("never one instance per tenant");
  });

  it("counts three steps per window: submit, poll, land", () => {
    const single = plan({ lastBackfillAt: null });
    expect(stepBudget([single]).steps).toBe(3);
  });
});

describe("input validation", () => {
  it("refuses an unparseable date rather than planning against NaN", () => {
    expect(() => plan({ today: "not-a-date" })).toThrow(/unparseable/);
  });
});
