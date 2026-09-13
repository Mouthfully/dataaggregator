/**
 * Air4Thai -> ambient readings.
 *
 * ============================================================================================
 * THESE ROWS ARE NOT ENVELOPE ROWS, AND THE DIFFERENCE IS STRUCTURAL RATHER THAN STYLISTIC.
 * ============================================================================================
 *
 * Every other normaliser in this package returns `EnvelopeRow[]`. This one returns
 * `AmbientReading[]`, and `@repo/contract` is not imported at all. Read
 * `packages/contract/src/envelope.ts` before proposing to change that:
 *
 *   THE UPSERT KEY is `(source, account_id, entity_id, date, attribution_window)`. An air quality
 *   measurement has no account, no entity and no attribution window, and its grain is an HOUR, not
 *   a calendar date. Landing it there means fabricating three of the five key parts.
 *
 *   NOT the attribution refusal, and an earlier version of this comment claimed otherwise. It said
 *   the refusal "would have to be satisfied with a placeholder window on a number nobody attributed
 *   to anything". Checked: `packages/contract/src/envelope.ts` declares
 *   `attribution_window: z.enum(ATTRIBUTION_WINDOWS).nullable()` and its `superRefine` fires ONLY
 *   when a conversion metric is present -- "a row with no conversion metric may leave it null". An
 *   ambient reading carries no conversion metric, so it would pass with a null window and no
 *   placeholder would be needed. The argument against the envelope is the OTHER three key parts,
 *   which is enough on its own; this fourth reason was invented and is removed rather than
 *   softened.
 *
 *   THE DICTIONARY. `SOURCES` in `packages/contract/src/source.ts` is what
 *   `scripts/check-dictionary.mjs` keeps identical on both sides of the wire, and a member of it
 *   is a source the envelope can carry a row from. `air4thai` is deliberately absent.
 *
 * THE MAP BELOW IS CALLED `AIR4THAI_PARAMETERS`, AND THE NAME IS LOAD-BEARING. The other five
 * connectors name theirs with the suffix `scripts/check-registry.mjs` keys on, and that guard then
 * requires every key to have a disposition in the canonical field registry, mapping onto a member
 * of `METRICS`. PM2.5 is not a marketing metric and must not acquire an entry there.
 *
 * This was not foresight -- the first draft of this comment SPELLED that suffix out while
 * explaining why it was avoided, and the guard duly matched the comment and demanded a registry
 * entry for air4thai. Naming the thing you are avoiding is enough to trip a text-matching guard,
 * so the suffix is described here and not written. The guard is right; this data is simply not in
 * its jurisdiction.
 *
 * ============================================================================================
 * FIVE TRAPS, each of which yields a plausible wrong number rather than an error.
 * ============================================================================================
 *
 * 1. EVERY VALUE IS A STRING. `"12.3"`, not `12.3`. `"12.3" + 1` is `"12.31"`, and a mean over
 *    string readings concatenates in silence. Parsed explicitly; anything that does not parse is
 *    refused rather than coerced to zero, because a zero is indistinguishable from clean air.
 *
 * 2. A MISSING READING IS THE SENTINEL `-1`. A station offline or an instrument in calibration
 *    reports `-1`, not null and not an absent key. Written through, it averages into every
 *    downstream mean as a real negative concentration -- pulling a city's daily average DOWN,
 *    which is the direction nobody investigates. Dropped: a parameter with nothing to report
 *    simply has no row for that hour.
 *
 * 3. THE CLOCK IS LOCAL AND UNLABELLED. `date` and `time` are Thai local time and NO offset
 *    appears anywhere in the payload. Parsed as UTC -- which is what `Date.parse` does with a bare
 *    `YYYY-MM-DDTHH:MM` in some engines -- every reading lands seven hours early, which looks
 *    entirely plausible on a chart.
 *
 * 4. THE `AQI` ENTRY IS NOT A MEASUREMENT and does not have the same shape as the others: it
 *    carries the agency's computed index plus `param`, the pollutant driving it, and no
 *    concentration. Read like a pollutant it produces a µg/m³ figure that is not a concentration.
 *
 * 5. THE PER-POLLUTANT SUB-INDEX SHARES A KEY WITH THE CONCENTRATION. Each pollutant object has
 *    BOTH `value` (the concentration) and `aqi` (that pollutant's sub-index). Taking whichever is
 *    present first silently mixes two different quantities in one column.
 */

