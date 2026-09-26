import type { Currency, CurrencyAmount } from "../currency/types.ts";
import { currencyTotalLines, formatAmount, monthYear, type CurrencyTotalLine } from "../common/presentation.ts";
import type { LiabilitySummary } from "./types.ts";

/** Debts presentation (P0-E5-S2B). Route/domain stay "liabilities"; user-facing wording is "Debts". */

export const DEBT_FIELD_LABELS = {
  name: "Name",
  type: "Type of debt",
  currency: "Currency",
  startingAmount: "Starting amount owed",
  lender: "Who do you owe? (optional)",
  interest: "Interest rate % (optional)",
  maturity: "Final payment date (optional)",
} as const;

export interface DebtCardView {
  liabilityId: string;
  name: string;
  typeLabel: string;
  currencyCode: string;
  owedLabel: string;
  interestLabel: string | null;
  maturityLabel: string | null;
  /** Only present when a value exists — empty optionals are not shown. */
  details: { label: string; value: string }[];
  isArchived: boolean;
}

export function buildDebtCard(l: LiabilitySummary, typeLabels: Map<string, string>, counterparty: string | null, currencies: Map<string, Currency>): DebtCardView {
  const details: { label: string; value: string }[] = [
    { label: "Paid back so far", value: formatAmount(l.principalRepaid, l.currencyCode, currencies) },
  ];
  if (counterparty) details.unshift({ label: "Owed to", value: counterparty });
  if (l.openedAt) details.push({ label: "Started", value: monthYear(l.openedAt) });
  return {
    liabilityId: l.liabilityId,
    name: l.name,
    typeLabel: typeLabels.get(l.liabilityType) ?? l.liabilityType,
    currencyCode: l.currencyCode,
    owedLabel: formatAmount(l.outstandingPrincipal, l.currencyCode, currencies),
    interestLabel: l.interestRate === null ? null : `${l.interestRate}% interest`,
    maturityLabel: l.maturityDate ? `Final payment ${monthYear(l.maturityDate)}` : null,
    details,
    isArchived: l.isArchived,
  };
}

export interface DebtsView {
  cards: DebtCardView[];
  /** Total owed, one line per currency (from liability_native_currency_totals) — never combined. */
  totals: CurrencyTotalLine[];
}

export function buildDebtsView(liabilities: LiabilitySummary[], totals: CurrencyAmount[], typeLabels: Map<string, string>, counterparties: Map<string, string | null>, currencies: Map<string, Currency>): DebtsView {
  const cards = liabilities
    .filter((l) => !l.isArchived)
    .map((l) => buildDebtCard(l, typeLabels, counterparties.get(l.liabilityId) ?? null, currencies))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode) || a.name.localeCompare(b.name));
  return { cards, totals: currencyTotalLines(totals, currencies) };
}

export const DEBTS_EMPTY = {
  title: "No debts tracked yet.",
  body: "Add a debt if you want Monitriq to include it in your financial picture and spending decisions.",
  action: "Add Debt",
} as const;
