// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

export type Goal = Database["public"]["Tables"]["goals"]["Row"];
export type GoalType = Database["public"]["Tables"]["goal_types"]["Row"];
export type GoalTargetHistoryRow = Database["public"]["Tables"]["goal_target_history"]["Row"];
export type GoalMilestone = Database["public"]["Tables"]["goal_milestones"]["Row"];
export type GoalAllocationEvent = Database["public"]["Tables"]["goal_allocation_events"]["Row"];

export type MeasurementType = "cash_target" | "debt_balance_target" | "monthly_income_target" | "milestone";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type AllocationEventType = "allocate" | "release";

/**
 * Statuses returned by goal_required_pace(). Required Pace is a
 * calculation, not advice — see docs/architecture/FINANCIAL_DOMAIN_MODEL.md,
 * "Required pace".
 */
export type RequiredPaceStatus =
  | "calculated"
  | "target_reached"
  | "no_target_date"
  | "no_target_amount"
  | "date_passed"
  | "not_applicable";

/**
 * Same honest-nullable-mapping situation as ReceivableSummary/
 * LiabilitySummary — the generated RPC return type doesn't know which
 * columns are actually nullable (LEFT JOIN LATERAL / CASE branches), so
 * this interface corrects that by hand. Fields are null, not fabricated,
 * whenever the underlying measurement type doesn't apply or the data
 * simply doesn't exist yet (no target set, no milestones, ...).
 */
export interface GoalSummary {
  goalId: string;
  goalTypeCode: string;
  goalTypeLabel: string;
  measurementType: MeasurementType;
  name: string;
  description: string | null;
  currencyCode: string | null;
  status: GoalStatus;
  isProtected: boolean;
  isFocus: boolean;
  priority: number | null;
  targetValue: string | null;
  targetDate: string | null;
  allocatedTotal: string | null;
  remaining: string | null;
  percentage: number | null;
  liabilityId: string | null;
  startingLiabilityBalance: string | null;
  currentOutstandingPrincipal: string | null;
  debtProgressPercentage: number | null;
  requiredPaceStatus: RequiredPaceStatus | null;
  requiredPaceAmount: string | null;
  requiredPacePeriodsRemaining: number | null;
  milestoneCompletedCount: number;
  milestoneTotalCount: number;
  createdAt: string;
}

export interface GoalTargetHistoryItem {
  id: string;
  targetValue: string | null;
  currencyCode: string | null;
  targetDate: string | null;
  effectiveAt: string;
  note: string | null;
}

export interface GoalAllocationHistoryItem {
  id: string;
  bucketId: string;
  eventType: AllocationEventType;
  amount: string;
  currencyCode: string;
  note: string | null;
  createdAt: string;
}

export interface BucketShortfall {
  bucketId: string;
  bucketName: string;
  currencyCode: string;
  balance: string;
  allocatedTotal: string;
  shortfall: string;
}

export interface CreateGoalInput {
  goalTypeCode: string;
  measurementType: MeasurementType;
  name: string;
  description?: string;
  currencyCode?: string;
  liabilityId?: string;
  targetValue?: string;
  targetDate?: string;
  isProtected?: boolean;
}

export interface RecordGoalTargetInput {
  goalId: string;
  targetValue?: string;
  targetDate?: string;
  note?: string;
}

export interface RecordGoalAllocationInput {
  goalId: string;
  bucketId: string;
  amount: string;
  note?: string;
  idempotencyKey?: string;
}

export interface RecordGoalReleaseInput {
  goalId: string;
  bucketId: string;
  amount: string;
  note?: string;
  idempotencyKey?: string;
}

export interface RecordGoalReallocationInput {
  fromGoalId: string;
  toGoalId: string;
  bucketId: string;
  amount: string;
  note?: string;
  idempotencyKey?: string;
}

export interface CreateGoalMilestoneInput {
  goalId: string;
  title: string;
  dueDate?: string;
  sortOrder?: number;
}

/** Fields a user may change on an existing goal — matches the DB's column-level UPDATE grant. */
export interface GoalUpdate {
  name?: string;
  description?: string | null;
  status?: GoalStatus;
  isProtected?: boolean;
  priority?: number | null;
  currencyCode?: string;
}

export interface GoalMilestoneUpdate {
  title?: string;
  dueDate?: string | null;
  completedAt?: string | null;
  sortOrder?: number;
}

export type { CurrencyAmount };
