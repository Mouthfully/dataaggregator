/**
 * THE ENGINE AGAINST ROWS A REAL NORMALISER PRODUCED.
 *
 * Every other test in this package builds its rows by hand, which proves the arithmetic and proves
 * nothing about whether `InsightRow` describes the thing the store actually holds. This one runs
 * three WooCommerce orders through `normalizeWooOrders` -- the real connector, unmodified -- and
 * generates a brief from whatever rows come out of it.
 *
 * SO THIS IS THE TEST THAT FAILS WHEN THE ENVELOPE MOVES. If a field is renamed, if `metrics` stops
 * being a partial record, if `is_provisional` becomes an enum, the engine stops compiling against
 * real rows here rather than in production. `@repo/connectors` is a DEV dependency only: the engine
 * reads rows, it does not fetch them, and a runtime dependency on a connector would be the wrong
 * direction entirely.
 *
 * ONE ROW PER ORDER, three orders, one day, one currency. A small Thai shop's orders in THB, which
 * is also the shape the product plan's own customer has.
 *
 * THE ORDERS ARE WRITTEN HERE RATHER THAN IMPORTED, and that is the connector's decision rather
 * than a convenience. `packages/connectors/src/index.ts` exports each source's client, normaliser
 * and driver and deliberately does NOT export its fixtures -- a fixture in the barrel is one an
 * application eventually imports by accident, which is the same rule `fixtures.ts` in this package
 * states about itself. So the three orders below are written against the public `WooOrder` type and
 * carry the same traps the connector's own fixtures carry: a refund total that arrives negative,
 * and a Stripe fee in `meta_data` that is the minority case where a payment fee is knowable at all.
 */

import { type WooOrder, normalizeWooOrders } from "@repo/connectors";
import { describe, expect, it } from "vitest";

import { renderUserPrompt } from "./brief.ts";
import { type InsightRow, buildFigureSet } from "./figures.ts";
import { generateInsight } from "./generate.ts";
import type { OpaqueTenantId } from "./request.ts";
import { numericTokens, verifyInsight } from "./verify.ts";

const TENANT = "d".repeat(64) as OpaqueTenantId;

/**
 * A plain paid order, late on the 8th in UTC and therefore the morning of the 9th in Bangkok.
 *
 * `WooOrder` carries only `date_created_gmt` and not the local `date_created` WooCommerce also
 * sends, which is the connector refusing at the type level to let anyone read the wrong one.
 */
const ORDER: WooOrder = {
  id: 4821,
  currency: "THB",
  date_created_gmt: "2026-09-08T23:30:00",
  total: "560.00",
  refunds: [],
};

/** Partially refunded. The refund total is NEGATIVE, as WooCommerce sends it, so it is ADDED. */
const ORDER_REFUNDED: WooOrder = {
  id: 4822,
  currency: "THB",
  date_created_gmt: "2026-09-09T03:00:00",
  total: "1000.00",
  refunds: [{ id: 4901, total: "-250.00" }],
};

/** A Stripe order, where the payment fee IS knowable. The minority case. */
const ORDER_WITH_STRIPE_FEE: WooOrder = {
  id: 4823,
  currency: "THB",
  date_created_gmt: "2026-09-09T05:00:00",
  total: "1000.00",
  refunds: [],
  meta_data: [{ key: "_stripe_fee", value: "32.50" }],
};

/** The real rows, from the real normaliser. */
function realRows(): readonly InsightRow[] {
  return normalizeWooOrders({
    orders: [ORDER, ORDER_REFUNDED, ORDER_WITH_STRIPE_FEE],
    storeUrl: "https://shop.example.com",
    timezone: "Asia/Bangkok",
    fetchedAt: "2026-09-10T01:00:00Z",
    firstSeenAt: "2026-09-10T01:00:00Z",
  });
}

/**
 * The same three orders a day earlier, so there is something to compare against. Only the date
 * moves -- the figures are the fixtures' own.
 */
function priorRows(): readonly InsightRow[] {
  return realRows().map((row) => ({
    ...row,
    dimensions: { ...row.dimensions, date: "2026-09-08" },
    entity: { ...row.entity, id: `${row.entity.id}-prior` },
  }));
}

const PERIOD = { from: "2026-09-09", to: "2026-09-09" } as const;
const COMPARISON = { from: "2026-09-08", to: "2026-09-08" } as const;

