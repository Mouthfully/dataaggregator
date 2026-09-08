import { describe, expect, it } from "vitest";
import {
  ECB_CURRENCIES,
  FX_SOURCE,
  FxError,
  type FxTable,
  convert,
  isCovered,
  parseEcbXml,
  rateOn,
  validateTable,
} from "./fx.js";

/** Friday and Thursday. There is deliberately no Saturday or Sunday: ECB does not publish then. */
const TABLE: FxTable = {
  days: [
    { date: "2026-09-04", rates: { USD: 1.1, GBP: 0.85, JPY: 160 } },
    { date: "2026-09-03", rates: { USD: 1.09, GBP: 0.84, JPY: 159 } },
  ],
};

describe("coverage", () => {
  it("covers the 30 currencies ECB publishes, plus EUR", () => {
    // The specification's fact-check corrected this from 42 to 32 pairs. The real published set is
    // what is listed, and the point stands either way: the gap is wider than the research assumed,
    // which is the case for a paid fallback.
    expect(ECB_CURRENCIES).toHaveLength(30);
    expect(isCovered("EUR")).toBe(true);
    expect(isCovered("USD")).toBe(true);
  });

  it("refuses a currency ECB does not publish, rather than inventing a rate", () => {
    // A guessed rate is indistinguishable from a real one once it is in the row.
    expect(isCovered("AED")).toBe(false);
    expect(() =>
      convert({ table: TABLE, amount: 100, from: "AED", to: "EUR", date: "2026-09-04" }),
    ).toThrow(FxError);
  });

  it("says what to do about an uncovered currency", () => {
    try {
      convert({ table: TABLE, amount: 100, from: "EUR", to: "AED", date: "2026-09-04" });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as FxError).code).toBe("uncovered_currency");
      expect((error as Error).message).toContain("paid fallback");
    }
  });
});

describe("converting", () => {
  it("converts from EUR using the published rate", () => {
    const result = convert({
      table: TABLE,
      amount: 100,
      from: "EUR",
      to: "USD",
      date: "2026-09-04",
    });
    expect(result.amount).toBeCloseTo(110, 10);
    expect(result.fxRate).toBeCloseTo(1.1, 10);
  });

  it("converts into EUR by dividing out the source rate", () => {
    const result = convert({
      table: TABLE,
      amount: 110,
      from: "USD",
      to: "EUR",
      date: "2026-09-04",
    });
    expect(result.amount).toBeCloseTo(100, 10);
  });

  it("crosses two non-EUR currencies through EUR", () => {
    // GBP 85 -> EUR 100 -> USD 110.
    const result = convert({
      table: TABLE,
      amount: 85,
      from: "GBP",
      to: "USD",
      date: "2026-09-04",
    });
    expect(result.amount).toBeCloseTo(110, 10);
  });

  it("is a no-op when the currencies match, and still records the audit fields", () => {
    const result = convert({
      table: TABLE,
      amount: 42,
      from: "USD",
      to: "USD",
      date: "2026-09-04",
    });
    expect(result.amount).toBe(42);
    expect(result.fxRate).toBe(1);
    expect(result.fxSource).toBe(FX_SOURCE);
  });

  it("carries every field the envelope requires", () => {
    // The envelope refuses a converted amount that does not carry the rate producing it.
    const result = convert({
      table: TABLE,
      amount: 100,
      from: "EUR",
      to: "USD",
      date: "2026-09-04",
    });
    expect(result.fxSource).toBe("ecb_reference_rates");
    expect(result.fxBase).toBe("EUR");
    expect(result.fxRateDate).toBe("2026-09-04");
    expect(result.fxRate).toBeGreaterThan(0);
  });

  it("refuses a non-finite amount rather than propagating NaN into a metric", () => {
    expect(() =>
      convert({ table: TABLE, amount: Number.NaN, from: "EUR", to: "USD", date: "2026-09-04" }),
    ).toThrow(/not a convertible amount/);
  });
});

