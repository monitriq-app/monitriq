/**
 * Core UI suite (P0-E5-S2B): Goals, Debts and Money Owed to You. Drives the
 * real Goals / Liabilities / Receivables / Money domains (LOCAL Supabase)
 * and asserts what each screen derives through its pure presentation layer,
 * plus source-level guarantees (no build-stage copy, no hardcoded user data,
 * theme tokens only, forms behind sheets).
 */
import { readdirSync, readFileSync } from "node:fs";
import { Decimal } from "decimal.js";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import { listCurrencies } from "../../../lib/domain/currency/repository.ts";
import { createBucket, getBucketBalances, recordOpeningBalance } from "../../../lib/domain/money/repository.ts";
import {
  createGoal, getGoalNativeCurrencyTotals, getGoalProtectedAllocationTotals, getGoalSummaries, listGoalTypes,
  recordGoalAllocation, recordGoalRelease, recordGoalReallocation,
} from "../../../lib/domain/goals/repository.ts";
import {
  createLiability, getLiabilityNativeCurrencyTotals, getLiabilitySummaries, listLiabilities, listLiabilityTypes, recordDebtPayment,
} from "../../../lib/domain/liabilities/repository.ts";
import {
  createReceivable, getReceivableNativeCurrencyTotals, getReceivableSummaries, recordRecovery,
} from "../../../lib/domain/receivables/repository.ts";
import { BUILD_STAGE_COPY, formatAmount, validateMoneyInput } from "../../../lib/domain/common/presentation.ts";
import { buildGoalCard, buildGoalsSummary, visibleGoals } from "../../../lib/domain/goals/presentation.ts";
import { DEBTS_EMPTY, buildDebtsView } from "../../../lib/domain/liabilities/presentation.ts";
import { MONEY_OWED_EMPTY, NOT_CASH_NOTE, buildMoneyOwedView } from "../../../lib/domain/receivables/presentation.ts";
import { QUICK_ADD_GROUPS } from "../../../components/quick-add/options.ts";
import { todayInTimezone } from "../../../lib/domain/budget/presentation.ts";

