import { describe, expect, it } from "vitest";
import { PROVIDER_LANES } from "../../../../packages/connections/src/connections.ts";
// THE TWO IMPORTS THIS FILE EXISTS FOR, AND THE REASON THEY ARE RELATIVE PATHS.
//
// `@repo/connections` is not a dependency of this app and cannot become one without editing files
// another workflow owns -- see `_providers.ts` for the bundler failure that forbids it. vitest and
// tsc both resolve these paths; Turbopack is the only thing that does not, and Turbopack never sees
// a test file. So the mirror in `_providers.ts` is checked against the real thing here, which is
// the only place it can be checked at all.
//
// NOTHING UNDER `app/` MAY COPY THESE IMPORTS INTO SHIPPED CODE. `next build` fails on them.
import { TYPED_LANES } from "../../../api-edge/src/connect.ts";

import { ALL_PROVIDERS, OAUTH_ONLY_PROVIDERS, TYPED_PROVIDERS, typedProvider } from "./_providers";

/** The lanes a customer can type, intersected out of what the package says a provider offers. */
function typedLanesOf(provider: keyof typeof PROVIDER_LANES): readonly string[] {
  const offered: readonly string[] = PROVIDER_LANES[provider];
  return (TYPED_LANES as readonly string[]).filter((lane) => offered.includes(lane));
}

const PROVIDERS = Object.keys(PROVIDER_LANES) as (keyof typeof PROVIDER_LANES)[];

describe("the connect screen's provider list mirrors PROVIDER_LANES", () => {
  it("names every provider the package knows, and invents none", () => {
    expect([...ALL_PROVIDERS].sort()).toEqual([...PROVIDERS].sort());
  });

  it("offers a provider exactly when the package gives it a typed lane", () => {
    for (const provider of PROVIDERS) {
      const typed = typedLanesOf(provider);
      const offered = typedProvider(provider);

      if (typed.length === 0) {
        expect(offered, provider).toBeNull();
        expect(OAUTH_ONLY_PROVIDERS, provider).toContain(provider);
        continue;
      }

      expect(offered, provider).not.toBeNull();
      expect(OAUTH_ONLY_PROVIDERS, provider).not.toContain(provider);
    }
  });

  it("carries the same lane the package does", () => {
    for (const { id, lane } of TYPED_PROVIDERS) {
      expect(typedLanesOf(id as keyof typeof PROVIDER_LANES), id).toEqual([lane]);
    }
  });

  /**
   * A PROVIDER WITH TWO TYPED LANES WOULD BREAK THE SHAPE, NOT THE COPY. `TypedProvider` holds one
   * lane, so a provider offering both `key_secret` and `bearer` would have to be presented as a
   * choice; picking the first silently would seal a credential of the wrong kind and store a
   * `credential_lane` that disagrees with the blob -- which `openCredential` refuses, later, on the
   * scheduler's clock rather than on the customer's.
   */
  it("fails if any provider ever offers both typed lanes", () => {
    for (const provider of PROVIDERS) {
      expect(typedLanesOf(provider).length, provider).toBeLessThanOrEqual(1);
    }
  });

  it("lists each provider once", () => {
    expect(new Set(ALL_PROVIDERS).size).toBe(ALL_PROVIDERS.length);
  });
});
