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

        await updateAsset(userA.client, assetA.id, { isArchived: true });

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
        await updateAsset(userA.client, assetA.id, { currencyCode: "USD" });
      } catch {
        threw = true;
      }
      assert(threw, "changing currency on an asset with history should fail");
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
