import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { getFinancialRuleSummaries, getSafeToDeployByCurrency } from "@/lib/domain/rules/repository";
import { getObligationSummaries, getUpcomingObligations } from "@/lib/domain/obligations/repository";
import { getGoalSummaries, getGoalBucketShortfalls } from "@/lib/domain/goals/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { SafeToDeployPanel } from "@/components/rules/SafeToDeployPanel";
import { MinimumCashFloorList } from "@/components/rules/MinimumCashFloorList";
import { MinimumCashFloorForm } from "@/components/rules/MinimumCashFloorForm";
import { CashUseEvaluatorForm } from "@/components/rules/CashUseEvaluatorForm";
import { ObligationList } from "@/components/obligations/ObligationList";
import { CreateObligationForm } from "@/components/obligations/CreateObligationForm";
import { UpcomingObligationsList } from "@/components/obligations/UpcomingObligationsList";
import { ShortfallBanner } from "@/components/goals/ShortfallBanner";

/**
 * Foundation-level Rules & Obligations screen (P0-E2-S6) — proves the
 * domain, not the final design. No fake data: a brand-new user sees "No
 * minimum cash floor configured yet." / "No obligations yet."
 */
export default async function RulesPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [currencies, ruleSummaries, safeToDeploy, obligations, upcoming, goals, buckets, shortfalls] = await Promise.all([
    listCurrencies(supabase),
    getFinancialRuleSummaries(supabase),
    getSafeToDeployByCurrency(supabase),
    getObligationSummaries(supabase),
    getUpcomingObligations(supabase),
    getGoalSummaries(supabase),
    listBuckets(supabase),
    getGoalBucketShortfalls(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const activeBuckets = buckets.filter((bucket) => !bucket.is_archived);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Financial Rules & Obligations</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <ShortfallBanner shortfalls={shortfalls} currencies={currenciesByCode} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Safe to Deploy</h2>
        <SafeToDeployPanel results={safeToDeploy} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Minimum Cash Floor by Currency</h2>
        <MinimumCashFloorList rules={ruleSummaries} currencies={currenciesByCode} />
        <MinimumCashFloorForm rules={ruleSummaries} currencies={currencies} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Upcoming Obligations</h2>
        <UpcomingObligationsList obligations={upcoming} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">All Obligations</h2>
        <ObligationList obligations={obligations} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Add Obligation</h2>
        <CreateObligationForm currencies={currencies} goals={goals} />
      </section>

      {activeBuckets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Cash Use Evaluator</h2>
          <CashUseEvaluatorForm buckets={activeBuckets} />
        </section>
      ) : null}
    </div>
  );
}
