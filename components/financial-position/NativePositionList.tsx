import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { NativeFinancialPosition } from "@/lib/domain/financial-position/types";

interface NativePositionListProps {
  positions: NativeFinancialPosition[];
  currencies: Map<string, Currency>;
}

function fmt(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/**
 * One card per native currency — every figure here is read verbatim from
 * financial_position_by_currency(). Net Worth is the only value this
 * domain calculates; everything else (Safe to Deploy, protected cash,
 * potential liquidity) is composed from its own owning domain and never
 * re-derived here. See docs/architecture/FINANCIAL_DOMAIN_MODEL.md,
 * "Financial Position" section.
 */
export function NativePositionList({ positions, currencies }: NativePositionListProps) {
  if (positions.length === 0) {
    return <p className="text-text-muted">No financial activity recorded yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {positions.map((p) => (
        <li key={p.currencyCode} className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-medium text-text-primary">{p.currencyCode}</p>
            <p className="tabular-figures text-lg font-semibold text-text-primary">
              Net Worth: {fmt(p.netWorth, p.currencyCode, currencies)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-text-muted">Liquid Cash</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.liquidCash, p.currencyCode, currencies)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Non-Cash Assets</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.nonCashAssetValue, p.currencyCode, currencies)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Receivables Outstanding</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.receivablesOutstanding, p.currencyCode, currencies)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Liabilities Outstanding</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.liabilitiesOutstanding, p.currencyCode, currencies)}</dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Liquid &amp; Protected Position</p>
            {p.safeToDeployStatus === "not_configured" ? (
              <p className="text-sm text-text-muted">Safe to Deploy: Not configured (no minimum cash floor set for {p.currencyCode})</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-text-muted">Protected Goal Cash</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(p.protectedGoalCash, p.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Protected Commitments</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(p.protectedCommitments, p.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Required Retained Cash</dt>
                  <dd className="tabular-figures text-text-secondary">{fmt(p.requiredRetainedCash, p.currencyCode, currencies)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Safe to Deploy</dt>
                  <dd className="tabular-figures font-medium text-text-primary">{fmt(p.safeToDeploy, p.currencyCode, currencies)}</dd>
                </div>
              </dl>
            )}
            {p.safeToDeployStatus === "calculated" && p.retainedDeficit !== null && Number(p.retainedDeficit) > 0 ? (
              <p className="mt-2 text-sm text-danger">Retained Cash Deficit: {fmt(p.retainedDeficit, p.currencyCode, currencies)}</p>
            ) : null}
            {Number(p.allocationShortfall) > 0 ? (
              <p className="mt-2 text-sm text-danger">Allocation Shortfall: {fmt(p.allocationShortfall, p.currencyCode, currencies)}</p>
            ) : null}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Potential Liquidity (not deployable cash)</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Asset Quick-Sale Estimates</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(p.assetQuickSalePotential, p.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Receivables Estimated Recoverable</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(p.receivablesEstimatedRecoverable, p.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Recoverability Difference</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(p.receivablesRecoverabilityDifference, p.currencyCode, currencies)}</dd>
              </div>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
