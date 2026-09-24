import { Radio } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { listCurrencies } from "@/lib/domain/currency/repository";
import {
  listBuckets,
  listMoneyReceivedCategories,
  listMoneySpendingCategories,
  getBucketBalances,
  getCurrencyTotals,
  getRecentActivity,
  getMoneyPeriodSummary,
  getMoneyWeeklySummary,
  getMoneyCategoryBreakdown,
} from "@/lib/domain/money/repository";
import { resolveMoneyPeriodRange, type MoneyPeriodKey } from "@/lib/utils/period-range";
import { MoneySummaryCard } from "@/components/money/MoneySummaryCard";
import { CashFlowChart } from "@/components/money/CashFlowChart";
import { AvailableCashSection } from "@/components/money/AvailableCashSection";
import { WhereMoneyWentSection } from "@/components/money/WhereMoneyWentSection";
import { CashInBySourceSection } from "@/components/money/CashInBySourceSection";
import { MoneyActivityList } from "@/components/money/MoneyActivityList";
import { AddCashBalanceForm } from "@/components/money/AddCashBalanceForm";
import { ManageCashSection } from "@/components/money/ManageCashSection";

/**
 * Monatriq's production Money screen (P0-E3-S3). Every figure is read
 * from Money's own canonical functions (money_period_summary(),
 * money_weekly_summary(), money_category_breakdown(),
 * money_bucket_balances(), money_currency_totals(),
 * money_recent_activity()) — no arithmetic happens in this file or in
 * any component it renders, and no currency is ever silently summed
 * with another. "Manually Tracked" below is real: Monatriq V1 has no
 * bank-sync/connect-bank capability of any kind, so this is a true
 * statement of current product state, not marketing copy.
 */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { period: periodParam } = await searchParams;
  const periodKey: MoneyPeriodKey = periodParam === "week" || periodParam === "3m" || periodParam === "year" ? periodParam : "month";
  const { start, end } = resolveMoneyPeriodRange(periodKey, profile?.timezone ?? "UTC");

  const [buckets, currencies, receivedCategories, spendingCategories, bucketBalances, currencyTotals, activity, periodSummary, weeklyBuckets, categoryBreakdown] = await Promise.all([
    listBuckets(supabase),
    listCurrencies(supabase),
    listMoneyReceivedCategories(supabase),
    listMoneySpendingCategories(supabase),
    getBucketBalances(supabase),
    getCurrencyTotals(supabase),
    getRecentActivity(supabase, 30),
    getMoneyPeriodSummary(supabase, start, end),
    getMoneyWeeklySummary(supabase, start, end),
    getMoneyCategoryBreakdown(supabase, start, end),
  ]);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const activeBuckets = buckets.filter((b) => !b.is_archived);
  const isNewUser = activeBuckets.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">Track what comes in and what goes out.</p>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-focus">
          <Radio size={11} aria-hidden="true" />
          Manually Tracked
        </span>
      </div>

      {isNewUser ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-surface-raised p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Your money starts here</p>
            <p className="mt-2 text-base font-medium text-text-primary">No cash tracked yet.</p>
            <p className="mt-1 text-sm text-text-secondary">Add the cash you actually have — Monatriq builds everything else from there.</p>
          </div>
          <section id="create-bucket" className="flex flex-col gap-3 scroll-mt-20">
            <h2 className="text-lg font-semibold text-text-primary">Add Cash Balance</h2>
            <AddCashBalanceForm buckets={buckets} currencies={currencies} defaultCurrencyCode={profile?.preferred_currency} />
          </section>
        </div>
      ) : (
        <>
          <MoneySummaryCard summary={periodSummary} currencies={currenciesByCode} periodKey={periodKey} />

          <section className="rounded-xl bg-surface-raised p-4">
            <h3 className="text-lg font-semibold text-text-primary">Cash Flow</h3>
            <p className="mb-2 text-sm text-text-muted">Inflows vs outflows</p>
            <CashFlowChart weeklyBuckets={weeklyBuckets} currencies={currenciesByCode} />
          </section>

          <AvailableCashSection buckets={buckets} balances={bucketBalances} currencyTotals={currencyTotals} currencies={currenciesByCode} />

          <WhereMoneyWentSection breakdown={categoryBreakdown} currencies={currenciesByCode} />

          <CashInBySourceSection breakdown={categoryBreakdown} currencies={currenciesByCode} />

          <MoneyActivityList activity={activity} buckets={buckets} currencies={currenciesByCode} receivedCategories={receivedCategories} spendingCategories={spendingCategories} />

          <ManageCashSection buckets={buckets} currencies={currencies} defaultCurrencyCode={profile?.preferred_currency ?? null} />
        </>
      )}
    </div>
  );
}
