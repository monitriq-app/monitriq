import { Settings2 } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { assetStatusLabel } from "@/lib/domain/assets/asset-status";
import { assetCapabilities } from "@/lib/domain/assets/capabilities";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetSummary } from "@/lib/domain/assets/types";

interface AssetCardProps {
  asset: AssetSummary;
  currencies: Map<string, Currency>;
  onManage: () => void;
}

function fmt(amount: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (amount === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * Generic asset card — the one shared foundation every asset type uses
 * (P0-E3-S4 brief, "generic asset detail... only subtype-specific
 * screens should add subtype-specific fields"). Cost Basis, Current
 * Value, Quick-Sale Value, and Target Value are kept as four visually
 * distinct fields, never merged or one derived from another — matching
 * the brief's own valuation-semantics separation exactly. The status
 * chip renders ONLY for asset types that actually support the vehicle
 * lifecycle (`assetCapabilities().supportsVehicleStatus` — see P0-E3-S4R)
 * — a type that structurally can never have a status is not shown a
 * perpetual "Status not set" chip implying one could eventually appear;
 * it simply shows nothing there, the same "no status control" principle
 * already applied to the edit form in AssetActionSheet.
 */
export function AssetCard({ asset, currencies, onManage }: AssetCardProps) {
  const capabilities = assetCapabilities(asset.assetType);
  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {capabilities.supportsVehicleStatus ? (
            <span className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${asset.statusCode ? "bg-focus/15 text-focus" : "bg-surface-strong text-text-muted"}`}>
              {assetStatusLabel(asset.statusCode)}
            </span>
          ) : null}
          <p className="truncate text-lg font-semibold leading-6 text-text-primary">{asset.name}</p>
        </div>
        <button
          type="button"
          onClick={onManage}
          aria-label={`Manage ${asset.name}`}
          className="relative flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface-strong px-2 text-[11px] font-medium text-text-secondary transition after:absolute after:-inset-2.5 after:content-[''] hover:text-text-primary"
        >
          <Settings2 size={11} aria-hidden="true" />
          Manage
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] sm:grid-cols-4">
        <div className="rounded-lg bg-surface-strong/70 p-2">
          <p className="text-text-muted">Cost Basis</p>
          <p className="tabular-figures text-sm font-semibold text-text-primary">{fmt(asset.costBasis, asset.currencyCode, currencies)}</p>
        </div>
        <div className="rounded-lg bg-surface-strong/70 p-2">
          <p className="text-text-muted">Current Value (Est.)</p>
          <p className="tabular-figures text-sm font-semibold text-focus">{fmt(asset.estimatedCurrentValue, asset.currencyCode, currencies)}</p>
        </div>
        <div className="rounded-lg bg-surface-strong/70 p-2">
          <p className="text-text-muted">Quick-Sale Value</p>
          <p className="tabular-figures text-sm font-semibold text-accent-primary">{fmt(asset.quickSaleEstimate, asset.currencyCode, currencies)}</p>
        </div>
        <div className="rounded-lg bg-surface-strong/70 p-2">
          <p className="text-text-muted">Target Value</p>
          <p className="tabular-figures text-sm font-semibold text-text-secondary">{fmt(asset.targetValue, asset.currencyCode, currencies)}</p>
        </div>
      </div>
    </div>
  );
}
