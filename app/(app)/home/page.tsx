import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listAssetTypes } from "@/lib/domain/assets/repository";
import { getFinancialPositionSummary } from "@/lib/domain/financial-position/repository";
import { getRecentActivity, getBucketBalances } from "@/lib/domain/money/repository";
import type { MoneyActivityItem } from "@/lib/domain/money/types";
import { timeOfDayGreeting } from "@/lib/utils/time-of-day";
import { GreetingHeader } from "@/components/home/GreetingHeader";
import { PositionSection } from "@/components/home/PositionSection";
import { CapitalDistributionSection } from "@/components/home/CapitalDistributionSection";
import { LiquidityNote } from "@/components/home/LiquidityNote";
import { YourMovesSection } from "@/components/home/YourMovesSection";
import { GoalsSection } from "@/components/home/GoalsSection";
import { ThisMonthSection } from "@/components/home/ThisMonthSection";
import { RecentActivityPreview } from "@/components/home/RecentActivityPreview";
import { UpcomingObligationsList } from "@/components/obligations/UpcomingObligationsList";
import { NewUserSetup } from "@/components/home/NewUserSetup";

/**
 * Monatriq's production Home / Command Center (P0-E3-S2). Home is an
 * aggregation surface, never a second source of financial truth
 * (docs/product/PRODUCT_DEFINITION.md #3) — every figure here is read
 * from getFinancialPositionSummary() or, for Recent Activity (deliberately
 * excluded from that summary, see FINANCIAL_DOMAIN_MODEL.md), directly
 * from Money's own canonical getRecentActivity(). No arithmetic happens
 * in this file or in any component it renders.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [currencies, assetTypes, summary, bucketBalances] = await Promise.all([
    listCurrencies(supabase),
    listAssetTypes(supabase),
    getFinancialPositionSummary(supabase),
    getBucketBalances(supabase),
  ]);

  // Factual "N reserves" context for the Liquid Position card — a count
  // of the user's own buckets currently holding a positive balance per
  // currency, from Money's own canonical money_bucket_balances(). Purely
  // a count of already-fetched rows, never a new financial calculation.
  const activeReserveCountByCurrency = new Map<string, number>();
  for (const b of bucketBalances) {
    if (Number(b.amount) > 0) {
      activeReserveCountByCurrency.set(b.currencyCode, (activeReserveCountByCurrency.get(b.currencyCode) ?? 0) + 1);
    }
  }

  // Recent Activity is a secondary module: its own failure should not take
  // down the rest of Home (per the phase brief's graceful-degradation
  // requirement) — fetched separately, degrading to an honest message.
  let activity: MoneyActivityItem[] | null = null;
  try {
    activity = await getRecentActivity(supabase, 10);
  } catch {
    activity = null;
  }

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const assetTypesByCode = new Map(assetTypes.map((t) => [t.code, t]));
  const preferredName = profile?.preferred_name || profile?.first_name || null;
  const timeOfDay = timeOfDayGreeting(profile?.timezone ?? null);
  const isNewUser = summary.nativePositions.length === 0;

  // Real, dynamic item count for the "Your Moves" heading — never the
  // reference's hardcoded "3": a plain count of the already-fetched
  // focus-goal (0 or 1) plus active-decisions rows.
  const movesCount = (summary.focusGoal ? 1 : 0) + summary.activeDecisions.length;

  return (
    <div className="flex flex-col gap-6">
      <GreetingHeader preferredName={preferredName} timeOfDay={timeOfDay} />

      {isNewUser ? (
        <NewUserSetup />
      ) : (
        <>
          <section>
            <PositionSection
              nativePositions={summary.nativePositions}
              reportingCurrency={summary.reportingCurrency}
              reportingPosition={summary.reportingPosition}
              currencies={currenciesByCode}
              activeReserveCountByCurrency={activeReserveCountByCurrency}
            />
          </section>

          <section className="flex flex-col gap-2.5">
            <CapitalDistributionSection distribution={summary.capitalDistribution} currencies={currenciesByCode} assetTypes={assetTypesByCode} />
            <LiquidityNote assetCoverage={summary.assetQuickSaleCoverage} receivableCoverage={summary.receivableRecoverabilityCoverage} currencies={currenciesByCode} />
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-text-primary">{movesCount > 0 ? `Your Moves (${movesCount})` : "Your Moves"}</h2>
            <YourMovesSection focusGoal={summary.focusGoal} activeDecisions={summary.activeDecisions} currencies={currenciesByCode} />
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Goals</h2>
              <Link
                href="/goals"
                aria-label="Add goal"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-strong text-text-secondary"
              >
                <Plus size={16} aria-hidden="true" />
              </Link>
            </div>
            <GoalsSection goals={summary.activeGoals} currencies={currenciesByCode} />
          </section>

          <section>
            <ThisMonthSection summary={summary.thisMonth} currencies={currenciesByCode} />
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Recent Activity</h2>
              <Link href="/money" className="text-[11px] font-semibold text-accent-primary hover:underline">
                View all activity →
              </Link>
            </div>
            {activity === null ? (
              <p className="text-text-muted">Unable to load recent activity right now.</p>
            ) : (
              <RecentActivityPreview activity={activity} currencies={currenciesByCode} />
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-text-primary">Upcoming Obligations</h2>
            <div className="rounded-xl bg-surface-raised p-4">
              <UpcomingObligationsList obligations={summary.upcomingObligations} currencies={currenciesByCode} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
