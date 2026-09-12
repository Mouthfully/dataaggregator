import { describe, expect, it } from "vitest";

import { isGoogleSignInEnabled } from "./google";

describe("whether the Google button is offered", () => {
  it("is absent by default, because the provider is off in the live project", () => {
    // `auth/v1/settings` reports google: false today, so an unconditional button is a 400 for
    // every visitor who presses it. Absent is the only safe default and this is the assertion
    // that keeps it that way through a refactor.
    expect(isGoogleSignInEnabled({})).toBe(false);
    expect(isGoogleSignInEnabled({ NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED: "" })).toBe(false);
    expect(isGoogleSignInEnabled({ NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED: "   " })).toBe(false);
  });

  it("appears on an explicit affirmative", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", "enabled", " true "]) {
      expect(isGoogleSignInEnabled({ NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED: value }), value).toBe(true);
    }
  });

  it("stays absent for a value that means off, rather than reading mere presence as yes", () => {
    // `=false` is what a person writes when they mean off. Treating any set value as on would
    // render the broken button for exactly the deployer who was trying to avoid it.
    for (const value of ["0", "false", "no", "off", "disabled", "undefined", "null"]) {
      expect(isGoogleSignInEnabled({ NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED: value }), value).toBe(
        false,
      );
    }
  });
});
