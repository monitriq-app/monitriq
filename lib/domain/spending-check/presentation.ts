import type { Currency } from "../currency/types.ts";
import { formatAmount } from "../common/presentation.ts";
import type { StatusTone } from "../rules/labels.ts";
import { terminology, type Terminology } from "../language/terms.ts";
import { cashStatusSentence, type CashStatusResult } from "../rules/cash-status.ts";
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

/**
 * Status colour for the suggestion (text and icon always say what it is):
 * proceed = teal; review / more setup = amber (attention, incomplete or a
 * category over plan); wait (protected money would be crossed) and reduce
 * (not enough cash, or the overall Budget would be breached) = red.
 */
export const SUGGESTION_TONE: Record<SuggestionState, StatusTone> = {
  proceed: "positive",
  review: "attention",
  setup: "attention",
  wait: "danger",
  reduce: "danger",
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
  /** Status colour for the value (danger = actual shortfall/breach, attention = over a category plan). Text always explains it. */
  tone?: StatusTone;
}

export interface ChangeRow {
  key: "cash" | "budget" | "protected" | "commitments";
  /** Where cash would stand against the amount you want to keep after this purchase (label + sentence; colour is secondary). */
  cashStatus?: { result: CashStatusResult; sentence: string };
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

/**
 * Reason wording by explanation mode (P0-E5-S5). The reason CODES, amounts and the suggestion
 * itself are identical in every mode; only how the protection reasons are phrased changes.
 */
function modeReason(r: SuggestionReason, fmt: (v: string) => string, mode: "balanced" | "financial"): string | null {
  const a = r.amounts;
  const f = mode === "financial";
  switch (r.code) {
    case "below_minimum_cash":
      return f
        ? `Post-purchase liquid cash of ${fmt(a.cashAfter)} would be ${fmt(a.belowBy)} below the Minimum Cash Floor of ${fmt(a.minimum)} (a retained-cash deficit).`
        : `Your minimum cash to keep is ${fmt(a.minimum)}. This would leave your cash at ${fmt(a.cashAfter)}, which is ${fmt(a.belowBy)} below that.`;
    case "uses_protected_goal_money":
      return f ? `This would draw ${fmt(a.used)} from protected goal cash.` : `This would use ${fmt(a.used)} of protected goal funds.`;
    case "commitments_underprotected":
      return f ? `Protected Commitments would be under-covered by ${fmt(a.shortfall)}.` : `This would leave protected commitments ${fmt(a.shortfall)} under-covered.`;
    case "below_required_cash":
      return f
        ? `Required Retained Cash is ${fmt(a.required)}; post-purchase liquid cash of ${fmt(a.cashAfter)} is ${fmt(a.belowBy)} short (a retained-cash deficit).`
        : `Required protected cash is ${fmt(a.required)} (the higher of your minimum cash and protected commitments). This would leave your cash at ${fmt(a.cashAfter)}, ${fmt(a.belowBy)} below that.`;
    case "minimum_cash_not_set":
      return f ? "No Minimum Cash Floor is set, so the retained-cash check is incomplete." : "You haven't set a minimum cash to keep, so that check is incomplete.";
    default:
      return null;
  }
}

function sentence(r: SuggestionReason, fmt: (v: string) => string, mode: unknown = "simple"): string {
  const a = r.amounts;
  const m = terminology(mode).mode;
  if (m !== "simple") {
    const custom = modeReason(r, fmt, m);
    if (custom !== null) return custom;
  }
  switch (r.code) {
    case "cash_insufficient":
      return `This account does not currently have enough tracked cash for this purchase. It has ${fmt(a.balance)} and this is ${fmt(a.shortBy)} more.`;
    case "below_minimum_cash":
      return `You chose to keep at least ${fmt(a.minimum)}. This would leave your cash at ${fmt(a.cashAfter)}, which is ${fmt(a.belowBy)} below that.`;
    case "uses_protected_goal_money":
      return `This would use ${fmt(a.used)} currently set aside for your goals.`;
    case "commitments_underprotected":
      return `This would leave ${fmt(a.shortfall)} less than the amount currently set aside for upcoming payments.`;
    case "below_required_cash":
      return `Monitriq is protecting ${fmt(a.required)} (the amount you want to keep, or the money set aside for goals and upcoming payments, whichever is higher). This would leave your cash at ${fmt(a.cashAfter)}, which is ${fmt(a.belowBy)} below that.`;
    case "budget_over":
      return `This would put your monthly spending ${fmt(a.overBy)} over your current plan.`;
    case "category_over":
      return `This would put ${a.label || "this category"} ${fmt(a.overBy)} over its planned amount.`;
    case "category_unbudgeted":
      return "This category isn't in your budget.";
    case "minimum_cash_not_set":
      return "You haven't chosen the amount of cash you want to keep, so that check is incomplete.";
    case "no_budget":
      return "You don't have an active budget for this month, so the Budget check isn't available.";
    case "no_plan":
      return "Your budget for this month has no planned amounts yet, so the Budget check isn't available.";
    case "all_clear":
      return PROCEED_TEXT;
  }
}

export function presentSpendingCheck(result: SpendingCheckResult, description: string, currencies: Map<string, Currency>, mode: unknown = "simple"): SpendingCheckView {
  const terms: Terminology = terminology(mode);
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
          { label: "Short by", value: fmt(cash.shortBy ?? "0"), tone: "danger" },
        ],
    note: null,
    action: null,
  });

  if (budget.state === "checked") {
    const lines: ChangeLine[] = [
      { label: "Budget left this month now", value: fmt(budget.remainingBefore ?? "0") },
      budget.overBy ? { label: "Over budget by", value: fmt(budget.overBy), tone: "danger" } : { label: "Budget left after this purchase", value: fmt(budget.remainingAfter ?? "0") },
    ];
    let note: string | null = null;
    if (budget.category.state === "checked") {
      lines.push({ label: `${budget.category.label ?? "Category"} budget left now`, value: fmt(budget.category.leftBefore ?? "0") });
      lines.push(budget.category.overBy ? { label: "Over category budget by", value: fmt(budget.category.overBy), tone: "attention" } : { label: "After this purchase", value: fmt(budget.category.leftAfter ?? "0") });
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
      note: sentence({ code: budget.state === "no_budget" ? "no_budget" : "no_plan", amounts: {} }, fmt, terms.mode),
      action: budget.inactiveBudgetId ? { label: "Open budget", href: `/budget?b=${budget.inactiveBudgetId}` } : budget.state === "no_budget" ? { label: "Create budget", href: "/budget?quick=1" } : { label: "Open budget", href: "/budget" },
    });
  }

  const pm = protection.minimumCash;
  const protectedLines: ChangeLine[] = [];
  if (pm.state === "checked") {
    if (pm.minimum) protectedLines.push({ label: terms.t("money_to_keep"), value: fmt(pm.minimum) });
    if (protection.protectingAfter !== null) protectedLines.push({ label: `${terms.t("protecting")} (after)`, value: fmt(protection.protectingAfter) });
    if (pm.totalCashAfter) protectedLines.push({ label: terms.mode === "financial" ? `Liquid cash after purchase (${code})` : `All your ${code} cash after this purchase`, value: fmt(pm.totalCashAfter) });
    if (pm.safeToDeployAfter !== null) protectedLines.push({ label: `${terms.t("available_above")} (after)`, value: fmt(pm.safeToDeployAfter), tone: protection.statusAfter.tone });
  }
  const goalNote = protection.goals.moneyUsed ? sentence({ code: "uses_protected_goal_money", amounts: { used: protection.goals.moneyUsed } }, fmt, terms.mode) : `No ${terms.t("set_aside_goals").toLowerCase()} would be used.`;
  const statusAfter = protection.statusAfter;
  rows.push({
    key: "protected",
    title: terms.t("money_to_keep"),
    status: pm.state === "checked" ? "Checked" : "Needs setup",
    cashStatus: { result: statusAfter, sentence: cashStatusSentence(statusAfter, fmt, "after_purchase", terms.mode) },
    lines: protectedLines,
    note: pm.state === "checked" ? goalNote : `${cashStatusSentence(statusAfter, fmt, "default", terms.mode)} ${goalNote}`,
    action: pm.state === "checked" ? null : { label: terms.t("set_amount_action"), href: "/rules" },
  });

  rows.push({
    key: "commitments",
    title: terms.t("upcoming_payments"),
    status: "Checked",
    lines: [],
    note: protection.commitments.shortfall
      ? sentence({ code: "commitments_underprotected", amounts: { shortfall: protection.commitments.shortfall } }, fmt)
      : "This would not reduce the money set aside for your upcoming payments.",
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
    calc.push({ tag: "TRACKED", label: terms.t("money_to_keep"), value: fmt(pm.minimum) });
    if (pm.totalCashAfter) calc.push({ tag: "CALCULATED", label: `All tracked ${code} cash after`, value: fmt(pm.totalCashAfter) });
    if (pm.safeToDeployAfter !== null) calc.push({ tag: "CALCULATED", label: `${terms.t("available_above")} (after)`, value: fmt(pm.safeToDeployAfter) });
  }

  const reasons = suggestion.reasons.map((r) => sentence(r, fmt, terms.mode));
  const caveats = suggestion.caveats.map((r) => sentence(r, fmt, terms.mode));

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
