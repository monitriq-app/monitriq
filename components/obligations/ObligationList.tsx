import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { ObligationSummary } from "@/lib/domain/obligations/types";

interface ObligationListProps {
  obligations: ObligationSummary[];
  currencies: Map<string, Currency>;
}

/** Reads from obligation_summary() — overdue is derived there, never stored. */
export function ObligationList({ obligations, currencies }: ObligationListProps) {
  if (obligations.length === 0) {
    return <p className="text-text-muted">No obligations yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {obligations.map((obligation) => {
        const currency = currencies.get(obligation.currencyCode);
        const formatted = currency
          ? formatCurrencyAmount(obligation.amount, currency)
          : `${obligation.currencyCode} ${obligation.amount}`;
        return (
          <li key={obligation.obligationId} className="flex items-center justify-between py-3">
            <span className="text-text-primary">
              {obligation.name}
              {obligation.isProtected ? <span className="ml-2 text-text-muted">Protected</span> : null}
              {obligation.status !== "active" ? <span className="ml-2 text-text-muted">({obligation.status})</span> : null}
              {obligation.isOverdue ? <span className="ml-2 text-danger">Overdue</span> : null}
            </span>
            <span className="tabular-figures text-text-secondary">
              {formatted}
              {obligation.dueDate ? <span className="ml-2 text-text-muted">Due {obligation.dueDate}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
