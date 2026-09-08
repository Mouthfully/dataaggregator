#!/usr/bin/env node
/**
 * THE DICTIONARY GUARD.
 *
 * The canonical vocabulary -- sources, entity types, attribution windows, metrics -- exists TWICE:
 * once in packages/contract as TypeScript, once in supabase/migrations as PostgreSQL enums and
 * columns. Neither can import the other. Postgres cannot read a `.ts` file at migration time, and a
 * Worker cannot ask a database it has not connected to yet what an attribution window is.
 *
 * Two representations of one dictionary drift, and specification section 13.3 rule 2 is about
 * exactly the failure that follows: "a new metric requires a dictionary change first, not a silent
 * rename". A rename applied in one place and not the other does not raise an error -- the API emits
 * a value the database refuses, or the database holds a value the API cannot parse, and either way
 * a customer sees a number go missing rather than a build go red.
 *
 * So this guard reads both and asserts they are the same lists, in the same order. It is the third
 * repository guard, alongside the brand and token guards, and it fails the build like any other
 * check.
 *
 * WHAT IT DOES NOT CHECK. Nothing about semantics: two lists can agree perfectly and still both be
 * wrong. It catches drift, not error.
 *
 * Usage: node scripts/check-dictionary.mjs [--warn]
 */

import { parseArgs, readText, report } from "./lib/scan.mjs";

const CONTRACT = {
  sources: "packages/contract/src/source.ts",
  attribution: "packages/contract/src/attribution.ts",
  metrics: "packages/contract/src/metrics.ts",
  entities: "packages/contract/src/envelope.ts",
};
const MIGRATION = "supabase/migrations/20260908001100_envelope_rows.sql";

/** Pull a `const X = [ "a", "b" ] as const` list out of a TypeScript source. */
function tsList(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`));
  if (match === null) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Pull the keys of a `const X = { a: {...}, b: {...} } as const satisfies ...` object. */
function tsObjectKeys(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}\\s*as const`));
  if (match === null) return null;
  return [...match[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

/**
 * Pull the members of a `create type app.<name> as enum (...)` out of the migration.
 *
 * Line comments are stripped FIRST. An apostrophe inside a comment -- "Meta's own list" -- would
 * otherwise open a string the member scan never closes, and the guard reports nonsense members
 * instead of the drift it exists to find. (It found this by reporting nonsense members.)
 */
function sqlEnum(source, name) {
  const match = source.match(
    new RegExp(`create type app\\.${name} as enum\\s*\\(([\\s\\S]*?)\\)\\s*;`),
  );
  if (match === null) return null;
  const body = match[1].replace(/--[^\n]*/g, "");
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Pull the metric COLUMNS out of the table.
 *
 * Metrics are columns rather than an enum, so this reads the block the migration marks, and the
 * marker comment is load-bearing: without it, adding an unrelated numeric column would read as a
 * new metric and fail the build for no reason.
 */
function sqlMetricColumns(source) {
  const block = source.match(/-- METRICS ARE COLUMNS[\s\S]*?\n\n/);
  if (block === null) return null;
  return [...block[0].matchAll(/^ {2}(\w+) +numeric\(/gm)].map((m) => m[1]);
}

function compare(findings, label, ts, sql, tsFile) {
  if (ts === null) {
    findings.push({
      file: tsFile,
      line: 1,
      column: 1,
      message: `could not parse ${label} from TypeScript`,
    });
    return;
  }
  if (sql === null) {
    findings.push({
      file: MIGRATION,
      line: 1,
      column: 1,
      message: `could not parse ${label} from SQL`,
    });
    return;
  }
  const onlyTs = ts.filter((v) => !sql.includes(v));
  const onlySql = sql.filter((v) => !ts.includes(v));

  for (const value of onlyTs) {
    findings.push({
      file: tsFile,
      line: 1,
      column: 1,
      message: `${label}: "${value}" is in the contract but not in the schema -- the API can emit a value the database will refuse`,
    });
  }
  for (const value of onlySql) {
    findings.push({
      file: MIGRATION,
      line: 1,
      column: 1,
      message: `${label}: "${value}" is in the schema but not in the contract -- the database can hold a value the API cannot parse`,
    });
  }
  // Order matters for an enum: PostgreSQL sorts by definition order, so reordering silently changes
  // every `order by` on the column even when the members are identical.
  if (onlyTs.length === 0 && onlySql.length === 0 && ts.join(" ") !== sql.join(" ")) {
    findings.push({
      file: MIGRATION,
      line: 1,
      column: 1,
      message: `${label}: same members, different order. PostgreSQL sorts an enum by definition order, so this silently changes every ORDER BY on the column.`,
    });
  }
}

const { warn, unknown } = parseArgs(process.argv.slice(2));
if (unknown.length > 0) {
  process.stderr.write(`check-dictionary: unknown option ${unknown[0]}\n`);
  process.exit(2);
}

const sql = readText(MIGRATION);
const findings = [];

compare(
  findings,
  "sources",
  tsList(readText(CONTRACT.sources), "SOURCES"),
  sqlEnum(sql, "envelope_source"),
  CONTRACT.sources,
);
compare(
  findings,
  "entity types",
  tsList(readText(CONTRACT.entities), "ENTITY_TYPES"),
  sqlEnum(sql, "entity_type"),
  CONTRACT.entities,
);
compare(
  findings,
  "attribution windows",
  tsList(readText(CONTRACT.attribution), "ATTRIBUTION_WINDOWS"),
  sqlEnum(sql, "attribution_window"),
  CONTRACT.attribution,
);
compare(
  findings,
  "metrics",
  tsObjectKeys(readText(CONTRACT.metrics), "METRICS"),
  sqlMetricColumns(sql),
  CONTRACT.metrics,
);

process.exit(
  report({
    name: "dictionary guard",
    findings,
    notes: [
      "the canonical vocabulary lives in packages/contract AND in the schema; neither can import the other",
    ],
    warn,
    summary: "contract and schema agree on sources, entity types, attribution windows and metrics",
  }),
);
