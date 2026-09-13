import { describe, expect, it } from "vitest";
import { CANCELLED, LATE_NIGHT_SALE, MERCHANT, PAGE, REFUND, SALE } from "./fixtures.ts";
import {
  LOYVERSE_NATIVE_ENTITY_TYPE,
  LoyverseNormalizeError,
  assertLoyverseTimezone,
  loyverseInstantToDate,
  normalizeLoyverseReceipts,
  parseLoyverseMoney,
  receiptRevenue,
  receiptTypeOf,
} from "./normalize.ts";

const OPTS = {
  merchantId: MERCHANT.id,
  currency: "THB",
  timezone: "Asia/Bangkok",
  fetchedAt: "2026-09-10T02:00:00.000Z",
  firstSeenAt: "2026-09-10T02:00:00.000Z",
};

const one = (receipt: unknown) =>
  normalizeLoyverseReceipts({ ...OPTS, receipts: [receipt as never] })[0];

describe("trap 1: a refund's total_money is POSITIVE", () => {
  it("subtracts a refund rather than adding it", () => {
    // The field's own description is "the total money amount paid by customer (OR RETURNED TO
    // CUSTOMER IN CASE OF REFUND)", and the specification's worked refund example carries
    // `total_money: 17.52` -- positive -- beside `receipt_type: REFUND`. Adding it makes a refunded
    // day read RICHER than a clean one, which is the most flattering possible direction to be wrong.
    expect(REFUND.total_money).toBeGreaterThan(0);
    expect(one(REFUND)?.metrics.revenue).toBeCloseTo(-95, 10);
  });

  it("takes the sign from receipt_type, never from the number", () => {
    // `-Math.abs(total)`, not `-total`. If a future response ever sent a refund pre-negated,
    // negating again would silently turn a refund into a sale -- money appearing out of nowhere.
    expect(receiptRevenue({ ...REFUND, total_money: -95 }, "r")).toBeCloseTo(-95, 10);
    expect(receiptRevenue({ ...REFUND, total_money: 95 }, "r")).toBeCloseTo(-95, 10);
  });

  it("does not count a refund as an order", () => {
    // Counting it would inflate the day's order count AND halve its average ticket, which is the
    // quotient the brief actually shows.
    expect(one(REFUND)?.metrics.orders).toBe(0);
  });
});

describe("trap 2: a refund is a second receipt, not a mutation of the first", () => {
  it("emits two rows with two entity ids for a sale and its refund", () => {
    // `POST /receipts/{n}/refund` returns a NEW receipt whose `refund_for` names the sale. Netting
    // them into one row would need the original, which the run may not hold in this page or at all.
    const rows = normalizeLoyverseReceipts({ ...OPTS, receipts: [SALE, REFUND] as never });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.entity.id).toBe("lv_1-1002");
    expect(rows[1]?.entity.id).toBe("lv_1-1003");
  });

  it("nets the day out across those rows, which is what the store sums", () => {
    const rows = normalizeLoyverseReceipts({ ...OPTS, receipts: [SALE, REFUND] as never });
    const revenue = rows.reduce((total, row) => total + (row.metrics.revenue ?? 0), 0);
    const orders = rows.reduce((total, row) => total + (row.metrics.orders ?? 0), 0);
    expect(revenue).toBeCloseTo(245 - 95, 10);
    expect(orders).toBe(1);
  });
});

describe("trap 3: receipt_date is the sale, created_at is when Loyverse heard about it", () => {
  it("reads receipt_date, not created_at", () => {
    // LATE_NIGHT_SALE is the fixture that separates them: its `receipt_date` is 01:45 on the 10th
    // in Bangkok and its `created_at` is 23:55 on the NINTH. A normaliser reading created_at files
    // this on the wrong day, and no other fixture here can tell the two apart.
    expect(one(LATE_NIGHT_SALE)?.dimensions.date).toBe("2026-09-10");
    expect(loyverseInstantToDate(LATE_NIGHT_SALE.created_at, "t", "Asia/Bangkok")).toBe(
      "2026-09-09",
    );
  });

  it("falls back to created_at when receipt_date is absent, which is the PLATFORM's rule", () => {
    // "By default, it matches the created_at value." The fallback is Loyverse's own statement about
    // the field, not this file's guess about it.
    const row = one({ ...SALE, receipt_date: undefined });
    expect(row?.dimensions.date).toBe("2026-09-09");
  });

  it("refuses a receipt with neither clock rather than filing it on today", () => {
    expect(() => one({ ...SALE, receipt_date: undefined, created_at: undefined })).toThrow(
      LoyverseNormalizeError,
    );
  });
});

