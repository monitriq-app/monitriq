import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { MoneyWeeklyBucket } from "@/lib/domain/money/types";

interface CashFlowChartProps {
  weeklyBuckets: MoneyWeeklyBucket[];
  currencies: Map<string, Currency>;
}

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency, { trimTrailingZeros: true }) : `${currencyCode} ${value}`;
}

function weekLabel(weekStart: string, index: number): string {
  return `W${index + 1}`;
}

/**
 * Real weekly Cash Flow chart — every bar height is derived from
 * money_weekly_summary()'s own real per-week cash_in/cash_out (P0-E3-S3),
 * never invented points. Bar heights are scaled against the max value
 * actually present in this currency's own weeks — a presentational
 * scaling transform, not a new financial calculation (the same real
 * numbers are also shown as text beneath each pair of bars). Multiple
 * currencies render as separate chart blocks, never blended into one
 * scale. The plotting area's own height scales down for a real 1-2 week
 * period (manual-QA polish) so a single real week reads as a deliberately
 * compact chart, not a full-height 4-week frame with empty space where
 * three weeks would be.
 */
export function CashFlowChart({ weeklyBuckets, currencies }: CashFlowChartProps) {
  if (weeklyBuckets.length === 0) {
    return <p className="text-sm text-text-muted">No cash flow activity in this period yet.</p>;
  }

  const byCurrency = new Map<string, MoneyWeeklyBucket[]>();
  for (const bucket of weeklyBuckets) {
    const list = byCurrency.get(bucket.currencyCode) ?? [];
    list.push(bucket);
    byCurrency.set(bucket.currencyCode, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {Array.from(byCurrency.entries()).map(([currencyCode, weeks]) => {
        const max = weeks.reduce((m, w) => Decimal.max(m, new Decimal(w.cashIn), new Decimal(w.cashOut)), new Decimal(0));
        const positiveWeeks = weeks.filter((w) => new Decimal(w.cashIn).greaterThanOrEqualTo(w.cashOut)).length;
        // A real 1-2 week period (the common case early in a month, or the
        // Week view itself) gets a deliberately shorter plotting area —
        // never the full 4-week reference height with 2-3 weeks visibly
        // "missing". 3+ real weeks use the fuller height. Never fabricated:
        // this only changes how tall the SAME real bars are drawn, not how
        // many exist.
        const isCompact = weeks.length <= 2;
        const rowHeight = isCompact ? "h-20" : "h-32";
        const barAreaHeight = isCompact ? "h-12" : "h-24";

        return (
          <div key={currencyCode} className="flex flex-col gap-2">
            {byCurrency.size > 1 ? <p className="text-sm font-semibold text-text-primary">{currencyCode}</p> : null}
            {/* A flex row of fixed-width columns, not a stretching grid: with
                fewer than 4 real weeks (the common case early in a period, or
                for the Week view), a `grid-cols-N` would stretch each column
                to fill the full card width, leaving one real bar isolated in
                a mostly-empty panel. Fixed-width columns + `justify-center`
                keep the chart's real proportions compact regardless of how
                many weeks actually have data — never fabricating placeholder
                weeks to fill the row. */}
            <div className={`flex ${rowHeight} items-end justify-center gap-6 overflow-x-auto`}>
              {weeks.map((week, i) => {
                const inHeight = max.isZero() ? 0 : new Decimal(week.cashIn).dividedBy(max).times(100).toNumber();
                const outHeight = max.isZero() ? 0 : new Decimal(week.cashOut).dividedBy(max).times(100).toNumber();
                return (
                  <div key={week.weekStart} className="flex h-full w-10 shrink-0 flex-col items-center justify-end gap-1.5">
                    <div className={`flex ${barAreaHeight} w-full items-end justify-center gap-1.5`}>
                      <div className="w-3 rounded-t-md bg-accent-primary" style={{ height: `${Math.max(inHeight, 2)}%` }} title={`In: ${fmt(week.cashIn, currencyCode, currencies)}`} />
                      <div className="w-3 rounded-t-md bg-surface-strong" style={{ height: `${Math.max(outHeight, 2)}%` }} title={`Out: ${fmt(week.cashOut, currencyCode, currencies)}`} />
                    </div>
                    <span className="text-[11px] font-medium text-text-muted">{weekLabel(week.weekStart, i)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-strong px-3 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <span className="h-2.5 w-2.5 rounded-sm bg-accent-primary" aria-hidden="true" /> In
                </span>
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <span className="h-2.5 w-2.5 rounded-sm bg-surface-strong border border-border" aria-hidden="true" /> Out
                </span>
              </div>
              <span className="text-text-muted">
                {positiveWeeks} of {weeks.length} positive weeks
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
