/**
 * THE ENVELOPE. Kickoff non-negotiable 5, and the contract every read returns.
 *
 * Reconciled from the four shapes the specification prints, which do not agree (`00-repo-map.md`
 * section 4): section 2 is a response wrapper, section 7 is a flat data row, section 13.3 gives a
 * third with a nested `freshness` object that section 7 explicitly refutes, and the design artboard
 * prints a fourth. Section 2 defers to section 7 for the field specification, and the kickoff
 * requires "the envelope in section 2 and section 7", so:
 *
 *   SECTION 7 owns the ROW.   SECTION 2 owns the WRAPPER.
 *
 * The four freshness fields stay FLAT at the top level. Section 7, line 762, verbatim: "A single
 * `freshness` timestamp cannot express three clocks, which is why the field set splits into
 * fetched_at, source_updated_at, restates_until and is_provisional." Grouping them back into a
 * `freshness` object, which is what section 13.3 does and what a reviewer proposed during phase 0,
 * is the one change that would quietly undo the whole point.
 *
 * `entity` and `dimensions` keep section 2's nesting, because that is section 2's own printed shape
 * and the only one carrying a canonical entity id.
 *
 * FIVE FIELDS ARE ADDED that the specification requires elsewhere and prints nowhere:
 *
 *   account_id     named in the section 7 upsert key, absent from both printed envelopes
 *   entity_id      likewise; without both, a caller cannot reproduce a row's identity
 *   timezone       sections 3.1 and 4.4 sell timezone normalisation as a guarantee co-equal with
 *                  currency, and the head-to-head table in 4.4 sells it against Supermetrics and
 *                  Windsor. No envelope carries the field. Without it the guarantee is unshippable
 *                  and the comparison is false advertising.
 *   fx_rate        section 13.3 requires "the rate and source recorded on the row"; sections 2 and
 *                  7 record only the source and the date. A source and a date cannot reproduce a
 *                  conversion when ECB publishes on business days only and the carry-forward rule
 *                  is unspecified, and section 7's own rationale is that customers must be able to
 *                  audit the number.
 *   first_seen_at  the immutable anchor for restates_until. See ./restatement.ts.
 *
 * `is_final` appears nowhere. Sections 4.2, 13.3 and 13.4 use it; sections 2, 7, 4.4, 15 and the
 * kickoff use `is_provisional`. Emitting both a flag and its complement is how they drift apart.
 */

import { z } from "zod";
import { ATTRIBUTION_WINDOWS } from "./attribution.ts";
import { COMMERCE_METRICS, CONVERSION_METRICS, METRICS } from "./metrics.ts";
import { SOURCES } from "./source.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a calendar date, YYYY-MM-DD");

const rfc3339 = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}-\d{2}T/.test(v), {
    message: "must be an RFC3339 timestamp",
  });

/**
 * The canonical grain, from the `dbt_ad_reporting` hierarchy (specification section 7).
 *
 * `order` is an ADDITION to that hierarchy, made under 13.3 rule 2 by decision 11A.14. The upstream
 * package is ad-centric and stops at `ad`; the launch connector set is three commerce sources, and
 * a WooCommerce or Shopify feed has no grain in this list to land on. A row may be one order
 * (`entity_id` is the order id) or a day's orders at `account` grain -- both are expressible, and
 * which a connector chooses is the connector's decision, not the dictionary's.
 */
export const ENTITY_TYPES = [
  "account",
  "campaign",
  "ad_group",
  "ad",
  "keyword",
  "search_term",
  "url",
  "geo",
  "property",
  "page",
  "query",
  "order",
] as const;

/**
 * The subset of the grain that describes ADVERTISING, where a commerce figure can only be an
 * attributed one. See the second refusal in `envelopeRowSchema`.
 *
 * `account` is deliberately absent. An account is an ad account on Google and a shop on
 * WooCommerce, so a day's orders at account grain is an honest unattributed count.
 */
export const ADVERTISING_ENTITY_TYPES = [
  "campaign",
  "ad_group",
  "ad",
  "keyword",
  "search_term",
] as const satisfies readonly (typeof ENTITY_TYPES)[number][];

export const entitySchema = z.object({
  type: z.enum(ENTITY_TYPES),
  id: z.string().min(1),
  /**
   * Half of the upsert key `(source, account_id, entity_id, date, attribution_window)`, and absent
   * from every printed envelope in the specification.
   */
  account_id: z.string().min(1),
  /**
   * The platform's own vocabulary, carried honestly rather than hidden: Meta says "adset" where the
   * canonical grain says "ad_group" (specification section 7).
   */
  native_entity_type: z.string().min(1),
  native_id: z.string().min(1),
  name: z.string().optional(),
  parent_id: z.string().optional(),
});

export const dimensionsSchema = z.object({
  date: isoDate,
  currency: z.string().regex(/^[A-Z]{3}$/, "ISO 4217, uppercase"),
  /** IANA name. See the note above on why this field exists at all. */
  timezone: z.string().min(1),
  attribution_window: z.enum(ATTRIBUTION_WINDOWS).nullable(),
});

