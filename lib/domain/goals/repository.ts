import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  BucketShortfall,
  CreateGoalInput,
  CreateGoalMilestoneInput,
  Goal,
  GoalAllocationEvent,
  GoalAllocationHistoryItem,
  GoalMilestone,
  GoalMilestoneUpdate,
  GoalSummary,
  GoalTargetHistoryItem,
  GoalTargetHistoryRow,
  GoalType,
  GoalUpdate,
  MeasurementType,
  RecordGoalAllocationInput,
  RecordGoalReallocationInput,
  RecordGoalReleaseInput,
  RecordGoalTargetInput,
  RequiredPaceStatus,
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

export async function listGoalTypes(client: Client): Promise<GoalType[]> {
  const { data, error } = await client.from("goal_types").select("*").order("sort_order");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listGoals(client: Client): Promise<Goal[]> {
  const { data, error } = await client.from("goals").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function updateGoal(client: Client, goalId: string, patch: GoalUpdate): Promise<Goal> {
  const update: Database["public"]["Tables"]["goals"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.isProtected !== undefined) update.is_protected = patch.isProtected;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.currencyCode !== undefined) update.currency_code = patch.currencyCode;

  const { data, error } = await client.from("goals").update(update).eq("id", goalId).select("*").single();
  if (error) throw error;
  return data;
}

/**
 * The real at-most-one-focus-goal invariant lives in a partial unique
 * index (goals_one_focus_per_user) that applies regardless of path — this
 * RPC is a convenience for atomically switching focus (unset the old one,
 * set the new one) in one call. Pass null to clear focus entirely.
 */
export async function setFocusGoal(client: Client, goalId: string | null): Promise<void> {
  const { error } = await client.rpc("set_focus_goal", { p_goal_id: goalId ?? undefined });
  if (error) throw error;
}

export async function getGoalSummaries(client: Client): Promise<GoalSummary[]> {
  const { data, error } = await client.rpc("goal_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    goalId: row.goal_id,
    goalTypeCode: row.goal_type_code,
    goalTypeLabel: row.goal_type_label,
    measurementType: row.measurement_type as MeasurementType,
    name: row.name,
    description: row.description as string | null,
    currencyCode: row.currency_code as string | null,
    status: row.status as GoalSummary["status"],
    isProtected: row.is_protected,
    isFocus: row.is_focus,
    priority: row.priority as number | null,
    targetValue: row.target_value as string | null,
    targetDate: row.target_date as string | null,
    allocatedTotal: row.allocated_total as string | null,
    remaining: row.remaining as string | null,
    percentage: row.percentage as number | null,
    liabilityId: row.liability_id as string | null,
    startingLiabilityBalance: row.starting_liability_balance as string | null,
    currentOutstandingPrincipal: row.current_outstanding_principal as string | null,
    debtProgressPercentage: row.debt_progress_percentage as number | null,
    requiredPaceStatus: row.required_pace_status as RequiredPaceStatus | null,
    requiredPaceAmount: row.required_pace_amount as string | null,
    requiredPacePeriodsRemaining: row.required_pace_periods_remaining as number | null,
    milestoneCompletedCount: row.milestone_completed_count,
    milestoneTotalCount: row.milestone_total_count,
    createdAt: row.created_at,
  }));
}

export async function getGoalNativeCurrencyTotals(client: Client): Promise<CurrencyAmount[]> {
  const { data, error } = await client.rpc("goal_native_currency_totals");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    amount: row.total_allocated,
  }));
}

export async function getGoalProtectedAllocationTotals(client: Client): Promise<CurrencyAmount[]> {
  const { data, error } = await client.rpc("goal_protected_allocation_totals");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    amount: row.total_protected_allocated,
  }));
}

export async function getGoalBucketShortfalls(client: Client): Promise<BucketShortfall[]> {
  const { data, error } = await client.rpc("goal_bucket_shortfalls");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    bucketId: row.bucket_id,
    bucketName: row.bucket_name,
    currencyCode: row.currency_code,
    balance: row.balance,
    allocatedTotal: row.allocated_total,
    shortfall: row.shortfall,
  }));
}

export async function getGoalTargetHistory(
  client: Client,
  goalId: string,
  limit = 50,
): Promise<GoalTargetHistoryItem[]> {
  const { data, error } = await client.rpc("goal_target_history_list", { p_goal_id: goalId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    targetValue: row.target_value as string | null,
    currencyCode: row.currency_code as string | null,
    targetDate: row.target_date as string | null,
    effectiveAt: row.effective_at,
    note: row.note as string | null,
  }));
}

