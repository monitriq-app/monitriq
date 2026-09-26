import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listLiabilityTypes, getLiabilitySummaries, getLiabilityNativeCurrencyTotals, listLiabilities } from "@/lib/domain/liabilities/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { buildDebtsView } from "@/lib/domain/liabilities/presentation";
import { DebtsWorkspace } from "@/components/liabilities/DebtsWorkspace";

/**
 * Monitriq's Debts screen (P0-E5-S2B; route and domain stay "liabilities").
 * Outstanding amounts and per-currency totals come from liability_summary()
 * and liability_native_currency_totals(); currencies are never combined.
 */
export default async function LiabilitiesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { add } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [currencies, liabilityTypes, liabilities, totals, rows, buckets] = await Promise.all([
    listCurrencies(supabase),
    listLiabilityTypes(supabase),
    getLiabilitySummaries(supabase),
    getLiabilityNativeCurrencyTotals(supabase),
    listLiabilities(supabase),
    listBuckets(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const typeLabels = new Map(liabilityTypes.map((t) => [t.code, t.display_name]));
  const counterparties = new Map(rows.map((r) => [r.id, r.counterparty]));
  const view = buildDebtsView(liabilities, totals, typeLabels, counterparties, currenciesByCode);

  return (
    <DebtsWorkspace
      view={view}
      liabilities={liabilities.filter((l) => !l.isArchived)}
      liabilityTypes={liabilityTypes}
      currencies={currencies}
      buckets={buckets}
      defaultCurrencyCode={profile?.preferred_currency ?? null}
      openAdd={add === "1"}
    />
  );
}
