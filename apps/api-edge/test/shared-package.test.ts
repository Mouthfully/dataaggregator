import { token, tokens } from "@repo/tokens";
import { describe, expect, it } from "vitest";

// This is the test the layout decision rests on. docs/marketplane/00-repo-map.md section 12:
// "a source-only shared package typechecks under both @cloudflare/workers-types and Next's
// DOM lib without colliding on fetch/Request/Response/caches. PR 2 proves them or the layout
// decision reopens."
//
// apps/web proves the DOM half by importing @repo/tokens in app/page.tsx. This file proves
// the workerd half: it is compiled under a tsconfig with NO DOM lib, and it runs inside the
// Workers runtime rather than in Node.
describe("a shared workspace package under workerd", () => {
  it("imports raw TypeScript with no build step", () => {
    // A literal, not a self-comparison: comparing the token to itself would pass even with the
    // whole chain broken.
    // tokens-guard-ignore: asserts the value that crossed the runtime boundary.
    expect(token("--mp-ground")).toBe("#f4f6fa");
  });

  it("exposes the same generated { light, dark } map both runtimes see", () => {
    // The map is generated from packages/tokens/src/tokens.css by that package's build
    // script. Workers render transactional emails and PDFs, which have no stylesheet and no
    // cascade, so each theme carries every token rather than a base plus a patch.
    expect(Object.keys(tokens)).toEqual(["light", "dark"]);
    expect(Object.keys(tokens.light)).toContain("--mp-ground");
    expect(Object.keys(tokens.dark)).toHaveLength(Object.keys(tokens.light).length);
    // tokens-guard-ignore: as above, for the dark theme.
    expect(token("--mp-ground", "dark")).toBe("#0f172a");
  });
});
