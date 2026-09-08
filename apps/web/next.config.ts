import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal workspace packages export raw TypeScript from src/. There is no per-package
  // build step, so Next has to compile them itself.
  //
  // EVERY @repo/* PACKAGE THIS APP IMPORTS MUST BE LISTED. A missing entry does not fail
  // typecheck or vitest -- both resolve the source directly -- it fails only `next build`, which
  // is the last step before deploy. @repo/brand was added here for exactly that reason.
  transpilePackages: ["@repo/tokens", "@repo/brand"],
  typedRoutes: true,
};

export default nextConfig;
