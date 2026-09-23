"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createLiability } from "@/lib/domain/liabilities/repository";
import type { LiabilityType, LiabilityTypeCode } from "@/lib/domain/liabilities/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateLiabilityFormProps {
  liabilityTypes: LiabilityType[];
  currencies: Currency[];
}

/**
 * Minimal liability-creation form. Opening principal does not imply
 * current Money In — create_liability() in the migration never touches
 * financial_events/cash_movements.
 */
export function CreateLiabilityForm({ liabilityTypes, currencies }: CreateLiabilityFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [liabilityType, setLiabilityType] = useState<LiabilityTypeCode | "">("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [openingPrincipal, setOpeningPrincipal] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createLiability(supabase, {
        name: name.trim(),
        liabilityType: liabilityType as LiabilityTypeCode,
        currencyCode,
        openingPrincipal,
        counterparty: counterparty.trim() || undefined,
        interestRate: interestRate ? Number(interestRate) : undefined,
        maturityDate: maturityDate ? new Date(maturityDate).toISOString() : undefined,
      });
      setName("");
      setLiabilityType("");
      setCurrencyCode("");
      setOpeningPrincipal("");
      setCounterparty("");
      setInterestRate("");
      setMaturityDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create liability.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="liability-name">
          <Input
            id="liability-name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Car loan"
          />
        </FormField>
        <FormField label="Type" htmlFor="liability-type">
          <Select
            id="liability-type"
            required
            value={liabilityType}
            onChange={(event) => setLiabilityType(event.target.value as LiabilityTypeCode)}
          >
            <option value="" disabled>
              Select
            </option>
            {liabilityTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.display_name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Currency" htmlFor="liability-currency">
          <Select
            id="liability-currency"
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
        <FormField label="Opening principal" htmlFor="liability-opening-principal">
          <Input
            id="liability-opening-principal"
            required
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={openingPrincipal}
            onChange={(event) => setOpeningPrincipal(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Counterparty (optional)" htmlFor="liability-counterparty">
          <Input
            id="liability-counterparty"
            maxLength={100}
            value={counterparty}
            onChange={(event) => setCounterparty(event.target.value)}
          />
        </FormField>
        <FormField label="Interest rate % (optional)" htmlFor="liability-interest-rate">
          <Input
            id="liability-interest-rate"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={interestRate}
            onChange={(event) => setInterestRate(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Maturity date (optional)" htmlFor="liability-maturity-date">
          <Input
            id="liability-maturity-date"
            type="date"
            value={maturityDate}
            onChange={(event) => setMaturityDate(event.target.value)}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add liability"}
      </Button>
    </form>
  );
}
