import { type Figure, type InsightRow, buildFigureSet, estimateFloor } from "@repo/insights";

/**
 * THE NUMBERS ON THE ASSISTANT PANEL, COMPUTED BY THE ENGINE RATHER THAN TYPED BESIDE IT.
 *
 * The panel says the product computes every figure from the customer's own rows before a model
 * sees it. Typing illustrative numbers into the card underneath that sentence would be the same
 * class of thing the whole section is arguing against -- a claim about arithmetic, with no
 * arithmetic behind it. So the card's figures come out of `buildFigureSet` in `@repo/insights`,
 * the function that will compute a real customer's, run over rows committed below.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It proves the arithmetic on the page is the shipped
 * arithmetic: the delta, the share and the range are computed by the same code, at build time,
 * and a change to that code changes this card or fails its test. It does NOT prove anything about
 * a customer, because the rows are illustrative and `envelope_rows` holds none. That is why the
 * card labels itself, and why `docs/marketplane/58-plan-reconciliation.md` section 5.3 requires the
 * label rather than leaving it to be inferred.
 *
 * THE RENDERING IS THE ENGINE'S, NOT THE PAGE'S. `figures.ts` prints money as "THB 34,220.00" --
 * the ISO code rather than a symbol, because "$" is the currency of at least four countries and a
 * reader who sees it supplies the wrong one for free. The rest of this page writes baht as
 * "฿15,420" in designed copy. Both stay: the designed copy is a picture of a dashboard, and
 * these three lines are machine output, which is worth being able to tell apart at a glance.
 *
 * IT REFUSES AT BUILD TIME RATHER THAN RENDERING A FALLBACK. If the engine cannot make a figure
 * set out of these rows -- because someone changed the rows, or changed the engine -- this module
 * throws and `next build` fails. A `?? "--"` here would put a dash on the marketing page and tell
 * nobody.
 */

/**
 * A week of an illustrative cafe, against the week before it.
 *
 * THE SOURCES ARE THE ONES THAT EXIST. `packages/connectors/src/sources` holds ga4, google_ads,
 * meta_ads, search_console and woocommerce, and section 5.1 of the reconciliation stops every Thai
 * POS and delivery platform appearing as a source on this site until one is built AND reachable.
 * So the till is `woocommerce` and the advertising is `meta_ads`, and no platform the product
 * cannot read is named anywhere in this file.
 *
 * ONE ROW IS PROVISIONAL, AND THAT IS THE POINT OF THE THIRD CARD LINE. The engine expresses
 * uncertainty by splitting contributing rows on `is_provisional` -- the settled subset at one end
 * of the range, every row at the other -- so a set with nothing provisional produces three point
 * estimates and the card could not show what a range is for.
 */
const SAMPLE_ROWS: readonly InsightRow[] = [
  row("woocommerce", "2026-09-07", { revenue: 15_420, orders: 198 }),
  row("woocommerce", "2026-09-08", { revenue: 14_100, orders: 181 }),
  row("meta_ads", "2026-09-07", { revenue: 2_400, orders: 22, spend: 1_200 }),
  row("meta_ads", "2026-09-08", { revenue: 1_800, orders: 16, spend: 1_100 }),
  row("meta_ads", "2026-09-09", { revenue: 500, orders: 4, spend: 300 }, true),

  row("woocommerce", "2026-08-31", { revenue: 13_320, orders: 172 }),
  row("woocommerce", "2026-09-01", { revenue: 12_900, orders: 166 }),
  row("meta_ads", "2026-08-31", { revenue: 3_200, orders: 29, spend: 950 }),
  row("meta_ads", "2026-09-01", { revenue: 3_000, orders: 27, spend: 900 }),
];

function row(
  source: InsightRow["source"],
  date: string,
  metrics: InsightRow["metrics"],
  provisional = false,
): InsightRow {
  return {
    source,
    entity: { type: "account", id: `sample-${source}`, account_id: `sample-${source}` },
    dimensions: { date, currency: "THB", timezone: "Asia/Bangkok" },
    metrics,
    fetched_at: `${date}T23:30:00Z`,
    is_provisional: provisional,
  };
}

const RESULT = buildFigureSet({
  business: "cafe",
  period: { from: "2026-09-07", to: "2026-09-13" },
  comparison: { from: "2026-08-31", to: "2026-09-06" },
  rows: SAMPLE_ROWS,
});

if (!RESULT.ok) {
  throw new Error(
    `_sample-brief: the insight engine refused the sample rows (${RESULT.code}: ${RESULT.detail}). ` +
      "Fix the rows or the engine -- do not render a placeholder figure on the marketing page.",
  );
}

export const SAMPLE_SET = RESULT.set;

function figure(id: string): Figure {
  const found = SAMPLE_SET.figures.find((f) => f.id === id);
  if (found === undefined) {
    throw new Error(
      `_sample-brief: the engine produced no figure "${id}". The card cannot print a number the ` +
        "engine did not compute.",
    );
  }
  return found;
}

/**
 * The largest action the engine found in these rows, by what it is worth.
 *
 * Ordering is the engine's, not this module's: "ordered by value, biggest first" is a promise about
 * the data, so taking `actions[0]` is the only correct way to read it.
 */
const TOP_ACTION = SAMPLE_SET.actions[0];
if (TOP_ACTION === undefined) {
  throw new Error(
    "_sample-brief: the engine raised no action from the sample rows, so the card has nothing to " +
      "show. Adjust the rows until the arithmetic finds something worth doing.",
  );
}

/** True when the top action's worth is a range rather than a point. Used to word its caption. */
export const TOP_ACTION_IS_RANGE = TOP_ACTION.impact.kind === "range";

/** A sanity value for the test, so a silently zero-valued action cannot pass unnoticed. */
export const TOP_ACTION_FLOOR = estimateFloor(TOP_ACTION.impact);

/**
 * The three lines the card prints. `value` is the engine's own rendering, verbatim; `label` and
 * `detail` are authored copy describing what KIND of arithmetic produced it.
 */
export const SAMPLE_FIGURES = [
  {
    id: "takings",
    label: "Takings",
    value: figure("metric.revenue").text,
    change: figure("metric.revenue.delta_share").text,
  },
  {
    id: "share",
    label: "Share through the till",
    value: figure("channel.woocommerce.share").text,
    change: null,
  },
  {
    id: "worth",
    label: "Top action, and what it is worth",
    value: TOP_ACTION.impactFigure.text,
    change: null,
  },
] as const;
