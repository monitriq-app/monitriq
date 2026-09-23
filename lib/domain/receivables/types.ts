// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

export type Receivable = Database["public"]["Tables"]["receivables"]["Row"];
export type ReceivableLedgerEvent =
  Database["public"]["Tables"]["receivable_ledger_events"]["Row"];
export type ReceivableRecoverableEstimate =
  Database["public"]["Tables"]["receivable_recoverable_estimates"]["Row"];

/**
 * receivable_summary() is generated as if every derived column were
 * non-nullable (a Supabase type-generator limitation for functions using
 * LEFT JOIN LATERAL — see lib/domain/assets/repository.ts for the same
 * issue), but Postgres genuinely returns NULL for a receivable with no
 * estimate, no expected date, or no recovery yet. This is the honest
 * shape the repository maps the raw RPC result into.
 */
export interface ReceivableSummary {
  receivableId: string;
  name: string;
  currencyCode: string;
  faceAmount: string;
  recoveredAmount: string;
  outstandingAmount: string;
  estimatedRecoverableValue: string | null;
  expectedPaymentDate: string | null;
  lastFollowUpAt: string | null;
  isArchived: boolean;
  latestRecoveryAt: string | null;
}

export interface ReceivableLedgerHistoryItem {
  receivableId: string;
  ledgerEventId: string;
  ledgerEventType: ReceivableLedgerEvent["ledger_event_type"];
  amount: string;
  currencyCode: string;
  occurredAt: string;
  description: string | null;
  voided: boolean;
}

export interface CreateReceivableInput {
  name: string;
  currencyCode: string;
  faceAmount: string;
  description?: string;
  occurredAt?: string;
  estimatedRecoverableValue?: string;
  expectedPaymentDate?: string;
}

/** Currency is always the receivable's own native currency — the destination bucket must match it (rejected otherwise, no cross-currency settlement this phase). */
export interface RecordRecoveryInput {
  receivableId: string;
  bucketId: string;
  amount: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export interface RecordAdjustmentInput {
  receivableId: string;
  amount: string;
  occurredAt?: string;
  description?: string;
}

export interface RecordEstimateInput {
  receivableId: string;
  value: string;
  estimatedAt?: string;
  note?: string;
}

/** Fields a user may change on an existing receivable — matches the DB's column-level UPDATE grant. */
export interface ReceivableUpdate {
  name?: string;
  description?: string | null;
  currencyCode?: string;
  expectedPaymentDate?: string | null;
  lastFollowUpAt?: string | null;
  isArchived?: boolean;
}

export type { CurrencyAmount };