describe("trap 4: every timestamp is UTC and the merchant is not", () => {
  // THIS SUITE RUNS IN ASIA/BANGKOK -- see vitest.config.ts. In UTC these assertions would be
  // worthless: the wrong reading and the right one produce the identical string, which is exactly
  // the failure a mutation run found in the WooCommerce suite.
  it("puts a late-night UTC receipt on the merchant's NEXT day", () => {
    // 18:45 UTC on the 9th is 01:45 on the 10th in Bangkok. This is the cafe's own answer to "which
    // day was that sale", and it is the one the brief has to agree with.
    expect(one(LATE_NIGHT_SALE)?.dimensions.date).toBe("2026-09-10");
  });

  it("holds for a whole day of instants, not just the one that happens to break", () => {
    // UTC+7. Hours 00:00-16:59 UTC are the same calendar day in Bangkok; 17:00 onward is the NEXT.
    // Three readings, three different answers:
    //
    //   correct       -> 17 hours on the 9th, 7 on the 10th   (asserted here)
    //   zone ignored  -> 24 hours on the 9th
    //
    // So the last seven iterations fail if the merchant's zone is dropped, which a single-instant
    // assertion could not guarantee.
    for (let hour = 0; hour < 24; hour++) {
      const stamp = `2026-09-09T${String(hour).padStart(2, "0")}:00:00.000Z`;
      const expected = hour < 17 ? "2026-09-09" : "2026-09-10";
      expect(loyverseInstantToDate(stamp, "t", "Asia/Bangkok"), stamp).toBe(expected);
    }
  });

  it("puts the same instant on different days for merchants in different zones", () => {
    const stamp = "2026-09-09T18:45:00.000Z";
    expect(loyverseInstantToDate(stamp, "t", "Asia/Bangkok")).toBe("2026-09-10");
    expect(loyverseInstantToDate(stamp, "t", "UTC")).toBe("2026-09-09");
    expect(loyverseInstantToDate(stamp, "t", "America/New_York")).toBe("2026-09-09");
  });

  it("refuses a timestamp with no designator rather than assuming the runtime's offset", () => {
    // The mirror image of WooCommerce: Woo sends designator-less strings that ARE GMT and the
    // normaliser appends a `Z`. Loyverse documents a designator, so its absence means something is
    // wrong and guessing would move the day by seven hours.
    expect(() => loyverseInstantToDate("2026-09-09T18:45:00", "t", "Asia/Bangkok")).toThrow(
      /no UTC designator/,
    );
  });

  it("refuses a zone it does not know, rather than labelling an account's rows with it", () => {
    expect(() => assertLoyverseTimezone("")).toThrow(LoyverseNormalizeError);
    expect(() => assertLoyverseTimezone("Mars/Olympus")).toThrow(LoyverseNormalizeError);
    expect(() => assertLoyverseTimezone("Asia/Bangkok")).not.toThrow();
  });
});

describe("trap 5: a cancelled sale is zero, not absent", () => {
  it("zeroes the money and the count even though total_money still says 180", () => {
    expect(CANCELLED.total_money).toBe(180);
    const row = one(CANCELLED);
    expect(row?.metrics.revenue).toBe(0);
    expect(row?.metrics.orders).toBe(0);
  });

  it("emits the metrics rather than omitting them, so the upsert overwrites the old value", () => {
    // THE WHOLE POINT. An earlier run counted this sale. Omitting the metrics would leave that
    // value in place through the upsert, and the cancellation would never take effect.
    const row = one(CANCELLED);
    expect(row?.metrics.revenue).not.toBeUndefined();
    expect(row?.metrics.orders).not.toBeUndefined();
  });

  it("does not refuse a cancelled receipt over a total it is not going to use", () => {
    // The cancellation is checked BEFORE the money is parsed, so a run is not failed by a field
    // whose value is irrelevant to the answer.
    expect(receiptRevenue({ ...CANCELLED, total_money: undefined }, "r")).toBe(0);
  });
});

describe("the two metrics, and the ones deliberately not here", () => {
  it("emits revenue and orders and NOTHING else", () => {
    // With zero dictionary changes these are the only two entries a cafe's takings can occupy
    // (`58-plan-reconciliation.md` section 2.2). A third key appearing here means a connector
    // smuggled a metric past 13.3 rule 2, which is precisely what this asserts cannot happen
    // quietly.
    for (const row of normalizeLoyverseReceipts({ ...OPTS, receipts: PAGE as never })) {
      expect(Object.keys(row.metrics).sort()).toEqual(["orders", "revenue"]);
    }
  });

  it("does not invent an average ticket, which is a quotient computed at read", () => {
    // Like `ctr`, which `metrics.ts` says "stays out for that reason". Storing it would also store
    // a rounding, and a week's average ticket would become the mean of seven means rather than the
    // week's money over the week's orders -- different numbers, and the second is the one meant.
    const row = one(SALE) as unknown as { metrics: Record<string, unknown> };
    expect(row.metrics.average_ticket).toBeUndefined();
    expect(row.metrics.spend_per_head).toBeUndefined();
    expect(row.metrics.cost_of_goods).toBeUndefined();
    // And it is still derivable by the reader, which is the whole argument for leaving it out.
    const rows = normalizeLoyverseReceipts({ ...OPTS, receipts: [SALE, LATE_NIGHT_SALE] as never });
    const revenue = rows.reduce((t, r) => t + (r.metrics.revenue ?? 0), 0);
    const orders = rows.reduce((t, r) => t + (r.metrics.orders ?? 0), 0);
    expect(revenue / orders).toBeCloseTo((245 + 320) / 2, 10);
  });

  it("never reads dining_option as a cover count", () => {
    // It is free text ("Dine in", "To go") the merchant sets. A grep of the whole OpenAPI document
    // finds no guest, cover, table or pax field, so there is nothing to count people with.
    expect(SALE.dining_option).toBe("To go");
    const row = one(SALE) as unknown as { metrics: Record<string, unknown> };
    expect(row.metrics.covers).toBeUndefined();
  });
});

