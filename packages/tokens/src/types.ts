/**
 * The hand-written public type of the token map.
 *
 * These types are authored here, never inferred from the generated file, so that every
 * consumer typechecks identically before and after `pnpm --filter @repo/tokens build`.
 *
 * Runtime-agnostic by construction: no DOM and no workerd globals are referenced, because
 * this module is typechecked under apps/web's DOM lib and apps/api-edge's
 * @cloudflare/workers-types independently.
 */

/** Every custom property in tokens.css is namespaced `--mp-`. The generator enforces it. */
export type TokenName = `--mp-${string}`;

/** One fully resolved theme: every token, no cascade required. */
export type TokenMap = Readonly<Record<TokenName, string>>;

export type Theme = "light" | "dark";

/** The shape of the generated module. Both themes are complete, not base-plus-patch. */
export type TokenSet = Readonly<Record<Theme, TokenMap>>;
