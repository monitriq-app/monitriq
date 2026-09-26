"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createLiability } from "@/lib/domain/liabilities/repository";
import { DEBT_FIELD_LABELS } from "@/lib/domain/liabilities/presentation";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { LiabilityType, LiabilityTypeCode } from "@/lib/domain/liabilities/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { Sheet, SheetError, primaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  liabilityTypes: LiabilityType[];
  currencies: Currency[];
  defaultCurrencyCode: string | null;
  onClose: () => void;
}

/** Recording a debt never creates cash: create_liability() only records what is owed. */
export function AddDebtSheet({ liabilityTypes, currencies, defaultCurrencyCode, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<LiabilityTypeCode | "">("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode && currencies.some((c) => c.code === defaultCurrencyCode) ? defaultCurrencyCode : "");
  const [amount, setAmount] = useState("");
  const [lender, setLender] = useState("");
  const [rate, setRate] = useState("");
  const [maturity, setMaturity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const currency = currencies.find((c) => c.code === currencyCode);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = validateMoneyInput(amount, currency?.decimal_exponent ?? 2, { allowZero: true });
    if (problem) return setError(problem);
    if (rate.trim() !== "" && !/^\d+(\.\d+)?$/.test(rate.trim())) return setError("Enter the interest rate as a number, like 12.5.");
    setPending(true);
    try {
      await createLiability(createClient(), {
        name: name.trim(),
        liabilityType: type as LiabilityTypeCode,
        currencyCode,
        openingPrincipal: amount.trim(),
        counterparty: lender.trim() || undefined,
        interestRate: rate.trim() ? Number(rate) : undefined,
        maturityDate: maturity ? new Date(`${maturity}T00:00:00Z`).toISOString() : undefined,
      });
      router.replace("/liabilities");
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not add this debt.");
      setPending(false);
    }
  }

  return (
    <Sheet title="Add Debt" subtitle="Money you owe." onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label={DEBT_FIELD_LABELS.name} htmlFor="debt-name">
          <Input id="debt-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Car loan" />
        </FormField>
        <FormField label={DEBT_FIELD_LABELS.type} htmlFor="debt-type">
          <Select id="debt-type" required value={type} onChange={(e) => setType(e.target.value as LiabilityTypeCode)}>
            <option value="" disabled>
              Select
            </option>
            {liabilityTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.display_name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={DEBT_FIELD_LABELS.currency} htmlFor="debt-currency">
          <Select id="debt-currency" required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
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
        <FormField label={DEBT_FIELD_LABELS.startingAmount} htmlFor="debt-amount">
          <Input id="debt-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <p className="text-xs text-text-muted">What you owed when you started tracking it. This does not add money to your accounts.</p>
        </FormField>
        <MoreDetails label="More details">
          <div className="flex flex-col gap-4 rounded-xl bg-surface-strong p-3">
            <FormField label={DEBT_FIELD_LABELS.lender} htmlFor="debt-lender">
              <Input id="debt-lender" maxLength={100} value={lender} onChange={(e) => setLender(e.target.value)} placeholder="Bank, person or company" />
            </FormField>
            <FormField label={DEBT_FIELD_LABELS.interest} htmlFor="debt-rate">
              <Input id="debt-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" />
            </FormField>
            <FormField label={DEBT_FIELD_LABELS.maturity} htmlFor="debt-maturity">
              <Input id="debt-maturity" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} />
            </FormField>
          </div>
        </MoreDetails>
        <SheetError message={error} />
        <button type="submit" disabled={pending || !name.trim() || !type || !currencyCode || amount.trim() === ""} className={primaryButtonClass}>
          {pending ? "Adding…" : "Add Debt"}
        </button>
      </form>
    </Sheet>
  );
}
