import type { Currency, CurrencyAmount } from "../currency/types.ts";
import { currencyTotalLines, formatAmount, monthYear, type CurrencyTotalLine } from "../common/presentation.ts";
import type { GoalSummary, MeasurementType } from "./types.ts";

/**
 * Goals presentation (P0-E5-S2B). Every figure is read verbatim from
 * goal_summary()/goal_native_currency_totals(); nothing is recomputed.
 * Required pace is the domain's own "remaining / periods remaining"
 * arithmetic, labelled "Required pace" — never a recommendation.
 */

export const MEASUREMENT_CHOICES: { value: MeasurementType; label: string; hint: string }[] = [
  { value: "cash_target", label: "Save a target amount", hint: "Set money aside until you reach an amount." },
  { value: "debt_balance_target", label: "Pay off a debt", hint: "Follows a debt you are already tracking." },
  { value: "monthly_income_target", label: "Reach a monthly income", hint: "A monthly income you want to reach." },
  { value: "milestone", label: "Complete steps", hint: "A goal with steps instead of an amount." },
];

export const PROTECT_LABEL = "Protect this goal";
export const PROTECT_HELP = "Money set aside here is treated as protected when Monitriq checks spending decisions. You can still use it.";

export function measurementLabel(type: MeasurementType): string {
  return MEASUREMENT_CHOICES.find((m) => m.value === type)?.label ?? type;
}

export type GoalKind = "cash" | "debt" | "income" | "steps";

export interface GoalCardView {
  goalId: string;
  name: string;
  typeLabel: string;
  kind: GoalKind;
  isProtected: boolean;
  isFocus: boolean;
  statusLabel: string | null;
  currencyCode: string | null;
  /** e.g. "NGN 0 of NGN 12,000,000" */
  headline: string;
  /** "Not funded yet" at true zero; otherwise null. Shown instead of an empty rail. */
  zeroState: string | null;
  /** 0-100 for the rail; null when there is nothing to draw. */
  progressPercent: number | null;
  progressText: string | null;
  targetDateLabel: string | null;
  paceLabel: string | null;
  paceNote: string | null;
  canSetAside: boolean;
  details: { label: string; value: string }[];
}

function isZero(v: string | null): boolean {
  return v === null || /^-?0+(\.0+)?$/.test(v);
}

