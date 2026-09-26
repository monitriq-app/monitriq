import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  CashUseOverride,
  CreateFinancialRuleInput,
  FinancialRule,
  FinancialRuleHistoryItem,
  FinancialRuleSummary,
  ProposedCashUseEvaluation,
  RecordCashUseOverrideInput,
  RecordFinancialRuleVersionInput,
  RuleConflictStatus,
  SafeToDeployResult,
  SafeToDeployStatus,
} from "./types.ts";

type Client = SupabaseClient<Database>;

/** Same string-not-number discipline as lib/domain/money/repository.ts's asNumericParam. */
function asNumericParam(value: string): number {
  return value as unknown as number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listFinancialRules(client: Client): Promise<FinancialRule[]> {
  const { data, error } = await client.from("financial_rules").select("*").order("currency_code");
  if (error) throw error;
  return data;
}

export async function getFinancialRuleSummaries(client: Client): Promise<FinancialRuleSummary[]> {
  const { data, error } = await client.rpc("financial_rule_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ruleId: row.rule_id,
    ruleType: row.rule_type as FinancialRuleSummary["ruleType"],
    currencyCode: row.currency_code,
    status: row.status as FinancialRuleSummary["status"],
    currentThreshold: row.current_threshold as string | null,
    effectiveAt: row.effective_at as string | null,
  }));
}

export async function getFinancialRuleHistory(
  client: Client,
  ruleId: string,
  limit = 50,
): Promise<FinancialRuleHistoryItem[]> {
  const { data, error } = await client.rpc("financial_rule_history", { p_rule_id: ruleId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    thresholdValue: row.threshold_value,
    effectiveAt: row.effective_at,
    note: row.note,
  }));
}

/**
 * Real state by default. With `hypothetical`, the SAME canonical calculation with one account's
 * balance shifted by `delta` (e.g. a proposed purchase = a negative delta): a pure read, exactly what
 * evaluate_proposed_cash_use() uses for its "after" figures. No formula lives in this wrapper.
 */
export async function getSafeToDeployByCurrency(client: Client, hypothetical?: { bucketId: string; delta: string }): Promise<SafeToDeployResult[]> {
  const { data, error } = await client.rpc(
    "safe_to_deploy_by_currency",
    hypothetical ? { p_hypothetical_bucket_id: hypothetical.bucketId, p_hypothetical_delta: asNumericParam(hypothetical.delta) } : undefined,
  );
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    status: row.status as SafeToDeployStatus,
    liquidCash: row.liquid_cash,
    protectedGoalCash: row.protected_goal_cash,
    uncoveredProtectedObligations: row.uncovered_protected_obligations,
    protectedCommitments: row.protected_commitments,
    minimumCashFloor: row.minimum_cash_floor as string | null,
    requiredRetainedCash: row.required_retained_cash as string | null,
    safeToDeploy: row.safe_to_deploy as string | null,
    retainedDeficit: row.retained_deficit as string | null,
  }));
}

export async function evaluateProposedCashUse(
  client: Client,
  bucketId: string,
  amount: string,
): Promise<ProposedCashUseEvaluation> {
  const { data, error } = await client.rpc("evaluate_proposed_cash_use", {
    p_bucket_id: bucketId,
    p_amount: asNumericParam(amount),
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error("evaluate_proposed_cash_use returned no row.");
  return {
    bucketId: row.bucket_id,
    currencyCode: row.currency_code,
    currentBalance: row.current_balance,
    proposedAmount: row.proposed_amount,
    postUseBalance: row.post_use_balance,
    currentProtectedAllocation: row.current_protected_allocation,
    currentAllocationShortfall: row.current_allocation_shortfall,
    postUseAllocationShortfall: row.post_use_allocation_shortfall,
    currencySafeToDeployBefore: row.currency_safe_to_deploy_before as string | null,
    currencySafeToDeployAfter: row.currency_safe_to_deploy_after as string | null,
    protectedGoalCashAfter: row.protected_goal_cash_after,
    uncoveredProtectedObligationsAfter: row.uncovered_protected_obligations_after,
    protectedCommitmentsAfter: row.protected_commitments_after,
    minimumCashFloorStatus: row.minimum_cash_floor_status as RuleConflictStatus,
    protectedGoalStatus: row.protected_goal_status as RuleConflictStatus,
    protectedObligationStatus: row.protected_obligation_status as RuleConflictStatus,
    retainedDeficitAfter: row.retained_deficit_after as string | null,
  };
}

export async function listCashUseOverrides(client: Client): Promise<CashUseOverride[]> {
  const { data, error } = await client.from("cash_use_overrides").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Atomically creates a rule identity plus its first version, or reactivates
 * a previously-deactivated rule with a new version — mirrors create_goal()'s
 * "identity + first history row" pattern. Never touches financial_events/
 * cash_movements: configuring a rule has zero cash effect.
 */
export async function createFinancialRule(client: Client, input: CreateFinancialRuleInput): Promise<FinancialRule> {
  const { data, error } = await client.rpc("create_financial_rule", {
    p_rule_type: input.ruleType,
    p_currency_code: input.currencyCode,
    p_threshold_value: asNumericParam(input.thresholdValue),
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

/** Threshold changes are append-only — the old threshold is preserved, never overwritten. */
export async function recordFinancialRuleVersion(client: Client, input: RecordFinancialRuleVersionInput) {
  const { data, error } = await client.rpc("record_financial_rule_version", {
    p_rule_id: input.ruleId,
    p_threshold_value: asNumericParam(input.thresholdValue),
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

export async function setFinancialRuleStatus(
  client: Client,
  ruleId: string,
  status: "active" | "inactive",
): Promise<FinancialRule> {
  const { data, error } = await client.from("financial_rules").update({ status }).eq("id", ruleId).select("*").single();
  if (error) throw error;
  return data;
}

/**
 * Records that the user acknowledged the conflicts evaluate_proposed_cash_
 * use() showed at this moment — an immutable audit row. Never creates a
 * cash_movement, never alters a goal or obligation; the conflicts_snapshot
 * JSONB is a frozen record of what was shown, not a source for further
 * arithmetic.
 */
export async function recordCashUseOverride(
  client: Client,
  input: RecordCashUseOverrideInput,
): Promise<CashUseOverride> {
  const { data, error } = await client.rpc("record_cash_use_override", {
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_context_type: input.contextType,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}
