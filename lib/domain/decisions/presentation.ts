import { Decimal } from "decimal.js";
import type { DecisionScenarioEvaluation, DecisionTypeCode } from "./types.ts";

/**
 * Centralized per-decision-type presentation config (P0-E4-S3) — the
 * Decisions equivalent of Assets' `assetDisplayConfig()`/
 * `assetCreationConfig()` pattern. Every decision type shares the SAME
 * underlying `decision_scenarios` columns and the SAME
 * `evaluate_decision_scenario()` shape; only which fields are relevant,
 * and what plain-language question/label fits them, varies by type. This
 * is the ONE place that mapping lives — the scenario creation form and
 * the decision review sheet both read from here, so a Sell Asset
 * scenario and a Repair scenario read as genuinely different products
 * even though they write to the same table.
 *
 * Deliberately does NOT introduce new domain semantics: every field
 * referenced here already exists on `CreateDecisionScenarioInput`/
 * `DecisionScenarioEvaluation`. This file only decides which of those
 * existing fields are relevant per type, and what to call them.
 */
export interface DecisionTypePresentation {
  /** Short plain-language subtitle for the type-picker tile. */
  subtitle: string;

  /** Primary cash-out assumption (decision_scenarios.cash_required) — the main "how much" question for outflow-shaped decisions. Absent (null) for types where cash_required isn't the primary question. */
  cashRequiredLabel: string | null;
  /** Secondary/advanced outflow cost (decision_scenarios.acquisition_costs) — only meaningful for buy_asset today. */
  acquisitionCostsLabel: string | null;

  /** Primary cash-in assumption (decision_scenarios.gross_proceeds) — "how much would you receive" for inflow-shaped decisions. */
  grossProceedsLabel: string | null;
  /** Costs deducted from proceeds (decision_scenarios.proceeds_costs). */
  proceedsCostsLabel: string | null;
  /** What the review sheet calls the derived net_proceeds figure once costs are deducted. */
  netProceedsLabel: string;

  /** pay_down_debt's three-way payment split. */
  showsDebtPaymentSplit: boolean;

  /** take_debt's loan terms (interest rate / term / monthly payment / collateral). */
  showsLoanTerms: boolean;

  /** A free-form "what do you expect this to be worth" assumption — advanced/optional, never inferred. */
  showsExpectedValue: boolean;
  expectedValueLabel: string;

  /** repair_improve_asset's target-value-after-repair + capitalize-vs-expense classification. */
  showsRepairFields: boolean;

  allowsSourceBucket: boolean;
  sourceBucketLabel: string;
  allowsDestinationBucket: boolean;
  destinationBucketLabel: string;

  /**
   * Whether the review sheet shows `projectedGrossProfitLoss` at all, and
   * what it's called. Only `sell_asset` gets "Estimated Profit / Loss" —
   * per the brief, a Repair/Improve scenario must NOT be called a profit
   * unless it actually represents a sale with selling costs known, so
   * repair scenarios show "Expected Final Amount Invested" instead (via
   * `basisAfterCapitalizedImprovement`, a separate evaluation field) and
   * leave this off.
   */
  showsProfitLoss: boolean;
  profitLossLabel: string;

  /** Whether linking an existing asset is relevant at all for this type (buy_asset links nothing — the asset doesn't exist yet). */
  showsAssetLink: boolean;
  assetLinkLabel: string;
  /** Which asset capability gates the picker's candidate list — 'supportsSale' for sell_asset, 'supportsCapitalImprovement' for repair, null when any active asset is a reasonable link. */
  assetLinkCapability: "supportsSale" | "supportsCapitalImprovement" | null;
  showsLiabilityLink: boolean;
  liabilityLinkLabel: string;

