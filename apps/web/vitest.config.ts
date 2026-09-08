import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The site is static and the assertions are about rendered TEXT, so there is no jsdom here:
// `renderToStaticMarkup` produces a string and the tests read it. A DOM environment would be a
// dependency bought for nothing.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["app/**/*.test.tsx"],
  },
});
