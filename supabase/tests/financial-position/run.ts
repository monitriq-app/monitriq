/**
 * Cross-user isolation / financial-correctness suite for the Financial
 * Position domain (financial_position_by_currency() and the composed
 * getFinancialPositionSummary()).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion. Each concern below
 * deliberately uses its own fresh currency to keep the arithmetic
 * isolated and independently verifiable.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:financial-position
 */
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectDenied } from "../shared/assert.ts";
import { getFinancialPositionByCurrency, getFinancialPositionSummary } from "../../../lib/domain/financial-position/repository.ts";
import { convertFinancialPositionToReportingCurrency } from "../../../lib/domain/financial-position/aggregate.ts";
import { createBucket, recordMoneyReceived, voidFinancialEvent } from "../../../lib/domain/money/repository.ts";
import { createAsset, recordValuation } from "../../../lib/domain/assets/repository.ts";
import { createReceivable, recordRecovery, recordRecoverableEstimate } from "../../../lib/domain/receivables/repository.ts";
import { createLiability, recordDebtPayment } from "../../../lib/domain/liabilities/repository.ts";
import { createGoal, recordGoalAllocation, recordGoalRelease, setFocusGoal } from "../../../lib/domain/goals/repository.ts";
import { getSafeToDeployByCurrency, createFinancialRule } from "../../../lib/domain/rules/repository.ts";
import { createObligation, updateObligation } from "../../../lib/domain/obligations/repository.ts";
import { createDecision, createDecisionScenario, evaluateDecisionScenario, recordDecisionChoice } from "../../../lib/domain/decisions/repository.ts";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "financial-position-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Financial Position aggregation suite\n");

    // --- 1: cash-only user -------------------------------------------------------------
    await runner.run("Cash-only user Financial Position works", async () => {
      const bucket = await createBucket(userA.client, { name: "USD Wallet", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "5000", categoryCode: "salary" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      const usd = positions.find((p) => p.currencyCode === "USD");
      assert(usd?.liquidCash === "5000.000000", `expected liquidCash 5000, got ${usd?.liquidCash}`);
      assert(usd?.nonCashAssetValue === "0.000000", `expected 0 asset value, got ${usd?.nonCashAssetValue}`);
      assert(usd?.receivablesOutstanding === "0.000000", `expected 0 receivables, got ${usd?.receivablesOutstanding}`);
      assert(usd?.liabilitiesOutstanding === "0.000000", `expected 0 liabilities, got ${usd?.liabilitiesOutstanding}`);
      assert(usd?.netWorth === "5000.000000", `expected net worth 5000, got ${usd?.netWorth}`);
    });

    // --- 2, 12, 13, 14: asset-only value; target/quick-sale excluded; latest value used --
    const eurAsset = await runner.runValue(
      "Asset-only value appears correctly; target/quick-sale excluded from Net Worth",
      async () => {
        const asset = await createAsset(userA.client, {
          assetType: "vehicle", name: "EUR Car", currencyCode: "EUR",
          initialBasisAmount: "3000", estimatedCurrentValue: "4000", targetValue: "9000", quickSaleEstimate: "3500",
        });
        const positions = await getFinancialPositionByCurrency(userA.client);
        const eur = positions.find((p) => p.currencyCode === "EUR");
        assert(eur?.nonCashAssetValue === "4000.000000", `expected asset value 4000 (estimated_current_value), got ${eur?.nonCashAssetValue}`);
        assert(eur?.netWorth === "4000.000000", `expected net worth 4000, never 9000 (target) or 3500 (quick-sale), got ${eur?.netWorth}`);
        assert(eur?.assetQuickSalePotential === "3500.000000", `expected quick-sale potential 3500 exposed separately, got ${eur?.assetQuickSalePotential}`);
        return asset;
      },
    );
    if (!eurAsset) throw new Error("eurAsset setup failed");

    await runner.run("Latest estimated current asset value is used, not a stale one", async () => {
      await recordValuation(userA.client, { assetId: eurAsset.id, valuationType: "estimated_current_value", value: "4500" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      const eur = positions.find((p) => p.currencyCode === "EUR");
      assert(eur?.nonCashAssetValue === "4500.000000", `expected updated asset value 4500, got ${eur?.nonCashAssetValue}`);
      assert(eur?.netWorth === "4500.000000", `expected net worth to follow the latest valuation, got ${eur?.netWorth}`);
    });

    // --- 3, 15, 16: receivable outstanding; estimated recoverable stays separate -----
    const receivableGBP = await runner.runValue("Receivable outstanding appears correctly", () =>
      createReceivable(userA.client, { name: "GBP Invoice", currencyCode: "GBP", faceAmount: "2000" }),
    );
    if (!receivableGBP) throw new Error("receivableGBP setup failed");

    await runner.run("Receivable outstanding used for recorded Net Worth; estimated recoverable remains separate", async () => {
      let positions = await getFinancialPositionByCurrency(userA.client);
      let gbp = positions.find((p) => p.currencyCode === "GBP");
      assert(gbp?.receivablesOutstanding === "2000.000000", `expected outstanding 2000, got ${gbp?.receivablesOutstanding}`);
      assert(gbp?.netWorth === "2000.000000", `expected net worth 2000, got ${gbp?.netWorth}`);
      assert(gbp?.receivablesEstimatedRecoverable === null, "expected 'Not set' (null) before any estimate is recorded");

      await recordRecoverableEstimate(userA.client, { receivableId: receivableGBP.id, value: "1800" });
      positions = await getFinancialPositionByCurrency(userA.client);
      gbp = positions.find((p) => p.currencyCode === "GBP");
      assert(gbp?.receivablesEstimatedRecoverable === "1800.000000", `expected estimate 1800, got ${gbp?.receivablesEstimatedRecoverable}`);
      assert(gbp?.receivablesRecoverabilityDifference === "-200.000000", `expected difference 1800-2000=-200, got ${gbp?.receivablesRecoverabilityDifference}`);
      // Recorded Net Worth must NOT silently switch to the estimate.
      assert(gbp?.netWorth === "2000.000000", `Net Worth must keep using outstanding (2000), not the estimate, got ${gbp?.netWorth}`);
    });

    // --- 17, 47: receivable recovery / void consistency, no double-counting -----------
    let recoveryEventId = "";
    const bucketGBP = await runner.runValue("Setup: User A creates a GBP bucket for recovery", () =>
      createBucket(userA.client, { name: "GBP Wallet", currencyCode: "GBP", bucketType: "bank_account" }),
    );
    if (!bucketGBP) throw new Error("bucketGBP setup failed");

    await runner.run("Receivable recovery increases cash and decreases receivable without double-counting Net Worth", async () => {
      const before = await getFinancialPositionByCurrency(userA.client);
      const gbpBefore = before.find((p) => p.currencyCode === "GBP");
      assert(gbpBefore?.netWorth === "2000.000000", `expected pre-recovery net worth 2000, got ${gbpBefore?.netWorth}`);

      const event = await recordRecovery(userA.client, { receivableId: receivableGBP.id, bucketId: bucketGBP.id, amount: "800" });
      recoveryEventId = event.id;

      const after = await getFinancialPositionByCurrency(userA.client);
      const gbpAfter = after.find((p) => p.currencyCode === "GBP");
      assert(gbpAfter?.liquidCash === "800.000000", `expected cash 800, got ${gbpAfter?.liquidCash}`);
      assert(gbpAfter?.receivablesOutstanding === "1200.000000", `expected outstanding 1200, got ${gbpAfter?.receivablesOutstanding}`);
      assert(gbpAfter?.netWorth === "2000.000000", `Net Worth must stay 2000 -- value simply moved from receivable to cash, got ${gbpAfter?.netWorth}`);
    });

    await runner.run("Voided receivable recovery produces correct restored Financial Position", async () => {
      await voidFinancialEvent(userA.client, recoveryEventId);
      const positions = await getFinancialPositionByCurrency(userA.client);
      const gbp = positions.find((p) => p.currencyCode === "GBP");
      assert(gbp?.liquidCash === "0.000000", `expected cash restored to 0, got ${gbp?.liquidCash}`);
      assert(gbp?.receivablesOutstanding === "2000.000000", `expected outstanding restored to 2000, got ${gbp?.receivablesOutstanding}`);
      assert(gbp?.netWorth === "2000.000000", `Net Worth must remain 2000 after voiding restores both sides symmetrically, got ${gbp?.netWorth}`);
    });

    // --- 4, 6, 18, 19, 20, 48: liability outstanding; negative net worth; payments ----
    const bucketNGN = await runner.runValue("Setup: User A funds an NGN bucket (50000)", async () => {
      const bucket = await createBucket(userA.client, { name: "NGN Wallet", currencyCode: "NGN", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "50000", categoryCode: "salary" });
      return bucket;
    });
    const liabilityNGN = await runner.runValue("Setup: User A creates an NGN liability (opening principal 100000)", () =>
      createLiability(userA.client, { name: "NGN Loan", liabilityType: "loan", currencyCode: "NGN", openingPrincipal: "100000" }),
    );
    if (!bucketNGN || !liabilityNGN) throw new Error("NGN setup failed");

    await runner.run("Liability outstanding subtracts correctly; negative Net Worth is preserved, not clamped", async () => {
      const positions = await getFinancialPositionByCurrency(userA.client);
      const ngn = positions.find((p) => p.currencyCode === "NGN");
      assert(ngn?.liabilitiesOutstanding === "100000.000000", `expected liability outstanding 100000, got ${ngn?.liabilitiesOutstanding}`);
      assert(ngn?.netWorth === "-50000.000000", `expected negative net worth -50000 (50000 cash - 100000 debt), got ${ngn?.netWorth}`);
    });

    let firstPaymentOperationId = "";
    await runner.run("Liability principal payment adjusts cash/liability correctly and does not change Net Worth by principal alone", async () => {
      const operation = await recordDebtPayment(userA.client, { liabilityId: liabilityNGN.id, bucketId: bucketNGN.id, principalAmount: "30000" });
      firstPaymentOperationId = operation.id;
      const positions = await getFinancialPositionByCurrency(userA.client);
      const ngn = positions.find((p) => p.currencyCode === "NGN");
      assert(ngn?.liquidCash === "20000.000000", `expected cash 50000-30000=20000, got ${ngn?.liquidCash}`);
      assert(ngn?.liabilitiesOutstanding === "70000.000000", `expected liability 100000-30000=70000, got ${ngn?.liabilitiesOutstanding}`);
      assert(ngn?.netWorth === "-50000.000000", `principal repayment must not change Net Worth (still -50000), got ${ngn?.netWorth}`);
    });

    await runner.run("Interest and fee payments reduce Net Worth (principal is unaffected)", async () => {
      await recordDebtPayment(userA.client, { liabilityId: liabilityNGN.id, bucketId: bucketNGN.id, interestAmount: "1000", feeAmount: "500" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      const ngn = positions.find((p) => p.currencyCode === "NGN");
      assert(ngn?.liquidCash === "18500.000000", `expected cash 20000-1500=18500, got ${ngn?.liquidCash}`);
      assert(ngn?.liabilitiesOutstanding === "70000.000000", `interest/fee must not touch principal, expected 70000, got ${ngn?.liabilitiesOutstanding}`);
      assert(ngn?.netWorth === "-51500.000000", `expected Net Worth reduced by exactly 1500 (interest+fee) to -51500, got ${ngn?.netWorth}`);
    });

    await runner.run("Voided debt principal payment produces correct restored Financial Position", async () => {
      const { data: events } = await userA.client.from("financial_events").select("id").eq("operation_id", firstPaymentOperationId).eq("event_type", "debt_principal_payment");
      const principalEventId = events?.[0]?.id;
      assert(principalEventId !== undefined, "expected to find the principal payment's financial_event");
      await voidFinancialEvent(userA.client, principalEventId!);

      const positions = await getFinancialPositionByCurrency(userA.client);
      const ngn = positions.find((p) => p.currencyCode === "NGN");
      assert(ngn?.liquidCash === "48500.000000", `expected cash restored: 18500+30000=48500, got ${ngn?.liquidCash}`);
      assert(ngn?.liabilitiesOutstanding === "100000.000000", `expected liability restored: 70000+30000=100000, got ${ngn?.liabilitiesOutstanding}`);
      assert(ngn?.netWorth === "-51500.000000", `voiding a principal-only payment is symmetric, Net Worth stays -51500, got ${ngn?.netWorth}`);
    });

    // --- 5, 7, 8: cash+assets+receivables-liabilities; two independent currencies ----
    await runner.run("Combined cash + assets + receivables - liabilities equals native Net Worth (CAD)", async () => {
      const bucket = await createBucket(userA.client, { name: "CAD Wallet", currencyCode: "CAD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "3000", categoryCode: "salary" });
      await createAsset(userA.client, { assetType: "vehicle", name: "CAD Car", currencyCode: "CAD", estimatedCurrentValue: "7000" });
      await createReceivable(userA.client, { name: "CAD Invoice", currencyCode: "CAD", faceAmount: "1000" });
      await createLiability(userA.client, { name: "CAD Loan", liabilityType: "loan", currencyCode: "CAD", openingPrincipal: "2000" });

      const positions = await getFinancialPositionByCurrency(userA.client);
      const cad = positions.find((p) => p.currencyCode === "CAD");
      // 3000 + 7000 + 1000 - 2000 = 9000
      assert(cad?.netWorth === "9000.000000", `expected combined net worth 9000, got ${cad?.netWorth}`);
    });

    await runner.run("Two currencies produce two independent native positions; unlike currencies are never directly summed", async () => {
      const positions = await getFinancialPositionByCurrency(userA.client);
      const usd = positions.find((p) => p.currencyCode === "USD");
      const eur = positions.find((p) => p.currencyCode === "EUR");
      assert(usd?.netWorth === "5000.000000", `USD position must remain 5000, unaffected by EUR activity, got ${usd?.netWorth}`);
      assert(eur?.netWorth === "4500.000000", `EUR position must remain 4500, unaffected by USD activity, got ${eur?.netWorth}`);
      assert(usd !== eur, "the two currencies must be genuinely separate rows");
    });

    // --- 9, 10, 11, 46: reporting currency ---------------------------------------------
    await runner.run(
      "Reporting Net Worth without required FX is not_calculated; with complete rates it calculates exactly and exposes conversion context",
      async () => {
        const positions = await getFinancialPositionByCurrency(userA.client);
        const usd = positions.find((p) => p.currencyCode === "USD")!;
        const eur = positions.find((p) => p.currencyCode === "EUR")!;

        const missing = convertFinancialPositionToReportingCurrency([usd, eur], "USD", new Map());
        assert(missing.status === "not_calculated", "missing EUR->USD rate must prevent the reporting calculation");
        if (missing.status === "not_calculated") {
          assert(missing.currenciesRequiringConversion.includes("EUR"), "expected EUR listed as requiring conversion");
          assert(missing.missingRates.includes("EUR"), "expected EUR listed as a missing rate");
        }

        // Non-round rate -- proves exact decimal.js arithmetic, no binary float drift.
        const converted = convertFinancialPositionToReportingCurrency([usd, eur], "USD", new Map([["EUR", "1.10"]]));
        assert(converted.status === "calculated", `expected calculated, got ${converted.status}`);
        if (converted.status === "calculated") {
          // USD net worth 5000 (already reporting currency) + EUR net worth 4500*1.10=4950 -> 9950
          assert(converted.netWorth === "9950", `expected exact reporting net worth 9950, got ${converted.netWorth}`);
          assert(converted.reportingCurrency === "USD", "expected reporting currency context exposed");
          assert(converted.currenciesRequiringConversion.includes("EUR"), "expected EUR in currenciesRequiringConversion");
          assert(converted.ratesUsed.EUR === "1.10", `expected the exact rate used exposed, got ${converted.ratesUsed.EUR}`);
          assert(typeof converted.asOf === "string" && converted.asOf.length > 0, "expected a calculation timestamp");
        }
      },
    );

    // --- 21, 22, 23: Goals do not change Net Worth (NZD) -------------------------------
    await runner.run("Goal allocation and release leave Net Worth unchanged; protected/unprotected distinctions do not change it", async () => {
      const bucket = await createBucket(userA.client, { name: "NZD Wallet", currencyCode: "NZD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "5000", categoryCode: "salary" });

      const before = await getFinancialPositionByCurrency(userA.client);
      const nzdBefore = before.find((p) => p.currencyCode === "NZD");
      assert(nzdBefore?.netWorth === "5000.000000", `expected pre-allocation net worth 5000, got ${nzdBefore?.netWorth}`);

      const protectedGoal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Protected NZD Goal", currencyCode: "NZD", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: protectedGoal.id, bucketId: bucket.id, amount: "2000" });
      const afterProtectedAllocation = await getFinancialPositionByCurrency(userA.client);
      assert(afterProtectedAllocation.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "protected allocation must not change Net Worth");

      const unprotectedGoal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Unprotected NZD Goal", currencyCode: "NZD", isProtected: false });
      await recordGoalAllocation(userA.client, { goalId: unprotectedGoal.id, bucketId: bucket.id, amount: "1000" });
      const afterUnprotectedAllocation = await getFinancialPositionByCurrency(userA.client);
      assert(afterUnprotectedAllocation.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "unprotected allocation must not change Net Worth");

      await recordGoalRelease(userA.client, { goalId: protectedGoal.id, bucketId: bucket.id, amount: "500" });
      const afterRelease = await getFinancialPositionByCurrency(userA.client);
      assert(afterRelease.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "release must not change Net Worth");
    });

    // --- 24: Rule changes leave Net Worth unchanged (NZD) ------------------------------
    await runner.run("Rule creation/change leaves Net Worth unchanged", async () => {
      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "NZD", thresholdValue: "1000" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      assert(positions.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "configuring a rule must not change Net Worth");
    });

    // --- 25, 26: Obligation creation/paid leaves Net Worth unchanged (NZD) -------------
    await runner.run("Obligation creation leaves Net Worth unchanged; paid/cancelled metadata does not fabricate a change", async () => {
      const obligation = await createObligation(userA.client, { name: "NZD Bill", currencyCode: "NZD", amount: "300" });
      let positions = await getFinancialPositionByCurrency(userA.client);
      assert(positions.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "creating an obligation must not change Net Worth");

      await updateObligation(userA.client, obligation.id, { status: "paid" });
      positions = await getFinancialPositionByCurrency(userA.client);
      assert(positions.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "marking an obligation paid must not fabricate a Net Worth change");
    });

    // --- 27, 28: Decision evaluation/Proceed leaves Net Worth unchanged (NZD) ---------
    await runner.run("Decision evaluation and a Proceed choice leave Net Worth unchanged", async () => {
      const decision = await createDecision(userA.client, { decisionTypeCode: "large_personal_purchase", name: "NZD Purchase Consideration" });
      const scenario = await createDecisionScenario(userA.client, { decisionId: decision.id, name: "Scenario", currencyCode: "NZD", cashRequired: "1000" });
      await evaluateDecisionScenario(userA.client, scenario.id);
      let positions = await getFinancialPositionByCurrency(userA.client);
      assert(positions.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "evaluating a scenario must not change Net Worth");

      await recordDecisionChoice(userA.client, { decisionId: decision.id, choice: "proceed" });
      positions = await getFinancialPositionByCurrency(userA.client);
      assert(positions.find((p) => p.currencyCode === "NZD")?.netWorth === "5000.000000", "recording Proceed must not change Net Worth");
    });

    // --- 29, 30, 31, 32: Safe-to-Deploy / protected cash / retained deficit / shortfall (SGD) --
    const sgdBucket = await runner.runValue("Setup: User A funds an SGD bucket (7000)", async () => {
      const bucket = await createBucket(userA.client, { name: "SGD Wallet", currencyCode: "SGD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "7000", categoryCode: "salary" });
      return bucket;
    });
    if (!sgdBucket) throw new Error("sgdBucket setup failed");

    await runner.run(
      "Safe to Deploy, protected cash, retained deficit, and allocation shortfall exactly match authoritative Rules output",
      async () => {
        const goalA = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "SGD Goal A", currencyCode: "SGD", isProtected: true });
        const goalB = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "SGD Goal B", currencyCode: "SGD", isProtected: true });
        await recordGoalAllocation(userA.client, { goalId: goalA.id, bucketId: sgdBucket.id, amount: "4000" });
        await recordGoalAllocation(userA.client, { goalId: goalB.id, bucketId: sgdBucket.id, amount: "3000" });
        // Underfunded bucket: real spending after the fact creates a shortfall.
        await createBucket(userA.client, { name: "SGD Spend Helper", currencyCode: "SGD", bucketType: "cash_wallet" });
        const { recordMoneySpent } = await import("../../../lib/domain/money/repository.ts");
        await recordMoneySpent(userA.client, { bucketId: sgdBucket.id, amount: "2000", categoryCode: "housing" });
        await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "SGD", thresholdValue: "1000" });

        const [positions, rulesResults] = await Promise.all([
          getFinancialPositionByCurrency(userA.client),
          getSafeToDeployByCurrency(userA.client),
        ]);
        const fpSgd = positions.find((p) => p.currencyCode === "SGD");
        const rulesSgd = rulesResults.find((r) => r.currencyCode === "SGD");

        assert(fpSgd?.protectedGoalCash === rulesSgd?.protectedGoalCash, `protectedGoalCash must match Rules exactly: ${fpSgd?.protectedGoalCash} vs ${rulesSgd?.protectedGoalCash}`);
        assert(fpSgd?.safeToDeploy === rulesSgd?.safeToDeploy, `safeToDeploy must match Rules exactly: ${fpSgd?.safeToDeploy} vs ${rulesSgd?.safeToDeploy}`);
        assert(fpSgd?.retainedDeficit === rulesSgd?.retainedDeficit, `retainedDeficit must match Rules exactly: ${fpSgd?.retainedDeficit} vs ${rulesSgd?.retainedDeficit}`);
        // Nominal 7000 allocated, real backed capped at 5000 (balance after spend) -> shortfall 2000.
        assert(fpSgd?.protectedGoalCash === "5000.000000", `expected backed protected cash 5000, got ${fpSgd?.protectedGoalCash}`);
        assert(fpSgd?.allocationShortfall === "2000.000000", `expected allocation shortfall 2000, got ${fpSgd?.allocationShortfall}`);
      },
    );

    // --- 33, 34, 35, 36: potential liquidity distinctness ------------------------------
    await runner.run("Asset quick-sale potential appears only when explicitly recorded; absence is Not Set, not zero", async () => {
      await createAsset(userA.client, { assetType: "vehicle", name: "PLN Car (no quick-sale)", currencyCode: "PLN", estimatedCurrentValue: "1000" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      const pln = positions.find((p) => p.currencyCode === "PLN");
      assert(pln?.assetQuickSalePotential === null, `expected null (Not Set) when no quick-sale estimate exists, got ${pln?.assetQuickSalePotential}`);
    });

    await runner.run("Receivables are never counted as Liquid Cash; quick-sale estimates are never counted as Safe to Deploy", async () => {
      const positions = await getFinancialPositionByCurrency(userA.client);
      const gbp = positions.find((p) => p.currencyCode === "GBP");
      // GBP has an outstanding receivable but zero real cash (the earlier recovery was voided).
      assert(gbp?.liquidCash === "0.000000", `receivable value must never appear as liquid cash, got ${gbp?.liquidCash}`);
      const eur = positions.find((p) => p.currencyCode === "EUR");
      // EUR has a quick-sale estimate (3500) but no floor configured -- safeToDeploy stays not_configured/null, never inflated by the quick-sale figure.
      assert(eur?.safeToDeployStatus === "not_configured", `expected EUR safe-to-deploy not_configured (never fed by quick-sale estimate), got ${eur?.safeToDeployStatus}`);
    });

    // --- 37, 38: focus goal ------------------------------------------------------------
    await runner.run("No focus goal does not invent one", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.focusGoal === null, `expected no focus goal, got ${JSON.stringify(summary.focusGoal)}`);
    });

    let focusGoalId = "";
    await runner.run("Active focus goal surfaces only when the user explicitly selected one", async () => {
      const bucket = await createBucket(userA.client, { name: "Focus Bucket", currencyCode: "USD", bucketType: "bank_account" });
      const goal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Focus Goal", currencyCode: "USD" });
      focusGoalId = goal.id;
      void bucket;
      await setFocusGoal(userA.client, goal.id);
      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.focusGoal?.goalId === focusGoalId, `expected the explicitly-selected focus goal, got ${summary.focusGoal?.goalId}`);
    });

    // --- 39, 40: active decisions without ranking; archived excluded ------------------
    await runner.run("Active Decisions surface without ranking; archived Decisions are excluded from the active view", async () => {
      const active = await createDecision(userA.client, { decisionTypeCode: "other", name: "Still Considering" });
      const archived = await createDecision(userA.client, { decisionTypeCode: "other", name: "Old Decision" });
      const { updateDecision } = await import("../../../lib/domain/decisions/repository.ts");
      await updateDecision(userA.client, archived.id, { status: "archived" });

      const summary = await getFinancialPositionSummary(userA.client);
      const ids = summary.activeDecisions.map((d) => d.decisionId);
      assert(ids.includes(active.id), "expected the active decision present");
      assert(!ids.includes(archived.id), "expected the archived decision excluded from the active view");
      for (const forbidden of ["rank", "score", "winner"]) {
        assert(!(forbidden in (summary.activeDecisions[0] as unknown as Record<string, unknown>)), `active decisions must not carry a "${forbidden}" field`);
      }
    });

    // --- 41: upcoming obligations use canonical date-range logic ----------------------
    await runner.run("Upcoming obligations use canonical date-range logic (default 30-day horizon)", async () => {
      const soon = await createObligation(userA.client, { name: "Due Soon", currencyCode: "USD", amount: "10", dueDate: daysFromNow(5) });
      const later = await createObligation(userA.client, { name: "Due Later", currencyCode: "USD", amount: "10", dueDate: daysFromNow(40) });
      const summary = await getFinancialPositionSummary(userA.client);
      const ids = summary.upcomingObligations.map((o) => o.obligationId);
      assert(ids.includes(soon.id), "expected the +5-day obligation within the default horizon");
      assert(!ids.includes(later.id), "expected the +40-day obligation outside the default horizon");
    });

    // --- 44, 45: JPY/KWD precision flow through correctly ------------------------------
    await runner.run("JPY precision remains correct in Financial Position", async () => {
      const bucket = await createBucket(userA.client, { name: "JPY Wallet", currencyCode: "JPY", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "100000", categoryCode: "salary" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      const jpy = positions.find((p) => p.currencyCode === "JPY");
      assert(jpy?.liquidCash === "100000.000000", `expected exact 6-decimal-formatted JPY cash, got ${jpy?.liquidCash}`);
      assert(jpy?.netWorth === "100000.000000", `expected exact JPY net worth, got ${jpy?.netWorth}`);
    });

    await runner.run("KWD precision remains correct in Financial Position", async () => {
      const bucket = await createBucket(userA.client, { name: "KWD Wallet", currencyCode: "KWD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "50.123", categoryCode: "salary" });
      const positions = await getFinancialPositionByCurrency(userA.client);
      const kwd = positions.find((p) => p.currencyCode === "KWD");
      assert(kwd?.liquidCash === "50.123000", `expected exact 3-decimal KWD amount formatted to 6 places, got ${kwd?.liquidCash}`);
      assert(kwd?.netWorth === "50.123000", `expected exact KWD net worth, got ${kwd?.netWorth}`);
    });

    // --- 42: cross-tenant aggregation isolation -----------------------------------------
    await runner.run("User A aggregate contains no User B values", async () => {
      const bucketB = await createBucket(userB.client, { name: "THB Wallet", currencyCode: "THB", bucketType: "bank_account" });
      await recordMoneyReceived(userB.client, { bucketId: bucketB.id, amount: "999999", categoryCode: "salary" });
      await createAsset(userB.client, { assetType: "vehicle", name: "B's Asset", currencyCode: "THB", estimatedCurrentValue: "888888" });
      await createReceivable(userB.client, { name: "B's Invoice", currencyCode: "THB", faceAmount: "777777" });
      await createLiability(userB.client, { name: "B's Loan", liabilityType: "loan", currencyCode: "THB", openingPrincipal: "666666" });
      const bGoal = await createGoal(userB.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "B's Goal", currencyCode: "THB" });
      await setFocusGoal(userB.client, bGoal.id);
      const bDecision = await createDecision(userB.client, { decisionTypeCode: "other", name: "B's Decision" });
      await createObligation(userB.client, { name: "B's Obligation", currencyCode: "THB", amount: "100", dueDate: daysFromNow(5) });

      const summaryA = await getFinancialPositionSummary(userA.client);
      const positionsA = await getFinancialPositionByCurrency(userA.client);
      assert(!positionsA.some((p) => p.currencyCode === "THB"), "user A's positions must never include user B's THB currency");
      assert(!summaryA.activeGoals.some((g) => g.goalId === bGoal.id), "user A's goals must never include user B's goal");
      assert(!summaryA.activeDecisions.some((d) => d.decisionId === bDecision.id), "user A's decisions must never include user B's decision");
      assert(summaryA.focusGoal?.goalId !== bGoal.id, "user A's focus goal must never be user B's goal");
      assert(!summaryA.upcomingObligations.some((o) => o.name === "B's Obligation"), "user A's obligations must never include user B's obligation");
    });

    // --- 43: anonymous denied -----------------------------------------------------------
    await runner.run("Anonymous cannot retrieve Financial Position", async () => {
      const result = await anonClient.rpc("financial_position_by_currency");
      expectDenied(result, "anonymous call to financial_position_by_currency");
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
  console.error("Financial Position suite crashed:", err);
  process.exitCode = 1;
});
