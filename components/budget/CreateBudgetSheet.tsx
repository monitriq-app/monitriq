"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createBudget } from "@/lib/domain/budget/repository";
import { friendlyBudgetError, monthOptions, validatePlannedAmount } from "@/lib/domain/budget/presentation";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface CreateBudgetSheetProps {
  currencies: Currency[];
  defaultCurrencyCode: string | null;
  today: string;
  onClose: () => void;
}

export function CreateBudgetSheet({ currencies, defaultCurrencyCode, today, onClose }: CreateBudgetSheetProps) {
  const router = useRouter();
  const months = monthOptions(today);
  const currentMonth = `${today.slice(0, 7)}-01`;
  const [month, setMonth] = useState(currentMonth);
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode && currencies.some((c) => c.code === defaultCurrencyCode) ? defaultCurrencyCode : "");
  const [expected, setExpected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const currency = currencies.find((c) => c.code === currencyCode);
    if (!currency) return;
    if (expected.trim() !== "") {
      const problem = validatePlannedAmount(expected, currency.decimal_exponent);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setPending(true);
    try {
      const budget = await createBudget(createClient(), {
        currencyCode,
        month,
        expectedMoneyIn: expected.trim() === "" ? undefined : expected.trim(),
      });
      router.push(`/budget?b=${budget.id}`);
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
        aria-label="Create budget"
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Create Budget</h3>
            <p className="text-xs text-text-muted">A simple plan for what you want to spend.</p>
          </div>
          <button type="button" onClick={onClose} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary before:absolute before:-inset-1.5 before:content-['']" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <FormField label="Month" htmlFor="budget-month">
            <Select id="budget-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Currency" htmlFor="budget-currency">
            <Select id="budget-currency" required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
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
          <FormField label="Expected money in (optional)" htmlFor="budget-expected">
            <Input id="budget-expected" inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="0.00" />
            <p className="text-xs text-text-muted">For your planning only. It is not recorded as income.</p>
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending || !currencyCode} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
            {pending ? "Creating…" : "Create Budget"}
          </button>
        </form>
      </div>
    </div>
  );
}
