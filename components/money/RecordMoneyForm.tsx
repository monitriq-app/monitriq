"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordMoneyReceived, recordMoneySpent } from "@/lib/domain/money/repository";
import type { CashBucket, MoneyReceivedCategory, MoneySpendingCategory } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface RecordMoneyFormProps {
  buckets: CashBucket[];
  receivedCategories: MoneyReceivedCategory[];
  spendingCategories: MoneySpendingCategory[];
}

type Direction = "received" | "spent";

export function RecordMoneyForm({ buckets, receivedCategories, spendingCategories }: RecordMoneyFormProps) {
  const router = useRouter();
  const [direction, setDirection] = useState<Direction>("received");
  const [bucketId, setBucketId] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const categories = direction === "received" ? receivedCategories : spendingCategories;
  // Stable across retries of the SAME submission (double-click, a dropped
  // request the user resends) so they collapse into one event instead of
  // creating a duplicate — see record_money_received/spent's idempotency
  // handling in the migration. Rotated only after a successful submit, so
  // the next entry gets its own key.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const record = direction === "received" ? recordMoneyReceived : recordMoneySpent;
      await record(supabase, {
        bucketId,
        amount,
        categoryCode,
        description: description.trim() || undefined,
        idempotencyKey,
      });
      setAmount("");
      setDescription("");
      setCategoryCode("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex gap-4 text-sm text-text-secondary">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="direction"
            checked={direction === "received"}
            onChange={() => {
              setDirection("received");
              setCategoryCode("");
            }}
          />
          Money Received
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="direction"
            checked={direction === "spent"}
            onChange={() => {
              setDirection("spent");
              setCategoryCode("");
            }}
          />
          Money Spent
        </label>
      </div>

      <FormField label="Bucket" htmlFor="record-bucket">
        <Select id="record-bucket" required value={bucketId} onChange={(event) => setBucketId(event.target.value)}>
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

      <FormField label="Category" htmlFor="record-category">
        <Select
          id="record-category"
          required
          value={categoryCode}
          onChange={(event) => setCategoryCode(event.target.value)}
        >
          <option value="" disabled>
            Select
          </option>
          {categories.map((category) => (
            <option key={category.code} value={category.code}>
              {category.display_name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Amount" htmlFor="record-amount">
        <Input
          id="record-amount"
          required
          inputMode="decimal"
          pattern="^\d+(\.\d+)?$"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
        />
      </FormField>

      <FormField label="Description (optional)" htmlFor="record-description">
        <Input
          id="record-description"
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FormField>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : direction === "received" ? "Record money received" : "Record money spent"}
      </Button>
    </form>
  );
}
