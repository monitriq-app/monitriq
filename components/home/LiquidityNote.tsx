import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetQuickSaleCoverage } from "@/lib/domain/assets/types";
import type { ReceivableRecoverabilityCoverage } from "@/lib/domain/receivables/types";

interface LiquidityNoteProps {
  assetCoverage: AssetQuickSaleCoverage[];
  receivableCoverage: ReceivableRecoverabilityCoverage[];
  currencies: Map<string, Currency>;
}

const STATUS_LABEL: Record<string, string> = { partial: "partial — not every item estimated", complete: "complete" };

/**
 * Only rendered when a quick-sale or recoverability estimate has actually
 * been recorded (not_set currencies are omitted entirely — nothing to
 * qualify). A partial sum is always labeled "partial", never presented as
 * though it covers every asset/receivable — see docs/architecture/
 * FINANCIAL_DOMAIN_MODEL.md, "liquidity completeness".
 */
export function LiquidityNote({ assetCoverage, receivableCoverage, currencies }: LiquidityNoteProps) {
  const assetRows = assetCoverage.filter((c) => c.coverageStatus !== "not_set" && c.quickSaleSum !== null);
  const receivableRows = receivableCoverage.filter((c) => c.coverageStatus !== "not_set" && c.recoverableSum !== null);

  if (assetRows.length === 0 && receivableRows.length === 0) return null;

  return (
    <div className="text-xs text-text-muted">
      {assetRows.map((c) => {
        const currency = currencies.get(c.currencyCode);
        const sum = currency ? formatCurrencyAmount(c.quickSaleSum!, currency) : `${c.currencyCode} ${c.quickSaleSum}`;
        return (
          <p key={`asset-${c.currencyCode}`}>
            Estimated quick-sale potential: {sum} ({STATUS_LABEL[c.coverageStatus]}, {c.quickSaleEstimateCount} of {c.activeAssetCount} assets)
          </p>
        );
      })}
      {receivableRows.map((c) => {
        const currency = currencies.get(c.currencyCode);
        const sum = currency ? formatCurrencyAmount(c.recoverableSum!, currency) : `${c.currencyCode} ${c.recoverableSum}`;
        return (
          <p key={`receivable-${c.currencyCode}`}>
            Estimated recoverable receivables: {sum} ({STATUS_LABEL[c.coverageStatus]}, {c.recoverabilityEstimateCount} of {c.activeReceivableCount} receivables)
          </p>
        );
      })}
    </div>
  );
}
