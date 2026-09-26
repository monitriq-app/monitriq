import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listBuckets, listMoneySpendingCategories } from "@/lib/domain/money/repository";
import { SpendingCheckWorkspace } from "@/components/spending-check/SpendingCheckWorkspace";

/**
 * "Can I afford this?" (P0-E5-S3). A hypothetical, immediate-purchase
 * check that composes existing canonical reads (see
 * lib/domain/spending-check/service.ts). Opening or running it never
 * records anything.
 */
export default async function SpendingCheckPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const [currencies, buckets, categories] = await Promise.all([listCurrencies(supabase), listBuckets(supabase), listMoneySpendingCategories(supabase)]);

  return <SpendingCheckWorkspace currencies={currencies} buckets={buckets} categories={categories} defaultCurrencyCode={profile?.preferred_currency ?? null} />;
}
