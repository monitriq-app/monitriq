"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordRecovery } from "@/lib/domain/receivables/repository";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface RecordRecoveryFormProps {
  receivables: ReceivableSummary[];
  buckets: CashBucket[];
}

/**
 * Same-currency only this phase — the bucket list is filtered to the
 * selected receivable's native currency so a mismatched choice isn't even
 * offered (the database rejects it regardless — see
 * record_receivable_recovery() — this is a UX convenience, not the
 * enforcement boundary).
 */
export function RecordRecoveryForm({ receivables, buckets }: RecordRecoveryFormProps) {
  const router = useRouter();
  const [receivableId, setReceivableId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const selectedReceivable = receivables.find((r) => r.receivableId === receivableId);
  const matchingBuckets = selectedReceivable
    ? buckets.filter((b) => b.currency_code === selectedReceivable.currencyCode)
    : buckets;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await recordRecovery(supabase, { receivableId, bucketId, amount, idempotencyKey });
      setAmount("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this recovery.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Receivable" htmlFor="recovery-receivable">
        <Select
          id="recovery-receivable"
          required
          value={receivableId}
          onChange={(event) => {
            setReceivableId(event.target.value);
            setBucketId("");
          }}
        >
          <option value="" disabled>
            Select
          </option>
          {receivables.map((receivable) => (
            <option key={receivable.receivableId} value={receivable.receivableId}>
              {receivable.name} ({receivable.currencyCode})
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Into bucket" htmlFor="recovery-bucket">
        <Select id="recovery-bucket" required value={bucketId} onChange={(event) => setBucketId(event.target.value)}>
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

      <FormField label="Amount recovered" htmlFor="recovery-amount">
        <Input
          id="recovery-amount"
          required
          inputMode="decimal"
          pattern="^\d+(\.\d+)?$"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
        />
      </FormField>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record recovery"}
      </Button>
    </form>
  );
}
