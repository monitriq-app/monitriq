import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyActivityItem } from "@/lib/domain/money/types";

interface RecentActivityPreviewProps {
  activity: MoneyActivityItem[];
  currencies: Map<string, Currency>;
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

const TRANSFER_TYPES = new Set(["transfer", "fx_transfer"]);

/** Returns a fully-formed icon element (never a stored component reference), derived from the event's own type and the sign of its own recorded amount — never invented. */
function DirectionIcon({ eventType, isInflow }: { eventType: string; isInflow: boolean }) {
  if (eventType === "opening_balance") return <Wallet size={19} aria-hidden="true" />;
  if (TRANSFER_TYPES.has(eventType)) return <ArrowLeftRight size={19} aria-hidden="true" />;
  return isInflow ? <ArrowDownLeft size={19} aria-hidden="true" /> : <ArrowUpRight size={19} aria-hidden="true" />;
}

function dateLabel(occurredAt: string): string {
  const date = new Date(occurredAt);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return `Today, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Reads Money's canonical recent-activity model directly — real financial
 * events only. Goal allocations, Decision scenarios, and rule changes are
 * never shown here; they are not financial transactions. The row's
 * primary text is the event's own real `description` when the user
 * recorded one (matching the reference's specific per-transaction
 * titles), falling back to the event-type label when it wasn't. The
 * subline is the real occurredAt timestamp plus the event's own real
 * category code (received/spending), when one exists — the reference's
 * settlement-status caption ("Cleared", "Direct Payment") has no
 * Monatriq equivalent (events here are already-recorded, not pending) and
 * is not reproduced. The "View all activity" link lives in the section
 * header (`app/(app)/home/page.tsx`), matching the reference's own
 * placement, rather than repeated inside this card. The outer card has
 * no padding of its own — matching the reference exactly, where each
 * row carries its own full p-4 (16px) on every side and the card itself
 * is edge-to-edge (`overflow-hidden` on the rounded corners keeps the
 * first/last row's own padding from visually clashing with them).
 */
export function RecentActivityPreview({ activity, currencies }: RecentActivityPreviewProps) {
  if (activity.length === 0) {
    return <p className="text-text-muted">No activity yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl bg-surface-raised">
      <ul className="flex flex-col divide-y divide-border">
        {activity.slice(0, 6).map((item) => {
          const currency = currencies.get(item.currencyCode);
          const formatted = currency ? formatCurrencyAmount(item.amount, currency) : `${item.currencyCode} ${item.amount}`;
          const isInflow = Number(item.amount) > 0;
          const category = item.receivedCategoryCode ?? item.spendingCategoryCode;
          const title = item.description ?? EVENT_TYPE_LABELS[item.eventType] ?? item.eventType;
          return (
            <li key={item.movementId} className="flex items-center gap-3 p-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isInflow ? "bg-accent-primary/10 text-accent-primary" : "bg-surface-strong text-text-secondary"}`}
              >
                <DirectionIcon eventType={item.eventType} isInflow={isInflow} />
              </span>
              <span className="min-w-0 flex-1 text-base font-semibold text-text-primary">
                {title}
                {item.voidedAt ? <span className="ml-2 text-xs font-normal text-text-muted">(voided)</span> : null}
                <span className="block text-xs font-normal text-text-muted">
                  {dateLabel(item.occurredAt)}
                  {category ? ` • ${category}` : ""}
                </span>
              </span>
              <span className={`tabular-figures shrink-0 text-base font-semibold ${isInflow ? "text-accent-primary" : "text-text-primary"}`}>{formatted}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
