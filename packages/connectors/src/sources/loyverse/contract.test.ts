import { METRICS, RESTATEMENT_CLOCKS, envelopeRowSchema } from "@repo/contract";
import { REDACTION_POLICIES, redactValue } from "@repo/payloads";
import { describe, expect, it } from "vitest";
import { LOYVERSE_SCOPES } from "./client.ts";
import { CANCELLED, LATE_NIGHT_SALE, MERCHANT, PAGE, REFUND, SALE } from "./fixtures.ts";
import { normalizeLoyverseReceipts } from "./normalize.ts";

const OPTS = {
  merchantId: MERCHANT.id,
  currency: "THB",
  timezone: "Asia/Bangkok",
  fetchedAt: "2026-09-10T02:00:00.000Z",
  firstSeenAt: "2026-09-10T02:00:00.000Z",
};

const rows = () => normalizeLoyverseReceipts({ ...OPTS, receipts: PAGE as never });

describe("the envelope contract", () => {
  it("emits rows the envelope accepts", () => {
    for (const row of rows()) {
      const result = envelopeRowSchema.safeParse(row);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("carries commerce metrics on an `order` entity with no attribution window", () => {
    // `envelopeRowSchema`'s second refusal rejects a commerce metric on an ADVERTISING entity with
    // a null window. A till receipt is attributed to nothing -- there is no ad platform anywhere in
    // this connector -- so null is correct here and must stay permitted. This asserts the two rules
    // do not collide.
    const [row] = normalizeLoyverseReceipts({ ...OPTS, receipts: [SALE] as never });
    expect(row?.entity.type).toBe("order");
    expect(row?.dimensions.attribution_window).toBeNull();
    expect(row?.metrics.orders).toBe(1);
    expect(envelopeRowSchema.safeParse(row).success).toBe(true);
  });

  it("emits no fx provenance, because the account has one currency and converts nothing", () => {
    const [row] = normalizeLoyverseReceipts({ ...OPTS, receipts: [SALE] as never });
    expect(row?.fx_source).toBeNull();
    expect(row?.fx_rate).toBeNull();
    expect(row?.fx_base).toBeNull();
    expect(row?.fx_rate_date).toBeNull();
  });
});

describe("the dictionary was not changed, and this is what proves it", () => {
  it("emits only metric names the dictionary already carries", () => {
    // A connector that emits a name absent from `METRICS` fails its contract test -- 13.3 rule 2.
    for (const row of rows()) {
      for (const name of Object.keys(row.metrics)) expect(name in METRICS).toBe(true);
    }
  });

  it("uses exactly the two the plan said were available with no dictionary change", () => {
    const names = new Set(rows().flatMap((row) => Object.keys(row.metrics)));
    expect([...names].sort()).toEqual(["orders", "revenue"]);
  });

  it("keeps both of them additive, which is what makes a day and a week summable", () => {
    // Average ticket is their QUOTIENT at read. That is only sound while both halves sum, so if
    // either ever became a weighted mean the read-time derivation would silently become wrong.
    expect(METRICS.revenue.aggregation.kind).toBe("sum");
    expect(METRICS.orders.aggregation.kind).toBe("sum");
  });

  it("does not treat `orders` as a conversion, which would demand an attribution window", () => {
    // It is the shop's own count of receipts. Nothing is attributed, so a window would be a label
    // with nothing to label -- and the envelope would refuse the row for the opposite reason.
    expect(METRICS.orders.conversion).toBe(false);
  });
});

describe("the restatement clock: no Loyverse window ever closes", () => {
  it("is null, and for WooCommerce's reason rather than Search Console's", () => {
    // Not "a number exists and nobody has measured it" -- the account is the merchant's own till.
    // The note has to say so, because a bare null is indistinguishable between the two cases.
    const clock = RESTATEMENT_CLOCKS.loyverse;
    expect(clock.windowDays).toBeNull();
    expect(clock.perAccount).toBe(false);
    expect(clock.note).toMatch(/No window closes/);
    expect(clock.note).toMatch(/updated_at_min/);
  });

  it("never marks a row final", () => {
    // `is_provisional` is permanently true, which the brief must say in words rather than leave as
    // a flag nobody explains (`58-plan-reconciliation.md` section 2.2).
    for (const row of rows()) {
      expect(row.restates_until).toBeNull();
      expect(row.is_provisional).toBe(true);
    }
  });

  it("stays provisional however long after the sale it is read", () => {
    // A ladder would have closed by now. This is what "no window closes" means operationally.
    const [row] = normalizeLoyverseReceipts({
      ...OPTS,
      fetchedAt: "2028-01-01T00:00:00.000Z",
      receipts: [SALE] as never,
    });
    expect(row?.is_provisional).toBe(true);
  });
});

describe("the redaction keep-list, against the same fixtures the normaliser reads", () => {
  const policy = REDACTION_POLICIES.loyverse;
  const keep = policy.keep ?? new Set<string>();

  it("is a redact policy with a keep-list", () => {
    expect(policy.disposition).toBe("redact");
    expect(policy.keep).toBeDefined();
  });

  it("removes everything that identifies the shopper or the staff", () => {
    const { value } = redactValue(SALE, keep);
    const kept = value as Record<string, unknown>;
    for (const key of [
      "customer_id",
      "points_earned",
      "points_deducted",
      "points_balance",
      "employee_id",
      "pos_device_id",
      "note",
    ]) {
      expect(kept[key], `${key} survived redaction`).toBeUndefined();
    }
    // And nothing from the person survives anywhere in the serialised result, at any depth.
    const serialised = JSON.stringify(kept);
    for (const secret of ["Khun Nok", "0812345678", "c71758a2", "332.32"]) {
      expect(serialised, `${secret} survived redaction`).not.toContain(secret);
    }
  });

  it("removes the card details, which is the one a reviewer should check first", () => {
    // A masked PAN plus a timestamp is still a card-holder identifier, and an authorization code is
    // a payment-network credential. This is the only field family here that would put card data in
    // an archive, and nothing in this product reads any of it.
    const { value } = redactValue(SALE, keep);
    const payments = (value as { payments?: Array<Record<string, unknown>> }).payments ?? [];
    expect(payments[0]?.payment_details).toBeUndefined();
    const serialised = JSON.stringify(value);
    for (const secret of ["4242", "A1B2C3", "VISA", "chrg_test_5f2a"]) {
      expect(serialised, `${secret} survived redaction`).not.toContain(secret);
    }
  });

  it("drops the cashier's free text on a line as well as on the receipt", () => {
    // `line_note` is one level down, which is exactly where a keep-list stops being obvious.
    const { value } = redactValue(SALE, keep);
    const lines = (value as { line_items?: Array<Record<string, unknown>> }).line_items ?? [];
    expect(lines[0]?.line_note).toBeUndefined();
    expect(JSON.stringify(value)).not.toContain("Extra shot");
  });

  it("keeps everything the two numbers are computed from", () => {
    const { value } = redactValue(SALE, keep);
    const kept = value as Record<string, unknown>;
    expect(kept.receipt_number).toBe(SALE.receipt_number);
    expect(kept.receipt_type).toBe(SALE.receipt_type);
    expect(kept.total_money).toBe(SALE.total_money);
    expect(kept.receipt_date).toBe(SALE.receipt_date);
    // All three clocks, because the normaliser reads receipt_date while the PULL filters on
    // updated_at -- an archive keeping only one could not show why a row was re-read.
    expect(kept.created_at).toBe(SALE.created_at);
    expect(kept.updated_at).toBe(SALE.updated_at);
    // The branch, and the platform's own note about where the receipt came from.
    expect(kept.store_id).toBe(SALE.store_id);
    expect(kept.source).toBe(SALE.source);
  });

  it("keeps line items with their contents, not as the right number of empty objects", () => {
    // The depth rule: naming the collection is not enough. A keep-list with `line_items` but not
    // `quantity` stores `line_items: [{}]` -- which looks like data and is not.
    const { value } = redactValue(SALE, keep);
    const lines = (value as { line_items?: Array<Record<string, unknown>> }).line_items ?? [];
    expect(lines).toHaveLength((SALE.line_items as unknown[]).length);
    expect(lines[0]?.quantity).toBeDefined();
    expect(lines[0]?.item_name).toBeDefined();
    expect(lines[0]?.total_money).toBeDefined();
  });

  it("keeps cost and cost_total, which nothing reads yet and cost_of_goods will", () => {
    // The merchant's own purchase cost -- not personal data by any reading. An archive that dropped
    // them would make build-order step 4.3 require a re-pull of history Loyverse may not serve.
    const { value } = redactValue(SALE, keep);
    const lines = (value as { line_items?: Array<Record<string, unknown>> }).line_items ?? [];
    expect(lines[0]?.cost).toBe(28);
    expect(lines[0]?.cost_total).toBe(56);
  });

  it("keeps dining_option, and it is text rather than a count", () => {
    const { value } = redactValue(SALE, keep);
    expect((value as Record<string, unknown>).dining_option).toBe("To go");
    expect(typeof (value as Record<string, unknown>).dining_option).toBe("string");
  });

  it("keeps what makes a refund and a cancellation legible", () => {
    // `refund_for` is how a refund is tied to its sale, and `cancelled_at` is how a counted sale is
    // voided. Dropping either would leave an archive that cannot explain a day's change.
    const refund = redactValue(REFUND, keep).value as Record<string, unknown>;
    expect(refund.refund_for).toBe("1-1002");
    expect(refund.receipt_type).toBe("REFUND");
    const cancelled = redactValue(CANCELLED, keep).value as Record<string, unknown>;
    expect(cancelled.cancelled_at).toBe(CANCELLED.cancelled_at);
  });

  it("still survives redaction as something the normaliser could read", () => {
    // THE PROPERTY THAT TIES THE TWO HALVES TOGETHER. `raw` is archived redacted; if the keep-list
    // dropped a field the normaliser needs, the archive could never be replayed.
    const redacted = PAGE.map((receipt) => redactValue(receipt, keep).value);
    const replayed = normalizeLoyverseReceipts({ ...OPTS, receipts: redacted as never });
    const original = normalizeLoyverseReceipts({ ...OPTS, receipts: PAGE as never });
    expect(replayed.map((r) => r.metrics)).toEqual(original.map((r) => r.metrics));
    expect(replayed.map((r) => r.dimensions.date)).toEqual(original.map((r) => r.dimensions.date));
    expect(replayed.map((r) => r.entity.id)).toEqual(original.map((r) => r.entity.id));
  });
});

describe("the scopes this connector asks for", () => {
  it("agrees with the two `PROVIDERS.loyverse` requests", () => {
    // @repo/connectors does not depend on @repo/oauth, so the list is duplicated rather than
    // imported. This is the test that keeps the copies from separating -- and the reason each of
    // the four absentees is absent is argued in `PROVIDERS.loyverse`, not here.
    expect([...LOYVERSE_SCOPES]).toEqual(["RECEIPTS_READ", "MERCHANT_READ"]);
  });

  it("asks for no scope that could change the merchant's till", () => {
    // The read-only pillar, stated as a property of the token rather than of our restraint.
    for (const scope of LOYVERSE_SCOPES) expect(scope.toUpperCase()).toMatch(/_READ$/);
  });
});

describe("a day, end to end", () => {
  it("reports a cafe's takings and its order count from one page of receipts", () => {
    // 245 sold, 95 refunded, 180 cancelled, 320 late. Two of those land on the 9th in Bangkok and
    // one on the 10th, which is the whole reason the zone is required.
    const byDate = new Map<string, { revenue: number; orders: number }>();
    for (const row of rows()) {
      const bucket = byDate.get(row.dimensions.date) ?? { revenue: 0, orders: 0 };
      bucket.revenue += row.metrics.revenue ?? 0;
      bucket.orders += row.metrics.orders ?? 0;
      byDate.set(row.dimensions.date, bucket);
    }
    expect(byDate.get("2026-09-09")).toEqual({ revenue: 245 - 95 + 0, orders: 1 });
    expect(byDate.get("2026-09-10")).toEqual({ revenue: 320, orders: 1 });
    // And the average ticket a brief would print, computed at read from the day's own totals.
    const ninth = byDate.get("2026-09-09") as { revenue: number; orders: number };
    expect(ninth.revenue / ninth.orders).toBeCloseTo(150, 10);
  });

  it("puts the late-night sale on the day the cafe would say it happened", () => {
    const [row] = normalizeLoyverseReceipts({ ...OPTS, receipts: [LATE_NIGHT_SALE] as never });
    expect(row?.dimensions.date).toBe("2026-09-10");
  });
});
