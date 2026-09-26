"use client";

import { useState } from "react";
import { Flag, Plus, ShieldCheck } from "lucide-react";
import { buildGoalCard, type GoalCardView, type GoalsSummaryView } from "@/lib/domain/goals/presentation";
import type { BucketShortfall, GoalSummary, GoalType } from "@/lib/domain/goals/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import { ShortfallBanner } from "@/components/goals/ShortfallBanner";
import { CreateGoalSheet } from "@/components/goals/CreateGoalSheet";
import { GoalDetailSheet } from "@/components/goals/GoalDetailSheet";
import { SetAsideSheet } from "@/components/goals/SetAsideSheet";
import { ReleaseMoveSheet } from "@/components/goals/ReleaseMoveSheet";

interface Props {
  goals: GoalSummary[];
  summary: GoalsSummaryView;
  goalTypes: GoalType[];
  currencies: Currency[];
  buckets: CashBucket[];
  liabilities: LiabilitySummary[];
  shortfalls: BucketShortfall[];
  defaultCurrencyCode: string | null;
  openCreate: boolean;
}

function Rail({ view }: { view: GoalCardView }) {
  if (view.progressPercent === null) return null;
  return (
    <div role="progressbar" aria-label={`${view.name}: ${view.progressText}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.progressPercent} className="h-2 w-full overflow-hidden rounded-full bg-surface-strong">
      <div className="h-full rounded-full bg-accent-primary" style={{ width: `${view.progressPercent}%` }} />
    </div>
  );
}

export function GoalsWorkspace({ goals, summary, goalTypes, currencies, buckets, liabilities, shortfalls, defaultCurrencyCode, openCreate }: Props) {
  const [creating, setCreating] = useState(openCreate);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [asideId, setAsideId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const cards = goals.map((g) => ({ goal: g, view: buildGoalCard(g, currenciesByCode) }));
  const byId = new Map(cards.map((c) => [c.goal.goalId, c]));
  const detail = detailId ? byId.get(detailId) : undefined;
  const aside = asideId ? byId.get(asideId) : undefined;
  const move = moveId ? byId.get(moveId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">Goals</h1>
          <p className="text-sm text-text-secondary">Save toward what matters.</p>
        </div>
        {goals.length > 0 ? (
          <button type="button" onClick={() => setCreating(true)} className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background">
            <Plus size={14} aria-hidden="true" />
            New Goal
          </button>
        ) : null}
      </div>

      <ShortfallBanner shortfalls={shortfalls} currencies={currenciesByCode} />

      {goals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center">
          <Flag size={24} className="text-text-secondary" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-text-primary">What are you saving for?</p>
          <p className="max-w-xs text-sm text-text-muted">Create a goal for something you want to save toward. Protected goals are counted when Monitriq checks spending decisions.</p>
          <button type="button" onClick={() => setCreating(true)} className="h-12 rounded-full bg-accent-primary px-6 text-sm font-semibold text-background">
            Create Goal
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Goals summary" className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-surface-raised p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Active goals</p>
              <p className="text-[15px] font-semibold text-text-primary">{summary.activeCount}</p>
              {summary.pausedCount > 0 ? <p className="text-xs text-text-muted">{summary.pausedCount} paused</p> : null}
            </div>
            <div className="min-w-0 rounded-xl bg-surface-raised p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Next target date</p>
              <p className="text-[15px] font-semibold text-text-primary">{summary.nextTargetDate ?? "Not set"}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-surface-raised p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Set aside</p>
              {summary.setAside.length === 0 ? (
                <p className="text-[15px] font-semibold text-text-primary">Nothing yet</p>
              ) : (
                summary.setAside.map((l) => (
                  <p key={l.currencyCode} className="tabular-figures break-words text-[15px] font-semibold text-text-primary">
                    {l.label}
                  </p>
                ))
              )}
            </div>
            <div className="min-w-0 rounded-xl bg-surface-raised p-3.5">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                <ShieldCheck size={12} aria-hidden="true" />
                Protected
              </p>
              <p className="text-[15px] font-semibold text-text-primary">{summary.protectedCount} {summary.protectedCount === 1 ? "goal" : "goals"}</p>
              {summary.protectedNote ? <p className="text-xs text-text-muted">{summary.protectedNote}</p> : null}
              {summary.protectedSetAside.map((l) => (
                <p key={l.currencyCode} className="tabular-figures break-words text-xs text-text-muted">
                  {l.label}
                </p>
              ))}
            </div>
          </section>

          <ul className="flex flex-col gap-2.5">
            {cards.map(({ goal, view }) => (
              <li key={goal.goalId} className="rounded-xl bg-surface-raised p-3.5">
                <button type="button" onClick={() => setDetailId(goal.goalId)} aria-label={`${view.name}. ${view.headline}. Open details.`} className="flex min-h-12 w-full flex-col gap-2 text-left">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-semibold text-text-primary">{view.name}</span>
                    {view.isProtected ? <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold text-text-secondary">Protected</span> : null}
                    {view.statusLabel ? <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold text-text-secondary">{view.statusLabel}</span> : null}
                  </span>
                  <span className="text-xs text-text-muted">{view.typeLabel}</span>
                  <span className="tabular-figures break-words text-sm font-semibold text-text-primary">{view.headline}</span>
                  {view.zeroState ? <span className="text-sm text-text-muted">{view.zeroState}</span> : <Rail view={view} />}
                  {view.progressText && !view.zeroState ? <span className="text-xs text-text-muted">{view.progressText}</span> : null}
                  <span className="grid grid-cols-2 gap-2 text-xs">
                    <span className="min-w-0">
                      <span className="block text-text-muted">Target date</span>
                      <span className="block font-semibold text-text-primary">{view.targetDateLabel ?? "Not set"}</span>
                    </span>
                    {view.paceLabel ? (
                      <span className="min-w-0">
                        <span className="block text-text-muted">Required pace</span>
                        <span className="tabular-figures block break-words font-semibold text-text-primary">{view.paceLabel}</span>
                      </span>
                    ) : null}
                  </span>
                  {view.paceNote ? <span className="text-xs text-text-muted">{view.paceNote}</span> : null}
                </button>
                {view.canSetAside ? (
                  <button type="button" onClick={() => setAsideId(goal.goalId)} className="mt-2 min-h-12 w-full rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-accent-primary">
                    Set Money Aside
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {creating ? <CreateGoalSheet goalTypes={goalTypes} currencies={currencies} liabilities={liabilities} defaultCurrencyCode={defaultCurrencyCode} onClose={() => setCreating(false)} /> : null}
      {detail && !aside && !move ? (
        <GoalDetailSheet
          goal={detail.goal}
          view={detail.view}
          currencies={currenciesByCode}
          hasAllocation={detail.goal.allocatedTotal !== null && !/^0+(\.0+)?$/.test(detail.goal.allocatedTotal)}
          onSetAside={() => setAsideId(detail.goal.goalId)}
          onReleaseMove={() => setMoveId(detail.goal.goalId)}
          onClose={() => setDetailId(null)}
        />
      ) : null}
      {aside ? <SetAsideSheet goal={aside.goal} buckets={buckets} currencies={currenciesByCode} onClose={() => setAsideId(null)} /> : null}
      {move ? <ReleaseMoveSheet goal={move.goal} goals={goals} buckets={buckets} currencies={currenciesByCode} onClose={() => setMoveId(null)} /> : null}
    </div>
  );
}
