import { existsSync, readdirSync } from "node:fs";

import { SOURCES as CONTRACT_SOURCES, CONVERSION_METRICS, envelopeRowSchema } from "@repo/contract";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ACCEPTED_COUNT,
  LABELLED_ACCEPTED,
  LABELLED_ROW,
  REFUSAL_ISSUES,
  ROW_COUNT,
  SOURCES,
  UNLABELLED_ACCEPTED,
  UNLABELLED_ROW,
} from "./_offline";
import Page from "./page";

/**
 * THE OFFLINE ENVELOPE PAGE, asserted rather than eyeballed.
 *
 * Two properties matter here and they pull in opposite directions, so both are checked.
 *
 * 1. THE ROWS ARE REAL. Not "a table rendered": the values on the page are the ones the five
 *    normalisers produced from their committed fixtures, and the schema accepted them. A test that
 *    only asserted "five panels appear" would pass against five hard-coded panels of invented
 *    numbers, which is precisely the failure this page exists to disprove.
 *
 * 2. THE REFUSAL IS THE SCHEMA'S. The error on the page is zod's issue list, and the assertion
 *    below rebuilds it from `envelopeRowSchema` here in the test rather than quoting a string. If
 *    someone replaces the printed error with a nicer sentence, this fails.
 *
 * Rendered with `renderToStaticMarkup` and read as text, which is how every other page in this app
 * is tested: the assertions are about what a reader sees, and a DOM would be bought for nothing.
 */

const html = renderToStaticMarkup(<Page />);
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

describe("the page runs the connectors offline", () => {
  it("shows a panel for every source whose normaliser emits ENVELOPE rows, and no others", () => {
    // Read off the tree rather than counted here, which is the rule `check-capabilities.mjs`
    // applies to the marketing claim: a hard-coded five would go on saying five after a sixth
    // connector landed, and the page would quietly under-report the product.
    //
    // "HAS A NORMALISER" WAS THE WRONG PREMISE, and `air4thai` is what proved it. That connector
    // has a `normalize.ts` and it returns `AmbientReading[]`, not `EnvelopeRow[]`: public air
    // quality readings have no account, no entity and no attribution window, so three of the five
    // parts of the section 7 upsert key do not exist for them. This page is THE OFFLINE ENVELOPE
    // page -- every panel it prints is a row parsed by `envelopeRowSchema` -- so a panel for it
    // could only be built by fabricating those three, which is exactly what
    // `20260912000900_ambient_readings.sql` refuses to do in the store.
    //
    // The filter is `CONTRACT_SOURCES`, not a name list, and that is the point: `SOURCES` in
    // @repo/contract IS the definition of "a source the envelope can carry a row from", it is kept
    // identical to the database enum by `check-dictionary.mjs`, and it was already the second
    // assertion in this test. A connector outside it has no business on this page, and a sixth
    // ENVELOPE connector still lands here automatically.
    const dir = new URL("../../../../packages/connectors/src/sources/", import.meta.url);
    const implemented = readdirSync(dir)
      .filter((name) => existsSync(new URL(`${name}/normalize.ts`, dir)))
      .sort();
    const envelopeSources = implemented.filter((name) =>
      (CONTRACT_SOURCES as readonly string[]).includes(name),
    );

    expect(envelopeSources.length).toBeGreaterThan(0);
    expect([...SOURCES.map((s) => s.id)].sort()).toEqual(envelopeSources);
    for (const source of SOURCES) {
      expect(CONTRACT_SOURCES, source.id).toContain(source.id);
    }

    // AND THE EXCLUSION IS DELIBERATE RATHER THAN A SIDE EFFECT. Without this, the filter above
    // would silently swallow a real envelope connector whose id someone forgot to add to the
    // contract -- the page would drop a panel and this test would still be green, which is the
    // failure mode the hard-coded five had.
    for (const name of implemented.filter((n) => !envelopeSources.includes(n))) {
      expect(
        name,
        `"${name}" has a normaliser but is not in the contract's SOURCES. If it emits envelope ` +
          "rows, that absence is the bug and this page is missing a panel; if it is ambient data, " +
          "say so where the connector is defined.",
      ).toBe("air4thai");
    }
  });

  it("produces at least one row per source, and every row satisfies the envelope", () => {
    for (const source of SOURCES) {
      expect(source.rows.length, source.id).toBeGreaterThan(0);
      for (const { row } of source.rows) {
        const result = envelopeRowSchema.safeParse(row);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      }
    }
    expect(ACCEPTED_COUNT).toBe(ROW_COUNT);
  });

  it("names the normaliser and the fixture it actually ran", () => {
    // Both are read back off the function and the fixture module by `_offline.ts`, so this asserts
    // the derivation still works -- a panel labelled with a fixture it did not run is the one
    // wrong-but-plausible thing this page could print.
    for (const source of SOURCES) {
      expect(source.normaliser, source.id).toMatch(/^normalize/);
      expect(text, source.id).toContain(source.normaliser);
      expect(text, source.id).toContain(source.fixture);
    }
  });

  it("prints the values the normalisers produced, not a rounded retelling of them", () => {
    for (const source of SOURCES) {
      for (const { row } of source.rows) {
        expect(text, source.id).toContain(row.dimensions.date);
        expect(text, source.id).toContain(row.entity.id);
        for (const [metric, value] of Object.entries(row.metrics)) {
          expect(text, `${source.id} ${metric}`).toContain(`${metric} ${value}`);
        }
      }
    }
  });

  it("counts the rows it rendered rather than announcing a number", () => {
    // ROW_COUNT IS DEFINED AS THIS SUM, so re-deriving it here and asserting equality restated the
    // definition and could not fail. The number that can be wrong is the one the page PRINTS, and
    // the count the fixtures actually yield -- so both are pinned to a literal. 16 is what the
    // five normalisers produce today (2 ga4 + 2 google_ads + 7 meta_ads + 2 search_console +
    // 3 woocommerce); a normaliser that changes its fan-out fails here and should.
    expect(ROW_COUNT).toBe(16);
    expect(SOURCES.reduce((total, s) => total + s.rows.length, 0)).toBe(16);
    expect(text).toContain("16");
  });

  it("carries a Meta row per attribution window plus one unattributed delivery row", () => {
    // Trap 1 and trap 2 of sources/meta_ads/normalize.ts, which is the behaviour no public schema
    // models and the reason attribution_window is in the upsert key. If the fan-out ever collapses
    // into one row, the page is showing a different product.
    const meta = SOURCES.find((s) => s.id === "meta_ads");
    const windows = meta?.rows.map(({ row }) => row.dimensions.attribution_window) ?? [];
    expect(windows.filter((w) => w === null)).toHaveLength(1);
    expect(new Set(windows.filter((w) => w !== null)).size).toBe(windows.length - 1);
    expect(windows.length).toBeGreaterThan(1);
  });
});

