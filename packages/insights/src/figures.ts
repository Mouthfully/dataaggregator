/**
 * THE CLOSED INPUT SET. Every number that will ever reach a customer is computed here, in
 * TypeScript, and handed to the model as a given fact.
 *
 * THE ONE RULE THIS PACKAGE HANGS ON: the model writes language, it never does arithmetic. A
 * language model asked to comment on business figures will produce figures, and one it invented
 * that looks plausible is the exact failure this product is sold against -- the same class of
 * mistake as `{row.revenue ?? 0}` printing a confident zero for a day nobody measured. So the
 * deltas, shares, rankings and impact estimates are all computed in this module, printed into the
 * prompt by `brief.ts`, and checked back out of the model's answer by `verify.ts`. A number that
 * is not in the set this module returns cannot survive the gate.
 *
 * THE THREE-BRANCH READING IS INHERITED, NOT REINVENTED. `apps/web/app/dashboard/_figures.ts`
 * already draws the value / absent / unreadable distinction for the dashboard, with a return type
 * that has no number in two of its three branches and therefore cannot be collapsed by a `??`.
 * `readMetric` below is the same decision for the same reason. It is a second copy rather than an
 * import because a package may not import an app; when the two are consolidated, that module is
 * the other half.
 *
 *   value       a number, in the row's own currency where the metric is money.
 *   absent      the platform reported nothing. NOT ZERO. Zero is a measurement.
 *   unreadable  something was stored that this code cannot read as a number. It gets its own
 *               branch because rendering it as absent hides a real defect behind an honest mark.
 *
 * AND AN ABSENT METRIC IS NAMED IN THE PROMPT RATHER THAN OMITTED FROM IT. This is the least
 * obvious decision in the file and the one most worth keeping. A metric left out of the prompt is
 * one the model infers a value for -- most often zero, stated with the same confidence as a
 * measured figure. Saying "orders: not reported for this period" costs one line and removes the
 * inference.
 *
 * UNCERTAINTY IS COMPUTED, NEVER DECORATED. The artboard promises "impact is an estimate from your
 * own numbers, shown as a range where it is uncertain", and a range is only honest if its ends are
 * arithmetic. There is no error bar, no confidence constant and no fudge factor anywhere in this
 * file. The width of a range comes from one place and one place only: the envelope's own
 * `is_provisional` flag, splitting the contributing rows into those the platform has settled and
 * those it may still restate.
 *
 *   no provisional rows       a point, from every row.
 *   some provisional rows     a RANGE, from the settled rows at one end and every row at the other.
 *                             That is the amount the platform can still move, measured rather than
 *                             assumed.
 *   all provisional rows      a point, MARKED provisional in words. There is no settled subset to
 *                             bound it with, and inventing a band around it would be the decoration
 *                             this rule exists to forbid. For a POS whose rows are provisional
 *                             forever -- `restatement.ts` already treats a merchant's own database
 *                             that way -- this is the permanent case, and the brief says so.
 */

import {
  COMMERCE_METRICS,
  METRICS,
  type MetricName,
  type Source,
  combineMetric,
} from "@repo/contract";

/* ==============================================================================================
 * THE ROW
 * ============================================================================================== */

/**
 * One stored row, as this package needs it.
 *
 * A narrowing of `EnvelopeRow` rather than the type itself, and the narrowing is the point:
 * `metrics` here holds `unknown`, not `number`. `envelopeRowSchema` validates what a connector
 * EMITS; this module reads what the store RETURNS, and `numeric(20, 6)` crosses that boundary as a
 * JSON number today and could arrive as a quoted decimal tomorrow without a single type changing.
 * Accepting `unknown` is what makes `readMetric` a real decision instead of a formality.
 */
export interface InsightRow {
  readonly source: Source;
  readonly entity: {
    readonly type: string;
    readonly id: string;
    readonly account_id: string;
  };
  readonly dimensions: {
    /** Calendar date, YYYY-MM-DD. */
    readonly date: string;
    /** ISO 4217, uppercase. Every row in one figure set must agree; see `mixed_currency`. */
    readonly currency: string;
    readonly timezone: string;
  };
  readonly metrics: Partial<Record<MetricName, unknown>>;
  readonly fetched_at: string;
  readonly is_provisional: boolean;
}

/** An inclusive span of calendar dates. */
export interface Period {
  readonly from: string;
  readonly to: string;
}

export type Reading =
  | { readonly kind: "value"; readonly value: number }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" };

const ABSENT = { kind: "absent" } as const;
const UNREADABLE = { kind: "unreadable" } as const;

/**
 * What a stored metric actually is. Mirrors `readFigure` in the dashboard module named above.
 *
 * `0` is a number. `""`, `" "`, `NaN`, `Infinity`, booleans and objects are not, and none of them
 * is absent either -- something was stored and this code cannot read it.
 */
export function readMetric(raw: unknown): Reading {
  if (raw === null || raw === undefined) return ABSENT;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { kind: "value", value: raw } : UNREADABLE;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return UNREADABLE;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? { kind: "value", value: parsed } : UNREADABLE;
  }
  return UNREADABLE;
}

/* ==============================================================================================
 * NUMBERS: ONE CANONICAL FORM, SHARED WITH THE VERIFIER
 * ============================================================================================== */

