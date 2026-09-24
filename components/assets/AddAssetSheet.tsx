"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createAsset, updateAsset } from "@/lib/domain/assets/repository";
import { assetCapabilities, assetCreationConfig } from "@/lib/domain/assets/capabilities";
import { ASSET_STATUS_OPTIONS } from "@/lib/domain/assets/asset-status";
import type { AssetType, AssetTypeCode, AssetStatusCode } from "@/lib/domain/assets/types";
import type { Currency } from "@/lib/domain/currency/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AssetTypeSelector } from "@/components/assets/AssetTypeSelector";

interface AddAssetSheetProps {
  assetTypes: AssetType[];
  currencies: Currency[];
  defaultCurrencyCode: string | null;
  onClose: () => void;
}

/**
 * Progressive disclosure, per the P0-E3-S4 brief: step 1 asks only Asset
 * Type / Name / Currency; step 2 shows the same real optional generic
 * fields every asset type actually supports (cost basis + up to three
 * valuations — the same fields `create_asset()` has always accepted),
 * but with labels/heading/helper copy that adapt per type via
 * `assetCreationConfig()` (P0-E3-S4R2) — a Vehicle and a Financial
 * Investment now read as genuinely different products, not the same
 * generic form with a different type tag on top. No new field was
 * invented for any type; only presentation changed.
 *
 * Vehicle Status is the one real exception: `assetCapabilities().
 * supportsVehicleStatus` gates an OPTIONAL status select in Step 2,
 * defaulting to "Status not set", using the exact same canonical
 * vehicle-lifecycle vocabulary Manage uses. `create_asset()` has no
 * status parameter (adding one would mean changing that atomic RPC's
 * signature — a schema change this remediation deliberately avoids, per
 * its own "prefer zero schema changes" instruction), so setting it is a
 * second, already-existing `updateAsset()` call made only after
 * `createAsset()` succeeds — reusing Manage's own mutation, never a
 * second status system. If that second call fails, the asset itself
 * still exists (createAsset succeeded); the error is reported honestly
 * and the sheet stays open rather than silently discarding the failure.
 * Switching away from Vehicle in Step 1 clears any chosen status
 * immediately, so an incompatible vehicle-only draft value can never
 * reach submission for another type.
 *
 * Recording an asset here never moves cash — see create_asset()'s own
 * comment; this represents an asset the user already owns, not a
 * cash-linked purchase (that distinction, and why "Buy Asset" isn't
 * implemented this phase, is documented in the P0-E3-S4 report's "Asset
 * Purchase" section).
 */
export function AddAssetSheet({ assetTypes, currencies, defaultCurrencyCode, onClose }: AddAssetSheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [assetType, setAssetType] = useState<AssetTypeCode | "">("");
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode ?? "");
  const [costBasis, setCostBasis] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [quickSaleEstimate, setQuickSaleEstimate] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState<AssetStatusCode | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const capabilities = assetType ? assetCapabilities(assetType) : null;
  const creationConfig = assetType ? assetCreationConfig(assetType) : null;

  function handleAssetTypeChange(next: AssetTypeCode) {
    setAssetType(next);
    // An incompatible vehicle-only draft value must never survive a
    // switch to another type — cleared immediately, not just on submit.
    if (!assetCapabilities(next).supportsVehicleStatus) {
      setVehicleStatus("");
    }
  }

  function handleStepOneSubmit(event: FormEvent) {
    event.preventDefault();
    setStep(2);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const asset = await createAsset(supabase, {
        assetType: assetType as AssetTypeCode,
        name: name.trim(),
        currencyCode,
        initialBasisAmount: costBasis || undefined,
        estimatedCurrentValue: currentValue || undefined,
        quickSaleEstimate: quickSaleEstimate || undefined,
        targetValue: targetValue || undefined,
      });

      if (vehicleStatus && capabilities?.supportsVehicleStatus) {
        try {
          await updateAsset(supabase, asset.id, "vehicle", { statusCode: vehicleStatus });
        } catch {
          setError(`"${name.trim()}" was added, but its status could not be saved — set it from Manage instead.`);
          router.refresh();
          return;
        }
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this asset.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add Asset"
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            {step === 2 ? (
              <button type="button" onClick={() => setStep(1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Back">
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
            ) : null}
            <div>
              <h3 className="text-lg font-semibold leading-6 text-text-primary">Add Tracked Asset</h3>
              <p className="text-xs text-text-muted">{step === 1 ? "Select asset type to adapt relevant fields." : `${creationConfig?.valuesHeading ?? "Asset values"} (optional)`}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {step === 1 ? (
          <form onSubmit={handleStepOneSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-text-secondary">Choose Asset Type</label>
              <AssetTypeSelector assetTypes={assetTypes} value={assetType} onChange={handleAssetTypeChange} />
              {creationConfig?.helperCopy ? <p className="px-0.5 text-xs text-text-muted">{creationConfig.helperCopy}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Name</label>
              <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family Land, Delivery Van" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Currency</label>
              <Select required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.display_name}
                  </option>
                ))}
              </Select>
            </div>
            <button type="submit" disabled={!assetType || !name.trim() || !currencyCode} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">{creationConfig?.basisLabel ?? "Cost Basis"} (optional)</label>
              <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={costBasis} onChange={(e) => setCostBasis(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">{creationConfig?.currentValueLabel ?? "Current Estimated Value"} (optional)</label>
              <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">{creationConfig?.quickSaleLabel ?? "Conservative Quick-Sale Value"} (optional)</label>
              <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={quickSaleEstimate} onChange={(e) => setQuickSaleEstimate(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">{creationConfig?.targetValueLabel ?? "Target Value"} (optional)</label>
              <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="0.00" />
            </div>

            {capabilities?.supportsVehicleStatus ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">Vehicle Status (optional)</label>
                <Select value={vehicleStatus} onChange={(e) => setVehicleStatus(e.target.value as AssetStatusCode | "")}>
                  <option value="">Status not set</option>
                  {ASSET_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={pending} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
              {pending ? "Adding…" : "Add Asset"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
