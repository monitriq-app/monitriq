"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "decimal.js";
import { X, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordAssetSale } from "@/lib/domain/assets/repository";
import { assetDisplayConfig } from "@/lib/domain/assets/capabilities";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { AssetSummary } from "@/lib/domain/assets/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { Currency } from "@/lib/domain/currency/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";

interface SellAssetSheetProps {
  asset: AssetSummary;
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  onClose: () => void;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * Records that an already-completed sale happened — it does not decide
 * whether to sell ("should I sell this?" is a Decisions question, not an
 * Assets one) and it never recommends anything. Calls the one atomic,
 * SECURITY DEFINER `record_asset_sale()` RPC (P0-E4-S1) — see its own
 * migration comment for the full atomicity/security rationale. V1
 * requires the destination bucket's currency to exactly match the
 * asset's own currency (no cross-currency sale, no live FX guess), so
 * the bucket picker is pre-filtered to compatible buckets only rather
 * than showing incompatible ones as if they were valid choices.
 *
 * Primary labels are plain language (P0-E4-S2): "Sale Price" for gross
 * proceeds, "Money Received After Costs" for net proceeds, the asset's
 * own type-appropriate basis label ("What You Paid" / "Invested" / ...,
 * via `assetDisplayConfig()`) for cost basis, "Profit / Loss on Sale"
 * for realised gain/loss. "Capital Returned" — the split between capital
 * recovered and actual gain — is real, advanced detail, shown only
 * inside "More details" rather than forced into the primary flow.
 *
 * The preview shown before submission mirrors the EXACT same formula
 * the database itself enforces via generated columns (net proceeds −
 * basis at sale; capital returned = min(net, basis)) — purely for
 * immediate feedback; the authoritative figures always come from the
 * server response after submission, never from this preview. When the
 * asset has no recorded cost basis, no profit/loss is fabricated — it
 * reads "Not calculated," exactly matching what the database will
 * actually store (`basis_at_sale` null).
 */
export function SellAssetSheet({ asset, buckets, currencies, onClose }: SellAssetSheetProps) {
  const router = useRouter();
  const display = assetDisplayConfig(asset.assetType);
  const eligibleBuckets = useMemo(() => buckets.filter((b) => b.currency_code === asset.currencyCode && !b.is_archived), [buckets, asset.currencyCode]);

  const [grossProceeds, setGrossProceeds] = useState("");
  const [sellingCosts, setSellingCosts] = useState("");
  const [destinationBucketId, setDestinationBucketId] = useState(eligibleBuckets[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const gross = grossProceeds ? new Decimal(grossProceeds || 0) : null;
  const costs = new Decimal(sellingCosts || 0);
  const netProceeds = gross ? gross.minus(costs) : null;
  const basis = asset.costBasis !== null ? new Decimal(asset.costBasis) : null;
  const profitLoss = netProceeds && basis ? netProceeds.minus(basis) : null;
  const capitalReturned = netProceeds && basis ? Decimal.min(netProceeds, basis) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      await recordAssetSale(supabase, {
        assetId: asset.assetId,
        destinationBucketId,
        grossProceeds,
        sellingCosts: sellingCosts || undefined,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this sale.");
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
        aria-label={`Sell ${asset.name}`}
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-6 text-text-primary">Sell {asset.name}</h3>
            <p className="text-xs text-text-muted">Records a sale that already happened, in {asset.currencyCode}.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {eligibleBuckets.length === 0 ? (
          <p className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
            You need a {asset.currencyCode} account to receive the money — add one from Money first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Sale Price</label>
              <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={grossProceeds} onChange={(e) => setGrossProceeds(e.target.value)} placeholder="0.00" className="h-14 text-lg font-bold" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Selling Costs (optional)</label>
              <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={sellingCosts} onChange={(e) => setSellingCosts(e.target.value)} placeholder="0.00" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Add Money To</label>
              <Select required value={destinationBucketId} onChange={(e) => setDestinationBucketId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {eligibleBuckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency_code})
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Sale Date</label>
              <Input type="date" required value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>

            {gross && gross.greaterThan(0) ? (
              <div className="flex flex-col gap-1.5 rounded-xl bg-surface-strong p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Sale Price</span>
                  <span className="tabular-figures font-semibold text-text-primary">{fmt(gross.toString(), asset.currencyCode, currencies)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Selling Costs</span>
                  <span className="tabular-figures font-semibold text-text-primary">{fmt(costs.toString(), asset.currencyCode, currencies)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1.5">
                  <span className="font-medium text-text-primary">Money Received After Costs</span>
                  <span className="tabular-figures font-bold text-accent-primary">{fmt((netProceeds ?? gross).toString(), asset.currencyCode, currencies)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">{display.basisLabel}</span>
                  <span className="tabular-figures font-semibold text-text-primary">{basis ? fmt(basis.toString(), asset.currencyCode, currencies) : "Not set"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Profit / Loss on Sale</span>
                  <span className={`tabular-figures font-bold ${profitLoss && profitLoss.isNegative() ? "text-danger" : "text-accent-primary"}`}>
                    {profitLoss ? fmt(profitLoss.toString(), asset.currencyCode, currencies) : "Not calculated"}
                  </span>
                </div>
                {!basis ? (
                  <p className="flex items-start gap-1.5 pt-1 text-xs text-text-muted">
                    <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Add what you originally paid or invested to calculate this — it won&apos;t be invented as zero.
                  </p>
                ) : (
                  <div className="pt-1">
                    <MoreDetails label="More details">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">Capital Returned</span>
                        <span className="tabular-figures font-semibold text-text-primary">{capitalReturned ? fmt(capitalReturned.toString(), asset.currencyCode, currencies) : "Not calculated"}</span>
                      </div>
                    </MoreDetails>
                  </div>
                )}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={pending} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
              {pending ? "Recording…" : "Record Sale"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