/**
 * The canonical form of a numeric token, and the single most load-bearing function in the package.
 *
 * `figures.ts` licenses numbers in this form and `verify.ts` extracts them in this form, so the two
 * cannot disagree about whether "16,940.00", "THB 16940" and "16940" are the same number. If they
 * could disagree, the gate would either refuse true insights or pass invented ones, and both
 * failures look like a working product from the outside.
 *
 * MAGNITUDE ONLY. The sign is dropped, because the model is asked to express direction in words
 * against a direction the prompt states ("down 9%", never "-9%"), and a verifier that demanded the
 * minus sign would refuse the phrasing the product actually wants. What this gate checks is that
 * every QUANTITY came from the data; that the sentence points the right way is what the schema and
 * the stated direction in the prompt are for. The limit is deliberate and is written down in the
 * design note rather than left for someone to discover.
 */
export function canonicalNumber(text: string): string | null {
  const stripped = text.replace(/[\s,_]/g, "");
  const match = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.exec(stripped);
  if (match === null) return null;
  const value = Math.abs(Number(stripped));
  if (!Number.isFinite(value)) return null;
  return canonicalFromNumber(value);
}

/** The same canonical form, from a number this code computed rather than from text it read. */
function canonicalFromNumber(value: number): string {
  const magnitude = Math.abs(value);
  // `toFixed` rather than `String`: 1e21 and above stringify in exponential notation, which is a
  // second lexical form for one number and would break the set membership this is built for.
  const fixed = magnitude.toFixed(DECIMALS);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
}

/**
 * `numeric(20, 6)`: the scale of every metric column in `envelope_rows`. Canonicalising to fewer
 * digits than the column stores would make two genuinely different figures compare equal, which is
 * the one way this function can pass a number the data does not contain.
 */
const DECIMALS = 6;

/* ==============================================================================================
 * THE FIGURE
 * ============================================================================================== */

export type FigureKind =
  | "total"
  | "delta"
  | "share"
  | "rank"
  | "ratio"
  | "count"
  | "date"
  | "impact"
  | "absent"
  | "unreadable";

/**
 * One fact, ready to be printed into a prompt and checked back out of an answer.
 *
 * `text` is what the prompt prints. `allows` is every numeric token the model may therefore write,
 * ALREADY CANONICALISED -- and it is derived from `text` rather than from the underlying float, so
 * the printed figure and the licensed figure cannot drift apart by a rounding step.
 *
 * NOTHING IS ROUNDED INTO `allows` THAT IS NOT ALSO ROUNDED INTO `text`. A figure set that
 * licensed "17,000" for a true 16,940 would be the repair-rather-than-refuse failure moved one
 * module earlier: the model would print a number nobody measured and the gate would wave it
 * through. Money is printed at the column's own scale so no rounding happens at all; a percentage
 * is printed to one decimal place and licensed at one decimal place, which is a stated precision
 * rather than a different number.
 */
export interface Figure {
  readonly id: string;
  readonly kind: FigureKind;
  /** Human words, carrying no digits of its own. */
  readonly label: string;
  /** The rendering the prompt prints. */
  readonly text: string;
  /** Every numeric token this figure licenses, canonical. Empty for absent and unreadable. */
  readonly allows: readonly string[];
  /** Source ids that contributed, sorted. */
  readonly sources: readonly Source[];
  /** The newest `fetched_at` among the contributing rows, or null when nothing contributed. */
  readonly fetchedAt: string | null;
  /** True when any contributing row may still be restated by the platform. */
  readonly provisional: boolean;
}

/**
 * An amount this code estimated, with its uncertainty expressed as arithmetic or not at all.
 * See the module header for the three cases and why there is no fourth.
 */
export type Estimate =
  | { readonly kind: "point"; readonly value: number; readonly allProvisional: boolean }
  | { readonly kind: "range"; readonly low: number; readonly high: number };

