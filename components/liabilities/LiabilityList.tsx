import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { LiabilitySummary, LiabilityType } from "@/lib/domain/liabilities/types";

interface LiabilityListProps {
  liabilities: LiabilitySummary[];
  liabilityTypes: Map<string, LiabilityType>;
  currencies: Map<string, Currency>;
}

function formatOrNotSet(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/** Reads from liability_summary() — one shared calculation. */
export function LiabilityList({ liabilities, liabilityTypes, currencies }: LiabilityListProps) {
  if (liabilities.length === 0) {
    return <p className="text-text-muted">No liabilities yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {liabilities.map((liability) => {
        const typeLabel = liabilityTypes.get(liability.liabilityType)?.display_name ?? liability.liabilityType;
        return (
          <li key={liability.liabilityId} className="flex flex-col gap-1 py-3">
            <div className="flex items-center justify-between">
              <span className="text-text-primary">
                {liability.name}
                <span className="ml-2 text-text-muted">{typeLabel}</span>
                {liability.isArchived ? <span className="ml-2 text-text-muted">(archived)</span> : null}
              </span>
              {liability.maturityDate ? (
                <span className="text-sm text-text-muted">
                  Matures {new Date(liability.maturityDate).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-text-muted">Outstanding Principal</dt>
                <dd className="tabular-figures text-text-secondary">
                  {formatOrNotSet(liability.outstandingPrincipal, liability.currencyCode, currencies)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Principal Repaid</dt>
                <dd className="tabular-figures text-text-secondary">
                  {formatOrNotSet(liability.principalRepaid, liability.currencyCode, currencies)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Interest Rate</dt>
                <dd className="tabular-figures text-text-secondary">
                  {liability.interestRate === null ? "Not set" : `${liability.interestRate}%`}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
