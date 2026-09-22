"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordTransfer, recordFxTransfer } from "@/lib/domain/money/repository";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface TransferFormProps {
  buckets: CashBucket[];
}

export function TransferForm({ buckets }: TransferFormProps) {
  const router = useRouter();
  const [sourceBucketId, setSourceBucketId] = useState("");
  const [destinationBucketId, setDestinationBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const source = buckets.find((b) => b.id === sourceBucketId);
  const destination = buckets.find((b) => b.id === destinationBucketId);
  const isCrossCurrency = Boolean(
    source && destination && source.currency_code !== destination.currency_code,
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      if (isCrossCurrency) {
        await recordFxTransfer(supabase, {
          sourceBucketId,
          destinationBucketId,
          sourceAmount: amount,
          destinationAmount,
          idempotencyKey,
        });
      } else {
        await recordTransfer(supabase, {
          sourceBucketId,
          destinationBucketId,
          amount,
          idempotencyKey,
        });
      }
      setAmount("");
      setDestinationAmount("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move this money.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="From" htmlFor="transfer-source">
        <Select
          id="transfer-source"
          required
          value={sourceBucketId}
          onChange={(event) => setSourceBucketId(event.target.value)}
        >
          <option value="" disabled>
            Select
          </option>
          {buckets.map((bucket) => (
            <option key={bucket.id} value={bucket.id}>
              {bucket.name} ({bucket.currency_code})
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="To" htmlFor="transfer-destination">
        <Select
          id="transfer-destination"
          required
          value={destinationBucketId}
          onChange={(event) => setDestinationBucketId(event.target.value)}
        >
          <option value="" disabled>
            Select
          </option>
          {buckets
            .filter((bucket) => bucket.id !== sourceBucketId)
            .map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name} ({bucket.currency_code})
              </option>
            ))}
        </Select>
      </FormField>

      <FormField
        label={isCrossCurrency ? `Amount sent (${source?.currency_code})` : "Amount"}
        htmlFor="transfer-amount"
      >
        <Input
          id="transfer-amount"
          required
          inputMode="decimal"
          pattern="^\d+(\.\d+)?$"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
        />
      </FormField>

      {isCrossCurrency ? (
        <FormField label={`Amount received (${destination?.currency_code})`} htmlFor="transfer-destination-amount">
          <Input
            id="transfer-destination-amount"
            required
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={destinationAmount}
            onChange={(event) => setDestinationAmount(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Moving…" : "Move money"}
      </Button>
    </form>
  );
}
