/**
 * Budget UI/presentation suite (P0-E5-S2). Drives the real Budget domain
 * (LOCAL Supabase) and asserts what the screen derives from it via the
 * pure presentation layer, plus the Quick Add structure and source-level
 * guarantees (no money arithmetic in React, no second ledger).
 */
import { readFileSync } from "node:fs";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import { listCurrencies } from "../../../lib/domain/currency/repository.ts";
import { createBucket, recordMoneySpent, recordOpeningBalance, voidFinancialEvent } from "../../../lib/domain/money/repository.ts";
import { createObligation } from "../../../lib/domain/obligations/repository.ts";
import {
  createBudget, getBudgetCategoryStatus, getBudgetSummary, getBudgetUpcomingCommitments, listBudgets,
  removeBudgetCategoryAmount, setBudgetCategoryAmount, setBudgetStatus,
} from "../../../lib/domain/budget/repository.ts";
import {
  buildBudgetNav, buildBudgetOverview, buildCategoryRows, categoriesAvailableToAdd, resolveSelectedBudget,
  formatDueDate, todayInTimezone, validatePlannedAmount,
} from "../../../lib/domain/budget/presentation.ts";
import { QUICK_ADD_GROUPS, QUICK_ADD_SUBTITLE, QUICK_ADD_TITLE } from "../../../components/quick-add/options.ts";

const TODAY = todayInTimezone("UTC");
const MONTH = `${TODAY.slice(0, 7)}-01`;
const AT = `${TODAY.slice(0, 7)}-01T12:00:00Z`;

