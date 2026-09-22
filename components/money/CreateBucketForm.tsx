"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBucket } from "@/lib/domain/money/repository";
import { BUCKET_TYPE_OPTIONS } from "@/lib/domain/money/bucket-types";
import type { Currency, BucketType } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateBucketFormProps {
  currencies: Currency[];
}

export function CreateBucketForm({ currencies }: CreateBucketFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [bucketType, setBucketType] = useState<BucketType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createBucket(supabase, {
        name: name.trim(),
        currencyCode,
        bucketType: bucketType as BucketType,
      });
      setName("");
      setCurrencyCode("");
      setBucketType("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create bucket.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3" noValidate>
      <FormField label="Name" htmlFor="bucket-name">
        <Input
          id="bucket-name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Main account"
        />
      </FormField>
      <FormField label="Currency" htmlFor="bucket-currency">
        <Select
          id="bucket-currency"
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
      <FormField label="Type" htmlFor="bucket-type">
        <Select
          id="bucket-type"
          required
          value={bucketType}
          onChange={(event) => setBucketType(event.target.value as BucketType)}
        >
          <option value="" disabled>
            Select
          </option>
          {BUCKET_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add bucket"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger sm:basis-full">
          {error}
        </p>
      ) : null}
    </form>
  );
}
