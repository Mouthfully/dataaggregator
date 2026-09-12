import { envelopeRowSchema } from "@repo/contract";
import { REDACTION_POLICIES, redactValue } from "@repo/payloads";
import { describe, expect, it } from "vitest";
import { ORDER, ORDER_REFUNDED, ORDER_WITH_STRIPE_FEE, PAGE } from "./fixtures.ts";
import {
  WooNormalizeError,
  assertWooTimezone,
  normalizeWooOrders,
  wooGmtToDate,
  wooPaymentFee,
} from "./normalize.ts";

const OPTS = {
  storeUrl: "https://shop.example.com",
  timezone: "Asia/Bangkok",
  fetchedAt: "2026-09-10T02:00:00.000Z",
  firstSeenAt: "2026-09-10T02:00:00.000Z",
};

describe("the envelope contract", () => {
  it("emits rows the envelope accepts", () => {
    for (const row of normalizeWooOrders({ ...OPTS, orders: PAGE })) {
      const result = envelopeRowSchema.safeParse(row);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("carries commerce metrics on an `order` entity with no attribution window", () => {
    // The second refusal rejects a commerce metric on an ADVERTISING entity with a null window. A
    // shop's own order is attributed to nothing, so null is correct here and must stay permitted --
    // this asserts the two rules do not collide.
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER] });
    expect(row?.entity.type).toBe("order");
    expect(row?.dimensions.attribution_window).toBeNull();
    expect(row?.metrics.orders).toBe(1);
    expect(envelopeRowSchema.safeParse(row).success).toBe(true);
  });

  it("never marks a row final, because no WooCommerce window ever closes", () => {
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER] });
    expect(row?.restates_until).toBeNull();
    expect(row?.is_provisional).toBe(true);
  });
});

describe("trap 1: dates carry no timezone designator, and UTC is not where it ends", () => {
  // THIS SUITE RUNS IN ASIA/BANGKOK -- see vitest.config.ts. In UTC these assertions are
  // WORTHLESS: dropping the `Z` gives the identical string, so the test passes either way. That is
  // not a hypothesis, it is what a mutation run showed. An earlier version of this comment claimed
  // asserting "on the value rather than the runtime" was enough; it was wrong, and the mutation is
  // what proved it.
  //
  // THERE ARE NOW TWO CONVERSIONS AND THEY FAIL DIFFERENTLY. The `Z` turns a designator-less string
  // into the right INSTANT; the store's zone turns that instant into the right DAY. The whole-day
  // loop below separates all three readings -- correct, no `Z`, and no zone -- because each puts a
  // different set of hours on a different date.
  it("reads a _gmt timestamp as UTC rather than as the runtime's local time", () => {
    // 02:00 UTC is 09:00 in Bangkok on the same day. Read as Bangkok LOCAL it would be
    // 2026-09-08T19:00Z, which is still the 9th in Bangkok -- so this case alone does not separate
    // the two readings, and the loop below is what does.
    expect(wooGmtToDate("2026-09-09T02:00:00", "t", "Asia/Bangkok")).toBe("2026-09-09");
  });

  it("holds for a whole day of timestamps, not just the one that happens to break", () => {
    // UTC+7. Hours 00:00-16:59 UTC are the same calendar day in Bangkok; 17:00 onwards is the
    // NEXT one. Three readings, three different answers:
    //
    //   correct        -> 17 hours on the 9th, 7 on the 10th   (asserted below)
    //   no `Z`         -> the wall-clock string's own date, so 24 hours on the 9th
    //   no zone (UTC)  -> 24 hours on the 9th
    //
    // So the last seven iterations fail under either mutation, which is the property the previous
    // version of this loop did not have: it asserted the 9th for all 24 hours, which is exactly
    // what a normaliser ignoring the store's zone produces.
    for (let hour = 0; hour < 24; hour++) {
      const stamp = `2026-09-09T${String(hour).padStart(2, "0")}:00:00`;
      const expected = hour < 17 ? "2026-09-09" : "2026-09-10";
      expect(wooGmtToDate(stamp, "t", "Asia/Bangkok"), stamp).toBe(expected);
    }
  });

  it("puts the same instant on different days for stores in different zones", () => {
    const stamp = "2026-09-09T20:15:00";
    expect(wooGmtToDate(stamp, "t", "Asia/Bangkok")).toBe("2026-09-10");
    expect(wooGmtToDate(stamp, "t", "UTC")).toBe("2026-09-09");
    expect(wooGmtToDate(stamp, "t", "America/New_York")).toBe("2026-09-09");
  });

  it("refuses a timestamp that does carry an offset, rather than guessing", () => {
    expect(() => wooGmtToDate("2026-09-08T23:30:00+07:00", "t", "Asia/Bangkok")).toThrow(
      WooNormalizeError,
    );
  });

  it("refuses a zone it does not know, rather than labelling rows with it", () => {
    expect(() => assertWooTimezone("")).toThrow(WooNormalizeError);
    expect(() => assertWooTimezone("Mars/Olympus")).toThrow(WooNormalizeError);
    expect(() => assertWooTimezone("Asia/Bangkok")).not.toThrow();
  });
});

