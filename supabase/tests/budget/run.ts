/**
 * Budget suite (P0-E5-S1): Budget is a monthly PLAN per canonical Money
 * spending category, in one currency. It owns NO transactions -- "spent" is
 * derived live from Money. LOCAL Supabase only; real anon-key + RLS path.
 * Expected arithmetic is computed with decimal.js. One currency per
 * concern to keep each block isolated.
 *
 * Usage: npm run db:start && npm run test:budget
 */
import { Decimal } from "decimal.js";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectDenied, expectFilteredToEmpty } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import {
  createBucket,
  recordMoneyReceived,
  recordMoneySpent,
  recordOpeningBalance,
  recordTransfer,
  voidFinancialEvent,
} from "../../../lib/domain/money/repository.ts";
import { createLiability, recordDebtPayment } from "../../../lib/domain/liabilities/repository.ts";
import { createObligation } from "../../../lib/domain/obligations/repository.ts";
import {
  createBudget,
  getBudgetCategoryStatus,
  getBudgetFactsForDate,
  getBudgetSummary,
  getBudgetUpcomingCommitments,
  listBudgets,
  removeBudgetCategoryAmount,
  setBudgetCategoryAmount,
  setBudgetStatus,
} from "../../../lib/domain/budget/repository.ts";

const MAR = "2026-03-15T12:00:00Z";
const MAR_MONTH = "2026-03-01";
const d = (v: string | null | undefined) => new Decimal(v ?? "NaN");

