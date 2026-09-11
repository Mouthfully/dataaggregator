import { envelopeRowSchema, SOURCES } from "@repo/contract";
import { REDACTION_POLICIES, redactValue } from "@repo/payloads";
import { describe, expect, it } from "vitest";
import { STRIPE_CHARGE, STRIPE_PAGE, STRIPE_PAYOUT, STRIPE_REFUND } from "./fixtures.js";
import { normalizeStripeBalanceTransactions, stripeMajorAmount } from "./normalize.js";

const OPTIONS = {
  transactions: STRIPE_PAGE,
  accountId: "acct_123",
  fetchedAt: "2026-09-11T00:00:00Z",
  firstSeenAt: "2026-09-11T00:00:00Z",
};

describe("Stripe settlement normalisation", () => {
  it("is a dictionary source and every emitted row satisfies the envelope", () => {
    expect(SOURCES).toContain("stripe");
    for (const row of normalizeStripeBalanceTransactions(OPTIONS)) {
      expect(envelopeRowSchema.safeParse(row).success).toBe(true);
    }
  });

  it("uses Stripe's amount - fee = net relationship without recomputing fee prose", () => {
    const [charge] = normalizeStripeBalanceTransactions({
      ...OPTIONS,
      transactions: [STRIPE_CHARGE],
    });
    expect(charge?.metrics).toEqual({ revenue: 1000, fees: 32.5, net_revenue: 967.5 });
  });

  it("emits refunds as signed money and keeps them provisional until available", () => {
    const [refund] = normalizeStripeBalanceTransactions({
      ...OPTIONS,
      transactions: [STRIPE_REFUND],
    });
    expect(refund?.metrics).toEqual({ revenue: -250, fees: 0, net_revenue: -250 });
    expect(refund?.is_provisional).toBe(true);
    expect(refund?.restates_until).toBe(
      new Date((STRIPE_REFUND.available_on as number) * 1000).toISOString(),
    );
  });

  it("drops payouts because counting a balance transfer as revenue duplicates the sale", () => {
    expect(
      normalizeStripeBalanceTransactions({ ...OPTIONS, transactions: [STRIPE_PAYOUT] }),
    ).toEqual([]);
  });

  it("handles Stripe's zero-decimal currencies rather than dividing them by 100", () => {
    expect(stripeMajorAmount(1_000, "JPY")).toBe(1_000);
    expect(stripeMajorAmount(1_000, "THB")).toBe(10);
  });

  it("refuses arithmetic that disagrees with Stripe's documented invariant", () => {
    expect(() =>
      normalizeStripeBalanceTransactions({
        ...OPTIONS,
        transactions: [{ ...STRIPE_CHARGE, net: 96_749 }],
      }),
    ).toThrow(/amount - fee = net/);
  });
});

describe("Stripe payload redaction", () => {
  const policy = REDACTION_POLICIES.stripe;

  it("uses an allow-list because an expanded source can carry billing details", () => {
    expect(policy.disposition).toBe("redact");
    const { value } = redactValue(
      { object: "list", data: [STRIPE_CHARGE], has_more: false },
      policy.keep ?? new Set(),
    );
    const serialised = JSON.stringify(value);
    for (const secret of ["Somchai", "somchai@", "0812345678", "Sukhumvit"]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("keeps every field the settlement number is computed from", () => {
    const { value } = redactValue(STRIPE_CHARGE, policy.keep ?? new Set());
    expect(value).toMatchObject({
      id: STRIPE_CHARGE.id,
      amount: STRIPE_CHARGE.amount,
      fee: STRIPE_CHARGE.fee,
      net: STRIPE_CHARGE.net,
      reporting_category: "charge",
    });
  });
});
