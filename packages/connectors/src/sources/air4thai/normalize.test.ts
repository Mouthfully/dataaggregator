import { describe, expect, it } from "vitest";
import {
  HOUR_24,
  NO_MEASUREMENTS,
  NO_STATION_ID,
  NO_TIMESTAMP,
  ONE_STATION,
  PARTIAL_OUTAGE,
  SUB_INDEX_ONLY,
  TOTAL_OUTAGE,
  TWO_STATIONS,
  UNDOCUMENTED_SENTINEL,
  UNKNOWN_PARAMETER,
  UNPARSEABLE_VALUE,
} from "./fixtures.ts";
import {
  AIR4THAI_MISSING,
  Air4ThaiNormalizeError,
  type Air4ThaiResponse,
  air4ThaiObservedAt,
  normalizeAir4Thai,
  parseAir4ThaiValue,
} from "./normalize.ts";

const FETCHED_AT = "2026-09-12T07:12:00Z";

function normalize(response: Air4ThaiResponse, stationIds?: readonly string[]) {
  return normalizeAir4Thai({ response, fetchedAt: FETCHED_AT, stationIds });
}

describe("the clock (trap 3): local Thai time, unlabelled in the payload", () => {
  it("applies +07:00 rather than reading the pair as UTC", () => {
    expect(air4ThaiObservedAt("2026-09-12", "14:00")).toBe("2026-09-12T14:00:00+07:00");
  });

  it("names an instant seven hours earlier than the naive reading", () => {
    // The failure this exists to prevent is not an exception, it is a chart that is plausibly
    // wrong. 14:00 in Bangkok is 07:00Z; a normaliser that dropped the offset would say 14:00Z.
    const at = Date.parse(air4ThaiObservedAt("2026-09-12", "14:00"));
    expect(new Date(at).toISOString()).toBe("2026-09-12T07:00:00.000Z");
    expect(at).toBe(Date.parse("2026-09-12T14:00:00Z") - 7 * 60 * 60 * 1000);
  });

  it("keeps the offset in the string instead of converting to Z", () => {
    // Both are the same instant. Only one still says the measurement was taken at 14:00 locally,
    // which is what a reader needs when a number looks wrong.
    expect(air4ThaiObservedAt("2026-09-12", "14:00")).toContain("+07:00");
  });

  it("refuses 24:00 rather than guessing which day it belongs to", () => {
    expect(() => air4ThaiObservedAt("2026-09-12", "24:00")).toThrow(Air4ThaiNormalizeError);
    try {
      air4ThaiObservedAt("2026-09-12", "24:00");
    } catch (error) {
      expect((error as Air4ThaiNormalizeError).code).toBe("ambiguous_hour");
    }
  });

  it("refuses a well-formed date that is not a real day", () => {
    expect(() => air4ThaiObservedAt("2026-02-31", "14:00")).toThrow(/not a real day/);
    // V8 does NOT return NaN for this -- Date.parse rolls it over to 3 March. The first version
    // of the guard used Number.isNaN and this test is what caught it.
    expect(Number.isNaN(Date.parse("2026-02-31T14:00:00+07:00"))).toBe(false);
  });

  it.each([
    ["2026/09/12", "14:00"],
    ["12-09-2026", "14:00"],
    ["2026-09-12", "2pm"],
    ["2026-09-12", "14:00:00"],
  ])("refuses %s %s", (date, time) => {
    expect(() => air4ThaiObservedAt(date, time)).toThrow(Air4ThaiNormalizeError);
  });
});

describe("values (traps 1 and 2): strings, and a sentinel that means absence", () => {
  it("parses the string the platform sends", () => {
    expect(parseAir4ThaiValue("12.3", "test")).toBe(12.3);
  });

  it("reads the -1 sentinel as absence, NOT as a measurement", () => {
    expect(parseAir4ThaiValue(AIR4THAI_MISSING, "test")).toBeNull();
    expect(parseAir4ThaiValue("-1", "test")).not.toBe(-1);
  });

  it("reads an absent or empty field as absence", () => {
    expect(parseAir4ThaiValue(undefined, "test")).toBeNull();
    expect(parseAir4ThaiValue(null, "test")).toBeNull();
    expect(parseAir4ThaiValue("  ", "test")).toBeNull();
  });

  it("refuses a non-number rather than reading it as zero", () => {
    // Zero is a real reading. Coercing here is how "the instrument is down" becomes "the air is
    // clean" with nothing in between to notice.
    expect(() => parseAir4ThaiValue("n/a", "test")).toThrow(/not a number/);
    expect(parseAir4ThaiValue("0", "test")).toBe(0);
  });

  it("refuses a negative that is not the documented sentinel", () => {
    // A normaliser that special-cases exactly "-1" passes every other test in this file while
    // storing -999 as a concentration.
    expect(() => parseAir4ThaiValue("-999", "test")).toThrow(/negative/);
  });
});

