import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  CreateDecisionInput,
  CreateDecisionScenarioInput,
  Decision,
  DecisionChoiceHistoryItem,
  DecisionScenario,
  DecisionScenarioEvaluation,
  DecisionScenarioEvaluationHistoryItem,
  DecisionScenarioEvaluationRow,
  DecisionScenarioUpdate,
  DecisionSummary,
  DecisionType,
  DecisionUpdate,
  RecordDecisionChoiceInput,
  RuleRelationshipStatus,
} from "./types.ts";

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

export async function listDecisionTypes(client: Client): Promise<DecisionType[]> {
  const { data, error } = await client.from("decision_types").select("*").order("sort_order");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listDecisions(client: Client): Promise<Decision[]> {
  const { data, error } = await client.from("decisions").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function getDecisionSummaries(client: Client): Promise<DecisionSummary[]> {
  const { data, error } = await client.rpc("decision_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    decisionId: row.decision_id,
    decisionTypeCode: row.decision_type_code as DecisionSummary["decisionTypeCode"],
    decisionTypeLabel: row.decision_type_label,
    name: row.name,
    description: row.description as string | null,
    status: row.status as DecisionSummary["status"],
    linkedAssetId: row.linked_asset_id as string | null,
    linkedAssetName: row.linked_asset_name as string | null,
    linkedLiabilityId: row.linked_liability_id as string | null,
    linkedLiabilityName: row.linked_liability_name as string | null,
    scenarioCount: row.scenario_count,
    currentChoice: row.current_choice as DecisionSummary["currentChoice"],
    currentChoiceAt: row.current_choice_at as string | null,
    createdAt: row.created_at,
  }));
}

