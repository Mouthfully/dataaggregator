import { describe, expect, it } from "vitest";
import { BOT_SOURCE, FX_SOURCE } from "./bot.js";
import { ECB_CURRENCIES, ECB_SOURCE, ECB_SOURCE_ID } from "./ecb.js";
import {
  type FxTable,
  FxError,
  MAX_CARRY_FORWARD_DAYS,
  convert,
  isCovered,
  rateOn,
  validateTable,
} from "./fx.js";

/**
 * SYNTHETIC RATES. Not BOT data and not close to it -- no live call was made and inventing
 * plausible baht rates would make a fixture that reads like evidence. Every number below is a
 * round figure chosen to make the arithmetic checkable by eye.
 *
 * Friday and Thursday, with no Saturday or Sunday: BOT publishes on Thai banking days.
 */
const BOT: FxTable = {
  source: BOT_SOURCE,
  days: [
    { date: "2026-09-04", rates: { USD: 35.25, SGD: 27.5 } },
    { date: "2026-09-03", rates: { USD: 35.0, SGD: 27.0 } },
  ],
};

/** Same shape, EUR base, prices already inverted the way `parseEcbXml` stores them. */
const ECB: FxTable = {
  source: ECB_SOURCE,
  days: [{ date: "2026-09-04", rates: { USD: 1 / 1.1, GBP: 1 / 0.85 } }],
};

describe("the source on the row is the source of the rate", () => {
  // The defect this package was changed for: `FX_SOURCE` was a module constant stamped onto every
  // conversion, so the row said what the code believed rather than where the number came from.

  it("reads the source id off the table that supplied the rate", () => {
    const bot = convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-04" });
    const ecb = convert({ table: ECB, amount: 100, from: "USD", to: "EUR", date: "2026-09-04" });
    expect(bot.fxSource).toBe(FX_SOURCE);
    expect(ecb.fxSource).toBe(ECB_SOURCE_ID);
  });

  it("no longer defaults to a European central bank for a Thai product", () => {
    expect(FX_SOURCE).toBe("bot_daily_avg_exchange_rate");
    expect(FX_SOURCE).not.toBe(ECB_SOURCE_ID);
    expect(BOT_SOURCE.base).toBe("THB");
  });

  it("cannot produce a row claiming one source while holding another's rate", () => {
    // There is no fallback path to test, which is the assertion: a conversion carries the id of
    // the only table it was given. Swapping the table swaps the label with the number, together.
    const swapped: FxTable = { source: ECB_SOURCE, days: BOT.days };
    expect(
      convert({ table: swapped, amount: 1, from: "USD", to: "EUR", date: "2026-09-04" }).fxSource,
    ).toBe(ECB_SOURCE_ID);
  });
});

describe("coverage", () => {
  it("refuses a currency ECB does not publish, rather than inventing a rate", () => {
    // A guessed rate is indistinguishable from a real one once it is in the row.
    expect(ECB_CURRENCIES).toHaveLength(30);
    expect(isCovered(ECB_SOURCE, "AED")).toBe(false);
    expect(() =>
      convert({ table: ECB, amount: 100, from: "AED", to: "EUR", date: "2026-09-04" }),
    ).toThrow(FxError);
  });

  it("says what to do about an uncovered currency", () => {
    try {
      convert({ table: ECB, amount: 100, from: "EUR", to: "AED", date: "2026-09-04" });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as FxError).code).toBe("uncovered_currency");
      expect((error as Error).message).toContain("paid fallback");
    }
  });

  it("does not rule out a currency for a source whose catalogue was never confirmed", () => {
    // BOT's published currency list is unverified here, so claiming AED is uncovered would be as
    // fabricated as claiming it is covered. The applicable day answers instead.
    expect(BOT_SOURCE.catalogue).toBeNull();
    expect(isCovered(BOT_SOURCE, "AED")).toBe(true);
    expect(() =>
      convert({ table: BOT, amount: 100, from: "AED", to: "THB", date: "2026-09-04" }),
    ).toThrow(/carries no rate for AED/);
  });
});

