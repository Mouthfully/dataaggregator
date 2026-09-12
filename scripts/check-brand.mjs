#!/usr/bin/env node
/**
 * THE BRAND GUARD.
 *
 * Kickoff non-negotiable 1: every brand string comes from the brand file, and "no string that
 * identifies the company appears anywhere else".
 *
 * Taken literally that is unsatisfiable, and 00-repo-map.md section 1 records why: wrangler
 * requires a Worker `name`, wrangler routes carry the domain in `routes[].pattern`,
 * supabase/config.toml requires a `project_id`, and every workspace package.json requires a
 * `name`. None of those can read a TypeScript module at config-parse time.
 *
 * So the rule is MATCH-TEST PLUS ALLOWLIST:
 *
 *   1. For each allowlisted infrastructure file, the literal is not banned -- it is ASSERTED
 *      EQUAL to the corresponding value in the brand file. Drift between infrastructure and the
 *      brand file is the actual failure this guard exists to catch.
 *   2. Everywhere outside the allowlist, the identifying strings are banned outright.
 *
 * Allowlist (00-repo-map.md sections 1 and 8):
 *   apps/<app>/wrangler.jsonc   `name`, `routes[].pattern`, `route`   -> match-tested
 *   supabase/config.toml        `project_id`                          -> match-tested
 *   any package.json            top-level `name`                      -> match-tested
 *   docs/**, design/**                                                -> exempt entirely
 *   packages/brand/**                                                 -> the source of truth
 *
 * Everything else in those same files -- a description, a homepage, a comment -- is still
 * ban-scanned. Only the named field is allowlisted, never the whole file.
 *
 * THE BRAND FILE DOES NOT EXIST YET (it lands with packages/brand, blocked on founder decisions
 * 1 and 2). When it is absent this guard prints "brand file not present yet, skipping" and exits
 * 0, so it does not break CI today, and it starts enforcing the moment the file lands.
 *
 * Usage: node scripts/check-brand.mjs [--warn]
 *        --warn  report findings without failing (what CI runs today)
 *
 * Escape hatch: a line carrying `brand-guard-ignore: <reason>` is skipped. The reason is
 * mandatory; a bare pragma silences nothing.
 */

import { existsSync } from "node:fs";
import {
  hasIgnorePragma,
  lineAt,
  pragmaScope,
  listFiles,
  maskSpan,
  matchesAny,
  parseArgs,
  positionAt,
  readText,
  repoRoot,
  report,
} from "./lib/scan.mjs";

const BRAND_FILE = "packages/brand/src/brand.ts";

/** Ban-scanned never. */
// Prose written for humans is exempt; code is not. A README that cannot name the product is not
// a README, and docs/ and design/ are the record of how the product got its name in the first
// place. The rule the guard actually enforces is that nothing which RENDERS or DEPLOYS carries an
// identity string of its own -- pages, emails, invoices, worker config, package names.
const EXEMPT = [
  "docs/**",
  "design/**",
  "README.md",
  "packages/brand/**",
  "scripts/check-brand.mjs",
  // THE WORDMARK ARTWORK. The logo is the product name, drawn -- an SVG whose paths spell it and
  // whose <title> and element ids name it. That is not a second home for the string in the sense
  // this guard polices; it is the artwork the brand file POINTS AT, via brand.logoPath. The guard's
  // own rule is that nothing which renders or deploys carries an identity string "of its own", and
  // this file carries the brand file's.
  //
  // Narrow deliberately: one directory, image assets only. Any .ts/.tsx/.css that ever appears
  // there is still scanned, and an .svg anywhere else is too.
  "apps/web/public/brand/*.svg",
];

/**
 * Keys in brand.ts whose values identify the company or the product. Normalised to lowercase
 * alphanumerics before lookup, so `productName`, `product_name` and `"product-name"` all hit.
 *
 * If the brand file ships a key this list does not know, its value is NOT banned anywhere --
 * so the guard prints every value it resolved. If an identity value is missing from that
 * printout, add its key here.
 */
