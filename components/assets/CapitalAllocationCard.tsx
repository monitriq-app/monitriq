import { Decimal } from "decimal.js";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import type { AssetTypeCode, AssetValueByType } from "@/lib/domain/assets/types";

interface CapitalAllocationCardProps {
  valueByType: AssetValueByType[];
}

/**
 * "Where Your Money Is" (renamed from "Capital Allocation", P0-E4-S2 —
 * plain language, same underlying figures) — a segmented bar across
 * every currently-valued asset category, using real current-value
 * totals from asset_value_by_type() (P0-E3-S2). Only meaningful within
 * ONE currency at a time (percentages of different currencies are never
 * blended into one bar): if the user has valued assets in more than one
 * currency, this renders one bar per currency, each scoped to its own
 * real total — never a cross-currency percentage. The calculation is
 * completely unchanged by this rename — only the heading text.
 */
export function CapitalAllocationCard({ valueByType }: CapitalAllocationCardProps) {
  const byCurrency = new Map<string, AssetValueByType[]>();
  for (const row of valueByType) {
    const list = byCurrency.get(row.currencyCode) ?? [];
    list.push(row);
    byCurrency.set(row.currencyCode, list);
  }

  if (byCurrency.size === 0) return null;

  return (
    <section className="rounded-xl bg-surface-raised p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold leading-6 text-text-primary">Where Your Money Is</h3>
        <p className="text-xs text-text-muted">Across valued holdings</p>
      </div>
      <div className="flex flex-col gap-4">
        {Array.from(byCurrency.entries()).map(([currencyCode, rows]) => {
          const total = rows.reduce((sum, r) => sum.plus(r.totalEstimatedValue), new Decimal(0));
          const sorted = [...rows].sort((a, b) => new Decimal(b.totalEstimatedValue).comparedTo(a.totalEstimatedValue));
          return (
            <div key={currencyCode} className="flex flex-col gap-2.5">
              {byCurrency.size > 1 ? <p className="text-sm font-semibold text-text-primary">{currencyCode}</p> : null}
              <div className="flex h-2.5 w-full gap-0.5 rounded-full bg-surface p-0.5">
                {sorted.map((r, i) => (
                  <div
                    key={r.assetType}
                    className={`h-full ${categoryMeta(r.assetType as AssetTypeCode).bgClass} ${i === 0 ? "rounded-l-full" : ""} ${i === sorted.length - 1 ? "rounded-r-full" : ""}`}
                    style={{ width: `${total.isZero() ? 0 : new Decimal(r.totalEstimatedValue).dividedBy(total).times(100).toFixed(2)}%` }}
                    title={categoryMeta(r.assetType as AssetTypeCode).sectionTitle}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3">
                {sorted.map((r) => (
                  <div key={r.assetType} className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${categoryMeta(r.assetType as AssetTypeCode).bgClass}`} aria-hidden="true" />
                      <span className="truncate text-xs font-medium text-text-primary">{categoryMeta(r.assetType as AssetTypeCode).sectionTitle}</span>
                    </div>
                    <span className="text-[11px] text-text-muted">
                      {total.isZero() ? "0" : new Decimal(r.totalEstimatedValue).dividedBy(total).times(100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
