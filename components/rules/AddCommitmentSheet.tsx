"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createObligation } from "@/lib/domain/obligations/repository";
import type { GoalSummary } from "@/lib/domain/goals/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface AddCommitmentSheetProps {
  currencies: Currency[];
  goals: GoalSummary[];
  onClose: () => void;
}

/**
 * The exact fields `CreateObligationForm` already supported (name,
 * currency, amount, due date, protected checkbox, funding goal) — no new
 * canonical field — presented as a bottom sheet matching `AssetAction
 * Sheet`'s established outer wrapper, instead of a permanently-expanded
 * form under an empty list.
 */
export function AddCommitmentSheet({ currencies, goals, onClose }: AddCommitmentSheetProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isProtected, setIsProtected] = useState(false);
  const [fundingGoalId, setFundingGoalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fundableGoals = goals.filter(
    (g) => (g.measurementType === "cash_target" || g.measurementType === "debt_balance_target") && (currencyCode === "" || g.currencyCode === currencyCode),
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      await createObligation(supabase, {
        name: name.trim(),
        currencyCode,
        amount,
        dueDate: dueDate || undefined,
        isProtected,
        fundingGoalId: fundingGoalId || undefined,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this commitment.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add commitment"
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-lg font-semibold leading-6 text-text-primary">Add Commitment</h3>
            <p className="text-xs text-text-muted">A payment or obligation you already know is coming.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary before:absolute before:-inset-1.5 before:content-['']"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <FormField label="Name" htmlFor="commitment-name">
            <Input id="commitment-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent" />
          </FormField>
          <FormField label="Currency" htmlFor="commitment-currency">
            <Select id="commitment-currency" required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="" disabled>
                Select
              </option>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.display_name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Amount" htmlFor="commitment-amount">
            <Input id="commitment-amount" required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </FormField>
          <FormField label="Due date (optional)" htmlFor="commitment-due-date">
            <Input id="commitment-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Linked goal (optional)" htmlFor="commitment-goal">
            <Select id="commitment-goal" value={fundingGoalId} onChange={(e) => setFundingGoalId(e.target.value)}>
              <option value="">None</option>
              {fundableGoals.map((g) => (
                <option key={g.goalId} value={g.goalId}>
                  {g.name} ({g.currencyCode})
                </option>
              ))}
            </Select>
          </FormField>

          <label className="flex min-h-12 items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={isProtected} onChange={(e) => setIsProtected(e.target.checked)} className="h-5 w-5" />
            Protected — set money aside for this before showing what is available above it
          </label>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending || !name.trim() || !currencyCode || !amount} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
            {pending ? "Adding…" : "Add Commitment"}
          </button>
        </form>
      </div>
    </div>
  );
}
