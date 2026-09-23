import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type { FinancialPositionSummary, NativeFinancialPosition } from "./types.ts";
import type { SafeToDeployStatus } from "../rules/types.ts";
import { getProfile } from "../profile/repository.ts";
import { getGoalSummaries } from "../goals/repository.ts";
import { getDecisionSummaries } from "../decisions/repository.ts";
import { getUpcomingObligations } from "../obligations/repository.ts";

type Client = SupabaseClient<Database>;

function mapNativePosition(row: {
  currency_code: string;
  liquid_cash: string;
  non_cash_asset_value: string;
  receivables_outstanding: string;
  liabilities_outstanding: string;
  net_worth: string;
  protected_goal_cash: string | null;
  protected_commitments: string | null;
  minimum_cash_floor: string | null;
  required_retained_cash: string | null;
  safe_to_deploy: string | null;
  safe_to_deploy_status: string;
  retained_deficit: string | null;
  asset_quick_sale_potential: string | null;
  receivables_estimated_recoverable: string | null;
  receivables_recoverability_difference: string | null;
  allocation_shortfall: string;
}): NativeFinancialPosition {
  return {
    currencyCode: row.currency_code,
    liquidCash: row.liquid_cash,
    nonCashAssetValue: row.non_cash_asset_value,
    receivablesOutstanding: row.receivables_outstanding,
    liabilitiesOutstanding: row.liabilities_outstanding,
    netWorth: row.net_worth,
    protectedGoalCash: row.protected_goal_cash,
    protectedCommitments: row.protected_commitments,
    minimumCashFloor: row.minimum_cash_floor,
    requiredRetainedCash: row.required_retained_cash,
    safeToDeploy: row.safe_to_deploy,
    safeToDeployStatus: row.safe_to_deploy_status as SafeToDeployStatus,
    retainedDeficit: row.retained_deficit,
    assetQuickSalePotential: row.asset_quick_sale_potential,
    receivablesEstimatedRecoverable: row.receivables_estimated_recoverable,
    receivablesRecoverabilityDifference: row.receivables_recoverability_difference,
    allocationShortfall: row.allocation_shortfall,
  };
}

/**
 * The per-currency numeric core, exactly as financial_position_by_
 * currency() composes it — one round trip, every figure read from an
 * existing canonical domain function. See the migration file's header
 * for the full query-strategy rationale.
 */
export async function getFinancialPositionByCurrency(client: Client): Promise<NativeFinancialPosition[]> {
  const { data, error } = await client.rpc("financial_position_by_currency");
  if (error) throw error;
  return (data ?? []).map(mapNativePosition);
}

/**
 * The overall Financial Position: the per-currency numeric core plus
 * Goals/Obligations/Decisions summaries fetched in parallel from their
 * own unmodified domain functions — never reshaped or re-derived here.
 * Recent Activity and a "This Month" figure are deliberately NOT
 * included this phase (see docs/architecture/FINANCIAL_DOMAIN_MODEL.md,
 * "Financial Position scope") — Recent Activity belongs to Home's own
 * integration, and no canonical Money read model for a monthly summary
 * exists yet to reuse.
 */
export async function getFinancialPositionSummary(client: Client): Promise<FinancialPositionSummary> {
  const [profile, nativePositions, goals, decisions, upcomingObligations] = await Promise.all([
    getProfile(client),
    getFinancialPositionByCurrency(client),
    getGoalSummaries(client),
    getDecisionSummaries(client),
    getUpcomingObligations(client),
  ]);

  const activeGoals = goals.filter((g) => g.status === "active");
  const focusGoal = goals.find((g) => g.isFocus) ?? null;
  const activeDecisions = decisions.filter((d) => d.status === "active");

  return {
    asOf: new Date().toISOString(),
    reportingCurrency: profile?.preferred_currency ?? null,
    nativePositions,
    upcomingObligations,
    focusGoal,
    activeGoals,
    activeDecisions,
  };
}