  /**
   * Required-input integrity (P0-E4-S3B). A link/bucket that's merely
   * SHOWN is still optional unless one of these is also true — set only
   * where the domain's own evaluation is largely meaningless without it
   * (e.g. Sell Asset has no cost-basis/current-value facts and no
   * profit/loss without a linked asset; Pay Down Debt has no outstanding
   * principal or remaining-debt figure without a linked liability).
   * Enforced client-side only (no DB CHECK constraint was added this
   * phase — `linked_liability_id`/`linked_asset_id` remain nullable at
   * the schema level, so legacy decisions created before this rule
   * existed keep loading normally; see `DecisionReviewSheet`'s
   * incomplete-decision handling).
   */
  assetLinkRequired: boolean;
  /** Plain-language validation message shown when a required asset link is missing — never a raw field name. */
  assetLinkRequiredMessage: string;
  liabilityLinkRequired: boolean;
  liabilityLinkRequiredMessage: string;
  /** Only meaningful when `allowsSourceBucket` is true — e.g. Use Savings has no truthful cash-after/protection effect without picking which account. */
  sourceBucketRequired: boolean;
  sourceBucketRequiredMessage: string;
}

const DEFAULT: DecisionTypePresentation = {
  subtitle: "A financial decision you're weighing.",
  cashRequiredLabel: "Amount (optional)",
  acquisitionCostsLabel: null,
  grossProceedsLabel: null,
  proceedsCostsLabel: null,
  netProceedsLabel: "Money Released",
  showsDebtPaymentSplit: false,
  showsLoanTerms: false,
  showsExpectedValue: false,
  expectedValueLabel: "Your estimate (optional)",
  showsRepairFields: false,
  allowsSourceBucket: true,
  sourceBucketLabel: "Cash account (optional)",
  allowsDestinationBucket: true,
  destinationBucketLabel: "Cash account (optional)",
  showsProfitLoss: false,
  profitLossLabel: "Estimated Profit / Loss",
  showsAssetLink: false,
  assetLinkLabel: "Linked asset (optional)",
  assetLinkCapability: null,
  showsLiabilityLink: false,
  liabilityLinkLabel: "Linked debt (optional)",
  assetLinkRequired: false,
  assetLinkRequiredMessage: "Choose an asset.",
  liabilityLinkRequired: false,
  liabilityLinkRequiredMessage: "Choose a debt.",
  sourceBucketRequired: false,
  sourceBucketRequiredMessage: "Choose an account.",
};

