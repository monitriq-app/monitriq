"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createAsset } from "@/lib/domain/assets/repository";
import type { AssetType, AssetTypeCode } from "@/lib/domain/assets/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface AddAssetFormProps {
  assetTypes: AssetType[];
  currencies: Currency[];
}

/**
 * The "Add Asset" foundation form (P0-E2-S3) — deliberately does not
 * collect subtype-specific fields (no vehicle mileage, no property
 * address). Recording cost basis or a current estimate here does not
 * move cash — see create_asset() in the migration, which never touches
 * financial_events/cash_movements.
 */
export function AddAssetForm({ assetTypes, currencies }: AddAssetFormProps) {
  const router = useRouter();
  const [assetType, setAssetType] = useState<AssetTypeCode | "">("");
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [quickSaleEstimate, setQuickSaleEstimate] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createAsset(supabase, {
        assetType: assetType as AssetTypeCode,
        name: name.trim(),
        currencyCode,
        acquiredAt: acquiredAt ? new Date(acquiredAt).toISOString() : undefined,
        initialBasisAmount: costBasis || undefined,
        estimatedCurrentValue: currentValue || undefined,
        quickSaleEstimate: quickSaleEstimate || undefined,
        targetValue: targetValue || undefined,
      });
      setAssetType("");
      setName("");
      setCurrencyCode("");
      setCostBasis("");
      setCurrentValue("");
      setQuickSaleEstimate("");
      setTargetValue("");
      setAcquiredAt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create asset.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="asset-name">
          <Input
            id="asset-name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Rental property"
          />
        </FormField>
        <FormField label="Type" htmlFor="asset-type">
          <Select
            id="asset-type"
            required
            value={assetType}
            onChange={(event) => setAssetType(event.target.value as AssetTypeCode)}
          >
            <option value="" disabled>
              Select
            </option>
            {assetTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.display_name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Currency" htmlFor="asset-currency">
          <Select
            id="asset-currency"
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
        <FormField label="Acquired (optional)" htmlFor="asset-acquired">
          <Input
            id="asset-acquired"
            type="date"
            value={acquiredAt}
            onChange={(event) => setAcquiredAt(event.target.value)}
          />
        </FormField>
        <FormField label="Cost basis (optional)" htmlFor="asset-basis">
          <Input
            id="asset-basis"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={costBasis}
            onChange={(event) => setCostBasis(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Current estimated value (optional)" htmlFor="asset-current-value">
          <Input
            id="asset-current-value"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={currentValue}
            onChange={(event) => setCurrentValue(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Quick-sale estimate (optional)" htmlFor="asset-quick-sale">
          <Input
            id="asset-quick-sale"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={quickSaleEstimate}
            onChange={(event) => setQuickSaleEstimate(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Target value (optional)" htmlFor="asset-target-value">
          <Input
            id="asset-target-value"
            inputMode="decimal"
            pattern="^\d+(\.\d+)?$"
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
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
        {pending ? "Adding…" : "Add asset"}
      </Button>
    </form>
  );
}
