import { formatCurrencyAmount } from "@/lib/domain/money/format";
import type { Currency, CurrencyAmount } from "@/lib/domain/money/types";

interface CashByCurrencyProps {
  totals: CurrencyAmount[];
  currencies: Map<string, Currency>;
}

/**
 * Per-currency totals only — never a consolidated single total. See
 * docs/architecture/MULTI_CURRENCY_MODEL.md: unlike currencies are never
 * directly summed, and no reporting-currency conversion is wired into any
 * UI this phase (no rate source exists to convert with yet).
 */
export function CashByCurrency({ totals, currencies }: CashByCurrencyProps) {
  if (totals.length === 0) {
    return <p className="text-text-muted">No cash buckets yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {totals.map((total) => {
        const currency = currencies.get(total.currencyCode);
        return (
          <li key={total.currencyCode} className="tabular-figures text-text-primary">
            {currency ? formatCurrencyAmount(total.amount, currency) : `${total.currencyCode} ${total.amount}`}
          </li>
        );
      })}
    </ul>
  );
}
