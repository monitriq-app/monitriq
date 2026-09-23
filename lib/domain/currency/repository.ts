import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type { Currency, FxRate, RawReportingFxRateRow, RecordManualReportingRateInput } from "./types.ts";

type Client = SupabaseClient<Database>;

/** See the comment in lib/domain/money/repository.ts's own copy — the same PostgREST text-safe numeric-param trick, duplicated locally per established convention rather than shared. */
function asNumericParam(value: string): number {
  return value as unknown as number;
}

/**
 * public.currencies is the ONE canonical supported-currency source for the
 * whole application — Profile onboarding, Money (cash buckets), and Assets
 * all call this, none maintains its own list. See
 * docs/architecture/MULTI_CURRENCY_MODEL.md §3/§14 for how the registry
 * itself was derived and why a second hand-maintained list (removed
 * P0-E2-S3) was a mistake worth undoing rather than tolerating.
 */
export async function listCurrencies(client: Client): Promise<Currency[]> {
  const { data, error } = await client.from("currencies").select("*").order("code");
  if (error) throw error;
  return data;
}

export async function getCurrency(client: Client, code: string): Promise<Currency | null> {
  const { data, error } = await client.from("currencies").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Records one append-only manual reporting rate — never overwrites a
 * prior entry (see record_manual_reporting_rate() in the migration).
 * "1 baseCurrency = rate quoteCurrency".
 */
export async function recordManualReportingRate(client: Client, input: RecordManualReportingRateInput): Promise<FxRate> {
  const { data, error } = await client.rpc("record_manual_reporting_rate", {
    p_base_currency: input.baseCurrency,
    p_quote_currency: input.quoteCurrency,
    p_rate: asNumericParam(input.rate),
    p_rate_as_of: input.rateAsOf,
  });
  if (error) throw error;
  return data;
}

/** The caller's own manual reporting-rate history, newest first — for a settings-style "your recorded rates" view. Never includes source='transaction_actual' rows. */
export async function listManualReportingRates(client: Client): Promise<FxRate[]> {
  const { data, error } = await client
    .from("fx_rates")
    .select("*")
    .eq("source", "manual")
    .order("rate_as_of", { ascending: false });
  if (error) throw error;
  return data;
}

/** Raw candidate rates (both directions, latest per pair) touching one reporting currency — see reporting_fx_rates() in the migration for exactly what "latest" and "manual only" mean here. */
export async function getReportingFxRates(client: Client, reportingCurrency: string): Promise<RawReportingFxRateRow[]> {
  const { data, error } = await client.rpc("reporting_fx_rates", { p_reporting_currency: reportingCurrency });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rate: row.rate,
    rateAsOf: row.rate_as_of,
    source: row.source as RawReportingFxRateRow["source"],
  }));
}
