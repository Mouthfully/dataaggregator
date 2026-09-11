#!/usr/bin/env node
/**
 * THE SUPERSEDED-CITATION GUARD.
 *
 * Issue #16, in its own words: "Every claim cites specification sections, and the changelog records
 * which sections override which. Nothing cross-checks the two. A guard that failed the build when a
 * claim cites a section the changelog marks as overridden would catch this class rather than this
 * instance."
 *
 * The class has already bitten twice. `positioning` carried the agency-and-brand message for four
 * rounds after 11A.1 moved the primary customer, corrected in #5. `connectors` cited 11.9 after
 * 11A.14 substituted the launch set, corrected in #14. Both were caught because a human happened to
 * read the citation, which is a habit rather than a mechanism.
 *
 * WHAT THE RECORD ACTUALLY LOOKS LIKE, because a regex written against an imagined shape is worse
 * than no guard at all. `docs/MARKETING-DATA-PLANE.md` states an override in exactly two places,
 * and today they agree:
 *
 *   11A.11 change-log row  `| 2026-09-08 | 11A.14 **Launch connector set substituted.** ...
 *                            Overrides 11.9 and 11A.6 on first connectors. ... |`
 *   11A.14 section body    `**This overrides 11.9 and 11A.6 on which connectors ship first.**`
 *
 * Both shapes are read and the union is used, so rewording one without the other cannot quietly
 * disarm this. The overriding section is the row's own entry number, or the nearest heading above
 * the prose. Finding NO record at all is itself a finding: a restructured document must not turn
 * this guard into a silent no-op.
 *
 * THE SCOPE IS THE HARD PART, AND IT IS WHY THIS GUARD IS PARTIAL ON PURPOSE.
 *
 * An override is not total. 11A.14 overrides 11.9 *on first connectors*; everything else 11.9
 * decided still binds, which is why `tagline`, `positioning` and `serp-bought` cite it correctly
 * today. A guard that failed on every citation of an overridden section would fire three times on
 * correct copy on its very first run, and a guard that fires on correct code gets switched off.
 *
 * So the rule has two tiers:
 *
 *   FAIL  the claim cites an overridden section AND the claim's own id shares a topic word with the
 *         override's recorded scope. `connectors` against "first connectors" is the historical bug.
 *   NOTE  the claim cites an overridden section outside that scope. Printed on every run, never
 *         enforced -- the honest half of a half-machine-readable record.
 *
 * The id, not the text, is matched against the scope. A claim id is a hand-chosen topic slug drawn
 * from a small controlled vocabulary; claim TEXT is marketing prose in which any word can appear for
 * rhetorical reasons, and matching scope words against prose is how a heuristic earns a reputation
 * for crying wolf. An override recorded with NO scope phrase is read as total and fails on every
 * citation, which is the correct reading of an unqualified "Overrides 11.9".
 *
 * WHAT WOULD MAKE THIS COMPLETE. The changelog states scope as English, so scope matching is
 * lexical and therefore a heuristic. One line of convention would close it: record the scope as
 * data, e.g. `Overrides 11.9, 11A.6 (claims: connectors)`, and the tier-2 notes become tier-1
 * failures with no guessing. Until then a claim whose id shares no word with the scope phrase is a
 * false negative -- under-firing, which is the direction a heuristic guard should fail in.
 *
 * Usage: node scripts/check-claim-sources.mjs [--warn]
 *        --warn  report findings without failing
 *
 * Escape hatch: a line carrying `claim-source-guard-ignore: <reason>` is skipped, on the citing
 * line or the one above it. The reason is mandatory; a bare pragma silences nothing.
 */

import { hasIgnorePragma, lineAt, parseArgs, positionAt, pragmaScope, readText, report } from "./lib/scan.mjs";

const SPEC_FILE = "docs/MARKETING-DATA-PLANE.md";
const CLAIMS_FILE = "packages/brand/src/claims.ts";

/** A specification section number: `0`, `4.2`, `11.9`, `11A.14`. */
const SECTION = String.raw`\d+[A-Za-z]?(?:\.\d+)*`;

/**
 * `overrides <sections> <scope>`, the sentence both record shapes are built from. `supersedes` is
 * accepted as a synonym so a future editor's vocabulary does not silently disarm the guard. A digit
 * must follow the verb, which is what keeps the blanket "These override earlier sections on the
 * same points" in 11A's preamble out: it names no section, so it records nothing checkable.
 */
