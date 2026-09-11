#!/usr/bin/env node
/**
 * THE CAPABILITY GUARD.
 *
 * packages/brand is a leaf, so it cannot import packages/connectors to discover which sources are
 * implemented. The marketing connector claim therefore composes its text from a small source-id
 * mirror in packages/brand/src/claims.ts, and this guard makes that mirror exact.
 *
 * A source is claimable only when its directory has both a client and a normaliser. Adding either
 * side without the other stays unclaimed; adding both without updating the mirror fails the build.
 * That is the desired failure mode: stale marketing copy cannot survive a connector change.
 *
 * Usage: node scripts/check-capabilities.mjs [--warn]
 */

import { readdirSync, statSync } from "node:fs";

import { parseArgs, readText, repoRoot, report } from "./lib/scan.mjs";

const CLAIMS_FILE = "packages/brand/src/claims.ts";
const SOURCES_DIR = "packages/connectors/src/sources";

function sourceList(source) {
  const match = source.match(/IMPLEMENTED_SOURCE_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (match === null) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function implementedSources() {
  return readdirSync(`${repoRoot}/${SOURCES_DIR}`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        exists(`${repoRoot}/${SOURCES_DIR}/${name}/client.ts`) &&
        exists(`${repoRoot}/${SOURCES_DIR}/${name}/normalize.ts`),
    )
    .sort();
}

const { warn, unknown } = parseArgs(process.argv.slice(2));
if (unknown.length > 0) {
  process.stderr.write(`check-capabilities: unknown option ${unknown[0]}\n`);
  process.exit(2);
}

const declared = sourceList(readText(CLAIMS_FILE));
const implemented = implementedSources();
const findings = [];

if (declared === null) {
  findings.push({
    file: CLAIMS_FILE,
    line: 1,
    column: 1,
    message: "could not parse IMPLEMENTED_SOURCE_IDS",
  });
} else {
  for (const source of implemented.filter((id) => !declared.includes(id))) {
    findings.push({
      file: CLAIMS_FILE,
      line: 1,
      column: 1,
      message: `implemented source "${source}" is absent from the connector-claim source list`,
    });
  }
  for (const source of declared.filter((id) => !implemented.includes(id))) {
    findings.push({
      file: CLAIMS_FILE,
      line: 1,
      column: 1,
      message: `claimed source "${source}" has no client-and-normaliser implementation`,
    });
  }
  if (findings.length === 0 && declared.join(" ") !== [...declared].sort().join(" ")) {
    findings.push({
      file: CLAIMS_FILE,
      line: 1,
      column: 1,
      message: "IMPLEMENTED_SOURCE_IDS must stay sorted so generated copy changes predictably",
    });
  }
}

process.exit(
  report({
    name: "capability guard",
    findings,
    notes: [
      "the connector claim is derived from packages/brand because brand cannot import connectors",
      "a claimable source has both client.ts and normalize.ts under packages/connectors/src/sources",
    ],
    warn,
    summary: "the connector claim names exactly the source modules implemented in the repository",
  }),
);
