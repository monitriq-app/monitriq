"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordGoalRelease, recordGoalReallocation } from "@/lib/domain/goals/repository";
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
  goals: GoalSummary[];
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  onClose: () => void;
}

/** Advanced controls (release / move to another goal). Same canonical functions as before; neither spends or moves cash. */
export function ReleaseMoveSheet({ goal, goals, buckets, currencies, onClose }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"release" | "move">("release");
  const eligible = buckets.filter((b) => !b.is_archived && b.currency_code === goal.currencyCode);
  const targets = goals.filter((g) => g.goalId !== goal.goalId && g.status === "active" && g.currencyCode === goal.currencyCode && (g.measurementType === "cash_target" || g.measurementType === "debt_balance_target"));
  const [bucketId, setBucketId] = useState(eligible.length === 1 ? eligible[0].id : "");
  const [toGoalId, setToGoalId] = useState("");
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
      const supabase = createClient();
      if (mode === "release") await recordGoalRelease(supabase, { goalId: goal.goalId, bucketId, amount: amount.trim(), idempotencyKey: key });
      else await recordGoalReallocation(supabase, { fromGoalId: goal.goalId, toGoalId, bucketId, amount: amount.trim(), idempotencyKey: key });
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not complete this.");
      setPending(false);
    }
  }

  return (
    <Sheet title="Release or move money" subtitle={goal.name} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex rounded-full bg-surface-strong p-1" role="group" aria-label="What would you like to do?">
          {(["release", "move"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`min-h-12 flex-1 rounded-full px-3 text-[13px] font-semibold ${mode === m ? "bg-surface-raised text-accent-primary" : "text-text-secondary"}`}>
              {m === "release" ? "Release" : "Move to another goal"}
            </button>
          ))}
        </div>
        <p className="text-sm text-text-secondary">
          {mode === "release" ? "Stop setting this money aside for the goal. The money stays in your account." : "Set this money aside for a different goal instead. The money stays in your account."}
        </p>
        <FormField label="Which account?" htmlFor="move-bucket">
          <Select id="move-bucket" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
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
        {mode === "move" ? (
          targets.length === 0 ? (
            <p className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">You need another active {goal.currencyCode} goal to move money to.</p>
          ) : (
            <FormField label="Move to which goal?" htmlFor="move-to">
              <Select id="move-to" required value={toGoalId} onChange={(e) => setToGoalId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {targets.map((g) => (
                  <option key={g.goalId} value={g.goalId}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )
        ) : null}
        <FormField label={`Amount (${goal.currencyCode})`} htmlFor="move-amount">
          <Input id="move-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </FormField>
        <SheetError message={error} />
        <button type="submit" disabled={pending || !bucketId || amount.trim() === "" || (mode === "move" && !toGoalId)} className={primaryButtonClass}>
          {pending ? "Working…" : mode === "release" ? "Release" : "Move"}
        </button>
      </form>
    </Sheet>
  );
}
