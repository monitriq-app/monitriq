import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listGoalTypes, getGoalSummaries, getGoalBucketShortfalls, getGoalNativeCurrencyTotals, getGoalProtectedAllocationTotals } from "@/lib/domain/goals/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { getLiabilitySummaries } from "@/lib/domain/liabilities/repository";
import { buildGoalsSummary, visibleGoals } from "@/lib/domain/goals/presentation";
import { todayInTimezone } from "@/lib/domain/budget/presentation";
import { GoalsWorkspace } from "@/components/goals/GoalsWorkspace";

/**
 * Monitriq's Goals screen (P0-E5-S2B). Every figure comes from the
 * canonical Goals read model (goal_summary, goal_native_currency_totals,
 * goal_protected_allocation_totals, goal_bucket_shortfalls); nothing is
 * recomputed here, and currencies are never combined.
 */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { new: openNew } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [currencies, goalTypes, allGoals, buckets, liabilities, shortfalls, allocated, protectedTotals] = await Promise.all([
    listCurrencies(supabase),
    listGoalTypes(supabase),
    getGoalSummaries(supabase),
    listBuckets(supabase),
    getLiabilitySummaries(supabase),
    getGoalBucketShortfalls(supabase),
    getGoalNativeCurrencyTotals(supabase),
    getGoalProtectedAllocationTotals(supabase),
  ]);

  const goals = visibleGoals(allGoals);
  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const summary = buildGoalsSummary(goals, allocated, protectedTotals, currenciesByCode, todayInTimezone(profile?.timezone ?? "UTC"));

  return (
    <GoalsWorkspace
      goals={goals}
      summary={summary}
      goalTypes={goalTypes}
      currencies={currencies}
      buckets={buckets}
      liabilities={liabilities}
      shortfalls={shortfalls}
      defaultCurrencyCode={profile?.preferred_currency ?? null}
      openCreate={openNew === "1"}
    />
  );
}
