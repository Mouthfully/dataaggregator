/**
 * WooCommerce order fixtures.
 *
 * Shaped from the documented `wc/v3` order object. They carry REAL-LOOKING personal data on
 * purpose: `billing`, `shipping`, `customer_note`, the IP and user agent, and a refund reason are
 * exactly what the keep-list has to remove, and a fixture scrubbed of them would let a broken
 * keep-list pass. The names are invented.
 *
 * Note what is deliberately present and unused: `fee_lines` (trap 2, a merchant surcharge that must
 * never reach `fees`), `date_created` alongside `date_created_gmt` (trap 1, the non-GMT variant the
 * normaliser must never read), and a `_delivery_fee` meta key that is fee-shaped and is not one.
 */

import type { WooOrder } from "./normalize.js";

/**
 * A fixture is WIDER than what the normaliser reads, deliberately.
 *
 * `WooOrder` names only the fields the normaliser consumes; a real response carries far more, and
 * the keep-list's whole job is the difference. `refunds[].reason` is the sharp example: the reader
 * has no use for it, and the redaction test needs it present in order to prove it is dropped. So
 * the fixture type re-opens the collections rather than the reader's type absorbing fields it does
 * not want.
 */
interface WooOrderFixture extends Omit<WooOrder, "refunds"> {
  readonly refunds?: ReadonlyArray<Record<string, unknown>>;
  readonly line_items?: ReadonlyArray<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

const BUYER = {
  billing: {
    first_name: "Somchai",
    last_name: "Wattana",
    company: "",
    address_1: "142 Sukhumvit Soi 24",
    address_2: "Apt 8B",
    city: "Bangkok",
    state: "BKK",
    postcode: "10110",
    country: "TH",
    email: "somchai@example.co.th",
    phone: "0812345678",
  },
  shipping: {
    first_name: "Somchai",
    last_name: "Wattana",
    address_1: "142 Sukhumvit Soi 24",
    city: "Bangkok",
    postcode: "10110",
    country: "TH",
  },
  customer_note: "Please call 0812345678 before delivery, gate code 1234",
  customer_ip_address: "203.0.113.44",
  customer_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)",
  customer_id: 41,
} as const;

/** A plain paid order. No gateway wrote a fee, which is the common case rather than the edge. */
export const ORDER: WooOrderFixture = {
  id: 4821,
  number: "4821",
  status: "completed",
  currency: "THB",
  // Trap 1: both variants present, and they disagree. Only the _gmt one may be read.
  date_created: "2026-09-09T06:30:00",
  date_created_gmt: "2026-09-08T23:30:00",
  date_modified: "2026-09-09T06:30:00",
  date_modified_gmt: "2026-09-08T23:30:00",
  total: "560.00",
  total_tax: "36.64",
  shipping_total: "40.00",
  discount_total: "0.00",
  payment_method: "omise",
  payment_method_title: "Credit card (Opn Payments)",
  transaction_id: "chrg_test_5f2a",
  line_items: [
    {
      id: 991,
      name: "House blend, 250g",
      product_id: 77,
      variation_id: 0,
      quantity: 2,
      sku: "HB-250",
      price: "260.00",
      subtotal: "520.00",
      total: "520.00",
      meta_data: [{ key: "_grind", value: "espresso" }],
    },
  ],
  // Trap 2: a surcharge that ADDS to the total. It is not a payment fee.
  fee_lines: [{ id: 992, name: "Delivery", total: "40.00", tax_class: "" }],
  refunds: [],
  meta_data: [
    { key: "_delivery_fee", value: "40.00" },
    { key: "_wc_order_attribution_source_type", value: "organic" },
  ],
  ...BUYER,
};

/** Partially refunded. The refund total is NEGATIVE, as WooCommerce sends it. */
export const ORDER_REFUNDED: WooOrderFixture = {
  ...ORDER,
  id: 4822,
  number: "4822",
  status: "completed",
  total: "1000.00",
  date_created_gmt: "2026-09-08T10:00:00",
  date_modified_gmt: "2026-09-09T04:15:00",
  refunds: [{ id: 4901, total: "-250.00", reason: "Customer said one bag arrived split open" }],
  line_items: [
    {
      id: 993,
      name: "Single origin, 1kg",
      product_id: 78,
      variation_id: 0,
      quantity: 1,
      sku: "SO-1000",
      price: "1000.00",
      subtotal: "1000.00",
      total: "1000.00",
    },
  ],
  fee_lines: [],
};

/** A Stripe order, where the fee IS knowable. The minority case. */
export const ORDER_WITH_STRIPE_FEE: WooOrderFixture = {
  ...ORDER,
  id: 4823,
  number: "4823",
  total: "1000.00",
  date_created_gmt: "2026-09-08T12:00:00",
  date_modified_gmt: "2026-09-08T12:00:00",
  payment_method: "stripe",
  payment_method_title: "Credit card (Stripe)",
  refunds: [],
  fee_lines: [],
  meta_data: [
    { key: "_stripe_fee", value: "32.50" },
    { key: "_stripe_net", value: "967.50" },
    { key: "_stripe_currency", value: "THB" },
  ],
};

/** One page as the client returns it. */
export const PAGE: readonly WooOrderFixture[] = [ORDER, ORDER_REFUNDED, ORDER_WITH_STRIPE_FEE];