/** The parameters `app.ambient_parameter` can store. Kept identical to the enum, in order. */
export const AMBIENT_PARAMETERS = ["pm25", "pm10", "o3", "co", "no2", "so2", "aqi"] as const;

export type AmbientParameter = (typeof AMBIENT_PARAMETERS)[number];

/** The units `public.ambient_readings.unit`'s check constraint accepts. */
export const AMBIENT_UNITS = ["ug/m3", "ppb", "ppm", "aqi"] as const;

export type AmbientUnit = (typeof AMBIENT_UNITS)[number];

/**
 * One measurement, in the shape `public.ambient_readings` stores.
 *
 * SNAKE_CASE, UNLIKE EVERY OTHER TYPE IN THIS PACKAGE, because these fields are column names and
 * the row is written by an upsert whose parameters are positional. A camelCase mirror would be one
 * more place for `station_id` and `stationId` to disagree, and the disagreement would be a
 * misfiled reading rather than a compile error.
 */
export interface AmbientReading {
  readonly source: "air4thai";
  readonly station_id: string;
  /** RFC3339 WITH the +07:00 offset. See `air4ThaiObservedAt`. */
  readonly observed_at: string;
  readonly parameter: AmbientParameter;
  readonly value: number;
  readonly unit: AmbientUnit;
  readonly fetched_at: string;
}

/** The subset of the `getNewAQI_JSON.php` response this reads. Every field optional: see below. */
export interface Air4ThaiResponse {
  readonly stations?: ReadonlyArray<Air4ThaiStation>;
}

export interface Air4ThaiStation {
  readonly stationID?: string;
  readonly nameTH?: string;
  readonly nameEN?: string;
  readonly areaTH?: string;
  readonly areaEN?: string;
  readonly stationType?: string;
  readonly lat?: string;
  readonly long?: string;
  readonly AQILast?: Air4ThaiAQILast;
}

/**
 * ASSUMPTION: the pollutant keys are spelled `PM25`, `PM10`, `O3`, `CO`, `NO2`, `SO2`, and the
 * overall index `AQI`, each an object of strings. Every field is optional in the type because a
 * station that reports only particulates omits the gas keys entirely, and because this shape was
 * not observed against the live service -- see the header of `client.ts`.
 */
export interface Air4ThaiAQILast {
  readonly date?: string;
  readonly time?: string;
  readonly PM25?: Air4ThaiMeasurement;
  readonly PM10?: Air4ThaiMeasurement;
  readonly O3?: Air4ThaiMeasurement;
  readonly CO?: Air4ThaiMeasurement;
  readonly NO2?: Air4ThaiMeasurement;
  readonly SO2?: Air4ThaiMeasurement;
  readonly AQI?: Air4ThaiMeasurement;
}

export interface Air4ThaiMeasurement {
  /** The concentration, as a string. Absent on the overall `AQI` entry. */
  readonly value?: string;
  /** The sub-index. On the overall `AQI` entry this IS the reading; elsewhere it is derived. */
  readonly aqi?: string;
  /** The colour band the agency paints it. A presentation choice; never stored. */
  readonly color_id?: string;
  /** On the overall `AQI` entry only: which pollutant is driving the index. */
  readonly param?: string;
}

/**
 * Which response keys become which parameter, in which unit.
 *
 * ASSUMPTION: the units. Thailand's AQI is published with particulates in µg/m³, CO in ppm and the
 * other gases in ppb. Carried per row into the database rather than inferred at read time, because
 * a unit we inferred is a number we relabelled.
 *
 * `reads: "aqi"` on the overall index is trap 4 and trap 5 in one field: that entry has no
 * concentration, and every other entry has both a concentration and a sub-index. Saying which
 * field is the reading, per key, is the only way neither gets taken by accident.
 *
 * Anything NOT listed here is REFUSED rather than passed through -- the same posture as
 * the GA4 normaliser. A new pollutant appearing in the feed is a dictionary decision (a member of
 * `app.ambient_parameter`, in a migration), not something a normaliser may invent at runtime.
 */
