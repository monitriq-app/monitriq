import { formatCurrencyAmount } from "../currency/format.ts";
import type { Currency, CurrencyAmount } from "../currency/types.ts";

/** Shared, pure presentation helpers for the Goals / Debts / Money Owed screens (P0-E5-S2B). No financial arithmetic lives here. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatAmount(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/** "Jul 2027" from a YYYY-MM-DD (or ISO timestamp). Deterministic — no locale, so server and client agree. */
export function monthYear(date: string): string {
  const [y, m] = date.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** "Sep 3, 2026". */
export function shortDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export interface CurrencyTotalLine {
  currencyCode: string;
  label: string;
}

/** One line per currency, from the domain's own native-currency totals. Currencies are never combined. */
export function currencyTotalLines(totals: CurrencyAmount[], currencies: Map<string, Currency>): CurrencyTotalLine[] {
  return [...totals]
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
    .map((t) => ({ currencyCode: t.currencyCode, label: formatAmount(t.amount, t.currencyCode, currencies) }));
}

/** Copy that must never appear on a production screen. */
export const BUILD_STAGE_COPY = /foundation-level|not the final design|proves the domain/i;

/** Only accepts a plain non-negative decimal within the currency's own precision. */
export function validateMoneyInput(raw: string, decimalExponent: number, opts: { allowZero?: boolean } = {}): string | null {
  const v = raw.trim();
  if (v === "") return "Enter an amount.";
  if (!/^\d+(\.\d+)?$/.test(v)) return "Enter a number like 50000 or 1250.50.";
  if ((v.split(".")[1] ?? "").length > decimalExponent) {
    return decimalExponent === 0 ? "This currency has no decimal places." : `This currency allows up to ${decimalExponent} decimal place${decimalExponent === 1 ? "" : "s"}.`;
  }
  if (!opts.allowZero && /^0+(\.0+)?$/.test(v)) return "Enter an amount greater than zero.";
  return null;
}
