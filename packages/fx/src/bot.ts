/**
 * The Bank of Thailand as the FX source, and an explicit inventory of what is NOT verified here.
 *
 * WHY BOT. `HANDOVER.md` section 7 item 2: a Thailand-first product was pricing THB off a European
 * central bank. BOT is the rate a Thai auditor and the Revenue Department recognise, and because
 * `fx-on-row` puts the source ON THE ROW, the old value was not internal bookkeeping -- it was a
 * published claim, in the customer's own envelope, that their baht number came from Frankfurt.
 *
 * WHICH BOT SERIES, because BOT publishes more than one and "BOT" alone would be ambiguous.
 * `portal.api.bot.or.th` lists two exchange-rate products: "Weighted-average Interbank Exchange
 * Rate - THB / USD" (listen path `/Stat-ReferenceRate/v2`), which is USD only, and "Average
 * Exchange Rate - THB / Foreign Currency" (listen path `/Stat-ExchangeRate/v2`), which is the
 * multi-currency commercial-bank table. A product that has to price Shopee in SGD and Meta in USD
 * needs the multi-currency one, so this module reads that and `FX_SOURCE` names it exactly.
 *
 * `mid_rate` is the field used: the midpoint of the commercial-bank buying and selling rates, one
 * published number per currency per day. Reporting a P&L is not filing a return -- the Revenue
 * Department's own rules distinguish buying and selling rates by the direction of the transaction,
 * which is NOT verified here and is named in the design note as a question for whoever wires the
 * tax surface. It is also the reason the rate rides on the row rather than only the source: a
 * customer who must use a different leg can see exactly what we used and redo it.
 *
 * ============================ WHAT IS NOT VERIFIED, IN FULL ============================
 *
 * `portal.api.bot.or.th` requires registration and there is no API key in this repository, so NO
 * LIVE CALL WAS MADE and none of the following is confirmed:
 *
 *   1. THE REQUEST URL. The official portal page lists the listen paths above and states, in its
 *      own words, that "there are currently no API Products documentation available" publicly. The
 *      gateway host and the full path under the listen path are therefore unknown. Third-party
 *      clients show a v1 shape -- `https://iapi.bot.or.th/Stat/Stat-ExchangeRate/DAILY_AVG_EXG_RATE_V1/`
 *      with an `api-key` header -- but v1 is the service BOT scheduled for discontinuation on
 *      31 December 2025, and BOTH v1 HOSTS ARE GONE: `iapi.bot.or.th` and `apiportal.bot.or.th`
 *      both fail to resolve (NXDOMAIN), while `portal.api.bot.or.th` resolves. That is the one
 *      thing here that WAS verified, and it verifies a negative: the URL a reader would copy from
 *      any surviving example is dead.
 *      So THIS MODULE SHIPS NO DEFAULT ENDPOINT AND NO DEFAULT HEADER NAME. Both are required
 *      configuration. A guessed URL that 404s is a wasted afternoon; a guessed URL sitting in the
 *      tree looking confirmed is a lie the next reader inherits.
 *   2. THE RESPONSE SHAPE parsed below is the documented v1 shape, taken from third-party clients,
 *      not from BOT. v2 may differ.
 *   3. THE CURRENCY CATALOGUE. `BOT_SOURCE.catalogue` is null rather than a list, because a list
 *      typed from memory is a fabricated coverage guarantee.
 *   4. THE 31-DAY RANGE LIMIT. See BOT_MAX_RANGE_DAYS.
 *   5. WHAT A NON-BANKING DAY RETURNS -- an absent row, or a row with an empty rate string. The
 *      parser survives both; see the `Number("")` note in `readRate`.
 *
 * ONE LIVE CALL SETTLES ALL FIVE. See section 5 of `docs/marketplane/40-fx-bank-of-thailand.md`.
 * =======================================================================================
 */

import type { FxSourceDescriptor, FxTable } from "./fx.js";

/**
 * THE CONTRACT-VISIBLE IDENTIFIER, written verbatim to `envelope.fx_source`.
 *
 * It names the series, not just the institution, because BOT publishes an interbank reference rate
 * AND a commercial-bank average and they are different numbers. "bot" alone would leave a customer
 * unable to reproduce the conversion, which is the entire point of the field.
 *
 * Changing this value is a contract change. It is cheap exactly once -- right now, with zero rows
 * in the store carrying the old value -- and expensive forever after.
 */
