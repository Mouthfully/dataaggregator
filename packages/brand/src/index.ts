// Internal imports carry the REAL `.ts` extension, not `.js`.
//
// `moduleResolution: "bundler"` accepts both, and tsc, vitest and esbuild resolve `./brand.js` to
// `./brand.ts` happily -- so a `.js` specifier passes typecheck, passes every test, and fails only
// `next build`, which is the last step before deploy. @repo/tokens already used `.ts` for this
// reason; this package did not, and apps/web importing it is what surfaced the difference.
export {
  apiUrl,
  brand,
  formatAddress,
  siteUrl,
  type Brand,
  type PostalAddress,
} from "./brand.ts";
export {
  CLAIMS,
  FORBIDDEN_CLAIMS,
  allowedClaims,
  withheldClaims,
  type Claim,
} from "./claims.ts";
