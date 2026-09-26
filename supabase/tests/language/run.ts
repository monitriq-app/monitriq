/**
 * Adaptive financial language (P0-E5-S5). ONE engine, three explanation
 * styles. DB-backed tests for the preference (default, persistence,
 * constraint, RLS, anonymous) and for value invariance across modes; unit
 * tests for the typed vocabulary; source checks that the surfaces consume
 * the vocabulary instead of branching on the mode.
 */
import { readFileSync, readdirSync } from "node:fs";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectDenied } from "../shared/assert.ts";
import { getProfile, updateProfile } from "../../../lib/domain/profile/repository.ts";
import { listCurrencies } from "../../../lib/domain/currency/repository.ts";
import { createBucket, getBucketBalances, recordMoneySpent, recordOpeningBalance } from "../../../lib/domain/money/repository.ts";
import { createBudget, getBudgetSummary, setBudgetCategoryAmount } from "../../../lib/domain/budget/repository.ts";
import { createGoal, getGoalSummaries, recordGoalAllocation } from "../../../lib/domain/goals/repository.ts";
import { createLiability, getLiabilitySummaries } from "../../../lib/domain/liabilities/repository.ts";
import { createReceivable, getReceivableSummaries } from "../../../lib/domain/receivables/repository.ts";
import { createAsset, getAssetSummaries, listAssetTypes } from "../../../lib/domain/assets/repository.ts";
import { createFinancialRule, getSafeToDeployByCurrency } from "../../../lib/domain/rules/repository.ts";
import { getFinancialPositionSummary } from "../../../lib/domain/financial-position/repository.ts";
import { runSpendingCheck } from "../../../lib/domain/spending-check/service.ts";
import { presentSpendingCheck } from "../../../lib/domain/spending-check/presentation.ts";
import { cashStatus, cashStatusSentence } from "../../../lib/domain/rules/cash-status.ts";
import { debtsEmpty } from "../../../lib/domain/liabilities/presentation.ts";
import { moneyOwedEmpty } from "../../../lib/domain/receivables/presentation.ts";
import { availableExplanationCopy } from "../../../lib/domain/language/explain.ts";
import { assetBasisLabel, assetCurrentValueLabel } from "../../../lib/domain/language/assets.ts";
import { VOCABULARY, terminology, type TermKey } from "../../../lib/domain/language/terms.ts";
import { DEFAULT_LANGUAGE_MODE, LANGUAGE_MODES, LANGUAGE_MODE_OPTIONS, LANGUAGE_QUESTION, resolveLanguageMode, type FinancialLanguageMode } from "../../../lib/domain/language/types.ts";
import { todayInTimezone } from "../../../lib/domain/budget/presentation.ts";

