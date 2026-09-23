// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";

export type FinancialRule = Database["public"]["Tables"]["financial_rules"]["Row"];
export type FinancialRuleVersion = Database["public"]["Tables"]["financial_rule_versions"]["Row"];
export type CashUseOverride = Database["public"]["Tables"]["cash_use_overrides"]["Row"];

export type RuleType = "minimum_cash_floor";
export type RuleStatus = "active" | "inactive";

/** Statuses returned by safe_to_deploy_by_currency(). Never a silently-assumed floor. */
export type SafeToDeployStatus = "calculated" | "not_configured";

/**
 * Neutral, non-advisory relationship labels — see
 * docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "rule conflict semantics".
 * Monatriq never returns approve/reject/recommend.
 */
export type RuleConflictStatus = "aligned" | "attention" | "conflict" | "not_configured" | "insufficient_information";

export interface FinancialRuleSummary {
  ruleId: string;
  ruleType: RuleType;
  currencyCode: string;
  status: RuleStatus;
  currentThreshold: string | null;
  effectiveAt: string | null;
}

export interface FinancialRuleHistoryItem {
  id: string;
  thresholdValue: string;
  effectiveAt: string;
  note: string | null;
}

/**
 * Same honest-nullable-mapping situation as every prior domain's summary
 * type: every non-liquid_cash/currency_code/status field is genuinely
 * null when status is 'not_configured' — the generated RPC return type
 * doesn't know this from the SQL CASE branches.
 */
export interface SafeToDeployResult {
  currencyCode: string;
  status: SafeToDeployStatus;
  liquidCash: string;
  protectedGoalCash: string;
  uncoveredProtectedObligations: string;
  protectedCommitments: string;
  minimumCashFloor: string | null;
  requiredRetainedCash: string | null;
  safeToDeploy: string | null;
  retainedDeficit: string | null;
}

export interface ProposedCashUseEvaluation {
  bucketId: string;
  currencyCode: string;
  currentBalance: string;
  proposedAmount: string;
  postUseBalance: string;
  currentProtectedAllocation: string;
  currentAllocationShortfall: string;
  postUseAllocationShortfall: string;
  currencySafeToDeployBefore: string | null;
  currencySafeToDeployAfter: string | null;
  /**
   * The full recomputed hypothetical state (P0-E2-S6A) — not just folded
   * into the neutral labels below. Computed by the SAME
   * safe_to_deploy_by_currency() formula real-state reads use, with this
   * bucket's proposed spend applied as a hypothetical override, so a
   * goal funded from multiple buckets and obligations linked to it are
   * fully and correctly recomputed — never a locally-patched estimate.
   */
  protectedGoalCashAfter: string;
  uncoveredProtectedObligationsAfter: string;
  protectedCommitmentsAfter: string;
  minimumCashFloorStatus: RuleConflictStatus;
  protectedGoalStatus: RuleConflictStatus;
  protectedObligationStatus: RuleConflictStatus;
  retainedDeficitAfter: string | null;
}

export interface CreateFinancialRuleInput {
  ruleType: RuleType;
  currencyCode: string;
  thresholdValue: string;
  note?: string;
}

export interface RecordFinancialRuleVersionInput {
  ruleId: string;
  thresholdValue: string;
  note?: string;
}

export interface RecordCashUseOverrideInput {
  bucketId: string;
  amount: string;
  contextType?: string;
  note?: string;
}