describe("converting", () => {
  it("puts BOT's published figure on the row unmodified", () => {
    // The storage convention exists for this assertion: converting into the base divides by
    // exactly 1, so `fx_rate` is the number an auditor reads off BOT's own table. Not `closeTo`.
    const result = convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-04" });
    expect(result.fxRate).toBe(35.25);
    expect(result.amount).toBe(3525);
    expect(result.fxBase).toBe("USD");
  });

  it("converts out of the base by taking the reciprocal", () => {
    const result = convert({
      table: BOT,
      amount: 3525,
      from: "THB",
      to: "USD",
      date: "2026-09-04",
    });
    expect(result.amount).toBeCloseTo(100, 10);
  });

  it("crosses two non-base currencies through the base", () => {
    // 100 USD -> 3525 THB -> 128.18 SGD at 27.5 baht each.
    const result = convert({ table: BOT, amount: 100, from: "USD", to: "SGD", date: "2026-09-04" });
    expect(result.amount).toBeCloseTo(3525 / 27.5, 10);
  });

  it("still converts correctly for a EUR-based table", () => {
    const result = convert({ table: ECB, amount: 100, from: "EUR", to: "USD", date: "2026-09-04" });
    expect(result.amount).toBeCloseTo(110, 10);
  });

  it("is a no-op when the currencies match, and still records the audit fields", () => {
    const result = convert({ table: BOT, amount: 42, from: "THB", to: "THB", date: "2026-09-04" });
    expect(result.amount).toBe(42);
    expect(result.fxRate).toBe(1);
    expect(result.fxSource).toBe(FX_SOURCE);
  });

  it("converts a currency into itself on a day nothing was published", () => {
    // One baht is one baht through Songkran. Refusing a THB row in a THB workspace because the
    // banks were shut would be absurd, so this path never consults the table.
    const result = convert({ table: BOT, amount: 42, from: "THB", to: "THB", date: "2020-01-01" });
    expect(result.amount).toBe(42);
    expect(result.fxRateDate).toBe("2020-01-01");
  });

  it("carries every field the envelope requires", () => {
    const result = convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-04" });
    expect(result.fxSource).toBe("bot_daily_avg_exchange_rate");
    expect(result.fxBase).toBe("USD");
    expect(result.fxRateDate).toBe("2026-09-04");
    expect(result.fxRate).toBeGreaterThan(0);
  });

  it("refuses a non-finite amount rather than propagating NaN into a metric", () => {
    expect(() =>
      convert({ table: BOT, amount: Number.NaN, from: "USD", to: "THB", date: "2026-09-04" }),
    ).toThrow(/not a convertible amount/);
  });

  it("refuses a date that is not a date, rather than string-comparing it into the table", () => {
    // "2026-02-30" sorts cleanly into the middle of February and does not exist.
    expect(() =>
      convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-02-30" }),
    ).toThrow(/not a calendar date/);
    expect(() =>
      convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "04/09/2026" }),
    ).toThrow(/not a calendar date/);
  });
});

describe("days BOT does not publish: weekends, Thai holidays, the publication lag", () => {
  it("carries Friday's rate forward to Saturday", () => {
    const result = convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-05" });
    expect(result.amount).toBe(3525);
  });

  it("says it used Friday's rate rather than claiming Sunday's", () => {
    // This is the whole reason fx_rate_date is a separate field from the row's date. A stale rate
    // stamped with today's date is a silent wrong number; stamped with its own date it is a
    // disclosed one.
    const result = convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-06" });
    expect(result.fxRateDate).toBe("2026-09-04");
  });

  it("never reaches backwards from a later publication", () => {
    // Using Monday's rate for Sunday would be using information that did not exist yet.
    expect(rateOn(BOT, "USD", "2026-09-02")).toBeNull();
  });

  it("fails rather than guessing when nothing has been published yet", () => {
    expect(() =>
      convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-01-01" }),
    ).toThrow(/published nothing on or before/);
  });

  it("carries a rate across a Songkran-length closure", () => {
    // 13 to 15 April 2026 fall Monday to Wednesday, so the banks are shut from Saturday the 11th
    // and Friday the 10th is the last published day. Five days carried, and disclosed as such.
    const songkran: FxTable = {
      source: BOT_SOURCE,
      days: [{ date: "2026-04-10", rates: { USD: 35.25 } }],
    };
    const result = convert({
      table: songkran,
      amount: 100,
      from: "USD",
      to: "THB",
      date: "2026-04-15",
    });
    expect(result.amount).toBe(3525);
    expect(result.fxRateDate).toBe("2026-04-10");
  });
});