export const metricsSchema = z
  .object(
    Object.fromEntries(
      Object.keys(METRICS).map((name) => [name, z.number().finite().optional()]),
    ) as Record<keyof typeof METRICS, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

const rowShape = z.object({
  source: z.enum(SOURCES),
  entity: entitySchema,
  dimensions: dimensionsSchema,
  metrics: metricsSchema,

  // The four clocks, flat. Do not group these.
  fetched_at: rfc3339,
  source_updated_at: rfc3339.nullable(),
  restates_until: rfc3339.nullable(),
  is_provisional: z.boolean(),

  /** Immutable insert-time anchor. Never rewritten by a re-pull. */
  first_seen_at: rfc3339,

  fx_source: z.string().min(1).nullable(),
  fx_rate_date: isoDate.nullable(),
  fx_rate: z.number().positive().nullable(),
  fx_base: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),

  /** Verbatim platform response. Every unified API that survived had one (section 2). */
  raw: z.unknown().optional(),
});

/**
 * THE REFUSAL. Specification section 2 and section 4.4: "The API refuses to emit an unlabelled
 * conversion count."
 *
 * A TypeScript type refuses nothing at runtime, so the rule lives here. A row carrying any
 * conversion metric must carry an attribution window. A row with no conversion metric may leave it
 * null, because a window on an impressions-only row would be a label with nothing to label.
 */
export const envelopeRowSchema = rowShape.superRefine((row, ctx) => {
  const present = CONVERSION_METRICS.filter((name) => row.metrics[name] !== undefined);
  if (present.length > 0 && row.dimensions.attribution_window === null) {
    ctx.addIssue({
      code: "custom",
      path: ["dimensions", "attribution_window"],
      message:
        `refusing to emit an unlabelled conversion count: ${present.join(", ")} present with no ` +
        "attribution_window (specification section 2). Use account_default or model where the " +
        "platform exposes no selectable window.",
    });
  }

  // THE SECOND REFUSAL, and the same rule as the first applied to the commerce grain added by
  // 11A.14. `orders`, `revenue`, `net_revenue`, `fees` and `commission` are unattributed counts of
  // a shop's own money -- until they appear on a campaign, an ad group, an ad, a keyword or a
  // search term, where the platform can only have produced them by attributing. A marketplace ad
  // platform reporting "orders from this campaign" is reporting a conversion; letting it through
  // under a name the first refusal does not cover would be the whole guarantee lost to a synonym.
  const commerce = COMMERCE_METRICS.filter((name) => row.metrics[name] !== undefined);
  const advertising = (ADVERTISING_ENTITY_TYPES as readonly string[]).includes(row.entity.type);
  if (commerce.length > 0 && advertising && row.dimensions.attribution_window === null) {
    ctx.addIssue({
      code: "custom",
      path: ["dimensions", "attribution_window"],
      message:
        `refusing to emit an unlabelled attributed figure: ${commerce.join(", ")} present on a ` +
        `${row.entity.type} entity with no attribution_window. A commerce metric on an ` +
        "advertising entity is an attributed number and carries the same obligation as a " +
        "conversion count (specification section 2, decision 11A.14).",
    });
  }

  // A converted amount must carry the rate that produced it, not only its provenance.
  const currencyMetric = (Object.keys(row.metrics) as (keyof typeof METRICS)[]).find(
    (name) => METRICS[name].unit === "currency" && row.metrics[name] !== undefined,
  );
  if (currencyMetric && row.fx_source !== null && row.fx_rate === null) {
    ctx.addIssue({
      code: "custom",
      path: ["fx_rate"],
      message:
        "a converted amount must carry the rate that produced it, not only its source and date " +
        "(specification section 13.3; section 7 requires the number be auditable)",
    });
  }
});

export type EnvelopeRow = z.infer<typeof envelopeRowSchema>;

/**
 * The response wrapper, from section 2, extended with `data[]`.
 *
 * Sections 2 and 7 both print a SINGLE row and neither defines a multi-row form, which every real
 * read returns. The artboard's `data[]` is the shape worth adopting; its other inventions are not
 * (`00-repo-map.md` section 4).
 */
export const envelopeSchema = z.object({
  ok: z.literal(true),
  module: z.enum(["performance", "visibility", "diagnose", "watch", "reconcile"]),
  source: z.enum(SOURCES),
  data: z.array(envelopeRowSchema),
  meta: z.object({
    schema: z.literal("v1"),
    request_id: z.string().min(1),
    /**
     * Zero for performance reads. Section 11.3 replaced per-row credits with per-connected-account
     * monthly metering, so section 8's `/v1/performance` credit row is dead; the field stays because
     * credits still meter SERP, AI answers and composite calls.
     */
    credits_used: z.number().int().nonnegative(),
    /** Bitemporal read: the data as the platform reported it on this date (section 2). */
    as_of: isoDate.optional(),
    /**
     * A DELIBERATE ADDITION TO SECTION 2's WRAPPER, made under section 13.3 rule 2 rather than
     * smuggled in.
     *
     * The specification prints no pagination at all, and neither section 2 nor section 7 defines a
     * multi-row response in the first place. But a read endpoint has to bound its result set -- an
     * unbounded one is a memory limit waiting to be hit on the largest customer -- and a bounded
     * result with no cursor is an endpoint that cannot return page two. The alternatives were a
     * `Link` header, which JSON clients ignore, or an unbounded response, which is the failure it
     * is meant to prevent.
     *
     * Absent when there is no further page, rather than null: "no more" and "did not say" are
     * different, and only one of them should make a client fetch again.
     */
    next_cursor: z.string().min(1).optional(),
  }),
});

export type Envelope = z.infer<typeof envelopeSchema>;

/** The upsert key, verbatim from section 7. The one statement about the store's primary key. */
export function upsertKey(row: EnvelopeRow): string {
  return [
    row.source,
    row.entity.account_id,
    row.entity.id,
    row.dimensions.date,
    row.dimensions.attribution_window ?? "none",
  ].join(" ");
}
