import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  Budget,
  BudgetCategoryStatus,
  BudgetFact,
  BudgetStatus,
  BudgetSummary,
  BudgetUpcomingCommitment,
} from "./types.ts";

type Client = SupabaseClient<Database>;
type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];

function asNumericParam(value: string): number {
  return value as unknown as number;
}

function mapBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status as BudgetStatus,
    expectedMoneyIn: row.expected_money_in === null ? null : String(row.expected_money_in),
    notes: row.notes,
  };
}

export async function listBudgets(client: Client): Promise<Budget[]> {
  const { data, error } = await client.from("budgets").select("*").order("period_start", { ascending: false });
  if (error) throw error;
  return data.map(mapBudget);
}

export async function createBudget(
  client: Client,
  input: { currencyCode: string; month?: string; expectedMoneyIn?: string; notes?: string },
): Promise<Budget> {
  const { data, error } = await client.rpc("create_budget", {
    p_currency_code: input.currencyCode,
    p_month: input.month,
    p_expected_money_in: input.expectedMoneyIn === undefined ? undefined : asNumericParam(input.expectedMoneyIn),
    p_notes: input.notes,
  });
  if (error) throw error;
  return mapBudget(data as BudgetRow);
}

export async function setBudgetCategoryAmount(
  client: Client,
  budgetId: string,
  categoryCode: string,
  plannedAmount: string,
): Promise<void> {
  const { error } = await client.rpc("set_budget_category_amount", {
    p_budget_id: budgetId,
    p_category_code: categoryCode,
    p_planned_amount: asNumericParam(plannedAmount),
  });
  if (error) throw error;
}

export async function removeBudgetCategoryAmount(client: Client, budgetId: string, categoryCode: string): Promise<boolean> {
  const { data, error } = await client.rpc("remove_budget_category_amount", {
    p_budget_id: budgetId,
    p_category_code: categoryCode,
  });
  if (error) throw error;
  return data;
}

export async function setBudgetStatus(client: Client, budgetId: string, status: BudgetStatus): Promise<Budget> {
  const { data, error } = await client.rpc("set_budget_status", { p_budget_id: budgetId, p_status: status });
  if (error) throw error;
  return mapBudget(data as BudgetRow);
}

export async function getBudgetCategoryStatus(client: Client, budgetId: string): Promise<BudgetCategoryStatus[]> {
  const { data, error } = await client.rpc("budget_category_status", { p_budget_id: budgetId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    categoryCode: r.category_code,
    categoryLabel: r.category_label,
    planned: r.planned as string | null,
    spent: r.spent,
    remaining: r.remaining as string | null,
    isBudgeted: r.is_budgeted,
    isOver: r.is_over,
  }));
}

export async function getBudgetSummary(client: Client, budgetId: string): Promise<BudgetSummary> {
  const { data, error } = await client.rpc("budget_summary", { p_budget_id: budgetId });
  if (error) throw error;
  const r = (data ?? [])[0];
  if (!r) throw new Error(`budget ${budgetId} not found`);
  return {
    budgetId: r.budget_id,
    currencyCode: r.currency_code,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status as BudgetStatus,
    expectedMoneyIn: r.expected_money_in as string | null,
    plannedTotal: r.planned_total as string | null,
    actualSpendingTotal: r.actual_spending_total,
    budgetedSpent: r.budgeted_spent,
    unbudgetedSpent: r.unbudgeted_spent,
    remaining: r.remaining as string | null,
    isOver: r.is_over,
    budgetedCategoryCount: r.budgeted_category_count,
    upcomingCommitmentsTotal: r.upcoming_commitments_total,
    periodDays: r.period_days,
    daysElapsed: r.days_elapsed,
    periodState: r.period_state as BudgetSummary["periodState"],
  };
}

export async function getBudgetUpcomingCommitments(client: Client, budgetId: string): Promise<BudgetUpcomingCommitment[]> {
  const { data, error } = await client.rpc("budget_upcoming_commitments", { p_budget_id: budgetId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    obligationId: r.obligation_id,
    name: r.name,
    amount: r.amount,
    dueDate: r.due_date,
    isProtected: r.is_protected,
  }));
}

/** Future-Decisions boundary: planned/spent/remaining facts for a currency/date/category. Empty when no budget covers it. */
export async function getBudgetFactsForDate(
  client: Client,
  input: { currencyCode: string; onDate?: string; categoryCode?: string },
): Promise<BudgetFact[]> {
  const { data, error } = await client.rpc("budget_facts_for_date", {
    p_currency_code: input.currencyCode,
    p_on_date: input.onDate,
    p_category_code: input.categoryCode,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    scope: r.scope as BudgetFact["scope"],
    budgetId: r.budget_id,
    categoryCode: r.category_code as string | null,
    planned: r.planned as string | null,
    spent: r.spent,
    remaining: r.remaining as string | null,
  }));
}
