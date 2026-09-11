#!/usr/bin/env node
/**
 * THE INLINE-COPY GUARD.
 *
 * `claim()` and `optionalClaim()` throw on an unknown or withheld id, so nothing can reach the page
 * THROUGH THEM that is not in `packages/brand/src/claims.ts` with a specification citation behind
 * it. Nothing stops a sentence going ROUND them. Typed straight into the JSX it renders exactly
 * like an approved one, satisfies `page.test.tsx` (which asserts that every claim the page declares
 * it uses appears, never that everything appearing is a claim), and ships an unreviewed promise.
 * `apps/web/app/page.tsx` states the property in its own module comment -- "EVERY SENTENCE HERE
 * COMES FROM the strict or optional claim resolver" -- and until now that was a convention.
 *
 * THE HARD PROBLEM HERE IS FALSE POSITIVES, not coverage. The page legitimately carries prose that
 * is not a claim: headings, button labels, the spine's step names, a field note in a definition
 * list. A guard that fires on those gets switched off, and a switched-off guard protects nothing --
 * strictly worse than never writing it. So the rule is deliberately narrow, and every widening of
 * it has to be paid for with evidence rather than with an allowlist.
 *
 * THE RULE. A candidate string fails when BOTH hold:
 *
 *   1. it ends in sentence-terminal punctuation (`.`, `!`, `?`), or contains an internal sentence
 *      break (terminal punctuation followed by a capital); and
 *   2. it carries at least 5 words.
 *
 * WHY THOSE TWO, AND WHY 5. Measured against the tree rather than guessed. Every one of the 28
 * entries in `CLAIMS` is a full sentence ending in a full stop. Not one of the eight structural
 * strings the page renders ends in any terminal punctuation -- "Every row says what it knows about
 * itself" (8 words) and "Your credentials, your data, your tenant" (6 words) are the longest, and
 * both are headings. Terminal punctuation alone separates the two sets cleanly on today's corpus,
 * so it is the primary signal and the word count is a floor under it, there to keep fragments like
 * "Yes.", "Coming soon." or a stray "e.g." out.
 *
 * The floor is 5 because the SHORTEST APPROVED CLAIM IS 5 WORDS -- the tagline, "Know what changed.
 * And why." A floor above the shortest thing the repository already treats as a claim would be
 * blind to a hand-typed copy of it, which is precisely the failure being prevented. 5 is read off
 * the claims list, not rounded to.
 *
 * WHAT IS LOOKED AT: prose the JSX renders. Three positions, because those are the three ways a
 * sentence reaches a reader from a `.tsx` file:
 *
 *   1. a JSX text node                   `<p>A sentence typed here.</p>`
 *   2. a literal in a JSX child slot     `<p>{"A sentence typed here."}</p>`
 *   3. a human-visible JSX attribute     `<img alt="A sentence typed here." />`
 *
 * WHAT IS NOT, and each of these is a decision rather than an oversight:
 *
 *   * `*.test.tsx` -- a test file renders nothing to a customer, and quoting the copy it asserts on
 *     is the whole job. Excluded by name, not by allowlist entry.
 *   * `className`, `href`, `key` and every other machine-facing attribute: not prose, never read.
 *   * A string outside the JSX -- `export const metadata` in `layout.tsx` is the live example.
 *     Head metadata IS customer-visible, in a search result, and it has no `claim()` resolver
 *     behind it today. Extending this guard there without that resolver would report a finding
 *     with no honest fix, so it stays out of territory and goes in the design note instead.
 *   * A sentence assembled from fragments or built by concatenation. A guard that reads source text
 *     cannot follow a value; under-firing is the direction a heuristic must fail in.
 *
 * Usage: node scripts/check-copy.mjs [--warn]
 *        --warn  report findings without failing
 *
 * Escape hatch: a line carrying `copy-guard-ignore: <reason>` is skipped, on the offending line or
 * the one above it. The reason is mandatory; a bare pragma silences nothing. Reach for it when a
 * sentence really is structural -- an error string a developer sees, say -- never to publish copy.
 */

import {
  hasIgnorePragma,
  lineAt,
  listFiles,
  matchesAny,
  parseArgs,
  positionAt,
  pragmaScope,
  readText,
  report,
} from "./lib/scan.mjs";

/** The rendered marketing surface. Nothing else in the repository renders prose to a customer. */
const INCLUDE = ["apps/web/app/**/*.tsx", "apps/web/app/**/*.jsx"];
const EXCLUDE = ["**/*.test.tsx", "**/*.test.jsx", "**/*.spec.tsx", "**/*.spec.jsx"];

/** The shortest sentence in CLAIMS is the tagline at 5 words. See the header. */
const MIN_WORDS = 5;

