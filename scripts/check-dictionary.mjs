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
 * THE SINGLE-FILE ASSUMPTION IS OVER, AND THIS IS WHAT REPLACED IT.
 *
 * This guard used to read ONE migration and carry a tripwire that failed the build the moment
 * another migration touched the dictionary, with an error saying "teach it to fold later
 * migrations in before merging". `20260912000200_position.sql` is that moment: it adds the
 * `position` column, and a database has now applied these migrations, so declarations can no
 * longer be edited in place.
 *
 * FOLDING IS TWO RULES, and which one applies depends on the shape of the thing:
 *
 *   ACCUMULATE  Columns and enum members are additive. A later `alter table ... add column` or
 *               `alter type ... add value` contributes to the set; nothing here removes.
 *   LAST WINS   A constraint, a trigger or a function body is REDEFINED whole. Reading the first
 *               definition of `app.record_restatement` after a later migration replaced it would
 *               check a body that is no longer installed -- passing while the live schema drifts,
 *               which is the exact failure the tripwire existed to prevent.
 *
 * Getting that backwards is silent in both directions, so the two are separated explicitly rather
 * than handled by one clever merge.
 */
function dictionaryMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      file: `${MIGRATIONS_DIR}/${name}`,
      body: readText(`${MIGRATIONS_DIR}/${name}`),
    }));
}

/** The base migration first, then every later one, in application order. */
const MIGRATION_CHAIN = dictionaryMigrations();

/** LAST WINS: the final definition of a block across the chain, or null if none defines it. */
function lastDefinition(extract) {
  let found = null;
  for (const { body } of MIGRATION_CHAIN) {
    const candidate = extract(body);
    if (candidate !== null) found = candidate;
  }
  return found;
}

/** ACCUMULATE: the base set, plus anything later migrations added. */
function accumulate(base, addFrom) {
  const all = [...(base ?? [])];
  for (const { body } of MIGRATION_CHAIN) {
    for (const added of addFrom(body)) {
      if (!all.includes(added)) all.push(added);
    }
  }
  return base === null && all.length === 0 ? null : all;
}

