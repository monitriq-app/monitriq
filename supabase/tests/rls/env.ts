export interface TestEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. The RLS test harness needs a running local Supabase ` +
        `stack ("npm run db:start") and a .env.local with ` +
        `NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and ` +
        `SUPABASE_SERVICE_ROLE_KEY. See supabase/tests/rls/README.md.`,
    );
  }
  return value;
}

/**
 * This suite creates and deletes real auth.users rows with a service-role
 * key. It must never be able to run against a real (non-local) project,
 * regardless of what happens to be in .env.local — so this is a hard
 * refusal, not a warning.
 */
export function loadTestEnv(): TestEnv {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
  if (!isLocal) {
    throw new Error(
      `Refusing to run: NEXT_PUBLIC_SUPABASE_URL ("${url}") does not look ` +
        `like a local Supabase URL (127.0.0.1/localhost). This suite creates ` +
        `and deletes auth fixture users with the service-role key and must ` +
        `never run against a real project. Point .env.local at your local ` +
        `stack before running "npm run test:rls".`,
    );
  }

  return { url, anonKey, serviceRoleKey };
}
