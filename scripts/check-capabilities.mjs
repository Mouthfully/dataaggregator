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
 * AND THE THIRD FILE IS CHECKED TOO, WHICH IT WAS NOT. Specification 13.3 makes a connector unit
 * `{client, normalize, backfill, fixtures, contract.test}`, and this guard read two of the three
 * code files. `backfill.ts` is THE DRIVER -- it is what a scheduled pull or an ingest run actually
 * calls, the layer above the page walkers that were missing last time -- so a barrel that dropped
 * it would leave the connector complete, tested, claimable, and unusable by the one caller that
 * matters. A source is CLAIMABLE on client + normalise, which is unchanged; a `backfill.ts` that
 * exists must be fully exported, which is new. Absent is allowed: four of the five sources have no
 * driver yet, and a guard that demanded one would be asserting a roadmap rather than a fact.
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

// REACHABILITY, AND IT IS A COMPLETENESS CHECK RATHER THAN A PRESENCE ONE.
//
// The first version of this asked only whether the barrel MENTIONED `./sources/<s>/client.js`. It
// passed while five page-walker generators were missing from it -- `searchPages`,
// `getInsightsPages`, `querySearchAnalyticsPages`, `fetchOrdersPages` and `fetchOrdersWindow`,
// which are precisely the functions a scheduled pull calls. The barrel named every module and
// re-exported two thirds of what they contained, and a presence check cannot see that.
//
// So every name a source's client or normaliser exports must be re-exported. An alias counts
// (`search as googleAdsSearch`), because the name is still reachable.
const barrel = readText(BARREL);

/** Top-level export names of a module, generators and types included. */
function moduleExports(rel) {
  const text = readText(rel);
  const names = new Set();
  for (const m of text.matchAll(
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(m[1]);
  }
  return [...names];
}

/** Names the barrel re-exports from one module, following `x as y` to x. */
function barrelExportsFrom(source, half) {
  const block = barrel.match(
    new RegExp(`export \\{([^}]*)\\} from "\\./sources/${source}/${half}\\.js";`),
  );
  if (block === null) return null;
  return block[1]
    .split(",")
    .map((entry) =>
      entry
        .replace(/\btype\b/g, "")
        .trim()
        .split(/\s+as\s+/)[0]
        .trim(),
    )
    .filter(Boolean);
}

for (const source of implemented) {
  // `backfill.ts` is optional and the other two are not, so the list is built per source rather
  // than being a constant. Optional means "may be absent", NOT "may be half-exported".
  const modules = ["client", "normalize"];
  if (exists(`${repoRoot}/${SOURCES_DIR}/${source}/backfill.ts`)) modules.push("backfill");

  for (const half of modules) {
    const exported = barrelExportsFrom(source, half);
    if (exported === null) {
      findings.push({
        file: BARREL,
        line: 1,
        column: 1,
        message:
          `source "${source}" has a ${half}.ts that the barrel does not export, so no other ` +
          "package can import it. The connector claim counts this source as implemented, which " +
          "makes the marketing sentence true about the tree and false about the product.",
      });
      continue;
    }
    for (const name of moduleExports(`${SOURCES_DIR}/${source}/${half}.ts`)) {
      if (!exported.includes(name)) {
        findings.push({
          file: BARREL,
          line: 1,
          column: 1,
          message:
            `${source}/${half}.ts exports "${name}", which the barrel does not re-export. A ` +
            "connector module that is two thirds reachable is still a connector nothing can " +
            "drive: the page walkers and the backfill driver are precisely what a scheduled pull " +
            "calls, and they are the names a presence check does not see.",
        });
      }
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
      "and EVERY name they export must be re-exported -- a presence check missed five page walkers",
      "a backfill.ts is optional, and where one exists every name it exports must be re-exported too",
    ],
    warn,
    summary:
      "the connector claim names exactly the source modules implemented in the repository, and " +
      "every one of them is importable",
  }),
);
