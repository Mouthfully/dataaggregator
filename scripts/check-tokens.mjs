#!/usr/bin/env node
/**
 * THE HEX GUARD.
 *
 * Kickoff non-negotiable 2: every colour comes from the tokens stylesheet. This bans the
 * notations a colour can be written in -- #hex, rgb(), rgba(), hsl(), oklch() -- everywhere
 * except the one file that is allowed to hold literal colour values:
 *
 *     packages/tokens/src/tokens.css
 *
 * (00-repo-map.md section 1 records why that path, not the brief's literal src/styles/tokens.css.)
 *
 * hsla() and oklab() are banned alongside the five the brief names: they are the same notations
 * with an alpha channel and a different colour space, and leaving them out would leave the rule
 * trivially evadable. color-mix() is deliberately NOT banned -- it composes existing tokens
 * rather than introducing a literal, and Tailwind v4 emits it.
 *
 * Exempt:
 *   design/**                     the source artboard: ~110 KB of hard-coded hexes that must
 *                                 never be edited, only read
 *   docs/**                       prose about colours, including the palette tables in
 *                                 00-repo-map.md section 3
 *   packages/tokens/src/tokens.css the one source of truth
 *   node_modules, .next, .wrangler, dist, coverage, lockfiles, binaries -- see lib/scan.mjs
 *
 * False positives a naive `#[0-9a-f]{6}` would produce, and what stops each here:
 *   `## Heading`, `### x`        a `#` preceded by `#` is skipped
 *   `&#x1F600;`                  a `#` preceded by `&` is skipped
 *   `vercel/next.js#67372`       a `#` preceded by an alphanumeric is skipped (issue refs)
 *   `https://x.dev/p#abcdef`     a `#` inside a URL token is skipped (fragments)
 *   `#12345`, `#1234567`         only 3, 4, 6 and 8 hex digits are colours
 *   `Closes #1234`, `PR #123456` an all-digit match is a colour only in a value position, i.e.
 *                                after `:`, `,`, `=`, `(`, `[` or a quote. `#abc` and `#f4f6fa`
 *                                contain letters and are always treated as colours.
 *
 * Usage: node scripts/check-tokens.mjs [--warn]
 *        --warn  report findings without failing (what CI runs today)
 *
 * Escape hatch: a line carrying `tokens-guard-ignore: <reason>` is skipped. The reason is
 * mandatory; a bare pragma silences nothing.
 */

import {
  hasIgnorePragma,
  lineAt,
  pragmaScope,
  listFiles,
  matchesAny,
  parseArgs,
  positionAt,
  readText,
  report,
} from "./lib/scan.mjs";

const TOKENS_FILE = "packages/tokens/src/tokens.css";

// Prose is exempt; anything that renders or deploys is not. Same rule as the brand guard, and
// README.md is on this list for the same reason it is on that one: a README that cannot quote
// `rgb()` while documenting the ban on `rgb()` is not a README. design/** is the source artboard,
// 110 KB of hard-coded colour that must never be edited.
const EXEMPT = [
  "design/**",
  "docs/**",
  "README.md",
  "**/README.md",
  TOKENS_FILE,
  "scripts/check-tokens.mjs",
];

/** 3, 4, 6 or 8 hex digits, and nothing longer masquerading as one. */
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

const FUNCTION_RE = /\b(rgba?|hsla?|oklch|oklab)\s*\(/gi;

/** Characters a colour literal can legitimately follow: a value position. */
const VALUE_POSITION = /[:,=([`"']/;

/**
 * `#` after a word character, another `#`, or `&` is a fragment, an anchor or an entity;
 * an all-digit match outside a value position is an issue or PR reference.
 */
function isColourContext(text, index, match) {
  const before = index > 0 ? text[index - 1] : "";
  if (before && /[A-Za-z0-9#&_]/.test(before)) return false;

  // A URL fragment: the `#` sits inside a whitespace-delimited token containing a scheme.
  let start = index;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  if (text.slice(start, index).includes("://")) return false;

  if (/^#\d+$/.test(match)) {
    let back = index - 1;
    while (back >= 0 && /[ \t]/.test(text[back])) back -= 1;
    if (back < 0 || !VALUE_POSITION.test(text[back])) return false;
  }

  return true;
}

function main() {
  const { warn, unknown } = parseArgs(process.argv.slice(2));
  if (unknown.length > 0) {
    process.stderr.write(
      `check-tokens: unknown option ${unknown[0]}\nUsage: node scripts/check-tokens.mjs [--warn]\n`,
    );
    return 2;
  }

  const findings = [];
  let scanned = 0;

  for (const rel of listFiles()) {
    if (matchesAny(rel, EXEMPT)) continue;
    scanned += 1;
    const text = readText(rel);

    const push = (start, message) => {
      const source = lineAt(text, start);
      if (hasIgnorePragma(pragmaScope(text, start), "tokens-guard")) return;
      const { line, column } = positionAt(text, start);
      findings.push({ file: rel, line, column, message, source });
    };

    HEX_RE.lastIndex = 0;
    for (let m = HEX_RE.exec(text); m !== null; m = HEX_RE.exec(text)) {
      if (!isColourContext(text, m.index, m[0])) continue;
      push(m.index, `hard-coded colour "${m[0]}" -- every colour comes from ${TOKENS_FILE}`);
    }

    FUNCTION_RE.lastIndex = 0;
    for (let m = FUNCTION_RE.exec(text); m !== null; m = FUNCTION_RE.exec(text)) {
      push(m.index, `hard-coded colour "${m[1]}()" -- every colour comes from ${TOKENS_FILE}`);
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

  return report({
    name: "tokens guard",
    findings,
    warn,
    summary: `${scanned} files scanned, ${TOKENS_FILE} is the only place a colour literal may live`,
  });
}

process.exit(main());
