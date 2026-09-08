/**
 * @repo/tokens -- the design tokens, in the two forms the product needs.
 *
 *   1. ./tokens.css  the stylesheet, imported by apps/web through the package export map.
 *                    This is the source of truth; nothing else may hard-code a value.
 *   2. this module   the same tokens as a resolved { light, dark } map, for the surfaces
 *                    that cannot use a stylesheet: Worker-rendered transactional emails
 *                    (inline styles only) and PDF exports.
 *
 * The map is GENERATED from tokens.css by scripts/build-tokens.mjs into dist/ (gitignored),
 * and re-exported here behind the hand-written types in ./types.ts.
 *
 * The `#generated` specifier has an imports-array fallback to ./generated-fallback.ts, and it is
 * WEAKER THAN IT LOOKS. TypeScript honours the fallback, so `tsc --noEmit` passes with dist/
 * missing. Turbopack does not implement subpath-imports array fallback, so `next build` fails with
 * a bare "Can't resolve '#generated'" and the developer never sees the message the fallback exists
 * to print. In practice dist/ is always present because the package's `prepare` script regenerates
 * it on every install; the gap opens only after `rm -rf dist` or `git clean -xfd` without a
 * reinstall. If you hit that module-not-found, run `pnpm --filter @repo/tokens build`.
 */

import { tokens as generated } from "#generated";
import type { Theme, TokenMap, TokenName, TokenSet } from "./types.ts";

export type { Theme, TokenMap, TokenName, TokenSet } from "./types.ts";

/** Every token, fully resolved, per theme. Generated from tokens.css -- do not edit values. */
export const tokens: TokenSet = generated;

/** The complete token map for one theme. */
export function themeTokens(theme: Theme): TokenMap {
  return tokens[theme];
}

/** Resolve a single token, e.g. `token("--mp-accent")` -> the accent colour. */
export function token(name: TokenName, theme: Theme = "light"): string {
  const value = tokens[theme][name];
  if (value === undefined) {
    throw new Error(`@repo/tokens: unknown token ${name}. It is not declared in tokens.css.`);
  }
  return value;
}

/**
 * The theme as a custom-property declaration list, for an inline `style` attribute or a
 * `<style>` block in a rendered email or PDF:
 *   `<div style="${cssVariables("light")} background: var(--mp-ground)">`
 */
export function cssVariables(theme: Theme = "light"): string {
  return Object.entries(tokens[theme])
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}
