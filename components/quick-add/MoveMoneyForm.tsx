"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, X, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordTransfer, recordFxTransfer } from "@/lib/domain/money/repository";
import type { CashBucket, BucketBalance } from "@/lib/domain/money/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SuccessPanel } from "@/components/quick-add/SuccessPanel";

interface MoveMoneyFormProps {
  buckets: CashBucket[];
  balances: BucketBalance[];
  onBack: () => void;
  onClose: () => void;
}

/**
 * Same-currency transfers use record_transfer(); cross-currency ones use
 * record_fx_transfer(), which requires the user's own two real amounts
 * (what left the source, what arrived at the destination) — Monatriq
 * never invents or fetches a market exchange rate and applies it
 * automatically (P0-E3-S3, "no exchange engine in the UI").
 */
export function MoveMoneyForm({ buckets, balances, onBack, onClose }: MoveMoneyFormProps) {
  const [sourceBucketId, setSourceBucketId] = useState("");
  const [destinationBucketId, setDestinationBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ eventId: string; message: string } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const source = buckets.find((b) => b.id === sourceBucketId);
  const destination = buckets.find((b) => b.id === destinationBucketId);
  const isCrossCurrency = Boolean(source && destination && source.currency_code !== destination.currency_code);
  const sourceBalance = balances.find((b) => b.bucketId === sourceBucketId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const financialEvent = isCrossCurrency
        ? await recordFxTransfer(supabase, {
            sourceBucketId,
            destinationBucketId,
            sourceAmount: amount,
            destinationAmount,
            description: note.trim() || undefined,
            idempotencyKey,
          })
        : await recordTransfer(supabase, {
            sourceBucketId,
            destinationBucketId,
            amount,
            description: note.trim() || undefined,
            idempotencyKey,
          });
      setResult({ eventId: financialEvent.id, message: `Moved ${source?.name} → ${destination?.name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move this money.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return <SuccessPanel eventId={result.eventId} message={result.message} onDone={onClose} />;
  }

  const header = (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Back">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Move Money</h3>
          <p className="text-xs text-focus">Between your own cash and savings accounts</p>
        </div>
      </div>
      <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Close">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );

  if (buckets.length < 2) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-sm text-text-muted">
          You need at least two cash buckets to move money between them. {buckets.length === 0 ? "Add one, then a second, from Money." : "Add one more cash bucket from Money first."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <div className="rounded-xl bg-surface-strong p-3">
            <label className="text-xs font-medium text-text-secondary">From</label>
            <Select
              required
              value={sourceBucketId}
              onChange={(e) => {
                setSourceBucketId(e.target.value);
                if (e.target.value === destinationBucketId) setDestinationBucketId("");
              }}
              className="mt-0.5 border-none bg-transparent p-0 text-base font-semibold text-text-primary"
            >
              <option value="" disabled>
                Select
              </option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency_code})
                </option>
              ))}
            </Select>
            {sourceBalance ? <p className="mt-0.5 text-xs text-text-muted">Available: {sourceBalance.amount}</p> : null}
          </div>

          <div className="rounded-xl bg-surface-strong p-3">
            <label className="text-xs font-medium text-text-secondary">To</label>
            <Select required value={destinationBucketId} onChange={(e) => setDestinationBucketId(e.target.value)} className="mt-0.5 border-none bg-transparent p-0 text-base font-semibold text-text-primary">
              <option value="" disabled>
                Select
              </option>
              {buckets
                .filter((b) => b.id !== sourceBucketId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency_code})
                  </option>
                ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">{isCrossCurrency ? `Amount sent (${source?.currency_code})` : "Amount"}</label>
          <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 text-lg font-bold" />
        </div>

        {isCrossCurrency ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">Amount received ({destination?.currency_code})</label>
            <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={destinationAmount} onChange={(e) => setDestinationAmount(e.target.value)} placeholder="0.00" className="h-14 text-lg font-bold" />
            <p className="mt-1 flex items-start gap-1.5 text-xs text-text-muted">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Enter the real amount that arrived — Monatriq never applies an exchange rate for you.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Note (optional)</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-focus/10 p-3 text-xs text-text-secondary">
          <Info size={16} className="mt-0.5 shrink-0 text-focus" aria-hidden="true" />
          <span>Transfers don&apos;t count as income or spending — they simply move cash between your own buckets.</span>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={pending || !sourceBucketId || !destinationBucketId || sourceBucketId === destinationBucketId} className="h-12 rounded-full bg-focus text-sm font-semibold text-background disabled:opacity-50">
          {pending ? "Moving…" : "Move Money"}
        </button>
      </form>
    </div>
  );
}
