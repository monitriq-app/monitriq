import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  CreateLiabilityInput,
  FinancialOperation,
  Liability,
  LiabilityPrincipalEvent,
  LiabilityPrincipalHistoryItem,
  LiabilitySummary,
  LiabilityType,
  LiabilityUpdate,
  RecordDebtPaymentInput,
  RecordLiabilityAdjustmentInput,
  RecordLoanProceedsInput,
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
// Reference data
// ---------------------------------------------------------------------------

export async function listLiabilityTypes(client: Client): Promise<LiabilityType[]> {
  const { data, error } = await client.from("liability_types").select("*").order("display_name");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listLiabilities(client: Client): Promise<Liability[]> {
  const { data, error } = await client.from("liabilities").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function updateLiability(
  client: Client,
  liabilityId: string,
  patch: LiabilityUpdate,
): Promise<Liability> {
  const update: Database["public"]["Tables"]["liabilities"]["Update"] = {};
  if (patch.liabilityType !== undefined) update.liability_type = patch.liabilityType;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.counterparty !== undefined) update.counterparty = patch.counterparty;
  if (patch.interestRate !== undefined) update.interest_rate = patch.interestRate;
  if (patch.maturityDate !== undefined) update.maturity_date = patch.maturityDate;
  if (patch.currencyCode !== undefined) update.currency_code = patch.currencyCode;
  if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;

  const { data, error } = await client
    .from("liabilities")
    .update(update)
    .eq("id", liabilityId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getLiabilitySummaries(client: Client): Promise<LiabilitySummary[]> {
  const { data, error } = await client.rpc("liability_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    liabilityId: row.liability_id,
    name: row.name,
    liabilityType: row.liability_type,
    currencyCode: row.currency_code,
    outstandingPrincipal: row.outstanding_principal,
    principalRepaid: row.principal_repaid,
    interestRate: row.interest_rate as number | null,
    openedAt: row.opened_at as string | null,
    maturityDate: row.maturity_date as string | null,
    isArchived: row.is_archived,
  }));
}

export async function getLiabilityNativeCurrencyTotals(client: Client): Promise<CurrencyAmount[]> {
  const { data, error } = await client.rpc("liability_native_currency_totals");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    amount: row.total_outstanding,
  }));
}

export async function getLiabilityPrincipalHistory(
  client: Client,
  limit = 50,
): Promise<LiabilityPrincipalHistoryItem[]> {
  const { data, error } = await client.rpc("liability_principal_history", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    liabilityId: row.liability_id,
    principalEventId: row.principal_event_id,
    principalEventType: row.principal_event_type as LiabilityPrincipalEvent["principal_event_type"],
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
 * Atomically creates a liability plus its opening principal — mirrors
 * create_asset()/create_receivable(). Never touches financial_events/
 * cash_movements: onboarding existing debt does not fabricate today's
 * Money In.
 */
export async function createLiability(client: Client, input: CreateLiabilityInput): Promise<Liability> {
  const { data, error } = await client.rpc("create_liability", {
    p_name: input.name,
    p_liability_type: input.liabilityType,
    p_currency_code: input.currencyCode,
    p_opening_principal: asNumericParam(input.openingPrincipal),
    p_counterparty: input.counterparty,
    p_interest_rate: input.interestRate,
    p_opened_at: input.openedAt,
    p_maturity_date: input.maturityDate,
    p_occurred_at: input.occurredAt,
  });
  if (error) throw error;
  return data;
}

/**
 * The compound operation: up to three financial_events (principal,
 * interest, fee — each only created when its amount is > 0), one
 * cash_movement per component, and one liability_principal_events
 * "repayment" row for the principal component, all in a single
 * transaction sharing one financial_operations row. See
 * record_debt_payment() in the migration and
 * docs/architecture/FINANCIAL_DOMAIN_MODEL.md's compound-operation
 * section for why principal/interest/fee cannot share one
 * financial_event.
 */
export async function recordDebtPayment(
  client: Client,
  input: RecordDebtPaymentInput,
): Promise<FinancialOperation> {
  const { data, error } = await client.rpc("record_debt_payment", {
    p_liability_id: input.liabilityId,
    p_bucket_id: input.bucketId,
    p_principal_amount: asOptionalNumericParam(input.principalAmount) ?? 0,
    p_interest_amount: asOptionalNumericParam(input.interestAmount) ?? 0,
    p_fee_amount: asOptionalNumericParam(input.feeAmount) ?? 0,
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export async function recordLoanProceeds(client: Client, input: RecordLoanProceedsInput) {
  const { data, error } = await client.rpc("record_loan_proceeds", {
    p_liability_id: input.liabilityId,
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export async function recordLiabilityAdjustment(
  client: Client,
  input: RecordLiabilityAdjustmentInput,
): Promise<LiabilityPrincipalEvent> {
  const { data, error } = await client.rpc("record_liability_adjustment", {
    p_liability_id: input.liabilityId,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}