const CONFIG: Record<DecisionTypeCode, DecisionTypePresentation> = {
  buy_asset: {
    ...DEFAULT,
    subtitle: "Vehicles, land, equipment and similar purchases.",
    cashRequiredLabel: "Purchase Amount",
    acquisitionCostsLabel: "Additional Known Costs (optional)",
    showsExpectedValue: true,
    expectedValueLabel: "What you expect it to be worth (optional)",
    sourceBucketLabel: "Pay from (optional)",
    allowsDestinationBucket: false,
  },
  sell_asset: {
    ...DEFAULT,
    subtitle: "Something you already own.",
    allowsSourceBucket: false,
    grossProceedsLabel: "Possible Sale Price",
    proceedsCostsLabel: "Selling Costs (optional)",
    netProceedsLabel: "Money You'd Receive After Costs",
    destinationBucketLabel: "Add money to (optional)",
    showsProfitLoss: true,
    profitLossLabel: "Estimated Profit / Loss",
    showsAssetLink: true,
    assetLinkLabel: "Which asset?",
    assetLinkCapability: "supportsSale",
    assetLinkRequired: true,
    assetLinkRequiredMessage: "Choose the asset you want to evaluate selling.",
  },
  repair_improve_asset: {
    ...DEFAULT,
    subtitle: "Repairs, refits and improvements to something you own.",
    cashRequiredLabel: "Planned Repair / Improvement Cost",
    sourceBucketLabel: "Pay from (optional)",
    allowsDestinationBucket: false,
    showsRepairFields: true,
    showsAssetLink: true,
    assetLinkLabel: "Which asset?",
    assetLinkCapability: "supportsCapitalImprovement",
    assetLinkRequired: true,
    assetLinkRequiredMessage: "Choose the asset you want to evaluate repairing.",
  },
  business_investment: {
    ...DEFAULT,
    subtitle: "Capital contributions or equity in a business.",
    cashRequiredLabel: "Amount Invested",
    showsExpectedValue: true,
    expectedValueLabel: "Your estimate of value (optional)",
    sourceBucketLabel: "Pay from (optional)",
    allowsDestinationBucket: false,
    showsAssetLink: true,
    assetLinkLabel: "Linked business interest (optional)",
    assetLinkCapability: null,
  },
  large_personal_purchase: {
    ...DEFAULT,
    subtitle: "A major personal expense.",
    cashRequiredLabel: "Amount",
    sourceBucketLabel: "Pay from (optional)",
    allowsDestinationBucket: false,
  },
  use_savings: {
    ...DEFAULT,
    subtitle: "Money already set aside in your own accounts.",
    cashRequiredLabel: "Amount",
    sourceBucketLabel: "From account",
    allowsDestinationBucket: false,
    sourceBucketRequired: true,
    sourceBucketRequiredMessage: "Choose the account you'd use.",
  },
  take_debt: {
    ...DEFAULT,
    subtitle: "New borrowing.",
    allowsSourceBucket: false,
    grossProceedsLabel: "Proposed Principal",
    proceedsCostsLabel: "Fees Deducted From Proceeds (optional)",
    netProceedsLabel: "Cash Received",
    destinationBucketLabel: "Add money to (optional)",
    showsLoanTerms: true,
  },
  pay_down_debt: {
    ...DEFAULT,
    subtitle: "Reduce what you owe.",
    cashRequiredLabel: null,
    sourceBucketLabel: "Pay from (optional)",
    allowsDestinationBucket: false,
    showsDebtPaymentSplit: true,
    showsLiabilityLink: true,
    liabilityLinkLabel: "Which debt?",
    liabilityLinkRequired: true,
    liabilityLinkRequiredMessage: "Choose the debt you want to pay down.",
  },
  start_new_venture: {
    ...DEFAULT,
    subtitle: "A new business or project.",
    cashRequiredLabel: "Initial Cash Needed",
    sourceBucketLabel: "Pay from (optional)",
    allowsDestinationBucket: false,
  },
  other: {
    ...DEFAULT,
    subtitle: "Anything else you're weighing.",
    cashRequiredLabel: "Amount (optional)",
    grossProceedsLabel: "Amount received (optional)",
    netProceedsLabel: "Money Released",
    sourceBucketLabel: "Pay from (optional)",
    destinationBucketLabel: "Add money to (optional)",
  },
};

export function decisionTypePresentation(code: DecisionTypeCode): DecisionTypePresentation {
  return CONFIG[code] ?? DEFAULT;
}

/** The one neutral rule-relationship vocabulary — never a recommendation, never Pass/Fail. */
export const RULE_STATUS_LABELS: Record<string, string> = {
  aligned: "Aligned",
  attention: "Attention",
  conflict: "Conflict",
  not_configured: "Not configured",
  insufficient_information: "Insufficient information",
};

export const CHOICE_LABELS: Record<string, string> = {
  proceed: "Proceed",
  wait: "Wait",
  decline: "Decline",
  keep_reviewing: "Keep Reviewing",
};

/**
 * Plain explanations for evaluate_decision_scenario()'s missing_
 * information codes (P0-E4-S3A) — one specific sentence per code, never
 * a generic "the evaluation is incomplete." Facts/derived values that
 * ARE available (e.g. Cash Required, Cash After) stay visible alongside
 * these — a missing debt link never hides an already-calculated cash
 * figure. `title` is a short label for the specific thing that's
 * missing (e.g. "Debt impact not calculated"); `body` is the one-line
 * plain-language fix.
 */