const OVERRIDE_RE = new RegExp(
  String.raw`\b(?:overrid(?:es?|ing)|supersed(?:es?|ing))\s+` +
    String.raw`(§?\s*${SECTION}(?:\s*(?:,|and|&)\s*§?\s*${SECTION})*)` +
    String.raw`([^.|]*)`,
  "gi",
);

const HEADING_RE = new RegExp(String.raw`^#{2,6}\s+(?:§\s*)?(${SECTION})\b`);
const ENTRY_RE = new RegExp(String.raw`^(?:§\s*)?(${SECTION})\b`);
const SECTION_G = new RegExp(SECTION, "g");

/**
 * Words that carry no topic. Everything at or below two characters goes too, which removes `on`,
 * `it` and the `§` residue without listing them.
 */
const STOPWORDS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "and",
  "for",
  "with",
  "which",
  "what",
  "when",
  "from",
  "into",
  "onto",
  "are",
  "was",
  "were",
  "its",
  "their",
  "all",
  "any",
  "both",
  "same",
  "point",
  "points",
  "section",
  "sections",
  "entry",
  "above",
  "below",
  "earlier",
  "later",
  "still",
  "only",
  "also",
  "not",
]);

/** Crude plural fold. Only ever compared against itself, so being wrong is harmless if consistent. */
function stem(word) {
  return word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** The topic words of a phrase or a claim id: the vocabulary both sides of the scope test share. */
function topicTokens(phrase) {
  const words = phrase.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem));
}

/** Every section number inside a captured list, `11.9 and 11A.6` -> ["11.9", "11A.6"]. */
function sectionsIn(list) {
  SECTION_G.lastIndex = 0;
  return [...list.matchAll(SECTION_G)].map((m) => m[0]);
}

// ---------------------------------------------------------------------------------------------
// Reading the override records out of the specification
// ---------------------------------------------------------------------------------------------

/**
 * @returns {{records: Array<{overridden: string, by: string, scope: string, where: string}>,
 *            shapes: {row: number, prose: number}}}
 */
function overrideRecords(spec) {
  const records = [];
  const shapes = { row: 0, prose: 0 };
  const lines = spec.split("\n");
  let heading = null;

  for (const [index, line] of lines.entries()) {
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch !== null) heading = headingMatch[1];

    OVERRIDE_RE.lastIndex = 0;
    for (let m = OVERRIDE_RE.exec(line); m !== null; m = OVERRIDE_RE.exec(line)) {
      // A change-log row carries its own entry number in the last cell; prose inherits the nearest
      // heading. A record whose overriding section cannot be established is useless -- it could not
      // name the replacement in the failure message -- so it is dropped rather than half-reported.
      const isRow = line.trimStart().startsWith("|");
      let by = heading;
      if (isRow) {
        const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell.length > 0);
        const entry = cells.at(-1) ?? "";
        by = entry.match(ENTRY_RE)?.[1] ?? null;
      }
      if (by === null) continue;

      const scope = m[2].replace(/^\s*(?:on|for|as to|regarding)\s+/i, "").trim();
      for (const overridden of sectionsIn(m[1])) {
        if (overridden === by) continue; // a section cannot supersede itself
        records.push({
          overridden,
          by,
          scope,
          where: `${SPEC_FILE}:${index + 1}`,
        });
      }
      if (isRow) shapes.row += 1;
      else shapes.prose += 1;
    }
  }
  return { records, shapes };
}

// ---------------------------------------------------------------------------------------------
// Reading the citations out of the claims list
// ---------------------------------------------------------------------------------------------

/**
 * Every `{ id, ..., source: [...] }` in claims.ts, by text rather than by type. The brand package is
 * a leaf and this guard is dependency-free, so it reads the file the same way check-capabilities
 * reads the source mirror. Each claim's region runs from its `id:` to the next one, which keeps a
 * claim that grows a long body from borrowing the next claim's citation.
 *
 * @returns {Array<{id: string, sources: string[], index: number}>}
 */
