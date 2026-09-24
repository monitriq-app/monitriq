import type { AssetTypeCode } from "./types.ts";

/**
 * The one centralized source of "what can this asset TYPE actually do" —
 * introduced in P0-E3-S4R after manual QA found a Financial Investment
 * (and every other non-vehicle type) exposing the vehicle lifecycle
 * status and "Record a repair / improvement cost" form, because the
 * shared AssetActionSheet rendered both unconditionally for every asset
 * type (see docs/reports/P0-E3-S4R-asset-subtype-behavior-remediation.txt,
 * "root cause"). This is deliberately NOT a set of `if (asset.type ===
 * "vehicle")` branches scattered through JSX — every place that needs to
 * know what an asset type supports calls `assetCapabilities()` once and
 * reads the typed result.
 *
 * Only capabilities that are ACTUALLY implemented canonically today are
 * modeled here. `supportsReceivableRecovery`, `supportsInvestmentContribution`,
 * `supportsOffers`, `supportsIncomeTracking`, and `supportsDebtLinkage`
 * are all real capabilities future phases describe as deferred work —
 * they are NOT modeled here, because a capability flag that always
 * reads `false` for every type would be dead code pretending to be a
 * real boundary. Add a field only when a real, canonical, per-type-
 * varying behavior exists to gate. `supportsSale` (P0-E4-S1) is the one
 * flag added since that rule was written that corresponds to an actual
 * operation — see its own doc comment.
 */
export interface AssetCapabilities {
  /**
   * The vehicle operational lifecycle (Awaiting Repair -> Repairing ->
   * Ready to List -> Listed -> Offer Received -> Under Negotiation),
   * backed by `assets.status_code`. True ONLY for `vehicle` — enforced
   * redundantly at the database (CHECK constraint) and repository
   * (thrown domain error) layers, not just here; this flag is what the
   * UI reads to decide whether to render the control at all.
   */
  supportsVehicleStatus: boolean;
  /**
   * Recording an additional cost against this asset's cost basis
   * (`record_asset_basis_event` / `asset_basis_events`, basis_event_type
   * 'capital_improvement') — a real, generic, type-agnostic database
   * capability (the RPC itself has no asset-type restriction). Exposed
   * for every type EXCEPT `financial_investment`: the brief explicitly
   * excludes it there, since "repair/improvement" framing has no correct
   * meaning for an investment and no separate canonical "additional
   * contribution" operation exists yet — showing this form for a
   * Financial Investment would mislabel a real mutation, not just use
   * imprecise copy. When true, `capitalImprovementCopy` gives the
   * subtype-appropriate wording; it is never generic "repair" language
   * outside `vehicle`.
   */
  supportsCapitalImprovement: boolean;
  capitalImprovementCopy: { title: string; description: string; submitLabel: string } | null;
  /**
   * The generic Asset Sale/Disposal workflow (`record_asset_sale()`,
   * P0-E4-S1) — recording that a whole asset was actually, truthfully
   * disposed of for real proceeds. True for every type where a
   * whole-asset sale is a truthful representation of what happened:
   * vehicle, property, financial_investment, business_interest,
   * equipment, collectible, other. False for `inventory`: the generic
   * Inventory asset type represents an AGGREGATE holding (a business's
   * inventory as a whole), not a single item — a generic whole-asset
   * "sale" would falsely imply the entire aggregate was liquidated in
   * one transaction, when real inventory is typically sold piecemeal
   * over time. Also false, structurally, for anything that isn't an
   * `assets`-table row at all — Receivables/"Money You're Owed" live in
   * a completely separate domain/table and never reach this function;
   * their disposition path is Recovery, not Sale.
   */
  supportsSale: boolean;
}

const CAPITAL_IMPROVEMENT_COPY: Partial<Record<string, AssetCapabilities["capitalImprovementCopy"]>> = {
  vehicle: {
    title: "Record a repair / improvement cost",
    description: "Adds real capital to this vehicle's cost basis. This only records the cost against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  property: {
    title: "Record a capital improvement",
    description: "Adds real capital to this property's cost basis. This only records the cost against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  equipment: {
    title: "Record an additional capital cost",
    description: "Adds real capital to this equipment's cost basis (e.g. an upgrade or improvement). This only records the cost against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  business_interest: {
    title: "Record additional capital invested",
    description: "Adds to the capital you've invested in this business interest. This only records the amount against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  inventory: {
    title: "Record an additional cost",
    description: "Adds real capital to this asset's cost basis. This only records the cost against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  collectible: {
    title: "Record an additional cost",
    description: "Adds real capital to this asset's cost basis. This only records the cost against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  other: {
    title: "Record an additional cost",
    description: "Adds real capital to this asset's cost basis. This only records the cost against the asset — if you paid from a tracked cash bucket, record that separately as Money Spent.",
    submitLabel: "Add to Cost Basis",
  },
  // financial_investment: deliberately absent — see the field doc comment above.
};

const SALE_INELIGIBLE_TYPES = new Set<string>(["inventory"]);

