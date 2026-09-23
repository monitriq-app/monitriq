import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyPeriodSummary } from "@/lib/domain/money/types";

interface MonthlyMoneySummaryPanelProps {
  summary: MoneyPeriodSummary;
  currencies: Map<string, Currency>;
}

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/** Reads money_period_summary()'s current-month view verbatim — no ad hoc monthly calculation here. */
export function MonthlyMoneySummaryPanel({ summary, currencies }: MonthlyMoneySummaryPanelProps) {
  return (
    <div>
      <p className="mb-3 text-xs text-text-muted">
        {summary.periodStart} – {summary.periodEnd}
      </p>
      {summary.currencies.length === 0 ? (
        <p className="text-text-muted">No external cash activity this period.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {summary.currencies.map((c) => (
            <li key={c.currencyCode} className="rounded-lg border border-border p-4">
              <p className="mb-2 font-medium text-text-primary">{c.currencyCode}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-text-muted">Cash In</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(c.cashIn, c.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Cash Out</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(c.cashOut, c.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Net External Flow</dt>
                  <dd className="tabular-figures font-medium text-text-primary">{fmt(c.netExternalCashFlow, c.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Earned Income</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(c.earnedIncome, c.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Expense</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(c.expense, c.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Transfer In</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(c.transferIn, c.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Transfer Out</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(c.transferOut, c.currencyCode, currencies)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
