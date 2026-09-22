import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetSummary, AssetType } from "@/lib/domain/assets/types";

interface AssetListProps {
  assets: AssetSummary[];
  assetTypes: Map<string, AssetType>;
  currencies: Map<string, Currency>;
}

function formatOrNotSet(
  value: string | null,
  currencyCode: string,
  currencies: Map<string, Currency>,
): string {
  if (value === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/**
 * Reads from asset_summary() — one shared calculation, not re-derived
 * here. Target value and quick-sale estimate are shown as clearly
 * distinct fields from the current estimated value, never merged (see
 * docs/architecture/FINANCIAL_DOMAIN_MODEL.md #4).
 */
export function AssetList({ assets, assetTypes, currencies }: AssetListProps) {
  if (assets.length === 0) {
    return <p className="text-text-muted">No assets yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {assets.map((asset) => {
        const typeLabel = assetTypes.get(asset.assetType)?.display_name ?? asset.assetType;
        return (
          <li key={asset.assetId} className="flex flex-col gap-1 py-3">
            <div className="flex items-center justify-between">
              <span className="text-text-primary">
                {asset.name}
                <span className="ml-2 text-text-muted">{typeLabel}</span>
                {asset.isArchived ? <span className="ml-2 text-text-muted">(archived)</span> : null}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-text-muted">Cost Basis</dt>
                <dd className="tabular-figures text-text-secondary">
                  {formatOrNotSet(asset.costBasis, asset.currencyCode, currencies)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Current Value</dt>
                <dd className="tabular-figures text-text-secondary">
                  {formatOrNotSet(asset.estimatedCurrentValue, asset.currencyCode, currencies)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Quick-Sale Estimate</dt>
                <dd className="tabular-figures text-text-secondary">
                  {formatOrNotSet(asset.quickSaleEstimate, asset.currencyCode, currencies)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Target Value</dt>
                <dd className="tabular-figures text-text-secondary">
                  {formatOrNotSet(asset.targetValue, asset.currencyCode, currencies)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