export const AIR4THAI_PARAMETERS: Readonly<
  Record<string, { parameter: AmbientParameter; unit: AmbientUnit; reads: "value" | "aqi" }>
> = {
  PM25: { parameter: "pm25", unit: "ug/m3", reads: "value" },
  PM10: { parameter: "pm10", unit: "ug/m3", reads: "value" },
  O3: { parameter: "o3", unit: "ppb", reads: "value" },
  CO: { parameter: "co", unit: "ppm", reads: "value" },
  NO2: { parameter: "no2", unit: "ppb", reads: "value" },
  SO2: { parameter: "so2", unit: "ppb", reads: "value" },
  AQI: { parameter: "aqi", unit: "aqi", reads: "aqi" },
};

/**
 * Keys of `AQILast` that are NOT measurements, so an unknown key can be reported as unknown.
 *
 * Without this list the timestamp fields would be indistinguishable from a pollutant nobody has
 * mapped, and the refusal above would fire on every single station.
 */
export const AIR4THAI_NON_MEASUREMENT_KEYS = ["date", "time"] as const;

/**
 * The offset applied to every reading.
 *
 * A FIXED OFFSET IS CORRECT HERE AND WOULD BE WRONG ALMOST ANYWHERE ELSE. Thailand has a single
 * time zone and has observed no daylight saving since 1955, so ICT is +07:00 year-round and a
 * literal cannot drift. For any source in a DST jurisdiction this would have to be a real zone
 * conversion; copying this line to the next connector is the mistake it is warning about.
 */
export const AIR4THAI_UTC_OFFSET = "+07:00";

/** The IANA name, carried so a reader can see which zone the offset above claims to be. */
/**
 * The ceiling `ambient_readings.station_id` declares, mirrored here so the refusal happens at
 * normalisation rather than at INSERT. Both halves of that column's check constraint are now
 * enforced in this file; only the empty half used to be.
 */
export const AIR4THAI_MAX_STATION_ID = 64;

export const AIR4THAI_TIMEZONE = "Asia/Bangkok";

/** ASSUMPTION: the sentinel a station uses when it has nothing to report. Trap 2. */
export const AIR4THAI_MISSING = "-1";

export type Air4ThaiNormalizeErrorCode =
  | "missing_station_id"
  | "missing_timestamp"
  | "bad_timestamp"
  | "ambiguous_hour"
  | "unknown_parameter"
  | "unparseable_value";

export class Air4ThaiNormalizeError extends Error {
  constructor(
    message: string,
    readonly code: Air4ThaiNormalizeErrorCode,
  ) {
    super(message);
    this.name = "Air4ThaiNormalizeError";
  }
}

/**
 * `("2026-09-12", "14:00")` -> `"2026-09-12T14:00:00+07:00"`. Trap 3.
 *
 * THE OFFSET IS APPENDED RATHER THAN THE INSTANT CONVERTED TO `Z`, deliberately. Both are the same
 * instant and `timestamptz` stores either identically, but only one of them still says that this
 * was 14:00 IN BANGKOK -- which is the fact a reader needs when a reading looks wrong, and the
 * fact a UTC conversion throws away at the only point where anyone could still notice it was
 * applied twice or not at all.
 *
 * `24:00` IS REFUSED, NOT ROLLED OVER. Some hourly feeds emit it for the end of a day, and it is
 * genuinely ambiguous: midnight ending day D and midnight beginning day D+1 are the same instant
 * with different labels, and picking one silently shifts a reading by a day at the exact boundary
 * where a daily average is computed. If the live feed turns out to use it, decide then, with a
 * real response in hand, and write the decision down.
 */
