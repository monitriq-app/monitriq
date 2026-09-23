import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { SafeToDeployResult } from "@/lib/domain/rules/types";

interface SafeToDeployPanelProps {
  results: SafeToDeployResult[];
  currencies: Map<string, Currency>;
}

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/**
 * Makes the Safe-to-Deploy calculation inspectable, not a mysterious
 * final number — reads from safe_to_deploy_by_currency(), the one
 * authoritative formula. A currency with no configured minimum cash
 * floor reads "Not configured", never a silently-assumed zero.
 */
export function SafeToDeployPanel({ results, currencies }: SafeToDeployPanelProps) {
  if (results.length === 0) {
    return <p className="text-text-muted">No cash or liquidity rules recorded yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {results.map((r) => (
        <li key={r.currencyCode} className="rounded-lg border border-border p-4">
          <p className="mb-2 font-medium text-text-primary">{r.currencyCode}</p>
          {r.status === "not_configured" ? (
            <p className="text-sm text-text-muted">
              Cash: {fmt(r.liquidCash, r.currencyCode, currencies)} — Safe to Deploy: Not configured (no minimum cash
              floor set for {r.currencyCode})
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-text-muted">Cash</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(r.liquidCash, r.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Protected Commitments</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(r.protectedCommitments, r.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Minimum Cash Floor</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(r.minimumCashFloor as string, r.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Required Retained</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(r.requiredRetainedCash as string, r.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Safe to Deploy</dt>
                <dd className="tabular-figures font-medium text-text-primary">{fmt(r.safeToDeploy as string, r.currencyCode, currencies)}</dd>
              </div>
            </dl>
          )}
          {r.status === "calculated" && Number(r.retainedDeficit) > 0 ? (
            <p className="mt-2 text-sm text-danger">
              Retained Cash Deficit: {fmt(r.retainedDeficit as string, r.currencyCode, currencies)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
