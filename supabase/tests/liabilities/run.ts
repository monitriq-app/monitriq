/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Liabilities/Debt domain (liability_types, liabilities,
 * liability_principal_events, and the compound record_debt_payment()
 * operation via financial_operations).
 *
 * Same rules as supabase/tests/money/run.ts: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:liabilities
 */
import { randomUUID } from "node:crypto";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createLiability,
  listLiabilities,
  getLiabilitySummaries,
  getLiabilityNativeCurrencyTotals,
  recordDebtPayment,
  recordLoanProceeds,
  recordLiabilityAdjustment,
} from "../../../lib/domain/liabilities/repository.ts";
import { createBucket, getBucketBalances, voidFinancialEvent } from "../../../lib/domain/money/repository.ts";

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "liabilities-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Liabilities isolation & correctness suite\n");

    // --- 23-24: creation -----------------------------------------------------
    const liabilityA = await runner.runValue("User A creates own liability", () =>
      createLiability(userA.client, {
        name: "Car Loan",
        liabilityType: "loan",
        currencyCode: "USD",
        openingPrincipal: "20000",
      }),
    );
    const liabilityB = await runner.runValue("User B creates own liability", () =>
      createLiability(userB.client, {
        name: "B's Mortgage",
        liabilityType: "mortgage",
        currencyCode: "NGN",
        openingPrincipal: "50000000",
      }),
    );

    if (!liabilityA || !liabilityB) {
      throw new Error("Liability setup failed — aborting remaining tests.");
    }

    // --- 25-28: isolation ------------------------------------------------------
    await runner.run("User A reads only own liabilities", async () => {
      const liabilities = await listLiabilities(userA.client);
      assert(liabilities.length === 1, `expected 1 liability, got ${liabilities.length}`);
      assert(liabilities[0].id === liabilityA.id, "listLiabilities returned a non-owned liability");
    });

    await runner.run("User A cannot read User B's liability by UUID", async () => {
      const result = await userA.client.from("liabilities").select("*").eq("id", liabilityB.id);
      expectFilteredToEmpty(result, "user A selecting user B's liability by id");
    });

    await runner.run("User A cannot update or archive User B's liability", async () => {
      const updateResult = await userA.client
        .from("liabilities")
        .update({ name: "Hijacked" })
        .eq("id", liabilityB.id)
        .select("*");
      expectFilteredToEmpty(updateResult, "user A updating user B's liability");

      const archiveResult = await userA.client
        .from("liabilities")
        .update({ is_archived: true })
        .eq("id", liabilityB.id)
        .select("*");
      expectFilteredToEmpty(archiveResult, "user A archiving user B's liability");
    });

    await runner.run("User A cannot create a liability owned by User B", async () => {
      const result = await userA.client
        .from("liabilities")
        .insert({ user_id: userB.id, liability_type: "other", name: "Forged", currency_code: "USD" });
      expectDenied(result, "user A attempting to insert a liability with user B's user_id");
    });

    await runner.run("User A cannot reassign their own liability's ownership to User B", async () => {
      const result = await userA.client
        .from("liabilities")
        .update({ user_id: userB.id })
        .eq("id", liabilityA.id)
        .select("*");
      expectDenied(result, "user A attempting to reassign their liability's ownership");
    });

    await runner.run("Anonymous access cannot read or mutate liabilities", async () => {
      const readResult = await anonClient.from("liabilities").select("*").eq("id", liabilityA.id);
      expectDenied(readResult, "anonymous SELECT on liabilities");

      const insertResult = await anonClient
        .from("liabilities")
        .insert({ user_id: userA.id, liability_type: "other", name: "Anon", currency_code: "USD" });
      expectDenied(insertResult, "anonymous INSERT on liabilities");
    });

    // --- 29: opening liability does not create Money In -------------------------
    const bucketA = await runner.runValue("Setup: User A creates a USD bucket for debt activity", () =>
      createBucket(userA.client, { name: "USD Checking", currencyCode: "USD", bucketType: "bank_account" }),
    );
    if (!bucketA) throw new Error("Bucket setup failed.");

    await runner.run("Creating a liability (opening principal) does not create any cash movement", async () => {
      const before = await getBucketBalances(userA.client);
      await createLiability(userA.client, {
        name: "Another Debt",
        liabilityType: "personal_debt",
        currencyCode: "USD",
        openingPrincipal: "500",
      });
      const after = await getBucketBalances(userA.client);
      assert(JSON.stringify(before) === JSON.stringify(after), "opening a liability must never move cash");
    });

    // --- 30-31: principal-only payment --------------------------------------------
    let principalOnlyOperationId = "";
    await runner.run(
      "A principal-only debt payment reduces cash and outstanding principal by the exact same amount, and is not an expense",
      async () => {
        const operation = await recordDebtPayment(userA.client, {
          liabilityId: liabilityA.id,
          bucketId: bucketA.id,
          principalAmount: "1000",
        });
        principalOnlyOperationId = operation.id;

        const balances = await getBucketBalances(userA.client);
        const usd = balances.find((b) => b.bucketId === bucketA.id);
        assert(usd?.amount === "-1000.000000", `expected cash -1000, got ${usd?.amount}`);

        const summaries = await getLiabilitySummaries(userA.client);
        const summary = summaries.find((s) => s.liabilityId === liabilityA.id);
        assert(summary?.outstandingPrincipal === "19000.000000", `expected 19000, got ${summary?.outstandingPrincipal}`);

        const { data: events } = await userA.client
          .from("financial_events")
          .select("cash_flow_class")
          .eq("operation_id", operation.id);
        assert(events?.length === 1, `expected exactly 1 event for a principal-only payment, got ${events?.length}`);
        assert(events?.[0]?.cash_flow_class === "other_outflow", "principal-only payment must not be classified as an expense");
      },
    );

    // --- 32-34: principal + interest + fee ------------------------------------------
    await runner.run(
      "A debt payment with principal + interest + fee deducts the exact total cash, reduces principal by the principal portion only, and classifies interest/fee as expenses",
      async () => {
        const balancesBefore = await getBucketBalances(userA.client);
        const cashBefore = Number(balancesBefore.find((b) => b.bucketId === bucketA.id)?.amount ?? 0);

        const operation = await recordDebtPayment(userA.client, {
          liabilityId: liabilityA.id,
          bucketId: bucketA.id,
          principalAmount: "800",
          interestAmount: "150",
          feeAmount: "50",
        });

        const balancesAfter = await getBucketBalances(userA.client);
        const cashAfter = Number(balancesAfter.find((b) => b.bucketId === bucketA.id)?.amount ?? 0);
        assert(cashBefore - cashAfter === 1000, `expected total cash outflow of exactly 1000, got ${cashBefore - cashAfter}`);

        const summaries = await getLiabilitySummaries(userA.client);
        const summary = summaries.find((s) => s.liabilityId === liabilityA.id);
        assert(summary?.outstandingPrincipal === "18200.000000", `expected 18200 (19000-800), got ${summary?.outstandingPrincipal}`);

        const { data: events } = await userA.client
          .from("financial_events")
          .select("event_type, cash_flow_class")
          .eq("operation_id", operation.id);
        assert(events?.length === 3, `expected 3 events (principal/interest/fee), got ${events?.length}`);
        const principalEvent = events?.find((e) => e.event_type === "debt_principal_payment");
        const interestEvent = events?.find((e) => e.event_type === "debt_interest");
        const feeEvent = events?.find((e) => e.event_type === "debt_fee");
        assert(principalEvent?.cash_flow_class === "other_outflow", "principal must not be an expense");
        assert(interestEvent?.cash_flow_class === "expense", "interest must be an expense");
        assert(feeEvent?.cash_flow_class === "expense", "fee must be an expense");
      },
    );

    // --- 35: cannot reduce principal below zero ---------------------------------
    await runner.run("A payment cannot reduce principal below zero", async () => {
      let threw = false;
      try {
        await recordDebtPayment(userA.client, {
          liabilityId: liabilityA.id,
          bucketId: bucketA.id,
          principalAmount: "999999",
        });
      } catch {
        threw = true;
      }
      assert(threw, "a principal payment exceeding outstanding principal should be rejected");
    });

    // --- 36-38: validation failures --------------------------------------------------
    await runner.run("A wrong-currency debt payment is rejected", async () => {
      const ngnBucket = await createBucket(userA.client, {
        name: "NGN for debt test",
        currencyCode: "NGN",
        bucketType: "cash_wallet",
      });
      let threw = false;
      try {
        await recordDebtPayment(userA.client, {
          liabilityId: liabilityA.id,
          bucketId: ngnBucket.id,
          principalAmount: "10",
        });
      } catch {
        threw = true;
      }
      assert(threw, "paying a USD liability from an NGN bucket should be rejected");
    });

    await runner.run("A payment using User B's bucket is rejected", async () => {
      const bBucket = await createBucket(userB.client, {
        name: "B's USD Wallet",
        currencyCode: "USD",
        bucketType: "bank_account",
      });
      let threw = false;
      try {
        await recordDebtPayment(userA.client, {
          liabilityId: liabilityA.id,
          bucketId: bBucket.id,
          principalAmount: "10",
        });
      } catch {
        threw = true;
      }
      assert(threw, "paying using user B's bucket should be rejected");
    });

    await runner.run("A payment against User B's liability is rejected", async () => {
      let threw = false;
      try {
        await recordDebtPayment(userA.client, {
          liabilityId: liabilityB.id,
          bucketId: bucketA.id,
          principalAmount: "10",
        });
      } catch {
        threw = true;
      }
      assert(threw, "paying against user B's liability should be rejected");
    });

    // --- 39: idempotency -----------------------------------------------------------
    await runner.run("A retried debt payment with the same idempotency key does not double any component", async () => {
      const idempotencyKey = randomUUID();
      const first = await recordDebtPayment(userA.client, {
        liabilityId: liabilityA.id,
        bucketId: bucketA.id,
        principalAmount: "100",
        interestAmount: "20",
        idempotencyKey,
      });
      const second = await recordDebtPayment(userA.client, {
        liabilityId: liabilityA.id,
        bucketId: bucketA.id,
        principalAmount: "100",
        interestAmount: "20",
        idempotencyKey,
      });
      assert(first.id === second.id, "two calls with the same idempotency key produced different operations");

      const { data: events } = await userA.client
        .from("financial_events")
        .select("id")
        .eq("operation_id", first.id);
      assert(events?.length === 2, `expected exactly 2 events for this operation (not duplicated), got ${events?.length}`);
    });

    // --- 40: cross-domain raw-reference attack --------------------------------------
    await runner.run(
      "User A cannot forge a raw principal-event insert with user_id=A but liability_id=B (bypassing the RPC)",
      async () => {
        const result = await userA.client.from("liability_principal_events").insert({
          liability_id: liabilityB.id,
          principal_event_type: "adjustment",
          amount: 100,
          currency_code: "NGN",
          occurred_at: new Date().toISOString(),
          user_id: userA.id,
        });
        expectDenied(result, "user A forging liability_principal_events against user B's liability");
      },
    );

    await runner.run("User A cannot read User B's principal history", async () => {
      await recordLiabilityAdjustment(userB.client, { liabilityId: liabilityB.id, amount: "1000" });
      const result = await userA.client
        .from("liability_principal_events")
        .select("*")
        .eq("liability_id", liabilityB.id);
      expectFilteredToEmpty(result, "user A selecting user B's principal events by liability_id");
    });

    // --- 42: multi-currency native totals --------------------------------------------
    await runner.run("Liabilities remain separated by native currency, never summed", async () => {
      const totals = await getLiabilityNativeCurrencyTotals(userA.client);
      const usd = totals.find((t) => t.currencyCode === "USD");
      assert(usd !== undefined, "expected a USD total for user A");
      const ngnPresent = totals.some((t) => t.currencyCode === "NGN");
      assert(!ngnPresent, "user A has no NGN liabilities — none should appear");
    });

    // --- 45: voiding/correction maintains cross-domain consistency -----------------
    await runner.run(
      "Voiding a debt payment's principal event reverts both cash AND outstanding principal consistently",
      async () => {
        const summariesBefore = await getLiabilitySummaries(userA.client);
        const principalBefore = summariesBefore.find((s) => s.liabilityId === liabilityA.id)?.outstandingPrincipal;
        const balancesBefore = await getBucketBalances(userA.client);
        const cashBefore = balancesBefore.find((b) => b.bucketId === bucketA.id)?.amount;

        const { data: principalEvents } = await userA.client
          .from("financial_events")
          .select("id")
          .eq("operation_id", principalOnlyOperationId)
          .eq("event_type", "debt_principal_payment");
        const principalEventId = principalEvents?.[0]?.id;
        assert(Boolean(principalEventId), "setup: expected the earlier principal-only payment's event");

        await voidFinancialEvent(userA.client, principalEventId as string);

        const summariesAfter = await getLiabilitySummaries(userA.client);
        const principalAfter = summariesAfter.find((s) => s.liabilityId === liabilityA.id)?.outstandingPrincipal;
        const balancesAfter = await getBucketBalances(userA.client);
        const cashAfter = balancesAfter.find((b) => b.bucketId === bucketA.id)?.amount;

        assert(
          Number(principalAfter) - Number(principalBefore) === 1000,
          `outstanding principal should increase by exactly 1000 after voiding, got delta ${Number(principalAfter) - Number(principalBefore)}`,
        );
        // The voided event originally deducted 1000 from cash; voiding it
        // excludes that deduction from the balance, so cash goes back up.
        assert(
          Number(cashAfter) - Number(cashBefore) === 1000,
          `cash should increase by exactly 1000 after voiding a 1000 principal deduction, got delta ${Number(cashAfter) - Number(cashBefore)}`,
        );
      },
    );

    // --- 46/47: currency precision (JPY 0-decimal, KWD 3-decimal) -------------------
    await runner.run("A JPY (0-decimal) liability rejects a fractional payment", async () => {
      const jpyLiability = await createLiability(userA.client, {
        name: "Yen Debt",
        liabilityType: "loan",
        currencyCode: "JPY",
        openingPrincipal: "5000",
      });
      const jpyBucket = await createBucket(userA.client, {
        name: "Yen Wallet",
        currencyCode: "JPY",
        bucketType: "cash_wallet",
      });
      let threw = false;
      try {
        await recordDebtPayment(userA.client, {
          liabilityId: jpyLiability.id,
          bucketId: jpyBucket.id,
          principalAmount: "100.5",
        });
      } catch {
        threw = true;
      }
      assert(threw, "JPY has decimal_exponent 0 — a fractional principal payment should be rejected");
    });

    await runner.run("A KWD (3-decimal) liability accepts a 3-decimal payment", async () => {
      const kwdLiability = await createLiability(userA.client, {
        name: "Dinar Debt",
        liabilityType: "loan",
        currencyCode: "KWD",
        openingPrincipal: "1000",
      });
      const kwdBucket = await createBucket(userA.client, {
        name: "Dinar Wallet",
        currencyCode: "KWD",
        bucketType: "cash_wallet",
      });
      const operation = await recordDebtPayment(userA.client, {
        liabilityId: kwdLiability.id,
        bucketId: kwdBucket.id,
        principalAmount: "12.345",
      });
      assert(operation.operation_type === "debt_payment", "3-decimal KWD payment should succeed");
    });

    // --- Loan proceeds (built this phase alongside debt payment) -------------------
    await runner.run("Loan proceeds increase cash and principal, and are not classified as income", async () => {
      const liability = await createLiability(userA.client, {
        name: "New Facility",
        liabilityType: "credit_facility",
        currencyCode: "USD",
        openingPrincipal: "0.01", // must be positive; treat as negligible opening
      });
      const before = await getBucketBalances(userA.client);
      const cashBefore = Number(before.find((b) => b.bucketId === bucketA.id)?.amount ?? 0);

      const event = await recordLoanProceeds(userA.client, {
        liabilityId: liability.id,
        bucketId: bucketA.id,
        amount: "5000",
      });
      // other_inflow, not income — proceeds are borrowed money, not earned.
      assert(event.cash_flow_class === "other_inflow", `expected other_inflow, got ${event.cash_flow_class}`);

      const after = await getBucketBalances(userA.client);
      const cashAfter = Number(after.find((b) => b.bucketId === bucketA.id)?.amount ?? 0);
      assert(cashAfter - cashBefore === 5000, `expected cash +5000, got delta ${cashAfter - cashBefore}`);

      const summaries = await getLiabilitySummaries(userA.client);
      const summary = summaries.find((s) => s.liabilityId === liability.id);
      assert(summary?.outstandingPrincipal === "5000.010000", `expected 5000.01 outstanding, got ${summary?.outstandingPrincipal}`);
    });

    await runner.run("User A cannot direct loan proceeds into User B's bucket, or against User B's liability", async () => {
      const bBucket = await createBucket(userB.client, {
        name: "B's second USD wallet",
        currencyCode: "USD",
        bucketType: "bank_account",
      });
      let threwBucket = false;
      try {
        await recordLoanProceeds(userA.client, { liabilityId: liabilityA.id, bucketId: bBucket.id, amount: "10" });
      } catch {
        threwBucket = true;
      }
      assert(threwBucket, "loan proceeds into user B's bucket should be rejected");

      let threwLiability = false;
      try {
        await recordLoanProceeds(userA.client, { liabilityId: liabilityB.id, bucketId: bucketA.id, amount: "10" });
      } catch {
        threwLiability = true;
      }
      assert(threwLiability, "loan proceeds against user B's liability should be rejected");
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
  console.error("Liabilities suite crashed:", err);
  process.exitCode = 1;
});