async function rejects(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? String(e);
  }
}

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "budget-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monitriq Budget suite (monthly plan, derived spending, RLS)\n");
    await runner.run("Setup: profiles UTC", async () => {
      await updateProfile(userA.client, { timezone: "UTC" });
      await updateProfile(userB.client, { timezone: "UTC" });
    });

    // ---- PART A: creation, period, uniqueness, currency --------------------
    let usd = "";
    await runner.run("create_budget: monthly bounds, single currency, active, no seeded allocations", async () => {
      const b = await createBudget(userA.client, { currencyCode: "USD", month: "2026-03-20" });
      usd = b.id;
      assert(b.periodStart === "2026-03-01" && b.periodEnd === "2026-03-31", `bounds ${b.periodStart}..${b.periodEnd}`);
      assert(b.currencyCode === "USD" && b.status === "active", "currency/status");
      const cats = await getBudgetCategoryStatus(userA.client, b.id);
      assert(cats.length === 0, "a new budget must have no allocations and (with no spending) no rows");
      const s = await getBudgetSummary(userA.client, b.id);
      assert(s.plannedTotal === null && s.remaining === null, "no plan => no planned total and no fake-zero Remaining");
      assert(s.actualSpendingTotal === "0", `actual ${s.actualSpendingTotal}`);
    });

    await runner.run("duplicate (user, currency, month) is rejected; another currency and another month are allowed", async () => {
      assert((await rejects(() => createBudget(userA.client, { currencyCode: "USD", month: "2026-03-05" }))) !== null, "duplicate must fail");
      await createBudget(userA.client, { currencyCode: "EUR", month: "2026-03-01" });
      await createBudget(userA.client, { currencyCode: "USD", month: "2026-04-01" });
    });

    await runner.run("period CHECK: non-month-aligned bounds are rejected at the table", async () => {
      expectDenied(
        await userA.client.from("budgets").insert({ user_id: userA.id, currency_code: "GBP", period_start: "2026-03-05", period_end: "2026-03-31" }),
        "non-monthly period",
      );
    });

    await runner.run("negative planned amount rejected; explicit zero accepted and differs from Not budgeted", async () => {
      assert((await rejects(() => setBudgetCategoryAmount(userA.client, usd, "food", "-1"))) !== null, "negative must fail");
      await setBudgetCategoryAmount(userA.client, usd, "food", "0");
      const cats = await getBudgetCategoryStatus(userA.client, usd);
      const food = cats.find((c) => c.categoryCode === "food");
      assert(food?.isBudgeted === true && food.planned === "0.000000", `explicit zero must be budgeted, got ${JSON.stringify(food)}`);
      assert(!cats.some((c) => c.categoryCode === "housing"), "a category with no row and no spend is not listed");
    });

    await runner.run("planned amount precision beyond the currency's decimals is rejected", async () => {
      assert((await rejects(() => setBudgetCategoryAmount(userA.client, usd, "food", "10.005"))) !== null, "USD has 2 decimals");
    });

    await runner.run("unknown category code is rejected (canonical taxonomy only)", async () => {
      assert((await rejects(() => setBudgetCategoryAmount(userA.client, usd, "made_up_category", "5"))) !== null, "FK must reject");
    });

    // ---- PART B: derived spending semantics --------------------------------
    let bucket = "";
    let bucket2 = "";
    await runner.run("Setup USD buckets and mixed Money activity in March", async () => {
      bucket = (await createBucket(userA.client, { name: "USD Bank", currencyCode: "USD", bucketType: "bank_account" })).id;
      bucket2 = (await createBucket(userA.client, { name: "USD Cash", currencyCode: "USD", bucketType: "cash_wallet" })).id;
      await recordOpeningBalance(userA.client, { bucketId: bucket, amount: "10000", occurredAt: MAR });
      await recordMoneyReceived(userA.client, { bucketId: bucket, amount: "5000", categoryCode: "salary", occurredAt: MAR });
      await recordTransfer(userA.client, { sourceBucketId: bucket, destinationBucketId: bucket2, amount: "700", occurredAt: MAR });
      await setBudgetCategoryAmount(userA.client, usd, "food", "300.00");
      await setBudgetCategoryAmount(userA.client, usd, "transport_fuel", "100.00");
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "120.50", categoryCode: "food", occurredAt: MAR });
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "79.50", categoryCode: "food", occurredAt: "2026-03-31T23:00:00Z" });
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "150", categoryCode: "transport_fuel", occurredAt: MAR });
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "40", categoryCode: "entertainment", occurredAt: MAR });
    });

    await runner.run("actual spending excludes transfers, opening balances and money received; totals are exact", async () => {
      const s = await getBudgetSummary(userA.client, usd);
      const spent = new Decimal("120.50").plus("79.50").plus(150).plus(40);
      assert(d(s.actualSpendingTotal).eq(spent), `actual ${s.actualSpendingTotal} expected ${spent}`);
      assert(d(s.plannedTotal).eq(400), `planned ${s.plannedTotal}`);
      assert(d(s.remaining).eq(d(s.plannedTotal).minus(d(s.actualSpendingTotal))), "Remaining = Planned - Actual");
      assert(d(s.remaining).eq(new Decimal(400).minus(spent)), `remaining ${s.remaining}`);
    });

    await runner.run("category planned / spent / remaining; over-budget flagged with negative remaining", async () => {
      const cats = await getBudgetCategoryStatus(userA.client, usd);
      const food = cats.find((c) => c.categoryCode === "food")!;
      assert(d(food.spent).eq(200) && d(food.remaining).eq(100) && !food.isOver, `food ${JSON.stringify(food)}`);
      const fuel = cats.find((c) => c.categoryCode === "transport_fuel")!;
      assert(d(fuel.spent).eq(150) && d(fuel.remaining).eq(-50) && fuel.isOver === true, `fuel ${JSON.stringify(fuel)}`);
    });

    await runner.run("unbudgeted spending is surfaced, never hidden, and never auto-allocated", async () => {
      const cats = await getBudgetCategoryStatus(userA.client, usd);
      const ent = cats.find((c) => c.categoryCode === "entertainment")!;
      assert(ent.isBudgeted === false && ent.planned === null && ent.remaining === null && d(ent.spent).eq(40), `ent ${JSON.stringify(ent)}`);
      const s = await getBudgetSummary(userA.client, usd);
      assert(d(s.unbudgetedSpent).eq(40) && d(s.budgetedSpent).eq(350), `split ${s.budgetedSpent}/${s.unbudgetedSpent}`);
      assert(s.budgetedCategoryCount === 2, "no allocation may be auto-created");
    });

    await runner.run("over-budget never blocks Money: another spend still records", async () => {
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "500", categoryCode: "food", occurredAt: MAR });
      const s = await getBudgetSummary(userA.client, usd);
      assert(s.isOver === true && d(s.remaining).lt(0), "budget is now over");
    });

    await runner.run("voided spending is excluded", async () => {
      const ev = await recordMoneySpent(userA.client, { bucketId: bucket, amount: "77", categoryCode: "housing", occurredAt: MAR });
      const before = d((await getBudgetSummary(userA.client, usd)).actualSpendingTotal);
      await voidFinancialEvent(userA.client, ev.id);
      const after = d((await getBudgetSummary(userA.client, usd)).actualSpendingTotal);
      assert(before.minus(after).eq(77), `void must remove 77, before ${before} after ${after}`);
    });

    await runner.run("spending outside the period (Feb / Apr) is excluded", async () => {
      const before = (await getBudgetSummary(userA.client, usd)).actualSpendingTotal;
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "999", categoryCode: "food", occurredAt: "2026-02-28T12:00:00Z" });
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "999", categoryCode: "food", occurredAt: "2026-04-01T12:00:00Z" });
      assert((await getBudgetSummary(userA.client, usd)).actualSpendingTotal === before, "out-of-period spend leaked in");
    });

    await runner.run("Budget never persists actual spend: no actual column exists on Budget tables", async () => {
      const { data } = await userA.client.from("budgets").select("*").eq("id", usd).single();
      assert(!Object.keys(data ?? {}).some((k) => /actual|spent/i.test(k)), "budget row must not store spending");
    });

    await runner.run("debt payments: category debt_payment via money_spent counts; linked liability events do not", async () => {
      const cats0 = await getBudgetCategoryStatus(userA.client, usd);
      const base = d(cats0.find((c) => c.categoryCode === "debt_payment")?.spent ?? "0");
      await recordMoneySpent(userA.client, { bucketId: bucket, amount: "60", categoryCode: "debt_payment", occurredAt: MAR });
      const liab = await createLiability(userA.client, { name: "USD Loan", liabilityType: "loan", currencyCode: "USD", openingPrincipal: "1000" });
      const total0 = d((await getBudgetSummary(userA.client, usd)).actualSpendingTotal);
      await recordDebtPayment(userA.client, { liabilityId: liab.id, bucketId: bucket, principalAmount: "100", interestAmount: "10", feeAmount: "5", occurredAt: MAR });
      const total1 = d((await getBudgetSummary(userA.client, usd)).actualSpendingTotal);
      assert(total1.eq(total0), "linked Liabilities principal/interest/fee events must not be counted (V1 rule)");
      const cats1 = await getBudgetCategoryStatus(userA.client, usd);
      assert(d(cats1.find((c) => c.categoryCode === "debt_payment")!.spent).eq(base.plus(60)), "debt_payment money_spent counts");
    });

    // ---- PART C: obligations ------------------------------------------------
    await runner.run("upcoming obligations shown, same currency only, never counted as spending", async () => {
      const bJun = await createBudget(userA.client, { currencyCode: "USD", month: "2099-06-01" });
      await createObligation(userA.client, { name: "Rent", currencyCode: "USD", amount: "800", dueDate: "2099-06-10" });
      await createObligation(userA.client, { name: "Euro bill", currencyCode: "EUR", amount: "50", dueDate: "2099-06-10" });
      await createObligation(userA.client, { name: "Next month", currencyCode: "USD", amount: "20", dueDate: "2099-07-02" });
      const list = await getBudgetUpcomingCommitments(userA.client, bJun.id);
      assert(list.length === 1 && list[0].name === "Rent" && d(list[0].amount).eq(800), `commitments ${JSON.stringify(list)}`);
      const s = await getBudgetSummary(userA.client, bJun.id);
      assert(s.actualSpendingTotal === "0" && d(s.upcomingCommitmentsTotal).eq(800), "informational only");
      assert(s.remaining === null, "commitments must not create a Remaining");
      assert(s.periodState === "not_started" && s.daysElapsed === 0, `period state ${s.periodState}`);
    });

    // ---- PART D: multi-currency isolation -----------------------------------
    await runner.run("multi-currency: EUR budget sees only EUR spending; no aggregation/FX", async () => {
      const eur = (await listBudgets(userA.client)).find((b) => b.currencyCode === "EUR" && b.periodStart === "2026-03-01")!;
      const eb = (await createBucket(userA.client, { name: "EUR Bank", currencyCode: "EUR", bucketType: "bank_account" })).id;
      await recordOpeningBalance(userA.client, { bucketId: eb, amount: "1000", occurredAt: MAR });
      await recordMoneySpent(userA.client, { bucketId: eb, amount: "25", categoryCode: "food", occurredAt: MAR });
      await setBudgetCategoryAmount(userA.client, eur.id, "food", "100");
      const s = await getBudgetSummary(userA.client, eur.id);
      assert(d(s.actualSpendingTotal).eq(25) && s.currencyCode === "EUR", `EUR actual ${s.actualSpendingTotal}`);
      const u = await getBudgetSummary(userA.client, usd);
      assert(d(u.actualSpendingTotal).gt(25), "USD unaffected by EUR");
    });

    // ---- PART E: timezone ---------------------------------------------------
    await runner.run("timezone: the same instant lands in different months under different profile timezones", async () => {
      const gbpJan = await createBudget(userA.client, { currencyCode: "GBP", month: "2026-01-01" });
      const gbpFeb = await createBudget(userA.client, { currencyCode: "GBP", month: "2026-02-01" });
      const gb = (await createBucket(userA.client, { name: "GBP", currencyCode: "GBP", bucketType: "bank_account" })).id;
      await recordOpeningBalance(userA.client, { bucketId: gb, amount: "1000", occurredAt: "2026-01-01T00:00:00Z" });
      await recordMoneySpent(userA.client, { bucketId: gb, amount: "33", categoryCode: "food", occurredAt: "2026-01-31T23:30:00Z" });
      await updateProfile(userA.client, { timezone: "UTC" });
      assert(d((await getBudgetSummary(userA.client, gbpJan.id)).actualSpendingTotal).eq(33), "UTC: January");
      assert(d((await getBudgetSummary(userA.client, gbpFeb.id)).actualSpendingTotal).eq(0), "UTC: not February");
      await updateProfile(userA.client, { timezone: "Pacific/Kiritimati" });
      assert(d((await getBudgetSummary(userA.client, gbpJan.id)).actualSpendingTotal).eq(0), "Kiritimati: not January");
      assert(d((await getBudgetSummary(userA.client, gbpFeb.id)).actualSpendingTotal).eq(33), "Kiritimati: February");
      await updateProfile(userA.client, { timezone: "UTC" });
    });

    await runner.run("create_budget defaults to the current month in the profile timezone", async () => {
      const b = await createBudget(userA.client, { currencyCode: "CAD" });
      assert(b.periodStart.endsWith("-01") && b.periodStart <= new Date().toISOString().slice(0, 10), "current month start");
    });

    // ---- PART F: lifecycle --------------------------------------------------
    await runner.run("closed/archived budgets are read-only; reactivate restores editing; archive frees the slot", async () => {
      const b = await createBudget(userA.client, { currencyCode: "JPY", month: MAR_MONTH });
      await setBudgetCategoryAmount(userA.client, b.id, "food", "1000");
      await setBudgetStatus(userA.client, b.id, "closed");
      assert((await rejects(() => setBudgetCategoryAmount(userA.client, b.id, "food", "2000"))) !== null, "closed: edit blocked");
      assert((await rejects(() => removeBudgetCategoryAmount(userA.client, b.id, "food"))) !== null, "closed: remove blocked");
      const s = await getBudgetSummary(userA.client, b.id);
      assert(d(s.plannedTotal).eq(1000), "closed budget still readable");
      await setBudgetStatus(userA.client, b.id, "archived");
      const b2 = await createBudget(userA.client, { currencyCode: "JPY", month: MAR_MONTH });
      assert(b2.id !== b.id, "archived budget frees the slot");
      assert((await rejects(() => setBudgetStatus(userA.client, b.id, "active"))) !== null, "reactivating into an occupied slot must fail");
      await setBudgetStatus(userA.client, b2.id, "archived");
      await setBudgetStatus(userA.client, b.id, "active");
      await setBudgetCategoryAmount(userA.client, b.id, "food", "2000");
    });

    await runner.run("removing an allocation returns the category to Not budgeted", async () => {
      const removed = await removeBudgetCategoryAmount(userA.client, usd, "transport_fuel");
      assert(removed === true, "removed");
      const fuel = (await getBudgetCategoryStatus(userA.client, usd)).find((c) => c.categoryCode === "transport_fuel")!;
      assert(fuel.isBudgeted === false && fuel.planned === null && d(fuel.spent).eq(150), "unbudgeted again, spending still visible");
    });

    await runner.run("budget currency/period are immutable", async () => {
      expectDenied(await userA.client.from("budgets").update({ currency_code: "EUR" }).eq("id", usd), "currency update (no grant)");
      expectDenied(await userA.client.from("budgets").update({ period_start: "2026-05-01" }).eq("id", usd), "period update (no grant)");
    });

    // ---- PART G: expected money in (planning only) ---------------------------
    await runner.run("expected money in is planning only: no Money event, not in spending or cash", async () => {
      const b = await createBudget(userA.client, { currencyCode: "AUD", month: MAR_MONTH, expectedMoneyIn: "3000" });
      const s = await getBudgetSummary(userA.client, b.id);
      assert(d(s.expectedMoneyIn).eq(3000) && s.actualSpendingTotal === "0", "planning only");
      const { data } = await userA.client.from("financial_events").select("id").eq("event_type", "money_received");
      assert((data ?? []).length === 1, "only the one real USD salary event exists; Budget created no Money Received");
      assert((await rejects(() => createBudget(userA.client, { currencyCode: "NZD", month: MAR_MONTH, expectedMoneyIn: "-5" }))) !== null, "negative rejected");
    });

    // ---- PART H: future-Decisions boundary ------------------------------------
    await runner.run("budget_facts_for_date: total + category facts; empty when no budget", async () => {
      const facts = await getBudgetFactsForDate(userA.client, { currencyCode: "USD", onDate: "2026-03-10", categoryCode: "food" });
      const total = facts.find((f) => f.scope === "total")!;
      const cat = facts.find((f) => f.scope === "category")!;
      const s = await getBudgetSummary(userA.client, usd);
      assert(total.spent === s.actualSpendingTotal && total.remaining === s.remaining, "total facts match summary");
      assert(cat.categoryCode === "food" && d(cat.planned).eq(300), "category facts");
      const none = await getBudgetFactsForDate(userA.client, { currencyCode: "USD", onDate: "2031-01-15" });
      assert(none.length === 0, "no budget => no facts (never fabricated)");
    });

    // ---- PART I: security ---------------------------------------------------
    await runner.run("RLS: User B cannot see or read User A's budgets or allocations", async () => {
      expectFilteredToEmpty(await userB.client.from("budgets").select("*").eq("id", usd), "B reads A budget");
      expectFilteredToEmpty(await userB.client.from("budget_category_allocations").select("*").eq("budget_id", usd), "B reads A allocations");
      assert((await rejects(() => getBudgetSummary(userB.client, usd))) !== null, "summary for foreign budget must be not found");
      assert((await rejects(() => getBudgetCategoryStatus(userB.client, usd))) !== null, "category status for foreign budget must be not found");
      assert((await rejects(() => getBudgetUpcomingCommitments(userB.client, usd))) !== null, "commitments for foreign budget must be not found");
    });

    await runner.run("cross-tenant writes are impossible: forged allocation, RPC, status, delete", async () => {
      assert((await rejects(() => setBudgetCategoryAmount(userB.client, usd, "food", "1"))) !== null, "B set on A budget");
      assert((await rejects(() => removeBudgetCategoryAmount(userB.client, usd, "food"))) !== null, "B remove on A budget");
      assert((await rejects(() => setBudgetStatus(userB.client, usd, "archived"))) !== null, "B archive A budget");
      expectDenied(
        await userB.client.from("budget_category_allocations").insert({ budget_id: usd, user_id: userA.id, spending_category_code: "family", planned_amount: 1 }),
        "B forges allocation as A",
      );
      expectDenied(
        await userB.client.from("budget_category_allocations").insert({ budget_id: usd, user_id: userB.id, spending_category_code: "family", planned_amount: 1 }),
        "B inserts allocation under own id on A budget (composite FK)",
      );
      expectDenied(await userB.client.from("budgets").insert({ user_id: userA.id, currency_code: "USD", period_start: "2030-01-01", period_end: "2030-01-31" }), "B creates budget for A");
      const del = await userB.client.from("budget_category_allocations").delete().eq("budget_id", usd).select();
      assert((del.data ?? []).length === 0, "B delete removes nothing");
      const cats = await getBudgetCategoryStatus(userA.client, usd);
      assert(cats.some((c) => c.categoryCode === "food" && c.isBudgeted), "A allocation untouched");
    });

    await runner.run("B's own budget in the same currency/month is independent of A's (per-user uniqueness)", async () => {
      const bb = await createBudget(userB.client, { currencyCode: "USD", month: MAR_MONTH });
      const s = await getBudgetSummary(userB.client, bb.id);
      assert(s.actualSpendingTotal === "0" && s.plannedTotal === null, "B sees none of A's spending");
    });

    await runner.run("anonymous access is denied on tables and every Budget RPC", async () => {
      expectDenied(await anonClient.from("budgets").select("*"), "anon budgets");
      expectDenied(await anonClient.from("budget_category_allocations").select("*"), "anon allocations");
      expectDenied(await anonClient.rpc("create_budget", { p_currency_code: "USD" }), "anon create_budget");
      expectDenied(await anonClient.rpc("budget_summary", { p_budget_id: usd }), "anon budget_summary");
      expectDenied(await anonClient.rpc("budget_category_status", { p_budget_id: usd }), "anon budget_category_status");
      expectDenied(await anonClient.rpc("budget_facts_for_date", { p_currency_code: "USD" }), "anon budget_facts_for_date");
    });

    await runner.run("no direct DELETE grant on budgets; user_id/currency not insertable-by-trigger bypass", async () => {
      expectDenied(await userA.client.from("budgets").delete().eq("id", usd), "budgets delete");
    });
  } finally {
    await fixtures.cleanup();
  }

  const summary = runner.summary();
  console.log(`\n${summary.passed}/${summary.total} passed`);
  if (summary.failed > 0) {
    console.error(`\n${summary.failed} test(s) FAILED:`);
    for (const r of summary.results.filter((r) => !r.passed)) console.error(`  - ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Budget suite crashed:", err);
  process.exitCode = 1;
});