const IDENTITY_KEYS = new Set([
  // product and brand identity
  "productname",
  "product",
  "brandname",
  "wordmark",
  "shortname",
  "displayname",
  "appname",
  "sitename",
  "slug",
  // legal entity
  "legalname",
  "legalentity",
  "entityname",
  "companyname",
  "entity",
  "responsibleparty",
  "registeredaddress",
  "postaladdress",
  "address",
  "companyregistration",
  "registrationnumber",
  "companynumber",
  "taxid",
  "vat",
  "vatnumber",
  // network identity
  "domain",
  "apexdomain",
  "rootdomain",
  "primarydomain",
  "sitedomain",
  "apidomain",
  "apihost",
  "host",
  "hostname",
  "url",
  "baseurl",
  "apibaseurl",
  "siteurl",
  "appurl",
  "docsurl",
  "marketingurl",
  "website",
  "websiteurl",
  // contact
  "email",
  "supportemail",
  "legalemail",
  "privacyemail",
  "contactemail",
  "securityemail",
  "abuseemail",
  "billingemail",
  "dpoemail",
  // infrastructure naming, if the brand file chooses to own it
  "workernameprefix",
  "supabaseprojectid",
  "infraprefix",
]);

/** Keys that hold prose, never an identifier. Marketing copy must not become a banned token. */
const PROSE_KEY_MARKERS = [
  "claim",
  "copy",
  "tagline",
  "headline",
  "description",
  "note",
  "todo",
  "font",
  "color",
  "colour",
  "token",
  "label",
  "placeholder",
  "reason",
  "status",
];

/** Values that identify nothing on their own, whatever key they arrive under. */
const GENERIC_VALUES = new Set([
  "null",
  "none",
  "unset",
  "tbd",
  "todo",
  "unknown",
  "undefined",
  "true",
  "false",
  "repo",
  "root",
  "main",
  "workspace",
  "monorepo",
  "package",
  "packages",
  "api",
  "apiedge",
  "api-edge",
  "web",
  "edge",
  "app",
  "apps",
  "site",
  "docs",
  "design",
  "brand",
  "tokens",
  "next",
  "node",
  "react",
  "http",
  "https",
  "mail",
  "help",
  "support",
  "company",
  "limited",
  "ltd",
  "inc",
  "corp",
  "llc",
  "gmbh",
  "sarl",
  "holding",
  "group",
  "com",
  "net",
  "org",
  "dev",
  "io",
  "ai",
  "co",
  "sh",
  "test",
  "example",
  "localhost",
]);

/** Subdomains stripped before deriving a registrable label. */
const SUBDOMAIN_LABELS = new Set([
  "api",
  "www",
  "app",
  "help",
  "docs",
  "mail",
  "cdn",
  "static",
  "dashboard",
  "auth",
  "status",
  "blog",
  "admin",
  "id",
  "go",
]);

/** Second-level labels that are part of the public suffix, not the registrable name. */
const PUBLIC_SUFFIX_SLD = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "or", "ne"]);

// ---------------------------------------------------------------------------------------------
// Reading the brand file
// ---------------------------------------------------------------------------------------------

/** Blank out comments so a commented-out value is never treated as live. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_m, lead) => lead);
}

function unquote(literal) {
  const body = literal.slice(1, -1);
  return body.replace(/\\(["'`\\nrt])/g, (_m, c) =>
    c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
  );
}

const ENTRY_RE =
  /(?:^|[\s{,;(])(?:export\s+)?(?:const\s+|let\s+|var\s+)?["']?([A-Za-z_$][\w$]*)["']?\s*[:=]\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\\n]|\\.)*`)/g;

function normaliseKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** @returns {Map<string, string>} normalised key -> value, for identity keys only. */
function readBrandValues(src) {
  const stripped = stripComments(src);
  const values = new Map();
  for (const match of stripped.matchAll(ENTRY_RE)) {
    const key = normaliseKey(match[1]);
    if (!IDENTITY_KEYS.has(key)) continue;
    if (PROSE_KEY_MARKERS.some((marker) => key.includes(marker))) continue;
    const value = unquote(match[2]).trim();
    if (value && !values.has(key)) values.set(key, value);
  }
  return values;
}

