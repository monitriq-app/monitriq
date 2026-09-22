import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/config/env";

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Reads the user's session from request cookies via the
 * anon key — RLS still applies, this is not a service-role client.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render, where cookies can't be
          // written. Session refresh is handled by middleware instead.
        }
      },
    },
  });
}
