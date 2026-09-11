/**
 * KEYSET PAGING, AND WHY NOT `offset`.
 *
 * `36-jwt-claims-and-the-paging-cap.md` deferred this choice to whoever wrote the adapter, so here
 * it is. `offset` is two characters and trivially correct to write; it is also wrong in exactly the
 * way this endpoint must never be wrong. The nightly re-pull INSERTS rows for dates inside the
 * window a customer is already paging through, and an offset counted against a set that grew
 * underneath you SKIPS a row -- returning a total quietly too low, with `ok: true`, which is the
 * failure `performance.ts` refuses an unparseable row to avoid.
 *
 * Keyset cannot skip. It says "give me what comes strictly after this row in this order", and
 * anything inserted before the boundary is simply on a page the caller has already had.
 *
 * THE COST IS A FILTER THAT CAN BE WRONG OUT LOUD RATHER THAN QUIETLY. A keyset predicate is a
 * nested `or=(…)`, and if it is malformed PostgREST answers 400 and the adapter surfaces an error
 * on page two. An offset that skips a row answers 200. Loud and wrong beats silent and wrong, every
 * time, and only one of the two is discoverable by the person holding the numbers.
 *
 * THE ORDER, AND WHY IT IS FOUR COLUMNS. `envelope_rows_read_idx` is `(workspace_id, source, date
 * desc)`, so `date desc` leads and the range scan does not sort. `date` alone is not unique -- an
 * account has many entities on one day -- and a keyset boundary on a non-unique tuple skips the
 * rest of the tie. The unique constraint is `(workspace_id, source, account_id, entity_id, date,
 * attribution_window)`; workspace and source are fixed by the query, so the remaining four are
 * exactly what makes the order total.
 *
 * `attribution_window` IS NULLABLE, AND THAT IS THE WHOLE DIFFICULTY. An impressions-only row
 * legitimately has none, and SQL comparison against NULL yields NULL, so `attribution_window.gt.x`
 * silently drops every unlabelled row. Ordering it `asc.nullsfirst` puts NULL strictly below every
 * enum member, which makes "after this window" expressible in both cases: after a NULL is `not
 * is.null` (everything non-null sorts after it), and after a value is `gt.<value>` (the NULLs it
 * excludes are all before). Enum comparison uses definition order, which is the same order
 * PostgREST's `order` applies -- which is why `20260908001100_envelope_rows.sql` appends enum
 * members and never inserts them.
 *
 * THE CURSOR IS NOT SIGNED, DELIBERATELY. A forged one can only move the boundary WITHIN the
 * workspace, source and date range already fixed by the request -- the workspace comes from the
 * credential, and every other filter is ANDed with this one -- so the worst a caller can do with a
 * handmade cursor is skip their own rows. Signing it would buy nothing and would put a second
 * secret on the read path.
 */

import { StoreError } from "./postgrest.js";
import { quote } from "./postgrest.js";

/**
 * The boundary row, by the four columns that make the order total.
 *
 * Short keys because this is encoded into every response; long ones would buy readability for a
 * value that is opaque by contract.
 */
export interface Cursor {
  /** `date` */
  readonly d: string;
  /** `account_id` */
  readonly a: string;
  /** `entity_id` */
  readonly e: string;
  /** `attribution_window`, null on an unlabelled row. */
  readonly w: string | null;
}

/** The `order=` value. `nullsfirst` is load-bearing; see the module note. */
export const ORDER = "date.desc,account_id.asc,entity_id.asc,attribution_window.asc.nullsfirst";

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  let binary = "";
  for (const byte of new TextEncoder().encode(json)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Read a cursor back, or refuse.
 *
 * REFUSING IS THE POINT. The tempting alternative -- ignore a cursor that will not parse and return
 * page one -- hands a paging client the first page forever: it fetches, sees a cursor, fetches
 * again, gets the same rows, and either loops or double-counts. Both present as wrong numbers
 * rather than as an error. An unreadable cursor is a client bug and says so.
 */
export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new StoreError("`cursor` is not a cursor this endpoint issued", "bad_cursor");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new StoreError("`cursor` is not a cursor this endpoint issued", "bad_cursor");
  }
  const { d, a, e, w } = parsed as Record<string, unknown>;
  if (
    typeof d !== "string" ||
    typeof a !== "string" ||
    typeof e !== "string" ||
    !(typeof w === "string" || w === null)
  ) {
    throw new StoreError("`cursor` is not a cursor this endpoint issued", "bad_cursor");
  }
  return { d, a, e, w };
}

/**
 * The PostgREST predicate for "strictly after the cursor row", in the order above.
 *
 * Read it as the four ways a row can come later: an earlier date; the same date and a larger
 * account; the same account and a larger entity; the same entity and a later window. Each level
 * pins every column above it with `eq`, which is what makes the union exactly the tail and not an
 * overlapping smear.
 */
export function afterCursor(cursor: Cursor): string {
  const d = quote(cursor.d);
  const a = quote(cursor.a);
  const e = quote(cursor.e);
  // `not.is.null` rather than `gt.<nothing>`: under `nullsfirst` every labelled row sorts after
  // every unlabelled one, so "after a NULL window" is "has a window at all".
  const afterWindow =
    cursor.w === null ? "attribution_window.not.is.null" : `attribution_window.gt.${quote(cursor.w)}`;

  return (
    "(" +
    [
      `date.lt.${d}`,
      `and(date.eq.${d},account_id.gt.${a})`,
      `and(date.eq.${d},account_id.eq.${a},entity_id.gt.${e})`,
      `and(date.eq.${d},account_id.eq.${a},entity_id.eq.${e},${afterWindow})`,
    ].join(",") +
    ")"
  );
}