export const MISSING_INFO_LABELS: Record<string, { title: string; body: string }> = {
  no_bucket_linked: { title: "Cash impact not calculated", body: "Add a cash account to this scenario to calculate its cash impact." },
  no_amount_specified: { title: "Amount not calculated", body: "Add an amount to this scenario to calculate this." },
  no_asset_linked: { title: "Asset impact not calculated", body: "Link an asset to this decision to calculate this." },
  no_liability_linked: { title: "Debt impact not calculated", body: "Link a debt to this decision to calculate the remaining balance." },
};

/**
 * Turns a SIGNED cash-delta string into a directional label + its
 * absolute magnitude (P0-E4-S3A) — the fix for "Cash Required
 * NGN -500,000.00," a double-negative reading (a directional label
 * already implies the sign; repeating it in the number reads as
 * confusing, not precise). The underlying signed figure
 * (`netImmediateCashDelta` etc.) is never altered — this only decides
 * how to LABEL and DISPLAY it. A negative delta (cash going out) gets
 * `negativeLabel` ("Cash Required") shown as a positive magnitude; a
 * non-negative delta gets `positiveLabel` ("Cash Received" / "Money
 * Released" / the type's own `netProceedsLabel`), also shown as a
 * positive magnitude. Uses Decimal.js exclusively — never `Number()`/
 * `parseFloat()` — so no precision is lost taking the absolute value.
 * Centralized here specifically so no component ever calls
 * `Decimal(...).abs()` inline in JSX.
 */
export function directionalCashAmount(delta: string, positiveLabel: string, negativeLabel: string): { label: string; magnitude: string } {
  const value = new Decimal(delta);
  return {
    label: value.isNegative() ? negativeLabel : positiveLabel,
    magnitude: value.abs().toString(),
  };
}

/**
 * For the few places a genuinely SIGNED value is intentionally shown
 * under a neutral label ("Net Cash Effect" / "Net cash effect") — never
 * combined with a directional label like "Cash Required". Returns the
 * sign prefix ("+"/"") to prepend to the already-formatted (currency-
 * prefixed) string, since `formatCurrencyAmount()` itself never adds a
 * leading "+" for a non-negative amount.
 */
export function signPrefix(value: string): string {
  return new Decimal(value).isNegative() ? "" : "+";
}

// ---------------------------------------------------------------------------
// "How this was calculated" (P0-E4-S3B)
// ---------------------------------------------------------------------------

/** The restrained provenance vocabulary the brief specifies — never a database field name. */
export type ExplanationTermKind = "tracked" | "assumption" | "calculated";

export interface ExplanationTerm {
  kind: ExplanationTermKind;
  label: string;
  /** Raw decimal string — formatted by the caller, which owns the Currency map. */
  amount: string;
  sign: "+" | "-";
}

export interface ExplanationResult {
  label: string;
  /** Always copied verbatim from a canonical `DecisionScenarioEvaluation` field — never summed from `terms`. `terms` is explanatory only. */
  amount: string;
}

export interface CalculationExplanationBlock {
  key: "cash" | "debt" | "profitLoss" | "safeToDeploy";
  title: string;
  calculated: boolean;
  /** Present only when `calculated` — the inputs that fed the canonical result, purely explanatory. */
  terms: ExplanationTerm[];
  result: ExplanationResult | null;
  /** Present only when NOT `calculated` — a specific, plain-language reason, never a generic "insufficient information." */
  reason: string | null;
  actionLabel?: string;
  actionHref?: string;
  /** Read-only supporting facts shown WITHOUT an implied arithmetic relationship to `result` (e.g. Safe to Deploy's configured minimum) — see the function's own doc comment for why these are never combined into a displayed equation. */
  context: { label: string; amount: string }[];
  /**
   * Which `missing_information` code(s), if any, this block's own
   * `reason` text already explains (P0-E4-S3C) — e.g. the debt block's
   * "Choose a debt to evaluate its remaining balance." already explains
   * `no_liability_linked`. Used to deduplicate the separate "Not Yet
   * Calculated" list, which would otherwise repeat the exact same
   * unresolved calculation as a second card. Empty when `calculated` is
   * true, or when a reason was inferred from raw field nullness rather
   * than an actual canonical missing-information code (e.g. Sell
   * Asset's "Add what you originally paid or invested" — there is no
   * `missing_information` code for an unknown cost basis, so there is
   * nothing to deduplicate against).
   */
  coveredMissingInfoCodes: string[];
}

