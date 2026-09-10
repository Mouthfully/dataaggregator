import { defineConfig } from "vitest/config";

/**
 * THE SUITE RUNS IN ASIA/BANGKOK, NOT UTC, AND THAT IS THE WHOLE FILE.
 *
 * A Thailand-first product whose tests only ever run in UTC cannot see a timezone bug, because in
 * UTC the wrong answer and the right answer are the same string. Mutation testing proved it: the
 * `Z` that `wooGmtToDate` appends to WooCommerce's designator-less `_gmt` timestamps was deleted,
 * the whole suite still passed, and the assertion that claimed to cover it was asserting a value
 * that does not move in UTC.
 *
 * CI runners are UTC. Customers are not. Pinning a positive-offset zone here makes the class of bug
 * visible to every connector added after this one, rather than to whichever developer happens to be
 * running the suite on a laptop in Bangkok.
 */
export default defineConfig({
  test: {
    env: { TZ: "Asia/Bangkok" },
  },
});
