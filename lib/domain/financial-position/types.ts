import type { GoalSummary } from "../goals/types.ts";
import type { DecisionSummary } from "../decisions/types.ts";
import type { UpcomingObligation } from "../obligations/types.ts";
import type { SafeToDeployStatus } from "../rules/types.ts";

/**
 * One row per native currency — the composed output of
 * financial_position_by_currency(). Every field is read from an
 * existing canonical domain function; Net Worth is the only value this
 * domain itself defines. Honest-nullable-mapping: several fields are
 * genuinely null (never a fabricated 0) when the underlying figure was
 * never recorded — see the "Empty / partial states" section of the
 * phase report.
 */
export interface NativeFinancialPosition {
  currencyCode: string;

  // NET WORTH components.
  liquidCash: string;
  nonCashAssetValue: string;
  receivablesOutstanding: string;
  liabilitiesOutstanding: string;
  /** liquidCash + nonCashAssetValue + receivablesOutstanding − liabilitiesOutstanding. May be negative — never clamped. */
  netWorth: string;

  // LIQUID / PROTECTED POSITION — verbatim from safe_to_deploy_by_currency().
  /** Actual backed protected cash (never the nominal allocation) — null only when safe_to_deploy_by_currency() has no row for this currency at all. */
  protectedGoalCash: string | null;
  protectedCommitments: string | null;
  minimumCashFloor: string | null;
  requiredRetainedCash: string | null;
  safeToDeploy: string | null;
  safeToDeployStatus: SafeToDeployStatus;
  retainedDeficit: string | null;

  // POTENTIAL LIQUIDITY — kept distinct, never summed into one "liquid total."
  /** null ("Not set") when no non-archived asset in this currency has a quick_sale_estimate recorded — never 0. */
  assetQuickSalePotential: string | null;
  /** null ("Not set") when no non-archived receivable in this currency has an estimated_recoverable_value recorded — never 0. */
  receivablesEstimatedRecoverable: string | null;
  /** receivablesEstimatedRecoverable − receivablesOutstanding. Null exactly when receivablesEstimatedRecoverable is null. */
  receivablesRecoverabilityDifference: string | null;

  /** Sum of goal_bucket_shortfalls() for buckets in this currency — surfaced explicitly, never hidden inside Safe to Deploy. */
  allocationShortfall: string;
}

/**
 * The overall Financial Position response. Domain boundaries stay
 * intact: activeGoals/activeDecisions/upcomingObligations are the exact,
 * unmodified output of their own domains' summary functions — this
 * layer does not reshape or re-derive them.
 */
export interface FinancialPositionSummary {
  /** When this position was evaluated — a current-state snapshot, not a permanently-current value. */
  asOf: string;
  /** The user's profiles.preferred_currency — null if onboarding never set one. */
  reportingCurrency: string | null;
  nativePositions: NativeFinancialPosition[];
  upcomingObligations: UpcomingObligation[];
  /** The user's explicitly-chosen focus goal, or null — never algorithmically selected. */
  focusGoal: GoalSummary | null;
  activeGoals: GoalSummary[];
  /** Active (non-archived) Decisions only, in no particular order — never ranked. */
  activeDecisions: DecisionSummary[];
}
