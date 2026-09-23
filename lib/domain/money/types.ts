// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts. This module is used by both the Next.js app
// and the plain-`node` test harness (supabase/tests/money/).
import type { Database } from "../../supabase/database.types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

export type { CurrencyAmount } from "../currency/types.ts";

export type CashBucket = Database["public"]["Tables"]["cash_buckets"]["Row"];
export type FinancialEvent = Database["public"]["Tables"]["financial_events"]["Row"];
export type MoneyReceivedCategory =
  Database["public"]["Tables"]["money_received_categories"]["Row"];
export type MoneySpendingCategory =
  Database["public"]["Tables"]["money_spending_categories"]["Row"];

export type BucketType = CashBucket["bucket_type"];
export type EventType = FinancialEvent["event_type"];
export type CashFlowClass = FinancialEvent["cash_flow_class"];

export interface BucketBalance extends CurrencyAmount {
  bucketId: string;
}

export interface MoneyActivityItem {
  eventId: string;
  eventType: EventType;
  cashFlowClass: CashFlowClass;
  occurredAt: string;
  description: string | null;
  receivedCategoryCode: string | null;
  spendingCategoryCode: string | null;
  voidedAt: string | null;
  movementId: string;
  bucketId: string;
  currencyCode: string;
  amount: string;
}

/** Fields a user may set when creating a bucket — matches the DB's column-level INSERT grant. */
export interface CashBucketInput {
  name: string;
  currencyCode: string;
  bucketType: BucketType;
}

/** Fields a user may change on an existing bucket — matches the DB's column-level UPDATE grant. */
export type CashBucketUpdate = Partial<CashBucketInput & { isArchived: boolean }>;

/**
 * One native currency's real EXTERNAL cash flow for a period. cashIn/
 * cashOut classify by financial_events.cash_flow_class, never by
 * event_type or by summing every positive/negative movement — see
 * money_period_summary() in the migration. earnedIncome/expense are
 * strict subsets (income only, expense only); transferIn/transferOut are
 * exposed separately and are never counted in cashIn/cashOut/netExternalCashFlow.
 */
export interface MoneyPeriodCurrencySummary {
  currencyCode: string;
  cashIn: string;
  cashOut: string;
  /** cashIn − cashOut. */
  netExternalCashFlow: string;
  earnedIncome: string;
  expense: string;
  transferIn: string;
  transferOut: string;
}

/**
 * The resolved period plus one summary per native currency with any
 * activity in it. periodStart/periodEnd are always populated (via
 * resolve_period_bounds()) even when `currencies` is empty — a period
 * with zero activity is still a real, knowable period, not a missing one.
 */
export interface MoneyPeriodSummary {
  periodStart: string;
  periodEnd: string;
  currencies: MoneyPeriodCurrencySummary[];
}
