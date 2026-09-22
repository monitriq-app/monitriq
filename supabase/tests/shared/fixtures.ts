import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types.ts";
import type { TestEnv } from "./env.ts";

/** All fixture users live under this reserved-for-testing domain (RFC 2606). */
const FIXTURE_EMAIL_DOMAIN = "monatriq.test";

export interface TestUser {
  id: string;
  email: string;
  /** A client authenticated as this user via a normal password sign-in — exercises the real anon-key + RLS path, not an admin bypass. */
  client: SupabaseClient<Database>;
}

export interface TestFixtures {
  userA: TestUser;
  userB: TestUser;
  /** No session at all — for anonymous-access tests. */
  anonClient: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  cleanup: () => Promise<void>;
}

function adminClient(env: TestEnv): SupabaseClient<Database> {
  return createClient<Database>(env.url, env.testServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function purgeStaleFixtures(admin: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;

  const stale = data.users.filter((u) => u.email?.endsWith(`@${FIXTURE_EMAIL_DOMAIN}`));
  for (const user of stale) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function createSignedInUser(
  env: TestEnv,
  admin: SupabaseClient<Database>,
  suite: string,
  label: "a" | "b",
): Promise<TestUser> {
  const email = `${suite}-${label}-${randomUUID()}@${FIXTURE_EMAIL_DOMAIN}`;
  const password = randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw createError ?? new Error(`Failed to create fixture user ${email}`);
  }

  const client = createClient<Database>(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw signInError;
  }

  return { id: created.user.id, email, client };
}

/**
 * Creates two independent, signed-in test users plus an anonymous client,
 * against the local Supabase stack only (enforced by loadTestEnv). Any
 * fixture users left over from a previous crashed run (from any suite) are
 * purged first, so every suite is safe to re-run independently. `suite` is
 * just a readable prefix in the fixture emails (e.g. "profile-rls",
 * "money-rls") to make Studio/logs easy to read when debugging.
 */
export async function setupFixtures(env: TestEnv, suite: string): Promise<TestFixtures> {
  const admin = adminClient(env);
  await purgeStaleFixtures(admin);

  const userA = await createSignedInUser(env, admin, suite, "a");
  const userB = await createSignedInUser(env, admin, suite, "b");

  const anonClient = createClient<Database>(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    userA,
    userB,
    anonClient,
    admin,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(userA.id).catch(() => {});
      await admin.auth.admin.deleteUser(userB.id).catch(() => {});
    },
  };
}
