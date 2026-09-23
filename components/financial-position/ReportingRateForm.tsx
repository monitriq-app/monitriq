"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordManualReportingRate } from "@/lib/domain/currency/repository";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface ReportingRateFormProps {
  currencies: Currency[];
  reportingCurrency: string;
}

/**
 * Records one append-only manual reporting rate (source=manual) — never a
 * live/market rate, never silently reused from a past transaction. "1
 * baseCurrency = rate reportingCurrency" — quoteCurrency is fixed to the
 * user's own reporting currency since that is the only rate direction
 * Financial Position's reporting conversion actually needs.
 */
export function ReportingRateForm({ currencies, reportingCurrency }: ReportingRateFormProps) {
  const router = useRouter();
  const [baseCurrency, setBaseCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectable = currencies.filter((c) => c.code !== reportingCurrency);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await recordManualReportingRate(supabase, { baseCurrency, quoteCurrency: reportingCurrency, rate });
      setRate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this rate.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Currency" htmlFor="rate-base-currency">
          <Select id="rate-base-currency" required value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {selectable.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.display_name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={`Rate (1 currency = ? ${reportingCurrency})`} htmlFor="rate-value">
          <Input id="rate-value" required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="1.10" />
        </FormField>
        <div className="flex items-end">
          <Button type="submit" disabled={pending || !baseCurrency}>
            {pending ? "Saving…" : "Record manual rate"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-muted">Manual rate only — never live, market, or official. Recording a new rate never overwrites an older one.</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
