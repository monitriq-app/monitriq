"use client";

import { useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { AddCashBalanceForm } from "@/components/money/AddCashBalanceForm";
import { CreateBucketForm } from "@/components/money/CreateBucketForm";

interface ManageCashSectionProps {
  buckets: CashBucket[];
  currencies: Currency[];
  defaultCurrencyCode: string | null;
}

/**
 * Add Cash Balance / Create Cash Bucket, collapsed by default for a
 * populated user (P0-E3-S3 gap audit): the approved Money reference's
 * populated dashboard doesn't show either form permanently — its
 * screen prioritizes monitoring/activity, with cash-bucket management
 * reached through a disclosure, not two large always-visible forms
 * underneath the real dashboard. Both forms are exactly the same real
 * ones used before this pass (recordOpeningBalance/createBucket via the
 * canonical repository functions) — only their default visibility
 * changed, not their function. For a brand-new user with zero buckets,
 * `app/(app)/money/page.tsx` shows `AddCashBalanceForm` directly instead
 * of this collapsed wrapper — onboarding still gets the form up front.
 */
export function ManageCashSection({ buckets, currencies, defaultCurrencyCode }: ManageCashSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section id="create-bucket" className="scroll-mt-20 rounded-xl bg-surface-raised p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={expanded}>
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-accent-primary">
            <Plus size={16} aria-hidden="true" />
          </span>
          <span className="text-base font-semibold text-text-primary">Add cash or a new bucket</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-text-secondary transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {expanded ? (
        <div className="mt-4 flex flex-col gap-6 border-t border-border pt-4">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-secondary">Add Cash Balance</h3>
            <AddCashBalanceForm buckets={buckets} currencies={currencies} defaultCurrencyCode={defaultCurrencyCode} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-secondary">Create Cash Bucket</h3>
            <CreateBucketForm currencies={currencies} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
