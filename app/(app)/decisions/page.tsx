import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { listDecisionTypes, getDecisionSummaries } from "@/lib/domain/decisions/repository";
import { getAssetSummaries } from "@/lib/domain/assets/repository";
import { getLiabilitySummaries } from "@/lib/domain/liabilities/repository";
import { DecisionList } from "@/components/decisions/DecisionList";
import { CreateDecisionForm } from "@/components/decisions/CreateDecisionForm";

/**
 * Foundation-level Decisions screen (P0-E2-S7) — proves the domain, not
 * the final design. No fake data: a brand-new user sees "No decisions
 * yet." A Decision is a plan, never a transaction.
 */
export default async function DecisionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();

  const [decisionTypes, decisions, assets, liabilities] = await Promise.all([
    listDecisionTypes(supabase),
    getDecisionSummaries(supabase),
    getAssetSummaries(supabase),
    getLiabilitySummaries(supabase),
  ]);

  const activeAssets = assets.filter((a) => !a.isArchived);
  const activeLiabilities = liabilities.filter((l) => !l.isArchived);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Decisions</h1>
        <p className="text-text-secondary">Foundation-level view — not the final design.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Active Decisions</h2>
        <DecisionList decisions={decisions} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Create Decision</h2>
        <CreateDecisionForm decisionTypes={decisionTypes} assets={activeAssets} liabilities={activeLiabilities} />
      </section>
    </div>
  );
}
