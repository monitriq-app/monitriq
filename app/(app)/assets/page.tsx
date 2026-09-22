import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listAssetTypes, getAssetSummaries, getAssetNativeCurrencyTotals } from "@/lib/domain/assets/repository";
import { AssetsByCurrency } from "@/components/assets/AssetsByCurrency";
import { AssetList } from "@/components/assets/AssetList";
import { AddAssetForm } from "@/components/assets/AddAssetForm";

/**
 * Foundation-level Assets screen (P0-E2-S3) — proves the domain, not the
 * final Stitch design. No fake data: a brand-new user sees "No assets
 * yet.", never seeded sample property/vehicle/investment records.
 */
export default async function AssetsPage() {
  // See app/(app)/money/page.tsx's identical comment: app/(app)/layout.tsx
  // already redirects an unauthenticated visitor away, but Next.js can
  // render a layout and the page it wraps concurrently, so this guard
  // still matters here too.
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [currencies, assetTypes, assets, nativeCurrencyTotals] = await Promise.all([
    listCurrencies(supabase),
    listAssetTypes(supabase),
    getAssetSummaries(supabase),
    getAssetNativeCurrencyTotals(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const assetTypesByCode = new Map(assetTypes.map((type) => [type.code, type]));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Assets</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Assets by Native Currency</h2>
        <AssetsByCurrency totals={nativeCurrencyTotals} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Tracked Assets</h2>
        <AssetList assets={assets} assetTypes={assetTypesByCode} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Add Asset</h2>
        <AddAssetForm assetTypes={assetTypes} currencies={currencies} />
      </section>
    </div>
  );
}
