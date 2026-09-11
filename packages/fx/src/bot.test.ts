import { describe, expect, it } from "vitest";
import {
  BOT_MAX_RANGE_DAYS,
  BOT_SOURCE,
  BOT_UNIT_QUOTED,
  FX_SOURCE,
  botDateRanges,
  botRateRequests,
  parseBotDailyAvgExchangeRate,
  quotedUnit,
} from "./bot.js";
import { validateTable } from "./fx.js";

/**
 * SYNTHETIC FIXTURE. NOT BOT DATA.
 *
 * `portal.api.bot.or.th` requires registration and no key exists in this repository, so no live
 * call was made and nothing here was observed. The STRUCTURE follows the documented v1 shape
 * (`result.data.data_detail[]`, rates as strings); the NUMBERS are deliberately impossible -- a
 * dollar at 10 baht, a Singapore dollar at 20 -- so that nobody can mistake this file for evidence
 * of what BOT publishes, and so a copy-paste into anything real fails loudly.
 */
function botPayload(detail: readonly Record<string, unknown>[]): unknown {
  return {
    result: {
      timestamp: "2026-09-05 09:00:00",
      api: "Average Exchange Rate - THB / Foreign Currency",
      data: {
        data_header: { report_name_eng: "SYNTHETIC FIXTURE", last_updated: "2026-09-04" },
        data_detail: detail,
      },
    },
  };
}

const quote = (period: string, id: string, name: string, mid: string) => ({
  period,
  currency_id: id,
  currency_name_eng: name,
  buying_sight: mid,
  buying_transfer: mid,
  selling: mid,
  mid_rate: mid,
});

describe("parsing BOT's daily average exchange rate", () => {
  it("reads each published day and stamps the source onto the table", () => {
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-03", "USD", "USA : DOLLAR", "10.0000"),
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.5000"),
        quote("2026-09-04", "SGD", "SINGAPORE : DOLLAR", "20.0000"),
      ]),
    );
    expect(table.source).toBe(BOT_SOURCE);
    expect(table.source.id).toBe(FX_SOURCE);
    expect(table.days).toHaveLength(2);
    expect(table.days[0]?.date).toBe("2026-09-04");
    expect(table.days[0]?.rates.USD).toBe(10.5);
    expect(table.days[0]?.rates.SGD).toBe(20);
  });

  it("orders newest first, which is what the carry-forward walk needs", () => {
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.5000"),
        quote("2026-09-03", "USD", "USA : DOLLAR", "10.0000"),
      ]),
    );
    expect(table.days.map((day) => day.date)).toEqual(["2026-09-04", "2026-09-03"]);
  });

  it("stores baht per unit without inverting, so BOT's own figure survives to the row", () => {
    const table = parseBotDailyAvgExchangeRate(
      botPayload([quote("2026-09-04", "USD", "USA : DOLLAR", "10.5000")]),
    );
    expect(table.days[0]?.rates.USD).toBe(10.5);
  });

  it("drops a holiday row whose rate is an empty string rather than storing zero", () => {
    // THE TRAP: `Number("")` is 0, not NaN, so a `Number.isFinite` check passes it. A stored rate
    // of zero converts every amount to nothing on one leg and divides by zero on the other.
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.5000"),
        quote("2026-09-07", "USD", "USA : DOLLAR", ""),
      ]),
    );
    expect(table.days).toHaveLength(1);
    expect(table.days[0]?.date).toBe("2026-09-04");
  });

  it("divides out a unit the feed declares", () => {
    // "(100)" means the figure is baht per hundred, not per one.
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.0000"),
        quote("2026-09-04", "JPY", "JAPAN : YEN (100)", "700.0000"),
      ]),
    );
    expect(table.days[0]?.rates.JPY).toBe(7);
  });

  it("refuses a suspected per-100 currency that arrives without its unit", () => {
    // Reading 700 baht per 100 yen as 700 baht per yen is a 100x error, silent and permanent once
    // stored. Refusing costs one currency; guessing costs every JPY row.
    expect(BOT_UNIT_QUOTED).toContain("JPY");
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.0000"),
        quote("2026-09-04", "JPY", "JAPAN : YEN", "700.0000"),
      ]),
    );
    expect(table.days[0]?.rates.JPY).toBeUndefined();
    expect(table.days[0]?.rates.USD).toBe(10);
  });

  it("drops both quotes when one day carries two different rates for one currency", () => {
    // Picking by arrival order is not resolving a contradiction, it is hiding one.
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.0000"),
        quote("2026-09-04", "USD", "USA : DOLLAR", "11.0000"),
        quote("2026-09-04", "SGD", "SINGAPORE : DOLLAR", "20.0000"),
      ]),
    );
    expect(table.days[0]?.rates.USD).toBeUndefined();
    expect(table.days[0]?.rates.SGD).toBe(20);
    expect(validateTable(table).ok).toBe(false);
  });

  it("keeps a repeated identical quote, which is what overlapping range chunks produce", () => {
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.0000"),
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.0000"),
      ]),
    );
    expect(table.days[0]?.rates.USD).toBe(10);
  });

  it("ignores a row whose period or currency is not one", () => {
    const table = parseBotDailyAvgExchangeRate(
      botPayload([
        quote("2026-09-04", "USD", "USA : DOLLAR", "10.0000"),
        quote("2026-02-30", "SGD", "SINGAPORE : DOLLAR", "20.0000"),
        quote("2026-09-04", "Dollar", "USA : DOLLAR", "10.0000"),
      ]),
    );
    expect(table.days).toHaveLength(1);
    expect(Object.keys(table.days[0]?.rates ?? {})).toEqual(["USD"]);
  });

  it("returns an empty table for anything that is not the documented shape", () => {
    // Loud at ingest beats partial in the store. `validateTable` is what turns this into a failure.
    for (const payload of [null, undefined, "", { result: {} }, { data_detail: [] }, []]) {
      const table = parseBotDailyAvgExchangeRate(payload);
      expect(table.days).toHaveLength(0);
      expect(validateTable(table).ok).toBe(false);
    }
  });

  it("requires USD on the newest day before the table is trusted", () => {
    const table = parseBotDailyAvgExchangeRate(
      botPayload([quote("2026-09-04", "SGD", "SINGAPORE : DOLLAR", "20.0000")]),
    );
    expect(validateTable(table).missing).toEqual(["USD"]);
  });
});

