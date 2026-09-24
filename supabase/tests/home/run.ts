/**
 * Home / Command Center suite (P0-E3-S2): proves Home's data boundary is
 * exactly getFinancialPositionSummary() + Money's canonical recent
 * activity (no duplicate/re-derived calculations), that two authenticated
 * users receive completely isolated Home content derived only from their
 * own records, and exercises the pure capital-distribution composition
 * function directly. Theme is intentionally NOT tested here — it is
 * 100% client-side/CSS state with zero Supabase calls by construction
 * (verified by source audit below, not by a database test, since there is
 * nothing for a database test to observe).
 *
 * Same rules as every prior suite: LOCAL Supabase only, real anon-key +
 * PostgREST/RPC path, one dedicated currency per concern.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:home
 */
import { readFileSync } from "node:fs";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectDenied } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import { getProfile } from "../../../lib/domain/profile/repository.ts";
import { createBucket, recordMoneyReceived, recordMoneySpent, getRecentActivity } from "../../../lib/domain/money/repository.ts";
import { createAsset, getAssetValueByType } from "../../../lib/domain/assets/repository.ts";
import { createReceivable } from "../../../lib/domain/receivables/repository.ts";
import { createGoal, recordGoalAllocation, setFocusGoal } from "../../../lib/domain/goals/repository.ts";
import { createFinancialRule, getSafeToDeployByCurrency } from "../../../lib/domain/rules/repository.ts";
import { createObligation } from "../../../lib/domain/obligations/repository.ts";
import { createDecision, createDecisionScenario, evaluateDecisionScenario, recordDecisionChoice } from "../../../lib/domain/decisions/repository.ts";
import { getFinancialPositionSummary, getFinancialPositionByCurrency } from "../../../lib/domain/financial-position/repository.ts";
import { buildCapitalDistribution } from "../../../lib/domain/financial-position/capital-distribution.ts";
import { getMoneyPeriodSummary } from "../../../lib/domain/money/repository.ts";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "home-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Home / Command Center suite\n");

    // =========================================================================
    // PURE CAPITAL-DISTRIBUTION FUNCTION — no DB needed
    // =========================================================================

    await runner.run("Capital distribution: empty when there is no cash, assets, or receivables", async () => {
      const result = buildCapitalDistribution([], [], null, new Map());
      assert(result.mode === "empty", `expected empty, got ${result.mode}`);
    });

    await runner.run("Capital distribution: a single native currency shows exact within-currency percentages, no FX needed", async () => {
      const positions = [
        {
          currencyCode: "USD",
          liquidCash: "1000",
          nonCashAssetValue: "0",
          receivablesOutstanding: "0",
          liabilitiesOutstanding: "0",
          netWorth: "1000",
          protectedGoalCash: null,
          protectedCommitments: null,
          minimumCashFloor: null,
          requiredRetainedCash: null,
          safeToDeploy: null,
          safeToDeployStatus: "not_configured" as const,
          retainedDeficit: null,
          assetQuickSalePotential: null,
          receivablesEstimatedRecoverable: null,
          receivablesRecoverabilityDifference: null,
          allocationShortfall: "0",
        },
      ];
      const assetValueByType = [{ assetType: "vehicle" as const, currencyCode: "USD", totalEstimatedValue: "3000" }];
      const result = buildCapitalDistribution(positions, assetValueByType, null, new Map());
      assert(result.mode === "single_currency", `expected single_currency, got ${result.mode}`);
      if (result.mode === "single_currency") {
        assert(result.totalAmount === "4000", `expected total 1000+3000=4000, got ${result.totalAmount}`);
        const cash = result.categories.find((c) => c.key === "cash");
        const vehicle = result.categories.find((c) => c.key === "vehicle");
        assert(cash?.percentage === "25.0", `expected cash 1000/4000=25.0%, got ${cash?.percentage}`);
        assert(vehicle?.percentage === "75.0", `expected vehicle 3000/4000=75.0%, got ${vehicle?.percentage}`);
      }
    });

    await runner.run("Capital distribution: multiple currencies without complete reporting FX degrade to native_incomplete, never blended", async () => {
      const positions = [
        { currencyCode: "USD", liquidCash: "1000", nonCashAssetValue: "0", receivablesOutstanding: "0", liabilitiesOutstanding: "0", netWorth: "1000", protectedGoalCash: null, protectedCommitments: null, minimumCashFloor: null, requiredRetainedCash: null, safeToDeploy: null, safeToDeployStatus: "not_configured" as const, retainedDeficit: null, assetQuickSalePotential: null, receivablesEstimatedRecoverable: null, receivablesRecoverabilityDifference: null, allocationShortfall: "0" },
        { currencyCode: "EUR", liquidCash: "500", nonCashAssetValue: "0", receivablesOutstanding: "0", liabilitiesOutstanding: "0", netWorth: "500", protectedGoalCash: null, protectedCommitments: null, minimumCashFloor: null, requiredRetainedCash: null, safeToDeploy: null, safeToDeployStatus: "not_configured" as const, retainedDeficit: null, assetQuickSalePotential: null, receivablesEstimatedRecoverable: null, receivablesRecoverabilityDifference: null, allocationShortfall: "0" },
      ];
      const result = buildCapitalDistribution(positions, [], "USD", new Map());
      assert(result.mode === "native_incomplete", `expected native_incomplete (no EUR rate recorded), got ${result.mode}`);
      if (result.mode === "native_incomplete") {
        assert(result.groups.length === 2, `expected 2 native groups, got ${result.groups.length}`);
      }
      const withRate = buildCapitalDistribution(positions, [], "USD", new Map([["EUR", "1.10"]]));
      assert(withRate.mode === "reporting", `expected reporting once EUR has a rate, got ${withRate.mode}`);
      if (withRate.mode === "reporting") {
        assert(withRate.totalAmount === "1550", `expected 1000 + 500*1.10=550 -> 1550, got ${withRate.totalAmount}`);
      }
    });

    await runner.run("Capital distribution never includes liabilities as a category", async () => {
      const positions = [
        { currencyCode: "USD", liquidCash: "1000", nonCashAssetValue: "0", receivablesOutstanding: "0", liabilitiesOutstanding: "5000", netWorth: "-4000", protectedGoalCash: null, protectedCommitments: null, minimumCashFloor: null, requiredRetainedCash: null, safeToDeploy: null, safeToDeployStatus: "not_configured" as const, retainedDeficit: null, assetQuickSalePotential: null, receivablesEstimatedRecoverable: null, receivablesRecoverabilityDifference: null, allocationShortfall: "0" },
      ];
      const result = buildCapitalDistribution(positions, [], null, new Map());
      assert(result.mode === "single_currency", `expected single_currency, got ${result.mode}`);
      if (result.mode === "single_currency") {
        assert(result.categories.every((c) => c.key !== "liabilities"), "liabilities must never appear as a capital-distribution category");
        assert(result.totalAmount === "1000", `total must reflect only cash (liabilities excluded), expected 1000, got ${result.totalAmount}`);
      }
    });

    // =========================================================================
    // SETUP: User A — a populated, multi-currency, multi-domain Home
    // =========================================================================

    await runner.run("Setup: User A profile (name, USD reporting currency, timezone)", async () => {
      await updateProfile(userA.client, { first_name: "Amara", preferred_currency: "USD", timezone: "America/New_York" });
    });

    await runner.run("Setup: User A USD cash, salary, and an expense (This Month + Liquid Position)", async () => {
      const bucket = await createBucket(userA.client, { name: "USD Checking", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "5000", categoryCode: "salary" });
      await recordMoneySpent(userA.client, { bucketId: bucket.id, amount: "1200", categoryCode: "housing" });
    });

    await runner.run("Setup: User A two USD assets, one with a quick-sale estimate (partial coverage)", async () => {
      await createAsset(userA.client, { assetType: "vehicle", name: "Car", currencyCode: "USD", estimatedCurrentValue: "15000", quickSaleEstimate: "13000" });
      await createAsset(userA.client, { assetType: "equipment", name: "Equipment", currencyCode: "USD", estimatedCurrentValue: "2000" });
    });

    await runner.run("Setup: User A USD receivable", async () => {
      await createReceivable(userA.client, { name: "Invoice", currencyCode: "USD", faceAmount: "1000" });
    });

    let focusGoalId = "";
    await runner.run("Setup: User A creates and focuses a USD goal", async () => {
      const bucket = await createBucket(userA.client, { name: "USD Goal Bucket", currencyCode: "USD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "2000", categoryCode: "salary" });
      const goal = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "Emergency Reserve", currencyCode: "USD", targetValue: "5000" });
      focusGoalId = goal.id;
      await recordGoalAllocation(userA.client, { goalId: goal.id, bucketId: bucket.id, amount: "1500" });
      await setFocusGoal(userA.client, goal.id);
    });

    let soonObligationId = "";
    await runner.run("Setup: User A one upcoming obligation", async () => {
      const obligation = await createObligation(userA.client, { name: "Rent", currencyCode: "USD", amount: "800", dueDate: daysFromNow(5) });
      soonObligationId = obligation.id;
    });

    await runner.run("Setup: User A one active Decision with a Proceed choice", async () => {
      const decision = await createDecision(userA.client, { decisionTypeCode: "other", name: "Considering a laptop" });
      const scenario = await createDecisionScenario(userA.client, { decisionId: decision.id, name: "Base case", currencyCode: "USD", cashRequired: "1500" });
      await evaluateDecisionScenario(userA.client, scenario.id);
      await recordDecisionChoice(userA.client, { decisionId: decision.id, choice: "proceed" });
    });

    await runner.run("Setup: User A EUR cash with no recorded reporting rate (native_incomplete proof)", async () => {
      const bucket = await createBucket(userA.client, { name: "EUR Wallet", currencyCode: "EUR", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "500", categoryCode: "salary" });
    });

    await runner.run("Setup: User A GBP allocation shortfall (backed protected cash falls short of nominal)", async () => {
      const bucket = await createBucket(userA.client, { name: "GBP Wallet", currencyCode: "GBP", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "7000", categoryCode: "salary" });
      const goalX = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "GBP Goal X", currencyCode: "GBP", isProtected: true });
      const goalY = await createGoal(userA.client, { goalTypeCode: "custom", measurementType: "cash_target", name: "GBP Goal Y", currencyCode: "GBP", isProtected: true });
      await recordGoalAllocation(userA.client, { goalId: goalX.id, bucketId: bucket.id, amount: "4000" });
      await recordGoalAllocation(userA.client, { goalId: goalY.id, bucketId: bucket.id, amount: "3000" });
      await recordMoneySpent(userA.client, { bucketId: bucket.id, amount: "2000", categoryCode: "other" });
      await createFinancialRule(userA.client, { ruleType: "minimum_cash_floor", currencyCode: "GBP", thresholdValue: "1000" });
    });

    // =========================================================================
    // SETUP: User B — a distinct, isolated user
    // =========================================================================

    await runner.run("Setup: User B profile (different name, JPY reporting currency)", async () => {
      await updateProfile(userB.client, { first_name: "Kenji", preferred_currency: "JPY", timezone: "Asia/Tokyo" });
    });

    await runner.run("Setup: User B JPY cash and asset", async () => {
      const bucket = await createBucket(userB.client, { name: "JPY Wallet", currencyCode: "JPY", bucketType: "bank_account" });
      await recordMoneyReceived(userB.client, { bucketId: bucket.id, amount: "300000", categoryCode: "salary" });
      await createAsset(userB.client, { assetType: "property", name: "Property", currencyCode: "JPY", estimatedCurrentValue: "8000000" });
    });

    // =========================================================================
    // HOME DATA-LAYER CORRECTNESS
    // =========================================================================

    await runner.run("Home's Net Worth/Liquid Position source is exactly financial_position_by_currency() — no re-derivation", async () => {
      const [summary, direct] = await Promise.all([getFinancialPositionSummary(userA.client), getFinancialPositionByCurrency(userA.client)]);
      assert(JSON.stringify(summary.nativePositions) === JSON.stringify(direct), "Home summary's nativePositions must be byte-identical to the direct canonical read");
    });

    await runner.run("Home's Safe to Deploy matches Rules' own safe_to_deploy_by_currency() exactly", async () => {
      const [summary, rules] = await Promise.all([getFinancialPositionSummary(userA.client), getSafeToDeployByCurrency(userA.client)]);
      const gbp = summary.nativePositions.find((p) => p.currencyCode === "GBP");
      const gbpRules = rules.find((r) => r.currencyCode === "GBP");
      assert(gbp?.safeToDeploy === gbpRules?.safeToDeploy, `expected identical Safe to Deploy, got ${gbp?.safeToDeploy} vs ${gbpRules?.safeToDeploy}`);
      assert(Number(gbp?.allocationShortfall) === 2000, `expected GBP allocation shortfall exactly 2000, got ${gbp?.allocationShortfall}`);
    });

    await runner.run("Home's This Month matches getMoneyPeriodSummary() exactly for the same user", async () => {
      const [summary, direct] = await Promise.all([getFinancialPositionSummary(userA.client), getMoneyPeriodSummary(userA.client)]);
      assert(JSON.stringify(summary.thisMonth) === JSON.stringify(direct), "Home summary's thisMonth must be byte-identical to the direct canonical read");
      const usd = summary.thisMonth.currencies.find((c) => c.currencyCode === "USD");
      assert(usd?.cashIn === "7000.000000", `expected USD cashIn 5000+2000=7000 (goal-bucket funding also salary), got ${usd?.cashIn}`);
      assert(usd?.cashOut === "1200.000000", `expected USD cashOut 1200, got ${usd?.cashOut}`);
    });

    await runner.run("Recent Activity comes from Money's canonical event stream only", async () => {
      const activity = await getRecentActivity(userA.client, 50);
      const validEventTypes = new Set(["opening_balance", "money_received", "money_spent", "transfer", "fx_transfer", "receivable_recovery", "debt_principal_payment", "debt_interest", "debt_fee", "loan_proceeds"]);
      assert(activity.length > 0, "expected some activity for User A");
      assert(activity.every((item) => validEventTypes.has(item.eventType)), "Recent Activity must only ever contain real Money event types — never goal allocation, Decision, or rule events");
    });

    await runner.run("Focus Goal appears only when explicitly selected; the exact goal the user chose", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.focusGoal?.goalId === focusGoalId, `expected the explicitly-focused goal, got ${summary.focusGoal?.goalId}`);
    });

    await runner.run("Active Decisions carry no rank/score/winner field", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.activeDecisions.length > 0, "expected at least one active decision");
      for (const forbidden of ["rank", "score", "winner"]) {
        assert(!(forbidden in (summary.activeDecisions[0] as unknown as Record<string, unknown>)), `Decisions must never carry a "${forbidden}" field`);
      }
    });

    await runner.run("Proceed Decision choice does not alter Home's financial figures", async () => {
      const before = await getFinancialPositionSummary(userA.client);
      const usdBefore = before.nativePositions.find((p) => p.currencyCode === "USD")?.netWorth;
      const decision = await createDecision(userA.client, { decisionTypeCode: "other", name: "Second consideration" });
      await recordDecisionChoice(userA.client, { decisionId: decision.id, choice: "proceed" });
      const after = await getFinancialPositionSummary(userA.client);
      const usdAfter = after.nativePositions.find((p) => p.currencyCode === "USD")?.netWorth;
      assert(usdBefore === usdAfter, `expected USD Net Worth unchanged by a Proceed choice, before=${usdBefore} after=${usdAfter}`);
    });

    await runner.run("A real upcoming obligation appears; none are invented", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      const ids = summary.upcomingObligations.map((o) => o.obligationId);
      assert(ids.includes(soonObligationId), "expected the real +5-day obligation to appear");
      assert(summary.upcomingObligations.every((o) => o.name === "Rent"), "no obligation should exist that User A did not create");
    });

    await runner.run("Partial asset quick-sale coverage is visibly distinguishable from complete", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      const usdCoverage = summary.assetQuickSaleCoverage.find((c) => c.currencyCode === "USD");
      assert(usdCoverage?.coverageStatus === "partial", `expected partial (1 of 2 USD assets estimated), got ${usdCoverage?.coverageStatus}`);
      assert(usdCoverage?.quickSaleEstimateCount === 1 && usdCoverage?.activeAssetCount === 2, "expected exactly 1 of 2 assets estimated");
    });

    await runner.run("Capital distribution end-to-end: USD/GBP without a recorded rate degrade to native grouping, never blended", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.capitalDistribution.mode === "native_incomplete", `expected native_incomplete for a multi-currency user with incomplete FX, got ${summary.capitalDistribution.mode}`);
    });

    // =========================================================================
    // DYNAMIC USER / ISOLATION
    // =========================================================================

    await runner.run("User A and User B have different profile names, currencies, and Home content — fully isolated", async () => {
      const [profileA, profileB, summaryA, summaryB] = await Promise.all([
        getProfile(userA.client),
        getProfile(userB.client),
        getFinancialPositionSummary(userA.client),
        getFinancialPositionSummary(userB.client),
      ]);

      assert(profileA?.first_name === "Amara" && profileB?.first_name === "Kenji", "expected distinct profile names");
      assert(summaryA.reportingCurrency === "USD" && summaryB.reportingCurrency === "JPY", "expected distinct reporting currencies");

      assert(!summaryA.nativePositions.some((p) => p.currencyCode === "JPY"), "User A's Home must never contain User B's JPY currency");
      assert(!summaryB.nativePositions.some((p) => ["USD", "EUR", "GBP"].includes(p.currencyCode)), "User B's Home must never contain User A's currencies");

      const assetTypesA = await getAssetValueByType(userA.client);
      const assetTypesB = await getAssetValueByType(userB.client);
      assert(!assetTypesA.some((a) => a.assetType === "property"), "User A's asset breakdown must never include User B's property asset");
      assert(!assetTypesB.some((a) => a.assetType === "vehicle" || a.assetType === "equipment"), "User B's asset breakdown must never include User A's assets");

      assert(summaryA.focusGoal?.goalId !== summaryB.focusGoal?.goalId || (summaryA.focusGoal === null && summaryB.focusGoal === null), "focus goals must never accidentally match across users");
      assert(!summaryA.upcomingObligations.some((o) => o.name !== "Rent"), "User A must see only her own obligation");
      assert(summaryB.upcomingObligations.length === 0, "User B created no obligations and must see none");
    });

    await runner.run("Anonymous cannot retrieve any Home financial data", async () => {
      expectDenied(await anonClient.rpc("financial_position_by_currency"), "anonymous financial_position_by_currency (Home's primary data source)");
      expectDenied(await anonClient.rpc("money_period_summary", {}), "anonymous money_period_summary (Home's This Month source)");
      expectDenied(await anonClient.rpc("money_recent_activity", { p_limit: 10 }), "anonymous money_recent_activity (Home's Recent Activity source)");
    });

    // =========================================================================
    // SOURCE AUDITS — automated, not manual
    // =========================================================================

    await runner.run("Source audit: no prototype personal data anywhere in runtime app/component source", async () => {
      const { execSync } = await import("node:child_process");
      const forbidden = ["Victor", "Lakowe", "Autodrip", "Nemryn", "BMW", "840,000", "108.8M", "240,000"];
      for (const term of forbidden) {
        let matches = "";
        try {
          matches = execSync(`grep -rn "${term}" app components lib --include="*.ts" --include="*.tsx" || true`, { encoding: "utf8" });
        } catch {
          matches = "";
        }
        assert(matches.trim() === "", `found forbidden prototype term "${term}" in runtime source:\n${matches}`);
      }
    });

    await runner.run("Source audit: no AI-fintech-slop copy anywhere in runtime app/component source", async () => {
      const { execSync } = await import("node:child_process");
      const forbidden = [
        "AI-powered",
        "intelligent insights",
        "unlock your potential",
        "smart finance",
        "financial intelligence score",
        "optimization score",
        "recommended for you",
        "best move",
        "optimal choice",
      ];
      for (const phrase of forbidden) {
        let matches = "";
        try {
          matches = execSync(`grep -rin "${phrase}" app components lib --include="*.ts" --include="*.tsx" || true`, { encoding: "utf8" });
        } catch {
          matches = "";
        }
        assert(matches.trim() === "", `found forbidden AI-slop phrase "${phrase}" in runtime source:\n${matches}`);
      }
    });

    await runner.run("Source audit: no 'live'/'market'/'real-time'/'official' FX rate claim in user-facing copy", async () => {
      // Scoped to .tsx files under app/components (where user-facing JSX
      // text actually lives) and to non-comment lines only — source
      // comments legitimately document the ABSENCE of live rates (e.g.
      // "never a live/market rate", a negation, not a claim) and must not
      // trip this audit.
      const { execSync } = await import("node:child_process");
      const { readFileSync: readFile } = await import("node:fs");
      const forbidden = ["live rate", "market rate", "real-time rate", "official rate"];

      let files: string[] = [];
      try {
        files = execSync(`find app components -name "*.tsx" || true`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
      } catch {
        files = [];
      }

      const offenders: string[] = [];
      for (const file of files) {
        const lines = readFile(new URL(`../../../${file}`, import.meta.url), "utf8").split("\n");
        for (const [i, line] of lines.entries()) {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
          const lower = line.toLowerCase();
          for (const phrase of forbidden) {
            if (lower.includes(phrase)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        }
      }
      assert(offenders.length === 0, `found forbidden FX claim(s) in user-facing JSX:\n${offenders.join("\n")}`);
    });

    await runner.run("Theme components make zero Supabase/financial calls (structural proof that theme causes zero financial mutation)", async () => {
      const themeSources = ["components/theme/ThemeProvider.tsx", "components/theme/ThemeToggle.tsx"].map((p) =>
        readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8"),
      );
      for (const source of themeSources) {
        assert(!source.includes("supabase"), "theme component source must never reference supabase");
        assert(!/from ["']@\/lib\/domain/.test(source), "theme component source must never import a financial domain module");
      }
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
  console.error("Home suite crashed:", err);
  process.exitCode = 1;
});
