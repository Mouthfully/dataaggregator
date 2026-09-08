import { classify, planBackfill, stepBudget } from "@repo/extract";
import { describe, expect, it } from "vitest";

// The note in 09-quota-aware-http.md claims this package typechecks under workers-types. That claim
// is only worth anything if something actually compiles it there, so this does.
describe("the extractor helpers under workerd", () => {
  it("classifies an auth failure as not retryable", () => {
    expect(classify(403).retryable).toBe(false);
  });

  it("plans a backfill and budgets its steps", () => {
    const plan = planBackfill({
      source: "ga4",
      today: "2026-09-08",
      earliestDate: "2026-01-01",
      lastBackfillAt: "2026-09-07T02:00:00Z",
    });
    expect(plan.windows.length).toBeGreaterThan(0);
    expect(stepBudget([plan]).withinLimit).toBe(true);
  });
});
