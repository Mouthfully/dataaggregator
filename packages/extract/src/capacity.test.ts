import { describe, expect, it } from "vitest";
import { planBackfill } from "./backfill.ts";
import { GOOGLE_ADS_TIERS, SURVIVAL_ACCOUNTS, accountCapacity } from "./capacity.ts";

/** Whatever the scheduler actually issues, not a guess. */
const requestsPerAccountPerDay = planBackfill({
  source: "google_ads",
  today: "2026-09-08",
  earliestDate: "2020-01-01",
  lastBackfillAt: "2026-09-07T02:00:00Z",
  accountWindowDays: 90,
}).requestCount;

describe("how many accounts one shared developer token carries", () => {
  it("costs 17 requests per account per day at a 90-day window", () => {
    // The number the capacity arithmetic rests on, taken from the planner rather than assumed.
    expect(requestsPerAccountPerDay).toBe(17);
  });

  it("Explorer falls SHORT of the survival number", () => {
    // 2,880 / 17 = 169. Section 0 puts survival at 240 to 400 paying accounts, so a single shared
    // token on Explorer cannot reach breakeven. This is the finding that decides the access plan.
    const capacity = accountCapacity({ tier: "explorer", requestsPerAccountPerDay });
    expect(capacity.accountsSupported).toBe(169);
    expect(capacity.accountsSupported).toBeLessThan(SURVIVAL_ACCOUNTS.low);
    expect(capacity.coversSurvivalNumber).toBe(false);
    expect(capacity.note).toContain("per-tenant developer tokens");
  });

  it("Basic covers it", () => {
    // 15,000 / 17 = 882, comfortably past 400. Which is why section 9 applies for Basic in week 1
    // rather than waiting to need it.
    const capacity = accountCapacity({ tier: "basic", requestsPerAccountPerDay });
    expect(capacity.accountsSupported).toBe(882);
    expect(capacity.coversSurvivalNumber).toBe(true);
  });

  it("treats Standard as unlimited, and records that it may not be reachable", () => {
    const capacity = accountCapacity({ tier: "standard", requestsPerAccountPerDay });
    expect(capacity.accountsSupported).toBeNull();
    // Section 11.11, High severity: RMF categories are defined by what a tool displays.
    expect(GOOGLE_ADS_TIERS.standard.howObtained).toContain("headless");
  });

  it("gives Test no production capacity at all", () => {
    expect(GOOGLE_ADS_TIERS.test.operationsPerDay).toBe(0);
    expect(() => accountCapacity({ tier: "test", requestsPerAccountPerDay: 0 })).toThrow();
  });

  it("shrinks as the scheduler does more work per account", () => {
    // If the restatement depth grows, capacity falls. Worth seeing rather than discovering.
    const deeper = accountCapacity({ tier: "basic", requestsPerAccountPerDay: 34 });
    expect(deeper.accountsSupported).toBe(441);
  });

  it("refuses a nonsensical request count rather than dividing by zero", () => {
    expect(() => accountCapacity({ tier: "basic", requestsPerAccountPerDay: 0 })).toThrow(
      /must be positive/,
    );
  });
});