export async function getGoalAllocationHistory(
  client: Client,
  goalId: string,
  limit = 50,
): Promise<GoalAllocationHistoryItem[]> {
  const { data, error } = await client.rpc("goal_allocation_history", { p_goal_id: goalId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    bucketId: row.bucket_id,
    eventType: row.event_type as GoalAllocationHistoryItem["eventType"],
    amount: row.amount,
    currencyCode: row.currency_code,
    note: row.note as string | null,
    createdAt: row.created_at,
  }));
}

export async function listGoalMilestones(client: Client, goalId: string): Promise<GoalMilestone[]> {
  const { data, error } = await client
    .from("goal_milestones")
    .select("*")
    .eq("goal_id", goalId)
    .order("sort_order");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Atomically creates a goal plus, if a target was supplied, its first
 * goal_target_history row — mirrors create_receivable()/create_liability().
 * For a debt_balance_target goal, currency and starting_liability_balance
 * are derived server-side from the linked liability, never client-chosen.
 * Never touches financial_events/cash_movements/goal_allocation_events:
 * creating a goal or setting its target has zero cash effect.
 */
export async function createGoal(client: Client, input: CreateGoalInput): Promise<Goal> {
  const { data, error } = await client.rpc("create_goal", {
    p_goal_type_code: input.goalTypeCode,
    p_measurement_type: input.measurementType,
    p_name: input.name,
    p_description: input.description,
    p_currency_code: input.currencyCode,
    p_liability_id: input.liabilityId,
    p_target_value: asOptionalNumericParam(input.targetValue),
    p_target_date: input.targetDate,
    p_is_protected: input.isProtected,
  });
  if (error) throw error;
  return data;
}

/** Target changes are append-only — the old target is preserved, never overwritten. */
export async function recordGoalTarget(client: Client, input: RecordGoalTargetInput): Promise<GoalTargetHistoryRow> {
  const { data, error } = await client.rpc("record_goal_target", {
    p_goal_id: input.goalId,
    p_target_value: asOptionalNumericParam(input.targetValue),
    p_target_date: input.targetDate,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

/**
 * Assigns PURPOSE to cash already in a bucket — never creates a
 * financial_events/cash_movements row. The bucket row is locked
 * server-side (SELECT ... FOR UPDATE) before the available-to-allocate
 * capacity check, so this is safe against two concurrent allocation
 * attempts against the same bucket.
 */
export async function recordGoalAllocation(
  client: Client,
  input: RecordGoalAllocationInput,
): Promise<GoalAllocationEvent> {
  const { data, error } = await client.rpc("record_goal_allocation", {
    p_goal_id: input.goalId,
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

/** Releases a purpose assignment — cash never moves, no Money event. */
export async function recordGoalRelease(client: Client, input: RecordGoalReleaseInput): Promise<GoalAllocationEvent> {
  const { data, error } = await client.rpc("record_goal_release", {
    p_goal_id: input.goalId,
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

/**
 * Atomic release-from-A + allocate-to-B, same bucket, sharing one
 * transaction — the same money is never simultaneously assigned to both
 * goals. See record_goal_reallocation() in the migration.
 */
export async function recordGoalReallocation(
  client: Client,
  input: RecordGoalReallocationInput,
): Promise<GoalAllocationEvent> {
  const { data, error } = await client.rpc("record_goal_reallocation", {
    p_from_goal_id: input.fromGoalId,
    p_to_goal_id: input.toGoalId,
    p_bucket_id: input.bucketId,
    p_amount: asNumericParam(input.amount),
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export async function createGoalMilestone(client: Client, input: CreateGoalMilestoneInput): Promise<GoalMilestone> {
  const { data, error } = await client.rpc("record_goal_milestone", {
    p_goal_id: input.goalId,
    p_title: input.title,
    p_due_date: input.dueDate,
    p_sort_order: input.sortOrder,
  });
  if (error) throw error;
  return data;
}

/** Marking a milestone complete has zero cash/income/expense/allocation effect — a plain column update. */
export async function updateGoalMilestone(
  client: Client,
  milestoneId: string,
  patch: GoalMilestoneUpdate,
): Promise<GoalMilestone> {
  const update: Database["public"]["Tables"]["goal_milestones"]["Update"] = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { data, error } = await client
    .from("goal_milestones")
    .update(update)
    .eq("id", milestoneId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