export async function listDecisionScenarios(client: Client, decisionId: string): Promise<DecisionScenario[]> {
  const { data, error } = await client
    .from("decision_scenarios")
    .select("*")
    .eq("decision_id", decisionId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function getDecisionChoiceHistory(
  client: Client,
  decisionId: string,
  limit = 50,
): Promise<DecisionChoiceHistoryItem[]> {
  const { data, error } = await client.rpc("decision_choice_history", { p_decision_id: decisionId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    choice: row.choice as DecisionChoiceHistoryItem["choice"],
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function getDecisionScenarioEvaluationHistory(
  client: Client,
  scenarioId: string,
  limit = 50,
): Promise<DecisionScenarioEvaluationHistoryItem[]> {
  const { data, error } = await client.rpc("decision_scenario_evaluation_history", {
    p_scenario_id: scenarioId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    evaluatedAt: row.evaluated_at,
    snapshot: row.snapshot,
    createdAt: row.created_at,
  }));
}

function mapEvaluation(row: {
  scenario_id: string;
  decision_id: string;
  decision_type_code: string;
  currency_code: string;
  linked_asset_id: string | null;
  linked_asset_cost_basis: string | null;
  linked_asset_latest_value: string | null;
  linked_asset_quick_sale_estimate: string | null;
  linked_asset_target_value: string | null;
  linked_liability_id: string | null;
  linked_liability_outstanding_principal: string | null;
  source_bucket_balance: string | null;
  destination_bucket_balance: string | null;
  cash_required: string | null;
  acquisition_costs: string | null;
  gross_proceeds: string | null;
  proceeds_costs: string | null;
  debt_principal_payment: string | null;
  debt_interest_payment: string | null;
  debt_fee_payment: string | null;
  expected_value_assumption: string | null;
  expected_future_sale_value: string | null;
  total_cash_required: string | null;
  net_proceeds: string | null;
  net_immediate_cash_delta: string | null;
  hypothetical_bucket_id: string | null;
  bucket_balance_before: string | null;
  bucket_balance_after: string | null;
  currency_safe_to_deploy_before: string | null;
  currency_safe_to_deploy_after: string | null;
  retained_deficit_before: string | null;
  retained_deficit_after: string | null;
  projected_gross_profit_loss: string | null;
  hypothetical_liability_outstanding_after: string | null;
  basis_after_capitalized_improvement: string | null;
  minimum_cash_floor_status: string | null;
  protected_goal_status: string | null;
  protected_obligation_status: string | null;
  overall_status: string;
  missing_information: string[] | null;
}): DecisionScenarioEvaluation {
  return {
    scenarioId: row.scenario_id,
    decisionId: row.decision_id,
    decisionTypeCode: row.decision_type_code as DecisionScenarioEvaluation["decisionTypeCode"],
    currencyCode: row.currency_code,
    linkedAssetId: row.linked_asset_id,
    linkedAssetCostBasis: row.linked_asset_cost_basis,
    linkedAssetLatestValue: row.linked_asset_latest_value,
    linkedAssetQuickSaleEstimate: row.linked_asset_quick_sale_estimate,
    linkedAssetTargetValue: row.linked_asset_target_value,
    linkedLiabilityId: row.linked_liability_id,
    linkedLiabilityOutstandingPrincipal: row.linked_liability_outstanding_principal,
    sourceBucketBalance: row.source_bucket_balance,
    destinationBucketBalance: row.destination_bucket_balance,
    cashRequired: row.cash_required,
    acquisitionCosts: row.acquisition_costs,
    grossProceeds: row.gross_proceeds,
    proceedsCosts: row.proceeds_costs,
    debtPrincipalPayment: row.debt_principal_payment,
    debtInterestPayment: row.debt_interest_payment,
    debtFeePayment: row.debt_fee_payment,
    expectedValueAssumption: row.expected_value_assumption,
    expectedFutureSaleValue: row.expected_future_sale_value,
    totalCashRequired: row.total_cash_required,
    netProceeds: row.net_proceeds,
    netImmediateCashDelta: row.net_immediate_cash_delta,
    hypotheticalBucketId: row.hypothetical_bucket_id,
    bucketBalanceBefore: row.bucket_balance_before,
    bucketBalanceAfter: row.bucket_balance_after,
    currencySafeToDeployBefore: row.currency_safe_to_deploy_before,
    currencySafeToDeployAfter: row.currency_safe_to_deploy_after,
    retainedDeficitBefore: row.retained_deficit_before,
    retainedDeficitAfter: row.retained_deficit_after,
    projectedGrossProfitLoss: row.projected_gross_profit_loss,
    hypotheticalLiabilityOutstandingAfter: row.hypothetical_liability_outstanding_after,
    basisAfterCapitalizedImprovement: row.basis_after_capitalized_improvement,
    minimumCashFloorStatus: row.minimum_cash_floor_status as RuleRelationshipStatus | null,
    protectedGoalStatus: row.protected_goal_status as RuleRelationshipStatus | null,
    protectedObligationStatus: row.protected_obligation_status as RuleRelationshipStatus | null,
    overallStatus: row.overall_status as RuleRelationshipStatus,
    missingInformation: row.missing_information ?? [],
  };
}

/**
 * A pure, un-persisted read — "what would this scenario mean right now."
 * Reuses evaluate_hypothetical_bucket_liquidity() (shared with the Rules
 * domain's evaluator) for every liquidity/rule-conflict figure; never
 * recomputes Safe to Deploy independently. See save() below for the
 * distinct "intentionally save this" action.
 */
export async function evaluateDecisionScenario(client: Client, scenarioId: string): Promise<DecisionScenarioEvaluation> {
  const { data, error } = await client.rpc("evaluate_decision_scenario", { p_scenario_id: scenarioId });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error("evaluate_decision_scenario returned no row.");
  return mapEvaluation(row);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Never touches financial_events/cash_movements/assets/liabilities/goals/obligations — a Decision is a plan, not a transaction. */
export async function createDecision(client: Client, input: CreateDecisionInput): Promise<Decision> {
  const { data, error } = await client.rpc("create_decision", {
    p_decision_type_code: input.decisionTypeCode,
    p_name: input.name,
    p_description: input.description,
    p_linked_asset_id: input.linkedAssetId,
    p_linked_liability_id: input.linkedLiabilityId,
  });
  if (error) throw error;
  return data;
}

export async function updateDecision(client: Client, decisionId: string, patch: DecisionUpdate): Promise<Decision> {
  const update: Database["public"]["Tables"]["decisions"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.linkedAssetId !== undefined) update.linked_asset_id = patch.linkedAssetId;
  if (patch.linkedLiabilityId !== undefined) update.linked_liability_id = patch.linkedLiabilityId;

  const { data, error } = await client.from("decisions").update(update).eq("id", decisionId).select("*").single();
  if (error) throw error;
  return data;
}

/** Every amount is a user-entered ASSUMPTION — never a fact. No cash/asset/liability effect. */
export async function createDecisionScenario(
  client: Client,
  input: CreateDecisionScenarioInput,
): Promise<DecisionScenario> {
  const { data, error } = await client.rpc("create_decision_scenario", {
    p_decision_id: input.decisionId,
    p_name: input.name,
    p_currency_code: input.currencyCode,
    p_source_bucket_id: input.sourceBucketId,
    p_destination_bucket_id: input.destinationBucketId,
    p_cash_required: asOptionalNumericParam(input.cashRequired),
    p_acquisition_costs: asOptionalNumericParam(input.acquisitionCosts),
    p_gross_proceeds: asOptionalNumericParam(input.grossProceeds),
    p_proceeds_costs: asOptionalNumericParam(input.proceedsCosts),
    p_debt_principal_payment: asOptionalNumericParam(input.debtPrincipalPayment),
    p_debt_interest_payment: asOptionalNumericParam(input.debtInterestPayment),
    p_debt_fee_payment: asOptionalNumericParam(input.debtFeePayment),
    p_interest_rate: input.interestRate,
    p_term_months: input.termMonths,
    p_monthly_payment_assumption: asOptionalNumericParam(input.monthlyPaymentAssumption),
    p_collateral_note: input.collateralNote,
    p_expected_value_assumption: asOptionalNumericParam(input.expectedValueAssumption),
    p_expected_future_sale_value: asOptionalNumericParam(input.expectedFutureSaleValue),
    p_capitalization_classification: input.capitalizationClassification,
    p_sale_date_assumption: input.saleDateAssumption,
    p_holding_period_months: input.holdingPeriodMonths,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

export async function updateDecisionScenario(
  client: Client,
  scenarioId: string,
  patch: DecisionScenarioUpdate,
): Promise<DecisionScenario> {
  const update: Database["public"]["Tables"]["decision_scenarios"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.sourceBucketId !== undefined) update.source_bucket_id = patch.sourceBucketId;
  if (patch.destinationBucketId !== undefined) update.destination_bucket_id = patch.destinationBucketId;
  if (patch.cashRequired !== undefined) update.cash_required = asOptionalNumericParam(patch.cashRequired) ?? null;
  if (patch.acquisitionCosts !== undefined) update.acquisition_costs = asOptionalNumericParam(patch.acquisitionCosts) ?? null;
  if (patch.grossProceeds !== undefined) update.gross_proceeds = asOptionalNumericParam(patch.grossProceeds) ?? null;
  if (patch.proceedsCosts !== undefined) update.proceeds_costs = asOptionalNumericParam(patch.proceedsCosts) ?? null;
  if (patch.debtPrincipalPayment !== undefined)
    update.debt_principal_payment = asOptionalNumericParam(patch.debtPrincipalPayment) ?? null;
  if (patch.debtInterestPayment !== undefined)
    update.debt_interest_payment = asOptionalNumericParam(patch.debtInterestPayment) ?? null;
  if (patch.debtFeePayment !== undefined) update.debt_fee_payment = asOptionalNumericParam(patch.debtFeePayment) ?? null;
  if (patch.interestRate !== undefined) update.interest_rate = patch.interestRate;
  if (patch.termMonths !== undefined) update.term_months = patch.termMonths;
  if (patch.monthlyPaymentAssumption !== undefined)
    update.monthly_payment_assumption = asOptionalNumericParam(patch.monthlyPaymentAssumption) ?? null;
  if (patch.collateralNote !== undefined) update.collateral_note = patch.collateralNote;
  if (patch.expectedValueAssumption !== undefined)
    update.expected_value_assumption = asOptionalNumericParam(patch.expectedValueAssumption) ?? null;
  if (patch.expectedFutureSaleValue !== undefined)
    update.expected_future_sale_value = asOptionalNumericParam(patch.expectedFutureSaleValue) ?? null;
  if (patch.capitalizationClassification !== undefined)
    update.capitalization_classification = patch.capitalizationClassification;
  if (patch.saleDateAssumption !== undefined) update.sale_date_assumption = patch.saleDateAssumption;
  if (patch.holdingPeriodMonths !== undefined) update.holding_period_months = patch.holdingPeriodMonths;
  if (patch.note !== undefined) update.note = patch.note;

  const { data, error } = await client
    .from("decision_scenarios")
    .update(update)
    .eq("id", scenarioId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Recording a choice — including 'proceed' — creates no financial effect anywhere. Intent only. */
export async function recordDecisionChoice(client: Client, input: RecordDecisionChoiceInput) {
  const { data, error } = await client.rpc("record_decision_choice", {
    p_decision_id: input.decisionId,
    p_choice: input.choice,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

/**
 * Freezes the current evaluate_decision_scenario() result into an
 * immutable snapshot — append-only, never overwrites a prior evaluation.
 */
export async function saveDecisionScenarioEvaluation(
  client: Client,
  scenarioId: string,
): Promise<DecisionScenarioEvaluationRow> {
  const { data, error } = await client.rpc("save_decision_scenario_evaluation", { p_scenario_id: scenarioId });
  if (error) throw error;
  return data;
}
