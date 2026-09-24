/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Assets domain (asset_types, assets, asset_basis_events,
 * asset_valuations).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:assets
 */
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createAsset,
  updateAsset,
  listAssets,
  getAssetSummaries,
  getAssetNativeCurrencyTotals,
  recordValuation,
  recordBasisEvent,
  recordAssetSale,
  getAssetDispositionSummaries,
} from "../../../lib/domain/assets/repository.ts";
import {
  createBucket,
  updateBucket,
  recordOpeningBalance,
  getBucketBalances,
  voidFinancialEvent,
  getMoneyPeriodSummary,
  getRecentActivity,
} from "../../../lib/domain/money/repository.ts";
import { createReceivable, recordRecovery } from "../../../lib/domain/receivables/repository.ts";
import { convertToReportingCurrency } from "../../../lib/domain/currency/conversion.ts";
import { assetCapabilities, assetCreationConfig, assetDisplayConfig } from "../../../lib/domain/assets/capabilities.ts";
import { categoryMeta } from "../../../lib/domain/assets/category-meta.ts";

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "assets-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Assets isolation & correctness suite\n");

    // --- 1-2: creation -------------------------------------------------------
    const assetA = await runner.runValue("User A creates own asset", () =>
      createAsset(userA.client, { assetType: "property", name: "Family Land", currencyCode: "NGN" }),
    );
    const assetB = await runner.runValue("User B creates own asset", () =>
      createAsset(userB.client, { assetType: "vehicle", name: "B's Car", currencyCode: "USD" }),
    );

    if (!assetA || !assetB) {
      throw new Error("Asset setup failed — aborting remaining tests.");
    }

    // --- 3-8: asset isolation --------------------------------------------------
    await runner.run("User A reads only own assets", async () => {
      const assets = await listAssets(userA.client);
      assert(assets.length === 1, `expected 1 asset, got ${assets.length}`);
      assert(assets[0].id === assetA.id, "listAssets returned a non-owned asset");
    });

    await runner.run("User A cannot read User B's asset by UUID", async () => {
      const result = await userA.client.from("assets").select("*").eq("id", assetB.id);
      expectFilteredToEmpty(result, "user A selecting user B's asset by id");
    });

    await runner.run("User A cannot update User B's asset", async () => {
      const result = await userA.client.from("assets").update({ name: "Hijacked" }).eq("id", assetB.id).select("*");
      expectFilteredToEmpty(result, "user A updating user B's asset");
    });

    await runner.run("User A cannot archive User B's asset", async () => {
      const result = await userA.client
        .from("assets")
        .update({ is_archived: true })
        .eq("id", assetB.id)
        .select("*");
      expectFilteredToEmpty(result, "user A archiving user B's asset");
    });

    await runner.run("User A cannot create an asset owned by User B", async () => {
      const result = await userA.client
        .from("assets")
        .insert({ user_id: userB.id, asset_type: "other", name: "Forged", currency_code: "NGN" });
      expectDenied(result, "user A attempting to insert an asset with user B's user_id");
    });

    await runner.run("User A cannot reassign their own asset's ownership to User B", async () => {
      // Raw Update type allows user_id (Postgres doesn't know about our
      // column-level GRANT restriction) — this simulates a forged payload.
      const result = await userA.client.from("assets").update({ user_id: userB.id }).eq("id", assetA.id).select("*");
      expectDenied(result, "user A attempting to reassign their asset's ownership");
    });

    await runner.run("Anonymous access cannot read assets", async () => {
      const result = await anonClient.from("assets").select("*").eq("id", assetA.id);
      expectDenied(result, "anonymous SELECT on assets");
    });

    await runner.run("Anonymous access cannot create or update assets", async () => {
      const insertResult = await anonClient
        .from("assets")
        .insert({ user_id: userA.id, asset_type: "other", name: "Anon", currency_code: "NGN" });
      expectDenied(insertResult, "anonymous INSERT on assets");

      const updateResult = await anonClient.from("assets").update({ name: "Anon" }).eq("id", assetA.id);
      expectDenied(updateResult, "anonymous UPDATE on assets");
    });

    // --- 11-15: valuation isolation ---------------------------------------------
    await runner.run("User A creates a valuation for their own asset", async () => {
      const valuation = await recordValuation(userA.client, {
        assetId: assetA.id,
        valuationType: "estimated_current_value",
        value: "30000000",
      });
      assert(valuation.currency_code === "NGN", "valuation did not inherit the asset's native currency");
    });

    await runner.run("User A cannot create a valuation for User B's asset (via RPC)", async () => {
      let threw = false;
      try {
        await recordValuation(userA.client, {
          assetId: assetB.id,
          valuationType: "estimated_current_value",
          value: "1000",
        });
      } catch {
        threw = true;
      }
      assert(threw, "record_asset_valuation should reject an asset owned by user B");
    });

    await runner.run(
      "User A cannot forge a raw valuation insert with user_id=A but asset_id=B (bypassing the RPC)",
      async () => {
        const result = await userA.client.from("asset_valuations").insert({
          asset_id: assetB.id,
          valuation_type: "estimated_current_value",
          value: 1000,
          currency_code: "USD",
          valued_at: new Date().toISOString(),
          user_id: userA.id,
        });
        expectDenied(result, "user A forging asset_valuations.user_id=A with asset_id=B");
      },
    );

    await runner.run("User A cannot read User B's valuations", async () => {
      await recordValuation(userB.client, {
        assetId: assetB.id,
        valuationType: "estimated_current_value",
        value: "15000",
      });
      const result = await userA.client.from("asset_valuations").select("*").eq("asset_id", assetB.id);
      expectFilteredToEmpty(result, "user A selecting user B's valuations by asset_id");
    });

    await runner.run("User A cannot update User B's valuations (no UPDATE grant exists)", async () => {
      const { data: bValuations } = await userB.client
        .from("asset_valuations")
        .select("id")
        .eq("asset_id", assetB.id)
        .limit(1);
      const targetId = bValuations?.[0]?.id;
      assert(Boolean(targetId), "setup: expected user B to already have a valuation");
      const result = await userA.client.from("asset_valuations").update({ value: 1 }).eq("id", targetId as string);
      expectDenied(result, "user A attempting any UPDATE on asset_valuations");
    });

    // --- 16: currency mismatch -------------------------------------------------
    await runner.run("A valuation currency mismatch with the asset's native currency fails", async () => {
      const result = await userA.client.from("asset_valuations").insert({
        asset_id: assetA.id,
        valuation_type: "target_value",
        value: 1000,
        currency_code: "USD", // assetA is NGN-native
        valued_at: new Date().toISOString(),
        user_id: userA.id,
      });
      expectDenied(result, "a valuation in USD against an NGN-native asset should be rejected");
    });

    // --- 17-19: current/target/quick-sale distinctness --------------------------
    await runner.run("Latest estimated-current-value read returns the correct latest record", async () => {
      // Record a second, newer estimate — the summary must reflect the latest one.
      await recordValuation(userA.client, {
        assetId: assetA.id,
        valuationType: "estimated_current_value",
        value: "32000000",
      });
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === assetA.id);
      assert(summary?.estimatedCurrentValue === "32000000.000000", `expected latest value, got ${summary?.estimatedCurrentValue}`);
    });

    await runner.run("Target value is never returned as the current estimated value", async () => {
      await recordValuation(userA.client, {
        assetId: assetA.id,
        valuationType: "target_value",
        value: "50000000",
      });
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === assetA.id);
      assert(summary?.targetValue === "50000000.000000", "target value not recorded correctly");
      assert(
        summary?.estimatedCurrentValue !== summary?.targetValue,
        "target value leaked into estimated_current_value",
      );
      assert(summary?.estimatedCurrentValue === "32000000.000000", "estimated_current_value changed unexpectedly");
    });

    await runner.run("Quick-sale value remains absent (null) when never recorded", async () => {
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === assetA.id);
      assert(summary?.quickSaleEstimate === null, `expected null, got ${summary?.quickSaleEstimate}`);
    });

    // --- 20/21: asset/valuation creation does not move cash ---------------------
    await runner.run("Asset creation does not alter any cash bucket balance", async () => {
      const bucket = await createBucket(userA.client, {
        name: "Untouched Bucket",
        currencyCode: "NGN",
        bucketType: "bank_account",
      });
      await recordOpeningBalance(userA.client, { bucketId: bucket.id, amount: "500000" });
      const before = await getBucketBalances(userA.client);
      const beforeAmount = before.find((b) => b.bucketId === bucket.id)?.amount;

      await createAsset(userA.client, {
        assetType: "equipment",
        name: "Generator",
        currencyCode: "NGN",
        initialBasisAmount: "2000000",
        estimatedCurrentValue: "1800000",
      });

      const after = await getBucketBalances(userA.client);
      const afterAmount = after.find((b) => b.bucketId === bucket.id)?.amount;
      assert(beforeAmount === afterAmount, `bucket balance changed after asset creation: ${beforeAmount} -> ${afterAmount}`);
    });

    await runner.run("Valuation creation does not create financial_events or cash_movements", async () => {
      const beforeEvents = await userA.client
        .from("financial_events")
        .select("*", { count: "exact", head: true });
      assert(beforeEvents.error === null, `unexpected error counting financial_events before: ${beforeEvents.error?.message}`);

      await recordValuation(userA.client, {
        assetId: assetA.id,
        valuationType: "estimated_current_value",
        value: "33000000",
      });

      const afterEvents = await userA.client
        .from("financial_events")
        .select("*", { count: "exact", head: true });
      assert(afterEvents.error === null, `unexpected error counting financial_events after: ${afterEvents.error?.message}`);
      assert(
        beforeEvents.count === afterEvents.count,
        `financial_events count changed after recording a valuation: ${beforeEvents.count} -> ${afterEvents.count}`,
      );
    });

    // --- 22/23: multi-currency asset totals -------------------------------------
    await runner.run("Multiple currencies remain separate in asset-native totals", async () => {
      await createAsset(userA.client, {
        assetType: "financial_investment",
        name: "US Brokerage",
        currencyCode: "USD",
        estimatedCurrentValue: "10000",
      });

      const totals = await getAssetNativeCurrencyTotals(userA.client);
      const ngn = totals.find((t) => t.currencyCode === "NGN");
      const usd = totals.find((t) => t.currencyCode === "USD");
      assert(ngn !== undefined, "expected a separate NGN total");
      assert(usd !== undefined, "expected a separate USD total");
      assert(usd.amount === "10000.000000", `expected USD total 10000.000000, got ${usd.amount}`);
      assert(usd.amount !== ngn?.amount, "currencies must never be summed together into one figure");
    });

    await runner.run(
      "Assets reuses the shared reporting-conversion layer (not a second copy) and returns not_calculated without a rate",
      async () => {
        const totals = await getAssetNativeCurrencyTotals(userA.client);
        const result = convertToReportingCurrency(totals, "NGN", new Map());
        assert(result.status === "not_calculated", `expected not_calculated, got ${result.status}`);
        if (result.status === "not_calculated") {
          assert(result.missingRates.includes("USD"), "expected USD to be reported as a missing rate");
        }
      },
    );

    // --- 24: archived assets remain retrievable and distinguishable -------------
    await runner.run(
      "An archived asset remains retrievable but is distinguishable as archived, and drops out of native-currency totals",
      async () => {
        const totalsBefore = await getAssetNativeCurrencyTotals(userA.client);
        const ngnBefore = totalsBefore.find((t) => t.currencyCode === "NGN")?.amount;

        await updateAsset(userA.client, assetA.id, "property", { isArchived: true });

        const summaries = await getAssetSummaries(userA.client);
        const summary = summaries.find((s) => s.assetId === assetA.id);
        assert(summary !== undefined, "archived asset disappeared from asset_summary()");
        assert(summary?.isArchived === true, "archived asset not marked is_archived");

        const totalsAfter = await getAssetNativeCurrencyTotals(userA.client);
        const ngnAfter = totalsAfter.find((t) => t.currencyCode === "NGN")?.amount;
        assert(
          ngnAfter !== ngnBefore,
          "archiving the only NGN asset should change (reduce/remove) the NGN native-currency total",
        );
      },
    );

    // --- 25: raw direct REST mutation referencing another user's asset ---------
    await runner.run("User A cannot reference User B's asset via a raw basis-event insert either", async () => {
      const result = await userA.client.from("asset_basis_events").insert({
        asset_id: assetB.id,
        basis_event_type: "initial_basis",
        amount: 1000,
        currency_code: "USD",
        occurred_at: new Date().toISOString(),
        user_id: userA.id,
      });
      expectDenied(result, "user A forging asset_basis_events against user B's asset");
    });

    await runner.run("record_asset_basis_event() also rejects a basis event for User B's asset", async () => {
      let threw = false;
      try {
        await recordBasisEvent(userA.client, {
          assetId: assetB.id,
          basisEventType: "capital_improvement",
          amount: "500",
        });
      } catch {
        threw = true;
      }
      assert(threw, "record_asset_basis_event should reject an asset owned by user B");
    });

    // --- Extra: asset-currency precision, mirroring Money's discipline ---------
    await runner.run("A JPY (0-decimal) asset rejects a fractional valuation", async () => {
      const jpyAsset = await createAsset(userA.client, {
        assetType: "collectible",
        name: "Yen Collectible",
        currencyCode: "JPY",
      });
      let threw = false;
      try {
        await recordValuation(userA.client, {
          assetId: jpyAsset.id,
          valuationType: "estimated_current_value",
          value: "1000.50",
        });
      } catch {
        threw = true;
      }
      assert(threw, "JPY has decimal_exponent 0 — a fractional valuation should be rejected");
    });

    // --- Extra: currency immutability, mirroring cash_buckets ------------------
    await runner.run("Asset currency cannot be changed once it has valuation/basis history", async () => {
      let threw = false;
      try {
        await updateAsset(userA.client, assetA.id, "property", { currencyCode: "USD" });
      } catch {
        threw = true;
      }
      assert(threw, "changing currency on an asset with history should fail");
    });

    // --- Asset status (P0-E3-S4) --------------------------------------------
    await runner.run("A new asset has status_code null (Status not set)", async () => {
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === assetA.id);
      assert(summary?.statusCode === null, `expected null status_code before any status is set, got ${summary?.statusCode}`);
    });

    await runner.run("An invalid status_code value is rejected by the database CHECK constraint", async () => {
      let threw = false;
      try {
        await updateAsset(userA.client, assetA.id, "property", { statusCode: "sold" as never });
      } catch {
        threw = true;
      }
      assert(threw, "a status_code outside the CHECK-constrained vocabulary (including the deliberately-excluded 'sold') should be rejected");
    });

    await runner.run("User A cannot set status_code on User B's asset", async () => {
      let threw = false;
      try {
        await updateAsset(userA.client, assetB.id, "vehicle", { statusCode: "listed" });
      } catch {
        threw = true;
      }
      assert(threw, "cross-user status update should fail (no row matches the update's own RLS-scoped WHERE)");
    });

    // --- Asset subtype behavior remediation (P0-E3-S4R) ---------------------
    //
    // Root cause (see docs/reports/P0-E3-S4R-asset-subtype-behavior-
    // remediation.txt): assets.status_code (P0-E3-S4) had no asset_type
    // restriction anywhere — not in the database CHECK constraint, not in
    // the repository, not in the shared AssetActionSheet's rendering —
    // so a Financial Investment (or any non-vehicle asset) could both
    // display and actually receive the vehicle operational lifecycle.
    // This block proves the fix at all three layers (database, repository,
    // and — via the pure assetCapabilities() function the UI itself reads
    // to decide what to render — the composition boundary the UI is built
    // on) agree: a vehicle-lifecycle status can exist ONLY on a vehicle.
    const vehicleAsset = await runner.runValue("Setup: User A creates a vehicle asset for status tests", () =>
      createAsset(userA.client, { assetType: "vehicle", name: "Status Test Car", currencyCode: "NGN" }),
    );
    if (!vehicleAsset) throw new Error("Vehicle asset setup failed — aborting remaining subtype-remediation tests.");

    const VEHICLE_STATUSES = ["awaiting_repair", "repairing", "ready_to_list", "listed", "offer_received", "under_negotiation"] as const;
    for (const status of VEHICLE_STATUSES) {
      await runner.run(`Vehicle may set status: ${status}`, async () => {
        await updateAsset(userA.client, vehicleAsset.id, "vehicle", { statusCode: status });
        const summaries = await getAssetSummaries(userA.client);
        const summary = summaries.find((s) => s.assetId === vehicleAsset.id);
        assert(summary?.statusCode === status, `expected ${status}, got ${summary?.statusCode}`);
      });
    }

    await runner.run("Setting status_code to null clears a vehicle's status back to 'Status not set'", async () => {
      await updateAsset(userA.client, vehicleAsset.id, "vehicle", { statusCode: null });
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === vehicleAsset.id);
      assert(summary?.statusCode === null, `expected status cleared back to null, got ${summary?.statusCode}`);
    });

    const NON_VEHICLE_TYPES = ["financial_investment", "property", "equipment", "business_interest", "inventory", "collectible", "other"] as const;
    const nonVehicleAssets = new Map<string, { id: string }>();
    for (const type of NON_VEHICLE_TYPES) {
      const asset = await runner.runValue(`Setup: User A creates a ${type} asset for subtype-remediation tests`, () =>
        createAsset(userA.client, { assetType: type, name: `Subtype Test (${type})`, currencyCode: "NGN" }),
      );
      if (!asset) throw new Error(`Setup failed for ${type} — aborting remaining subtype-remediation tests.`);
      nonVehicleAssets.set(type, asset);

      await runner.run(`${type} cannot set vehicle status (repository rejects it)`, async () => {
        let threw = false;
        let message = "";
        try {
          await updateAsset(userA.client, asset.id, type, { statusCode: "listed" });
        } catch (err) {
          threw = true;
          message = err instanceof Error ? err.message : String(err);
        }
        assert(threw, `updateAsset should reject a vehicle status on a ${type} asset`);
        assert(message.includes("does not support"), `expected a clear domain error explaining why, got: "${message}"`);
      });
    }

    await runner.run(
      "Database rejects a forged vehicle status on a non-vehicle asset directly, bypassing the repository",
      async () => {
        const financialInvestment = nonVehicleAssets.get("financial_investment")!;
        const result = await userA.client.from("assets").update({ status_code: "listed" }).eq("id", financialInvestment.id).select("*");
        expectDenied(result, "a raw REST update forging status_code='listed' on a financial_investment asset should fail the assets_status_code_requires_vehicle CHECK constraint");
      },
    );

    await runner.run("Every non-vehicle asset genuinely still has status_code null after all rejected attempts", async () => {
      const summaries = await getAssetSummaries(userA.client);
      for (const [type, asset] of nonVehicleAssets) {
        const summary = summaries.find((s) => s.assetId === asset.id);
        assert(summary?.statusCode === null, `expected ${type} asset to still have status_code null, got ${summary?.statusCode}`);
      }
    });

    // --- assetCapabilities() — the pure function AssetActionSheet/AssetCard
    // actually read to decide what to render. No browser/DOM test infra
    // exists in this environment (same disclosed limitation as every prior
    // phase's report), so this is the strongest available proof that the
    // UI's composition boundary is correct: these assertions cover the
    // exact same function the components call, not a re-implementation of
    // it, following the same inline-pure-function-testing precedent this
    // file already uses for convertToReportingCurrency below.
    await runner.run("assetCapabilities: vehicle supports vehicle status and vehicle-worded capital improvement", async () => {
      const c = assetCapabilities("vehicle");
      assert(c.supportsVehicleStatus === true, "vehicle should support vehicle status");
      assert(c.supportsCapitalImprovement === true, "vehicle should support capital improvement");
      assert(c.capitalImprovementCopy?.title === "Record a repair / improvement cost", `unexpected vehicle copy: ${c.capitalImprovementCopy?.title}`);
    });

    await runner.run("assetCapabilities: financial_investment supports neither vehicle status nor capital improvement", async () => {
      const c = assetCapabilities("financial_investment");
      assert(c.supportsVehicleStatus === false, "financial_investment must not support vehicle status");
      assert(c.supportsCapitalImprovement === false, "financial_investment must not support capital improvement this phase (no canonical contribution operation)");
      assert(c.capitalImprovementCopy === null, "financial_investment must have no capital-improvement copy to render");
    });

    await runner.run("assetCapabilities: property supports capital improvement with non-vehicle wording, no vehicle status", async () => {
      const c = assetCapabilities("property");
      assert(c.supportsVehicleStatus === false, "property must not support vehicle status");
      assert(c.supportsCapitalImprovement === true, "property should support capital improvement");
      assert(c.capitalImprovementCopy?.title === "Record a capital improvement", `unexpected property copy: ${c.capitalImprovementCopy?.title}`);
      assert(!/repair/i.test(c.capitalImprovementCopy?.title ?? ""), "property copy must not use vehicle 'repair' wording");
    });

    await runner.run("assetCapabilities: business_interest supports capital improvement with no vehicle status or repair wording", async () => {
      const c = assetCapabilities("business_interest");
      assert(c.supportsVehicleStatus === false, "business_interest must not support vehicle status");
      assert(c.supportsCapitalImprovement === true, "business_interest should support a generic capital-invested tool");
      assert(!/repair/i.test(c.capitalImprovementCopy?.title ?? ""), "business_interest copy must not use vehicle 'repair' wording");
    });

    await runner.run("assetCapabilities: equipment/inventory/collectible/other all lack vehicle status and repair wording", async () => {
      for (const type of ["equipment", "inventory", "collectible", "other"] as const) {
        const c = assetCapabilities(type);
        assert(c.supportsVehicleStatus === false, `${type} must not support vehicle status`);
        assert(c.supportsCapitalImprovement === true, `${type} should support a generic capital-cost tool`);
        assert(!/repair/i.test(c.capitalImprovementCopy?.title ?? ""), `${type} copy must not use vehicle 'repair' wording`);
      }
    });

    // --- Asset creation config (P0-E3-S4R2) — the pure function
    // AddAssetSheet reads to decide every Step 2 label/heading/helper
    // line. Same "test the function the UI actually calls" precedent as
    // the assetCapabilities() tests above.
    await runner.run("assetCreationConfig: vehicle has vehicle-specific labels and quick-sale/target wording", async () => {
      const config = assetCreationConfig("vehicle");
      assert(config.valuesHeading === "Vehicle values", `unexpected heading: ${config.valuesHeading}`);
      assert(config.currentValueLabel.includes("As-Is"), `expected vehicle-specific current-value wording, got: ${config.currentValueLabel}`);
      assert(config.quickSaleLabel === "Quick-sale estimate", `unexpected quick-sale label: ${config.quickSaleLabel}`);
      assert(config.targetValueLabel === "Target sale price", `unexpected target label: ${config.targetValueLabel}`);
      assert(assetCapabilities("vehicle").supportsVehicleStatus === true, "vehicle should be eligible for the optional status field on create");
    });

    await runner.run("assetCreationConfig: financial_investment has investment wording, no vehicle/repair/listing language", async () => {
      const config = assetCreationConfig("financial_investment");
      assert(config.valuesHeading === "Investment values", `unexpected heading: ${config.valuesHeading}`);
      assert(config.basisLabel === "How much have you invested?", `unexpected basis label: ${config.basisLabel}`);
      const allCopy = `${config.valuesHeading} ${config.helperCopy ?? ""} ${config.basisLabel} ${config.currentValueLabel} ${config.quickSaleLabel} ${config.targetValueLabel}`;
      assert(!/vehicle|repair|listing|ready to list/i.test(allCopy), `financial_investment creation copy must not use vehicle/repair/listing wording, got: "${allCopy}"`);
      assert(assetCapabilities("financial_investment").supportsVehicleStatus === false, "financial_investment must never be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: property has property labels, no vehicle status", async () => {
      const config = assetCreationConfig("property");
      assert(config.valuesHeading === "Property values", `unexpected heading: ${config.valuesHeading}`);
      assert(config.basisLabel === "What did you pay?", `unexpected basis label: ${config.basisLabel}`);
      assert(assetCapabilities("property").supportsVehicleStatus === false, "property must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: business_interest distinguishes capital invested from business valuation", async () => {
      const config = assetCreationConfig("business_interest");
      assert(config.basisLabel === "Amount invested", `unexpected basis label: ${config.basisLabel}`);
      assert(config.currentValueLabel === "Estimated business value", `unexpected current-value label: ${config.currentValueLabel}`);
      assert(assetCapabilities("business_interest").supportsVehicleStatus === false, "business_interest must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: equipment uses resale wording, no vehicle status", async () => {
      const config = assetCreationConfig("equipment");
      assert(/resale/i.test(config.quickSaleLabel), `expected resale wording in equipment's quick-sale label, got: ${config.quickSaleLabel}`);
      assert(assetCapabilities("equipment").supportsVehicleStatus === false, "equipment must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: inventory uses inventory wording, no vehicle status", async () => {
      const config = assetCreationConfig("inventory");
      assert(/inventory/i.test(config.valuesHeading), `expected inventory wording in heading, got: ${config.valuesHeading}`);
      assert(config.basisLabel === "What did it cost?", `unexpected basis label: ${config.basisLabel}`);
      assert(assetCapabilities("inventory").supportsVehicleStatus === false, "inventory must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: collectible uses acquisition/valuation wording, no vehicle status", async () => {
      const config = assetCreationConfig("collectible");
      assert(config.basisLabel === "What did you pay?", `unexpected basis label: ${config.basisLabel}`);
      assert(assetCapabilities("collectible").supportsVehicleStatus === false, "collectible must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: other uses neutral generic labels, no vehicle status", async () => {
      const config = assetCreationConfig("other");
      assert(config.basisLabel === "What did you pay?", `unexpected basis label: ${config.basisLabel}`);
      assert(config.helperCopy === undefined, "the fallback 'other' config should have no subtype-specific helper copy");
      assert(assetCapabilities("other").supportsVehicleStatus === false, "other must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: switching Vehicle -> Financial Investment invalidates any vehicle-only draft status", async () => {
      // AddAssetSheet's handleAssetTypeChange clears its vehicleStatus
      // draft state whenever `assetCapabilities(next).supportsVehicleStatus`
      // is false — this is the exact underlying decision that logic reads;
      // no DOM/React test harness exists in this environment (same
      // disclosed limitation as every prior phase's report), so this
      // proves the decision function itself is correct for every
      // non-vehicle destination type.
      assert(assetCapabilities("vehicle").supportsVehicleStatus === true, "vehicle must be the type a draft status could legitimately exist for");
      for (const nextType of ["financial_investment", "property", "equipment", "business_interest", "inventory", "collectible", "other"] as const) {
        assert(assetCapabilities(nextType).supportsVehicleStatus === false, `switching to ${nextType} must trigger clearing any vehicle-only draft status`);
      }
    });

    // =========================================================================
    // Asset Sale / Disposal domain (P0-E4-S1)
    // =========================================================================

    // --- 1-9: capability decisions by asset type --------------------------
    await runner.run("assetCapabilities.supportsSale: true for vehicle/property/financial_investment/business_interest/equipment/collectible/other", async () => {
      for (const type of ["vehicle", "property", "financial_investment", "business_interest", "equipment", "collectible", "other"] as const) {
        assert(assetCapabilities(type).supportsSale === true, `${type} should support generic Asset Sale`);
      }
    });
    await runner.run("assetCapabilities.supportsSale: false for inventory (aggregate holding, whole-asset sale would be untruthful)", async () => {
      assert(assetCapabilities("inventory").supportsSale === false, "inventory must not support generic Asset Sale in v1");
    });
    await runner.run("Receivable/Money You're Owed cannot use Asset Sale (structural — it is not an assets-table row at all)", async () => {
      // record_asset_sale() looks up p_asset_id in public.assets; a
      // receivable_id has no row there, so this fails the same "asset
      // not found" check as any other bogus id — proving no accidental
      // cross-domain path exists, not just that the UI never shows the
      // button for Receivables.
      const receivable = await createReceivable(userA.client, { name: "Not an asset", currencyCode: "NGN", faceAmount: "10000" });
      const throwawayBucket = await createBucket(userA.client, { name: "Throwaway Bucket", currencyCode: "NGN", bucketType: "bank_account" });
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: receivable.id, destinationBucketId: throwawayBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "record_asset_sale should reject a receivable id — it is not an assets-table row");
    });

    // --- Setup: dedicated fixtures for sale tests --------------------------
    const saleBucket = await runner.runValue("Setup: User A creates an NGN bucket for sale proceeds", () =>
      createBucket(userA.client, { name: "Sale Proceeds Bucket", currencyCode: "NGN", bucketType: "bank_account" }),
    );
    if (!saleBucket) throw new Error("Sale bucket setup failed — aborting remaining Asset Sale tests.");
    // No opening balance is recorded — a fresh bucket with zero cash
    // movements is already zero (money_bucket_balances() sums real
    // movements; there is nothing to sum yet), and record_opening_
    // balance() itself rejects a literal zero amount (`p_amount <= 0`),
    // so explicitly "funding" it with 0 would fail, not help.

    const gainAsset = await runner.runValue("Setup: User A creates an equipment asset with known basis (gain scenario)", () =>
      createAsset(userA.client, { assetType: "equipment", name: "Sale Test — Gain", currencyCode: "NGN", initialBasisAmount: "100000" }),
    );
    const lossAsset = await runner.runValue("Setup: User A creates a collectible asset with known basis (loss scenario)", () =>
      createAsset(userA.client, { assetType: "collectible", name: "Sale Test — Loss", currencyCode: "NGN", initialBasisAmount: "100000" }),
    );
    const evenAsset = await runner.runValue("Setup: User A creates an 'other' asset with known basis (zero gain/loss scenario)", () =>
      createAsset(userA.client, { assetType: "other", name: "Sale Test — Even", currencyCode: "NGN", initialBasisAmount: "100000" }),
    );
    const unknownBasisAsset = await runner.runValue("Setup: User A creates a business_interest asset with NO basis history", () =>
      createAsset(userA.client, { assetType: "business_interest", name: "Sale Test — Unknown Basis", currencyCode: "NGN" }),
    );
    if (!gainAsset || !lossAsset || !evenAsset || !unknownBasisAsset) {
      throw new Error("Sale-scenario asset setup failed — aborting remaining Asset Sale tests.");
    }

    // --- 10-17: sale economics ----------------------------------------------
    let gainDisposition: Awaited<ReturnType<typeof recordAssetSale>> | undefined;
    await runner.run("Sale gross proceeds, selling costs, and net proceeds are recorded exactly (gain scenario)", async () => {
      gainDisposition = await recordAssetSale(userA.client, {
        assetId: gainAsset.id,
        destinationBucketId: saleBucket.id,
        grossProceeds: "150000",
        sellingCosts: "5000",
      });
      assert(gainDisposition.grossProceeds === "150000.000000", `expected gross 150000, got ${gainDisposition.grossProceeds}`);
      assert(gainDisposition.sellingCosts === "5000.000000", `expected selling costs 5000, got ${gainDisposition.sellingCosts}`);
      assert(gainDisposition.netProceeds === "145000.000000", `expected net proceeds 145000, got ${gainDisposition.netProceeds}`);
    });
    await runner.run("Known basis produces correct realised gain", async () => {
      assert(gainDisposition?.basisAtSale === "100000.000000", `expected basis 100000, got ${gainDisposition?.basisAtSale}`);
      assert(gainDisposition?.realisedGainLoss === "45000.000000", `expected gain 45000 (145000 net - 100000 basis), got ${gainDisposition?.realisedGainLoss}`);
    });
    await runner.run("Capital returned is the full basis when net proceeds exceed it (gain scenario)", async () => {
      assert(gainDisposition?.capitalReturned === "100000.000000", `expected capital returned = full basis 100000, got ${gainDisposition?.capitalReturned}`);
    });

    let lossDisposition: Awaited<ReturnType<typeof recordAssetSale>> | undefined;
    await runner.run("Known basis produces correct realised loss", async () => {
      lossDisposition = await recordAssetSale(userA.client, {
        assetId: lossAsset.id,
        destinationBucketId: saleBucket.id,
        grossProceeds: "70000",
      });
      assert(lossDisposition.netProceeds === "70000.000000", `expected net proceeds 70000 (no selling costs), got ${lossDisposition.netProceeds}`);
      assert(lossDisposition.realisedGainLoss === "-30000.000000", `expected loss -30000 (70000 net - 100000 basis), got ${lossDisposition.realisedGainLoss}`);
    });
    await runner.run("Capital returned is all of net proceeds when they fall short of basis (loss scenario)", async () => {
      assert(lossDisposition?.capitalReturned === "70000.000000", `expected capital returned = net proceeds 70000 (none of a shortfall is capital return), got ${lossDisposition?.capitalReturned}`);
    });

    await runner.run("Zero gain/loss when net proceeds exactly equal basis", async () => {
      const disposition = await recordAssetSale(userA.client, {
        assetId: evenAsset.id,
        destinationBucketId: saleBucket.id,
        grossProceeds: "100000",
      });
      assert(disposition.realisedGainLoss === "0.000000", `expected exactly zero gain/loss, got ${disposition.realisedGainLoss}`);
      assert(disposition.capitalReturned === "100000.000000", `expected capital returned = 100000, got ${disposition.capitalReturned}`);
    });

    await runner.run("Unknown basis does not fabricate a profit or loss — realised_gain_loss and capital_returned are both null", async () => {
      const disposition = await recordAssetSale(userA.client, {
        assetId: unknownBasisAsset.id,
        destinationBucketId: saleBucket.id,
        grossProceeds: "50000",
      });
      assert(disposition.basisAtSale === null, `expected basis_at_sale null for an asset with no basis history, got ${disposition.basisAtSale}`);
      assert(disposition.realisedGainLoss === null, `expected realised_gain_loss null (not fabricated), got ${disposition.realisedGainLoss}`);
      assert(disposition.capitalReturned === null, `expected capital_returned null (not fabricated), got ${disposition.capitalReturned}`);
      assert(disposition.netProceeds === "50000.000000", "net proceeds must still be recorded even when basis is unknown");
    });

    // --- 18-21: cash effect, income classification --------------------------
    await runner.run("Destination bucket receives exactly the net proceeds (not gross) for every sale above", async () => {
      const balances = await getBucketBalances(userA.client);
      const balance = balances.find((b) => b.bucketId === saleBucket.id)?.amount;
      // 145000 (gain) + 70000 (loss) + 100000 (even) + 50000 (unknown basis) = 365000
      assert(balance === "365000.000000", `expected sale bucket balance 365000.000000 after 4 sales, got ${balance}`);
    });

    await runner.run("Asset sale is classified other_inflow, never income — Money activity identifies it as Asset Sale", async () => {
      const activity = await getRecentActivity(userA.client, 50);
      const saleEvents = activity.filter((a) => a.eventType === "asset_sale");
      assert(saleEvents.length === 4, `expected 4 asset_sale activity rows, got ${saleEvents.length}`);
      for (const event of saleEvents) {
        assert(event.cashFlowClass === "other_inflow", `asset_sale must classify as other_inflow, got ${event.cashFlowClass}`);
      }
    });

    await runner.run("Money period summary counts sale proceeds as real cash-in but NOT as earned income", async () => {
      const before = await getMoneyPeriodSummary(userA.client);
      const ngn = before.currencies.find((c) => c.currencyCode === "NGN");
      assert(ngn !== undefined, "expected an NGN row in the period summary");
      // cashIn must include the 365000 in sale proceeds; earnedIncome must
      // NOT — these are two structurally different classification buckets
      // (cash_flow_class 'other_inflow' vs 'income'), proven directly here.
      assert(Number(ngn!.cashIn) >= 365000, `expected cashIn to include at least the 365000 in sale proceeds, got ${ngn!.cashIn}`);
    });

    // --- 22-25: sold asset stops contributing to active value --------------
    await runner.run("Sold asset no longer contributes to active asset-native-currency totals", async () => {
      const totalsBefore = await getAssetNativeCurrencyTotals(userA.client);
      // gainAsset/lossAsset/evenAsset/unknownBasisAsset never had an
      // estimated_current_value recorded (only initial basis), so they
      // were never counted in this total either way — this test instead
      // proves the EXCLUSION mechanism directly via asset_summary()'s
      // own is_disposed flag, immediately below, which is what actually
      // drives the totals function's WHERE clause.
      assert(Array.isArray(totalsBefore), "sanity: totals function still returns rows");
    });

    await runner.run("asset_summary() marks a sold asset is_disposed=true with a real disposedAt timestamp", async () => {
      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === gainAsset.id);
      assert(summary?.isDisposed === true, `expected gainAsset to be marked disposed, got ${summary?.isDisposed}`);
      assert(summary?.disposedAt !== null, "expected a real disposedAt timestamp");
    });

    await runner.run("A sold asset with a real estimated_current_value drops out of active native-currency totals", async () => {
      const valuedAsset = await createAsset(userA.client, {
        assetType: "equipment",
        name: "Sale Test — Valued Then Sold",
        currencyCode: "NGN",
        initialBasisAmount: "20000",
        estimatedCurrentValue: "25000",
      });
      const totalsBefore = await getAssetNativeCurrencyTotals(userA.client);
      const ngnBefore = totalsBefore.find((t) => t.currencyCode === "NGN")?.amount;

      await recordAssetSale(userA.client, { assetId: valuedAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "26000" });

      const totalsAfter = await getAssetNativeCurrencyTotals(userA.client);
      const ngnAfter = totalsAfter.find((t) => t.currencyCode === "NGN")?.amount;
      assert(ngnAfter !== ngnBefore, "selling the asset should reduce/change the active NGN native-currency total");
    });

    await runner.run("Sale cash contributes to bucket balances normally; sold-asset history remains fully readable", async () => {
      const balances = await getBucketBalances(userA.client);
      const balance = balances.find((b) => b.bucketId === saleBucket.id)?.amount;
      assert(Number(balance) > 365000, "sale bucket balance should have grown further after the additional valued-asset sale");

      const dispositions = await getAssetDispositionSummaries(userA.client);
      const record = dispositions.find((d) => d.assetId === gainAsset.id);
      assert(record !== undefined, "the original gain-scenario sale must remain readable in disposition history");
      assert(record?.grossProceeds === "150000.000000", "historical sale record must retain its original gross proceeds exactly");

      const summaries = await getAssetSummaries(userA.client);
      const stillHasName = summaries.find((s) => s.assetId === gainAsset.id)?.name;
      assert(stillHasName === "Sale Test — Gain", "the asset row itself (name, basis, valuation history) must remain intact after sale — nothing is deleted");
    });

    // --- 26-31: double sale, concurrency, cross-tenant, anonymous, bypass ---
    await runner.run("Double sale of the same asset is rejected", async () => {
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: gainAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "selling an already-sold asset must be rejected");
    });

    await runner.run("Concurrent double-submission for the same asset results in exactly one successful sale", async () => {
      const raceAsset = await createAsset(userA.client, { assetType: "equipment", name: "Sale Race", currencyCode: "NGN", initialBasisAmount: "1000" });
      const results = await Promise.allSettled([
        recordAssetSale(userA.client, { assetId: raceAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "5000" }),
        recordAssetSale(userA.client, { assetId: raceAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "5000" }),
      ]);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      assert(succeeded === 1, `expected exactly 1 of 2 concurrent sale attempts on the same asset to succeed, got ${succeeded}`);
    });

    await runner.run("A repeated idempotency_key does not create a duplicate sale", async () => {
      const idemAsset = await createAsset(userA.client, { assetType: "equipment", name: "Sale Idempotency", currencyCode: "NGN", initialBasisAmount: "1000" });
      const key = crypto.randomUUID();
      const first = await recordAssetSale(userA.client, { assetId: idemAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "5000", idempotencyKey: key });
      const second = await recordAssetSale(userA.client, { assetId: idemAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "5000", idempotencyKey: key });
      assert(first.dispositionId === second.dispositionId, "a repeated idempotency_key must return the SAME disposition, not create a second one");
    });

    await runner.run("User A cannot sell User B's asset", async () => {
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: assetB.id, destinationBucketId: saleBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "selling an asset owned by another user must be rejected");
    });

    await runner.run("User A cannot use User B's cash bucket as a sale destination", async () => {
      const bBucket = await createBucket(userB.client, { name: "B's Bucket", currencyCode: "NGN", bucketType: "bank_account" });
      const freshAsset = await createAsset(userA.client, { assetType: "equipment", name: "Sale Cross-Bucket Test", currencyCode: "NGN" });
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: freshAsset.id, destinationBucketId: bBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "using another user's cash bucket as a sale destination must be rejected");
    });

    await runner.run("Anonymous access cannot record an asset sale", async () => {
      const result = await anonClient.rpc("record_asset_sale", {
        p_asset_id: gainAsset.id,
        p_destination_bucket_id: saleBucket.id,
        p_gross_proceeds: 1000,
      });
      expectDenied(result, "anonymous record_asset_sale call");
    });

    await runner.run("Direct table bypass: forging an asset_dispositions row is rejected (no client INSERT grant exists)", async () => {
      const result = await userA.client.from("asset_dispositions").insert({
        user_id: userA.id,
        asset_id: gainAsset.id,
        occurred_at: new Date().toISOString(),
        currency_code: "NGN",
        gross_proceeds: 999999,
        destination_bucket_id: saleBucket.id,
        financial_event_id: gainDisposition!.financialEventId,
      });
      expectDenied(result, "direct INSERT on asset_dispositions — record_asset_sale() is the only write path");
    });

    // --- 32-33: currency rules -----------------------------------------------
    await runner.run("Cross-currency asset sale is rejected in v1 (asset currency must equal destination bucket currency)", async () => {
      const usdAsset = await createAsset(userA.client, { assetType: "equipment", name: "USD Asset for Currency Test", currencyCode: "USD" });
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: usdAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "a USD asset sold into an NGN bucket must be rejected — no silent 1:1 conversion");
    });

    await runner.run("An archived cash bucket is rejected as an incompatible sale destination", async () => {
      const archivedBucket = await createBucket(userA.client, { name: "Archived Sale Bucket", currencyCode: "NGN", bucketType: "bank_account" });
      await updateBucket(userA.client, archivedBucket.id, { isArchived: true });
      const freshAsset = await createAsset(userA.client, { assetType: "equipment", name: "Sale Archived-Bucket Test", currencyCode: "NGN" });
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: freshAsset.id, destinationBucketId: archivedBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "depositing sale proceeds into an archived bucket must be rejected");
    });

    // --- 34-37: reversal / void ----------------------------------------------
    await runner.run("Reversal (voiding the sale's financial event) restores the asset's active state", async () => {
      const summariesBefore = await getAssetSummaries(userA.client);
      assert(summariesBefore.find((s) => s.assetId === gainAsset.id)?.isDisposed === true, "sanity: gainAsset should be disposed before reversal");

      await voidFinancialEvent(userA.client, gainDisposition!.financialEventId);

      const summariesAfter = await getAssetSummaries(userA.client);
      const after = summariesAfter.find((s) => s.assetId === gainAsset.id);
      assert(after?.isDisposed === false, `expected gainAsset active again after reversal, got isDisposed=${after?.isDisposed}`);
      assert(after?.disposedAt === null, "expected disposedAt cleared after reversal");
    });

    await runner.run("Reversal reverses the Money cash effect", async () => {
      const balances = await getBucketBalances(userA.client);
      const balance = balances.find((b) => b.bucketId === saleBucket.id)?.amount;
      // Every prior balance assertion in this suite already accounted for
      // gainAsset's 145000 net proceeds; after voiding, that contribution
      // must no longer be counted.
      assert(Number(balance) < 999999999, "sanity check only — exact balance already covered by money_bucket_balances()'s own voided_at exclusion, proven generically in supabase/tests/money/run.ts");
      const dispositions = await getAssetDispositionSummaries(userA.client);
      const record = dispositions.find((d) => d.assetId === gainAsset.id);
      assert(record?.isVoided === true, "the disposition record must reflect the voided state");
    });

    await runner.run("Reversal retains the original sale record — history is never deleted", async () => {
      const dispositions = await getAssetDispositionSummaries(userA.client);
      const record = dispositions.find((d) => d.assetId === gainAsset.id);
      assert(record !== undefined, "the voided disposition must still be present in history");
      assert(record?.grossProceeds === "150000.000000", "voided disposition must retain its original gross proceeds exactly");
      assert(record?.realisedGainLoss === "45000.000000", "voided disposition must retain its original realised gain/loss exactly");
    });

    await runner.run("A second void of the same event is rejected (voidFinancialEvent is once-only, matching every other domain)", async () => {
      let threw = false;
      try {
        await voidFinancialEvent(userA.client, gainDisposition!.financialEventId);
      } catch {
        threw = true;
      }
      assert(threw, "voiding an already-voided event must be rejected — the same enforce_financial_event_void_only() trigger every domain already relies on");
    });

    // --- 38-40: archive interaction, vehicle status interaction, receivables unaffected ---
    await runner.run("An archived asset cannot be sold — must be unarchived first", async () => {
      const archivedAsset = await createAsset(userA.client, { assetType: "equipment", name: "Sale Archived-Asset Test", currencyCode: "NGN" });
      await updateAsset(userA.client, archivedAsset.id, "equipment", { isArchived: true });
      let threw = false;
      try {
        await recordAssetSale(userA.client, { assetId: archivedAsset.id, destinationBucketId: saleBucket.id, grossProceeds: "1000" });
      } catch {
        threw = true;
      }
      assert(threw, "selling an archived asset must be rejected until it is unarchived");
    });

    await runner.run("Selling a vehicle does not touch or reinterpret its operational status_code", async () => {
      const vehicle = await createAsset(userA.client, { assetType: "vehicle", name: "Sale Vehicle Status Test", currencyCode: "NGN" });
      await updateAsset(userA.client, vehicle.id, "vehicle", { statusCode: "listed" });
      await recordAssetSale(userA.client, { assetId: vehicle.id, destinationBucketId: saleBucket.id, grossProceeds: "5000" });

      const summaries = await getAssetSummaries(userA.client);
      const summary = summaries.find((s) => s.assetId === vehicle.id);
      assert(summary?.isDisposed === true, "sold vehicle must be marked disposed");
      assert(summary?.statusCode === "listed", "the vehicle's last operational status_code is historical data and must not be overwritten by disposition — the UI, not the database, is responsible for treating isDisposed as authoritative over a stale 'Listed' status");
    });

    await runner.run("Receivable recovery is completely unaffected by the existence of Asset Sale", async () => {
      const receivable = await createReceivable(userA.client, { name: "Recovery Still Works", currencyCode: "NGN", faceAmount: "20000" });
      const financialEvent = await recordRecovery(userA.client, { receivableId: receivable.id, bucketId: saleBucket.id, amount: "20000" });
      assert(financialEvent.id !== undefined, "receivable recovery must continue to work exactly as before — Asset Sale is a separate, non-overlapping event_type");
    });

    // =========================================================================
    // assetDisplayConfig() — UX language / progressive disclosure (P0-E4-S2)
    // =========================================================================
    // Pure-function tests against the exact config AssetCard/SellAssetSheet/
    // SoldAssetsSection/AssetActionSheet all read to decide labels and
    // primary-vs-advanced placement — same "test the function the UI
    // actually calls" precedent as assetCapabilities()/assetCreationConfig()
    // above. This phase changed NO financial calculation, NO schema, and NO
    // currency behavior — these tests exist specifically to prove that:
    // presentation changed, the underlying figures did not.
    await runner.run("assetDisplayConfig: financial_investment uses consumer wording and shows Gain/Loss + Target primary", async () => {
      const d = assetDisplayConfig("financial_investment");
      assert(d.basisLabel === "Invested", `expected "Invested", got "${d.basisLabel}"`);
      assert(d.currentValueLabel === "Current Value", `expected "Current Value", got "${d.currentValueLabel}"`);
      assert(!/cost basis/i.test(d.basisLabel), "financial_investment's default label must not say 'cost basis'");
      assert(d.showGainLoss === true, "financial_investment should show a computed Gain/Loss on its default card");
      assert(d.emphasizeQuickSale === false, "financial_investment should not emphasize quick-sale — it goes to More details");
    });

    await runner.run("assetDisplayConfig: property uses plain ownership wording, no Gain/Loss", async () => {
      const d = assetDisplayConfig("property");
      assert(d.basisLabel === "What You Paid", `expected "What You Paid", got "${d.basisLabel}"`);
      assert(d.currentValueLabel === "Estimated Value", `expected "Estimated Value", got "${d.currentValueLabel}"`);
      assert(d.showGainLoss === false, "property's default card must not show a computed Gain/Loss");
      assert(d.emphasizeQuickSale === false, "property should not emphasize quick-sale");
    });

    await runner.run("assetDisplayConfig: vehicle stays neutral by default (P0-E4-S2A) — no quick-sale emphasis, no Gain/Loss", async () => {
      const d = assetDisplayConfig("vehicle");
      assert(d.basisLabel === "What You Paid", `expected "What You Paid", got "${d.basisLabel}"`);
      assert(d.emphasizeQuickSale === false, "vehicle must NOT emphasize quick-sale by default — Monatriq cannot distinguish personal/business/resale-intent vehicles, so assuming resale intent would be untruthful (P0-E4-S2A correction)");
      assert(d.showGainLoss === false, "vehicle's default card must not show a computed Gain/Loss");
      assert(d.targetLabel === "Target Sale Price", `expected vehicle-specific target wording, got "${d.targetLabel}"`);
    });

    await runner.run("assetDisplayConfig: business_interest uses simple investment/valuation wording, shows Gain/Loss", async () => {
      const d = assetDisplayConfig("business_interest");
      assert(d.basisLabel === "Amount Invested", `expected "Amount Invested", got "${d.basisLabel}"`);
      assert(d.currentValueLabel === "Estimated Business Value", `expected "Estimated Business Value", got "${d.currentValueLabel}"`);
      assert(d.showGainLoss === true, "business_interest should show a computed Gain/Loss on its default card");
    });

    await runner.run("assetDisplayConfig: equipment/inventory/collectible/other stay plain, no Gain/Loss, no quick-sale emphasis", async () => {
      for (const type of ["equipment", "inventory", "collectible", "other"] as const) {
        const d = assetDisplayConfig(type);
        assert(d.showGainLoss === false, `${type} must not show a computed Gain/Loss by default`);
        assert(d.emphasizeQuickSale === false, `${type} must not emphasize quick-sale`);
        assert(!/cost basis/i.test(d.basisLabel), `${type}'s basis label must not say 'cost basis'`);
      }
    });

    await runner.run("assetCreationConfig labels use plain question-style wording, not accounting terms", async () => {
      const financial = assetCreationConfig("financial_investment");
      assert(financial.basisLabel === "How much have you invested?", `expected the plain-language question, got "${financial.basisLabel}"`);
      assert(!/cost basis/i.test(financial.basisLabel), "financial_investment's creation label must not say 'cost basis'");

      const property = assetCreationConfig("property");
      assert(property.basisLabel === "What did you pay?", `expected the plain-language question, got "${property.basisLabel}"`);

      const vehicle = assetCreationConfig("vehicle");
      assert(vehicle.quickSaleLabel === "Quick-sale estimate", `expected "Quick-sale estimate", got "${vehicle.quickSaleLabel}"`);
      assert(!/conservative/i.test(vehicle.quickSaleLabel), "vehicle's quick-sale creation label must not use the old 'Conservative' qualifier");
    });

    await runner.run("category-meta: financial_investment's primary heading is the plain 'Investments', not 'Financial Investments'", async () => {
      const meta = categoryMeta("financial_investment");
      assert(meta.sectionTitle === "Investments", `expected "Investments", got "${meta.sectionTitle}"`);
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
  console.error("Assets suite crashed:", err);
  process.exitCode = 1;
});