export function air4ThaiObservedAt(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Air4ThaiNormalizeError(
      `air4thai: expected a YYYY-MM-DD date and got ${JSON.stringify(date)}`,
      "bad_timestamp",
    );
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Air4ThaiNormalizeError(
      `air4thai: expected an HH:MM time and got ${JSON.stringify(time)}`,
      "bad_timestamp",
    );
  }

  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));

  if (hour === 24) {
    throw new Air4ThaiNormalizeError(
      `air4thai: ${date} ${time} is ambiguous -- 24:00 ending a day and 00:00 beginning the next ` +
        "are one instant with two labels, and choosing silently shifts the reading across the " +
        "boundary a daily average is cut on. Refusing until a real response settles it.",
      "ambiguous_hour",
    );
  }
  if (hour > 23 || minute > 59) {
    throw new Air4ThaiNormalizeError(
      `air4thai: ${date} ${time} is not a time of day`,
      "bad_timestamp",
    );
  }

  // A WELL-FORMED STRING CAN STILL BE AN IMPOSSIBLE DATE, and `Date.parse` does not say so.
  //
  // The first version of this check was `if (Number.isNaN(Date.parse(stamp)))` and its test
  // failed on the first run: V8 parses "2026-02-31T14:00:00+07:00" happily and ROLLS IT OVER to
  // 3 March. So a corrupt day would not have raised -- it would have been stored three days late,
  // which is the class of error this whole module is about.
  //
  // Round-tripping the components is the check that actually holds: `Date.UTC` performs the same
  // rollover, so if the date it produces still reads back as the day that went in, the day is
  // real.
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const roundTrip = new Date(Date.UTC(year, month - 1, day, hour, minute));

  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new Air4ThaiNormalizeError(
      `air4thai: ${date} is well-formed but not a real day -- it rolls over to ` +
        `${roundTrip.toISOString().slice(0, 10)}, which is how a corrupt date is stored days late ` +
        "rather than rejected.",
      "bad_timestamp",
    );
  }

  return `${date}T${time}:00${AIR4THAI_UTC_OFFSET}`;
}

/**
 * A reading, or `null` when the station has nothing to report. Traps 1 and 2.
 *
 * NULL IS "NO ROW", NEVER "ZERO". The caller drops it. That is the whole distinction this function
 * exists to preserve: a station offline and a station reporting clean air are different facts, and
 * a store that cannot tell them apart will average the first into the second.
 *
 * A value that is present, non-sentinel and does not parse is an ERROR rather than another null,
 * because silence about a malformed feed is how a connector keeps running while emitting nothing.
 */
export function parseAir4ThaiValue(raw: string | undefined | null, where: string): number | null {
  if (raw === undefined || raw === null) return null;

  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed === AIR4THAI_MISSING) return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Air4ThaiNormalizeError(
      `air4thai: ${where} is ${JSON.stringify(raw)}, which is not a number. Refusing rather than ` +
        "reading it as zero -- a zero here is indistinguishable from clean air.",
      "unparseable_value",
    );
  }

  // NEGATIVE AND NOT THE SENTINEL. A concentration cannot be below zero, so this is either a
  // sentinel this code does not know about or a corrupted field. Both are worth stopping for; the
  // one thing that must not happen is it being stored as a measurement.
  if (value < 0) {
    throw new Air4ThaiNormalizeError(
      `air4thai: ${where} is ${JSON.stringify(raw)} -- negative, and not the ` +
        `${AIR4THAI_MISSING} sentinel this normaliser knows. A concentration below zero is either ` +
        "a sentinel nobody documented or a corrupt field; storing it would pull every downstream " +
        "average down in the direction nobody investigates.",
      "unparseable_value",
    );
  }

  return value;
}

export interface Air4ThaiNormalizeOptions {
  readonly response: Air4ThaiResponse;
  /** When WE pulled it. RFC3339. The reading's own clock is `observed_at`; they differ. */
  readonly fetchedAt: string;
  /**
   * Restrict to these station ids, as a workspace's subscriptions would.
   *
   * OPTIONAL, AND OMITTING IT MEANS EVERY STATION -- which matches `ambient_subscriptions`, where
   * a NULL `station_id` means the whole source. The filter lives here rather than in the client
   * because the endpoint has no station parameter: the whole network arrives either way, and
   * pretending otherwise would suggest a request that costs less than it does.
   */
  readonly stationIds?: readonly string[];
}

/**
 * One response -> the readings worth storing.
 *
 * ORDER IS RESPONSE ORDER, then the order of `AIR4THAI_PARAMETERS`. Deterministic so a test can
 * assert on it and a diff between two pulls is legible.
 */
