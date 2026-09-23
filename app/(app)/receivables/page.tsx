import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { getReceivableSummaries } from "@/lib/domain/receivables/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { ReceivableList } from "@/components/receivables/ReceivableList";
import { CreateReceivableForm } from "@/components/receivables/CreateReceivableForm";
import { RecordRecoveryForm } from "@/components/receivables/RecordRecoveryForm";

/**
 * Foundation-level Receivables screen (P0-E2-S4) — proves the domain, not
 * the final Stitch design. No fake data: a brand-new user sees "No
 * receivables yet."
 */
export default async function ReceivablesPage() {
  // See app/(app)/money/page.tsx's identical comment on why this guard
  // exists even though app/(app)/layout.tsx already redirects.
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [currencies, receivables, buckets] = await Promise.all([
    listCurrencies(supabase),
    getReceivableSummaries(supabase),
    listBuckets(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const activeBuckets = buckets.filter((bucket) => !bucket.is_archived);
  const activeReceivables = receivables.filter((r) => !r.isArchived);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Receivables</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Tracked Receivables</h2>
        <ReceivableList receivables={receivables} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Add Receivable</h2>
        <CreateReceivableForm currencies={currencies} />
      </section>

      {activeReceivables.length > 0 && activeBuckets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Record Recovery</h2>
          <RecordRecoveryForm receivables={activeReceivables} buckets={activeBuckets} />
        </section>
      ) : null}
    </div>
  );
}
