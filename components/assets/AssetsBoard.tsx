"use client";

import { useState } from "react";
import { Decimal } from "decimal.js";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetSummary, AssetTypeCode, AssetValueByType } from "@/lib/domain/assets/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { AssetCard } from "@/components/assets/AssetCard";
import { AssetActionSheet } from "@/components/assets/AssetActionSheet";

interface AssetsBoardProps {
  activeAssets: AssetSummary[];
  valueByType: AssetValueByType[];
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * Filterable, category-grouped asset list — the reference's "All /
 * Vehicles / Property / ..." tab row plus per-category sections, built
 * from the SAME already-fetched `activeAssets` (no re-fetch on tab
 * change, matching Money's activity-filter precedent). Only categories
 * that actually have a real asset render a section — no category is
 * fabricated to fill out the tab row (P0-E3-S4 brief, "only render
 * categories that actually exist"). The manage sheet is opened for
 * exactly one asset at a time; closing it — or a successful mutation
 * inside it — clears the selection.
 */
export function AssetsBoard({ activeAssets, valueByType, buckets, currencies }: AssetsBoardProps) {
  const [filter, setFilter] = useState<AssetTypeCode | "all">("all");
  const [managingAssetId, setManagingAssetId] = useState<string | null>(null);

  const byCategory = new Map<AssetTypeCode, AssetSummary[]>();
  for (const asset of activeAssets) {
    const list = byCategory.get(asset.assetType) ?? [];
    list.push(asset);
    byCategory.set(asset.assetType, list);
  }
  const categoriesPresent = Array.from(byCategory.keys());
  const visibleCategories = filter === "all" ? categoriesPresent : categoriesPresent.filter((c) => c === filter);
  const managingAsset = activeAssets.find((a) => a.assetId === managingAssetId) ?? null;

  // Same already-canonical asset_value_by_type() rows TrackedAssetsSummaryCard
  // sums — regrouped here by category only, so each category heading can
  // show its own real current-value subtotal (never re-derived from raw
  // asset rows, never blending currencies).
  const totalsByCategory = new Map<AssetTypeCode, Map<string, Decimal>>();
  for (const row of valueByType) {
    const byCurrency = totalsByCategory.get(row.assetType) ?? new Map<string, Decimal>();
    byCurrency.set(row.currencyCode, (byCurrency.get(row.currencyCode) ?? new Decimal(0)).plus(row.totalEstimatedValue));
    totalsByCategory.set(row.assetType, byCurrency);
  }

  if (activeAssets.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div id="assets-category-filters" className="flex scroll-mt-20 items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            filter === "all" ? "bg-accent-primary text-background" : "bg-surface-strong text-text-secondary"
          }`}
        >
          All ({activeAssets.length})
        </button>
        {categoriesPresent.map((type) => {
          const meta = categoryMeta(type);
          const count = byCategory.get(type)!.length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === type ? "bg-accent-primary text-background" : "bg-surface-strong text-text-secondary"
              }`}
            >
              {meta.sectionTitle} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-5">
        {visibleCategories.map((type) => {
          const meta = categoryMeta(type);
          const assets = byCategory.get(type)!;
          const categoryTotals = totalsByCategory.get(type);
          return (
            <div key={type} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-base font-semibold text-text-primary">
                  <meta.Icon size={16} className={meta.textClass} aria-hidden="true" />
                  {meta.sectionTitle}
                </h3>
                {categoryTotals && categoryTotals.size > 0 ? (
                  <span className="shrink-0 text-xs text-text-muted">
                    {Array.from(categoryTotals.entries())
                      .map(([code, amount]) => fmt(amount.toString(), code, currencies))
                      .join(" · ")}
                  </span>
                ) : null}
              </div>
              {type === "business_interest" ? (
                <p className="text-xs text-text-muted">A business interest&apos;s invested amount is not automatically its market value. Business income and spending are tracked in Money.</p>
              ) : null}
              <div className="flex flex-col gap-2">
                {assets.map((asset) => (
                  <AssetCard key={asset.assetId} asset={asset} currencies={currencies} onManage={() => setManagingAssetId(asset.assetId)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {managingAsset ? <AssetActionSheet asset={managingAsset} buckets={buckets} currencies={currencies} onClose={() => setManagingAssetId(null)} /> : null}
    </section>
  );
}