async function rejects(fn: () => Promise<unknown>) {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "budget-ui");
  const { userA, userB } = fx;
  const runner = new TestRunner();
  try {
    console.log("Monitriq Budget UI suite\n");
    const currencies = new Map((await listCurrencies(userA.client)).map((c) => [c.code, c]));
    await updateProfile(userA.client, { timezone: "UTC", preferred_currency: "NGN" });

    let ngn = ""; let usd = "";
    await runner.run("no budget: empty selection, nothing auto-created", async () => {
      const list = await listBudgets(userA.client);
      assert(list.length === 0, "new user has no budgets");
      assert(resolveSelectedBudget(list, { today: TODAY, preferredCurrency: "NGN" }) === null, "no selection => empty state");
    });

    await runner.run("create budget: NGN, current month, no seeded categories or income", async () => {
      const b = await createBudget(userA.client, { currencyCode: "NGN", month: MONTH });
      ngn = b.id;
      assert(b.expectedMoneyIn === null, "no invented income");
      const s = await getBudgetSummary(userA.client, ngn);
      const o = buildBudgetOverview(s, currencies);
      assert(!o.hasPlan && o.plannedLabel === "Not set yet" && o.remainingLabel === "—", "no fake amounts before planning");
      assert(o.remainingCaption === "Left to plan", "caption");
    });

    await runner.run("existing budget is selected for today; preferred currency wins; explicit id wins", async () => {
      const b2 = await createBudget(userA.client, { currencyCode: "USD", month: MONTH });
      usd = b2.id;
      const list = await listBudgets(userA.client);
      assert(resolveSelectedBudget(list, { today: TODAY, preferredCurrency: "NGN" })?.id === ngn, "preferred NGN");
      assert(resolveSelectedBudget(list, { today: TODAY, preferredCurrency: "USD" })?.id === usd, "preferred USD");
      assert(resolveSelectedBudget(list, { requestedId: usd, today: TODAY, preferredCurrency: "NGN" })?.id === usd, "explicit");
    });

    let bank = "";
    await runner.run("planned / spent / remaining render from canonical values (NGN)", async () => {
      bank = (await createBucket(userA.client, { name: "NGN Bank", currencyCode: "NGN", bucketType: "bank_account" })).id;
      await recordOpeningBalance(userA.client, { bucketId: bank, amount: "1000000", occurredAt: AT });
      await setBudgetCategoryAmount(userA.client, ngn, "food", "100000");
      await setBudgetCategoryAmount(userA.client, ngn, "housing", "400000");
      await recordMoneySpent(userA.client, { bucketId: bank, amount: "65000", categoryCode: "food", occurredAt: AT });
      const o = buildBudgetOverview(await getBudgetSummary(userA.client, ngn), currencies);
      assert(o.plannedLabel === "NGN 500,000" && o.spentLabel === "NGN 65,000" && o.remainingLabel === "NGN 435,000" && o.remainingCaption === "Left", JSON.stringify(o));
      const food = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies).budgeted.find((r) => r.categoryCode === "food")!;
      assert(food.remainingLabel === "NGN 35,000" && food.progressPercent === 65 && food.progressText === "65% used", JSON.stringify(food));
    });

    await runner.run("Money spending is reflected automatically, with no Budget write; void removes it", async () => {
      const before = (await getBudgetSummary(userA.client, ngn)).actualSpendingTotal;
      const ev = await recordMoneySpent(userA.client, { bucketId: bank, amount: "10000", categoryCode: "food", occurredAt: AT });
      const mid = buildBudgetOverview(await getBudgetSummary(userA.client, ngn), currencies);
      assert(mid.spentLabel === "NGN 75,000", `spent ${mid.spentLabel}`);
      await voidFinancialEvent(userA.client, ev.id);
      assert((await getBudgetSummary(userA.client, ngn)).actualSpendingTotal === before, "voided spend removed");
    });

    await runner.run("over budget: 'Over by', no blocking of Money", async () => {
      await recordMoneySpent(userA.client, { bucketId: bank, amount: "50000", categoryCode: "food", occurredAt: AT });
      const s = await getBudgetSummary(userA.client, ngn);
      const o = buildBudgetOverview(s, currencies);
      assert(s.isOver === false, "total still under");
      const food = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies).budgeted.find((r) => r.categoryCode === "food")!;
      assert(food.isOver && food.remainingCaption === "Over by" && food.remainingLabel === "NGN 15,000" && food.progressPercent === 100 && food.progressText === "Over budget", JSON.stringify(food));
      await recordMoneySpent(userA.client, { bucketId: bank, amount: "500000", categoryCode: "housing", occurredAt: AT });
      const o2 = buildBudgetOverview(await getBudgetSummary(userA.client, ngn), currencies);
      assert(o2.isOver && o2.remainingCaption === "Over by" && !o2.remainingLabel.startsWith("NGN -"), o2.remainingLabel);
      assert(o.plannedLabel === "NGN 500,000", "planned unchanged");
    });

    await runner.run("explicit zero differs from not budgeted", async () => {
      await setBudgetCategoryAmount(userA.client, ngn, "travel", "0");
      const rows = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies);
      const zero = rows.budgeted.find((r) => r.categoryCode === "travel")!;
      assert(zero.isExplicitZero && zero.plannedLabel === "NGN 0" && zero.progressText === "Planned zero", JSON.stringify(zero));
      assert(!rows.unbudgeted.some((r) => r.categoryCode === "travel"), "zero is not unbudgeted");
    });

    await runner.run("unbudgeted spending is visible; not auto-added; add allocation moves it", async () => {
      await recordMoneySpent(userA.client, { bucketId: bank, amount: "20000", categoryCode: "transport_fuel", occurredAt: AT });
      let rows = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies);
      const t = rows.unbudgeted.find((r) => r.categoryCode === "transport_fuel")!;
      assert(t.spentLabel === "NGN 20,000" && t.plannedLabel === null && t.progressText === "Not budgeted", JSON.stringify(t));
      assert(!rows.budgeted.some((r) => r.categoryCode === "transport_fuel"), "not auto-allocated");
      await setBudgetCategoryAmount(userA.client, ngn, "transport_fuel", "30000");
      rows = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies);
      assert(rows.budgeted.some((r) => r.categoryCode === "transport_fuel" && r.remainingLabel === "NGN 10,000"), "added");
      assert(rows.unbudgeted.length === 0, "no longer unbudgeted");
    });

    await runner.run("add category offers only canonical, unallocated categories", async () => {
      const { data } = await userA.client.from("money_spending_categories").select("code, display_name");
      const cats = await getBudgetCategoryStatus(userA.client, ngn);
      const addable = categoriesAvailableToAdd(data!, cats);
      assert(!addable.some((c) => ["food", "housing", "travel", "transport_fuel"].includes(c.code)), "allocated excluded");
      assert(addable.every((c) => data!.some((d) => d.code === c.code)), "canonical only");
    });

    await runner.run("edit allocation, then remove returns to unbudgeted (spend stays visible)", async () => {
      await setBudgetCategoryAmount(userA.client, ngn, "food", "200000");
      let rows = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies);
      assert(rows.budgeted.find((r) => r.categoryCode === "food")?.plannedLabel === "NGN 200,000", "edited");
      await removeBudgetCategoryAmount(userA.client, ngn, "food");
      rows = buildCategoryRows(await getBudgetCategoryStatus(userA.client, ngn), "NGN", currencies);
      assert(rows.unbudgeted.some((r) => r.categoryCode === "food" && r.spentLabel !== "NGN 0"), "spend still shown");
    });

    await runner.run("upcoming commitment shown separately, not spent; empty state when none", async () => {
      const c = await getBudgetUpcomingCommitments(userA.client, ngn);
      assert(c.length === 0, "none recorded yet => empty state");
      const before = (await getBudgetSummary(userA.client, ngn)).actualSpendingTotal;
      const due = `${TODAY.slice(0, 7)}-28`;
      await createObligation(userA.client, { name: "Rent", currencyCode: "NGN", amount: "200000", dueDate: due < TODAY ? TODAY : due });
      await createObligation(userA.client, { name: "USD bill", currencyCode: "USD", amount: "10", dueDate: due < TODAY ? TODAY : due });
      const after = await getBudgetUpcomingCommitments(userA.client, ngn);
      assert(after.length === 1 && after[0].name === "Rent" && after[0].amount.startsWith("200000"), JSON.stringify(after));
      assert((await getBudgetSummary(userA.client, ngn)).actualSpendingTotal === before, "commitment not counted as spent");
    });

    await runner.run("strict currency separation: NGN and USD budgets never merge", async () => {
      const un = buildBudgetOverview(await getBudgetSummary(userA.client, usd), currencies);
      assert(un.spentLabel === "USD 0" && un.currencyCode === "USD", "USD budget unaffected by NGN spend");
      const nav = buildBudgetNav(await listBudgets(userA.client), (await listBudgets(userA.client)).find((b) => b.id === ngn)!);
      assert(nav.sameMonth.map((b) => b.currencyCode).join() === "NGN,USD", "two separate budgets in nav");
      const ov = buildBudgetOverview(await getBudgetSummary(userA.client, ngn), currencies);
      assert(ov.spentLabel.startsWith("NGN") && !ov.spentLabel.includes("USD"), "no cross-currency total");
    });

    await runner.run("closed budget is read-only; reopen restores editing", async () => {
      await setBudgetStatus(userA.client, usd, "closed");
      const o = buildBudgetOverview(await getBudgetSummary(userA.client, usd), currencies);
      assert(o.readOnly && o.statusNote?.includes("closed") === true, "closed banner");
      assert(await rejects(() => setBudgetCategoryAmount(userA.client, usd, "food", "5")), "DB rejects edits");
      await setBudgetStatus(userA.client, usd, "active");
      await setBudgetCategoryAmount(userA.client, usd, "food", "5");
    });

    await runner.run("archived budget: hidden from default selection and nav, reachable by id, restorable", async () => {
      await setBudgetStatus(userA.client, usd, "archived");
      const list = await listBudgets(userA.client);
      assert(resolveSelectedBudget(list, { today: TODAY, preferredCurrency: "USD" })?.id === ngn, "falls back to live budget");
      const a = list.find((b) => b.id === usd)!;
      assert(resolveSelectedBudget(list, { requestedId: usd, today: TODAY, preferredCurrency: "NGN" })?.id === usd, "reachable by id");
      const o = buildBudgetOverview(await getBudgetSummary(userA.client, usd), currencies);
      assert(o.readOnly && o.statusNote?.includes("archived") === true, "archived banner");
      assert(!buildBudgetNav(list, list.find((b) => b.id === ngn)!).sameMonth.some((b) => b.id === a.id), "not in nav");
      await setBudgetStatus(userA.client, usd, "active");
    });

    await runner.run("due dates format deterministically (no locale hydration drift)", async () => {
      assert(formatDueDate("2026-10-30") === "Oct 30" && formatDueDate("2026-03-05") === "Mar 5", "format");
    });

    await runner.run("planned amount validation (explicit zero ok; precision by currency)", async () => {
      assert(validatePlannedAmount("0", 2) === null, "zero ok");
      assert(validatePlannedAmount("", 2) !== null, "empty rejected");
      assert(validatePlannedAmount("-5", 2) !== null, "negative rejected");
      assert(validatePlannedAmount("10.555", 2) !== null, "too precise");
      assert(validatePlannedAmount("10.5", 0) !== null, "JPY no decimals");
      assert(validatePlannedAmount("1250.50", 2) === null, "ok");
    });

    await runner.run("Quick Add: title, subtitle, Record/Plan groups, routes", async () => {
      assert(QUICK_ADD_TITLE === "Quick Add" && QUICK_ADD_SUBTITLE === "What would you like to do?", "copy");
      assert(QUICK_ADD_GROUPS.map((g) => g.heading).join() === "Record,Plan", "groups");
      const rec = QUICK_ADD_GROUPS[0].options.map((o) => o.title).join();
      assert(rec === "Money Received,Money Spent,Move Money,Asset / Investment", rec);
      const plan = QUICK_ADD_GROUPS[1];
      assert(plan.options.map((o) => o.title).join() === "Budget,Goal,Commitment,Check a Purchase" && plan.requiresBucket === false, "plan group");
      const href = (k: string) => plan.options.find((o) => o.key === k)!.href;
      assert(href("budget") === "/budget?quick=1", "Quick Add -> Budget");
      assert(href("goal") === "/goals?new=1", "Quick Add -> Goal");
      assert(href("commitment") === "/rules?add=commitment", "Quick Add -> Commitment");
    });

    await runner.run("Quick Add destinations are real: goals anchor, rules param, budget quick flag", async () => {
      assert(readFileSync("app/(app)/goals/page.tsx", "utf8").includes("openNew"), "goals new-goal param");
      const rules = readFileSync("app/(app)/rules/page.tsx", "utf8");
      assert(rules.includes('add === "commitment"'), "rules param");
      assert(readFileSync("app/(app)/budget/page.tsx", "utf8").includes('quick === "1"'), "budget quick");
    });

    await runner.run("Quick Add hub: no negative-inset hit-area pseudo-element (caused a 4px horizontal scroll); close target is 48px", async () => {
      const src = readFileSync("components/quick-add/QuickAddProvider.tsx", "utf8");
      const hub = src.slice(src.indexOf("QUICK_ADD_TITLE}</h2>"), src.indexOf("QUICK_ADD_GROUPS.map"));
      assert(!/before:-inset|-mr-|-mx-/.test(hub), "hub header must not extend outside its scroll container");
      assert(/h-12 w-12[^"]*"[^>]*aria-label="Close"/.test(hub), "close target is 48px");
    });

    await runner.run("runtime brand metadata is Monitriq only (no stale former name)", async () => {
      const site = readFileSync("lib/config/site.ts", "utf8");
      assert(site.includes('name: "Monitriq"'), "siteConfig name");
      for (const f of ["app/layout.tsx", "app/manifest.ts", "lib/config/site.ts", "components/brand/BrandLogo.tsx", "components/layout/HeaderBrand.tsx"]) {
        assert(!/Monatriq/i.test(readFileSync(f, "utf8")), `${f} contains the former product name`);
      }
    });

    await runner.run("no second ledger / no money arithmetic in Budget React; no advice copy", async () => {
      for (const f of ["components/budget/BudgetWorkspace.tsx", "components/budget/CategoryAmountSheet.tsx", "components/budget/CreateBudgetSheet.tsx", "components/home/BudgetHomeCard.tsx", "app/(app)/budget/page.tsx"]) {
        const src = readFileSync(f, "utf8");
        assert(!/parseFloat|Number\(|toFixed|financial_events|cash_movements/.test(src.replace(/new Decimal\([^)]*\)\.toFixed\(\)/g, "")), `${f}: forbidden money handling`);
        assert(!/you should|recommended|best allocation|50\/30\/20/i.test(src), `${f}: advice copy`);
      }
    });

    await runner.run("RLS: another user sees no budget and cannot open A's budget through the read model", async () => {
      assert((await listBudgets(userB.client)).length === 0, "B has none");
      assert(await rejects(() => getBudgetSummary(userB.client, ngn)), "B cannot read A's summary");
    });

    void todayInTimezone;
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
main().catch((e) => { console.error("Budget UI suite crashed:", e); process.exitCode = 1; });
