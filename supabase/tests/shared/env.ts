export interface TestEnv {
  url: string;
  anonKey: string;
  testServiceRoleKey: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. This test harness needs a running local Supabase ` +
        `stack ("npm run db:start") and a .env.local with ` +
        `NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and ` +
        `SUPABASE_TEST_SERVICE_ROLE_KEY. See supabase/tests/rls/README.md.`,
    );
  }
  return value;
}

/**
 * These suites create and delete real auth.users rows with a service-role
 * key. They must never be able to run against a real (non-local) project,
 * regardless of what happens to be in .env.local — so this is a hard
 * refusal, not a warning.
 *
 * SUPABASE_TEST_SERVICE_ROLE_KEY is deliberately not named
 * SUPABASE_SERVICE_ROLE_KEY: the "TEST_" makes it visually obvious at a
 * glance (in .env.example, in a diff, in a code review) that this is not a
 * production/application credential — the application itself never reads
 * a service-role key of any name. See
 * docs/security/SECURITY_AND_RLS_PRINCIPLES.md #12.
 */
export function loadTestEnv(): TestEnv {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const testServiceRoleKey = required("SUPABASE_TEST_SERVICE_ROLE_KEY");

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
  if (!isLocal) {
    throw new Error(
      `Refusing to run: NEXT_PUBLIC_SUPABASE_URL ("${url}") does not look ` +
        `like a local Supabase URL (127.0.0.1/localhost). These suites create ` +
        `and delete auth fixture users with the service-role key and must ` +
        `never run against a real project. Point .env.local at your local ` +
        `stack before running the test scripts.`,
    );
  }

  return { url, anonKey, testServiceRoleKey };
}
