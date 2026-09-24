import Link from "next/link";
import { MONEY_PERIOD_OPTIONS, type MoneyPeriodKey } from "@/lib/utils/period-range";

/**
 * Plain links that update the page's own `?period=` search param — no
 * client state needed, since switching periods is just a navigation to
 * the same route with a different query string; the server page re-runs
 * every canonical Money read with the newly resolved [start, end] dates.
 */
export function PeriodSelector({ active }: { active: MoneyPeriodKey }) {
  return (
    <div className="flex rounded-full bg-surface-raised p-1">
      {MONEY_PERIOD_OPTIONS.map((option) => (
        <Link
          key={option.value}
          href={option.value === "month" ? "/money" : `/money?period=${option.value}`}
          className={`flex-1 rounded-full py-1.5 text-center text-[13px] font-semibold transition-colors ${
            active === option.value ? "bg-surface-strong text-accent-primary shadow-sm" : "text-text-secondary"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