/**
 * Builds the presentation-only "How this was calculated" explanation for
 * a Decision Review sheet (P0-E4-S3B). This function explains an
 * ALREADY-canonical `DecisionScenarioEvaluation` — it never computes a
 * new financial fact. Every `result.amount` is copied verbatim from a
 * field `evaluate_decision_scenario()` already returned; `terms` exist
 * only to show the user what fed that result, using the SAME numbers
 * the RPC already returned (`bucketBalanceBefore`, `totalCashRequired`,
 * `netProceeds`, `linkedLiabilityOutstandingPrincipal`, etc.) — never a
 * second, independently-derived number.
 *
 * Deliberately conservative about Safe to Deploy: `safe_to_deploy_by_
 * currency()`/`evaluate_hypothetical_bucket_liquidity()` compute Safe to
 * Deploy from LIQUID CASH ACROSS EVERY BUCKET in a currency, never one
 * bucket alone — but `DecisionScenarioEvaluation` only exposes ONE
 * bucket's before/after balance (`bucketBalanceBefore`/
 * `bucketBalanceAfter`). Showing "Cash after (this bucket) − Minimum
 * cash to keep = Safe to Deploy after" would silently substitute a
 * bucket-scoped number for the real currency-scoped one the engine
 * actually used — a forked, WRONG formula, not an explanation of the
 * real one. So the Safe to Deploy block never draws an equation: it
 * shows the canonical `currencySafeToDeployAfter` result plus the
 * user's own configured minimum (a real, static, non-hypothetical fact
 * from `getFinancialRuleSummaries()`, passed in as `minimumCashFloor`)
 * as read-only CONTEXT, never as an arithmetic input. "Protected
 * commitments" from the brief's own example was deliberately left out
 * of `context` for the same reason: it's only exposed for CURRENT state
 * (`SafeToDeployResult.protectedCommitments`), not the hypothetical-
 * after state a hypothetical hypotheticalBucketId hasn't recomputed —
 * showing it next to an "after" result would misleadingly imply it were
 * also hypothetical-after when it is not.
 */
