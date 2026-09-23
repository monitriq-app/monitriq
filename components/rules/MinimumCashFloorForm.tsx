"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createFinancialRule, recordFinancialRuleVersion } from "@/lib/domain/rules/repository";
import type { FinancialRuleSummary } from "@/lib/domain/rules/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface MinimumCashFloorFormProps {
  rules: FinancialRuleSummary[];
  currencies: Currency[];
}

/**
 * Monatriq never assumes a floor. This form is the only place a minimum
 * cash floor is ever set — explicit user choice, per currency, including
 * an explicit 0 (distinct from never configuring one at all).
 */
export function MinimumCashFloorForm({ rules, currencies }: MinimumCashFloorFormProps) {
  const router = useRouter();
  const [currencyCode, setCurrencyCode] = useState("");
  const [thresholdValue, setThresholdValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const existingRule = rules.find((r) => r.currencyCode === currencyCode && r.status === "active");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      if (existingRule) {
        await recordFinancialRuleVersion(supabase, { ruleId: existingRule.ruleId, thresholdValue });
      } else {
        await createFinancialRule(supabase, { ruleType: "minimum_cash_floor", currencyCode, thresholdValue });
      }
      setThresholdValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this floor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Currency" htmlFor="floor-currency">
          <Select id="floor-currency" required value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
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
        <FormField label="Minimum Cash Floor (0 is a valid explicit choice)" htmlFor="floor-value">
          <Input
            id="floor-value"
            required
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={thresholdValue}
            onChange={(event) => setThresholdValue(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : existingRule ? "Update floor" : "Set floor"}
      </Button>
    </form>
  );
}
