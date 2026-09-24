"use client";

import { useState } from "react";
import { Wallet, ChevronDown } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency, CurrencyAmount } from "@/lib/domain/currency/types";
import type { CashBucket, BucketBalance } from "@/lib/domain/money/types";

interface AvailableCashSectionProps {
  buckets: CashBucket[];
  balances: BucketBalance[];
  /** Real per-currency totals from money_currency_totals() — the canonical sum, never re-derived from individual bucket balances in the client. */
  currencyTotals: CurrencyAmount[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * Available Cash — every total and every bucket balance is read directly
 * from money_bucket_balances() (via `balances`, already fetched
 * server-side); no second UI balance is ever stored or computed here.
 * Multiple currencies never sum into one figure — each gets its own
 * headline total, matching the reference's single-currency composition
 * exactly when there's only one, and degrading honestly (one block per
 * currency) otherwise.
 */
export function AvailableCashSection({ buckets, balances, currencyTotals, currencies }: AvailableCashSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const activeBuckets = buckets.filter((b) => !b.is_archived);

  if (activeBuckets.length === 0) {
    return (
      <section className="rounded-xl bg-surface-raised p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Available Cash</p>
        <p className="mt-2 text-sm text-text-muted">No cash buckets yet — add one to start tracking your cash.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Available Cash</p>
          {currencyTotals.length === 1 ? (
            <p className="tabular-figures mt-0.5 text-[32px] font-bold leading-tight tracking-tight text-text-primary">
              {fmt(currencyTotals[0].amount, currencyTotals[0].currencyCode, currencies)}
            </p>
          ) : currencyTotals.length > 1 ? (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {currencyTotals.map((t) => (
                <li key={t.currencyCode} className="tabular-figures text-xl font-bold text-text-primary">
                  {fmt(t.amount, t.currencyCode, currencies)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tabular-figures mt-0.5 text-[32px] font-bold leading-tight tracking-tight text-text-muted">No balance yet</p>
          )}
          <p className="mt-0.5 text-xs text-text-muted">Across your tracked liquid balances</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-focus">
          <Wallet size={20} aria-hidden="true" />
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-lg bg-surface-strong p-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-focus" aria-hidden="true" />
          <span className="text-base font-semibold text-text-primary">
            View {activeBuckets.length} cash {activeBuckets.length === 1 ? "bucket" : "buckets"}
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-focus">
          {expanded ? "Hide" : "Details"}
          <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>

      {expanded ? (
        <div className="mt-2 flex flex-col gap-2">
          {activeBuckets.map((bucket) => {
            const balance = balances.find((b) => b.bucketId === bucket.id);
            return (
              <div key={bucket.id} className="flex items-center justify-between rounded-lg bg-surface-strong px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-text-primary">{bucket.name}</p>
                  <p className="text-xs text-text-muted">{bucket.currency_code}</p>
                </div>
                <span className="tabular-figures shrink-0 text-sm font-semibold text-text-primary">
                  {balance ? fmt(balance.amount, balance.currencyCode, currencies) : fmt("0", bucket.currency_code, currencies)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
