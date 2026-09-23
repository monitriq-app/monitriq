import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import {
  getDecisionSummaries,
  listDecisionScenarios,
  evaluateDecisionScenario,
  getDecisionChoiceHistory,
} from "@/lib/domain/decisions/repository";
import type { DecisionTypeCode } from "@/lib/domain/decisions/types";
import { CreateScenarioForm } from "@/components/decisions/CreateScenarioForm";
import { ScenarioEvaluationPanel } from "@/components/decisions/ScenarioEvaluationPanel";
import { DecisionJournal } from "@/components/decisions/DecisionJournal";

/**
 * Decision Detail: Scenarios, What This Changes, Rules, Compare
 * Scenarios (side by side, no ranking), and the Decision Journal.
 * Foundation-level, not the final design.
 */
export default async function DecisionDetailPage({ params }: { params: Promise<{ decisionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { decisionId } = await params;
  const supabase = await createClient();

  const [decisions, currencies, buckets, scenarios, choiceHistory] = await Promise.all([
    getDecisionSummaries(supabase),
    listCurrencies(supabase),
    listBuckets(supabase),
    listDecisionScenarios(supabase, decisionId),
    getDecisionChoiceHistory(supabase, decisionId),
  ]);

  const decision = decisions.find((d) => d.decisionId === decisionId);
  if (!decision) {
    notFound();
  }

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const activeBuckets = buckets.filter((b) => !b.is_archived);
  const evaluations = await Promise.all(scenarios.map((s) => evaluateDecisionScenario(supabase, s.id)));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{decision.name}</h1>
        <p className="text-text-secondary">
          {decision.decisionTypeLabel}
          {decision.status !== "active" ? ` — ${decision.status}` : ""}
        </p>
        {decision.description ? <p className="mt-2 text-text-secondary">{decision.description}</p> : null}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text-secondary">
          {scenarios.length > 1 ? "Compare Scenarios" : "Scenario"}
        </h2>
        {scenarios.length === 0 ? (
          <p className="text-text-muted">No scenarios yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {scenarios.map((scenario, index) => (
              <ScenarioEvaluationPanel
                key={scenario.id}
                scenario={scenario}
                evaluation={evaluations[index]}
                currencies={currenciesByCode}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Add Scenario</h2>
        <CreateScenarioForm
          decisionId={decision.decisionId}
          decisionTypeCode={decision.decisionTypeCode as DecisionTypeCode}
          currencies={currencies}
          buckets={activeBuckets}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Decision Journal</h2>
        <DecisionJournal decisionId={decision.decisionId} history={choiceHistory} />
      </section>
    </div>
  );
}
