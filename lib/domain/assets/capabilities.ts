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
 * `supportsSale`, `supportsOffers`, `supportsIncomeTracking`, and
 * `supportsDebtLinkage` are all real capabilities the P0-E3-S4/P0-E3-S4R
 * briefs describe as future/deferred work — they are NOT modeled here,
 * because a capability flag that always reads `false` for every type
 * would be dead code pretending to be a real boundary. Add a field only
 * when a real, canonical, per-type-varying behavior exists to gate.
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

export function assetCapabilities(assetType: AssetTypeCode): AssetCapabilities {
  const capitalImprovementCopy = CAPITAL_IMPROVEMENT_COPY[assetType] ?? null;
  return {
    supportsVehicleStatus: assetType === "vehicle",
    supportsCapitalImprovement: capitalImprovementCopy !== null,
    capitalImprovementCopy,
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
    basisLabel: "Cost Basis",
    currentValueLabel: "Current / As-Is Value",
    quickSaleLabel: "Conservative Quick-Sale Value",
    targetValueLabel: "Target Sale Value",
  },
  property: {
    valuesHeading: "Property values",
    helperCopy: "Land or real estate you own.",
    basisLabel: "Purchase / Cost Basis",
    currentValueLabel: "Current Estimated Value",
    quickSaleLabel: "Conservative Sale Value",
    targetValueLabel: "Target Value",
  },
  business_interest: {
    valuesHeading: "Business interest values",
    helperCopy: "An investment or stake you hold in a business.",
    basisLabel: "Capital Invested",
    currentValueLabel: "Estimated Business Value",
    quickSaleLabel: "Estimated Exit / Liquidation Value",
    targetValueLabel: "Target Value",
  },
  financial_investment: {
    valuesHeading: "Investment values",
    helperCopy: "Shares, funds, bonds and similar investments.",
    basisLabel: "Amount Invested / Cost Basis",
    currentValueLabel: "Current Estimated Value",
    quickSaleLabel: "Estimated Liquidation Value",
    targetValueLabel: "Target Value",
  },
  equipment: {
    valuesHeading: "Equipment values",
    helperCopy: "Machinery, tools, or other equipment you own.",
    basisLabel: "Purchase Cost / Cost Basis",
    currentValueLabel: "Current Estimated Value",
    quickSaleLabel: "Estimated Resale Value",
    targetValueLabel: "Target Value",
  },
  inventory: {
    valuesHeading: "Inventory values",
    helperCopy: "Goods or inventory held for resale.",
    basisLabel: "Inventory Cost Basis",
    currentValueLabel: "Current Inventory Value",
    quickSaleLabel: "Estimated Clearance / Liquidation Value",
    targetValueLabel: "Target Sale Value",
  },
  collectible: {
    valuesHeading: "Collectible values",
    helperCopy: "An item held for its value, not everyday use.",
    basisLabel: "Acquisition Cost",
    currentValueLabel: "Current Estimated Value",
    quickSaleLabel: "Quick-Sale Estimate",
    targetValueLabel: "Target Value",
  },
  other: {
    valuesHeading: "Asset values",
    basisLabel: "Cost Basis",
    currentValueLabel: "Current Estimated Value",
    quickSaleLabel: "Estimated Liquidation Value",
    targetValueLabel: "Target Value",
  },
};

const DEFAULT_CREATION_CONFIG: AssetCreationConfig = CREATION_CONFIG.other!;

export function assetCreationConfig(assetType: AssetTypeCode): AssetCreationConfig {
  return CREATION_CONFIG[assetType] ?? DEFAULT_CREATION_CONFIG;
}