export function assetCapabilities(assetType: AssetTypeCode): AssetCapabilities {
  const capitalImprovementCopy = CAPITAL_IMPROVEMENT_COPY[assetType] ?? null;
  return {
    supportsVehicleStatus: assetType === "vehicle",
    supportsCapitalImprovement: capitalImprovementCopy !== null,
    capitalImprovementCopy,
    supportsSale: !SALE_INELIGIBLE_TYPES.has(assetType),
  };
}

/**
 * Presentation config for the Add Tracked Asset creation flow (P0-E3-S4R2)
 * — the SAME generic fields every type records (cost basis via
 * `create_asset()`'s `p_initial_basis_amount`, and the three
 * `asset_valuations` rows it can seed: estimated_current_value,
 * quick_sale_estimate, target_value) get type-appropriate LABELS here,
 * never a second data model. Before this, Step 2 showed the identical
 * "Cost Basis / Current Value Estimate / Conservative Quick-Sale Value /
 * Target Value" wording for every asset type except two labels
 * (business_interest/financial_investment's basis+current-value only) —
 * a Vehicle and a Financial Investment read as the same product with a
 * different type tag. `capitalImprovementCopy` above already established
 * this per-type-label pattern for the MANAGE flow; this is the same
 * pattern applied to CREATION. `supportsStatusOnCreate` is deliberately
 * NOT part of this config — it would just duplicate `assetCapabilities
 * (assetType).supportsVehicleStatus`, which the creation form already
 * calls directly, so there is exactly one place that flag lives.
 */
export interface AssetCreationConfig {
  /** Step 2's heading, e.g. "Vehicle values". */
  valuesHeading: string;
  /** Optional short clarifying line shown under the selected type in Step 1 — e.g. distinguishing Financial Investment from Inventory/Stock. */
  helperCopy?: string;
  basisLabel: string;
  currentValueLabel: string;
  quickSaleLabel: string;
  targetValueLabel: string;
}

const CREATION_CONFIG: Partial<Record<string, AssetCreationConfig>> = {
  vehicle: {
    valuesHeading: "Vehicle values",
    helperCopy: "A vehicle you own or are reselling.",
    basisLabel: "What did you pay?",
    currentValueLabel: "Current / As-Is value",
    quickSaleLabel: "Quick-sale estimate",
    targetValueLabel: "Target sale price",
  },
  property: {
    valuesHeading: "Property values",
    helperCopy: "Land or real estate you own.",
    basisLabel: "What did you pay?",
    currentValueLabel: "Estimated value",
    quickSaleLabel: "Quick-sale estimate",
    targetValueLabel: "Target",
  },
  business_interest: {
    valuesHeading: "Business interest values",
    helperCopy: "An investment or stake you hold in a business.",
    basisLabel: "Amount invested",
    currentValueLabel: "Estimated business value",
    quickSaleLabel: "Estimated exit value",
    targetValueLabel: "Target",
  },
  financial_investment: {
    valuesHeading: "Investment values",
    helperCopy: "Shares, funds, bonds and similar investments.",
    basisLabel: "How much have you invested?",
    currentValueLabel: "Current value",
    quickSaleLabel: "Liquidation estimate",
    targetValueLabel: "Target",
  },
  equipment: {
    valuesHeading: "Equipment values",
    helperCopy: "Machinery, tools, or other equipment you own.",
    basisLabel: "What did you pay?",
    currentValueLabel: "Current value",
    quickSaleLabel: "Resale estimate",
    targetValueLabel: "Target",
  },
  inventory: {
    valuesHeading: "Inventory values",
    helperCopy: "Goods or inventory held for resale.",
    basisLabel: "What did it cost?",
    currentValueLabel: "Current value",
    quickSaleLabel: "Clearance estimate",
    targetValueLabel: "Target sale price",
  },
  collectible: {
    valuesHeading: "Collectible values",
    helperCopy: "An item held for its value, not everyday use.",
    basisLabel: "What did you pay?",
    currentValueLabel: "Current value",
    quickSaleLabel: "Quick-sale estimate",
    targetValueLabel: "Target",
  },
  other: {
    valuesHeading: "Asset values",
    basisLabel: "What did you pay?",
    currentValueLabel: "Current value",
    quickSaleLabel: "Quick-sale estimate",
    targetValueLabel: "Target",
  },
};

const DEFAULT_CREATION_CONFIG: AssetCreationConfig = CREATION_CONFIG.other!;

export function assetCreationConfig(assetType: AssetTypeCode): AssetCreationConfig {
  return CREATION_CONFIG[assetType] ?? DEFAULT_CREATION_CONFIG;
}

