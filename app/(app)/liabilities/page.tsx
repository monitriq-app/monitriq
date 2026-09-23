import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listLiabilityTypes, getLiabilitySummaries } from "@/lib/domain/liabilities/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { LiabilityList } from "@/components/liabilities/LiabilityList";
import { CreateLiabilityForm } from "@/components/liabilities/CreateLiabilityForm";
import { DebtPaymentForm } from "@/components/liabilities/DebtPaymentForm";

/**
 * Foundation-level Liabilities screen (P0-E2-S4) — proves the domain, not
 * the final Stitch design. No fake data: a brand-new user sees "No
 * liabilities yet."
 */
export default async function LiabilitiesPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [currencies, liabilityTypes, liabilities, buckets] = await Promise.all([
    listCurrencies(supabase),
    listLiabilityTypes(supabase),
    getLiabilitySummaries(supabase),
    listBuckets(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const liabilityTypesByCode = new Map(liabilityTypes.map((type) => [type.code, type]));
  const activeBuckets = buckets.filter((bucket) => !bucket.is_archived);
  const activeLiabilities = liabilities.filter((l) => !l.isArchived);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Liabilities</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Tracked Liabilities</h2>
        <LiabilityList liabilities={liabilities} liabilityTypes={liabilityTypesByCode} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Add Liability</h2>
        <CreateLiabilityForm liabilityTypes={liabilityTypes} currencies={currencies} />
      </section>

      {activeLiabilities.length > 0 && activeBuckets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Record Debt Payment</h2>
          <DebtPaymentForm liabilities={activeLiabilities} buckets={activeBuckets} />
        </section>
      ) : null}
    </div>
  );
}
