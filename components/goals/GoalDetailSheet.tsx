"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGoalMilestone, listGoalMilestones, recordGoalTarget, updateGoal, updateGoalMilestone } from "@/lib/domain/goals/repository";
import { PROTECT_HELP, PROTECT_LABEL, measurementLabel, type GoalCardView } from "@/lib/domain/goals/presentation";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { GoalMilestone, GoalSummary } from "@/lib/domain/goals/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { Sheet, SheetError, primaryButtonClass, secondaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  goal: GoalSummary;
  view: GoalCardView;
  currencies: Map<string, Currency>;
  hasAllocation: boolean;
  onSetAside: () => void;
  onReleaseMove: () => void;
  onClose: () => void;
}

function Steps({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState<GoalMilestone[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listGoalMilestones(createClient(), goalId);
        if (!cancelled) setSteps(rows);
      } catch {
        if (!cancelled) setError("Could not load the steps.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goalId, tick]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createGoalMilestone(createClient(), { goalId, title: title.trim(), sortOrder: steps?.length ?? 0 });
      setTitle("");
      setTick((t) => t + 1);
      router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not add this step.");
    }
  }

  async function toggle(step: GoalMilestone) {
    setError(null);
    try {
      await updateGoalMilestone(createClient(), step.id, { completedAt: step.completed_at ? null : new Date().toISOString() });
      setTick((t) => t + 1);
      router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not update this step.");
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Steps">
      <h4 className="text-sm font-semibold text-text-primary">Steps</h4>
      {steps && steps.length > 0 ? (
        <ul className="flex flex-col">
          {steps.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-12 items-center gap-3 text-sm text-text-primary">
                <input type="checkbox" checked={!!s.completed_at} onChange={() => toggle(s)} className="h-5 w-5 shrink-0" />
                <span className={s.completed_at ? "text-text-muted line-through" : ""}>{s.title}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : steps ? (
        <p className="text-sm text-text-muted">No steps added yet.</p>
      ) : null}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="step-title" className="sr-only">
          New step
        </label>
        <Input id="step-title" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a step" />
        <button type="submit" disabled={!title.trim()} className="min-h-12 shrink-0 rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-accent-primary disabled:opacity-50">
          Add
        </button>
      </form>
      <SheetError message={error} />
    </section>
  );
}

export function GoalDetailSheet({ goal, view, currencies, hasAllocation, onSetAside, onReleaseMove, onClose }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState(goal.targetDate?.slice(0, 10) ?? "");
  const currency = goal.currencyCode ? currencies.get(goal.currencyCode) : undefined;
  const usesAmount = goal.measurementType === "cash_target" || goal.measurementType === "monthly_income_target";

  async function toggleProtect(next: boolean) {
    setError(null);
    setPending(true);
    try {
      await updateGoal(createClient(), goal.goalId, { isProtected: next });
      router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not update this goal.");
    } finally {
      setPending(false);
    }
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (targetValue.trim() !== "") {
      const problem = validateMoneyInput(targetValue, currency?.decimal_exponent ?? 2);
      if (problem) return setError(problem);
    }
    setPending(true);
    try {
      await recordGoalTarget(createClient(), {
        goalId: goal.goalId,
        targetValue: targetValue.trim() || goal.targetValue || undefined,
        targetDate: targetDate || undefined,
      });
      setTargetValue("");
      router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not save the new target.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet title={view.name} subtitle={`${view.typeLabel} · ${measurementLabel(goal.measurementType)}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="tabular-figures break-words text-lg font-semibold text-text-primary">{view.headline}</p>
          {view.zeroState ? <p className="text-sm text-text-muted">{view.zeroState}</p> : null}
          {view.progressText ? <p className="text-sm text-text-muted">{view.progressText}</p> : null}
          {view.isProtected ? <p className="mt-1 inline-flex rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-text-secondary">Protected</p> : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {view.details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-xs text-text-muted">{d.label}</dt>
              <dd className="tabular-figures break-words font-semibold text-text-primary">{d.value}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-xs text-text-muted">Target date</dt>
            <dd className="font-semibold text-text-primary">{view.targetDateLabel ?? "Not set"}</dd>
          </div>
          {view.paceLabel ? (
            <div className="min-w-0">
              <dt className="text-xs text-text-muted">Required pace</dt>
              <dd className="tabular-figures break-words font-semibold text-text-primary">{view.paceLabel}</dd>
            </div>
          ) : null}
        </dl>
        {view.paceNote ? <p className="text-xs text-text-muted">{view.paceNote}</p> : null}

        {view.kind === "steps" ? <Steps goalId={goal.goalId} /> : null}

        {view.canSetAside ? (
          <button type="button" onClick={onSetAside} className={primaryButtonClass}>
            Set Money Aside
          </button>
        ) : null}

        <MoreDetails label="Manage this goal">
          <div className="flex flex-col gap-4 rounded-xl bg-surface-strong p-3">
            <label className="flex min-h-12 items-start gap-3 text-sm">
              <input type="checkbox" checked={goal.isProtected} disabled={pending} onChange={(e) => toggleProtect(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="block font-medium text-text-primary">{PROTECT_LABEL}</span>
                <span className="block text-xs text-text-muted">{PROTECT_HELP}</span>
              </span>
            </label>

            {usesAmount || goal.measurementType === "debt_balance_target" || goal.measurementType === "milestone" ? (
              <form onSubmit={saveTarget} className="flex flex-col gap-3" noValidate>
                {usesAmount ? (
                  <FormField label={goal.measurementType === "monthly_income_target" ? "New monthly target" : "New target amount"} htmlFor="edit-target">
                    <Input id="edit-target" inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder={goal.targetValue ?? "0.00"} />
                  </FormField>
                ) : null}
                <FormField label="Target date" htmlFor="edit-date">
                  <Input id="edit-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </FormField>
                <button type="submit" disabled={pending} className={secondaryButtonClass}>
                  Save target
                </button>
              </form>
            ) : null}

            {view.canSetAside && hasAllocation ? (
              <button type="button" onClick={onReleaseMove} className={secondaryButtonClass}>
                Release or move money
              </button>
            ) : null}
          </div>
        </MoreDetails>
        <SheetError message={error} />
      </div>
    </Sheet>
  );
}
