/**
 * Air4Thai fixtures.
 *
 * ============================================================================================
 * NOT ONE OF THESE IS A RECORDED RESPONSE, AND THE SERVICE WAS UNREACHABLE.
 * ============================================================================================
 *
 * Specification section 13.3 rule 6 requires "every fixture is a recorded real response with PII
 * scrubbed". These are not, for a different reason than `ga4/fixtures.ts`: GA4 is missing a
 * credential, while Air4Thai needs none and was simply not reachable. Both
 * `air4thai.pcd.go.th` and `air4thai.com` resolved and returned
 *
 *     503  upstream connect error or disconnect/reset before headers.
 *          retried and the latest reset reason: remote connection failure
 *
 * from the egress gateway, on every path tried, over http and https, direct and through the proxy.
 * So the field names and nesting below come from the DOCUMENTED shape of `getNewAQI_JSON.php` --
 * the endpoint's published form and the fields its long-standing third-party consumers read -- and
 * not from a response anybody here observed.
 *
 * EVERY ASSUMPTION IS MARKED. The ones that would change the numbers rather than merely the
 * parsing are:
 *
 *   ASSUMPTION 1  The document is `{ "stations": [ ... ] }`.
 *   ASSUMPTION 2  Each station carries `stationID` and an `AQILast` object.
 *   ASSUMPTION 3  `AQILast` carries `date` ("YYYY-MM-DD") and `time` ("HH:MM") in THAI LOCAL TIME
 *                 with no offset anywhere in the payload. This is the one that moves every
 *                 timestamp seven hours if it is wrong.
 *   ASSUMPTION 4  Pollutants are keyed `PM25`, `PM10`, `O3`, `CO`, `NO2`, `SO2`, each an object of
 *                 STRINGS with `value`, `aqi` and `color_id`.
 *   ASSUMPTION 5  `AQI` is the overall index: `aqi` plus `param` naming the driving pollutant, and
 *                 NO `value`.
 *   ASSUMPTION 6  A missing reading is the string "-1". This is the one that poisons averages if
 *                 it is wrong in the other direction -- i.e. if the real sentinel is something
 *                 else, it will parse as a measurement.
 *   ASSUMPTION 7  Units: particulates µg/m³, CO ppm, O3/NO2/SO2 ppb.
 *
 * BEFORE THIS CONNECTOR IS SCHEDULED: fetch one real response, save it here, and re-run
 * `contract.test.ts`. Where it disagrees, the recorded response is right and the normaliser is
 * wrong. Nothing below should be taken as evidence about the API; it is evidence about this code.
 */

import type { Air4ThaiResponse } from "./normalize.ts";

/** The ordinary case: one station, every pollutant reporting, plus the overall index. */
export const ONE_STATION: Air4ThaiResponse = {
  stations: [
    {
      stationID: "03t",
      nameTH: "สถานีตรวจวัดคุณภาพอากาศ",
      nameEN: "Chok Chai Police Station, Bangkok",
      areaEN: "Bangkok",
      stationType: "GROUND",
      lat: "13.636514",
      long: "100.414262",
      AQILast: {
        date: "2026-09-12",
        time: "14:00",
        PM25: { color_id: "2", aqi: "26", value: "12.3" },
        PM10: { color_id: "1", aqi: "20", value: "22" },
        O3: { color_id: "1", aqi: "8", value: "9" },
        CO: { color_id: "1", aqi: "3", value: "0.29" },
        NO2: { color_id: "1", aqi: "5", value: "9" },
        SO2: { color_id: "1", aqi: "1", value: "1" },
        AQI: { color_id: "2", aqi: "26", param: "PM25" },
      },
    },
  ],
};

/** Two stations, so a station filter has something to exclude and ordering is observable. */
export const TWO_STATIONS: Air4ThaiResponse = {
  stations: [
    ONE_STATION.stations?.[0] as NonNullable<Air4ThaiResponse["stations"]>[number],
    {
      stationID: "44t",
      nameEN: "City Hall, Chiang Mai",
      areaEN: "Chiang Mai",
      stationType: "GROUND",
      lat: "18.840000",
      long: "98.969000",
      AQILast: {
        date: "2026-09-12",
        time: "14:00",
        PM25: { color_id: "1", aqi: "18", value: "9.8" },
        AQI: { color_id: "1", aqi: "18", param: "PM25" },
      },
    },
  ],
};

/**
 * A station with instruments down. Trap 2.
 *
 * PM25 reports "-1" and SO2 reports an empty string; both are absences, and neither may become a
 * row. PM10 still reports, so this fixture also proves the drop is per-parameter rather than
 * per-station -- a normaliser that bailed on the whole station would lose a good reading.
 */
