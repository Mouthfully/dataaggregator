import { describe, expect, it } from "vitest";

import { COMPARISON, PERIOD, row, settledWeek } from "./fixtures.ts";
import { generateInsight } from "./generate.ts";
import type { OpaqueTenantId } from "./request.ts";

const TENANT = "c".repeat(64) as OpaqueTenantId;

/** A fetch that answers with one fixed brief and counts how many times it was asked. */
function model(content: string) {
  const calls: string[] = [];
  const impl = (async (_url: string, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    return new Response(
      JSON.stringify({
        id: "gen-1",
        model: "vendor/served",
        provider: "SomeProvider",
        choices: [{ message: { content } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function brief(summary: readonly string[], action: { title: string; why: string } | null = null) {
  return JSON.stringify({ summary, unusual: null, action });
}

function run(content: string, rows = settledWeek()) {
  const { impl, calls } = model(content);
  return {
    calls,
    result: generateInsight({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows,
      model: "some/model",
      tenant: TENANT,
      client: { apiKey: "k", fetchImpl: impl },
    }),
  };
}

describe("the whole loop, rows in and a verified brief out", () => {
  it("returns the brief, the figure set and who served it", async () => {
    const { result } = run(
      brief([
        "Takings were THB 29,000.00 against THB 28,000.00 the week before.",
        "That is up 3.6%.",
        "woocommerce took 75.9% of it.",
      ]),
    );
    const outcome = await result;
    if (!outcome.ok) throw new Error(`expected a brief, got ${outcome.stage}/${outcome.code}`);

    expect(outcome.insight.summary).toHaveLength(3);
    // The figures come back alongside the words, so a surface renders money from the arithmetic
    // rather than re-reading it out of the model's sentences.
    expect(outcome.set.actions.length).toBeGreaterThan(0);
    expect(outcome.provenance).toEqual({
      requestedModel: "some/model",
      servedByModel: "vendor/served",
      servedByProvider: "SomeProvider",
      generationId: "gen-1",
    });
  });

  it("sends the privacy fields on the call it actually made", async () => {
    const { result, calls } = run(brief(["a", "b", "c"]));
    await result;
    expect(JSON.parse(calls[0] ?? "{}")).toMatchObject({
      provider: { data_collection: "deny", zdr: true },
      temperature: 0,
      user: TENANT,
      plugins: [],
    });
  });
});

describe("THE REFUSAL, end to end", () => {
  it("refuses a brief citing a number the data does not contain", async () => {
    const { result } = run(
      brief(["Takings were THB 97,400.00 yesterday.", "A strong week.", "Keep it up."]),
    );
    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, stage: "verify", code: "unverifiable_number" });
  });

  it("does NOT regenerate after a refusal", async () => {
    // The most important assertion in this file. A loop that retried until the gate passed would
    // be selecting for outputs that slip past the gate rather than for outputs that are true.
    const { result, calls } = run(brief(["Takings were THB 97,400.00.", "b", "c"]));
    await result;
    expect(calls).toHaveLength(1);
  });

  it("returns nothing usable on a refusal -- there is no partial brief", async () => {
    const { result } = run(
      brief(["Takings were THB 29,000.00.", "And THB 97,400.00 besides.", "c"]),
    );
    const outcome = await result;
    // The first line is true. It is refused with the second, because a repaired brief is one whose
    // text no longer matches the reasoning that produced it.
    expect("insight" in outcome).toBe(false);
  });
});

describe("the stages before the model refuse without calling it at all", () => {
  it("refuses at the figures stage and never spends a token", async () => {
    const { result, calls } = run(brief(["a", "b", "c"]), [
      row({ source: "woocommerce", date: "2026-09-07", metrics: { revenue: 1 }, currency: "THB" }),
      row({ source: "woocommerce", date: "2026-09-08", metrics: { revenue: 1 }, currency: "USD" }),
    ]);
    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, stage: "figures", code: "mixed_currency" });
    expect(calls).toEqual([]);
  });

  it("reports a client failure as a client failure, not as a fabrication", async () => {
    const impl = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const outcome = await generateInsight({
      business: "cafe",
      period: PERIOD,
      comparison: COMPARISON,
      rows: settledWeek(),
      model: "some/model",
      tenant: TENANT,
      client: { apiKey: "k", fetchImpl: impl },
    });
    expect(outcome).toMatchObject({ ok: false, stage: "client", code: "unauthorised" });
  });
});
