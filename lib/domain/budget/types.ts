/**
 * Budget read/write shapes. Amounts are exact-decimal STRINGS (same as every
 * other domain) -- never Number. Budget owns no transactions: `spent` is
 * derived from Money on every read.
 */
export type BudgetStatus = "active" | "closed" | "archived";
export type BudgetPeriodState = "not_started" | "in_progress" | "ended";

export interface Budget {
  id: string;
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  status: BudgetStatus;
  expectedMoneyIn: string | null;
  notes: string | null;
}

export interface BudgetCategoryStatus {
  categoryCode: string;
  categoryLabel: string;
  /** null = "Not budgeted" (no allocation). "0.000000" = an explicit zero. */
  planned: string | null;
  spent: string;
  /** null when not budgeted. May be negative when over budget. */
  remaining: string | null;
  isBudgeted: boolean;
  isOver: boolean;
}

export interface BudgetSummary {
  budgetId: string;
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  status: BudgetStatus;
  expectedMoneyIn: string | null;
  /** null when no category is planned. */
  plannedTotal: string | null;
  actualSpendingTotal: string;
  budgetedSpent: string;
  unbudgetedSpent: string;
  /** plannedTotal - actualSpendingTotal; null when nothing is planned (never a fake zero). */
  remaining: string | null;
  isOver: boolean;
  budgetedCategoryCount: number;
  /** Informational only; never subtracted from remaining and never counted as spending. */
  upcomingCommitmentsTotal: string;
  periodDays: number;
  daysElapsed: number;
  periodState: BudgetPeriodState;
}

export interface BudgetUpcomingCommitment {
  obligationId: string;
  name: string;
  amount: string;
  dueDate: string;
  isProtected: boolean;
}

/** Facts only -- no advice, no verdict. Consumed by a future Decisions phase. */
export interface BudgetFact {
  scope: "total" | "category";
  budgetId: string;
  categoryCode: string | null;
  planned: string | null;
  spent: string;
  remaining: string | null;
}