export function buildGoalCard(goal: GoalSummary, currencies: Map<string, Currency>): GoalCardView {
  const code = goal.currencyCode;
  const fmt = (v: string | null) => (v !== null && code ? formatAmount(v, code, currencies) : null);
  const base = {
    goalId: goal.goalId,
    name: goal.name,
    typeLabel: goal.goalTypeLabel,
    isProtected: goal.isProtected,
    isFocus: goal.isFocus,
    statusLabel: goal.status === "active" ? null : goal.status === "paused" ? "Paused" : goal.status === "completed" ? "Completed" : "Archived",
    currencyCode: code,
    targetDateLabel: goal.targetDate ? monthYear(goal.targetDate) : null,
    paceLabel: null as string | null,
    paceNote: null as string | null,
    canSetAside: goal.status === "active" && (goal.measurementType === "cash_target" || goal.measurementType === "debt_balance_target"),
  };

  if (goal.measurementType === "cash_target") {
    const allocated = fmt(goal.allocatedTotal) ?? "0";
    const target = fmt(goal.targetValue);
    const zero = isZero(goal.allocatedTotal);
    const details = [
      { label: "Set aside", value: allocated },
      { label: "Target", value: target ?? "Not set" },
      { label: "Left to go", value: fmt(goal.remaining) ?? "Not set" },
    ];
    let paceLabel: string | null = null;
    let paceNote: string | null = null;
    if (goal.requiredPaceStatus === "calculated" && goal.requiredPaceAmount !== null && code) {
      paceLabel = `${formatAmount(goal.requiredPaceAmount, code, currencies)} / month`;
      paceNote = goal.requiredPacePeriodsRemaining !== null ? `${goal.requiredPacePeriodsRemaining} month${goal.requiredPacePeriodsRemaining === 1 ? "" : "s"} left` : null;
    } else if (goal.requiredPaceStatus === "target_reached") paceNote = "Target reached";
    else if (goal.requiredPaceStatus === "date_passed") paceNote = "Target date has passed";
    else if (goal.requiredPaceStatus === "no_target_date" && goal.targetValue !== null) paceNote = "Add a target date to see the required pace.";
    return {
      ...base,
      kind: "cash",
      headline: target ? `${allocated} of ${target}` : `${allocated} set aside`,
      zeroState: zero ? "Not funded yet" : null,
      progressPercent: zero || goal.percentage === null ? null : Math.max(0, Math.min(100, goal.percentage)),
      progressText: zero || goal.percentage === null ? null : `${goal.percentage}% set aside`,
      paceLabel,
      paceNote,
      details,
    };
  }

  if (goal.measurementType === "debt_balance_target") {
    const owed = fmt(goal.currentOutstandingPrincipal);
    const start = fmt(goal.startingLiabilityBalance);
    const progress = goal.debtProgressPercentage;
    return {
      ...base,
      kind: "debt",
      headline: owed ? `${owed} still owed` : "Debt balance not available",
      zeroState: progress === null || progress <= 0 ? "No payoff progress yet" : null,
      progressPercent: progress === null || progress <= 0 ? null : Math.min(100, progress),
      progressText: progress === null || progress <= 0 ? null : `${progress}% paid off`,
      details: [
        { label: "Owed at the start", value: start ?? "Not available" },
        { label: "Owed now", value: owed ?? "Not available" },
        { label: "Set aside", value: fmt(goal.allocatedTotal) ?? "0" },
      ],
    };
  }

  if (goal.measurementType === "monthly_income_target") {
    const target = fmt(goal.targetValue);
    return {
      ...base,
      kind: "income",
      headline: target ? `Target ${target} / month` : "Target not set",
      zeroState: null,
      progressPercent: null,
      progressText: null,
      paceNote: "Your current income is not tracked here yet.",
      details: [{ label: "Target per month", value: target ?? "Not set" }],
    };
  }

  return {
    ...base,
    kind: "steps",
    headline: goal.milestoneTotalCount > 0 ? `${goal.milestoneCompletedCount} of ${goal.milestoneTotalCount} steps done` : "No steps added yet",
    zeroState: goal.milestoneCompletedCount === 0 ? "Not started yet" : null,
    progressPercent: goal.milestoneTotalCount > 0 && goal.milestoneCompletedCount > 0 ? Math.floor((goal.milestoneCompletedCount * 100) / goal.milestoneTotalCount) : null,
    progressText: goal.milestoneTotalCount > 0 && goal.milestoneCompletedCount > 0 ? `${goal.milestoneCompletedCount} of ${goal.milestoneTotalCount} done` : null,
    details: [],
  };
}

export interface GoalsSummaryView {
  activeCount: number;
  pausedCount: number;
  protectedCount: number;
  /** Money set aside, one line per currency — never combined. */
  setAside: CurrencyTotalLine[];
  /** Only currencies where protected money genuinely exists (never a noisy zero line). */
  protectedSetAside: CurrencyTotalLine[];
  /** Shown when protected goals exist but no money is set aside for them. */
  protectedNote: string | null;
  nextTargetDate: string | null;
}

export function buildGoalsSummary(goals: GoalSummary[], allocated: CurrencyAmount[], protectedTotals: CurrencyAmount[], currencies: Map<string, Currency>, today: string): GoalsSummaryView {
  const active = goals.filter((g) => g.status === "active");
  const upcoming = active.map((g) => g.targetDate?.slice(0, 10)).filter((d): d is string => !!d && d >= today).sort();
  return {
    activeCount: active.length,
    pausedCount: goals.filter((g) => g.status === "paused").length,
    protectedCount: active.filter((g) => g.isProtected).length,
    setAside: currencyTotalLines(allocated, currencies),
    protectedSetAside: currencyTotalLines(protectedTotals.filter((t) => !isZero(t.amount)), currencies),
    protectedNote: active.some((g) => g.isProtected) && protectedTotals.every((t) => isZero(t.amount)) ? "No money set aside" : null,
    nextTargetDate: upcoming.length > 0 ? monthYear(upcoming[0]) : null,
  };
}

/** Goals shown on the page: active/paused/completed first in creation order; archived are not listed. */
export function visibleGoals(goals: GoalSummary[]): GoalSummary[] {
  return goals.filter((g) => g.status !== "archived");
}