describe("reading the quoted unit", () => {
  it("reads a trailing parenthesised multiple, and nothing else", () => {
    expect(quotedUnit("JAPAN : YEN (100)")).toBe(100);
    expect(quotedUnit("USA : DOLLAR")).toBeNull();
    expect(quotedUnit("(0)")).toBeNull();
    expect(quotedUnit(undefined)).toBeNull();
    expect(quotedUnit(42)).toBeNull();
  });
});

describe("splitting a backfill range into requests the gateway will accept", () => {
  it("chunks at the documented range limit", () => {
    const ranges = botDateRanges("2026-01-01", "2026-03-31");
    expect(BOT_MAX_RANGE_DAYS).toBe(30);
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ start: "2026-01-01", end: "2026-01-30" });
    expect(ranges[2]).toEqual({ start: "2026-03-02", end: "2026-03-31" });
  });

  it("covers the range exactly once, with no gap and no overlap", () => {
    const ranges = botDateRanges("2026-01-01", "2026-02-15");
    expect(ranges[0]?.start).toBe("2026-01-01");
    expect(ranges[ranges.length - 1]?.end).toBe("2026-02-15");
    for (let i = 1; i < ranges.length; i++) {
      const previousEnd = Date.parse(`${ranges[i - 1]?.end}T00:00:00Z`);
      const thisStart = Date.parse(`${ranges[i]?.start}T00:00:00Z`);
      expect(thisStart - previousEnd).toBe(86_400_000);
    }
  });

  it("handles a single day, and refuses a range that is not one", () => {
    expect(botDateRanges("2026-09-04", "2026-09-04")).toEqual([
      { start: "2026-09-04", end: "2026-09-04" },
    ]);
    expect(botDateRanges("2026-09-05", "2026-09-04")).toEqual([]);
    expect(botDateRanges("2026-02-30", "2026-03-05")).toEqual([]);
    expect(botDateRanges("yesterday", "2026-03-05")).toEqual([]);
  });
});

describe("building the requests", () => {
  it("carries the endpoint and the key header from configuration, never from a default", () => {
    // There is no default endpoint and no default header name in this module, because neither has
    // been confirmed for the v2 gateway. A guessed URL sitting in the tree looks confirmed.
    const requests = botRateRequests(
      {
        endpoint: "https://gateway.example/CONFIGURED-PATH",
        apiKeyHeader: "x-configured-header",
        apiKey: "SYNTHETIC-NOT-A-KEY",
      },
      { start: "2026-09-01", end: "2026-09-04" },
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://gateway.example/CONFIGURED-PATH?start_period=2026-09-01&end_period=2026-09-04",
    );
    expect(requests[0]?.headers).toEqual({ "x-configured-header": "SYNTHETIC-NOT-A-KEY" });
  });

  it("emits one request per chunk for a range longer than the limit", () => {
    const requests = botRateRequests(
      { endpoint: "https://gateway.example/p", apiKeyHeader: "k", apiKey: "SYNTHETIC" },
      { start: "2026-01-01", end: "2026-03-31" },
    );
    expect(requests).toHaveLength(3);
  });
});
