import type { SupabaseClient } from "@supabase/supabase-js";
// Relative/extensioned — see the comment in ./types.ts.
import type { Database } from "../../supabase/database.types.ts";
import type { Profile, ProfileUpdate } from "./types.ts";

type Client = SupabaseClient<Database>;

/**
 * Narrow Profile data-access boundary. Every profile read/write in the app
 * goes through these two functions rather than scattering `.from("profiles")`
 * calls through components — see
 * docs/architecture/SYSTEM_ARCHITECTURE.md #4 (domain calculation layer).
 *
 * Both functions accept whichever Supabase client the caller already has
 * (browser or server) — ownership is enforced by RLS (`auth.uid() = id`),
 * not by anything this module does, so there is nothing browser vs.
 * server-specific about the query itself.
 */

export async function getProfile(client: Client): Promise<Profile | null> {
  const { data, error } = await client.from("profiles").select("*").maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateProfile(client: Client, patch: ProfileUpdate): Promise<Profile> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw new Error("updateProfile called without an authenticated session.");
  }

  const { data, error } = await client
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
