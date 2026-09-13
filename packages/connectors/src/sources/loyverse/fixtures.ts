/**
 * Loyverse receipt fixtures.
 *
 * SHAPED FROM THE SPECIFICATION'S OWN WORKED EXAMPLES, not recorded from a live account. The field
 * names, the nesting, the `receipt_type` values and the shape of `payment_details`,
 * `line_discounts` and `line_modifiers` are all as printed in the `Receipt` schema and in the
 * refund endpoint's response example at
 * `https://developer.loyverse.com/docs/API-Reference__v1.0.yaml`. THE VALUES ARE INVENTED, and the
 * limit that follows is worth stating rather than discovering: a fixture built from a document
 * cannot catch a field the document describes wrongly. Replace these with a recorded response the
 * first time a real merchant connects.
 *
 * THEY CARRY REAL-LOOKING PERSONAL DATA ON PURPOSE. `customer_id`, the loyalty points balance, the
 * cashier's `note` and `line_note`, `employee_id`, `pos_device_id` and a `payment_details` block
 * with a masked card number and an authorization code are exactly what `REDACTION_POLICIES.loyverse`
 * has to remove -- and a fixture already scrubbed of them would let a broken keep-list pass.
 *
 * Note what is deliberately present and unused by the normaliser: `dining_option` (trap: free text,
 * never a cover count), `created_at` alongside a DIFFERENT `receipt_date` (trap 3, the two clocks
 * that disagree), and line-level `cost`/`cost_total` (the input `cost_of_goods` will want, kept in
 * the archive and read by nothing today).
 */

import type { LoyverseReceipt } from "./normalize.ts";

/**
 * A fixture is WIDER than what the normaliser reads, deliberately.
 *
 * `LoyverseReceipt` names only the fields the normaliser consumes; a real receipt carries far more,
 * and the keep-list's whole job is the difference. So the fixture type re-opens the object rather
 * than the reader's type absorbing fields it does not want.
 */
interface LoyverseReceiptFixture extends LoyverseReceipt {
  readonly [key: string]: unknown;
}

/** Everything that identifies the person at the counter, or the staff member serving them. */
const IDENTITY = {
  customer_id: "c71758a2-79bf-11ea-bde9-1269e7c5a22d",
  points_earned: 2.5,
  points_deducted: 0,
  points_balance: 332.32,
  employee_id: "9e682147-dd7e-11ea-83b2-902b34a5a039",
  pos_device_id: "42dd2a55-6f40-11ea-bde9-1269e7c5a22d",
  note: "Khun Nok, call 0812345678 when the beans are in",
} as const;

const STORE = "42dc2cec-6f40-11ea-bde9-1269e7c5a22d";

/**
 * A plain sale. 07:30 Bangkok on 2026-09-09, which is 00:30 UTC the same day.
 *
 * `receipt_date` and `created_at` DISAGREE by two minutes -- the till was offline and synced late.
 * That is trap 3 in the fixture: reading `created_at` gives the same DAY here, which is why the
 * late-night fixture below exists to separate them properly.
 */
export const SALE: LoyverseReceiptFixture = {
  receipt_number: "1-1002",
  receipt_type: "SALE",
  refund_for: null,
  order: "O-15984978",
  created_at: "2026-09-09T00:32:11.000Z",
  receipt_date: "2026-09-09T00:30:00.000Z",
  updated_at: "2026-09-09T00:32:11.000Z",
  cancelled_at: null,
  source: "point of sale",
  total_money: 245.0,
  total_tax: 16.03,
  total_discount: 0,
  tip: 0,
  surcharge: 0,
  store_id: STORE,
  dining_option: "To go",
  line_items: [
    {
      id: "365972a1-7268-11ea-bde9-1269e7c5a22d",
      item_id: "d5fe0da6-44b3-4633-9915-e9dc5118cbfc",
      variant_id: "06929667-cc44-4bbb-b226-6758285d7033",
      item_name: "Iced latte",
      variant_name: "Large",
      sku: "10010",
      quantity: 2,
      price: 95.0,
      gross_total_money: 190.0,
      total_money: 190.0,
      cost: 28.0,
      cost_total: 56.0,
      line_note: "Extra shot for Khun Nok",
      line_taxes: [
        {
          id: "a94d8606-7268-11ea-bde9-1269e7c5a22d",
          type: "INCLUDED",
          name: "VAT",
          rate: 7,
          money_amount: 12.43,
        },
      ],
      total_discount: 0,
      line_discounts: [],
      line_modifiers: [
        {
          id: "832a8516-71bf-4515-b742-e868898a1aba",
          modifier_option_id: "89e741df-4767-41b1-ad40-d9245c01a51d",
          name: "Milk",
          option: "Oat",
          price: 15.0,
          money_amount: 30.0,
        },
      ],
    },
    {
      id: "365972a1-7268-11ea-bde9-1269e7c5a22e",
      item_id: "d5fe0da6-44b3-4633-9915-e9dc5118cbfd",
      item_name: "Croissant",
      sku: "10044",
      quantity: 1,
      price: 55.0,
      gross_total_money: 55.0,
      total_money: 55.0,
      cost: 18.0,
      cost_total: 18.0,
      line_taxes: [],
      line_discounts: [],
      line_modifiers: [],
    },
  ],
  payments: [
    {
      payment_type_id: "42dd2a55-6f40-11ea-bde9-1269e7c5a22d",
      name: "Card",
      type: "CARD",
      money_amount: 245.0,
      paid_at: "2026-09-09T00:30:04.000Z",
      // THE FIELD FAMILY A REVIEWER SHOULD CHECK FIRST. A masked PAN plus a timestamp is still a
      // card-holder identifier, and an authorization code is a payment-network credential.
      payment_details: {
        card_number: "**** **** **** 4242",
        card_company: "VISA",
        entry_method: "CHIP",
        authorization_code: "A1B2C3",
        reference_id: "chrg_test_5f2a",
      },
    },
  ],
  total_taxes: [
    {
      id: "a94d8606-7268-11ea-bde9-1269e7c5a22d",
      type: "INCLUDED",
      name: "VAT",
      rate: 7,
      money_amount: 16.03,
    },
  ],
  total_discounts: [],
  ...IDENTITY,
};

