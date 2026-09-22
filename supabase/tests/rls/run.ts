/**
 * Cross-user isolation / adversarial RLS suite for public.profiles.
 *
 * Runs against a LOCAL Supabase stack only (see env.ts — it refuses to run
 * against anything that isn't 127.0.0.1/localhost). Uses the real anon-key
 * + PostgREST path for every user-facing assertion, i.e. this exercises
 * actual database enforcement, not application code.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:rls
 */
import { loadTestEnv } from "./env.ts";
import { setupFixtures } from "./fixtures.ts";
import { TestRunner, assert, expectSuccess, expectFilteredToEmpty, expectDenied } from "./assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env);
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq RLS isolation suite (public.profiles)\n");

    // --- Structural: profile creation trigger -------------------------
    await runner.run(
      "signup automatically creates exactly one profile row owned by the new user",
      async () => {
        const result = await userA.client.from("profiles").select("*").eq("id", userA.id);
        const rows = expectSuccess(result, "user A reading own auto-created profile");
        assert(rows.length === 1, `expected exactly 1 row, got ${rows.length}`);
        assert(rows[0].id === userA.id, "auto-created row has the wrong id");
        assert(rows[0].onboarding_completed === false, "a fresh profile should not be onboarding_completed");
      },
    );

    // --- Domain correctness: the onboarding lifecycle, through the exact
    // repository function the app's onboarding form calls -----------------
    await runner.run(
      "Completing onboarding via updateProfile() flips onboarding_completed to true",
      async () => {
        const updated = await updateProfile(userA.client, {
          first_name: "Ada",
          preferred_name: null,
          preferred_currency: "USD",
          timezone: "Africa/Lagos",
        });
        assert(updated.onboarding_completed === true, "expected onboarding_completed to become true");
        assert(updated.first_name === "Ada", "first_name did not persist");
        assert(updated.preferred_currency === "USD", "preferred_currency did not persist");
        assert(updated.timezone === "Africa/Lagos", "timezone did not persist");
      },
    );

    await runner.run("An invalid IANA timezone is rejected by the database", async () => {
      const result = await userA.client
        .from("profiles")
        .update({ timezone: "Not/A_Real_Zone" })
        .eq("id", userA.id)
        .select("*");
      expectDenied(result, "user A submitting a non-existent IANA timezone");
    });

    await runner.run("A malformed currency code is rejected by the database", async () => {
      const result = await userA.client
        .from("profiles")
        .update({ preferred_currency: "usd-1" })
        .eq("id", userA.id)
        .select("*");
      expectDenied(result, "user A submitting a malformed currency code");
    });

    // --- 1/2/3: ownership-scoped SELECT --------------------------------
    await runner.run("User A can read User A's profile", async () => {
      const result = await userA.client.from("profiles").select("*").eq("id", userA.id).single();
      const row = expectSuccess(result, "user A reading own profile");
      assert(row.id === userA.id, "returned row is not user A's");
    });

    await runner.run("User A cannot read User B's profile", async () => {
      const result = await userA.client.from("profiles").select("*").eq("id", userB.id);
      expectFilteredToEmpty(result, "user A selecting user B's row by id");
    });

    await runner.run("User B cannot read User A's profile", async () => {
      const result = await userB.client.from("profiles").select("*").eq("id", userA.id);
      expectFilteredToEmpty(result, "user B selecting user A's row by id");
    });

    await runner.run(
      "Direct request for another user's UUID returns nothing, not an error (no leak of existence)",
      async () => {
        const result = await userA.client
          .from("profiles")
          .select("*")
          .eq("id", userB.id)
          .maybeSingle();
        assert(result.error === null, `expected no error, got: ${result.error}`);
        assert(result.data === null, "expected null — another user's row must not be readable by UUID");
      },
    );

    // --- 4/5: ownership-scoped UPDATE ----------------------------------
    await runner.run("User A can update User A's profile", async () => {
      const result = await userA.client
        .from("profiles")
        .update({ first_name: "Test-A" })
        .eq("id", userA.id)
        .select("*");
      const rows = expectSuccess(result, "user A updating own profile");
      assert(rows.length === 1 && rows[0].first_name === "Test-A", "update did not apply to user A's row");
    });

    await runner.run(
      "User A cannot update User B's profile by targeting B's id in the filter",
      async () => {
        const result = await userA.client
          .from("profiles")
          .update({ first_name: "Hijacked" })
          .eq("id", userB.id)
          .select("*");
        expectFilteredToEmpty(result, "user A updating user B's row via .eq(id, userB.id)");
      },
    );

    // --- 6: cross-user INSERT -------------------------------------------
    await runner.run("User A cannot insert a profile row owned by User B", async () => {
      const result = await userA.client
        .from("profiles")
        .insert({ id: userB.id, first_name: "Forged" });
      expectDenied(result, "user A attempting to insert a row with user B's id");
    });

    await runner.run("User A cannot insert a new profile row for themselves either (no INSERT grant at all)", async () => {
      const result = await userA.client
        .from("profiles")
        .insert({ id: userA.id, first_name: "Duplicate" });
      expectDenied(result, "user A attempting a manual insert of their own already-existing row");
    });

    // --- 7: ownership reassignment --------------------------------------
    await runner.run(
      "User A cannot reassign their own profile's ownership to User B (id column not grantable)",
      async () => {
        // Note: the generated Database["public"]["Tables"]["profiles"]["Update"]
        // type allows `id` (Postgres/Supabase don't know about our
        // column-level GRANT restriction) — this simulates a client that
        // forged a raw payload including it. The database rejects it
        // regardless of what TypeScript would allow.
        const result = await userA.client
          .from("profiles")
          .update({ id: userB.id })
          .eq("id", userA.id)
          .select("*");
        expectDenied(result, "user A attempting to change their profile's id to user B's id");
      },
    );

    // --- DELETE: not implemented this phase, must be denied for everyone -
    await runner.run("User A cannot delete their own profile (delete not implemented this phase)", async () => {
      const result = await userA.client.from("profiles").delete().eq("id", userA.id);
      expectDenied(result, "user A attempting to delete their own profile");
    });

    await runner.run("User A cannot delete User B's profile", async () => {
      const result = await userA.client.from("profiles").delete().eq("id", userB.id);
      expectDenied(result, "user A attempting to delete user B's profile");
    });

    // --- 8/9: anonymous access -------------------------------------------
    await runner.run("Anonymous access cannot read any profile", async () => {
      const result = await anonClient.from("profiles").select("*").eq("id", userA.id);
      expectDenied(result, "anonymous SELECT");
    });

    await runner.run("Anonymous access cannot update any profile", async () => {
      const result = await anonClient
        .from("profiles")
        .update({ first_name: "Anon" })
        .eq("id", userA.id);
      expectDenied(result, "anonymous UPDATE");
    });

    await runner.run("Anonymous access cannot insert a profile", async () => {
      const result = await anonClient.from("profiles").insert({ id: userA.id, first_name: "Anon" });
      expectDenied(result, "anonymous INSERT");
    });

    await runner.run("Anonymous access cannot delete a profile", async () => {
      const result = await anonClient.from("profiles").delete().eq("id", userA.id);
      expectDenied(result, "anonymous DELETE");
    });

    // --- Final integrity check: none of the above attacks left a mark ---
    await runner.run("User B's profile was never mutated by any of User A's attempted attacks", async () => {
      const result = await userB.client.from("profiles").select("*").eq("id", userB.id).single();
      const row = expectSuccess(result, "user B re-reading their own profile after the attack attempts");
      assert(row.first_name === null, `user B's first_name should still be null, got ${JSON.stringify(row.first_name)}`);
    });
  } finally {
    await fixtures.cleanup();
  }

  const summary = runner.summary();
  console.log(`\n${summary.passed}/${summary.total} passed`);

  if (summary.failed > 0) {
    console.error(`\n${summary.failed} test(s) FAILED:`);
    for (const r of summary.results.filter((r) => !r.passed)) {
      console.error(`  - ${r.name}: ${r.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("RLS suite crashed:", err);
  process.exitCode = 1;
});
