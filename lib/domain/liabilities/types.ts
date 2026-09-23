// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

export type Liability = Database["public"]["Tables"]["liabilities"]["Row"];
export type LiabilityType = Database["public"]["Tables"]["liability_types"]["Row"];
export type LiabilityTypeCode = Liability["liability_type"];
export type LiabilityPrincipalEvent =
  Database["public"]["Tables"]["liability_principal_events"]["Row"];
export type FinancialOperation = Database["public"]["Tables"]["financial_operations"]["Row"];

/**
 * Same honest-nullable-mapping situation as ReceivableSummary/AssetSummary
 * — see lib/domain/receivables/repository.ts's comment.
 */
export interface LiabilitySummary {
  liabilityId: string;
  name: string;
  liabilityType: LiabilityTypeCode;
  currencyCode: string;
  outstandingPrincipal: string;
  principalRepaid: string;
  interestRate: number | null;
  openedAt: string | null;
  maturityDate: string | null;
  isArchived: boolean;
}

export interface LiabilityPrincipalHistoryItem {
  liabilityId: string;
  principalEventId: string;
  principalEventType: LiabilityPrincipalEvent["principal_event_type"];
  amount: string;
  currencyCode: string;
  occurredAt: string;
  description: string | null;
  voided: boolean;
}

export interface CreateLiabilityInput {
  name: string;
  liabilityType: LiabilityTypeCode;
  currencyCode: string;
  openingPrincipal: string;
  counterparty?: string;
  interestRate?: number;
  openedAt?: string;
  maturityDate?: string;
  occurredAt?: string;
}

/** Currency is always the liability's own native currency — the source/destination bucket must match it. */
export interface RecordDebtPaymentInput {
  liabilityId: string;
  bucketId: string;
  principalAmount?: string;
  interestAmount?: string;
  feeAmount?: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export interface RecordLoanProceedsInput {
  liabilityId: string;
  bucketId: string;
  amount: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export interface RecordLiabilityAdjustmentInput {
  liabilityId: string;
  amount: string;
  occurredAt?: string;
  description?: string;
}

/** Fields a user may change on an existing liability — matches the DB's column-level UPDATE grant. */
export interface LiabilityUpdate {
  liabilityType?: LiabilityTypeCode;
  name?: string;
  counterparty?: string | null;
  interestRate?: number | null;
  maturityDate?: string | null;
  currencyCode?: string;
  isArchived?: boolean;
}

export type { CurrencyAmount };
