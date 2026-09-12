#!/usr/bin/env node
/**
 * THE PROVIDER GUARD.
 *
 * `20260908000500_connections.sql` asked for this in a comment and then shipped without it:
 *
 *   "NOTE FOR WHOEVER ADDS THE NEXT ONE: no guard relates this enum to its TypeScript twin.
 *    check-dictionary.mjs covers sources, entity types, attribution windows and metrics -- NOT
 *    connection providers. Adding a member here and forgetting the other side fails at runtime,
 *    not at build time, which is the failure mode that guard exists to prevent everywhere else."
 *
 * It had already happened by the time anyone looked. `app.connection_provider` carries `impact`,
 * `awin`, `cj` and `partnerstack`; `ConnectionProvider` names none of them. Those four are a
 * planned set written into an enum ahead of the code, which is harmless -- a row cannot acquire a
 * provider no code can write. The dangerous direction is the other one, and it is what this guard
 * makes impossible: a provider TypeScript can name and the database cannot store fails on the
 * INSERT, in production, after the customer has already finished authorising.
 *
 * So the asymmetry is the design, not an accommodation:
 *
 *   TypeScript -> database   must be total. A name the column cannot hold is a build failure.
 *   database -> TypeScript   may have a surplus, but the surplus is ENUMERATED here with a reason.
 *                            A member added to the enum and forgotten fails the build too; only a
 *                            member added to this list on purpose does not.
 *
 * The same applies to `app.credential_lane` and `CredentialLane`, where equality IS required in
 * both directions: unlike providers, there is no planned set, and a lane the database cannot
 * store is a connection that cannot be written.
 *
 * IT ALSO ENFORCES ONE COMMENT. `08_credential_lane.sql` tests the lane backfill by re-running the
 * migration's `update` against rows it inserts itself, because a backfill cannot be observed after
 * the fact -- the migration runs against an empty table in a scratch database, so its own execution
 * proves nothing. That means the statement exists twice, and the test says "Verbatim from
 * 20260912000100_credential_lane.sql" about a copy nothing compared. Edit the mapping in the
 * migration alone and the test goes on passing while the migration is wrong, which is the exact
 * false-pass this repository keeps finding. So the two are compared here, whitespace-insensitively.
 *
 * Usage: node scripts/check-providers.mjs [--warn]
 */

import { parseArgs, readText, report } from "./lib/scan.mjs";

const CONNECTIONS_SQL = "supabase/migrations/20260908000500_connections.sql";
const LANE_SQL = "supabase/migrations/20260912000100_credential_lane.sql";
const CONNECTIONS_TS = "packages/connections/src/connections.ts";
const LANE_TEST = "supabase/tests/08_credential_lane.sql";

/**
 * Database enum members that no TypeScript name is expected to match, each with the reason it is
 * allowed to be surplus. The list is the point: it fails on the member nobody thought about.
 */
const DB_ONLY_PROVIDERS = {
  impact: "affiliate network; enum written ahead of the connector, no module yet",
  awin: "affiliate network; enum written ahead of the connector, no module yet",
  cj: "affiliate network; enum written ahead of the connector, no module yet",
  partnerstack: "affiliate network; enum written ahead of the connector, no module yet",
};

