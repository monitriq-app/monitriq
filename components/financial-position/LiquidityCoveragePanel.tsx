import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetQuickSaleCoverage } from "@/lib/domain/assets/types";
import type { ReceivableRecoverabilityCoverage } from "@/lib/domain/receivables/types";

interface LiquidityCoveragePanelProps {
  assetCoverage: AssetQuickSaleCoverage[];
  receivableCoverage: ReceivableRecoverabilityCoverage[];
  currencies: Map<string, Currency>;
}

function fmt(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

const STATUS_LABEL: Record<string, string> = { not_set: "Not set", partial: "Partial", complete: "Complete" };

/** Distinguishes "the only number we have" (partial) from "the whole picture" (complete) — never presented as one mysterious figure. */
export function LiquidityCoveragePanel({ assetCoverage, receivableCoverage, currencies }: LiquidityCoveragePanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Asset Quick-Sale Coverage</p>
        {assetCoverage.length === 0 ? (
          <p className="text-text-muted">No active assets recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {assetCoverage.map((c) => (
              <li key={c.currencyCode} className="rounded-lg border border-border p-3">
                {c.currencyCode}: {c.quickSaleEstimateCount} of {c.activeAssetCount} active assets estimated — {fmt(c.quickSaleSum, c.currencyCode, currencies)} recorded ({STATUS_LABEL[c.coverageStatus]})
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Receivable Recoverability Coverage</p>
        {receivableCoverage.length === 0 ? (
          <p className="text-text-muted">No active receivables recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {receivableCoverage.map((c) => (
              <li key={c.currencyCode} className="rounded-lg border border-border p-3">
                {c.currencyCode}: {c.recoverabilityEstimateCount} of {c.activeReceivableCount} active receivables estimated — {fmt(c.recoverableSum, c.currencyCode, currencies)} recorded (
                {STATUS_LABEL[c.coverageStatus]})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
