import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency, CurrencyAmount } from "@/lib/domain/currency/types";

interface AssetsByCurrencyProps {
  totals: CurrencyAmount[];
  currencies: Map<string, Currency>;
}

/**
 * Per-currency totals of each asset's LATEST estimated_current_value only
 * (never target_value, never quick_sale_estimate) — never a consolidated
 * single total. See docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "net
 * worth preparation": unlike currencies are never directly summed, and no
 * reporting-currency conversion is wired into any UI this phase.
 */
export function AssetsByCurrency({ totals, currencies }: AssetsByCurrencyProps) {
  if (totals.length === 0) {
    return <p className="text-text-muted">No assets yet.</p>;
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
