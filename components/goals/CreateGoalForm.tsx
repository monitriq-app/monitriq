"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGoal } from "@/lib/domain/goals/repository";
import type { GoalType, MeasurementType } from "@/lib/domain/goals/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateGoalFormProps {
  goalTypes: GoalType[];
  currencies: Currency[];
  liabilities: LiabilitySummary[];
}

const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  cash_target: "Cash target",
  debt_balance_target: "Debt payoff (linked to a liability)",
  monthly_income_target: "Recurring monthly income target",
  milestone: "Milestones only (non-cash)",
};

/**
 * Adapts its visible fields to the selected measurement_type — a debt
 * goal shows a liability picker instead of a currency+amount, a milestone
 * goal shows neither. goal_type_code is a separate, descriptive choice; it
 * only pre-selects a sensible default measurement_type.
 */
export function CreateGoalForm({ goalTypes, currencies, liabilities }: CreateGoalFormProps) {
  const router = useRouter();
  const [goalTypeCode, setGoalTypeCode] = useState("");
  const [measurementType, setMeasurementType] = useState<MeasurementType | "">("");
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [liabilityId, setLiabilityId] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isProtected, setIsProtected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleGoalTypeChange(code: string) {
    setGoalTypeCode(code);
    const type = goalTypes.find((t) => t.code === code);
    if (type) {
      setMeasurementType(type.default_measurement_type as MeasurementType);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createGoal(supabase, {
        goalTypeCode,
        measurementType: measurementType as MeasurementType,
        name: name.trim(),
        currencyCode: measurementType === "milestone" ? undefined : currencyCode || undefined,
        liabilityId: measurementType === "debt_balance_target" ? liabilityId || undefined : undefined,
        targetValue:
          measurementType === "cash_target" || measurementType === "monthly_income_target"
            ? targetValue || undefined
            : undefined,
        targetDate: targetDate || undefined,
        isProtected,
      });
      setGoalTypeCode("");
      setMeasurementType("");
      setName("");
      setCurrencyCode("");
      setLiabilityId("");
      setTargetValue("");
      setTargetDate("");
      setIsProtected(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="goal-name">
          <Input
            id="goal-name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Emergency Reserve"
          />
        </FormField>

        <FormField label="Goal type" htmlFor="goal-type">
          <Select id="goal-type" required value={goalTypeCode} onChange={(event) => handleGoalTypeChange(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {goalTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.display_name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Measurement" htmlFor="goal-measurement">
          <Select
            id="goal-measurement"
            required
            value={measurementType}
            onChange={(event) => setMeasurementType(event.target.value as MeasurementType)}
          >
            <option value="" disabled>
              Select
            </option>
            {(Object.keys(MEASUREMENT_LABELS) as MeasurementType[]).map((type) => (
              <option key={type} value={type}>
                {MEASUREMENT_LABELS[type]}
              </option>
            ))}
          </Select>
        </FormField>

        {measurementType === "debt_balance_target" ? (
          <FormField label="Liability" htmlFor="goal-liability">
            <Select id="goal-liability" required value={liabilityId} onChange={(event) => setLiabilityId(event.target.value)}>
              <option value="" disabled>
                Select
              </option>
              {liabilities.map((liability) => (
                <option key={liability.liabilityId} value={liability.liabilityId}>
                  {liability.name} ({liability.currencyCode})
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}

        {measurementType === "cash_target" || measurementType === "monthly_income_target" ? (
          <FormField label="Currency" htmlFor="goal-currency">
            <Select id="goal-currency" required value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
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
        ) : null}

        {measurementType === "cash_target" ? (
          <FormField label="Target amount (optional)" htmlFor="goal-target-value">
            <Input
              id="goal-target-value"
              inputMode="decimal"
              pattern="^\d+(\.\d+)?$"
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
              placeholder="0.00"
            />
          </FormField>
        ) : null}

        {measurementType === "monthly_income_target" ? (
          <FormField label="Target monthly income" htmlFor="goal-target-value">
            <Input
              id="goal-target-value"
              required
              inputMode="decimal"
              pattern="^\d+(\.\d+)?$"
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
              placeholder="0.00"
            />
          </FormField>
        ) : null}

        {measurementType ? (
          <FormField label="Target date (optional)" htmlFor="goal-target-date">
            <Input id="goal-target-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </FormField>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" checked={isProtected} onChange={(event) => setIsProtected(event.target.checked)} />
        Protected — this goal&rsquo;s allocated cash should be treated with extra caution (does not block spending yet)
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add goal"}
      </Button>
    </form>
  );
}