/** `alter table envelope_rows add column <name> numeric(...)` across the chain. */
function addedMetricColumns(body) {
  const stripped = body.replace(/--[^\n]*/g, "");
  return [
    ...stripped.matchAll(
      /alter\s+table\s+(?:public\.)?envelope_rows\s+add\s+column\s+(\w+)\s+numeric\(/gi,
    ),
  ].map((m) => m[1]);
}

/** `alter type app.<name> add value 'x'` across the chain. */
function addedEnumValues(body, typeName) {
  const stripped = body.replace(/--[^\n]*/g, "");
  return [
    ...stripped.matchAll(
      new RegExp(`alter\\s+type\\s+app\\.${typeName}\\s+add\\s+value\\s+'([^']+)'`, "gi"),
    ),
  ].map((m) => m[1]);
}

/**
 * A DROPPED COLUMN IS STILL A FAILURE, and folding must not quietly absorb one.
 *
 * Accumulation is only sound while migrations are additive. A `drop column` on a metric would be
 * folded into "still present", so it is refused outright instead -- removing a metric is a change
 * this guard cannot reason about, and the honest response is to say so.
 */
function checkNoMetricDrops(findings) {
  for (const { file, body } of MIGRATION_CHAIN) {
    const stripped = body.replace(/--[^\n]*/g, "");
    if (/alter\s+table\s+(?:public\.)?envelope_rows\s+drop\s+column/i.test(stripped)) {
      findings.push({
        file,
        line: 1,
        column: 1,
        message:
          "this migration drops a column from envelope_rows. The guard folds ADDITIONS across " +
          "migrations and cannot reason about removals -- teach it before merging, rather than " +
          "letting it fold the drop into 'still present'.",
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
  const body = match[1];
  const found = [];

  // BRACE-MATCHED, NOT LINE-MATCHED, and the difference was a live defect.
  //
  // This read `^ {2}(\w+): \{ unit: "(\w+)"` -- which requires the whole entry on ONE line. The
  // first metric that needed a comment and a multi-line body, `position`, therefore matched
  // nothing, was absent from this list, and was checked against NONE of the four hand-written SQL
  // lists below. The guard reported PASS. Three mutations that removed `position` from three
  // different SQL lists were all caught by NOTHING, which is how this was found.
  //
  // So entries are brace-matched, key order does not matter, and -- see `unit === null` below --
  // an entry this cannot read is REPORTED rather than skipped. A parser that silently drops what
  // it does not understand turns a guard into decoration.
  for (const m of body.matchAll(/^ {2}(\w+):\s*\{/gm)) {
    const open = m.index + m[0].length;
    let depth = 1;
    let i = open;
    for (; i < body.length && depth > 0; i += 1) {
      if (body[i] === "{") depth += 1;
      else if (body[i] === "}") depth -= 1;
    }
    const entry = body.slice(open, i - 1);
    const unit = entry.match(/unit:\s*"(\w+)"/);
    found.push({ name: m[1], unit: unit === null ? null : unit[1] });
  }
  return found;
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
 * The body of `app.record_restatement`, whichever migration defined it last.
 *
 * Matched to the `$fn$` terminator rather than a bare `$$`, because the original uses a named
 * dollar-quote and a `$$` search would stop at the wrong place -- returning a truncated body in
 * which the later metrics simply are not present, and reporting drift that does not exist. (Found
 * by writing a replacement function from memory and diffing it against the original; the memory
 * was wrong in four places.)
 */
function sqlRecordRestatementBody(source) {
  const match = source.match(
    /create or replace function app\.record_restatement\(\)[\s\S]*?\$fn\$([\s\S]*?)\$fn\$;/,
  );
  return match === null ? null : match[1].replace(/--[^\n]*/g, "");
}

/**
 * The `on conflict ... do update set` clause of `app.upsert_envelope_row`, last definition wins.
 *
 * Deliberately NOT the whole function: the insert's column list mentions every metric too, so
 * scanning the body would find a name that appears only there and report a SET clause as complete
 * when a re-pull would never update it.
 */
function sqlUpsertSetClause(source) {
  const fn = source.match(
    /create (?:or replace )?function app\.upsert_envelope_row\([\s\S]*?\n\$\$;/,
  );
  if (fn === null) return null;
  const clause = fn[0].match(/on conflict on constraint envelope_rows_pkey do update set([\s\S]*)/);
  return clause === null ? null : clause[1].replace(/--[^\n]*/g, "");
}

/**
 * THE FOUR HAND-WRITTEN METRIC LISTS, all of which fail silently and only two of which were checked.
 *
 * The contract can ASK `METRICS` which metrics are currency and which exist. SQL cannot ask
 * anything, so the same set is written out by hand in four places -- and the migration's own
 * comment called it "the third hand-written metric list", undercounting by one, which is a fair
 * indication of how easy it is to lose track:
 *
 *   1. THE FX CONSTRAINT           a currency metric missing here stores a converted amount with
 *                                  no rate to reproduce it.
 *   2. THE TRIGGER `when` CLAUSE   a metric missing here never wakes the trigger, so a restatement
 *                                  is never announced.
 *   3. `app.record_restatement`    a metric missing HERE is worse and was unchecked: the trigger
 *                                  fires, the function builds an empty diff, declines, and the
 *                                  update lands with NO EVENT RECORDED. Present in one list and
 *                                  absent from the other is the exact drift the migration warns
 *                                  about, and nothing compared them.
 *   4. THE UPSERT'S `set` CLAUSE   a metric missing here is never updated by a re-pull. The value
 *                                  freezes at whatever the first fetch saw, forever, and every
 *                                  later fetch reports success.
 *
 * None of the four fails any other check. All are read LAST-WINS across the migration chain,
 * because each is a block a later migration redefines whole.
 */
function checkHandWrittenLists(findings, metrics, tsFile, names) {
  if (metrics === null) {
    findings.push({ file: tsFile, line: 1, column: 1, message: "could not parse metric units" });
    return;
  }

  // An entry whose unit could not be read is reported, never skipped. See tsMetricUnits.
  for (const { name, unit } of metrics) {
    if (unit === null) {
      findings.push({
        file: tsFile,
        line: 1,
        column: 1,
        message: `metric "${name}" has no readable \`unit\`, so it cannot be checked against the SQL lists`,
      });
    }
  }

  // THE TWO PARSERS MUST AGREE. `tsObjectKeys` finds metric NAMES and drives the column
  // comparison; this one finds names AND units and drives the four lists below. When they
  // disagreed, the column check saw `position` and the list checks did not -- so the schema
  // comparison passed, the list comparisons silently covered eleven metrics out of twelve, and
  // the summary said everything agreed.
  if (names !== null) {
    for (const name of names) {
      if (!metrics.some((m) => m.name === name)) {
        findings.push({
          file: tsFile,
          line: 1,
          column: 1,
          message:
            `metric "${name}" is visible to the column check but not to the hand-written-list ` +
            "check. The two parsers disagree, so some metric is going unchecked against the fx " +
            "constraint, the trigger, record_restatement and the upsert.",
        });
      }
    }
  }

  const lists = [
    {
      label: "envelope_rows_converted_needs_rate",
      extract: (body) => sqlConstraintBody(body, "envelope_rows_converted_needs_rate"),
      only: (unit) => unit === "currency",
      contains: (body, name) => body.includes(`${name} is null`),
      consequence: "a converted amount could be stored with no rate to reproduce it",
    },
    {
      label: "the envelope_rows_restated trigger condition",
      extract: sqlTriggerCondition,
      only: () => true,
      contains: (body, name) => body.includes(`old.${name} is distinct from new.${name}`),
      consequence: "it would restate silently and no webhook would fire",
    },
    {
      label: "app.record_restatement",
      extract: sqlRecordRestatementBody,
      only: () => true,
      contains: (body, name) => body.includes(`jsonb_build_object('${name}'`),
      consequence:
        "the trigger would fire, the function would build an empty diff and decline, and the " +
        "update would land with no restatement event recorded at all",
    },
    {
      label: "the app.upsert_envelope_row conflict SET clause",
      extract: sqlUpsertSetClause,
      only: () => true,
      contains: (body, name) => new RegExp(`\\b${name}\\s*=\\s*excluded\\.${name}\\b`).test(body),
      consequence:
        "a re-pull would never update it -- the value would freeze at whatever the first fetch " +
        "saw, with every later fetch reporting success",
    },
  ];

  for (const list of lists) {
    const body = lastDefinition(list.extract);
    if (body === null) {
      findings.push({
        file: MIGRATION,
        line: 1,
        column: 1,
        message: `could not find ${list.label} in any migration`,
      });
      continue;
    }
    for (const { name, unit } of metrics) {
      if (!list.only(unit)) continue;
      if (!list.contains(body, name)) {
        findings.push({
          file: MIGRATION,
          line: 1,
          column: 1,
          message: `metric "${name}" is absent from ${list.label} -- ${list.consequence}`,
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

checkNoMetricDrops(findings);

const enumOf = (name) => accumulate(sqlEnum(sql, name), (body) => addedEnumValues(body, name));

compare(
  findings,
  "sources",
  tsList(readText(CONTRACT.sources), "SOURCES"),
  enumOf("envelope_source"),
  CONTRACT.sources,
);
compare(
  findings,
  "entity types",
  tsList(readText(CONTRACT.entities), "ENTITY_TYPES"),
  enumOf("entity_type"),
  CONTRACT.entities,
);
compare(
  findings,
  "attribution windows",
  tsList(readText(CONTRACT.attribution), "ATTRIBUTION_WINDOWS"),
  enumOf("attribution_window"),
  CONTRACT.attribution,
);
compare(
  findings,
  "metrics",
  tsObjectKeys(readText(CONTRACT.metrics), "METRICS"),
  accumulate(sqlMetricColumns(sql), addedMetricColumns),
  CONTRACT.metrics,
);

checkHandWrittenLists(
  findings,
  tsMetricUnits(readText(CONTRACT.metrics)),
  CONTRACT.metrics,
  tsObjectKeys(readText(CONTRACT.metrics), "METRICS"),
);

process.exit(
  report({
    name: "dictionary guard",
    findings,
    notes: [
      "the canonical vocabulary lives in packages/contract AND in the schema; neither can import the other",
      "declarations are FOLDED across the migration chain: columns and enum members accumulate, blocks are last-wins",
      "every metric is checked against four hand-written SQL lists: the fx constraint, the trigger condition, app.record_restatement and the upsert SET clause",
    ],
    warn,
    summary:
      "contract and schema agree on sources, entity types, attribution windows, metrics, and all " +
      "four hand-written metric lists",
  }),
);
