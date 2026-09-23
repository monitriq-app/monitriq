"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { evaluateProposedCashUse, recordCashUseOverride } from "@/lib/domain/rules/repository";
import type { ProposedCashUseEvaluation, RuleConflictStatus } from "@/lib/domain/rules/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CashUseEvaluatorFormProps {
  buckets: CashBucket[];
}

const LABELS: Record<RuleConflictStatus, string> = {
  aligned: "Aligned",
  attention: "Attention",
  conflict: "Conflict",
  not_configured: "Not configured",
  insufficient_information: "Insufficient information",
};

/**
 * "What happens to protected liquidity if I use this cash?" — a pure
 * read, never approve/reject/recommend. If a conflict is shown, the user
 * may explicitly record an override acknowledging it; Continue Anyway
 * never spends money by itself.
 */
export function CashUseEvaluatorForm({ buckets }: CashUseEvaluatorFormProps) {
  const router = useRouter();
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [evaluation, setEvaluation] = useState<ProposedCashUseEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [overriding, setOverriding] = useState(false);

  async function handleEvaluate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    setEvaluation(null);

    try {
      const supabase = createClient();
      const result = await evaluateProposedCashUse(supabase, bucketId, amount);
      setEvaluation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not evaluate this proposed use.");
    } finally {
      setPending(false);
    }
  }

  async function handleOverride() {
    setOverriding(true);
    setError(null);
    try {
      const supabase = createClient();
      await recordCashUseOverride(supabase, { bucketId, amount, note: "Continue Anyway" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this override.");
    } finally {
      setOverriding(false);
    }
  }

  const hasConflict =
    evaluation &&
    [evaluation.minimumCashFloorStatus, evaluation.protectedGoalStatus, evaluation.protectedObligationStatus].includes(
      "conflict",
    );

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleEvaluate} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Bucket" htmlFor="evaluator-bucket">
            <Select id="evaluator-bucket" required value={bucketId} onChange={(event) => setBucketId(event.target.value)}>
              <option value="" disabled>
                Select
              </option>
              {buckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name} ({bucket.currency_code})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Proposed amount" htmlFor="evaluator-amount">
            <Input
              id="evaluator-amount"
              required
              inputMode="decimal"
              pattern="^\d+(\.\d+)?$"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </FormField>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Evaluating…" : "Evaluate"}
        </Button>
      </form>

      {evaluation ? (
        <div className="rounded-lg border border-border p-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">Current Balance</dt>
              <dd className="tabular-figures text-text-secondary">{evaluation.currentBalance}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Post-Use Balance</dt>
              <dd className="tabular-figures text-text-secondary">{evaluation.postUseBalance}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Safe to Deploy (after)</dt>
              <dd className="tabular-figures text-text-secondary">{evaluation.currencySafeToDeployAfter ?? "Not configured"}</dd>
            </div>
          </dl>
          <ul className="mt-3 flex flex-col gap-1">
            <li>Minimum Cash Floor: {LABELS[evaluation.minimumCashFloorStatus]}</li>
            <li>Protected Goal: {LABELS[evaluation.protectedGoalStatus]}</li>
            <li>Protected Obligation: {LABELS[evaluation.protectedObligationStatus]}</li>
          </ul>
          {hasConflict ? (
            <Button type="button" variant="secondary" className="mt-3" disabled={overriding} onClick={handleOverride}>
              {overriding ? "Recording…" : "Continue Anyway (record override)"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
