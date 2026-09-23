import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { GoalSummary } from "@/lib/domain/goals/types";

interface FocusGoalPanelProps {
  focusGoal: GoalSummary | null;
  currencies: Map<string, Currency>;
}

/** Surfaced only when the user explicitly chose a focus goal — never algorithmically selected. */
export function FocusGoalPanel({ focusGoal, currencies }: FocusGoalPanelProps) {
  if (!focusGoal) {
    return <p className="text-text-muted">Not set — no focus goal chosen.</p>;
  }

  const currency = focusGoal.currencyCode ? currencies.get(focusGoal.currencyCode) : undefined;
  const allocated = focusGoal.allocatedTotal != null && currency ? formatCurrencyAmount(focusGoal.allocatedTotal, currency) : null;

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-medium text-text-primary">{focusGoal.name}</p>
      <p className="text-sm text-text-muted">{focusGoal.goalTypeLabel}</p>
      {allocated ? <p className="tabular-figures mt-2 text-sm text-text-secondary">Allocated: {allocated}</p> : null}
    </div>
  );
}
