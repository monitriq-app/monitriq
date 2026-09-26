import { cache } from "react";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { resolveLanguageMode, type FinancialLanguageMode } from "@/lib/domain/language/types";

/**
 * The signed-in user's explanation preference, resolved once per request from
 * the (already request-cached) profile — no extra query. Missing, null or
 * invalid values fall back to "simple", so a vocabulary preference can never
 * break a financial page.
 */
export const getLanguageMode = cache(async (): Promise<FinancialLanguageMode> => {
  const profile = await getCurrentProfile();
  return resolveLanguageMode(profile?.financial_language_mode);
});
