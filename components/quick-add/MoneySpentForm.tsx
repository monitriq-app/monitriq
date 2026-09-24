"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordMoneySpent } from "@/lib/domain/money/repository";
import { recordDebtPayment, getLiabilitySummaries } from "@/lib/domain/liabilities/repository";
import type { CashBucket, MoneySpendingCategory } from "@/lib/domain/money/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SuccessPanel } from "@/components/quick-add/SuccessPanel";

interface MoneySpentFormProps {
  buckets: CashBucket[];
  categories: MoneySpendingCategory[];
  onBack: () => void;
  onClose: () => void;
}

/**
 * "Debt Payment" is not a generic category here even though
 * money_spending_categories technically has a row for it (P0-E3-S3 gap
 * analysis): the real canonical debt-payment workflow (recordDebtPayment)
 * splits principal from interest/fees and decrements a specific
 * liability's outstanding balance — principal is cash-out but NOT an
 * expense (net-worth neutral), interest/fees ARE an expense. The generic
 * money_spent path has no way to express that split and would silently
 * lose it. Selecting "Debt Payment" switches this form's mode instead of
 * setting a plain categoryCode.
 */
const GENERIC_CATEGORIES = [
  "housing",
  "food",
  "transport_fuel",
  "vehicle_repair",
  "business_expense",
  "education",
  "healthcare",
  "subscriptions",
  "family",
  "entertainment",
  "travel",
  "professional_services",
  "other",
];

type Mode = "generic" | "debt_payment";

export function MoneySpentForm({ buckets, categories, onBack, onClose }: MoneySpentFormProps) {
  const [mode, setMode] = useState<Mode>("generic");
  const [categoryCode, setCategoryCode] = useState("");
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [liabilityId, setLiabilityId] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [liabilities, setLiabilities] = useState<LiabilitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ eventId: string; message: string } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const genericCategories = categories.filter((c) => GENERIC_CATEGORIES.includes(c.code));
  const liabilitiesLoading = mode === "debt_payment" && liabilities === null;

  useEffect(() => {
    if (mode !== "debt_payment" || liabilities !== null) return;
    const supabase = createClient();
    getLiabilitySummaries(supabase)
      .then((rows) => setLiabilities(rows.filter((l) => !l.isArchived && Number(l.outstandingPrincipal) > 0)))
      .catch(() => setLiabilities([]));
  }, [mode, liabilities]);

  const selectedLiability = liabilities?.find((l) => l.liabilityId === liabilityId) ?? null;
  const eligibleBucketsForLiability = selectedLiability ? buckets.filter((b) => b.currency_code === selectedLiability.currencyCode) : [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      if (mode === "debt_payment") {
        if (!selectedLiability) throw new Error("Select which debt this payment is for.");
        if (!principalAmount && !interestAmount && !feeAmount) throw new Error("Enter at least a principal, interest, or fee amount.");
        const financialEvent = await recordDebtPayment(supabase, {
          liabilityId: selectedLiability.liabilityId,
          bucketId,
          principalAmount: principalAmount || undefined,
          interestAmount: interestAmount || undefined,
          feeAmount: feeAmount || undefined,
          description: description.trim() || undefined,
          idempotencyKey,
        });
        setResult({ eventId: financialEvent.id, message: `Payment recorded on ${selectedLiability.name}` });
      } else {
        const financialEvent = await recordMoneySpent(supabase, {
          bucketId,
          amount,
          categoryCode,
          description: description.trim() || undefined,
          idempotencyKey,
        });
        const categoryLabel = genericCategories.find((c) => c.code === categoryCode)?.display_name ?? "Expense recorded";
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
            <h3 className="text-lg font-semibold text-text-primary">Money Spent</h3>
            <p className="text-xs text-text-muted">Money left your finances</p>
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
            <label className="text-xs font-medium text-text-secondary">Category</label>
            <div className="flex flex-wrap gap-2">
              {genericCategories.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setMode("generic");
                    setCategoryCode(c.code);
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${mode === "generic" && categoryCode === c.code ? "border border-attention/30 bg-attention/20 font-medium text-attention" : "bg-surface-strong text-text-secondary"}`}
                >
                  {c.display_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode("debt_payment")}
                className={`rounded-full px-3 py-1.5 text-sm ${mode === "debt_payment" ? "border border-attention/30 bg-attention/20 font-medium text-attention" : "bg-surface-strong text-text-secondary"}`}
              >
                Debt Payment
              </button>
            </div>
          </div>

          {mode === "debt_payment" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Which debt?</label>
                {liabilitiesLoading ? (
                  <p className="text-sm text-text-muted">Loading your debts…</p>
                ) : liabilities && liabilities.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    No outstanding debts yet.{" "}
                    <Link href="/liabilities" onClick={onClose} className="text-accent-primary underline">
                      Add one
                    </Link>
                    .
                  </p>
                ) : (
                  <Select
                    required
                    value={liabilityId}
                    onChange={(e) => {
                      setLiabilityId(e.target.value);
                      setBucketId("");
                    }}
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    {liabilities?.map((l) => (
                      <option key={l.liabilityId} value={l.liabilityId}>
                        {l.name} ({l.currencyCode} {l.outstandingPrincipal} outstanding)
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {selectedLiability ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text-secondary">Principal</label>
                    <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text-secondary">Interest</label>
                    <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={interestAmount} onChange={(e) => setInterestAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text-secondary">Fees</label>
                    <Input inputMode="decimal" pattern="^\d+(\.\d+)?$" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Amount</label>
              <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 text-lg font-bold" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Paid From</label>
            <Select required value={bucketId} onChange={(e) => setBucketId(e.target.value)} disabled={mode === "debt_payment" && !selectedLiability}>
              <option value="" disabled>
                Select
              </option>
              {(mode === "debt_payment" ? eligibleBucketsForLiability : buckets).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency_code})
                </option>
              ))}
            </Select>
            {mode === "debt_payment" && selectedLiability && eligibleBucketsForLiability.length === 0 ? (
              <p className="text-xs text-danger">No {selectedLiability.currencyCode} bucket exists yet to pay from.</p>
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
            disabled={pending || (mode === "generic" && !categoryCode) || (mode === "debt_payment" && !selectedLiability)}
            className="h-12 rounded-full bg-surface-strong text-sm font-semibold text-text-primary disabled:opacity-50"
          >
            {pending ? "Recording…" : "Record Expense"}
          </button>
        </form>
      )}
    </div>
  );
}
