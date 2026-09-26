import type { Terminology } from "@/lib/domain/language/terms";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import { assetStatusLabel } from "@/lib/domain/assets/asset-status";
import { assetCapabilities } from "@/lib/domain/assets/capabilities";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetSummary, AssetTypeCode } from "@/lib/domain/assets/types";

interface PotentialLiquiditySectionProps {
  terms: Terminology;
  activeAssets: AssetSummary[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "Potential Liquidity" — ONLY assets with a real, user-recorded
 * `quickSaleEstimate` (the conservative quick-sale/liquidation valuation
 * type — never `estimatedCurrentValue`, never `targetValue`, never face
 * value). An asset with no quick-sale estimate simply doesn't appear
 * here — it is never assumed to be some fraction of its current or
 * target value (explicitly prohibited: P0-E3-S4 brief).
 */
export function PotentialLiquiditySection({ activeAssets, currencies, terms }: PotentialLiquiditySectionProps) {
  const liquidAssets = activeAssets.filter((a) => a.quickSaleEstimate !== null);
  if (liquidAssets.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-lg font-semibold leading-6 text-text-primary">{terms.t("potential_liquidity")}</h2>
        <p className="text-xs text-text-muted">Assets with a recorded quick-sale estimate.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {liquidAssets.map((asset) => {
          const meta = categoryMeta(asset.assetType as AssetTypeCode);
          return (
            <div key={asset.assetId} className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-accent-primary">
                  <meta.Icon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-text-primary">{asset.name}</span>
                    {assetCapabilities(asset.assetType).supportsVehicleStatus ? (
                      <span className="shrink-0 rounded bg-surface-strong px-1.5 py-0.5 text-[10px] font-medium text-text-muted">{assetStatusLabel(asset.statusCode)}</span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-text-muted">{meta.sectionTitle} · conservative quick-sale estimate</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-figures text-sm font-bold text-accent-primary">{fmt(asset.quickSaleEstimate!, asset.currencyCode, currencies)}</p>
                <p className="text-[11px] text-text-muted">{terms.t("quick_sale_value")}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