export function buildDecisionCalculationExplanation(
  presentation: DecisionTypePresentation,
  evaluation: DecisionScenarioEvaluation,
  minimumCashFloor: { configured: boolean; amount: string | null },
): CalculationExplanationBlock[] {
  const blocks: CalculationExplanationBlock[] = [];
  const missing = new Set(evaluation.missingInformation);
  const hasCashRelevance = presentation.cashRequiredLabel !== null || presentation.grossProceedsLabel !== null || presentation.showsDebtPaymentSplit;

  // CASH
  if (hasCashRelevance) {
    if (evaluation.bucketBalanceAfter !== null) {
      const terms: ExplanationTerm[] = [];
      if (evaluation.bucketBalanceBefore !== null) {
        terms.push({ kind: "tracked", label: "Cash before", amount: evaluation.bucketBalanceBefore, sign: "+" });
      }
      if (presentation.showsDebtPaymentSplit) {
        // P0-E4-S3C: provenance must describe where the amount actually
        // came from. A plain payment (only debt_principal_payment set)
        // is the user's OWN single assumption — showing it as
        // "Calculated · Total payment" is confusing when nothing was
        // actually summed. Only when separate components (interest/
        // fees) are genuinely present is `totalCashRequired` a real
        // derived sum worth labeling "Calculated" — and even then it is
        // displayed verbatim from the canonical field, never re-summed
        // here.
        const hasSeparateComponents = evaluation.debtInterestPayment !== null || evaluation.debtFeePayment !== null;
        if (hasSeparateComponents) {
          if (evaluation.totalCashRequired !== null) terms.push({ kind: "calculated", label: "Total payment", amount: evaluation.totalCashRequired, sign: "-" });
        } else if (evaluation.debtPrincipalPayment !== null) {
          terms.push({ kind: "assumption", label: "Payment amount", amount: evaluation.debtPrincipalPayment, sign: "-" });
        } else if (evaluation.totalCashRequired !== null) {
          terms.push({ kind: "calculated", label: "Total payment", amount: evaluation.totalCashRequired, sign: "-" });
        }
      } else if (presentation.grossProceedsLabel !== null) {
        if (evaluation.netProceeds !== null) terms.push({ kind: "calculated", label: presentation.netProceedsLabel, amount: evaluation.netProceeds, sign: "+" });
      } else if (presentation.cashRequiredLabel !== null && evaluation.cashRequired !== null) {
        terms.push({ kind: "assumption", label: presentation.cashRequiredLabel, amount: evaluation.cashRequired, sign: "-" });
      }
      blocks.push({ key: "cash", title: "Cash after", calculated: true, terms, result: { label: "Cash after", amount: evaluation.bucketBalanceAfter }, reason: null, context: [], coveredMissingInfoCodes: [] });
    } else {
      let reason: string;
      let covered: string[];
      if (missing.has("no_bucket_linked")) {
        reason = "Choose the cash account this decision would use.";
        covered = ["no_bucket_linked"];
      } else if (missing.has("no_amount_specified")) {
        reason = "Add an amount to calculate this.";
        covered = ["no_amount_specified"];
      } else {
        reason = "Add the missing information to calculate this.";
        covered = [];
      }
      blocks.push({ key: "cash", title: "Cash after", calculated: false, terms: [], result: null, reason, context: [], coveredMissingInfoCodes: covered });
    }
  }

  // DEBT — shown for any type that actually shows/requires a liability link, or that happens to have one linked (legacy data).
  const showsDebtBlock = presentation.showsLiabilityLink || evaluation.linkedLiabilityId !== null;
  if (showsDebtBlock) {
    if (evaluation.hypotheticalLiabilityOutstandingAfter !== null) {
      const terms: ExplanationTerm[] = [];
      if (evaluation.linkedLiabilityOutstandingPrincipal !== null) terms.push({ kind: "tracked", label: "Current debt", amount: evaluation.linkedLiabilityOutstandingPrincipal, sign: "+" });
      if (evaluation.debtPrincipalPayment !== null) terms.push({ kind: "assumption", label: "Principal payment", amount: evaluation.debtPrincipalPayment, sign: "-" });
      blocks.push({ key: "debt", title: "Remaining debt", calculated: true, terms, result: { label: "Remaining debt", amount: evaluation.hypotheticalLiabilityOutstandingAfter }, reason: null, context: [], coveredMissingInfoCodes: [] });
    } else {
      let reason: string;
      let covered: string[];
      if (evaluation.linkedLiabilityId === null) {
        reason = "Choose a debt to evaluate its remaining balance.";
        covered = ["no_liability_linked"];
      } else if (missing.has("no_amount_specified")) {
        reason = "Add a payment amount to calculate this.";
        covered = ["no_amount_specified"];
      } else {
        reason = "Add the missing information to calculate this.";
        covered = [];
      }
      blocks.push({ key: "debt", title: "Remaining debt", calculated: false, terms: [], result: null, reason, context: [], coveredMissingInfoCodes: covered });
    }
  }

  // PROFIT / LOSS — sell_asset only.
  if (presentation.showsProfitLoss) {
    if (evaluation.projectedGrossProfitLoss !== null) {
      const terms: ExplanationTerm[] = [];
      if (evaluation.netProceeds !== null) terms.push({ kind: "calculated", label: presentation.netProceedsLabel, amount: evaluation.netProceeds, sign: "+" });
      if (evaluation.linkedAssetCostBasis !== null) terms.push({ kind: "tracked", label: "What you have invested", amount: evaluation.linkedAssetCostBasis, sign: "-" });
      blocks.push({ key: "profitLoss", title: presentation.profitLossLabel, calculated: true, terms, result: { label: presentation.profitLossLabel, amount: evaluation.projectedGrossProfitLoss }, reason: null, context: [], coveredMissingInfoCodes: [] });
    } else {
      let reason = "Add the missing information to calculate this.";
      let covered: string[] = [];
      if (evaluation.linkedAssetId === null) {
        reason = "Link an asset to calculate this.";
        covered = ["no_asset_linked"];
      } else if (evaluation.linkedAssetCostBasis === null) {
        // No canonical missing_information code exists for "asset linked
        // but cost basis unknown" — nothing to mark covered; "Not Yet
        // Calculated" only ever lists real missing_information codes, so
        // there is no risk of this duplicating there.
        reason = "Add what you originally paid or invested to calculate this.";
      } else if (evaluation.netProceeds === null) {
        reason = "Add a possible sale price to calculate this.";
      }
      blocks.push({ key: "profitLoss", title: presentation.profitLossLabel, calculated: false, terms: [], result: null, reason, context: [], coveredMissingInfoCodes: covered });
    }
  }

  // SAFE TO DEPLOY — see the function's own doc comment for why this never shows an equation.
  if (hasCashRelevance) {
    if (evaluation.currencySafeToDeployAfter !== null) {
      const context: { label: string; amount: string }[] = [];
      if (minimumCashFloor.configured && minimumCashFloor.amount !== null) {
        context.push({ label: "Minimum cash to keep", amount: minimumCashFloor.amount });
      }
      blocks.push({ key: "safeToDeploy", title: "Safe to Deploy after", calculated: true, terms: [], result: { label: "Safe to Deploy after", amount: evaluation.currencySafeToDeployAfter }, reason: null, context, coveredMissingInfoCodes: [] });
    } else {
      let reason: string;
      let actionLabel: string | undefined;
      let actionHref: string | undefined;
      let covered: string[] = [];
      if (evaluation.hypotheticalBucketId === null) {
        reason = "Choose the cash account this decision would use.";
        covered = ["no_bucket_linked"];
      } else if (!minimumCashFloor.configured) {
        // Not a missing_information code — a separate Rules-configuration
        // state — so nothing to mark covered here either.
        reason = `Set your Minimum Cash to Keep for ${evaluation.currencyCode} before Monitriq can calculate this.`;
        actionLabel = "Set minimum cash";
        actionHref = "/rules";
      } else {
        reason = "Add the missing information to calculate this.";
      }
      blocks.push({ key: "safeToDeploy", title: "Safe to Deploy after", calculated: false, terms: [], result: null, reason, actionLabel, actionHref, context: [], coveredMissingInfoCodes: covered });
    }
  }

  return blocks;
}

/**
 * The union of every `missing_information` code already explained by
 * one of `blocks`' own not-calculated reasons (P0-E4-S3C) — pass this
 * to filter a decision's `missingInformation` list before rendering
 * "Not Yet Calculated", so the same unresolved calculation is never
 * shown twice in the same review (once inside "How this was
 * calculated," once again as its own card below). A code NOT in this
 * set means no visible transparency block already explains it, so it
 * still belongs in "Not Yet Calculated."
 */
export function coveredMissingInfoCodes(blocks: CalculationExplanationBlock[]): Set<string> {
  const covered = new Set<string>();
  for (const block of blocks) {
    for (const code of block.coveredMissingInfoCodes) covered.add(code);
  }
  return covered;
}
