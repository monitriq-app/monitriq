import { TrendingUp, TrendingDown } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyPeriodSummary } from "@/lib/domain/money/types";

interface ThisMonthSectionProps {
  summary: MoneyPeriodSummary;
  currencies: Map<string, Currency>;
}

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency, { trimTrailingZeros: true }) : `${currencyCode} ${value}`;
}

/** Sign/color/icon derived from the already-computed netExternalCashFlow — no new arithmetic, just presentation of one existing signed value. */
function NetBadge({ net, currencyCode, currencies }: { net: string; currencyCode: string; currencies: Map<string, Currency> }) {
  const isPositive = new Decimal(net).greaterThanOrEqualTo(0);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${isPositive ? "bg-accent-primary/15 text-accent-primary" : "bg-danger/15 text-danger"}`}
    >
      {isPositive ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
      Net {fmt(net, currencyCode, currencies)}
    </span>
  );
}

/**
 * Home's own presentation of money_period_summary()'s canonical figures —
 * NOT a second calculation (every value is read verbatim from `summary`,
 * the same object the full-detail MonthlyMoneySummaryPanel on /financial-
 * position renders unabridged). Cash In/Cash Out/Net are primary
 * (matching the reference's highlighted "Quick Stats Matrix" box
 * treatment), Earned Income/Expense are secondary, and transfers —
 * internal movement, not external cash flow — are reduced to one small
 * line shown only when nonzero. The reference's 4-week inflow/outflow bar
 * chart is deliberately NOT reproduced: no canonical weekly Money read
 * model exists, and fabricating weekly buckets from the monthly total
 * would be invented data, not a real read — per this pass's own
 * instruction (Option B), the card's composition is preserved using only
 * the real monthly figures, without a chart. The outer card uses the
 * reference's actual card-level padding (p-4, 16px); the inner stat box
 * uses the reference's actual nested-element padding (p-2, ~8px, per
 * code.html's `p-space-sm` for this specific box) — the two are
 * deliberately different scales in the reference itself, not a
 * near-miss to round off.
 */
export function ThisMonthSection({ summary, currencies }: ThisMonthSectionProps) {
  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">This Month</h3>
          <p className="text-xs text-text-muted">
            {summary.periodStart} – {summary.periodEnd}
          </p>
        </div>
        {summary.currencies.length === 1 ? (
          <NetBadge net={summary.currencies[0].netExternalCashFlow} currencyCode={summary.currencies[0].currencyCode} currencies={currencies} />
        ) : null}
      </div>

      {summary.currencies.length === 0 ? (
        <p className="text-text-muted">No external cash activity this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {summary.currencies.map((c) => {
            const hasTransfers = Number(c.transferIn) > 0 || Number(c.transferOut) > 0;
            return (
              <li key={c.currencyCode}>
                {summary.currencies.length > 1 ? (
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">{c.currencyCode}</p>
                    <NetBadge net={c.netExternalCashFlow} currencyCode={c.currencyCode} currencies={currencies} />
                  </div>
                ) : null}

                <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-strong p-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">In</p>
                    <p className="tabular-figures mt-0.5 text-lg font-semibold text-accent-primary">{fmt(c.cashIn, c.currencyCode, currencies)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Out</p>
                    <p className="tabular-figures mt-0.5 text-lg font-semibold text-text-primary">{fmt(c.cashOut, c.currencyCode, currencies)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Net</p>
                    <p className="tabular-figures mt-0.5 text-lg font-semibold text-text-primary">{fmt(c.netExternalCashFlow, c.currencyCode, currencies)}</p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-text-muted">Earned Income</p>
                    <p className="tabular-figures mt-0.5 text-text-secondary">{fmt(c.earnedIncome, c.currencyCode, currencies)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Expense</p>
                    <p className="tabular-figures mt-0.5 text-text-secondary">{fmt(c.expense, c.currencyCode, currencies)}</p>
                  </div>
                </div>

                {hasTransfers ? (
                  <p className="tabular-figures mt-1.5 text-xs text-text-muted">
                    Transfers — in {fmt(c.transferIn, c.currencyCode, currencies)} · out {fmt(c.transferOut, c.currencyCode, currencies)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
