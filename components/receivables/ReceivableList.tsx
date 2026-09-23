import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";

interface ReceivableListProps {
  receivables: ReceivableSummary[];
  currencies: Map<string, Currency>;
}

function formatOrNotSet(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/**
 * Reads from receivable_summary() — one shared calculation. Face,
 * recovered, outstanding, and estimated recoverable are always shown as
 * distinct fields, never merged (docs/architecture/
 * FINANCIAL_DOMAIN_MODEL.md #6).
 */
export function ReceivableList({ receivables, currencies }: ReceivableListProps) {
  if (receivables.length === 0) {
    return <p className="text-text-muted">No receivables yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {receivables.map((receivable) => (
        <li key={receivable.receivableId} className="flex flex-col gap-1 py-3">
          <div className="flex items-center justify-between">
            <span className="text-text-primary">
              {receivable.name}
              {receivable.isArchived ? <span className="ml-2 text-text-muted">(archived)</span> : null}
            </span>
            {receivable.expectedPaymentDate ? (
              <span className="text-sm text-text-muted">
                Expected {new Date(receivable.expectedPaymentDate).toLocaleDateString()}
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-text-muted">Face Amount</dt>
              <dd className="tabular-figures text-text-secondary">
                {formatOrNotSet(receivable.faceAmount, receivable.currencyCode, currencies)}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Recovered</dt>
              <dd className="tabular-figures text-text-secondary">
                {formatOrNotSet(receivable.recoveredAmount, receivable.currencyCode, currencies)}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Outstanding</dt>
              <dd className="tabular-figures text-text-secondary">
                {formatOrNotSet(receivable.outstandingAmount, receivable.currencyCode, currencies)}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Est. Recoverable</dt>
              <dd className="tabular-figures text-text-secondary">
                {formatOrNotSet(receivable.estimatedRecoverableValue, receivable.currencyCode, currencies)}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
