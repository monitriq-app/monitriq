import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { BucketShortfall } from "@/lib/domain/goals/types";

interface ShortfallBannerProps {
  shortfalls: BucketShortfall[];
  currencies: Map<string, Currency>;
}

/**
 * Reads goal_bucket_shortfalls() — surfaces buckets whose allocated total
 * now exceeds their actual cash balance (money spent/moved elsewhere after
 * being allocated). Allocations are never silently rewritten to hide this.
 */
export function ShortfallBanner({ shortfalls, currencies }: ShortfallBannerProps) {
  const withShortfall = shortfalls.filter((s) => Number(s.shortfall) > 0);
  if (withShortfall.length === 0) return null;

  return (
    <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
      <p className="font-medium text-danger">Allocation shortfall</p>
      <ul className="mt-2 flex flex-col gap-1">
        {withShortfall.map((s) => {
          const currency = currencies.get(s.currencyCode);
          const fmt = (v: string) => (currency ? formatCurrencyAmount(v, currency) : `${s.currencyCode} ${v}`);
          return (
            <li key={s.bucketId} className="text-text-secondary">
              {s.bucketName}: {fmt(s.allocatedTotal)} allocated but only {fmt(s.balance)} available — short by{" "}
              {fmt(s.shortfall)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