describe("the entity, and how a restatement finds its row again", () => {
  it("uses the order grain and carries the platform's own word beside it", () => {
    const row = one(SALE);
    expect(row?.entity.type).toBe("order");
    expect(row?.entity.native_entity_type).toBe(LOYVERSE_NATIVE_ENTITY_TYPE);
    expect(row?.entity.native_id).toBe("1-1002");
  });

  it("namespaces the receipt number, which is per-account and not global", () => {
    // "1-1002" is unique within one merchant. Without the prefix it would collide with another
    // source's id in anything that keys on entity id alone.
    expect(one(SALE)?.entity.id).toBe("lv_1-1002");
    expect(one(SALE)?.entity.account_id).toBe(MERCHANT.id);
  });

  it("carries store_id as the parent, so a two-shop owner can tell the branches apart", () => {
    // It is already on the receipt, so it costs no STORES_READ scope.
    expect(one(SALE)?.entity.parent_id).toBe(SALE.store_id);
  });

  it("omits parent_id rather than inventing one when the receipt has no store", () => {
    expect(one({ ...SALE, store_id: undefined })?.entity.parent_id).toBeUndefined();
  });

  it("reports source_updated_at, so a cancellation reads as a restatement", () => {
    // Without it, a row whose value changed would look like an unexplained edit rather than like
    // the platform restating something.
    expect(one(CANCELLED)?.source_updated_at).toBe(CANCELLED.updated_at);
  });
});

describe("refusals", () => {
  it("refuses a receipt with no number rather than re-inserting it on every pull", () => {
    expect(() => one({ ...SALE, receipt_number: undefined })).toThrow(/no receipt_number/);
  });

  it("refuses an unknown receipt_type rather than guessing which way the money goes", () => {
    // Counting an unknown document as a sale ADDS its money; as a refund it SUBTRACTS. Both are
    // guesses about the merchant's own money, and a guess in a headline figure is worse than a
    // failed run.
    try {
      receiptTypeOf({ receipt_type: "VOID" }, "r");
      throw new Error("should have refused");
    } catch (error) {
      expect((error as LoyverseNormalizeError).code).toBe("unknown_receipt_type");
    }
  });

  it("refuses an unparseable total rather than coercing it to zero", () => {
    // A wrong zero is indistinguishable from a real one, and a comped coffee is a real zero -- so
    // the two genuinely occur side by side in the same column.
    expect(() => parseLoyverseMoney(undefined, "total_money")).toThrow(/not a finite number/);
    expect(() => parseLoyverseMoney(Number.NaN, "total_money")).toThrow(/not a finite number/);
    expect(() => one({ ...SALE, total_money: undefined })).toThrow(LoyverseNormalizeError);
    // And a genuine zero still passes, which is what makes the refusal worth having.
    expect(parseLoyverseMoney(0, "total_money")).toBe(0);
    expect(one({ ...SALE, total_money: 0 })?.metrics.revenue).toBe(0);
  });

  it("refuses a currency that is not ISO 4217 rather than labelling every row with it", () => {
    expect(() =>
      normalizeLoyverseReceipts({ ...OPTS, currency: "baht", receipts: [SALE] as never }),
    ).toThrow(/not an ISO 4217 code/);
  });

  it("upper-cases the currency it was given", () => {
    const rows = normalizeLoyverseReceipts({ ...OPTS, currency: "thb", receipts: [SALE] as never });
    expect(rows[0]?.dimensions.currency).toBe("THB");
  });

  it("refuses the zone BEFORE looking at any receipt", () => {
    // So the message names the connection rather than a receipt, and so a bad zone cannot get as
    // far as labelling one row correctly and the next one wrongly.
    expect(() =>
      normalizeLoyverseReceipts({ ...OPTS, timezone: "Mars/Olympus", receipts: [] }),
    ).toThrow(/not a timezone/);
  });
});
