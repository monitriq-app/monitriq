import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getProfile } from "@/lib/domain/profile/repository";
import type { Profile } from "@/lib/domain/profile/types";

/**
 * Server-side profile reader, deduped per request via React's `cache` —
 * same rationale as getCurrentUser. Returns null if there's no session or
 * (defensively) if a profile row somehow doesn't exist yet.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  return getProfile(supabase);
});
