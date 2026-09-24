import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyCategoryBreakdownItem } from "@/lib/domain/money/types";

interface WhereMoneyWentSectionProps {
  breakdown: MoneyCategoryBreakdownItem[];
  currencies: Map<string, Currency>;
}

const BAR_COLORS = ["bg-attention", "bg-text-muted", "bg-accent-primary", "bg-focus", "bg-surface-strong"];

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "Where Money Went" — built from money_category_breakdown()'s real
 * per-category spending totals (P0-E3-S3; never receivable/debt-linked
 * events, see that function's own comment). Percentages are a decimal-
 * exact ratio (Decimal.js, never a native float) of each category's own
 * real total against the real sum of every category shown — a
 * transparent, fully-reproducible presentational ratio, not a new
 * financial concept, matching the same percentage-of-total treatment
 * Home's Capital Distribution already established.
 */
export function WhereMoneyWentSection({ breakdown, currencies }: WhereMoneyWentSectionProps) {
  const byCurrency = new Map<string, MoneyCategoryBreakdownItem[]>();
  for (const item of breakdown) {
    if (item.direction !== "spent") continue;
    const list = byCurrency.get(item.currencyCode) ?? [];
    list.push(item);
    byCurrency.set(item.currencyCode, list);
  }

  if (byCurrency.size === 0) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised p-3.5">
        <h3 className="text-base font-semibold text-text-primary">Where Money Went</h3>
        <p className="text-xs text-text-muted">No spending recorded in this period.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-surface-raised p-4">
      <h3 className="mb-2 text-lg font-semibold text-text-primary">Where Money Went</h3>
      <div className="flex flex-col gap-4">
        {Array.from(byCurrency.entries()).map(([currencyCode, items]) => {
          const sorted = [...items].sort((a, b) => new Decimal(b.amount).comparedTo(a.amount));
          const total = sorted.reduce((sum, i) => sum.plus(i.amount), new Decimal(0));

          return (
            <div key={currencyCode} className="flex flex-col gap-2">
              {byCurrency.size > 1 ? <p className="text-sm font-semibold text-text-primary">{currencyCode}</p> : null}
              <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-strong">
                {sorted.map((item, i) => (
                  <div
                    key={item.categoryCode}
                    className={BAR_COLORS[i % BAR_COLORS.length]}
                    style={{ width: `${total.isZero() ? 0 : new Decimal(item.amount).dividedBy(total).times(100).toFixed(2)}%` }}
                    title={item.categoryLabel}
                  />
                ))}
              </div>
              <ul className="flex flex-col">
                {sorted.map((item, i) => (
                  <li key={item.categoryCode} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} aria-hidden="true" />
                      <span className="truncate text-sm text-text-primary">{item.categoryLabel}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="tabular-figures text-sm text-text-primary">{fmt(item.amount, currencyCode, currencies)}</span>
                      <span className="w-9 text-right text-[11px] font-medium text-text-muted">
                        {total.isZero() ? "0" : new Decimal(item.amount).dividedBy(total).times(100).toFixed(0)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
