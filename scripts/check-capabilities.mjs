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
 * CLAIMABLE IS NOT THE SAME AS REACHABLE, and the gap between them was live. `google_ads`,
 * `meta_ads` and `search_console` each had a tested client and normaliser -- so this guard counted
 * them, and the site said "Reads GA4, Google Ads, Meta Ads, Search Console and WooCommerce" --
 * while `packages/connectors/src/index.ts` exported NONE of the three. The claim was true about
 * the directory listing and false about the product: no other package could import any of them.
 *
 * So a source must also be EXPORTED from the barrel. A connector nothing can import is not a
 * capability, and a guard that reads the tree without reading the barrel will keep saying it is.
 *
 * Usage: node scripts/check-capabilities.mjs [--warn]
 */

import { readdirSync, statSync } from "node:fs";

import { parseArgs, readText, repoRoot, report } from "./lib/scan.mjs";

const CLAIMS_FILE = "packages/brand/src/claims.ts";
const SOURCES_DIR = "packages/connectors/src/sources";
const BARREL = "packages/connectors/src/index.ts";

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

// REACHABILITY. Every implemented source must be re-exported from the package barrel, for both
// halves it owns: the client that fetches and the normaliser that turns a response into envelope
// rows. Exporting one without the other is the same defect at half scale -- `woocommerce` exported
// its normaliser and not the client feeding it, so nothing outside the package could fetch an order.
const barrel = readText(BARREL);
for (const source of implemented) {
  for (const half of ["client", "normalize"]) {
    if (!barrel.includes(`./sources/${source}/${half}.js`)) {
      findings.push({
        file: BARREL,
        line: 1,
        column: 1,
        message:
          `source "${source}" has a ${half}.ts that the barrel does not export, so no other ` +
          "package can import it. The connector claim counts this source as implemented, which " +
          "makes the marketing sentence true about the tree and false about the product.",
      });
    }
  }
}

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
      "and both halves must be re-exported from the barrel -- claimable is not the same as reachable",
    ],
    warn,
    summary:
      "the connector claim names exactly the source modules implemented in the repository, and " +
      "every one of them is importable",
  }),
);
