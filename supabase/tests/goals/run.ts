/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Goals domain (goals, goal_target_history, goal_milestones,
 * goal_allocation_events).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:goals
 */
import { randomUUID } from "node:crypto";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createGoal,
  listGoals,
  updateGoal,
  getGoalSummaries,
  getGoalNativeCurrencyTotals,
  getGoalProtectedAllocationTotals,
  getGoalBucketShortfalls,
  getGoalTargetHistory,
  recordGoalTarget,
  recordGoalAllocation,
  recordGoalRelease,
  recordGoalReallocation,
  createGoalMilestone,
  updateGoalMilestone,
  listGoalMilestones,
} from "../../../lib/domain/goals/repository.ts";
import {
  createBucket,
  getBucketBalances,
  recordMoneyReceived,
  recordMoneySpent,
} from "../../../lib/domain/money/repository.ts";
import { createLiability, recordDebtPayment, getLiabilitySummaries } from "../../../lib/domain/liabilities/repository.ts";
import { convertToReportingCurrency } from "../../../lib/domain/currency/conversion.ts";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "goals-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Goals isolation & correctness suite\n");

    // --- 1-2: creation ---------------------------------------------------------
    const goalA = await runner.runValue("User A creates own cash-target goal", () =>
      createGoal(userA.client, {
        goalTypeCode: "emergency_reserve",
        measurementType: "cash_target",
        name: "Emergency Reserve",
        currencyCode: "USD",
      }),
    );
    const goalB = await runner.runValue("User B creates own goal", () =>
      createGoal(userB.client, {
        goalTypeCode: "savings_target",
        measurementType: "cash_target",
        name: "B's Savings",
        currencyCode: "NGN",
      }),
    );

    if (!goalA || !goalB) {
      throw new Error("Goal setup failed — aborting remaining tests.");
    }

    // --- 3-8: isolation ----------------------------------------------------------
    await runner.run("User A reads only own goals", async () => {
      const goals = await listGoals(userA.client);
      assert(goals.length === 1, `expected 1 goal, got ${goals.length}`);
      assert(goals[0].id === goalA.id, "listGoals returned a non-owned goal");
    });

    await runner.run("A cannot read B goal", async () => {
      const result = await userA.client.from("goals").select("*").eq("id", goalB.id);
      expectFilteredToEmpty(result, "user A selecting user B's goal by id");
    });

    await runner.run("A cannot update B goal", async () => {
      const result = await userA.client.from("goals").update({ name: "Hijacked" }).eq("id", goalB.id).select("*");
      expectFilteredToEmpty(result, "user A updating user B's goal");
    });

    await runner.run("A cannot archive B goal", async () => {
      const result = await userA.client.from("goals").update({ status: "archived" }).eq("id", goalB.id).select("*");
      expectFilteredToEmpty(result, "user A archiving user B's goal");
    });

    await runner.run("A cannot create goal owned by B", async () => {
      const result = await userA.client.from("goals").insert({
        user_id: userB.id,
        goal_type_code: "custom",
        measurement_type: "cash_target",
        name: "Forged",
        currency_code: "USD",
      });
      expectDenied(result, "user A attempting to insert a goal with user B's user_id");
    });

    await runner.run("A cannot reassign goal ownership", async () => {
      const result = await userA.client.from("goals").update({ user_id: userB.id }).eq("id", goalA.id).select("*");
      expectDenied(result, "user A attempting to reassign their goal's ownership");
    });

    await runner.run("Anonymous cannot read/mutate goals", async () => {
      const selectResult = await anonClient.from("goals").select("*").eq("id", goalA.id);
      expectDenied(selectResult, "anonymous SELECT on goals");
      const insertResult = await anonClient
        .from("goals")
        .insert({ user_id: userA.id, goal_type_code: "custom", measurement_type: "cash_target", name: "Anon", currency_code: "USD" });
      expectDenied(insertResult, "anonymous INSERT on goals");
    });

    // --- 9: target history preserves old target ---------------------------------
    await runner.run("Target history preserves old target when target changes", async () => {
      await recordGoalTarget(userA.client, { goalId: goalA.id, targetValue: "20000", targetDate: daysFromNow(365) });
      await recordGoalTarget(userA.client, { goalId: goalA.id, targetValue: "25000", targetDate: daysFromNow(400) });

      const history = await getGoalTargetHistory(userA.client, goalA.id);
      assert(history.length === 2, `expected 2 target history rows, got ${history.length}`);
      const values = history.map((h) => h.targetValue).sort();
      assert(values[0] === "20000.000000" && values[1] === "25000.000000", `unexpected history values: ${values}`);

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalA.id);
      assert(summary?.targetValue === "25000.000000", `expected latest target 25000, got ${summary?.targetValue}`);
    });

    // --- 11-12: goal creation / target change financial invariance --------------
    await runner.run("Goal creation causes zero Money events/movements", async () => {
      const before = await getBucketBalances(userA.client);
      await createGoal(userA.client, { goalTypeCode: "travel", measurementType: "cash_target", name: "Trip", currencyCode: "USD" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "bucket balances changed after creating a goal");
    });

    await runner.run("Target change causes zero Money events/movements", async () => {
      const before = await getBucketBalances(userA.client);
      await recordGoalTarget(userA.client, { goalId: goalA.id, targetValue: "26000" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "bucket balances changed after a target change");
    });

    // --- Allocation setup: real cash via Money ------------------------------------
    const bucketMain = await runner.runValue("Setup: User A funds a USD bucket via Money", async () => {
      const bucket = await createBucket(userA.client, { name: "USD Main", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "20000", categoryCode: "salary" });
      return bucket;
    });
    if (!bucketMain) throw new Error("Bucket setup failed.");

    // --- 13-17: basic allocation --------------------------------------------------
    await runner.run(
      "User A allocates own cash to own same-currency goal; bucket balance unchanged; goal/bucket totals correct",
      async () => {
        const before = await getBucketBalances(userA.client);

        const { data: eventsBefore } = await userA.client.from("financial_events").select("id");
        await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: bucketMain.id, amount: "4000" });
        const { data: eventsAfter } = await userA.client.from("financial_events").select("id");

        const after = await getBucketBalances(userA.client);
        assert(JSON.stringify(before) === JSON.stringify(after), "allocation must never change bucket balance");
        assert((eventsBefore?.length ?? 0) === (eventsAfter?.length ?? 0), "allocation must never create a financial_event");

        const summaries = await getGoalSummaries(userA.client);
        const summary = summaries.find((s) => s.goalId === goalA.id);
        assert(summary?.allocatedTotal === "4000.000000", `expected allocated 4000, got ${summary?.allocatedTotal}`);

        const shortfalls = await getGoalBucketShortfalls(userA.client);
        const row = shortfalls.find((s) => s.bucketId === bucketMain.id);
        assert(row?.allocatedTotal === "4000.000000", `expected bucket allocated total 4000, got ${row?.allocatedTotal}`);
      },
    );

    // --- GOAL ALLOCATION ATTACK: RPC-level rejection (18, 19) --------------------
    const bucketB = await runner.runValue("Setup: User B creates own USD bucket", () =>
      createBucket(userB.client, { name: "B's USD", currencyCode: "USD", bucketType: "bank_account" }),
    );
    if (!bucketB) throw new Error("bucketB setup failed");

    await runner.run("A cannot allocate B bucket to A goal", async () => {
      let threw = false;
      try {
        await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: bucketB.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "allocating from user B's bucket into user A's goal should be rejected");
    });

    await runner.run("A cannot allocate A bucket to B goal", async () => {
      let threw = false;
      try {
        await recordGoalAllocation(userA.client, { goalId: goalB.id, bucketId: bucketMain.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "allocating user A's bucket into user B's goal should be rejected");
    });

    // --- GOAL ALLOCATION ATTACK: raw insert (20) ----------------------------------
    await runner.run("A cannot raw-insert forged allocation: goal=A, bucket=B", async () => {
      const result = await userA.client.from("goal_allocation_events").insert({
        goal_id: goalA.id,
        bucket_id: bucketB.id,
        event_type: "allocate",
        amount: 100,
        currency_code: "USD",
        user_id: userA.id,
      });
      expectDenied(result, "forged allocation: own goal, user B's bucket");
    });

    await runner.run("A cannot raw-insert forged allocation: goal=B, bucket=A", async () => {
      const result = await userA.client.from("goal_allocation_events").insert({
        goal_id: goalB.id,
        bucket_id: bucketMain.id,
        event_type: "allocate",
        amount: 100,
        currency_code: "NGN",
        user_id: userA.id,
      });
      expectDenied(result, "forged allocation: user B's goal, own bucket");
    });

    await runner.run("A cannot raw-insert forged allocation: goal=B, bucket=B, user_id forged to A", async () => {
      const result = await userA.client.from("goal_allocation_events").insert({
        goal_id: goalB.id,
        bucket_id: bucketB.id,
        event_type: "allocate",
        amount: 100,
        currency_code: "NGN",
        user_id: userA.id,
      });
      expectDenied(result, "forged allocation: both B, user_id forged to A");
    });

    // --- 21: currency mismatch -----------------------------------------------------
    await runner.run("Allocation currency mismatch rejected", async () => {
      const ngnBucket = await createBucket(userA.client, { name: "NGN Wallet", currencyCode: "NGN", bucketType: "cash_wallet" });
      let threw = false;
      try {
        await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: ngnBucket.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "allocating an NGN bucket into a USD goal should be rejected");
    });

    // --- 22-23, 25: capacity + double-counting + multi-goal funding ---------------
    const goalD = await runner.runValue("Setup: User A creates a second cash-target goal (goal D)", () =>
      createGoal(userA.client, { goalTypeCode: "vehicle", measurementType: "cash_target", name: "Car Fund", currencyCode: "USD" }),
    );
    if (!goalD) throw new Error("goalD setup failed");

    await runner.run("Allocation larger than available unallocated bucket cash rejected", async () => {
      let threw = false;
      try {
        await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: bucketMain.id, amount: "999999" });
      } catch {
        threw = true;
      }
      assert(threw, "allocating more than available-to-allocate should be rejected");
    });

    await runner.run(
      "One bucket may fund multiple goals within available balance; the same cash cannot be double-counted",
      async () => {
        // bucketMain: balance 20000, already allocated 4000 to goalA -> 16000 available.
        await recordGoalAllocation(userA.client, { goalId: goalD.id, bucketId: bucketMain.id, amount: "16000" });

        const summaries = await getGoalSummaries(userA.client);
        const summaryD = summaries.find((s) => s.goalId === goalD.id);
        assert(summaryD?.allocatedTotal === "16000.000000", `expected goal D allocated 16000, got ${summaryD?.allocatedTotal}`);

        // Bucket is now fully allocated (4000 + 16000 = 20000) — any further
        // allocation, even 1 more unit, must be rejected: the same cash
        // cannot fund a third designation.
        let threw = false;
        try {
          await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: bucketMain.id, amount: "1" });
        } catch {
          threw = true;
        }
        assert(threw, "allocating beyond a fully-allocated bucket should be rejected");
      },
    );

    // --- 24: multiple same-currency buckets fund one goal --------------------------
    await runner.run("Multiple same-currency buckets may fund one goal", async () => {
      const bucketSecond = await createBucket(userA.client, { name: "USD Second", currencyCode: "USD", bucketType: "savings_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucketSecond.id, amount: "5000", categoryCode: "salary" });
      await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: bucketSecond.id, amount: "5000" });

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalA.id);
      // 4000 (bucketMain) + 5000 (bucketSecond) = 9000
      assert(summary?.allocatedTotal === "9000.000000", `expected goal A allocated 9000, got ${summary?.allocatedTotal}`);
    });

    // --- 26-28: release -------------------------------------------------------------
    await runner.run("Release reduces goal allocation exactly; release does not change cash", async () => {
      const before = await getBucketBalances(userA.client);
      await recordGoalRelease(userA.client, { goalId: goalA.id, bucketId: bucketMain.id, amount: "1000" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "release must never change cash");

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalA.id);
      // 9000 - 1000 = 8000
      assert(summary?.allocatedTotal === "8000.000000", `expected goal A allocated 8000 after release, got ${summary?.allocatedTotal}`);
    });

    await runner.run("Release larger than current allocation rejected", async () => {
      let threw = false;
      try {
        // goalA/bucketMain pair currently holds 4000 - 1000 = 3000.
        await recordGoalRelease(userA.client, { goalId: goalA.id, bucketId: bucketMain.id, amount: "999999" });
      } catch {
        threw = true;
      }
      assert(threw, "releasing more than currently allocated should be rejected");
    });

    // --- 29-30: reallocation ---------------------------------------------------------
    const goalE = await runner.runValue("Setup: User A creates a third cash-target goal (goal E)", () =>
      createGoal(userA.client, { goalTypeCode: "education", measurementType: "cash_target", name: "Course Fund", currencyCode: "USD" }),
    );
    if (!goalE) throw new Error("goalE setup failed");

    await runner.run("Reallocation from Goal A to Goal E is atomic; cash does not change", async () => {
      const before = await getBucketBalances(userA.client);
      await recordGoalReallocation(userA.client, { fromGoalId: goalA.id, toGoalId: goalE.id, bucketId: bucketMain.id, amount: "500" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "reallocation must never change cash");

      const summaries = await getGoalSummaries(userA.client);
      const summaryA = summaries.find((s) => s.goalId === goalA.id);
      const summaryE = summaries.find((s) => s.goalId === goalE.id);
      // goalA/bucketMain was 3000, now 2500; goalE was 0, now 500.
      assert(summaryE?.allocatedTotal === "500.000000", `expected goal E allocated 500, got ${summaryE?.allocatedTotal}`);
      // Total goalA (bucketMain 2500 + bucketSecond 5000) = 7500.
      assert(summaryA?.allocatedTotal === "7500.000000", `expected goal A allocated 7500, got ${summaryA?.allocatedTotal}`);
    });

    // --- 31-32: idempotency ---------------------------------------------------------
    await runner.run("Retried allocation is idempotent", async () => {
      const idempotencyKey = randomUUID();
      const first = await recordGoalAllocation(userA.client, { goalId: goalE.id, bucketId: bucketMain.id, amount: "200", idempotencyKey });
      const second = await recordGoalAllocation(userA.client, { goalId: goalE.id, bucketId: bucketMain.id, amount: "200", idempotencyKey });
      assert(first.id === second.id, "two calls with the same idempotency key produced different events");

      const summaries = await getGoalSummaries(userA.client);
      const summaryE = summaries.find((s) => s.goalId === goalE.id);
      // 500 + 200 (idempotent, counted once) = 700
      assert(summaryE?.allocatedTotal === "700.000000", `expected goal E allocated 700, got ${summaryE?.allocatedTotal}`);
    });

    await runner.run("Retried release is idempotent", async () => {
      const idempotencyKey = randomUUID();
      await recordGoalRelease(userA.client, { goalId: goalE.id, bucketId: bucketMain.id, amount: "100", idempotencyKey });
      await recordGoalRelease(userA.client, { goalId: goalE.id, bucketId: bucketMain.id, amount: "100", idempotencyKey });

      const summaries = await getGoalSummaries(userA.client);
      const summaryE = summaries.find((s) => s.goalId === goalE.id);
      // 700 - 100 (idempotent, counted once) = 600
      assert(summaryE?.allocatedTotal === "600.000000", `expected goal E allocated 600, got ${summaryE?.allocatedTotal}`);
    });

    await runner.run("Retried reallocation is idempotent", async () => {
      const idempotencyKey = randomUUID();
      await recordGoalReallocation(userA.client, { fromGoalId: goalE.id, toGoalId: goalD.id, bucketId: bucketMain.id, amount: "100", idempotencyKey });
      await recordGoalReallocation(userA.client, { fromGoalId: goalE.id, toGoalId: goalD.id, bucketId: bucketMain.id, amount: "100", idempotencyKey });

      const summaries = await getGoalSummaries(userA.client);
      const summaryE = summaries.find((s) => s.goalId === goalE.id);
      const summaryD = summaries.find((s) => s.goalId === goalD.id);
      // goalE: 600 - 100 (idempotent, once) = 500
      assert(summaryE?.allocatedTotal === "500.000000", `expected goal E allocated 500, got ${summaryE?.allocatedTotal}`);
      // goalD: 16000 + 100 (idempotent, once) = 16100
      assert(summaryD?.allocatedTotal === "16100.000000", `expected goal D allocated 16100, got ${summaryD?.allocatedTotal}`);
    });

    // --- Allocation capacity concurrency race --------------------------------------
    await runner.run(
      "Two simultaneous allocation attempts against the same bucket cannot both over-allocate it",
      async () => {
        const raceBucket = await createBucket(userA.client, { name: "Race Bucket", currencyCode: "USD", bucketType: "cash_wallet" });
        await recordMoneyReceived(userA.client, { bucketId: raceBucket.id, amount: "1000", categoryCode: "salary" });

        const goalRace1 = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Race 1", currencyCode: "USD" });
        const goalRace2 = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Race 2", currencyCode: "USD" });

        const results = await Promise.allSettled([
          recordGoalAllocation(userA.client, { goalId: goalRace1.id, bucketId: raceBucket.id, amount: "700" }),
          recordGoalAllocation(userA.client, { goalId: goalRace2.id, bucketId: raceBucket.id, amount: "700" }),
        ]);

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        assert(succeeded === 1, `expected exactly 1 of 2 concurrent over-allocating attempts to succeed, got ${succeeded}`);

        const shortfalls = await getGoalBucketShortfalls(userA.client);
        const row = shortfalls.find((s) => s.bucketId === raceBucket.id);
        assert(row?.allocatedTotal === "700.000000", `expected race bucket allocated total exactly 700, got ${row?.allocatedTotal}`);
      },
    );

    // --- 33-34: protected flag -------------------------------------------------------
    await runner.run("Protected flag is user-controlled; protected allocated total is derived correctly", async () => {
      const goalProtected = await createGoal(userA.client, {
        goalTypeCode: "business_capital",
        measurementType: "cash_target",
        name: "Protected Capital",
        currencyCode: "USD",
        isProtected: true,
      });
      const protectedBucket = await createBucket(userA.client, { name: "Protected Bucket", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: protectedBucket.id, amount: "2000", categoryCode: "salary" });
      await recordGoalAllocation(userA.client, { goalId: goalProtected.id, bucketId: protectedBucket.id, amount: "2000" });

      const totals = await getGoalProtectedAllocationTotals(userA.client);
      const usd = totals.find((t) => t.currencyCode === "USD");
      assert(usd !== undefined, "expected a USD protected allocation total");
      assert(Number(usd!.amount) >= 2000, `expected protected total >= 2000, got ${usd!.amount}`);

      // is_protected is user-controlled and freely toggleable.
      await updateGoal(userA.client, goalProtected.id, { isProtected: false });
      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalProtected.id);
      assert(summary?.isProtected === false, "is_protected should have been toggled off by the user");
    });

    // --- 35-36: allocation shortfall --------------------------------------------------
    await runner.run("Spending cash later can create a shortfall, which is reported, not silently rewritten", async () => {
      const shortfallBucket = await createBucket(userA.client, { name: "Shortfall Bucket", currencyCode: "USD", bucketType: "cash_wallet" });
      await recordMoneyReceived(userA.client, { bucketId: shortfallBucket.id, amount: "1000", categoryCode: "salary" });
      const goalShortfall = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Shortfall Goal", currencyCode: "USD" });
      await recordGoalAllocation(userA.client, { goalId: goalShortfall.id, bucketId: shortfallBucket.id, amount: "1000" });

      // A normal Money spend from this bucket -- Goals has no say over it.
      await recordMoneySpent(userA.client, { bucketId: shortfallBucket.id, amount: "400", categoryCode: "housing" });

      const shortfalls = await getGoalBucketShortfalls(userA.client);
      const row = shortfalls.find((s) => s.bucketId === shortfallBucket.id);
      assert(row !== undefined, "expected a shortfall row for this bucket");
      assert(row!.balance === "600.000000", `expected balance 600, got ${row!.balance}`);
      assert(row!.allocatedTotal === "1000.000000", `allocation must NOT be silently rewritten, expected 1000, got ${row!.allocatedTotal}`);
      assert(row!.shortfall === "400.000000", `expected shortfall 400, got ${row!.shortfall}`);
    });

    // --- 37-38: cash-target remaining / target met ------------------------------------
    await runner.run("Cash-target remaining = target - allocated where positive; target met returns zero remaining", async () => {
      const bucketTarget = await createBucket(userA.client, { name: "Target Bucket", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucketTarget.id, amount: "5000", categoryCode: "salary" });

      const goalPartial = await createGoal(userA.client, {
        goalTypeCode: "custom", measurementType: "cash_target", name: "Partial Target", currencyCode: "USD", targetValue: "5000",
      });
      await recordGoalAllocation(userA.client, { goalId: goalPartial.id, bucketId: bucketTarget.id, amount: "3000" });

      const goalFull = await createGoal(userA.client, {
        goalTypeCode: "custom", measurementType: "cash_target", name: "Fully Funded Target", currencyCode: "USD", targetValue: "2000",
      });
      await recordGoalAllocation(userA.client, { goalId: goalFull.id, bucketId: bucketTarget.id, amount: "2000" });

      const summaries = await getGoalSummaries(userA.client);
      const partial = summaries.find((s) => s.goalId === goalPartial.id);
      const full = summaries.find((s) => s.goalId === goalFull.id);

      assert(partial?.remaining === "2000.000000", `expected remaining 2000, got ${partial?.remaining}`);
      assert(partial?.percentage === 60, `expected 60%, got ${partial?.percentage}`);
      assert(full?.remaining === "0.000000", `expected remaining 0 when target met, got ${full?.remaining}`);
      assert(full?.percentage === 100, `expected 100%, got ${full?.percentage}`);
    });

    // --- 39-41: required pace ---------------------------------------------------------
    await runner.run("Required pace calculated correctly when target/date/current exist", async () => {
      const goalPace = await createGoal(userA.client, {
        goalTypeCode: "custom",
        measurementType: "cash_target",
        name: "Pace Goal",
        currencyCode: "USD",
        targetValue: "12000",
        targetDate: daysFromNow(91),
      });
      const bucketPace = await createBucket(userA.client, { name: "Pace Bucket", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucketPace.id, amount: "3000", categoryCode: "salary" });
      await recordGoalAllocation(userA.client, { goalId: goalPace.id, bucketId: bucketPace.id, amount: "3000" });

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalPace.id);
      assert(summary?.requiredPaceStatus === "calculated", `expected calculated, got ${summary?.requiredPaceStatus}`);
      // remaining = 12000 - 3000 = 9000; periods = ceil(91 / 30.4375) = 3;
      // required pace = 9000 / 3 = 3000.
      assert(summary?.requiredPaceAmount === "3000.000000", `expected pace 3000.000000, got ${summary?.requiredPaceAmount}`);
      assert(summary?.requiredPacePeriodsRemaining === 3, `expected 3 periods, got ${summary?.requiredPacePeriodsRemaining}`);
    });

    await runner.run("Required pace returns incomplete when date missing", async () => {
      const goalNoDate = await createGoal(userA.client, {
        goalTypeCode: "custom", measurementType: "cash_target", name: "No Date Goal", currencyCode: "USD", targetValue: "5000",
      });
      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalNoDate.id);
      assert(summary?.requiredPaceStatus === "no_target_date", `expected no_target_date, got ${summary?.requiredPaceStatus}`);
      assert(summary?.requiredPaceAmount === null, "no fabricated pace amount when date is missing");
    });

    await runner.run("Required pace handles a passed target date explicitly", async () => {
      const goalPassed = await createGoal(userA.client, {
        goalTypeCode: "custom", measurementType: "cash_target", name: "Passed Date Goal", currencyCode: "USD",
        targetValue: "5000", targetDate: daysFromNow(-10),
      });
      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalPassed.id);
      assert(summary?.requiredPaceStatus === "date_passed", `expected date_passed, got ${summary?.requiredPaceStatus}`);
      assert(summary?.requiredPaceAmount === null, "no fabricated pace amount when target date has passed");
    });

    // --- 42-43: precision -------------------------------------------------------------
    await runner.run("JPY precision enforced on a goal target", async () => {
      const goalJpy = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "JPY Goal", currencyCode: "JPY" });
      let threw = false;
      try {
        await recordGoalTarget(userA.client, { goalId: goalJpy.id, targetValue: "1000.5" });
      } catch {
        threw = true;
      }
      assert(threw, "a fractional JPY target value should be rejected");
    });

    await runner.run("KWD precision (3 decimals) accepted on a goal allocation", async () => {
      const goalKwd = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "KWD Goal", currencyCode: "KWD" });
      const bucketKwd = await createBucket(userA.client, { name: "KWD Bucket", currencyCode: "KWD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucketKwd.id, amount: "50.123", categoryCode: "salary" });
      const event = await recordGoalAllocation(userA.client, { goalId: goalKwd.id, bucketId: bucketKwd.id, amount: "50.123" });
      assert(event.amount !== undefined, "expected a successful 3-decimal KWD allocation");
    });

    // --- 44-45: native currency totals + FX blending -----------------------------------
    await runner.run("Native currency goal totals remain separated; missing FX rate never blends currencies", async () => {
      const ngnBucket = await createBucket(userA.client, { name: "NGN Fund Bucket", currencyCode: "NGN", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: ngnBucket.id, amount: "500000", categoryCode: "salary" });
      const goalNgn = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "NGN Goal", currencyCode: "NGN" });
      await recordGoalAllocation(userA.client, { goalId: goalNgn.id, bucketId: ngnBucket.id, amount: "100000" });

      const totals = await getGoalNativeCurrencyTotals(userA.client);
      const usd = totals.find((t) => t.currencyCode === "USD");
      const ngn = totals.find((t) => t.currencyCode === "NGN");
      assert(usd !== undefined && ngn !== undefined, "expected both USD and NGN totals present and separate");

      const conversion = convertToReportingCurrency(totals, "USD", new Map());
      assert(conversion.status === "not_calculated", "missing NGN->USD rate must never be silently blended");
    });

    // --- 46-49: debt-payoff goal -------------------------------------------------------
    const liabilityA = await runner.runValue("Setup: User A creates a liability for a debt-payoff goal", () =>
      createLiability(userA.client, { name: "Credit Facility", liabilityType: "credit_facility", currencyCode: "NGN", openingPrincipal: "50000" }),
    );
    if (!liabilityA) throw new Error("liabilityA setup failed");

    await runner.run("Debt-payoff goal links own liability; creating it changes neither liability nor cash", async () => {
      const bucketsBefore = await getBucketBalances(userA.client);
      const liabilitiesBefore = await getLiabilitySummaries(userA.client);

      const debtGoal = await createGoal(userA.client, {
        goalTypeCode: "debt_payoff", measurementType: "debt_balance_target", name: "Pay Off Credit Facility", liabilityId: liabilityA.id,
      });

      assert(debtGoal.currency_code === "NGN", `expected goal currency derived from liability (NGN), got ${debtGoal.currency_code}`);

      const bucketsAfter = await getBucketBalances(userA.client);
      const liabilitiesAfter = await getLiabilitySummaries(userA.client);
      assert(JSON.stringify(bucketsBefore) === JSON.stringify(bucketsAfter), "creating a debt goal must never change cash");
      assert(
        JSON.stringify(liabilitiesBefore) === JSON.stringify(liabilitiesAfter),
        "creating a debt goal must never change the liability's own balance",
      );

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === debtGoal.id);
      assert(summary?.startingLiabilityBalance === "50000.000000", `expected frozen starting balance 50000, got ${summary?.startingLiabilityBalance}`);
      assert(
        summary?.currentOutstandingPrincipal === "50000.000000",
        `expected live outstanding 50000 before any payment, got ${summary?.currentOutstandingPrincipal}`,
      );
    });

    const liabilityB = await runner.runValue("Setup: User B creates own liability", () =>
      createLiability(userB.client, { name: "B's Loan", liabilityType: "loan", currencyCode: "NGN", openingPrincipal: "10000" }),
    );
    if (!liabilityB) throw new Error("liabilityB setup failed");

    await runner.run("A cannot link a debt goal to B's liability", async () => {
      let threw = false;
      try {
        await createGoal(userA.client, {
          goalTypeCode: "debt_payoff", measurementType: "debt_balance_target", name: "Forged Debt Goal", liabilityId: liabilityB.id,
        });
      } catch {
        threw = true;
      }
      assert(threw, "linking a debt goal to user B's liability should be rejected");
    });

    await runner.run("Debt progress derives live from the Liabilities read model, not a frozen duplicate", async () => {
      const debtGoal2 = await createGoal(userA.client, {
        goalTypeCode: "debt_payoff", measurementType: "debt_balance_target", name: "Second Debt Goal", liabilityId: liabilityA.id,
      });
      const debtBucket = await createBucket(userA.client, { name: "Debt Payment Bucket", currencyCode: "NGN", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: debtBucket.id, amount: "20000", categoryCode: "salary" });
      await recordDebtPayment(userA.client, { liabilityId: liabilityA.id, bucketId: debtBucket.id, principalAmount: "10000" });

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === debtGoal2.id);
      // starting was frozen at 50000 (from the earlier setup); a 10000
      // principal payment against the SAME liability now reduces the live
      // outstanding to 40000 for every debt goal linked to it.
      assert(summary?.startingLiabilityBalance === "50000.000000", `starting balance must stay frozen at 50000, got ${summary?.startingLiabilityBalance}`);
      assert(summary?.currentOutstandingPrincipal === "40000.000000", `expected live outstanding 40000 after payment, got ${summary?.currentOutstandingPrincipal}`);
    });

    // --- 50-52: recurring-income goal ---------------------------------------------------
    const goalIncome = await runner.runValue("Setup: User A creates a recurring-income goal", () =>
      createGoal(userA.client, {
        goalTypeCode: "recurring_income", measurementType: "monthly_income_target", name: "5k/mo Income", currencyCode: "USD", targetValue: "5000",
      }),
    );
    if (!goalIncome) throw new Error("goalIncome setup failed");

    await runner.run("Recurring-income goal rejects cash allocation", async () => {
      let threw = false;
      try {
        await recordGoalAllocation(userA.client, { goalId: goalIncome.id, bucketId: bucketMain.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "allocating cash to a monthly_income_target goal should be rejected");
    });

    await runner.run(
      "Recurring current progress is never fabricated or inferred from unrelated income transactions",
      async () => {
        // User A has recorded plenty of unrelated salary/business income
        // elsewhere in this suite already -- none of it should leak into
        // this goal's numbers.
        const summaries = await getGoalSummaries(userA.client);
        const summary = summaries.find((s) => s.goalId === goalIncome.id);
        assert(summary?.allocatedTotal === null, "a recurring-income goal must never show an allocated total");
        assert(summary?.remaining === null, "a recurring-income goal must never show a fabricated remaining figure");
        assert(summary?.requiredPaceStatus === "not_applicable", `expected not_applicable, got ${summary?.requiredPaceStatus}`);
      },
    );

    // --- 53-55: milestones -----------------------------------------------------------
    const milestone = await runner.runValue("User A adds a milestone to own goal", () =>
      createGoalMilestone(userA.client, { goalId: goalA.id, title: "Open a dedicated savings account" }),
    );
    if (!milestone) throw new Error("milestone setup failed");

    await runner.run("Goal milestones belong only to caller's goal", async () => {
      const milestones = await listGoalMilestones(userA.client, goalA.id);
      assert(milestones.length === 1 && milestones[0].id === milestone.id, "expected exactly the one milestone just created");
    });

    await runner.run("A cannot add milestone to B goal", async () => {
      let threw = false;
      try {
        await createGoalMilestone(userA.client, { goalId: goalB.id, title: "Forged milestone" });
      } catch {
        threw = true;
      }
      assert(threw, "adding a milestone to user B's goal should be rejected");
    });

    await runner.run("Milestone completion causes no Money effects", async () => {
      const before = await getBucketBalances(userA.client);
      const { data: eventsBefore } = await userA.client.from("financial_events").select("id");
      await updateGoalMilestone(userA.client, milestone.id, { completedAt: new Date().toISOString() });
      const after = await getBucketBalances(userA.client);
      const { data: eventsAfter } = await userA.client.from("financial_events").select("id");
      assert(JSON.stringify(before) === JSON.stringify(after), "completing a milestone must never change cash");
      assert((eventsBefore?.length ?? 0) === (eventsAfter?.length ?? 0), "completing a milestone must never create a financial_event");

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalA.id);
      assert(summary?.milestoneCompletedCount === 1, `expected 1 completed milestone, got ${summary?.milestoneCompletedCount}`);
      assert(summary?.milestoneTotalCount === 1, `expected 1 total milestone, got ${summary?.milestoneTotalCount}`);
    });

    // --- 10: currency immutability once allocations exist --------------------------
    await runner.run("Goal currency cannot change after allocations exist", async () => {
      let threw = false;
      try {
        await updateGoal(userA.client, goalA.id, { currencyCode: "NGN" });
      } catch {
        threw = true;
      }
      assert(threw, "changing currency on a goal with allocation history should be rejected");
    });

    // --- 56: archived/paused goals remain historically readable ---------------------
    await runner.run("Archived/paused goals remain historically readable", async () => {
      await updateGoal(userA.client, goalA.id, { status: "archived" });
      const goals = await listGoals(userA.client);
      const found = goals.find((g) => g.id === goalA.id);
      assert(found !== undefined, "an archived goal must remain listed, not disappear");
      assert(found?.status === "archived", `expected status archived, got ${found?.status}`);

      const summaries = await getGoalSummaries(userA.client);
      const summary = summaries.find((s) => s.goalId === goalA.id);
      assert(summary !== undefined, "an archived goal must remain visible in goal_summary()");
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
  console.error("Goals suite crashed:", err);
  process.exitCode = 1;
});