describe("an EnvelopeRow from a real connector is an InsightRow", () => {
  it("typechecks and produces a figure set", () => {
    const rows = realRows();
    expect(rows.length).toBe(3);
    // The normaliser computes the date in the store's timezone, so all three land on the 9th.
    expect(rows.every((r) => r.dimensions.date === "2026-09-09")).toBe(true);
    expect(rows.every((r) => r.dimensions.currency === "THB")).toBe(true);

    const built = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [...rows, ...priorRows()],
    });
    if (!built.ok) throw new Error(`refused real rows: ${built.code} ${built.detail}`);
    expect(built.set.figures.length).toBeGreaterThan(10);
  });

  it("carries the connector's own money through to the prompt", () => {
    const built = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [...realRows(), ...priorRows()],
    });
    if (!built.ok) throw new Error("refused");
    const prompt = renderUserPrompt(built.set);

    // 560 + (1,000 - 250 refunded) + 1,000. The refund arrives negative and is ADDED, which is
    // the connector's own trap and not this package's arithmetic.
    expect(prompt).toContain("THB 2,310.00");
    // 3 orders, counted by the connector rather than by this package.
    expect(prompt).toContain("orders: 3");
    // The Stripe fee, which only one of the three orders makes knowable.
    expect(prompt).toContain("THB 32.50");
    expect(prompt).toContain("woocommerce");
  });

  it("says how many rows a partly-reported metric actually came from", () => {
    // THE HAZARD THIS TEST EXISTS FOR. `normalizeWooOrders` writes `net_revenue` only where a
    // payment fee was knowable, so one of three orders carries it. Printing THB 967.50 as the
    // day's takings beside a gross figure of THB 2,310.00 invites exactly one inference -- that
    // the platform kept the difference -- and it is false.
    const built = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [...realRows(), ...priorRows()],
    });
    if (!built.ok) throw new Error("refused");
    const prompt = renderUserPrompt(built.set);
    expect(prompt).toContain("THB 967.50 (reported on 1 of 3 rows from this source)");
    // And the partly-covered metric does not become the one the shares and the ticket are built
    // on: those use gross, which every row reports.
    expect(prompt).toContain("takings through woocommerce: THB 2,310.00");
    expect(prompt).toContain("average ticket, takings divided by orders: THB 770.00");
  });

  it("licenses every number the real rows put in the prompt", () => {
    const built = buildFigureSet({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: [...realRows(), ...priorRows()],
    });
    if (!built.ok) throw new Error("refused");
    const numbers = [...new Set(numericTokens(renderUserPrompt(built.set)))];
    const verdict = verifyInsight(
      JSON.stringify({
        summary: [numbers.slice(0, 20).join(" "), numbers.slice(20).join(" "), ""],
        unusual: null,
        action: null,
      }),
      built.set,
    );
    if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.detail}`);
  });
});

describe("the whole engine over real rows", () => {
  function transport(content: string) {
    return (async () =>
      new Response(
        JSON.stringify({
          id: "gen-real",
          model: "vendor/served",
          provider: "SomeProvider",
          choices: [{ message: { content } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
  }

  const input = {
    business: "cafe" as const,
    period: PERIOD,
    comparison: COMPARISON,
    model: "some/model",
    tenant: TENANT,
  };

  it("produces a verified brief from figures the connector computed", async () => {
    const outcome = await generateInsight({
      ...input,
      rows: [...realRows(), ...priorRows()],
      client: {
        apiKey: "k",
        fetchImpl: transport(
          JSON.stringify({
            summary: [
              "Takings were THB 2,310.00 across 3 orders.",
              "Average ticket was THB 770.00.",
              "All of it came through woocommerce, and every figure may still change.",
            ],
            unusual: null,
            action: null,
          }),
        ),
      },
    });
    if (!outcome.ok) throw new Error(`${outcome.stage}/${outcome.code}: ${outcome.detail}`);
    expect(outcome.insight.summary).toHaveLength(3);
  });

  it("REFUSES a brief about real rows that cites a number they do not contain", async () => {
    const outcome = await generateInsight({
      ...input,
      rows: [...realRows(), ...priorRows()],
      client: {
        apiKey: "k",
        fetchImpl: transport(
          JSON.stringify({
            // The artboard's own invented cafe figure. It is not in these rows.
            summary: ["Takings were THB 97,400.00 yesterday.", "A strong day.", "Keep going."],
            unusual: null,
            action: null,
          }),
        ),
      },
    });
    expect(outcome).toMatchObject({ ok: false, stage: "verify", code: "unverifiable_number" });
  });
});
