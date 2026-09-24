import Link from "next/link";
import { Target, TrendingDown, Repeat, ListChecks } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { GoalSummary, MeasurementType } from "@/lib/domain/goals/types";

interface GoalsSectionProps {
  goals: GoalSummary[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string | null, currencies: Map<string, Currency>): string {
  if (currencyCode === null) return amount;
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/** Icon derived from the goal's own real measurementType — never a stored component reference, never a fabricated per-goal icon (Goals carries no icon field). */
function MeasurementIcon({ measurementType }: { measurementType: MeasurementType }) {
  switch (measurementType) {
    case "debt_balance_target":
      return <TrendingDown size={14} aria-hidden="true" />;
    case "monthly_income_target":
      return <Repeat size={14} aria-hidden="true" />;
    case "milestone":
      return <ListChecks size={14} aria-hidden="true" />;
    default:
      return <Target size={14} aria-hidden="true" />;
  }
}

/**
 * A restrained, deterministic (never random) color per measurementType —
 * purely decorative visual variety, matching the reference's own
 * per-goal icon coloring (equally decorative there; the reference never
 * ties icon color to a computed financial judgment). Never used to imply
 * status, urgency, or a recommendation — only ever a stable identity
 * color for a real, existing field.
 */
function measurementIconColor(measurementType: MeasurementType): string {
  switch (measurementType) {
    case "debt_balance_target":
      return "text-attention";
    case "monthly_income_target":
      return "text-focus";
    case "milestone":
      return "text-text-secondary";
    default:
      return "text-accent-primary";
  }
}

function ProgressBar({ percentage }: { percentage: number }) {
  const clamped = Math.max(0, Math.min(100, percentage));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-strong">
      <div className="h-full rounded-full bg-accent-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/**
 * Reads Goals' own canonical read model and respects each goal's own
 * measurement type — never forcing every goal into the same percentage
 * math (docs/architecture/FINANCIAL_DOMAIN_MODEL.md). cash_target and
 * debt_balance_target already carry a real percentage from Goals' own
 * domain function; monthly_income_target and milestone goals use their
 * own distinct progress concepts. Card composition (icon + name, a
 * percentage/status readout, a progress rail, a Current/Target line)
 * matches the reference's goal-card structure; the reference's single
 * cross-goal "Target Horizon" journey headline has no Monatriq
 * equivalent (no canonical "financial freedom date" exists across all
 * goals) and is not reproduced — each goal instead shows its own real
 * required-pace months-remaining figure when Goals has actually
 * calculated one for it.
 */
export function GoalsSection({ goals, currencies }: GoalsSectionProps) {
  if (goals.length === 0) {
    return (
      <p className="text-text-muted">
        No goals yet.{" "}
        <Link href="/goals" className="text-accent-primary hover:underline">
          Create a goal
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {goals.map((goal) => {
        const percentage = goal.measurementType === "debt_balance_target" ? goal.debtProgressPercentage : goal.percentage;
        const zeroLabel = goal.measurementType === "debt_balance_target" ? "No repayment yet" : "Not funded yet";
        const current =
          goal.measurementType === "debt_balance_target"
            ? goal.currentOutstandingPrincipal !== null
              ? fmt(goal.currentOutstandingPrincipal, goal.currencyCode, currencies)
              : null
            : goal.allocatedTotal !== null
              ? fmt(goal.allocatedTotal, goal.currencyCode, currencies)
              : null;
        const target = goal.targetValue !== null ? fmt(goal.targetValue, goal.currencyCode, currencies) : null;

        return (
          <li key={goal.goalId} className="rounded-xl bg-surface-raised p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${measurementIconColor(goal.measurementType)}`}>
                  <MeasurementIcon measurementType={goal.measurementType} />
                </span>
                <h4 className="truncate text-base font-semibold text-text-primary">{goal.name}</h4>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {goal.isProtected ? (
                  <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary">Protected</span>
                ) : null}
                {goal.isFocus ? <span className="rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent-primary">Focus</span> : null}
                {percentage !== null ? (
                  <span className="text-[11px] font-semibold text-accent-primary">{percentage === 0 ? "" : `${Math.round(percentage)}% funded`}</span>
                ) : null}
              </div>
            </div>

            {percentage !== null ? (
              <div className="mt-2">
                <ProgressBar percentage={percentage} />
              </div>
            ) : null}

            {goal.measurementType === "cash_target" || goal.measurementType === "debt_balance_target" ? (
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-text-muted">
                <span>
                  {percentage === 0 ? zeroLabel : current !== null ? <>Current: <strong className="text-text-primary">{current}</strong></> : "No target set"}
                </span>
                {target !== null ? <span>Target: {target}</span> : null}
              </div>
            ) : null}

            {goal.measurementType === "monthly_income_target" ? (
              <p className="mt-1.5 text-xs text-text-muted">
                Target: <strong className="text-text-primary">{target ?? "Not set"}</strong> / month · Current: Not calculated
              </p>
            ) : null}

            {goal.measurementType === "milestone" ? (
              <p className="mt-1.5 text-xs text-text-secondary">
                {goal.milestoneCompletedCount} of {goal.milestoneTotalCount} milestones complete
              </p>
            ) : null}

            {goal.targetDate ? (
              <p className="mt-1.5 text-[11px] text-text-muted">
                Target date: {goal.targetDate}
                {goal.requiredPaceStatus === "calculated" && goal.requiredPacePeriodsRemaining !== null
                  ? ` · ${goal.requiredPacePeriodsRemaining} mo left`
                  : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
