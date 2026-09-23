"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveDecisionScenarioEvaluation } from "@/lib/domain/decisions/repository";
import type { DecisionScenario, DecisionScenarioEvaluation } from "@/lib/domain/decisions/types";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import { Button } from "@/components/ui/Button";

interface ScenarioEvaluationPanelProps {
  scenario: DecisionScenario;
  evaluation: DecisionScenarioEvaluation;
  currencies: Map<string, Currency>;
}

const STATUS_LABELS: Record<string, string> = {
  aligned: "Aligned",
  attention: "Attention",
  conflict: "Conflict",
  not_configured: "Not configured",
  insufficient_information: "Insufficient information",
};

const MISSING_LABELS: Record<string, string> = {
  no_bucket_linked: "No cash bucket linked to this scenario",
  no_amount_specified: "No amount has been entered for this scenario",
  no_asset_linked: "This decision has no linked asset",
  no_liability_linked: "This decision has no linked liability",
};

function fmt(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not calculated";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/**
 * "Facts / Your Assumptions / What This Changes / Rules / Missing
 * Information" — the exact restrained vocabulary the brief specifies.
 * Never "AI Analysis," never a recommendation, never a score.
 */
export function ScenarioEvaluationPanel({ scenario, evaluation, currencies }: ScenarioEvaluationPanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = evaluation.currencyCode;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await saveDecisionScenarioEvaluation(supabase, scenario.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this evaluation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium text-text-primary">{scenario.name}</p>
        <span className="text-sm text-text-muted">{STATUS_LABELS[evaluation.overallStatus] ?? evaluation.overallStatus}</span>
      </div>

      {evaluation.missingInformation.length > 0 ? (
        <div className="mb-3 rounded-md bg-surface-muted p-3 text-sm">
          <p className="font-medium text-text-secondary">Missing Information</p>
          <ul className="mt-1 list-disc pl-5 text-text-muted">
            {evaluation.missingInformation.map((key) => (
              <li key={key}>{MISSING_LABELS[key] ?? key}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section>
          <p className="text-sm font-medium text-text-secondary">Facts</p>
          <dl className="mt-1 flex flex-col gap-1 text-sm">
            {evaluation.linkedAssetId ? (
              <>
                <Row label="Asset cost basis" value={fmt(evaluation.linkedAssetCostBasis, cur, currencies)} />
                <Row label="Asset latest value" value={fmt(evaluation.linkedAssetLatestValue, cur, currencies)} />
              </>
            ) : null}
            {evaluation.linkedLiabilityId ? (
              <Row label="Liability outstanding" value={fmt(evaluation.linkedLiabilityOutstandingPrincipal, cur, currencies)} />
            ) : null}
            {evaluation.hypotheticalBucketId ? (
              <Row label="Bucket balance (current)" value={fmt(evaluation.bucketBalanceBefore, cur, currencies)} />
            ) : null}
          </dl>
        </section>

        <section>
          <p className="text-sm font-medium text-text-secondary">Your Assumptions</p>
          <dl className="mt-1 flex flex-col gap-1 text-sm">
            {evaluation.cashRequired ? <Row label="Cash required" value={fmt(evaluation.cashRequired, cur, currencies)} /> : null}
            {evaluation.grossProceeds ? <Row label="Expected proceeds" value={fmt(evaluation.grossProceeds, cur, currencies)} /> : null}
            {evaluation.proceedsCosts ? <Row label="Costs on proceeds" value={fmt(evaluation.proceedsCosts, cur, currencies)} /> : null}
            {evaluation.debtPrincipalPayment ? <Row label="Principal payment" value={fmt(evaluation.debtPrincipalPayment, cur, currencies)} /> : null}
          </dl>
        </section>

        <section>
          <p className="text-sm font-medium text-text-secondary">What This Changes</p>
          <dl className="mt-1 flex flex-col gap-1 text-sm">
            <Row label="Net immediate cash delta" value={fmt(evaluation.netImmediateCashDelta, cur, currencies)} />
            <Row label="Bucket balance after" value={fmt(evaluation.bucketBalanceAfter, cur, currencies)} />
            <Row label="Safe to Deploy before" value={fmt(evaluation.currencySafeToDeployBefore, cur, currencies)} />
            <Row label="Safe to Deploy after" value={fmt(evaluation.currencySafeToDeployAfter, cur, currencies)} />
            {evaluation.projectedGrossProfitLoss !== null ? (
              <Row label="Projected profit/loss (scenario)" value={fmt(evaluation.projectedGrossProfitLoss, cur, currencies)} />
            ) : null}
            {evaluation.hypotheticalLiabilityOutstandingAfter !== null ? (
              <Row label="Liability outstanding after (scenario)" value={fmt(evaluation.hypotheticalLiabilityOutstandingAfter, cur, currencies)} />
            ) : null}
            {evaluation.basisAfterCapitalizedImprovement !== null ? (
              <Row label="Basis after improvement (scenario)" value={fmt(evaluation.basisAfterCapitalizedImprovement, cur, currencies)} />
            ) : null}
          </dl>
        </section>

        <section>
          <p className="text-sm font-medium text-text-secondary">Rules</p>
          <dl className="mt-1 flex flex-col gap-1 text-sm">
            <Row label="Minimum Cash Floor" value={STATUS_LABELS[evaluation.minimumCashFloorStatus ?? ""] ?? "Not calculated"} />
            <Row label="Protected Goal" value={STATUS_LABELS[evaluation.protectedGoalStatus ?? ""] ?? "Not calculated"} />
            <Row label="Protected Obligation" value={STATUS_LABELS[evaluation.protectedObligationStatus ?? ""] ?? "Not calculated"} />
          </dl>
        </section>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="secondary" className="mt-4" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save this evaluation"}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className="tabular-figures text-text-secondary">{value}</dd>
    </div>
  );
}
