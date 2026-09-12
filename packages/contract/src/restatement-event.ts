/**
 * THE RESTATEMENT EVENT.
 *
 * Specification section 4.2: "When Meta restates a 28-day window or Google Ads credits a late
 * conversion back to its click date, the row changes. A `restated` webhook with the BEFORE AND AFTER
 * VALUES is the alert every analyst wants and no incumbent sends."
 *
 * `revised_from` lives here and nowhere else. `00-repo-map.md` adopted it from the artboard
 * deliberately "placed in the restatement webhook payload, NOT on the read row" -- because a read
 * row is a statement about what is true now, and carrying its own history would make every row a
 * changelog nobody asked for.
 *
 * WHAT THIS SCHEMA IS AND IS NOT RESPONSIBLE FOR.
 *
 * The event is DERIVED from a row that the database has already validated: the conversion refusal,
 * the commerce refusal and the fx rule are enforced by `envelopeRowSchema` and by check constraints
 * on `envelope_rows`, and an event cannot exist without a row that passed both. Re-asserting them
 * here would duplicate logic that cannot disagree, and duplicated logic that cannot disagree is
 * exactly the kind that eventually does.
 *
 * What only THIS schema can be wrong about is the DIFF, so that is what it refuses:
 *
 *   1. An empty `revised_from` -- nothing moved, so there is no restatement to announce.
 *   2. A key in `revised_from` that is not a metric in the dictionary.
 *   3. A key in `revised_from` whose value EQUALS the current one. An event saying a number was
 *      revised, from and to the same value, is a false statement about the customer's data, and it
 *      is the failure this whole feature exists to avoid producing at scale.
 */

import { z } from "zod";
import { ATTRIBUTION_WINDOWS } from "./attribution.ts";
import { ENTITY_TYPES } from "./envelope.ts";
import { METRICS, type MetricName } from "./metrics.ts";
import { SOURCES } from "./source.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a calendar date, YYYY-MM-DD");

const rfc3339 = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}-\d{2}T/.test(v), {
    message: "must be an RFC3339 timestamp",
  });

const metricMap = z
  .object(
    Object.fromEntries(
      Object.keys(METRICS).map((name) => [name, z.number().finite().optional()]),
    ) as Record<MetricName, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

const shape = z.object({
  /**
   * One literal today. It is a field rather than an implication so a consumer's switch statement
   * does not have to be rewritten the day a `finalised` event exists.
   */
  type: z.literal("restated"),
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  occurred_at: rfc3339,

  source: z.enum(SOURCES),

  /**
   * Enough to fetch the row back through `GET /v1/performance`, and no more. The event deliberately
   * omits `native_entity_type`, `native_id` and `name`: they are the platform's own vocabulary,
   * they can change without the numbers changing, and a consumer keying on them would be reacting
   * to a rename.
   */
  entity: z.object({
    type: z.enum(ENTITY_TYPES),
    id: z.string().min(1),
    account_id: z.string().min(1),
  }),

  dimensions: z.object({
    date: isoDate,
    currency: z.string().regex(/^[A-Z]{3}$/, "ISO 4217, uppercase"),
    attribution_window: z.enum(ATTRIBUTION_WINDOWS).nullable(),
  }),

  /** Every metric the row now carries. */
  metrics: metricMap,

  /**
   * ONLY the metrics whose value changed, with what they were. A metric absent here did not move;
   * one present here moved, and `metrics` says where to.
   *
   * A value may be revised to ABSENT -- a platform can stop reporting a metric it once did -- which
   * is why a key here need not appear in `metrics` at all.
   */
  revised_from: metricMap,

  // The clocks as they stood when the change was seen. A restatement inside an open window and one
  // that arrived after the window should have closed are different events to a reader, and only
  // these fields tell them apart.
  fetched_at: rfc3339,
  first_seen_at: rfc3339,
  restates_until: rfc3339.nullable(),
  is_provisional: z.boolean(),
});

export const restatementEventSchema = shape.superRefine((event, ctx) => {
  const revised = Object.keys(event.revised_from) as MetricName[];

  if (revised.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["revised_from"],
      message:
        "refusing to emit a restatement with an empty diff: nothing changed, so there is nothing " +
        "to announce (specification section 4.2 requires before and after values)",
    });
    return;
  }

  const unmoved = revised.filter((name) => event.revised_from[name] === event.metrics[name]);
  if (unmoved.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["revised_from"],
      message:
        `refusing to emit a restatement that did not restate: ${unmoved.join(", ")} appear in ` +
        "revised_from with the same value they carry now. An event saying a number changed, from " +
        "and to the same number, is a false statement about the customer's data.",
    });
  }
});

export type RestatementEvent = z.infer<typeof restatementEventSchema>;
