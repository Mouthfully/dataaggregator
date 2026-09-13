/**
 * THE CONTRACT, and for this connector it is a different contract from the other five.
 *
 * Every other `contract.test.ts` in this package parses its rows with `envelopeRowSchema`, because
 * every other connector's destination is `envelope_rows`. This one's destination is
 * `public.ambient_readings`, whose vocabulary lives in PostgreSQL enums and a check constraint --
 * and nothing imports a `.sql` file.
 *
 * That is exactly the arrangement `scripts/check-dictionary.mjs` exists because of: one vocabulary
 * in two languages, neither able to read the other, drifting silently until a customer sees a
 * number go missing. So this file reads the migration TEXT and asserts the two sides are the same
 * lists. A parameter TypeScript can name that `app.ambient_parameter` cannot store is a row that
 * fails on INSERT, in production, an hour after the pull that produced it.
 *
 * It is deliberately NOT added to check-dictionary.mjs: that guard is the marketing and commerce
 * dictionary -- sources, entity types, attribution windows, metrics -- and folding an unrelated
 * vocabulary into it would make the two look like one. Same technique, separate jurisdiction.
 */

import { SOURCES } from "@repo/contract";
import { describe, expect, it } from "vitest";
// Inlined by the bundler as a string. See `sql-raw.d.ts` for why this is not `node:fs`.
import sql from "../../../../../supabase/migrations/20260912000900_ambient_readings.sql?raw";
import { ONE_STATION, PARTIAL_OUTAGE, TWO_STATIONS } from "./fixtures.ts";
import {
  AIR4THAI_PARAMETERS,
  AMBIENT_PARAMETERS,
  AMBIENT_UNITS,
  type AmbientReading,
  normalizeAir4Thai,
} from "./normalize.ts";

/** Members of `create type app.<name> as enum (...)`, comments stripped. */
function enumMembers(typeName: string): string[] {
  const start = sql.indexOf(`create type app.${typeName} as enum`);
  expect(start, `app.${typeName} is not declared in the migration`).toBeGreaterThan(-1);
  const open = sql.indexOf("(", start);
  const close = sql.indexOf(");", open);
  const body = sql.slice(open + 1, close).replace(/--[^\n]*/g, "");
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

const FETCHED_AT = "2026-09-12T07:12:00Z";

function readings(response: Parameters<typeof normalizeAir4Thai>[0]["response"]) {
  return normalizeAir4Thai({ response, fetchedAt: FETCHED_AT });
}

describe("the vocabulary exists twice and must not drift", () => {
  it("AMBIENT_PARAMETERS is exactly app.ambient_parameter, in the same order", () => {
    // Order matters in an enum: PostgreSQL orders by definition order, so an ORDER BY on the
    // column is silently rewritten by a mid-list insert. The two lists being sorted the same way
    // is part of the contract, not tidiness.
    expect([...AMBIENT_PARAMETERS]).toEqual(enumMembers("ambient_parameter"));
  });

  it("the source id is exactly app.ambient_source", () => {
    expect(enumMembers("ambient_source")).toEqual(["air4thai"]);
  });

  it("AMBIENT_UNITS is exactly the unit check constraint", () => {
    const match = sql.match(/check\s*\(unit in \(([^)]*)\)\)/);
    expect(match, "the unit check constraint is not in the migration").not.toBeNull();
    const units = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...AMBIENT_UNITS]).toEqual(units);
  });

  it("every parameter this connector can emit is one the column can store", () => {
    for (const [key, spec] of Object.entries(AIR4THAI_PARAMETERS)) {
      expect(
        AMBIENT_PARAMETERS as readonly string[],
        `${key} maps to "${spec.parameter}", which app.ambient_parameter cannot store`,
      ).toContain(spec.parameter);
      expect(AMBIENT_UNITS as readonly string[]).toContain(spec.unit);
    }
  });
});

describe("air4thai is NOT in the envelope dictionary, on purpose", () => {
  it("is absent from SOURCES", () => {
    // A member of SOURCES is a source the envelope can carry a row from, and an air quality
    // reading has no account, no entity and no attribution window -- three of the five parts of
    // the section 7 upsert key. Adding it here would be the vocabulary corruption
    // check-dictionary.mjs protects against, arriving through the front door.
    expect(SOURCES as readonly string[]).not.toContain("air4thai");
  });

  it("emits no envelope fields at all", () => {
    // A reading that grew `dimensions`, `metrics` or `attribution_window` is one refactor away
    // from being pushed through envelopeRowSchema with a placeholder window.
    const [row] = readings(ONE_STATION) as [AmbientReading];
    expect(Object.keys(row).sort()).toEqual([
      "fetched_at",
      "observed_at",
      "parameter",
      "source",
      "station_id",
      "unit",
      "value",
    ]);
  });
});

describe("every emitted reading is storable", () => {
  const all = [...readings(TWO_STATIONS), ...readings(PARTIAL_OUTAGE)];

  it("produces rows at all, so the assertions below are not vacuous", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("satisfies every column constraint the migration declares", () => {
    for (const row of all) {
      expect(row.source).toBe("air4thai");
      expect(row.station_id.length).toBeGreaterThan(0);
      expect(row.station_id.length).toBeLessThanOrEqual(64);
      expect(AMBIENT_PARAMETERS as readonly string[]).toContain(row.parameter);
      expect(AMBIENT_UNITS as readonly string[]).toContain(row.unit);
      expect(Number.isFinite(row.value)).toBe(true);
      // `value` is NOT NULL and a concentration cannot be negative; the -1 sentinel is dropped
      // upstream rather than stored.
      expect(row.value).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(row.observed_at))).toBe(false);
      expect(Number.isNaN(Date.parse(row.fetched_at))).toBe(false);
    }
  });
});

describe("the idempotency key", () => {
  /** The migration's key, read from the migration rather than restated here. */
  function primaryKey(): string[] {
    const match = sql.match(/primary key \(([^)]*)\)/);
    expect(match, "the primary key is not in the migration").not.toBeNull();
    return (match?.[1] ?? "").split(",").map((c: string) => c.trim());
  }

  it("is (source, station_id, observed_at, parameter)", () => {
    expect(primaryKey()).toEqual(["source", "station_id", "observed_at", "parameter"]);
  });

  it("is the same tuple the upsert conflicts on", () => {
    // These are two spellings of one decision, in one file, twenty lines apart. An `on conflict`
    // that no longer matches the key does not error -- it raises "no unique constraint matching"
    // at call time, which is the ingest path failing hours after the pull.
    const conflict = sql.match(/on conflict \(([^)]*)\) do update/);
    expect(conflict).not.toBeNull();
    expect((conflict?.[1] ?? "").split(",").map((c: string) => c.trim())).toEqual(primaryKey());
  });

  it("is never violated by one response: the normaliser emits no duplicate key", () => {
    // If it did, the upsert would silently keep whichever row arrived last and a caller batching
    // the array would either lose a reading or hit "cannot affect row a second time".
    const rows = readings(TWO_STATIONS);
    // JSON rather than a joined string: a separator that can appear inside a station id would
    // make two different keys compare equal and quietly pass this test.
    const keys = rows.map((r) =>
      JSON.stringify([r.source, r.station_id, r.observed_at, r.parameter]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
