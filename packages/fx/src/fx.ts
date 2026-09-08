/**
 * Currency conversion against ECB euro reference rates.
 *
 * Specification section 2: "Currency is normalised at fetch time with the rate source and date
 * recorded on the row." Section 7 chooses ECB reference rates because they are free, authoritative
 * and auditable, and the envelope carries `fx_source`, `fx_rate_date` and `fx_rate` so a customer
 * can reproduce any converted number.
 *
 * THE REASON THE AUDIT TRAIL EXISTS. Section 7, on the ECB's own words: the rates are "published for
 * information purposes only" and "using the rates for transaction purposes is strongly discouraged".
 * That is not a footnote to hide, it is the reason a converted number must always travel with the
 * rate that produced it. A customer reconciling against their own bank's rate needs to see exactly
 * what we used, not be told the number is correct.
 *
 * TWO THINGS THE SPECIFICATION GOT WRONG OR LEFT OPEN, decided here:
 *
 * 1. Coverage is 32 currencies, not 42 (section 7, fact-check correction). A currency outside that
 *    set cannot be converted, and this module says so rather than inventing a rate. The gap is
 *    roughly ten currencies wider than the research assumed, which is the case for a paid fallback.
 *
 * 2. The carry-forward rule is unspecified. ECB publishes on TARGET business days only, so there is
 *    no rate for a weekend, and marketing spend certainly happens at weekends. The decision here is
 *    to carry the most recent published rate FORWARD, never to interpolate and never to reach
 *    backwards from a later date. Forward carry is what a reader would assume, it is what the rate
 *    actually was on the last day anyone published one, and `fx_rate_date` makes it visible: a
 *    Saturday row will honestly say it used Friday's rate.
 */

/** The rates ECB publishes for one day: units of each currency per 1 EUR. */
export interface DailyRates {
  /** The date ECB published these for, YYYY-MM-DD. */
  readonly date: string;
  readonly rates: Readonly<Record<string, number>>;
}

export interface FxTable {
  /** Newest first. */
  readonly days: readonly DailyRates[];
}

export const FX_SOURCE = "ecb_reference_rates";

/**
 * The currencies ECB actually publishes.
 *
 * Named explicitly rather than derived from whatever a fetch happened to return, so that a truncated
 * or partial feed is a visible failure rather than a silently narrower table.
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

/** EUR is the base and is never listed among the rates, so coverage includes it explicitly. */
export function isCovered(currency: string): boolean {
  return currency === "EUR" || ECB_CURRENCIES.includes(currency);
}

export class FxError extends Error {
  constructor(
    message: string,
    readonly code: "uncovered_currency" | "no_rate_available" | "invalid_amount",
  ) {
    super(message);
    this.name = "FxError";
  }
}

export interface Conversion {
  readonly amount: number;
  readonly currency: string;
  /** Exactly the fields the envelope requires. */
  readonly fxSource: string;
  readonly fxRate: number;
  readonly fxRateDate: string;
  readonly fxBase: string;
}

/**
 * The published day that applies to a given date: the most recent one at or before it.
 *
 * This is the carry-forward, and it is resolved ONCE per conversion rather than once per currency.
 * That ordering is the whole design. Resolving per currency lets one leg land on Friday and the
 * other on Thursday, producing a cross-rate that existed at no single moment -- an error small
 * enough to survive review and large enough to break a reconciliation.
 *
 * Doing it this way also fixes a subtler trap. EUR has no published rate: it is the base, always 1.
 * If EUR is given the REQUESTED date while the other leg carries its PUBLISHED date, then every
 * EUR conversion on a weekend looks like a two-day cross-rate and is rejected. Resolving the day
 * first means both legs share it by construction and EUR reports the same honest `fx_rate_date` as
 * everything else.
 */
export function dayFor(table: FxTable, date: string): DailyRates | null {
  // Days are newest first, so the first entry at or before the date is the one to carry forward.
  for (const day of table.days) {
    if (day.date <= date) return day;
  }
  return null;
}

/** The rate for one currency within an already-resolved day. EUR is the base and is always 1. */
export function rateIn(day: DailyRates, currency: string): number | null {
  if (currency === "EUR") return 1;
  return day.rates[currency] ?? null;
}

