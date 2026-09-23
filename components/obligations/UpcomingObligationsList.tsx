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
          <li key={obligation.obligationId} className="flex items-center justify-between py-2 text-sm">
            <span className="text-text-primary">
              {obligation.name}
              {obligation.isProtected ? <span className="ml-2 text-text-muted">Protected</span> : null}
            </span>
            <span className="tabular-figures text-text-secondary">
              {formatted} — Due {obligation.dueDate}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
