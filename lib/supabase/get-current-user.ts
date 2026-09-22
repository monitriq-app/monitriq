import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config/env";

/**
 * Reads the current authenticated user, deduped per request via React's
 * `cache` so the layout's auth guard and a page below it don't each make a
 * separate round trip to Supabase Auth for the same request.
 *
 * Returns null (rather than throwing) when no Supabase project is
 * configured yet, so callers can treat "not configured" the same as "not
 * signed in" — see docs/security/SECURITY_AND_RLS_PRINCIPLES.md, "no
 * Supabase project assumption".
 */
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
