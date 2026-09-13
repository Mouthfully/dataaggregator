/**
 * WHICH PROVIDERS A CUSTOMER CAN CONNECT BY TYPING A CREDENTIAL, AND WHICH ONES IT CANNOT.
 *
 * `PROVIDER_LANES` in `packages/connections` is the authority on this and is NOT read here. That is
 * a resolution, not a preference, and the reason is mechanical: `@repo/connections` imports
 * `@repo/vault` and `@repo/oauth`, both of which spell their internal imports `./vault.js` --
 * specifiers Turbopack cannot map onto the `.ts` file beside them, exactly as `next.config.ts`
 * predicts in writing. Importing the package from this app fails `next build` with `Module not
 * found`, and the two fixes for that -- converting those packages' specifiers, or adding them to
 * `transpilePackages` and this app's dependencies -- are files another workflow owns.
 *
 * SO THIS IS A MIRROR, AND A MIRROR THAT CANNOT DRIFT SILENTLY IS THE WHOLE POINT.
 * `_providers.test.ts` imports the real `PROVIDER_LANES` by relative path -- which vitest and tsc
 * both resolve, and only the bundler does not -- and asserts this file agrees with it in both
 * directions: every provider present, every lane identical, nothing offered here that the package
 * does not offer. A provider added there and forgotten here fails that test rather than quietly
 * disappearing from the screen a customer connects with.
 *
 * NOTHING IN `app/` MAY IMPORT THAT PATH. The test may, because tests are not bundled.
 *
 * THE LANE IS A PROPERTY OF THE CONNECTION, NOT OF THE PROVIDER, which is why `meta_ads` is on both
 * lists in the package and on the typed list here: the same Meta account can be connected through
 * an authorisation screen or by pasting a System User token the customer minted itself. This screen
 * offers the second, because the first is not typed.
 */

/** The two lanes `POST /v1/connections` accepts. `oauth` is deliberately not one of them. */
export type TypedLane = "key_secret" | "bearer";

/** A provider a customer can connect on this screen, and the lane its credential arrives on. */
export interface TypedProvider {
  /** The `app.connection_provider` value, sent verbatim as `provider` in the request body. */
  readonly id: string;
  readonly lane: TypedLane;
}

/**
 * The providers this screen can connect.
 *
 * ONE LANE EACH, and `_providers.test.ts` asserts that no provider in `PROVIDER_LANES` offers both
 * typed lanes. If one ever does, this shape has to become a choice a customer makes, and a silent
 * pick of the first lane would seal a credential of the wrong kind -- so the test fails instead.
 */
export const TYPED_PROVIDERS: readonly TypedProvider[] = [
  { id: "woocommerce", lane: "key_secret" },
  { id: "meta_ads", lane: "bearer" },
] as const;

/**
 * The providers that can only be connected through an authorisation screen.
 *
 * LISTED RATHER THAN OMITTED. A customer who connects WooCommerce and sees nothing else has no way
 * to tell whether Google Ads is coming, missing, or was never supported -- so the screen names them
 * and says they are not available yet. A button that starts a flow this build does not have is the
 * one thing worse than saying so: `/v1/connections` refuses `credential_lane: oauth` by design,
 * because an authorisation arrives at a redirect URI as a code to exchange rather than as a string
 * anybody can type.
 */
export const OAUTH_ONLY_PROVIDERS: readonly string[] = [
  "ga4",
  "google_ads",
  "search_console",
  "loyverse",
] as const;

/** Every provider this build knows, in the order the screen lists them. */
export const ALL_PROVIDERS: readonly string[] = [
  ...TYPED_PROVIDERS.map((provider) => provider.id),
  ...OAUTH_ONLY_PROVIDERS,
];

export function typedProvider(id: string): TypedProvider | null {
  return TYPED_PROVIDERS.find((provider) => provider.id === id) ?? null;
}
