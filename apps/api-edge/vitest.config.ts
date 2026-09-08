import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// NOTE: @cloudflare/vitest-pool-workers 0.22.0 (the version the vitest 4 pin forces) no
// longer ships `defineWorkersConfig` from "@cloudflare/vitest-pool-workers/config" -- that
// subpath does not exist in its exports map. Under vitest 4 the integration is a Vite
// plugin, and what used to be `test.poolOptions.workers` is now the plugin's argument.
// This is the shape the package's own vitest-v3-to-v4 codemod produces.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
