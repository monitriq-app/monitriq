import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { UpcomingObligation } from "@/lib/domain/obligations/types";

interface UpcomingObligationsListProps {
  obligations: UpcomingObligation[];
  currencies: Map<string, Currency>;
}

/** Reads from upcoming_obligations() — default 30-day horizon, documented in the migration. */
export function UpcomingObligationsList({ obligations, currencies }: UpcomingObligationsListProps) {
  if (obligations.length === 0) {
    return <p className="text-text-muted">No upcoming obligations in the next 30 days.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {obligations.map((obligation) => {
        const currency = currencies.get(obligation.currencyCode);
        const formatted = currency
          ? formatCurrencyAmount(obligation.amount, currency)
          : `${obligation.currencyCode} ${obligation.amount}`;
        return (
          <li key={obligation.obligationId} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2 truncate text-base font-semibold text-text-primary">
              {obligation.name}
              {obligation.isProtected ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-surface-strong px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                  Protected
                </span>
              ) : null}
            </span>
            <span className="tabular-figures shrink-0 text-xs text-text-secondary">
              {formatted} — Due {obligation.dueDate}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
