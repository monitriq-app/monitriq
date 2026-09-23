// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";

export type Decision = Database["public"]["Tables"]["decisions"]["Row"];
export type DecisionType = Database["public"]["Tables"]["decision_types"]["Row"];
export type DecisionScenario = Database["public"]["Tables"]["decision_scenarios"]["Row"];
export type DecisionChoiceRow = Database["public"]["Tables"]["decision_choices"]["Row"];
export type DecisionScenarioEvaluationRow = Database["public"]["Tables"]["decision_scenario_evaluations"]["Row"];

export type DecisionTypeCode =
  | "buy_asset"
  | "sell_asset"
  | "repair_improve_asset"
  | "business_investment"
  | "large_personal_purchase"
  | "use_savings"
  | "take_debt"
  | "pay_down_debt"
  | "start_new_venture"
  | "other";

export type DecisionStatus = "active" | "closed" | "archived";

/** A Decision's actual conclusion — deliberately separate from status (lifecycle). Never executes anything. */
export type DecisionChoice = "proceed" | "wait" | "decline" | "keep_reviewing";

export type CapitalizationClassification = "capital_improvement" | "expense";

/** The established neutral rule-relationship vocabulary — never a recommendation. */
export type RuleRelationshipStatus = "aligned" | "attention" | "conflict" | "not_configured" | "insufficient_information";

export interface DecisionSummary {
  decisionId: string;
  decisionTypeCode: DecisionTypeCode;
  decisionTypeLabel: string;
  name: string;
  description: string | null;
  status: DecisionStatus;
  linkedAssetId: string | null;
  linkedAssetName: string | null;
  linkedLiabilityId: string | null;
  linkedLiabilityName: string | null;
  scenarioCount: number;
  currentChoice: DecisionChoice | null;
  currentChoiceAt: string | null;
  createdAt: string;
}

export interface DecisionChoiceHistoryItem {
  id: string;
  choice: DecisionChoice;
  note: string | null;
  createdAt: string;
}

export interface DecisionScenarioEvaluationHistoryItem {
  id: string;
  evaluatedAt: string;
  snapshot: unknown;
  createdAt: string;
}

/**
 * Facts, assumptions, and derived values are kept explicitly distinct at
 * the type level (never merged into one ambiguous bag), mirroring the
 * migration's own three-way separation. `missingInformation` lists
 * concepts the evaluation lacked — never silently defaulted to zero.
 */
export interface DecisionScenarioEvaluation {
  scenarioId: string;
  decisionId: string;
  decisionTypeCode: DecisionTypeCode;
  currencyCode: string;

  // FACTS — read live from their owning domain, never copied/mutable.
  linkedAssetId: string | null;
  linkedAssetCostBasis: string | null;
  linkedAssetLatestValue: string | null;
  linkedAssetQuickSaleEstimate: string | null;
  linkedAssetTargetValue: string | null;
  linkedLiabilityId: string | null;
  linkedLiabilityOutstandingPrincipal: string | null;
  sourceBucketBalance: string | null;
  destinationBucketBalance: string | null;

  // ASSUMPTIONS — echoed back exactly as the user entered them.
  cashRequired: string | null;
  acquisitionCosts: string | null;
  grossProceeds: string | null;
  proceedsCosts: string | null;
  debtPrincipalPayment: string | null;
  debtInterestPayment: string | null;
  debtFeePayment: string | null;
  expectedValueAssumption: string | null;
  expectedFutureSaleValue: string | null;

  // DERIVED — computed from facts + assumptions, labeled Projected/Scenario in the UI.
  totalCashRequired: string | null;
  netProceeds: string | null;
  netImmediateCashDelta: string | null;
  hypotheticalBucketId: string | null;
  bucketBalanceBefore: string | null;
  bucketBalanceAfter: string | null;
  currencySafeToDeployBefore: string | null;
  currencySafeToDeployAfter: string | null;
  retainedDeficitBefore: string | null;
  retainedDeficitAfter: string | null;
  projectedGrossProfitLoss: string | null;
  hypotheticalLiabilityOutstandingAfter: string | null;
  basisAfterCapitalizedImprovement: string | null;

  // RULE RELATIONSHIPS — neutral vocabulary, never a recommendation.
  minimumCashFloorStatus: RuleRelationshipStatus | null;
  protectedGoalStatus: RuleRelationshipStatus | null;
  protectedObligationStatus: RuleRelationshipStatus | null;
  /** The strongest observed component status — a filtering convenience, NOT a recommendation. Components above remain individually visible. */
  overallStatus: RuleRelationshipStatus;

  missingInformation: string[];
}

export interface CreateDecisionInput {
  decisionTypeCode: DecisionTypeCode;
  name: string;
  description?: string;
  linkedAssetId?: string;
  linkedLiabilityId?: string;
}

/** Fields a user may change on an existing decision — matches the DB's column-level UPDATE grant. */
export interface DecisionUpdate {
  name?: string;
  description?: string | null;
  status?: DecisionStatus;
  linkedAssetId?: string | null;
  linkedLiabilityId?: string | null;
}

export interface CreateDecisionScenarioInput {
  decisionId: string;
  name: string;
  currencyCode: string;
  sourceBucketId?: string;
  destinationBucketId?: string;
  cashRequired?: string;
  acquisitionCosts?: string;
  grossProceeds?: string;
  proceedsCosts?: string;
  debtPrincipalPayment?: string;
  debtInterestPayment?: string;
  debtFeePayment?: string;
  interestRate?: number;
  termMonths?: number;
  monthlyPaymentAssumption?: string;
  collateralNote?: string;
  expectedValueAssumption?: string;
  expectedFutureSaleValue?: string;
  capitalizationClassification?: CapitalizationClassification;
  saleDateAssumption?: string;
  holdingPeriodMonths?: number;
  note?: string;
}

/** Fields a user may change on an existing scenario — matches the DB's column-level UPDATE grant. currency_code is fixed at creation. */
export type DecisionScenarioUpdate = Partial<Omit<CreateDecisionScenarioInput, "decisionId" | "currencyCode">>;

export interface RecordDecisionChoiceInput {
  decisionId: string;
  choice: DecisionChoice;
  note?: string;
}
