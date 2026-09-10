/**
 * WooCommerce -> envelope.
 *
 * The connector unit shape is specification section 13.3: `sources/<name>/{client, normalize,
 * backfill, fixtures, contract.test}`. This is the `normalize` half. GA4's equivalent lists four
 * traps; WooCommerce has five, and the first two are the expensive ones because each produces a
 * plausible wrong number rather than an error.
 *
 * 1. DATES CARRY NO TIMEZONE DESIGNATOR, INCLUDING THE `_gmt` ONES. WooCommerce returns
 *    `"2026-09-08T14:23:11"` -- no `Z`, no offset -- for `date_created_gmt` as well as
 *    `date_created`. ECMAScript parses a date-time string with no designator as LOCAL time, so
 *    `new Date(order.date_created_gmt)` in a Worker is silently shifted by the runtime's offset.
 *    The `_gmt` fields ARE UTC; they just do not say so. `Z` is appended explicitly here, and the
 *    non-GMT variants are never read at all.
 *
 * 2. `fee_lines` IS NOT A PAYMENT FEE. It is a merchant-authored surcharge -- a delivery charge, a
 *    packaging fee -- and it ADDS to the order total. Reading it as a cost does not merely produce
 *    a wrong number, it INVERTS THE SIGN on the one figure this product exists to compute. It is
 *    deliberately never mapped to `fees`.
 *
 * 3. CORE WOOCOMMERCE EXPOSES NO PAYMENT-PROCESSOR FEE AT ALL. The real cost of taking the money
 *    exists only as gateway-specific entries in `meta_data`, which some gateways write and many do
 *    not. So `fees` is emitted only when a key this module recognises is present, and is ABSENT
 *    otherwise -- never zero. Zero would assert that the merchant paid nothing to be paid, which
 *    makes margin look better than it is, and a wrong zero is indistinguishable from a real one.
 *    `net_revenue` follows it: see THE REFUSAL below.
 *
 * 4. REFUND TOTALS ARRIVE ALREADY NEGATIVE. WooCommerce reports `refunds[].total` as `"-45.00"`.
 *    They are ADDED, never subtracted. Subtracting them would double the refund and turn a
 *    partially-refunded order into a negative sale.
 *
 * 5. THERE IS NO TOP-LEVEL `subtotal` ON AN ORDER. `subtotal` exists on a line item only. Reaching
 *    for `order.subtotal` yields undefined, and a normaliser that coerced it would write zero.
 *
 * THE REFUSAL, and the reason this file is shorter than it could be. `net_revenue` means what an
 * owner actually keeps (`@repo/contract`'s metric dictionary: "gross minus what the platform
 * kept"). When the payment fee is unknowable -- trap 3, which is the common case rather than the
 * edge -- that number cannot be computed, so it is NOT EMITTED. A `net_revenue` that silently
 * omitted an unknown deduction would be exactly the "smaller truth that is the wrong number" 11A.2
 * warns against, and it would be wrong in the flattering direction. Revenue and orders are emitted
 * always; `net_revenue` appears only alongside a `fees` figure that is actually known.
 */

import type { EnvelopeRow, MetricName } from "@repo/contract";
import { isProvisional, restatesUntil } from "@repo/contract";

/** The subset of an order this reads. Everything else in the response is ignored. */
export interface WooOrder {
  readonly id?: number;
  readonly number?: string;
  readonly status?: string;
  readonly currency?: string;
  /** UTC, despite carrying no designator. See trap 1. */
  readonly date_created_gmt?: string;
  readonly date_modified_gmt?: string;
  readonly total?: string;
  readonly refunds?: ReadonlyArray<{ id?: number; total?: string }>;
  readonly meta_data?: ReadonlyArray<{ key?: string; value?: unknown }>;
  readonly payment_method?: string;
}

export type WooNormalizeErrorCode =
  | "missing_id"
  | "missing_date"
  | "missing_currency"
  | "unparseable_value"
  | "unparseable_date";

export class WooNormalizeError extends Error {
  constructor(
    message: string,
    readonly code: WooNormalizeErrorCode,
  ) {
    super(message);
    this.name = "WooNormalizeError";
  }
}

/**
 * Gateway meta keys that carry a real payment-processor fee, and the ONLY route to `fees`.
 *
 * Deliberately a short allow-list rather than a pattern. A heuristic over `meta_data` -- anything
 * matching /fee/ -- would sweep up a shipping plugin's `_delivery_fee` (a charge TO the customer,
 * trap 2's sign error again) and any other plugin's idea of the word. A key earns a place here by
 * being read against a real response from that gateway, not by looking plausible.
 *
 * Most gateways write nothing at all, which is the finding rather than a gap in this list.
 */
export const WOO_FEE_META_KEYS: readonly string[] = ["_stripe_fee", "_wcpay_transaction_fee"];

/** WooCommerce sends money as strings. Refuses rather than coercing, for GA4's reason. */
export function parseWooAmount(value: string | undefined, field: string): number {
  if (value === undefined || value.trim() === "") {
    throw new WooNormalizeError(`woocommerce: ${field} has no value`, "unparseable_value");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new WooNormalizeError(
      `woocommerce: ${field} is ${JSON.stringify(value)}, which is not a number. Refusing rather ` +
        "than coercing to zero, because a wrong zero is indistinguishable from a real one.",
      "unparseable_value",
    );
  }
  return parsed;
}

/**
 * A WooCommerce `_gmt` timestamp to the calendar date it falls on, in UTC.
 *
 * THE `Z` IS THE WHOLE FUNCTION. See trap 1: without it the runtime reads a UTC instant as local
 * time, and an order placed at 23:30 UTC lands on the wrong day in any positive-offset timezone --
 * which is every timezone this product sells into.
 */
