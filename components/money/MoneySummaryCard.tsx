import { TrendingUp, TrendingDown, CalendarDays } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyPeriodSummary } from "@/lib/domain/money/types";
import type { MoneyPeriodKey } from "@/lib/utils/period-range";
import { PeriodSelector } from "@/components/money/PeriodSelector";

interface MoneySummaryCardProps {
  summary: MoneyPeriodSummary;
  currencies: Map<string, Currency>;
  periodKey: MoneyPeriodKey;
}

const PERIOD_TITLES: Record<MoneyPeriodKey, string> = {
  week: "This Week",
  month: "This Month",
  "3m": "Last 3 Months",
  year: "This Year",
};

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency, { trimTrailingZeros: true }) : `${currencyCode} ${value}`;
}

/**
 * "This Month" / period metric card — Money In / Money Out / Net Change,
 * read verbatim from money_period_summary() for each real native
 * currency the period had activity in (never blended, never re-summed).
 * The reference's headline "+44.7% surplus" badge (a NEW ratio computed
 * from cashIn/netExternalCashFlow, not something the domain layer
 * returns) is deliberately not reproduced — computing it here would be
 * exactly the kind of arbitrary financial calculation the phase brief
 * prohibits in JSX; Net Change's own sign/color already communicates
 * surplus vs. deficit using only real, already-computed values.
 */
export function MoneySummaryCard({ summary, currencies, periodKey }: MoneySummaryCardProps) {
  return (
    <section className="flex flex-col gap-3">
      <PeriodSelector active={periodKey} />

      <div className="rounded-xl bg-surface-raised p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={18} className="text-focus" aria-hidden="true" />
          <span className="text-base font-semibold text-text-primary">{PERIOD_TITLES[periodKey]}</span>
          <span className="text-sm text-text-muted">
            ({summary.periodStart} – {summary.periodEnd})
          </span>
        </div>

        {summary.currencies.length === 0 ? (
          <p className="text-sm text-text-muted">No external cash activity in this period.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {summary.currencies.map((c) => {
              const isPositive = new Decimal(c.netExternalCashFlow).greaterThanOrEqualTo(0);
              return (
                <li key={c.currencyCode}>
                  {summary.currencies.length > 1 ? <p className="mb-1.5 text-sm font-semibold text-text-primary">{c.currencyCode}</p> : null}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="min-w-0 rounded-lg bg-surface-strong p-2.5">
                      <div className="flex items-center gap-1 text-[11px] font-medium text-accent-primary">
                        <TrendingDown size={14} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">Money In</span>
                      </div>
                      <p className="tabular-figures mt-1 truncate text-base font-bold text-accent-primary sm:text-lg">{fmt(c.cashIn, c.currencyCode, currencies)}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-surface-strong p-2.5">
                      <div className="flex items-center gap-1 text-[11px] font-medium text-text-secondary">
                        <TrendingUp size={14} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">Money Out</span>
                      </div>
                      <p className="tabular-figures mt-1 truncate text-base font-bold text-text-primary sm:text-lg">{fmt(c.cashOut, c.currencyCode, currencies)}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-surface-strong p-2.5">
                      <div className={`flex items-center gap-1 text-[11px] font-medium ${isPositive ? "text-accent-primary" : "text-danger"}`}>
                        {isPositive ? <TrendingUp size={14} className="shrink-0" aria-hidden="true" /> : <TrendingDown size={14} className="shrink-0" aria-hidden="true" />}
                        <span className="truncate">Net Change</span>
                      </div>
                      <p className={`tabular-figures mt-1 truncate text-base font-bold sm:text-lg ${isPositive ? "text-accent-primary" : "text-danger"}`}>
                        {fmt(c.netExternalCashFlow, c.currencyCode, currencies)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
