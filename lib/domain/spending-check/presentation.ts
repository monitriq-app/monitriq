import type { Currency } from "../currency/types.ts";
import { formatAmount } from "../common/presentation.ts";
import type { SpendingCheckResult, SuggestionReason, SuggestionState } from "./types.ts";

/** Plain-language presentation for "Can I afford this?". Formats canonical figures; no arithmetic and no scoring. */

export const PAGE_TITLE = "Can I afford this?";
export const PAGE_SUBTITLE = "See what a purchase would change before you spend.";
export const HOME_CTA = { title: "Can I afford this?", body: "Check a purchase before you spend." } as const;

export const SUGGESTION_LABEL: Record<SuggestionState, string> = {
  proceed: "Proceed within your plan",
  reduce: "Reduce the amount",
  wait: "Wait",
  review: "Review first",
  setup: "More setup needed",
};

export const PROCEED_TEXT = "Based on the money, Budget and protections you have set up, this purchase stays within your current plan.";
export const NO_ACCOUNT_TEXT = "No cash account in this currency is being tracked.";

/** Purchase categories offered in the check: the canonical Money spending categories minus debt payments (those have their own flow). */
export function purchaseCategories<T extends { code: string }>(all: T[]): T[] {
  return all.filter((c) => c.code !== "debt_payment");
}

export type CheckStatus = "Checked" | "Needs setup" | "Not available" | "Not checked";

export interface ChangeLine {
  label: string;
  value: string;
}

export interface ChangeRow {
  key: "cash" | "budget" | "protected" | "commitments";
  title: string;
  status: CheckStatus;
  lines: ChangeLine[];
  note: string | null;
  action: { label: string; href: string } | null;
}

export interface CalcLine {
  tag: "TRACKED" | "YOUR PURCHASE" | "CALCULATED";
  label: string;
  value: string;
}

export interface SpendingCheckView {
  purchaseLabel: string;
  suggestionState: SuggestionState;
  suggestionLabel: string;
  summary: string;
  reasons: string[];
  caveats: string[];
  rows: ChangeRow[];
  calc: CalcLine[];
}

function sentence(r: SuggestionReason, fmt: (v: string) => string): string {
  const a = r.amounts;
  switch (r.code) {
    case "cash_insufficient":
      return `This account does not currently have enough tracked cash for this purchase. It has ${fmt(a.balance)} and this is ${fmt(a.shortBy)} more.`;
    case "below_minimum_cash":
      return `You chose to keep at least ${fmt(a.minimum)}. This would leave your tracked cash at ${fmt(a.cashAfter)}, which is ${fmt(a.belowBy)} below that.`;
    case "uses_protected_goal_money":
      return `This would use ${fmt(a.used)} currently protected for your goals.`;
    case "commitments_underprotected":
      return `This would leave ${fmt(a.shortfall)} less than the amount currently protected for known commitments.`;
    case "below_required_cash":
      return `You have ${fmt(a.required)} protected for your minimum cash, goals and known commitments. This would leave your tracked cash at ${fmt(a.cashAfter)}, which is ${fmt(a.belowBy)} below that.`;
    case "budget_over":
      return `This would put your monthly spending ${fmt(a.overBy)} over your current plan.`;
    case "category_over":
      return `This would put ${a.label || "this category"} ${fmt(a.overBy)} over its planned amount.`;
    case "category_unbudgeted":
      return "This category isn't in your budget.";
    case "minimum_cash_not_set":
      return "You haven't set the minimum cash you want to keep, so the protected-cash check is incomplete.";
    case "no_budget":
      return "You don't have an active budget for this month, so the Budget check isn't available.";
    case "no_plan":
      return "Your budget for this month has no planned amounts yet, so the Budget check isn't available.";
    case "all_clear":
      return PROCEED_TEXT;
  }
}

