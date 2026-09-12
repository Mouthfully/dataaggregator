/**
 * NESTED ENVELOPE ROW -> FLAT TABLE ROW, and the one call that writes it.
 *
 * The exact inverse of `row.ts`, which reshapes flat columns into the nested envelope §2 prints.
 * This goes the other way, because `public.ingest_envelope_rows` takes the FLAT shape: it forwards
 * each element to `app.upsert_envelope_row`, whose parameters are the table's columns.
 *
 * WHY A SEPARATE FUNCTION RATHER THAN A REVERSED MAPPER. The two directions do not share a posture.
 * `toEnvelopeRow` validates NOTHING on purpose -- the read path re-validates on the way out and a
 * repairing mapper would smuggle rows past refusals that live in a third file. This direction wants
 * the opposite: a row the database will reject costs a network round trip and comes back as a
 * constraint name with no row index, so it is cheaper and far clearer to refuse it here, against
 * the same `envelopeRowSchema` the read path uses.
 *
 * THE TWO FIELDS THE ENVELOPE DOES NOT CARRY. `workspace_id` and `connection_id` are absent from
 * `EnvelopeRow` by design -- the envelope is the customer-facing shape and a customer does not need
 * to be told their own workspace id on every row. They are tenancy, so they arrive as CONTEXT and
 * are stamped on here. That also means a connector physically cannot choose a workspace: it never
 * sees one.
 *
 * METRIC KEYS COME FROM `METRIC_COLUMNS`, NEVER A HAND-WRITTEN LIST. That constant is
 * `Object.keys(METRICS)`, so a metric added to the dictionary is carried here the same day.
 * `scripts/check-dictionary.mjs` exists because FOUR hand-written metric lists in the schema had
 * already drifted; a fifth unguarded copy in TypeScript is exactly the failure it was written to
 * prevent, and it is the one place a guard could not see.
 */

import { type EnvelopeRow, envelopeRowSchema } from "@repo/contract";

import { METRIC_COLUMNS, type PostgrestConfig, StoreError, callPostgrest } from "./postgrest.js";
import { type CryptoLike, mintToken } from "./jwt.js";

/** Tenancy, which the envelope deliberately does not carry. */
export interface IngestContext {
  readonly workspaceId: string;
  /** Null for a source with no customer credential -- bought public data has no connection. */
  readonly connectionId: string | null;
}

/** The port. One method, for the same reason `PerformanceStore` has one. */
export interface IngestStorePort {
  write(rows: readonly EnvelopeRow[], context: IngestContext): Promise<number>;
}

/**
 * Flatten one validated envelope row into the shape the ingest function forwards.
 *
 * Exported for the tests, which assert the mapping rather than the round trip: a round-trip test
 * over a real PostgREST would pass on a mapper that dropped a field the fixture never set.
 */
export function toIngestRow(row: EnvelopeRow, context: IngestContext): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    workspace_id: context.workspaceId,
    connection_id: context.connectionId,

    source: row.source,

    account_id: row.entity.account_id,
    entity_id: row.entity.id,
    entity_type: row.entity.type,
    native_entity_type: row.entity.native_entity_type,
    native_id: row.entity.native_id,
    // `?? null` and not omission: the SQL forwarder reads every key with `->>`, which yields NULL
    // for an absent key anyway -- but being explicit here keeps the payload the same shape for
    // every row, which is what makes a diff of two payloads readable.
    entity_name: row.entity.name ?? null,
    parent_id: row.entity.parent_id ?? null,

    date: row.dimensions.date,
    currency: row.dimensions.currency,
    timezone: row.dimensions.timezone,
    attribution_window: row.dimensions.attribution_window,

    fetched_at: row.fetched_at,
    source_updated_at: row.source_updated_at,
    restates_until: row.restates_until,
    // `is_provisional` is NOT sent. The upsert DERIVES it from the preserved window and the new
    // fetch time -- that derivation is where "is_provisional eventually clears" stops being a claim
    // -- and a value supplied here would be ignored at best and misleading at worst.
    first_seen_at: row.first_seen_at,

    fx_source: row.fx_source,
    fx_rate_date: row.fx_rate_date,
    fx_rate: row.fx_rate,
    fx_base: row.fx_base,

    // `raw` is not `raw_key`. The contract's `raw` is the verbatim platform response; the column is
    // an R2 object key. Writing one into the other would put a payload in Postgres, which
    // `20260908001100_envelope_rows.sql` names as the cost line most likely to break the model.
    raw_key: null,
  };

  for (const name of METRIC_COLUMNS) {
    const value = (row.metrics as Record<string, number | undefined>)[name];
    flat[name] = value ?? null;
  }

  return flat;
}

export interface IngestStoreConfig extends PostgrestConfig {
  readonly crypto?: CryptoLike;
  /** Injected so a test asserts `iat`/`exp` exactly rather than racing a clock. */
  readonly now?: () => Date;
}

/**
 * The ingest store.
 *
 * MINTS `app_ingest`, WITH NO `workspace_id` CLAIM. The workspace is an argument to a function that
 * reaches the table through a `security definer` and does not consult row-level security, so a
 * claim here would be decoration that reads like a constraint -- the most expensive kind of comment.
 * The narrowing that does the work is the grant: `public.ingest_envelope_rows` is executable by
 * `app_ingest` and by nothing else, asserted from both directions in
 * `supabase/tests/07_anon_grants.sql` and executed as a tenant in `10_ingest_entry_point.sql`.
 */
export function createIngestStore(config: IngestStoreConfig): IngestStorePort {
  return {
    async write(rows, context) {
      // An empty batch is a real outcome -- a connector legitimately finds no orders on a quiet day
      // -- and is answered without a round trip. Sending `[]` would work; not sending it is one
      // fewer request on the quietest path, and the count is the same either way.
      if (rows.length === 0) return 0;

      const payload: Record<string, unknown>[] = [];
      for (const [index, row] of rows.entries()) {
        const parsed = envelopeRowSchema.safeParse(row);
        if (!parsed.success) {
          // REFUSING THE WHOLE BATCH, not skipping the row. A skipped row is a total quietly too
          // low -- the failure this product sells against -- and it would be written into the
          // store, where nothing downstream could ever tell it had been dropped.
          const first = parsed.error.issues[0];
          throw new StoreError(
            `refusing to write row ${index}: it does not satisfy the envelope` +
              `${first === undefined ? "" : ` (${first.path.join(".")}: ${first.message})`}. ` +
              "Writing the rest would store a total that is quietly too low.",
            "invalid_row",
          );
        }
        payload.push(toIngestRow(parsed.data, context));
      }

      const token = await mintToken({
        secret: config.jwtSecret,
        role: "app_ingest",
        now: (config.now ?? (() => new Date()))(),
        crypto: config.crypto,
      });

      const written = await callPostgrest(config, {
        path: "/rest/v1/rpc/ingest_envelope_rows",
        method: "POST",
        token,
        action: "write",
        body: { p_rows: payload },
      });

      // THE COUNT IS CHECKED, NOT TRUSTED. The function returns how many rows it forwarded, which
      // is the one cheap way to tell a partial write from a complete one -- and a silent partial
      // write is the same wrong total as a skipped row, arriving by a different route.
      if (typeof written !== "number" || written !== payload.length) {
        throw new StoreError(
          `sent ${payload.length} row(s) and the database reported ${JSON.stringify(written)}`,
          "upstream",
        );
      }

      return written;
    },
  };
}
