import type { SupabaseClient } from "@supabase/supabase-js";
// Relative/extensioned — see the comment in lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";
import type {
  BucketBalance,
  CashBucket,
  CashBucketInput,
  CashBucketUpdate,
  Currency,
  CurrencyAmount,
  FinancialEvent,
  MoneyActivityItem,
  MoneyReceivedCategory,
  MoneySpendingCategory,
} from "./types.ts";

type Client = SupabaseClient<Database>;

/**
 * PostgREST extracts JSON body values as text before casting to the SQL
 * parameter type, so sending a JSON string for a `numeric` RPC parameter is
 * parsed exactly, with no JS float round-trip — the generated Args type
 * describes it as `number` because that's what the SQL type maps to by
 * default, but it does not reflect this string-safe path. This is the one
 * place that "lie" is made and documented; every function below accepts
 * `amount: string` and never a native `number`. See docs/architecture/
 * MULTI_CURRENCY_MODEL.md, "decimal precision".
 */
function asNumericParam(value: string): number {
  return value as unknown as number;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export async function listCurrencies(client: Client): Promise<Currency[]> {
  const { data, error } = await client.from("currencies").select("*").order("code");
  if (error) throw error;
  return data;
}

export async function listMoneyReceivedCategories(client: Client): Promise<MoneyReceivedCategory[]> {
  const { data, error } = await client
    .from("money_received_categories")
    .select("*")
    .order("display_name");
  if (error) throw error;
  return data;
}

export async function listMoneySpendingCategories(client: Client): Promise<MoneySpendingCategory[]> {
  const { data, error } = await client
    .from("money_spending_categories")
    .select("*")
    .order("display_name");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Cash buckets — plain table access is safe here (no amount columns), so no
// RPC is needed for single-row bucket create/update.
// ---------------------------------------------------------------------------

export async function listBuckets(client: Client): Promise<CashBucket[]> {
  const { data, error } = await client.from("cash_buckets").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function createBucket(client: Client, input: CashBucketInput): Promise<CashBucket> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error("createBucket called without an authenticated session.");
  }

  const { data, error } = await client
    .from("cash_buckets")
    .insert({
      user_id: user.id,
      name: input.name,
      currency_code: input.currencyCode,
      bucket_type: input.bucketType,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateBucket(
  client: Client,
  bucketId: string,
  patch: CashBucketUpdate,
): Promise<CashBucket> {
  const update: Database["public"]["Tables"]["cash_buckets"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.currencyCode !== undefined) update.currency_code = patch.currencyCode;
  if (patch.bucketType !== undefined) update.bucket_type = patch.bucketType;
  if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;

  const { data, error } = await client
    .from("cash_buckets")
    .update(update)
    .eq("id", bucketId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Atomic event creation — every multi-row write goes through the matching
// SQL function (supabase/migrations/*_create_money_domain.sql, section 7),
// never sequential client-side inserts. See docs/architecture/
// FINANCIAL_DOMAIN_MODEL.md, "atomicity".
// ---------------------------------------------------------------------------

export interface RecordOpeningBalanceInput {
  bucketId: string;
  amount: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export async function recordOpeningBalance(
  client: Client,
  input: RecordOpeningBalanceInput,
): Promise<FinancialEvent> {
  const { data, error } = await client.rpc("record_opening_balance", {
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export interface RecordMoneyReceivedInput {
  bucketId: string;
  amount: string;
  categoryCode: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export async function recordMoneyReceived(
  client: Client,
  input: RecordMoneyReceivedInput,
): Promise<FinancialEvent> {
  const { data, error } = await client.rpc("record_money_received", {
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_category_code: input.categoryCode,
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export interface RecordMoneySpentInput {
  bucketId: string;
  amount: string;
  categoryCode: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export async function recordMoneySpent(
  client: Client,
  input: RecordMoneySpentInput,
): Promise<FinancialEvent> {
  const { data, error } = await client.rpc("record_money_spent", {
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_category_code: input.categoryCode,
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export interface RecordTransferInput {
  sourceBucketId: string;
  destinationBucketId: string;
  amount: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export async function recordTransfer(
  client: Client,
  input: RecordTransferInput,
): Promise<FinancialEvent> {
  const { data, error } = await client.rpc("record_transfer", {
    p_source_bucket_id: input.sourceBucketId,
    p_destination_bucket_id: input.destinationBucketId,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export interface RecordFxTransferInput {
  sourceBucketId: string;
  destinationBucketId: string;
  sourceAmount: string;
  destinationAmount: string;
  occurredAt?: string;
  description?: string;
  idempotencyKey?: string;
}

export async function recordFxTransfer(
  client: Client,
  input: RecordFxTransferInput,
): Promise<FinancialEvent> {
  const { data, error } = await client.rpc("record_fx_transfer", {
    p_source_bucket_id: input.sourceBucketId,
    p_destination_bucket_id: input.destinationBucketId,
    p_source_amount: asNumericParam(input.sourceAmount),
    p_destination_amount: asNumericParam(input.destinationAmount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

/**
 * The only supported correction this phase — see docs/architecture/
 * FINANCIAL_DOMAIN_MODEL.md, "correction/voiding strategy". A plain RLS +
 * column-grant-protected UPDATE, not an RPC: the database itself only
 * allows this one column to change, and only from null to non-null (see
 * enforce_financial_event_void_only in the migration).
 */
export async function voidFinancialEvent(client: Client, eventId: string): Promise<FinancialEvent> {
  const { data, error } = await client
    .from("financial_events")
    .update({ voided_at: new Date().toISOString() })
    .eq("id", eventId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads — balances and recent activity. One shared, authoritative
// calculation (the SQL functions), never re-derived per screen. Amounts
// arrive as text (see the SQL functions' ::text casts) and are returned
// here exactly as received — never parsed into a JS number.
// ---------------------------------------------------------------------------

export async function getBucketBalances(client: Client): Promise<BucketBalance[]> {
  const { data, error } = await client.rpc("money_bucket_balances");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    bucketId: row.bucket_id,
    currencyCode: row.currency_code,
    amount: row.balance,
  }));
}

export async function getCurrencyTotals(client: Client): Promise<CurrencyAmount[]> {
  const { data, error } = await client.rpc("money_currency_totals");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    amount: row.balance,
  }));
}

export async function getRecentActivity(client: Client, limit = 25): Promise<MoneyActivityItem[]> {
  const { data, error } = await client.rpc("money_recent_activity", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    eventId: row.event_id,
    eventType: row.event_type,
    cashFlowClass: row.cash_flow_class,
    occurredAt: row.occurred_at,
    description: row.description,
    receivedCategoryCode: row.received_category_code,
    spendingCategoryCode: row.spending_category_code,
    voidedAt: row.voided_at,
    movementId: row.movement_id,
    bucketId: row.bucket_id,
    currencyCode: row.currency_code,
    amount: row.amount,
  }));
}
