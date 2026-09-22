import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/config/env";

/**
 * Browser Supabase client. Only ever call this from Client Components.
 * Uses the public URL + anon key — never the service-role key (that key
 * must never reach browser code; see
 * docs/security/SECURITY_AND_RLS_PRINCIPLES.md #5).
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
