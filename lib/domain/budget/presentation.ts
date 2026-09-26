import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "../currency/format.ts";
import type { Currency } from "../currency/types.ts";
import type { Budget, BudgetCategoryStatus, BudgetSummary } from "./types.ts";

/**
 * Presentation-only helpers for the Budget screen (P0-E5-S2). Every money
 * figure comes verbatim from the canonical Budget read model
 * (budget_summary / budget_category_status); nothing here totals Money
 * events. The only arithmetic is a rail percentage (0-100) for a progress
 * bar, computed from two canonical strings with Decimal and never shown as
 * money.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(periodStart: string): string {
  const [year, month] = periodStart.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** "Oct 30" from a YYYY-MM-DD date — deterministic (no locale), so server and client render identically. */
export function formatDueDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${MONTHS[Number(month) - 1].slice(0, 3)} ${Number(day)}`;
}

/** YYYY-MM-DD for "today" in an IANA timezone (never the server's local day). */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatMoney(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/** "Over by X" when negative (sign stripped textually — no float), otherwise the amount. */
export function absoluteAmount(amount: string): string {
  return amount.startsWith("-") ? amount.slice(1) : amount;
}

export function isNegative(amount: string | null): boolean {
  return amount !== null && new Decimal(amount).isNegative() && !new Decimal(amount).isZero();
}

export interface BudgetOverviewView {
  periodLabel: string;
  currencyCode: string;
  status: BudgetSummary["status"];
  readOnly: boolean;
  hasPlan: boolean;
  plannedLabel: string;
  spentLabel: string;
  /** "Left" or "Over by" — text, so meaning never depends on color alone. */
  remainingCaption: "Left" | "Over by" | "Left to plan";
  remainingLabel: string;
  isOver: boolean;
  expectedMoneyInLabel: string | null;
  upcomingCommitmentsLabel: string | null;
  unbudgetedLabel: string | null;
  statusNote: string | null;
}

export function buildBudgetOverview(summary: BudgetSummary, currencies: Map<string, Currency>): BudgetOverviewView {
  const fmt = (v: string) => formatMoney(v, summary.currencyCode, currencies);
  const hasPlan = summary.plannedTotal !== null;
  const over = hasPlan && isNegative(summary.remaining);
  const hasUnbudgeted = !new Decimal(summary.unbudgetedSpent).isZero();
  const hasCommitments = !new Decimal(summary.upcomingCommitmentsTotal).isZero();
  return {
    periodLabel: monthLabel(summary.periodStart),
    currencyCode: summary.currencyCode,
    status: summary.status,
    readOnly: summary.status !== "active",
    hasPlan,
    plannedLabel: hasPlan ? fmt(summary.plannedTotal!) : "Not set yet",
    spentLabel: fmt(summary.actualSpendingTotal),
    remainingCaption: !hasPlan ? "Left to plan" : over ? "Over by" : "Left",
    remainingLabel: hasPlan ? fmt(absoluteAmount(summary.remaining!)) : "—",
    isOver: over,
    expectedMoneyInLabel: summary.expectedMoneyIn !== null ? fmt(summary.expectedMoneyIn) : null,
    upcomingCommitmentsLabel: hasCommitments ? fmt(summary.upcomingCommitmentsTotal) : null,
    unbudgetedLabel: hasUnbudgeted ? fmt(summary.unbudgetedSpent) : null,
    statusNote:
      summary.status === "closed"
        ? "This budget is closed. Reopen it to change the plan."
        : summary.status === "archived"
          ? "This budget is archived. Restore it to change the plan."
          : null,
  };
}

export interface CategoryRowView {
  categoryCode: string;
  label: string;
  isBudgeted: boolean;
  /** True only for an explicit planned amount of 0 — different from not budgeted. */
  isExplicitZero: boolean;
  plannedLabel: string | null;
  plannedRaw: string | null;
  spentLabel: string;
  remainingCaption: "Left" | "Over by" | null;
  remainingLabel: string | null;
  isOver: boolean;
  /** 0-100, for the rail only. null when nothing is planned. */
  progressPercent: number | null;
  progressText: string;
}

export interface CategoryListView {
  budgeted: CategoryRowView[];
  unbudgeted: CategoryRowView[];
}

export function buildCategoryRows(categories: BudgetCategoryStatus[], currencyCode: string, currencies: Map<string, Currency>): CategoryListView {
  const fmt = (v: string) => formatMoney(v, currencyCode, currencies);
  const rows = categories.map<CategoryRowView>((c) => {
    if (!c.isBudgeted || c.planned === null) {
      return {
        categoryCode: c.categoryCode,
        label: c.categoryLabel,
        isBudgeted: false,
        isExplicitZero: false,
        plannedLabel: null,
        plannedRaw: null,
        spentLabel: fmt(c.spent),
        remainingCaption: null,
        remainingLabel: null,
        isOver: false,
        progressPercent: null,
        progressText: "Not budgeted",
      };
    }
    const planned = new Decimal(c.planned);
    const spent = new Decimal(c.spent);
    const over = c.isOver;
    let percent = 0;
    if (planned.isZero()) percent = spent.isZero() ? 0 : 100;
    else percent = Math.min(100, spent.div(planned).times(100).floor().toNumber());
    return {
      categoryCode: c.categoryCode,
      label: c.categoryLabel,
      isBudgeted: true,
      isExplicitZero: planned.isZero(),
      plannedLabel: fmt(c.planned),
      plannedRaw: c.planned,
      spentLabel: fmt(c.spent),
      remainingCaption: over ? "Over by" : "Left",
      remainingLabel: fmt(absoluteAmount(c.remaining!)),
      isOver: over,
      progressPercent: percent,
      progressText: over ? "Over budget" : planned.isZero() ? "Planned zero" : `${percent}% used`,
    };
  });
  return { budgeted: rows.filter((r) => r.isBudgeted), unbudgeted: rows.filter((r) => !r.isBudgeted) };
}

/** Canonical Money spending categories that have no allocation yet (only these are offered to "Add category"). */
export function categoriesAvailableToAdd<T extends { code: string }>(all: T[], categories: BudgetCategoryStatus[]): T[] {
  const allocated = new Set(categories.filter((c) => c.isBudgeted).map((c) => c.categoryCode));
  return all.filter((c) => !allocated.has(c.code));
}

/** A planned amount must be a plain non-negative decimal within the currency's own precision. Returns an error message or null. */
export function validatePlannedAmount(raw: string, decimalExponent: number): string | null {
  const value = raw.trim();
  if (value === "") return "Enter an amount. Use 0 if you plan to spend nothing.";
  if (!/^\d+(\.\d+)?$/.test(value)) return "Enter a number like 50000 or 1250.50.";
  const fraction = value.split(".")[1] ?? "";
  if (fraction.length > decimalExponent) {
    return decimalExponent === 0 ? "This currency has no decimal places." : `This currency allows up to ${decimalExponent} decimal place${decimalExponent === 1 ? "" : "s"}.`;
  }
  return null;
}

export interface BudgetNavView {
  selected: Budget;
  /** Other live budgets in the same month (different currencies) — strictly separate budgets, never merged. */
  sameMonth: Budget[];
  previous: Budget | null;
  next: Budget | null;
}

/** Live (non-archived) budgets only, unless the archived one is the explicitly requested selection. */
export function buildBudgetNav(budgets: Budget[], selected: Budget): BudgetNavView {
  const live = budgets.filter((b) => b.status !== "archived");
  const months = [...new Set(live.map((b) => b.periodStart))].sort();
  const idx = months.indexOf(selected.periodStart);
  const pick = (month: string | undefined) => {
    if (!month) return null;
    const inMonth = live.filter((b) => b.periodStart === month);
    return inMonth.find((b) => b.currencyCode === selected.currencyCode) ?? inMonth[0] ?? null;
  };
  const before = idx === -1 ? months.filter((m) => m < selected.periodStart).pop() : months[idx - 1];
  const after = idx === -1 ? months.find((m) => m > selected.periodStart) : months[idx + 1];
  return {
    selected,
    sameMonth: live.filter((b) => b.periodStart === selected.periodStart).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)),
    previous: pick(before),
    next: pick(after),
  };
}

/**
 * Which budget to open. An explicit id wins (including a closed/archived
 * one). Otherwise: today's live budget in the preferred currency, else any
 * live budget covering today, else null (no budget yet -> empty state).
 * Never creates anything.
 */
export function resolveSelectedBudget(budgets: Budget[], opts: { requestedId?: string | null; today: string; preferredCurrency: string | null }): Budget | null {
  if (opts.requestedId) {
    const found = budgets.find((b) => b.id === opts.requestedId);
    if (found) return found;
  }
  const current = budgets.filter((b) => b.status !== "archived" && b.periodStart <= opts.today && opts.today <= b.periodEnd);
  return current.find((b) => b.currencyCode === opts.preferredCurrency) ?? current[0] ?? null;
}

/** Months offered when creating a budget: last month, this month, and the next six. */
export function monthOptions(today: string): { value: string; label: string }[] {
  const [y, m] = today.split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  for (let offset = -1; offset <= 6; offset++) {
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    const value = d.toISOString().slice(0, 10);
    out.push({ value, label: monthLabel(value) });
  }
  return out;
}

export function friendlyBudgetError(err: unknown): string {
  const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  if (/budgets_one_live_per_currency_month|duplicate key/i.test(message)) return "You already have a budget for that month and currency.";
  if (/cannot be edited|is closed|is archived/i.test(message)) return "This budget is closed. Reopen it to make changes.";
  if (/more precision/i.test(message)) return "That amount has too many decimal places for this currency.";
  return message || "Something went wrong. Please try again.";
}
