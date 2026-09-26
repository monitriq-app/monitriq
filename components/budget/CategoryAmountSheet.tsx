"use client";

import { useState, type FormEvent } from "react";
import { Decimal } from "decimal.js";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { removeBudgetCategoryAmount, setBudgetCategoryAmount } from "@/lib/domain/budget/repository";
import { friendlyBudgetError, validatePlannedAmount } from "@/lib/domain/budget/presentation";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface EditTarget {
  /** null = the user is adding a category and must pick one. */
  categoryCode: string | null;
  label: string | null;
  plannedRaw: string | null;
  isBudgeted: boolean;
}

interface CategoryAmountSheetProps {
  budgetId: string;
  currencyCode: string;
  decimalExponent: number;
  target: EditTarget;
  addable: { code: string; display_name: string }[];
  onClose: () => void;
}

export function CategoryAmountSheet({ budgetId, currencyCode, decimalExponent, target, addable, onClose }: CategoryAmountSheetProps) {
  const router = useRouter();
  const [code, setCode] = useState(target.categoryCode ?? "");
  const [amount, setAmount] = useState(target.plannedRaw ? new Decimal(target.plannedRaw).toFixed() : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const choosing = target.categoryCode === null;
  const title = choosing ? "Add category" : target.isBudgeted ? "Change budget amount" : "Set budget amount";

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = validatePlannedAmount(amount, decimalExponent);
    if (problem) return setError(problem);
    setPending(true);
    try {
      await setBudgetCategoryAmount(createClient(), budgetId, code, amount.trim());
      router.refresh();
      onClose();
    } catch (err) {
      setError(friendlyBudgetError(err));
      setPending(false);
    }
  }

  async function remove() {
    setError(null);
    setPending(true);
    try {
      await removeBudgetCategoryAmount(createClient(), budgetId, code);
      router.refresh();
      onClose();
    } catch (err) {
      setError(friendlyBudgetError(err));
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            {!choosing ? <p className="text-xs text-text-muted">{target.label}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary before:absolute before:-inset-1.5 before:content-['']" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          {choosing ? (
            <FormField label="Category" htmlFor="budget-category">
              <Select id="budget-category" required value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {addable.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.display_name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label={`Planned amount (${currencyCode})`} htmlFor="budget-amount">
            <Input id="budget-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            <p className="text-xs text-text-muted">Enter 0 if you plan to spend nothing here. That is different from leaving it out.</p>
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending || !code} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
          {target.isBudgeted ? (
            <button type="button" onClick={remove} disabled={pending} className="h-12 rounded-full bg-surface-strong text-sm font-semibold text-text-primary disabled:opacity-50">
              Remove budget amount
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
