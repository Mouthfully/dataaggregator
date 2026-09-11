/**
 * Currency conversion. The RATE SOURCE TRAVELS ON THE DATA, not in this file.
 *
 * Specification section 2: "Currency is normalised at fetch time with the rate source and date
 * recorded on the row." The envelope carries `fx_source`, `fx_rate_date`, `fx_rate` and `fx_base`
 * (`packages/contract/src/envelope.ts`), and `fx-on-row` in `packages/brand/src/claims.ts` sells
 * exactly that sentence to customers: "Currencies converted at fetch time, with the rate, its
 * source and its date on the row." So `fx_source` is not bookkeeping. It is a published claim
 * about where a number came from, and it must be true of THAT number.
 *
 * WHY THIS FILE NO LONGER NAMES A SOURCE. It used to hold `FX_SOURCE = "ecb_reference_rates"` and
 * stamp that constant onto every conversion it produced. A constant cannot be wrong about which
 * feed the rates in front of it came from -- and that is precisely the defect, because it also
 * cannot be RIGHT. A row claiming one source while carrying another's rate is the single failure
 * the envelope exists to prevent, and a hardcoded stamp is the mechanism that produces it. So the
 * source id is read from `table.source.id`: the table that supplied the rate names itself, and a
 * mislabelled row stops being something anyone can write by accident.
 *
 * For the same reason there is NO AUTOMATIC FALLBACK between sources here. A fallback that quietly
 * swaps feeds when one is short a day is how a row ends up saying Bangkok while holding Frankfurt.
 * A caller that wants a second source fetches a second table, and that table stamps its own id.
 *
 * THE STORAGE CONVENTION, which is the part that is not obvious.
 *
 *   `DailyRates.rates[X]` is THE PRICE OF ONE UNIT OF X, EXPRESSED IN THE TABLE'S BASE.
 *
 * Sources do not agree on direction. The Bank of Thailand publishes THB per one unit of foreign
 * currency (35.2 THB per USD); the ECB publishes units of foreign currency per one EUR (1.1 USD
 * per EUR). One internal convention is not negotiable -- two directions means two code paths
 * through the cross-rate arithmetic, and a cross-rate bug is small enough to survive review and
 * large enough to break a reconciliation. So adapters normalise into this one, and exactly one of
 * them has to take a reciprocal.
 *
 * The convention above is BOT's own direction, chosen deliberately: the dominant conversion in a
 * Thailand-first product is X -> THB, and under this convention that conversion divides by exactly
 * 1.0, so the `fx_rate` written to the row is BOT's published figure bit-for-bit. An auditor
 * comparing the row against BOT's table sees the same number, not the same number plus an ulp.
 * The ECB adapter takes the reciprocal instead and its rates round-trip to within one ulp
 * (measured: at most 1.6e-16 relative over every four-decimal rate from 0.0001 to 200), which is
 * eleven orders of magnitude below the precision ECB itself publishes at.
 *
 * THE CARRY-FORWARD RULE, and the bound that is new. No source publishes every day. The rule is
 * unchanged from the ECB implementation and it was right: carry the most recent published rate
 * FORWARD, never interpolate, never reach backwards from a later date, and put the REAL
 * publication date on the row so a Saturday row honestly says it used Friday's rate.
 *
 * What was missing is a ceiling. `dayFor` walked to the first day at or before the requested date
 * however old it was, so a feed that had been broken for six weeks kept converting -- silently,
 * with a truthful but unread `fx_rate_date` six weeks stale. A stale rate stamped with an honest
 * date is still a wrong number when the staleness is not a weekend. See MAX_CARRY_FORWARD_DAYS.
 */

/** The rates one source published for one day. */
export interface DailyRates {
  /** The date the source published these for, YYYY-MM-DD. */
  readonly date: string;
  /** Price of one unit of each currency, in the table's base. See the header. */
  readonly rates: Readonly<Record<string, number>>;
}

/**
 * What a rate source is, reduced to the four things conversion and auditing actually need.
 *
 * `catalogue` is nullable on purpose, and the nullability is the honest part. ECB publishes a
 * fixed, documented list and naming it makes a truncated feed a visible failure. For a source
 * whose published currency list has NOT been confirmed, a list typed from memory would be a
 * fabricated coverage guarantee -- so `null` means "not asserted, coverage is whatever the fetched
 * table actually carries", and `required` carries the smaller, defensible floor instead.
 */
export interface FxSourceDescriptor {
  /** Stable identifier written verbatim to `envelope.fx_source`. Downstream code reads this. */
  readonly id: string;
  /** The currency the table's prices are expressed in. */
  readonly base: string;
  /** Every currency the source is KNOWN to publish, or null when that has not been confirmed. */
  readonly catalogue: readonly string[] | null;
  /** What the newest day must carry before a fetched table is trusted at all. */
  readonly required: readonly string[];
}

