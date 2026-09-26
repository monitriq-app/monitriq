"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, PiggyBank } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setBudgetStatus } from "@/lib/domain/budget/repository";
import {
  buildBudgetOverview,
  buildCategoryRows,
  categoriesAvailableToAdd,
  formatDueDate,
  formatMoney,
  friendlyBudgetError,
  monthLabel,
  type BudgetNavView,
  type CategoryRowView,
} from "@/lib/domain/budget/presentation";
import type { BudgetCategoryStatus, BudgetSummary, BudgetUpcomingCommitment } from "@/lib/domain/budget/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneySpendingCategory } from "@/lib/domain/money/types";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { CreateBudgetSheet } from "@/components/budget/CreateBudgetSheet";
import { CategoryAmountSheet, type EditTarget } from "@/components/budget/CategoryAmountSheet";

interface BudgetWorkspaceProps {
  nav: BudgetNavView | null;
  summary: BudgetSummary | null;
  categories: BudgetCategoryStatus[];
  commitments: BudgetUpcomingCommitment[];
  currencies: Currency[];
  spendingCategories: MoneySpendingCategory[];
  defaultCurrencyCode: string | null;
  today: string;
  openCreate: boolean;
}

function Rail({ row }: { row: CategoryRowView }) {
  if (row.progressPercent === null) return null;
  return (
    <div
      role="progressbar"
      aria-label={`${row.label}: ${row.progressText}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={row.progressPercent}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-strong"
    >
      <div className={`h-full rounded-full ${row.isOver ? "bg-attention" : "bg-accent-primary"}`} style={{ width: `${row.progressPercent}%` }} />
    </div>
  );
}

export function BudgetWorkspace({ nav, summary, categories, commitments, currencies, spendingCategories, defaultCurrencyCode, today, openCreate }: BudgetWorkspaceProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(openCreate && !summary);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const overview = summary ? buildBudgetOverview(summary, currenciesByCode) : null;
  const rows = summary ? buildCategoryRows(categories, summary.currencyCode, currenciesByCode) : { budgeted: [], unbudgeted: [] };
  const addable = categoriesAvailableToAdd(spendingCategories, categories);
  const decimalExponent = summary ? (currenciesByCode.get(summary.currencyCode)?.decimal_exponent ?? 2) : 2;

  async function changeStatus(status: "active" | "closed" | "archived") {
    if (!summary) return;
    setError(null);
    setPending(true);
    try {
      await setBudgetStatus(createClient(), summary.budgetId, status);
      if (status === "archived") router.push("/budget");
      router.refresh();
    } catch (err) {
      setError(friendlyBudgetError(err));
    } finally {
      setPending(false);
    }
  }

  function edit(row: CategoryRowView) {
    if (overview?.readOnly) return;
    setEditing({ categoryCode: row.categoryCode, label: row.label, plannedRaw: row.plannedRaw, isBudgeted: row.isBudgeted });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">Budget</h1>
          <p className="text-sm text-text-secondary">Plan your spending and see what&apos;s left.</p>
        </div>
        {summary ? (
          <button type="button" onClick={() => setCreating(true)} className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-surface-raised px-3.5 text-[13px] font-semibold text-text-primary">
            <Plus size={14} aria-hidden="true" />
            New
          </button>
        ) : null}
      </div>

      {!summary || !overview ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center">
          <PiggyBank size={24} className="text-text-secondary" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-text-primary">No budget for this month yet.</p>
          <p className="max-w-xs text-sm text-text-muted">Create a simple plan for what you want to spend.</p>
          <button type="button" onClick={() => setCreating(true)} className="h-12 rounded-full bg-accent-primary px-6 text-sm font-semibold text-background">
            Create Budget
          </button>
        </div>
      ) : (
        <>
          {nav ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-raised px-1 py-1">
                {nav.previous ? (
                  <Link href={`/budget?b=${nav.previous.id}`} aria-label={`Previous budget: ${monthLabel(nav.previous.periodStart)}`} className="flex h-12 w-12 items-center justify-center rounded-full text-text-secondary">
                    <ChevronLeft size={20} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="h-12 w-12" aria-hidden="true" />
                )}
                <p className="text-center text-[15px] font-semibold text-text-primary">{overview.periodLabel}</p>
                {nav.next ? (
                  <Link href={`/budget?b=${nav.next.id}`} aria-label={`Next budget: ${monthLabel(nav.next.periodStart)}`} className="flex h-12 w-12 items-center justify-center rounded-full text-text-secondary">
                    <ChevronRight size={20} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="h-12 w-12" aria-hidden="true" />
                )}
              </div>
              {nav.sameMonth.length > 1 ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Budget currency">
                  {nav.sameMonth.map((b) => (
                    <Link
                      key={b.id}
                      href={`/budget?b=${b.id}`}
                      aria-current={b.id === summary.budgetId ? "page" : undefined}
                      className={`flex min-h-12 items-center rounded-full px-4 text-[13px] font-semibold ${b.id === summary.budgetId ? "bg-surface-strong text-accent-primary" : "bg-surface-raised text-text-secondary"}`}
                    >
                      {b.currencyCode}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {overview.statusNote ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-raised p-3 text-sm text-text-secondary">
              <span>{overview.statusNote}</span>
              <button type="button" disabled={pending} onClick={() => changeStatus("active")} className="min-h-12 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background disabled:opacity-50">
                {overview.status === "closed" ? "Reopen" : "Restore"}
              </button>
            </div>
          ) : null}

          <section aria-label="Budget summary" className="rounded-xl bg-surface-raised p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{overview.currencyCode} budget</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Planned</p>
                <p className="tabular-figures break-words text-[15px] font-semibold text-text-primary">{overview.plannedLabel}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Spent</p>
                <p className="tabular-figures break-words text-[15px] font-semibold text-text-primary">{overview.spentLabel}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{overview.remainingCaption}</p>
                <p className={`tabular-figures break-words text-[15px] font-semibold ${overview.isOver ? "text-attention" : "text-text-primary"}`}>{overview.remainingLabel}</p>
              </div>
            </div>
            {overview.expectedMoneyInLabel ? (
              <p className="mt-3 text-xs text-text-muted">
                Expected money in: <span className="tabular-figures text-text-secondary">{overview.expectedMoneyInLabel}</span> (your estimate, not recorded income)
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-text-primary">Categories</h2>
              {!overview.readOnly && addable.length > 0 ? (
                <button type="button" onClick={() => setEditing({ categoryCode: null, label: null, plannedRaw: null, isBudgeted: false })} className="flex min-h-12 items-center gap-1.5 rounded-full bg-accent-primary px-3.5 text-[13px] font-semibold text-background">
                  <Plus size={14} aria-hidden="true" />
                  Add category
                </button>
              ) : null}
            </div>
            {rows.budgeted.length === 0 ? (
              <p className="rounded-xl bg-surface-raised p-4 text-sm text-text-muted">Nothing planned yet. Add a category and choose how much you plan to spend.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.budgeted.map((row) => (
                  <li key={row.categoryCode}>
                    <button type="button" onClick={() => edit(row)} disabled={overview.readOnly} aria-label={`${row.label}: planned ${row.plannedLabel}, spent ${row.spentLabel}, ${row.remainingCaption?.toLowerCase()} ${row.remainingLabel}. ${overview.readOnly ? "" : "Edit amount."}`} className="flex min-h-12 w-full flex-col gap-2 rounded-xl bg-surface-raised p-3.5 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-semibold text-text-primary">{row.label}</p>
                        <p className={`tabular-figures shrink-0 text-right text-sm font-semibold ${row.isOver ? "text-attention" : "text-text-primary"}`}>
                          {row.remainingCaption} {row.remainingLabel}
                        </p>
                      </div>
                      <Rail row={row} />
                      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-text-muted">
                        <span>Planned {row.plannedLabel}</span>
                        <span>Spent {row.spentLabel}</span>
                        <span>{row.progressText}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {rows.unbudgeted.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">Unbudgeted Spending</h2>
                <p className="text-xs text-text-muted">Spent in categories you have not budgeted. Your budget has not been changed.</p>
              </div>
              <ul className="flex flex-col gap-2">
                {rows.unbudgeted.map((row) => (
                  <li key={row.categoryCode} className="flex items-center justify-between gap-2 rounded-xl bg-surface-raised p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{row.label}</p>
                      <p className="tabular-figures text-xs text-text-muted">{row.spentLabel} spent</p>
                    </div>
                    {!overview.readOnly ? (
                      <button type="button" onClick={() => edit(row)} className="min-h-12 shrink-0 rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-accent-primary">
                        Add to budget
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-2.5">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Upcoming Commitments</h2>
              <p className="text-xs text-text-muted">Known payments still coming this month. They are not counted as spent.</p>
            </div>
            {commitments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-raised p-5 text-center">
                <CalendarClock size={18} className="text-text-secondary" aria-hidden="true" />
                <p className="text-sm text-text-muted">No upcoming commitments recorded for this budget period.</p>
                <Link href="/rules?add=commitment" className="flex min-h-12 items-center text-[13px] font-semibold text-accent-primary">
                  Add commitment
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {commitments.map((c) => (
                  <li key={c.obligationId} className="flex items-start justify-between gap-2 rounded-xl bg-surface-raised p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{c.name}</p>
                      <p className="text-xs text-text-muted">Due {formatDueDate(c.dueDate)}</p>
                    </div>
                    <p className="tabular-figures shrink-0 text-sm font-semibold text-text-primary">{formatMoney(c.amount, summary.currencyCode, currenciesByCode)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          {overview.status === "active" ? (
            <MoreDetails label="Close or archive this budget">
              <div className="flex flex-col gap-2 rounded-xl bg-surface-raised p-4">
                <p className="text-xs text-text-muted">Closing keeps the budget visible but read-only. Archiving hides it. Your Money records are never changed.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => changeStatus("closed")} className="min-h-12 rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-text-primary disabled:opacity-50">
                    Close budget
                  </button>
                  <button type="button" disabled={pending} onClick={() => changeStatus("archived")} className="min-h-12 rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-text-primary disabled:opacity-50">
                    Archive budget
                  </button>
                </div>
              </div>
            </MoreDetails>
          ) : null}
        </>
      )}

      {creating ? <CreateBudgetSheet currencies={currencies} defaultCurrencyCode={defaultCurrencyCode} today={today} onClose={() => setCreating(false)} /> : null}
      {editing && summary ? (
        <CategoryAmountSheet budgetId={summary.budgetId} currencyCode={summary.currencyCode} decimalExponent={decimalExponent} target={editing} addable={addable} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
