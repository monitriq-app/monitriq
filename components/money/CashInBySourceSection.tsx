import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyCategoryBreakdownItem } from "@/lib/domain/money/types";

interface CashInBySourceSectionProps {
  breakdown: MoneyCategoryBreakdownItem[];
  currencies: Map<string, Currency>;
}

/** Real classification only — matches money_received_categories.cash_flow_class exactly, never a new judgment. */
const EARNED_INCOME_CODES = new Set(["business_income", "salary", "freelance_contract", "investment_income", "gift"]);

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "Cash In by Source" — built from money_category_breakdown()'s real
 * per-category received totals. Each card's "Earned Income" vs. a plain
 * category label reflects the category's own real cash_flow_class
 * (income vs. other_inflow), never a guess — `receivable_recovery` and
 * `asset_sale` categories (if a user ever has generic rows under those
 * codes) are real `other_inflow`, so they are never mislabeled "Earned
 * Income" here. Real linked Receivable Recovery/Debt Payment events are
 * excluded entirely (see money_category_breakdown()'s own comment) —
 * they surface in Activity instead, correctly linked to their real
 * receivable/liability.
 */
export function CashInBySourceSection({ breakdown, currencies }: CashInBySourceSectionProps) {
  const byCurrency = new Map<string, MoneyCategoryBreakdownItem[]>();
  for (const item of breakdown) {
    if (item.direction !== "received") continue;
    const list = byCurrency.get(item.currencyCode) ?? [];
    list.push(item);
    byCurrency.set(item.currencyCode, list);
  }

  if (byCurrency.size === 0) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised p-3.5">
        <h3 className="text-base font-semibold text-text-primary">Cash In by Source</h3>
        <p className="text-xs text-text-muted">No money received in this period.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-surface-raised p-4">
      <h3 className="mb-2 text-lg font-semibold text-text-primary">Cash In by Source</h3>
      <div className="flex flex-col gap-4">
        {Array.from(byCurrency.entries()).map(([currencyCode, items]) => {
          const sorted = [...items].sort((a, b) => new Decimal(b.amount).comparedTo(a.amount));
          const total = sorted.reduce((sum, i) => sum.plus(i.amount), new Decimal(0));

          return (
            <div key={currencyCode} className="flex flex-col gap-2">
              {byCurrency.size > 1 ? <p className="text-sm font-semibold text-text-primary">{currencyCode}</p> : null}
              {/* A single real source gets a balanced, half-width card rather
                  than stretching to fill the row or leaving an empty second
                  grid cell — 2+ sources return to the full 2-column grid
                  automatically (manual-QA polish). */}
              <div className={sorted.length >= 2 ? "grid grid-cols-2 gap-2" : "flex"}>
                {sorted.map((item) => {
                  const isEarned = EARNED_INCOME_CODES.has(item.categoryCode);
                  return (
                    <div
                      key={item.categoryCode}
                      className={`flex flex-col gap-1.5 rounded-lg bg-surface-strong p-3 ${sorted.length >= 2 ? "" : "w-1/2 min-w-[140px]"}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-xs font-medium text-text-primary">{item.categoryLabel}</span>
                        <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${isEarned ? "bg-accent-primary/10 text-accent-primary" : "bg-focus/10 text-focus"}`}>
                          {isEarned ? "Earned Income" : "Other Inflow"}
                        </span>
                      </div>
                      <p className={`tabular-figures text-base font-semibold ${isEarned ? "text-accent-primary" : "text-focus"}`}>{fmt(item.amount, currencyCode, currencies)}</p>
                      <p className="text-[11px] text-text-muted">{total.isZero() ? "0" : new Decimal(item.amount).dividedBy(total).times(100).toFixed(1)}% of period cash in</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-strong p-2.5 text-xs text-text-secondary">
        <span>Internal bucket movements are strictly excluded from income calculations.</span>
      </div>
    </section>
  );
}
