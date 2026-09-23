/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Financial Rules, Obligations, and Safe-to-Deploy domain (financial_rules,
 * financial_rule_versions, obligations, cash_use_overrides).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion. Each concern below
 * deliberately uses its own fresh currency to keep the arithmetic isolated
 * and independently verifiable.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:rules
 */
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createFinancialRule,
  recordFinancialRuleVersion,
  getFinancialRuleSummaries,
  getFinancialRuleHistory,
  getSafeToDeployByCurrency,
  evaluateProposedCashUse,
  recordCashUseOverride,
} from "../../../lib/domain/rules/repository.ts";
import { aggregateSafeToDeployToReportingCurrency } from "../../../lib/domain/rules/aggregate.ts";
import {
  createObligation,
  updateObligation,
  getObligationSummaries,
  getUpcomingObligations,
} from "../../../lib/domain/obligations/repository.ts";
import { createGoal } from "../../../lib/domain/goals/repository.ts";
import { recordGoalAllocation } from "../../../lib/domain/goals/repository.ts";
import { createBucket, getBucketBalances, recordMoneyReceived, recordMoneySpent } from "../../../lib/domain/money/repository.ts";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "rules-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Financial Rules, Obligations & Safe-to-Deploy suite\n");

    // --- 1-6: rule isolation (EUR for A, GBP for B) ------------------------------
    const ruleA = await runner.runValue("User A creates own minimum cash floor rule", () =>
      createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "EUR", thresholdValue: "2000" }),
    );
    const ruleB = await runner.runValue("User B creates own rule", () =>
      createFinancialRule(userB.client, { ruleType: "minimum_cash_floor", currencyCode: "GBP", thresholdValue: "1000" }),
    );
    if (!ruleA || !ruleB) throw new Error("Rule setup failed — aborting remaining tests.");

    await runner.run("A cannot read B rule", async () => {
      const result = await userA.client.from("financial_rules").select("*").eq("id", ruleB.id);
      expectFilteredToEmpty(result, "user A selecting user B's rule by id");
    });

    await runner.run("A cannot mutate B rule", async () => {
      const result = await userA.client.from("financial_rules").update({ status: "inactive" }).eq("id", ruleB.id).select("*");
      expectFilteredToEmpty(result, "user A updating user B's rule");
    });

    await runner.run("A cannot forge ownership", async () => {
      const insertResult = await userA.client
        .from("financial_rules")
        .insert({ user_id: userB.id, rule_type: "minimum_cash_floor", currency_code: "SEK" });
      expectDenied(insertResult, "user A forging a rule with user B's user_id");

      const reassignResult = await userA.client.from("financial_rules").update({ status: "inactive" }).eq("id", ruleA.id).select("*");
      assert(reassignResult.error === null, "user A updating their own rule's status should succeed");
    });

    await runner.run("Anonymous cannot read/mutate rules", async () => {
      const selectResult = await anonClient.from("financial_rules").select("*").eq("id", ruleA.id);
      expectDenied(selectResult, "anonymous SELECT on financial_rules");
      const insertResult = await anonClient
        .from("financial_rules")
        .insert({ user_id: userA.id, rule_type: "minimum_cash_floor", currency_code: "DKK" });
      expectDenied(insertResult, "anonymous INSERT on financial_rules");
    });

    // Reactivate ruleA (deactivated above) so later tests can use it.
    await runner.run("Setup: reactivate User A's EUR rule with a new version", async () => {
      const reactivated = await createFinancialRule(userA.client, {
        ruleType: "minimum_cash_floor",
        currencyCode: "EUR",
        thresholdValue: "2500",
      });
      assert(reactivated.id === ruleA.id, "reactivating should reuse the same rule identity, not create a duplicate");
    });

    // --- 7: rule version history preserves prior threshold -----------------------
    await runner.run("Rule version/change history preserves prior threshold", async () => {
      await recordFinancialRuleVersion(userA.client, { ruleId: ruleA.id, thresholdValue: "3000" });
      const history = await getFinancialRuleHistory(userA.client, ruleA.id);
      const values = history.map((h) => h.thresholdValue).sort();
      // 2000 (original) -> 2500 (reactivation) -> 3000 (latest) — all three preserved.
      assert(values.length === 3, `expected 3 history rows, got ${values.length}`);
      assert(values.includes("2000.000000") && values.includes("2500.000000") && values.includes("3000.000000"), `unexpected values: ${values}`);

      const summaries = await getFinancialRuleSummaries(userA.client);
      const summary = summaries.find((s) => s.ruleId === ruleA.id);
      assert(summary?.currentThreshold === "3000.000000", `expected latest threshold 3000, got ${summary?.currentThreshold}`);
    });

    // --- 8: explicit zero floor distinct from unconfigured ------------------------
    await runner.run("Explicit zero floor is distinct from no rule", async () => {
      const nzdBucket = await createBucket(userA.client, { name: "NZD Wallet", currencyCode: "NZD", bucketType: "cash_wallet" });
      await recordMoneyReceived(userA.client, { bucketId: nzdBucket.id, amount: "1000", categoryCode: "salary" });

      const before = await getSafeToDeployByCurrency(userA.client);
      const nzdBefore = before.find((r) => r.currencyCode === "NZD");
      assert(nzdBefore?.status === "not_configured", `expected NZD not_configured before any rule, got ${nzdBefore?.status}`);

      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "NZD", thresholdValue: "0" });

      const after = await getSafeToDeployByCurrency(userA.client);
      const nzdAfter = after.find((r) => r.currencyCode === "NZD");
      assert(nzdAfter?.status === "calculated", `expected NZD calculated after explicit zero floor, got ${nzdAfter?.status}`);
      assert(nzdAfter?.minimumCashFloor === "0.000000", `expected explicit floor 0, got ${nzdAfter?.minimumCashFloor}`);
      assert(nzdAfter?.safeToDeploy === "1000.000000", `expected safe to deploy 1000 with zero floor, got ${nzdAfter?.safeToDeploy}`);
    });

    // --- 9-12: obligation isolation ------------------------------------------------
    const obligationA = await runner.runValue("User A creates own obligation", () =>
      createObligation(userA.client, { name: "Rent", currencyCode: "NGN", amount: "100000" }),
    );
    const obligationB = await runner.runValue("User B creates own obligation", () =>
      createObligation(userB.client, { name: "B's Rent", currencyCode: "GBP", amount: "500" }),
    );
    if (!obligationA || !obligationB) throw new Error("Obligation setup failed.");

    await runner.run("A cannot read B obligation", async () => {
      const result = await userA.client.from("obligations").select("*").eq("id", obligationB.id);
      expectFilteredToEmpty(result, "user A selecting user B's obligation by id");
    });

    await runner.run("A cannot mutate B obligation", async () => {
      const result = await userA.client.from("obligations").update({ status: "paid" }).eq("id", obligationB.id).select("*");
      expectFilteredToEmpty(result, "user A updating user B's obligation");
    });

    await runner.run("Anonymous cannot read/mutate obligations", async () => {
      const selectResult = await anonClient.from("obligations").select("*").eq("id", obligationA.id);
      expectDenied(selectResult, "anonymous SELECT on obligations");
      const insertResult = await anonClient
        .from("obligations")
        .insert({ user_id: userA.id, name: "Anon", currency_code: "NGN", amount: 100 });
      expectDenied(insertResult, "anonymous INSERT on obligations");
    });

    // --- 13-14: goal-link validation ------------------------------------------------
    const goalUsdCash = await runner.runValue("Setup: User A creates a USD cash_target goal", () =>
      createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "USD Goal", currencyCode: "USD" }),
    );
    if (!goalUsdCash) throw new Error("goalUsdCash setup failed");

    await runner.run("Goal-linked obligation currency mismatch rejected", async () => {
      let threw = false;
      try {
        await createObligation(userA.client, {
          name: "Mismatched", currencyCode: "NGN", amount: "1000", fundingGoalId: goalUsdCash.id,
        });
      } catch {
        threw = true;
      }
      assert(threw, "linking an NGN obligation to a USD goal should be rejected");
    });

    const goalB = await runner.runValue("Setup: User B creates own goal", () =>
      createGoal(userB.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "B's Goal", currencyCode: "USD" }),
    );
    if (!goalB) throw new Error("goalB setup failed");

    await runner.run("A cannot link obligation to B goal", async () => {
      let threw = false;
      try {
        await createObligation(userA.client, {
          name: "Forged Link", currencyCode: "USD", amount: "1000", fundingGoalId: goalB.id,
        });
      } catch {
        threw = true;
      }
      assert(threw, "linking an obligation to user B's goal should be rejected");
    });

    // --- 15: protected obligation distinct from unprotected ------------------------
    // Deliberately a currency untouched anywhere else in this suite (CZK) --
    // the later NGN Safe-to-Deploy formula scenario must not see this
    // protected obligation bleed into its own protected-commitments math.
    await runner.run("Protected obligation remains distinct from unprotected obligation", async () => {
      const protectedObl = await createObligation(userA.client, { name: "Protected Fee", currencyCode: "CZK", amount: "5000", isProtected: true });
      const unprotectedObl = await createObligation(userA.client, { name: "Unprotected Fee", currencyCode: "CZK", amount: "3000", isProtected: false });
      const summaries = await getObligationSummaries(userA.client);
      const p = summaries.find((s) => s.obligationId === protectedObl.id);
      const u = summaries.find((s) => s.obligationId === unprotectedObl.id);
      assert(p?.isProtected === true, "protected obligation should report isProtected true");
      assert(u?.isProtected === false, "unprotected obligation should report isProtected false");
    });

    // --- 16-17: financial invariance ------------------------------------------------
    await runner.run("Obligation creation causes no Money effect", async () => {
      const before = await getBucketBalances(userA.client);
      await createObligation(userA.client, { name: "Invariance Check", currencyCode: "USD", amount: "100" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "bucket balances changed after creating an obligation");
    });

    await runner.run("Marking obligation paid causes no Money effect", async () => {
      const before = await getBucketBalances(userA.client);
      await updateObligation(userA.client, obligationA.id, { status: "paid" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "bucket balances changed after marking an obligation paid");
    });

    // --- 18: overdue derivation -------------------------------------------------------
    await runner.run("Overdue derived correctly from date/current status", async () => {
      const overdueObl = await createObligation(userA.client, { name: "Overdue Bill", currencyCode: "USD", amount: "50", dueDate: daysFromNow(-5) });
      const futureObl = await createObligation(userA.client, { name: "Future Bill", currencyCode: "USD", amount: "50", dueDate: daysFromNow(5) });
      const paidPastObl = await createObligation(userA.client, { name: "Paid Past Bill", currencyCode: "USD", amount: "50", dueDate: daysFromNow(-5) });
      await updateObligation(userA.client, paidPastObl.id, { status: "paid" });

      const summaries = await getObligationSummaries(userA.client);
      assert(summaries.find((s) => s.obligationId === overdueObl.id)?.isOverdue === true, "past due + active should be overdue");
      assert(summaries.find((s) => s.obligationId === futureObl.id)?.isOverdue === false, "future due date should not be overdue");
      assert(summaries.find((s) => s.obligationId === paidPastObl.id)?.isOverdue === false, "paid status should never be overdue regardless of date");
    });

    // --- 19-20: not_configured vs explicit configuration (CAD) --------------------
    const cadBucket = await runner.runValue("Setup: User A funds a CAD bucket", async () => {
      const bucket = await createBucket(userA.client, { name: "CAD Wallet", currencyCode: "CAD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "3000", categoryCode: "salary" });
      return bucket;
    });
    if (!cadBucket) throw new Error("cadBucket setup failed");

    await runner.run("Safe to Deploy returns not_configured when no floor exists", async () => {
      const results = await getSafeToDeployByCurrency(userA.client);
      const cad = results.find((r) => r.currencyCode === "CAD");
      assert(cad?.status === "not_configured", `expected CAD not_configured, got ${cad?.status}`);
      assert(cad?.minimumCashFloor === null, "no fabricated floor when unconfigured");
      assert(cad?.safeToDeploy === null, "no fabricated safe-to-deploy when unconfigured");
    });

    await runner.run("Explicit zero floor permits calculation (CAD floor = 5000, deficit case)", async () => {
      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "CAD", thresholdValue: "5000" });
      const results = await getSafeToDeployByCurrency(userA.client);
      const cad = results.find((r) => r.currencyCode === "CAD");
      assert(cad?.status === "calculated", `expected CAD calculated, got ${cad?.status}`);
      // --- 31: safe_to_deploy clamps at zero -----------------------------------
      assert(cad?.safeToDeploy === "0.000000", `expected safe to deploy clamped to 0, got ${cad?.safeToDeploy}`);
      // --- 32: retained deficit reports correct positive deficit ---------------
      assert(cad?.retainedDeficit === "2000.000000", `expected deficit 2000, got ${cad?.retainedDeficit}`);
    });

    // --- 21: no protected commitments, cash only (JPY, also covers 53) -----------
    const jpyBucket = await runner.runValue("Setup: User A funds a JPY bucket", async () => {
      const bucket = await createBucket(userA.client, { name: "JPY Wallet", currencyCode: "JPY", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "100000", categoryCode: "salary" });
      return bucket;
    });
    if (!jpyBucket) throw new Error("jpyBucket setup failed");

    const jpyRule = await runner.runValue("Setup: User A configures a JPY floor", () =>
      createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "JPY", thresholdValue: "20000" }),
    );
    if (!jpyRule) throw new Error("jpyRule setup failed");

    await runner.run("Safe to Deploy calculates correctly with cash and no protected commitments", async () => {
      const results = await getSafeToDeployByCurrency(userA.client);
      const jpy = results.find((r) => r.currencyCode === "JPY");
      assert(jpy?.protectedGoalCash === "0.000000", `expected no protected goal cash, got ${jpy?.protectedGoalCash}`);
      assert(jpy?.requiredRetainedCash === "20000.000000", `expected required retained 20000, got ${jpy?.requiredRetainedCash}`);
      assert(jpy?.safeToDeploy === "80000.000000", `expected safe to deploy 80000, got ${jpy?.safeToDeploy}`);
    });

    // --- 53: JPY (0-decimal) floor precision enforced -----------------------------
    await runner.run("JPY floor precision enforced", async () => {
      let threw = false;
      try {
        await recordFinancialRuleVersion(userA.client, { ruleId: jpyRule.id, thresholdValue: "20000.5" });
      } catch {
        threw = true;
      }
      assert(threw, "a fractional JPY threshold should be rejected");
    });

    // --- 54: KWD (3-decimal) obligation precision enforced ------------------------
    await runner.run("KWD obligation precision enforced", async () => {
      const kwdObl = await createObligation(userA.client, { name: "KWD Fee", currencyCode: "KWD", amount: "50.123" });
      assert(kwdObl.amount !== undefined, "expected a successful 3-decimal KWD obligation");
      let threw = false;
      try {
        await updateObligation(userA.client, kwdObl.id, { amount: "50.1234" });
      } catch {
        threw = true;
      }
      assert(threw, "a 4-decimal KWD amount should be rejected");
    });

    // --- 22, 30: USD -- protected commitments exceed minimum floor ----------------
    const usdBucket = await runner.runValue("Setup: User A funds a USD bucket (main formula scenario)", async () => {
      const bucket = await createBucket(userA.client, { name: "USD Main", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary" });
      return bucket;
    });
    if (!usdBucket) throw new Error("usdBucket setup failed");

    const goalUsdProtected = await runner.runValue("Setup: User A creates a protected USD goal, allocates 4000", async () => {
      const goal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Protected USD Goal", currencyCode: "USD", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: usdBucket.id, amount: "4000" });
      return goal;
    });
    if (!goalUsdProtected) throw new Error("goalUsdProtected setup failed");

    await runner.run("Protected goal allocation is included in protected_goal_cash", async () => {
      const results = await getSafeToDeployByCurrency(userA.client);
      const usd = results.find((r) => r.currencyCode === "USD");
      assert(usd?.protectedGoalCash === "4000.000000", `expected protected goal cash 4000, got ${usd?.protectedGoalCash}`);
    });

    await runner.run("Setup: User A records a protected USD obligation (uncovered 1000)", async () => {
      await createObligation(userA.client, { name: "Uncovered Protected Fee", currencyCode: "USD", amount: "1000", isProtected: true });
    });

    await runner.run("Setup: User A configures USD floor at 3000 (matches worked example)", async () => {
      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "USD", thresholdValue: "3000" });
    });

    await runner.run(
      "Safe to Deploy calculates correctly when protected commitments exceed minimum floor (worked example: 10000/4000/1000/3000 -> 5000)",
      async () => {
        const results = await getSafeToDeployByCurrency(userA.client);
        const usd = results.find((r) => r.currencyCode === "USD");
        assert(usd?.protectedCommitments === "5000.000000", `expected protected commitments 5000, got ${usd?.protectedCommitments}`);
        // --- 30: MAX, not SUM (3000 + 5000 would be 8000; correct is 5000) -----
        assert(usd?.requiredRetainedCash === "5000.000000", `expected required retained MAX(3000,5000)=5000, got ${usd?.requiredRetainedCash}`);
        assert(usd?.safeToDeploy === "5000.000000", `expected safe to deploy 5000, got ${usd?.safeToDeploy}`);
        assert(usd?.retainedDeficit === "0.000000", "no deficit expected when cash exceeds required retained");
      },
    );

    // --- 25: non-protected allocation excluded (HKD) -------------------------------
    await runner.run("Non-protected goal allocation is not included as protected retained cash", async () => {
      const hkdBucket = await createBucket(userA.client, { name: "HKD Wallet", currencyCode: "HKD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: hkdBucket.id, amount: "5000", categoryCode: "salary" });
      const unprotectedGoal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Unprotected HKD Goal", currencyCode: "HKD", isProtected: false });
      await recordGoalAllocation(userA.client, { goalId: unprotectedGoal.id, bucketId: hkdBucket.id, amount: "3000" });

      const results = await getSafeToDeployByCurrency(userA.client);
      const hkd = results.find((r) => r.currencyCode === "HKD");
      assert(hkd?.protectedGoalCash === "0.000000", `unprotected allocation must not count as protected, got ${hkd?.protectedGoalCash}`);
    });

    // --- 23: NGN -- floor exceeds protected commitments -----------------------------
    const ngnBucket = await runner.runValue("Setup: User A funds an NGN bucket", async () => {
      const bucket = await createBucket(userA.client, { name: "NGN Main", currencyCode: "NGN", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary" });
      return bucket;
    });
    if (!ngnBucket) throw new Error("ngnBucket setup failed");

    await runner.run("Setup: NGN protected goal (4000) + protected obligation (uncovered 1000)", async () => {
      const goal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Protected NGN Goal", currencyCode: "NGN", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: ngnBucket.id, amount: "4000" });
      await createObligation(userA.client, { name: "NGN Uncovered Fee", currencyCode: "NGN", amount: "1000", isProtected: true });
      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "NGN", thresholdValue: "7000" });
    });

    await runner.run(
      "Safe to Deploy calculates correctly when floor exceeds protected commitments (worked example: floor 7000 -> required 7000, safe 3000)",
      async () => {
        const results = await getSafeToDeployByCurrency(userA.client);
        const ngn = results.find((r) => r.currencyCode === "NGN");
        assert(ngn?.protectedCommitments === "5000.000000", `expected protected commitments 5000, got ${ngn?.protectedCommitments}`);
        assert(ngn?.requiredRetainedCash === "7000.000000", `expected required retained 7000, got ${ngn?.requiredRetainedCash}`);
        assert(ngn?.safeToDeploy === "3000.000000", `expected safe to deploy 3000, got ${ngn?.safeToDeploy}`);
      },
    );

    // --- 26: allocation shortfall reduces backed protected cash (SGD) -------------
    const sgdBucket = await runner.runValue("Setup: User A funds an SGD bucket (7000)", async () => {
      const bucket = await createBucket(userA.client, { name: "SGD Wallet", currencyCode: "SGD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "7000", categoryCode: "salary" });
      return bucket;
    });
    if (!sgdBucket) throw new Error("sgdBucket setup failed");

    await runner.run(
      "Allocation shortfall reduces backed protected cash appropriately (underfunded bucket: two protected goals, 4000+3000 > 5000 balance)",
      async () => {
        const goalSgdA = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "SGD Goal A", currencyCode: "SGD", isProtected: true });
        const goalSgdB = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "SGD Goal B", currencyCode: "SGD", isProtected: true });
        await recordGoalAllocation(userA.client, { goalId: goalSgdA.id, bucketId: sgdBucket.id, amount: "4000" });
        await recordGoalAllocation(userA.client, { goalId: goalSgdB.id, bucketId: sgdBucket.id, amount: "3000" });

        // Real spending after the fact creates the shortfall -- allocations
        // were valid when made (4000+3000=7000 <= balance 7000).
        await recordMoneySpent(userA.client, { bucketId: sgdBucket.id, amount: "2000", categoryCode: "housing" });

        const results = await getSafeToDeployByCurrency(userA.client);
        const sgd = results.find((r) => r.currencyCode === "SGD");
        // Nominal protected allocation is 7000; actual backed is capped at
        // the real 5000 balance -- never the imaginary 7000.
        assert(sgd?.protectedGoalCash === "5000.000000", `expected backed protected cash capped at 5000, got ${sgd?.protectedGoalCash}`);
      },
    );

    // --- 27-29: goal-linked obligation coverage (CHF) -------------------------------
    const chfBucket = await runner.runValue("Setup: User A funds a CHF bucket (10000)", async () => {
      const bucket = await createBucket(userA.client, { name: "CHF Wallet", currencyCode: "CHF", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary" });
      return bucket;
    });
    if (!chfBucket) throw new Error("chfBucket setup failed");

    const goalTuition = await runner.runValue("Setup: User A creates a protected Tuition goal, allocates 8000 CHF", async () => {
      const goal = await createGoal(userA.client, { goalTypeCode: "education", measurementType: "cash_target", name: "Tuition Goal", currencyCode: "CHF", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: chfBucket.id, amount: "8000" });
      return goal;
    });
    if (!goalTuition) throw new Error("goalTuition setup failed");

    await runner.run(
      "Goal-linked obligation already covered by same goal is not double-counted",
      async () => {
        await createObligation(userA.client, { name: "Tuition Obligation", currencyCode: "CHF", amount: "6000", isProtected: true, fundingGoalId: goalTuition.id });
        const results = await getSafeToDeployByCurrency(userA.client);
        const chf = results.find((r) => r.currencyCode === "CHF");
        assert(chf?.uncoveredProtectedObligations === "0.000000", `expected fully covered (0 uncovered), got ${chf?.uncoveredProtectedObligations}`);
        // protected_goal_cash (8000) already represents this purpose --
        // the obligation must not add another 6000 on top.
        assert(chf?.protectedCommitments === "8000.000000", `expected protected commitments still 8000 (no double count), got ${chf?.protectedCommitments}`);
      },
    );

    await runner.run(
      "Only the uncovered portion of a partially funded linked obligation adds retained requirement (multiple obligations sharing one goal aggregate correctly)",
      async () => {
        await createObligation(userA.client, { name: "Second Tuition Obligation", currencyCode: "CHF", amount: "5000", isProtected: true, fundingGoalId: goalTuition.id });
        // Combined linked obligations: 6000 + 5000 = 11000, backed by goal: 8000.
        const results = await getSafeToDeployByCurrency(userA.client);
        const chf = results.find((r) => r.currencyCode === "CHF");
        assert(chf?.uncoveredProtectedObligations === "3000.000000", `expected uncovered 11000-8000=3000, got ${chf?.uncoveredProtectedObligations}`);
        assert(chf?.protectedCommitments === "11000.000000", `expected protected commitments 8000+3000=11000, got ${chf?.protectedCommitments}`);
      },
    );

    // --- 33: multiple buckets in same currency aggregate correctly (DKK) ----------
    await runner.run("Multiple buckets in same currency aggregate correctly", async () => {
      const dkkBucket1 = await createBucket(userA.client, { name: "DKK Bucket 1", currencyCode: "DKK", bucketType: "bank_account" });
      const dkkBucket2 = await createBucket(userA.client, { name: "DKK Bucket 2", currencyCode: "DKK", bucketType: "savings_account" });
      await recordMoneyReceived(userA.client, { bucketId: dkkBucket1.id, amount: "3000", categoryCode: "salary" });
      await recordMoneyReceived(userA.client, { bucketId: dkkBucket2.id, amount: "2000", categoryCode: "salary" });

      const results = await getSafeToDeployByCurrency(userA.client);
      const dkk = results.find((r) => r.currencyCode === "DKK");
      assert(dkk?.liquidCash === "5000.000000", `expected combined liquid cash 5000, got ${dkk?.liquidCash}`);
    });

    // --- 34, 52: currencies remain completely separate; mixed configured/unconfigured --
    await runner.run(
      "Multiple currencies remain completely separate; one calculated while another is not_configured",
      async () => {
        const results = await getSafeToDeployByCurrency(userA.client);
        const usd = results.find((r) => r.currencyCode === "USD");
        const ngn = results.find((r) => r.currencyCode === "NGN");
        const chf = results.find((r) => r.currencyCode === "CHF");
        assert(usd?.status === "calculated" && usd.safeToDeploy === "5000.000000", "USD figures must not drift from its own scenario");
        assert(ngn?.status === "calculated" && ngn.safeToDeploy === "3000.000000", "NGN figures must not drift from its own scenario");
        assert(chf?.status === "not_configured", `CHF has no floor configured, expected not_configured, got ${chf?.status}`);
      },
    );

    // --- 51: separate floor configurations per currency ----------------------------
    await runner.run("User can have separate floor configurations across currencies", async () => {
      const summaries = await getFinancialRuleSummaries(userA.client);
      const usdRule = summaries.find((s) => s.currencyCode === "USD");
      const ngnRule = summaries.find((s) => s.currencyCode === "NGN");
      assert(usdRule?.currentThreshold === "3000.000000", `expected USD floor 3000, got ${usdRule?.currentThreshold}`);
      assert(ngnRule?.currentThreshold === "7000.000000", `expected NGN floor 7000, got ${ngnRule?.currentThreshold}`);
    });

    // --- 35-36: reporting-currency aggregate ----------------------------------------
    await runner.run("Missing FX rate prevents reporting-currency aggregate", async () => {
      const results = await getSafeToDeployByCurrency(userA.client);
      const usd = results.find((r) => r.currencyCode === "USD")!;
      const chf = results.find((r) => r.currencyCode === "CHF")!; // not_configured
      const conversion = aggregateSafeToDeployToReportingCurrency([usd, chf], "USD", new Map());
      assert(conversion.status === "not_calculated", "an unconfigured currency in the set must prevent the aggregate");

      const ngn = results.find((r) => r.currencyCode === "NGN")!;
      const conversion2 = aggregateSafeToDeployToReportingCurrency([usd, ngn], "USD", new Map());
      assert(conversion2.status === "not_calculated", "a missing FX rate must prevent the aggregate even when both currencies are calculated");
    });

    await runner.run("Available FX rates produce exact reporting aggregate", async () => {
      const results = await getSafeToDeployByCurrency(userA.client);
      const usd = results.find((r) => r.currencyCode === "USD")!; // safe_to_deploy 5000
      const jpy = results.find((r) => r.currencyCode === "JPY")!; // safe_to_deploy 80000
      const rates = new Map([["JPY", "0.01"]]); // 1 JPY = 0.01 USD
      const conversion = aggregateSafeToDeployToReportingCurrency([usd, jpy], "USD", rates);
      assert(conversion.status === "converted", `expected converted, got ${conversion.status}`);
      if (conversion.status === "converted") {
        // 5000 (USD) + 80000 * 0.01 (JPY->USD) = 5000 + 800 = 5800
        assert(conversion.amount === "5800", `expected 5800, got ${conversion.amount}`);
      }
    });

    // --- 37-42: proposed cash-use evaluator (SEK) -----------------------------------
    const sekBucket = await runner.runValue("Setup: User A funds an SEK bucket (10000), floor 3000", async () => {
      const bucket = await createBucket(userA.client, { name: "SEK Wallet", currencyCode: "SEK", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary" });
      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "SEK", thresholdValue: "3000" });
      return bucket;
    });
    if (!sekBucket) throw new Error("sekBucket setup failed");

    await runner.run("Evaluator shows correct before/after balance", async () => {
      const evaluation = await evaluateProposedCashUse(userA.client, sekBucket.id, "2000");
      assert(evaluation.currentBalance === "10000.000000", `expected current balance 10000, got ${evaluation.currentBalance}`);
      assert(evaluation.postUseBalance === "8000.000000", `expected post-use balance 8000, got ${evaluation.postUseBalance}`);
      assert(evaluation.currencySafeToDeployBefore === "7000.000000", `expected before 7000, got ${evaluation.currencySafeToDeployBefore}`);
      assert(evaluation.currencySafeToDeployAfter === "5000.000000", `expected after 5000, got ${evaluation.currencySafeToDeployAfter}`);
      assert(evaluation.minimumCashFloorStatus === "attention", `expected attention, got ${evaluation.minimumCashFloorStatus}`);
    });

    await runner.run("Evaluator detects minimum-cash-floor conflict", async () => {
      const evaluation = await evaluateProposedCashUse(userA.client, sekBucket.id, "8000");
      assert(evaluation.minimumCashFloorStatus === "conflict", `expected conflict, got ${evaluation.minimumCashFloorStatus}`);
    });

    const goalSek = await runner.runValue("Setup: User A creates a protected SEK goal (4000) with a linked protected obligation", async () => {
      const goal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "SEK Goal", currencyCode: "SEK", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: sekBucket.id, amount: "4000" });
      await createObligation(userA.client, { name: "SEK Obligation", currencyCode: "SEK", amount: "2000", isProtected: true, fundingGoalId: goal.id });
      return goal;
    });
    if (!goalSek) throw new Error("goalSek setup failed");

    await runner.run(
      "Evaluator shows new protected allocation shortfall and detects protected-goal / protected-obligation conflicts",
      async () => {
        const evaluation = await evaluateProposedCashUse(userA.client, sekBucket.id, "6500");
        assert(evaluation.currentAllocationShortfall === "0.000000", `expected no current shortfall, got ${evaluation.currentAllocationShortfall}`);
        assert(evaluation.postUseAllocationShortfall === "500.000000", `expected post-use shortfall 500, got ${evaluation.postUseAllocationShortfall}`);
        assert(evaluation.protectedGoalStatus === "conflict", `expected protected goal conflict, got ${evaluation.protectedGoalStatus}`);
        assert(evaluation.protectedObligationStatus === "attention", `expected protected obligation attention, got ${evaluation.protectedObligationStatus}`);
      },
    );

    await runner.run("Evaluator never returns recommendation/approval semantics", async () => {
      const evaluation = await evaluateProposedCashUse(userA.client, sekBucket.id, "1000");
      const forbidden = ["approved", "rejected", "good", "bad", "recommended", "yes", "no"];
      const labels = [evaluation.minimumCashFloorStatus, evaluation.protectedGoalStatus, evaluation.protectedObligationStatus];
      for (const label of labels) {
        assert(!forbidden.includes(label.toLowerCase()), `evaluator returned a forbidden advisory label: ${label}`);
      }
    });

    // --- 43-44: evaluator security ----------------------------------------------------
    const bucketB = await runner.runValue("Setup: User B creates own bucket", () =>
      createBucket(userB.client, { name: "B's Bucket", currencyCode: "GBP", bucketType: "bank_account" }),
    );
    if (!bucketB) throw new Error("bucketB setup failed");

    await runner.run("A cannot evaluate B's bucket by UUID", async () => {
      let threw = false;
      try {
        await evaluateProposedCashUse(userA.client, bucketB.id, "100");
      } catch {
        threw = true;
      }
      assert(threw, "evaluating another user's bucket should be rejected");
    });

    await runner.run("Anonymous cannot invoke evaluator successfully", async () => {
      const result = await anonClient.rpc("evaluate_proposed_cash_use", { p_bucket_id: sekBucket.id, p_amount: 100 });
      expectDenied(result, "anonymous call to evaluate_proposed_cash_use");
    });

    // --- 45-50: override audit ---------------------------------------------------------
    const override = await runner.runValue("User records explicit override after conflict", async () => {
      return recordCashUseOverride(userA.client, { bucketId: sekBucket.id, amount: "8000", note: "Proceeding anyway for an emergency" });
    });
    if (!override) throw new Error("override setup failed");

    await runner.run("Override snapshot captured the conflict at time of override", async () => {
      const snapshot = override.conflicts_snapshot as Record<string, unknown>;
      assert(snapshot.minimum_cash_floor_status === "conflict", `expected conflict in snapshot, got ${snapshot.minimum_cash_floor_status}`);
      assert(override.safe_to_deploy_before !== null, "expected a safe-to-deploy-before snapshot value");
    });

    await runner.run("Override creates no Money movement", async () => {
      const before = await getBucketBalances(userA.client);
      await recordCashUseOverride(userA.client, { bucketId: sekBucket.id, amount: "500" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "bucket balances changed after recording an override");
    });

    await runner.run("Override creates no Goal mutation", async () => {
      const { data: before } = await userA.client.from("goal_allocation_events").select("id").eq("goal_id", goalSek.id);
      await recordCashUseOverride(userA.client, { bucketId: sekBucket.id, amount: "500" });
      const { data: after } = await userA.client.from("goal_allocation_events").select("id").eq("goal_id", goalSek.id);
      assert((before?.length ?? 0) === (after?.length ?? 0), "override must never create a goal allocation event");
    });

    await runner.run("Override creates no Obligation mutation", async () => {
      const summariesBefore = await getObligationSummaries(userA.client);
      await recordCashUseOverride(userA.client, { bucketId: sekBucket.id, amount: "500" });
      const summariesAfter = await getObligationSummaries(userA.client);
      assert(JSON.stringify(summariesBefore) === JSON.stringify(summariesAfter), "override must never mutate an obligation");
    });

    await runner.run("Override snapshot remains immutable", async () => {
      const result = await userA.client
        .from("cash_use_overrides")
        .update({ note: "tampered" })
        .eq("id", override.id)
        .select("*");
      expectDenied(result, "updating an override audit row should be rejected (no UPDATE grant exists)");
    });

    await runner.run("A cannot record override against B bucket", async () => {
      let threw = false;
      try {
        await recordCashUseOverride(userA.client, { bucketId: bucketB.id, amount: "100" });
      } catch {
        threw = true;
      }
      assert(threw, "recording an override against user B's bucket should be rejected");
    });

    // --- 55: upcoming-obligation date-range query -----------------------------------
    await runner.run("Upcoming-obligation date-range query works", async () => {
      const soon = await createObligation(userA.client, { name: "Due Soon", currencyCode: "USD", amount: "10", dueDate: daysFromNow(5) });
      const later = await createObligation(userA.client, { name: "Due Later", currencyCode: "USD", amount: "10", dueDate: daysFromNow(40) });

      const defaultHorizon = await getUpcomingObligations(userA.client);
      assert(defaultHorizon.some((o) => o.obligationId === soon.id), "expected the +5-day obligation within the default 30-day horizon");
      assert(!defaultHorizon.some((o) => o.obligationId === later.id), "the +40-day obligation should be outside the default 30-day horizon");

      const explicitRange = await getUpcomingObligations(userA.client, daysFromNow(0), daysFromNow(45));
      assert(explicitRange.some((o) => o.obligationId === later.id), "expected the +40-day obligation within an explicit 45-day range");
    });

    // --- 56: paid/cancelled obligations excluded from active protected commitments --
    await runner.run("Paid/cancelled obligations are excluded from active protected commitments", async () => {
      const results1 = await getSafeToDeployByCurrency(userA.client);
      const chfBefore = results1.find((r) => r.currencyCode === "CHF");

      const { data: chfObligations } = await userA.client.from("obligations").select("id").eq("currency_code", "CHF").eq("is_protected", true);
      const targetId = chfObligations?.[0]?.id;
      assert(targetId !== undefined, "expected at least one protected CHF obligation to mark paid");
      await updateObligation(userA.client, targetId!, { status: "paid" });

      const results2 = await getSafeToDeployByCurrency(userA.client);
      const chfAfter = results2.find((r) => r.currencyCode === "CHF");
      assert(
        Number(chfAfter?.uncoveredProtectedObligations ?? 0) < Number(chfBefore?.uncoveredProtectedObligations ?? 0) ||
          (Number(chfBefore?.uncoveredProtectedObligations ?? 0) === 0 && Number(chfAfter?.uncoveredProtectedObligations ?? 0) === 0),
        "marking a protected obligation paid should reduce (or leave at zero) its contribution to uncovered protected obligations",
      );
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
  console.error("Rules/Obligations suite crashed:", err);
  process.exitCode = 1;
});
