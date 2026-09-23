// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

export type Asset = Database["public"]["Tables"]["assets"]["Row"];
export type AssetType = Database["public"]["Tables"]["asset_types"]["Row"];
export type AssetTypeCode = Asset["asset_type"];
export type AssetBasisEvent = Database["public"]["Tables"]["asset_basis_events"]["Row"];
export type AssetValuation = Database["public"]["Tables"]["asset_valuations"]["Row"];
export type ValuationType = AssetValuation["valuation_type"];

/** Fields a user may change on an existing asset — matches the DB's column-level UPDATE grant on `assets`. */
export interface AssetUpdate {
  name?: string;
  description?: string | null;
  assetType?: AssetTypeCode;
  currencyCode?: string;
  isArchived?: boolean;
}

export interface AssetBasisTotal extends CurrencyAmount {
  assetId: string;
}

/**
 * `asset_summary()` is generated as if every valuation column were
 * non-nullable (a known Supabase type-generator limitation for functions
 * with LEFT JOIN LATERAL — see lib/domain/assets/repository.ts), but an
 * asset with no valuation of a given type genuinely has SQL NULL there.
 * This is the honest shape the repository maps the raw RPC result into.
 */
export interface AssetSummary {
  assetId: string;
  assetType: AssetTypeCode;
  name: string;
  currencyCode: string;
  isArchived: boolean;
  costBasis: string | null;
  estimatedCurrentValue: string | null;
  quickSaleEstimate: string | null;
  targetValue: string | null;
  latestValuedAt: string | null;
}

/** Everything the "Add Asset" foundation form can submit — matches create_asset()'s parameters. */
export interface CreateAssetInput {
  assetType: AssetTypeCode;
  name: string;
  currencyCode: string;
  description?: string;
  acquiredAt?: string;
  initialBasisAmount?: string;
  estimatedCurrentValue?: string;
  quickSaleEstimate?: string;
  targetValue?: string;
  valuedAt?: string;
}

/** Currency is always the asset's own native currency — derived server-side by record_asset_valuation(), never chosen by the caller. */
export interface RecordValuationInput {
  assetId: string;
  valuationType: ValuationType;
  value: string;
  valuedAt?: string;
  source?: string;
  note?: string;
}

/** Currency is always the asset's own native currency — derived server-side by record_asset_basis_event(). */
export interface RecordBasisEventInput {
  assetId: string;
  basisEventType: AssetBasisEvent["basis_event_type"];
  amount: string;
  occurredAt?: string;
  description?: string;
}

export type QuickSaleCoverageStatus = "not_set" | "partial" | "complete";

/**
 * Per-currency quick-sale-estimate completeness — distinguishes "no active
 * asset has an estimate" (not_set) from "some do" (partial) from "every
 * active asset does" (complete), so a recorded sum is never mistaken for
 * covering every asset. quickSaleSum matches financial_position_by_
 * currency()'s assetQuickSalePotential exactly (same source,
 * asset_summary()) — null when quickSaleEstimateCount is 0.
 */
export interface AssetQuickSaleCoverage {
  currencyCode: string;
  activeAssetCount: number;
  quickSaleEstimateCount: number;
  quickSaleSum: string | null;
  coverageStatus: QuickSaleCoverageStatus;
}
