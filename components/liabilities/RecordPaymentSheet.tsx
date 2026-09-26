"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordDebtPayment } from "@/lib/domain/liabilities/repository";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Sheet, SheetError, primaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  debt: LiabilitySummary;
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  onClose: () => void;
}

/** A real payment: cash leaves the chosen account (canonical record_debt_payment). */
export function RecordPaymentSheet({ debt, buckets, currencies, onClose }: Props) {
  const router = useRouter();
  const eligible = buckets.filter((b) => !b.is_archived && b.currency_code === debt.currencyCode);
  const [bucketId, setBucketId] = useState(eligible.length === 1 ? eligible[0].id : "");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const exp = currencies.get(debt.currencyCode)?.decimal_exponent ?? 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (principal.trim() === "" && interest.trim() === "" && fee.trim() === "") return setError("Enter at least one amount.");
    for (const v of [principal, interest, fee]) {
      if (v.trim() === "") continue;
      const problem = validateMoneyInput(v, exp);
      if (problem) return setError(problem);
    }
    setPending(true);
    try {
      await recordDebtPayment(createClient(), {
        liabilityId: debt.liabilityId,
        bucketId,
        principalAmount: principal.trim() || undefined,
        interestAmount: interest.trim() || undefined,
        feeAmount: fee.trim() || undefined,
        idempotencyKey: key,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not record this payment.");
      setPending(false);
    }
  }

  return (
    <Sheet title="Record Payment" subtitle={debt.name} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {eligible.length === 0 ? (
          <p className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">You need a {debt.currencyCode} cash account to record a payment. Add one on the Money page.</p>
        ) : (
          <>
            <FormField label="Paid from" htmlFor="pay-bucket">
              <Select id="pay-bucket" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {eligible.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency_code})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={`Toward the debt (${debt.currencyCode})`} htmlFor="pay-principal">
              <Input id="pay-principal" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Interest (optional)" htmlFor="pay-interest">
              <Input id="pay-interest" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Fees (optional)" htmlFor="pay-fee">
              <Input id="pay-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" />
            </FormField>
          </>
        )}
        <SheetError message={error} />
        <button type="submit" disabled={pending || !bucketId} className={primaryButtonClass}>
          {pending ? "Recording…" : "Record Payment"}
        </button>
      </form>
    </Sheet>
  );
}
