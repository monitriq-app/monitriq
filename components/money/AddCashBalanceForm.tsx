"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBucket, recordOpeningBalance } from "@/lib/domain/money/repository";
import { BUCKET_TYPE_OPTIONS } from "@/lib/domain/money/bucket-types";
import type { Currency } from "@/lib/domain/currency/types";
import type { BucketType, CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface AddCashBalanceFormProps {
  buckets: CashBucket[];
  currencies: Currency[];
  defaultCurrencyCode?: string | null;
}

const NEW_BUCKET = "__new__";

/**
 * The canonical opening-balance entry point (P0-E3-S3): initial cash is
 * never recorded as Money Received (opening_balance is its own event
 * type/cash_flow_class, excluded from Income everywhere — see
 * record_opening_balance() in the migration). Lets the user either add
 * an opening balance to an existing bucket that hasn't been funded yet,
 * or create a brand-new bucket and fund it in the same action — the
 * primary first step for a user with no Money data at all.
 */
export function AddCashBalanceForm({ buckets, currencies, defaultCurrencyCode }: AddCashBalanceFormProps) {
  const router = useRouter();
  const [bucketId, setBucketId] = useState(buckets.length > 0 ? buckets[0].id : NEW_BUCKET);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketCurrency, setNewBucketCurrency] = useState(defaultCurrencyCode ?? "");
  const [newBucketType, setNewBucketType] = useState<BucketType | "">("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isNewBucket = bucketId === NEW_BUCKET;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      let targetBucketId = bucketId;
      if (isNewBucket) {
        const bucket = await createBucket(supabase, {
          name: newBucketName.trim(),
          currencyCode: newBucketCurrency,
          bucketType: newBucketType as BucketType,
        });
        targetBucketId = bucket.id;
      }
      await recordOpeningBalance(supabase, { bucketId: targetBucketId, amount });
      setAmount("");
      setNewBucketName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this cash balance.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <FormField label="Account" htmlFor="opening-bucket">
        <Select id="opening-bucket" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.currency_code})
            </option>
          ))}
          <option value={NEW_BUCKET}>+ Add a new account</option>
        </Select>
      </FormField>

      {isNewBucket ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Name" htmlFor="opening-new-name">
            <Input id="opening-new-name" required maxLength={100} value={newBucketName} onChange={(e) => setNewBucketName(e.target.value)} placeholder="Main account" />
          </FormField>
          <FormField label="Currency" htmlFor="opening-new-currency">
            <Select id="opening-new-currency" required value={newBucketCurrency} onChange={(e) => setNewBucketCurrency(e.target.value)}>
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
          <FormField label="Type" htmlFor="opening-new-type">
            <Select id="opening-new-type" required value={newBucketType} onChange={(e) => setNewBucketType(e.target.value as BucketType)}>
              <option value="" disabled>
                Select
              </option>
              {BUCKET_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      ) : null}

      <FormField label="Cash Balance" htmlFor="opening-amount">
        <Input id="opening-amount" required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </FormField>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add Cash Balance"}
      </Button>
    </form>
  );
}