/**
 * The rate to use for a given date, with the date it was actually published for.
 *
 * Those differ every weekend, and the difference is exactly what `fx_rate_date` exists to disclose.
 */
export function rateOn(
  table: FxTable,
  currency: string,
  date: string,
): { rate: number; rateDate: string } | null {
  const day = dayFor(table, date);
  if (day === null) return null;
  const rate = rateIn(day, currency);
  return rate === null ? null : { rate, rateDate: day.date };
}

/**
 * Convert an amount into the target currency.
 *
 * ECB quotes everything against EUR, so a non-EUR pair goes through EUR: divide out the source rate,
 * multiply by the target's. Both rates must come from the same published day, or the result is a
 * cross-rate from two different moments — which is how a reconciliation ends up off by a few tenths
 * of a percent with nothing to point at.
 */
export function convert(options: {
  table: FxTable;
  amount: number;
  from: string;
  to: string;
  date: string;
}): Conversion {
  if (!Number.isFinite(options.amount)) {
    throw new FxError(`fx: ${options.amount} is not a convertible amount`, "invalid_amount");
  }

  for (const currency of [options.from, options.to]) {
    if (!isCovered(currency)) {
      throw new FxError(
        `fx: ECB publishes no reference rate for ${currency}. Its feed covers ${ECB_CURRENCIES.length} ` +
          "currencies plus EUR; anything else needs a paid fallback rather than a guess.",
        "uncovered_currency",
      );
    }
  }

  if (options.from === options.to) {
    return {
      amount: options.amount,
      currency: options.to,
      fxSource: FX_SOURCE,
      fxRate: 1,
      fxRateDate: options.date,
      fxBase: options.from,
    };
  }

  // One day for both legs, resolved before either rate is looked up.
  const day = dayFor(options.table, options.date);
  if (day === null) {
    throw new FxError(
      `fx: no published rate on or before ${options.date}. ECB publishes on TARGET business days ` +
        "only, and nothing has been published on or before this date.",
      "no_rate_available",
    );
  }

  const fromRate = rateIn(day, options.from);
  const toRate = rateIn(day, options.to);
  if (fromRate === null || toRate === null) {
    // Refused rather than carried forward per currency: reaching back a further day for the missing
    // leg would build a cross-rate that existed at no single moment.
    const missing = fromRate === null ? options.from : options.to;
    throw new FxError(
      `fx: ${day.date} is the applicable published day and it carries no rate for ${missing}. ` +
        "Refusing rather than reaching back a further day, which would build a cross-rate that " +
        "existed at no single moment.",
      "no_rate_available",
    );
  }

  const rate = toRate / fromRate;
  return {
    amount: options.amount * rate,
    currency: options.to,
    fxSource: FX_SOURCE,
    fxRate: rate,
    fxRateDate: day.date,
    fxBase: options.from,
  };
}

/**
 * Parse ECB's published XML.
 *
 * Deliberately a small regex scan rather than an XML parser: the document is a fixed, machine-
 * generated shape, Workers have no DOMParser, and pulling in a parser for three attributes would be
 * a dependency to maintain forever. If ECB ever changes the shape this fails loudly and visibly
 * rather than returning a subtly wrong table.
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
      if (currency !== undefined && Number.isFinite(value) && value > 0) rates[currency] = value;
    }
    if (Object.keys(rates).length > 0) days.push({ date, rates });
  }

  // Newest first, which is what rateOn's carry-forward walk expects.
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { days };
}

/**
 * Whether a parsed table is complete enough to trust.
 *
 * A partial feed converts most rows correctly and a few not at all, which is worse than a failure:
 * the failure is visible. Checked at ingest so a bad fetch never reaches the store.
 */
export function validateTable(table: FxTable): { ok: boolean; missing: readonly string[] } {
  const newest = table.days[0];
  if (newest === undefined) return { ok: false, missing: ECB_CURRENCIES };
  const missing = ECB_CURRENCIES.filter((currency) => newest.rates[currency] === undefined);
  return { ok: missing.length === 0, missing };
}
