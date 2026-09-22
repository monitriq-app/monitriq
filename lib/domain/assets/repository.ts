import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type {
  Asset,
  AssetBasisEvent,
  AssetBasisTotal,
  AssetSummary,
  AssetType,
  AssetUpdate,
  AssetValuation,
  CreateAssetInput,
  RecordBasisEventInput,
  RecordValuationInput,
} from "./types.ts";
import type { CurrencyAmount } from "../currency/types.ts";

type Client = SupabaseClient<Database>;

/**
 * Same string-not-number discipline as lib/domain/money/repository.ts's
 * asNumericParam — see its comment for why this is correct despite the
 * generated Args type describing the parameter as `number`.
 */
function asNumericParam(value: string): number {
  return value as unknown as number;
}

function asOptionalNumericParam(value: string | undefined): number | undefined {
  return value === undefined ? undefined : asNumericParam(value);
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export async function listAssetTypes(client: Client): Promise<AssetType[]> {
  const { data, error } = await client.from("asset_types").select("*").order("display_name");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listAssets(client: Client): Promise<Asset[]> {
  const { data, error } = await client.from("assets").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function updateAsset(client: Client, assetId: string, patch: AssetUpdate): Promise<Asset> {
  const update: Database["public"]["Tables"]["assets"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.assetType !== undefined) update.asset_type = patch.assetType;
  if (patch.currencyCode !== undefined) update.currency_code = patch.currencyCode;
  if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;

  const { data, error } = await client
    .from("assets")
    .update(update)
    .eq("id", assetId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * asset_summary() is generated with every valuation/basis column typed as
 * non-nullable `string` (Supabase's type generator doesn't infer
 * nullability through LEFT JOIN LATERAL), but Postgres genuinely returns
 * NULL for an asset with no basis events or no valuation of a given type.
 * This mapping is the one place that mismatch is corrected — everywhere
 * else in the app sees the honest `string | null` shape.
 */
export async function getAssetSummaries(client: Client): Promise<AssetSummary[]> {
  const { data, error } = await client.rpc("asset_summary");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    assetId: row.asset_id,
    assetType: row.asset_type,
    name: row.name,
    currencyCode: row.currency_code,
    isArchived: row.is_archived,
    costBasis: row.cost_basis as string | null,
    estimatedCurrentValue: row.estimated_current_value as string | null,
    quickSaleEstimate: row.quick_sale_estimate as string | null,
    targetValue: row.target_value as string | null,
    latestValuedAt: row.latest_valued_at as string | null,
  }));
}

export async function getAssetCurrentBasis(client: Client): Promise<AssetBasisTotal[]> {
  const { data, error } = await client.rpc("asset_current_basis");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    assetId: row.asset_id,
    currencyCode: row.currency_code,
    amount: row.basis,
  }));
}

export async function getAssetNativeCurrencyTotals(client: Client): Promise<CurrencyAmount[]> {
  const { data, error } = await client.rpc("asset_native_currency_totals");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currencyCode: row.currency_code,
    amount: row.total_estimated_value,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Atomically creates an asset plus (optionally) its initial cost basis and
 * up to three initial valuations — one RPC call, one transaction, per
 * docs/architecture/FINANCIAL_DOMAIN_MODEL.md's atomicity principle
 * (mirrors the Money record_* functions). Never touches financial_events
 * or cash_movements: creating an asset does not move cash.
 */
export async function createAsset(client: Client, input: CreateAssetInput): Promise<Asset> {
  const { data, error } = await client.rpc("create_asset", {
    p_asset_type: input.assetType,
    p_name: input.name,
    p_currency_code: input.currencyCode,
    p_description: input.description,
    p_acquired_at: input.acquiredAt,
    p_initial_basis_amount: asOptionalNumericParam(input.initialBasisAmount),
    p_estimated_current_value: asOptionalNumericParam(input.estimatedCurrentValue),
    p_quick_sale_estimate: asOptionalNumericParam(input.quickSaleEstimate),
    p_target_value: asOptionalNumericParam(input.targetValue),
    p_valued_at: input.valuedAt,
  });
  if (error) throw error;
  return data;
}

/**
 * Adds one more valuation to an EXISTING asset. This goes through the
 * record_asset_valuation() RPC rather than a direct table insert:
 * user_id is trigger-derived and deliberately outside asset_valuations'
 * INSERT column grant, so a direct `.from(...).insert(...)` call would
 * need to supply a user_id the database will never actually accept, just
 * to satisfy the generated Insert type. See the migration's section 5
 * comment for the full rationale. Currency is always the asset's own
 * native currency (fetched by the RPC itself) — this phase rejects
 * cross-currency valuations rather than guessing a conversion.
 */
export async function recordValuation(client: Client, input: RecordValuationInput): Promise<AssetValuation> {
  const { data, error } = await client.rpc("record_asset_valuation", {
    p_asset_id: input.assetId,
    p_valuation_type: input.valuationType,
    p_value: asNumericParam(input.value),
    p_valued_at: input.valuedAt,
    p_source: input.source,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

export async function recordBasisEvent(client: Client, input: RecordBasisEventInput): Promise<AssetBasisEvent> {
  const { data, error } = await client.rpc("record_asset_basis_event", {
    p_asset_id: input.assetId,
    p_basis_event_type: input.basisEventType,
    p_amount: asNumericParam(input.amount),
    p_occurred_at: input.occurredAt,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}