describe("the staleness ceiling", () => {
  // A carried rate is honest for a weekend and wrong for a broken feed, and the old
  // implementation could not tell the difference: it walked back as far as the table went.

  it("carries up to the bound", () => {
    const result = convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-14" });
    expect(result.fxRateDate).toBe("2026-09-04");
  });

  it("refuses one day past it", () => {
    try {
      convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-09-15" });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as FxError).code).toBe("stale_rate");
      expect((error as Error).message).toContain("2026-09-04");
    }
  });

  it("refuses a six-week-old rate outright rather than converting with it", () => {
    expect(() =>
      convert({ table: BOT, amount: 100, from: "USD", to: "THB", date: "2026-10-20" }),
    ).toThrow(/feed that stopped/);
  });

  it("bounds rateOn by default, so a caller who forgets still gets the safe answer", () => {
    expect(rateOn(BOT, "USD", "2026-09-15")).toBeNull();
    expect(rateOn(BOT, "USD", "2026-09-15", 30)?.rateDate).toBe("2026-09-04");
    expect(MAX_CARRY_FORWARD_DAYS).toBe(10);
  });
});

describe("both legs must come from the same published day", () => {
  it("refuses rather than reaching back a day for a currency missing from the applicable day", () => {
    // The error a mixed cross-rate introduces is small enough to survive review and large enough
    // to break a reconciliation, which is the worst combination. SGD exists on the 3rd but not the
    // 4th, and the 4th is the applicable day.
    const patchy: FxTable = {
      source: BOT_SOURCE,
      days: [
        { date: "2026-09-04", rates: { USD: 35.25 } },
        { date: "2026-09-03", rates: { USD: 35.0, SGD: 27.0 } },
      ],
    };
    expect(() =>
      convert({ table: patchy, amount: 100, from: "SGD", to: "USD", date: "2026-09-04" }),
    ).toThrow(/existed at no single moment/);
  });

  it("gives the base the same published rate-date as the other leg, not the requested date", () => {
    // The bug this covers: the base has no published rate, so giving it the REQUESTED date made
    // every base-leg conversion on a weekend look like a two-day cross-rate and get rejected.
    const result = convert({ table: BOT, amount: 100, from: "THB", to: "USD", date: "2026-09-06" });
    expect(result.fxRateDate).toBe("2026-09-04");
  });
});

describe("validating a fetched table", () => {
  it("rejects a table whose newest day is missing the one rate BOT is fetched for", () => {
    // A partial feed converts most rows correctly and a few not at all. The failure is at least
    // visible; the partial success is not.
    const result = validateTable({
      source: BOT_SOURCE,
      days: [{ date: "2026-09-04", rates: { SGD: 27.5 } }],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("USD");
  });

  it("accepts a BOT table carrying USD", () => {
    expect(validateTable(BOT).ok).toBe(true);
  });

  it("rejects an empty table", () => {
    expect(validateTable({ source: BOT_SOURCE, days: [] }).ok).toBe(false);
  });

  it("holds ECB to its whole confirmed catalogue, because that one was confirmed", () => {
    const partial = validateTable({
      source: ECB_SOURCE,
      days: [{ date: "2026-09-04", rates: { USD: 1 / 1.1 } }],
    });
    expect(partial.ok).toBe(false);
    expect(partial.missing).toContain("GBP");

    const full = Object.fromEntries(ECB_CURRENCIES.map((currency) => [currency, 1.5]));
    expect(
      validateTable({ source: ECB_SOURCE, days: [{ date: "2026-09-04", rates: full }] }).ok,
    ).toBe(true);
  });
});
