"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordValuation, recordBasisEvent, updateAsset } from "@/lib/domain/assets/repository";
import { ASSET_STATUS_OPTIONS } from "@/lib/domain/assets/asset-status";
import { assetCapabilities, assetDisplayConfig } from "@/lib/domain/assets/capabilities";
import type { AssetSummary, AssetStatusCode, ValuationType } from "@/lib/domain/assets/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { Currency } from "@/lib/domain/currency/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SellAssetSheet } from "@/components/assets/SellAssetSheet";

interface AssetActionSheetProps {
  asset: AssetSummary;
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  onClose: () => void;
}

/**
 * One shared sheet for every real per-asset mutation Monitriq's Assets
 * domain actually supports — but its COMPOSITION is dynamic, not
 * universal: a generic section (valuation update, archive) every asset
 * type gets, plus subtype sections gated by `assetCapabilities(asset.
 * assetType)` (P0-E3-S4R). Before this remediation, the vehicle status
 * selector and "Record a repair / improvement cost" form rendered
 * unconditionally for every asset type — a Financial Investment could
 * show "Ready to List" — because nothing here ever branched on
 * `asset.assetType`. See docs/reports/
 * P0-E3-S4R-asset-subtype-behavior-remediation.txt for the full root
 * cause and remediation. Real actions:
 * - Update a valuation: a NEW row in asset_valuations (append-only
 *   history, never overwrites the old value) via record_asset_valuation —
 *   an unrealized estimate change, never Money In/Out. Generic — every
 *   asset type gets this.
 * - Record a capital cost against basis: a NEW row in asset_basis_events
 *   (basis_event_type='capital_improvement') via
 *   record_asset_basis_event — increases the asset's real cost basis.
 *   This does NOT create a financial_events/cash_movements row and
 *   never touches Money. Gated by `capabilities.supportsCapitalImprovement`
 *   — absent for `financial_investment` (no canonical "contribution"
 *   operation exists yet; see capabilities.ts), present with
 *   subtype-appropriate copy (`capabilities.capitalImprovementCopy`) for
 *   every other type — never generic "repair" wording outside `vehicle`.
 * - Vehicle lifecycle status: gated by
 *   `capabilities.supportsVehicleStatus` — true only for `vehicle`.
 * - Archive: plain updateAsset() column update. Generic — every asset
 *   type gets this.
 */
export function AssetActionSheet({ asset, buckets, currencies, onClose }: AssetActionSheetProps) {
  const router = useRouter();
  const capabilities = assetCapabilities(asset.assetType);
  const display = assetDisplayConfig(asset.assetType);
  const valuationLabels: Record<ValuationType, string> = {
    estimated_current_value: display.currentValueLabel,
    quick_sale_estimate: display.quickSaleLabel,
    target_value: display.targetLabel,
  };
  const [valuationType, setValuationType] = useState<ValuationType>("estimated_current_value");
  const [valuationAmount, setValuationAmount] = useState("");
  const [repairAmount, setRepairAmount] = useState("");
  const [repairNote, setRepairNote] = useState("");
  const [status, setStatus] = useState<AssetStatusCode | "">(asset.statusCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showSellSheet, setShowSellSheet] = useState(false);

  async function handleValuationSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("valuation");
    try {
      const supabase = createClient();
      await recordValuation(supabase, { assetId: asset.assetId, valuationType, value: valuationAmount });
      setValuationAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this valuation.");
    } finally {
      setPending(null);
    }
  }

  async function handleRepairSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("repair");
    try {
      const supabase = createClient();
      await recordBasisEvent(supabase, {
        assetId: asset.assetId,
        basisEventType: "capital_improvement",
        amount: repairAmount,
        description: repairNote.trim() || undefined,
      });
      setRepairAmount("");
      setRepairNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this repair cost.");
    } finally {
      setPending(null);
    }
  }

  async function handleStatusChange(next: AssetStatusCode | "") {
    setError(null);
    setPending("status");
    try {
      const supabase = createClient();
      await updateAsset(supabase, asset.assetId, asset.assetType, { statusCode: next === "" ? null : next });
      setStatus(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setPending(null);
    }
  }

  async function handleArchiveToggle() {
    setError(null);
    setPending("archive");
    try {
      const supabase = createClient();
      await updateAsset(supabase, asset.assetId, asset.assetType, { isArchived: !asset.isArchived });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive this asset.");
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Manage ${asset.name}`}
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-6 text-text-primary">{asset.name}</h3>
            <p className="text-xs text-text-muted">Manage this asset</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {capabilities.supportsVehicleStatus ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Status</label>
              <Select value={status} onChange={(e) => handleStatusChange(e.target.value as AssetStatusCode | "")} disabled={pending === "status"}>
                <option value="">Status not set</option>
                {ASSET_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <form onSubmit={handleValuationSubmit} className="flex flex-col gap-2 rounded-xl bg-surface-strong p-3">
            <p className="text-sm font-semibold text-text-primary">Update a valuation</p>
            <p className="text-xs text-text-muted">Adds a new dated valuation — your prior estimates stay in this asset&apos;s history, never overwritten. This is an unrealized estimate, not a transaction.</p>
            <Select value={valuationType} onChange={(e) => setValuationType(e.target.value as ValuationType)}>
              {(Object.keys(valuationLabels) as ValuationType[]).map((t) => (
                <option key={t} value={t}>
                  {valuationLabels[t]}
                </option>
              ))}
            </Select>
            <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={valuationAmount} onChange={(e) => setValuationAmount(e.target.value)} placeholder="0.00" />
            <button type="submit" disabled={pending === "valuation"} className="h-11 rounded-lg bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
              {pending === "valuation" ? "Saving…" : "Save Valuation"}
            </button>
          </form>

          {capabilities.supportsCapitalImprovement && capabilities.capitalImprovementCopy ? (
            <form onSubmit={handleRepairSubmit} className="flex flex-col gap-2 rounded-xl bg-surface-strong p-3">
              <p className="text-sm font-semibold text-text-primary">{capabilities.capitalImprovementCopy.title}</p>
              <p className="text-xs text-text-muted">{capabilities.capitalImprovementCopy.description}</p>
              <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={repairAmount} onChange={(e) => setRepairAmount(e.target.value)} placeholder="0.00" />
              <Input value={repairNote} onChange={(e) => setRepairNote(e.target.value)} maxLength={500} placeholder="Note (optional)" />
              <button type="submit" disabled={pending === "repair"} className="h-11 rounded-lg bg-surface text-sm font-semibold text-text-primary disabled:opacity-50">
                {pending === "repair" ? "Saving…" : capabilities.capitalImprovementCopy.submitLabel}
              </button>
            </form>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          {capabilities.supportsSale && !asset.isArchived ? (
            <button
              type="button"
              onClick={() => setShowSellSheet(true)}
              className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-sm font-semibold text-accent-primary"
            >
              <Tag size={15} aria-hidden="true" />
              Sell Asset
            </button>
          ) : null}

          <button type="button" onClick={handleArchiveToggle} disabled={pending === "archive"} className="h-11 rounded-lg bg-surface-strong text-sm font-semibold text-text-secondary disabled:opacity-50">
            {pending === "archive" ? "Saving…" : asset.isArchived ? "Unarchive Asset" : "Archive Asset"}
          </button>
        </div>
      </div>

      {showSellSheet ? (
        <SellAssetSheet
          asset={asset}
          buckets={buckets}
          currencies={currencies}
          onClose={() => {
            setShowSellSheet(false);
            onClose();
          }}
        />
      ) : null}
    </div>
  );
}