const TODAY = todayInTimezone("UTC");
const inDays = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const src = (f: string) => readFileSync(f, "utf8");
const D = (v: string | null | undefined) => new Decimal(v ?? "NaN");
const filesIn = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => `${dir}/${f}`);
const SCREENS = ["app/(app)/goals/page.tsx", "app/(app)/liabilities/page.tsx", "app/(app)/receivables/page.tsx"];
const SURFACES = [...SCREENS, ...filesIn("components/goals"), ...filesIn("components/liabilities"), ...filesIn("components/receivables"), "components/ui/Sheet.tsx"];

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "core-ui");
  const { userA } = fx;
  const runner = new TestRunner();
  const c = userA.client;
  try {
    console.log("Monitriq core UI suite (Goals, Debts, Money Owed)\n");
    await updateProfile(c, { timezone: "UTC", preferred_currency: "NGN" });
    const currencies = new Map((await listCurrencies(c)).map((x) => [x.code, x]));
    const goalTypes = await listGoalTypes(c);
    const liabilityTypes = await listLiabilityTypes(c);
    const typeLabels = new Map(liabilityTypes.map((t) => [t.code, t.display_name]));
    const summaryFor = async () => buildGoalsSummary(visibleGoals(await getGoalSummaries(c)), await getGoalNativeCurrencyTotals(c), await getGoalProtectedAllocationTotals(c), currencies, TODAY);
    const cards = async () => visibleGoals(await getGoalSummaries(c)).map((g) => ({ g, v: buildGoalCard(g, currencies) }));

    // ---------------- GOALS ----------------
    await runner.run("1 no goals: empty list, zero summary, nothing seeded", async () => {
      const s = await summaryFor();
      assert((await cards()).length === 0 && s.activeCount === 0 && s.setAside.length === 0 && s.nextTargetDate === null, "empty");
    });

    let bank = "";
    let ngnHome = "";
    await runner.run("2 one goal (NGN cash target) with target date; 5 zero progress reads 'Not funded yet' with no empty rail", async () => {
      bank = (await createBucket(c, { name: "NGN Bank", currencyCode: "NGN", bucketType: "bank_account" })).id;
      await recordOpeningBalance(c, { bucketId: bank, amount: "2000000" });
      const g = await createGoal(c, { goalTypeCode: "home_property", measurementType: "cash_target", name: "House Purchase", currencyCode: "NGN", targetValue: "12000000", targetDate: inDays(400), isProtected: true });
      ngnHome = g.id;
      const [{ v }] = await cards();
      assert(v.headline === "NGN 0 of NGN 12,000,000", v.headline);
      assert(v.zeroState === "Not funded yet" && v.progressPercent === null, "zero state, no rail");
      assert(v.isProtected && v.typeLabel === "Home / Property", "protected + type");
      assert(v.canSetAside, "can set money aside");
    });

    await runner.run("S2C Protected tile: protected goal with no money set aside shows the count and 'No money set aside', not a zero amount", async () => {
      const s = await summaryFor();
      assert(s.protectedCount === 1 && s.protectedSetAside.length === 0 && s.protectedNote === "No money set aside", JSON.stringify(s));
      const ws = src("components/goals/GoalsWorkspace.tsx");
      assert(/summary\.protectedNote/.test(ws), "tile renders the note");
    });

    await runner.run("7 required pace is the domain's own figure, labelled 'Required pace' (never advice); 8 unavailable without a date", async () => {
      const goal = (await getGoalSummaries(c)).find((x) => x.goalId === ngnHome)!;
      const v = buildGoalCard(goal, currencies);
      assert(goal.requiredPaceStatus === "calculated" && v.paceLabel === `${formatAmount(goal.requiredPaceAmount!, "NGN", currencies)} / month`, `pace ${v.paceLabel}`);
      assert(/month/.test(v.paceNote ?? ""), "periods remaining shown");
      const g2 = await createGoal(c, { goalTypeCode: "emergency_reserve", measurementType: "cash_target", name: "Emergency Reserve", currencyCode: "NGN", targetValue: "600000" });
      const v2 = buildGoalCard((await getGoalSummaries(c)).find((x) => x.goalId === g2.id)!, currencies);
      assert(v2.paceLabel === null && v2.paceNote?.startsWith("Add a target date") === true && v2.targetDateLabel === null, "no date => no fabricated pace");
      const text = src("components/goals/GoalsWorkspace.tsx") + src("components/goals/GoalDetailSheet.tsx");
      assert(/Required pace/.test(text) && !/Recommended contribution|recommended/i.test(text), "wording");
    });

    await runner.run("6 nonzero progress after Set Money Aside; cash accounts unchanged (purpose, not a transfer)", async () => {
      const before = (await getBucketBalances(c)).find((b) => b.bucketId === bank)!.amount;
      await recordGoalAllocation(c, { goalId: ngnHome, bucketId: bank, amount: "500000" });
      const after = (await getBucketBalances(c)).find((b) => b.bucketId === bank)!.amount;
      assert(D(before).eq(D(after)), "allocation must not move cash");
      const goal = (await getGoalSummaries(c)).find((x) => x.goalId === ngnHome)!;
      const v = buildGoalCard(goal, currencies);
      assert(v.headline === "NGN 500,000 of NGN 12,000,000" && v.zeroState === null, v.headline);
      assert(v.progressPercent === goal.percentage && v.progressPercent !== null && v.progressPercent > 0, "rail from canonical percentage");
    });

    await runner.run("9 create goal (all canonical types offered); 3 multiple goals; income and step goals honest", async () => {
      assert(goalTypes.length === 13 && goalTypes.some((t) => t.code === "relocation"), "canonical goal types");
      await createGoal(c, { goalTypeCode: "recurring_income", measurementType: "monthly_income_target", name: "Monthly income", currencyCode: "NGN", targetValue: "900000" });
      await createGoal(c, { goalTypeCode: "relocation", measurementType: "milestone", name: "Move abroad" });
      const all = await cards();
      assert(all.length === 4, "four goals");
      const inc = all.find((x) => x.g.name === "Monthly income")!.v;
      assert(inc.kind === "income" && inc.paceNote === "Your current income is not tracked here yet." && inc.progressPercent === null, "income is not faked");
      const steps = all.find((x) => x.g.name === "Move abroad")!.v;
      assert(steps.kind === "steps" && steps.headline === "No steps added yet" && !steps.canSetAside, "steps goal");
    });

    await runner.run("12/13/14 NGN and USD goals stay separate; no cross-currency total", async () => {
      const ub = (await createBucket(c, { name: "USD Bank", currencyCode: "USD", bucketType: "bank_account" })).id;
      await recordOpeningBalance(c, { bucketId: ub, amount: "5000" });
      const usd = await createGoal(c, { goalTypeCode: "travel", measurementType: "cash_target", name: "Trip", currencyCode: "USD", targetValue: "3000" });
      await recordGoalAllocation(c, { goalId: usd.id, bucketId: ub, amount: "250" });
      const s = await summaryFor();
      assert(s.setAside.map((l) => l.label).join("|") === "NGN 500,000|USD 250", s.setAside.map((l) => l.label).join("|"));
      assert(s.protectedCount === 1 && s.protectedSetAside.length === 1 && s.protectedSetAside[0].currencyCode === "NGN" && s.protectedNote === null, "protected money shown per currency, no empty-note");
      const ui = SURFACES.filter((f) => f.includes("goals")).map(src).join("\n");
      assert(!/Total Goals|Total goals|grand total/i.test(ui), "no combined total copy");
      const usdCard = (await cards()).find((x) => x.g.name === "Trip")!.v;
      assert(usdCard.headline === "USD 250 of USD 3,000", usdCard.headline);
    });

    await runner.run("11 release / move stay available but are secondary (inside Manage, not on the card)", async () => {
      const ws = src("components/goals/GoalsWorkspace.tsx");
      const detail = src("components/goals/GoalDetailSheet.tsx");
      assert(!/>\s*Release|Release or move|Reallocate/.test(ws.replace(/ReleaseMoveSheet/g, "")), "no release/move action on the overview card");
      assert(detail.indexOf("Manage this goal") !== -1 && detail.indexOf("Release or move money") > detail.indexOf("Manage this goal"), "behind Manage");
      const other = (await getGoalSummaries(c)).find((g) => g.name === "Emergency Reserve")!;
      await recordGoalReallocation(c, { fromGoalId: ngnHome, toGoalId: other.goalId, bucketId: bank, amount: "100000" });
      await recordGoalRelease(c, { goalId: other.goalId, bucketId: bank, amount: "40000" });
      const totals = await getGoalNativeCurrencyTotals(c);
      assert(D(totals.find((t) => t.currencyCode === "NGN")!.amount).eq(460000), "domain behaviour preserved (500000 - 40000)");
    });

    await runner.run("10/9 creation and set-aside live in sheets, not permanent forms on the page", async () => {
      const page = src("app/(app)/goals/page.tsx");
      assert(!/CreateGoalForm|AllocateCashForm|ReleaseReallocateForm/.test(page), "no raw forms on page");
      assert(/Sheet/.test(src("components/goals/CreateGoalSheet.tsx")) && /Sheet/.test(src("components/goals/SetAsideSheet.tsx")), "sheets");
      assert(/Protect this goal/.test(src("lib/domain/goals/presentation.ts")) && /You can still use it/.test(src("lib/domain/goals/presentation.ts")), "protection copy");
    });

    // ---------------- DEBTS ----------------
    await runner.run("15 no debts: plain empty state with Add Debt", async () => {
      const v = buildDebtsView(await getLiabilitySummaries(c), await getLiabilityNativeCurrencyTotals(c), typeLabels, new Map(), currencies);
      assert(v.cards.length === 0 && v.totals.length === 0, "empty");
      assert(DEBTS_EMPTY.title === "No debts tracked yet." && DEBTS_EMPTY.action === "Add Debt" && /financial picture and spending decisions/.test(DEBTS_EMPTY.body), "copy");
    });

    let loan = "";
    await runner.run("16/19/21/22 create debt: optional interest and maturity absent are not shown; current amount shown", async () => {
      const l = await createLiability(c, { name: "Car loan", liabilityType: "loan", currencyCode: "NGN", openingPrincipal: "3500000" });
      loan = l.id;
      const v = buildDebtsView(await getLiabilitySummaries(c), await getLiabilityNativeCurrencyTotals(c), typeLabels, new Map(), currencies);
      const d = v.cards[0];
      assert(d.owedLabel === "NGN 3,500,000" && d.typeLabel === "Loan", "amount + type");
      assert(d.interestLabel === null && d.maturityLabel === null, "empty optionals hidden");
      assert(!d.details.some((x) => x.label === "Owed to"), "no lender when not entered");
    });

    await runner.run("17/20/21/23 multiple debts: interest, maturity and lender present; NGN and USD totals separate", async () => {
      await createLiability(c, { name: "Card", liabilityType: "credit_facility", currencyCode: "USD", openingPrincipal: "1200", counterparty: "First Bank", interestRate: 24, maturityDate: "2027-07-15T00:00:00Z" });
      const rows = await listLiabilities(c);
      const cp = new Map(rows.map((r) => [r.id, r.counterparty]));
      const v = buildDebtsView(await getLiabilitySummaries(c), await getLiabilityNativeCurrencyTotals(c), typeLabels, cp, currencies);
      assert(v.cards.length === 2 && v.totals.map((t) => t.label).join("|") === "NGN 3,500,000|USD 1,200", v.totals.map((t) => t.label).join("|"));
      const card = v.cards.find((x) => x.name === "Card")!;
      assert(card.interestLabel === "24% interest" && card.maturityLabel === "Final payment Jul 2027", `${card.interestLabel} / ${card.maturityLabel}`);
      assert(card.details.some((x) => x.label === "Owed to" && x.value === "First Bank"), "lender shown when present");
    });

    await runner.run("18 current outstanding updates after a payment (canonical), and payment is a real cash event", async () => {
      const before = D((await getBucketBalances(c)).find((b) => b.bucketId === bank)!.amount);
      await recordDebtPayment(c, { liabilityId: loan, bucketId: bank, principalAmount: "500000" });
      const v = buildDebtsView(await getLiabilitySummaries(c), await getLiabilityNativeCurrencyTotals(c), typeLabels, new Map(), currencies);
      assert(v.cards.find((x) => x.name === "Car loan")!.owedLabel === "NGN 3,000,000" && v.totals[0].label === "NGN 3,000,000", "owed reduced");
      const after = D((await getBucketBalances(c)).find((b) => b.bucketId === bank)!.amount);
      assert(before.minus(after).eq(500000), "cash left the account");
    });

    await runner.run("24 Pay Down Debt handoff: Decisions links to /liabilities, which is a production page with Add Debt", async () => {
      assert(/href="\/liabilities"/.test(src("components/decisions/DecisionReviewSheet.tsx")), "handoff link");
      const page = src("app/(app)/liabilities/page.tsx") + src("components/liabilities/DebtsWorkspace.tsx");
      assert(/DEBTS_EMPTY/.test(page) && /Add Debt/.test(page) && !BUILD_STAGE_COPY.test(page), "production page");
    });

    await runner.run("Debts wording: 'Debts', plain field labels, no raw internal names", async () => {
      const t = src("components/liabilities/DebtsWorkspace.tsx") + src("components/liabilities/AddDebtSheet.tsx") + src("lib/domain/liabilities/presentation.ts");
      assert(/Starting amount owed/.test(t) && /Who do you owe\?/.test(t), "labels");
      assert(!/Opening principal|Counterparty \(|Liabilit(y|ies)<|>Liabilit/.test(t.replace(/Liabilit\w+(Summary|Type|Input|Update|Workspace|s\b)|liabilit\w+/g, "")), "no jargon in user-facing copy");
      assert(!/CreateLiabilityForm|DebtPaymentForm/.test(src("app/(app)/liabilities/page.tsx")), "no raw forms on page");
    });

    // ---------------- MONEY OWED ----------------
    await runner.run("25 no receivables: honest empty state", async () => {
      const v = buildMoneyOwedView(await getReceivableSummaries(c), await getReceivableNativeCurrencyTotals(c), currencies);
      assert(v.cards.length === 0 && MONEY_OWED_EMPTY.title === "No money owed to you is being tracked." && MONEY_OWED_EMPTY.action === "Add Money Owed", "empty");
    });

    let rec = "";
    await runner.run("26/30/31/32/34 create: expected date and estimate optional; not cash", async () => {
      const bal0 = await getBucketBalances(c);
      const r = await createReceivable(c, { name: "Consulting invoice", currencyCode: "NGN", faceAmount: "800000" });
      rec = r.id;
      const v1 = buildMoneyOwedView(await getReceivableSummaries(c), await getReceivableNativeCurrencyTotals(c), currencies);
      const card = v1.cards[0];
      assert(card.outstandingLabel === "NGN 800,000" && card.expectedDateLabel === null && card.estimateLabel === null && card.followUpLabel === null, "optionals absent");
      const bal1 = await getBucketBalances(c);
      assert(JSON.stringify(bal0) === JSON.stringify(bal1), "creating money owed must not change any cash balance");
      assert(/not cash/.test(NOT_CASH_NOTE), "not-cash note");
    });

    await runner.run("27/29/30/31/35 multiple; estimate and date present; NGN/USD separate", async () => {
      await createReceivable(c, { name: "Client refund", currencyCode: "USD", faceAmount: "300", expectedPaymentDate: "2026-12-05", estimatedRecoverableValue: "200" });
      const v = buildMoneyOwedView(await getReceivableSummaries(c), await getReceivableNativeCurrencyTotals(c), currencies);
      assert(v.cards.length === 2 && v.outstandingTotals.map((t) => t.label).join("|") === "NGN 800,000|USD 300", v.outstandingTotals.map((t) => t.label).join("|"));
      const usd = v.cards.find((x) => x.currencyCode === "USD")!;
      assert(usd.expectedDateLabel === "Dec 5, 2026" && usd.estimateLabel === "USD 200", `${usd.expectedDateLabel} ${usd.estimateLabel}`);
      assert(usd.details[0].label === "Amount owed in total", "'Amount owed' wording, not face amount");
    });

    await runner.run("28/33/34 Record Recovery: cash rises by the amount, outstanding falls, recovered shown; action preserved", async () => {
      const before = D((await getBucketBalances(c)).find((b) => b.bucketId === bank)!.amount);
      await recordRecovery(c, { receivableId: rec, bucketId: bank, amount: "300000" });
      const after = D((await getBucketBalances(c)).find((b) => b.bucketId === bank)!.amount);
      assert(after.minus(before).eq(300000), "canonical cash increase");
      const v = buildMoneyOwedView(await getReceivableSummaries(c), await getReceivableNativeCurrencyTotals(c), currencies);
      const card = v.cards.find((x) => x.receivableId === rec)!;
      assert(card.outstandingLabel === "NGN 500,000" && card.recoveredLabel === "NGN 300,000" && card.canRecord, "outstanding + recovered");
      assert(/Record Recovery/.test(src("components/receivables/MoneyOwedWorkspace.tsx")) && /recordRecovery/.test(src("components/receivables/RecordRecoverySheet.tsx")), "canonical action preserved");
    });

    await runner.run("33b fully recovered receivable is marked settled and cannot record more", async () => {
      await recordRecovery(c, { receivableId: rec, bucketId: bank, amount: "500000" });
      const card = buildMoneyOwedView(await getReceivableSummaries(c), await getReceivableNativeCurrencyTotals(c), currencies).cards.find((x) => x.receivableId === rec)!;
      assert(card.isSettled && !card.canRecord, "settled");
    });

    await runner.run("Money Owed wording and forms: no 'Face amount' by default, sheets only, not shown as available cash", async () => {
      const t = src("components/receivables/MoneyOwedWorkspace.tsx") + src("components/receivables/AddMoneyOwedSheet.tsx") + src("lib/domain/receivables/presentation.ts");
      assert(!/Face amount|face amount/.test(t.replace(/faceAmount/g, "")), "no 'Face amount' in copy");
      assert(/Estimated amount you expect to recover/.test(t) && /not guaranteed cash/.test(t), "estimate wording");
      assert(!/Available Cash|available cash/i.test(src("components/receivables/MoneyOwedWorkspace.tsx")), "never labelled available cash");
      const page = src("app/(app)/receivables/page.tsx");
      assert(!/CreateReceivableForm|RecordRecoveryForm/.test(page), "no raw forms on page");
    });

    // ---------------- GLOBAL ----------------
    await runner.run("37 no foundation-level / build-stage copy on the three screens or their components", async () => {
      for (const f of SURFACES) assert(!BUILD_STAGE_COPY.test(src(f)), `${f} exposes build-stage copy`);
    });

    await runner.run("38 no hardcoded user-specific data or NGN-only logic in the new surfaces", async () => {
      const files = [...SURFACES, "lib/domain/goals/presentation.ts", "lib/domain/liabilities/presentation.ts", "lib/domain/receivables/presentation.ts", "lib/domain/common/presentation.ts"];
      for (const f of files) {
        const t = src(f);
        assert(!/Victor|\bVee\b|BMW|Lakowe|Autodrip|Nigeria/i.test(t), `${f}: user-specific string`);
        assert(!/["'`]NGN["'`]/.test(t.replace(/placeholder="[^"]*"/g, "")), `${f}: hardcoded NGN`);
      }
    });

    await runner.run("39/40 themes: shared tokens only (no hex colours, no per-page dark: fork) in the new surfaces", async () => {
      for (const f of SURFACES) {
        const t = src(f);
        assert(!/#[0-9a-fA-F]{3,8}\b/.test(t), `${f}: hardcoded colour`);
        assert(!/\bdark:/.test(t), `${f}: page-specific dark fork`);
      }
    });

    await runner.run("36 mobile safety (source): currency values wrap, targets are 48px, sheets use safe-area padding", async () => {
      const sheet = src("components/ui/Sheet.tsx");
      assert(/safe-area-inset-bottom/.test(sheet) && /h-12 w-12/.test(sheet), "sheet");
      for (const f of ["components/goals/GoalsWorkspace.tsx", "components/liabilities/DebtsWorkspace.tsx", "components/receivables/MoneyOwedWorkspace.tsx"]) {
        assert(/break-words/.test(src(f)) && /min-h-12/.test(src(f)), `${f}: wrap + 48px`);
      }
    });

    await runner.run("S2C secondary pages (Debts, Money Owed, Rules) share one accessible Back control, not added to primary nav", async () => {
      const back = src("components/layout/BackLink.tsx");
      assert(/min-h-12/.test(back) && /aria-label/.test(back) && /router\.back\(\)/.test(back) && /fallbackHref = "\/home"/.test(back), "48px, labelled, history + Home fallback");
      for (const f of ["components/liabilities/DebtsWorkspace.tsx", "components/receivables/MoneyOwedWorkspace.tsx", "app/(app)/rules/page.tsx"]) assert(/<BackLink/.test(src(f)), `${f} uses BackLink`);
      for (const f of ["components/layout/MobileBottomNav.tsx", "components/layout/DesktopNav.tsx"]) assert(!/liabilities|receivables|rules/.test(src(f)), `${f}: primary nav unchanged`);
    });

    await runner.run("Quick Add PLAN stays Budget / Goal / Commitment; Goal opens the new-goal sheet", async () => {
      const plan = QUICK_ADD_GROUPS[1].options;
      assert(plan.map((o) => o.title).slice(0, 3).join() === "Budget,Goal,Commitment" && plan.length === 4, "Budget, Goal, Commitment unchanged; P0-E5-S3 adds Check a Purchase");
      assert(plan.find((o) => o.key === "goal")!.href === "/goals?new=1" && /openNew === "1"|new: openNew/.test(src("app/(app)/goals/page.tsx")), "goal deep link");
    });

    await runner.run("validation helper: exact-decimal string checks only", async () => {
      assert(validateMoneyInput("0", 2) !== null && validateMoneyInput("0", 2, { allowZero: true }) === null, "zero rules");
      assert(validateMoneyInput("1250.505", 2) !== null && validateMoneyInput("1250.50", 2) === null, "precision");
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
main().catch((e) => { console.error("Core UI suite crashed:", e); process.exitCode = 1; });
