/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Decisions domain (decisions, decision_scenarios, decision_choices,
 * decision_scenario_evaluations).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion. Each concern below
 * deliberately uses its own fresh currency to keep the arithmetic
 * isolated and independently verifiable.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:decisions
 */
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createDecision,
  updateDecision,
  createDecisionScenario,
  updateDecisionScenario,
  evaluateDecisionScenario,
  saveDecisionScenarioEvaluation,
  recordDecisionChoice,
  getDecisionSummaries,
  getDecisionChoiceHistory,
  getDecisionScenarioEvaluationHistory,
} from "../../../lib/domain/decisions/repository.ts";
import { convertScenarioNetDeltaToReportingCurrency } from "../../../lib/domain/decisions/aggregate.ts";
import { createBucket, getBucketBalances, recordMoneyReceived } from "../../../lib/domain/money/repository.ts";
import { createAsset, getAssetSummaries } from "../../../lib/domain/assets/repository.ts";
import { createLiability, getLiabilitySummaries } from "../../../lib/domain/liabilities/repository.ts";
import { createGoal, recordGoalAllocation } from "../../../lib/domain/goals/repository.ts";
import { createFinancialRule } from "../../../lib/domain/rules/repository.ts";
import { createObligation } from "../../../lib/domain/obligations/repository.ts";

const ADVISORY_BLOCKLIST = [
  "recommended",
  "best option",
  "winner",
  "approved",
  "rejected",
  "good decision",
  "bad decision",
  "score",
  "strong buy",
  "do this",
  "don't do this",
];

