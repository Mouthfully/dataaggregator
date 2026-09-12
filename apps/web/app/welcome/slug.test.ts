import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

/** The column's own check, copied so a drift between it and this function is a test failure. */
const COLUMN_CHECK = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

describe("the organisation slug", () => {
  it.each([
    "Northstar Studio",
    "Harbour Line Trading Limited",
    "  leading and trailing  ",
    "Ünïcödé Çømpåny",
    "ALL CAPS LTD",
    "hyphen---collapse",
    "a",
    "x".repeat(200),
    "!!!",
    "日本語の会社",
  ])("produces a slug the column accepts for %j", (name) => {
    const slug = slugify(name, "abcd1234");
    expect(slug, name).toMatch(COLUMN_CHECK);
  });

  it("keeps the name recognisable rather than hashing it", () => {
    expect(slugify("Northstar Studio", "abcd1234")).toBe("northstar-studio-abcd1234");
  });

  it("falls back to a label when the name leaves nothing, instead of an empty slug", () => {
    // A name of only punctuation is not an error worth showing a customer; it just cannot be a
    // slug. "org" is a label, not a guess at what they meant.
    expect(slugify("!!!", "abcd1234")).toBe("org-abcd1234");
  });

  it("never exceeds the column's 64-character ceiling, even for a very long name", () => {
    // The check allows 1 + 62 + 1. A 200-character company name must be truncated BEFORE the
    // suffix is appended, or the suffix is what gets cut and slugs stop being unique.
    const slug = slugify("x".repeat(500), "abcd1234");
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("-abcd1234")).toBe(true);
  });

  it("distinguishes two companies with the same name", () => {
    // Slugs are UNIQUE across every organisation. Two customers called Northstar is a normal
    // Tuesday, not a collision to surface as an error a customer cannot act on.
    expect(slugify("Northstar", "aaaa1111")).not.toBe(slugify("Northstar", "bbbb2222"));
  });
});