describe("the refusal is the schema's, not the page's", () => {
  it("changes exactly one field of one real row", () => {
    expect(LABELLED_ROW.dimensions.attribution_window).not.toBeNull();
    expect(UNLABELLED_ROW.dimensions.attribution_window).toBeNull();
    // THE WHOLE `dimensions` OBJECT USED TO BE SWAPPED IN BEFORE COMPARING, which proved nothing
    // about the four fields beside the window: had the page also changed `currency`, `timezone` or
    // `date`, this still passed and the page would have been demonstrating a refusal caused by
    // something other than the missing label. Restoring the ONE field is what makes the claim
    // "exactly one field" testable.
    expect({
      ...UNLABELLED_ROW,
      dimensions: {
        ...UNLABELLED_ROW.dimensions,
        attribution_window: LABELLED_ROW.dimensions.attribution_window,
      },
    }).toEqual(LABELLED_ROW);
  });

  it("nulls the window on a row that carries a conversion metric", () => {
    // Without one the schema would accept the null -- an impressions-only row may leave the window
    // empty -- and the page would demonstrate nothing at all.
    const present = CONVERSION_METRICS.filter((m) => UNLABELLED_ROW.metrics[m] !== undefined);
    expect(present.length).toBeGreaterThan(0);
  });

  it("accepts the labelled row and refuses the unlabelled one", () => {
    expect(LABELLED_ACCEPTED).toBe(true);
    expect(UNLABELLED_ACCEPTED).toBe(false);
  });

  it("prints zod's own issues verbatim", () => {
    const result = envelopeRowSchema.safeParse(UNLABELLED_ROW);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(REFUSAL_ISSUES).toBe(JSON.stringify(result.error.issues, null, 2));
    // The message the contract wrote, reaching the page through the schema rather than retyped.
    for (const issue of result.error.issues) {
      expect(html).toContain(issue.message.split(":")[0]);
    }
    expect(text).toContain("dimensions");
    expect(text).toContain("attribution_window");
  });
});

describe("the page is honest about what it is", () => {
  it("says the fixtures are synthetic rather than recorded", () => {
    // Every fixtures.ts in the repository states this in its own header. A demo page that let a
    // reader believe these were real accounts would be the quiet wrong number, one layer up.
    expect(text).toMatch(/synthetic/i);
  });

  it("claims no network, database or credential, because there is none", () => {
    expect(text).toMatch(/no database was read/i);
    expect(text).toMatch(/no credential/i);
  });
});
