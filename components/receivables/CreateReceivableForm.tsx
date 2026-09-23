"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createReceivable } from "@/lib/domain/receivables/repository";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateReceivableFormProps {
  currencies: Currency[];
}

/**
 * The minimal receivable-creation form — name/counterparty, currency,
 * face amount, plus optional estimated recoverable, expected date, and
 * notes. Not a CRM: no follow-up logging UI, no collections workflow.
 * Creating a receivable never moves cash (create_receivable() in the
 * migration touches only receivables/receivable_ledger_events).
 */
export function CreateReceivableForm({ currencies }: CreateReceivableFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [faceAmount, setFaceAmount] = useState("");
  const [estimatedRecoverableValue, setEstimatedRecoverableValue] = useState("");
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createReceivable(supabase, {
        name: name.trim(),
        currencyCode,
        faceAmount,
        estimatedRecoverableValue: estimatedRecoverableValue || undefined,
        expectedPaymentDate: expectedPaymentDate ? new Date(expectedPaymentDate).toISOString() : undefined,
      });
      setName("");
      setCurrencyCode("");
      setFaceAmount("");
      setEstimatedRecoverableValue("");
      setExpectedPaymentDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create receivable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name / counterparty" htmlFor="receivable-name">
          <Input
            id="receivable-name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Client invoice #1"
          />
        </FormField>
        <FormField label="Currency" htmlFor="receivable-currency">
          <Select
            id="receivable-currency"
            required
            value={currencyCode}
            onChange={(event) => setCurrencyCode(event.target.value)}
          >
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
        <FormField label="Face amount" htmlFor="receivable-face-amount">
          <Input
            id="receivable-face-amount"
            required
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={faceAmount}
            onChange={(event) => setFaceAmount(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Expected payment date (optional)" htmlFor="receivable-expected-date">
          <Input
            id="receivable-expected-date"
            type="date"
            value={expectedPaymentDate}
            onChange={(event) => setExpectedPaymentDate(event.target.value)}
          />
        </FormField>
        <FormField label="Estimated recoverable value (optional)" htmlFor="receivable-estimate">
          <Input
            id="receivable-estimate"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={estimatedRecoverableValue}
            onChange={(event) => setEstimatedRecoverableValue(event.target.value)}
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
        {pending ? "Adding…" : "Add receivable"}
      </Button>
    </form>
  );
}