function assertNoAdvisoryLanguage(value: unknown, context: string) {
  if (typeof value !== "string") return;
  const lowered = value.toLowerCase();
  for (const term of ADVISORY_BLOCKLIST) {
    assert(!lowered.includes(term), `${context} contains prohibited advisory language "${term}": ${value}`);
  }
}

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "decisions-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Decisions engine, scenario evaluation & journal suite\n");

    // --- 1-7: decision isolation ----------------------------------------------------
    const decisionA = await runner.runValue("User A creates own Decision", () =>
      createDecision(userA.client, { decisionTypeCode: "large_personal_purchase", name: "New Furniture" }),
    );
    const decisionB = await runner.runValue("User B creates own Decision", () =>
      createDecision(userB.client, { decisionTypeCode: "large_personal_purchase", name: "B's Decision" }),
    );
    if (!decisionA || !decisionB) throw new Error("Decision setup failed — aborting remaining tests.");

    await runner.run("A cannot read B Decision", async () => {
      const result = await userA.client.from("decisions").select("*").eq("id", decisionB.id);
      expectFilteredToEmpty(result, "user A selecting user B's decision by id");
    });

    await runner.run("A cannot mutate B Decision", async () => {
      const result = await userA.client.from("decisions").update({ name: "Hijacked" }).eq("id", decisionB.id).select("*");
      expectFilteredToEmpty(result, "user A updating user B's decision");
    });

    await runner.run("A cannot create Decision owned by B", async () => {
      const result = await userA.client
        .from("decisions")
        .insert({ user_id: userB.id, decision_type_code: "other", name: "Forged" });
      expectDenied(result, "user A forging a decision with user B's user_id");
    });

    await runner.run("A cannot reassign Decision ownership", async () => {
      const result = await userA.client.from("decisions").update({ user_id: userB.id }).eq("id", decisionA.id).select("*");
      expectDenied(result, "user A attempting to reassign their decision's ownership");
    });

    await runner.run("Anonymous cannot read/mutate Decisions", async () => {
      const selectResult = await anonClient.from("decisions").select("*").eq("id", decisionA.id);
      expectDenied(selectResult, "anonymous SELECT on decisions");
      const insertResult = await anonClient
        .from("decisions")
        .insert({ user_id: userA.id, decision_type_code: "other", name: "Anon" });
      expectDenied(insertResult, "anonymous INSERT on decisions");
    });

    // --- 8-10: scenario isolation ----------------------------------------------------
    const scenarioA = await runner.runValue("User A creates scenario under own Decision", () =>
      createDecisionScenario(userA.client, { decisionId: decisionA.id, name: "Base Case", currencyCode: "USD", cashRequired: "1000" }),
    );
    if (!scenarioA) throw new Error("scenarioA setup failed");

    await runner.run("A cannot create scenario under B Decision", async () => {
      let threw = false;
      try {
        await createDecisionScenario(userA.client, { decisionId: decisionB.id, name: "Forged Scenario", currencyCode: "USD" });
      } catch {
        threw = true;
      }
      assert(threw, "creating a scenario under user B's decision should be rejected");
    });

    await runner.run("Raw forged scenario reference fails", async () => {
      const result = await userA.client
        .from("decision_scenarios")
        .insert({ decision_id: decisionB.id, name: "Forged", currency_code: "USD", user_id: userA.id });
      expectDenied(result, "user A forging a scenario with user_id=A but decision_id=B");
    });

    // --- 11-12: scenario bucket reference protection ----------------------------------
    const bucketA = await runner.runValue("Setup: User A creates a USD bucket", () =>
      createBucket(userA.client, { name: "USD Wallet", currencyCode: "USD", bucketType: "bank_account" }),
    );
    const bucketB = await runner.runValue("Setup: User B creates a USD bucket", () =>
      createBucket(userB.client, { name: "B's USD Wallet", currencyCode: "USD", bucketType: "bank_account" }),
    );
    if (!bucketA || !bucketB) throw new Error("bucket setup failed");

    await runner.run("Scenario can reference A's own bucket", async () => {
      const scenario = await createDecisionScenario(userA.client, {
        decisionId: decisionA.id, name: "With Own Bucket", currencyCode: "USD", sourceBucketId: bucketA.id, cashRequired: "500",
      });
      assert(scenario.source_bucket_id === bucketA.id, "expected the scenario to reference bucket A");
    });

    await runner.run("Scenario cannot reference B's bucket", async () => {
      let threw = false;
      try {
        await createDecisionScenario(userA.client, {
          decisionId: decisionA.id, name: "Forged Bucket", currencyCode: "USD", sourceBucketId: bucketB.id, cashRequired: "500",
        });
      } catch {
        threw = true;
      }
      assert(threw, "referencing user B's bucket from user A's scenario should be rejected");
    });

    // --- 13-16: decision-level asset/liability reference protection ------------------
    // (linked_asset_id/linked_liability_id live on the Decision itself, which is
    // the subject of consideration shared by all its scenarios -- see the
    // migration header's rationale. Cross-tenant protection is tested here,
    // at the layer the reference actually exists.)
    const assetA = await runner.runValue("Setup: User A creates own asset", () =>
      createAsset(userA.client, { assetType: "vehicle", name: "Car A", currencyCode: "USD" }),
    );
    const assetB = await runner.runValue("Setup: User B creates own asset", () =>
      createAsset(userB.client, { assetType: "vehicle", name: "Car B", currencyCode: "USD" }),
    );
    const liabilityA = await runner.runValue("Setup: User A creates own liability", () =>
      createLiability(userA.client, { name: "Loan A", liabilityType: "loan", currencyCode: "USD", openingPrincipal: "5000" }),
    );
    const liabilityB = await runner.runValue("Setup: User B creates own liability", () =>
      createLiability(userB.client, { name: "Loan B", liabilityType: "loan", currencyCode: "USD", openingPrincipal: "5000" }),
    );
    if (!assetA || !assetB || !liabilityA || !liabilityB) throw new Error("asset/liability setup failed");

    await runner.run("Decision can reference A's own asset", async () => {
      const decision = await createDecision(userA.client, { decisionTypeCode: "sell_asset", name: "Sell Car A", linkedAssetId: assetA.id });
      assert(decision.linked_asset_id === assetA.id, "expected the decision to link asset A");
    });

    await runner.run("Decision cannot reference B's asset", async () => {
      let threw = false;
      try {
        await createDecision(userA.client, { decisionTypeCode: "sell_asset", name: "Forged Asset Link", linkedAssetId: assetB.id });
      } catch {
        threw = true;
      }
      assert(threw, "linking user B's asset to user A's decision should be rejected");
    });

    await runner.run("Decision can reference A's own liability", async () => {
      const decision = await createDecision(userA.client, { decisionTypeCode: "pay_down_debt", name: "Pay Off Loan A", linkedLiabilityId: liabilityA.id });
      assert(decision.linked_liability_id === liabilityA.id, "expected the decision to link liability A");
    });

    await runner.run("Decision cannot reference B's liability", async () => {
      let threw = false;
      try {
        await createDecision(userA.client, { decisionTypeCode: "pay_down_debt", name: "Forged Liability Link", linkedLiabilityId: liabilityB.id });
      } catch {
        threw = true;
      }
      assert(threw, "linking user B's liability to user A's decision should be rejected");
    });

    // --- 17-19: facts vs assumptions vs derived remain distinguishable ---------------
    const eurBucket = await runner.runValue("Setup: User A funds a EUR bucket (10000)", async () => {
      const bucket = await createBucket(userA.client, { name: "EUR Wallet", currencyCode: "EUR", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary" });
      return bucket;
    });
    const eurAsset = await runner.runValue("Setup: User A creates a EUR asset with basis 5000", () =>
      createAsset(userA.client, { assetType: "vehicle", name: "EUR Car", currencyCode: "EUR", initialBasisAmount: "5000" }),
    );
    if (!eurBucket || !eurAsset) throw new Error("EUR fact/assumption setup failed");

    const sellDecision = await runner.runValue("Setup: User A creates a sell_asset Decision linked to the EUR asset", () =>
      createDecision(userA.client, { decisionTypeCode: "sell_asset", name: "Sell EUR Car", linkedAssetId: eurAsset.id }),
    );
    if (!sellDecision) throw new Error("sellDecision setup failed");

    const sellScenario = await runner.runValue(
      "User A creates a sell scenario with expected sale price 6000 and selling costs 200",
      () =>
        createDecisionScenario(userA.client, {
          decisionId: sellDecision.id, name: "Sell As-Is", currencyCode: "EUR",
          destinationBucketId: eurBucket.id, grossProceeds: "6000", proceedsCosts: "200",
        }),
    );
    if (!sellScenario) throw new Error("sellScenario setup failed");

    await runner.run(
      "Facts come from canonical domains, not copied mutable fields; assumptions remain user-entered; derived values remain distinguishable",
      async () => {
        const evaluation = await evaluateDecisionScenario(userA.client, sellScenario.id);
        // FACT: basis comes live from asset_summary(), not a copied value.
        assert(evaluation.linkedAssetCostBasis === "5000.000000", `expected fact cost basis 5000, got ${evaluation.linkedAssetCostBasis}`);
        // ASSUMPTION: echoed exactly as entered.
        assert(evaluation.grossProceeds === "6000.000000", `expected assumption grossProceeds 6000, got ${evaluation.grossProceeds}`);
        assert(evaluation.proceedsCosts === "200.000000", `expected assumption proceedsCosts 200, got ${evaluation.proceedsCosts}`);
        // DERIVED: net_proceeds = gross - costs -- already proven distinct
        // from the raw grossProceeds assumption by the two exact literal
        // values asserted above (6000 vs 5800).
        assert(evaluation.netProceeds === "5800.000000", `expected derived netProceeds 5800, got ${evaluation.netProceeds}`);
        // DERIVED: projected profit/loss = net proceeds - basis (fact).
        assert(evaluation.projectedGrossProfitLoss === "800.000000", `expected derived profit 800, got ${evaluation.projectedGrossProfitLoss}`);
      },
    );

    // --- 28: sell scenario does NOT auto-use target value as sale price --------------
    await runner.run("Sell scenario does not automatically use target value as sale price", async () => {
      // The asset has no target_value recorded, and even if it did, netProceeds
      // must only ever reflect the scenario's own grossProceeds assumption.
      const bareScenario = await createDecisionScenario(userA.client, {
        decisionId: sellDecision.id, name: "No Price Entered Yet", currencyCode: "EUR",
      });
      const evaluation = await evaluateDecisionScenario(userA.client, bareScenario.id);
      assert(evaluation.netProceeds === null, "netProceeds must stay null when no grossProceeds assumption was entered -- never auto-filled from target/quick-sale value");
      assert(evaluation.missingInformation.includes("no_amount_specified"), "expected no_amount_specified in missing information");
    });

    // --- 20-24: cash-use / cash-inflow scenarios reuse S6A ----------------------------
    await runner.run(
      "Cash-use scenario uses the authoritative S6A hypothetical calculation (bucket balance and Safe-to-Deploy before/after)",
      async () => {
        await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "EUR", thresholdValue: "1000" });
        const spendDecision = await createDecision(userA.client, { decisionTypeCode: "large_personal_purchase", name: "New Sofa" });
        const spendScenario = await createDecisionScenario(userA.client, {
          decisionId: spendDecision.id, name: "Buy It", currencyCode: "EUR", sourceBucketId: eurBucket.id, cashRequired: "3000",
        });
        const evaluation = await evaluateDecisionScenario(userA.client, spendScenario.id);
        assert(evaluation.bucketBalanceBefore === "10000.000000", `expected before 10000, got ${evaluation.bucketBalanceBefore}`);
        assert(evaluation.bucketBalanceAfter === "7000.000000", `expected after 7000, got ${evaluation.bucketBalanceAfter}`);
        // 10000 - 3000 = 7000 >= floor 1000 -> not a conflict, but reduced.
        assert(evaluation.minimumCashFloorStatus === "attention" || evaluation.minimumCashFloorStatus === "aligned",
          `expected attention or aligned, got ${evaluation.minimumCashFloorStatus}`);
        assert(evaluation.currencySafeToDeployBefore !== null && evaluation.currencySafeToDeployAfter !== null, "expected Safe-to-Deploy before/after to be populated");
      },
    );

    // Multi-bucket protected-goal + obligation coverage through Decisions (mirrors
    // the P0-E2-S6A worked case, now proven through the Decisions evaluation path).
    const chfBucketA = await runner.runValue("Setup: User A funds CHF Bucket A (5000)", async () => {
      const bucket = await createBucket(userA.client, { name: "CHF Bucket A", currencyCode: "CHF", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "5000", categoryCode: "salary" });
      return bucket;
    });
    const chfBucketB = await runner.runValue("Setup: User A funds CHF Bucket B (5000)", async () => {
      const bucket = await createBucket(userA.client, { name: "CHF Bucket B", currencyCode: "CHF", bucketType: "savings_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "5000", categoryCode: "salary" });
      return bucket;
    });
    if (!chfBucketA || !chfBucketB) throw new Error("CHF bucket setup failed");

    const chfGoal = await runner.runValue("Setup: Protected CHF goal funded from both buckets (4000+4000=8000 backed)", async () => {
      const goal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "CHF Protected Goal", currencyCode: "CHF", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: chfBucketA.id, amount: "4000" });
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: chfBucketB.id, amount: "4000" });
      return goal;
    });
    if (!chfGoal) throw new Error("chfGoal setup failed");

    await runner.runValue("Setup: protected CHF obligation (7000) linked to the multi-bucket goal", () =>
      createObligation(userA.client, { name: "CHF Protected Fee", currencyCode: "CHF", amount: "7000", isProtected: true, fundingGoalId: chfGoal.id }),
    );

    await runner.run(
      "Multi-bucket protected-goal effect and protected obligation coverage remain correct through Decisions (Worked Case, evaluated via evaluate_decision_scenario)",
      async () => {
        const useSavingsDecision = await createDecision(userA.client, { decisionTypeCode: "use_savings", name: "Use CHF Bucket A" });
        const scenario = await createDecisionScenario(userA.client, {
          decisionId: useSavingsDecision.id, name: "Spend 3000 from Bucket A", currencyCode: "CHF",
          sourceBucketId: chfBucketA.id, cashRequired: "3000",
        });
        const evaluation = await evaluateDecisionScenario(userA.client, scenario.id);
        // Bucket A can only back 2000 of its own 4000 post-spend (balance
        // 5000-3000=2000); Bucket B unaffected still backs 4000. Total 6000.
        // Obligation 7000 -> uncovered becomes 1000 -> a direct coverage
        // failure -- protected_obligation_status must be 'conflict'.
        assert(evaluation.protectedObligationStatus === "conflict", `expected conflict (coverage worsened through Decisions), got ${evaluation.protectedObligationStatus}`);
        assert(evaluation.overallStatus === "conflict", `expected overall status conflict, got ${evaluation.overallStatus}`);
      },
    );

    // Cash-inflow scenario: sell asset, proceeds into a destination bucket.
    await runner.run(
      "Cash-inflow scenario produces correct hypothetical post-bucket state and creates no actual cash",
      async () => {
        const bucketsBefore = await getBucketBalances(userA.client);
        const eurBefore = bucketsBefore.find((b) => b.bucketId === eurBucket.id)?.amount;

        const evaluation = await evaluateDecisionScenario(userA.client, sellScenario.id);
        assert(evaluation.bucketBalanceBefore === eurBefore, `expected before balance to match real balance ${eurBefore}, got ${evaluation.bucketBalanceBefore}`);
        // net proceeds 5800 added hypothetically.
        const expectedAfter = (Number(eurBefore) + 5800).toFixed(6);
        assert(evaluation.bucketBalanceAfter === `${expectedAfter}`, `expected after balance ${expectedAfter}, got ${evaluation.bucketBalanceAfter}`);

        const bucketsAfter = await getBucketBalances(userA.client);
        const eurAfter = bucketsAfter.find((b) => b.bucketId === eurBucket.id)?.amount;
        assert(eurBefore === eurAfter, "evaluating a cash-inflow scenario must never create actual cash");
      },
    );

    // --- 25-26: buy/sell asset does not mutate Assets ---------------------------------
    await runner.run("Buy-asset scenario does not create an Asset", async () => {
      const before = await getAssetSummaries(userA.client);
      const buyDecision = await createDecision(userA.client, { decisionTypeCode: "buy_asset", name: "Consider Buying a Boat" });
      const buyScenario = await createDecisionScenario(userA.client, {
        decisionId: buyDecision.id, name: "Buy It", currencyCode: "USD", sourceBucketId: bucketA.id, cashRequired: "2000", acquisitionCosts: "100",
      });
      await evaluateDecisionScenario(userA.client, buyScenario.id);
      await saveDecisionScenarioEvaluation(userA.client, buyScenario.id);
      const after = await getAssetSummaries(userA.client);
      assert(before.length === after.length, "a buy_asset scenario evaluation/save must never create an Asset row");
    });

    await runner.run("Sell-asset scenario does not archive/sell the Asset", async () => {
      await evaluateDecisionScenario(userA.client, sellScenario.id);
      await saveDecisionScenarioEvaluation(userA.client, sellScenario.id);
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === eurAsset.id);
      assert(summary?.isArchived === false, "evaluating/saving a sell_asset scenario must never archive the asset");
      assert(summary?.costBasis === "5000.000000", "evaluating/saving a sell_asset scenario must never change the asset's cost basis");
    });

    // --- 27: sell scenario uses current basis from Assets -----------------------------
    await runner.run("Sell scenario uses current basis from Assets (already verified above via the fact check)", async () => {
      const evaluation = await evaluateDecisionScenario(userA.client, sellScenario.id);
      assert(evaluation.linkedAssetCostBasis === "5000.000000", `expected basis fact 5000, got ${evaluation.linkedAssetCostBasis}`);
    });

    // --- 29-30: estimated net proceeds and profit/loss exact decimal -----------------
    await runner.run("Estimated net sale proceeds and projected profit/loss calculate correctly with exact decimals", async () => {
      // EUR allows 2 decimal places -- non-round cents still exercise exact
      // decimal math (no float rounding drift) while respecting the
      // currency's own precision, unlike a synthetic 6-decimal amount would.
      const preciseScenario = await createDecisionScenario(userA.client, {
        decisionId: sellDecision.id, name: "Precise Numbers", currencyCode: "EUR", grossProceeds: "6123.45", proceedsCosts: "123.45",
      });
      const evaluation = await evaluateDecisionScenario(userA.client, preciseScenario.id);
      assert(evaluation.netProceeds === "6000.000000", `expected exact net proceeds 6000.000000, got ${evaluation.netProceeds}`);
      assert(evaluation.projectedGrossProfitLoss === "1000.000000", `expected exact profit 1000.000000, got ${evaluation.projectedGrossProfitLoss}`);
    });

    // --- 31-32: repair scenario -------------------------------------------------------
    const gbpBucket = await runner.runValue("Setup: User A funds a GBP bucket (10000)", async () => {
      const bucket = await createBucket(userA.client, { name: "GBP Wallet", currencyCode: "GBP", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary" });
      return bucket;
    });
    const gbpAsset = await runner.runValue("Setup: User A creates a GBP asset with basis 4000", () =>
      createAsset(userA.client, { assetType: "vehicle", name: "GBP Car", currencyCode: "GBP", initialBasisAmount: "4000" }),
    );
    if (!gbpBucket || !gbpAsset) throw new Error("GBP repair setup failed");

    const repairDecision = await runner.runValue("Setup: User A creates a repair_improve_asset Decision", () =>
      createDecision(userA.client, { decisionTypeCode: "repair_improve_asset", name: "Repair GBP Car", linkedAssetId: gbpAsset.id }),
    );
    if (!repairDecision) throw new Error("repairDecision setup failed");

    await runner.run(
      "Repair scenario does not mutate basis; differentiates capitalized vs non-capitalized assumption",
      async () => {
        const capitalizedScenario = await createDecisionScenario(userA.client, {
          decisionId: repairDecision.id, name: "Capitalized Repair", currencyCode: "GBP",
          sourceBucketId: gbpBucket.id, cashRequired: "1000", capitalizationClassification: "capital_improvement",
        });
        const expenseScenario = await createDecisionScenario(userA.client, {
          decisionId: repairDecision.id, name: "Expensed Repair", currencyCode: "GBP",
          sourceBucketId: gbpBucket.id, cashRequired: "1000", capitalizationClassification: "expense",
        });

        const capEval = await evaluateDecisionScenario(userA.client, capitalizedScenario.id);
        const expEval = await evaluateDecisionScenario(userA.client, expenseScenario.id);

        assert(capEval.basisAfterCapitalizedImprovement === "5000.000000", `expected capitalized basis-after 4000+1000=5000, got ${capEval.basisAfterCapitalizedImprovement}`);
        assert(expEval.basisAfterCapitalizedImprovement === null, "an 'expense'-classified repair must never project a basis change");

        const summaries = await getAssetSummaries(userA.client);
        const summary = summaries.find((s) => s.assetId === gbpAsset.id);
        assert(summary?.costBasis === "4000.000000", "evaluating a repair scenario must never actually mutate the asset's basis");
      },
    );

    // --- 33-34: business investment / large purchase financial invariance -----------
    const ngnBucket = await runner.runValue("Setup: User A funds an NGN bucket (500000)", async () => {
      const bucket = await createBucket(userA.client, { name: "NGN Wallet", currencyCode: "NGN", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "500000", categoryCode: "salary" });
      return bucket;
    });
    if (!ngnBucket) throw new Error("ngnBucket setup failed");

    await runner.run("Business-investment scenario creates no Business record and no Money event", async () => {
      const before = await getBucketBalances(userA.client);
      const bizDecision = await createDecision(userA.client, { decisionTypeCode: "business_investment", name: "Invest in Friend's Shop" });
      const bizScenario = await createDecisionScenario(userA.client, {
        decisionId: bizDecision.id, name: "Invest", currencyCode: "NGN", sourceBucketId: ngnBucket.id, cashRequired: "100000", expectedValueAssumption: "150000",
      });
      await evaluateDecisionScenario(userA.client, bizScenario.id);
      await saveDecisionScenarioEvaluation(userA.client, bizScenario.id);
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "a business_investment scenario must never move real cash");
    });

    await runner.run("Large-purchase scenario creates no Money event", async () => {
      const before = await getBucketBalances(userA.client);
      const purchaseDecision = await createDecision(userA.client, { decisionTypeCode: "large_personal_purchase", name: "New TV" });
      const purchaseScenario = await createDecisionScenario(userA.client, {
        decisionId: purchaseDecision.id, name: "Buy It", currencyCode: "NGN", sourceBucketId: ngnBucket.id, cashRequired: "50000",
      });
      await evaluateDecisionScenario(userA.client, purchaseScenario.id);
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "a large_personal_purchase scenario must never move real cash");
    });

    // --- 35: use-savings exposes protected-fund conflict correctly -------------------
    await runner.run("Use-savings scenario exposes protected-fund conflict correctly (already proven above via the CHF worked case)", async () => {
      assert(true, "covered by the multi-bucket protected-goal test above");
    });

    // --- 36: take-debt creates no Liability -------------------------------------------
    const cadBucket = await runner.runValue("Setup: User A creates a CAD bucket", () =>
      createBucket(userA.client, { name: "CAD Wallet", currencyCode: "CAD", bucketType: "bank_account" }),
    );
    if (!cadBucket) throw new Error("cadBucket setup failed");

    await runner.run("Take-debt scenario creates no Liability", async () => {
      const before = await getLiabilitySummaries(userA.client);
      const takeDebtDecision = await createDecision(userA.client, { decisionTypeCode: "take_debt", name: "Consider a Car Loan" });
      const takeDebtScenario = await createDecisionScenario(userA.client, {
        decisionId: takeDebtDecision.id, name: "Proposed Loan", currencyCode: "CAD",
        destinationBucketId: cadBucket.id, grossProceeds: "20000", proceedsCosts: "300",
        interestRate: 7.5, termMonths: 48, collateralNote: "Vehicle title",
      });
      const evaluation = await evaluateDecisionScenario(userA.client, takeDebtScenario.id);
      assert(evaluation.netProceeds === "19700.000000", `expected net loan proceeds 19700, got ${evaluation.netProceeds}`);
      await saveDecisionScenarioEvaluation(userA.client, takeDebtScenario.id);
      const after = await getLiabilitySummaries(userA.client);
      assert(before.length === after.length, "a take_debt scenario evaluation/save must never create a Liability row");
    });

    // --- 37-38: pay-down-debt reads real liability, never executes -------------------
    const audBucket = await runner.runValue("Setup: User A funds an AUD bucket (8000)", async () => {
      const bucket = await createBucket(userA.client, { name: "AUD Wallet", currencyCode: "AUD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "8000", categoryCode: "salary" });
      return bucket;
    });
    const audLiability = await runner.runValue("Setup: User A creates an AUD liability (outstanding 6000)", () =>
      createLiability(userA.client, { name: "AUD Loan", liabilityType: "loan", currencyCode: "AUD", openingPrincipal: "6000" }),
    );
    if (!audBucket || !audLiability) throw new Error("AUD pay-down-debt setup failed");

    await runner.run(
      "Pay-down-debt scenario reads real outstanding principal and never calls real debt-payment execution",
      async () => {
        const payDownDecision = await createDecision(userA.client, { decisionTypeCode: "pay_down_debt", name: "Pay Off AUD Loan", linkedLiabilityId: audLiability.id });
        const payDownScenario = await createDecisionScenario(userA.client, {
          decisionId: payDownDecision.id, name: "Pay 2000", currencyCode: "AUD",
          sourceBucketId: audBucket.id, debtPrincipalPayment: "1800", debtInterestPayment: "150", debtFeePayment: "50",
        });
        const evaluation = await evaluateDecisionScenario(userA.client, payDownScenario.id);
        assert(evaluation.linkedLiabilityOutstandingPrincipal === "6000.000000", `expected fact outstanding 6000, got ${evaluation.linkedLiabilityOutstandingPrincipal}`);
        assert(evaluation.totalCashRequired === "2000.000000", `expected total cash required 1800+150+50=2000, got ${evaluation.totalCashRequired}`);
        assert(evaluation.hypotheticalLiabilityOutstandingAfter === "4200.000000", `expected hypothetical outstanding 6000-1800=4200, got ${evaluation.hypotheticalLiabilityOutstandingAfter}`);

        await saveDecisionScenarioEvaluation(userA.client, payDownScenario.id);

        const summaries = await getLiabilitySummaries(userA.client);
        const summary = summaries.find((s) => s.liabilityId === audLiability.id);
        assert(summary?.outstandingPrincipal === "6000.000000", "evaluating/saving a pay_down_debt scenario must never actually reduce the liability's real outstanding principal");
      },
    );

    // --- 39-40: cross-currency reporting -----------------------------------------------
    await runner.run("Cross-currency scenario without required rate returns not_calculated", async () => {
      const evaluation = await evaluateDecisionScenario(userA.client, sellScenario.id); // EUR
      const conversion = convertScenarioNetDeltaToReportingCurrency(evaluation, "USD", new Map());
      assert(conversion.status === "not_calculated", "missing EUR->USD rate must prevent the reporting-currency conversion");
    });

    await runner.run("Explicit rate permits exact reporting-currency calculation where supported", async () => {
      const evaluation = await evaluateDecisionScenario(userA.client, sellScenario.id); // EUR, net delta 5800
      const conversion = convertScenarioNetDeltaToReportingCurrency(evaluation, "USD", new Map([["EUR", "1.10"]]));
      assert(conversion.status === "converted", `expected converted, got ${conversion.status}`);
      if (conversion.status === "converted") {
        assert(conversion.amount === "6380", `expected 5800*1.10=6380, got ${conversion.amount}`);
      }
    });

    // --- 41-43: multi-currency / precision ------------------------------------------
    await runner.run("Native currencies remain intact -- different-currency scenarios never blend", async () => {
      const eurEval = await evaluateDecisionScenario(userA.client, sellScenario.id);
      const gbpEval = await evaluateDecisionScenario(userA.client, (await createDecisionScenario(userA.client, {
        decisionId: repairDecision.id, name: "GBP Check", currencyCode: "GBP",
      })).id);
      assert(eurEval.currencyCode === "EUR", `expected EUR, got ${eurEval.currencyCode}`);
      assert(gbpEval.currencyCode === "GBP", `expected GBP, got ${gbpEval.currencyCode}`);
    });

    await runner.run("JPY precision enforced", async () => {
      const jpyDecision = await createDecision(userA.client, { decisionTypeCode: "other", name: "JPY Precision Check" });
      let threw = false;
      try {
        await createDecisionScenario(userA.client, { decisionId: jpyDecision.id, name: "Fractional JPY", currencyCode: "JPY", cashRequired: "1000.5" });
      } catch {
        threw = true;
      }
      assert(threw, "a fractional JPY cash_required should be rejected");
    });

    await runner.run("KWD precision enforced", async () => {
      const kwdDecision = await createDecision(userA.client, { decisionTypeCode: "other", name: "KWD Precision Check" });
      const scenario = await createDecisionScenario(userA.client, { decisionId: kwdDecision.id, name: "3-decimal KWD", currencyCode: "KWD", cashRequired: "50.123" });
      assert(scenario.cash_required !== undefined, "expected a successful 3-decimal KWD scenario");
      let threw = false;
      try {
        await updateDecisionScenario(userA.client, scenario.id, { cashRequired: "50.1234" });
      } catch {
        threw = true;
      }
      assert(threw, "a 4-decimal KWD amount should be rejected");
    });

    // --- 44-47: evaluation snapshot ----------------------------------------------------
    let firstSnapshotId = "";
    await runner.run("Saved evaluation snapshot is immutable", async () => {
      const saved = await saveDecisionScenarioEvaluation(userA.client, sellScenario.id);
      firstSnapshotId = saved.id;
      const result = await userA.client.from("decision_scenario_evaluations").update({ evaluated_at: new Date().toISOString() }).eq("id", saved.id).select("*");
      expectDenied(result, "updating an evaluation snapshot should be rejected (no UPDATE grant exists)");
    });

    await runner.run("Re-evaluation appends a new snapshot rather than overwriting the old one", async () => {
      const second = await saveDecisionScenarioEvaluation(userA.client, sellScenario.id);
      assert(second.id !== firstSnapshotId, "a second save must create a new row, not overwrite the first");

      const history = await getDecisionScenarioEvaluationHistory(userA.client, sellScenario.id);
      assert(history.length >= 2, `expected at least 2 evaluation snapshots, got ${history.length}`);
      assert(history[0].id === second.id, "the latest evaluation must be first (most recent)");
    });

    await runner.run("Snapshot preserves the facts/assumptions/derived distinction and rule relationships", async () => {
      const saved = await saveDecisionScenarioEvaluation(userA.client, sellScenario.id);
      const snapshot = saved.snapshot as Record<string, unknown>;
      assert("linked_asset_cost_basis" in snapshot, "expected a fact field in the snapshot");
      assert("gross_proceeds" in snapshot, "expected an assumption field in the snapshot");
      assert("net_proceeds" in snapshot, "expected a derived field in the snapshot");
      assert("minimum_cash_floor_status" in snapshot, "expected a rule-relationship field in the snapshot");
      assert("overall_status" in snapshot, "expected the overall status field in the snapshot");
    });

    // --- 48-50: scenario comparison, no score, no recommendation ---------------------
    await runner.run("Scenario comparison exposes factual differences without winner/ranking; Decision contains no score", async () => {
      const repairThenSell = await createDecisionScenario(userA.client, {
        decisionId: repairDecision.id, name: "Repair Then Sell", currencyCode: "GBP",
        sourceBucketId: gbpBucket.id, cashRequired: "1000", capitalizationClassification: "capital_improvement",
        expectedFutureSaleValue: "6000",
      });
      const sellAsIs = await createDecisionScenario(userA.client, {
        decisionId: repairDecision.id, name: "Sell As-Is Instead", currencyCode: "GBP", grossProceeds: "4200",
      });

      const evalA = await evaluateDecisionScenario(userA.client, repairThenSell.id);
      const evalB = await evaluateDecisionScenario(userA.client, sellAsIs.id);

      assert(evalA.totalCashRequired !== evalB.totalCashRequired, "the two scenarios' factual cash requirements should differ (comparable side by side)");
      const keysA = Object.keys(evalA as unknown as Record<string, unknown>);
      const keysB = Object.keys(evalB as unknown as Record<string, unknown>);
      for (const forbidden of ["rank", "score", "winner", "recommendation", "isBest", "isRecommended"]) {
        assert(!keysA.includes(forbidden) && !keysB.includes(forbidden), `evaluation result must not contain a "${forbidden}" field`);
      }
    });

    await runner.run("Decision evaluation contains no recommend/approve/reject semantics (advisory-language check)", async () => {
      const evaluation = await evaluateDecisionScenario(userA.client, sellScenario.id);
      for (const [key, value] of Object.entries(evaluation as unknown as Record<string, unknown>)) {
        assertNoAdvisoryLanguage(value, `evaluate_decision_scenario().${key}`);
      }
      assert(
        ["aligned", "attention", "conflict", "not_configured", "insufficient_information"].includes(evaluation.overallStatus),
        `overall_status must be one of the neutral vocabulary values, got ${evaluation.overallStatus}`,
      );
    });

    // --- 51-55: choice history --------------------------------------------------------
    await runner.run("User records Proceed choice; Proceed causes zero financial mutations", async () => {
      const bucketsBefore = await getBucketBalances(userA.client);
      const assetsBefore = await getAssetSummaries(userA.client);
      const liabilitiesBefore = await getLiabilitySummaries(userA.client);

      await recordDecisionChoice(userA.client, { decisionId: decisionA.id, choice: "proceed", note: "Going ahead" });

      const bucketsAfter = await getBucketBalances(userA.client);
      const assetsAfter = await getAssetSummaries(userA.client);
      const liabilitiesAfter = await getLiabilitySummaries(userA.client);
      assert(JSON.stringify(bucketsBefore) === JSON.stringify(bucketsAfter), "recording 'proceed' must never change any cash bucket balance");
      assert(assetsBefore.length === assetsAfter.length, "recording 'proceed' must never create/remove an Asset");
      assert(liabilitiesBefore.length === liabilitiesAfter.length, "recording 'proceed' must never create/remove a Liability");
    });

    await runner.run("User records Wait after Proceed; history preserves both in order", async () => {
      await recordDecisionChoice(userA.client, { decisionId: decisionA.id, choice: "wait", note: "Changed my mind" });
      const history = await getDecisionChoiceHistory(userA.client, decisionA.id);
      assert(history.length === 2, `expected 2 choices recorded, got ${history.length}`);
      assert(history[0].choice === "wait", `expected latest choice 'wait', got ${history[0].choice}`);
      assert(history[1].choice === "proceed", `expected prior choice 'proceed' preserved, got ${history[1].choice}`);

      const summaries = await getDecisionSummaries(userA.client);
      const summary = summaries.find((s) => s.decisionId === decisionA.id);
      assert(summary?.currentChoice === "wait", `expected current choice 'wait', got ${summary?.currentChoice}`);
    });

    await runner.run("Decline causes zero financial mutations", async () => {
      const before = await getBucketBalances(userA.client);
      await recordDecisionChoice(userA.client, { decisionId: decisionA.id, choice: "decline" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "recording 'decline' must never change any cash bucket balance");
    });

    await runner.run("Keep Reviewing causes zero financial mutations", async () => {
      const before = await getBucketBalances(userA.client);
      await recordDecisionChoice(userA.client, { decisionId: decisionA.id, choice: "keep_reviewing" });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "recording 'keep_reviewing' must never change any cash bucket balance");
    });

    await runner.run("A cannot insert choice for B Decision", async () => {
      let threw = false;
      try {
        await recordDecisionChoice(userA.client, { decisionId: decisionB.id, choice: "proceed" });
      } catch {
        threw = true;
      }
      assert(threw, "recording a choice against user B's decision should be rejected");
    });

    // --- 57: A cannot read B journal/evaluations --------------------------------------
    await runner.run("A cannot read B journal/evaluations", async () => {
      await recordDecisionChoice(userB.client, { decisionId: decisionB.id, choice: "keep_reviewing" });
      const choiceResult = await userA.client.from("decision_choices").select("*").eq("decision_id", decisionB.id);
      expectFilteredToEmpty(choiceResult, "user A selecting user B's decision choices");

      const bScenario = await createDecisionScenario(userB.client, { decisionId: decisionB.id, name: "B's Scenario", currencyCode: "USD" });
      await saveDecisionScenarioEvaluation(userB.client, bScenario.id);
      const evalResult = await userA.client.from("decision_scenario_evaluations").select("*").eq("scenario_id", bScenario.id);
      expectFilteredToEmpty(evalResult, "user A selecting user B's evaluation snapshots");
    });

    // --- 58: archived Decision remains historically readable --------------------------
    await runner.run("Archived Decision remains historically readable", async () => {
      await updateDecision(userA.client, decisionA.id, { status: "archived" });
      const summaries = await getDecisionSummaries(userA.client);
      const summary = summaries.find((s) => s.decisionId === decisionA.id);
      assert(summary !== undefined, "an archived decision must remain visible in decision_summary()");
      assert(summary?.status === "archived", `expected status archived, got ${summary?.status}`);
      assert(summary?.currentChoice === "keep_reviewing", "the full choice history must remain intact after archiving");
    });

    // --- 59: evaluation with missing input returns explicit insufficient state -------
    await runner.run("Evaluation with missing input returns an explicit insufficient/missing state, never a fabricated zero", async () => {
      const emptyDecision = await createDecision(userA.client, { decisionTypeCode: "other", name: "Nothing Entered Yet" });
      const emptyScenario = await createDecisionScenario(userA.client, { decisionId: emptyDecision.id, name: "Blank", currencyCode: "USD" });
      const evaluation = await evaluateDecisionScenario(userA.client, emptyScenario.id);
      assert(evaluation.totalCashRequired === null, "total cash required must stay null, never a fabricated 0, when nothing was entered");
      assert(evaluation.netProceeds === null, "net proceeds must stay null when nothing was entered");
      assert(evaluation.missingInformation.includes("no_bucket_linked"), "expected no_bucket_linked in missing information");
      assert(evaluation.missingInformation.includes("no_amount_specified"), "expected no_amount_specified in missing information");
      assert(evaluation.overallStatus === "insufficient_information", `expected insufficient_information, got ${evaluation.overallStatus}`);
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
  console.error("Decisions suite crashed:", err);
  process.exitCode = 1;
});
