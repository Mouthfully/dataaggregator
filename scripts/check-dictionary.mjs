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

import { readdirSync } from "node:fs";

import { parseArgs, readText, report } from "./lib/scan.mjs";

const CONTRACT = {
  sources: "packages/contract/src/source.ts",
  attribution: "packages/contract/src/attribution.ts",
  metrics: "packages/contract/src/metrics.ts",
  entities: "packages/contract/src/envelope.ts",
};
const MIGRATIONS_DIR = "supabase/migrations";
const MIGRATION = `${MIGRATIONS_DIR}/20260908001100_envelope_rows.sql`;

/**
 * THE SINGLE-FILE ASSUMPTION, AND THE TRIPWIRE THAT PROTECTS IT.
 *
 * Everything below compares the contract against ONE migration. That is true today because the
 * dictionary is declared in one file and no database has ever applied these migrations, so the
 * declarations are still edited in place. The day a later migration alters an enum or adds a metric
 * column, this guard keeps comparing the old file, keeps passing, and stops meaning anything --
 * silently, which is the failure mode the guard exists to prevent in the first place.
 *
 * So: fail loudly the moment another migration touches the dictionary, and say what to do about it.
 */
const DICTIONARY_MUTATIONS = [
  /alter\s+type\s+app\.(envelope_source|entity_type|attribution_window)\b/i,
  /alter\s+table\s+(public\.)?envelope_rows\b[\s\S]{0,400}?\b(add|drop)\s+column\b/i,
];

function checkSingleFileAssumption(findings) {
  for (const name of readdirSync(MIGRATIONS_DIR).sort()) {
    const file = `${MIGRATIONS_DIR}/${name}`;
    if (!name.endsWith(".sql") || file === MIGRATION) continue;
    const body = readText(file).replace(/--[^\n]*/g, "");
    if (DICTIONARY_MUTATIONS.some((re) => re.test(body))) {
      findings.push({
        file,
        line: 1,
        column: 1,
        message:
          "this migration changes the dictionary, but the guard only reads " +
          `${MIGRATION}. Teach it to fold later migrations in before merging, or the guard passes ` +
          "while the contract and the schema drift apart.",
      });
    }
  }
}

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

/**
 * Pull `name: { unit: "currency" | "count", ... }` out of the METRICS object, with the unit.
 *
 * The key list above is enough to catch a missing COLUMN. It is not enough to catch a missing
 * mention in a hand-written SQL list, and there are now three of those.
 */
function tsMetricUnits(source) {
  const match = source.match(/METRICS\s*=\s*\{([\s\S]*?)\n\}\s*as const/);
  if (match === null) return null;
  return [...match[1].matchAll(/^ {2}(\w+): \{ unit: "(\w+)"/gm)].map((m) => ({
    name: m[1],
    unit: m[2],
  }));
}

/** The body of a named `constraint <name> check (...)`, comments stripped. */
function sqlConstraintBody(source, name) {
  const match = source.match(new RegExp(`constraint ${name} check \\(([\\s\\S]*?)\\n  \\),`));
  return match === null ? null : match[1].replace(/--[^\n]*/g, "");
}

/** The `when (...)` condition of the restatement trigger, comments stripped. */
function sqlTriggerCondition(source) {
  const match = source.match(
    /create trigger envelope_rows_restated[\s\S]*?\n  when \(([\s\S]*?)\n  \)\s*\n  execute function/,
  );
  return match === null ? null : match[1].replace(/--[^\n]*/g, "");
}

/**
 * THE HOLE THIS CLOSES, named in `24-commerce-grain.md` section 1.3 before it could be closed.
 *
 * The contract finds currency metrics by ASKING `METRICS` which units are currency, and finds the
 * restatement-worthy ones by asking for all of them. SQL cannot ask anything, so both lists are
 * written out by hand -- in the fx constraint, and in the trigger's `when` clause -- and comparing
 * NAMES alone would pass while either list quietly lost a metric.
 *
 * A metric missing from the fx constraint stores a converted amount with no rate to reproduce it.
 * A metric missing from the trigger restates silently forever. Neither fails any other check.
 */
function checkHandWrittenLists(findings, metrics, sql, tsFile) {
  if (metrics === null) {
    findings.push({ file: tsFile, line: 1, column: 1, message: "could not parse metric units" });
    return;
  }

  const fx = sqlConstraintBody(sql, "envelope_rows_converted_needs_rate");
  if (fx === null) {
    findings.push({
      file: MIGRATION,
      line: 1,
      column: 1,
      message: "could not find the envelope_rows_converted_needs_rate constraint",
    });
  } else {
    for (const { name, unit } of metrics) {
      if (unit !== "currency") continue;
      if (!fx.includes(`${name} is null`)) {
        findings.push({
          file: MIGRATION,
          line: 1,
          column: 1,
          message: `metric "${name}" is currency but is absent from envelope_rows_converted_needs_rate -- a converted amount could be stored with no rate to reproduce it`,
        });
      }
    }
  }

  const when = sqlTriggerCondition(sql);
  if (when === null) {
    findings.push({
      file: MIGRATION,
      line: 1,
      column: 1,
      message: "could not find the envelope_rows_restated trigger condition",
    });
  } else {
    for (const { name } of metrics) {
      if (!when.includes(`old.${name} is distinct from new.${name}`)) {
        findings.push({
          file: MIGRATION,
          line: 1,
          column: 1,
          message: `metric "${name}" is absent from the envelope_rows_restated trigger condition -- it would restate silently and no webhook would fire`,
        });
      }
    }
  }
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

checkSingleFileAssumption(findings);

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

checkHandWrittenLists(findings, tsMetricUnits(readText(CONTRACT.metrics)), sql, CONTRACT.metrics);

process.exit(
  report({
    name: "dictionary guard",
    findings,
    notes: [
      "the canonical vocabulary lives in packages/contract AND in the schema; neither can import the other",
      "and every metric is checked against the three hand-written SQL lists: columns, the fx constraint, the restatement trigger",
    ],
    warn,
    summary:
      "contract and schema agree on sources, entity types, attribution windows, metrics, the fx constraint and the restatement trigger",
  }),
);