/**
 * Presentation config for DISPLAYING an existing asset — AssetCard's
 * default card, AssetActionSheet's valuation-update dropdown, and Sold
 * Assets/Sell Asset's basis label (P0-E4-S2). A sibling to
 * `assetCreationConfig()` above, not a duplicate of it: creation labels
 * are phrased as short FORM QUESTIONS ("What did you pay?"); these are
 * phrased as compact CARD/FIELD LABELS ("What You Paid") for the same
 * underlying fact, because a card is read, not filled in. Centralizing
 * both here (rather than in the components that consume them) is what
 * keeps a Vehicle and a Financial Investment genuinely reading as
 * different products, not just differently-question-worded forms with
 * identical cards underneath.
 *
 * `showGainLoss` and `emphasizeQuickSale` are presentation-priority
 * flags, not new data: every asset type already has the same four raw
 * fields (basis, current value, quick-sale estimate, target) — these
 * flags decide which of them lead the DEFAULT card for that type. A
 * Financial Investment/Business Interest is something you track for
 * growth, so its default card leads with a computed Gain/Loss.
 *
 * Vehicle is deliberately NOT `emphasizeQuickSale` (P0-E4-S2A
 * correction — an earlier pass in this same phase had it `true` on the
 * assumption a vehicle is "usually" resale-oriented; that assumption
 * doesn't hold, since Monatriq has no canonical way to distinguish a
 * personal-use vehicle from a business-use or resale-intent one — see
 * `assetCapabilities()`'s own doc comment, which has no such field
 * either). Emphasizing quick-sale by default would silently assume
 * every vehicle is for sale, which is untruthful for a purely
 * personal-use car. So Vehicle's default card stays neutral — What You
 * Paid / Current-As-Is Value only — exactly like Property/Equipment/
 * Collectible/Other; Quick-Sale Estimate and Target Sale Price move
 * into "More details" alongside every other type's secondary figures,
 * and vehicle status editing remains fully available in "Manage"
 * (AssetActionSheet, gated on `supportsVehicleStatus`, unaffected by
 * this change). No vehicle-purpose/classification schema field was
 * added to make this decision — it is a presentation default, not a
 * new canonical fact.
 *
 * Gain/Loss itself is never computed or stored here — it is derived at
 * render time from the SAME `costBasis`/`estimatedCurrentValue` strings
 * `asset_summary()` already returns, using Decimal.js (never
 * `Number()`/`parseFloat()`), and is shown ONLY when both values are
 * genuinely present — never a fabricated zero. The user-facing label
 * for this figure is "Unrealized Gain / Loss" (AssetCard, P0-E4-S2A) —
 * never plain "Gain / Loss", which doesn't distinguish it from a
 * realised, cash-settled Asset Sale outcome ("Profit / Loss on Sale").
 */
export interface AssetDisplayConfig {
  basisLabel: string;
  currentValueLabel: string;
  quickSaleLabel: string;
  targetLabel: string;
  /** Show a computed Gain/Loss (current value − basis) on the default card, when both values exist. */
  showGainLoss: boolean;
  /** Keep the quick-sale figure in the default card's primary grid instead of demoting it behind "More details". */
  emphasizeQuickSale: boolean;
}

const DISPLAY_CONFIG: Partial<Record<string, AssetDisplayConfig>> = {
  vehicle: {
    basisLabel: "What You Paid",
    currentValueLabel: "Current / As-Is Value",
    quickSaleLabel: "Quick-Sale Estimate",
    targetLabel: "Target Sale Price",
    showGainLoss: false,
    emphasizeQuickSale: false,
  },
  property: {
    basisLabel: "What You Paid",
    currentValueLabel: "Estimated Value",
    quickSaleLabel: "Quick-Sale Estimate",
    targetLabel: "Target",
    showGainLoss: false,
    emphasizeQuickSale: false,
  },
  business_interest: {
    basisLabel: "Amount Invested",
    currentValueLabel: "Estimated Business Value",
    quickSaleLabel: "Estimated Exit Value",
    targetLabel: "Target",
    showGainLoss: true,
    emphasizeQuickSale: false,
  },
  financial_investment: {
    basisLabel: "Invested",
    currentValueLabel: "Current Value",
    quickSaleLabel: "Liquidation Estimate",
    targetLabel: "Target",
    showGainLoss: true,
    emphasizeQuickSale: false,
  },
  equipment: {
    basisLabel: "What You Paid",
    currentValueLabel: "Current Value",
    quickSaleLabel: "Resale Estimate",
    targetLabel: "Target",
    showGainLoss: false,
    emphasizeQuickSale: false,
  },
  inventory: {
    basisLabel: "What It Cost",
    currentValueLabel: "Current Value",
    quickSaleLabel: "Clearance Estimate",
    targetLabel: "Target",
    showGainLoss: false,
    emphasizeQuickSale: false,
  },
  collectible: {
    basisLabel: "What You Paid",
    currentValueLabel: "Current Value",
    quickSaleLabel: "Quick-Sale Estimate",
    targetLabel: "Target",
    showGainLoss: false,
    emphasizeQuickSale: false,
  },
  other: {
    basisLabel: "What You Paid",
    currentValueLabel: "Current Value",
    quickSaleLabel: "Quick-Sale Estimate",
    targetLabel: "Target",
    showGainLoss: false,
    emphasizeQuickSale: false,
  },
};

const DEFAULT_DISPLAY_CONFIG: AssetDisplayConfig = DISPLAY_CONFIG.other!;

export function assetDisplayConfig(assetType: AssetTypeCode): AssetDisplayConfig {
  return DISPLAY_CONFIG[assetType] ?? DEFAULT_DISPLAY_CONFIG;
}
