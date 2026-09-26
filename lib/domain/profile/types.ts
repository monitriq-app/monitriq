// Relative (not "@/…") and extensioned so this framework-agnostic domain
// module resolves identically under Next.js's bundler and under plain
// `node` (the RLS test harness imports it directly — see
// supabase/tests/rls/run.ts). Node's ESM resolver has no knowledge of
// tsconfig path aliases.
import type { Database } from "../../supabase/database.types.ts";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** Fields a user is ever allowed to write — matches the DB's column-level UPDATE grant. */
export type ProfileUpdate = Pick<
  Database["public"]["Tables"]["profiles"]["Update"],
  "first_name" | "preferred_name" | "preferred_currency" | "timezone" | "financial_language_mode"
>;

export function isOnboardingComplete(profile: Pick<Profile, "onboarding_completed">): boolean {
  return profile.onboarding_completed === true;
}
