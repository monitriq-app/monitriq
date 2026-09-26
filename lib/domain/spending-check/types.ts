import type { BudgetFact } from "../budget/types.ts";
import type { ProposedCashUseEvaluation, RuleConflictStatus, SafeToDeployResult } from "../rules/types.ts";
import type { CashStatusResult } from "../rules/cash-status.ts";

/**
 * "Can I afford this?" — a hypothetical, immediate-purchase check. It
 * composes three existing canonical reads and owns no financial formula of
 * its own: evaluate_proposed_cash_use() (cash + Safe to Deploy + protected
 * goals/commitments), safe_to_deploy_by_currency() (the "before" state) and
 * budget_facts_for_date() (Budget). Nothing here is ever persisted.
 */

export interface SpendingCheckInput {
  bucketId: string;
  amount: string;
  categoryCode?: string | null;
  categoryLabel?: string | null;
  description?: string;
  /** YYYY-MM-DD; defaults to today in the profile timezone (resolved by the database). */
  onDate?: string;
}

export interface SpendingCheckFacts {
  currencyCode: string;
  amount: string;
  categoryCode: string | null;
  categoryLabel: string | null;
  evaluation: ProposedCashUseEvaluation;
  safeBefore: SafeToDeployResult | null;
  /** The canonical hypothetical row (this purchase applied) for the same currency: the source of the after-purchase status. */
  safeAfter: SafeToDeployResult | null;
  /** Rows from budget_facts_for_date() — ONLY when the covering Budget is active; otherwise empty. */
  budgetFacts: BudgetFact[];
  /** A non-active (closed) Budget covers today in this currency and was deliberately not used. */
  inactiveBudget: { id: string; status: string } | null;
}

export interface CashCheck {
  before: string;
  after: string;
  canCover: boolean;
  /** How much the account is short by when it cannot cover the purchase. */
  shortBy: string | null;
}

export type BudgetCheckState = "checked" | "no_budget" | "no_plan";
export type CategoryCheckState = "not_selected" | "unbudgeted" | "checked";

export interface CategoryBudgetCheck {
  state: CategoryCheckState;
  label: string | null;
  planned: string | null;
  leftBefore: string | null;
  leftAfter: string | null;
  overBy: string | null;
}

export interface BudgetCheck {
  state: BudgetCheckState;
  /** Set when the Budget for this month exists but is closed, so the user can be pointed at it (to reopen) instead of "Create budget". */
  inactiveBudgetId: string | null;
  plannedTotal: string | null;
  spentBefore: string | null;
  remainingBefore: string | null;
  remainingAfter: string | null;
  overBy: string | null;
  category: CategoryBudgetCheck;
}

export type ProtectionState = "checked" | "needs_setup";

export interface ProtectionCheck {
  /** Minimum cash to keep. "needs_setup" when the user has not set it for this currency. */
  minimumCash: {
    state: ProtectionState;
    minimum: string | null;
    /** All tracked cash in this currency after the purchase (the amount the minimum applies to). */
    totalCashAfter: string | null;
    belowBy: string | null;
    safeToDeployBefore: string | null;
    safeToDeployAfter: string | null;
  };
  /** Where cash would stand against the amount the user wants to keep, after this purchase (same policy as Home/Rules/Money). */
  statusAfter: CashStatusResult;
  /** Money Monitriq is protecting after this purchase (canonical required_retained_cash from the hypothetical row). */
  protectingAfter: string | null;
  goals: { status: RuleConflictStatus; moneyUsed: string | null };
  commitments: { status: RuleConflictStatus; shortfall: string | null };
  /** Set only when required protected cash worsens for a reason none of the three above explains. */
  otherDeficit: string | null;
}

export type SuggestionState = "proceed" | "reduce" | "wait" | "review" | "setup";

export type ReasonCode =
  | "cash_insufficient"
  | "below_minimum_cash"
  | "uses_protected_goal_money"
  | "commitments_underprotected"
  | "below_required_cash"
  | "budget_over"
  | "category_over"
  | "category_unbudgeted"
  | "minimum_cash_not_set"
  | "no_budget"
  | "no_plan"
  | "all_clear";

export interface SuggestionReason {
  code: ReasonCode;
  amounts: Record<string, string>;
}

export interface Suggestion {
  state: SuggestionState;
  /** Factual reasons that decided the state. */
  reasons: SuggestionReason[];
  /** Checks that could not be completed (setup missing); disclosed even when a stronger reason decided the state. */
  caveats: SuggestionReason[];
}

export interface SpendingCheckResult {
  currencyCode: string;
  amount: string;
  categoryCode: string | null;
  cash: CashCheck;
  budget: BudgetCheck;
  protection: ProtectionCheck;
  suggestion: Suggestion;
}

export type { BudgetFact };