export const ACTION_KINDS = [
  "channel_decline",
  "commission_load",
  "spend_without_return",
  "weekday_gap",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/**
 * A candidate the model will be asked to phrase, never to find.
 *
 * Ordering is arithmetic and so is the impact. The model receives these already ranked and is told
 * it may not reorder them, because "ordered by value, biggest first" is a promise about the data
 * and not about the writing.
 */
export interface RankedAction {
  readonly id: string;
  readonly kind: ActionKind;
  /** 1-based. Biggest first. */
  readonly rank: number;
  /** The source the action is about, when it is about one. */
  readonly source: Source | null;
  readonly impact: Estimate;
  /** The figure printed for this action's impact. */
  readonly impactFigure: Figure;
  /** Figure ids that justify it, so a reader can follow the arithmetic. */
  readonly evidence: readonly string[];
}

export const BUSINESS_TYPES = [
  "cafe",
  "restaurant",
  "bar",
  "hotel",
  "guesthouse",
  "online_seller",
  "clinic",
  "salon",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface FigureSet {
  readonly business: BusinessType;
  readonly currency: string;
  readonly timezone: string;
  readonly period: Period;
  readonly comparison: Period;
  readonly figures: readonly Figure[];
  readonly actions: readonly RankedAction[];
  /** True when EVERY contributing row is provisional -- the permanent case for a POS. */
  readonly allProvisional: boolean;
}

export type FigureRefusalCode =
  | "no_rows"
  | "mixed_currency"
  | "invalid_period"
  | "no_readable_metric";

export type FigureSetResult =
  | { readonly ok: true; readonly set: FigureSet }
  | { readonly ok: false; readonly code: FigureRefusalCode; readonly detail: string };

export interface FigureInput {
  readonly business: BusinessType;
  readonly period: Period;
  readonly comparison: Period;
  /** Rows covering BOTH periods. Rows outside them are ignored rather than refused. */
  readonly rows: readonly InsightRow[];
}

/* ==============================================================================================
 * WHICH METRICS LEAD, PER BUSINESS TYPE
 * ============================================================================================== */

/**
 * The order metrics are printed in, per business type.
 *
 * The artboard puts it as "a cafe gets hourly revenue and delivery share; a guesthouse gets
 * occupancy and commission cost", and this is that idea reduced to the only thing that can be
 * honest today: WHICH METRICS LEAD, drawn entirely from the dictionary in
 * `packages/contract/src/metrics.ts`.
 *
 * TWO THINGS THE ARTBOARD ASKS FOR ARE NOT HERE, and their absence is deliberate. There is no
 * occupancy metric and no hourly grain -- `date` is a calendar day and the upsert key has no time
 * component -- so a guesthouse leads with the money metrics it does have. Adding `occupancy` to
 * this list to match the drawing would fail `scripts/check-dictionary.mjs`, which is the guard
 * working: a metric name must exist in the dictionary before anything references it.
 */
const LEADING: Readonly<Record<BusinessType, readonly MetricName[]>> = {
  cafe: ["revenue", "orders", "net_revenue", "commission", "fees"],
  restaurant: ["revenue", "orders", "net_revenue", "commission", "fees"],
  bar: ["revenue", "orders", "net_revenue", "commission", "fees"],
  hotel: ["revenue", "net_revenue", "commission", "orders", "fees"],
  guesthouse: ["revenue", "net_revenue", "commission", "orders", "fees"],
  online_seller: ["revenue", "orders", "spend", "conversions_value", "conversions"],
  clinic: ["revenue", "orders", "net_revenue", "spend", "sessions"],
  salon: ["revenue", "orders", "net_revenue", "spend", "sessions"],
};

/** The metrics this business type leads with, then every other dictionary metric, in order. */
export function leadingMetrics(business: BusinessType): readonly MetricName[] {
  const lead = LEADING[business];
  const rest = (Object.keys(METRICS) as MetricName[]).filter((name) => !lead.includes(name));
  return [...lead, ...rest];
}

/* ==============================================================================================
 * READING ROWS
 * ============================================================================================== */

/** A row with its metrics already read, so the three-branch decision is made exactly once. */
interface ReadRow {
  readonly row: InsightRow;
  readonly values: Partial<Record<MetricName, number>>;
  readonly unreadable: readonly MetricName[];
}

function readRow(row: InsightRow): ReadRow {
  const values: Partial<Record<MetricName, number>> = {};
  const unreadable: MetricName[] = [];
  for (const name of Object.keys(METRICS) as MetricName[]) {
    if (!(name in row.metrics)) continue;
    const read = readMetric(row.metrics[name]);
    if (read.kind === "value") values[name] = read.value;
    else if (read.kind === "unreadable") unreadable.push(name);
  }
  return { row, values, unreadable };
}

function withinPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ==============================================================================================
 * RENDERING
 * ============================================================================================== */

/**
 * Money, at the column's own scale.
 *
 * The CODE, never a symbol -- `currencyDisplay: "code"` -- because "$" is the currency of at least
 * four countries and a reader who sees it supplies the wrong one for free. The same reasoning, and
 * the same setting, as the dashboard module.
 *
 * The locale is fixed rather than the brand default, because this string goes into a PROMPT and a
 * prompt that renders differently on two machines breaks the byte-for-byte reproducibility
 * `brief.ts` is built on. A figure a customer reads is formatted at the surface, from this number.
 */
const PROMPT_LOCALE = "en-US";

function moneyFormatter(currency: string): Intl.NumberFormat | null {
  try {
    return new Intl.NumberFormat(PROMPT_LOCALE, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: DECIMALS,
    });
  } catch {
    return null;
  }
}

/** What a figure prints and what it therefore licenses. Derived from one string, never two. */
interface Rendered {
  readonly text: string;
  readonly allows: readonly string[];
}

/**
 * Intl separates a currency code from its amount with U+00A0, and some locales use U+202F inside
 * the number. Both are normalised to a plain space before the string goes anywhere.
 *
 * NOT COSMETIC. `brief.ts` promises the same input renders to the same bytes, and which invisible
 * space ICU picks is a property of the ICU build rather than of this code -- so a Node upgrade
 * would silently change every prompt and every stored brief would stop matching the one that could
 * be regenerated from its figures. Pinning the separator here costs one replace and removes a
 * reproducibility bug nobody would ever find by reading the output.
 */
function plainSpaces(text: string): string {
  return text.replace(/[  ]/g, " ");
}

function renderMoney(value: number, currency: string): Rendered | null {
  const formatter = moneyFormatter(currency);
  if (formatter === null) return null;
  const text = plainSpaces(formatter.format(value));
  const canonical = canonicalOf(text);
  if (canonical === null) return null;
  return { text, allows: [canonical] };
}

/**
 * The canonical number inside a rendered string.
 *
 * Reads the digits back out of what will actually be printed, so `text` and `allows` are two views
 * of one string rather than two computations that have to be kept in step.
 */
function canonicalOf(text: string): string | null {
  const digits = text.replace(/[^\d.,\-+]/g, "");
  return canonicalNumber(digits);
}

const countFormatter = new Intl.NumberFormat(PROMPT_LOCALE, { maximumFractionDigits: DECIMALS });

function renderCount(value: number): Rendered {
  const text = plainSpaces(countFormatter.format(value));
  const canonical = canonicalOf(text);
  // A finite number always canonicalises; the fallback exists so this returns a total function
  // rather than a nullable one at every call site.
  return { text, allows: canonical === null ? [] : [canonical] };
}

/** One decimal place, stated as such. See the note on rounding on `Figure`. */
const PERCENT_DECIMALS = 1;

function renderPercent(value: number): Rendered {
  const text = plainSpaces(`${value.toFixed(PERCENT_DECIMALS)}%`);
  const canonical = canonicalOf(text);
  return { text, allows: canonical === null ? [] : [canonical] };
}

function renderRatio(value: number): Rendered {
  const text = value.toFixed(2);
  const canonical = canonicalOf(text);
  return { text, allows: canonical === null ? [] : [canonical] };
}

/* ==============================================================================================
 * PROVENANCE
 * ============================================================================================== */

function provenanceOf(rows: readonly ReadRow[]): {
  sources: readonly Source[];
  fetchedAt: string | null;
  provisional: boolean;
} {
  const sources = [...new Set(rows.map((r) => r.row.source))].sort();
  let fetchedAt: string | null = null;
  let provisional = false;
  for (const { row } of rows) {
    if (fetchedAt === null || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
    if (row.is_provisional) provisional = true;
  }
  return { sources, fetchedAt, provisional };
}

function absentFigure(id: string, label: string, rows: readonly ReadRow[]): Figure {
  const { sources, fetchedAt, provisional } = provenanceOf(rows);
  return {
    id,
    kind: "absent",
    label,
    text: NOT_REPORTED,
    allows: [],
    sources,
    fetchedAt,
    provisional,
  };
}

function unreadableFigure(id: string, label: string, rows: readonly ReadRow[]): Figure {
  const { sources, fetchedAt, provisional } = provenanceOf(rows);
  return {
    id,
    kind: "unreadable",
    label,
    text: NOT_READABLE,
    allows: [],
    sources,
    fetchedAt,
    provisional,
  };
}

/**
 * The two sentences that stand in for a number, and they are not interchangeable.
 *
 * "not reported" is the platform having said nothing. "could not be read" is this system having
 * stored something it cannot parse -- a defect, shown rather than swallowed. Collapsing the second
 * into the first would hide a bug behind an honest-looking phrase, which is the same trade the
 * dashboard's third mark refuses to make.
 */
const NOT_REPORTED = "not reported for this period";
const NOT_READABLE = "stored but could not be read as a number";

/* ==============================================================================================
 * ESTIMATES
 * ============================================================================================== */

/**
 * An estimate and its uncertainty, from the rows themselves.
 *
 * `all` is the figure over every contributing row; `settled` is the same figure over only the rows
 * the platform is no longer going to restate. The gap between them is the amount that can still
 * move, measured rather than assumed. See the module header for why the all-provisional case is a
 * marked point and not a manufactured band.
 */
function estimateFrom(
  all: number | null,
  settled: number | null,
  anyProvisional: boolean,
): Estimate | null {
  if (all === null) return null;
  if (!anyProvisional) return { kind: "point", value: all, allProvisional: false };
  if (settled === null) return { kind: "point", value: all, allProvisional: true };
  if (settled === all) return { kind: "point", value: all, allProvisional: false };
  return { kind: "range", low: Math.min(settled, all), high: Math.max(settled, all) };
}

/** The number an estimate is ranked on: conservative, so a wide range never outranks a sure thing. */
export function estimateFloor(estimate: Estimate): number {
  return estimate.kind === "point" ? estimate.value : estimate.low;
}

function estimateCeiling(estimate: Estimate): number {
  return estimate.kind === "point" ? estimate.value : estimate.high;
}

function renderEstimate(
  id: string,
  label: string,
  estimate: Estimate,
  currency: string,
  rows: readonly ReadRow[],
): Figure | null {
  const { sources, fetchedAt, provisional } = provenanceOf(rows);
  if (estimate.kind === "point") {
    const rendered = renderMoney(estimate.value, currency);
    if (rendered === null) return null;
    return {
      id,
      kind: "impact",
      label,
      text: rendered.text,
      allows: rendered.allows,
      sources,
      fetchedAt,
      provisional,
    };
  }
  const low = renderMoney(estimate.low, currency);
  const high = renderMoney(estimate.high, currency);
  if (low === null || high === null) return null;
  return {
    id,
    kind: "impact",
    label,
    text: `${low.text} to ${high.text}`,
    allows: [...low.allows, ...high.allows],
    sources,
    fetchedAt,
    provisional,
  };
}

/* ==============================================================================================
 * BUILDING THE SET
 * ============================================================================================== */

/**
 * THE TAKINGS METRIC, and why it is chosen rather than fixed.
 *
 * `net_revenue` is what the owner keeps and is the number the whole product is about; `revenue` is
 * what the platform reported before it took its cut. Where only gross exists -- which is every
 * source that cannot report a commission, and the reconciliation doc records that GrabFood and
 * foodpanda are both in that class -- the brief says "takings" and means gross, rather than quietly
 * presenting a gross number under a net label.
 *
 * NET LEADS ONLY WHEN IT COVERS EVERY ROW GROSS COVERS, and that condition was added because the
 * real connector broke the naive rule. `normalizeWooOrders` emits `net_revenue` only on orders
 * where a payment fee was knowable -- a Stripe order writes `_stripe_fee`, an Omise order writes
 * nothing -- so a day of three orders can carry gross on all three and net on one. Summing that net
 * gives the takings of the ONE order whose fee happened to be readable, and printing it as the
 * day's takings beside a gross figure three times larger invites exactly one inference: that the
 * platform kept the difference. It did not. That is a wrong number that looks right, arrived at
 * without a single arithmetic error.
 *
 * So partial coverage falls back to gross, and `coverageNote` below says what was missing.
 */
function takingsMetric(rows: readonly ReadRow[]): MetricName | null {
  const net = rows.filter((r) => r.values.net_revenue !== undefined).length;
  const gross = rows.filter((r) => r.values.revenue !== undefined).length;
  if (net > 0 && net >= gross) return "net_revenue";
  if (gross > 0) return "revenue";
  if (net > 0) return "net_revenue";
  return null;
}

/**
 * "reported on 1 of 3 rows from this source", or null when every row reported it.
 *
 * THE DENOMINATOR IS ROWS FROM THE CONTRIBUTING SOURCES, not every row in the period, and the
 * difference is the whole usefulness of the note. `spend` appears on ad rows and never on commerce
 * rows; against a whole-period denominator it would always read "2 of 8" and mean nothing, and a
 * caveat that fires on every figure is one a reader stops seeing. Against its own source's rows it
 * reads "2 of 2" and stays silent -- so when it does speak, something really is missing.
 */
function coverageNote(
  contributing: readonly ReadRow[],
  all: readonly ReadRow[],
): { text: string; allows: readonly string[] } | null {
  const sources = new Set(contributing.map((r) => r.row.source));
  const denominator = all.filter((r) => sources.has(r.row.source)).length;
  if (denominator === 0 || contributing.length >= denominator) return null;
  const have = renderCount(contributing.length);
  const total = renderCount(denominator);
  return {
    text: ` (reported on ${have.text} of ${total.text} rows from this source)`,
    allows: [...have.allows, ...total.allows],
  };
}

export function buildFigureSet(input: FigureInput): FigureSetResult {
  const { business, period, comparison } = input;

  for (const p of [period, comparison]) {
    if (!ISO_DATE.test(p.from) || !ISO_DATE.test(p.to) || p.from > p.to) {
      return {
        ok: false,
        code: "invalid_period",
        detail: `a period must be two calendar dates with from <= to, got ${p.from}..${p.to}`,
      };
    }
  }

  const inScope = input.rows.filter(
    (row) =>
      withinPeriod(row.dimensions.date, period) || withinPeriod(row.dimensions.date, comparison),
  );
  if (inScope.length === 0) {
    return { ok: false, code: "no_rows", detail: "no stored row falls in either period" };
  }

  // REFUSING RATHER THAN CONVERTING. Every currency metric on a row is an amount in that row's own
  // currency; adding two currencies produces a number with no unit, which is precisely the figure
  // this package exists to never print. The envelope carries `fx_rate` for the conversion, and
  // converting here would be this module inventing an exchange rate it was not given.
  const currencies = [...new Set(inScope.map((row) => row.dimensions.currency))].sort();
  const currency = currencies[0];
  if (currency === undefined || currencies.length > 1) {
    return {
      ok: false,
      code: "mixed_currency",
      detail: `rows span ${currencies.length} currencies (${currencies.join(", ")}); a total across them has no unit`,
    };
  }

  const timezones = [...new Set(inScope.map((row) => row.dimensions.timezone))].sort();
  const timezone = timezones[0] ?? "UTC";

  const read = inScope.map(readRow);
  const current = read.filter((r) => withinPeriod(r.row.dimensions.date, period));
  const previous = read.filter((r) => withinPeriod(r.row.dimensions.date, comparison));

  const figures: Figure[] = [];

  // The period boundaries are figures too. A date in the answer is a number in the answer, and one
  // the model did not get from here is one it made up.
  figures.push(dateFigure("period.from", "period start", period.from, current));
  figures.push(dateFigure("period.to", "period end", period.to, current));
  figures.push(dateFigure("comparison.from", "comparison start", comparison.from, previous));
  figures.push(dateFigure("comparison.to", "comparison end", comparison.to, previous));
  figures.push({
    ...countFigure("period.days", "days in the period", dayCount(period), current),
  });

  const order = leadingMetrics(business);
  let readable = 0;

  for (const name of order) {
    const built = metricFigures(name, current, previous, currency);
    figures.push(...built.figures);
    if (built.readable) readable += 1;
  }

  if (readable === 0) {
    return {
      ok: false,
      code: "no_readable_metric",
      detail: "every metric on every row in the period is absent or unreadable",
    };
  }

  figures.push(...channelFigures(current, currency));
  figures.push(...ticketFigures(current, currency));

  const actions = rankActions(current, previous, currency, figures);
  for (const action of actions) figures.push(action.impactFigure);
  figures.push(countFigure("actions.count", "actions on the sheet", actions.length, current));

  const allProvisional = read.length > 0 && read.every((r) => r.row.is_provisional);

  return {
    ok: true,
    set: {
      business,
      currency,
      timezone,
      period,
      comparison,
      figures,
      actions,
      allProvisional,
    },
  };
}

function dayCount(period: Period): number {
  const from = Date.parse(`${period.from}T00:00:00Z`);
  const to = Date.parse(`${period.to}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

function dateFigure(id: string, label: string, date: string, rows: readonly ReadRow[]): Figure {
  const { sources, fetchedAt, provisional } = provenanceOf(rows);
  // A date licenses its three parts, because a reader writing "12 September" has written two
  // numbers and the verifier sees both.
  const parts = date.split("-");
  const allows = [date, ...parts]
    .map((part) => canonicalNumber(part))
    .filter((c): c is string => c !== null);
  return {
    id,
    kind: "date",
    label,
    text: date,
    allows: [...new Set(allows)],
    sources,
    fetchedAt,
    provisional,
  };
}

function countFigure(id: string, label: string, value: number, rows: readonly ReadRow[]): Figure {
  const { sources, fetchedAt, provisional } = provenanceOf(rows);
  const rendered = renderCount(value);
  return {
    id,
    kind: "count",
    label,
    text: rendered.text,
    allows: rendered.allows,
    sources,
    fetchedAt,
    provisional,
  };
}

/* ----------------------------------------------------------------------------------------------
 * One metric: its total, the comparison, the delta and the delta's share.
 * -------------------------------------------------------------------------------------------- */

function totalOf(name: MetricName, rows: readonly ReadRow[]): number | null {
  // `combineMetric` rather than a sum, so `position` is impression-weighted and the first person to
  // roll a week up here does not silently produce "average position 4,382".
  return combineMetric(
    name,
    rows.map((r) => r.values),
  );
}

function metricFigures(
  name: MetricName,
  current: readonly ReadRow[],
  previous: readonly ReadRow[],
  currency: string,
): { figures: readonly Figure[]; readable: boolean } {
  const label = METRIC_LABELS[name];
  const contributing = current.filter((r) => r.values[name] !== undefined);
  const unreadableRows = current.filter((r) => r.unreadable.includes(name));

  if (contributing.length === 0) {
    // Unreadable outranks absent: a defect must not hide behind "not reported".
    const figure =
      unreadableRows.length > 0
        ? unreadableFigure(`metric.${name}`, label, unreadableRows)
        : absentFigure(`metric.${name}`, label, current);
    return { figures: [figure], readable: false };
  }

  const total = totalOf(name, contributing);
  if (total === null)
    return { figures: [absentFigure(`metric.${name}`, label, current)], readable: false };

  const figures: Figure[] = [];
  const rendered = render(name, total, currency);
  if (rendered === null) {
    return { figures: [unreadableFigure(`metric.${name}`, label, contributing)], readable: false };
  }
  const { sources, fetchedAt, provisional } = provenanceOf(contributing);
  // The coverage caveat rides on the TOTAL and not on the delta or the share, because it is the
  // total a reader compares against another total. See `coverageNote`.
  const coverage = coverageNote(contributing, current);
  figures.push({
    id: `metric.${name}`,
    kind: "total",
    label,
    text: coverage === null ? rendered.text : `${rendered.text}${coverage.text}`,
    allows: coverage === null ? rendered.allows : [...rendered.allows, ...coverage.allows],
    sources,
    fetchedAt,
    provisional,
  });

  const priorRows = previous.filter((r) => r.values[name] !== undefined);
  const prior = priorRows.length === 0 ? null : totalOf(name, priorRows);
  if (prior === null) {
    figures.push(absentFigure(`metric.${name}.previous`, `${label}, previous period`, previous));
    return { figures, readable: true };
  }

  const priorRendered = render(name, prior, currency);
  if (priorRendered !== null) {
    const prov = provenanceOf(priorRows);
    figures.push({
      id: `metric.${name}.previous`,
      kind: "total",
      label: `${label}, previous period`,
      text: priorRendered.text,
      allows: priorRendered.allows,
      sources: prov.sources,
      fetchedAt: prov.fetchedAt,
      provisional: prov.provisional,
    });
  }

  const deltaRendered = render(name, total - prior, currency);
  if (deltaRendered !== null) {
    figures.push({
      id: `metric.${name}.delta`,
      kind: "delta",
      label: `${label}, change against the previous period`,
      text: deltaRendered.text,
      allows: deltaRendered.allows,
      sources,
      fetchedAt,
      provisional,
    });
  }

  // NO `?? 0` AND NO DIVIDE BY ZERO. A period that measured nothing has no percentage change
  // against it -- "up 100%" from zero is a sentence with no arithmetic behind it -- so the share
  // is absent rather than defaulted.
  if (prior === 0) {
    figures.push(
      absentFigure(
        `metric.${name}.delta_share`,
        `${label}, percentage change (the previous period measured zero, so there is no percentage)`,
        previous,
      ),
    );
    return { figures, readable: true };
  }

  const share = renderPercent(((total - prior) / Math.abs(prior)) * 100);
  figures.push({
    id: `metric.${name}.delta_share`,
    kind: "delta",
    label: `${label}, percentage change against the previous period`,
    text: share.text,
    allows: share.allows,
    sources,
    fetchedAt,
    provisional,
  });

  return { figures, readable: true };
}

function render(name: MetricName, value: number, currency: string): Rendered | null {
  if (METRICS[name].unit === "currency") return renderMoney(value, currency);
  if (METRICS[name].unit === "rank") return renderRatio(value);
  return renderCount(value);
}

const METRIC_LABELS: Readonly<Record<MetricName, string>> = {
  spend: "advertising spend",
  impressions: "impressions",
  clicks: "clicks",
  sessions: "sessions",
  conversions: "conversions",
  conversions_value: "conversion value",
  revenue: "revenue, as the source reported it",
  orders: "orders",
  net_revenue: "takings after what the platform kept",
  fees: "payment and transaction fees",
  commission: "marketplace and delivery commission",
  position: "average search position",
};

/* ----------------------------------------------------------------------------------------------
 * Channels: share of takings per source, ranked.
 * -------------------------------------------------------------------------------------------- */

function channelFigures(current: readonly ReadRow[], currency: string): readonly Figure[] {
  const metric = takingsMetric(current);
  if (metric === null) return [];

  const bySource = groupBySource(current, metric);
  const total = totalOf(
    metric,
    current.filter((r) => r.values[metric] !== undefined),
  );
  if (total === null || total === 0) return [];

  const ranked = [...bySource.entries()]
    .map(([source, rows]) => ({ source, rows, value: totalOf(metric, rows) }))
    .filter(
      (entry): entry is { source: Source; rows: ReadRow[]; value: number } => entry.value !== null,
    )
    // Biggest first, then by source id so the ordering is total and the prompt is reproducible.
    .sort((a, b) => b.value - a.value || a.source.localeCompare(b.source));

  const figures: Figure[] = [];
  ranked.forEach((entry, index) => {
    const prov = provenanceOf(entry.rows);
    const amount = renderMoney(entry.value, currency);
    if (amount !== null) {
      figures.push({
        id: `channel.${entry.source}.takings`,
        kind: "total",
        label: `takings through ${entry.source}`,
        text: amount.text,
        allows: amount.allows,
        sources: prov.sources,
        fetchedAt: prov.fetchedAt,
        provisional: prov.provisional,
      });
    }
    const share = renderPercent((entry.value / total) * 100);
    figures.push({
      id: `channel.${entry.source}.share`,
      kind: "share",
      label: `share of takings through ${entry.source}`,
      text: share.text,
      allows: share.allows,
      sources: prov.sources,
      fetchedAt: prov.fetchedAt,
      provisional: prov.provisional,
    });
    const rank = renderCount(index + 1);
    figures.push({
      id: `channel.${entry.source}.rank`,
      kind: "rank",
      label: `rank of ${entry.source} by takings, biggest first`,
      text: rank.text,
      allows: rank.allows,
      sources: prov.sources,
      fetchedAt: prov.fetchedAt,
      provisional: prov.provisional,
    });
  });
  return figures;
}

function groupBySource(rows: readonly ReadRow[], metric: MetricName): Map<Source, ReadRow[]> {
  const map = new Map<Source, ReadRow[]>();
  for (const row of rows) {
    if (row.values[metric] === undefined) continue;
    const existing = map.get(row.row.source);
    if (existing === undefined) map.set(row.row.source, [row]);
    else existing.push(row);
  }
  return map;
}

/* ----------------------------------------------------------------------------------------------
 * Average ticket: revenue over orders, computed at read.
 * -------------------------------------------------------------------------------------------- */

function ticketFigures(current: readonly ReadRow[], currency: string): readonly Figure[] {
  const metric = takingsMetric(current);
  if (metric === null) return [];
  const rows = current.filter(
    (r) => r.values[metric] !== undefined && r.values.orders !== undefined,
  );
  if (rows.length === 0) return [];
  const takings = totalOf(metric, rows);
  const orders = totalOf("orders", rows);
  // Orders of zero is a real measurement -- the shop took none -- and it still has no average
  // ticket. Dividing would produce Infinity and rendering it would print a figure nobody measured.
  if (takings === null || orders === null || orders === 0) return [];
  const rendered = renderMoney(takings / orders, currency);
  if (rendered === null) return [];
  const prov = provenanceOf(rows);
  return [
    {
      id: "derived.average_ticket",
      kind: "ratio",
      label: "average ticket, takings divided by orders",
      text: rendered.text,
      allows: rendered.allows,
      sources: prov.sources,
      fetchedAt: prov.fetchedAt,
      provisional: prov.provisional,
    },
  ];
}

/* ==============================================================================================
 * THE ACTION SHEET: candidates found by arithmetic, ranked by what they are worth
 * ============================================================================================== */

interface Candidate {
  readonly kind: ActionKind;
  readonly source: Source | null;
  readonly estimate: Estimate;
  readonly rows: readonly ReadRow[];
  readonly evidence: readonly string[];
}

/**
 * Every action the sheet may carry, ordered by value, biggest first.
 *
 * THE DETECTORS ARE ARITHMETIC AND THE RANKING IS ARITHMETIC. The model is handed this list and
 * told it may not reorder it, add to it or drop from it. "Ordered by value, biggest first" is a
 * promise about the data; a model asked to rank would be a promise about the writing.
 *
 * Ranking is on the FLOOR of each estimate, not its midpoint or its ceiling. A wide range whose
 * top end is large is not worth more than a settled figure of the same size, and ranking on the
 * ceiling would put the least certain item first -- exactly backwards for a list an owner is meant
 * to work through from the top.
 */
function rankActions(
  current: readonly ReadRow[],
  previous: readonly ReadRow[],
  currency: string,
  figures: readonly Figure[],
): readonly RankedAction[] {
  // Whether an impact renders at all depends only on the currency, which is one value for the
  // whole set -- `mixed_currency` refused earlier otherwise. Checking it once here means ranks are
  // assigned to a list nothing can later drop out of, so the numbering the model is shown has no
  // hole in it to explain.
  if (moneyFormatter(currency) === null) return [];

  const known = new Set(figures.map((f) => f.id));
  const candidates = [
    ...channelDeclines(current, previous),
    ...commissionLoad(current),
    ...spendWithoutReturn(current, previous),
  ]
    .filter((candidate) => estimateFloor(candidate.estimate) > 0)
    .sort(
      (a, b) =>
        estimateFloor(b.estimate) - estimateFloor(a.estimate) ||
        estimateCeiling(b.estimate) - estimateCeiling(a.estimate) ||
        a.kind.localeCompare(b.kind) ||
        (a.source ?? "").localeCompare(b.source ?? ""),
    );

  const actions: RankedAction[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const rank = index + 1;
    const id = `action.${candidate.kind}${candidate.source === null ? "" : `.${candidate.source}`}`;
    // THE LABEL CARRIES THE RANK. Three actions whose impact figures all read "what this action is
    // worth" are three identical labels with three different amounts beside them, which is an
    // invitation to attach the wrong money to the wrong action. The rank is already a licensed
    // figure, so naming it here costs nothing and removes the ambiguity.
    const impactFigure = renderEstimate(
      `${id}.impact`,
      `what action ${rank} is worth over the period just measured`,
      candidate.estimate,
      currency,
      candidate.rows,
    );
    if (impactFigure === null) continue;
    actions.push({
      id,
      kind: candidate.kind,
      rank,
      source: candidate.source,
      impact: candidate.estimate,
      impactFigure,
      evidence: candidate.evidence.filter((figureId) => known.has(figureId)),
    });
  }
  return actions;
}

/** Takings through one source fell against the comparison period. Worth: the fall. */
function channelDeclines(
  current: readonly ReadRow[],
  previous: readonly ReadRow[],
): readonly Candidate[] {
  const metric = takingsMetric(current);
  if (metric === null) return [];
  const out: Candidate[] = [];
  for (const [source, rows] of groupBySource(current, metric)) {
    const priorRows = [...(groupBySource(previous, metric).get(source) ?? [])];
    if (priorRows.length === 0) continue;
    const now = totalOf(metric, rows);
    const before = totalOf(metric, priorRows);
    if (now === null || before === null) continue;
    const fall = before - now;
    if (fall <= 0) continue;

    const contributing = [...rows, ...priorRows];
    const settledNow = totalOf(
      metric,
      rows.filter((r) => !r.row.is_provisional),
    );
    const settledBefore = totalOf(
      metric,
      priorRows.filter((r) => !r.row.is_provisional),
    );
    const settledFall =
      settledNow === null || settledBefore === null ? null : settledBefore - settledNow;
    const estimate = estimateFrom(
      fall,
      settledFall,
      contributing.some((r) => r.row.is_provisional),
    );
    if (estimate === null) continue;
    out.push({
      kind: "channel_decline",
      source,
      estimate,
      rows: contributing,
      evidence: [`channel.${source}.takings`, `metric.${metric}.delta`],
    });
  }
  return out;
}

/** Commission taken on one source. Worth: what the platform kept, which is what is at stake. */
function commissionLoad(current: readonly ReadRow[]): readonly Candidate[] {
  const out: Candidate[] = [];
  for (const [source, rows] of groupBySource(current, "commission")) {
    const taken = totalOf("commission", rows);
    if (taken === null || taken <= 0) continue;
    const settled = totalOf(
      "commission",
      rows.filter((r) => !r.row.is_provisional),
    );
    const estimate = estimateFrom(
      taken,
      settled,
      rows.some((r) => r.row.is_provisional),
    );
    if (estimate === null) continue;
    out.push({
      kind: "commission_load",
      source,
      estimate,
      rows,
      evidence: [`channel.${source}.share`, "metric.commission"],
    });
  }
  return out;
}

/** Spend on one source rose while what it returned did not. Worth: the increase in spend. */
function spendWithoutReturn(
  current: readonly ReadRow[],
  previous: readonly ReadRow[],
): readonly Candidate[] {
  const out: Candidate[] = [];
  const returnMetric = takingsMetric(current) ?? "conversions_value";
  for (const [source, rows] of groupBySource(current, "spend")) {
    const priorRows = [...(groupBySource(previous, "spend").get(source) ?? [])];
    if (priorRows.length === 0) continue;
    const now = totalOf("spend", rows);
    const before = totalOf("spend", priorRows);
    if (now === null || before === null) continue;
    const rise = now - before;
    if (rise <= 0) continue;

    const returnNow = totalOf(returnMetric, rows);
    const returnBefore = totalOf(returnMetric, priorRows);
    // Absent is not zero. Without both sides there is no comparison to make, so no action is
    // raised rather than one raised on a number that was never measured.
    if (returnNow === null || returnBefore === null) continue;
    if (returnNow > returnBefore) continue;

    const contributing = [...rows, ...priorRows];
    const settledNow = totalOf(
      "spend",
      rows.filter((r) => !r.row.is_provisional),
    );
    const settledBefore = totalOf(
      "spend",
      priorRows.filter((r) => !r.row.is_provisional),
    );
    const settledRise =
      settledNow === null || settledBefore === null ? null : settledNow - settledBefore;
    const estimate = estimateFrom(
      rise,
      settledRise,
      contributing.some((r) => r.row.is_provisional),
    );
    if (estimate === null) continue;
    out.push({
      kind: "spend_without_return",
      source,
      estimate,
      rows: contributing,
      evidence: ["metric.spend.delta", `metric.${returnMetric}.delta`],
    });
  }
  return out;
}

/**
 * Every numeric token the whole set licenses.
 *
 * `verify.ts` takes this and nothing else. Building it here rather than there is what makes the
 * gate's rule literally true: a number is allowed when a figure in this set licensed it, and a
 * figure licenses only what it printed.
 */
export function allowedNumbers(set: FigureSet): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const figure of set.figures) {
    for (const token of figure.allows) allowed.add(token);
    // A SOURCE'S OWN NAME IS INPUT DATA, and two dictionary source ids carry a digit -- `ga4` and
    // `dataforseo_serp` among them. A brief that names where a figure came from would otherwise be
    // refused for writing "GA4". The concession is exactly the digits in the ids of sources that
    // contributed to THIS set, which is a handful of small integers and nothing else.
    for (const source of figure.sources) {
      for (const run of source.match(/\d+/g) ?? []) {
        const canonical = canonicalNumber(run);
        if (canonical !== null) allowed.add(canonical);
      }
    }
  }
  return allowed;
}

/** Metrics whose money is the shop's own rather than an advertising cost. Re-exported for callers. */
export const TAKINGS_METRICS = COMMERCE_METRICS;
