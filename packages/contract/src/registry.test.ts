import { describe, expect, it } from "vitest";

import { METRICS, type MetricName } from "./metrics.ts";
import {
  FIELD_REGISTRY,
  type Disposition,
  droppedFields,
  fieldsFor,
  mappedFields,
  metricsFor,
} from "./registry.ts";
import { SOURCES } from "./source.ts";

/** Every disposition in the registry, flattened, with where it came from. */
function allDispositions(): { source: string; field: string; disposition: Disposition }[] {
  return FIELD_REGISTRY.flatMap((entry) =>
    Object.entries(entry.fields).map(([field, disposition]) => ({
      source: entry.source,
      field,
      disposition,
    })),
  );
}

describe("the registry is a closed vocabulary", () => {
  it("names only sources that exist", () => {
    for (const entry of FIELD_REGISTRY) {
      expect(SOURCES).toContain(entry.source);
    }
  });

  it("lists each source at most once, so there is one answer per platform", () => {
    const seen = FIELD_REGISTRY.map((e) => e.source);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never names a metric the dictionary does not have", () => {
    // THE RULE THE WHOLE FILE EXISTS FOR. A connector that reaches for a word its platform used,
    // rather than the canonical one, turns a unified store into a union of vendor schemas.
    for (const { source, field, disposition } of allDispositions()) {
      if (disposition.kind === "metric" || disposition.kind === "derived") {
        expect(
          Object.keys(METRICS),
          `${source}.${field} maps to a metric outside the dictionary`,
        ).toContain(disposition.metric);
      }
    }
  });

  it("gives every dropped field a non-trivial reason", () => {
    // A one-word reason satisfies a `reason !== undefined` check and tells the next reader
    // nothing, so the floor is a sentence rather than a value.
    for (const { source, field, disposition } of allDispositions()) {
      if (disposition.kind === "dropped") {
        expect(disposition.reason.length, `${source}.${field} has a token reason`).toBeGreaterThan(
          40,
        );
      }
    }
  });

  it("gives every derived field its formula, so the arithmetic is reviewable here", () => {
    for (const { source, field, disposition } of allDispositions()) {
      if (disposition.kind === "derived") {
        expect(disposition.formula.length, `${source}.${field}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("what a customer actually gets, per platform", () => {
  it("collapses GA4's three revenue names onto one canonical metric", () => {
    // Precedence rule 1, and the clearest example of it in the tree: three platform spellings,
    // one column. This is what integrating rather than forwarding looks like.
    const ga4 = fieldsFor("ga4");
    for (const field of ["totalRevenue", "purchaseRevenue", "eventValue"]) {
      const disposition = ga4[field];
      expect(disposition?.kind).toBe("metric");
      if (disposition?.kind !== "metric") throw new Error("expected a metric disposition");
      expect(disposition.metric).toBe<MetricName>("conversions_value");
    }
    // Five fields in, three metrics out.
    expect(mappedFields("ga4")).toHaveLength(5);
    expect(metricsFor("ga4")).toEqual(["conversions", "conversions_value", "sessions"]);
  });

  it("records Google Ads' micros trap where both fields are visible at once", () => {
    const ads = fieldsFor("google_ads");
    const cost = ads["metrics.cost_micros"];
    const value = ads["metrics.conversions_value"];
    if (cost?.kind !== "metric" || value?.kind !== "metric") {
      throw new Error("expected metric dispositions");
    }
    // The trap is that these differ on the same row. Side by side, it is hard to miss.
    expect(cost.transform).toBe("micros_to_units");
    expect(value.transform).toBeUndefined();
  });

  it("keeps ctr a decision, not a deferral", () => {
    // `ctr` and `position` were indistinguishable in the normaliser -- one line each of "read, not
    // emitted" -- and opposite decisions. `position` went through precedence rule 3 and is now a
    // column; `ctr` stays out permanently, because both its inputs are stored and the quotient
    // would be a second source of truth.
    const fields = fieldsFor("search_console");
    const ctr = fields.ctr;
    if (ctr?.kind !== "dropped") throw new Error("expected ctr to be dropped");
    expect(ctr.blockedOn).toBeUndefined();
    expect(ctr.reason).toMatch(/drift/i);
  });

  it("shows position having completed the journey rule 3 exists for", () => {
    const position = fieldsFor("search_console").position;
    expect(position?.kind).toBe("metric");
    if (position?.kind !== "metric") throw new Error("expected a metric disposition");
    expect(position.metric).toBe("position");
    // Nothing in the registry may still be waiting on it.
    for (const entry of FIELD_REGISTRY) {
      for (const [field, d] of Object.entries(entry.fields)) {
        if (d.kind === "dropped" && d.blockedOn !== undefined) {
          expect(d.blockedOn, `${entry.source}.${field}`).not.toMatch(/aggregation semantic/i);
        }
      }
    }
  });

  it("keeps the WooCommerce fee-line sign trap stated rather than remembered", () => {
    // A fee line is a surcharge ADDED to the customer's bill. Mapping it to `fees` inverts the
    // sign on the headline number, which is the kind of error that looks plausible in review.
    const dropped = droppedFields("woocommerce");
    const feeLines = dropped.find((d) => d.field === "fee_lines");
    expect(feeLines?.reason).toMatch(/invert the sign/i);
  });

  it("answers 'what do I get if I connect this' without reading a normaliser", () => {
    expect(metricsFor("search_console")).toEqual(["clicks", "impressions", "position"]);
    expect(metricsFor("meta_ads")).toEqual(["clicks", "impressions", "spend"]);
    expect(metricsFor("woocommerce")).toEqual(["fees", "revenue"]);
  });

  it("returns nothing for a source with no connector, rather than pretending", () => {
    // `impact`, `awin` and the bought-data sources have no module. An empty answer is the honest
    // one; inventing dispositions for them would be the abandoned-roadmap failure in a new place.
    expect(fieldsFor("impact")).toEqual({});
    expect(metricsFor("impact")).toEqual([]);
  });
});
