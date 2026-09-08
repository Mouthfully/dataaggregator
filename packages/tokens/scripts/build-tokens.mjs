#!/usr/bin/env node
/**
 * build-tokens.mjs -- the only generator in the repository.
 *
 * Parses ../src/tokens.css and emits ../dist/tokens.generated.ts: a resolved
 * { light, dark } custom-property map for the surfaces that cannot use a stylesheet --
 * Worker-rendered transactional emails (inline styles only) and PDF exports.
 *
 * tokens.css stays the single source of truth. Nothing here invents, derives or defaults
 * a value: every string in the output is copied verbatim out of the stylesheet.
 *
 * Run: pnpm --filter @repo/tokens build
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const SOURCE = join(PKG, "src", "tokens.css");
const OUT_DIR = join(PKG, "dist");
const OUT_FILE = join(OUT_DIR, "tokens.generated.ts");

/** The three blocks the stylesheet is contracted to contain. */
const LIGHT_SELECTOR = ":root";
const DARK_MEDIA_SELECTOR = ':root:not([data-theme="light"])';
const DARK_ATTR_SELECTOR = ':root[data-theme="dark"]';

class BuildError extends Error {}

// Strip CSS block comments. tokens.css contains no string literal that embeds a comment opener.
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Return the body of the block introduced by `selector`, by matching braces from the
 * first `{` after it. Brace matching rather than a regex, so a nested block (the dark
 * media query) cannot truncate the match at the wrong `}`.
 */
function blockBody(css, selector, { from = 0 } = {}) {
  const at = css.indexOf(selector, from);
  if (at === -1) throw new BuildError(`selector not found in tokens.css: ${selector}`);
  const open = css.indexOf("{", at + selector.length);
  if (open === -1) throw new BuildError(`no opening brace after selector: ${selector}`);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return { body: css.slice(open + 1, i), end: i };
    }
  }
  throw new BuildError(`unbalanced braces after selector: ${selector}`);
}

/**
 * Find the bare `:root {` rule -- not `:root:not(...)` and not `:root[data-theme=...]`.
 * The next non-space character after the selector must be the opening brace.
 */
function lightBlock(css) {
  const match = /(^|[}\s]):root\s*\{/.exec(css);
  if (match === null) {
    throw new BuildError("no bare `:root { ... }` block found in tokens.css");
  }
  return blockBody(css, LIGHT_SELECTOR, { from: match.index + match[1].length });
}

/** Parse `--name: value;` declarations out of a block body. Nested blocks are ignored. */
function parseDeclarations(body, label) {
  const flat = body.replace(/\{[\s\S]*?\}/g, "");
  const out = new Map();
  for (const raw of flat.split(";")) {
    const decl = raw.trim();
    if (decl === "") continue;
    const colon = decl.indexOf(":");
    if (colon === -1) throw new BuildError(`${label}: declaration without a colon: ${decl}`);
    const name = decl.slice(0, colon).trim();
    const value = decl
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, " ");
    if (!name.startsWith("--mp-")) {
      throw new BuildError(`${label}: every token must be namespaced --mp-, got: ${name}`);
    }
    if (value === "") throw new BuildError(`${label}: empty value for ${name}`);
    if (out.has(name)) throw new BuildError(`${label}: duplicate declaration of ${name}`);
    out.set(name, value);
  }
  if (out.size === 0) throw new BuildError(`${label}: no declarations found`);
  return out;
}

function sameMap(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function serialize(map) {
  return [...map].map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
}

async function main() {
  const css = stripComments(await readFile(SOURCE, "utf8"));

  const light = parseDeclarations(lightBlock(css).body, "light :root");

  // Both dark blocks are parsed and compared. They are hand-duplicated in the stylesheet
  // (CSS cannot share a declaration list between a media query and an attribute selector),
  // so drift between them is the one failure mode the file cannot catch by itself.
  const darkMedia = parseDeclarations(
    blockBody(css, DARK_MEDIA_SELECTOR).body,
    "dark @media block",
  );
  const darkAttr = parseDeclarations(
    blockBody(css, DARK_ATTR_SELECTOR).body,
    'dark [data-theme="dark"] block',
  );
  if (!sameMap(darkMedia, darkAttr)) {
    const keys = new Set([...darkMedia.keys(), ...darkAttr.keys()]);
    const drift = [...keys]
      .filter((k) => darkMedia.get(k) !== darkAttr.get(k))
      .map(
        (k) =>
          `  ${k}: @media=${darkMedia.get(k) ?? "(absent)"} attr=${darkAttr.get(k) ?? "(absent)"}`,
      );
    throw new BuildError(
      `the two dark blocks in tokens.css have drifted. They must stay identical:\n${drift.join("\n")}`,
    );
  }

  // A dark override that names no light token is a typo, not a new token: the dark blocks
  // exist to redefine, never to introduce.
  const orphans = [...darkMedia.keys()].filter((k) => !light.has(k));
  if (orphans.length > 0) {
    throw new BuildError(
      `dark blocks declare tokens absent from :root (typo?): ${orphans.join(", ")}`,
    );
  }

  // Emails and PDFs have no cascade, so each theme is emitted fully resolved rather than
  // as a base plus a patch.
  const dark = new Map([...light, ...darkMedia]);

  const body = `// GENERATED FILE -- DO NOT EDIT BY HAND.
//
// Source:      packages/tokens/src/tokens.css
// Generator:   packages/tokens/scripts/build-tokens.mjs
// Regenerate:  pnpm --filter @repo/tokens build
//
// A resolved custom-property map per theme, for the surfaces that cannot use a stylesheet:
// Worker-rendered transactional emails and PDF exports. Both themes carry every token, so
// a consumer never has to merge a base with a patch.

export const tokens = {
  light: {
${serialize(light)}
  },
  dark: {
${serialize(dark)}
  },
} as const;

/** The ${darkMedia.size} tokens the dark theme actually redefines; everything else is theme-invariant. */
export const darkOverrides = [
${[...darkMedia.keys()].map((k) => `  ${JSON.stringify(k)},`).join("\n")}
] as const;
`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, body, "utf8");

  const rel = (p) => relative(process.cwd(), p);
  console.log(`tokens: parsed ${rel(SOURCE)}`);
  console.log(`  light      ${light.size} tokens`);
  console.log(
    `  dark       ${dark.size} tokens (${darkMedia.size} redefined, ${dark.size - darkMedia.size} inherited)`,
  );
  console.log(`  dark blocks identical: yes (@media and [data-theme="dark"])`);
  console.log(`  wrote ${rel(OUT_FILE)} (${body.length} bytes)`);
}

main().catch((error) => {
  if (error instanceof BuildError) {
    console.error(`tokens: build failed.\n  ${error.message}`);
    process.exit(1);
  }
  throw error;
});
