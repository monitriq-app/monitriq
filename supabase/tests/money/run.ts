/**
 * Cross-user isolation / adversarial / financial-correctness suite for the
 * Money domain (cash_buckets, financial_events, cash_movements, fx_rates).
 *
 * Same rules as supabase/tests/rls/run.ts: LOCAL Supabase only (see
 * ../shared/env.ts), real anon-key + PostgREST/RPC path for every
 * assertion — this is database enforcement being tested, not application
 * code.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:money
 */
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectSuccess, expectFilteredToEmpty, expectDenied } from "../shared/assert.ts";
import {
  createBucket,
  updateBucket,
  listBuckets,
  recordMoneyReceived,
  recordMoneySpent,
  recordTransfer,
  recordFxTransfer,
  recordOpeningBalance,
  getBucketBalances,
  getCurrencyTotals,
  getRecentActivity,
} from "../../../lib/domain/money/repository.ts";
import { convertToReportingCurrency } from "../../../lib/domain/currency/conversion.ts";
import { randomUUID } from "node:crypto";

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "money-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Money isolation & correctness suite\n");

    // --- 1-3: bucket creation --------------------------------------------
    const bucketANgn = await runner.runValue("User A creates own NGN bucket", () =>
      createBucket(userA.client, { name: "Main NGN", currencyCode: "NGN", bucketType: "bank_account" }),
    );
    const bucketAUsd = await runner.runValue("User A creates own USD bucket", () =>
      createBucket(userA.client, { name: "Dollar Savings", currencyCode: "USD", bucketType: "savings_account" }),
    );
    const bucketB = await runner.runValue("User B creates own bucket", () =>
      createBucket(userB.client, { name: "B's Wallet", currencyCode: "NGN", bucketType: "cash_wallet" }),
    );

    if (!bucketANgn || !bucketAUsd || !bucketB) {
      throw new Error("Bucket setup failed — aborting remaining tests.");
    }

    // --- 4-10: bucket isolation -------------------------------------------
    await runner.run("User A reads only own buckets", async () => {
      const buckets = await listBuckets(userA.client);
      assert(buckets.length === 2, `expected 2 buckets, got ${buckets.length}`);
      assert(
        buckets.every((b) => b.id === bucketANgn.id || b.id === bucketAUsd.id),
        "listBuckets returned a bucket that isn't user A's",
      );
    });

    await runner.run("User A cannot read User B's bucket by UUID", async () => {
      const result = await userA.client.from("cash_buckets").select("*").eq("id", bucketB.id);
      expectFilteredToEmpty(result, "user A selecting user B's bucket by id");
    });

    await runner.run("User A cannot update User B's bucket", async () => {
      const result = await userA.client
        .from("cash_buckets")
        .update({ name: "Hijacked" })
        .eq("id", bucketB.id)
        .select("*");
      expectFilteredToEmpty(result, "user A updating user B's bucket");
    });

    await runner.run("User A cannot change ownership of their own bucket", async () => {
      // The generated raw Update type allows user_id (Postgres/Supabase
      // don't know about our column-level GRANT restriction) — this
      // simulates a client that forged a raw payload including it.
      const result = await userA.client
        .from("cash_buckets")
        .update({ user_id: userB.id })
        .eq("id", bucketANgn.id)
        .select("*");
      expectDenied(result, "user A attempting to reassign their bucket's ownership");
    });

    await runner.run("User A cannot create a bucket owned by User B", async () => {
      const result = await userA.client
        .from("cash_buckets")
        .insert({ user_id: userB.id, name: "Forged", currency_code: "NGN", bucket_type: "other" });
      expectDenied(result, "user A attempting to insert a bucket with user B's user_id");
    });

    await runner.run("Anonymous access cannot read buckets", async () => {
      const result = await anonClient.from("cash_buckets").select("*").eq("id", bucketANgn.id);
      expectDenied(result, "anonymous SELECT on cash_buckets");
    });

    await runner.run("Anonymous access cannot create or update buckets", async () => {
      const insertResult = await anonClient
        .from("cash_buckets")
        .insert({ user_id: userA.id, name: "Anon", currency_code: "NGN", bucket_type: "other" });
      expectDenied(insertResult, "anonymous INSERT on cash_buckets");

      const updateResult = await anonClient
        .from("cash_buckets")
        .update({ name: "Anon" })
        .eq("id", bucketANgn.id);
      expectDenied(updateResult, "anonymous UPDATE on cash_buckets");
    });

    // --- 11-13: money received/spent + balance -----------------------------
    await runner.run("User A records own Money Received event", async () => {
      const event = await recordMoneyReceived(userA.client, {
        bucketId: bucketANgn.id,
        amount: "1500000",
        categoryCode: "salary",
      });
      assert(event.cash_flow_class === "income", `expected income, got ${event.cash_flow_class}`);
    });

    await runner.run("User A records own Money Spent event", async () => {
      const event = await recordMoneySpent(userA.client, {
        bucketId: bucketANgn.id,
        amount: "250000",
        categoryCode: "food",
      });
      assert(event.cash_flow_class === "expense", `expected expense, got ${event.cash_flow_class}`);
    });

    await runner.run("Calculated balance reflects both correctly", async () => {
      const balances = await getBucketBalances(userA.client);
      const ngn = balances.find((b) => b.bucketId === bucketANgn.id);
      assert(ngn !== undefined, "no balance row for user A's NGN bucket");
      assert(ngn.amount === "1250000.000000", `expected 1250000.000000, got ${ngn.amount}`);
    });

    // --- 14-19: same-currency transfer --------------------------------------
    await runner.run("User A transfers between two own same-currency buckets", async () => {
      const bucketANgn2 = await createBucket(userA.client, {
        name: "House Savings",
        currencyCode: "NGN",
        bucketType: "savings_account",
      });
      const event = await recordTransfer(userA.client, {
        sourceBucketId: bucketANgn.id,
        destinationBucketId: bucketANgn2.id,
        amount: "1000000",
      });
      assert(event.event_type === "transfer", `expected transfer, got ${event.event_type}`);

      const balances = await getBucketBalances(userA.client);
      const source = balances.find((b) => b.bucketId === bucketANgn.id);
      const destination = balances.find((b) => b.bucketId === bucketANgn2.id);
      assert(source?.amount === "250000.000000", `source balance wrong: ${source?.amount}`);
      assert(destination?.amount === "1000000.000000", `destination balance wrong: ${destination?.amount}`);

      const totals = await getCurrencyTotals(userA.client);
      const ngnTotal = totals.find((t) => t.currencyCode === "NGN");
      assert(ngnTotal?.amount === "1250000.000000", `total NGN cash changed after internal transfer: ${ngnTotal?.amount}`);

      assert(event.cash_flow_class === "transfer", "transfer must not be classified as income or expense");
    });

    // --- 18/19: cross-tenant reference attacks on transfer ------------------
    await runner.run("User A attempts transfer into User B's bucket — fails", async () => {
      let threw = false;
      try {
        await recordTransfer(userA.client, {
          sourceBucketId: bucketANgn.id,
          destinationBucketId: bucketB.id,
          amount: "1000",
        });
      } catch {
        threw = true;
      }
      assert(threw, "record_transfer should have rejected a destination bucket owned by user B");
    });

    await runner.run("User A attempts a money-received event referencing User B's bucket — fails", async () => {
      let threw = false;
      try {
        await recordMoneyReceived(userA.client, {
          bucketId: bucketB.id,
          amount: "1000",
          categoryCode: "salary",
        });
      } catch {
        threw = true;
      }
      assert(threw, "record_money_received should have rejected a bucket owned by user B");
    });

    await runner.run(
      "User A cannot attach a raw cash_movement to User B's event by referencing B's bucket+event",
      async () => {
        // User B records something legitimate first, so there's a real event/bucket to target.
        const bEvent = await recordMoneyReceived(userB.client, {
          bucketId: bucketB.id,
          amount: "5000",
          categoryCode: "salary",
        });
        // user_id: userA.id — a real attacker would claim themselves as
        // owner, hoping it satisfies auth.uid() = user_id while sneaking in
        // someone else's bucket_id/event_id. The EXISTS-based policy
        // checks in the migration are exactly what defeats this.
        const result = await userA.client.from("cash_movements").insert({
          event_id: bEvent.id,
          bucket_id: bucketB.id,
          currency_code: "NGN",
          amount: 100,
          user_id: userA.id,
        });
        expectDenied(result, "user A inserting a cash_movement against user B's own event and bucket");
      },
    );

    // --- 20/21: event and movement read isolation ---------------------------
    await runner.run("User A cannot read User B's financial events", async () => {
      const result = await userA.client.from("financial_events").select("*").eq("user_id", userB.id);
      expectFilteredToEmpty(result, "user A selecting financial_events filtered to user B's user_id");
    });

    await runner.run("A raw SELECT on cash_movements never returns User B's rows", async () => {
      // SELECT is granted (needed for the SECURITY INVOKER balance/activity
      // functions to work at all) — RLS is the real boundary here, so an
      // unfiltered query silently returns only the caller's own rows, not
      // an error. See the migration's comment on cash_movements' grants.
      const result = expectSuccess(
        await userA.client.from("cash_movements").select("*"),
        "user A running a raw unfiltered SELECT on cash_movements",
      );
      assert(result.length > 0, "expected user A to see at least their own movements");
      assert(
        result.every((row) => row.user_id === userA.id),
        "a raw SELECT on cash_movements returned a row not owned by user A",
      );
    });

    await runner.run("money_recent_activity() never returns another user's rows", async () => {
      const activity = await getRecentActivity(userA.client, 100);
      assert(
        activity.every((item) => item.bucketId !== bucketB.id),
        "money_recent_activity leaked a movement against user B's bucket",
      );
    });

    // --- 22-26: FX transfer ---------------------------------------------------
    let fxEventId = "";
    await runner.run("User A creates a USD -> NGN FX transfer between own buckets", async () => {
      const event = await recordFxTransfer(userA.client, {
        sourceBucketId: bucketAUsd.id,
        destinationBucketId: bucketANgn.id,
        sourceAmount: "1000",
        destinationAmount: "1610000",
      });
      fxEventId = event.id;
      assert(event.event_type === "fx_transfer", `expected fx_transfer, got ${event.event_type}`);
      assert(event.cash_flow_class === "transfer", "fx_transfer must not be income or expense");
    });

    await runner.run("Both original FX amounts persist exactly", async () => {
      const activity = await getRecentActivity(userA.client, 100);
      const movements = activity.filter((item) => item.eventId === fxEventId);
      assert(movements.length === 2, `expected 2 movements for the fx transfer, got ${movements.length}`);
      const usdLeg = movements.find((m) => m.currencyCode === "USD");
      const ngnLeg = movements.find((m) => m.currencyCode === "NGN");
      assert(usdLeg?.amount === "-1000.000000", `USD leg wrong: ${usdLeg?.amount}`);
      assert(ngnLeg?.amount === "1610000.000000", `NGN leg wrong: ${ngnLeg?.amount}`);
    });

    await runner.run("The applied FX rate persists exactly", async () => {
      const { data, error } = await userA.client
        .from("fx_rates")
        .select("*")
        .eq("event_id", fxEventId)
        .single();
      if (error) throw error;
      assert(data.base_currency === "USD" && data.quote_currency === "NGN", "base/quote currency wrong");
      assert(Number(data.rate) === 1610, `expected rate 1610, got ${data.rate}`);
      assert(data.source === "transaction_actual", `expected transaction_actual, got ${data.source}`);
    });

    await runner.run("User A attempts an FX transfer into User B's bucket — fails", async () => {
      let threw = false;
      try {
        await recordFxTransfer(userA.client, {
          sourceBucketId: bucketAUsd.id,
          destinationBucketId: bucketB.id,
          sourceAmount: "10",
          destinationAmount: "16100",
        });
      } catch {
        threw = true;
      }
      assert(threw, "record_fx_transfer should have rejected a destination bucket owned by user B");
    });

    // --- 28/29: validation failures -------------------------------------------
    await runner.run("A same-currency transfer with mismatched bucket currencies fails", async () => {
      let threw = false;
      try {
        await recordTransfer(userA.client, {
          sourceBucketId: bucketANgn.id,
          destinationBucketId: bucketAUsd.id,
          amount: "100",
        });
      } catch {
        threw = true;
      }
      assert(threw, "record_transfer should reject buckets with different currencies");
    });

    await runner.run("A malformed currency code is rejected when creating a bucket", async () => {
      let threw = false;
      try {
        await createBucket(userA.client, { name: "Bad", currencyCode: "XXX", bucketType: "other" });
      } catch {
        threw = true;
      }
      assert(threw, "creating a bucket with a currency code not in the registry should fail");
    });

    // --- 30: bucket currency immutability -------------------------------------
    await runner.run("Bucket currency cannot be changed once it has financial movements", async () => {
      let threw = false;
      try {
        await updateBucket(userA.client, bucketANgn.id, { currencyCode: "USD" });
      } catch {
        threw = true;
      }
      assert(threw, "changing currency on a bucket with movements should fail");
    });

    // --- 31: missing-rate aggregation -----------------------------------------
    await runner.run("Multi-currency aggregate without required rates returns not_calculated", async () => {
      const totals = [
        { currencyCode: "NGN", amount: "1250000" },
        { currencyCode: "USD", amount: "1000" },
      ];
      const result = convertToReportingCurrency(totals, "NGN", new Map());
      assert(result.status === "not_calculated", `expected not_calculated, got ${result.status}`);
      if (result.status === "not_calculated") {
        assert(result.missingRates.includes("USD"), "expected USD to be reported as missing a rate");
      }

      const withRate = convertToReportingCurrency(totals, "NGN", new Map([["USD", "1610"]]));
      assert(withRate.status === "converted", "expected converted once the rate is supplied");
      if (withRate.status === "converted") {
        assert(withRate.amount === "2860000", `expected 2860000, got ${withRate.amount}`);
      }
    });

    // --- 32: idempotency ---------------------------------------------------------
    await runner.run("Retrying the same idempotency key does not create a duplicate event", async () => {
      const idempotencyKey = randomUUID();
      const first = await recordMoneyReceived(userA.client, {
        bucketId: bucketANgn.id,
        amount: "999",
        categoryCode: "gift",
        idempotencyKey,
      });
      const second = await recordMoneyReceived(userA.client, {
        bucketId: bucketANgn.id,
        amount: "999",
        categoryCode: "gift",
        idempotencyKey,
      });
      assert(first.id === second.id, "two calls with the same idempotency key produced different events");

      const activity = await getRecentActivity(userA.client, 200);
      const matches = activity.filter((item) => item.eventId === first.id);
      assert(matches.length === 1, `expected exactly 1 movement for the idempotent event, got ${matches.length}`);
    });

    // --- 33/34: ownership reassignment on events/movements ------------------------
    await runner.run("User A cannot reassign a financial event's ownership", async () => {
      const event = await recordMoneyReceived(userA.client, {
        bucketId: bucketANgn.id,
        amount: "1",
        categoryCode: "other",
      });
      // Same rationale as the cash_buckets test above: the raw Update type
      // allows user_id even though the column-level GRANT does not.
      const result = await userA.client
        .from("financial_events")
        .update({ user_id: userB.id })
        .eq("id", event.id)
        .select("*");
      expectDenied(result, "user A attempting to reassign a financial_event's user_id");
    });

    await runner.run("User A cannot reassign a cash movement's ownership (no UPDATE grant at all)", async () => {
      const result = await userA.client
        .from("cash_movements")
        .update({ user_id: userB.id })
        .eq("bucket_id", bucketANgn.id);
      expectDenied(result, "user A attempting any UPDATE on cash_movements");
    });

    // --- 35: direct UUID-targeted reads reveal nothing -----------------------------
    await runner.run("Direct UUID-targeted queries across every Money table reveal no User B data", async () => {
      const bucketResult = await userA.client.from("cash_buckets").select("*").eq("id", bucketB.id).maybeSingle();
      assert(bucketResult.error === null && bucketResult.data === null, "leaked user B's bucket by id");

      const eventsResult = await userA.client.from("financial_events").select("*").eq("user_id", userB.id);
      assert(eventsResult.error === null && (eventsResult.data ?? []).length === 0, "leaked user B's events");

      const fxResult = await userA.client.from("fx_rates").select("*").eq("user_id", userB.id);
      assert(fxResult.error === null && (fxResult.data ?? []).length === 0, "leaked user B's fx_rates");
    });

    // --- Anonymous isolation across the rest of the Money domain -------------------
    await runner.run("Anonymous access cannot read financial_events, fx_rates, or call any Money RPC", async () => {
      const events = await anonClient.from("financial_events").select("*");
      expectDenied(events, "anonymous SELECT on financial_events");

      const fx = await anonClient.from("fx_rates").select("*");
      expectDenied(fx, "anonymous SELECT on fx_rates");

      const rpc = await anonClient.rpc("money_bucket_balances");
      expectDenied(rpc, "anonymous call to money_bucket_balances()");

      const create = await anonClient.rpc("record_opening_balance", {
        p_bucket_id: bucketANgn.id,
        p_amount: 100 as unknown as number,
      });
      expectDenied(create, "anonymous call to record_opening_balance()");
    });

    // --- Opening balance sanity (not in the numbered matrix, but core to the domain) --
    await runner.run("Opening balance is recorded as its own event, not income", async () => {
      const bucket = await createBucket(userA.client, {
        name: "Fresh Account",
        currencyCode: "GBP",
        bucketType: "bank_account",
      });
      const event = await recordOpeningBalance(userA.client, { bucketId: bucket.id, amount: "800" });
      assert(event.cash_flow_class === "opening_balance", `expected opening_balance, got ${event.cash_flow_class}`);
      const balances = await getBucketBalances(userA.client);
      const gbp = balances.find((b) => b.bucketId === bucket.id);
      assert(gbp?.amount === "800.000000", `expected 800.000000, got ${gbp?.amount}`);
    });

    // --- Currency precision: not every currency has 2 decimal places --------------
    await runner.run("A JPY (0-decimal) bucket rejects a fractional amount", async () => {
      const jpyBucket = await createBucket(userA.client, {
        name: "Yen Wallet",
        currencyCode: "JPY",
        bucketType: "cash_wallet",
      });
      let threw = false;
      try {
        await recordOpeningBalance(userA.client, { bucketId: jpyBucket.id, amount: "1000.50" });
      } catch {
        threw = true;
      }
      assert(threw, "JPY has decimal_exponent 0 — a fractional amount should be rejected");
    });

    await runner.run("A JPY (0-decimal) bucket accepts a whole-number amount", async () => {
      const jpyBucket = await createBucket(userA.client, {
        name: "Yen Wallet 2",
        currencyCode: "JPY",
        bucketType: "cash_wallet",
      });
      const event = await recordOpeningBalance(userA.client, { bucketId: jpyBucket.id, amount: "5000" });
      assert(event.cash_flow_class === "opening_balance", "whole-yen opening balance should succeed");
    });

    await runner.run("A KWD (3-decimal) bucket accepts 3 decimal places but rejects 4", async () => {
      const kwdBucket = await createBucket(userA.client, {
        name: "Dinar Account",
        currencyCode: "KWD",
        bucketType: "bank_account",
      });
      const event = await recordOpeningBalance(userA.client, { bucketId: kwdBucket.id, amount: "12.345" });
      assert(event.cash_flow_class === "opening_balance", "3-decimal KWD amount should succeed");

      let threw = false;
      try {
        await recordMoneyReceived(userA.client, {
          bucketId: kwdBucket.id,
          amount: "1.2345",
          categoryCode: "gift",
        });
      } catch {
        threw = true;
      }
      assert(threw, "KWD has decimal_exponent 3 — a 4-decimal amount should be rejected");
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
  console.error("Money suite crashed:", err);
  process.exitCode = 1;
});
