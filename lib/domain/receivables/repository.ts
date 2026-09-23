import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  CreateReceivableInput,
  Receivable,
  ReceivableLedgerEvent,
  ReceivableLedgerHistoryItem,
  ReceivableRecoverabilityCoverage,
  ReceivableRecoverableEstimate,
  ReceivableSummary,
  ReceivableUpdate,
  RecordAdjustmentInput,
  RecordEstimateInput,
  RecordRecoveryInput,
  RecoverabilityCoverageStatus,
} from "./types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

type Client = SupabaseClient<Database>;

/** Same string-not-number discipline as lib/domain/money/repository.ts's asNumericParam. */
function asNumericParam(value: string): number {
  return value as unknown as number;
}

function asOptionalNumericParam(value: string | undefined): number | undefined {
  return value === undefined ? undefined : asNumericParam(value);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listReceivables(client: Client): Promise<Receivable[]> {
  const { data, error } = await client.from("receivables").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function updateReceivable(
  client: Client,
  receivableId: string,
  patch: ReceivableUpdate,
): Promise<Receivable> {
  const update: Database["public"]["Tables"]["receivables"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.currencyCode !== undefined) update.currency_code = patch.currencyCode;
  if (patch.expectedPaymentDate !== undefined) update.expected_payment_date = patch.expectedPaymentDate;
  if (patch.lastFollowUpAt !== undefined) update.last_follow_up_at = patch.lastFollowUpAt;
  if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;

  const { data, error } = await client
    .from("receivables")
    .update(update)
    .eq("id", receivableId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * receivable_summary() is generated with every derived column typed as
 * non-nullable `string` (the same LEFT JOIN LATERAL limitation documented
 * in lib/domain/assets/repository.ts), but Postgres genuinely returns
 * NULL when a receivable has no estimate/expected-date/recovery yet. This
 * mapping is the one place that mismatch is corrected.
 */
export async function getReceivableSummaries(client: Client): Promise<ReceivableSummary[]> {
  const { data, error } = await client.rpc("receivable_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    receivableId: row.receivable_id,
    name: row.name,
    currencyCode: row.currency_code,
    faceAmount: row.face_amount,
    recoveredAmount: row.recovered_amount,
    outstandingAmount: row.outstanding_amount,
    estimatedRecoverableValue: row.estimated_recoverable_value as string | null,
    expectedPaymentDate: row.expected_payment_date as string | null,
    lastFollowUpAt: row.last_follow_up_at as string | null,
    isArchived: row.is_archived,
    latestRecoveryAt: row.latest_recovery_at as string | null,
  }));
}

/** Per-currency recoverability-estimate coverage — see receivable_recoverability_coverage() in the migration. */
export async function getReceivableRecoverabilityCoverage(client: Client): Promise<ReceivableRecoverabilityCoverage[]> {
  const { data, error } = await client.rpc("receivable_recoverability_coverage");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    activeReceivableCount: row.active_receivable_count,
    recoverabilityEstimateCount: row.recoverability_estimate_count,
    recoverableSum: row.recoverable_sum,
    coverageStatus: row.coverage_status as RecoverabilityCoverageStatus,
  }));
}

export async function getReceivableNativeCurrencyTotals(client: Client): Promise<CurrencyAmount[]> {
  const { data, error } = await client.rpc("receivable_native_currency_totals");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    amount: row.total_outstanding,
  }));
}

export async function getReceivableLedgerHistory(
  client: Client,
  limit = 50,
): Promise<ReceivableLedgerHistoryItem[]> {
  const { data, error } = await client.rpc("receivable_ledger_history", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    receivableId: row.receivable_id,
    ledgerEventId: row.ledger_event_id,
    ledgerEventType: row.ledger_event_type as ReceivableLedgerEvent["ledger_event_type"],
    amount: row.amount,
    currencyCode: row.currency_code,
    occurredAt: row.occurred_at,
    description: row.description,
    voided: row.voided,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Atomically creates a receivable plus its opening face amount and
 * (optionally) an initial recoverable estimate — mirrors create_asset().
 * Never touches financial_events/cash_movements: onboarding an existing
 * receivable does not move cash.
 */
export async function createReceivable(client: Client, input: CreateReceivableInput): Promise<Receivable> {
  const { data, error } = await client.rpc("create_receivable", {
    p_name: input.name,
    p_currency_code: input.currencyCode,
    p_face_amount: asNumericParam(input.faceAmount),
    p_description: input.description,
    p_occurred_at: input.occurredAt,
    p_estimated_recoverable_value: asOptionalNumericParam(input.estimatedRecoverableValue),
    p_expected_payment_date: input.expectedPaymentDate,
  });
  if (error) throw error;
  return data;
}

/**
 * A real cash event: creates a financial_event, a positive cash_movement
 * into the destination bucket, and the receivable's recovery ledger row,
 * atomically — see record_receivable_recovery() in the migration. Rejects
 * a bucket whose currency doesn't match the receivable's native currency,
 * and rejects recovering more than the current outstanding amount.
 */
export async function recordRecovery(client: Client, input: RecordRecoveryInput) {
  const { data, error } = await client.rpc("record_receivable_recovery", {
    p_receivable_id: input.receivableId,
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export async function recordAdjustment(
  client: Client,
  input: RecordAdjustmentInput,
): Promise<ReceivableLedgerEvent> {
  const { data, error } = await client.rpc("record_receivable_adjustment", {
    p_receivable_id: input.receivableId,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}

export async function recordRecoverableEstimate(
  client: Client,
  input: RecordEstimateInput,
): Promise<ReceivableRecoverableEstimate> {
  const { data, error } = await client.rpc("record_recoverable_estimate", {
    p_receivable_id: input.receivableId,
    p_value: asNumericParam(input.value),
    p_estimated_at: input.estimatedAt,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}