const AT = `${todayInTimezone("UTC").slice(0, 7)}-01T12:00:00Z`;
const src = (f: string) => readFileSync(f, "utf8");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));
const money = (s: string) => [...new Set(s.match(/[A-Z]{3} -?\d[\d,]*\d(?:\.\d+)?|[A-Z]{3} -?\d/g) ?? [])].sort().join("|");

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "language");
  const { userA, userB, anonClient } = fx;
  const c = userA.client;
  const runner = new TestRunner();
  try {
    console.log("Monitriq adaptive financial language (one engine, three explanation styles)\n");

    await runner.run("1 a brand-new user defaults to 'simple' (database default) and existing/new rows are never null", async () => {
      const p = await getProfile(c);
      assert(p?.financial_language_mode === "simple", `got ${p?.financial_language_mode}`);
      assert(DEFAULT_LANGUAGE_MODE === "simple", "code default");
    });

    await runner.run("2/3/4/5 onboarding can select simple, balanced or financial through the profile boundary, and it persists", async () => {
      for (const mode of ["balanced", "financial", "simple"] as const) {
        const u = await updateProfile(c, { first_name: "Ada", preferred_name: null, preferred_currency: "NGN", timezone: "UTC", financial_language_mode: mode });
        assert(u.financial_language_mode === mode && u.onboarding_completed === true, `${mode} saved with onboarding`);
        const again = await getProfile(userA.client);
        assert(again?.financial_language_mode === mode, `${mode} persisted`);
      }
      const ob = src("components/onboarding/OnboardingForm.tsx");
      assert(ob.includes("LANGUAGE_QUESTION") && ob.includes("LanguageModeSelector") && /financial_language_mode: resolveLanguageMode\(values\.financial_language_mode\)/.test(ob), "onboarding form wiring (single form, one extra choice)");
      assert(LANGUAGE_QUESTION === "How would you like Monitriq to explain your money?", "question copy");
      assert(LANGUAGE_MODE_OPTIONS.map((o) => `${o.label}|${o.description}`).join("\n") === ["Keep it simple|Everyday words and clear explanations.", "Balanced|Simple explanations with financial terms when useful.", "Financial terms|Traditional financial wording and more detail."].join("\n"), "option copy");
      assert(!/beginner|intermediate|expert|literacy|knowledgeable/i.test((src("lib/domain/language/types.ts") + src("components/language/LanguageModeSelector.tsx")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")), "not a knowledge test (no levels or badges in user-facing code)");
    });

    await runner.run("6 settings change the preference immediately without signing out (profile update + server refresh)", async () => {
      const menu = src("components/layout/AccountMenu.tsx");
      assert(/Language &amp; explanations/.test(menu) && /LANGUAGE_SETTINGS_HEADING/.test(menu) && /updateProfile\(createClient\(\), \{ financial_language_mode: next \}\)/.test(menu) && /router\.refresh\(\)/.test(menu) && !/signOut/.test(menu.replace(/SignOutButton/g, "")), "settings wiring");
      assert(/LANGUAGE_SETTINGS_HEADING = "How Monitriq explains money"/.test(src("lib/domain/language/types.ts")), "heading");
      const u = await updateProfile(c, { financial_language_mode: "balanced" });
      assert(u.financial_language_mode === "balanced", "changed");
      await updateProfile(c, { financial_language_mode: "simple" });
    });

    await runner.run("7 missing, null or invalid values fall back safely to 'simple'; the database rejects invalid values", async () => {
      for (const bad of [undefined, null, "", "Simple", "expert", 3, {}, "FINANCIAL "]) assert(resolveLanguageMode(bad) === "simple", `fallback for ${String(bad)}`);
      assert(terminology("garbage").mode === "simple" && terminology(null).t("available_above") === "Available above that", "terminology never throws");
      const inv = await c.from("profiles").update({ financial_language_mode: "expert" }).eq("id", userA.id);
      expectDenied(inv, "invalid mode rejected by the CHECK constraint");
      const nul = await c.from("profiles").update({ financial_language_mode: null as unknown as string }).eq("id", userA.id);
      expectDenied(nul, "null rejected");
      assert((await getProfile(c))?.financial_language_mode === "simple", "value unchanged after rejected writes");
    });

    await runner.run("20 RLS: A reads and updates own mode; A cannot change B's; anonymous cannot read or update; B is untouched", async () => {
      await updateProfile(c, { financial_language_mode: "financial" });
      const bBefore = (await getProfile(userB.client))?.financial_language_mode;
      const forged = await c.from("profiles").update({ financial_language_mode: "balanced" }).eq("id", userB.id).select();
      assert(forged.error === null && (forged.data ?? []).length === 0, "cross-user update affects zero rows");
      assert((await getProfile(userB.client))?.financial_language_mode === bBefore, "B unchanged");
      const seen = await c.from("profiles").select("id, financial_language_mode").eq("id", userB.id);
      assert((seen.data ?? []).length === 0, "A cannot even read B's preference");
      expectDenied(await anonClient.from("profiles").update({ financial_language_mode: "financial" }).eq("id", userA.id).select(), "anonymous update");
      expectDenied(await anonClient.from("profiles").select("financial_language_mode"), "anonymous read");
      assert((await getProfile(c))?.financial_language_mode === "financial", "A's own value intact");
      await updateProfile(c, { financial_language_mode: "simple" });
    });

    // ---------------- VOCABULARY ----------------
    const T = (m: FinancialLanguageMode) => terminology(m);
    await runner.run("8/9/10 the same canonical data reads Simple / Balanced / Financial exactly as specified (Home and Rules vocabulary)", async () => {
      const expected: Record<FinancialLanguageMode, [TermKey, string][]> = {
        simple: [["cash", "Cash you have"], ["protecting", "Money Monitriq is protecting"], ["available_above", "Available above that"], ["available_above_alone", "Available above what's protected"], ["money_to_keep", "Money you want to keep"], ["set_aside_goals", "Money set aside for goals"], ["tied_up_assets", "Money tied up in assets"], ["cash_available", "Cash available"], ["debts", "Debts"], ["money_owed", "Money Owed to You"]],
        balanced: [["cash", "Cash position"], ["money_to_keep", "Minimum cash to keep"], ["available_above", "Available after protections"], ["set_aside_goals_payments", "Protected commitments"], ["tied_up_assets", "Less-liquid assets"], ["debts", "Debts"], ["money_owed", "Money Owed to You"]],
        financial: [["cash", "Liquid cash"], ["protecting", "Required Retained Cash"], ["available_above", "Safe to Deploy"], ["money_to_keep", "Minimum Cash Floor"], ["set_aside_goals_payments", "Protected Commitments"], ["tied_up_assets", "Illiquid assets"], ["debts", "Liabilities"], ["money_owed", "Receivables"]],
      };
      for (const m of LANGUAGE_MODES) for (const [k, v] of expected[m]) assert(T(m).t(k) === v, `${m}.${k}: expected "${v}", got "${T(m).t(k)}"`);
      assert(T("balanced").hint("debts") === "Also called liabilities." && T("balanced").hint("money_owed") === "Also called receivables." && T("balanced").hint("tied_up_assets") === "Money tied up in assets.", "balanced teaches the term");
      assert(T("simple").hint("debts") === null && T("financial").hint("money_owed") === null, "hints are balanced-only");
      const simpleAll = Object.keys(VOCABULARY).map((k) => T("simple").t(k as TermKey)).join(" | ");
      assert(!/Safe to Deploy|Minimum Cash Floor|Required Retained Cash|Illiquid|Receivables|Liabilities|Liquidity|Capital Allocation|Disposition/.test(simpleAll), "no jargon as a primary Simple label");
      assert(!/safe to spend|safely spend|profit/i.test(Object.keys(VOCABULARY).flatMap((k) => LANGUAGE_MODES.map((m) => T(m).t(k as TermKey))).join(" | ")), "plain language never overclaims (no 'safe to spend', no 'profit' for sale proceeds)");
      assert(T("simple").t("cash") !== "Net worth" && !/cash/i.test("Net worth"), "net worth is never called cash");
    });

    await runner.run("Explanation depth by mode: same meaning, different depth (Simple / Balanced / Financial)", async () => {
      const v = { available: "NGN 350,200", cash: "NGN 850,200", protecting: "NGN 500,000" };
      const s = availableExplanationCopy("simple", v);
      assert(s.heading === "Why is NGN 350,200 available?" && /You have NGN 850,200 in tracked cash\. Monitriq is keeping NGN 500,000 protected based on the limits and goals you set\./.test(s.body), s.body);
      assert(/Available after protections is the cash remaining after your minimum cash amount and protected goals and commitments are considered/.test(availableExplanationCopy("balanced", v).body), "balanced");
      assert(/Safe to Deploy is liquid cash remaining after Required Retained Cash, based on the greater of the Minimum Cash Floor and protected commitments\./.test(availableExplanationCopy("financial", v).body), "financial");
    });

    // ---------------- ONE ENGINE ----------------
    const currencies = new Map((await listCurrencies(c)).map((x) => [x.code, x]));
    const setup = async (code: string, cash: string, floor: string | null) => {
      const b = (await createBucket(c, { name: `${code} Bank`, currencyCode: code, bucketType: "bank_account" })).id;
      await recordOpeningBalance(c, { bucketId: b, amount: cash, occurredAt: AT });
      if (floor !== null) await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: code, thresholdValue: floor });
      return b;
    };
    const ngn = await setup("NGN", "580000", "500000");
    const usd = await setup("USD", "1200", null);
    const aud = await setup("AUD", "1000", "100");
    const bud = await createBudget(c, { currencyCode: "AUD", month: `${todayInTimezone("UTC").slice(0, 7)}-01` });
    await setBudgetCategoryAmount(c, bud.id, "food", "200");
    const goal = await createGoal(c, { goalTypeCode: "emergency_reserve", measurementType: "cash_target", name: "Reserve", currencyCode: "NGN", targetValue: "1000000", isProtected: true });
    await recordGoalAllocation(c, { goalId: goal.id, bucketId: ngn, amount: "100000" });
    await createLiability(c, { name: "Car loan", liabilityType: "loan", currencyCode: "NGN", openingPrincipal: "3500000" });
    await createReceivable(c, { name: "Invoice", currencyCode: "USD", faceAmount: "300" });
    const assetType = (await listAssetTypes(c))[0];
    await createAsset(c, { name: "Laptop", assetType: assetType.code as never, currencyCode: "NGN", initialBasisAmount: "400000", estimatedCurrentValue: "350000" });
    await recordMoneySpent(c, { bucketId: aud, amount: "10", categoryCode: "food", occurredAt: AT });

    const snapshot = async () =>
      JSON.stringify({
        balances: await getBucketBalances(c),
        safe: await getSafeToDeployByCurrency(c),
        position: await getFinancialPositionSummary(c),
        budget: await getBudgetSummary(c, bud.id),
        goals: await getGoalSummaries(c),
        debts: await getLiabilitySummaries(c),
        owed: await getReceivableSummaries(c),
        assets: await getAssetSummaries(c),
      }, (k, v) => (k === "asOf" || k === "generatedAt" ? undefined : v));

    await runner.run("18/19 no financial value changes with the preference: balances, Safe-to-Deploy rows, net worth, Budget, goals, debts, money owed, assets and every currency are identical in simple / balanced / financial", async () => {
      const shots: string[] = [];
      for (const mode of ["simple", "balanced", "financial", "simple"] as const) {
        await updateProfile(c, { financial_language_mode: mode });
        shots.push(await snapshot());
      }
      assert(shots.every((s) => s === shots[0]), "canonical reads differ between modes");
      const safe = await getSafeToDeployByCurrency(c);
      assert(safe.some((r) => r.currencyCode === "NGN") && safe.some((r) => r.currencyCode === "USD"), "multi-currency rows present and unchanged");
    });

    await runner.run("Warning states and colours are identical in every mode (only the wording changes)", async () => {
      const row = (req: string, safe: string, def: string) => ({ status: "calculated", liquidCash: "0", requiredRetainedCash: req, safeToDeploy: safe, retainedDeficit: def });
      const cases = [row("500000", "350200", "0"), row("500000", "80000", "0"), row("500000", "0", "0"), row("500000", "0", "40000"), { status: "not_configured", liquidCash: "0", requiredRetainedCash: null, safeToDeploy: null, retainedDeficit: null }];
      for (const input of cases) {
        const st = cashStatus(input);
        const words = LANGUAGE_MODES.map((m) => cashStatusSentence(st, (x) => `NGN ${x}`, "default", m));
        assert(new Set(words).size === 3, `three distinct wordings for ${st.state}`);
        assert(cashStatus.length >= 1 && st.tone === cashStatus(input).tone, "state/tone independent of mode");
      }
      assert(!/mode/.test(src("lib/domain/rules/cash-status.ts").split("export function cashStatus(")[1].split("export type CashStatusTextVariant")[0]), "cashStatus() has no mode input at all");
    });

    await runner.run("12/13 Spending Check: the evaluation and the recommendation are IDENTICAL in every mode; only the explanation wording changes", async () => {
      const scenarios: [string, string, string | null][] = [[ngn, "40000", null], [ngn, "100000", null], [ngn, "1500000", null], [usd, "100", null], [aud, "50", "food"]];
      const seen = new Set<string>();
      for (const [bucket, amount, category] of scenarios) {
        const result = await runSpendingCheck(c, { bucketId: bucket, amount, categoryCode: category, categoryLabel: category ? "Food" : null });
        const views = LANGUAGE_MODES.map((m) => presentSpendingCheck(result, "Phone", currencies, m));
        assert(new Set(views.map((v) => `${v.suggestionState}|${v.suggestionLabel}`)).size === 1, "same suggestion in all modes");
        seen.add(views[0].suggestionLabel);
        assert(new Set(views.map((v) => views[0].rows.map((r) => r.lines.map((l) => l.value).join(",")).join(";") === v.rows.map((r) => r.lines.map((l) => l.value).join(",")).join(";"))).size === 1, "every row value identical in every mode");
        assert(new Set(views.map((v) => v.rows.map((r) => r.cashStatus?.result.state ?? "-").join(","))).size === 1 && new Set(views.map((v) => v.rows.map((r) => r.cashStatus?.result.tone ?? "-").join(","))).size === 1, "warning state and colour identical");
        assert(new Set(views.map((v) => money(v.reasons.join(" ")))).size === 1, "the amounts quoted in the reasons are identical");
      }
      assert(["Proceed within your plan", "Wait", "Reduce the amount", "Review first"].every((l) => seen.has(l)), `all four suggestions exercised: ${[...seen].join(", ")}`);
    });

    await runner.run("12 Spending Check vocabulary by mode: 'below the amount you chose to keep' (Simple) / protected amount (Balanced) / retained-cash deficit (Financial)", async () => {
      const result = await runSpendingCheck(c, { bucketId: ngn, amount: "100000", description: "Laptop" });
      const [simple, balanced, financial] = LANGUAGE_MODES.map((m) => presentSpendingCheck(result, "Laptop", currencies, m));
      const row = (v: typeof simple) => v.rows.find((r) => r.key === "protected")!;
      assert(row(simple).cashStatus!.sentence === "This purchase would leave you NGN 20,000 below the amount you chose to keep." && /Money Monitriq is protecting/.test(JSON.stringify(row(simple).lines)) && row(simple).title === "Money you want to keep", row(simple).cashStatus!.sentence);
      assert(row(balanced).cashStatus!.sentence === "This purchase would leave you NGN 20,000 below your protected amount." && row(balanced).title === "Minimum cash to keep" && /Available after protections/.test(JSON.stringify(row(balanced).lines)), row(balanced).cashStatus!.sentence);
      assert(row(financial).cashStatus!.sentence === "This purchase creates a NGN 20,000 retained-cash deficit below Required Retained Cash." && row(financial).title === "Minimum Cash Floor" && /Safe to Deploy \(after\)/.test(JSON.stringify(row(financial).lines)) && /Required Retained Cash \(after\)/.test(JSON.stringify(row(financial).lines)), row(financial).cashStatus!.sentence);
      assert(simple.suggestionLabel === "Wait" && balanced.suggestionLabel === "Wait" && financial.suggestionLabel === "Wait", "identical recommendation");
      assert(/Minimum Cash Floor of NGN 500,000/.test(financial.reasons.join(" ")) && /minimum cash to keep is NGN 500,000/.test(balanced.reasons.join(" ")) && /You chose to keep at least NGN 500,000/.test(simple.reasons.join(" ")), "reason wording per mode");
    });

    await runner.run("14/15/16/17 Assets, Debts, Money Owed and Financial Overview follow the vocabulary (labels, empty states, drawer); routes and domain names unchanged", async () => {
      assert(assetBasisLabel("simple", "What did you pay?") === "What did you pay?" && assetBasisLabel("balanced", "Amount invested") === "Amount invested" && assetBasisLabel("balanced", "What did you pay?") === "Amount paid" && assetBasisLabel("financial", "What did you pay?") === "Cost basis", "basis");
      assert(assetCurrentValueLabel("simple", "Current value") === "Current value" && assetCurrentValueLabel("financial", "Current value") === "Current valuation", "current value");
      assert(T("simple").t("sale_result") === "Gain or loss compared with what you paid" && T("financial").t("sale_result") === "Realised gain / loss" && T("simple").t("money_after_costs") === "Money received after costs" && T("simple").t("unrealised") === "Change in value so far", "sale wording, never 'profit' in Simple");
      assert(debtsEmpty("simple").title === "No debts tracked yet." && debtsEmpty("financial").title === "No liabilities tracked yet." && debtsEmpty("financial").action === "Add Liability" && debtsEmpty("balanced").action === "Add Debt", "debts");
      assert(moneyOwedEmpty("simple").action === "Add Money Owed" && moneyOwedEmpty("financial").action === "Add Receivable" && /receivables/.test(moneyOwedEmpty("financial").title), "money owed");
      const nav = src("components/layout/nav-items.ts");
      assert(/href: "\/liabilities", label: "Debts", term: "debts"/.test(nav) && /href: "\/receivables", label: "Money Owed to You", term: "money_owed"/.test(nav) && /terms\.t\(item\.term\)/.test(src("components/layout/NavDrawer.tsx")), "drawer labels follow the mode, routes unchanged");
      const ov = src("components/financial-position/NativePositionList.tsx");
      for (const k of ["non_cash_assets", "money_owed_to_you_total", "debts_you_owe", "protections_heading", "convertible_to_cash", "set_aside_goals", "protecting", "available_above"]) assert(ov.includes(`terms.t("${k}")`), `overview uses ${k}`);
      assert(/terms\.t\("debts"\)/.test(src("components/liabilities/DebtsWorkspace.tsx")) && /terms\.t\("money_owed"\)/.test(src("components/receivables/MoneyOwedWorkspace.tsx")), "page titles");
      assert(/useTerms/.test(src("components/assets/AssetCard.tsx")) && /terms\.t\("potential_liquidity"\)/.test(src("components/assets/PotentialLiquiditySection.tsx")) && /terms\.t\("non_cash_assets"\)/.test(src("components/assets/TrackedAssetsSummaryCard.tsx")) && /terms\.t\("money_owed"\)/.test(src("components/assets/ReceivablesSection.tsx")), "assets surfaces");
      const home = src("components/home/PositionSection.tsx") + src("components/home/CapitalDistributionSection.tsx");
      assert(/terms\.t\("available_above_alone"\)/.test(home) && /terms\.t\("cash"\)/.test(home) && /terms\.t\("tied_up_badge"\)/.test(home) && /terms\.t\("tied_up_summary"\)/.test(home) && /terms\.t\("cash_available"\)/.test(home), "Home consumes the vocabulary");
      assert(/terms\.t\("your_cash_heading"\)/.test(src("app/(app)/rules/page.tsx")) && /terms\.t\("money_to_keep"\)/.test(src("app/(app)/rules/page.tsx")) && /terms\.t\("protecting"\)/.test(src("components/rules/SafeToDeployCard.tsx")), "Rules consumes the vocabulary");
    });

    await runner.run("Architecture: one typed vocabulary, no mode branching in components, no per-mode page trees, one server resolution, safe fallback", async () => {
      const comps = [...walk("components"), ...walk("app")];
      for (const f of comps) assert(!/(?:mode|Mode)\s*(?:===|!==)\s*["'](?:simple|balanced|financial)["']/.test(src(f)), `${f}: mode branching in a component`);
      assert(!comps.some((f) => /SimpleHome|BalancedHome|FinancialHome|SimpleMode|FinancialMode/.test(f + src(f))), "no three-app trees");
      assert(/cache\(async/.test(src("lib/supabase/get-language-mode.ts")) && /getCurrentProfile/.test(src("lib/supabase/get-language-mode.ts")) && !/from\("profiles"\)/.test(src("lib/supabase/get-language-mode.ts")), "resolved once per request from the already-cached profile");
      assert(/<LanguageProvider mode=\{profile\?\.financial_language_mode\}>/.test(src("components/layout/AppShell.tsx")), "provider fed from the shell's existing profile read");
      assert(/createContext<FinancialLanguageMode>\("simple"\)/.test(src("components/language/LanguageProvider.tsx")), "no provider => simple, never a crash");
      assert(Object.keys(VOCABULARY).length >= 30 && Object.values(VOCABULARY).every((v) => LANGUAGE_MODES.every((m) => v[m].label.length > 0)), "every semantic key has all three modes");
    });

    await runner.run("21 no hardcoded user mode or personal data; permissions and feature access do not depend on the mode", async () => {
      for (const f of [...walk("components"), ...walk("app"), ...walk("lib/domain/language")]) {
        const t = src(f);
        assert(!/financial_language_mode:\s*["'](?:balanced|financial)["']/.test(t), `${f}: hardcoded mode`);
        assert(!/Victor|\bVee\b|BMW|Lakowe|Autodrip/.test(t), `${f}: personal data`);
      }
      assert(!/financial_language_mode/.test(src("proxy.ts") + src("app/(app)/layout.tsx")), "route protection and onboarding gating ignore the preference");
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
main().catch((e) => { console.error("Language suite crashed:", e); process.exitCode = 1; });
