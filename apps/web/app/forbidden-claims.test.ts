import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_CLAIMS } from "@repo/brand";
import { describe, expect, it } from "vitest";

/**
 * THE BAN LIST, APPLIED TO EVERY ROUTE INSTEAD OF ONE.
 *
 * `page.test.tsx` renders the homepage and asserts it matches no `FORBIDDEN_CLAIMS` pattern. That
 * is a real guard and it covers exactly one of this app's routes. `/privacy`, `/terms`, `/pricing`,
 * `/integrations`, `/docs`, `/connectors/*` and `/dashboard` were never checked at all -- and the
 * legal pages are precisely where a compliance claim would be written, because that is where a
 * reader goes looking for one.
 *
 * Rendering every route in a test is not the way to close that: several are server components that
 * read a session, a plan or a database, so the test would be asserting a fixture rather than the
 * copy. This scans the SOURCE instead, which reaches every route including the ones that cannot be
 * rendered here, at the cost of also seeing strings that never render. That trade is right for a
 * BAN LIST specifically: a forbidden phrase sitting in a source file unrendered is a phrase one
 * edit away from rendering.
 *
 * TWO THINGS ARE STRIPPED BEFORE SCANNING, and each is a deliberate hole rather than an oversight:
 *
 *   COMMENTS. This repository explains its bans in prose next to the code they bind -- `FaqCta.tsx`
 *   carries a comment about the pricing claims it must not restate -- so scanning comments would
 *   fire on the explanation of the rule. A comment renders nothing.
 *
 *   NOTHING ELSE. In particular `\\uXXXX` escapes are DECODED rather than skipped: a string written
 *   as "SOC\\u00A02" is "SOC 2" on the page and must not be a way through. The same trick would work
 *   on any of these patterns, and this file already writes a baht sign that way.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Source that renders. Tests render nothing and quote the copy they assert on, which is their job. */
const SCANNED = /\.(tsx?|jsx?)$/;
const SKIPPED = /\.(test|spec)\.[tj]sx?$/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (SCANNED.test(entry) && !SKIPPED.test(entry)) out.push(path);
  }
  return out;
}

/** Blank comments out, preserving line count so a finding still reports the right line. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_m, lead) => lead);
}

/** "SOC 2" is "SOC 2" on the page. Decode before matching, or the escape is the way round. */
function decodeEscapes(source: string): string {
  return source.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

const FILES = sourceFiles(HERE);

describe("no route carries a forbidden claim", () => {
  it("finds files to scan, so a green run is not vacuous", () => {
    // If the walk ever returns nothing -- a moved directory, a changed extension -- this file would
    // otherwise pass by having nothing to do, which is the quietest way a guard dies.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN_CLAIMS.map((f) => [f.pattern.source, f] as const))(
    "no source under app/ matches %s",
    (_source, forbidden) => {
      const hits: string[] = [];
      for (const file of FILES) {
        const text = decodeEscapes(stripComments(readFileSync(file, "utf8")));
        for (const [index, line] of text.split("\n").entries()) {
          // A fresh lastIndex per line: several of these patterns are alternations and one of them
          // could carry /g through a future edit.
          if (new RegExp(forbidden.pattern.source, forbidden.pattern.flags).test(line)) {
            hits.push(`${file.slice(HERE.length + 1)}:${index + 1}: ${line.trim().slice(0, 120)}`);
          }
        }
      }
      expect(hits, forbidden.reason).toEqual([]);
    },
  );
});
