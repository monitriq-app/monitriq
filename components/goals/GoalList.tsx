import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { GoalSummary } from "@/lib/domain/goals/types";

interface GoalListProps {
  goals: GoalSummary[];
  currencies: Map<string, Currency>;
}

function formatAmount(value: string | null, currencyCode: string | null, currencies: Map<string, Currency>): string {
  if (value === null || currencyCode === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

function requiredPaceLabel(goal: GoalSummary, currencies: Map<string, Currency>): string | null {
  switch (goal.requiredPaceStatus) {
    case "calculated":
      return `Required pace: ${formatAmount(goal.requiredPaceAmount, goal.currencyCode, currencies)} / month (${goal.requiredPacePeriodsRemaining} mo remaining)`;
    case "target_reached":
      return "Required pace: target reached";
    case "date_passed":
      return "Required pace: target date has passed";
    case "no_target_date":
    case "no_target_amount":
    case "not_applicable":
    default:
      return null;
  }
}

/** Reads from goal_summary() — one shared calculation, never recomputed per page. */
export function GoalList({ goals, currencies }: GoalListProps) {
  if (goals.length === 0) {
    return <p className="text-text-muted">No goals yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {goals.map((goal) => {
        const pace = requiredPaceLabel(goal, currencies);
        return (
          <li key={goal.goalId} className="flex flex-col gap-1 py-3">
            <div className="flex items-center justify-between">
              <span className="text-text-primary">
                {goal.name}
                <span className="ml-2 text-text-muted">{goal.goalTypeLabel}</span>
                {goal.isFocus ? <span className="ml-2 text-accent-primary">★ Focus</span> : null}
                {goal.isProtected ? <span className="ml-2 text-text-muted">Protected</span> : null}
                {goal.status !== "active" ? <span className="ml-2 text-text-muted">({goal.status})</span> : null}
              </span>
            </div>

            {goal.measurementType === "cash_target" ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-text-muted">Target</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.targetValue, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Allocated</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.allocatedTotal, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Remaining</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.remaining, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Progress</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {goal.percentage === null ? "Not calculated" : `${goal.percentage}%`}
                  </dd>
                </div>
              </dl>
            ) : null}

            {goal.measurementType === "debt_balance_target" ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-text-muted">Starting Balance</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.startingLiabilityBalance, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Current Outstanding</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.currentOutstandingPrincipal, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Earmarked Cash</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.allocatedTotal, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Progress toward payoff</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {goal.debtProgressPercentage === null ? "Not calculated" : `${goal.debtProgressPercentage}%`}
                  </dd>
                </div>
              </dl>
            ) : null}

            {goal.measurementType === "monthly_income_target" ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-text-muted">Target Monthly Income</dt>
                  <dd className="tabular-figures text-text-secondary">
                    {formatAmount(goal.targetValue, goal.currencyCode, currencies)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Current</dt>
                  <dd className="tabular-figures text-text-secondary">Not calculated</dd>
                </div>
              </dl>
            ) : null}

            {goal.milestoneTotalCount > 0 ? (
              <p className="text-sm text-text-muted">
                Milestones: {goal.milestoneCompletedCount} / {goal.milestoneTotalCount} complete
              </p>
            ) : null}

            {pace ? <p className="text-sm text-text-muted">{pace}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
