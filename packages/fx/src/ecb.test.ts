import { describe, expect, it } from "vitest";
import { ECB_CURRENCIES, ECB_SOURCE, ECB_SOURCE_ID, parseEcbXml } from "./ecb.js";
import { convert, validateTable } from "./fx.js";

/** The shape of ECB's feed with two days of deliberately round, synthetic rates. */
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

describe("parsing ECB's XML", () => {
  it("reads each published day and stamps ECB onto the table", () => {
    const table = parseEcbXml(XML);
    expect(table.source.id).toBe(ECB_SOURCE_ID);
    expect(table.source).toBe(ECB_SOURCE);
    expect(table.days).toHaveLength(2);
    expect(table.days[0]?.date).toBe("2026-09-04");
  });

  it("inverts into the internal convention: the price of one unit, in the base", () => {
    // ECB publishes 1.1 USD per EUR. Stored is the other direction -- what one dollar costs in
    // euro -- because that is the one convention the cross-rate arithmetic runs on.
    const table = parseEcbXml(XML);
    expect(table.days[0]?.rates.USD).toBe(1 / 1.1);
  });

  it("round-trips ECB's published figure back onto the row", () => {
    // The reciprocal is taken here rather than for BOT, so the cost of it lands on the fallback
    // source. Bounded at one ulp; ECB publishes to five significant figures.
    const table = parseEcbXml(XML);
    const result = convert({ table, amount: 1, from: "EUR", to: "USD", date: "2026-09-04" });
    expect(result.fxRate).toBeCloseTo(1.1, 12);
    expect(Math.abs(result.fxRate - 1.1) / 1.1).toBeLessThan(1e-15);
  });

  it("orders newest first, which is what the carry-forward walk needs", () => {
    const table = parseEcbXml(XML.replace(/2026-09-04/, "2026-09-02"));
    expect(table.days[0]?.date).toBe("2026-09-03");
  });

  it("returns an empty table for something that is not the ECB feed", () => {
    expect(parseEcbXml("<html>not the feed</html>").days).toHaveLength(0);
  });

  it("ignores a malformed rate rather than storing NaN, and a zero rather than storing Infinity", () => {
    const malformed = parseEcbXml(XML.replace("rate='1.1'", "rate='not-a-number'"));
    expect(malformed.days[0]?.rates.USD).toBeUndefined();
    expect(malformed.days[0]?.rates.GBP).toBe(1 / 0.85);

    const zero = parseEcbXml(XML.replace("rate='1.1'", "rate='0'"));
    expect(zero.days[0]?.rates.USD).toBeUndefined();
  });
});

describe("ECB is a second source, not a fallback", () => {
  it("labels its own rows and holds its whole catalogue", () => {
    expect(ECB_SOURCE.base).toBe("EUR");
    expect(ECB_SOURCE.required).toBe(ECB_CURRENCIES);
    const partial = validateTable(parseEcbXml(XML));
    expect(partial.ok).toBe(false);
    expect(partial.missing.length).toBeGreaterThan(0);
  });
});
