"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordGoalRelease, recordGoalReallocation } from "@/lib/domain/goals/repository";
import type { GoalSummary } from "@/lib/domain/goals/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface ReleaseReallocateFormProps {
  goals: GoalSummary[];
  buckets: CashBucket[];
}

type Mode = "release" | "reallocate";

/**
 * Release un-assigns purpose; reallocate re-assigns it to a different goal
 * atomically. Neither ever creates a financial_event or changes cash — see
 * record_goal_release()/record_goal_reallocation() in the migration.
 */
export function ReleaseReallocateForm({ goals, buckets }: ReleaseReallocateFormProps) {
  const router = useRouter();
  const allocatable = goals.filter((g) => g.measurementType === "cash_target" || g.measurementType === "debt_balance_target");
  const [mode, setMode] = useState<Mode>("release");
  const [fromGoalId, setFromGoalId] = useState("");
  const [toGoalId, setToGoalId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const selectedGoal = allocatable.find((g) => g.goalId === fromGoalId);
  const matchingBuckets = selectedGoal ? buckets.filter((b) => b.currency_code === selectedGoal.currencyCode) : buckets;
  const reallocationTargets = allocatable.filter((g) => g.goalId !== fromGoalId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      if (mode === "release") {
        await recordGoalRelease(supabase, { goalId: fromGoalId, bucketId, amount, idempotencyKey });
      } else {
        await recordGoalReallocation(supabase, { fromGoalId, toGoalId, bucketId, amount, idempotencyKey });
      }
      setAmount("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this operation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Action" htmlFor="release-mode">
        <Select id="release-mode" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          <option value="release">Release (un-assign purpose)</option>
          <option value="reallocate">Reallocate to another goal</option>
        </Select>
      </FormField>

      <FormField label={mode === "release" ? "Goal" : "From goal"} htmlFor="release-from-goal">
        <Select
          id="release-from-goal"
          required
          value={fromGoalId}
          onChange={(event) => {
            setFromGoalId(event.target.value);
            setBucketId("");
          }}
        >
          <option value="" disabled>
            Select
          </option>
          {allocatable.map((goal) => (
            <option key={goal.goalId} value={goal.goalId}>
              {goal.name} ({goal.currencyCode})
            </option>
          ))}
        </Select>
      </FormField>

      {mode === "reallocate" ? (
        <FormField label="To goal" htmlFor="release-to-goal">
          <Select id="release-to-goal" required value={toGoalId} onChange={(event) => setToGoalId(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {reallocationTargets.map((goal) => (
              <option key={goal.goalId} value={goal.goalId}>
                {goal.name} ({goal.currencyCode})
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      <FormField label="Bucket" htmlFor="release-bucket">
        <Select id="release-bucket" required value={bucketId} onChange={(event) => setBucketId(event.target.value)}>
          <option value="" disabled>
            Select
          </option>
          {matchingBuckets.map((bucket) => (
            <option key={bucket.id} value={bucket.id}>
              {bucket.name} ({bucket.currency_code})
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Amount" htmlFor="release-amount">
        <Input
          id="release-amount"
          required
          inputMode="decimal"
          pattern="^\d+(\.\d+)?$"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
        />
      </FormField>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Working…" : mode === "release" ? "Release" : "Reallocate"}
      </Button>
    </form>
  );
}
