import Link from "next/link";
import { PiggyBank, ChevronRight } from "lucide-react";
import { buildBudgetOverview } from "@/lib/domain/budget/presentation";
import type { BudgetSummary } from "@/lib/domain/budget/types";
import type { Currency } from "@/lib/domain/currency/types";

interface BudgetHomeCardProps {
  /** This month's live budgets, each read from the canonical Budget read model. Empty = none yet. */
  summaries: BudgetSummary[];
  currencies: Map<string, Currency>;
}

/** Compact "This Month's Budget" card: one row per currency budget (never merged), or a plain invitation when none exists. */
export function BudgetHomeCard({ summaries, currencies }: BudgetHomeCardProps) {
  if (summaries.length === 0) {
    return (
      <Link href="/budget" className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-surface-raised p-4">
        <span className="flex items-center gap-3">
          <PiggyBank size={20} className="text-accent-primary" aria-hidden="true" />
          <span>
            <span className="block text-sm font-semibold text-text-primary">Plan this month&apos;s spending</span>
            <span className="block text-xs text-text-muted">Create a simple budget.</span>
          </span>
        </span>
        <ChevronRight size={18} className="text-text-secondary" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {summaries.map((s) => {
        const o = buildBudgetOverview(s, currencies);
        return (
          <li key={s.budgetId}>
            <Link href={`/budget?b=${s.budgetId}`} className="flex min-h-12 flex-col gap-2 rounded-xl bg-surface-raised p-4">
              <span className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {o.periodLabel} · {o.currencyCode}
                </span>
                <ChevronRight size={16} className="text-text-secondary" aria-hidden="true" />
              </span>
              <span className="grid grid-cols-2 gap-2">
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Spent</span>
                  <span className="tabular-figures block break-words text-[15px] font-semibold text-text-primary">{o.spentLabel}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{o.remainingCaption}</span>
                  <span className={`tabular-figures block break-words text-[15px] font-semibold ${o.isOver ? "text-attention" : "text-text-primary"}`}>{o.remainingLabel}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
