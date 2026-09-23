"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordDebtPayment } from "@/lib/domain/liabilities/repository";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface DebtPaymentFormProps {
  liabilities: LiabilitySummary[];
  buckets: CashBucket[];
}

/**
 * Principal, interest, and fee are three separate optional inputs —
 * matching record_debt_payment()'s compound-event design (up to three
 * financial_events, correctly classified, in one atomic operation). Same
 * currency only this phase, mirroring RecordRecoveryForm's approach.
 */
export function DebtPaymentForm({ liabilities, buckets }: DebtPaymentFormProps) {
  const router = useRouter();
  const [liabilityId, setLiabilityId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const selectedLiability = liabilities.find((l) => l.liabilityId === liabilityId);
  const matchingBuckets = selectedLiability
    ? buckets.filter((b) => b.currency_code === selectedLiability.currencyCode)
    : buckets;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await recordDebtPayment(supabase, {
        liabilityId,
        bucketId,
        principalAmount: principalAmount || undefined,
        interestAmount: interestAmount || undefined,
        feeAmount: feeAmount || undefined,
        idempotencyKey,
      });
      setPrincipalAmount("");
      setInterestAmount("");
      setFeeAmount("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Liability" htmlFor="payment-liability">
        <Select
          id="payment-liability"
          required
          value={liabilityId}
          onChange={(event) => {
            setLiabilityId(event.target.value);
            setBucketId("");
          }}
        >
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

      <FormField label="From bucket" htmlFor="payment-bucket">
        <Select id="payment-bucket" required value={bucketId} onChange={(event) => setBucketId(event.target.value)}>
          <option value="" disabled>
            Select
          </option>
          {matchingBuckets.map((bucket) => (
            <option key={bucket.id} value={bucket.id}>
              {bucket.name} ({bucket.currency_code})
            </option>
          ))}
        </Select>
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Principal (optional)" htmlFor="payment-principal">
          <Input
            id="payment-principal"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Interest (optional)" htmlFor="payment-interest">
          <Input
            id="payment-interest"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={interestAmount}
            onChange={(event) => setInterestAmount(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Fees (optional)" htmlFor="payment-fee">
          <Input
            id="payment-fee"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={feeAmount}
            onChange={(event) => setFeeAmount(event.target.value)}
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
        {pending ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
