import { formatCurrencyAmount } from "@/lib/domain/money/format";
import type { BucketBalance, CashBucket, Currency } from "@/lib/domain/money/types";

interface BucketListProps {
  buckets: CashBucket[];
  balances: BucketBalance[];
  currencies: Map<string, Currency>;
}

export function BucketList({ buckets, balances, currencies }: BucketListProps) {
  if (buckets.length === 0) {
    return <p className="text-text-muted">No cash buckets yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {buckets.map((bucket) => {
        const balance = balances.find((b) => b.bucketId === bucket.id);
        const currency = currencies.get(bucket.currency_code);
        const display =
          balance && currency
            ? formatCurrencyAmount(balance.amount, currency)
            : currency
              ? formatCurrencyAmount("0", currency)
              : bucket.currency_code;

        return (
          <li key={bucket.id} className="flex items-center justify-between py-2">
            <span className="text-text-primary">
              {bucket.name}
              {bucket.is_archived ? <span className="ml-2 text-text-muted">(archived)</span> : null}
            </span>
            <span className="tabular-figures text-text-secondary">{display}</span>
          </li>
        );
      })}
    </ul>
  );
}
