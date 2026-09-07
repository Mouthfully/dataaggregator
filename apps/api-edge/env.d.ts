/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Env } from "./src/index";

// Gives `env` from "cloudflare:test" the same shape the Worker sees.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
