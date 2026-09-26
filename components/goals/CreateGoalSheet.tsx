"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGoal } from "@/lib/domain/goals/repository";
import { MEASUREMENT_CHOICES, PROTECT_HELP, PROTECT_LABEL } from "@/lib/domain/goals/presentation";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { GoalType, MeasurementType } from "@/lib/domain/goals/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { Sheet, SheetError, primaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  goalTypes: GoalType[];
  currencies: Currency[];
  liabilities: LiabilitySummary[];
  defaultCurrencyCode: string | null;
  onClose: () => void;
}

export function CreateGoalSheet({ goalTypes, currencies, liabilities, defaultCurrencyCode, onClose }: Props) {
  const router = useRouter();
  const [goalTypeCode, setGoalTypeCode] = useState("");
  const [measurement, setMeasurement] = useState<MeasurementType>("cash_target");
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode && currencies.some((c) => c.code === defaultCurrencyCode) ? defaultCurrencyCode : "");
  const [liabilityId, setLiabilityId] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isProtected, setIsProtected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const usesAmount = measurement === "cash_target" || measurement === "monthly_income_target";
  const currency = currencies.find((c) => c.code === currencyCode);
  const activeDebts = liabilities.filter((l) => !l.isArchived);

  function pickType(code: string) {
    setGoalTypeCode(code);
    const type = goalTypes.find((t) => t.code === code);
    if (type) setMeasurement(type.default_measurement_type as MeasurementType);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (usesAmount && targetValue.trim() !== "" && currency) {
      const problem = validateMoneyInput(targetValue, currency.decimal_exponent);
      if (problem) return setError(problem);
    }
    if (measurement === "monthly_income_target" && targetValue.trim() === "") return setError("Enter the monthly income you want to reach.");
    setPending(true);
    try {
      await createGoal(createClient(), {
        goalTypeCode,
        measurementType: measurement,
        name: name.trim(),
        currencyCode: usesAmount ? currencyCode || undefined : undefined,
        liabilityId: measurement === "debt_balance_target" ? liabilityId || undefined : undefined,
        targetValue: usesAmount ? targetValue.trim() || undefined : undefined,
        targetDate: targetDate || undefined,
        isProtected,
      });
      router.replace("/goals");
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || "Could not create this goal.");
      setPending(false);
    }
  }

  const ready = name.trim() !== "" && goalTypeCode !== "" && (!usesAmount || currencyCode !== "") && (measurement !== "debt_balance_target" || liabilityId !== "");

  return (
    <Sheet title="Create Goal" subtitle="Something you want to save toward." onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label="What is the goal called?" htmlFor="goal-name">
          <Input id="goal-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
        </FormField>
        <FormField label="What kind of goal is it?" htmlFor="goal-type">
          <Select id="goal-type" required value={goalTypeCode} onChange={(e) => pickType(e.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {goalTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.display_name}
              </option>
            ))}
          </Select>
        </FormField>

        {measurement === "debt_balance_target" ? (
          activeDebts.length === 0 ? (
            <p className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
              Add the debt you want to pay off on the Debts page first, then come back to create this goal.
            </p>
          ) : (
            <FormField label="Which debt?" htmlFor="goal-debt">
              <Select id="goal-debt" required value={liabilityId} onChange={(e) => setLiabilityId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {activeDebts.map((l) => (
                  <option key={l.liabilityId} value={l.liabilityId}>
                    {l.name} ({l.currencyCode})
                  </option>
                ))}
              </Select>
            </FormField>
          )
        ) : null}

        {usesAmount ? (
          <>
            <FormField label="Currency" htmlFor="goal-currency">
              <Select id="goal-currency" required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
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
            <FormField label={measurement === "monthly_income_target" ? "Monthly income you want to reach" : "How much do you need? (optional)"} htmlFor="goal-target">
              <Input id="goal-target" inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="0.00" />
            </FormField>
          </>
        ) : null}

        <FormField label="When do you want it? (optional)" htmlFor="goal-date">
          <Input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </FormField>

        <label className="flex min-h-12 items-start gap-3 text-sm text-text-secondary">
          <input type="checkbox" checked={isProtected} onChange={(e) => setIsProtected(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span className="block font-medium text-text-primary">{PROTECT_LABEL}</span>
            <span className="block text-xs text-text-muted">{PROTECT_HELP}</span>
          </span>
        </label>

        <MoreDetails label="How do you want to track it?">
          <fieldset className="flex flex-col gap-1 rounded-xl bg-surface-strong p-3">
            <legend className="sr-only">How to track this goal</legend>
            {MEASUREMENT_CHOICES.map((m) => (
              <label key={m.value} className="flex min-h-12 items-start gap-3 text-sm">
                <input type="radio" name="goal-measurement" checked={measurement === m.value} onChange={() => setMeasurement(m.value)} className="mt-1 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium text-text-primary">{m.label}</span>
                  <span className="block text-xs text-text-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </MoreDetails>

        <SheetError message={error} />
        <button type="submit" disabled={pending || !ready} className={primaryButtonClass}>
          {pending ? "Creating…" : "Create Goal"}
        </button>
      </form>
    </Sheet>
  );
}
