"use client";

import { useTerms } from "@/components/language/LanguageProvider";
import { assetBasisLabel } from "@/lib/domain/language/assets";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { voidFinancialEvent } from "@/lib/domain/money/repository";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import { assetDisplayConfig } from "@/lib/domain/assets/capabilities";
import type { AssetDispositionSummary, AssetTypeCode } from "@/lib/domain/assets/types";
import type { Currency } from "@/lib/domain/currency/types";

interface SoldAssetsSectionProps {
  dispositions: AssetDispositionSummary[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * The smallest product behavior for "a sold asset should remain
 * inspectable historically" (P0-E4-S1): a dedicated section, separate
 * from the active AssetsBoard (which never receives a disposed asset at
 * all — see page.tsx's `activeAssets` filter). Every real sale this
 * user has ever recorded, including voided ones (shown with a "Voided"
 * badge rather than hidden — history is never deleted). Reversing a
 * sale calls the SAME generic `voidFinancialEvent()` every other
 * correction in this app already uses — no dedicated "un-sell" function
 * exists or is needed, since an asset's disposed state is derived
 * purely from whether an active (non-voided) disposition exists (see
 * asset_summary()'s is_disposed in the migration).
 */
export function SoldAssetsSection({ dispositions, currencies }: SoldAssetsSectionProps) {
  const terms = useTerms();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (dispositions.length === 0) return null;

  async function handleReverse(financialEventId: string) {
    setError(null);
    setPendingId(financialEventId);
    try {
      const supabase = createClient();
      await voidFinancialEvent(supabase, financialEventId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reverse this sale.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-1.5 text-lg font-semibold leading-6 text-text-primary">
        <Tag size={16} className="text-text-secondary" aria-hidden="true" />
        Sold Assets
      </h2>
      <div className="flex flex-col gap-2">
        {dispositions.map((d) => {
          const meta = categoryMeta(d.assetType as AssetTypeCode);
          const display = assetDisplayConfig(d.assetType as AssetTypeCode);
          return (
            <div key={d.dispositionId} className="rounded-xl bg-surface-raised p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5">
                <meta.Icon size={14} className="shrink-0 text-text-secondary" aria-hidden="true" />
                <p className="truncate text-sm font-semibold text-text-primary">{d.assetName}</p>
                {d.isVoided ? <span className="shrink-0 rounded-full bg-surface-strong px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">Voided</span> : null}
              </div>
              <p className="text-xs text-text-muted">Sold {new Date(d.occurredAt).toLocaleDateString()}</p>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-surface-strong/70 p-2 text-[11px]">
                  <p className="text-text-muted">Sale Price</p>
                  <p className="tabular-figures text-sm font-semibold text-text-primary">{fmt(d.grossProceeds, d.currencyCode, currencies)}</p>
                </div>
                <div className="rounded-lg bg-surface-strong/70 p-2 text-[11px]">
                  <p className="text-text-muted">{terms.t("money_after_costs")}</p>
                  <p className="tabular-figures text-sm font-semibold text-accent-primary">{fmt(d.netProceeds, d.currencyCode, currencies)}</p>
                </div>
                <div className="rounded-lg bg-surface-strong/70 p-2 text-[11px]">
                  <p className="text-text-muted">{assetBasisLabel(terms.mode, display.basisLabel)}</p>
                  <p className="tabular-figures text-sm font-semibold text-text-primary">{d.basisAtSale ? fmt(d.basisAtSale, d.currencyCode, currencies) : "Not set"}</p>
                </div>
                <div className="rounded-lg bg-surface-strong/70 p-2 text-[11px]">
                  <p className="text-text-muted">{terms.t("sale_result")}</p>
                  <p className={`tabular-figures text-sm font-semibold ${d.realisedGainLoss && d.realisedGainLoss.startsWith("-") ? "text-danger" : "text-text-primary"}`}>
                    {d.realisedGainLoss ? fmt(d.realisedGainLoss, d.currencyCode, currencies) : "Not calculated"}
                  </p>
                </div>
              </div>

              {error ? (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {error}
                </p>
              ) : null}

              {!d.isVoided ? (
                <div className="mt-2.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleReverse(d.financialEventId)}
                    disabled={pendingId === d.financialEventId}
                    className="h-8 rounded-full bg-surface-strong px-3 text-xs font-semibold text-text-secondary transition hover:text-text-primary disabled:opacity-50"
                  >
                    {pendingId === d.financialEventId ? "Reversing…" : "Reverse Sale"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