/**
 * A REFUND. Its `total_money` is POSITIVE, exactly as the specification's own refund example prints
 * it -- that is trap 1, and this fixture is the only thing that can catch it.
 *
 * `refund_for` names the sale above, and it is a SEPARATE receipt with its own number: trap 2.
 */
export const REFUND: LoyverseReceiptFixture = {
  ...SALE,
  receipt_number: "1-1003",
  receipt_type: "REFUND",
  refund_for: "1-1002",
  created_at: "2026-09-09T03:10:00.000Z",
  receipt_date: "2026-09-09T03:10:00.000Z",
  updated_at: "2026-09-09T03:10:00.000Z",
  // POSITIVE. The customer got 95.00 back; adding it would make a refunded day read richer.
  total_money: 95.0,
  total_tax: 6.21,
  note: "One latte was cold - refunded for Khun Nok",
};

/**
 * A CANCELLED sale. `total_money` still says 180 and the receipt is worth nothing: trap 5.
 *
 * `updated_at` is HOURS after `receipt_date`, which is the whole reason the pull filters on
 * `updated_at` rather than `created_at` -- a created-since walk would never come back for this row.
 */
export const CANCELLED: LoyverseReceiptFixture = {
  ...SALE,
  receipt_number: "1-1004",
  receipt_type: "SALE",
  refund_for: null,
  created_at: "2026-09-09T01:05:00.000Z",
  receipt_date: "2026-09-09T01:05:00.000Z",
  updated_at: "2026-09-09T09:40:00.000Z",
  cancelled_at: "2026-09-09T09:40:00.000Z",
  total_money: 180.0,
  note: "Rung up twice by mistake",
};

/**
 * A LATE-NIGHT SALE, AND THE ONLY FIXTURE THAT SEPARATES UTC FROM BANGKOK.
 *
 * 18:45 UTC on the 9th is 01:45 on the TENTH in Bangkok. A normaliser that ignored the merchant's
 * zone would file this on the 9th, which is the day before the cafe would say it happened -- and
 * every other fixture here lands on the same day under both readings, so without this one the whole
 * timezone rule could be deleted and the suite would stay green.
 *
 * Its `receipt_date` and `created_at` also straddle the boundary IN OPPOSITE DIRECTIONS, so trap 3
 * is separable too: the sale is the 10th in Bangkok, the sync is still the 9th.
 */
export const LATE_NIGHT_SALE: LoyverseReceiptFixture = {
  ...SALE,
  receipt_number: "1-1005",
  receipt_type: "SALE",
  refund_for: null,
  // 01:45 on the 10th in Bangkok.
  receipt_date: "2026-09-09T18:45:00.000Z",
  // 23:55 on the 9th in Bangkok -- an EARLIER Bangkok day than the sale it describes, which is
  // only possible because the two fields mean different things.
  created_at: "2026-09-09T16:55:00.000Z",
  updated_at: "2026-09-09T18:45:30.000Z",
  cancelled_at: null,
  total_money: 320.0,
  note: null,
};

/** What one page of `/receipts` looks like. Four receipts, four different behaviours. */
export const PAGE: readonly LoyverseReceiptFixture[] = [SALE, REFUND, CANCELLED, LATE_NIGHT_SALE];

/** `GET /merchant/`, shaped from the `MerchantProfile` schema. The currency lives here and only here. */
export const MERCHANT = {
  id: "b4d08058-dc81-11ea-90b4-1269e7c5a22d",
  business_name: "Doi Chaang Corner",
  email: "owner@example.co.th",
  country: "th",
  currency: { code: "THB", decimal_places: 2 },
  created_at: "2024-01-18T04:20:00.000Z",
} as const;
