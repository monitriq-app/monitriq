import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import type { Currency } from "./types.ts";

type Client = SupabaseClient<Database>;

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
