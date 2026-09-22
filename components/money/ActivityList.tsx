import { formatCurrencyAmount } from "@/lib/domain/money/format";
import type {
  CashBucket,
  Currency,
  MoneyActivityItem,
  MoneyReceivedCategory,
  MoneySpendingCategory,
} from "@/lib/domain/money/types";

interface ActivityListProps {
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
};

export function ActivityList({
  activity,
  buckets,
  currencies,
  receivedCategories,
  spendingCategories,
}: ActivityListProps) {
  if (activity.length === 0) {
    return <p className="text-text-muted">No activity yet.</p>;
  }

  const bucketsById = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  const receivedByCode = new Map(receivedCategories.map((category) => [category.code, category]));
  const spendingByCode = new Map(spendingCategories.map((category) => [category.code, category]));

  return (
    <ul className="flex flex-col divide-y divide-border">
      {activity.map((item) => {
        const bucket = bucketsById.get(item.bucketId);
        const currency = currencies.get(item.currencyCode);
        const category = item.receivedCategoryCode
          ? receivedByCode.get(item.receivedCategoryCode)
          : item.spendingCategoryCode
            ? spendingByCode.get(item.spendingCategoryCode)
            : null;
        const label = EVENT_TYPE_LABELS[item.eventType] ?? item.eventType;
        const date = new Date(item.occurredAt).toLocaleDateString();

        return (
          <li key={item.movementId} className="flex items-center justify-between gap-4 py-2">
            <span className="text-text-primary">
              {label}
              {category ? ` · ${category.display_name}` : ""}
              {bucket ? ` · ${bucket.name}` : ""}
              {item.voidedAt ? <span className="ml-2 text-text-muted">(voided)</span> : null}
              <span className="ml-2 text-text-muted">{date}</span>
            </span>
            <span className="tabular-figures text-text-secondary">
              {currency ? formatCurrencyAmount(item.amount, currency) : `${item.currencyCode} ${item.amount}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
