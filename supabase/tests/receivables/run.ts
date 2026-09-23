/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Receivables domain (receivables, receivable_ledger_events,
 * receivable_recoverable_estimates).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:receivables
 */
import { randomUUID } from "node:crypto";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createReceivable,
  listReceivables,
  getReceivableSummaries,
  getReceivableNativeCurrencyTotals,
  recordRecovery,
  recordAdjustment,
  recordRecoverableEstimate,
} from "../../../lib/domain/receivables/repository.ts";
import { createBucket, getBucketBalances, voidFinancialEvent } from "../../../lib/domain/money/repository.ts";

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "receivables-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Receivables isolation & correctness suite\n");

    // --- 1-2: creation ------------------------------------------------------
    const receivableA = await runner.runValue("User A creates own receivable", () =>
      createReceivable(userA.client, { name: "Client Invoice #1", currencyCode: "USD", faceAmount: "10000" }),
    );
    const receivableB = await runner.runValue("User B creates own receivable", () =>
      createReceivable(userB.client, { name: "B's Invoice", currencyCode: "NGN", faceAmount: "500000" }),
    );

    if (!receivableA || !receivableB) {
      throw new Error("Receivable setup failed — aborting remaining tests.");
    }

    // --- 3-8: receivable isolation -------------------------------------------
    await runner.run("User A reads only own receivables", async () => {
      const receivables = await listReceivables(userA.client);
      assert(receivables.length === 1, `expected 1 receivable, got ${receivables.length}`);
      assert(receivables[0].id === receivableA.id, "listReceivables returned a non-owned receivable");
    });

    await runner.run("User A cannot read User B's receivable by UUID", async () => {
      const result = await userA.client.from("receivables").select("*").eq("id", receivableB.id);
      expectFilteredToEmpty(result, "user A selecting user B's receivable by id");
    });

    await runner.run("User A cannot update User B's receivable", async () => {
      const result = await userA.client
        .from("receivables")
        .update({ name: "Hijacked" })
        .eq("id", receivableB.id)
        .select("*");
      expectFilteredToEmpty(result, "user A updating user B's receivable");
    });

    await runner.run("User A cannot archive User B's receivable", async () => {
      const result = await userA.client
        .from("receivables")
        .update({ is_archived: true })
        .eq("id", receivableB.id)
        .select("*");
      expectFilteredToEmpty(result, "user A archiving user B's receivable");
    });

    await runner.run("User A cannot create a receivable owned by User B", async () => {
      const result = await userA.client
        .from("receivables")
        .insert({ user_id: userB.id, name: "Forged", currency_code: "USD" });
      expectDenied(result, "user A attempting to insert a receivable with user B's user_id");
    });

    await runner.run("User A cannot reassign their own receivable's ownership to User B", async () => {
      const result = await userA.client
        .from("receivables")
        .update({ user_id: userB.id })
        .eq("id", receivableA.id)
        .select("*");
      expectDenied(result, "user A attempting to reassign their receivable's ownership");
    });

    await runner.run("Anonymous access cannot read receivables", async () => {
      const result = await anonClient.from("receivables").select("*").eq("id", receivableA.id);
      expectDenied(result, "anonymous SELECT on receivables");
    });

    await runner.run("Anonymous access cannot create or mutate receivables", async () => {
      const insertResult = await anonClient
        .from("receivables")
        .insert({ user_id: userA.id, name: "Anon", currency_code: "USD" });
      expectDenied(insertResult, "anonymous INSERT on receivables");

      const updateResult = await anonClient.from("receivables").update({ name: "Anon" }).eq("id", receivableA.id);
      expectDenied(updateResult, "anonymous UPDATE on receivables");
    });

    // --- 20: creation does not move cash -------------------------------------
    const bucketA = await runner.runValue("Setup: User A creates a USD bucket for recoveries", () =>
      createBucket(userA.client, { name: "USD Wallet", currencyCode: "USD", bucketType: "bank_account" }),
    );
    if (!bucketA) throw new Error("Bucket setup failed.");

    await runner.run("Creating a receivable itself does not change any cash bucket balance", async () => {
      const before = await getBucketBalances(userA.client);
      await createReceivable(userA.client, { name: "Another Claim", currencyCode: "USD", faceAmount: "500" });
      const after = await getBucketBalances(userA.client);
      assert(
        JSON.stringify(before) === JSON.stringify(after),
        "bucket balances changed after creating a receivable",
      );
    });

    // --- 9-14: recovery mechanics ---------------------------------------------
    let firstRecoveryEventId = "";
    await runner.run(
      "User A records a partial recovery into their own same-currency bucket; cash and outstanding move exactly",
      async () => {
        const event = await recordRecovery(userA.client, {
          receivableId: receivableA.id,
          bucketId: bucketA.id,
          amount: "3000",
        });
        firstRecoveryEventId = event.id;
        assert(event.cash_flow_class === "other_inflow", `expected other_inflow, got ${event.cash_flow_class}`);

        const balances = await getBucketBalances(userA.client);
        const usd = balances.find((b) => b.bucketId === bucketA.id);
        assert(usd?.amount === "3000.000000", `expected cash +3000, got ${usd?.amount}`);

        const summaries = await getReceivableSummaries(userA.client);
        const summary = summaries.find((s) => s.receivableId === receivableA.id);
        assert(summary?.recoveredAmount === "3000.000000", `expected recovered 3000, got ${summary?.recoveredAmount}`);
        assert(summary?.outstandingAmount === "7000.000000", `expected outstanding 7000, got ${summary?.outstandingAmount}`);
      },
    );

    await runner.run("Recovery does not count as earned income", async () => {
      const { data, error } = await userA.client
        .from("financial_events")
        .select("cash_flow_class")
        .eq("id", firstRecoveryEventId)
        .single();
      assert(error === null, `unexpected error: ${error?.message}`);
      assert(data?.cash_flow_class !== "income", "receivable recovery must never be classified as income");
      assert(data?.cash_flow_class === "other_inflow", `expected other_inflow, got ${data?.cash_flow_class}`);
    });

    await runner.run("A second partial recovery calculates correct cumulative recovered/outstanding", async () => {
      await recordRecovery(userA.client, { receivableId: receivableA.id, bucketId: bucketA.id, amount: "2000" });
      const summaries = await getReceivableSummaries(userA.client);
      const summary = summaries.find((s) => s.receivableId === receivableA.id);
      assert(summary?.recoveredAmount === "5000.000000", `expected recovered 5000, got ${summary?.recoveredAmount}`);
      assert(summary?.outstandingAmount === "5000.000000", `expected outstanding 5000, got ${summary?.outstandingAmount}`);
    });

    // --- 15-18: recovery validation failures -----------------------------------
    await runner.run("Recovery above the outstanding amount is rejected", async () => {
      let threw = false;
      try {
        await recordRecovery(userA.client, { receivableId: receivableA.id, bucketId: bucketA.id, amount: "999999" });
      } catch {
        threw = true;
      }
      assert(threw, "recovering more than outstanding should be rejected");
    });

    await runner.run("Recovery into a different-currency bucket is rejected", async () => {
      const ngnBucket = await createBucket(userA.client, {
        name: "NGN Wallet",
        currencyCode: "NGN",
        bucketType: "cash_wallet",
      });
      let threw = false;
      try {
        await recordRecovery(userA.client, { receivableId: receivableA.id, bucketId: ngnBucket.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "recovering a USD receivable into an NGN bucket should be rejected");
    });

    await runner.run("Recovery into User B's bucket is rejected", async () => {
      const bBucket = await createBucket(userB.client, {
        name: "B's USD Wallet",
        currencyCode: "USD",
        bucketType: "bank_account",
      });
      let threw = false;
      try {
        await recordRecovery(userA.client, { receivableId: receivableA.id, bucketId: bBucket.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "recovering into user B's bucket should be rejected");
    });

    await runner.run("Recovery against User B's receivable is rejected", async () => {
      let threw = false;
      try {
        await recordRecovery(userA.client, { receivableId: receivableB.id, bucketId: bucketA.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "recovering against user B's receivable should be rejected");
    });

    // --- 19: idempotency -----------------------------------------------------
    await runner.run("A retried recovery with the same idempotency key does not duplicate", async () => {
      const idempotencyKey = randomUUID();
      const first = await recordRecovery(userA.client, {
        receivableId: receivableA.id,
        bucketId: bucketA.id,
        amount: "500",
        idempotencyKey,
      });
      const second = await recordRecovery(userA.client, {
        receivableId: receivableA.id,
        bucketId: bucketA.id,
        amount: "500",
        idempotencyKey,
      });
      assert(first.id === second.id, "two calls with the same idempotency key produced different events");

      const summaries = await getReceivableSummaries(userA.client);
      const summary = summaries.find((s) => s.receivableId === receivableA.id);
      // recovered so far: 3000 + 2000 + 500 (idempotent, counted once) = 5500
      assert(summary?.recoveredAmount === "5500.000000", `expected 5500, got ${summary?.recoveredAmount}`);
    });

    // --- 21-22: recoverable estimate distinctness --------------------------------
    await runner.run("Missing estimated recoverable value is null (Not set), not fabricated", async () => {
      const summaries = await getReceivableSummaries(userA.client);
      const summary = summaries.find((s) => s.receivableId === receivableA.id);
      assert(summary?.estimatedRecoverableValue === null, `expected null, got ${summary?.estimatedRecoverableValue}`);
    });

    await runner.run(
      "Estimated recoverable value remains distinct from outstanding and face amount once set",
      async () => {
        await recordRecoverableEstimate(userA.client, { receivableId: receivableA.id, value: "1000" });
        const summaries = await getReceivableSummaries(userA.client);
        const summary = summaries.find((s) => s.receivableId === receivableA.id);
        assert(summary !== undefined, "expected a summary row for receivable A");
        assert(summary.estimatedRecoverableValue === "1000.000000", "estimate did not persist");
        assert(summary.estimatedRecoverableValue !== summary.outstandingAmount, "estimate must not equal outstanding");
        assert(summary.estimatedRecoverableValue !== summary.faceAmount, "estimate must not equal face amount");
        // No adjustment has been recorded yet at this point in the suite —
        // face amount is still exactly the opening face (10000).
        assert(summary.faceAmount === "10000.000000", `expected face still 10000.000000, got ${summary.faceAmount}`);
      },
    );

    // --- Adjustments (face-amount write-up, no cash effect) ---------------------
    await runner.run("A face-amount adjustment changes outstanding without touching cash", async () => {
      const before = await getBucketBalances(userA.client);
      await recordAdjustment(userA.client, { receivableId: receivableA.id, amount: "200" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "an adjustment must never move cash");

      const summaries = await getReceivableSummaries(userA.client);
      const summary = summaries.find((s) => s.receivableId === receivableA.id);
      assert(summary?.faceAmount === "10200.000000", `expected face 10200, got ${summary?.faceAmount}`);
    });

    // --- Cross-tenant raw-insert adversarial tests -------------------------------
    await runner.run(
      "User A cannot forge a raw ledger insert with user_id=A but receivable_id=B (bypassing the RPC)",
      async () => {
        const result = await userA.client.from("receivable_ledger_events").insert({
          receivable_id: receivableB.id,
          ledger_event_type: "adjustment",
          amount: 100,
          currency_code: "NGN",
          occurred_at: new Date().toISOString(),
          user_id: userA.id,
        });
        expectDenied(result, "user A forging receivable_ledger_events against user B's receivable");
      },
    );

    await runner.run("User A cannot read User B's recoveries/ledger history", async () => {
      await recordAdjustment(userB.client, { receivableId: receivableB.id, amount: "1000" });
      const result = await userA.client.from("receivable_ledger_events").select("*").eq("receivable_id", receivableB.id);
      expectFilteredToEmpty(result, "user A selecting user B's ledger events by receivable_id");
    });

    // --- Voiding consistency (critical) -----------------------------------------
    await runner.run(
      "Voiding a recovery's financial_event reverts both cash AND outstanding consistently",
      async () => {
        const summariesBefore = await getReceivableSummaries(userA.client);
        const outstandingBefore = summariesBefore.find((s) => s.receivableId === receivableA.id)?.outstandingAmount;
        const balancesBefore = await getBucketBalances(userA.client);
        const cashBefore = balancesBefore.find((b) => b.bucketId === bucketA.id)?.amount;

        await voidFinancialEvent(userA.client, firstRecoveryEventId);

        const summariesAfter = await getReceivableSummaries(userA.client);
        const outstandingAfter = summariesAfter.find((s) => s.receivableId === receivableA.id)?.outstandingAmount;
        const balancesAfter = await getBucketBalances(userA.client);
        const cashAfter = balancesAfter.find((b) => b.bucketId === bucketA.id)?.amount;

        assert(outstandingBefore !== outstandingAfter, "outstanding amount should change after voiding a recovery");
        assert(cashBefore !== cashAfter, "cash balance should change after voiding a recovery");
        // Both derive from the same voided_at flag — confirm they moved by
        // the same 3000 that was voided (the first recovery).
        assert(
          Number(outstandingAfter) - Number(outstandingBefore) === 3000,
          `outstanding should increase by exactly 3000 after voiding, got delta ${Number(outstandingAfter) - Number(outstandingBefore)}`,
        );
        assert(
          Number(cashAfter) - Number(cashBefore) === -3000,
          `cash should decrease by exactly 3000 after voiding, got delta ${Number(cashAfter) - Number(cashBefore)}`,
        );
      },
    );

    // --- Multi-currency native totals --------------------------------------------
    await runner.run("Receivables remain separated by native currency, never summed", async () => {
      const totals = await getReceivableNativeCurrencyTotals(userA.client);
      const usd = totals.find((t) => t.currencyCode === "USD");
      assert(usd !== undefined, "expected a USD total for user A");
      const ngnPresent = totals.some((t) => t.currencyCode === "NGN");
      assert(!ngnPresent, "user A has no NGN receivables — none should appear");
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
  console.error("Receivables suite crashed:", err);
  process.exitCode = 1;
});
