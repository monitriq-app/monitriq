import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { getFinancialPositionSummary } from "@/lib/domain/financial-position/repository";
import { NativePositionList } from "@/components/financial-position/NativePositionList";
import { FocusGoalPanel } from "@/components/financial-position/FocusGoalPanel";
import { ActiveDecisionsList } from "@/components/financial-position/ActiveDecisionsList";
import { UpcomingObligationsList } from "@/components/obligations/UpcomingObligationsList";

/**
 * Foundation-level Financial Position screen (P0-E3-S1) — proves the
 * aggregation domain, not the final Home design. Every figure here is
 * read straight from getFinancialPositionSummary(); nothing is computed
 * in this page. No fake data: a brand-new user sees empty/"Not set"
 * states throughout.
 */
export default async function FinancialPositionPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [currencies, summary] = await Promise.all([listCurrencies(supabase), getFinancialPositionSummary(supabase)]);
  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Financial Position</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
        <p className="mt-1 text-xs text-text-muted">
          As of {new Date(summary.asOf).toLocaleString()}. Reporting currency:{" "}
          {summary.reportingCurrency ?? "Not set"}.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Financial Position by Currency</h2>
        <NativePositionList positions={summary.nativePositions} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Upcoming Obligations</h2>
        <UpcomingObligationsList obligations={summary.upcomingObligations} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Focus Goal</h2>
        <FocusGoalPanel focusGoal={summary.focusGoal} currencies={currenciesByCode} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Active Decisions</h2>
        <ActiveDecisionsList decisions={summary.activeDecisions} />
      </section>
    </div>
  );
}
