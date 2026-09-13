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
 * AND ONE CLASS OF SOURCE IS CLAIMABLE-EXEMPT, ENUMERATED BELOW WITH A REASON. The claim this
 * guard generates is "Reads <sources> ON YOUR OWN CREDENTIALS", and `air4thai` has no credential:
 * it is the Thai Pollution Control Department's public air quality feed, read by an unauthenticated
 * GET, landing in a SHARED table that carries no workspace_id. Adding it to IMPLEMENTED_SOURCE_IDS
 * would put a false sentence on the site -- and put a public dataset in a list section 11.9 scopes
 * to four platform connectors plus bought SERP.
 *
 * The exemption is NARROW and it is one-way. An ambient source is excused from the MARKETING mirror
 * and from nothing else: every name its client and normaliser export must still be re-exported from
 * the barrel, because a connector nothing can import is not a capability whoever is claiming it.
 * And the list is checked in both directions, like DB_ONLY_PROVIDERS in check-providers.mjs -- an
 * entry naming a directory that does not exist fails, so the excuse cannot outlive its subject.
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

/**
 * Sources that are implemented and deliberately NOT part of the connector claim, each with the
 * reason. See the note above: excused from the marketing mirror, bound by the barrel rule exactly
 * like every other source.
 */
const AMBIENT_SOURCES = {
  air4thai:
    "public air quality data from the Thai Pollution Control Department; no credential, no " +
    "connections row, and readings land in a shared table with no workspace_id, so the claim " +
    '"on your own credentials" would be false of it',
};

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

/**
 * Names the barrel re-exports from one module, following `x as y` to x.
 *
 * THE EXTENSION IS MATCHED LOOSELY, ON PURPOSE. This guard asks whether a module is reachable from
 * the barrel; how the specifier spells its extension is not its business, and hard-coding one
 * spelling made it a second copy of a convention that lives in tsconfig.base.json. That copy went
 * wrong the moment the convention was applied: converting `./sources/x/client.js` to `.ts` --
 * which tsconfig mandates, and which `next build` requires -- turned this guard red across all
 * five sources while every one of them was still exported exactly as before. A guard that fails
 * when nothing it guards has changed teaches people to distrust it.
 */
function barrelExportsFrom(source, half) {
  const block = barrel.match(
    new RegExp(`export \\{([^}]*)\\} from "\\./sources/${source}/${half}\\.(?:ts|js)";`),
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
    if (source in AMBIENT_SOURCES) continue;
    findings.push({
      file: CLAIMS_FILE,
      line: 1,
      column: 1,
      message: `implemented source "${source}" is absent from the connector-claim source list`,
    });
  }
  // A CLAIMED AMBIENT SOURCE IS ALSO A FAILURE, in the other direction: the exemption says the
  // marketing sentence must NOT name it, so finding it there is the false claim arriving anyway.
  for (const source of declared.filter((id) => id in AMBIENT_SOURCES)) {
    findings.push({
      file: CLAIMS_FILE,
      line: 1,
      column: 1,
      message:
        `"${source}" is an ambient source and must not appear in the connector claim: ` +
        `${AMBIENT_SOURCES[source]}.`,
    });
  }
  // And an excuse that outlives its subject is a comment claiming something untrue.
  for (const source of Object.keys(AMBIENT_SOURCES)) {
    if (implemented.includes(source)) continue;
    findings.push({
      file: "scripts/check-capabilities.mjs",
      line: 1,
      column: 1,
      message: `AMBIENT_SOURCES excuses "${source}", which is no longer an implemented source.`,
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
      "an AMBIENT source is excused from the marketing mirror only -- the barrel rule still binds",
    ],
    warn,
    summary:
      "the connector claim names exactly the source modules implemented in the repository, and " +
      "every one of them is importable",
  }),
);