// ---------------------------------------------------------------------------------------------
// Turning brand values into banned tokens
// ---------------------------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;
const URL_RE = /^https?:\/\/([^/\s:]+)/i;
const DOMAIN_RE = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

function registrableLabel(host) {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const rest = labels.slice();
  while (rest.length > 2 && SUBDOMAIN_LABELS.has(rest[0])) rest.shift();
  rest.pop(); // TLD
  if (rest.length > 1 && PUBLIC_SUFFIX_SLD.has(rest[rest.length - 1])) rest.pop();
  return rest[rest.length - 1] ?? null;
}

function bannable(token) {
  const t = token.trim();
  if (t.length < 4) return false;
  if (GENERIC_VALUES.has(t.toLowerCase())) return false;
  // Short pure numbers are years, ports and counts, not identifiers.
  if (/^\d+$/.test(t) && t.length < 8) return false;
  return true;
}

/** Every literal form of one brand value that must not appear outside the allowlist. */
function expand(value) {
  const out = new Set();
  const add = (t) => {
    if (t && bannable(t)) out.add(t.trim());
  };

  const email = value.match(EMAIL_RE);
  const url = value.match(URL_RE);
  if (email) {
    add(value);
    add(email[1]);
    add(registrableLabel(email[1]));
    return out;
  }
  if (url) {
    add(url[1]);
    add(registrableLabel(url[1]));
    return out;
  }
  if (DOMAIN_RE.test(value)) {
    add(value);
    add(registrableLabel(value));
    return out;
  }

  add(value);
  if (/\s/.test(value) && value.length <= 60) {
    add(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
    add(value.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  }
  return out;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------------------------
// Match tests over the allowlisted infrastructure files
// ---------------------------------------------------------------------------------------------

const STRING_AFTER_KEY = (key) =>
  new RegExp(`(["']?)${key}\\1\\s*[:=]\\s*(["'])((?:[^"'\\\\]|\\\\.)*)\\2`);

function findKeyedString(text, key) {
  const re = STRING_AFTER_KEY(key);
  const m = re.exec(text);
  if (!m) return null;
  const valueStart = m.index + m[0].lastIndexOf(m[3]);
  return { value: m[3], start: valueStart, end: valueStart + m[3].length };
}

function finding(file, text, start, message) {
  const { line, column } = positionAt(text, start);
  return { file, line, column, message, source: lineAt(text, start) };
}

/** apps/<app>/wrangler.jsonc: Worker name and any route the Worker claims. */
function checkWrangler(rel, text, brand) {
  const findings = [];
  const notes = [];
  let masked = text;
  const appDir = rel.split("/")[1];

  const name = findKeyedString(text, "name");
  if (name) {
    const prefix = brand.values.get("workernameprefix") ?? brand.values.get("infraprefix");
    const expected = prefix ? `${prefix}${appDir}` : appDir;
    if (name.value !== expected) {
      findings.push(
        finding(
          rel,
          text,
          name.start,
          prefix
            ? `Worker name "${name.value}" must equal brand workerNamePrefix + app directory ("${expected}")`
            : `Worker name "${name.value}" must equal its app directory ("${expected}") -- the brand file sets no workerNamePrefix, so the Worker name may carry no identity string`,
        ),
      );
    }
    masked = maskSpan(masked, name.start, name.end);
  } else {
    notes.push(`${rel}: no "name" field found`);
  }

  const domain = brand.values.get("domain") ?? brand.values.get("apexdomain");
  const apiDomain = brand.values.get("apidomain") ?? brand.values.get("apihost");
  const routeRe = /(["']?)(?:pattern|route)\1\s*:\s*(["'])((?:[^"'\\]|\\.)*)\2/g;
  for (const m of text.matchAll(routeRe)) {
    const pattern = m[3];
    const start = m.index + m[0].lastIndexOf(pattern);
    const host = pattern.split("/")[0].replace(/^\*\./, "").replace(/^\*/, "").toLowerCase();
    const ok =
      (apiDomain && host === apiDomain.toLowerCase()) ||
      (domain && (host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`)));
    if (!ok) {
      findings.push(
        finding(
          rel,
          text,
          start,
          domain || apiDomain
            ? `route host "${host}" must equal the brand file's apiDomain/domain (${apiDomain ?? domain})`
            : `route "${pattern}" pins a domain but the brand file has no domain set -- the domain is founder decision 2, unresolved`,
        ),
      );
    }
    masked = maskSpan(masked, start, start + pattern.length);
  }

  return { findings, notes, masked };
}

/** supabase/config.toml: project_id. */
function checkSupabaseConfig(rel, text, brand) {
  const findings = [];
  const notes = [];
  let masked = text;

  const m = /^\s*project_id\s*=\s*"([^"]*)"/m.exec(text);
  if (!m) {
    notes.push(`${rel}: no project_id found`);
    return { findings, notes, masked };
  }
  const value = m[1];
  const start = m.index + m[0].lastIndexOf(value);

  const explicit = brand.values.get("supabaseprojectid");
  const productName = brand.values.get("productname") ?? brand.values.get("slug");
  const expected = explicit ?? (productName ? slugify(productName) : null);

  if (expected === null) {
    // Nothing to match against: the product name is unsettled. Leave project_id in the ban scan
    // so it cannot quietly acquire an identity string ahead of the brand file.
    notes.push(
      `${rel}: brand file sets neither supabaseProjectId nor productName, so project_id is ban-scanned rather than match-tested`,
    );
    return { findings, notes, masked };
  }
  if (value !== expected) {
    findings.push(
      finding(
        rel,
        text,
        start,
        `project_id "${value}" must equal the brand file value "${expected}"`,
      ),
    );
  }
  masked = maskSpan(masked, start, start + value.length);
  return { findings, notes, masked };
}

