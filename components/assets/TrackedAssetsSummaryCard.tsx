import type { Terminology } from "@/lib/domain/language/terms";
import { Info } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetSummary, AssetTypeCode, AssetValueByType } from "@/lib/domain/assets/types";

interface TrackedAssetsSummaryCardProps {
  terms: Terminology;
  activeAssets: AssetSummary[];
  valueByType: AssetValueByType[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "Tracked Non-Cash Assets" — headline totals read verbatim from
 * asset_value_by_type() (P0-E3-S2), grouped by category AND native
 * currency; never summed across currencies (a user with an NGN vehicle
 * and a USD investment sees two totals, never one blended figure). Cash
 * is never counted here — Money owns cash, this reads only from Assets'
 * own valuation model. The "N valued / M unvalued" line is a plain count
 * of already-fetched rows (whether `estimatedCurrentValue` is null),
 * same presentational-aggregation pattern established on Home.
 */
export function TrackedAssetsSummaryCard({ activeAssets, valueByType, currencies, terms }: TrackedAssetsSummaryCardProps) {
  const valuedCount = activeAssets.filter((a) => a.estimatedCurrentValue !== null).length;
  const unvaluedCount = activeAssets.length - valuedCount;

  // Same-currency totals across categories are summed with Decimal.js —
  // never native `Number` arithmetic on a financial amount — before
  // display; different currencies are never combined into one figure.
  const totalsByCurrency = new Map<string, Decimal>();
  for (const row of valueByType) {
    const existing = totalsByCurrency.get(row.currencyCode) ?? new Decimal(0);
    totalsByCurrency.set(row.currencyCode, existing.plus(row.totalEstimatedValue));
  }

  const byTypeAndCurrency = new Map<AssetTypeCode, AssetValueByType[]>();
  for (const row of valueByType) {
    const list = byTypeAndCurrency.get(row.assetType) ?? [];
    list.push(row);
    byTypeAndCurrency.set(row.assetType, list);
  }
  // Union of "has a valued row" and "has any active asset at all" — a
  // category with zero valued assets (e.g. an unvalued business
  // interest) still gets a real tile showing "Not valued", matching the
  // approved reference's own Businesses tile, rather than disappearing
  // entirely.
  const categoriesPresent = Array.from(new Set([...byTypeAndCurrency.keys(), ...activeAssets.map((a) => a.assetType)]));

  return (
    <section className="relative overflow-hidden rounded-xl bg-surface-raised p-4">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent" />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{terms.t("non_cash_assets")}</p>
        <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Manually Valued</span>
      </div>

      {totalsByCurrency.size === 0 ? (
        <p className="mt-2 text-[32px] font-bold leading-tight tracking-tight text-text-muted">Not valued yet</p>
      ) : totalsByCurrency.size === 1 ? (
        <p className="tabular-figures mt-0.5 text-[32px] font-bold leading-tight tracking-tight text-text-primary">
          {fmt(Array.from(totalsByCurrency.values())[0].toString(), Array.from(totalsByCurrency.keys())[0], currencies)}
        </p>
      ) : (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {Array.from(totalsByCurrency.entries()).map(([code, amount]) => (
            <li key={code} className="tabular-figures text-xl font-bold leading-6 text-text-primary">
              {fmt(amount.toString(), code, currencies)}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-text-secondary">
        {valuedCount} valued {valuedCount === 1 ? "asset" : "assets"}
        {unvaluedCount > 0 ? ` + ${unvaluedCount} unvalued ${unvaluedCount === 1 ? "asset" : "assets"}` : ""}
      </p>

      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-surface-strong px-3 py-2 text-xs text-text-secondary">
        <Info size={16} className="mt-0.5 shrink-0 text-attention" aria-hidden="true" />
        <span>Values are your own estimates and may differ from actual sale prices.</span>
      </div>

      {categoriesPresent.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categoriesPresent.map((type) => {
            const meta = categoryMeta(type);
            const rows = byTypeAndCurrency.get(type) ?? [];
            const count = activeAssets.filter((a) => a.assetType === type).length;
            return (
              <div key={type} className="flex flex-col p-2.5 text-left rounded-lg bg-surface-strong">
                <div className="mb-1 flex w-full items-center justify-between">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-secondary">
                    <meta.Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-medium text-text-secondary">
                    {count} {count === 1 ? meta.unitWord : `${meta.unitWord}s`}
                  </span>
                </div>
                <span className="truncate text-[11px] text-text-muted">{meta.sectionTitle}</span>
                <div className="flex flex-col gap-0.5">
                  {rows.length > 0 ? (
                    rows.map((r) => (
                      <span key={r.currencyCode} className="tabular-figures text-sm font-semibold text-text-primary">
                        {fmt(r.totalEstimatedValue, r.currencyCode, currencies)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-semibold text-text-muted">Not valued</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
