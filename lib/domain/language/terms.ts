import { resolveLanguageMode, type FinancialLanguageMode } from "./types.ts";

/**
 * The one typed vocabulary for the terminology-heavy surfaces. Components ask
 * for a SEMANTIC key (never a page-specific string) and never branch on the
 * mode themselves: `terminology(mode).t("available_above")` is the only call.
 * Every mode describes the SAME canonical figure; plain language stays
 * financially accurate (net worth is never "cash", asset value is never
 * "money available", sale proceeds are never "profit", Budget remaining is
 * never "cash available", and Available above that is never "safe to
 * spend"). Balanced mode may add a subtle `hint` that teaches the technical
 * term ("Also called liabilities.").
 */
export type TermKey =
  | "cash"
  | "money_to_keep"
  | "money_to_keep_help"
  | "protecting"
  | "available_above"
  | "available_above_alone"
  | "available_help"
  | "set_aside_goals"
  | "set_aside_goals_payments"
  | "set_amount_action"
  | "your_cash_heading"
  | "upcoming_payments"
  | "debts"
  | "debts_you_owe"
  | "debts_subtitle"
  | "money_owed"
  | "money_owed_subtitle"
  | "money_owed_to_you_total"
  | "tied_up_assets"
  | "cash_available"
  | "tied_up_summary"
  | "tied_up_badge"
  | "non_cash_assets"
  | "amount_invested"
  | "what_you_paid"
  | "current_value"
  | "unrealised"
  | "sale_result"
  | "money_after_costs"
  | "potential_liquidity"
  | "quick_sale_value"
  | "convertible_to_cash"
  | "debt_singular"
  | "money_owed_singular"
  | "protections_heading"
  | "how_worked_out"
  | "how_worked_out_short";

interface Entry {
  label: string;
  /** Balanced mode only: a short line that teaches the technical term. */
  hint?: string;
}

type Vocabulary = Record<TermKey, Record<FinancialLanguageMode, Entry>>;

const e = (label: string, hint?: string): Entry => ({ label, hint });

