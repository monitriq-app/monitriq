export type MoneyPeriodKey = "week" | "month" | "3m" | "year";

export const MONEY_PERIOD_OPTIONS: { value: MoneyPeriodKey; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "3m", label: "3M" },
  { value: "year", label: "Year" },
];

/** Y-M-D components of "now" in a given IANA timezone — never the server's local calendar day. */
function todayInTimezone(timezone: string, now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return { year, month, day };
}

function toDateString(year: number, month: number, day: number): string {
  // A plain UTC-anchored Date used purely as a calendar-arithmetic helper
  // (adding/subtracting days/months) — never a financial value, never
  // compared against a real instant/timezone-sensitive timestamp.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves the [start, end] calendar-date range for one of the Money
 * screen's period pills, anchored to "today" in the user's own profile
 * timezone (never the server's or browser's local date) — presentational
 * date-range selection only, not a financial calculation. Passed
 * verbatim as explicit dates to money_period_summary()/money_weekly_
 * summary()/money_category_breakdown(), which do the real, authoritative
 * period-bounded aggregation server-side.
 */
export function resolveMoneyPeriodRange(period: MoneyPeriodKey, timezone: string, now: Date = new Date()): { start: string; end: string } {
  const { year, month, day } = todayInTimezone(timezone, now);
  const end = toDateString(year, month, day);

  switch (period) {
    case "week": {
      const anchor = new Date(Date.UTC(year, month - 1, day));
      anchor.setUTCDate(anchor.getUTCDate() - 6);
      return { start: anchor.toISOString().slice(0, 10), end };
    }
    case "month":
      return { start: toDateString(year, month, 1), end };
    case "3m": {
      const anchor = new Date(Date.UTC(year, month - 1, 1));
      anchor.setUTCMonth(anchor.getUTCMonth() - 2);
      return { start: anchor.toISOString().slice(0, 10), end };
    }
    case "year":
      return { start: toDateString(year, 1, 1), end };
  }
}