/** Attributes a reader or a screen reader actually hears. Everything else is machine-facing. */
const VISIBLE_ATTRIBUTES = new Set([
  "alt",
  "title",
  "placeholder",
  "label",
  "summary",
  "content",
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-placeholder",
  "aria-valuetext",
]);

/** The resolvers. A literal in first-argument position here is a claim id, never copy. */
const RESOLVER_RE = /\b(?:optionalClaim|claim)\s*\(\s*/g;

const ENTITIES = new Map([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&apos;", "'"],
  ["&#x27;", "'"],
  ["&#39;", "'"],
  ["&nbsp;", " "],
  ["&mdash;", "-"],
  ["&ndash;", "-"],
]);

const WORD_RE = /[A-Za-zÀ-ɏ]+(?:['’-][A-Za-zÀ-ɏ]+)*/g;

// ---------------------------------------------------------------------------------------------
// Reading the file as JSX without parsing it
// ---------------------------------------------------------------------------------------------

/**
 * Comments blanked, byte offsets and newlines preserved, so a sentence in `{/* ... *\/}` -- which is
 * how page.tsx carries most of its reasoning -- can never be mistaken for a text node.
 */
function maskComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])(\/\/[^\n]*)/g, (_m, lead, body) => lead + body.replace(/./g, " "));
}

/** `=>`, `->`, `>>` and `>=` are operators; only a bare `>` closes a tag. */
function isTagClose(code, i) {
  const prev = code[i - 1];
  const next = code[i + 1];
  return prev !== "=" && prev !== "-" && prev !== ">" && next !== "=" && next !== ">";
}

/** `<=` and `<<` are operators; only a bare `<` opens a tag. */
function isTagOpen(code, i) {
  return code[i - 1] !== "<" && code[i + 1] !== "=" && code[i + 1] !== "<";
}

/**
 * The construct immediately enclosing `index`, found by walking backwards to the first unmatched
 * delimiter. This is the whole of the JSX model here, and it is enough:
 *
 *   `jsx-text`  the first thing behind us is a tag close, so we are between `>` and the next `<`:
 *               children. That is where a text node lives.
 *   `brace`     an unmatched `{`: an expression container or an object literal. Ask again from the
 *               brace to learn which -- a `{` whose own context is `jsx-text` is a child slot.
 *   `tag`       an unmatched `<`: we are inside a start tag, so this is an attribute.
 *   `top`       module scope.
 *
 * Braces are counted, so an expression container between two text nodes does not hide the tag close
 * behind it. A `<` inside a ternary in a child slot ends the walk early and costs a text node --
 * a false negative, which is the direction this guard is built to fail in.
 *
 * @returns {{kind: "jsx-text"|"brace"|"tag"|"top", at: number}}
 */
function enclosing(code, index) {
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const c = code[i];
    if (c === "}") {
      depth += 1;
    } else if (c === "{") {
      if (depth === 0) return { kind: "brace", at: i };
      depth -= 1;
    } else if (depth === 0) {
      if (c === ">" && isTagClose(code, i)) return { kind: "jsx-text", at: i };
      if (c === "<" && isTagOpen(code, i)) return { kind: "tag", at: i };
    }
  }
  return { kind: "top", at: -1 };
}

