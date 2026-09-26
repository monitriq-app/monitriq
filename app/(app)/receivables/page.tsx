import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { getReceivableSummaries, getReceivableNativeCurrencyTotals } from "@/lib/domain/receivables/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { buildMoneyOwedView } from "@/lib/domain/receivables/presentation";
import { MoneyOwedWorkspace } from "@/components/receivables/MoneyOwedWorkspace";

/**
 * Monitriq's Money Owed to You screen (P0-E5-S2B; route and domain stay
 * "receivables"). Amounts come from receivable_summary() and
 * receivable_native_currency_totals(); money owed is never presented as
 * cash, and currencies are never combined.
 */
export default async function ReceivablesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [currencies, receivables, totals, buckets] = await Promise.all([
    listCurrencies(supabase),
    getReceivableSummaries(supabase),
    getReceivableNativeCurrencyTotals(supabase),
    listBuckets(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const view = buildMoneyOwedView(receivables, totals, currenciesByCode);

  return (
    <MoneyOwedWorkspace
      view={view}
      receivables={receivables.filter((r) => !r.isArchived)}
      currencies={currencies}
      buckets={buckets}
      defaultCurrencyCode={profile?.preferred_currency ?? null}
    />
  );
}
