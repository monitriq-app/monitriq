"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, X, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordMoneyReceived } from "@/lib/domain/money/repository";
import { recordRecovery, getReceivableSummaries } from "@/lib/domain/receivables/repository";
import type { CashBucket, MoneyReceivedCategory } from "@/lib/domain/money/types";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SuccessPanel } from "@/components/quick-add/SuccessPanel";

interface MoneyReceivedFormProps {
  buckets: CashBucket[];
  categories: MoneyReceivedCategory[];
  onBack: () => void;
  onClose: () => void;
}

/**
 * "Receivable Recovery" and "Asset Sale" are not generic categories here
 * even though money_received_categories technically has rows for both
 * (P0-E3-S3 gap analysis): both have a real, dedicated, linked domain
 * mutation instead (recordRecovery / record_asset_sale), so the generic
 * category path never touches those tables at all. Selecting either
 * switches this form's mode instead of setting a plain categoryCode.
 *
 * Asset Sale specifically does NOT get a form here (P0-E4-S1) — Assets
 * owns the sale workflow (gross proceeds, selling costs, cost basis, and
 * realised gain/loss are Assets-domain facts this generic Money form has
 * no business computing), so selecting it simply routes to the real
 * per-asset Sell Asset action on /assets rather than duplicating that
 * workflow here.
 */
const GENERIC_SOURCES = ["business_income", "salary", "freelance_contract", "investment_income", "gift", "refund", "other"];

type Mode = "generic" | "receivable_recovery" | "asset_sale";

export function MoneyReceivedForm({ buckets, categories, onBack, onClose }: MoneyReceivedFormProps) {
  const [mode, setMode] = useState<Mode>("generic");
  const [categoryCode, setCategoryCode] = useState("");
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receivableId, setReceivableId] = useState("");
  const [receivables, setReceivables] = useState<ReceivableSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ eventId: string; message: string } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const genericCategories = categories.filter((c) => GENERIC_SOURCES.includes(c.code));
  const receivablesLoading = mode === "receivable_recovery" && receivables === null;

  useEffect(() => {
    if (mode !== "receivable_recovery" || receivables !== null) return;
    const supabase = createClient();
    getReceivableSummaries(supabase)
      .then((rows) => setReceivables(rows.filter((r) => !r.isArchived && Number(r.outstandingAmount) > 0)))
      .catch(() => setReceivables([]));
  }, [mode, receivables]);

  const selectedReceivable = receivables?.find((r) => r.receivableId === receivableId) ?? null;
  const eligibleBucketsForReceivable = selectedReceivable ? buckets.filter((b) => b.currency_code === selectedReceivable.currencyCode) : [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      if (mode === "receivable_recovery") {
        if (!selectedReceivable) throw new Error("Select which receivable this payment recovers.");
        const financialEvent = await recordRecovery(supabase, {
          receivableId: selectedReceivable.receivableId,
          bucketId,
          amount,
          description: description.trim() || undefined,
          idempotencyKey,
        });
        setResult({ eventId: financialEvent.id, message: `Recovered from ${selectedReceivable.name}` });
      } else {
        const financialEvent = await recordMoneyReceived(supabase, {
          bucketId,
          amount,
          categoryCode,
          description: description.trim() || undefined,
          idempotencyKey,
        });
        const categoryLabel = genericCategories.find((c) => c.code === categoryCode)?.display_name ?? "Money received";
        setResult({ eventId: financialEvent.id, message: categoryLabel });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return <SuccessPanel eventId={result.eventId} message={result.message} onDone={onClose} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Back">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Money Received</h3>
            <p className="text-xs text-accent-primary">Money entered your finances</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-text-muted">
          You need a cash bucket first.{" "}
          <Link href="/money#create-bucket" onClick={onClose} className="text-accent-primary underline">
            Add Cash Balance
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Source</label>
            <div className="flex flex-wrap gap-2">
              {genericCategories.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setMode("generic");
                    setCategoryCode(c.code);
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${mode === "generic" && categoryCode === c.code ? "border border-accent-primary/30 bg-accent-primary/20 font-medium text-accent-primary" : "bg-surface-strong text-text-secondary"}`}
                >
                  {c.display_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode("receivable_recovery")}
                className={`rounded-full px-3 py-1.5 text-sm ${mode === "receivable_recovery" ? "border border-accent-primary/30 bg-accent-primary/20 font-medium text-accent-primary" : "bg-surface-strong text-text-secondary"}`}
              >
                Receivable Recovery
              </button>
              <button
                type="button"
                onClick={() => setMode("asset_sale")}
                className={`rounded-full px-3 py-1.5 text-sm ${mode === "asset_sale" ? "border border-attention/30 bg-attention/20 font-medium text-attention" : "bg-surface-strong text-text-secondary"}`}
              >
                Asset Sale
              </button>
            </div>
          </div>

          {mode === "asset_sale" ? (
            <div className="flex items-start gap-2.5 rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
              <Info size={16} className="mt-0.5 shrink-0 text-attention" aria-hidden="true" />
              <span>
                Sales are recorded from the asset itself, so the sale price, costs, and profit or loss stay clear. Open the asset in Assets and choose Sell.{" "}
                <Link href="/assets" onClick={onClose} className="text-accent-primary underline">
                  Go to Assets
                </Link>
                .
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">Amount</label>
                <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 text-lg font-bold" />
              </div>

              {mode === "receivable_recovery" ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Which receivable?</label>
                  {receivablesLoading ? (
                    <p className="text-sm text-text-muted">Loading your receivables…</p>
                  ) : receivables && receivables.length === 0 ? (
                    <p className="text-sm text-text-muted">
                      No outstanding receivables yet.{" "}
                      <Link href="/receivables" onClick={onClose} className="text-accent-primary underline">
                        Add one
                      </Link>
                      .
                    </p>
                  ) : (
                    <Select
                      required
                      value={receivableId}
                      onChange={(e) => {
                        setReceivableId(e.target.value);
                        setBucketId("");
                      }}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {receivables?.map((r) => (
                        <option key={r.receivableId} value={r.receivableId}>
                          {r.name} ({r.currencyCode} {r.outstandingAmount} outstanding)
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Received Into</label>
                <Select required value={bucketId} onChange={(e) => setBucketId(e.target.value)} disabled={mode === "receivable_recovery" && !selectedReceivable}>
                  <option value="" disabled>
                    Select
                  </option>
                  {(mode === "receivable_recovery" ? eligibleBucketsForReceivable : buckets).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.currency_code})
                    </option>
                  ))}
                </Select>
                {mode === "receivable_recovery" && selectedReceivable && eligibleBucketsForReceivable.length === 0 ? (
                  <p className="text-xs text-danger">No {selectedReceivable.currencyCode} account exists yet to receive this recovery.</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">Note (optional)</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={pending || (mode === "generic" && !categoryCode) || (mode === "receivable_recovery" && !selectedReceivable)}
                className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50"
              >
                {pending ? "Recording…" : "Record Money In"}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