export const FX_SOURCE = "bot_daily_avg_exchange_rate";

export const BOT_SOURCE: FxSourceDescriptor = {
  id: FX_SOURCE,
  /** BOT quotes everything in baht, which is also the reporting currency of the target market. */
  base: "THB",
  /** Not asserted. See item 3 of the header. */
  catalogue: null,
  /**
   * The floor, not the catalogue. USD is the one rate BOT's own flagship series exists for and the
   * one this product cannot operate without -- ad platforms bill in it and every marketplace
   * settlement that is not baht crosses through it. A table whose newest day lacks USD is a broken
   * fetch, and `validateTable` says so before it reaches the store.
   */
  required: ["USD"],
};

/**
 * Conservative read of an unverified limit. Third-party clients report "API must get data less
 * than 31 days per request"; whether that bound is inclusive is not stated, so 30 inclusive days
 * sits safely under either reading. Being wrong here costs one extra request per month.
 */
export const BOT_MAX_RANGE_DAYS = 30;

/**
 * Currencies suspected of being quoted in MULTIPLES rather than per unit.
 *
 * BOT's published table quotes yen per 100 yen. If the feed says "160" meaning 160 baht per 100
 * yen and this module reads it as 160 baht per yen, every JPY figure on every row is wrong by a
 * factor of 100 -- large, silent, and indistinguishable from a real number once stored.
 *
 * So a currency on this list is REFUSED unless the feed declares its unit explicitly (see
 * `quotedUnit`). The asymmetry is the point: being wrong about a member of this list costs
 * coverage of one currency, and being wrong in the other direction costs correctness of every row
 * carrying it. One live call removes the suspicion by showing what the unit actually is.
 */
export const BOT_UNIT_QUOTED: readonly string[] = ["JPY"];

/** Everything needed to address the BOT gateway. Nothing has a default; see item 1 of the header. */
export interface BotApiConfig {
  /** Full URL of the daily-average series endpoint, up to but not including the query string. */
  readonly endpoint: string;
  /** Header the gateway authenticates with. v1 used `api-key`; v2 is unconfirmed. */
  readonly apiKeyHeader: string;
  /** The registered key. Never logged, never defaulted, never committed. */
  readonly apiKey: string;
}

export interface BotRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDayNumber(date: string): number | null {
  if (!CALENDAR_DATE.test(date)) return null;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  if (new Date(parsed).toISOString().slice(0, 10) !== date) return null;
  return parsed / 86_400_000;
}

function fromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Split an inclusive date range into chunks the gateway will accept.
 *
 * Backfill asks for months at a time and the API caps a request at a month, so the split has to
 * exist somewhere. It lives here, pure and testable, rather than inside a fetch loop where it can
 * only be verified against a key nobody has.
 */
export function botDateRanges(
  start: string,
  end: string,
  maxSpanDays: number = BOT_MAX_RANGE_DAYS,
): readonly { start: string; end: string }[] {
  const first = toDayNumber(start);
  const last = toDayNumber(end);
  if (first === null || last === null || last < first || maxSpanDays < 1) return [];

  const ranges: { start: string; end: string }[] = [];
  for (let cursor = first; cursor <= last; cursor += maxSpanDays) {
    ranges.push({
      start: fromDayNumber(cursor),
      end: fromDayNumber(Math.min(cursor + maxSpanDays - 1, last)),
    });
  }
  return ranges;
}

/**
 * The requests that cover a date range, one per accepted chunk.
 *
 * The query string is assembled by hand rather than with `URL`: this package declares no DOM and
 * no Workers types (see the comment in `tsconfig.base.json`), so it must reference neither
 * runtime's globals.
 */
