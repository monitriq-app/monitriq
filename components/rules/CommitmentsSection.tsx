"use client";

import { useState } from "react";
import { CalendarClock, Plus, Link as LinkIcon } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { ObligationSummary } from "@/lib/domain/obligations/types";
import type { GoalSummary } from "@/lib/domain/goals/types";
import { useTerms } from "@/components/language/LanguageProvider";
import { AddCommitmentSheet } from "@/components/rules/AddCommitmentSheet";

interface CommitmentsSectionProps {
  obligations: ObligationSummary[];
  goals: GoalSummary[];
  currencies: Currency[];
  currenciesByCode: Map<string, Currency>;
  /** Quick Add > Commitment routes here with the Add sheet already open (/rules?add=commitment). */
  defaultAdding?: boolean;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "Upcoming Commitments" — production replacement for the old
 * foundation-level `ObligationList` (a plain divided `<ul>`) + always-
 * expanded `CreateObligationForm`. Only real, authenticated-user
 * obligations from `getObligationSummaries()` ever render here — never
 * a seeded example. Adding one now opens `AddCommitmentSheet`
 * (progressive disclosure) instead of sitting permanently expanded
 * beneath an empty list.
 */
export function CommitmentsSection({ obligations, goals, currencies, currenciesByCode, defaultAdding = false }: CommitmentsSectionProps) {
  const [adding, setAdding] = useState(defaultAdding);
  const terms = useTerms();
  const active = obligations.filter((o) => o.status === "active").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const goalsById = new Map(goals.map((g) => [g.goalId, g.name]));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-primary">{terms.t("upcoming_payments")}</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-12 items-center gap-1.5 rounded-full bg-accent-primary px-3.5 text-[13px] font-semibold text-background"
        >
          <Plus size={14} aria-hidden="true" />
          Add commitment
        </button>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-raised p-6 text-center">
          <CalendarClock size={20} className="text-text-secondary" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-text-primary">No {terms.t("upcoming_payments").toLowerCase()}</p>
          <p className="max-w-xs text-sm text-text-muted">Add payments or obligations you already know are coming so Monitriq can set money aside for them.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((o) => {
            const goalName = o.fundingGoalId ? goalsById.get(o.fundingGoalId) : null;
            return (
              <div key={o.obligationId} className="rounded-xl bg-surface-raised p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{o.name}</p>
                    <p className="text-xs text-text-muted">
                      {o.dueDate ? `Due ${new Date(o.dueDate).toLocaleDateString()}` : "No due date"}
                      {o.isOverdue ? <span className="ml-1.5 font-semibold text-danger">Overdue</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular-figures text-sm font-semibold text-text-primary">{fmt(o.amount, o.currencyCode, currenciesByCode)}</p>
                    {o.isProtected ? (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-surface-strong px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">Protected</span>
                    ) : null}
                  </div>
                </div>
                {goalName ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted">
                    <LinkIcon size={10} aria-hidden="true" />
                    {goalName}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {adding ? <AddCommitmentSheet currencies={currencies} goals={goals} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
