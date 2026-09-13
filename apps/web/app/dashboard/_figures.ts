import { brand } from "@repo/brand";
import { METRICS, type MetricName } from "@repo/contract";

/**
 * HOW A STORED METRIC BECOMES A STRING ON THE PAGE, and the three answers that are not "a number".
 *
 * This module exists because the dangerous step in a dashboard is not the query, it is the
 * rendering. `{row.revenue ?? 0}` compiles, reads well, passes review, and prints a confident
 * "0" for a day nobody measured. So the decision is made once, here, with a return type that has
 * no number in two of its three branches and therefore cannot be collapsed by a `??`.
 *
 *   absent      the platform reported nothing for this metric on this row. NOT ZERO. Zero is a
 *               measurement -- "spend was nothing" -- and a null has measured nothing at all.
 *               `combineMetric` in @repo/contract draws the same line one layer up, and it is the
 *               difference between an outage and a flat line on a chart.
 *   unreadable  a value arrived that this code cannot turn into a number it trusts. Rendering it
 *               as absent would hide a real defect behind an honest-looking dash; rendering it as
 *               a number would invent one. It gets its own mark.
 *   value       a number, formatted in its own unit.
 *
 * THE CURRENCY IS THE ROW'S, NEVER A DEFAULT. `envelope_rows.currency` is `not null` and
 * ISO-4217-shaped by check constraint, and every currency metric on the row is an amount in it.
 * The code is printed rather than a symbol -- `currencyDisplay: "code"` -- because "$" is the
 * currency of at least four countries and a reader who sees it supplies the wrong one for free.
 */

/**
 * `numeric(20, 6)`: the scale of every metric column in `envelope_rows`. Formatting to fewer
 * digits than the column stores would round a figure the customer can audit against the platform.
 *
 * The 14 integer digits the column allows sit inside `Number.MAX_SAFE_INTEGER`, so a round trip
 * through a JS number cannot lose an integer part here.
 */
const METRIC_SCALE = 6;

/** The shape `envelope_rows_currency_check` enforces. Intl needs a well-formed code. */
const ISO_4217 = /^[A-Z]{3}$/;

/**
 * The document's locale -- the same value `<html lang>` carries -- so grouping and decimal marks
 * match the language the page is written in rather than whichever locale the server happens to run
 * under. A server default would make the same row render differently on two machines.
 */
const LOCALE = brand.defaultLocale;

export type FigureValue =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" };

export type Figure =
  | { readonly kind: "value"; readonly text: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" };

const ABSENT = { kind: "absent" } as const;
const UNREADABLE = { kind: "unreadable" } as const;

/**
 * What a stored metric actually is.
 *
 * Strings are accepted because `numeric` is the one PostgreSQL type whose JSON serialisation is a
 * matter of policy rather than of the type: PostgREST emits it as a JSON number today, and a
 * quoted decimal is the shape any client that wants to preserve precision would send instead.
 * Parsing both costs four lines; the alternative is a page that renders every figure as unreadable
 * the day that policy changes.
 *
 * `0` is a number. `""`, `" "`, `NaN`, `Infinity`, booleans and objects are not, and none of them
 * is absent either -- something was stored and this code cannot read it.
 */
export function readFigure(raw: unknown): FigureValue {
  if (raw === null || raw === undefined) return ABSENT;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { kind: "number", value: raw } : UNREADABLE;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return UNREADABLE;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? { kind: "number", value: parsed } : UNREADABLE;
  }
  return UNREADABLE;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(code: string): Intl.NumberFormat | null {
  const cached = currencyFormatters.get(code);
  if (cached !== undefined) return cached;
  try {
    const formatter = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: code,
      // The code, not the symbol. See the module comment.
      currencyDisplay: "code",
      // Intl's default is the currency's minor units -- 2 for most, 0 for JPY -- which would round
      // a stored six-decimal amount. The minimum stays at the currency's own default, so an
      // ordinary amount still reads as money rather than as a bare decimal.
      maximumFractionDigits: METRIC_SCALE,
    });
    currencyFormatters.set(code, formatter);
    return formatter;
  } catch {
    // A well-formed code Intl refuses is not something to print a number beside. Falling through
    // to a plain decimal would produce an amount with no unit, which is the failure this whole
    // module is about.
    return null;
  }
}

const plainFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: METRIC_SCALE });

/**
 * One metric of one row, ready to render.
 *
 * The unit comes from the dictionary, so a metric added to `METRICS` is formatted correctly here
 * without this file being touched -- and a metric whose unit is neither currency, count nor rank
 * would fail to compile rather than render as a bare number.
 */
export function formatFigure(metric: MetricName, raw: unknown, currency: string): Figure {
  const read = readFigure(raw);
  if (read.kind === "absent") return ABSENT;
  if (read.kind === "unreadable") return UNREADABLE;

  if (METRICS[metric].unit !== "currency") {
    // A count and a rank are both plain numbers with no unit to print: a rank is a 1-based
    // ordinal and a count counts itself. Neither may borrow the row's currency.
    return { kind: "value", text: plainFormatter.format(read.value) };
  }

  if (!ISO_4217.test(currency)) return UNREADABLE;
  const formatter = currencyFormatter(currency);
  if (formatter === null) return UNREADABLE;
  return { kind: "value", text: formatter.format(read.value) };
}

/**
 * The metrics worth giving a column to, in dictionary order.
 *
 * A source reports a handful of the twelve and nothing at all for the rest, so a table with a
 * column per dictionary entry would be mostly dashes and would push the figures off the screen.
 * "Present" means SOMETHING WAS STORED, not "was readable" -- an all-unreadable column keeps its
 * place so the defect is on the page rather than hidden by the filter that tidied it away.
 */
export function presentMetrics(
  rows: readonly Partial<Record<MetricName, unknown>>[],
): readonly MetricName[] {
  return (Object.keys(METRICS) as MetricName[]).filter((name) =>
    rows.some((row) => readFigure(row[name]).kind !== "absent"),
  );
}