export function botRateRequests(
  config: BotApiConfig,
  range: { start: string; end: string },
): readonly BotRequest[] {
  return botDateRanges(range.start, range.end).map((chunk) => ({
    url:
      `${config.endpoint}?start_period=${encodeURIComponent(chunk.start)}` +
      `&end_period=${encodeURIComponent(chunk.end)}`,
    headers: { [config.apiKeyHeader]: config.apiKey },
  }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The unit a quote is expressed in, read from the currency's own name -- "JAPAN : YEN (100)" is
 * 100 yen, "USA : DOLLAR" is one dollar.
 *
 * Derived from the payload rather than from a table of assumptions, so a currency BOT starts or
 * stops quoting in multiples is handled by the feed rather than by a release. `null` means the
 * feed did not say, which is a different answer from 1 and is treated as such for the currencies
 * in `BOT_UNIT_QUOTED`.
 */
export function quotedUnit(name: unknown): number | null {
  if (typeof name !== "string") return null;
  const match = /\((\d+)\)\s*$/.exec(name);
  const digits = match?.[1];
  if (digits === undefined) return null;
  const unit = Number(digits);
  return Number.isFinite(unit) && unit > 0 ? unit : null;
}

/**
 * A rate as a positive finite number, or null.
 *
 * BOT returns rates as STRINGS, and `Number("")` is 0, not NaN. A non-banking day that comes back
 * as a row with an empty rate would therefore pass a `Number.isFinite` check and store a rate of
 * zero -- which converts every amount to nothing, or divides by zero on the other leg. The `> 0`
 * test is what catches it, and it is the reason this function exists instead of an inline Number().
 */
function readRate(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Parse BOT's daily average exchange rate response into the internal table.
 *
 * Hand-rolled guards rather than a schema library: this package has no dependencies and may not
 * gain one. The posture matches `parseEcbXml` -- anything that is not the documented shape yields
 * an EMPTY table rather than a partial one, and `validateTable` turns that into a loud failure at
 * ingest. A parser that silently recovers half a feed is how a source change becomes a slow leak
 * of wrong numbers instead of a red build.
 */
export function parseBotDailyAvgExchangeRate(payload: unknown): FxTable {
  const detail = asRecord(asRecord(asRecord(payload)?.result)?.data)?.data_detail;
  if (!Array.isArray(detail)) return { source: BOT_SOURCE, days: [] };

  const byDate = new Map<string, Map<string, number>>();
  // Two quotes for one currency on one day contradict each other, and picking one by arrival order
  // is not resolving it. Both are dropped and the day survives without that currency, which
  // `validateTable` catches if it was one we require.
  const contradicted = new Set<string>();

  for (const row of detail) {
    const entry = asRecord(row);
    if (entry === null) continue;

    const period = typeof entry.period === "string" ? entry.period : "";
    if (toDayNumber(period) === null) continue;

    const currency = typeof entry.currency_id === "string" ? entry.currency_id.trim() : "";
    if (!/^[A-Z]{3}$/.test(currency)) continue;

    const unit = quotedUnit(entry.currency_name_eng);
    // A currency BOT may quote per 100 arriving without its unit is refused rather than guessed.
    if (unit === null && BOT_UNIT_QUOTED.includes(currency)) continue;

    const quote = readRate(entry.mid_rate);
    if (quote === null) continue;

    // BOT quotes baht per unit of foreign currency, which is already the internal convention:
    // the price of one unit of the currency, in the table's base. Only the multiple is divided out.
    // No second positivity check follows: `readRate` already refused anything that is not above
    // zero and `quotedUnit` refuses any unit that is not, so a positive rate stays positive. A
    // redundant guard here would be dead code that a mutation test cannot reach, which makes the
    // suite look stronger than it is.
    const price = quote / (unit ?? 1);

    const key = `${period}|${currency}`;
    const day = byDate.get(period) ?? new Map<string, number>();
    byDate.set(period, day);

    const seen = day.get(currency);
    if (seen !== undefined && seen !== price) {
      contradicted.add(key);
      day.delete(currency);
      continue;
    }
    if (!contradicted.has(key)) day.set(currency, price);
  }

  const days = [...byDate]
    .filter(([, rates]) => rates.size > 0)
    .map(([date, rates]) => ({ date, rates: Object.fromEntries(rates) }))
    // Newest first, which is what the carry-forward walk expects.
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return { source: BOT_SOURCE, days };
}