function claimCitations(source) {
  const ids = [...source.matchAll(/\bid:\s*"([^"]+)"/g)];
  const claims = [];
  for (const [n, match] of ids.entries()) {
    const start = match.index;
    const end = n + 1 < ids.length ? ids[n + 1].index : source.length;
    const region = source.slice(start, end);
    const sourceList = region.match(/\bsource:\s*\[([^\]]*)\]/);
    if (sourceList === null) continue;
    claims.push({
      id: match[1],
      sources: [...sourceList[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]),
      index: start + region.indexOf(sourceList[0]),
    });
  }
  return claims;
}

// ---------------------------------------------------------------------------------------------

function main() {
  const { warn, unknown } = parseArgs(process.argv.slice(2));
  if (unknown.length > 0) {
    process.stderr.write(
      `check-claim-sources: unknown option ${unknown[0]}\n` +
        "Usage: node scripts/check-claim-sources.mjs [--warn]\n",
    );
    return 2;
  }

  const spec = readText(SPEC_FILE);
  const claimsSource = readText(CLAIMS_FILE);
  const { records, shapes } = overrideRecords(spec);
  const claims = claimCitations(claimsSource);
  const findings = [];
  const notes = [];

  // Both halves of the cross-check must be non-empty, or the guard is passing on an empty set. A
  // document restructure that hides every override record, or a claims file this scanner stops
  // understanding, has to read as a failure rather than as a clean run.
  if (records.length === 0) {
    findings.push({
      file: SPEC_FILE,
      line: 1,
      column: 1,
      message:
        "no override record could be parsed -- this guard cross-checks nothing until one is found. " +
        'Expected a sentence of the form "Overrides 11.9 and 11A.6 on first connectors."',
    });
  }
  if (claims.length === 0) {
    findings.push({
      file: CLAIMS_FILE,
      line: 1,
      column: 1,
      message: "no claim with a source citation could be parsed -- the CLAIMS shape has changed",
    });
  }

  /** overridden section -> the records that supersede it. */
  const byOverridden = new Map();
  for (const record of records) {
    const list = byOverridden.get(record.overridden) ?? [];
    list.push(record);
    byOverridden.set(record.overridden, list);
  }

  const outOfScope = [];
  for (const claim of claims) {
    const idTokens = topicTokens(claim.id);
    for (const cited of claim.sources) {
      for (const record of byOverridden.get(cited) ?? []) {
        const scopeTokens = topicTokens(record.scope);
        const shared = [...scopeTokens].filter((token) => idTokens.has(token));
        if (record.scope !== "" && shared.length === 0) {
          outOfScope.push(`${claim.id} cites ${cited} (${record.by} overrides it on "${record.scope}")`);
          continue;
        }
        if (hasIgnorePragma(pragmaScope(claimsSource, claim.index), "claim-source-guard")) continue;
        const { line, column } = positionAt(claimsSource, claim.index);
        findings.push({
          file: CLAIMS_FILE,
          line,
          column,
          message:
            `claim "${claim.id}" cites ${cited}, which §${record.by} overrides` +
            (record.scope === "" ? "" : ` on "${record.scope}"`) +
            ` (${record.where}). Cite ${record.by} instead, or correct the claim it supports.`,
          source: lineAt(claimsSource, claim.index),
        });
      }
    }
  }

  for (const [overridden, list] of [...byOverridden].sort()) {
    const by = [...new Set(list.map((r) => r.by))].join(", ");
    const scopes = [...new Set(list.map((r) => r.scope).filter(Boolean))];
    notes.push(
      `${overridden} is overridden by ${by}` +
        (scopes.length === 0 ? " (no scope recorded: read as total)" : ` on ${scopes.map((s) => `"${s}"`).join(" / ")}`),
    );
  }
  notes.push(
    `${records.length} override record${records.length === 1 ? "" : "s"} parsed from ${SPEC_FILE} ` +
      `(${shapes.row} change-log row${shapes.row === 1 ? "" : "s"}, ${shapes.prose} in section prose); ` +
      `${claims.length} claims carry citations`,
  );
  if (outOfScope.length > 0) {
    notes.push(
      "cited outside the recorded scope, reported and NOT enforced -- an override binds only what " +
        `it says it binds: ${outOfScope.sort().join("; ")}`,
    );
  }

  findings.sort((a, b) => a.line - b.line || a.column - b.column);

  return report({
    name: "superseded-citation guard",
    findings,
    notes,
    warn,
    summary: "no claim cites a section the changelog supersedes within the scope of the override",
  });
}

process.exit(main());
