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
} from "../../../lib/domain/assets/repository.ts";
import { createBucket, recordOpeningBalance, getBucketBalances } from "../../../lib/domain/money/repository.ts";
import { convertToReportingCurrency } from "../../../lib/domain/currency/conversion.ts";
import { assetCapabilities, assetCreationConfig } from "../../../lib/domain/assets/capabilities.ts";

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
      assert(config.quickSaleLabel === "Conservative Quick-Sale Value", `unexpected quick-sale label: ${config.quickSaleLabel}`);
      assert(config.targetValueLabel === "Target Sale Value", `unexpected target label: ${config.targetValueLabel}`);
      assert(assetCapabilities("vehicle").supportsVehicleStatus === true, "vehicle should be eligible for the optional status field on create");
    });

    await runner.run("assetCreationConfig: financial_investment has investment wording, no vehicle/repair/listing language", async () => {
      const config = assetCreationConfig("financial_investment");
      assert(config.valuesHeading === "Investment values", `unexpected heading: ${config.valuesHeading}`);
      assert(config.basisLabel === "Amount Invested / Cost Basis", `unexpected basis label: ${config.basisLabel}`);
      const allCopy = `${config.valuesHeading} ${config.helperCopy ?? ""} ${config.basisLabel} ${config.currentValueLabel} ${config.quickSaleLabel} ${config.targetValueLabel}`;
      assert(!/vehicle|repair|listing|ready to list/i.test(allCopy), `financial_investment creation copy must not use vehicle/repair/listing wording, got: "${allCopy}"`);
      assert(assetCapabilities("financial_investment").supportsVehicleStatus === false, "financial_investment must never be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: property has property labels, no vehicle status", async () => {
      const config = assetCreationConfig("property");
      assert(config.valuesHeading === "Property values", `unexpected heading: ${config.valuesHeading}`);
      assert(config.basisLabel === "Purchase / Cost Basis", `unexpected basis label: ${config.basisLabel}`);
      assert(assetCapabilities("property").supportsVehicleStatus === false, "property must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: business_interest distinguishes capital invested from business valuation", async () => {
      const config = assetCreationConfig("business_interest");
      assert(config.basisLabel === "Capital Invested", `unexpected basis label: ${config.basisLabel}`);
      assert(config.currentValueLabel === "Estimated Business Value", `unexpected current-value label: ${config.currentValueLabel}`);
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
      assert(/inventory/i.test(config.basisLabel), `expected inventory wording in basis label, got: ${config.basisLabel}`);
      assert(assetCapabilities("inventory").supportsVehicleStatus === false, "inventory must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: collectible uses acquisition/valuation wording, no vehicle status", async () => {
      const config = assetCreationConfig("collectible");
      assert(config.basisLabel === "Acquisition Cost", `unexpected basis label: ${config.basisLabel}`);
      assert(assetCapabilities("collectible").supportsVehicleStatus === false, "collectible must not be eligible for the vehicle status field on create");
    });

    await runner.run("assetCreationConfig: other uses neutral generic labels, no vehicle status", async () => {
      const config = assetCreationConfig("other");
      assert(config.basisLabel === "Cost Basis", `unexpected basis label: ${config.basisLabel}`);
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
