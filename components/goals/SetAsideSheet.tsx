"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordGoalAllocation } from "@/lib/domain/goals/repository";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { GoalSummary } from "@/lib/domain/goals/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Sheet, SheetError, primaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  goal: GoalSummary;
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  onClose: () => void;
}

/**
 * "Set Money Aside" — assigns PURPOSE to cash already in one of the
 * user's own accounts (record_goal_allocation). Nothing is spent or moved,
 * which is why this is not called "Add Money" or "Transfer".
 */
export function SetAsideSheet({ goal, buckets, currencies, onClose }: Props) {
  const router = useRouter();
  const eligible = buckets.filter((b) => !b.is_archived && b.currency_code === goal.currencyCode);
  const [bucketId, setBucketId] = useState(eligible.length === 1 ? eligible[0].id : "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const currency = goal.currencyCode ? currencies.get(goal.currencyCode) : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = validateMoneyInput(amount, currency?.decimal_exponent ?? 2);
    if (problem) return setError(problem);
    setPending(true);
    try {
      await recordGoalAllocation(createClient(), { goalId: goal.goalId, bucketId, amount: amount.trim(), idempotencyKey: key });
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not set this money aside.");
      setPending(false);
    }
  }

  return (
    <Sheet title="Set Money Aside" subtitle={goal.name} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-text-secondary">
          This marks money you already have as set aside for this goal. It does not move or spend anything.
        </p>
        {eligible.length === 0 ? (
          <p className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
            You need a {goal.currencyCode} cash account to set money aside. Add one on the Money page.
          </p>
        ) : (
          <>
            <FormField label="From which account?" htmlFor="aside-bucket">
              <Select id="aside-bucket" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {eligible.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency_code})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={`Amount (${goal.currencyCode})`} htmlFor="aside-amount">
              <Input id="aside-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
          </>
        )}
        <SheetError message={error} />
        <button type="submit" disabled={pending || !bucketId || amount.trim() === ""} className={primaryButtonClass}>
          {pending ? "Saving…" : "Set Money Aside"}
        </button>
      </form>
    </Sheet>
  );
}
