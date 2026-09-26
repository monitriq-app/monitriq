import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { listDecisionTypes, getDecisionSummaries } from "@/lib/domain/decisions/repository";
import { getAssetSummaries } from "@/lib/domain/assets/repository";
import { getLiabilitySummaries } from "@/lib/domain/liabilities/repository";
import { getFinancialRuleSummaries } from "@/lib/domain/rules/repository";
import { getFinancialPositionSummary } from "@/lib/domain/financial-position/repository";
import { getLanguageMode } from "@/lib/supabase/get-language-mode";
import { terminology } from "@/lib/domain/language/terms";
import { DecisionPositionCard } from "@/components/decisions/DecisionPositionCard";
import { DecisionsWorkspace } from "@/components/decisions/DecisionsWorkspace";

/**
 * Monitriq's production Decisions screen (P0-E4-S3). Answers "what
 * happens to my money if I do this?" — never "what should I do?" Every
 * figure is read from a canonical domain function: Decision Position
 * reuses `getFinancialPositionSummary()` (the exact function Home's
 * PositionSection consumes — no second calculation), and every scenario
 * evaluation inside `DecisionsWorkspace`'s sheets reuses
 * `evaluate_decision_scenario()` via `evaluateDecisionScenario()`. No
 * arithmetic happens in this file. `decisions` here are all of the
 * user's own real records — nothing invented, no suggestion engine.
 */
export default async function DecisionsPage() {
  const terms = terminology(await getLanguageMode());
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const [decisionTypes, decisions, assets, liabilities, currencies, buckets, ruleSummaries, positionSummary] = await Promise.all([
    listDecisionTypes(supabase),
    getDecisionSummaries(supabase),
    getAssetSummaries(supabase),
    getLiabilitySummaries(supabase),
    listCurrencies(supabase),
    listBuckets(supabase),
    getFinancialRuleSummaries(supabase),
    getFinancialPositionSummary(supabase),
  ]);

  const activeAssets = assets.filter((a) => !a.isArchived && !a.isDisposed);
  const activeLiabilities = liabilities.filter((l) => !l.isArchived);
  const activeBuckets = buckets.filter((b) => !b.is_archived);
  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-primary" aria-hidden="true" />
          Decisions
        </p>
        <p className="text-sm text-text-secondary">See the impact before you commit.</p>
      </div>

      <DecisionPositionCard
        terms={terms}
        nativePositions={positionSummary.nativePositions}
        upcomingObligations={positionSummary.upcomingObligations}
        currencies={currenciesByCode}
      />

      <DecisionsWorkspace
        decisions={decisions}
        decisionTypes={decisionTypes}
        assets={activeAssets}
        liabilities={activeLiabilities}
        currencies={currencies}
        buckets={activeBuckets}
        ruleSummaries={ruleSummaries}
      />
    </div>
  );
}
