import type { EnvelopeRow, MetricName } from "@repo/contract";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export const STRIPE_REVENUE_CATEGORIES = new Set([
  "charge",
  "charge_failure",
  "dispute",
  "dispute_reversal",
  "partial_capture_reversal",
  "refund",
  "refund_failure",
]);

export interface StripeBalanceTransaction {
  readonly id?: string;
  readonly amount?: number;
  readonly available_on?: number;
  readonly created?: number;
  readonly currency?: string;
  readonly fee?: number;
  readonly net?: number;
  readonly reporting_category?: string;
  readonly source?: string | Readonly<Record<string, unknown>> | null;
  readonly status?: "available" | "pending" | string;
  readonly type?: string;
}

export class StripeNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeNormalizeError";
  }
}

function integer(value: number | undefined, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new StripeNormalizeError(`stripe: ${field} must be a safe integer in minor units`);
  }
  return value as number;
}

export function stripeMajorAmount(amount: number, currency: string): number {
  return amount / (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100);
}

function timestamp(value: number | undefined, field: string): string {
  const seconds = integer(value, field);
  const result = new Date(seconds * 1000);
  if (Number.isNaN(result.getTime())) {
    throw new StripeNormalizeError(`stripe: ${field} is not a Unix timestamp`);
  }
  return result.toISOString();
}

export interface StripeNormalizeOptions {
  readonly transactions: readonly StripeBalanceTransaction[];
  readonly accountId: string;
  readonly fetchedAt: string;
  readonly firstSeenAt: string;
}

/**
 * Turn only payments-related Balance Transactions into settlement rows. Payouts and transfers move
 * money between balances; treating them as revenue would double-count the same sale.
 */
export function normalizeStripeBalanceTransactions(options: StripeNormalizeOptions): EnvelopeRow[] {
  const rows: EnvelopeRow[] = [];

  for (const transaction of options.transactions) {
    const category = transaction.reporting_category;
    if (category === undefined || !STRIPE_REVENUE_CATEGORIES.has(category)) continue;
    if (!transaction.id) {
      throw new StripeNormalizeError("stripe: a balance transaction carries no id");
    }
    if (!transaction.currency || !/^[a-zA-Z]{3}$/.test(transaction.currency)) {
      throw new StripeNormalizeError(
        `stripe: transaction ${transaction.id} carries no ISO currency`,
      );
    }

    const currency = transaction.currency.toUpperCase();
    const amount = integer(transaction.amount, `${transaction.id} amount`);
    const fee = integer(transaction.fee, `${transaction.id} fee`);
    const net = integer(transaction.net, `${transaction.id} net`);
    if (amount - fee !== net) {
      throw new StripeNormalizeError(
        `stripe: transaction ${transaction.id} violates amount - fee = net`,
      );
    }

    const createdAt = timestamp(transaction.created, `${transaction.id} created`);
    const availableAt = timestamp(transaction.available_on, `${transaction.id} available_on`);
    const metrics: Partial<Record<MetricName, number>> = {
      net_revenue: stripeMajorAmount(net, currency),
      fees: stripeMajorAmount(fee, currency),
    };
    if (category !== "dispute" && category !== "dispute_reversal") {
      metrics.revenue = stripeMajorAmount(amount, currency);
    }

    rows.push({
      source: "stripe",
      entity: {
        type: "transaction",
        id: transaction.id,
        account_id: options.accountId,
        native_entity_type: transaction.type ?? "balance_transaction",
        native_id: typeof transaction.source === "string" ? transaction.source : transaction.id,
      },
      dimensions: {
        date: createdAt.slice(0, 10),
        currency,
        timezone: "UTC",
        attribution_window: null,
      },
      metrics,
      fetched_at: options.fetchedAt,
      source_updated_at: null,
      restates_until: availableAt,
      is_provisional:
        transaction.status !== "available" ||
        Date.parse(options.fetchedAt) < Date.parse(availableAt),
      first_seen_at: options.firstSeenAt,
      fx_source: null,
      fx_rate_date: null,
      fx_rate: null,
      fx_base: null,
      raw: transaction,
    });
  }

  return rows;
}