export function presentSpendingCheck(result: SpendingCheckResult, description: string, currencies: Map<string, Currency>): SpendingCheckView {
  const code = result.currencyCode;
  const fmt = (v: string) => formatAmount(v, code, currencies);
  const { cash, budget, protection, suggestion } = result;

  const rows: ChangeRow[] = [];

  rows.push({
    key: "cash",
    title: "Cash",
    status: "Checked",
    lines: cash.canCover
      ? [
          { label: "In this account now", value: fmt(cash.before) },
          { label: "After this purchase", value: fmt(cash.after) },
        ]
      : [
          { label: "In this account now", value: fmt(cash.before) },
          { label: "Short by", value: fmt(cash.shortBy ?? "0") },
        ],
    note: null,
    action: null,
  });

  if (budget.state === "checked") {
    const lines: ChangeLine[] = [
      { label: "Budget left this month now", value: fmt(budget.remainingBefore ?? "0") },
      budget.overBy ? { label: "Over budget by", value: fmt(budget.overBy) } : { label: "Budget left after this purchase", value: fmt(budget.remainingAfter ?? "0") },
    ];
    let note: string | null = null;
    if (budget.category.state === "checked") {
      lines.push({ label: `${budget.category.label ?? "Category"} budget left now`, value: fmt(budget.category.leftBefore ?? "0") });
      lines.push(budget.category.overBy ? { label: "Over category budget by", value: fmt(budget.category.overBy) } : { label: "After this purchase", value: fmt(budget.category.leftAfter ?? "0") });
    } else if (budget.category.state === "unbudgeted") {
      note = "This category isn't in your budget.";
    } else {
      note = "Category budget impact was not checked.";
    }
    rows.push({ key: "budget", title: "Budget", status: "Checked", lines, note, action: null });
  } else {
    rows.push({
      key: "budget",
      title: "Budget",
      status: "Not available",
      lines: [],
      note: sentence({ code: budget.state === "no_budget" ? "no_budget" : "no_plan", amounts: {} }, fmt),
      action: budget.inactiveBudgetId ? { label: "Open budget", href: `/budget?b=${budget.inactiveBudgetId}` } : budget.state === "no_budget" ? { label: "Create budget", href: "/budget?quick=1" } : { label: "Open budget", href: "/budget" },
    });
  }

  const pm = protection.minimumCash;
  const protectedLines: ChangeLine[] = [];
  if (pm.state === "checked") {
    if (pm.minimum) protectedLines.push({ label: "Minimum cash you keep", value: fmt(pm.minimum) });
    if (pm.safeToDeployBefore !== null) protectedLines.push({ label: "Safe to Deploy now", value: fmt(pm.safeToDeployBefore) });
    if (pm.safeToDeployAfter !== null) protectedLines.push({ label: "Safe to Deploy after", value: fmt(pm.safeToDeployAfter) });
  }
  const goalNote = protection.goals.moneyUsed ? sentence({ code: "uses_protected_goal_money", amounts: { used: protection.goals.moneyUsed } }, fmt) : "No money protected for your goals would be used.";
  rows.push({
    key: "protected",
    title: "Protected money",
    status: pm.state === "checked" ? "Checked" : "Needs setup",
    lines: protectedLines,
    note: pm.state === "checked" ? goalNote : `Not fully configured. Set the minimum cash you want to keep before Monitriq can complete this check. ${goalNote}`,
    action: pm.state === "checked" ? null : { label: "Set minimum cash", href: "/rules" },
  });

  rows.push({
    key: "commitments",
    title: "Upcoming commitments",
    status: "Checked",
    lines: [],
    note: protection.commitments.shortfall
      ? sentence({ code: "commitments_underprotected", amounts: { shortfall: protection.commitments.shortfall } }, fmt)
      : "This would not reduce the money protected for your known commitments.",
    action: null,
  });

  const calc: CalcLine[] = [
    { tag: "TRACKED", label: "Cash in this account", value: fmt(cash.before) },
    { tag: "YOUR PURCHASE", label: description || "Purchase", value: fmt(result.amount) },
    { tag: "CALCULATED", label: "Cash after", value: fmt(cash.after) },
  ];
  if (budget.state === "checked") {
    calc.push({ tag: "TRACKED", label: "Budget left this month", value: fmt(budget.remainingBefore ?? "0") });
    calc.push({ tag: "CALCULATED", label: budget.overBy ? "Over budget by" : "Budget left after", value: fmt(budget.overBy ?? budget.remainingAfter ?? "0") });
  }
  if (pm.state === "checked" && pm.minimum) {
    calc.push({ tag: "TRACKED", label: "Minimum cash you chose to keep", value: fmt(pm.minimum) });
    if (pm.totalCashAfter) calc.push({ tag: "CALCULATED", label: `All tracked ${code} cash after`, value: fmt(pm.totalCashAfter) });
    if (pm.safeToDeployAfter !== null) calc.push({ tag: "CALCULATED", label: "Safe to Deploy after", value: fmt(pm.safeToDeployAfter) });
  }

  const reasons = suggestion.reasons.map((r) => sentence(r, fmt));
  const caveats = suggestion.caveats.map((r) => sentence(r, fmt));

  return {
    purchaseLabel: description ? `${description} · ${fmt(result.amount)}` : fmt(result.amount),
    suggestionState: suggestion.state,
    suggestionLabel: SUGGESTION_LABEL[suggestion.state],
    summary: suggestion.state === "proceed" ? PROCEED_TEXT : reasons[0] ?? "",
    reasons: suggestion.state === "proceed" ? [] : reasons,
    caveats,
    rows,
    calc,
  };
}
