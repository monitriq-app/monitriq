"use client";

import { useTerms } from "@/components/language/LanguageProvider";
import { assetBasisLabel, assetCurrentValueLabel } from "@/lib/domain/language/assets";
import { Settings2 } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { assetStatusLabel } from "@/lib/domain/assets/asset-status";
import { assetCapabilities, assetDisplayConfig } from "@/lib/domain/assets/capabilities";
import { MoreDetails } from "@/components/ui/MoreDetails";
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

function Metric({ label, value, valueClassName }: { label: string; value: string; valueClassName: string }) {
  return (
    <div className="rounded-lg bg-surface-strong/70 p-2">
      <p className="text-text-muted">{label}</p>
      <p className={`tabular-figures text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

/**
 * Generic asset card — every asset type shares the same four underlying
 * facts (basis, current value, quick-sale estimate, target) and the same
 * financial semantics; only PRESENTATION PRIORITY varies by type
 * (P0-E4-S2, `assetDisplayConfig()`), never the data itself. Before this
 * pass, every card led with equally-weighted "Cost Basis / Current Value
 * (Est.) / Quick-Sale Value / Target Value" — plain accounting-record
 * language with no priority signal. Now:
 * - Basis/current-value labels are subtype-appropriate plain language
 *   ("What You Paid" for a Vehicle, "Invested" for a Financial
 *   Investment) instead of one generic "Cost Basis" everywhere.
 * - An "Unrealized Gain / Loss" figure appears on investment-style cards
 *   (Financial Investment, Business Interest) ONLY when both basis and
 *   current value are real recorded facts — computed with Decimal.js
 *   (current − basis), never `Number()`/`parseFloat()`, and never shown
 *   as a fabricated zero when either value is missing. Labeled
 *   "Unrealized" specifically (P0-E4-S2A) to stay distinct from Asset
 *   Sale's "Profit / Loss on Sale", which is the realised, cash-settled
 *   figure — the two must never share a label.
 * - Vehicle's default card is NEUTRAL (P0-E4-S2A correction — an
 *   earlier pass had it emphasize quick-sale by default, which silently
 *   assumed every vehicle is resale-intent; Monitriq has no canonical
 *   field to know that). Quick-Sale Estimate, Target Sale Price, and
 *   Vehicle Status all live in "More details" for Vehicle, same as
 *   every other non-investment type — none of them removed, all still
 *   one tap away, and Vehicle Status remains fully editable in "Manage"
 *   (AssetActionSheet) regardless.
 */
export function AssetCard({ asset, currencies, onManage }: AssetCardProps) {
  const terms = useTerms();
  const capabilities = assetCapabilities(asset.assetType);
  const display = assetDisplayConfig(asset.assetType);

  const basis = asset.costBasis !== null ? new Decimal(asset.costBasis) : null;
  const currentValue = asset.estimatedCurrentValue !== null ? new Decimal(asset.estimatedCurrentValue) : null;
  const gainLoss = display.showGainLoss && basis && currentValue ? currentValue.minus(basis) : null;

  // Target leads the primary grid on investment-style cards (matches the
  // basis/current-value pairing that already drives showGainLoss); every
  // other type keeps it in "More details".
  const targetIsPrimary = display.showGainLoss;

  const secondaryItems: { label: string; value: string }[] = [];
  if (!display.emphasizeQuickSale) {
    secondaryItems.push({ label: display.quickSaleLabel, value: fmt(asset.quickSaleEstimate, asset.currencyCode, currencies) });
  }
  if (!targetIsPrimary) {
    secondaryItems.push({ label: display.targetLabel, value: fmt(asset.targetValue, asset.currencyCode, currencies) });
  }
  if (capabilities.supportsVehicleStatus) {
    secondaryItems.push({ label: "Vehicle Status", value: assetStatusLabel(asset.statusCode) });
  }

  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
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
        <Metric label={assetBasisLabel(terms.mode, display.basisLabel)} value={fmt(asset.costBasis, asset.currencyCode, currencies)} valueClassName="text-text-primary" />
        <Metric label={assetCurrentValueLabel(terms.mode, display.currentValueLabel)} value={fmt(asset.estimatedCurrentValue, asset.currencyCode, currencies)} valueClassName="text-focus" />
        {gainLoss ? (
          <Metric
            label={terms.t("unrealised")}
            value={`${gainLoss.isNegative() ? "" : "+"}${fmt(gainLoss.toString(), asset.currencyCode, currencies)}`}
            valueClassName={gainLoss.isNegative() ? "text-danger" : "text-accent-primary"}
          />
        ) : null}
        {display.emphasizeQuickSale ? (
          <Metric label={display.quickSaleLabel} value={fmt(asset.quickSaleEstimate, asset.currencyCode, currencies)} valueClassName="text-accent-primary" />
        ) : null}
        {targetIsPrimary ? <Metric label={display.targetLabel} value={fmt(asset.targetValue, asset.currencyCode, currencies)} valueClassName="text-text-secondary" /> : null}
      </div>

      {secondaryItems.length > 0 ? (
        <div className="mt-2">
          <MoreDetails>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {secondaryItems.map((item) => (
                <Metric key={item.label} label={item.label} value={item.value} valueClassName="text-text-secondary" />
              ))}
            </div>
          </MoreDetails>
        </div>
      ) : null}
    </div>
  );
}
