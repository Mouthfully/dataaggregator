/**
 * FLAT TABLE ROW -> NESTED ENVELOPE ROW.
 *
 * `envelope_rows` is flat because a CHECK constraint has to see every metric as a column
 * (`20260908001100_envelope_rows.sql`), and the envelope is nested because §2 owns the wrapper and
 * prints `entity` and `dimensions` as objects. PostgREST cannot bridge those without a view or a
 * computed column -- both of which would be NEW DATABASE OBJECTS, and the read path was chosen
 * precisely because it needs none. So the reshape happens here, in fifty lines that a migration
 * does not have to be written for.
 *
 * THIS FUNCTION VALIDATES NOTHING, AND THAT IS DELIBERATE. `handlePerformance` re-validates every
 * row against `envelopeRowSchema` on the way out, and refuses the whole request when one fails --
 * refusal 1 and refusal 2 in `performance.ts`. A mapper that coerced, defaulted or repaired would
 * take rows the envelope would have rejected and make them emittable, which is the same as deleting
 * those refusals from a third file. So an unrecognised value is passed through UNCHANGED, and zod
 * gets to say no.
 *
 * THE ONE EXCEPTION IS NUMERIC, AND IT IS A RE-SPELLING RATHER THAN A REPAIR. PostgreSQL renders
 * `numeric` into JSON unquoted, so a metric normally arrives as a JSON number; a stack that renders
 * it as a decimal STRING is expressing the same value in the other legal spelling, and `Number()`
 * on it is lossless in exactly the way `JSON.parse` on the unquoted form already was. Nothing else
 * is touched: an empty string, an object or a boolean goes through as it came, `Number("nope")` is
 * NaN, and `z.number().finite()` refuses all of them.
 *
 * A NULL COLUMN IS AN ABSENT METRIC. Not a zero -- that fabricates a number nobody measured, and
 * "spend: 0" on a day with no spend data is the single most damaging lie this envelope could tell.
 * Not a null either -- `metricsSchema` is `.strict()` over optional numbers and would refuse it,
 * failing the request over a row that is perfectly sound. The same rule applies to `entity_name`
 * and `parent_id`, which the contract makes `.optional()` rather than `.nullable()`.
 *
 * `raw` IS NOT EMITTED. The column is `raw_key`, an R2 object key and never the payload (decision 3
 * in the migration's header). Handing a customer an internal storage key under a field the contract
 * documents as "verbatim platform response" would be wrong twice: it is not their data, and it
 * names our bucket layout. The field is optional; leaving it out is the honest answer until a read
 * path exists that can fetch the object.
 */

import { METRIC_COLUMNS } from "./postgrest.js";

/** A JSON number, or the same value spelled as a decimal string. Anything else is left alone. */
function numeric(value: unknown): unknown {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}

/** Present the key only when the column holds something. See "A NULL COLUMN IS AN ABSENT METRIC". */
function optional(key: string, value: unknown): Record<string, unknown> {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function toEnvelopeRow(raw: unknown): unknown {
  // Not an object at all: hand it to the validator exactly as it arrived rather than throwing here.
  // The request still fails -- it just fails with the envelope's own message naming the row index,
  // which is the failure the caller can act on.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const row = raw as Record<string, unknown>;

  const metrics: Record<string, unknown> = {};
  for (const name of METRIC_COLUMNS) {
    const value = row[name];
    if (value === null || value === undefined) continue;
    metrics[name] = numeric(value);
  }

  return {
    source: row.source,
    entity: {
      type: row.entity_type,
      id: row.entity_id,
      account_id: row.account_id,
      native_entity_type: row.native_entity_type,
      native_id: row.native_id,
      ...optional("name", row.entity_name),
      ...optional("parent_id", row.parent_id),
    },
    dimensions: {
      date: row.date,
      currency: row.currency,
      timezone: row.timezone,
      // Nullable in the contract as well as the column: an unlabelled row is a real row, and the
      // refusal that matters is "a conversion metric WITH a null window", which zod enforces.
      attribution_window: row.attribution_window ?? null,
    },
    metrics,

    // The four clocks, flat. `04-envelope-contract.md`: a single freshness timestamp cannot express
    // three of them. Do not group these.
    fetched_at: row.fetched_at,
    source_updated_at: row.source_updated_at ?? null,
    restates_until: row.restates_until ?? null,
    is_provisional: row.is_provisional,

    first_seen_at: row.first_seen_at,

    fx_source: row.fx_source ?? null,
    fx_rate_date: row.fx_rate_date ?? null,
    fx_rate: numeric(row.fx_rate) ?? null,
    fx_base: row.fx_base ?? null,
  };
}
