import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal workspace packages export raw TypeScript from src/. There is no per-package
  // build step, so Next has to compile them itself.
  //
  // EVERY @repo/* PACKAGE THIS APP IMPORTS MUST BE LISTED, TRANSITIVELY. A missing entry does not
  // fail typecheck or vitest -- both resolve the source directly -- it fails only `next build`,
  // which is the last step before deploy. The list below is the closure of what `app/` imports:
  // brand, contract and connectors are imported by name; extract and payloads arrive underneath
  // connectors and are just as required, which is the half a hand-maintained list gets wrong.
  //
  // LISTING THEM HERE IS NECESSARY AND IS NOT SUFFICIENT. Next 16 builds with TURBOPACK, which
  // does not map a `.js` specifier onto the `.ts` file beside it, and has no escape hatch:
  // `experimental.extensionAlias` is webpack-only and next/dist/lib/turbopack-warning.js lists it
  // among the unsupported options. So a package whose modules import each other as `./thing.js`
  // fails the build with `Module not found` the moment this app pulls it in.
  //
  // That is the failure tsconfig.base.json already predicts in writing: "a relative import has to
  // name a file that exists on disk: `./claims.ts`, not `./claims.js` ... A `.js` specifier
  // resolves fine under tsc, vitest and esbuild and fails only `next build`". @repo/brand and
  // @repo/tokens followed the rule because they were the only packages this app had ever built.
  // The other four did not, and nothing caught it, because nothing had ever built them. Adding
  // /envelope pulled all four in at once and 103 specifiers across contract, connectors, extract
  // and payloads were converted to `.ts` to match the rule.
  //
  // The guard against a repeat is this app's own build: any package added here brings its
  // specifiers with it, and `next build` is the thing that says so.
  transpilePackages: [
    "@repo/tokens",
    "@repo/brand",
    "@repo/contract",
    "@repo/connectors",
    "@repo/extract",
    "@repo/payloads",
  ],
  typedRoutes: true,
};

export default nextConfig;
