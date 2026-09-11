import type { StripeBalanceTransaction } from "./normalize.js";

interface StripeFixture extends StripeBalanceTransaction {
  readonly [key: string]: unknown;
}

export const STRIPE_CHARGE: StripeFixture = {
  id: "txn_charge_1",
  object: "balance_transaction",
  amount: 100_000,
  available_on: 1_789_084_800,
  created: 1_788_912_000,
  currency: "thb",
  description: "Order for somchai@example.co.th",
  fee: 3_250,
  fee_details: [
    { amount: 3_250, currency: "thb", description: "Stripe processing fees", type: "stripe_fee" },
  ],
  net: 96_750,
  reporting_category: "charge",
  source: {
    id: "ch_1",
    billing_details: {
      name: "Somchai Wattana",
      email: "somchai@example.co.th",
      phone: "0812345678",
    },
    metadata: { delivery_address: "142 Sukhumvit Soi 24" },
  },
  status: "available",
  type: "charge",
};

export const STRIPE_REFUND: StripeFixture = {
  id: "txn_refund_1",
  amount: -25_000,
  available_on: 1_789_084_800,
  created: 1_788_998_400,
  currency: "thb",
  fee: 0,
  net: -25_000,
  reporting_category: "refund",
  source: "re_1",
  status: "pending",
  type: "refund",
};

export const STRIPE_PAYOUT: StripeFixture = {
  id: "txn_payout_1",
  amount: -71_750,
  available_on: 1_789_084_800,
  created: 1_789_084_800,
  currency: "thb",
  fee: 0,
  net: -71_750,
  reporting_category: "payout",
  source: "po_1",
  status: "available",
  type: "payout",
};

export const STRIPE_PAGE = [STRIPE_CHARGE, STRIPE_REFUND, STRIPE_PAYOUT] as const;
