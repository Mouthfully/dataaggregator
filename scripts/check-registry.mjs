#!/usr/bin/env node
/**
 * THE REGISTRY GUARD: a connector may not invent a column, and may not drop a field in silence.
 *
 * The product's value is that many platforms arrive in ONE vocabulary. The way that decays is not
 * a decision anybody makes -- it is a connector author, reasonably, using the words their platform
 * used, until the "unified" store is the union of every vendor's schema with a shared key.
 *
 * `packages/contract/src/registry.ts` is the single place that says where every platform field
 * lands. This makes it binding, in both directions:
 *
 *   CONNECTOR -> REGISTRY  A field a connector maps must be in the registry. Otherwise the
 *                          registry is a document that rots, and the tree stops matching it the
 *                          first time someone is in a hurry.
 *   REGISTRY -> CONTRACT   Every canonical metric a disposition names must exist in METRICS, and
 *                          every `dropped` must carry a reason -- because "we looked and it did
 *                          not fit" and "nobody looked" are otherwise the same absence.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: require that the registry list every field a platform returns.
 * That set is the vendor's to change and is not knowable from here; claiming completeness we
 * cannot verify would be worse than not claiming it. What it enforces is that every field the
 * REPOSITORY touches has an answer.
 *
 * Usage: node scripts/check-registry.mjs [--warn]
 */

import { readdirSync, statSync } from "node:fs";

import { parseArgs, readText, repoRoot, report } from "./lib/scan.mjs";

const REGISTRY = "packages/contract/src/registry.ts";
const METRICS_TS = "packages/contract/src/metrics.ts";
const SOURCES_DIR = "packages/connectors/src/sources";

/** Metric names declared in METRICS. */
function metricNames(source) {
  const match = source.match(/METRICS\s*=\s*\{([\s\S]*?)\n\}\s*as const/);
  if (match === null) return null;
  const body = match[1].replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

/**
 * The registry, as { source -> { field -> disposition } }.
 *
 * Parsed rather than imported because this guard is plain Node with no TypeScript loader, matching
 * the six beside it. The shapes it accepts are narrow on purpose: a disposition it cannot read is
 * reported, never skipped.
 */
function parseRegistry(text) {
  const sources = {};
  const blocks = text.matchAll(
    /const \w+: SourceFields = \{\s*source: "([a-z_0-9]+)",\s*fields: \{([\s\S]*?)\n {2}\},\n\};/g,
  );
  for (const [, source, body] of blocks) {
    const fields = {};
    // Each entry is `name: { ... }` or `"quoted.name": { ... }`, brace-matched so a nested object
    // or a `}` inside a string cannot end it early.
    const entry = /(?:^|\n) {4}(?:"([^"]+)"|([A-Za-z_$][\w$]*)):\s*\{/g;
    for (const m of body.matchAll(entry)) {
      const name = m[1] ?? m[2];
      const open = m.index + m[0].length;
      let depth = 1;
      let i = open;
      for (; i < body.length && depth > 0; i += 1) {
        if (body[i] === "{") depth += 1;
        else if (body[i] === "}") depth -= 1;
      }
      fields[name] = body.slice(open, i - 1);
    }
    sources[source] = fields;
  }
  return sources;
}

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Canonical metric names a connector's normaliser maps platform fields onto. */
function connectorMappedFields(dir) {
  const file = `${repoRoot}/${SOURCES_DIR}/${dir}/normalize.ts`;
  if (!exists(file)) return null;
  const text = readText(`${SOURCES_DIR}/${dir}/normalize.ts`);
  const found = new Set();

  // Shape 1 and 2: `FOO_METRIC_MAP = { field: "metric" }` and
  // `{ "metrics.x": { metric: "spend", micros: true } }`.
  for (const block of text.matchAll(/METRIC_MAP[^=]*=\s*\{([\s\S]*?)\n\}/g)) {
    const body = block[1].replace(/\/\/[^\n]*/g, "");
    for (const m of body.matchAll(/(?:^|\n) {2}(?:"([^"]+)"|([A-Za-z_$][\w$]*)):/g)) {
      found.add(m[1] ?? m[2]);
    }
  }
  return [...found];
}

const { warn, unknown } = parseArgs(process.argv.slice(2));
if (unknown.length > 0) {
  process.stderr.write(`check-registry: unknown option ${unknown[0]}\n`);
  process.exit(2);
}

const registryText = readText(REGISTRY);
const registry = parseRegistry(registryText);
const metrics = metricNames(readText(METRICS_TS));
const findings = [];
const at = (file, message) => findings.push({ file, line: 1, column: 1, message });

if (metrics === null) at(METRICS_TS, "could not parse METRICS");
if (Object.keys(registry).length === 0) at(REGISTRY, "could not parse FIELD_REGISTRY");

// ---------------------------------------------------------------- registry -> contract
for (const [source, fields] of Object.entries(registry)) {
  for (const [field, body] of Object.entries(fields)) {
    const kind = body.match(/kind:\s*"(\w+)"/)?.[1];
    if (kind === undefined) {
      at(REGISTRY, `${source}.${field} has no \`kind\``);
      continue;
    }

    if (kind === "metric" || kind === "derived") {
      const metric = body.match(/metric:\s*"(\w+)"/)?.[1];
      if (metric === undefined) {
        at(REGISTRY, `${source}.${field} is a ${kind} disposition with no \`metric\``);
      } else if (metrics !== null && !metrics.includes(metric)) {
        at(
          REGISTRY,
          `${source}.${field} maps to "${metric}", which is not in METRICS. A connector may not ` +
            "invent a column: map it onto an existing metric, derive it, or add it to the " +
            "dictionary deliberately under section 13.3 rule 2.",
        );
      }
      if (kind === "derived" && !/formula:\s*"/.test(body)) {
        at(REGISTRY, `${source}.${field} is derived but states no \`formula\``);
      }
    }

    if (kind === "dropped") {
      const reason = body.match(/reason:\s*\n?\s*"/);
      if (reason === null) {
        at(
          REGISTRY,
          `${source}.${field} is dropped with no reason. An undocumented drop is ` +
            "indistinguishable from an oversight, which is what this registry exists to end.",
        );
      }
    }

    if (!["metric", "derived", "dimension", "structural", "dropped"].includes(kind)) {
      at(REGISTRY, `${source}.${field} has unknown kind "${kind}"`);
    }
  }
}

// ---------------------------------------------------------------- connector -> registry
const dirs = readdirSync(`${repoRoot}/${SOURCES_DIR}`, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

for (const dir of dirs) {
  const mapped = connectorMappedFields(dir);
  if (mapped === null || mapped.length === 0) continue; // derived-only connectors hold no map
  const known = registry[dir];
  if (known === undefined) {
    at(
      `${SOURCES_DIR}/${dir}/normalize.ts`,
      `${dir} maps platform fields but has no entry in the field registry`,
    );
    continue;
  }
  for (const field of mapped) {
    if (!(field in known)) {
      at(
        `${SOURCES_DIR}/${dir}/normalize.ts`,
        `${dir} maps "${field}", which the field registry does not list. Add it there with its ` +
          "disposition -- the registry is the single place that answers where a platform's " +
          "numbers land, and a tree that has outrun it answers nothing.",
      );
    }
  }
}

process.exit(
  report({
    name: "registry guard",
    findings,
    notes: [
      "a connector may not name a metric the dictionary does not have",
      "a dropped field must say why, so a decision is distinguishable from an oversight",
      "the registry does not claim to list every field a platform returns, only every one we touch",
    ],
    warn,
    summary: "every platform field the repository reads has a declared home in one vocabulary",
  }),
);