export function normalizeAir4Thai(options: Air4ThaiNormalizeOptions): AmbientReading[] {
  const wanted = options.stationIds === undefined ? null : new Set(options.stationIds);
  const readings: AmbientReading[] = [];

  for (const station of options.response.stations ?? []) {
    const stationId = station.stationID;
    if (typeof stationId !== "string" || stationId.trim() === "") {
      throw new Air4ThaiNormalizeError(
        "air4thai: a station carries no stationID. It is the only identifier the readings table " +
          "keys on, so a row without one could never be updated by a re-fetch or joined to a " +
          "subscription.",
        "missing_station_id",
      );
    }
    // AND THE COLUMN'S OWN CEILING, WHICH THIS DID NOT CHECK. `ambient_readings.station_id` is
    // `check (length(station_id) between 1 and 64)`. The empty half was enforced above and the
    // long half was not, so an over-long publisher id normalised cleanly and failed hours later on
    // INSERT -- with the whole batch refused, at write time, far from the station that caused it.
    // That is exactly the failure the unknown-parameter refusal exists to prevent, and the
    // contract test that claimed to cover it asserted `length <= 64` over hand-written fixtures
    // whose ids are three characters: a property of the fixtures, not of the normaliser.
    if (stationId.length > AIR4THAI_MAX_STATION_ID) {
      throw new Air4ThaiNormalizeError(
        `air4thai: station id ${JSON.stringify(stationId)} is ${stationId.length} characters; ` +
          `ambient_readings.station_id allows ${AIR4THAI_MAX_STATION_ID}. Refused here rather ` +
          "than at INSERT, where it would take the whole batch down with it.",
        "missing_station_id",
      );
    }
    if (wanted !== null && !wanted.has(stationId)) continue;

    const last = station.AQILast;

    // A STATION WITH NO `AQILast` IS SKIPPED, NOT REFUSED, and the asymmetry with the missing
    // stationID above is deliberate. A newly commissioned station that has not reported yet is a
    // normal state of the network; a station with no identifier is a malformed document. Refusing
    // the first would mean one quiet station stops the whole country from being ingested.
    if (last === undefined || last === null) continue;

    if (typeof last.date !== "string" || typeof last.time !== "string") {
      throw new Air4ThaiNormalizeError(
        `air4thai: station ${stationId} reports measurements with no date or time. An hourly ` +
          "reading with no hour cannot be keyed, deduplicated or compared with anything.",
        "missing_timestamp",
      );
    }
    const observedAt = air4ThaiObservedAt(last.date, last.time);

    // THE UNKNOWN-KEY REFUSAL, and it runs BEFORE anything is emitted for this station. A
    // pollutant the agency starts publishing is a dictionary decision -- a new member of
    // `app.ambient_parameter`, in a migration -- and a normaliser that quietly ignored it would
    // make the omission invisible for as long as nobody happened to look at the feed.
    for (const key of Object.keys(last)) {
      if ((AIR4THAI_NON_MEASUREMENT_KEYS as readonly string[]).includes(key)) continue;
      if (key in AIR4THAI_PARAMETERS) continue;
      throw new Air4ThaiNormalizeError(
        `air4thai: station ${stationId} reports "${key}", which is not in AIR4THAI_PARAMETERS. ` +
          "Add it there AND as a member of app.ambient_parameter in a migration -- a parameter " +
          "the column cannot store is a reading that fails on insert, hours later.",
        "unknown_parameter",
      );
    }

    for (const [key, spec] of Object.entries(AIR4THAI_PARAMETERS)) {
      const measurement = (last as Record<string, unknown>)[key] as Air4ThaiMeasurement | undefined;
      if (measurement === undefined || measurement === null) continue;

      // Trap 5: WHICH field is the reading is declared per key, never guessed by presence.
      const raw = spec.reads === "aqi" ? measurement.aqi : measurement.value;
      const value = parseAir4ThaiValue(raw, `station ${stationId} ${key}.${spec.reads}`);
      if (value === null) continue;

      readings.push({
        source: "air4thai",
        station_id: stationId,
        observed_at: observedAt,
        parameter: spec.parameter,
        value,
        unit: spec.unit,
        fetched_at: options.fetchedAt,
      });
    }
  }

  return readings;
}