/**
 * True when the match sits inside a path whose first segment is an exempt directory, e.g.
 * `docs/marketplane/00-repo-map.md` or `design/marketplane/Main.dc.html`. Widen from the match
 * across path characters, then test the first segment. `api.marketplane.dev` is deliberately NOT
 * matched: its widened form starts with `api.`, which is no directory, so a real burned-in
 * hostname is still reported.
 */
const EXEMPT_PATH_ROOTS = ["docs", "design"];

function isPathIntoExemptDir(text, start, end) {
  const isPathChar = (ch) => /[A-Za-z0-9._\-/]/.test(ch);
  let from = start;
  while (from > 0 && isPathChar(text[from - 1])) from -= 1;
  let to = end;
  while (to < text.length && isPathChar(text[to])) to += 1;
  const widened = text.slice(from, to);
  if (!widened.includes("/")) return false;
  return EXEMPT_PATH_ROOTS.includes(widened.split("/")[0]);
}

/**
 * Every package.json `name`.
 *
 * The match test here is against a binding decision rather than a brand value: the product name
 * is not settled, so no package may be named after it and no npm name may be burned in
 * (00-repo-map.md section 1). The scope is `@repo/*`, which is why a package name carries no
 * identity string at all.
 */
const PACKAGE_NAME_RE = /^@repo\/[a-z0-9][a-z0-9.-]*$/;

function checkPackageName(rel, text) {
  const findings = [];
  let masked = text;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { findings, notes: [`${rel}: not valid JSON, name not match-tested`], masked };
  }
  if (typeof parsed.name !== "string") {
    return { findings, notes: [`${rel}: no "name" field`], masked };
  }

  const located = findKeyedString(text, "name");
  const start = located?.start ?? 0;
  if (!PACKAGE_NAME_RE.test(parsed.name)) {
    findings.push(
      finding(
        rel,
        text,
        start,
        `package name "${parsed.name}" must match @repo/<name> -- the product name is unsettled, so no npm name may be burned in`,
      ),
    );
  }
  if (located) masked = maskSpan(masked, located.start, located.end);
  return { findings, notes: [], masked };
}

