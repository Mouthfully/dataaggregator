import { describe, expect, it } from "vitest";

import { entitlementsFor, formatAllowance, PLAN_ENTITLEMENTS } from "./entitlements";
import { PLAN_DISPLAY, PLANS } from "./plans";

/**
 * These assert the SHAPE of the entitlement record and the one invariant its numbers have to
 * satisfy. They do not assert that anything enforces it, because nothing does -- see the header of
 * `entitlements.ts`. A test named "the free plan is limited to three connections" would be the
 * first sentence in a chain that ends with a page telling customers connections are metered.
 */
describe("the entitlement record", () => {
  it("keys each record by its own plan", () => {
    // A copy-pasted record that kept the plan it was copied from looks right in every renderer and
    // is wrong in every lookup that goes the other way.
    for (const plan of PLANS) expect(entitlementsFor(plan).plan).toBe(plan);
  });

  it("allows a whole, positive number of connections on every plan", () => {
    for (const entry of PLANS.map(entitlementsFor)) {
      expect(Number.isInteger(entry.connections.count), entry.plan).toBe(true);
      expect(entry.connections.count, entry.plan).toBeGreaterThan(0);
    }
  });

  it("never allows a dearer plan fewer connections than a cheaper one", () => {
    // `plans.test.ts` asserts PLAN_DISPLAY runs cheapest to dearest, so walking it in order is
    // walking the price ladder. An allowance that goes backwards up that ladder is a typo nobody
    // reading one cell would catch.
    const counts = PLAN_DISPLAY.map((p) => entitlementsFor(p.plan).connections.count);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
  });

  it("caps neither workspaces nor members, because nothing in the schema does", () => {
    // Null is "no cap decided", not "unlimited". If a cap is ever decided this assertion is the
    // place to change, and changing it should be a deliberate act rather than a silent one.
    for (const entry of PLANS.map(entitlementsFor)) {
      expect(entry.workspaces, entry.plan).toBeNull();
      expect(entry.members, entry.plan).toBeNull();
    }
  });
});

describe("writing an allowance out", () => {
  it("keeps the plus on a figure the catalogue publishes as a floor", () => {
    // Dropping it turns "at least 200" into "at most 200" -- a smaller promise than the one on the
    // page, printed in a cell that reads as correct.
    expect(formatAllowance({ count: 200, atLeast: true })).toBe("200+");
  });

  it("adds no plus to an exact figure", () => {
    expect(formatAllowance({ count: 3, atLeast: false })).toBe("3");
  });

  it("writes Agency as a floor and the other three exactly", () => {
    expect(formatAllowance(entitlementsFor("agency").connections)).toBe("200+");
    expect(formatAllowance(entitlementsFor("free").connections)).toBe("3");
    expect(formatAllowance(entitlementsFor("starter").connections)).toBe("10");
    expect(formatAllowance(entitlementsFor("growth").connections)).toBe("50");
  });
});
