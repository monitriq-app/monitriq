/**
 * Supabase environment access.
 *
 * Values are read lazily (only when a caller actually needs a Supabase
 * client), never at module load time, so pages that don't touch Supabase
 * still build and render even when no Supabase project is connected yet
 * (see docs/security/SECURITY_AND_RLS_PRINCIPLES.md and
 * docs/project/BUILD_STATE.md — "no Supabase project assumption").
 */

interface SupabaseEnv {
  url: string;
  anonKey: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to ` +
        `.env.local and fill in your Supabase project's URL and anon key.`,
    );
  }
  return value;
}

export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/** Non-throwing presence check, for rendering a configuration state instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
