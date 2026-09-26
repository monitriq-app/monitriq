import type { Currency, CurrencyAmount } from "../currency/types.ts";
import { currencyTotalLines, formatAmount, shortDate, type CurrencyTotalLine } from "../common/presentation.ts";
import type { ReceivableSummary } from "./types.ts";

/** Money Owed to You presentation (P0-E5-S2B). Route/domain stay "receivables". Money owed is NOT cash in hand. */

export const NOT_CASH_NOTE = "Money owed to you is not cash you can spend until it is paid.";

export const MONEY_OWED_FIELD_LABELS = {
  name: "Name, person or company",
  currency: "Currency",
  amount: "Amount owed",
  expectedDate: "Expected payment date (optional)",
  estimate: "Estimated amount you expect to recover (optional)",
} as const;

export interface MoneyOwedCardView {
  receivableId: string;
  name: string;
  currencyCode: string;
  outstandingLabel: string;
  recoveredLabel: string;
  isSettled: boolean;
  expectedDateLabel: string | null;
  estimateLabel: string | null;
  followUpLabel: string | null;
  details: { label: string; value: string }[];
  canRecord: boolean;
}

export function buildMoneyOwedCard(r: ReceivableSummary, currencies: Map<string, Currency>): MoneyOwedCardView {
  const fmt = (v: string) => formatAmount(v, r.currencyCode, currencies);
  const settled = /^0+(\.0+)?$/.test(r.outstandingAmount);
  return {
    receivableId: r.receivableId,
    name: r.name,
    currencyCode: r.currencyCode,
    outstandingLabel: fmt(r.outstandingAmount),
    recoveredLabel: fmt(r.recoveredAmount),
    isSettled: settled,
    expectedDateLabel: r.expectedPaymentDate ? shortDate(r.expectedPaymentDate) : null,
    estimateLabel: r.estimatedRecoverableValue !== null ? fmt(r.estimatedRecoverableValue) : null,
    followUpLabel: r.lastFollowUpAt ? `Followed up ${shortDate(r.lastFollowUpAt)}` : null,
    details: [{ label: "Amount owed in total", value: fmt(r.faceAmount) }],
    canRecord: !settled && !r.isArchived,
  };
}

export interface MoneyOwedView {
  cards: MoneyOwedCardView[];
  /** Still outstanding, one line per currency (receivable_native_currency_totals) — never combined, never cash. */
  outstandingTotals: CurrencyTotalLine[];
}

export function buildMoneyOwedView(receivables: ReceivableSummary[], totals: CurrencyAmount[], currencies: Map<string, Currency>): MoneyOwedView {
  const cards = receivables
    .filter((r) => !r.isArchived)
    .map((r) => buildMoneyOwedCard(r, currencies))
    .sort((a, b) => Number(a.isSettled) - Number(b.isSettled) || a.currencyCode.localeCompare(b.currencyCode) || a.name.localeCompare(b.name));
  return { cards, outstandingTotals: currencyTotalLines(totals, currencies) };
}

export const MONEY_OWED_EMPTY = {
  title: "No money owed to you is being tracked.",
  body: "Add money someone owes you to keep track of what has been paid back.",
  action: "Add Money Owed",
} as const;
