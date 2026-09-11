/**
 * ECB euro reference rates, kept as a SECOND source rather than the default.
 *
 * It stopped being the default in `40-fx-bank-of-thailand.md`: pricing a Thai P&L off a European
 * central bank is a defect, not a preference. It is kept because the swap is a source change, not
 * a rewrite -- ECB covers thirty currencies with a free, documented, unauthenticated feed, and a
 * source abstraction with exactly one implementation has not been shown to abstract anything.
 *
 * WHAT IS DELIBERATELY ABSENT: any automatic fallback to this source. `convert` reads the source
 * id off the table it was handed, so a caller that fetches BOT gets BOT on the row and a caller
 * that fetches ECB gets ECB. There is no path where a missing Thai banking day silently becomes a
 * Frankfurt rate wearing a Bangkok label.
 *
 * THE REASON THE AUDIT TRAIL EXISTS, unchanged and worth keeping in front of whoever reads this.
 * Specification section 7, on the ECB's own words: the rates are "published for information
 * purposes only" and "using the rates for transaction purposes is strongly discouraged". That is
 * not a footnote to hide, it is the reason a converted number must always travel with the rate
 * that produced it. It applies to BOT too: a customer reconciling against their own bank's rate
 * needs to see exactly what we used, not be told the number is correct.
 *
 * Coverage is 30 published currencies, not the 42 the specification assumed (section 7,
 * fact-check correction). A currency outside that set cannot be converted, and this module says so
 * rather than inventing a rate.
 */

import type { DailyRates, FxSourceDescriptor, FxTable } from "./fx.js";

export const ECB_SOURCE_ID = "ecb_reference_rates";

/**
 * The currencies ECB actually publishes.
 *
 * Named explicitly rather than derived from whatever a fetch happened to return, so that a
 * truncated or partial feed is a visible failure rather than a silently narrower table. ECB can
 * carry a real list where BOT carries `null` for one reason only: this one was confirmed and that
 * one was not.
 */
export const ECB_CURRENCIES: readonly string[] = [
  "USD",
  "JPY",
  "BGN",
  "CZK",
  "DKK",
  "GBP",
  "HUF",
  "PLN",
  "RON",
  "SEK",
  "CHF",
  "ISK",
  "NOK",
  "TRY",
  "AUD",
  "BRL",
  "CAD",
  "CNY",
  "HKD",
  "IDR",
  "ILS",
  "INR",
  "KRW",
  "MXN",
  "MYR",
  "NZD",
  "PHP",
  "SGD",
  "THB",
  "ZAR",
];

export const ECB_SOURCE: FxSourceDescriptor = {
  id: ECB_SOURCE_ID,
  base: "EUR",
  catalogue: ECB_CURRENCIES,
  /** Confirmed catalogue, so anything short of all of it is a truncated fetch. */
  required: ECB_CURRENCIES,
};

/**
 * Parse ECB's published XML.
 *
 * Deliberately a small regex scan rather than an XML parser: the document is a fixed, machine-
 * generated shape, Workers have no DOMParser, and pulling in a parser for three attributes would
 * be a dependency to maintain forever. If ECB ever changes the shape this fails loudly and visibly
 * rather than returning a subtly wrong table.
 *
 * THE INVERSION. ECB publishes units of foreign currency per one EUR; the internal convention is
 * the price of one unit of the currency in the table's base (see `fx.ts`). One source has to take
 * the reciprocal and it is this one, because the Thailand-first product's dominant conversion is
 * into baht and that one should land on the row bit-for-bit as BOT published it. The cost here is
 * bounded at one ulp -- measured at most 1.6e-16 relative across every four-decimal rate between
 * 0.0001 and 200 -- against rates ECB publishes to five significant figures.
 */
export function parseEcbXml(xml: string): FxTable {
  const days: DailyRates[] = [];
  const dayPattern = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;

  for (let match = dayPattern.exec(xml); match !== null; match = dayPattern.exec(xml)) {
    const date = match[1];
    const body = match[2];
    if (date === undefined || body === undefined) continue;

    const rates: Record<string, number> = {};
    const ratePattern = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/?>/g;
    for (let rate = ratePattern.exec(body); rate !== null; rate = ratePattern.exec(body)) {
      const currency = rate[1];
      const value = Number(rate[2]);
      // `> 0` is load-bearing beyond rejecting nonsense: a published zero would invert to Infinity.
      if (currency !== undefined && Number.isFinite(value) && value > 0)
        rates[currency] = 1 / value;
    }
    if (Object.keys(rates).length > 0) days.push({ date, rates });
  }

  // Newest first, which is what the carry-forward walk expects.
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { source: ECB_SOURCE, days };
}
