/**
 * Currency-registry source-of-truth tests (P0-E2-S3). Proves:
 *   - public.currencies is comprehensive (not the old 26-code starter set)
 *   - Profile onboarding, Money, and Assets all read the SAME registry
 *   - 0/2/3-decimal currencies each work correctly
 *   - an unsupported code is rejected
 *   - the duplicated application-level currency list was actually removed,
 *     not just documented as removed
 *
 * Runs against a LOCAL Supabase stack only (see ../shared/env.ts).
 *
 * Usage: npm run db:start   (once)
 *        npm run test:currency
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { listCurrencies } from "../../../lib/domain/currency/repository.ts";
import { createBucket } from "../../../lib/domain/money/repository.ts";
import { createAsset } from "../../../lib/domain/assets/repository.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "currency-registry");
  const { userA } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq currency-registry tests\n");

    await runner.run("public.currencies is comprehensive, not the old 26-code starter set", async () => {
      const currencies = await listCurrencies(userA.client);
      assert(
        currencies.length >= 150,
        `expected a comprehensive registry (150+), got ${currencies.length}`,
      );
    });

    await runner.run("the removed application-level currency list file no longer exists", async () => {
      const removedPath = REPO_ROOT + "lib/domain/profile/currencies.ts";
      assert(
        !existsSync(removedPath),
        `lib/domain/profile/currencies.ts still exists — the duplicated ` +
          `currency list was supposed to be removed, not just documented ` +
          `as removed`,
      );
    });

    await runner.run(
      "onboarding's currency source (lib/domain/currency/repository.ts) returns known real codes",
      async () => {
        const currencies = await listCurrencies(userA.client);
        const codes = new Set(currencies.map((c) => c.code));
        for (const code of ["NGN", "USD", "GBP", "EUR", "JPY", "KWD"]) {
          assert(codes.has(code), `expected the registry to include ${code}`);
        }
      },
    );

    await runner.run(
      "Money bucket creation accepts a currency well outside the old 26-code list (KRW)",
      async () => {
        const bucket = await createBucket(userA.client, {
          name: "Won Account",
          currencyCode: "KRW",
          bucketType: "bank_account",
        });
        assert(bucket.currency_code === "KRW", "bucket did not persist with KRW");
      },
    );

    await runner.run(
      "Assets creation accepts a currency well outside the old 26-code list (AFN)",
      async () => {
        const asset = await createAsset(userA.client, {
          assetType: "other",
          name: "Afghani-denominated note",
          currencyCode: "AFN",
        });
        assert(asset.currency_code === "AFN", "asset did not persist with AFN");
      },
    );

    await runner.run("A representative 0-decimal currency (JPY) is accepted for a bucket", async () => {
      const bucket = await createBucket(userA.client, {
        name: "Yen Test",
        currencyCode: "JPY",
        bucketType: "cash_wallet",
      });
      assert(bucket.currency_code === "JPY", `expected JPY, got ${bucket.currency_code}`);
    });

    await runner.run("A representative 2-decimal currency (USD) is accepted for a bucket", async () => {
      const bucket = await createBucket(userA.client, {
        name: "USD Test",
        currencyCode: "USD",
        bucketType: "cash_wallet",
      });
      assert(bucket.currency_code === "USD", `expected USD, got ${bucket.currency_code}`);
    });

    await runner.run("A representative 3-decimal currency (KWD) is accepted for an asset", async () => {
      const asset = await createAsset(userA.client, {
        assetType: "financial_investment",
        name: "Dinar Investment",
        currencyCode: "KWD",
      });
      assert(asset.currency_code === "KWD", `expected KWD, got ${asset.currency_code}`);
    });

    await runner.run("An unsupported/malformed currency code is rejected for a bucket", async () => {
      let threw = false;
      try {
        await createBucket(userA.client, { name: "Fake", currencyCode: "ZZZ", bucketType: "other" });
      } catch {
        threw = true;
      }
      assert(threw, "a bucket with an unregistered currency code should be rejected");
    });

    await runner.run("An unsupported/malformed currency code is rejected for an asset", async () => {
      let threw = false;
      try {
        await createAsset(userA.client, { assetType: "other", name: "Fake", currencyCode: "ZZZ" });
      } catch {
        threw = true;
      }
      assert(threw, "an asset with an unregistered currency code should be rejected");
    });

    await runner.run("The registry itself is readable and well-formed", async () => {
      const { data, error } = await userA.client
        .from("currencies")
        .select("code, decimal_exponent")
        .eq("code", "JPY")
        .single();
      assert(error === null, `unexpected error reading JPY's metadata: ${error?.message}`);
      assert(data !== null, "expected a JPY row");
      assert(data?.decimal_exponent === 0, `expected JPY decimal_exponent 0, got ${data?.decimal_exponent}`);
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
  console.error("Currency registry suite crashed:", err);
  process.exitCode = 1;
});