describe("normalising a response", () => {
  it("emits one reading per reporting parameter, in a stable order", () => {
    const readings = normalize(ONE_STATION);
    expect(readings.map((r) => r.parameter)).toEqual([
      "pm25",
      "pm10",
      "o3",
      "co",
      "no2",
      "so2",
      "aqi",
    ]);
  });

  it("carries the station, the instant, the unit and our fetch clock onto every row", () => {
    const [first] = normalize(ONE_STATION);
    expect(first).toEqual({
      source: "air4thai",
      station_id: "03t",
      observed_at: "2026-09-12T14:00:00+07:00",
      parameter: "pm25",
      value: 12.3,
      unit: "ug/m3",
      fetched_at: FETCHED_AT,
    });
  });

  it("gives each pollutant the unit it is actually reported in", () => {
    const byParameter = Object.fromEntries(
      normalize(ONE_STATION).map((r) => [r.parameter, r.unit]),
    );
    expect(byParameter).toEqual({
      pm25: "ug/m3",
      pm10: "ug/m3",
      o3: "ppb",
      co: "ppm",
      no2: "ppb",
      so2: "ppb",
      aqi: "aqi",
    });
  });

  it("takes the concentration for a pollutant and the index for AQI (traps 4 and 5)", () => {
    // PM25 reports value 12.3 AND aqi 26 in the same object. Taking the wrong one roughly doubles
    // the concentration, and looks entirely reasonable.
    const readings = normalize(ONE_STATION);
    expect(readings.find((r) => r.parameter === "pm25")?.value).toBe(12.3);
    expect(readings.find((r) => r.parameter === "aqi")?.value).toBe(26);
  });

  it("emits no row for a pollutant that reports only a sub-index", () => {
    // `value` absent, `aqi` present. The tempting fallback would file 26 µg/m³.
    const readings = normalize(SUB_INDEX_ONLY);
    expect(readings.map((r) => r.parameter)).toEqual(["aqi"]);
  });

  it("drops only the instruments that are down, keeping the ones that report", () => {
    const readings = normalize(PARTIAL_OUTAGE);
    expect(readings.map((r) => r.parameter)).toEqual(["pm10", "aqi"]);
    expect(readings.every((r) => r.value >= 0)).toBe(true);
  });

  it("emits nothing at all for a station whose instruments are all down", () => {
    expect(normalize(TOTAL_OUTAGE)).toEqual([]);
  });

  it("skips a commissioned station that has not reported yet", () => {
    // Skipped and not refused: one quiet station must not stop the country from being ingested.
    expect(normalize(NO_MEASUREMENTS)).toEqual([]);
  });

  it("filters to the subscribed stations", () => {
    expect(normalize(TWO_STATIONS).map((r) => r.station_id)).toContain("44t");
    expect(normalize(TWO_STATIONS, ["03t"]).every((r) => r.station_id === "03t")).toBe(true);
    expect(normalize(TWO_STATIONS, [])).toEqual([]);
  });

  it("treats an omitted filter as every station, matching a NULL station_id subscription", () => {
    const all = normalize(TWO_STATIONS);
    expect(new Set(all.map((r) => r.station_id))).toEqual(new Set(["03t", "44t"]));
  });
});

describe("the refusals", () => {
  it("refuses a station with no stationID", () => {
    expect(() => normalize(NO_STATION_ID)).toThrow(/stationID/);
  });

  it("refuses measurements with no hour", () => {
    expect(() => normalize(NO_TIMESTAMP)).toThrow(/no date or time/);
  });

  it("refuses a pollutant the dictionary does not have", () => {
    // Quietly ignoring it would hide a missing member of app.ambient_parameter for as long as
    // nobody read the feed by hand.
    expect(() => normalize(UNKNOWN_PARAMETER)).toThrow(/AIR4THAI_PARAMETERS/);
    try {
      normalize(UNKNOWN_PARAMETER);
    } catch (error) {
      expect((error as Air4ThaiNormalizeError).code).toBe("unknown_parameter");
    }
  });

  it("refuses an unparseable value", () => {
    expect(() => normalize(UNPARSEABLE_VALUE)).toThrow(/not a number/);
  });

  it("refuses an undocumented negative sentinel", () => {
    expect(() => normalize(UNDOCUMENTED_SENTINEL)).toThrow(/negative/);
  });

  it("refuses 24:00 through the normaliser, not only the helper", () => {
    expect(() => normalize(HOUR_24)).toThrow(/ambiguous/);
  });

  it("refuses the unknown parameter BEFORE emitting the known ones from that station", () => {
    // A per-parameter loop that threw mid-way would leave the caller with a half-station, which
    // upserts cleanly and is missing rows nobody counts.
    let emitted: unknown[] = [];
    try {
      emitted = normalize(UNKNOWN_PARAMETER);
    } catch {
      // expected
    }
    expect(emitted).toEqual([]);
  });
});
