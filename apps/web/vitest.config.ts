import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The site is static and the assertions are about rendered TEXT, so there is no jsdom here:
// `renderToStaticMarkup` produces a string and the tests read it. A DOM environment would be a
// dependency bought for nothing.
export default defineConfig({
  plugins: [react()],
  test: {
    // BOTH EXTENSIONS. This read `*.test.tsx` only, and the cost was silent: `_work-email.test.ts`
    // -- the tests for the rule that decides who may sign up -- sat in the tree for several
    // commits and never executed once. A test that cannot run is worse than a missing one,
    // because it reports as coverage.
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
  },
});