export function wooGmtToDate(value: string | undefined, field: string): string {
  if (value === undefined || value.trim() === "") {
    throw new WooNormalizeError(`woocommerce: ${field} is missing`, "missing_date");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new WooNormalizeError(
      `woocommerce: ${field} is ${JSON.stringify(value)}, which is not the ` +
        "YYYY-MM-DDTHH:MM:SS shape WooCommerce documents. Refusing rather than guessing whether it " +
        "carries an offset.",
      "unparseable_date",
    );
  }
  const ms = Date.parse(`${value}Z`);
  if (Number.isNaN(ms)) {
    throw new WooNormalizeError(`woocommerce: ${field} is unparseable`, "unparseable_date");
  }
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The payment fee, or null when no gateway wrote one.
 *
 * Null and zero are different answers and the difference is the point: null is "nobody told us",
 * zero is "it cost nothing to take the money". Only one of those is ever true.
 */
export function wooPaymentFee(order: WooOrder): number | null {
  for (const entry of order.meta_data ?? []) {
    if (entry.key === undefined || !WOO_FEE_META_KEYS.includes(entry.key)) continue;
    const raw = typeof entry.value === "number" ? String(entry.value) : entry.value;
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const parsed = Number(raw);
    // A gateway writing something unparseable is treated as having written nothing, rather than as
    // an error: the fee is optional by nature, and one malformed meta value must not fail an
    // otherwise-good order.
    if (Number.isFinite(parsed)) return Math.abs(parsed);
  }
  return null;
}

export interface WooNormalizeOptions {
  readonly orders: readonly WooOrder[];
  /** The merchant's store origin, e.g. "https://shop.example.com". The account this row belongs to. */
  readonly storeUrl: string;
  /** IANA timezone the store reports in. The envelope requires one and there is no default. */
  readonly timezone: string;
  /** RFC3339. When this pull happened. */
  readonly fetchedAt: string;
  /** RFC3339. Immutable per row; see @repo/contract's restatement note. */
  readonly firstSeenAt: string;
}

/**
 * Turn a page of orders into envelope rows, one row per order.
 *
 * Throws rather than skipping. A connector that silently drops an order produces a number that is
 * quietly too low, which is the failure this product sells against.
 *
 * ONE ROW PER ORDER is a choice, and `24-commerce-grain.md` §6 records that per-order versus
 * per-day is open with a cost difference of about three orders of magnitude. Per-order is taken
 * here because a refund restates ONE order and the envelope's upsert key can address it; a daily
 * aggregate would have to be recomputed from a re-pull of the whole day to move by one refund.
 * Both remain expressible, and the aggregate can be built from these rows later. It cannot be
 * decomposed back the other way.
 */
export function normalizeWooOrders(options: WooNormalizeOptions): EnvelopeRow[] {
  const rows: EnvelopeRow[] = [];

  for (const order of options.orders) {
    if (order.id === undefined) {
      throw new WooNormalizeError(
        "woocommerce: an order carries no id. Every envelope row is keyed on an entity id and the " +
          "upsert key requires one.",
        "missing_id",
      );
    }
    if (!order.currency) {
      throw new WooNormalizeError(
        `woocommerce: order ${order.id} carries no currency. Defaulting it would mislabel every ` +
          "monetary value on the row.",
        "missing_currency",
      );
    }

    const date = wooGmtToDate(order.date_created_gmt, `order ${order.id} date_created_gmt`);
    const gross = parseWooAmount(order.total, `order ${order.id} total`);

    // Trap 4: refund totals are already negative, so they are ADDED.
    let refunded = 0;
    for (const refund of order.refunds ?? []) {
      refunded += parseWooAmount(refund.total, `order ${order.id} refund ${refund.id} total`);
    }

    const fee = wooPaymentFee(order);

    const metrics: Partial<Record<MetricName, number>> = {
      orders: 1,
      // Gross as the source reports it. A refund does not un-place the order, so `orders` stays 1
      // and the money moves instead.
      revenue: gross + refunded,
    };
    if (fee !== null) {
      metrics.fees = fee;
      // Emitted ONLY here. See THE REFUSAL in the module note.
      metrics.net_revenue = gross + refunded - fee;
    }

    const restates = restatesUntil({
      source: "woocommerce",
      date,
      firstSeenAt: options.firstSeenAt,
    });

    rows.push({
      source: "woocommerce",
      entity: {
        type: "order",
        id: `wc_${order.id}`,
        account_id: options.storeUrl,
        native_entity_type: "shop_order",
        native_id: String(order.id),
      },
      dimensions: {
        date,
        currency: order.currency,
        timezone: options.timezone,
        // NULL, AND THE ENVELOPE PERMITS IT ONLY BECAUSE THIS IS AN `order` ENTITY. The second
        // refusal in `envelopeRowSchema` rejects a commerce metric on an ADVERTISING entity with no
        // window, because there the platform could only have produced it by attributing. A shop's
        // own order is attributed to nothing; a window here would be a label with nothing to label.
        attribution_window: null,
      },
      metrics,
      fetched_at: options.fetchedAt,
      // WooCommerce DOES publish a per-row last-modified, unlike GA4, and it is the field the
      // incremental pull filters on. Reporting it is what lets a reader see that a row moved.
      source_updated_at: order.date_modified_gmt
        ? new Date(`${order.date_modified_gmt}Z`).toISOString()
        : null,
      restates_until: restates,
      is_provisional: isProvisional(restates, new Date(options.fetchedAt)),
      first_seen_at: options.firstSeenAt,
      // The store reports in its own currency and converts nothing.
      fx_source: null,
      fx_rate_date: null,
      fx_rate: null,
      fx_base: null,
      raw: order,
    });
  }

  return rows;
}