export const PARTIAL_OUTAGE: Air4ThaiResponse = {
  stations: [
    {
      stationID: "05t",
      nameEN: "Din Daeng, Bangkok",
      AQILast: {
        date: "2026-09-12",
        time: "14:00",
        PM25: { color_id: "0", aqi: "-1", value: "-1" },
        PM10: { color_id: "1", aqi: "20", value: "21.5" },
        SO2: { color_id: "0", aqi: "", value: "" },
        AQI: { color_id: "1", aqi: "20", param: "PM10" },
      },
    },
  ],
};

/**
 * Every instrument down. The station is real, the hour is real, and there is nothing to store.
 *
 * Zero rows is the CORRECT answer here and it is why `fetchStations` refuses an empty `stations`
 * array separately: "this station has nothing" and "the service returned nothing" look identical
 * by the time they are rows, and only one of them is news.
 */
export const TOTAL_OUTAGE: Air4ThaiResponse = {
  stations: [
    {
      stationID: "07t",
      nameEN: "Bang Na, Bangkok",
      AQILast: {
        date: "2026-09-12",
        time: "14:00",
        PM25: { color_id: "0", aqi: "-1", value: "-1" },
        PM10: { color_id: "0", aqi: "-1", value: "-1" },
        AQI: { color_id: "0", aqi: "-1", param: "-" },
      },
    },
  ],
};

/** Commissioned, not yet reporting. Skipped, never refused: a quiet station is a normal state. */
export const NO_MEASUREMENTS: Air4ThaiResponse = {
  stations: [{ stationID: "99t", nameEN: "Newly Commissioned" }],
};

/** No `stationID`. Unkeyable, so refused -- the readings table keys on it. */
export const NO_STATION_ID: Air4ThaiResponse = {
  stations: [
    {
      nameEN: "Nameless",
      AQILast: { date: "2026-09-12", time: "14:00", PM25: { aqi: "26", value: "12.3" } },
    },
  ],
};

/** Measurements with no hour. An hourly reading with no hour cannot be keyed or deduplicated. */
export const NO_TIMESTAMP: Air4ThaiResponse = {
  stations: [
    { stationID: "03t", AQILast: { date: "2026-09-12", PM25: { aqi: "26", value: "12.3" } } },
  ],
};

/**
 * A pollutant nobody has mapped. Must be refused rather than ignored: adding one is a migration
 * (a member of `app.ambient_parameter`), and silence would hide the omission indefinitely.
 */
export const UNKNOWN_PARAMETER: Air4ThaiResponse = {
  stations: [
    {
      stationID: "03t",
      AQILast: {
        date: "2026-09-12",
        time: "14:00",
        PM25: { aqi: "26", value: "12.3" },
        // A real pollutant Air4Thai does not publish today, spelled the way it would be.
        PM1: { aqi: "9", value: "4.1" },
      } as never,
    },
  ],
};

/** A value that is not a number. Must not be read as zero. */
export const UNPARSEABLE_VALUE: Air4ThaiResponse = {
  stations: [
    {
      stationID: "03t",
      AQILast: { date: "2026-09-12", time: "14:00", PM25: { aqi: "26", value: "n/a" } },
    },
  ],
};

/**
 * Negative, and NOT the documented sentinel. Either an undocumented sentinel or a corrupt field;
 * either way it must never be stored as a concentration. This fixture exists because a normaliser
 * that special-cases exactly "-1" and lets "-999" through passes every other test here.
 */
export const UNDOCUMENTED_SENTINEL: Air4ThaiResponse = {
  stations: [
    {
      stationID: "03t",
      AQILast: { date: "2026-09-12", time: "14:00", PM25: { aqi: "-999", value: "-999" } },
    },
  ],
};

/** `24:00`. Ambiguous at exactly the boundary a daily average is cut on, so refused. */
export const HOUR_24: Air4ThaiResponse = {
  stations: [
    {
      stationID: "03t",
      AQILast: { date: "2026-09-12", time: "24:00", PM25: { aqi: "26", value: "12.3" } },
    },
  ],
};

/**
 * A pollutant reporting a sub-index but no concentration. Trap 5.
 *
 * `aqi` is present and `value` is absent, so a normaliser that took "whichever field is there"
 * would file the sub-index 26 as a µg/m³ concentration -- roughly double the real 12.3, and
 * entirely plausible on a chart. The correct answer is no row.
 */
export const SUB_INDEX_ONLY: Air4ThaiResponse = {
  stations: [
    {
      stationID: "03t",
      AQILast: {
        date: "2026-09-12",
        time: "14:00",
        PM25: { color_id: "2", aqi: "26" },
        AQI: { color_id: "2", aqi: "26", param: "PM25" },
      },
    },
  ],
};