// `needsBrand` marks the rules that match-test a file against a value in the brand file. The
// package-name rule does not: it encodes the binding decision that no npm name may be burned in
// while the product name is unsettled, which is true whether or not the brand file exists yet.
// Keeping it outside the gate is the difference between a guard and a no-op.
const ALLOWLIST = [
  { pattern: "apps/*/wrangler.jsonc", check: checkWrangler, needsBrand: true },
  { pattern: "apps/*/wrangler.json", check: checkWrangler, needsBrand: true },
  { pattern: "supabase/config.toml", check: checkSupabaseConfig, needsBrand: true },
  { pattern: "**/package.json", check: checkPackageName, needsBrand: false },
];

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function main() {
  const { warn, unknown } = parseArgs(process.argv.slice(2));
  if (unknown.length > 0) {
    process.stderr.write(
      `check-brand: unknown option ${unknown[0]}\nUsage: node scripts/check-brand.mjs [--warn]\n`,
    );
    return 2;
  }

  const brandPresent = existsSync(`${repoRoot}/${BRAND_FILE}`);
  const values = brandPresent ? readBrandValues(readText(BRAND_FILE)) : new Map();
  const brand = { values };

  const tokens = new Map(); // lowercased token -> canonical token
  for (const [, value] of values) {
    for (const token of expand(value)) tokens.set(token.toLowerCase(), token);
  }

  const notes = [];
  if (!brandPresent) {
    notes.push(
      `${BRAND_FILE} not present yet, so the identity-string ban is inactive. Rules that do not depend on it still run.`,
    );
  } else if (values.size === 0) {
    notes.push(
      `${BRAND_FILE} present but no identity keys resolved -- check IDENTITY_KEYS in this script`,
    );
  } else {
    notes.push(
      `identity values from ${BRAND_FILE}: ${[...values.entries()].map(([k, v]) => `${k}="${v}"`).join(", ")}`,
    );
    notes.push(
      `banned outside the allowlist: ${[...tokens.values()].map((t) => `"${t}"`).join(", ") || "(none)"}`,
    );
  }

  // Longest first, so "acme.example" is reported once rather than also as "acme".
  const ordered = [...tokens.values()].sort((a, b) => b.length - a.length);
  const matchers = ordered.map((token) => ({
    token,
    re: new RegExp(
      `(?<![A-Za-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`,
      "gi",
    ),
  }));

  const findings = [];

  for (const rel of listFiles()) {
    if (rel === BRAND_FILE) continue;

    let text = readText(rel);

    const rule = ALLOWLIST.find(
      (r) => matchesAny(rel, [r.pattern]) && (brandPresent || !r.needsBrand),
    );
    if (rule) {
      const result = rule.check(rel, text, brand);
      findings.push(...result.findings);
      notes.push(...result.notes);
      text = result.masked;
    }

    if (matchesAny(rel, EXEMPT)) continue;

    const claimed = [];
    for (const { token, re } of matchers) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m !== null; m = re.exec(text)) {
        const start = m.index;
        const end = start + m[0].length;
        if (claimed.some(([s, e]) => start < e && end > s)) continue;
        claimed.push([start, end]);
        const source = lineAt(text, start);
        if (hasIgnorePragma(pragmaScope(text, start), "brand-guard")) continue;
        // A path into an exempt directory is a citation, not a second home for the string.
        // `docs/marketplane/00-repo-map.md` in a comment must not trip a guard whose whole
        // point is that identity strings come from the brand file. Without this the guard
        // reports ~17 findings on a clean tree and can never be flipped to enforcing.
        if (isPathIntoExemptDir(text, start, end)) continue;
        const { line, column } = positionAt(text, start);
        findings.push({
          file: rel,
          line,
          column,
          message: `identity string "${token}" must come from ${BRAND_FILE}, not appear here`,
          source,
        });
      }
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

  return report({
    name: "brand guard",
    findings,
    notes,
    warn,
    summary: `${tokens.size} identity string${tokens.size === 1 ? "" : "s"} checked against the allowlist`,
  });
}

process.exit(main());
