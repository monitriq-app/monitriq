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

/**
 * Optional, user-driven operational status (P0-E3-S4) — never inferred
 * from valuation/repair data (see docs/reports/P0-E3-S4-assets-
 * production-ui.txt, "Insight != status"). Deliberately has no "sold"
 * value: the vehicle operational lifecycle and the generic disposition
 * lifecycle (P0-E4-S1, see AssetSummary.isDisposed below) are two
 * separate concepts — a "sold" vehicle's last operational status might
 * still read "Listed" historically, but `isDisposed` is what the UI must
 * treat as authoritative for current ownership state.
 */
export type AssetStatusCode = "awaiting_repair" | "repairing" | "ready_to_list" | "listed" | "offer_received" | "under_negotiation";

/** Fields a user may change on an existing asset — matches the DB's column-level UPDATE grant on `assets`. */
export interface AssetUpdate {
  name?: string;
  description?: string | null;
  assetType?: AssetTypeCode;
  currencyCode?: string;
  isArchived?: boolean;
  statusCode?: AssetStatusCode | null;
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
  statusCode: AssetStatusCode | null;
  /** True iff an active (non-voided) asset_dispositions row exists for this asset — derived, never a second stored flag (P0-E4-S1). Authoritative for current ownership state; takes precedence over statusCode in presentation. */
  isDisposed: boolean;
  disposedAt: string | null;
  costBasis: string | null;
  estimatedCurrentValue: string | null;
  quickSaleEstimate: string | null;
  targetValue: string | null;
  latestValuedAt: string | null;
}

/**
 * Full sale economics for one recorded disposition — see
 * record_asset_sale()/asset_disposition_summary() in the migration.
 * `basisAtSale`/`capitalReturned`/`realisedGainLoss` are all `null`
 * together when the asset had no recorded cost basis at the moment of
 * sale — "Not calculated," never a fabricated profit or loss.
 * Immutable: never recomputed from the asset's later/current basis.
 */
export interface AssetDispositionSummary {
  dispositionId: string;
  assetId: string;
  assetName: string;
  assetType: AssetTypeCode;
  occurredAt: string;
  currencyCode: string;
  grossProceeds: string;
  sellingCosts: string;
  netProceeds: string;
  basisAtSale: string | null;
  capitalReturned: string | null;
  realisedGainLoss: string | null;
  destinationBucketId: string;
  financialEventId: string;
  notes: string | null;
  isVoided: boolean;
}

/** Everything the Sell Asset flow can submit — matches record_asset_sale()'s parameters. Currency is always the asset's own native currency; the destination bucket must match it exactly (v1 has no cross-currency asset sale). */
export interface RecordAssetSaleInput {
  assetId: string;
  destinationBucketId: string;
  grossProceeds: string;
  sellingCosts?: string;
  occurredAt?: string;
  notes?: string;
  idempotencyKey?: string;
}

/**
 * The direct return of record_asset_sale() — narrower than
 * AssetDispositionSummary (no assetName/assetType/isVoided; those only
 * come from the joined asset_disposition_summary() read). Same
 * nullability-correction discipline as getAssetSummaries(): the RPC is
 * `returns table(...)`, so Supabase's generator can't infer that
 * basis_at_sale/realised_gain_loss/capital_returned/notes are genuinely
 * nullable — the repository mapping corrects that.
 */
export interface AssetDisposition {
  dispositionId: string;
  assetId: string;
  occurredAt: string;
  currencyCode: string;
  grossProceeds: string;
  sellingCosts: string;
  netProceeds: string;
  basisAtSale: string | null;
  realisedGainLoss: string | null;
  capitalReturned: string | null;
  destinationBucketId: string;
  financialEventId: string;
  notes: string | null;
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

/**
 * Current asset value (latest estimated_current_value, excluding
 * archived) grouped by type and native currency — see
 * asset_value_by_type() in the migration. Added for Home's "Where Your
 * Capital Lives" (P0-E3-S2); the same semantics as
 * asset_native_currency_totals(), never a second valuation formula.
 */
export interface AssetValueByType {
  assetType: AssetTypeCode;
  currencyCode: string;
  totalEstimatedValue: string;
}
