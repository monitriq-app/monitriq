import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import {
  listBuckets,
  listMoneyReceivedCategories,
  listMoneySpendingCategories,
  getBucketBalances,
  getCurrencyTotals,
  getRecentActivity,
} from "@/lib/domain/money/repository";
import { CashByCurrency } from "@/components/money/CashByCurrency";
import { BucketList } from "@/components/money/BucketList";
import { ActivityList } from "@/components/money/ActivityList";
import { CreateBucketForm } from "@/components/money/CreateBucketForm";
import { RecordMoneyForm } from "@/components/money/RecordMoneyForm";
import { TransferForm } from "@/components/money/TransferForm";

/**
 * Foundation-level Money screen (P0-E2-S2) — proves the domain, not the
 * final Stitch design. No fake data: a brand-new user sees "No cash
 * buckets yet." / "No activity yet.", never seeded sample balances.
 */
export default async function MoneyPage() {
  // app/(app)/layout.tsx already redirects an unauthenticated visitor away
  // from this route — but Next.js can render a layout and the page it
  // wraps concurrently (see that layout's own comment, and
  // docs/reports/P0-E1-S2-application-foundation-auth-shell.txt), so this
  // page's own data fetching can still run, and still needs to not throw,
  // before that redirect "wins". getCurrentUser() is cheap here: it's
  // deduped via React's cache() against the layout's own call within the
  // same request.
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [buckets, currencies, receivedCategories, spendingCategories, bucketBalances, currencyTotals, activity] =
    await Promise.all([
      listBuckets(supabase),
      listCurrencies(supabase),
      listMoneyReceivedCategories(supabase),
      listMoneySpendingCategories(supabase),
      getBucketBalances(supabase),
      getCurrencyTotals(supabase),
      getRecentActivity(supabase, 25),
    ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const activeBuckets = buckets.filter((bucket) => !bucket.is_archived);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Money</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Cash by Currency</h2>
        <CashByCurrency totals={currencyTotals} currencies={currenciesByCode} />
      </section>

      <section id="cash-buckets" className="flex flex-col gap-3 scroll-mt-20">
        <h2 className="text-sm font-medium text-text-secondary">Cash Buckets</h2>
        <BucketList buckets={buckets} balances={bucketBalances} currencies={currenciesByCode} />
        <CreateBucketForm currencies={currencies} />
      </section>

      {activeBuckets.length > 0 ? (
        <section id="record-money" className="flex flex-col gap-3 scroll-mt-20">
          <h2 className="text-sm font-medium text-text-secondary">Record Money</h2>
          <RecordMoneyForm
            buckets={activeBuckets}
            receivedCategories={receivedCategories}
            spendingCategories={spendingCategories}
          />
        </section>
      ) : null}

      {activeBuckets.length > 1 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Move Money</h2>
          <TransferForm buckets={activeBuckets} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Recent Activity</h2>
        <ActivityList
          activity={activity}
          buckets={buckets}
          currencies={currenciesByCode}
          receivedCategories={receivedCategories}
          spendingCategories={spendingCategories}
        />
      </section>
    </div>
  );
}
