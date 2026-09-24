import { SlidersHorizontal } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listAssetTypes, getAssetSummaries, getAssetValueByType } from "@/lib/domain/assets/repository";
import { getReceivableSummaries } from "@/lib/domain/receivables/repository";
import { TrackedAssetsSummaryCard } from "@/components/assets/TrackedAssetsSummaryCard";
import { CapitalAllocationCard } from "@/components/assets/CapitalAllocationCard";
import { NeedsAttentionSection } from "@/components/assets/NeedsAttentionSection";
import { PotentialLiquiditySection } from "@/components/assets/PotentialLiquiditySection";
import { AssetsBoard } from "@/components/assets/AssetsBoard";
import { ReceivablesSection } from "@/components/assets/ReceivablesSection";
import { AddAssetButton } from "@/components/assets/AddAssetButton";

/**
 * Monatriq's production Assets screen (P0-E3-S4). Every figure is read
 * from Assets' own canonical functions (asset_summary(),
 * asset_value_by_type()) or, for "Money You're Owed" — a real but
 * separate domain, composed here the same way Home composes Financial
 * Position + Money — Receivables' own receivable_summary(). No
 * arithmetic happens in this file; category/currency totals are computed
 * inside the components that render them, using Decimal.js only, never
 * a native float. Cash is never counted here — Money owns cash.
 * "Manually Valued" is real: no automated valuation source exists.
 */
export default async function AssetsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [assetTypes, currencies, assetSummaries, valueByType, receivables] = await Promise.all([
    listAssetTypes(supabase),
    listCurrencies(supabase),
    getAssetSummaries(supabase),
    getAssetValueByType(supabase),
    getReceivableSummaries(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const activeAssets = assetSummaries.filter((a) => !a.isArchived);
  const activeReceivables = receivables.filter((r) => !r.isArchived);
  const isNewUser = activeAssets.length === 0 && activeReceivables.length === 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-primary" aria-hidden="true" />
            Your Assets
          </p>
          <p className="text-sm text-text-secondary">Where your capital is tied up.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isNewUser ? (
            <a
              href="#assets-category-filters"
              aria-label="Jump to category filters"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-text-secondary transition hover:text-text-primary"
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
            </a>
          ) : null}
          <AddAssetButton assetTypes={assetTypes} currencies={currencies} defaultCurrencyCode={profile?.preferred_currency ?? null} />
        </div>
      </div>

      {isNewUser ? (
        <div className="rounded-xl bg-surface-raised p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Your assets start here</p>
          <p className="mt-2 text-base font-medium text-text-primary">Nothing tracked yet.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Assets may include property, vehicles, investments, money owed to you, business interests, equipment, and more.
          </p>
        </div>
      ) : (
        <>
          <TrackedAssetsSummaryCard activeAssets={activeAssets} valueByType={valueByType} currencies={currenciesByCode} />

          <CapitalAllocationCard valueByType={valueByType} />

          <NeedsAttentionSection activeAssets={activeAssets} receivables={activeReceivables} />

          <PotentialLiquiditySection activeAssets={activeAssets} currencies={currenciesByCode} />

          <AssetsBoard activeAssets={activeAssets} valueByType={valueByType} currencies={currenciesByCode} />

          <ReceivablesSection receivables={activeReceivables} currencies={currenciesByCode} />
        </>
      )}
    </div>
  );
}
