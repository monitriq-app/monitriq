import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type { CreateObligationInput, Obligation, ObligationSummary, ObligationUpdate, UpcomingObligation } from "./types.ts";

type Client = SupabaseClient<Database>;

/** Same string-not-number discipline as lib/domain/money/repository.ts's asNumericParam. */
function asNumericParam(value: string): number {
  return value as unknown as number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listObligations(client: Client): Promise<Obligation[]> {
  const { data, error } = await client.from("obligations").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function getObligationSummaries(client: Client): Promise<ObligationSummary[]> {
  const { data, error } = await client.rpc("obligation_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    obligationId: row.obligation_id,
    name: row.name,
    description: row.description as string | null,
    currencyCode: row.currency_code,
    amount: row.amount,
    dueDate: row.due_date as string | null,
    status: row.status as ObligationSummary["status"],
    isProtected: row.is_protected,
    fundingGoalId: row.funding_goal_id as string | null,
    isOverdue: row.is_overdue,
    createdAt: row.created_at,
  }));
}

/** Default 30-day horizon when start/end are omitted — see upcoming_obligations() in the migration. */
export async function getUpcomingObligations(
  client: Client,
  start?: string,
  end?: string,
): Promise<UpcomingObligation[]> {
  const { data, error } = await client.rpc("upcoming_obligations", { p_start: start, p_end: end });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    obligationId: row.obligation_id,
    name: row.name,
    currencyCode: row.currency_code,
    amount: row.amount,
    dueDate: row.due_date,
    isProtected: row.is_protected,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Never touches financial_events/cash_movements — recording a commitment
 * the user knows about has zero cash effect. If funding_goal_id is set,
 * the database independently validates ownership, currency match, and
 * that the goal accepts monetary funding (cash_target/debt_balance_target
 * only) — see prepare_obligation() and the obligations_insert_own policy.
 */
export async function createObligation(client: Client, input: CreateObligationInput): Promise<Obligation> {
  const { data, error } = await client.rpc("create_obligation", {
    p_name: input.name,
    p_currency_code: input.currencyCode,
    p_amount: asNumericParam(input.amount),
    p_description: input.description,
    p_due_date: input.dueDate,
    p_is_protected: input.isProtected,
    p_funding_goal_id: input.fundingGoalId,
  });
  if (error) throw error;
  return data;
}

/**
 * Marking an obligation "paid" is organizational metadata only — it does
 * NOT fabricate a Money transaction. See docs/architecture/
 * FINANCIAL_DOMAIN_MODEL.md, "paid obligation".
 */
export async function updateObligation(client: Client, obligationId: string, patch: ObligationUpdate): Promise<Obligation> {
  const update: Database["public"]["Tables"]["obligations"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.currencyCode !== undefined) update.currency_code = patch.currencyCode;
  if (patch.amount !== undefined) update.amount = asNumericParam(patch.amount);
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.isProtected !== undefined) update.is_protected = patch.isProtected;
  if (patch.fundingGoalId !== undefined) update.funding_goal_id = patch.fundingGoalId;

  const { data, error } = await client.from("obligations").update(update).eq("id", obligationId).select("*").single();
  if (error) throw error;
  return data;
}