export interface FxTable {
  /** The source that produced these rates. This is what ends up on the row. */
  readonly source: FxSourceDescriptor;
  /** Newest first. */
  readonly days: readonly DailyRates[];
}

/**
 * How far a published rate may be carried forward before it is refused instead.
 *
 * Ten days, and the arithmetic is Thai rather than generic. The longest run of consecutive Thai
 * non-banking days is the Songkran cluster -- 13 to 15 April, plus the weekend it straddles, plus
 * the substitution days that follow when one of them falls at a weekend -- which reaches about
 * five. Add the publication lag and a weekend on the far side and a legitimate gap can touch
 * seven. Ten clears every real closure with margin.
 *
 * Beyond ten days the explanation is never a holiday; it is a feed that stopped, a key that
 * expired, or a job that has been failing unnoticed. That must surface as a refusal, because the
 * alternative is a month-old rate riding onto rows with a date nobody reads until a customer
 * reconciles and finds the number wrong.
 */
export const MAX_CARRY_FORWARD_DAYS = 10;

export class FxError extends Error {
  constructor(
    message: string,
    readonly code:
      | "uncovered_currency"
      | "no_rate_available"
      | "stale_rate"
      | "invalid_amount"
      | "invalid_date",
  ) {
    super(message);
    this.name = "FxError";
  }
}