export const VOCABULARY: Vocabulary = {
  cash: { simple: e("Cash you have"), balanced: e("Cash position"), financial: e("Liquid cash") },
  money_to_keep: { simple: e("Money you want to keep"), balanced: e("Minimum cash to keep"), financial: e("Minimum Cash Floor") },
  money_to_keep_help: {
    simple: e("The lowest amount you want your cash to reach."),
    balanced: e("The lowest cash balance you want to maintain."),
    financial: e("The minimum liquid cash balance to retain before other cash is treated as deployable."),
  },
  protecting: { simple: e("Money Monitriq is protecting"), balanced: e("Required protected cash", "Also called required retained cash."), financial: e("Required Retained Cash") },
  available_above: { simple: e("Available above that"), balanced: e("Available after protections"), financial: e("Safe to Deploy") },
  available_above_alone: { simple: e("Available above what's protected"), balanced: e("Available after protections"), financial: e("Safe to Deploy") },
  available_help: {
    simple: e("Money left above the amount currently being protected."),
    balanced: e("Cash left after your minimum cash and protected amounts."),
    financial: e("Liquid cash remaining after Required Retained Cash."),
  },
  set_aside_goals: { simple: e("Money set aside for goals"), balanced: e("Protected goal funds"), financial: e("Protected goal cash") },
  set_aside_goals_payments: {
    simple: e("Money set aside for goals and upcoming payments"),
    balanced: e("Protected commitments", "Goals and upcoming payments you have protected."),
    financial: e("Protected Commitments"),
  },
  set_amount_action: { simple: e("Set amount to keep"), balanced: e("Set minimum cash to keep"), financial: e("Set Minimum Cash Floor") },
  your_cash_heading: { simple: e("Your cash"), balanced: e("Cash position"), financial: e("Liquidity position") },
  upcoming_payments: { simple: e("Upcoming payments"), balanced: e("Upcoming commitments"), financial: e("Upcoming obligations") },
  debts: { simple: e("Debts"), balanced: e("Debts", "Also called liabilities."), financial: e("Liabilities") },
  debts_you_owe: { simple: e("Debts you owe"), balanced: e("Debts"), financial: e("Liabilities outstanding") },
  debts_subtitle: { simple: e("What you owe."), balanced: e("What you owe."), financial: e("What you owe.") },
  money_owed: { simple: e("Money Owed to You"), balanced: e("Money Owed to You", "Also called receivables."), financial: e("Receivables") },
  money_owed_subtitle: {
    simple: e("Track money you expect to receive."),
    balanced: e("Track money you expect to receive."),
    financial: e("Track amounts you expect to receive."),
  },
  money_owed_to_you_total: { simple: e("Money owed to you"), balanced: e("Money owed to you"), financial: e("Receivables outstanding") },
  tied_up_assets: { simple: e("Money tied up in assets"), balanced: e("Less-liquid assets", "Money tied up in assets."), financial: e("Illiquid assets") },
  cash_available: { simple: e("Cash available"), balanced: e("Cash available", "Also called liquid cash."), financial: e("Liquid cash") },
  tied_up_badge: {
    simple: e("{pct}% of your net worth is tied up in assets"),
    balanced: e("{pct}% of your net worth is in less-liquid assets"),
    financial: e("{pct}% in illiquid assets"),
  },
  tied_up_summary: { simple: e("Tied up in assets"), balanced: e("Less-liquid assets"), financial: e("Illiquid assets") },
  non_cash_assets: { simple: e("Money tied up in assets"), balanced: e("Non-cash assets"), financial: e("Non-cash assets (illiquid)") },
  amount_invested: { simple: e("Amount invested"), balanced: e("Amount invested"), financial: e("Cost basis") },
  what_you_paid: { simple: e("What you paid"), balanced: e("Amount paid"), financial: e("Cost basis") },
  current_value: { simple: e("Current value"), balanced: e("Current value"), financial: e("Current valuation") },
  unrealised: { simple: e("Change in value so far"), balanced: e("Unrealized gain / loss"), financial: e("Unrealized Gain / Loss") },
  sale_result: { simple: e("Gain or loss compared with what you paid"), balanced: e("Gain / loss on sale"), financial: e("Realised gain / loss") },
  money_after_costs: { simple: e("Money received after costs"), balanced: e("Received after costs"), financial: e("Net proceeds") },
  potential_liquidity: { simple: e("Could become cash"), balanced: e("Potential liquidity", "Cash you could raise by selling."), financial: e("Potential liquidity") },
  quick_sale_value: { simple: e("Value if sold quickly"), balanced: e("Quick-sale value"), financial: e("Quick-sale value") },
  convertible_to_cash: {
    simple: e("Money that may be convertible to cash (not cash you can use now)"),
    balanced: e("Potential liquidity (not cash you can use now)"),
    financial: e("Potential liquidity (not deployable cash)"),
  },
  debt_singular: { simple: e("Debt"), balanced: e("Debt"), financial: e("Liability") },
  money_owed_singular: { simple: e("Money Owed"), balanced: e("Money Owed"), financial: e("Receivable") },
  protections_heading: { simple: e("Your cash & what Monitriq is protecting"), balanced: e("Cash & protections"), financial: e("Liquidity & protected position") },
  how_worked_out_short: { simple: e("How it's worked out"), balanced: e("How it's worked out"), financial: e("See the calculation") },
  how_worked_out: { simple: e("See how this is worked out"), balanced: e("See how this is worked out"), financial: e("See the calculation") },
};

export interface Terminology {
  mode: FinancialLanguageMode;
  /** The label for a semantic key in this mode. */
  t: (key: TermKey) => string;
  /** A short secondary line that teaches the technical term (balanced mode only), else null. */
  hint: (key: TermKey) => string | null;
}

/** Accepts anything (a profile value, null, garbage): unknown values resolve to "simple". */
export function terminology(mode: unknown): Terminology {
  const m = resolveLanguageMode(mode);
  return {
    mode: m,
    t: (key) => VOCABULARY[key][m].label,
    hint: (key) => (m === "balanced" ? (VOCABULARY[key].balanced.hint ?? null) : null),
  };
}
