"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createObligation } from "@/lib/domain/obligations/repository";
import type { GoalSummary } from "@/lib/domain/goals/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateObligationFormProps {
  currencies: Currency[];
  goals: GoalSummary[];
}

/**
 * is_protected defaults to UNCHECKED — an explicit, visible user choice,
 * never auto-true. See create_obligation() in the migration.
 */
export function CreateObligationForm({ currencies, goals }: CreateObligationFormProps) {
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
    (g) =>
      (g.measurementType === "cash_target" || g.measurementType === "debt_balance_target") &&
      (currencyCode === "" || g.currencyCode === currencyCode),
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
      setName("");
      setCurrencyCode("");
      setAmount("");
      setDueDate("");
      setIsProtected(false);
      setFundingGoalId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create obligation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="obligation-name">
          <Input id="obligation-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Rent" />
        </FormField>
        <FormField label="Currency" htmlFor="obligation-currency">
          <Select id="obligation-currency" required value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.display_name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Amount" htmlFor="obligation-amount">
          <Input
            id="obligation-amount"
            required
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Due date (optional)" htmlFor="obligation-due-date">
          <Input id="obligation-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
        <FormField label="Funding goal (optional)" htmlFor="obligation-funding-goal">
          <Select id="obligation-funding-goal" value={fundingGoalId} onChange={(event) => setFundingGoalId(event.target.value)}>
            <option value="">None</option>
            {fundableGoals.map((goal) => (
              <option key={goal.goalId} value={goal.goalId}>
                {goal.name} ({goal.currencyCode})
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" checked={isProtected} onChange={(event) => setIsProtected(event.target.checked)} />
        Protected — count this obligation when evaluating deployable liquidity
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add obligation"}
      </Button>
    </form>
  );
}
