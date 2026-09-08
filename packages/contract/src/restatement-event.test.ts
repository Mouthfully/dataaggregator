import { describe, expect, it } from "vitest";
import { restatementEventSchema } from "./restatement-event.js";

/** A valid event: conversions moved from 41 to 47 after Meta restated the window. */
function event(overrides: Record<string, unknown> = {}) {
  return {
    type: "restated",
    id: "3f2a1c44-0000-4000-8000-000000000001",
    workspace_id: "7c000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-08T02:14:33Z",
    source: "meta_ads",
    entity: { type: "ad_group", id: "ag_1", account_id: "act_123" },
    dimensions: { date: "2026-08-14", currency: "EUR", attribution_window: "7d_click" },
    metrics: { spend: 1240.55, conversions: 47 },
    revised_from: { conversions: 41 },
    fetched_at: "2026-09-08T02:14:33Z",
    first_seen_at: "2026-08-14T06:00:00Z",
    restates_until: "2026-09-11T00:00:00Z",
    is_provisional: true,
    ...overrides,
  };
}

describe("the restatement event", () => {
  it("accepts a real restatement", () => {
    expect(restatementEventSchema.safeParse(event()).success).toBe(true);
  });

  it("carries revised_from, which the read row deliberately does not", () => {
    // `00-repo-map.md`: revised_from is "placed in the restatement webhook payload, not on the read
    // row". A row states what is true now; only the event states what it was.
    const parsed = restatementEventSchema.parse(event());
    expect(parsed.revised_from.conversions).toBe(41);
    expect(parsed.metrics.conversions).toBe(47);
  });

  it("accepts a metric revised to absent, because a platform can stop reporting one", () => {
    const result = restatementEventSchema.safeParse(
      event({ metrics: { spend: 1240.55 }, revised_from: { conversions: 41 } }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts several metrics moving at once", () => {
    const result = restatementEventSchema.safeParse(
      event({
        metrics: { conversions: 47, conversions_value: 5210 },
        revised_from: { conversions: 41, conversions_value: 4980 },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("the refusals: what only this schema can be wrong about", () => {
  it("refuses an empty diff, because nothing moved is not a restatement", () => {
    const result = restatementEventSchema.safeParse(event({ revised_from: {} }));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("empty diff");
  });

  it("refuses an event that did not restate: same value before and after", () => {
    const result = restatementEventSchema.safeParse(
      event({ metrics: { conversions: 41 }, revised_from: { conversions: 41 } }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("did not restate");
  });

  it("names which metric did not move, so the producer bug is findable", () => {
    const result = restatementEventSchema.safeParse(
      event({
        metrics: { conversions: 47, spend: 1240.55 },
        revised_from: { conversions: 41, spend: 1240.55 },
      }),
    );
    expect(result.success).toBe(false);
    const issues = JSON.stringify(result.error?.issues);
    expect(issues).toContain("spend");
    expect(issues).not.toContain("conversions, spend");
  });

  it("refuses a metric name the dictionary does not have", () => {
    const result = restatementEventSchema.safeParse(event({ revised_from: { roas: 4.1 } }));
    expect(result.success).toBe(false);
  });

  it("refuses an unlabelled event type", () => {
    expect(restatementEventSchema.safeParse(event({ type: "changed" })).success).toBe(false);
  });

  it("does not re-assert the row's own invariants, which the database already enforced", () => {
    // A conversion count with no attribution window is refused on the ROW, by envelopeRowSchema and
    // by a check constraint. An event cannot exist without such a row, so duplicating the rule here
    // would add logic that cannot disagree -- until it does.
    const result = restatementEventSchema.safeParse(
      event({ dimensions: { date: "2026-08-14", currency: "EUR", attribution_window: null } }),
    );
    expect(result.success).toBe(true);
  });
});
