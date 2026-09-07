import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal workspace packages export raw TypeScript from src/. There is no per-package
  // build step, so Next has to compile them itself.
  transpilePackages: ["@repo/tokens"],
  typedRoutes: true,
};

export default nextConfig;
