import { Decimal } from "decimal.js";
import type { StatusTone } from "./labels.ts";
import { resolveLanguageMode } from "../language/types.ts";

/**
 * CASH WARNING POLICY (P0-E5-S4A) — a presentation policy, NOT a financial
 * calculation. It only classifies figures the Rules engine has already
 * computed (liquid cash, required retained cash, safe to deploy, retained
 * deficit; see safe_to_deploy_by_currency()) into one of five human states,
 * so people are warned BEFORE they reach the amount they chose to keep.
 * It never changes, recomputes or replaces those figures, and adds no
 * protection arithmetic (the engine already takes MAX(minimum, protected),
 * so nothing is double counted).
 *
 * Deterministic, one place, per currency, and independent of how much money
 * the user has: the state depends only on the user's OWN configured
 * protection.
 */

/**
 * The warning zone begins when the money remaining ABOVE the protected
 * amount is this fraction (25%) of the protected amount, or less. This is a
 * Monitriq UI warning policy, not part of Safe-to-Deploy mathematics, and is
 * kept here as the single constant so it can become user-configurable later.
 */
export const WARNING_ZONE_FRACTION = "0.25";

export type CashStatus = "comfortable" | "getting_close" | "at_limit" | "below_limit" | "needs_setup";

/** The canonical Rules figures this policy reads (all already computed by the engine). */
export interface CashStatusInput {
  /** 'calculated' | 'not_configured' — the engine's own status. */
  status: string;
  liquidCash: string;
  /** Money Monitriq is protecting (required_retained_cash). Null when not configured. */
  requiredRetainedCash: string | null;
  /** Available above that (safe_to_deploy). Null when not configured. */
  safeToDeploy: string | null;
  /** retained_deficit: greater than zero only when cash is below the protected amount. */
  retainedDeficit: string | null;
}

export interface CashStatusResult {
  state: CashStatus;
  tone: StatusTone;
  label: string;
  /** Money left above the protected amount (the engine's safe_to_deploy). Null when needs setup. */
  headroom: string | null;
  /** How far cash is below the protected amount (the engine's retained_deficit). Set only for below_limit. */
  shortfall: string | null;
  /** True when nothing at all is being protected (an explicit zero amount to keep). */
  nothingProtected: boolean;
}

export const CASH_STATUS_LABEL: Record<CashStatus, string> = {
  comfortable: "Comfortable",
  getting_close: "Getting close",
  at_limit: "At your limit",
  below_limit: "Below your limit",
  needs_setup: "Needs setup",
};

const TONE: Record<CashStatus, StatusTone> = {
  comfortable: "positive",
  getting_close: "attention",
  at_limit: "attention",
  below_limit: "danger",
  needs_setup: "attention",
};

export function cashStatus(input: CashStatusInput, zoneFraction: string = WARNING_ZONE_FRACTION): CashStatusResult {
  const make = (state: CashStatus, extra: Partial<CashStatusResult> = {}): CashStatusResult => ({
    state,
    tone: TONE[state],
    label: CASH_STATUS_LABEL[state],
    headroom: null,
    shortfall: null,
    nothingProtected: false,
    ...extra,
  });

  if (input.status !== "calculated" || input.requiredRetainedCash === null || input.safeToDeploy === null) {
    return make("needs_setup");
  }

  const required = new Decimal(input.requiredRetainedCash);
  const headroom = new Decimal(input.safeToDeploy);
  const deficit = new Decimal(input.retainedDeficit ?? 0);

  // Actual conflict: the engine reports cash below the protected amount (this also covers negative cash).
  if (deficit.greaterThan(0)) return make("below_limit", { shortfall: input.retainedDeficit, headroom: input.safeToDeploy });

  // An explicit zero protected amount has no meaningful percentage zone: positive cash is fine and
  // neutral (nothing is protected), zero cash is worth attention.
  if (required.isZero()) {
    return headroom.greaterThan(0)
      ? make("comfortable", { tone: "neutral", headroom: input.safeToDeploy, nothingProtected: true })
      : make("at_limit", { headroom: input.safeToDeploy, nothingProtected: true });
  }

  if (headroom.isZero()) return make("at_limit", { headroom: input.safeToDeploy });

  // Warning zone: headroom at or below 25% of the protected amount.
  if (headroom.lessThanOrEqualTo(required.times(zoneFraction))) return make("getting_close", { headroom: input.safeToDeploy });

  return make("comfortable", { headroom: input.safeToDeploy });
}

export type CashStatusTextVariant = "default" | "home" | "after_purchase" | "money";

/**
 * Supporting sentence for a state. `fmt` formats a canonical amount string in the right currency.
 * `mode` (P0-E5-S5) only changes the WORDING: the state, tone and amounts are identical in every mode.
 */