describe("trap 2: fee_lines is a surcharge, not a payment fee", () => {
  it("never reads a merchant surcharge as a cost", () => {
    // ORDER carries a fee_lines entry of 40.00. Mapping it to `fees` would invert the sign on the
    // product's headline number: a charge TO the customer counted as a cost TO the merchant.
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER] });
    expect(row?.metrics.fees).toBeUndefined();
  });
});

describe("trap 3 and the refusal: an unknown fee is absent, never zero", () => {
  it("omits `fees` when no gateway wrote one", () => {
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER] });
    expect(row?.metrics.fees).toBeUndefined();
    expect(row?.metrics.fees).not.toBe(0);
  });

  it("omits `net_revenue` entirely when the fee is unknown", () => {
    // THE REFUSAL. net_revenue means what the owner keeps; with an unknown deduction it cannot be
    // computed, and emitting it anyway would be wrong in the flattering direction.
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER] });
    expect(row?.metrics.net_revenue).toBeUndefined();
  });

  it("emits both once a gateway fee is actually present", () => {
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER_WITH_STRIPE_FEE] });
    expect(row?.metrics.fees).toBeCloseTo(32.5, 10);
    expect(row?.metrics.net_revenue).toBeCloseTo(1000 - 32.5, 10);
  });

  it("reads only fee keys it recognises, not anything shaped like a fee", () => {
    // A shipping plugin's `_delivery_fee` is a charge to the CUSTOMER. Sweeping it up by pattern
    // would repeat trap 2 through a different door.
    expect(wooPaymentFee({ meta_data: [{ key: "_delivery_fee", value: "60.00" }] })).toBeNull();
  });
});

describe("trap 4: refund totals arrive already negative", () => {
  it("adds refunds rather than subtracting them", () => {
    // 1000.00 gross, one refund of -250.00. Subtracting would give 1250, which reads as a BIGGER
    // sale after a partial refund.
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER_REFUNDED] });
    expect(row?.metrics.revenue).toBeCloseTo(750, 10);
  });

  it("keeps the order counted after a refund", () => {
    const [row] = normalizeWooOrders({ ...OPTS, orders: [ORDER_REFUNDED] });
    expect(row?.metrics.orders).toBe(1);
  });
});

describe("refusals", () => {
  it("refuses an order with no id rather than emitting an unaddressable row", () => {
    expect(() => normalizeWooOrders({ ...OPTS, orders: [{ ...ORDER, id: undefined }] })).toThrow(
      /no id/,
    );
  });

  it("refuses an order with no currency rather than defaulting one", () => {
    expect(() =>
      normalizeWooOrders({ ...OPTS, orders: [{ ...ORDER, currency: undefined }] }),
    ).toThrow(/no currency/);
  });

  it("refuses an unparseable total rather than coercing it to zero", () => {
    expect(() => normalizeWooOrders({ ...OPTS, orders: [{ ...ORDER, total: "N/A" }] })).toThrow(
      /not a number/,
    );
  });
});

describe("the redaction keep-list, against the same fixture the normaliser reads", () => {
  const policy = REDACTION_POLICIES.woocommerce;

  it("is a redact policy with a keep-list", () => {
    expect(policy.disposition).toBe("redact");
    expect(policy.keep).toBeDefined();
  });

  it("removes everything that identifies the buyer", () => {
    const { value } = redactValue(ORDER, policy.keep ?? new Set());
    const kept = value as Record<string, unknown>;
    for (const key of [
      "billing",
      "shipping",
      "customer_note",
      "customer_ip_address",
      "customer_user_agent",
      "customer_id",
      "meta_data",
    ]) {
      expect(kept[key], `${key} survived redaction`).toBeUndefined();
    }
    // And nothing from the buyer survives anywhere in the serialised result, at any depth.
    const serialised = JSON.stringify(kept);
    for (const secret of ["Somchai", "somchai@", "0812345678", "Sukhumvit", "10110"]) {
      expect(serialised, `${secret} survived redaction`).not.toContain(secret);
    }
  });

  it("keeps everything the number is computed from", () => {
    const { value } = redactValue(ORDER, policy.keep ?? new Set());
    const kept = value as Record<string, unknown>;
    expect(kept.id).toBe(ORDER.id);
    expect(kept.total).toBe(ORDER.total);
    expect(kept.currency).toBe(ORDER.currency);
    expect(kept.date_created_gmt).toBe(ORDER.date_created_gmt);
    expect(kept.payment_method_title).toBeDefined();
  });

  it("keeps line items with their contents, not as empty objects", () => {
    // The depth rule: naming the collection is not enough. A keep-list with `line_items` but not
    // `quantity` stores `line_items: [{}]` -- the right number of empty objects, which looks like
    // data and is not.
    const { value } = redactValue(ORDER, policy.keep ?? new Set());
    const lines = (value as { line_items?: Array<Record<string, unknown>> }).line_items ?? [];
    expect(lines.length).toBe(ORDER.line_items?.length);
    expect(lines[0]?.quantity).toBeDefined();
    expect(lines[0]?.total).toBeDefined();
    expect(lines[0]?.name).toBeDefined();
  });

  it("drops the free text on a refund but keeps its money", () => {
    const { value } = redactValue(ORDER_REFUNDED, policy.keep ?? new Set());
    const refunds = (value as { refunds?: Array<Record<string, unknown>> }).refunds ?? [];
    expect(refunds[0]?.total).toBeDefined();
    expect(refunds[0]?.reason).toBeUndefined();
  });
});
