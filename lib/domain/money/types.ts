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