/** A string or template literal starting at `start`, or null if it is not one after all. */
function readLiteral(text, start) {
  const quote = text[start];
  let value = "";
  for (let i = start + 1; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\\") {
      value += text[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (c === quote) return { start, end: i + 1, value, quote };
    // An unterminated `'` or `"` was never a delimiter: it is an apostrophe or an inch mark in
    // prose. Bailing here is what keeps "Don't ship this." from being read as a string.
    if (c === "\n" && quote !== "`") return null;
    value += c;
  }
  return null;
}

/**
 * One pass over a file, producing the two things the rule needs: a structural mask in which string
 * contents cannot pretend to be tags, and every string literal with where it sits.
 *
 * A quote encountered in `jsx-text` context is left as an ordinary character, because in rendered
 * text that is exactly what it is. That decision has to be made during the walk, which is why this
 * is one pass and not a regex.
 */
function scan(text) {
  const masked = maskComments(text);
  const code = [];
  const literals = [];
  let i = 0;
  while (i < masked.length) {
    const c = masked[i];
    if ((c === '"' || c === "'" || c === "`") && enclosing(code, code.length).kind !== "jsx-text") {
      const literal = readLiteral(masked, i);
      if (literal !== null) {
        literals.push(literal);
        for (let k = i; k < literal.end; k += 1) {
          code.push(k === i || k === literal.end - 1 ? masked[k] : masked[k] === "\n" ? "\n" : " ");
        }
        i = literal.end;
        continue;
      }
    }
    code.push(c);
    i += 1;
  }
  return { masked, code, literals };
}

// ---------------------------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------------------------

function decode(raw) {
  return raw
    .replace(/\$\{[^}]*\}/g, " ") // an interpolated value is not copy anybody wrote
    .replace(/&#?[a-zA-Z0-9]+;/g, (entity) => ENTITIES.get(entity.toLowerCase()) ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @returns {{words: number, value: string}|null} */
function claimShape(raw) {
  const value = decode(raw);
  const words = value.match(WORD_RE) ?? [];
  if (words.length < MIN_WORDS) return null;
  const ends = /[.!?][)"'’”\]]*$/.test(value);
  const breaks = /[.!?]["'’”)\]]?\s+["'“(]?[A-Z]/.test(value);
  return ends || breaks ? { words: words.length, value } : null;
}

// ---------------------------------------------------------------------------------------------

function candidates(text) {
  const { code, literals } = scan(text);
  const found = [];

  // 1. Text nodes. Every run between structural delimiters whose context is JSX children. The run
  //    is read out of the MASK, not the source, so a masked comment inside one contributes nothing.
  let run = 0;
  for (let i = 0; i <= code.length; i += 1) {
    const c = code[i];
    const boundary = i === code.length || c === "<" || c === ">" || c === "{" || c === "}";
    if (!boundary) continue;
    if (i > run && enclosing(code, run).kind === "jsx-text") {
      // A text node starts at the `>` that closed the tag, which is usually the end of the line
      // above it. Report -- and look for the pragma -- at the first printable character instead,
      // so the finding names the line a reader would point at.
      const raw = code.slice(run, i).join("");
      found.push({ start: run + (raw.length - raw.trimStart().length), raw, what: "JSX text" });
    }
    run = i + 1;
  }

  // 2 and 3. String literals, kept only where a reader would see them.
  const resolverArguments = new Set();
  const flat = code.join("");
  RESOLVER_RE.lastIndex = 0;
  for (let m = RESOLVER_RE.exec(flat); m !== null; m = RESOLVER_RE.exec(flat)) {
    resolverArguments.add(m.index + m[0].length);
  }

  for (const literal of literals) {
    if (resolverArguments.has(literal.start)) continue; // a claim id, resolved rather than written
    const context = enclosing(code, literal.start);
    if (context.kind === "brace") {
      if (enclosing(code, context.at).kind !== "jsx-text") continue;
      found.push({ start: literal.start, raw: literal.value, what: "JSX child literal" });
    } else if (context.kind === "tag") {
      const attribute = flat.slice(Math.max(0, literal.start - 40), literal.start).match(/([A-Za-z-]+)\s*=\s*\{?\s*$/);
      if (attribute === null || !VISIBLE_ATTRIBUTES.has(attribute[1].toLowerCase())) continue;
      found.push({ start: literal.start, raw: literal.value, what: `${attribute[1]} attribute` });
    }
  }

  return found;
}

function main() {
  const { warn, unknown } = parseArgs(process.argv.slice(2));
  if (unknown.length > 0) {
    process.stderr.write(
      `check-copy: unknown option ${unknown[0]}\nUsage: node scripts/check-copy.mjs [--warn]\n`,
    );
    return 2;
  }

  const files = listFiles().filter((rel) => matchesAny(rel, INCLUDE) && !matchesAny(rel, EXCLUDE));
  const findings = [];

  // Zero files is not a clean run, it is a guard that stopped looking. The marketing page moving to
  // another directory must fail here rather than pass silently.
  if (files.length === 0) {
    findings.push({
      file: INCLUDE[0],
      line: 1,
      column: 1,
      message: "no rendered .tsx file matched -- this guard is checking nothing",
    });
  }

  for (const rel of files) {
    const text = readText(rel);
    for (const candidate of candidates(text)) {
      const shape = claimShape(candidate.raw);
      if (shape === null) continue;
      if (hasIgnorePragma(pragmaScope(text, candidate.start), "copy-guard")) continue;
      const { line, column } = positionAt(text, candidate.start);
      findings.push({
        file: rel,
        line,
        column,
        message:
          `${candidate.what} is a ${shape.words}-word sentence written into the page: ` +
          `"${shape.value.length > 80 ? `${shape.value.slice(0, 77)}...` : shape.value}" -- ` +
          "a promise reaches the site through claim() or optionalClaim(), so add it to CLAIMS in " +
          "packages/brand/src/claims.ts with its specification citation and resolve it by id",
        source: lineAt(text, candidate.start),
      });
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

  return report({
    name: "inline-copy guard",
    findings,
    notes: [
      `${files.length} rendered file${files.length === 1 ? "" : "s"} scanned: ${files.join(", ") || "none"}`,
      `a JSX text node, child literal or visible attribute fails when it ends a sentence AND carries ${MIN_WORDS}+ words -- the length of the shortest claim in CLAIMS`,
    ],
    warn,
    summary: "no sentence reaches the page except through claim() or optionalClaim()",
  });
}

process.exit(main());
