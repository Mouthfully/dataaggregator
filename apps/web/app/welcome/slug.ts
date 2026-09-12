/**
 * The organisation slug.
 *
 * In its own module because `actions.ts` carries "use server", and a server-action file may export
 * ONLY async functions -- a synchronous export there is a build error, not a lint warning. Which is
 * the better home anyway: this is a pure string function and the one part of sign-up worth testing
 * without a database.
 */

const SLUG_MAX = 62;

/**
 * A url-safe slug the column's own check will accept: `^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`.
 *
 * The suffix is not decoration. Slugs are UNIQUE across all organisations, and two companies
 * called "Northstar" are not a collision to resolve with an error message a customer cannot act
 * on -- so the name is what they chose and the suffix is what makes it storable.
 */
export function slugify(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX - suffix.length - 1);
  // A name of only punctuation leaves nothing; "org" is a label, not a guess at their name.
  return `${base || "org"}-${suffix}`;
}
