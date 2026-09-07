/**
 * Shared plumbing for the two repository guards, `check-brand.mjs` and `check-tokens.mjs`.
 *
 * It exists for one reason: both guards must agree on WHICH FILES THE REPOSITORY CONSISTS OF.
 * If that answer drifts between them, one guard silently stops looking at a directory the other
 * still checks, and nobody notices. It is defined once, here.
 *
 * File list: `git ls-files --cached --others --exclude-standard`, i.e. tracked files plus
 * untracked files that .gitignore does not cover. That deliberately includes files not yet
 * committed -- the guards run before a commit exists -- and deliberately excludes everything
 * .gitignore already excludes (node_modules, .next, .wrangler, dist, coverage, *.tsbuildinfo,
 * next-env.d.ts). A filesystem walk is the fallback when git is unavailable.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Directories never scanned, whatever git says. Mirrors .gitignore plus the git dir itself. */
const PRUNED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".wrangler",
  ".vercel",
  ".turbo",
  "dist",
  "coverage",
]);

/** Generated or vendored files: machine-written, so a guard finding in one is not actionable. */
const SKIP_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "next-env.d.ts",
]);

const SKIP_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "icns",
  "bmp",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "br",
  "wasm",
  "node",
  "mp4",
  "webm",
  "mp3",
  "wav",
  "mov",
  "tsbuildinfo",
]);

/** Above this, it is generated output or a data dump, not source anybody hand-edits. */
const MAX_BYTES = 2_000_000;

function gitFiles() {
  const out = execFileSync(
    "git",
    ["-C", repoRoot, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\0").filter(Boolean);
}

function walk(dir, prefix, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (PRUNED_DIRS.has(entry.name)) continue;
      walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`, acc);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      acc.push(`${prefix}${entry.name}`);
    }
  }
  return acc;
}

function isBinary(absolute) {
  try {
    return readFileSync(absolute).subarray(0, 8192).includes(0);
  } catch {
    return true;
  }
}

/**
 * Every repo-relative path a guard should look at, POSIX separators, sorted.
 * @returns {string[]}
 */
export function listFiles() {
  let candidates;
  try {
    candidates = gitFiles();
  } catch {
    candidates = walk(repoRoot, "", []);
  }

  const seen = new Set();
  const files = [];
  for (const rel of candidates) {
    if (seen.has(rel)) continue;
    seen.add(rel);

    const parts = rel.split("/");
    if (parts.some((p) => PRUNED_DIRS.has(p))) continue;

    const base = parts[parts.length - 1];
    if (SKIP_FILES.has(base)) continue;

    const dot = base.lastIndexOf(".");
    if (dot > 0 && SKIP_EXTENSIONS.has(base.slice(dot + 1).toLowerCase())) continue;

    const absolute = `${repoRoot}/${rel}`;
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      continue; // deleted between listing and stat
    }
    if (!stat.isFile() || stat.size > MAX_BYTES || stat.size === 0) continue;
    if (isBinary(absolute)) continue;

    files.push(rel);
  }
  return files.sort();
}

/** @param {string} rel */
export function readText(rel) {
  return readFileSync(`${repoRoot}/${rel}`, "utf8");
}

/**
 * Minimal glob: `**` crosses directory separators, `*` does not. Enough for the allowlists,
 * and small enough to read in one sitting.
 * @param {string} pattern
 */
export function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i += 1;
        if (pattern[i + 1] === "/") {
          i += 1;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** @param {string} rel @param {string[]} patterns */
export function matchesAny(rel, patterns) {
  return patterns.some((p) => globToRegExp(p).test(rel));
}

/** Offset -> {line, column}, both 1-based, for a file's text. */
export function positionAt(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1, lineStart };
}

/** The full source line containing `index`, trimmed to something printable. */
export function lineAt(text, index) {
  const start = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  let end = text.indexOf("\n", index);
  if (end === -1) end = text.length;
  const line = text.slice(start, end).trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

/**
 * Escape hatch. A line carrying `<tag>-ignore: <reason>` is skipped by that guard.
 * The reason is mandatory -- a bare pragma does not silence anything.
 * @param {string} line @param {string} tag
 */
export function hasIgnorePragma(line, tag) {
  return new RegExp(`${tag}-ignore:\\s*\\S`).test(line);
}

/**
 * The text a pragma may live in: the offending line, plus the line above it.
 *
 * Same-line-only was the original rule and it is a trap. A formatter can wrap a long line and
 * silently detach the pragma from what it excused, and a trailing pragma on an already-long
 * assertion is unreadable anyway, so everyone writes it on the line above by instinct. Accepting
 * both is the ergonomics every linter converged on.
 */
export function pragmaScope(text, index) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const prevStart = lineStart === 0 ? 0 : text.lastIndexOf("\n", lineStart - 2) + 1;
  let end = text.indexOf("\n", index);
  if (end === -1) end = text.length;
  return text.slice(prevStart, end);
}

/** Replace a span with spaces, preserving every byte offset and newline. */
export function maskSpan(text, start, end) {
  const span = text.slice(start, end).replace(/[^\n]/g, " ");
  return text.slice(0, start) + span + text.slice(end);
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const warn = argv.includes("--warn");
  const unknown = argv.filter((a) => a.startsWith("-") && a !== "--warn");
  return { warn, unknown };
}

/**
 * Print a guard's result and return the process exit code.
 * @param {{name: string, findings: Array<{file: string, line: number, column: number, message: string, source?: string}>, notes?: string[], warn: boolean, summary?: string}} args
 */
export function report({ name, findings, notes = [], warn, summary }) {
  const out = [];
  out.push(`${name}${warn ? " (warn mode)" : ""}`);
  for (const note of notes) out.push(`  note: ${note}`);

  if (findings.length === 0) {
    out.push(`  PASS${summary ? ` -- ${summary}` : ""}`);
    process.stdout.write(`${out.join("\n")}\n`);
    return 0;
  }

  out.push("");
  for (const f of findings) {
    out.push(`  ${f.file}:${f.line}:${f.column}  ${f.message}`);
    if (f.source) out.push(`      ${f.source}`);
  }
  out.push("");
  const verb = warn ? "would fail" : "FAIL";
  out.push(`  ${verb}: ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
  if (warn) {
    out.push(
      "  warn mode: reported, not enforced. Remove --warn in .github/workflows/ci.yml to enforce.",
    );
  }
  process.stdout.write(`${out.join("\n")}\n`);
  return warn ? 0 : 1;
}
