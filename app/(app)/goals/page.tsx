import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listGoalTypes, getGoalSummaries, getGoalBucketShortfalls } from "@/lib/domain/goals/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { getLiabilitySummaries } from "@/lib/domain/liabilities/repository";
import { GoalList } from "@/components/goals/GoalList";
import { CreateGoalForm } from "@/components/goals/CreateGoalForm";
import { AllocateCashForm } from "@/components/goals/AllocateCashForm";
import { ReleaseReallocateForm } from "@/components/goals/ReleaseReallocateForm";
import { ShortfallBanner } from "@/components/goals/ShortfallBanner";

/**
 * Foundation-level Goals screen (P0-E2-S5) — proves the domain, not the
 * final Stitch design. No fake data: a brand-new user sees "No goals yet."
 */
export default async function GoalsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [currencies, goalTypes, goals, buckets, liabilitySummaries, shortfalls] = await Promise.all([
    listCurrencies(supabase),
    listGoalTypes(supabase),
    getGoalSummaries(supabase),
    listBuckets(supabase),
    getLiabilitySummaries(supabase),
    getGoalBucketShortfalls(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const activeBuckets = buckets.filter((bucket) => !bucket.is_archived);
  const activeLiabilities = liabilitySummaries.filter((l) => !l.isArchived);
  const allocatableGoals = goals.filter(
    (g) => g.measurementType === "cash_target" || g.measurementType === "debt_balance_target",
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Goals</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <ShortfallBanner shortfalls={shortfalls} currencies={currenciesByCode} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Your Goals</h2>
        <GoalList goals={goals} currencies={currenciesByCode} />
      </section>

      <section id="add-goal" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Add Goal</h2>
        <CreateGoalForm goalTypes={goalTypes} currencies={currencies} liabilities={activeLiabilities} />
      </section>

      {allocatableGoals.length > 0 && activeBuckets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Allocate Cash</h2>
          <AllocateCashForm goals={goals} buckets={activeBuckets} />
        </section>
      ) : null}

      {allocatableGoals.length > 0 && activeBuckets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Release / Reallocate</h2>
          <ReleaseReallocateForm goals={goals} buckets={activeBuckets} />
        </section>
      ) : null}
    </div>
  );
}
