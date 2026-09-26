/**
 * Everyday wording for the Rules engine's outputs (S4 / S4A). The canonical
 * internal names (safe_to_deploy, required_retained_cash,
 * minimum_cash_floor, protected_commitments, retained_deficit) are unchanged
 * everywhere in the schema, RPCs, repositories and types; only what people
 * READ changed. Product-language rule: if an ordinary user would need to
 * look up a financial term to understand a primary screen, use plain
 * language and keep the technical term in secondary detail.
 */
export const CASH_YOU_HAVE = "Cash you have";
export const MONEY_YOU_WANT_TO_KEEP = "Money you want to keep";
export const MONEY_YOU_WANT_TO_KEEP_HELP = "The lowest amount you want your cash to reach.";
export const MONEY_MONITRIQ_IS_PROTECTING = "Money Monitriq is protecting";
export const AVAILABLE_ABOVE_THAT = "Available above that";
export const AVAILABLE_ABOVE_WHATS_PROTECTED = "Available above what's protected";
export const AVAILABLE_ABOVE_HELP = "Money left above the amount currently being protected.";
export const MONEY_SET_ASIDE_FOR_GOALS = "Money set aside for goals";
export const MONEY_SET_ASIDE_FOR_GOALS_AND_PAYMENTS = "Money set aside for goals and upcoming payments";
export const PROTECTION_EXPLAINER = "Monitriq protects whichever amount is higher, so the same money is not counted twice.";
export const HOW_WORKED_OUT = "See how this is worked out";
export const SET_AMOUNT_TO_KEEP_ACTION = "Set amount to keep";
export const NOT_CONFIGURED = "Not configured";

/** Status colour tone. Colour communicates STATUS, never how much money someone has. */
export type StatusTone = "positive" | "neutral" | "attention" | "danger";

export const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  positive: "text-accent-primary",
  neutral: "text-text-primary",
  attention: "text-attention",
  danger: "text-danger",
};

export const TONE_BADGE_CLASS: Record<StatusTone, string> = {
  positive: "bg-accent-primary/10 text-accent-primary",
  neutral: "bg-surface-strong text-text-secondary",
  attention: "bg-attention/15 text-attention",
  danger: "bg-danger/10 text-danger",
};
