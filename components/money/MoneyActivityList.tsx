"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket, MoneyActivityItem, MoneyReceivedCategory, MoneySpendingCategory } from "@/lib/domain/money/types";

interface MoneyActivityListProps {
  activity: MoneyActivityItem[];
  buckets: CashBucket[];
  currencies: Map<string, Currency>;
  receivedCategories: MoneyReceivedCategory[];
  spendingCategories: MoneySpendingCategory[];
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  opening_balance: "Opening Balance",
  money_received: "Money Received",
  money_spent: "Money Spent",
  transfer: "Transfer",
  fx_transfer: "FX Transfer",
  receivable_recovery: "Receivable Recovery",
  debt_principal_payment: "Debt Payment",
  debt_interest: "Debt Interest",
  debt_fee: "Debt Fee",
  loan_proceeds: "Loan Proceeds",
};

type FilterKey = "all" | "received" | "spent" | "transfers";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "received", label: "Received" },
  { key: "spent", label: "Spent" },
  { key: "transfers", label: "Transfers" },
];

/** Filters by the event's own real cash_flow_class — never re-derived from event_type/category, and never mutates the underlying activity list. */
function matchesFilter(item: MoneyActivityItem, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "received") return item.cashFlowClass === "income" || item.cashFlowClass === "other_inflow";
  if (filter === "spent") return item.cashFlowClass === "expense" || item.cashFlowClass === "other_outflow";
  return item.cashFlowClass === "transfer";
}

function DirectionIcon({ eventType, isInflow }: { eventType: string; isInflow: boolean }) {
  if (eventType === "opening_balance") return <Wallet size={17} aria-hidden="true" />;
  if (eventType === "transfer" || eventType === "fx_transfer") return <ArrowLeftRight size={17} aria-hidden="true" />;
  return isInflow ? <ArrowDownLeft size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />;
}

function dateLabel(occurredAt: string): string {
  const date = new Date(occurredAt);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Real canonical Money activity only (money_recent_activity()) — one
 * contained divided list, matching the reference's own divided-list
 * treatment for Activity (unlike Where Your Capital Lives on Home, which
 * deliberately isn't divided — see that component's own note). Filters
 * classify by the event's own real `cashFlowClass`, never a client-side
 * guess. `opening_balance` rows are always labeled "Opening Balance" —
 * never folded into "Money Received" even when shown under the Received
 * filter's broader income/other_inflow net (opening_balance itself has
 * cash_flow_class = 'opening_balance', which matches neither 'income'
 * nor 'other_inflow', so it never appears under Received at all; it only
 * ever shows under All, correctly labeled).
 */
export function MoneyActivityList({ activity, buckets, currencies, receivedCategories, spendingCategories }: MoneyActivityListProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const bucketsById = new Map(buckets.map((b) => [b.id, b]));
  const receivedByCode = new Map(receivedCategories.map((c) => [c.code, c]));
  const spendingByCode = new Map(spendingCategories.map((c) => [c.code, c]));

  const filtered = activity.filter((item) => matchesFilter(item, filter));

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
              filter === f.key ? "bg-accent-primary text-background" : "bg-surface-strong text-text-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted">No activity for this filter yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface-raised">
          <ul className="flex flex-col divide-y divide-border">
            {filtered.map((item) => {
              const bucket = bucketsById.get(item.bucketId);
              const category = item.receivedCategoryCode ? receivedByCode.get(item.receivedCategoryCode) : item.spendingCategoryCode ? spendingByCode.get(item.spendingCategoryCode) : null;
              const currency = currencies.get(item.currencyCode);
              const formatted = currency ? formatCurrencyAmount(item.amount, currency) : `${item.currencyCode} ${item.amount}`;
              const isInflow = Number(item.amount) > 0;
              const isTransfer = item.eventType === "transfer" || item.eventType === "fx_transfer";
              const title = item.description ?? EVENT_TYPE_LABELS[item.eventType] ?? item.eventType;
              const subline = [dateLabel(item.occurredAt), category?.display_name ?? (item.eventType !== "money_received" && item.eventType !== "money_spent" ? EVENT_TYPE_LABELS[item.eventType] : null)]
                .filter(Boolean)
                .join(" · ");

              return (
                <li key={item.movementId} className="flex items-center gap-3 p-3.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isTransfer ? "bg-focus/10 text-focus" : isInflow ? "bg-accent-primary/10 text-accent-primary" : "bg-surface-strong text-text-secondary"
                    }`}
                  >
                    <DirectionIcon eventType={item.eventType} isInflow={isInflow} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-text-primary">
                      {title}
                      {item.voidedAt ? <span className="ml-2 text-xs font-normal text-text-muted">(voided)</span> : null}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {subline}
                      {/* Quiet secondary metadata, not a badge — the title and
                          amount stay the visually dominant elements on this
                          row (manual-QA polish: previously a bg-filled pill,
                          competing with the real content for attention). */}
                      {isTransfer ? <span className="text-text-muted/70"> · Internal transfer, excluded from In/Out</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`tabular-figures block text-base font-semibold ${isTransfer ? "text-focus" : isInflow ? "text-accent-primary" : "text-text-primary"}`}>{formatted}</span>
                    {bucket ? <span className="block text-[11px] text-text-muted">{bucket.name}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