/** Members of `create type <name> as enum (...)`, comments and all stripped. */
function enumMembers(sql, typeName) {
  const start = sql.indexOf(`create type ${typeName} as enum`);
  if (start === -1) return null;
  const open = sql.indexOf("(", start);
  const close = sql.indexOf(");", open);
  if (open === -1 || close === -1) return null;
  const body = sql
    .slice(open + 1, close)
    .replace(/--[^\n]*/g, "")
    .trim();
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Keys of the `PROVIDER_LANES` object literal. */
function providerLaneKeys(ts) {
  const match = ts.match(/export const PROVIDER_LANES = \{([\s\S]*?)\n\} as const satisfies/);
  if (match === null) return null;
  const body = match[1].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...body.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
}

/** Members of the `CredentialLane` union, via the `CREDENTIAL_LANES` tuple beside it. */
function credentialLanes(ts) {
  const union = ts.match(/export type CredentialLane =([^;]+);/);
  const tuple = ts.match(/export const CREDENTIAL_LANES = \[([\s\S]*?)\] as const/);
  if (union === null || tuple === null) return null;
  return {
    union: [...union[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    tuple: [...tuple[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  };
}

const { warn, unknown } = parseArgs(process.argv.slice(2));
if (unknown.length > 0) {
  process.stderr.write(`check-providers: unknown option ${unknown[0]}\n`);
  process.exit(2);
}

const connectionsSql = readText(CONNECTIONS_SQL);
const laneSql = readText(LANE_SQL);
const connectionsTs = readText(CONNECTIONS_TS);
const findings = [];
const at = (file, message) => findings.push({ file, line: 1, column: 1, message });

const dbProviders = enumMembers(connectionsSql, "app.connection_provider");
const tsProviders = providerLaneKeys(connectionsTs);

if (dbProviders === null) at(CONNECTIONS_SQL, "could not parse app.connection_provider");
if (tsProviders === null) at(CONNECTIONS_TS, "could not parse PROVIDER_LANES");

if (dbProviders !== null && tsProviders !== null) {
  // The direction that breaks production.
  for (const provider of tsProviders.filter((p) => !dbProviders.includes(p))) {
    at(
      CONNECTIONS_TS,
      `PROVIDER_LANES names "${provider}", which app.connection_provider cannot store. ` +
        "The insert fails after the customer has finished authorising.",
    );
  }
  // The direction that is allowed a surplus, provided the surplus is declared.
  for (const provider of dbProviders.filter((p) => !tsProviders.includes(p))) {
    if (provider in DB_ONLY_PROVIDERS) continue;
    at(
      CONNECTIONS_SQL,
      `app.connection_provider carries "${provider}" and no TypeScript can name it. ` +
        "Add it to PROVIDER_LANES with the lanes it offers, or to DB_ONLY_PROVIDERS with a reason.",
    );
  }
  // A reason that outlives its member is a comment claiming something untrue.
  for (const provider of Object.keys(DB_ONLY_PROVIDERS)) {
    if (!dbProviders.includes(provider)) {
      at(
        "scripts/check-providers.mjs",
        `DB_ONLY_PROVIDERS excuses "${provider}", which app.connection_provider no longer carries.`,
      );
    }
  }
}

const dbLanes = enumMembers(laneSql, "app.credential_lane");
const tsLanes = credentialLanes(connectionsTs);

if (dbLanes === null) at(LANE_SQL, "could not parse app.credential_lane");
if (tsLanes === null) at(CONNECTIONS_TS, "could not parse CredentialLane / CREDENTIAL_LANES");

if (tsLanes !== null && tsLanes.union.join(" ") !== tsLanes.tuple.join(" ")) {
  at(
    CONNECTIONS_TS,
    `the CredentialLane union is [${tsLanes.union}] and CREDENTIAL_LANES is [${tsLanes.tuple}]. ` +
      "They are two spellings of one set and must match.",
  );
}

if (dbLanes !== null && tsLanes !== null) {
  // Equality both ways here: there is no planned set of lanes to be ahead of.
  const sorted = (list) => [...list].sort().join(" ");
  if (sorted(dbLanes) !== sorted(tsLanes.union)) {
    at(
      LANE_SQL,
      `app.credential_lane is [${dbLanes}] and CredentialLane is [${tsLanes.union}]. ` +
        "A lane the column cannot store is a connection that cannot be written.",
    );
  }
}

/** The one statement that exists twice on purpose, compared so the duplication cannot drift. */
function backfillStatement(text) {
  const match = text.match(
    /update public\.connections\s+set credential_lane = case[\s\S]*?where credential_lane is null;/,
  );
  return match === null ? null : match[0].replace(/\s+/g, " ").trim();
}

const migrationBackfill = backfillStatement(laneSql);
const testBackfill = backfillStatement(readText(LANE_TEST));

if (migrationBackfill === null) at(LANE_SQL, "could not find the credential_lane backfill update");
if (testBackfill === null) at(LANE_TEST, "could not find the re-run of the backfill update");

if (migrationBackfill !== null && testBackfill !== null && migrationBackfill !== testBackfill) {
  at(
    LANE_TEST,
    "the backfill this test re-runs is no longer the one the migration performs. The test says " +
      '"verbatim" about a copy, so editing the migration alone leaves it passing while the ' +
      "migration is wrong.",
  );
}

process.exit(
  report({
    name: "provider guard",
    findings,
    notes: [
      "TypeScript -> database must be total; a provider the column cannot hold fails on INSERT",
      "database -> TypeScript may be surplus, but every surplus member is declared with a reason",
      "credential lanes must match exactly in both directions",
      "the lane backfill exists twice -- in the migration and in the test that re-runs it",
    ],
    warn,
    summary:
      "every provider and lane TypeScript can name is one app.connection_provider and " +
      "app.credential_lane can store",
  }),
);
