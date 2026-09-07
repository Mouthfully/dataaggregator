/**
 * Resolution fallback for `#generated`, used only when dist/tokens.generated.ts does not
 * exist yet -- a fresh clone, or any command run before `pnpm --filter @repo/tokens build`.
 *
 * It deliberately holds NO values. tokens.css is the single source of truth and duplicating
 * even one hex here would create a second one. Reading a theme throws instead of returning
 * blanks, so a Worker can never render an email with silently empty colours: the failure is
 * loud, immediate, and names the command that fixes it.
 */

import type { TokenSet } from "./types.ts";

const MESSAGE =
  "@repo/tokens: dist/tokens.generated.ts has not been built. " +
  "Run `pnpm --filter @repo/tokens build` (the repo-root `pnpm build` does this for you).";

function notGenerated(): never {
  throw new Error(MESSAGE);
}

export const tokens: TokenSet = {
  get light(): never {
    return notGenerated();
  },
  get dark(): never {
    return notGenerated();
  },
};

export const darkOverrides: readonly string[] = [];
