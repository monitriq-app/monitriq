import { Decimal } from "decimal.js";
import type {
  BudgetCheck,
  CashCheck,
  ProtectionCheck,
  Suggestion,
  SuggestionReason,
  SpendingCheckFacts,
  SpendingCheckResult,
} from "./types.ts";

/**
 * Composes the three canonical reads into one result and applies ONE
 * deterministic suggestion policy. No financial formula lives here: cash
 * before/after, Safe to Deploy, and the protected goal/commitment statuses
 * are read from evaluate_proposed_cash_use(); Budget planned/spent/remaining
 * come from budget_facts_for_date(). The only arithmetic is the hypothetical
 * "remaining minus this purchase" for Budget (exact Decimal), and
 * differences between two canonical figures (e.g. "below minimum by").
 * Same input always gives the same output; there is no score.
 */

const d = (v: string | null | undefined): Decimal => new Decimal(v ?? 0);
const str = (v: Decimal): string => v.toFixed();
const isPositive = (v: Decimal) => v.greaterThan(0);

export function checkCash(f: SpendingCheckFacts): CashCheck {
  const after = d(f.evaluation.postUseBalance);
  const canCover = !after.isNegative();
  return {
    before: f.evaluation.currentBalance,
    after: f.evaluation.postUseBalance,
    canCover,
    shortBy: canCover ? null : str(after.negated()),
  };
}

export function checkBudget(f: SpendingCheckFacts): BudgetCheck {
  const amount = d(f.amount);
  const total = f.budgetFacts.find((x) => x.scope === "total");
  const emptyCategory = { state: "not_selected" as const, label: null, planned: null, leftBefore: null, leftAfter: null, overBy: null };

  if (!total) {
    return { state: "no_budget", inactiveBudgetId: f.inactiveBudget?.id ?? null, plannedTotal: null, spentBefore: null, remainingBefore: null, remainingAfter: null, overBy: null, category: emptyCategory };
  }
  if (total.planned === null || total.remaining === null) {
    return { state: "no_plan", inactiveBudgetId: null, plannedTotal: null, spentBefore: total.spent, remainingBefore: null, remainingAfter: null, overBy: null, category: emptyCategory };
  }

  const remainingAfter = d(total.remaining).minus(amount);

  let category: BudgetCheck["category"] = emptyCategory;
  if (f.categoryCode) {
    const row = f.budgetFacts.find((x) => x.scope === "category" && x.categoryCode === f.categoryCode);
    if (!row || row.planned === null || row.remaining === null) {
      category = { state: "unbudgeted", label: f.categoryLabel, planned: null, leftBefore: null, leftAfter: null, overBy: null };
    } else {
      const left = d(row.remaining).minus(amount);
      category = {
        state: "checked",
        label: f.categoryLabel,
        planned: row.planned,
        leftBefore: row.remaining,
        leftAfter: str(left),
        overBy: left.isNegative() ? str(left.negated()) : null,
      };
    }
  }

  return {
    state: "checked",
    inactiveBudgetId: null,
    plannedTotal: total.planned,
    spentBefore: total.spent,
    remainingBefore: total.remaining,
    remainingAfter: str(remainingAfter),
    overBy: remainingAfter.isNegative() ? str(remainingAfter.negated()) : null,
    category,
  };
}

export function checkProtection(f: SpendingCheckFacts): ProtectionCheck {
  const e = f.evaluation;
  const before = f.safeBefore;
  const configured = e.minimumCashFloorStatus !== "not_configured";

  const totalCashAfter = before ? d(before.liquidCash).minus(d(e.proposedAmount)) : null;
  const minimum = configured && before?.minimumCashFloor ? d(before.minimumCashFloor) : null;
  const belowBy =
    e.minimumCashFloorStatus === "conflict" && minimum && totalCashAfter && minimum.greaterThan(totalCashAfter)
      ? str(minimum.minus(totalCashAfter))
      : null;

  const goalUsed = d(e.postUseAllocationShortfall).minus(d(e.currentAllocationShortfall));
  const goalsConflict = e.protectedGoalStatus === "conflict";

  const uncoveredBefore = d(before?.uncoveredProtectedObligations);
  const commitmentShortfall = d(e.uncoveredProtectedObligationsAfter).minus(uncoveredBefore);
  const commitmentsConflict = e.protectedObligationStatus === "conflict";

  let otherDeficit: string | null = null;
  if (configured && !goalsConflict && !commitmentsConflict && e.minimumCashFloorStatus !== "conflict" && e.retainedDeficitAfter !== null) {
    const worsened = d(e.retainedDeficitAfter).minus(d(before?.retainedDeficit));
    if (isPositive(worsened)) otherDeficit = str(worsened);
  }

  return {
    minimumCash: {
      state: configured ? "checked" : "needs_setup",
      minimum: minimum ? str(minimum) : null,
      totalCashAfter: totalCashAfter ? str(totalCashAfter) : null,
      belowBy,
      safeToDeployBefore: e.currencySafeToDeployBefore,
      safeToDeployAfter: e.currencySafeToDeployAfter,
    },
    goals: { status: e.protectedGoalStatus, moneyUsed: goalsConflict && isPositive(goalUsed) ? str(goalUsed) : null },
    commitments: { status: e.protectedObligationStatus, shortfall: commitmentsConflict && isPositive(commitmentShortfall) ? str(commitmentShortfall) : null },
    otherDeficit,
  };
}

