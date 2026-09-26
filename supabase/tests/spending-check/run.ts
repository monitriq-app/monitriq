/**
 * Spending check suite (P0-E5-S3): "Can I afford this?". Drives the real
 * Money / Budget / Goals / Rules domains (LOCAL Supabase) through
 * runSpendingCheck() and asserts the result, the deterministic suggestion
 * policy, the no-side-effect guarantee, currency isolation and security.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Decimal } from "decimal.js";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectDenied } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import { listCurrencies } from "../../../lib/domain/currency/repository.ts";
import { createBucket, getBucketBalances, recordOpeningBalance, recordTransfer } from "../../../lib/domain/money/repository.ts";
import { createBudget, getBudgetSummary, setBudgetCategoryAmount, setBudgetStatus } from "../../../lib/domain/budget/repository.ts";
import { createGoal, getGoalSummaries, recordGoalAllocation } from "../../../lib/domain/goals/repository.ts";
import { createObligation, listObligations } from "../../../lib/domain/obligations/repository.ts";
import { createFinancialRule, getSafeToDeployByCurrency, listFinancialRules } from "../../../lib/domain/rules/repository.ts";
import { runSpendingCheck } from "../../../lib/domain/spending-check/service.ts";
import { presentSpendingCheck, purchaseCategories, SUGGESTION_LABEL } from "../../../lib/domain/spending-check/presentation.ts";
import { validateMoneyInput } from "../../../lib/domain/common/presentation.ts";
import { QUICK_ADD_GROUPS } from "../../../components/quick-add/options.ts";
import { todayInTimezone } from "../../../lib/domain/budget/presentation.ts";

const TODAY = todayInTimezone("UTC");
const MONTH = `${TODAY.slice(0, 7)}-01`;
const AT = `${TODAY.slice(0, 7)}-01T12:00:00Z`;
const src = (f: string) => readFileSync(f, "utf8");
const D = (v: string | null | undefined) => new Decimal(v ?? "NaN");
const filesIn = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => `${dir}/${f}`);
const SURFACES = [...filesIn("components/spending-check"), ...filesIn("lib/domain/spending-check"), "app/(app)/spending-check/page.tsx", "components/home/SpendingCheckCard.tsx"];

async function rejects(fn: () => Promise<unknown>) {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "spending-check");
  const { userA, userB, anonClient } = fx;
  const c = userA.client;
  const runner = new TestRunner();
  try {
    console.log("Monitriq spending check suite (Can I afford this?)\n");
    await updateProfile(c, { timezone: "UTC", preferred_currency: "NGN" });
    const currencies = new Map((await listCurrencies(c)).map((x) => [x.code, x]));
    const view = (r: Awaited<ReturnType<typeof runSpendingCheck>>, what = "Phone") => presentSpendingCheck(r, what, currencies);

    // ---------- NGN world ----------
    const ngn = (await createBucket(c, { name: "NGN Main", currencyCode: "NGN", bucketType: "bank_account" })).id;
    await recordOpeningBalance(c, { bucketId: ngn, amount: "1000000", occurredAt: AT });
    const check = (amount: string, category?: string, label?: string, bucket = ngn) => runSpendingCheck(c, { bucketId: bucket, amount, categoryCode: category ?? null, categoryLabel: label ?? null, description: "Phone" });

    await runner.run("1/6/16/25 enough cash but no Budget and no minimum cash: partial result, 'Review first', both gaps disclosed honestly", async () => {
      const r = await check("100000");
      assert(r.cash.canCover && r.cash.before === "1000000.000000" && D(r.cash.after).eq(900000), `cash ${JSON.stringify(r.cash)}`);
      assert(r.budget.state === "no_budget" && r.protection.minimumCash.state === "needs_setup", "states");
      assert(r.suggestion.state === "review", r.suggestion.state);
      const codes = r.suggestion.reasons.map((x) => x.code).sort().join();
      assert(codes === "minimum_cash_not_set,no_budget", codes);
      const v = view(r);
      assert(v.suggestionLabel === "Review first" && v.rows.find((x) => x.key === "budget")!.status === "Not available", "labels");
      assert(v.rows.find((x) => x.key === "budget")!.action?.href === "/budget?quick=1", "Create budget action");
      assert(v.rows.find((x) => x.key === "protected")!.status === "Needs setup" && v.rows.find((x) => x.key === "protected")!.action?.href === "/rules", "Set minimum cash action");
      assert(v.reasons.some((s) => /don't have an active budget for this month/.test(s)) && v.reasons.some((s) => /haven't chosen the amount of cash you want to keep/.test(s)), "plain-language reasons");
    });

    await runner.run("2/3 amount above the account cash -> 'Reduce the amount' with a factual reason; exact balance is allowed", async () => {
      const r = await check("1500000");
      assert(!r.cash.canCover && D(r.cash.shortBy).eq(500000) && r.suggestion.state === "reduce" && r.suggestion.reasons[0].code === "cash_insufficient", JSON.stringify(r.suggestion));
      assert(/does not currently have enough tracked cash/.test(view(r).reasons[0]) && /NGN 1,500,000|NGN 1,000,000/.test(view(r).reasons[0]) && !/overdraft|credit/i.test(view(r).reasons[0]), "factual wording, no overdraft assumption");
      const exact = await check("1000000");
      assert(exact.cash.canCover && D(exact.cash.after).eq(0) && exact.cash.shortBy === null, "exact balance can be covered");
    });

    await runner.run("4/5 zero, negative and malformed amounts are rejected (validation and the database)", async () => {
      for (const bad of ["0", "0.00", "-5", "abc", "1,000", "", "1.234"]) assert(validateMoneyInput(bad, 2) !== null, `client accepted ${bad}`);
      assert(validateMoneyInput("250000", 2) === null && validateMoneyInput("250000.50", 2) === null, "valid");
      assert(await rejects(() => check("0")), "DB rejects zero");
      assert(await rejects(() => check("-10")), "DB rejects negative");
    });

    // Budget: NGN 300,000 plan (food 100,000, housing 200,000)
    let ngnBudget = "";
    await runner.run("7/8/13 Budget exists: purchase within plan; no category selected says the category was not checked", async () => {
      const b = await createBudget(c, { currencyCode: "NGN", month: MONTH });
      ngnBudget = b.id;
      await setBudgetCategoryAmount(c, ngnBudget, "food", "100000");
      await setBudgetCategoryAmount(c, ngnBudget, "housing", "200000");
      const r = await check("50000");
      assert(r.budget.state === "checked" && D(r.budget.remainingBefore).eq(300000) && D(r.budget.remainingAfter).eq(250000) && r.budget.overBy === null, JSON.stringify(r.budget));
      assert(r.budget.category.state === "not_selected", "no category");
      const row = view(r).rows.find((x) => x.key === "budget")!;
      assert(row.note === "Category budget impact was not checked." && row.status === "Checked", "note");
    });

    await runner.run("Money transfers and received money do not affect the Budget check", async () => {
      const other = (await createBucket(c, { name: "NGN Savings", currencyCode: "NGN", bucketType: "savings_account" })).id;
      const before = (await check("50000")).budget.remainingBefore;
      await recordTransfer(c, { sourceBucketId: ngn, destinationBucketId: other, amount: "200000", occurredAt: AT });
      const after = (await check("50000", undefined, undefined, ngn)).budget.remainingBefore;
      assert(before === after, "transfer must not change Budget remaining");
      await recordTransfer(c, { sourceBucketId: other, destinationBucketId: ngn, amount: "200000", occurredAt: AT });
    });

    await runner.run("10/12 category within plan; unbudgeted category is explained, not punished, and not auto-added", async () => {
      const inPlan = await check("40000", "food", "Food");
      assert(inPlan.budget.category.state === "checked" && D(inPlan.budget.category.leftBefore).eq(100000) && D(inPlan.budget.category.leftAfter).eq(60000), JSON.stringify(inPlan.budget.category));
      const un = await check("10000", "travel", "Travel");
      assert(un.budget.category.state === "unbudgeted", "unbudgeted");
      const v = view(un);
      assert(v.rows.find((x) => x.key === "budget")!.note === "This category isn't in your budget.", "plain note");
      assert(!/bad|wrong|irresponsible/i.test(JSON.stringify(v)), "no judgement language");
      const cats = await getBudgetSummary(c, ngnBudget);
      assert(cats.budgetedCategoryCount === 2, "no allocation created for travel");
    });

    await runner.run("Set Minimum Cash to Keep (NGN 500,000): protection check becomes complete", async () => {
      await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: "NGN", thresholdValue: "500000" });
      const r = await check("50000");
      assert(r.protection.minimumCash.state === "checked" && D(r.protection.minimumCash.minimum).eq(500000), JSON.stringify(r.protection.minimumCash));
      const safe = (await getSafeToDeployByCurrency(c)).find((s) => s.currencyCode === "NGN")!;
      assert(r.protection.minimumCash.safeToDeployBefore === safe.safeToDeploy, "Safe to Deploy read verbatim from the Rules engine");
    });

    await runner.run("15/17/26/27/28/29 all configured checks clear -> 'Proceed within your plan' (deterministic, factual, no score)", async () => {
      const a = await check("40000", "food", "Food");
      const b = await check("40000", "food", "Food");
      assert(JSON.stringify(a) === JSON.stringify(b), "same input => same result");
      assert(a.suggestion.state === "proceed" && a.suggestion.reasons[0].code === "all_clear" && a.suggestion.caveats.length === 0, JSON.stringify(a.suggestion));
      const v = view(a);
      assert(v.suggestionLabel === "Proceed within your plan" && /stays within your current plan/.test(v.summary), v.summary);
      assert(!/definitely|good purchase|you should buy/i.test(JSON.stringify(v)), "no over-claiming");
      assert(!/score|rank|rating|risk/i.test(JSON.stringify(a)), "no score anywhere in the result");
      assert(D(a.protection.minimumCash.safeToDeployAfter).lt(D(a.protection.minimumCash.safeToDeployBefore)), "Safe to Deploy after is lower but still positive");
    });

    await runner.run("18/22 purchase crosses the minimum cash you chose -> 'Wait', naming the exact protection and amounts", async () => {
      const r = await check("600000");
      assert(r.suggestion.state === "wait", r.suggestion.state);
      const reason = r.suggestion.reasons.find((x) => x.code === "below_minimum_cash")!;
      assert(D(reason.amounts.belowBy).eq(100000) && D(reason.amounts.cashAfter).eq(400000) && D(reason.amounts.minimum).eq(500000), JSON.stringify(reason));
      const v = view(r);
      assert(v.reasons[0].includes("NGN 500,000") && v.reasons[0].includes("NGN 400,000") && v.reasons[0].includes("NGN 100,000"), v.reasons[0]);
      assert(v.suggestionLabel === "Wait", "label");
    });

    await runner.run("9/23 purchase exceeds the overall Budget with cash and protections fine -> 'Reduce the amount' (over by is exact)", async () => {
      const r = await check("350000");
      assert(r.suggestion.state === "reduce" && r.suggestion.reasons[0].code === "budget_over", JSON.stringify(r.suggestion));
      assert(D(r.budget.overBy).eq(50000) && D(r.budget.remainingBefore).eq(300000), JSON.stringify(r.budget));
      assert(/over your current plan/.test(view(r).reasons[0]), view(r).reasons[0]);
    });

    await runner.run("11/23 only the selected category exceeds its plan (overall Budget fine) -> 'Review first'", async () => {
      const r = await check("120000", "food", "Food");
      assert(r.budget.overBy === null && D(r.budget.category.overBy).eq(20000), JSON.stringify(r.budget));
      assert(r.suggestion.state === "review" && r.suggestion.reasons[0].code === "category_over", JSON.stringify(r.suggestion));
      const row = view(r).rows.find((x) => x.key === "budget")!;
      assert(row.lines.some((l) => l.label === "Over category budget by" && l.value === "NGN 20,000"), JSON.stringify(row.lines));
    });

    await runner.run("precedence: insufficient cash beats protected cash beats Budget", async () => {
      assert((await check("1500000")).suggestion.state === "reduce" && (await check("1500000")).suggestion.reasons[0].code === "cash_insufficient", "cash first");
      assert((await check("700000")).suggestion.state === "wait", "protection before budget (this also exceeds the Budget)");
    });

    await runner.run("14/40/41/42-side effects: a check creates no Money event and changes no Budget, Goal, obligation or rule", async () => {
      const snap = async () => JSON.stringify({
        events: (await c.from("financial_events").select("id")).data?.length,
        balances: await getBucketBalances(c),
        budget: await getBudgetSummary(c, ngnBudget),
        goals: await getGoalSummaries(c),
        obligations: await listObligations(c),
        rules: (await listFinancialRules(c)).length,
        safe: await getSafeToDeployByCurrency(c),
        decisions: (await c.from("decisions").select("id")).data?.length,
        allocations: (await c.from("goal_allocation_events").select("id")).data?.length,
      });
      const before = await snap();
      for (const a of ["50000", "600000", "1500000"]) await check(a, "food", "Food");
      assert((await snap()) === before, "state must be identical after checks");
    });

    // ---------- USD world (goal protection, no minimum cash) ----------
    const usd = (await createBucket(c, { name: "USD Bank", currencyCode: "USD", bucketType: "bank_account" })).id;
    await recordOpeningBalance(c, { bucketId: usd, amount: "1000", occurredAt: AT });
    await runner.run("31/33 USD check uses the USD account and never NGN protection; NGN minimum cash is not applied to USD", async () => {
      const r = await check("100", undefined, undefined, usd);
      assert(r.currencyCode === "USD" && r.protection.minimumCash.state === "needs_setup" && r.budget.state === "no_budget", JSON.stringify({ c: r.currencyCode, p: r.protection.minimumCash.state, b: r.budget.state }));
      assert(view(r).purchaseLabel.includes("USD 100") && !/NGN/.test(JSON.stringify(view(r))), "no NGN anywhere in a USD result");
    });

    await runner.run("19/16 purchase would use money protected for a goal -> 'Wait'; minimum cash gap still disclosed", async () => {
      const g = await createGoal(c, { goalTypeCode: "emergency_reserve", measurementType: "cash_target", name: "Emergency Reserve", currencyCode: "USD", targetValue: "800", isProtected: true });
      await recordGoalAllocation(c, { goalId: g.id, bucketId: usd, amount: "400" });
      const ok = await check("500", undefined, undefined, usd);
      assert(ok.protection.goals.moneyUsed === null, "500 leaves 500 >= 400 protected");
      const r = await check("700", undefined, undefined, usd);
      assert(r.suggestion.state === "wait" && r.suggestion.reasons[0].code === "uses_protected_goal_money" && D(r.suggestion.reasons[0].amounts.used).eq(100), JSON.stringify(r.suggestion));
      assert(r.suggestion.caveats.some((x) => x.code === "minimum_cash_not_set"), "incomplete protection still disclosed");
      assert(/USD 100 currently set aside for your goals/.test(view(r).reasons[0]), view(r).reasons[0]);
    });

    await runner.run("32/34 NGN purchase does not consume a USD Budget; USD Budget applies only to USD checks; no FX", async () => {
      const ub = await createBudget(c, { currencyCode: "USD", month: MONTH });
      await setBudgetCategoryAmount(c, ub.id, "food", "50");
      const usdCheck = await check("80", "food", "Food", usd);
      assert(usdCheck.budget.state === "checked" && D(usdCheck.budget.remainingBefore).eq(50) && D(usdCheck.budget.overBy).eq(30), JSON.stringify(usdCheck.budget));
      const ngnCheck = await check("50000", "food", "Food");
      assert(D(ngnCheck.budget.remainingBefore).eq(300000), "NGN budget untouched by USD");
      assert(!/convert|exchange rate|fx/i.test(SURFACES.map(src).join("\n")), "no FX in the feature");
    });

    // ---------- GBP world (commitment protection) ----------
    const gbp = (await createBucket(c, { name: "GBP Bank", currencyCode: "GBP", bucketType: "bank_account" })).id;
    await recordOpeningBalance(c, { bucketId: gbp, amount: "1000", occurredAt: AT });
    await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: "GBP", thresholdValue: "100" });
    await runner.run("20 upcoming commitment: spending that leaves a protected commitment uncovered is reported (canonical figure) -> 'Wait'", async () => {
      const goal = await createGoal(c, { goalTypeCode: "savings_target", measurementType: "cash_target", name: "Rent fund", currencyCode: "GBP", targetValue: "500" });
      await recordGoalAllocation(c, { goalId: goal.id, bucketId: gbp, amount: "500" });
      await createObligation(c, { name: "Rent", currencyCode: "GBP", amount: "500", dueDate: TODAY, isProtected: true, fundingGoalId: goal.id });
      const before = (await getSafeToDeployByCurrency(c)).find((s) => s.currencyCode === "GBP")!;
      const r = await check("700", undefined, undefined, gbp);
      assert(D(before.protectedCommitments).eq(500) && D(before.retainedDeficit).eq(0), "canonical: 500 protected for the commitment, no deficit yet");
      const reason = r.suggestion.reasons[0];
      assert(reason.code === "below_required_cash" && D(reason.amounts.required).eq(500) && D(reason.amounts.cashAfter).eq(300) && D(reason.amounts.belowBy).eq(200), JSON.stringify(reason));
      assert(/Monitriq is protecting GBP 500/.test(view(r).reasons[0]) && /GBP 200 below/.test(view(r).reasons[0]), view(r).reasons[0]);
      assert(r.suggestion.state === "wait", `state ${r.suggestion.state} ${JSON.stringify(r.suggestion)}`);
      const small = await check("100", undefined, undefined, gbp);
      assert(small.protection.commitments.shortfall === null, "small purchase leaves commitments covered");
    });

    const eur = (await createBucket(c, { name: "EUR Bank", currencyCode: "EUR", bucketType: "bank_account" })).id;
    await recordOpeningBalance(c, { bucketId: eur, amount: "1000", occurredAt: AT });
    await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: "EUR", thresholdValue: "100" });
    await runner.run("20b a funded commitment (protected goal linked to a protected obligation) that the purchase would leave uncovered names the exact canonical shortfall", async () => {
      const goal = await createGoal(c, { goalTypeCode: "savings_target", measurementType: "cash_target", name: "Rent fund", currencyCode: "EUR", targetValue: "500", isProtected: true });
      await recordGoalAllocation(c, { goalId: goal.id, bucketId: eur, amount: "500" });
      await createObligation(c, { name: "Rent", currencyCode: "EUR", amount: "500", dueDate: TODAY, isProtected: true, fundingGoalId: goal.id });
      const safe = (await getSafeToDeployByCurrency(c)).find((x) => x.currencyCode === "EUR")!;
      assert(D(safe.uncoveredProtectedObligations).eq(0), "commitment is fully backed before the purchase");
      const r = await check("700", undefined, undefined, eur);
      assert(r.protection.commitments.status === "conflict" && D(r.protection.commitments.shortfall).eq(200), JSON.stringify(r.protection.commitments));
      assert(r.suggestion.state === "wait", r.suggestion.state);
      const codes = r.suggestion.reasons.map((x) => x.code);
      assert(codes.includes("commitments_underprotected") && codes.includes("uses_protected_goal_money"), codes.join());
      assert(view(r).reasons.some((t) => /EUR 200 less than the amount currently set aside for upcoming payments/.test(t)), view(r).reasons.join(" | "));
      const ok = await check("300", undefined, undefined, eur);
      assert(ok.protection.commitments.shortfall === null && ok.suggestion.state !== "wait", "a smaller purchase keeps the commitment backed");
    });

    // ---------- S3A: only the ACTIVE Budget may drive the check ----------
    const world = async (code: string) => {
      const b = (await createBucket(c, { name: `${code} Bank`, currencyCode: code, bucketType: "bank_account" })).id;
      await recordOpeningBalance(c, { bucketId: b, amount: "1000", occurredAt: AT });
      await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: code, thresholdValue: "100" });
      const bud = await createBudget(c, { currencyCode: code, month: MONTH });
      await setBudgetCategoryAmount(c, bud.id, "food", "200");
      return { bucket: b, budget: bud.id };
    };
    const aud = await world("AUD");
    const cad = await world("CAD");
    const chf = await world("CHF");

    await runner.run("S3A-1 an ACTIVE Budget is used (planned, remaining and a real over-plan conflict)", async () => {
      const ok = await check("100", "food", "Food", aud.bucket);
      assert(ok.budget.state === "checked" && ok.budget.inactiveBudgetId === null && D(ok.budget.remainingBefore).eq(200) && ok.suggestion.state === "proceed", JSON.stringify({ b: ok.budget, s: ok.suggestion.state }));
      const over = await check("300", "food", "Food", aud.bucket);
      assert(over.suggestion.state === "reduce" && D(over.budget.overBy).eq(100), JSON.stringify(over.suggestion));
    });

    await runner.run("S3A-2/4/5 a CLOSED Budget is ignored: no Budget conflict, treated as no active budget, honest partial result", async () => {
      await setBudgetStatus(c, cad.budget, "closed");
      const r = await check("300", "food", "Food", cad.bucket);
      assert(r.budget.state === "no_budget" && r.budget.overBy === null && r.budget.remainingBefore === null && r.budget.category.state === "not_selected", JSON.stringify(r.budget));
      assert(r.suggestion.state === "review" && r.suggestion.reasons.some((x) => x.code === "no_budget") && !r.suggestion.reasons.some((x) => x.code === "budget_over" || x.code === "category_over"), JSON.stringify(r.suggestion));
      const v = view(r);
      const row = v.rows.find((x) => x.key === "budget")!;
      assert(row.status === "Not available" && /don't have an active budget for this month/.test(row.note ?? ""), JSON.stringify(row));
      assert(row.action?.href === `/budget?b=${cad.budget}` && row.action.label === "Open budget", "points at the closed budget so it can be reopened (a new one cannot be created for a month that already has one)");
      assert(!v.calc.some((x) => /Budget/.test(x.label)), "no Budget lines in the calculation");
      assert(r.cash.canCover && r.protection.minimumCash.state === "checked", "cash and protection are still evaluated");
    });

    await runner.run("S3A-3 an ARCHIVED Budget is ignored (no Budget check, create-budget action)", async () => {
      await setBudgetStatus(c, chf.budget, "archived");
      const r = await check("300", "food", "Food", chf.bucket);
      assert(r.budget.state === "no_budget" && r.budget.inactiveBudgetId === null && r.suggestion.state === "review", JSON.stringify(r.budget));
      assert(view(r).rows.find((x) => x.key === "budget")!.action?.href === "/budget?quick=1", "Create budget");
    });

    await runner.run("S3A-6 a closed CAD Budget does not affect an active AUD Budget, and a closed NGN Budget does not affect USD", async () => {
      const a = await check("100", "food", "Food", aud.bucket);
      assert(a.budget.state === "checked" && D(a.budget.remainingBefore).eq(200), "AUD still checked against its own active Budget");
      await setBudgetStatus(c, ngnBudget, "closed");
      const usdCheck = await check("80", "food", "Food", usd);
      assert(usdCheck.budget.state === "checked" && D(usdCheck.budget.overBy).eq(30), "USD Budget still applies");
      const ngnCheck = await check("50000", "food", "Food");
      assert(ngnCheck.budget.state === "no_budget" && ngnCheck.budget.inactiveBudgetId === ngnBudget, "NGN closed Budget is not used");
    });

    await runner.run("S3A closed Budget is not silently replaced by history: reopening it restores the Budget check", async () => {
      await setBudgetStatus(c, cad.budget, "active");
      const r = await check("100", "food", "Food", cad.bucket);
      assert(r.budget.state === "checked" && D(r.budget.remainingBefore).eq(200), JSON.stringify(r.budget));
      await setBudgetStatus(c, cad.budget, "closed");
    });

    await runner.run("S3A-7 no side effects remain true with closed/archived/active Budgets", async () => {
      const snap = async () => JSON.stringify({
        events: (await c.from("financial_events").select("id")).data?.length,
        balances: await getBucketBalances(c),
        budgets: await Promise.all([cad.budget, aud.budget, chf.budget, ngnBudget].map((id) => getBudgetSummary(c, id))),
        allocations: (await c.from("goal_allocation_events").select("id")).data?.length,
        decisions: (await c.from("decisions").select("id")).data?.length,
        statuses: (await c.from("budgets").select("id,status")).data,
      });
      const before = await snap();
      for (const w of [aud, cad, chf]) await check("300", "food", "Food", w.bucket);
      assert((await snap()) === before, "checks change nothing, including Budget status");
    });

    await runner.run("S3A the fix reuses the canonical Budget repository (no second engine, no Money re-summing, no schema change)", async () => {
      const svc = src("lib/domain/spending-check/service.ts");
      assert(/listBudgets/.test(svc) && /getBudgetFactsForDate/.test(svc), "canonical Budget reads");
      assert(!/financial_events|cash_movements|money_category_breakdown|\.from\(/.test(svc), "does not read or sum Money events");
    });

    // ---------- Integration / security ----------
    await runner.run("30 NGN world is independent (no cross-currency contamination of the USD/GBP checks)", async () => {
      const r = await check("50000");
      assert(r.currencyCode === "NGN" && D(r.protection.minimumCash.minimum).eq(500000), "NGN minimum cash 500,000 only");
    });

    await runner.run("43 User B cannot check against User A's account; User A's data is not exposed", async () => {
      assert(await rejects(() => runSpendingCheck(userB.client, { bucketId: ngn, amount: "1000" })), "foreign bucket rejected");
    });

    await runner.run("45 anonymous callers are denied the underlying reads; the page is behind the signed-in route boundary", async () => {
      expectDenied(await anonClient.rpc("evaluate_proposed_cash_use", { p_bucket_id: ngn, p_amount: 10 }), "anon evaluate");
      expectDenied(await anonClient.rpc("budget_facts_for_date", { p_currency_code: "NGN" }), "anon budget facts");
      assert(/getCurrentUser/.test(src("app/(app)/spending-check/page.tsx")), "page guards on the session");
      assert(/redirect\("\/login"\)|redirect\("\/onboarding"\)/.test(src("app/(app)/layout.tsx")), "(app) layout redirects anonymous users");
    });

    await runner.run("35/36/37 discoverability: Home CTA, Quick Add PLAN 'Check a Purchase', advanced Decisions link", async () => {
      assert(/SpendingCheckCard/.test(src("app/(app)/home/page.tsx")) && /href="\/spending-check"/.test(src("components/home/SpendingCheckCard.tsx")), "Home CTA");
      assert(/Can I afford this\?/.test(src("lib/domain/spending-check/presentation.ts")) && /Check a purchase before you spend\./.test(src("lib/domain/spending-check/presentation.ts")), "Home copy");
      assert(QUICK_ADD_GROUPS[0].options.map((o) => o.title).join() === "Money Received,Money Spent,Move Money,Asset / Investment", "RECORD unchanged");
      assert(QUICK_ADD_GROUPS[1].options.map((o) => o.title).join() === "Budget,Goal,Commitment,Check a Purchase" && QUICK_ADD_GROUPS[1].options[3].href === "/spending-check", "PLAN adds Check a Purchase");
      assert(/href="\/decisions"/.test(src("components/spending-check/SpendingCheckWorkspace.tsx")) && /Need a more detailed comparison\?/.test(src("components/spending-check/SpendingCheckWorkspace.tsx")), "Decisions link");
      const nav = src("components/layout/MobileBottomNav.tsx") + src("components/layout/DesktopNav.tsx");
      assert(!/spending-check/.test(nav), "no new primary nav tab");
    });

    await runner.run("42 'Record this purchase' only opens Money Spent pre-filled; nothing is recorded by the check", async () => {
      const ws = src("components/spending-check/SpendingCheckWorkspace.tsx");
      assert(/openSpent\(/.test(ws) && !/recordMoneySpent|record_money_spent/.test(SURFACES.map(src).join("\n")), "no direct write from the feature");
      const form = src("components/quick-add/MoneySpentForm.tsx");
      assert(/prefill\?\.amount/.test(form) && /await recordMoneySpent/.test(form), "the existing form does the recording, after the user presses Save");
      assert(/Nothing is recorded until you save/.test(ws), "explicit-confirmation copy");
    });

    await runner.run("policy is centralized: no suggestion logic or money arithmetic in JSX", async () => {
      const jsx = src("components/spending-check/SpendingCheckWorkspace.tsx");
      assert(!/Decimal|parseFloat|Number\(|toFixed|\.minus\(|\.plus\(/.test(jsx), "no arithmetic in components");
      assert(/decideSuggestion/.test(src("lib/domain/spending-check/policy.ts")) && !/decideSuggestion/.test(jsx), "policy lives in the domain service");
      assert(Object.keys(SUGGESTION_LABEL).length === 5, "five suggestion states");
    });

    await runner.run("44 no hardcoded personal data, no NGN-only logic, no AI/score copy in the feature", async () => {
      for (const f of SURFACES) {
        const t = src(f);
        assert(!/Victor|\bVee\b|BMW|Lakowe|Autodrip|Nigeria/i.test(t), `${f}: user-specific data`);
        assert(!/["'`]NGN["'`]/.test(t), `${f}: hardcoded NGN`);
        assert(!/affordab(le|ility) (score|engine)|AI recommend|risk score|health score/i.test(t), `${f}: opaque scoring language`);
      }
    });

    await runner.run("49/50 themes and mobile (source): tokens only, wrapping values, 48px targets", async () => {
      for (const f of [...filesIn("components/spending-check"), "components/home/SpendingCheckCard.tsx"]) {
        const t = src(f);
        assert(!/#[0-9a-fA-F]{3,8}\b/.test(t) && !/\bdark:/.test(t), `${f}: theme fork`);
      }
      const ws = src("components/spending-check/SpendingCheckWorkspace.tsx");
      assert(/break-words/.test(ws) && /min-h-12/.test(ws) && /h-12/.test(ws), "wrap + 48px");
      assert(purchaseCategories([{ code: "food" }, { code: "debt_payment" }]).length === 1, "debt payments are not a purchase category");
    });

    await runner.run("Money categories are canonical (the picker adds none)", async () => {
      const { data } = await c.from("money_spending_categories").select("code");
      assert(purchaseCategories(data!).length === data!.length - 1, "canonical list minus debt_payment");
    });
  } finally {
    await fx.cleanup();
  }
  const s = runner.summary();
  console.log(`\n${s.passed}/${s.total} passed`);
  if (s.failed > 0) {
    for (const r of s.results.filter((r) => !r.passed)) console.error(`  - ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error("Spending check suite crashed:", e); process.exitCode = 1; });
