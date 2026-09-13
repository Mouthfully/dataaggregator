import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PerformanceRow } from "../_auth/workspace";
import { DASHBOARD_LIVE } from "../_content";
import { LiveRows } from "./_rows";

/**
 * THE TABLE, READ THE WAY A CUSTOMER READS IT.
 *
 * `renderToStaticMarkup` and then text, which is how every page in this app is tested: the
 * assertions are about what a reader sees, and a DOM would be bought for nothing.
 *
 * The rows below are fabricated HERE, in a test file, and that is the only place figures may be
 * invented. Two of them are built to be the numbers that get printed wrongly: a provisional row,
 * and a row whose revenue is null while its spend is not.
 */

const base = {
  source: "google_ads",
  entity_id: "c-1",
  currency: "EUR",
  attribution_window: "7d_click",
  spend: 120.5,
  impressions: 4000,
  clicks: 210,
  sessions: null,
  conversions: 12,
  conversions_value: 980.25,
  revenue: null,
  orders: null,
  net_revenue: null,
  fees: null,
  commission: null,
  position: null,
} as const;

const rows = [
  {
    ...base,
    date: "2026-06-02",
    is_provisional: true,
    fetched_at: "2026-06-03T04:00:00Z",
  },
  {
    ...base,
    entity_id: "c-2",
    date: "2026-06-01",
    currency: "JPY",
    is_provisional: false,
    fetched_at: "2026-06-02T04:00:00Z",
    spend: 9000,
    revenue: 12000,
  },
] as unknown as readonly PerformanceRow[];

const text = renderToStaticMarkup(<LiveRows rows={rows} />)
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/&#x2014;|&mdash;/g, "—")
  .replace(/\s+/g, " ");

describe("the figures reach the page", () => {
  it("prints the metrics the rows carry, not just their metadata", () => {
    // The bug this unit fixes: the dashboard could say a row existed and could not say what it
    // said. Both spend figures and the conversions count are asserted.
    expect(text).toContain("120.5");
    expect(text).toContain("9,000");
    expect(text).toContain("980.25");
  });

  it("gives a column to a metric some row reported and none to a metric no row did", () => {
    expect(text).toContain("conversions_value");
    expect(text).not.toContain("commission");
  });
});

describe("a figure says what currency it is in", () => {
  it("uses each row's own currency rather than one currency for the table", () => {
    expect(text).toContain("EUR");
    expect(text).toContain("JPY");
  });

  it("never prints a currency no row named", () => {
    expect(text).not.toContain("USD");
    expect(text).not.toContain("$");
  });
});

describe("a provisional figure is visibly not final", () => {
  it("marks the provisional row and names it in its status", () => {
    expect(text).toContain(DASHBOARD_LIVE.provisionalMark);
    expect(text).toContain(DASHBOARD_LIVE.provisional);
  });

  it("says the settled row is settled", () => {
    expect(text).toContain(DASHBOARD_LIVE.final);
  });

  it("explains the mark on the page rather than leaving it as decoration", () => {
    for (const entry of DASHBOARD_LIVE.legend) {
      expect(text).toContain(entry.body);
    }
  });

  it("does not mark a figure on a settled row", () => {
    // One provisional row with five present metric columns. Counting the marks is what catches a
    // component that dagger-stamped every cell and called the job done.
    const marks = text.split(DASHBOARD_LIVE.provisionalMark).length - 1;
    const legendMarks = DASHBOARD_LIVE.legend.filter(
      (entry) => entry.mark === DASHBOARD_LIVE.provisionalMark,
    ).length;
    const present = ["spend", "impressions", "clicks", "conversions", "conversions_value"].length;
    expect(marks).toBe(present + legendMarks);
  });
});

describe("a null metric is absent, not zero", () => {
  it("renders the absent mark and never a fabricated zero in a money column", () => {
    expect(text).toContain(DASHBOARD_LIVE.absentMark);
    // The control first: a present amount DOES read "EUR 120.5" once the markup is flattened,
    // so the two refusals below are assertions about the page rather than about a string that
    // could never have matched. Intl separates the code from the amount with a non-breaking
    // space, which the whitespace collapse above turns into an ordinary one.
    expect(text).toContain("EUR 120.5");
    // `revenue` is null on the provisional row, and "EUR 0" is what `?? 0` would have printed
    // there. "JPY 0" is the same mistake on the other row, whose sessions and position are null.
    expect(text).not.toContain("EUR 0");
    expect(text).not.toContain("JPY 0");
  });
});

describe("every row says when it was read", () => {
  it("prints fetched_at verbatim, with the offset it was stored with", () => {
    expect(text).toContain("2026-06-03T04:00:00Z");
    expect(text).toContain("2026-06-02T04:00:00Z");
  });
});