const reason = (code: SuggestionReason["code"], amounts: Record<string, string> = {}): SuggestionReason => ({ code, amounts });

/**
 * THE suggestion policy. Precedence (first match decides the state):
 *  1 not enough tracked cash            -> reduce
 *  2 protected cash / commitments crossed -> wait
 *  3 Budget conflict                    -> reduce (overall) / review (category only)
 *  4 protection check incomplete, or
 *  5 no Budget                          -> review
 *  6 every relevant check clear         -> proceed
 * Setup gaps are always disclosed in `caveats`, even when a stronger reason wins.
 */
export function decideSuggestion(cash: CashCheck, budget: BudgetCheck, protection: ProtectionCheck): Suggestion {
  const caveats: SuggestionReason[] = [];
  if (protection.minimumCash.state === "needs_setup") caveats.push(reason("minimum_cash_not_set"));
  if (budget.state === "no_budget") caveats.push(reason("no_budget"));
  if (budget.state === "no_plan") caveats.push(reason("no_plan"));

  if (!cash.canCover) {
    return { state: "reduce", reasons: [reason("cash_insufficient", { balance: cash.before, shortBy: cash.shortBy ?? "0" })], caveats };
  }

  const protectedReasons: SuggestionReason[] = [];
  const pm = protection.minimumCash;
  if (pm.belowBy && pm.minimum && pm.totalCashAfter) protectedReasons.push(reason("below_minimum_cash", { minimum: pm.minimum, cashAfter: pm.totalCashAfter, belowBy: pm.belowBy }));
  if (protection.goals.moneyUsed) protectedReasons.push(reason("uses_protected_goal_money", { used: protection.goals.moneyUsed }));
  if (protection.commitments.shortfall) protectedReasons.push(reason("commitments_underprotected", { shortfall: protection.commitments.shortfall }));
  if (protectedReasons.length === 0 && protection.otherDeficit && pm.totalCashAfter) {
    // required protected cash = shortfall + cash left (the canonical retained-cash requirement, read back from the Rules engine's own deficit)
    const required = str(d(protection.otherDeficit).plus(d(pm.totalCashAfter)));
    protectedReasons.push(reason("below_required_cash", { belowBy: protection.otherDeficit, required, cashAfter: pm.totalCashAfter }));
  }
  if (protectedReasons.length > 0) return { state: "wait", reasons: protectedReasons, caveats };

  const budgetReasons: SuggestionReason[] = [];
  if (budget.state === "checked" && budget.overBy) budgetReasons.push(reason("budget_over", { overBy: budget.overBy, left: budget.remainingBefore ?? "0" }));
  if (budget.category.state === "checked" && budget.category.overBy) budgetReasons.push(reason("category_over", { overBy: budget.category.overBy, label: budget.category.label ?? "" }));
  if (budgetReasons.length > 0) {
    return { state: budget.overBy ? "reduce" : "review", reasons: budgetReasons, caveats };
  }

  const reviewReasons = caveats.slice();
  if (reviewReasons.length > 0) return { state: "review", reasons: reviewReasons, caveats: [] };

  return { state: "proceed", reasons: [reason("all_clear")], caveats: [] };
}

export function composeSpendingCheck(f: SpendingCheckFacts): SpendingCheckResult {
  const cash = checkCash(f);
  const budget = checkBudget(f);
  const protection = checkProtection(f);
  return {
    currencyCode: f.currencyCode,
    amount: f.amount,
    categoryCode: f.categoryCode,
    cash,
    budget,
    protection,
    suggestion: decideSuggestion(cash, budget, protection),
  };
}
