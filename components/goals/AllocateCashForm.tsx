"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordGoalAllocation } from "@/lib/domain/goals/repository";
import type { GoalSummary } from "@/lib/domain/goals/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface AllocateCashFormProps {
  goals: GoalSummary[];
  buckets: CashBucket[];
}

/**
 * Assigns PURPOSE to cash already sitting in a bucket. Does not move
 * money, does not create a financial_event — see record_goal_allocation()
 * in the migration. Only cash_target/debt_balance_target goals accept
 * allocations.
 */
export function AllocateCashForm({ goals, buckets }: AllocateCashFormProps) {
  const router = useRouter();
  const allocatable = goals.filter((g) => g.measurementType === "cash_target" || g.measurementType === "debt_balance_target");
  const [goalId, setGoalId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const selectedGoal = allocatable.find((g) => g.goalId === goalId);
  const matchingBuckets = selectedGoal ? buckets.filter((b) => b.currency_code === selectedGoal.currencyCode) : buckets;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await recordGoalAllocation(supabase, { goalId, bucketId, amount, idempotencyKey });
      setAmount("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not allocate this cash.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Goal" htmlFor="allocate-goal">
        <Select
          id="allocate-goal"
          required
          value={goalId}
          onChange={(event) => {
            setGoalId(event.target.value);
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

      <FormField label="From bucket" htmlFor="allocate-bucket">
        <Select id="allocate-bucket" required value={bucketId} onChange={(event) => setBucketId(event.target.value)}>
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

      <FormField label="Amount" htmlFor="allocate-amount">
        <Input
          id="allocate-amount"
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
        {pending ? "Allocating…" : "Allocate cash"}
      </Button>
    </form>
  );
}
