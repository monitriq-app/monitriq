"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordRecovery } from "@/lib/domain/receivables/repository";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Sheet, SheetError, primaryButtonClass } from "@/components/ui/Sheet";

interface Props {
  receivable: ReceivableSummary;
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  onClose: () => void;
}

/**
 * Record Recovery: the canonical record_receivable_recovery() — cash comes
 * into the chosen account and the amount owed goes down by the same
 * amount, in one operation. Net worth does not rise by this alone.
 */
export function RecordRecoverySheet({ receivable, buckets, currencies, onClose }: Props) {
  const router = useRouter();
  const eligible = buckets.filter((b) => !b.is_archived && b.currency_code === receivable.currencyCode);
  const [bucketId, setBucketId] = useState(eligible.length === 1 ? eligible[0].id : "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const exp = currencies.get(receivable.currencyCode)?.decimal_exponent ?? 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = validateMoneyInput(amount, exp);
    if (problem) return setError(problem);
    setPending(true);
    try {
      await recordRecovery(createClient(), { receivableId: receivable.receivableId, bucketId, amount: amount.trim(), idempotencyKey: key });
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not record this payment.");
      setPending(false);
    }
  }

  return (
    <Sheet title="Record Recovery" subtitle={receivable.name} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-text-secondary">Use this when you have actually been paid. The money is added to the account you choose and the amount owed goes down.</p>
        {eligible.length === 0 ? (
          <p className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">You need a {receivable.currencyCode} cash account to record this. Add one on the Money page.</p>
        ) : (
          <>
            <FormField label="Paid into which account?" htmlFor="rec-bucket">
              <Select id="rec-bucket" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {eligible.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency_code})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={`Amount received (${receivable.currencyCode})`} htmlFor="rec-amount">
              <Input id="rec-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
          </>
        )}
        <SheetError message={error} />
        <button type="submit" disabled={pending || !bucketId || amount.trim() === ""} className={primaryButtonClass}>
          {pending ? "Recording…" : "Record Recovery"}
        </button>
      </form>
    </Sheet>
  );
}
