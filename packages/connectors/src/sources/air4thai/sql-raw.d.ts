/**
 * `?raw` imports, so `contract.test.ts` can compare this connector's vocabulary against the
 * PostgreSQL enums that have to store it.
 *
 * WHY NOT `node:fs`. `packages/connectors/tsconfig.json` sets `"types": []` deliberately: this
 * package is compiled by its CONSUMERS -- a Next app under the DOM lib and a Worker under
 * @cloudflare/workers-types -- so it must not reference any one runtime's globals. Pulling in
 * @types/node to read a file in a test would put `process`, `Buffer` and friends in scope for the
 * whole `src` tree, which is the exact leak that setting exists to prevent.
 *
 * Vite's `?raw` suffix needs no runtime types at all: the bundler inlines the file as a string.
 * This declaration is the only thing TypeScript needs to agree.
 */
declare module "*.sql?raw" {
  const text: string;
  export default text;
}