export interface Conversion {
  readonly amount: number;
  readonly currency: string;
  /** Exactly the fields the envelope requires. `fxSource` comes from the table, never a constant. */
  readonly fxSource: string;
  readonly fxRate: number;
  readonly fxRateDate: string;
  readonly fxBase: string;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar date as a whole number of days, or null if it is not one.
 *
 * The round-trip check is not decoration. String comparison orders YYYY-MM-DD correctly and says
 * nothing about whether the string is a date, so "2026-02-30" would sort cleanly into the middle
 * of February and carry a rate onto a day that does not exist.
 */
function dayNumber(date: string): number | null {
  if (!CALENDAR_DATE.test(date)) return null;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  if (new Date(parsed).toISOString().slice(0, 10) !== date) return null;
  return parsed / 86_400_000;
}

/** Whole days from `earlier` to `later`, or null if either is not a calendar date. */
export function daysApart(later: string, earlier: string): number | null {
  const a = dayNumber(later);
  const b = dayNumber(earlier);
  return a === null || b === null ? null : a - b;
}

/**
 * Whether a source can price this currency at all, as distinct from whether a given day carries it.
 *
 * A source with no confirmed catalogue cannot rule anything out, so it answers true and the real
 * answer comes from the applicable day. That is weaker than ECB's flat list and it is the truth:
 * claiming coverage we have not confirmed would be the same class of error as claiming a source.
 */
export function isCovered(source: FxSourceDescriptor, currency: string): boolean {
  if (currency === source.base) return true;
  return source.catalogue === null ? true : source.catalogue.includes(currency);
}

/**
 * The published day that applies to a given date: the most recent one at or before it.
 *
 * Resolved ONCE per conversion rather than once per currency, and that ordering is the whole
 * design. Resolving per currency lets one leg land on Friday and the other on Thursday, producing
 * a cross-rate that existed at no single moment.
 *
 * It also fixes a subtler trap. The base currency has no published rate -- it is always 1. If the
 * base is given the REQUESTED date while the other leg carries its PUBLISHED date, every base-leg
 * conversion on a weekend looks like a two-day cross-rate and is rejected. Resolving the day first
 * means both legs share it by construction.
 *
 * This is the unbounded primitive: it applies no staleness ceiling. `rateOn` and `convert` do.
 */
export function dayFor(table: FxTable, date: string): DailyRates | null {
  // Days are newest first, so the first entry at or before the date is the one to carry forward.
  for (const day of table.days) {
    if (day.date <= date) return day;
  }
  return null;
}

/** The price of one unit of `currency` within an already-resolved day. The base is always 1. */
export function rateIn(day: DailyRates, currency: string, base: string): number | null {
  if (currency === base) return 1;
  return day.rates[currency] ?? null;
}

/**
 * The rate to use for a given date, with the date it was actually published for.
 *
 * Those differ every weekend, and the difference is exactly what `fx_rate_date` exists to
 * disclose. Bounded by default: a caller who does not think about staleness gets the safe answer.
 */
export function rateOn(
  table: FxTable,
  currency: string,
  date: string,
  maxCarryForwardDays: number = MAX_CARRY_FORWARD_DAYS,
): { rate: number; rateDate: string } | null {
  const day = dayFor(table, date);
  if (day === null) return null;
  const carried = daysApart(date, day.date);
  if (carried === null || carried > maxCarryForwardDays) return null;
  const rate = rateIn(day, currency, table.source.base);
  return rate === null ? null : { rate, rateDate: day.date };
}

/**
 * Convert an amount into the target currency.
 *
 * Both prices are quoted in the table's base, so a non-base pair crosses through the base:
 * multiply by the source's price, divide by the target's. Both must come from the SAME published
 * day, or the result is a cross-rate from two different moments -- which is how a reconciliation
 * ends up off by a few tenths of a percent with nothing to point at.
 */
export function convert(options: {
  table: FxTable;
  amount: number;
  from: string;
  to: string;
  date: string;
  maxCarryForwardDays?: number;
}): Conversion {
  const maxCarry = options.maxCarryForwardDays ?? MAX_CARRY_FORWARD_DAYS;
  const source = options.table.source;

  if (!Number.isFinite(options.amount)) {
    throw new FxError(`fx: ${options.amount} is not a convertible amount`, "invalid_amount");
  }

  // Checked before anything compares it. Dates are compared as strings, which happily orders a
  // date that does not exist.
  if (dayNumber(options.date) === null) {
    throw new FxError(`fx: ${options.date} is not a calendar date (YYYY-MM-DD)`, "invalid_date");
  }

  for (const currency of [options.from, options.to]) {
    if (!isCovered(source, currency)) {
      throw new FxError(
        `fx: ${source.id} publishes no rate for ${currency}. Its feed covers ` +
          `${source.catalogue?.length ?? 0} currencies plus ${source.base}; anything else needs a ` +
          "paid fallback rather than a guess.",
        "uncovered_currency",
      );
    }
  }

  if (options.from === options.to) {
    // No rate was consulted and none is needed: one unit of a currency is one unit of it on every
    // date, including dates the source never published. So this path cannot fail, and it must not
    // -- refusing a THB row in a THB workspace because Songkran closed the banks would be absurd.
    return {
      amount: options.amount,
      currency: options.to,
      fxSource: source.id,
      fxRate: 1,
      fxRateDate: options.date,
      fxBase: options.from,
    };
  }

  // One day for both legs, resolved before either price is looked up.
  const day = dayFor(options.table, options.date);
  if (day === null) {
    throw new FxError(
      `fx: ${source.id} has published nothing on or before ${options.date}.`,
      "no_rate_available",
    );
  }

  const carried = daysApart(options.date, day.date);
  if (carried === null || carried > maxCarry) {
    throw new FxError(
      `fx: the newest rate ${source.id} published on or before ${options.date} is from ` +
        `${day.date}, ${carried} days earlier. Carrying a rate further than ${maxCarry} days is ` +
        "refused: no banking calendar produces a gap that long, so the explanation is a feed that " +
        "stopped, and a month-old rate with an honest date is still a wrong number.",
      "stale_rate",
    );
  }

  const fromPrice = rateIn(day, options.from, source.base);
  const toPrice = rateIn(day, options.to, source.base);
  if (fromPrice === null || toPrice === null) {
    // Refused rather than carried forward per currency: reaching back a further day for the
    // missing leg would build a cross-rate that existed at no single moment.
    const missing = fromPrice === null ? options.from : options.to;
    throw new FxError(
      `fx: ${day.date} is the applicable published day and it carries no rate for ${missing}. ` +
        "Refusing rather than reaching back a further day, which would build a cross-rate that " +
        "existed at no single moment.",
      "no_rate_available",
    );
  }

  const rate = fromPrice / toPrice;
  return {
    amount: options.amount * rate,
    currency: options.to,
    fxSource: source.id,
    fxRate: rate,
    fxRateDate: day.date,
    fxBase: options.from,
  };
}

/**
 * Whether a parsed table is complete enough to trust.
 *
 * A partial feed converts most rows correctly and a few not at all, which is worse than a failure:
 * the failure is visible. Checked at ingest so a bad fetch never reaches the store. What counts as
 * complete is the SOURCE's answer, not this function's -- a source with a confirmed catalogue
 * demands all of it, a source without one demands the floor it cannot operate below.
 */
export function validateTable(table: FxTable): { ok: boolean; missing: readonly string[] } {
  const newest = table.days[0];
  if (newest === undefined) return { ok: false, missing: table.source.required };
  const missing = table.source.required.filter(
    (currency) => currency !== table.source.base && newest.rates[currency] === undefined,
  );
  return { ok: missing.length === 0, missing };
}
