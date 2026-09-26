"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createReceivable } from "@/lib/domain/receivables/repository";
import { MONEY_OWED_FIELD_LABELS } from "@/lib/domain/receivables/presentation";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { Sheet, SheetError, primaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  currencies: Currency[];
  defaultCurrencyCode: string | null;
  onClose: () => void;
}

/** Recording money owed to you never creates cash: create_receivable() only records the claim. */
export function AddMoneyOwedSheet({ currencies, defaultCurrencyCode, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode && currencies.some((c) => c.code === defaultCurrencyCode) ? defaultCurrencyCode : "");
  const [amount, setAmount] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [estimate, setEstimate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const exp = currencies.find((c) => c.code === currencyCode)?.decimal_exponent ?? 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = validateMoneyInput(amount, exp);
    if (problem) return setError(problem);
    if (estimate.trim() !== "") {
      const p2 = validateMoneyInput(estimate, exp, { allowZero: true });
      if (p2) return setError(p2);
    }
    setPending(true);
    try {
      await createReceivable(createClient(), {
        name: name.trim(),
        currencyCode,
        faceAmount: amount.trim(),
        expectedPaymentDate: expectedDate || undefined,
        estimatedRecoverableValue: estimate.trim() || undefined,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not add this.");
      setPending(false);
    }
  }

  return (
    <Sheet title="Add Money Owed" subtitle="Money someone owes you." onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label={MONEY_OWED_FIELD_LABELS.name} htmlFor="owed-name">
          <Input id="owed-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Who owes you?" />
        </FormField>
        <FormField label={MONEY_OWED_FIELD_LABELS.currency} htmlFor="owed-currency">
          <Select id="owed-currency" required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
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
        <FormField label={MONEY_OWED_FIELD_LABELS.amount} htmlFor="owed-amount">
          <Input id="owed-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <p className="text-xs text-text-muted">This is not added to your cash until it is paid to you.</p>
        </FormField>
        <MoreDetails label="More details">
          <div className="flex flex-col gap-4 rounded-xl bg-surface-strong p-3">
            <FormField label={MONEY_OWED_FIELD_LABELS.expectedDate} htmlFor="owed-date">
              <Input id="owed-date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </FormField>
            <FormField label={MONEY_OWED_FIELD_LABELS.estimate} htmlFor="owed-estimate">
              <Input id="owed-estimate" inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-text-muted">Your own estimate. It is not guaranteed cash.</p>
            </FormField>
          </div>
        </MoreDetails>
        <SheetError message={error} />
        <button type="submit" disabled={pending || !name.trim() || !currencyCode || amount.trim() === ""} className={primaryButtonClass}>
          {pending ? "Adding…" : "Add Money Owed"}
        </button>
      </form>
    </Sheet>
  );
}