describe("weekends, which ECB does not publish for", () => {
  // Marketing spend happens at weekends; ECB publishes on TARGET business days only. The
  // specification leaves the carry-forward rule unspecified, so it is decided here and disclosed.

  it("carries Friday's rate forward to Saturday", () => {
    const result = convert({
      table: TABLE,
      amount: 100,
      from: "EUR",
      to: "USD",
      date: "2026-09-05",
    });
    expect(result.amount).toBeCloseTo(110, 10);
  });

  it("says it used Friday's rate rather than claiming Saturday's", () => {
    // This is the whole reason fx_rate_date is a separate field from the row's date.
    const result = convert({
      table: TABLE,
      amount: 100,
      from: "EUR",
      to: "USD",
      date: "2026-09-06",
    });
    expect(result.fxRateDate).toBe("2026-09-04");
  });

  it("never reaches backwards from a later publication", () => {
    // Using Monday's rate for Sunday would be using information that did not exist yet.
    expect(rateOn(TABLE, "USD", "2026-09-02")).toBeNull();
  });

  it("fails rather than guessing when nothing has been published yet", () => {
    expect(() =>
      convert({ table: TABLE, amount: 100, from: "EUR", to: "USD", date: "2026-01-01" }),
    ).toThrow(/no published rate/);
  });
});

describe("both legs must come from the same published day", () => {
  it("refuses rather than reaching back a day for a currency missing from the applicable day", () => {
    // The error a mixed cross-rate introduces is small enough to survive review and large enough to
    // break a reconciliation, which is the worst combination. GBP exists on the 3rd but not the
    // 4th, and the 4th is the applicable day.
    const patchy: FxTable = {
      days: [
        { date: "2026-09-04", rates: { USD: 1.1 } },
        { date: "2026-09-03", rates: { USD: 1.09, GBP: 0.84 } },
      ],
    };
    expect(() =>
      convert({ table: patchy, amount: 100, from: "GBP", to: "USD", date: "2026-09-04" }),
    ).toThrow(/existed at no single moment/);
  });

  it("gives EUR the same published rate-date as the other leg, not the requested date", () => {
    // The bug this covers: EUR is the base and has no published rate, so giving it the REQUESTED
    // date made every EUR conversion on a weekend look like a two-day cross-rate and get rejected.
    const result = convert({
      table: TABLE,
      amount: 100,
      from: "EUR",
      to: "USD",
      date: "2026-09-06",
    });
    expect(result.fxRateDate).toBe("2026-09-04");
  });
});

describe("parsing ECB's XML", () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
  <Cube>
    <Cube time='2026-09-04'>
      <Cube currency='USD' rate='1.1'/>
      <Cube currency='GBP' rate='0.85'/>
    </Cube>
    <Cube time='2026-09-03'>
      <Cube currency='USD' rate='1.09'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

  it("reads each published day and its rates", () => {
    const table = parseEcbXml(XML);
    expect(table.days).toHaveLength(2);
    expect(table.days[0]?.date).toBe("2026-09-04");
    expect(table.days[0]?.rates.USD).toBe(1.1);
  });

  it("orders newest first, which is what the carry-forward walk needs", () => {
    const table = parseEcbXml(XML.replace(/2026-09-04/, "2026-09-02"));
    expect(table.days[0]?.date).toBe("2026-09-03");
  });

  it("returns an empty table for something that is not the ECB feed", () => {
    expect(parseEcbXml("<html>not the feed</html>").days).toHaveLength(0);
  });

  it("ignores a malformed rate rather than storing NaN", () => {
    const table = parseEcbXml(XML.replace("rate='1.1'", "rate='not-a-number'"));
    expect(table.days[0]?.rates.USD).toBeUndefined();
    expect(table.days[0]?.rates.GBP).toBe(0.85);
  });
});

describe("validating a fetched table", () => {
  it("rejects a partial feed, which is worse than a failed one", () => {
    // A partial feed converts most rows correctly and a few not at all. The failure is at least
    // visible; the partial success is not.
    const result = validateTable(
      parseEcbXml(`<Cube time='2026-09-04'><Cube currency='USD' rate='1.1'/></Cube>`),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("GBP");
  });

  it("rejects an empty table", () => {
    expect(validateTable({ days: [] }).ok).toBe(false);
  });

  it("accepts a table carrying every currency ECB publishes", () => {
    const rates = Object.fromEntries(ECB_CURRENCIES.map((c) => [c, 1.5]));
    expect(validateTable({ days: [{ date: "2026-09-04", rates }] }).ok).toBe(true);
  });
});