export function cashStatusSentence(r: CashStatusResult, fmt: (v: string) => string, variant: CashStatusTextVariant = "default", mode: unknown = "simple"): string {
  const m = resolveLanguageMode(mode);
  if (m !== "simple") return modeSentence(m, r, fmt, variant);
  return simpleSentence(r, fmt, variant);
}

function modeSentence(m: "balanced" | "financial", r: CashStatusResult, fmt: (v: string) => string, variant: CashStatusTextVariant): string {
  const after = variant === "after_purchase";
  const f = m === "financial";
  switch (r.state) {
    case "comfortable":
      if (r.nothingProtected) return f ? "No cash is being retained; nothing is protected." : "No cash is being protected right now.";
      if (after && r.headroom !== null) return f ? `Post-purchase headroom above Required Retained Cash is ${fmt(r.headroom)}.` : `This would leave ${fmt(r.headroom)} above your protected amount.`;
      return f ? "Liquid cash is comfortably above Required Retained Cash." : "Your cash is comfortably above your protected amount.";
    case "getting_close":
      if (r.headroom === null) return "";
      if (after) return f ? `Post-purchase headroom above Required Retained Cash is ${fmt(r.headroom)}.` : `This would leave ${fmt(r.headroom)} above your protected amount.`;
      return f ? `Headroom above Required Retained Cash is ${fmt(r.headroom)}.` : `Only ${fmt(r.headroom)} remains above your protected amount.`;
    case "at_limit":
      if (r.nothingProtected) return f ? "Liquid cash is nil in this currency." : "You have no cash tracked in this currency.";
      if (after) return f ? "Post-purchase liquid cash equals Required Retained Cash." : "This would leave your cash equal to your protected amount.";
      return f ? "Liquid cash equals Required Retained Cash." : "Your cash equals your protected amount.";
    case "below_limit":
      if (r.shortfall === null) return "";
      if (after) return f ? `This purchase creates a ${fmt(r.shortfall)} retained-cash deficit below Required Retained Cash.` : `This purchase would leave you ${fmt(r.shortfall)} below your protected amount.`;
      return f ? `Liquid cash is ${fmt(r.shortfall)} below Required Retained Cash (retained-cash deficit).` : `Your cash is ${fmt(r.shortfall)} below your protected amount.`;
    case "needs_setup":
      return f ? "Set a Minimum Cash Floor so Monitriq can flag a retained-cash deficit before it occurs." : "Set a minimum cash amount so Monitriq can warn you before you reach it.";
  }
}

function simpleSentence(r: CashStatusResult, fmt: (v: string) => string, variant: CashStatusTextVariant): string {
  if (variant === "money") {
    // One compact line for the Money page's cash card (needs_setup shows nothing there: non-disruptive).
    switch (r.state) {
      case "comfortable":
        return r.nothingProtected ? "" : "Comfortably above the amount you want to keep.";
      case "getting_close":
        return "Getting close to the amount you want to keep.";
      case "at_limit":
        return "At the amount you want to keep.";
      case "below_limit":
        return r.shortfall === null ? "" : `${fmt(r.shortfall)} below the amount you want to keep.`;
      case "needs_setup":
        return "";
    }
  }
  switch (r.state) {
    case "comfortable":
      if (r.nothingProtected) return "You haven't asked Monitriq to protect any money right now.";
      return variant === "after_purchase" && r.headroom !== null
        ? `This would leave ${fmt(r.headroom)} above the amount you want to keep protected.`
        : "You're comfortably above the amount you want to keep protected.";
    case "getting_close":
      if (r.headroom === null) return "";
      if (variant === "after_purchase") return `This would leave ${fmt(r.headroom)} above the amount you want to keep protected.`;
      return variant === "home"
        ? `Only ${fmt(r.headroom)} remains before you reach the amount you're keeping protected.`
        : `You have ${fmt(r.headroom)} left before reaching the amount you're keeping protected.`;
    case "at_limit":
      if (r.nothingProtected) return "You have no cash tracked in this currency right now.";
      return variant === "after_purchase" ? "This would leave you exactly at the amount you want to keep protected." : "Your cash has reached the amount you're keeping protected.";
    case "below_limit":
      if (r.shortfall === null) return "";
      return variant === "after_purchase" ? `This purchase would leave you ${fmt(r.shortfall)} below the amount you chose to keep.` : `Your cash is ${fmt(r.shortfall)} below the amount you chose to keep protected.`;
    case "needs_setup":
      return "Choose the minimum amount of cash you want to keep so Monitriq can warn you before you reach it.";
  }
}
